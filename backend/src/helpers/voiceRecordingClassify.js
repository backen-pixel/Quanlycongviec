/**
 * Phân loại ghi âm theo liên kết CRM (rule-based).
 * Phase 1: chỉ enqueue STT khi gắn crm_leads.type = 'lead'.
 */

const PROSPECT_CLASSES = new Set(['prospect_lead', 'deal', 'unlinked', 'unknown']);
const STT_STATUSES = new Set(['idle', 'pending', 'processing', 'done', 'failed', 'skipped']);

function hasTranscriptText(transcript) {
  return transcript != null && String(transcript).trim() !== '';
}

/**
 * Tính patch classify + stt_status từ lead_id / type / transcript hiện có.
 * @param {{ lead_id?: string|null, lead_type?: string|null, transcript?: string|null, stt_status?: string|null }} row
 * @param {{ forceEnqueue?: boolean }} [opts] forceEnqueue: đẩy lại pending dù đang failed
 */
function computeVoiceProspectClassify(row, opts = {}) {
  const now = new Date().toISOString();
  const leadId = row?.lead_id || null;
  const leadType = row?.lead_type != null ? String(row.lead_type).toLowerCase().trim() : null;
  const done = hasTranscriptText(row?.transcript);
  const currentStatus = row?.stt_status != null ? String(row.stt_status) : 'idle';

  let prospect_class = 'unknown';
  if (!leadId) prospect_class = 'unlinked';
  else if (leadType === 'lead') prospect_class = 'prospect_lead';
  else if (leadType === 'deal') prospect_class = 'deal';

  let stt_status;
  if (done) {
    stt_status = 'done';
  } else if (prospect_class === 'prospect_lead') {
    if (currentStatus === 'processing' && !opts.forceEnqueue) {
      stt_status = 'processing';
    } else if (currentStatus === 'failed' && !opts.forceEnqueue) {
      stt_status = 'failed';
    } else if (currentStatus === 'pending' && !opts.forceEnqueue) {
      stt_status = 'pending';
    } else {
      // idle / skipped / forceEnqueue → xếp hàng STT
      stt_status = 'pending';
    }
  } else {
    stt_status = 'skipped';
  }

  return {
    prospect_class,
    prospect_classified_at: now,
    stt_status,
  };
}

/**
 * Load lead type + classify + persist.
 * @returns {Promise<object|null>} row sau update (selectFields) hoặc null
 */
async function classifyVoiceRecordingById(supabase, recordId, opts = {}) {
  if (!supabase || !recordId) return null;
  const selectOut = opts.select || 'id, lead_id, prospect_class, stt_status, transcript';

  const { data: row, error } = await supabase
    .from('voice_recordings')
    .select('id, lead_id, transcript, stt_status, lead:crm_leads(id, type)')
    .eq('id', recordId)
    .maybeSingle();
  if (error || !row) return null;

  const leadType = row.lead?.type ?? null;
  const patch = computeVoiceProspectClassify(
    {
      lead_id: row.lead_id,
      lead_type: leadType,
      transcript: row.transcript,
      stt_status: row.stt_status,
    },
    { forceEnqueue: !!opts.forceEnqueue },
  );

  const { data: updated, error: ue } = await supabase
    .from('voice_recordings')
    .update(patch)
    .eq('id', recordId)
    .select(selectOut)
    .maybeSingle();
  if (ue) throw ue;
  return updated;
}

/**
 * Batch classify các bản ghi thiếu prospect_class hoặc force reclassify.
 * @returns {Promise<{ scanned: number, classified: number, pending: number, skipped: number }>}
 */
async function classifyVoiceRecordingsBatch(supabase, opts = {}) {
  const limit = Math.min(Math.max(parseInt(String(opts.limit || 100), 10) || 100, 1), 300);
  const force = !!opts.force;
  const userIds = Array.isArray(opts.userIds) ? opts.userIds.filter(Boolean) : null;

  let q = supabase
    .from('voice_recordings')
    .select('id, lead_id, transcript, stt_status, prospect_class, lead:crm_leads(id, type)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userIds?.length) q = q.in('user_id', userIds);
  if (!force) {
    q = q.or('prospect_class.is.null,stt_status.eq.idle');
  }

  const { data: rows, error } = await q;
  if (error) throw error;

  let classified = 0;
  let pending = 0;
  let skipped = 0;

  for (const row of rows || []) {
    const patch = computeVoiceProspectClassify(
      {
        lead_id: row.lead_id,
        lead_type: row.lead?.type ?? null,
        transcript: row.transcript,
        stt_status: row.stt_status,
      },
      { forceEnqueue: force },
    );
    const { error: ue } = await supabase.from('voice_recordings').update(patch).eq('id', row.id);
    if (ue) continue;
    classified += 1;
    if (patch.stt_status === 'pending') pending += 1;
    if (patch.stt_status === 'skipped') skipped += 1;
  }

  return {
    scanned: (rows || []).length,
    classified,
    pending,
    skipped,
  };
}

/**
 * Xếp hàng STT thủ công (retry) — chỉ prospect_lead.
 */
async function enqueueVoiceRecordingStt(supabase, recordId, opts = {}) {
  const { data: row, error } = await supabase
    .from('voice_recordings')
    .select('id, lead_id, transcript, stt_status, prospect_class, lead:crm_leads(id, type)')
    .eq('id', recordId)
    .maybeSingle();
  if (error || !row) {
    const err = new Error('Không tìm thấy bản ghi');
    err.status = 404;
    throw err;
  }

  const leadType = row.lead?.type ?? null;
  const prospect =
    row.prospect_class ||
    computeVoiceProspectClassify({
      lead_id: row.lead_id,
      lead_type: leadType,
      transcript: row.transcript,
      stt_status: row.stt_status,
    }).prospect_class;

  if (prospect !== 'prospect_lead' || leadType !== 'lead') {
    const err = new Error('Chỉ chuyển văn bản cho ghi âm gắn Lead tiềm năng (type=lead)');
    err.status = 400;
    throw err;
  }

  if (hasTranscriptText(row.transcript) && !opts.force) {
    const err = new Error('Bản ghi đã có transcript');
    err.status = 400;
    throw err;
  }

  const patch = {
    prospect_class: 'prospect_lead',
    prospect_classified_at: new Date().toISOString(),
    stt_status: 'pending',
    stt_error: null,
  };
  if (opts.resetAttempts !== false) patch.stt_attempts = 0;

  const selectOut =
    opts.select ||
    'id, lead_id, prospect_class, stt_status, stt_error, stt_attempts, transcript, transcribed_at';
  const { data: updated, error: ue } = await supabase
    .from('voice_recordings')
    .update(patch)
    .eq('id', recordId)
    .select(selectOut)
    .maybeSingle();
  if (ue) throw ue;
  return updated;
}

module.exports = {
  PROSPECT_CLASSES,
  STT_STATUSES,
  hasTranscriptText,
  computeVoiceProspectClassify,
  classifyVoiceRecordingById,
  classifyVoiceRecordingsBatch,
  enqueueVoiceRecordingStt,
};

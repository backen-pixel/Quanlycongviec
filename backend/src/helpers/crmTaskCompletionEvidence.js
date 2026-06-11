const {
  normalizeEvidenceFileTypes,
  evaluateRequiredEvidenceTypes,
  formatMissingEvidenceTypesLabel,
  taskRequiresTypedEvidence,
} = require('./evidenceFileTypes');
const {
  taskRequiresQuickVerdict,
  quickVerdictMeetsRequirement,
} = require('./taskQuickVerdict');

async function loadCrmTaskAttachmentsForEvidence(supabase, taskId) {
  const { data: rows, error } = await supabase
    .from('crm_task_attachments')
    .select('id, file_url, file_name, mime_type, notes, doc_type')
    .eq('task_id', taskId)
    .limit(200);
  if (error) throw error;
  return rows || [];
}

/**
 * Minh chứng khi hoàn thành NV CRM: ghi chú trên task hoặc đính kèm có nội dung (file URL hoặc text).
 * Dùng chung cho API cập nhật task và KPI A3.
 */
async function crmTaskHasCompletionEvidence(supabase, taskId, taskNotes) {
  if (taskNotes != null && String(taskNotes).trim() !== '') return true;
  const rows = await loadCrmTaskAttachmentsForEvidence(supabase, taskId);
  for (const r of rows) {
    if (r.file_url && String(r.file_url).trim() !== '') return true;
    if (r.notes != null && String(r.notes).trim() !== '') return true;
  }
  return false;
}

/**
 * Kiểm tra đủ loại file/ghi chú theo required_evidence_file_types.
 * @returns {Promise<{ ok: boolean, missing: string[], missingLabel: string }>}
 */
async function crmTaskMeetsRequiredFileTypes(supabase, taskId, prior) {
  const required = normalizeEvidenceFileTypes(prior?.required_evidence_file_types);
  if (!required.length) {
    if (!prior?.completion_requires_file_or_note) {
      return { ok: true, missing: [], missingLabel: '' };
    }
    const ok = await crmTaskHasCompletionEvidence(supabase, taskId, prior?.notes);
    return {
      ok,
      missing: ok ? [] : ['note'],
      missingLabel: ok ? '' : 'ghi chú hoặc file đính kèm',
    };
  }
  const attachments = await loadCrmTaskAttachmentsForEvidence(supabase, taskId);
  const eval0 = evaluateRequiredEvidenceTypes(required, {
    taskNotes: prior?.notes,
    attachments,
  });
  return {
    ok: eval0.ok,
    missing: eval0.missing,
    missingLabel: formatMissingEvidenceTypesLabel(eval0.missing),
  };
}

/**
 * Với danh sách task_id (thường là task đã completed nhưng chưa có notes), trả về Set các task_id
 * có ít nhất một dòng attachment có file_url hoặc notes khác rỗng.
 */
async function loadCrmTaskIdsWithAttachmentEvidence(supabase, taskIds) {
  const ok = new Set();
  if (!taskIds?.length) return ok;
  const CHUNK = 120;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk = taskIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('crm_task_attachments')
      .select('task_id, file_url, notes')
      .in('task_id', chunk);
    if (error) throw error;
    for (const r of data || []) {
      if ((r.file_url && String(r.file_url).trim() !== '') || (r.notes != null && String(r.notes).trim() !== '')) {
        ok.add(r.task_id);
      }
    }
  }
  return ok;
}

/** Có bất kỳ quy tắc bắt buộc minh chứng khi hoàn thành (cờ cũ hoặc mới). */
function crmTaskRequiresCompletionEvidence(prior) {
  if (!prior) return false;
  return !!(
    taskRequiresTypedEvidence(prior) ||
    taskRequiresQuickVerdict(prior) ||
    prior.completion_requires_customer_note ||
    prior.completion_requires_customer_contact
  );
}

/**
 * Kiểm tra task (trước khi chuyển completed) đã đủ điều kiện theo cấu hình mẫu:
 * - Chỉ «ghi chú KH»: bắt buộc notes khác rỗng.
 * - «Minh chứng liên hệ» hoặc cờ legacy: ghi chú task hoặc đính kèm có nội dung.
 * - Gộp note + contact (hoặc note + legacy): vừa có notes vừa đủ minh chứng liên hệ (file/ghi chú đính kèm hoặc ghi chú task đủ cho contact).
 */
async function crmTaskMeetsCompletionRequirements(supabase, taskId, prior) {
  if (!prior || !crmTaskRequiresCompletionEvidence(prior)) return true;

  if (taskRequiresQuickVerdict(prior) && !quickVerdictMeetsRequirement(prior)) {
    return false;
  }

  const reqLegacy = taskRequiresTypedEvidence(prior);
  const reqNote = !!prior.completion_requires_customer_note;
  const reqContact = !!prior.completion_requires_customer_contact;

  const hasNote = prior.notes != null && String(prior.notes).trim() !== '';
  const typedCheck = await crmTaskMeetsRequiredFileTypes(supabase, taskId, prior);
  const hasEvidence = typedCheck.ok;

  if (reqNote && !reqContact && !reqLegacy) {
    return hasNote;
  }
  if ((reqContact || reqLegacy) && !reqNote) {
    return hasEvidence;
  }
  if (reqNote && (reqContact || reqLegacy)) {
    return hasNote && hasEvidence;
  }
  return hasEvidence;
}

/** Nhiệm vụ pipeline sản xuất (stage sx_* hoặc gắn cột SX). */
function isSxProductionTask(prior) {
  if (!prior) return false;
  return String(prior.stage_slug || '').startsWith('sx_') || !!prior.production_pipeline_stage_id;
}

/** App Công việc (sx-mobile): theo dõi nhanh — bỏ qua minh chứng khi hoàn thành NV SX. */
function skipSxWorkQuickComplete(body, prior) {
  return !!(body?.skip_completion_evidence && isSxProductionTask(prior));
}

module.exports = {
  crmTaskHasCompletionEvidence,
  crmTaskMeetsRequiredFileTypes,
  loadCrmTaskIdsWithAttachmentEvidence,
  crmTaskRequiresCompletionEvidence,
  crmTaskMeetsCompletionRequirements,
  isSxProductionTask,
  skipSxWorkQuickComplete,
};

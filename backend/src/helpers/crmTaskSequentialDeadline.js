/**
 * Deadline tuần tự CRM: NV sau chỉ bắt đầu đếm hạn khi NV trước (cùng stage) hoàn thành.
 * - deadline_days: offset cấu hình trên task (kế thừa từ mẫu)
 * - deadline: mốc tuyệt đối đang chạy (null = chưa tới lượt)
 */

function normalizeDeadlineDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function computeDeadlineIsoFromDays(days, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

function stageKeyOf(row) {
  if (row?.pipeline_stage_id) return `ps:${row.pipeline_stage_id}`;
  if (row?.stage_slug) return `slug:${String(row.stage_slug).trim().toLowerCase()}`;
  return '_';
}

/**
 * Gán deadline tuần tự trong batch insert (cùng lead / theo stage).
 * Chỉ NV đầu tiên (order_index thấp nhất) có deadline_days > 0 được gán deadline tuyệt đối,
 * trừ khi stage đã có NV mở đang chạy hạn (opts.stageHasActiveDeadline).
 */
function applySequentialDeadlinesToInserts(inserts, opts = {}) {
  const list = Array.isArray(inserts) ? inserts : [];
  if (!list.length) return list;
  const stageHasActive = opts.stageHasActiveDeadline || {};
  const byStage = new Map();
  for (const row of list) {
    const key = stageKeyOf(row);
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key).push(row);
  }
  for (const [key, rows] of byStage) {
    rows.sort((a, b) => {
      const oa = Number(a.order_index) || 0;
      const ob = Number(b.order_index) || 0;
      if (oa !== ob) return oa - ob;
      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    });
    let started = !!stageHasActive[key];
    for (const row of rows) {
      const days = normalizeDeadlineDays(row.deadline_days);
      row.deadline_days = days;
      if (days > 0 && !started) {
        row.deadline = computeDeadlineIsoFromDays(days);
        started = true;
      } else {
        row.deadline = null;
      }
    }
  }
  return list;
}

/**
 * Map stageKey → true nếu lead đã có NV mở (pending/in_progress) kèm deadline.
 */
async function loadStageHasActiveDeadline(supabase, leadId, stageHints = []) {
  const out = {};
  if (!leadId) return out;
  const { data, error } = await supabase
    .from('crm_tasks')
    .select('id, pipeline_stage_id, stage_slug, deadline, status')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'in_progress']);
  if (error) {
    console.warn('[crm-seq-deadline] load open tasks:', error.message);
    return out;
  }
  for (const t of data || []) {
    if (t.deadline == null || t.deadline === '') continue;
    out[stageKeyOf(t)] = true;
  }
  for (const hint of stageHints || []) {
    const k = stageKeyOf(hint);
    if (!(k in out)) out[k] = false;
  }
  return out;
}

/**
 * Sau khi hoàn thành 1 NV: bắt đầu đếm hạn cho NV mở tiếp theo (cùng stage, order_index cao hơn).
 */
async function startNextCrmTaskDeadlineAfterComplete(supabase, completedTask) {
  if (!supabase || !completedTask?.lead_id) {
    return { started: false, reason: 'missing_task' };
  }
  const leadId = completedTask.lead_id;
  const orderIndex = Number(completedTask.order_index) || 0;
  const completedId = String(completedTask.id || '');

  let q = supabase
    .from('crm_tasks')
    .select('id, title, order_index, deadline, deadline_days, status, pipeline_stage_id, stage_slug')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'in_progress']);

  if (completedTask.pipeline_stage_id) {
    q = q.eq('pipeline_stage_id', completedTask.pipeline_stage_id);
  } else if (completedTask.stage_slug) {
    q = q.is('pipeline_stage_id', null).eq('stage_slug', completedTask.stage_slug);
  }

  const { data: siblings, error } = await q
    .order('order_index', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.warn('[crm-seq-deadline] load siblings:', error.message);
    return { started: false, reason: error.message };
  }

  const next = (siblings || []).find((t) => {
    if (completedId && String(t.id) === completedId) return false;
    const oi = Number(t.order_index) || 0;
    if (oi > orderIndex) return true;
    if (oi === orderIndex && String(t.id) > completedId) return true;
    return false;
  });
  if (!next) return { started: false, reason: 'no_next_task' };

  const days = normalizeDeadlineDays(next.deadline_days);
  if (days <= 0) return { started: false, reason: 'next_has_no_deadline_days', taskId: next.id };
  if (next.deadline != null && next.deadline !== '') {
    return { started: false, reason: 'already_has_deadline', taskId: next.id };
  }

  const deadline = computeDeadlineIsoFromDays(days);
  const { data: updated, error: upErr } = await supabase
    .from('crm_tasks')
    .update({ deadline, updated_at: new Date().toISOString() })
    .eq('id', next.id)
    .select('id, title, deadline, deadline_days')
    .maybeSingle();
  if (upErr) {
    // Cột deadline_days chưa migrate — bỏ qua im lặng
    if (/deadline_days/i.test(upErr.message || '')) {
      return { started: false, reason: 'deadline_days_column_missing' };
    }
    console.warn('[crm-seq-deadline] start next:', upErr.message);
    return { started: false, reason: upErr.message };
  }
  return {
    started: true,
    taskId: updated?.id || next.id,
    title: updated?.title || next.title,
    deadline,
    days,
  };
}

module.exports = {
  normalizeDeadlineDays,
  computeDeadlineIsoFromDays,
  stageKeyOf,
  applySequentialDeadlinesToInserts,
  loadStageHasActiveDeadline,
  startNextCrmTaskDeadlineAfterComplete,
};

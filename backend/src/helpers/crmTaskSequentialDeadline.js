/**
 * Deadline tuần tự CRM: NV sau chỉ bắt đầu đếm hạn khi NV trước (cùng stage) hoàn thành.
 * Offset: deadline_days + deadline_hours + deadline_minutes → deadline tuyệt đối.
 */

function normalizeNonNegInt(raw, { max = null } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const v = Math.floor(n);
  if (max != null && v > max) return max;
  return v;
}

function normalizeDeadlineDays(raw) {
  return normalizeNonNegInt(raw);
}

function normalizeDeadlineHours(raw) {
  return normalizeNonNegInt(raw);
}

function normalizeDeadlineMinutes(raw) {
  return normalizeNonNegInt(raw, { max: 59 * 24 }); // cho phép >59 nếu nhập tổng phút
}

function normalizeDeadlineOffset(row = {}) {
  return {
    deadline_days: normalizeDeadlineDays(row.deadline_days),
    deadline_hours: normalizeDeadlineHours(row.deadline_hours),
    deadline_minutes: normalizeDeadlineMinutes(row.deadline_minutes),
  };
}

function deadlineOffsetTotalMs(row = {}) {
  const { deadline_days: d, deadline_hours: h, deadline_minutes: m } = normalizeDeadlineOffset(row);
  return ((d * 24 + h) * 60 + m) * 60 * 1000;
}

function hasDeadlineOffset(row = {}) {
  return deadlineOffsetTotalMs(row) > 0;
}

function computeDeadlineIsoFromOffset(row = {}, fromDate = new Date()) {
  const ms = deadlineOffsetTotalMs(row);
  if (ms <= 0) return null;
  return new Date(fromDate.getTime() + ms).toISOString();
}

/** @deprecated Dùng computeDeadlineIsoFromOffset */
function computeDeadlineIsoFromDays(days, fromDate = new Date()) {
  return computeDeadlineIsoFromOffset({ deadline_days: days }, fromDate);
}

function stageKeyOf(row) {
  if (row?.pipeline_stage_id) return `ps:${row.pipeline_stage_id}`;
  if (row?.stage_slug) return `slug:${String(row.stage_slug).trim().toLowerCase()}`;
  return '_';
}

/**
 * Gán deadline tuần tự trong batch insert (cùng lead / theo stage).
 * Chỉ NV đầu tiên (order_index thấp nhất) có offset > 0 được gán deadline tuyệt đối,
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
      const offset = normalizeDeadlineOffset(row);
      row.deadline_days = offset.deadline_days;
      row.deadline_hours = offset.deadline_hours;
      row.deadline_minutes = offset.deadline_minutes;
      if (hasDeadlineOffset(offset) && !started) {
        row.deadline = computeDeadlineIsoFromOffset(offset);
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
    .select('id, title, order_index, deadline, deadline_days, deadline_hours, deadline_minutes, status, pipeline_stage_id, stage_slug')
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
    // DB chưa có cột hours/minutes → fallback select cũ
    if (/deadline_hours|deadline_minutes/i.test(error.message || '')) {
      return startNextCrmTaskDeadlineAfterCompleteLegacy(supabase, completedTask);
    }
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

  if (!hasDeadlineOffset(next)) {
    return { started: false, reason: 'next_has_no_deadline_offset', taskId: next.id };
  }
  if (next.deadline != null && next.deadline !== '') {
    return { started: false, reason: 'already_has_deadline', taskId: next.id };
  }

  const offset = normalizeDeadlineOffset(next);
  const deadline = computeDeadlineIsoFromOffset(offset);
  const { data: updated, error: upErr } = await supabase
    .from('crm_tasks')
    .update({ deadline, updated_at: new Date().toISOString() })
    .eq('id', next.id)
    .select('id, title, deadline, deadline_days, deadline_hours, deadline_minutes')
    .maybeSingle();
  if (upErr) {
    if (/deadline_days|deadline_hours|deadline_minutes/i.test(upErr.message || '')) {
      return { started: false, reason: 'deadline_offset_column_missing' };
    }
    console.warn('[crm-seq-deadline] start next:', upErr.message);
    return { started: false, reason: upErr.message };
  }
  return {
    started: true,
    taskId: updated?.id || next.id,
    title: updated?.title || next.title,
    deadline,
    ...offset,
  };
}

async function startNextCrmTaskDeadlineAfterCompleteLegacy(supabase, completedTask) {
  const leadId = completedTask.lead_id;
  const orderIndex = Number(completedTask.order_index) || 0;
  const completedId = String(completedTask.id || '');
  let q = supabase
    .from('crm_tasks')
    .select('id, title, order_index, deadline, deadline_days, status, pipeline_stage_id, stage_slug')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'in_progress']);
  if (completedTask.pipeline_stage_id) q = q.eq('pipeline_stage_id', completedTask.pipeline_stage_id);
  else if (completedTask.stage_slug) q = q.is('pipeline_stage_id', null).eq('stage_slug', completedTask.stage_slug);
  const { data: siblings, error } = await q.order('order_index', { ascending: true }).order('id', { ascending: true });
  if (error) return { started: false, reason: error.message };
  const next = (siblings || []).find((t) => {
    if (completedId && String(t.id) === completedId) return false;
    const oi = Number(t.order_index) || 0;
    return oi > orderIndex || (oi === orderIndex && String(t.id) > completedId);
  });
  if (!next) return { started: false, reason: 'no_next_task' };
  const days = normalizeDeadlineDays(next.deadline_days);
  if (days <= 0) return { started: false, reason: 'next_has_no_deadline_days', taskId: next.id };
  if (next.deadline) return { started: false, reason: 'already_has_deadline', taskId: next.id };
  const deadline = computeDeadlineIsoFromDays(days);
  const { error: upErr } = await supabase
    .from('crm_tasks')
    .update({ deadline, updated_at: new Date().toISOString() })
    .eq('id', next.id);
  if (upErr) return { started: false, reason: upErr.message };
  return { started: true, taskId: next.id, title: next.title, deadline, deadline_days: days, deadline_hours: 0, deadline_minutes: 0 };
}

/** Strip offset columns khi DB chưa migrate (retry insert). */
function stripDeadlineOffsetColumns(row) {
  if (!row || typeof row !== 'object') return row;
  const { deadline_days: _d, deadline_hours: _h, deadline_minutes: _m, ...rest } = row;
  return rest;
}

function isDeadlineOffsetColumnError(err) {
  return /deadline_days|deadline_hours|deadline_minutes/i.test(String(err?.message || ''));
}

module.exports = {
  normalizeDeadlineDays,
  normalizeDeadlineHours,
  normalizeDeadlineMinutes,
  normalizeDeadlineOffset,
  hasDeadlineOffset,
  deadlineOffsetTotalMs,
  computeDeadlineIsoFromOffset,
  computeDeadlineIsoFromDays,
  stageKeyOf,
  applySequentialDeadlinesToInserts,
  loadStageHasActiveDeadline,
  startNextCrmTaskDeadlineAfterComplete,
  stripDeadlineOffsetColumns,
  isDeadlineOffsetColumnError,
};

const { supabase } = require('../config/supabase');

function fmtDeadlineVi(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return String(iso);
  }
}

/** Mô tả hiển thị trên timeline lịch sử nhiệm vụ. */
function buildKanbanDeadlineDescription({ oldDeadlineAt, newDeadlineAt, reason, source }) {
  if (!newDeadlineAt) {
    return reason ? `Đã xoá deadline thẻ.\nLý do: ${reason}` : 'Đã xoá deadline thẻ.';
  }
  if (!oldDeadlineAt) {
    let d = `Đặt deadline: ${fmtDeadlineVi(newDeadlineAt)}`;
    if (reason) d += `\nLý do: ${reason}`;
    if (source === 'stage_move') d += ' (khi chuyển cột)';
    return d;
  }
  let d = `Cập nhật deadline: ${fmtDeadlineVi(oldDeadlineAt)} → ${fmtDeadlineVi(newDeadlineAt)}`;
  if (reason) d += `\nLý do: ${reason}`;
  return d;
}

/**
 * Ghi vào unified_task_history để hiện trong UnifiedTaskHistoryWidget.
 * source enum chỉ có task/crm_task/crm_assignment — dùng crm_task + lead_id.
 */
async function logKanbanDeadlineUnifiedHistory({
  leadId,
  companyId,
  actorUserId,
  oldDeadlineAt,
  newDeadlineAt,
  reason,
  source,
}) {
  if (!leadId || !actorUserId) return;
  const description = buildKanbanDeadlineDescription({
    oldDeadlineAt,
    newDeadlineAt,
    reason,
    source,
  });
  try {
    const { error } = await supabase.from('unified_task_history').insert({
      source: 'crm_task',
      source_id: String(leadId),
      lead_id: leadId,
      company_id: companyId || null,
      actor_user_id: actorUserId,
      event_type: 'deadline_changed',
      field_name: 'kanban_deadline_at',
      old_value: oldDeadlineAt ? { deadline_at: oldDeadlineAt } : null,
      new_value: newDeadlineAt
        ? { deadline_at: newDeadlineAt, reason: reason || null, source: source || null }
        : null,
      description,
    });
    if (error) console.warn('[crmKanbanDeadline] unified_task_history:', error.message);
  } catch (e) {
    console.warn('[crmKanbanDeadline] unified_task_history:', e.message);
  }
}

/** Map row crm_lead_deadline_history → shape timeline (backfill khi chưa có unified). */
function mapDeadlineHistoryRowToUnified(h, leadId) {
  return {
    id: `dl-${h.id}`,
    source: 'crm_task',
    source_id: String(leadId),
    lead_id: leadId,
    event_type: 'deadline_changed',
    field_name: 'kanban_deadline_at',
    old_value: h.old_deadline_at ? { deadline_at: h.old_deadline_at } : null,
    new_value: h.new_deadline_at
      ? { deadline_at: h.new_deadline_at, reason: h.reason || null }
      : null,
    description: buildKanbanDeadlineDescription({
      oldDeadlineAt: h.old_deadline_at,
      newDeadlineAt: h.new_deadline_at,
      reason: h.reason,
      source: h.source,
    }),
    created_at: h.created_at,
    actor: h.changer || null,
  };
}

/** Gộp lịch sử deadline cũ (chỉ trong crm_lead_deadline_history) vào list unified. */
function mergeDeadlineHistoryIntoUnified(unifiedRows, deadlineRows, leadId) {
  const unified = [...(unifiedRows || [])];
  const deadlineUnifiedTs = new Set(
    unified
      .filter((r) => r.event_type === 'deadline_changed' && r.field_name === 'kanban_deadline_at')
      .map((r) => Math.floor(new Date(r.created_at).getTime() / 1000)),
  );
  for (const h of deadlineRows || []) {
    const sec = Math.floor(new Date(h.created_at).getTime() / 1000);
    const nearDup = [...deadlineUnifiedTs].some((t) => Math.abs(t - sec) <= 2);
    if (nearDup) continue;
    unified.push(mapDeadlineHistoryRowToUnified(h, leadId));
  }
  unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return unified;
}

module.exports = {
  logKanbanDeadlineUnifiedHistory,
  mergeDeadlineHistoryIntoUnified,
  buildKanbanDeadlineDescription,
};

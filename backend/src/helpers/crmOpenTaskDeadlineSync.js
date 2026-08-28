/**
 * NV CRM đang mở có Ngày hẹn — cùng điều kiện với attachCrmNextOpenTaskDeadline
 * (pending/in_progress, thuộc cột hiện tại hoặc không gắn cột).
 */
async function listOpenCrmTasksDrivingLeadDeadline(supabase, leadId, stageId) {
  const { data, error } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, pipeline_stage_id, deadline, order_index')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'in_progress'])
    .not('deadline', 'is', null);
  if (error) throw error;
  const stage = stageId == null ? '' : String(stageId);
  return (data || []).filter((t) => {
    if (t.pipeline_stage_id == null) return true;
    return String(t.pipeline_stage_id) === stage;
  });
}

/**
 * Gắn hạn user vừa tạo vào NV đang đếm (cùng điều kiện nguồn NV trên thẻ).
 * Không gán hạn cho NV tuần tự chưa tới lượt (chưa có deadline).
 */
async function syncOpenCrmTaskDeadlines(supabase, { leadId, stageId, newIso }) {
  const tasks = await listOpenCrmTasksDrivingLeadDeadline(supabase, leadId, stageId);
  const ids = tasks.map((t) => t.id).filter(Boolean);
  if (!ids.length) return { synced: 0, ids: [] };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('crm_tasks')
    .update({ deadline: newIso || null, updated_at: now })
    .in('id', ids);
  if (error) throw error;
  return { synced: ids.length, ids };
}

module.exports = {
  listOpenCrmTasksDrivingLeadDeadline,
  syncOpenCrmTaskDeadlines,
};

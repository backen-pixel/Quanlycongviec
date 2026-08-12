const { supabase } = require('../config/supabase');

/**
 * Xóa ngày giao hàng / production_deadline trên dự án gắn deal CRM.
 * Đồng bộ deadline các nhiệm vụ sx_giao_hang còn hạn.
 */
async function clearProjectDeliveryDeadlineForCrmLead(leadId) {
  const lid = String(leadId || '').trim();
  if (!lid) return false;

  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('project_id')
    .eq('id', lid)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead?.project_id) return false;

  const now = new Date().toISOString();
  const projectClear = {
    delivery_date: null,
    production_deadline: null,
    production_finish_date: null,
    updated_at: now,
  };
  let { error: projErr } = await supabase
    .from('projects')
    .update(projectClear)
    .eq('id', lead.project_id);
  if (projErr && /production_finish_date/i.test(String(projErr.message || ''))) {
    const fallback = { ...projectClear };
    delete fallback.production_finish_date;
    ({ error: projErr } = await supabase.from('projects').update(fallback).eq('id', lead.project_id));
  }
  if (projErr && !/delivery_date|production_deadline|production_finish_date/i.test(String(projErr.message || ''))) {
    throw projErr;
  }

  const { data: deliveryTasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', lid)
    .eq('stage_slug', 'sx_giao_hang')
    .not('deadline', 'is', null);
  if (taskErr) throw taskErr;
  if (deliveryTasks?.length) {
    const { error: dlErr } = await supabase
      .from('crm_tasks')
      .update({ deadline: null, updated_at: now })
      .in('id', deliveryTasks.map((t) => t.id));
    if (dlErr) throw dlErr;
  }

  return true;
}

function isClearsDeliveryDeadlineColumnError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return m.includes('clears_delivery_deadline_on_complete');
}

module.exports = {
  clearProjectDeliveryDeadlineForCrmLead,
  isClearsDeliveryDeadlineColumnError,
};

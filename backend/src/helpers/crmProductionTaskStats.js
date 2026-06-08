const { supabase } = require('../config/supabase');

const CRM_TASK_DONE = new Set(['completed', 'done']);

function isSxProductionTask(stageSlug) {
  return String(stageSlug || '').startsWith('sx_');
}

/**
 * Deal chính để đếm nhiệm vụ SX — khớp ProjectDetail mobile/web:
 * crm_leads.project_id (mới nhất), fallback fulfillment_lead_id từ orders.
 */
async function resolvePrimaryDealIdByProjectIds(projectIds) {
  const map = new Map();
  if (!projectIds?.length) return map;

  const ids = [...new Set(projectIds.map(String))];

  const { data: deals, error } = await supabase
    .from('crm_leads')
    .select('id, project_id, created_at')
    .in('project_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;

  for (const row of deals || []) {
    if (!row.project_id) continue;
    const pid = String(row.project_id);
    if (!map.has(pid)) map.set(pid, String(row.id));
  }

  const missing = ids.filter((id) => !map.has(id));
  if (!missing.length) return map;

  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('project_id, fulfillment_lead_id')
    .in('project_id', missing)
    .not('fulfillment_lead_id', 'is', null);
  if (ordErr) throw ordErr;

  for (const o of orders || []) {
    if (!o.project_id || !o.fulfillment_lead_id) continue;
    const pid = String(o.project_id);
    if (!map.has(pid)) map.set(pid, String(o.fulfillment_lead_id));
  }

  return map;
}

/**
 * Đếm nhiệm vụ sx_* cho deal — gộp task fulfillment con khi deal gốc use_order_tasks
 * (khớp GET /crm/leads/:id/tasks?task_scope=production).
 */
async function computeCrmProductionStatsForDeals(dealIds) {
  const statsByDeal = new Map();
  if (!dealIds?.length) return statsByDeal;

  const primaryIds = [...new Set(dealIds.map(String))];

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, use_order_tasks, parent_lead_id')
    .in('id', primaryIds);
  if (leadErr) throw leadErr;

  const leadMeta = new Map((leads || []).map((l) => [String(l.id), l]));
  const masterIds = primaryIds.filter((id) => {
    const l = leadMeta.get(id);
    return l?.use_order_tasks && !l?.parent_lead_id;
  });

  const childIdsByMaster = new Map();
  const allQueryLeadIds = new Set(primaryIds);

  if (masterIds.length) {
    const { data: orderRows, error: oErr } = await supabase
      .from('orders')
      .select('lead_id, fulfillment_lead_id')
      .in('lead_id', masterIds)
      .not('fulfillment_lead_id', 'is', null);
    if (oErr) throw oErr;

    for (const o of orderRows || []) {
      if (!o.lead_id || !o.fulfillment_lead_id) continue;
      const mid = String(o.lead_id);
      const fid = String(o.fulfillment_lead_id);
      if (!childIdsByMaster.has(mid)) childIdsByMaster.set(mid, new Set());
      childIdsByMaster.get(mid).add(fid);
      allQueryLeadIds.add(fid);
    }
  }

  const { data: tasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('lead_id, status, stage_slug')
    .in('lead_id', [...allQueryLeadIds]);
  if (taskErr) throw taskErr;

  const tasksByLead = new Map();
  for (const t of tasks || []) {
    if (!isSxProductionTask(t.stage_slug)) continue;
    const lid = String(t.lead_id);
    if (!tasksByLead.has(lid)) tasksByLead.set(lid, []);
    tasksByLead.get(lid).push(t);
  }

  for (const dealId of primaryIds) {
    const leadIdsToCount = new Set([dealId]);
    const meta = leadMeta.get(dealId);
    if (meta?.use_order_tasks && !meta?.parent_lead_id) {
      const children = childIdsByMaster.get(dealId);
      if (children) children.forEach((cid) => leadIdsToCount.add(cid));
    }

    let total = 0;
    let done = 0;
    for (const lid of leadIdsToCount) {
      for (const t of tasksByLead.get(lid) || []) {
        total += 1;
        if (CRM_TASK_DONE.has(String(t.status || ''))) done += 1;
      }
    }

    const progress = total ? Math.round((done / total) * 100) : 0;
    statsByDeal.set(dealId, { total, done, progress });
  }

  return statsByDeal;
}

/**
 * Gắn progress / done_tasks / task_total từ CRM sx_* lên danh sách dự án SX.
 * Khi chưa có nhiệm vụ CRM, giữ số liệu workflow tasks hiện có.
 */
async function attachCrmProductionTaskStatsToProjects(projects) {
  if (!projects?.length) return projects || [];

  const dealByProject = await resolvePrimaryDealIdByProjectIds(
    projects.map((p) => p.id).filter(Boolean),
  );
  if (!dealByProject.size) return projects;

  const statsByDeal = await computeCrmProductionStatsForDeals([...dealByProject.values()]);

  return projects.map((project) => {
    const dealId = dealByProject.get(String(project.id));
    if (!dealId) return project;

    const stats = statsByDeal.get(String(dealId));
    if (!stats || stats.total <= 0) return project;

    return {
      ...project,
      progress: stats.progress,
      task_total: stats.total,
      done_tasks: stats.done,
      crm_task_progress: stats.progress,
      crm_task_total: stats.total,
      crm_task_done: stats.done,
    };
  });
}

module.exports = {
  attachCrmProductionTaskStatsToProjects,
  resolvePrimaryDealIdByProjectIds,
  computeCrmProductionStatsForDeals,
};

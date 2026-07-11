const { supabase } = require('../config/supabase');

const CRM_DEALS_LIST_EMBED = `
  id, code, title, type, region_id, created_at, assigned_to, lead_owner_id, external_company_name,
  crm_region:company_regions!crm_leads_region_id_fkey(id, name, code),
  assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
  lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
  sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)),
  vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)
`;

const CRM_DEALS_LIST_MIN = 'id, code, title, type, created_at, assigned_to, lead_owner_id';

async function queryCrmDealsEmbed(filterFn) {
  try {
    let q = supabase.from('crm_leads').select(CRM_DEALS_LIST_EMBED);
    q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[workshopCrmDeals] embed:', e.message);
    let q2 = supabase.from('crm_leads').select(CRM_DEALS_LIST_MIN);
    q2 = filterFn(q2);
    const { data } = await q2;
    return data || [];
  }
}

async function loadCrmDealsForProjectDetail(projectId) {
  let rows = await queryCrmDealsEmbed((q) =>
    q.eq('project_id', projectId).order('created_at', { ascending: false }),
  );
  if (rows.length) return rows;

  let orderRows = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('lead_id, fulfillment_lead_id')
      .eq('project_id', projectId);
    if (error) throw error;
    orderRows = data || [];
  } catch (e) {
    console.warn('[workshopCrmDeals] orders lookup:', e.message);
    return [];
  }

  const idOrder = [];
  const seen = new Set();
  for (const o of orderRows) {
    if (o.lead_id && !seen.has(String(o.lead_id))) {
      seen.add(String(o.lead_id));
      idOrder.push(o.lead_id);
    }
    if (o.fulfillment_lead_id && !seen.has(String(o.fulfillment_lead_id))) {
      seen.add(String(o.fulfillment_lead_id));
      idOrder.push(o.fulfillment_lead_id);
    }
  }
  if (!idOrder.length) return [];

  rows = await queryCrmDealsEmbed((q) => q.in('id', idOrder));
  const rank = new Map(idOrder.map((id, i) => [String(id), i]));
  rows.sort((a, b) => (rank.get(String(a.id)) ?? 999) - (rank.get(String(b.id)) ?? 999));
  return rows;
}

/** Gắn crm_deals (kèm assignee CRM) lên danh sách dự án VC/SX. */
async function attachCrmDealsToProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const projectIds = [...new Set(list.map((p) => p?.id).filter(Boolean))];
  if (!projectIds.length) return list;

  const embedWithProject = `${CRM_DEALS_LIST_EMBED.trim()}, project_id`;
  const minWithProject = `${CRM_DEALS_LIST_MIN}, project_id`;

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(embedWithProject)
      .in('project_id', projectIds)
      .eq('type', 'deal')
      .order('created_at', { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn('[workshopCrmDeals] batch embed:', e.message);
    const { data } = await supabase
      .from('crm_leads')
      .select(minWithProject)
      .in('project_id', projectIds)
      .eq('type', 'deal')
      .order('created_at', { ascending: false });
    rows = data || [];
  }

  const byProject = new Map();
  for (const row of rows) {
    const pid = row.project_id != null ? String(row.project_id) : null;
    if (!pid) continue;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(row);
  }

  return list.map((p) => ({
    ...p,
    crm_deals: byProject.get(String(p.id)) || p.crm_deals || [],
  }));
}

module.exports = {
  CRM_DEALS_LIST_EMBED,
  attachCrmDealsToProjects,
  loadCrmDealsForProjectDetail,
};

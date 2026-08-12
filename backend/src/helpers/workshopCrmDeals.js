const { supabase } = require('../config/supabase');

const CRM_DEALS_LIST_EMBED = `
  id, code, title, type, region_id, created_at, assigned_to, lead_owner_id, external_company_name,
  install_address,
  crm_region:company_regions!crm_leads_region_id_fkey(id, name, code),
  assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
  lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
  sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug, company:companies(id, name, short_name)),
  vc_pipeline_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug)
`;

/** Mobile Kanban: không avatar / pipeline stage — payload nhỏ khi 200–1000 dự án/trang. */
const CRM_DEALS_LIST_EMBED_LITE = `
  id, title, type, region_id, project_id, assigned_to, lead_owner_id, external_company_name,
  crm_region:company_regions!crm_leads_region_id_fkey(id, name),
  assignee:users!crm_leads_assigned_to_fkey(id, full_name),
  lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name)
`;

const CRM_DEALS_LIST_MIN = 'id, code, title, type, created_at, assigned_to, lead_owner_id';
const CRM_DEALS_LIST_MIN_LITE = 'id, title, type, region_id, project_id, assigned_to, lead_owner_id, external_company_name';

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

  // Multi-SX: project phụ gắn qua crm_deal_projects
  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', projectId);
    const junctionIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))];
    if (junctionIds.length) {
      rows = await queryCrmDealsEmbed((q) => q.in('id', junctionIds));
      if (rows.length) return rows;
    }
  } catch (e) {
    if (!String(e.message || '').includes('crm_deal_projects')) {
      console.warn('[workshopCrmDeals] junction detail:', e.message);
    }
  }

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
async function attachCrmDealsToProjects(projects, opts = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const projectIds = [...new Set(list.map((p) => p?.id).filter(Boolean))];
  if (!projectIds.length) return list;

  const lite = !!opts.lite;
  const embedWithProject = lite
    ? CRM_DEALS_LIST_EMBED_LITE.trim()
    : `${CRM_DEALS_LIST_EMBED.trim()}, project_id`;
  const minWithProject = lite ? CRM_DEALS_LIST_MIN_LITE : `${CRM_DEALS_LIST_MIN}, project_id`;

  const rows = [];
  const CHUNK = 80;
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const chunk = projectIds.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select(embedWithProject)
        .in('project_id', chunk)
        .eq('type', 'deal')
        .order('created_at', { ascending: false });
      if (error) throw error;
      rows.push(...(data || []));
    } catch (e) {
      console.warn('[workshopCrmDeals] batch embed:', e.message);
      const { data } = await supabase
        .from('crm_leads')
        .select(minWithProject)
        .in('project_id', chunk)
        .eq('type', 'deal')
        .order('created_at', { ascending: false });
      rows.push(...(data || []));
    }
  }

  const byProject = new Map();
  for (const row of rows) {
    const pid = row.project_id != null ? String(row.project_id) : null;
    if (!pid) continue;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(row);
  }

  // Multi-SX: project phụ chỉ có trong crm_deal_projects → bổ sung deal theo junction
  const missingIds = projectIds
    .map(String)
    .filter((pid) => {
      if ((byProject.get(pid) || []).length) return false;
      const existing = list.find((p) => String(p?.id) === pid)?.crm_deals;
      return !(Array.isArray(existing) && existing.length);
    });
  if (missingIds.length) {
    try {
      for (let i = 0; i < missingIds.length; i += CHUNK) {
        const chunk = missingIds.slice(i, i + CHUNK);
        const { data: links, error: linkErr } = await supabase
          .from('crm_deal_projects')
          .select('deal_id, project_id')
          .in('project_id', chunk);
        if (linkErr) throw linkErr;
        const dealIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))];
        if (!dealIds.length) continue;
        let deals = [];
        try {
          const { data, error } = await supabase
            .from('crm_leads')
            .select(embedWithProject)
            .in('id', dealIds)
            .eq('type', 'deal');
          if (error) throw error;
          deals = data || [];
        } catch (e) {
          console.warn('[workshopCrmDeals] junction embed:', e.message);
          const { data } = await supabase
            .from('crm_leads')
            .select(minWithProject)
            .in('id', dealIds)
            .eq('type', 'deal');
          deals = data || [];
        }
        const dealById = new Map(deals.map((d) => [String(d.id), d]));
        for (const link of links || []) {
          const pid = link.project_id != null ? String(link.project_id) : null;
          const deal = link.deal_id ? dealById.get(String(link.deal_id)) : null;
          if (!pid || !deal) continue;
          if (!byProject.has(pid)) byProject.set(pid, []);
          const arr = byProject.get(pid);
          if (!arr.some((d) => String(d.id) === String(deal.id))) arr.push(deal);
        }
      }
    } catch (e) {
      if (!String(e.message || '').includes('crm_deal_projects')) {
        console.warn('[workshopCrmDeals] multi-sx junction:', e.message);
      }
    }
  }

  return list.map((p) => ({
    ...p,
    crm_deals: byProject.get(String(p.id)) || p.crm_deals || [],
  }));
}

async function batchLoadUsersByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, avatar, email')
      .in('id', unique);
    if (error) throw error;
    return new Map((data || []).map((u) => [String(u.id), u]));
  } catch (e) {
    console.warn('[workshopCrmDeals] batchLoadUsersByIds:', e.message);
    return new Map();
  }
}

/** Bổ sung full_name khi PostgREST embed users trên projects/crm_leads fail. */
async function hydrateWorkshopProjectPeople(project, crmDeals = []) {
  if (!project) return { project, crmDeals: crmDeals || [] };
  const p = { ...project };
  const deals = Array.isArray(crmDeals) ? crmDeals.map((d) => ({ ...d })) : [];
  const userIds = [];

  const personFields = [
    ['production_person_id', 'production_person'],
    ['logistics_person_id', 'logistics_person'],
    ['installer_person_id', 'installer_person'],
    ['sales_person_id', 'sales_person'],
    ['supervisor_id', 'supervisor'],
    ['project_manager_id', 'project_manager'],
  ];
  for (const [idField, objField] of personFields) {
    const uid = p[idField];
    if (uid && !p[objField]?.full_name) userIds.push(String(uid));
  }
  for (const d of deals) {
    if (d.assigned_to && !d.assignee?.full_name) userIds.push(String(d.assigned_to));
    if (d.lead_owner_id && !d.lead_owner?.full_name) userIds.push(String(d.lead_owner_id));
  }

  const byId = await batchLoadUsersByIds(userIds);
  for (const [idField, objField] of personFields) {
    const uid = p[idField];
    if (uid && !p[objField]?.full_name) {
      const u = byId.get(String(uid));
      if (u) p[objField] = u;
    }
  }
  const hydratedDeals = deals.map((d) => ({
    ...d,
    assignee: d.assignee?.full_name
      ? d.assignee
      : (d.assigned_to ? byId.get(String(d.assigned_to)) : null) || d.assignee || null,
    lead_owner: d.lead_owner?.full_name
      ? d.lead_owner
      : (d.lead_owner_id ? byId.get(String(d.lead_owner_id)) : null) || d.lead_owner || null,
  }));

  return { project: p, crmDeals: hydratedDeals };
}

module.exports = {
  CRM_DEALS_LIST_EMBED,
  attachCrmDealsToProjects,
  loadCrmDealsForProjectDetail,
  hydrateWorkshopProjectPeople,
};

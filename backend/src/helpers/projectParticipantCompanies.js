/**
 * Công ty đã gắn dự án (CRM / xưởng nguồn / xưởng đặt / VC) — dùng giao việc xưởng–xưởng.
 */

const { supabase } = require('../config/supabase');
const { fetchAllByIdsParallel, fetchAllPagesParallel } = require('./supabaseFetchAll');

function pushCompany(map, row, role) {
  const id = row?.id ? String(row.id) : '';
  if (!id) return;
  const prev = map.get(id) || {
    id,
    name: row.name || null,
    short_name: row.short_name || null,
    roles: [],
  };
  if (row.name && !prev.name) prev.name = row.name;
  if (row.short_name && !prev.short_name) prev.short_name = row.short_name;
  if (role && !prev.roles.includes(role)) prev.roles.push(role);
  map.set(id, prev);
}

async function hydrateCompanies(ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!list.length) return [];
  const { data } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .in('id', list);
  return data || [];
}

async function listProjectParticipantCompanies(projectId) {
  if (!projectId) return [];
  const map = new Map();

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, company_id, logistics_company_id,
      company:companies!projects_company_id_fkey(id, name, short_name),
      logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)
    `)
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return [];

  pushCompany(map, project.company || { id: project.company_id }, 'sx');
  if (project.logistics_company_id) {
    pushCompany(map, project.logistics_company || { id: project.logistics_company_id }, 'vc');
  }

  let dealIds = [];
  const { data: byProject } = await supabase
    .from('crm_leads')
    .select('id, company_id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  (byProject || []).forEach((d) => {
    if (d?.id) dealIds.push(d.id);
    if (d?.company_id) pushCompany(map, { id: d.company_id }, 'crm');
  });

  const { data: links } = await supabase
    .from('crm_deal_projects')
    .select('deal_id')
    .eq('project_id', projectId);
  (links || []).forEach((r) => { if (r?.deal_id) dealIds.push(r.deal_id); });
  dealIds = [...new Set(dealIds.map(String))];

  if (dealIds.length) {
    const { data: deals } = await supabase
      .from('crm_leads')
      .select('id, company_id, sx_template_company_id')
      .in('id', dealIds);
    (deals || []).forEach((d) => {
      if (d?.company_id) pushCompany(map, { id: d.company_id }, 'crm');
      if (d?.sx_template_company_id) pushCompany(map, { id: d.sx_template_company_id }, 'sx');
    });

    const { data: siblingLinks } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .in('deal_id', dealIds);
    const siblingIds = [...new Set((siblingLinks || []).map((r) => r.project_id).filter(Boolean).map(String))];
    if (siblingIds.length) {
      const { data: siblings } = await supabase
        .from('projects')
        .select('id, company_id, logistics_company_id')
        .in('id', siblingIds);
      (siblings || []).forEach((p) => {
        if (p?.company_id) pushCompany(map, { id: p.company_id }, 'sx');
        if (p?.logistics_company_id) pushCompany(map, { id: p.logistics_company_id }, 'vc');
      });
    }
  }

  try {
    const [{ data: asSource }, { data: asTarget }] = await Promise.all([
      supabase
        .from('project_workshop_placements')
        .select('target_company_id')
        .eq('source_project_id', projectId),
      supabase
        .from('project_workshop_placements')
        .select('source_project_id, target_company_id')
        .eq('target_project_id', projectId),
    ]);
    (asSource || []).forEach((r) => {
      if (r?.target_company_id) pushCompany(map, { id: r.target_company_id }, 'placed');
    });
    const sourceIds = [...new Set((asTarget || []).map((r) => r.source_project_id).filter(Boolean))];
    if (sourceIds.length) {
      const { data: sources } = await supabase
        .from('projects')
        .select('id, company_id')
        .in('id', sourceIds);
      (sources || []).forEach((p) => {
        if (p?.company_id) pushCompany(map, { id: p.company_id }, 'placed');
      });
    }
  } catch (_) { /* bảng chưa migrate */ }

  // Không push company từ project_company_assignments (mẫu luồng) — dễ lệch SoR module

  const missing = [...map.keys()].filter((id) => !map.get(id).name && !map.get(id).short_name);
  if (missing.length) {
    const rows = await hydrateCompanies(missing);
    rows.forEach((c) => pushCompany(map, c, null));
  }

  return [...map.values()].map((c) => ({
    ...c,
    label: c.short_name || c.name || c.id,
  }));
}

function isParticipantCompany(list, companyId) {
  if (!companyId) return false;
  return (list || []).some((c) => String(c.id) === String(companyId));
}

/**
 * Dự án SX/VC có thể thuộc xưởng khác, nhưng deal CRM vẫn của công ty đang xem.
 * Work Unified theo công ty CRM phải gồm các project_id gắn deal đó (kể cả junction multi-xưởng).
 */
async function listCrmLinkedProjectIds(companyIds) {
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];

  const deals = await fetchAllPagesParallel(() => supabase
    .from('crm_leads')
    .select('id, project_id')
    .eq('type', 'deal')
    .in('company_id', ids));
  const projectIds = new Set();
  const dealIds = [];
  (deals || []).forEach((d) => {
    if (d?.id) dealIds.push(d.id);
    if (d?.project_id) projectIds.add(String(d.project_id));
  });
  if (dealIds.length) {
    try {
      const links = await fetchAllByIdsParallel({
        table: 'crm_deal_projects',
        columns: 'project_id',
        key: 'deal_id',
        ids: dealIds,
      });
      (links || []).forEach((r) => {
        if (r?.project_id) projectIds.add(String(r.project_id));
      });
    } catch (e) {
      if (!String(e.message || '').includes('crm_deal_projects')) {
        console.warn('[crmLinkedProjects] junction:', e.message);
      }
    }
  }
  return [...projectIds];
}

async function projectHasCrmDealInCompanies(projectId, companyIds) {
  const pid = projectId ? String(projectId) : '';
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  if (!pid || !ids.length) return false;

  const { data: byProject } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', pid)
    .eq('type', 'deal')
    .in('company_id', ids)
    .limit(1);
  if (byProject?.length) return true;

  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', pid);
    const dealIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean).map(String))];
    if (!dealIds.length) return false;
    const { data: linked } = await supabase
      .from('crm_leads')
      .select('id')
      .in('id', dealIds)
      .in('company_id', ids)
      .limit(1);
    return !!(linked && linked.length);
  } catch (e) {
    if (!String(e.message || '').includes('crm_deal_projects')) {
      console.warn('[crmLinkedProjects] detail junction:', e.message);
    }
    return false;
  }
}

module.exports = {
  listProjectParticipantCompanies,
  isParticipantCompany,
  listCrmLinkedProjectIds,
  projectHasCrmDealInCompanies,
};

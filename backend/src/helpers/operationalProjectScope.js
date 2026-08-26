const { supabase } = require('../config/supabase');
const {
  applyCompanyScopeFilter,
  applyProjectScopeFilter,
  TENANT_EMPTY_COMPANY_SENTINEL,
} = require('./tenantScope');

const PAGE_SIZE = 1000;
const MAX_ROWS = 100000;

async function fetchAllRows(queryBuilder) {
  const rows = [];
  let offset = 0;
  while (rows.length < MAX_ROWS) {
    const { data, error } = await queryBuilder().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

function getScopeCompanyIds(scope) {
  if (!scope?.ok || scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) return [];
  if (scope.companyId) return [String(scope.companyId)];
  if (scope.companyIds?.length) return scope.companyIds.map(String);
  return null;
}

/**
 * Một Project thuộc góc nhìn vận hành khi công ty đang xem:
 * - sở hữu Project; hoặc
 * - là đơn vị Logistics; hoặc
 * - sở hữu Lead/Deal thương mại đang liên kết tới Project được xưởng khác thực thi.
 */
async function loadOperationalProjectIdsForScope(scope) {
  const companyIds = getScopeCompanyIds(scope);
  if (companyIds === null) return null;
  if (!companyIds.length) return [];

  const [leadRows, projectRows] = await Promise.all([
    fetchAllRows(() => {
      let query = supabase
        .from('crm_leads')
        .select('project_id')
        .not('project_id', 'is', null)
        .order('id');
      return applyCompanyScopeFilter(query, scope);
    }),
    fetchAllRows(() => {
      let query = supabase.from('projects').select('id').order('id');
      return applyProjectScopeFilter(query, scope);
    }),
  ]);

  return [...new Set([
    ...leadRows.map((row) => row.project_id),
    ...projectRows.map((row) => row.id),
  ].filter(Boolean).map(String))];
}

/** Kiểm tra quyền một Project mà không cần quét toàn bộ tenant. */
async function loadOperationalProjectAccess(projectId, scope) {
  if (!scope?.ok || scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) return null;
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, company_id, logistics_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return null;

  const companyIds = getScopeCompanyIds(scope);
  if (companyIds === null) return project;
  const allowed = new Set(companyIds);
  if (allowed.has(String(project.company_id)) || allowed.has(String(project.logistics_company_id))) return project;

  let leadQuery = supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);
  leadQuery = applyCompanyScopeFilter(leadQuery, scope);
  const { data: linkedLead, error: leadError } = await leadQuery.maybeSingle();
  if (leadError) throw leadError;
  return linkedLead ? project : null;
}

module.exports = {
  getScopeCompanyIds,
  loadOperationalProjectIdsForScope,
  loadOperationalProjectAccess,
};

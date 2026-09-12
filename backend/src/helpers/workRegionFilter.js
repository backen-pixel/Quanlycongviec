/**
 * Lọc khu vực cho Work Overview / Work Unified — khớp crm_leads.region_id
 * (dự án lấy qua project_id của deal; «Chưa gán» = không có region_id).
 */
const { supabase } = require('../config/supabase');
const { fetchAllPages, fetchAllByIds } = require('./supabaseFetchAll');
const { applyCompanyScopeFilter } = require('./tenantScope');

const WORK_REGION_NONE = '__none__';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseWorkRegionFilter(raw) {
  const s = String(raw || '').trim();
  if (!s) return { active: false };
  if (s === WORK_REGION_NONE) return { active: true, none: true };
  if (!UUID_RE.test(s)) return { active: false };
  return { active: true, none: false, regionId: s };
}

function tuneLeadsByCompany(q, scope) {
  return applyCompanyScopeFilter(q, scope);
}

/**
 * @returns {Promise<null|{
 *   none: boolean,
 *   regionId?: string,
 *   leadIds: string[],
 *   projectIds: string[],
 *   leadIdSet: Set<string>,
 *   projectIdSet: Set<string>,
 * }>}
 */
async function resolveWorkRegionScope(regionRaw, scope) {
  const parsed = parseWorkRegionFilter(regionRaw);
  if (!parsed.active) return null;

  if (parsed.none) {
    const rows = await fetchAllPages(() => tuneLeadsByCompany(
      supabase.from('crm_leads').select('id, project_id').not('region_id', 'is', null),
      scope,
    ));
    const leadIds = (rows || []).map((r) => r.id).filter(Boolean);
    const projectIds = [...new Set((rows || []).map((r) => r.project_id).filter(Boolean))];
    return {
      none: true,
      leadIds,
      projectIds,
      leadIdSet: new Set(leadIds.map(String)),
      projectIdSet: new Set(projectIds.map(String)),
    };
  }

  const rows = await fetchAllPages(() => tuneLeadsByCompany(
    supabase.from('crm_leads').select('id, project_id').eq('region_id', parsed.regionId),
    scope,
  ));
  const leadIds = (rows || []).map((r) => r.id).filter(Boolean);
  const projectIds = [...new Set((rows || []).map((r) => r.project_id).filter(Boolean))];
  return {
    none: false,
    regionId: parsed.regionId,
    leadIds,
    projectIds,
    leadIdSet: new Set(leadIds.map(String)),
    projectIdSet: new Set(projectIds.map(String)),
  };
}

function taskMatchesRegionScope(task, regionScope) {
  if (!regionScope) return true;
  const lid = task?.lead_id != null ? String(task.lead_id) : '';
  const pid = task?.project_id != null ? String(task.project_id) : '';
  const hit = (lid && regionScope.leadIdSet.has(lid))
    || (pid && regionScope.projectIdSet.has(pid));
  return regionScope.none ? !hit : hit;
}

/** Đếm việc quá hạn thuộc khu vực — gộp lead_id + project_id, không trùng unified_id. */
async function countOverdueTasksForRegion(regionScope, {
  scope, nowIso, applyOpenOnlyFilter, dateFromIso = '', dateToIso = '',
}) {
  if (!regionScope || regionScope.none) return null;
  const seen = new Set();
  const tune = (q) => {
    let t = applyOpenOnlyFilter(q).lt('deadline', nowIso).not('deadline', 'is', null);
    if (dateFromIso) t = t.gte('deadline', dateFromIso);
    if (dateToIso) t = t.lte('deadline', dateToIso);
    return applyCompanyScopeFilter(t, scope);
  };
  if (regionScope.leadIds.length) {
    const rows = await fetchAllByIds({
      table: 'unified_tasks_v',
      columns: 'unified_id',
      key: 'lead_id',
      ids: regionScope.leadIds,
      tune,
    });
    (rows || []).forEach((r) => { if (r.unified_id) seen.add(String(r.unified_id)); });
  }
  if (regionScope.projectIds.length) {
    const rows = await fetchAllByIds({
      table: 'unified_tasks_v',
      columns: 'unified_id',
      key: 'project_id',
      ids: regionScope.projectIds,
      tune,
    });
    (rows || []).forEach((r) => { if (r.unified_id) seen.add(String(r.unified_id)); });
  }
  return seen.size;
}

module.exports = {
  WORK_REGION_NONE,
  parseWorkRegionFilter,
  resolveWorkRegionScope,
  taskMatchesRegionScope,
  countOverdueTasksForRegion,
};

/**
 * L1+L2 cache cho cấu hình KPI ít đổi (definitions, business-hours, holidays,
 * và departments theo company — dùng trong resolveTargetUsers).
 *
 * KHÔNG cache: kpi_scores, kpi_targets (semi-live, theo period), kpi_leaves.
 */

const { createTTLCache } = require('./ttlCache');
const { supabase } = require('../config/supabase');

const kpiLookupCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 200,
  redisTtlMs: 15 * 60_000,
  redisPrefix: 'kpi:lookup:',
});

async function getKpiDefinitionsCached() {
  return kpiLookupCache.getOrFetch('defs', async () => {
    let { data, error } = await supabase
      .from('kpi_definitions')
      .select('id, code, name, group_code, formula_type, unit, weight, target_default, target_max, min_threshold, is_gating, applies_to, calc_params, description')
      .eq('is_active', true)
      .order('code');
    if (error?.message?.includes('calc_params') || error?.code === '42703') {
      ({ data, error } = await supabase
        .from('kpi_definitions')
        .select('id, code, name, group_code, formula_type, unit, weight, target_default, target_max, min_threshold, is_gating, applies_to, description')
        .eq('is_active', true)
        .order('code'));
    }
    if (error) throw error;
    return (data || []).map((row) => ({ ...row, calc_params: row.calc_params || {} }));
  });
}

async function getBusinessHoursConfigCached(companyId) {
  const key = `bizhours:${companyId || 'default'}`;
  return kpiLookupCache.getOrFetch(key, async () => {
    let row = null;
    if (companyId) {
      const { data } = await supabase
        .from('kpi_business_hours_config')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      row = data;
    }
    if (!row) {
      const { data } = await supabase
        .from('kpi_business_hours_config')
        .select('*')
        .is('company_id', null)
        .maybeSingle();
      row = data;
    }
    return row || null;
  });
}

async function getHolidaysCached(companyId) {
  const key = `holidays:${companyId || 'all'}`;
  return kpiLookupCache.getOrFetch(key, async () => {
    let q = supabase
      .from('kpi_holidays')
      .select('id, company_id, holiday_date, name, repeat_yearly, is_half_day, notes, created_at')
      .order('holiday_date', { ascending: true });
    if (companyId) q = q.or(`company_id.eq.${companyId},company_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

/** Danh sách department_id thuộc 1 company — slow-changing taxonomy. */
async function getCompanyDepartmentIdsCached(companyId) {
  if (!companyId) return [];
  const key = `depts:${companyId}`;
  return kpiLookupCache.getOrFetch(key, async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data || []).map((d) => d.id);
  });
}

function invalidateKpiDefinitions() {
  kpiLookupCache.invalidateRemote('defs').catch(() => {});
}
function invalidateKpiBusinessHours() {
  kpiLookupCache.invalidateRemote('bizhours:', { isPrefix: true }).catch(() => {});
}
function invalidateKpiHolidays() {
  kpiLookupCache.invalidateRemote('holidays:', { isPrefix: true }).catch(() => {});
}
function invalidateAllKpiLookup() {
  kpiLookupCache.invalidateRemote(null).catch(() => {});
}

module.exports = {
  kpiLookupCache,
  getKpiDefinitionsCached,
  getBusinessHoursConfigCached,
  getHolidaysCached,
  getCompanyDepartmentIdsCached,
  invalidateKpiDefinitions,
  invalidateKpiBusinessHours,
  invalidateKpiHolidays,
  invalidateAllKpiLookup,
};

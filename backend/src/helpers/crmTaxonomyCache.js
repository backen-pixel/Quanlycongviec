/**
 * L1+L2 cache cho taxonomy/lookup CRM (pipelines, stages, sources, categories,
 * lead types, company regions). Mỗi nhóm m\u1ed9t cache ri\u00eang \u0111\u1ec3 invalidate g\u1ecdn.
 *
 * KH\u00d4NG c\u00f3 query data live \u1edf \u0111\u00e2y (kh\u00f4ng cache leads/deals/orders/tasks).
 */

const { createTTLCache } = require('./ttlCache');
const { supabase } = require('../config/supabase');

const crmPipelinesCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 500,
  redisTtlMs: 15 * 60_000,
  redisPrefix: 'crm:pipelines:',
});

const crmStagesCache = createTTLCache({
  ttlMs: 60_000,
  maxEntries: 2000,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'crm:stages:',
});

const crmSourcesCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 500,
  redisTtlMs: 15 * 60_000,
  redisPrefix: 'crm:sources:',
});

const crmRegionsCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 500,
  redisTtlMs: 15 * 60_000,
  redisPrefix: 'crm:regions:',
});

// ─── Invalidators ──────────────────────────────────────────────────────────
function invalidatePipelinesAndStages() {
  crmPipelinesCache.invalidateRemote(null).catch(() => {});
  crmStagesCache.invalidateRemote(null).catch(() => {});
  _bumpCrmHttpCache();
}
function invalidateSources() {
  crmSourcesCache.invalidateRemote(null).catch(() => {});
  _bumpCrmHttpCache();
}
function invalidateRegions() {
  crmRegionsCache.invalidateRemote(null).catch(() => {});
  _bumpCrmHttpCache();
}

function _bumpCrmHttpCache() {
  try {
    const { invalidateTags } = require('../middleware/responseCache');
    void invalidateTags(['crm:pipelines', 'crm:sources', 'orgtree']);
  } catch { /* ignore */ }
}

// ─── Pipelines ─────────────────────────────────────────────────────────────

/**
 * GET /pipelines result cache (k\u00e8m join companies). Phân theo công ty + activeOnly.
 * `companyFilter` = null \u21d2 admin xem to\u00e0n h\u1ec7 th\u1ed1ng.
 */
async function getPipelinesList({ companyFilter = null, activeOnly = true } = {}) {
  const key = `list:${companyFilter || 'all'}:${activeOnly ? 'act' : 'any'}`;
  return crmPipelinesCache.getOrFetch(key, async () => {
    let q = supabase
      .from('crm_pipelines')
      .select('*, company:companies(id, name)')
      .order('is_default', { ascending: false })
      .order('name');
    if (activeOnly) q = q.eq('is_active', true);
    if (companyFilter) q = q.eq('company_id', companyFilter);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

/** Pipeline đầy đủ + Zalo slice (dùng cho zalo notify). */
async function getPipelineZaloSlice(pipelineId) {
  if (!pipelineId) {
    return { pipeline: null, zalo_template_id: null, zalo_merge_template_data: {} };
  }
  return crmPipelinesCache.getOrFetch(`zalo:${pipelineId}`, async () => {
    const { data, error } = await supabase
      .from('crm_pipelines')
      .select('id, name, zalo_template_id, zalo_merge_template_data')
      .eq('id', pipelineId)
      .maybeSingle();
    if (error || !data) {
      return { pipeline: null, zalo_template_id: null, zalo_merge_template_data: {} };
    }
    const tid =
      data.zalo_template_id != null && String(data.zalo_template_id).trim() !== ''
        ? String(data.zalo_template_id).trim()
        : null;
    const merge =
      data.zalo_merge_template_data != null &&
      typeof data.zalo_merge_template_data === 'object' &&
      !Array.isArray(data.zalo_merge_template_data)
        ? data.zalo_merge_template_data
        : {};
    return {
      pipeline: { id: data.id, name: data.name },
      zalo_template_id: tid,
      zalo_merge_template_data: merge,
    };
  });
}

/** Default pipeline id (is_default desc, created_at) cho công ty. */
async function getDefaultPipelineIdForCompany(companyId) {
  if (!companyId) return null;
  return crmPipelinesCache.getOrFetch(`default:${companyId}`, async () => {
    const { data } = await supabase
      .from('crm_pipelines')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at')
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  });
}

// ─── Stages ────────────────────────────────────────────────────────────────

/** Stage đơn theo id — dùng cho dealStageIsHoanThanh + permission checks. */
async function getCrmStageById(stageId) {
  if (!stageId) return null;
  return crmStagesCache.getOrFetch(`byid:${stageId}`, async () => {
    const { data } = await supabase
      .from('crm_pipeline_stages')
      .select(
        'id, name, pipeline_id, pipeline_type, is_won, is_lost, is_active, order_index, sla_days, default_probability, send_zalo_on_enter, create_event_on_enter, sync_role, color, icon, description, counts_as_won_revenue, counts_as_completed_revenue',
      )
      .eq('id', stageId)
      .maybeSingle();
    return data || null;
  });
}

/** Stages thuộc pipeline_id (optional filter pipeline_type) — sorted by order_index. */
async function getStagesByPipelineId(pipelineId, { type = null, activeOnly = true } = {}) {
  if (!pipelineId) return [];
  const key = `bypl:${pipelineId}:${type || 'any'}:${activeOnly ? 'act' : 'any'}`;
  return crmStagesCache.getOrFetch(key, async () => {
    let q = supabase
      .from('crm_pipeline_stages')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('order_index', { ascending: true });
    if (type) q = q.eq('pipeline_type', type);
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

// ─── Sources / Categories / Lead types ─────────────────────────────────────

async function getCrmSourcesList({ filterCo = null, includeInactive = false } = {}) {
  const key = `sources:${filterCo || 'all'}:${includeInactive ? 'all' : 'act'}`;
  return crmSourcesCache.getOrFetch(key, async () => {
    let q = supabase
      .from('crm_sources')
      .select('*, category:crm_source_categories(id, name, icon, color, company_id)')
      .order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    if (filterCo) q = q.or(`company_id.is.null,company_id.eq.${filterCo}`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

async function getCrmSourceCategoriesList({ filterCo = null, includeInactive = false } = {}) {
  const key = `cats:${filterCo || 'all'}:${includeInactive ? 'all' : 'act'}`;
  return crmSourcesCache.getOrFetch(key, async () => {
    let q = supabase
      .from('crm_source_categories')
      .select('*')
      .order('order_index', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    if (filterCo) q = q.or(`company_id.is.null,company_id.eq.${filterCo}`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

async function getCrmLeadTypesList({ companyId, activeOnly = true } = {}) {
  if (!companyId) return [];
  const key = `lead-types:${companyId}:${activeOnly ? 'act' : 'any'}`;
  return crmSourcesCache.getOrFetch(key, async () => {
    let q = supabase
      .from('crm_lead_types')
      .select('*')
      .eq('company_id', companyId)
      .order('order_index');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

// ─── Regions ───────────────────────────────────────────────────────────────

/** company_regions list — key theo (allowedIds, div, moduleDivIds). */
async function getCompanyRegionsList({ allowedIds = [], div = null, moduleDivIds = null } = {}) {
  const ids = [...allowedIds].sort();
  const modIds = moduleDivIds ? [...moduleDivIds].sort() : null;
  const key = `regions:${ids.join(',')}:${div || 'all'}:${modIds ? modIds.join(',') : 'no-mod'}`;
  return crmRegionsCache.getOrFetch(key, async () => {
    let q = supabase
      .from('company_regions')
      .select('*, division:ecosystem_units(id, name, short_name)')
      .in('company_id', ids)
      .order('order_index');
    if (div) {
      q = q.eq('division_unit_id', div);
    } else if (modIds && modIds.length) {
      q = q.or(`division_unit_id.in.(${modIds.join(',')}),division_unit_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

/** company_regions theo id — dùng cho assertRegionBelongsToCompany. */
async function getRegionMetaById(regionId) {
  if (!regionId) return null;
  return crmRegionsCache.getOrFetch(`one:${regionId}`, async () => {
    const { data } = await supabase
      .from('company_regions')
      .select('id, company_id, is_active')
      .eq('id', regionId)
      .maybeSingle();
    return data || null;
  });
}

module.exports = {
  crmPipelinesCache,
  crmStagesCache,
  crmSourcesCache,
  crmRegionsCache,
  invalidatePipelinesAndStages,
  invalidateSources,
  invalidateRegions,
  getPipelinesList,
  getPipelineZaloSlice,
  getDefaultPipelineIdForCompany,
  getCrmStageById,
  getStagesByPipelineId,
  getCrmSourcesList,
  getCrmSourceCategoriesList,
  getCrmLeadTypesList,
  getCompanyRegionsList,
  getRegionMetaById,
};

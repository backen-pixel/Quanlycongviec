const { supabase } = require('../config/supabase');
const { createTTLCache } = require('./ttlCache');
const { isTenantAdmin: isEcosystemSystemAdmin } = require('./adminRole');

const tenantCache = createTTLCache({
  ttlMs: 60_000,
  maxEntries: 200,
  redisTtlMs: 5 * 60_000,
  redisPrefix: 'tenant:',
});

function isPlatformAdmin(user) {
  const r = String(user?.role ?? '').trim().toLowerCase();
  return r === 'platform_admin';
}

function isTenantAdmin(user) {
  return isEcosystemSystemAdmin(user);
}

async function resolveTenantIdForUser(userId) {
  if (!userId) return null;
  const key = `user:${userId}`;
  return tenantCache.getOrFetch(key, async () => {
    const { data } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle();
    return data?.tenant_id || null;
  });
}

async function tenantFeatureEnabled(tenantId, featureKey) {
  if (!tenantId || !featureKey) return true;
  const key = `feat:${tenantId}:${featureKey}`;
  const result = await tenantCache.getOrFetch(key, async () => {
    const { data } = await supabase
      .from('tenant_features')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .eq('feature_key', featureKey)
      .maybeSingle();
    if (data) return data.enabled;
    const { data: tenant } = await supabase
      .from('tenants')
      .select('tier')
      .eq('id', tenantId)
      .maybeSingle();
    if (!tenant?.tier) return true;
    const { data: tf } = await supabase
      .from('tier_features')
      .select('enabled')
      .eq('tier', tenant.tier)
      .eq('feature_key', featureKey)
      .maybeSingle();
    return tf ? tf.enabled : false;
  });
  return result !== false;
}

async function getTenantLimits(tenantId) {
  if (!tenantId) return null;
  const key = `limits:${tenantId}`;
  return tenantCache.getOrFetch(key, async () => {
    const { data } = await supabase
      .from('tenants')
      .select('tier, max_users, max_companies, subscription_start, subscription_end, is_active')
      .eq('id', tenantId)
      .maybeSingle();
    return data || null;
  });
}

async function assertTenantActive(tenantId) {
  if (!tenantId) return { ok: true };
  const limits = await getTenantLimits(tenantId);
  if (!limits) return { ok: false, error: 'Không tìm thấy hệ sinh thái' };
  if (limits.is_active === false) {
    return { ok: false, error: 'Hệ sinh thái đã bị tạm dừng — liên hệ quản trị viên' };
  }
  return { ok: true };
}

async function getTenantCompanyIds(tenantId) {
  if (!tenantId) return [];
  const key = `cos:${tenantId}`;
  return tenantCache.getOrFetch(key, async () => {
    const { data } = await supabase
      .from('companies')
      .select('id')
      .eq('tenant_id', tenantId);
    return (data || []).map((c) => String(c.id));
  });
}

async function assertCompanyInTenant(companyId, tenantId) {
  if (!tenantId || !companyId) return false;
  const ids = await getTenantCompanyIds(tenantId);
  return ids.includes(String(companyId));
}

const TENANT_EMPTY_COMPANY_SENTINEL = '00000000-0000-0000-0000-000000000000';

function isTenantScopeEnforced(req) {
  return req?.tenantContext?.enforced === true;
}

function companyInTenantContext(req, companyId) {
  if (!req.tenantContext?.enforced) return true;
  if (!companyId) return false;
  return (req.tenantCompanyIds || []).includes(String(companyId));
}

/** Lọc Supabase query theo company_id thuộc tenant hiện tại. */
function applyCompanyTenantScope(query, req, column = 'company_id') {
  if (!isTenantScopeEnforced(req)) return query;
  const ids = req.tenantCompanyIds || [];
  if (!ids.length) return query.eq(column, TENANT_EMPTY_COMPANY_SENTINEL);
  return query.in(column, ids);
}

/** Giao cắt danh sách company_id với phạm vi tenant. */
function intersectCompanyIdsWithTenant(req, companyIds) {
  if (!isTenantScopeEnforced(req)) return companyIds || [];
  const allowed = new Set(req.tenantCompanyIds || []);
  return (companyIds || []).filter((id) => allowed.has(String(id)));
}

function assertCompanyAccessible(req, res, companyId) {
  if (!companyId || companyId === 'all') return true;
  if (companyInTenantContext(req, companyId)) return true;
  void require('./tenantAudit').logTenantAccessDenied(req, {
    action: 'company_access_denied',
    companyId,
  }).catch(() => {});
  res.status(403).json({ error: 'Không có quyền truy cập công ty này', code: 'tenant_company_denied' });
  return false;
}

/** Lọc bảng projects — company_id hoặc logistics_company_id thuộc tenant. */
function applyProjectTenantScope(query, req) {
  if (!isTenantScopeEnforced(req)) return query;
  const ids = req.tenantCompanyIds || [];
  if (!ids.length) return query.eq('company_id', TENANT_EMPTY_COMPANY_SENTINEL);
  const inList = ids.join(',');
  return query.or(`company_id.in.(${inList}),logistics_company_id.in.(${inList})`);
}

function assertRowCompanyInTenant(req, res, row, column = 'company_id') {
  if (!row) return true;
  if (isTenantScopeEnforced(req) && column === 'company_id' && row.logistics_company_id) {
    const ok =
      companyInTenantContext(req, row.company_id) ||
      companyInTenantContext(req, row.logistics_company_id);
    if (!ok) {
      res.status(403).json({ error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác', code: 'tenant_company_denied' });
      return false;
    }
    return true;
  }
  return assertCompanyAccessible(req, res, row[column]);
}

function invalidateTenantCache(tenantId) {
  if (tenantId) {
    tenantCache.invalidateRemote(`limits:${tenantId}`).catch(() => {});
    tenantCache.invalidateRemote(`cos:${tenantId}`).catch(() => {});
  } else {
    tenantCache.invalidateRemote(null).catch(() => {});
  }
}

function addTenantFilter(query, user) {
  if (isPlatformAdmin(user)) return query;
  if (user?.tenant_id) return query.eq('tenant_id', user.tenant_id);
  return query;
}

function addEcosystemUnitTenantFilter(query, req) {
  if (!req?.tenantContext?.enforced) return query;
  const tid = req.tenantContext.tenantId;
  const cids = req.tenantCompanyIds || [];
  if (cids.length) {
    return query.or(`tenant_id.eq.${tid},company_id.in.(${cids.join(',')})`);
  }
  return query.eq('tenant_id', tid);
}

function trimOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Phạm vi company cho API list/dashboard.
 * Tenant SaaS: luôn giới hạn theo company thuộc tenant (kể cả admin tenant).
 */
function resolveCompanyScopeForRequest(req, companyIdQuery, { scopedAdminCompanyId = null } = {}) {
  if (isTenantScopeEnforced(req)) {
    const ids = [...(req.tenantCompanyIds || [])];
    const raw = trimOrNull(companyIdQuery);
    if (raw) {
      if (!ids.includes(raw)) {
        return { ok: false, code: 'tenant_company_denied', error: 'Không có quyền truy cập công ty này' };
      }
      return { ok: true, companyId: raw, companyIds: [raw] };
    }
    if (!ids.length) {
      return { ok: true, companyId: TENANT_EMPTY_COMPANY_SENTINEL, companyIds: [] };
    }
    return { ok: true, companyId: ids.length === 1 ? ids[0] : null, companyIds: ids };
  }

  const sac = trimOrNull(scopedAdminCompanyId)
    || trimOrNull(req.user?.scoped_admin_company_id)
    || trimOrNull(req.user?.scopedAdminCompanyId);
  if (sac) return { ok: true, companyId: sac, companyIds: [sac] };

  const { isAdminLike } = require('./adminRole');
  if (!isAdminLike(req.user) && req.user?.company_id) {
    const cid = String(req.user.company_id);
    return { ok: true, companyId: cid, companyIds: [cid] };
  }

  const raw = trimOrNull(companyIdQuery);
  return { ok: true, companyId: raw, companyIds: raw ? [raw] : null };
}

function applyCompanyScopeFilter(query, scope, column = 'company_id') {
  if (!scope?.ok) return query;
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) {
    return query.eq(column, TENANT_EMPTY_COMPANY_SENTINEL);
  }
  if (scope.companyId) return query.eq(column, scope.companyId);
  if (scope.companyIds?.length) return query.in(column, scope.companyIds);
  return query;
}

/** projects: company_id hoặc logistics_company_id thuộc phạm vi tenant */
function applyProjectScopeFilter(query, scope) {
  if (!scope?.ok) return query;
  if (scope.companyId === TENANT_EMPTY_COMPANY_SENTINEL) {
    return query.eq('company_id', TENANT_EMPTY_COMPANY_SENTINEL);
  }
  const ids = scope.companyIds?.length
    ? scope.companyIds
    : (scope.companyId ? [scope.companyId] : null);
  if (!ids?.length) return query;
  const inList = ids.join(',');
  return query.or(`company_id.in.(${inList}),logistics_company_id.in.(${inList})`);
}

module.exports = {
  isPlatformAdmin,
  isTenantAdmin,
  resolveTenantIdForUser,
  tenantFeatureEnabled,
  getTenantLimits,
  assertTenantActive,
  getTenantCompanyIds,
  assertCompanyInTenant,
  isTenantScopeEnforced,
  companyInTenantContext,
  applyCompanyTenantScope,
  applyProjectTenantScope,
  intersectCompanyIdsWithTenant,
  assertCompanyAccessible,
  assertRowCompanyInTenant,
  invalidateTenantCache,
  addTenantFilter,
  addEcosystemUnitTenantFilter,
  resolveCompanyScopeForRequest,
  applyCompanyScopeFilter,
  applyProjectScopeFilter,
  TENANT_EMPTY_COMPANY_SENTINEL,
};

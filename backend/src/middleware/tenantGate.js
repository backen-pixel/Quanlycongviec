const {
  isPlatformAdmin,
  tenantFeatureEnabled,
  assertTenantActive,
  getTenantCompanyIds,
  companyInTenantContext,
} = require('../helpers/tenantScope');

const TENANT_COMPANY_PARAM_KEYS = [
  'company_id',
  'crm_company_id',
  'owner_company_id',
  'production_company_id',
  'logistics_company_id',
  'executor_company_id',
  'target_company_id',
  'source_company_id',
  'client_company_id',
  'sx_company_id',
  'sx_template_company_id',
  'default_company_id',
  'default_production_company_id',
  'workshop_company_id',
  'deal_company_id',
  'sx_workshop_company_id',
  'commercial_company_id',
  'filter_company_id',
];

const TENANT_COMPANY_LIST_PARAM_KEYS = [
  'company_ids',
  'crm_company_ids',
  'production_company_ids',
  'logistics_company_ids',
  'executor_company_ids',
  'target_company_ids',
];

function normalizeCompanyParamValues(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.flatMap(normalizeCompanyParamValues);
  if (typeof raw === 'object') return [];
  const value = String(raw).trim();
  if (!value || value.toLowerCase() === 'all') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.flatMap(normalizeCompanyParamValues);
    } catch { /* fall through to CSV parsing */ }
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function requireTenant(req, res, next) {
  if (isPlatformAdmin(req.user)) return next();
  if (!req.user?.tenant_id) {
    return res.status(403).json({ error: 'Không xác định được hệ sinh thái' });
  }
  next();
}

function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên nền tảng' });
  }
  next();
}

function requireTenantFeature(featureKey) {
  return async (req, res, next) => {
    if (isPlatformAdmin(req.user)) return next();
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return next();
    const ok = await tenantFeatureEnabled(tenantId, featureKey);
    if (!ok) {
      return res.status(403).json({ error: `Tính năng "${featureKey}" chưa được kích hoạt cho hệ sinh thái này` });
    }
    next();
  };
}

/**
 * Gắn ngữ cảnh tenant sau auth — chặn HST tạm dừng, cache danh sách company_id.
 * platform_admin / system / user chưa có tenant_id (legacy) → bypass.
 */
async function attachTenantContext(req) {
  if (!req.user) return;

  const role = String(req.user.role ?? '').trim().toLowerCase();
  if (isPlatformAdmin(req.user) || role === 'system') {
    req.tenantContext = { enforced: false };
    return;
  }

  const tenantId = req.user.tenant_id;
  if (!tenantId) {
    req.tenantContext = { enforced: false };
    return;
  }

  const active = await assertTenantActive(tenantId);
  if (!active.ok) {
    const err = new Error(active.error);
    err.statusCode = 403;
    err.code = 'tenant_inactive';
    throw err;
  }
  const companyIds = await getTenantCompanyIds(tenantId);
  req.tenantContext = { enforced: true, tenantId, companyIds };
  req.tenantId = tenantId;
  req.tenantCompanyIds = companyIds;
}

async function enforceTenantContext(req, res, next) {
  try {
    await attachTenantContext(req);
    return next();
  } catch (e) {
    if (e.statusCode === 403) {
      return res.status(403).json({ error: e.message, code: e.code || 'tenant_inactive' });
    }
    return res.status(500).json({ error: e.message });
  }
}

/** Chặn query/body company_id ngoài phạm vi tenant (kể cả danh sách company_ids). */
function guardTenantCompanyParams(req, res, next) {
  if (!req.tenantContext?.enforced) return next();
  for (const src of [req.query, req.body]) {
    if (!src || typeof src !== 'object') continue;
    for (const key of [...TENANT_COMPANY_PARAM_KEYS, ...TENANT_COMPANY_LIST_PARAM_KEYS]) {
      const companyIds = normalizeCompanyParamValues(src[key]);
      const deniedCompanyId = companyIds.find((companyId) => !companyInTenantContext(req, companyId));
      if (deniedCompanyId) {
        void require('../helpers/tenantAudit').logTenantAccessDenied(req, {
          action: 'company_param_access_denied',
          resourceType: 'request_company_scope',
          companyId: deniedCompanyId,
          metadata: { parameter: key, method: req.method || null, path: req.originalUrl || req.path || null },
        }).catch(() => {});
        return res.status(403).json({
          error: 'Không có quyền truy cập công ty này',
          code: 'tenant_company_denied',
        });
      }
    }
  }
  return next();
}

module.exports = {
  requireTenant,
  requirePlatformAdmin,
  requireTenantFeature,
  attachTenantContext,
  enforceTenantContext,
  guardTenantCompanyParams,
  normalizeCompanyParamValues,
};

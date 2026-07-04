const {
  isPlatformAdmin,
  tenantFeatureEnabled,
  assertTenantActive,
  getTenantCompanyIds,
  companyInTenantContext,
} = require('../helpers/tenantScope');

const TENANT_COMPANY_PARAM_KEYS = [
  'company_id',
  'workshop_company_id',
  'deal_company_id',
  'sx_workshop_company_id',
  'commercial_company_id',
  'filter_company_id',
];

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

/** Chặn query/body company_id ngoài phạm vi tenant (SX/VC/CRM list filters). */
function guardTenantCompanyParams(req, res, next) {
  if (!req.tenantContext?.enforced) return next();
  for (const src of [req.query, req.body]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of TENANT_COMPANY_PARAM_KEYS) {
      const raw = src[k];
      if (raw == null || raw === '' || raw === 'all') continue;
      if (!companyInTenantContext(req, String(raw).trim())) {
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
};

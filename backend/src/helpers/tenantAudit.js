const { supabase } = require('../config/supabase');

/** Ghi audit cross-tenant (best-effort, không chặn request). */
async function logTenantAccessDenied(req, {
  action = 'access_denied',
  resourceType = null,
  resourceId = null,
  companyId = null,
  metadata = null,
} = {}) {
  try {
    const userId = req.user?.userId || req.user?.id || null;
    const tenantId = req.user?.tenant_id || req.tenantId || null;
    const ip = req.ip || req.headers?.['x-forwarded-for']?.split?.(',')[0]?.trim() || null;
    await supabase.from('tenant_access_audit').insert({
      tenant_id: tenantId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      company_id: companyId,
      ip,
      metadata: metadata || {},
    });
  } catch (e) {
    if (process.env.TENANT_AUDIT_DEBUG === '1') {
      console.warn('[tenantAudit]', e.message);
    }
  }
}

module.exports = { logTenantAccessDenied };

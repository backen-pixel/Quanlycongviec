const { supabase } = require('../config/supabase');

function clientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

/**
 * Ghi audit (fail-safe — không throw).
 * @param {import('express').Request} [req]
 * @param {object} entry
 */
async function writeAuditLog(req, entry = {}) {
  try {
    const userId = req?.user?.userId || req?.user?.id || entry.user_id || null;
    const row = {
      user_id: userId,
      company_id: entry.company_id ?? req?.user?.company_id ?? null,
      module: String(entry.module || 'system').slice(0, 40),
      entity_type: entry.entity_type ? String(entry.entity_type).slice(0, 40) : null,
      entity_id: entry.entity_id || null,
      action: String(entry.action || 'unknown').slice(0, 60),
      entity_label: entry.entity_label ? String(entry.entity_label).slice(0, 500) : null,
      before_data: entry.before ?? entry.before_data ?? null,
      after_data: entry.after ?? entry.after_data ?? null,
      metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : null,
      ip: entry.ip || clientIp(req),
      user_agent: entry.user_agent
        ? String(entry.user_agent).slice(0, 500)
        : req?.headers?.['user-agent']
          ? String(req.headers['user-agent']).slice(0, 500)
          : null,
    };
    const { error } = await supabase.from('audit_log').insert(row);
    if (error && !/audit_log|does not exist|42P01/i.test(String(error.message || ''))) {
      console.warn('[auditLog] insert failed:', error.message);
    }
  } catch (e) {
    console.warn('[auditLog]', e?.message || e);
  }
}

module.exports = { writeAuditLog, clientIp };

/**
 * Phạm vi công ty cho user được cấp quyền Facebook/Zalo (không full admin CRM).
 */
const { supabase } = require('../config/supabase');
const { isCrmSocialInboxUser, normalizeEmail } = require('./adminRole');

/** email → company key (hiện chỉ hỗ trợ nextgo). */
const CRM_SOCIAL_INBOX_COMPANY_KEYS = {
  'luonggiayen@gmail.com': 'nextgo',
};

let _nextGoCompanyIdCache = { id: null, ts: 0 };

async function resolveNextGoCompanyId() {
  if (_nextGoCompanyIdCache.id && Date.now() - _nextGoCompanyIdCache.ts < 300_000) {
    return _nextGoCompanyIdCache.id;
  }
  const { data } = await supabase
    .from('companies')
    .select('id')
    .or('name.ilike.%NextGo%,short_name.ilike.%NextGo%')
    .order('name')
    .limit(1)
    .maybeSingle();
  _nextGoCompanyIdCache = { id: data?.id || null, ts: Date.now() };
  return _nextGoCompanyIdCache.id;
}

function getCrmSocialInboxCompanyKey(user) {
  if (!isCrmSocialInboxUser(user)) return null;
  return CRM_SOCIAL_INBOX_COMPANY_KEYS[normalizeEmail(user?.email)] || null;
}

/** company_id bắt buộc cho user hộp thư riêng; null nếu không phải user đó. */
async function resolveCrmSocialInboxCompanyId(user) {
  const key = getCrmSocialInboxCompanyKey(user);
  if (key === 'nextgo') return resolveNextGoCompanyId();
  return null;
}

/**
 * Kiểm tra company_id request có khớp phạm vi social inbox.
 * @returns {{ ok: true, companyId?: string } | { ok: false, error: string }}
 */
async function assertCrmSocialInboxCompanyAccess(user, companyIdRaw) {
  const forced = await resolveCrmSocialInboxCompanyId(user);
  if (!forced) return { ok: true };
  const reqCo = companyIdRaw != null && String(companyIdRaw).trim() !== ''
    ? String(companyIdRaw).trim()
    : null;
  if (reqCo && String(reqCo) !== String(forced)) {
    return { ok: false, error: 'Chỉ được xem dữ liệu công ty NextGo.' };
  }
  return { ok: true, companyId: forced };
}

module.exports = {
  getCrmSocialInboxCompanyKey,
  resolveCrmSocialInboxCompanyId,
  resolveNextGoCompanyId,
  assertCrmSocialInboxCompanyAccess,
};

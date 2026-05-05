const { normalizePhoneForLeadCreation } = require('./facebookPhoneExtract');

/**
 * Chuẩn hóa SĐT → chỉ chữ số; trả về { digits, last9 } hoặc null.
 */
function phoneKeysForBlocklist(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const v = normalizePhoneForLeadCreation(String(raw).trim());
  if (!v.ok || !v.normalized) return null;
  const digits = String(v.normalized).replace(/\D/g, '');
  if (digits.length < 9) return null;
  return { digits, last9: digits.slice(-9) };
}

async function isPhoneBlockedForFacebookAutoLead(supabase, rawPhone) {
  const keys = phoneKeysForBlocklist(rawPhone);
  if (!keys) return false;
  const { data, error } = await supabase
    .from('crm_auto_lead_blocked_phones')
    .select('id')
    .eq('phone_last9', keys.last9)
    .limit(1);
  if (error) {
    console.warn('[AutoLeadBlocklist] isPhoneBlocked:', error.message);
    return false;
  }
  return !!(data && data.length);
}

async function addPhoneToAutoLeadBlocklist(supabase, rawPhone, { note, userId, display } = {}) {
  const keys = phoneKeysForBlocklist(rawPhone);
  if (!keys) return { ok: false, error: 'invalid_phone' };
  const row = {
    phone_last9: keys.last9,
    phone_display: display || keys.digits,
    note: note || null,
    created_by: userId || null,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('crm_auto_lead_blocked_phones').upsert(row, {
    onConflict: 'phone_last9',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, last9: keys.last9 };
}

module.exports = {
  phoneKeysForBlocklist,
  isPhoneBlockedForFacebookAutoLead,
  addPhoneToAutoLeadBlocklist,
};

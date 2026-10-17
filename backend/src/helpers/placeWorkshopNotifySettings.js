/**
 * Người nhận thông báo «Đặt xưởng khác», theo công ty sản xuất.
 * Lưu app_settings (không cần cột mới). Giá trị: { [companyId]: userId[] }.
 */
const { supabase } = require('../config/supabase');

const SETTINGS_KEY = 'sx_place_workshop_notify_users';

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
}

async function readPlaceNotifyMap() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    console.warn('[place-workshop-notify] read:', error.message);
    return {};
  }
  const value = data?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

async function loadPlaceNotifyUserIds(companyIds) {
  const want = new Set((companyIds || []).map((id) => String(id || '')).filter(Boolean));
  if (!want.size) return [];
  const map = await readPlaceNotifyMap();
  const out = [];
  for (const [companyId, list] of Object.entries(map)) {
    if (!want.has(String(companyId))) continue;
    out.push(...asIdList(list));
  }
  return [...new Set(out)];
}

async function savePlaceNotifyUserIds(companyId, userIds) {
  const cid = String(companyId || '').trim();
  if (!cid) return { ok: false, error: 'Thiếu công ty' };
  const map = await readPlaceNotifyMap();
  map[cid] = asIdList(userIds);
  const { error } = await supabase.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value: map,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, userIds: map[cid] };
}

module.exports = {
  SETTINGS_KEY,
  loadPlaceNotifyUserIds,
  savePlaceNotifyUserIds,
  readPlaceNotifyMap,
};

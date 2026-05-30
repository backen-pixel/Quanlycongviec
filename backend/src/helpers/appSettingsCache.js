/**
 * L1+L2 cache cho bảng `app_settings` (key/value JSON, slow-changing config).
 *
 * - `getAppSettingValue(key, fallback)`: trả về value JSON (object/array/scalar)
 *   cho 1 key trong app_settings; nếu không tồn tại → trả `fallback`.
 * - `invalidateAppSettingKey(key)`: xoá L1+L2 cho key cụ thể (gọi sau khi PUT).
 *
 * KHÔNG cache phần response chứa token Zalo nhạy cảm — caller tự mask.
 */

const { createTTLCache } = require('./ttlCache');
const { supabase } = require('../config/supabase');

const appSettingsCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 200,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'crm:app:',
});

// Sentinel để phân biệt "không có row" với "value = null".
const __MISSING__ = { __miss__: true };

async function getAppSettingValue(key, fallback) {
  if (!key) return fallback;
  const cached = await appSettingsCache.getOrFetch(`json:${key}`, async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      // không cache lỗi → throw để getOrFetch không lưu
      throw error;
    }
    if (!data) return __MISSING__;
    return data.value;
  });
  if (cached === __MISSING__ || cached === undefined) return fallback;
  return cached;
}

function invalidateAppSettingKey(key) {
  if (!key) {
    appSettingsCache.invalidateRemote(null).catch(() => {});
  } else {
    appSettingsCache.invalidateRemote(`json:${key}`).catch(() => {});
  }
  try {
    const { invalidateTags } = require('../middleware/responseCache');
    void invalidateTags(['settings']);
  } catch { /* ignore */ }
}

module.exports = {
  appSettingsCache,
  getAppSettingValue,
  invalidateAppSettingKey,
};

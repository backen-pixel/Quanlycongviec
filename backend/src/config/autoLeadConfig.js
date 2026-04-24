/**
 * Auto Lead Config — lưu điều kiện tự động tạo lead từ Facebook
 * Lưu vào Supabase (app_settings) thay vì file JSON
 */
const { supabase } = require('./supabase');

const CONFIG_KEY = 'auto_lead_config';

const DEFAULT_CONFIG = {
  trigger: 'first_message',
  message_count_threshold: 1,
  default_customer_name: 'User',
  auto_update_name: true,
  auto_update_phone: true,
  auto_update_address: true,
  auto_reply_first_message: true,
  recreate_deleted_leads: false,
  notify_on_new_lead: true,
  notify_on_phone_found: true,
  /** Lead tạo từ Facebook sẽ thuộc công ty nào (fallback nếu page chưa set default_company_id) */
  default_company_id: null,
  /** Loại Lead mặc định (company-scoped) */
  default_lead_type_id: null,
};

// In-memory cache (tránh query DB mỗi lần webhook đến)
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60000; // 1 phút

async function loadConfig() {
  // Return cache nếu còn fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', CONFIG_KEY).single();
    if (data?.value) {
      _cache = { ...DEFAULT_CONFIG, ...data.value };
      _cacheTime = Date.now();
      return _cache;
    }
  } catch (e) {
    // Table chưa tạo hoặc lỗi → dùng default
    console.warn('[AutoLead] DB load error (using defaults):', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

async function saveConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  try {
    await supabase.from('app_settings').upsert({
      key: CONFIG_KEY,
      value: merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    // Update cache
    _cache = merged;
    _cacheTime = Date.now();
    console.log('[AutoLead] ✅ Config saved to DB');
  } catch (e) {
    console.error('[AutoLead] DB save error:', e.message);
    throw e;
  }
  return merged;
}

// Sync getter (dùng cache, fallback default nếu chưa load)
function getConfig() {
  if (_cache) return _cache;
  // Trigger async load cho lần tiếp theo
  loadConfig().catch(() => {});
  return { ...DEFAULT_CONFIG };
}

module.exports = { getConfig, loadConfig, saveConfig, DEFAULT_CONFIG };

/**
 * Cron: công trình quá hạn → gọi thẳng Zalo Bot sendMessage (không qua n8n).
 *
 * Cấu hình: trang Quản lý /management/project-deadlines
 * (`app_settings.project_deadline_dispatch`).
 *
 * Env fallback: PROJECT_DEADLINE_ZALO_BOT_TOKEN, PROJECT_DEADLINE_ZALO_CHAT_ID
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const { listProjectDeadlineNotifications } = require('../helpers/projectDeadlineExport');
const { getAppSettingValue, invalidateAppSettingKey } = require('../helpers/appSettingsCache');

const SETTING_KEY = 'project_deadline_dispatch';
const ZALO_SEND_PATH = 'https://bot-api.zaloplatforms.com/bot';
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;
const POST_TIMEOUT_MS = 12000;
const MODULES = new Set(['all', 'crm', 'production', 'logistics']);

function parseCompanyIdsEnv() {
  const raw = String(process.env.PROJECT_DEADLINE_COMPANY_IDS || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => String(s).trim()).filter(Boolean);
}

function normalizeModule(raw) {
  const v = String(raw || 'all').toLowerCase();
  return MODULES.has(v) ? v : 'all';
}

function normalizeCompanyIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeChatIds(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/);
  return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
}

function sanitizeBotToken(raw) {
  const t = String(raw || '').trim();
  if (!t || /[/?#\s]/.test(t)) return '';
  return t;
}

function zaloSendUrl(token) {
  const t = sanitizeBotToken(token);
  if (!t) return '';
  return `${ZALO_SEND_PATH}${t}/sendMessage`;
}

function normalizeModules(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const ok = list.map((s) => String(s).trim().toLowerCase()).filter((m) => MODULES.has(m) && m !== 'all');
  return [...new Set(ok)];
}

function newProfileId() {
  return `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeConfig(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const modules = normalizeModules(v.modules || v.module);
  const statusRaw = String(v.status || 'overdue').toLowerCase();
  return {
    enabled: v.enabled !== false,
    company_ids: normalizeCompanyIds(v.company_ids),
    region_ids: normalizeCompanyIds(v.region_ids),
    modules,
    status: ['overdue', 'upcoming', 'all'].includes(statusRaw) ? statusRaw : 'overdue',
    days_ahead: Math.min(Math.max(parseInt(v.days_ahead, 10) || 0, 0), 90),
    zalo_bot_token: sanitizeBotToken(v.zalo_bot_token || v.bot_token),
    zalo_chat_id: String(v.zalo_chat_id || v.chat_id || '').trim(),
    webhook_url: String(v.webhook_url || '').trim(),
    webhook_secret: String(v.webhook_secret || '').trim(),
  };
}

function normalizeProfile(raw, fallbackName = 'Mặc định') {
  const v = raw && typeof raw === 'object' ? raw : {};
  const base = normalizeConfig(v);
  const id = String(v.id || '').trim() || newProfileId();
  const name = String(v.name || fallbackName).trim() || fallbackName;
  const now = new Date().toISOString();
  return {
    id,
    name,
    company_ids: base.company_ids,
    region_ids: base.region_ids,
    modules: base.modules,
    status: base.status,
    days_ahead: base.days_ahead,
    created_at: v.created_at || now,
    updated_at: v.updated_at || now,
  };
}

function publicProfile(p) {
  return {
    id: p.id,
    name: p.name,
    company_ids: p.company_ids || [],
    region_ids: p.region_ids || [],
    modules: p.modules || [],
    status: p.status || 'overdue',
    days_ahead: p.days_ahead ?? 0,
    created_at: p.created_at || null,
    updated_at: p.updated_at || null,
  };
}

function hasLegacyFilterFields(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return (
    Array.isArray(raw.company_ids)
    || Array.isArray(raw.region_ids)
    || Array.isArray(raw.modules)
    || raw.status != null
    || raw.days_ahead != null
  );
}

async function loadStore() {
  const raw = await getAppSettingValue(SETTING_KEY, null);
  const root = raw && typeof raw === 'object' ? raw : {};
  let profiles = [];
  if (Array.isArray(root.profiles) && root.profiles.length) {
    profiles = root.profiles.map((p, i) => normalizeProfile(p, `API ${i + 1}`));
  } else if (hasLegacyFilterFields(root)) {
    profiles = [normalizeProfile({ ...root, id: 'default', name: 'Mặc định' }, 'Mặc định')];
  }
  return {
    profiles,
    zalo_bot_token: sanitizeBotToken(root.zalo_bot_token || root.bot_token),
    zalo_chat_id: String(root.zalo_chat_id || root.chat_id || '').trim(),
    webhook_url: String(root.webhook_url || '').trim(),
    webhook_secret: String(root.webhook_secret || '').trim(),
    enabled: root.enabled !== false,
  };
}

async function saveStore(store) {
  const value = {
    enabled: store.enabled !== false,
    profiles: (store.profiles || []).map((p) => normalizeProfile(p)),
    zalo_bot_token: sanitizeBotToken(store.zalo_bot_token),
    zalo_chat_id: String(store.zalo_chat_id || '').trim(),
    webhook_url: String(store.webhook_url || '').trim(),
    webhook_secret: String(store.webhook_secret || '').trim(),
  };
  const first = value.profiles[0] || null;
  if (first) {
    value.company_ids = first.company_ids;
    value.region_ids = first.region_ids;
    value.modules = first.modules;
    value.status = first.status;
    value.days_ahead = first.days_ahead;
  }
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) throw error;
  invalidateAppSettingKey(SETTING_KEY);
  return value;
}

async function listProfiles() {
  const store = await loadStore();
  return store.profiles.map(publicProfile);
}

async function getProfile(id) {
  const store = await loadStore();
  const pid = String(id || '').trim();
  if (!pid) return store.profiles[0] ? publicProfile(store.profiles[0]) : null;
  const found = store.profiles.find((p) => String(p.id) === pid);
  return found ? publicProfile(found) : null;
}

async function upsertProfile(input = {}, { id = null } = {}) {
  const store = await loadStore();
  const now = new Date().toISOString();
  let existingIdx = id
    ? store.profiles.findIndex((p) => String(p.id) === String(id))
    : -1;
  // Legacy id "default" có thể chỉ tồn tại ảo (chưa ghi profiles) → tạo mới thay vì 404
  if (id && existingIdx < 0) {
    if (String(id) === 'default' || !store.profiles.length) {
      existingIdx = -1;
    } else {
      const err = new Error('Không tìm thấy cấu hình API');
      err.status = 404;
      throw err;
    }
  }
  const prev = existingIdx >= 0 ? store.profiles[existingIdx] : null;
  const next = normalizeProfile({
    ...(prev || {}),
    ...input,
    id: prev?.id || id || newProfileId(),
    name: input.name != null ? input.name : (prev?.name || 'API mới'),
    created_at: prev?.created_at || now,
    updated_at: now,
  });
  if (existingIdx >= 0) store.profiles[existingIdx] = next;
  else store.profiles.push(next);
  await saveStore(store);
  return publicProfile(next);
}

async function deleteProfile(id) {
  const store = await loadStore();
  const pid = String(id || '').trim();
  const next = store.profiles.filter((p) => String(p.id) !== pid);
  if (next.length === store.profiles.length) {
    const err = new Error('Không tìm thấy cấu hình API');
    err.status = 404;
    throw err;
  }
  store.profiles = next;
  await saveStore(store);
  return { ok: true, configs: next.map(publicProfile) };
}

async function loadStoredConfig() {
  const store = await loadStore();
  const first = store.profiles[0] || {};
  return normalizeConfig({
    ...first,
    enabled: store.enabled,
    zalo_bot_token: store.zalo_bot_token,
    zalo_chat_id: store.zalo_chat_id,
    webhook_url: store.webhook_url,
    webhook_secret: store.webhook_secret,
  });
}

async function loadDispatchConfig() {
  const cfg = await loadStoredConfig();
  if (!cfg.zalo_bot_token) {
    cfg.zalo_bot_token = sanitizeBotToken(process.env.PROJECT_DEADLINE_ZALO_BOT_TOKEN);
  }
  if (!cfg.zalo_chat_id) {
    cfg.zalo_chat_id = String(process.env.PROJECT_DEADLINE_ZALO_CHAT_ID || '').trim();
  }
  if (!cfg.company_ids.length) cfg.company_ids = parseCompanyIdsEnv();
  if (process.env.PROJECT_DEADLINE_DISPATCH_DISABLED === '1') cfg.enabled = false;
  return cfg;
}

function publicConfig(cfg) {
  return {
    enabled: cfg.enabled !== false,
    company_ids: cfg.company_ids || [],
    region_ids: cfg.region_ids || [],
    modules: cfg.modules || [],
    status: cfg.status || 'overdue',
    days_ahead: cfg.days_ahead ?? 0,
    interval_minutes: Math.round(Math.max(
      5 * 60 * 1000,
      parseInt(process.env.PROJECT_DEADLINE_DISPATCH_INTERVAL_MS || String(DEFAULT_INTERVAL_MS), 10) || DEFAULT_INTERVAL_MS,
    ) / 60000),
  };
}

async function saveDispatchConfig(partial = {}) {
  const store = await loadStore();
  const now = new Date().toISOString();
  if (!store.profiles.length) {
    store.profiles = [normalizeProfile({ ...partial, name: partial.name || 'Mặc định' }, 'Mặc định')];
  } else {
    const first = store.profiles[0];
    store.profiles[0] = normalizeProfile({
      ...first,
      ...partial,
      id: first.id,
      name: partial.name != null ? partial.name : first.name,
      updated_at: now,
    });
  }
  if (partial.zalo_bot_token !== undefined && partial.zalo_bot_token !== '') {
    store.zalo_bot_token = sanitizeBotToken(partial.zalo_bot_token);
  }
  if (partial.zalo_chat_id !== undefined) store.zalo_chat_id = String(partial.zalo_chat_id || '').trim();
  await saveStore(store);
  return loadStoredConfig();
}

function fingerprintOf(n, configId = '') {
  const pid = n?.project?.id || '';
  const mod = n?.deadline?.module || '';
  const src = n?.deadline?.source || '';
  const at = n?.deadline?.at || '';
  const kind = n?.deadline?.is_overdue ? 'overdue' : 'warning';
  const cfg = configId ? String(configId) : '_';
  return `${cfg}:${pid}:${mod}:${src}:${at}:${kind}`;
}

async function postZaloMessage(url, chatId, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TubepCRM-ProjectDeadline/1.0',
      },
      body: JSON.stringify({
        chat_id: String(chatId),
        parse_mode: 'markdown',
        text: String(text || '').slice(0, 2000),
      }),
      signal: controller.signal,
    });
    const status = res.status;
    const body = await res.text().catch(() => '');
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { /* ignore */ }
    const ok = res.ok && parsed?.ok !== false && parsed?.error == null;
    if (!ok) {
      const err = parsed?.description || parsed?.message || parsed?.error || body.slice(0, 300) || `HTTP ${status}`;
      return { ok: false, status, error: String(err).slice(0, 300) };
    }
    return { ok: true, status };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'timeout' : (e.message || String(e));
    return { ok: false, status: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function loadRecentFingerprints(opts = {}) {
  const sinceMs = opts.sinceMs == null ? DEDUP_WINDOW_MS : opts.sinceMs;
  let q = supabase.from('project_deadline_dispatches').select('fingerprint').limit(8000);
  if (sinceMs > 0) {
    const since = new Date(Date.now() - sinceMs).toISOString();
    q = q.gte('sent_at', since);
  }
  if (opts.configId) {
    q = q.like('fingerprint', `${String(opts.configId)}:%`);
  }
  const { data, error } = await q;
  if (error) {
    if (String(error.message || '').includes('project_deadline_dispatches')) {
      console.warn('[project-deadline-dispatch] Bảng dispatch chưa migrate:', error.message);
      return new Set();
    }
    throw error;
  }
  return new Set((data || []).map((r) => r.fingerprint).filter(Boolean));
}

async function logDispatch(row) {
  const { error } = await supabase.from('project_deadline_dispatches').insert(row);
  if (error) console.warn('[project-deadline-dispatch] log:', error.message);
}

/**
 * Lọc notifications chỉ còn mục chưa gửi; mặc định ghi nhận đã giao (API pull).
 */
async function filterNewNotifications(notifications, opts = {}) {
  const configId = opts.configId ? String(opts.configId) : '';
  const mark = opts.mark !== false;
  const sinceMs = opts.sinceMs == null ? (365 * 24 * 60 * 60 * 1000) : opts.sinceMs;
  const seen = await loadRecentFingerprints({ sinceMs, configId: configId || undefined });
  const fresh = [];
  for (const n of notifications || []) {
    const fp = fingerprintOf(n, configId);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    fresh.push({ n, fp });
  }
  if (mark && fresh.length) {
    await Promise.all(fresh.map(({ n, fp }) => logDispatch({
      project_id: n.project?.id || null,
      module_key: n.deadline?.module || '',
      kind: n.deadline?.is_overdue ? 'overdue' : 'warning',
      fingerprint: fp,
      webhook_url: configId ? `api:pull:${configId}` : 'api:pull',
      http_status: 200,
      error: null,
    })));
  }
  return {
    notifications: fresh.map((x) => x.n),
    count: fresh.length,
    skipped_dup: (notifications || []).length - fresh.length,
    total_matched: (notifications || []).length,
  };
}

/**
 * @param {{
 *   force?: boolean,
 *   companyIds?: string[]|null,
 *   module?: string,
 *   zaloBotToken?: string,
 *   zaloChatId?: string,
 * }} [opts]
 */
async function runOnce(opts = {}) {
  const cfg = await loadDispatchConfig();
  const token = sanitizeBotToken(opts.zaloBotToken || cfg.zalo_bot_token);
  const chatIds = normalizeChatIds(opts.zaloChatId || cfg.zalo_chat_id);
  const url = zaloSendUrl(token);
  if (!url || !chatIds.length) {
    console.warn('[project-deadline-dispatch] Bỏ qua: chưa có Bot Token hoặc Chat ID');
    return { ok: false, skipped: true, reason: 'missing_zalo_bot', sent: 0 };
  }
  if (opts.force !== true && cfg.enabled === false) {
    return { ok: false, skipped: true, reason: 'disabled', sent: 0 };
  }

  const companyIds = opts.companyIds !== undefined
    ? (opts.companyIds && opts.companyIds.length ? opts.companyIds : null)
    : (cfg.company_ids.length ? cfg.company_ids : null);
  const module = opts.module
    || (cfg.modules?.length ? cfg.modules : 'all');
  const regionIds = cfg.region_ids || [];

  const payload = await listProjectDeadlineNotifications({
    companyIds,
    regionIds,
    module,
    status: cfg.status || 'overdue',
    daysAhead: cfg.days_ahead ?? 0,
    limit: 400,
  });
  const items = payload.notifications || [];
  if (!items.length) {
    console.log('[project-deadline-dispatch] Không có công trình quá hạn');
    return { ok: true, sent: 0, skipped_dup: 0, total: 0, module, company_ids: companyIds };
  }

  const seen = opts.force ? new Set() : await loadRecentFingerprints({ sinceMs: DEDUP_WINDOW_MS });
  const fresh = [];
  for (const n of items) {
    const fp = fingerprintOf(n);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    fresh.push({ n, fp });
  }
  if (!fresh.length) {
    console.log(`[project-deadline-dispatch] ${items.length} quá hạn, đã gửi gần đây — bỏ qua`);
    return { ok: true, sent: 0, skipped_dup: items.length, total: items.length, module };
  }

  let sent = 0;
  let failed = 0;
  for (const { n, fp } of fresh) {
    const text = n.text || n.message || n.title || '';
    let itemOk = true;
    let lastRes = { ok: true, status: 200 };
    for (const chatId of chatIds) {
      const res = await postZaloMessage(url, chatId, text);
      lastRes = res;
      if (!res.ok) {
        itemOk = false;
        break;
      }
    }
    await logDispatch({
      project_id: n.project?.id,
      module_key: n.deadline?.module || '',
      kind: 'overdue',
      fingerprint: fp,
      webhook_url: 'zalo:sendMessage',
      http_status: lastRes.status,
      error: itemOk ? null : (lastRes.error || null),
    });
    if (itemOk) sent += 1;
    else failed += 1;
  }

  console.log(`[project-deadline-dispatch] Gửi Zalo ${sent}/${fresh.length} (dup ${items.length - fresh.length}, lỗi ${failed})`);
  return {
    ok: failed === 0,
    sent,
    failed,
    skipped_dup: items.length - fresh.length,
    total: items.length,
    chat_ids: chatIds,
    module,
    company_ids: companyIds,
  };
}

function start() {
  if (process.env.PROJECT_DEADLINE_DISPATCH_DISABLED === '1') {
    console.log('[project-deadline-dispatch] Disabled (env)');
    return;
  }
  const intervalMs = Math.max(
    5 * 60 * 1000,
    parseInt(process.env.PROJECT_DEADLINE_DISPATCH_INTERVAL_MS || String(DEFAULT_INTERVAL_MS), 10) || DEFAULT_INTERVAL_MS,
  );
  const ttlSec = Math.max(120, Math.round(intervalMs / 1000) - 30);
  setTimeout(() => { void runIfLeader('project-deadline-dispatch', () => runOnce(), { ttlSec }); }, 90 * 1000);
  setInterval(() => { void runIfLeader('project-deadline-dispatch', () => runOnce(), { ttlSec }); }, intervalMs);
  console.log(`[project-deadline-dispatch] Started — mỗi ${Math.round(intervalMs / 60000)} phút → Zalo Bot`);
}

module.exports = {
  start,
  runOnce,
  loadDispatchConfig,
  loadStoredConfig,
  saveDispatchConfig,
  publicConfig,
  listProfiles,
  getProfile,
  upsertProfile,
  deleteProfile,
  publicProfile,
  fingerprintOf,
  filterNewNotifications,
  normalizeCompanyIds,
  normalizeModule,
  normalizeModules,
};

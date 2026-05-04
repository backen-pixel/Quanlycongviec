const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const r = express.Router();
const { supabase } = require('../config/supabase');
const axios = require('axios');
const {
  activityTimestampMs,
  sortFacebookContactsNewestFirst,
  enrichContactActivityFields,
} = require('../helpers/facebookContactActivity');
const {
  extractContactInfo,
  extractInboundContactInfo,
  normalizePhoneForLeadCreation,
  validateVnSubscriberPhoneStored,
  analyzeStoredPhoneIssue,
} = require('../helpers/facebookPhoneExtract');
const { deleteLeadIfAllowedForRescan, deleteOrphanCustomerIfAllowed } = require('../helpers/facebookLeadDeleteWhenNoPhone');
const { reconcileInboundPhoneAfterScan, phonesEqualDigits } = require('../helpers/facebookInboundPhoneReconcile');
const {
  loadConfig: loadAutoLeadConfig,
  saveConfig: saveAutoLeadConfig,
  DEFAULT_CONFIG: AUTO_LEAD_DEFAULTS,
} = require('../config/autoLeadConfig');

// Disable DB logging to facebook_webhook_logs to reduce Supabase egress.
// Set FB_DISABLE_WEBHOOK_LOGS=1 (or true/yes/on) in env to enable.
const FB_DISABLE_WEBHOOK_LOGS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.FB_DISABLE_WEBHOOK_LOGS || '').toLowerCase(),
);

// Sau reboot, auto pipeline không tự chạy lại (mặc định tắt).
// Đặt FB_AUTO_PIPELINE_RESUME_ON_BOOT=1 để tiếp tục chạy nếu DB đang lưu bật.
const FB_AUTO_PIPELINE_RESUME_ON_BOOT = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.FB_AUTO_PIPELINE_RESUME_ON_BOOT || '').toLowerCase(),
);

// ═══════════════════════════════════════════════════════════════
// AUTO PIPELINE STATE (backend-managed, realtime)
// ═══════════════════════════════════════════════════════════════
/** Số contact xử lý mỗi lần gọi batch (50–500). Giảm nếu Graph hay 429. */
const AUTO_BATCH_SIZE = Math.min(500, Math.max(50, parseInt(process.env.FB_AUTO_BATCH_SIZE || '300', 10) || 300));
const AUTO_SYNC_TIMEOUT_SEC = Math.min(300, Math.max(30, parseInt(process.env.FB_AUTO_SYNC_TIMEOUT_SEC || '90', 10) || 90));
/** Pool tối đa khi load contact cho pipeline (mặc định 2000; tăng ENV FB_PIPELINE_POOL_LIMIT nếu cần quét sâu). */
const FB_PIPELINE_POOL_LIMIT = Math.min(50_000, Math.max(500, parseInt(process.env.FB_PIPELINE_POOL_LIMIT || '2000', 10) || 2_000));
/** Ưu tiên contact chưa có lead (mặc định 500; ENV: FB_PIPELINE_NEEDY_NO_LEAD_CAP). */
const FB_PIPELINE_NEEDY_NO_LEAD_CAP = Math.min(5_000, Math.max(0, parseInt(process.env.FB_PIPELINE_NEEDY_NO_LEAD_CAP || '500', 10) || 500));
/**
 * Batch đồng bộ: số trang Graph/contact (mỗi trang ~100 tin). Mặc định 3 → nhẹ; tăng ENV FB_SYNC_BATCH_GRAPH_MAX_PAGES khi cần kéo sâu hơn.
 * Đồng bộ 1 contact tay vẫn dùng FB_SYNC_SINGLE_MAX_PAGES (25).
 */
const FB_SYNC_BATCH_GRAPH_MAX_PAGES = Math.min(25, Math.max(1, parseInt(process.env.FB_SYNC_BATCH_GRAPH_MAX_PAGES || '3', 10) || 3));
/**
 * Một ngưỡng giờ cho cả (1) pool “còn hoạt động” và (2) lọc “KH không liên lạc”.
 * Pool “còn hoạt động” + lọc “KH không liên lạc” dùng chung N giờ (đổi giá trị ở đây).
 */
const AUTO_PIPELINE_RECENT_HOURS = 48;
const STALE_NO_CUSTOMER_REPLY_MS = AUTO_PIPELINE_RECENT_HOURS * 60 * 60 * 1000;

/** Graph: lấy nhiều trang tin (mặc định FB chỉ trả ~100/trang). SĐT nằm trong text ở tin cũ vẫn cần kéo đủ. */
const FB_GRAPH_MESSAGES_FIELDS = 'message,from,created_time,attachments';

/** GET /facebook/analytics — mặc định 500 dòng/trang; ENV: FB_ANALYTICS_PAGE_SIZE (500–2000). */
const FB_ANALYTICS_PAGE_SIZE = Math.min(
  2000,
  Math.max(200, parseInt(process.env.FB_ANALYTICS_PAGE_SIZE || '500', 10) || 500),
);
const FB_ANALYTICS_CONTACT_IN_BATCH = Math.min(
  200,
  Math.max(50, parseInt(process.env.FB_ANALYTICS_CONTACT_IN_BATCH || '150', 10) || 150),
);

async function fetchAllAnalyticsContacts({ page_id }) {
  const contacts = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from('facebook_contacts')
      .select('id, phone, lead_id, page_id, created_at')
      .order('id', { ascending: true });
    if (page_id) q = q.eq('page_id', page_id);
    const { data, error } = await q.range(from, from + FB_ANALYTICS_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    contacts.push(...chunk);
    if (chunk.length < FB_ANALYTICS_PAGE_SIZE) break;
    from += FB_ANALYTICS_PAGE_SIZE;
  }
  return contacts;
}

/** Mọi tin trong khoảng thời gian (không lọc page). */
async function fetchAllAnalyticsMessagesSince(sinceIso) {
  const messages = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('facebook_messages')
      .select('id, direction, created_at, contact_id')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + FB_ANALYTICS_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    messages.push(...chunk);
    if (chunk.length < FB_ANALYTICS_PAGE_SIZE) break;
    from += FB_ANALYTICS_PAGE_SIZE;
  }
  return messages;
}

/** Tin theo danh sách contact (lọc Page) — batch .in() + phân trang từng batch. */
async function fetchAllAnalyticsMessagesForContactIds(contactIds, sinceIso) {
  if (!contactIds.length) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < contactIds.length; i += FB_ANALYTICS_CONTACT_IN_BATCH) {
    const batch = contactIds.slice(i, i + FB_ANALYTICS_CONTACT_IN_BATCH);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('facebook_messages')
        .select('id, direction, created_at, contact_id')
        .in('contact_id', batch)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + FB_ANALYTICS_PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = data || [];
      for (const m of chunk) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
      if (chunk.length < FB_ANALYTICS_PAGE_SIZE) break;
      from += FB_ANALYTICS_PAGE_SIZE;
    }
  }
  return out;
}
const FB_SYNC_SINGLE_MAX_PAGES = 25; // đồng bộ 1 contact (bấm tay): tới ~2500 tin

async function graphFetchConversationMessages(convId, token, { maxPages = 5, limitPerPage = 100 } = {}) {
  const out = [];
  let url = `https://graph.facebook.com/v22.0/${convId}/messages?fields=${encodeURIComponent(FB_GRAPH_MESSAGES_FIELDS)}&limit=${limitPerPage}`;
  let page = 0;
  while (url && page < maxPages) {
    const msgResp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const msgData = await msgResp.json();
    page += 1;
    if (msgData.error) {
      console.warn('[FB] graphFetchConversationMessages:', msgData.error?.message || JSON.stringify(msgData.error));
      break;
    }
    if (!msgData.data?.length) break;
    out.push(...msgData.data);
    url = msgData.paging?.next || null;
  }
  return out;
}

/**
 * Meta: GET /{page-id}/conversations?user_id=PSID (Page token). Một số app chỉ trả thread khi có platform=messenger;
 * fallback me/conversations khi dùng đúng page token.
 * @returns {{ convId: string|null, lastError?: object }}
 */
async function graphResolveConversationIdForPsid(pageId, psid, token) {
  if (!pageId || !psid || !token) {
    return { convId: null, lastError: { message: 'missing_page_psid_or_token' } };
  }
  const uid = encodeURIComponent(String(psid).trim());
  const pid = encodeURIComponent(String(pageId).trim());
  const headers = { Authorization: `Bearer ${token}` };
  const urls = [
    `https://graph.facebook.com/v22.0/${pid}/conversations?user_id=${uid}&platform=messenger`,
    `https://graph.facebook.com/v22.0/${pid}/conversations?user_id=${uid}`,
    `https://graph.facebook.com/v22.0/me/conversations?user_id=${uid}`,
  ];
  let lastError = null;
  for (const url of urls) {
    const convResp = await fetch(url, { headers });
    const convData = await convResp.json();
    if (convData.error) {
      lastError = convData.error;
      continue;
    }
    const id = convData.data?.[0]?.id;
    if (id) return { convId: id };
    lastError = { message: 'empty_conversations_data', type: 'GraphEmptyData' };
  }
  return { convId: null, lastError: lastError || { message: 'no_conversation' } };
}

async function fetchLastInboundAtByContactIds(contactIds) {
  if (!contactIds?.length) return new Map();
  const map = new Map();
  const CHUNK = 600;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('fb_last_inbound_at_for_contacts', { contact_ids: chunk });
    if (error) {
      console.warn('[FB] RPC fb_last_inbound_at_for_contacts:', error.message, '(chạy database/50_fb_last_inbound_rpc.sql)');
      return null;
    }
    (data || []).forEach((row) => {
      if (row.contact_id && row.last_inbound_at) {
        map.set(row.contact_id, new Date(row.last_inbound_at).getTime());
      }
    });
  }
  return map;
}

/**
 * Giữ contact còn “nóng”: có inbound KH trong vòng STALE, hoặc chưa có inbound trong DB thì xét last_message_at.
 * Loại thread không liên lạc quá ngưỡng (ưu tiên thời điểm KH nhắn; không có inbound thì dùng mọi hoạt động trên contact).
 */
function filterContactsStaleCustomerNoReply(contacts, inboundMap, now = Date.now()) {
  if (!inboundMap) return { contacts, excluded: 0 };
  const cutoff = now - STALE_NO_CUSTOMER_REPLY_MS;
  const hours = STALE_NO_CUSTOMER_REPLY_MS / 3600000;
  let excluded = 0;
  const out = contacts.filter((c) => {
    const inboundT = inboundMap.get(c.id);
    const lastMsgT = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
    const lastActivity = inboundT !== undefined ? inboundT : lastMsgT;
    if (!lastActivity) return true;
    if (lastActivity >= cutoff) return true;
    excluded += 1;
    return false;
  });
  if (excluded > 0) console.log(`[FB] Loại ${excluded} contact: không liên lạc > ${hours}h`);
  return { contacts: out, excluded };
}

function filterContactsRecentHours(contacts, recentHours) {
  if (!recentHours || recentHours <= 0) return contacts || [];
  const cutoff = Date.now() - recentHours * 3600000;
  const out = (contacts || []).filter((c) => {
    if (!c.lead_id) return true;
    return activityTimestampMs(c) >= cutoff;
  });
  if ((contacts || []).length && out.length < contacts.length) {
    console.log(`[FB] recent_hours=${recentHours}: ${contacts.length} → ${out.length} contacts (giữ hết chưa có lead; còn lại theo hoạt động)`);
  }
  return out;
}

/**
 * Pool: ưu tiên contact chưa có lead (tránh bỏ sót khi ~hàng nghìn user/tháng),
 * bù thêm contact “nóng” theo last_message_at tới FB_PIPELINE_POOL_LIMIT.
 * Lọc recentHours: contact chưa có lead luôn giữ (xem filterContactsRecentHours).
 */
async function loadFacebookContactsForBatchPipeline({ recentHours = 0, applyStaleFilter = false } = {}) {
  const pool = FB_PIPELINE_POOL_LIMIT;
  const needyCap = FB_PIPELINE_NEEDY_NO_LEAD_CAP;

  const { data: needyRaw } = needyCap > 0
    ? await supabase.from('facebook_contacts')
      .select('id, psid, page_id, fb_name, lead_id, phone, last_message_at, last_synced_at, created_at')
      .not('psid', 'is', null)
      .is('lead_id', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(needyCap)
    : { data: [] };

  const { data: raw } = await supabase.from('facebook_contacts')
    .select('id, psid, page_id, fb_name, lead_id, phone, last_message_at, last_synced_at, created_at')
    .not('psid', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(pool);

  const needySorted = sortFacebookContactsNewestFirst(needyRaw || []);
  const needyFront = needySorted.slice(0, needyCap);
  const needyIds = new Set(needyFront.map((c) => c.id));
  const rest = (raw || []).filter((c) => !needyIds.has(c.id));
  const restSorted = sortFacebookContactsNewestFirst(rest);
  const slots = Math.max(0, pool - needyFront.length);
  let list = [...needyFront, ...restSorted.slice(0, slots)];

  const rawFetched = (raw || []).length;
  list = filterContactsRecentHours(list, recentHours);
  let excludedStaleNoContact = 0;
  if (applyStaleFilter && list.length) {
    const noLead = list.filter((c) => !c.lead_id);
    const withLead = list.filter((c) => c.lead_id);
    const inboundMap = await fetchLastInboundAtByContactIds(withLead.map((c) => c.id));
    if (inboundMap) {
      const fr = filterContactsStaleCustomerNoReply(withLead, inboundMap);
      excludedStaleNoContact = fr.excluded;
      list = sortFacebookContactsNewestFirst([...noLead, ...fr.contacts]);
    }
  }
  list = sortFacebookContactsNewestFirst(list);
  return { contacts: list, excludedStaleNoContact, rawFetched };
}

const DEFAULT_FB_PIPELINE_CONFIG = {
  /**
   * full_cycle (mặc định): lô batch-sync-messages + batch-extract-phones (như nút tay) → Tạo Lead → Refresh → Xóa trùng → sync-contact-phones → nghỉ (mặc định 5p) rồi lặp.
   * chain: Sync→Quét từng user (runSyncThenExtractPhonesJob). legacy: chỉ lô đồng bộ + quét, không CRM sau.
   *
   * full_cycle_rescan_phones: khi true, sau khi kéo tin gửi force_rescan_phones vào batch-extract → quét inbound đủ contact trong lô,
   * cập nhật/ghi đè SĐT contact & customer giống luồng "Quét lại SĐT" (không bỏ qua lead đã có SĐT).
   */
  engine: 'full_cycle',
  /** Bật = quét SĐT inbound đầy đủ + cho phép ghi đè sau khi đồng bộ tin (full_cycle / legacy). */
  full_cycle_rescan_phones: true,
  /**
   * Sau pipeline v2 (chỉ contact chưa lead): thêm vài lô Sync→Quét trên pool danh bạ (gồm đã lead) để kéo tin Graph.
   * Số lô tối đa mỗi vòng auto (mỗi lô ≤ chain_chunk_users contact).
   */
  full_cycle_pool_sync_rounds: 12,
  /** Tối đa số user mới nhất (đồng bộ+quét) mỗi vòng trước Tạo Lead… Pool đã sort mới→cũ. 0 = không giới hạn (hết pool). */
  full_cycle_max_users_per_round: 50,
  /**
   * Full-cycle: số trang Graph/contact khi batch sync (mỗi trang ~100 tin).
   * Tăng để kéo sâu lịch sử (SĐT thường nằm tin cũ).
   */
  full_cycle_graph_pages_per_contact: 10,
  /** Retry deep-sync (giới hạn) khi synced=0 & contact chưa có phone. */
  full_cycle_deep_retry_cap: 20,
  full_cycle_deep_retry_pages: 15,
  chain_chunk_users: 50,
  /** newest_first | oldest_first */
  chain_sort: 'newest_first',
  /** 0 = không lọc theo giờ (cả pool). >0 = giờ hoạt động gần đây. */
  chain_recent_hours: 48,
  chain_skip_stale: false,
  chain_graph_pages: 15,
  chain_final_lead_sync: true,
  chain_run_graph_sync: true,
  chain_run_extract: true,
  /** Nghỉ giữa mỗi vòng Auto (giây). 0 = lặp liền (không chờ). */
  auto_loop_pause_sec: 0,
};

let fbPipelineConfigCache = { ...DEFAULT_FB_PIPELINE_CONFIG };

async function loadFbPipelineConfigFromDb() {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'fb_auto_pipeline_config').maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      fbPipelineConfigCache = { ...DEFAULT_FB_PIPELINE_CONFIG, ...data.value };
      // Back-compat: engine "legacy" cũ KHÔNG chạy CRM steps → tự ép sang full_cycle để tạo Lead.
      if (fbPipelineConfigCache.engine === 'legacy' || !fbPipelineConfigCache.engine) {
        console.log('[FB pipeline config] migrate engine "legacy" → "full_cycle" (legacy không tạo Lead)');
        fbPipelineConfigCache.engine = 'full_cycle';
      }
    }
  } catch (e) {
    console.warn('[FB pipeline config] load:', e.message);
  }
  return fbPipelineConfigCache;
}

function getFbPipelineConfigSync() {
  return { ...fbPipelineConfigCache };
}

// ── Persist auto-pipeline enabled flag (resume sau reboot chỉ khi FB_AUTO_PIPELINE_RESUME_ON_BOOT) ──
async function loadAutoPipelineEnabledFromDb() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'fb_auto_pipeline_enabled').maybeSingle();
    return !!(data?.value?.enabled);
  } catch (e) {
    console.warn('[AutoPipeline] load enabled flag:', e.message);
    return false;
  }
}

async function saveAutoPipelineEnabledToDb(enabled) {
  try {
    await supabase.from('app_settings').upsert({
      key: 'fb_auto_pipeline_enabled',
      value: { enabled: !!enabled },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (e) {
    console.warn('[AutoPipeline] save enabled flag:', e.message);
  }
}

const autoPipeline = {
  enabled: false,
  running: false,
  stopRequested: false,
  phase: 'idle',
  step: -1,
  totalSteps: 2,
  stepLabel: null,
  /** Nếu đang nghỉ giữa chu kỳ: timestamp ms (Date.now()+pauseMs); null nếu không nghỉ. */
  pauseUntilMs: null,
  cycleCount: 0,
  batchIndex: 0,
  totalBatches: 0,
  totalContacts: 0,
  batchOffset: 0,
  lastUpdatedAt: null,
  logs: [],
  // Per-batch results + accumulated KPIs
  batchResults: [],
  kpi: { messagesSynced: 0, contactsProcessed: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, errors: 0 },
  startedAt: null,
  /** full_cycle: offset cho lô pool sync→quét (xoay vòng khi hết pool). */
  fullCycleSyncExtractOffset: 0,
};

function pushAutoLog(text, status = 'info') {
  autoPipeline.logs = [...autoPipeline.logs.slice(-199), { text, status, ts: Date.now() }];
  autoPipeline.lastUpdatedAt = new Date().toISOString();
  emitAutoState();
}

function getAutoState() {
  const pauseUntilMs = typeof autoPipeline.pauseUntilMs === 'number' ? autoPipeline.pauseUntilMs : null;
  const pauseRemainingMs = pauseUntilMs ? Math.max(0, pauseUntilMs - Date.now()) : 0;
  return {
    enabled: autoPipeline.enabled,
    running: autoPipeline.running,
    phase: autoPipeline.phase,
    step: autoPipeline.step,
    totalSteps: autoPipeline.totalSteps,
    stepLabel: autoPipeline.stepLabel,
    pauseUntilMs,
    pauseRemainingMs,
    cycleCount: autoPipeline.cycleCount,
    batchIndex: autoPipeline.batchIndex,
    totalBatches: autoPipeline.totalBatches,
    totalContacts: autoPipeline.totalContacts,
    batchOffset: autoPipeline.batchOffset,
    lastUpdatedAt: autoPipeline.lastUpdatedAt,
    logs: autoPipeline.logs,
    batchResults: autoPipeline.batchResults,
    kpi: autoPipeline.kpi,
    startedAt: autoPipeline.startedAt,
    pipelineConfig: getFbPipelineConfigSync(),
  };
}

function emitAutoState() {
  if (r._ioRef) r._ioRef.emit('auto_pipeline_state', getAutoState());
}

function getInternalAutoHeaders() {
  const token = jwt.sign({ userId: 'auto-pipeline', role: 'system', fullName: 'Auto Pipeline' }, config.jwtSecret, { expiresIn: '1h' });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-auto-pipeline-internal': '1',
  };
}

/** Giới hạn dòng chi tiết gửi qua socket (mỗi batch). */
const AUTO_PIPELINE_SCAN_DETAILS_CAP = 120;

function compactSyncExtractStepsForAuto(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, AUTO_PIPELINE_SCAN_DETAILS_CAP).map((s) => ({
    contact_id: s.contact_id,
    name: s.name || '',
    synced: s.synced,
    sync_status: s.sync_status,
    extract: s.extract,
    phone: s.phone || null,
  }));
}

function compactExtractPhoneResultsForAuto(results) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, AUTO_PIPELINE_SCAN_DETAILS_CAP).map((r) => ({
    name: r.contact,
    contact_id: r.contact_id || null,
    phone: r.phone || null,
    address: r.address || null,
    extract: r.status,
    extraPhones: r.extraPhones,
  }));
}

/** Gọi API Facebook nội bộ (auto pipeline), JSON body. */
/** Nghỉ giữa các vòng auto (giây → ms). 0 = không nghỉ. */
function getAutoLoopPauseMsFromConfig(pcfg) {
  const raw = pcfg?.auto_loop_pause_sec;
  if (raw == null || raw === '') return 0;
  const sec = Math.min(3600, Math.max(0, parseInt(raw, 10) || 0));
  return sec * 1000;
}

async function autoPipelineInternalPostJson(apiPath, body = {}) {
  const url = `http://127.0.0.1:${config.port}/api${apiPath}`;
  const init = {
    method: 'POST',
    headers: getInternalAutoHeaders(),
    body: JSON.stringify(body),
  };
  let resp;
  const attempts = 4;
  const baseMs = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      resp = await fetch(url, init);
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      const retryable = msg.includes('fetch failed') || msg.includes('ECONNREFUSED');
      if (!retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

/**
 * Pipeline v2: contact chưa có lead, không sync_paused — không lọc pool 48h/stale Graph RPC.
 */
async function loadContactsForPipelineV2(limit) {
  await ensureSyncPausedColumnDetected();
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const cols = hasSyncPausedColumnSync()
    ? 'id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at, sync_paused'
    : 'id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at';
  let q = supabase.from('facebook_contacts').select(cols).is('lead_id', null).not('psid', 'is', null);
  if (hasSyncPausedColumnSync()) q = q.neq('sync_paused', true);
  const { data, error } = await q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) console.error('[PipelineV2] load contacts:', error.message);
  return sortFacebookContactsNewestFirst(data || []);
}

/** Contact đã có lead — dùng bước dọn SĐT khi không quét được inbound mới. */
async function loadContactsWithLeadForCleanup(limit) {
  await ensureSyncPausedColumnDetected();
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const cols = hasSyncPausedColumnSync()
    ? 'id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at, sync_paused'
    : 'id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at';
  let q = supabase.from('facebook_contacts').select(cols).not('lead_id', 'is', null).not('psid', 'is', null);
  if (hasSyncPausedColumnSync()) q = q.neq('sync_paused', true);
  const { data, error } = await q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) console.error('[PipelineV2] load contacts (có lead):', error.message);
  return sortFacebookContactsNewestFirst(data || []);
}

/**
 * Một vòng: từng contact — Graph sync → quét inbound DB → tạo lead (theo auto_lead_config).
 * Không gọi HTTP nội bộ batch-sync / batch-extract.
 *
 * @param {{ clearPhoneWhenNoNewInbound?: boolean, deleteLeadWhenNoPhoneAfterClear?: boolean, cleanupContactsWithLead?: boolean, cleanupLimit?: number }} [opts]
 */
async function runPipelineV2OnePass({
  limit = 100,
  graphPages = 10,
  io = null,
  clearPhoneWhenNoNewInbound = false,
  deleteLeadWhenNoPhoneAfterClear = false,
  cleanupContactsWithLead = false,
  cleanupLimit = 0,
} = {}) {
  const autoLeadCfg = await loadAutoLeadConfig();
  const triggerMode = String(autoLeadCfg?.trigger || 'first_message');
  /** manual = vẫn đồng bộ tin + quét SĐT; không tự tạo lead hàng loạt */
  const skipAutoLeadCreation = triggerMode === 'manual';

  const contacts = await loadContactsForPipelineV2(limit);
  if (!contacts.length) {
    return {
      ok: true,
      processed: 0,
      messagesSynced: 0,
      extractUpdated: 0,
      leadsCreated: 0,
      details: [],
      message: 'Không có contact chưa lead (hoặc đều sync_paused)',
    };
  }

  const pageTokens = {};
  let messagesSynced = 0;
  let extractUpdated = 0;
  let leadsCreated = 0;
  let phonesClearedNoInbound = 0;
  let leadsDeletedAfterClear = 0;
  const details = [];

  if (io) io.emit('batch_progress', { type: 'pipeline_v2', phase: 'start', total: contacts.length, current: 0 });

  for (let i = 0; i < contacts.length; i++) {
    if (autoPipeline.running && autoPipeline.stopRequested) break;
    const contact = contacts[i];
    const row = { contact_id: contact.id, name: contact.fb_name };

    const syncRes = await graphSyncMessagesForContactRow(contact, pageTokens, { maxGraphPages: graphPages });
    messagesSynced += syncRes.synced || 0;
    row.synced = syncRes.synced;
    row.sync_status = syncRes.status;
    if (syncRes.graph_error) row.graph_error = syncRes.graph_error;

    const ex = await applyExtractFromDbMessagesForContact(contact, { forceRescanPhones: true });
    if (ex.outcome === 'updated') extractUpdated += 1;
    row.extract = ex.outcome;

    if (clearPhoneWhenNoNewInbound) {
      const rec = await reconcileInboundPhoneAfterScan(supabase, contact.id, {
        deleteLeadIfNoPhone: false,
      });
      row.reconcile = rec.action;
      if (rec.action === 'cleared_stored_phone_only' || rec.action === 'cleared_phone_and_deleted_lead') {
        phonesClearedNoInbound += 1;
      }
    }

    const { data: fresh } = await supabase
      .from('facebook_contacts')
      .select('id, fb_name, phone, lead_id, page_id, customer_id')
      .eq('id', contact.id)
      .single();

    const phone = fresh?.phone && String(fresh.phone).trim() ? String(fresh.phone).trim() : null;
    row.phone_after = phone;

    if (!fresh?.lead_id) {
      if (skipAutoLeadCreation) {
        row.lead_status = 'manual_skip_auto_lead';
      } else {
        const shouldCreate = triggerMode === 'has_phone' ? !!phone : true;
        if (shouldCreate) {
          const lead = await createLeadFromFacebook(fresh.page_id, fresh, 'Pipeline v2', {
            full_name: fresh.fb_name,
            phone: phone || undefined,
          });
          if (lead?.id) {
            leadsCreated += 1;
            row.lead = lead.code || lead.id;
          } else {
            row.lead_status = 'not_created';
          }
        } else {
          row.lead_status = 'waiting_phone';
        }
      }
    } else {
      row.lead_status = 'already_linked';
    }
    details.push(row);

    if (io) {
      io.emit('batch_progress', {
        type: 'pipeline_v2',
        phase: 'run',
        current: i + 1,
        total: contacts.length,
        name: contact.fb_name,
        synced: row.synced,
      });
    }
  }

  let cleanupProcessed = 0;
  const cleanupDetails = [];
  if (cleanupContactsWithLead && clearPhoneWhenNoNewInbound) {
    const limClean = cleanupLimit > 0 ? cleanupLimit : limit;
    const withLead = await loadContactsWithLeadForCleanup(limClean);
    if (io) io.emit('batch_progress', { type: 'pipeline_v2', phase: 'cleanup_lead', total: withLead.length, current: 0 });
    for (let j = 0; j < withLead.length; j++) {
      if (autoPipeline.running && autoPipeline.stopRequested) break;
      const c = withLead[j];
      const crow = { contact_id: c.id, name: c.fb_name, phase: 'cleanup_with_lead' };
      const s2 = await graphSyncMessagesForContactRow(c, pageTokens, { maxGraphPages: graphPages });
      messagesSynced += s2.synced || 0;
      crow.synced = s2.synced;
      crow.sync_status = s2.status;
      if (s2.graph_error) crow.graph_error = s2.graph_error;
      await applyExtractFromDbMessagesForContact(c, { forceRescanPhones: true });
      const rec = await reconcileInboundPhoneAfterScan(supabase, c.id, {
        deleteLeadIfNoPhone: deleteLeadWhenNoPhoneAfterClear,
      });
      crow.reconcile = rec.action;
      if (rec.action === 'cleared_stored_phone_only' || rec.action === 'cleared_phone_and_deleted_lead') {
        phonesClearedNoInbound += 1;
      }
      if (rec.lead_delete?.ok) leadsDeletedAfterClear += 1;
      cleanupProcessed += 1;
      cleanupDetails.push(crow);
      if (io) {
        io.emit('batch_progress', {
          type: 'pipeline_v2',
          phase: 'cleanup_lead',
          current: j + 1,
          total: withLead.length,
          name: c.fb_name,
        });
      }
    }
  }

  if (io) {
    io.emit('batch_done', {
      type: 'pipeline_v2',
      processed: contacts.length,
      messagesSynced,
      extractUpdated,
      leadsCreated,
      phonesClearedNoInbound,
      leadsDeletedAfterClear,
      cleanupProcessed,
    });
  }

  const summary = {
    ok: true,
    processed: contacts.length,
    messagesSynced,
    extractUpdated,
    leadsCreated,
    phonesClearedNoInbound,
    leadsDeletedAfterClear,
    cleanup_processed: cleanupProcessed,
    details: details.slice(0, 200),
    cleanup_details: cleanupDetails.slice(0, 120),
  };
  if (skipAutoLeadCreation && contacts.length) {
    summary.message = 'Trigger manual: vẫn đồng bộ tin & quét SĐT; không tự tạo lead hàng loạt.';
  }
  return summary;
}

async function runAutoPipelineLoop() {
  if (autoPipeline.running) return;
  autoPipeline.running = true;
  autoPipeline.stopRequested = false;
  autoPipeline.phase = 'loop';
  autoPipeline.lastUpdatedAt = new Date().toISOString();
  autoPipeline.startedAt = new Date().toISOString();
  autoPipeline.batchResults = [];
  autoPipeline.kpi = { messagesSynced: 0, contactsProcessed: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, errors: 0 };
  await loadFbPipelineConfigFromDb();
  const pcfgBoot = getFbPipelineConfigSync();
  const bootPauseSec = Math.round(getAutoLoopPauseMsFromConfig(pcfgBoot) / 1000);
  if (pcfgBoot.engine === 'full_cycle') {
    const bootCap = Math.min(500_000, Math.max(0, parseInt(pcfgBoot.full_cycle_max_users_per_round, 10) || 0));
    const capLabel = bootCap > 0 ? `tối đa ${bootCap} contact/vòng` : 'mặc định 150 contact/vòng';
    pushAutoLog(
      `🚀 Auto — Pipeline v2 (chưa lead) + pool Sync→Quét (gồm đã lead, nếu bật rescan) • ${capLabel} → Refresh → Dedup → Sync SĐT • nghỉ ${bootPauseSec}s/vòng`,
    );
  } else if (pcfgBoot.engine === 'chain') {
    pushAutoLog(
      `🚀 Auto pipeline (chuỗi như danh bạ): ≤${pcfgBoot.chain_chunk_users} user/lần • pool ${pcfgBoot.chain_recent_hours === 0 ? 'full' : `${pcfgBoot.chain_recent_hours}h`} • sort=${pcfgBoot.chain_sort} • Graph ${pcfgBoot.chain_graph_pages} trang • ${bootPauseSec > 0 ? `nghỉ ${bootPauseSec}s/chu kỳ` : 'lặp liền (không nghỉ)'}`,
    );
  } else {
    pushAutoLog(
      `🚀 Auto pipeline (legacy): pool≤${FB_PIPELINE_POOL_LIMIT} (ưu tiên chưa lead≤${FB_PIPELINE_NEEDY_NO_LEAD_CAP}) • ${AUTO_PIPELINE_RECENT_HOURS}h • batch=${AUTO_BATCH_SIZE} • Graph ${FB_SYNC_BATCH_GRAPH_MAX_PAGES} trang/contact • ${bootPauseSec > 0 ? `nghỉ chu kỳ ${bootPauseSec}s` : 'lặp liền'}`,
    );
  }

  while (autoPipeline.enabled && !autoPipeline.stopRequested) {
    await loadFbPipelineConfigFromDb();
    const pcfg = getFbPipelineConfigSync();
    autoPipeline.cycleCount += 1;
    autoPipeline.batchOffset = 0;
    autoPipeline.batchIndex = 0;
    autoPipeline.totalBatches = 0;
    autoPipeline.totalContacts = 0;
    autoPipeline.phase = 'loop';
    if (pcfg.engine === 'full_cycle') {
      pushAutoLog(`🔄 Vòng ${autoPipeline.cycleCount} — Pipeline v2 (sync→quét→lead / contact) → Refresh → Xóa trùng → Sync SĐT danh bạ→Lead`);
    } else if (pcfg.engine === 'chain') {
      pushAutoLog(`🔄 Chu kỳ ${autoPipeline.cycleCount} — Sync→Quét từng user (pool ${pcfg.chain_recent_hours === 0 ? 'full' : `${pcfg.chain_recent_hours}h`})`);
    } else {
      pushAutoLog(`🔄 Chu kỳ ${autoPipeline.cycleCount} — pool ≤${AUTO_PIPELINE_RECENT_HOURS}h, từ hoạt động mới nhất`);
    }

    let done = false;

    if (pcfg.engine === 'full_cycle' || pcfg.engine === 'legacy' || !pcfg.engine || pcfg.engine === '') {
      const userCap = Math.min(500_000, Math.max(0, parseInt(pcfg.full_cycle_max_users_per_round, 10) || 0));
      const gp = Math.min(30, Math.max(1, parseInt(pcfg.full_cycle_graph_pages_per_contact, 10) || FB_SYNC_BATCH_GRAPH_MAX_PAGES));
      const v2Limit = userCap > 0 ? userCap : 150;
      let v2;
      try {
        v2 = await runPipelineV2OnePass({ limit: v2Limit, graphPages: gp, io: null });
      } catch (e) {
        console.error('[AutoPipeline] pipeline v2', e);
        v2 = { ok: false, error: e.message, processed: 0, messagesSynced: 0, extractUpdated: 0, leadsCreated: 0, details: [] };
      }
      const usersPhase = v2.processed || 0;
      const v2Msgs = v2.messagesSynced || 0;
      const v2Extract = v2.extractUpdated || 0;
      const created = v2.leadsCreated || 0;
      if (!v2.ok) {
        pushAutoLog(`⚠️ Pipeline v2: ${v2.error || 'lỗi'}`, 'error');
        autoPipeline.kpi.errors += 1;
      }
      autoPipeline.kpi.messagesSynced += v2Msgs;
      autoPipeline.kpi.contactsProcessed += usersPhase;
      autoPipeline.kpi.contactPhones += v2Extract;
      autoPipeline.kpi.leadPhones += created;

      let poolMsgs = 0;
      let poolExtract = 0;
      let poolProcessedSum = 0;
      let poolRounds = 0;
      if (pcfg.full_cycle_rescan_phones !== false) {
        autoPipeline.step = 0;
        autoPipeline.stepLabel = '📲 Pool: Graph→quét (cả đã có lead)';
        emitAutoState();
        const chunkPool = Math.min(500, Math.max(20, parseInt(pcfg.chain_chunk_users, 10) || 80));
        const rhPool = Math.min(168, Math.max(0, parseInt(pcfg.chain_recent_hours, 10) || AUTO_PIPELINE_RECENT_HOURS));
        const maxPoolRounds = Math.min(100, Math.max(1, parseInt(pcfg.full_cycle_pool_sync_rounds, 10) || 12));
        let offPool = Number.isFinite(autoPipeline.fullCycleSyncExtractOffset)
          ? Math.max(0, autoPipeline.fullCycleSyncExtractOffset)
          : 0;
        const graphPagesPool = Math.min(30, Math.max(1, parseInt(pcfg.chain_graph_pages, 10) || gp));
        const skipFinalPool = !pcfg.chain_final_lead_sync;
        for (let pr = 0; pr < maxPoolRounds; pr++) {
          let summaryPool;
          try {
            summaryPool = await runSyncThenExtractPhonesJob({
              io: null,
              limit: chunkPool,
              offset: offPool,
              recentHours: rhPool,
              applyStaleFilter: !!pcfg.chain_skip_stale,
              graphPages: graphPagesPool,
              forceRescanPhones: true,
              sortOrder: pcfg.chain_sort === 'oldest_first' ? 'oldest_first' : 'newest_first',
              skipFinalRound: skipFinalPool,
              runGraphSync: pcfg.chain_run_graph_sync !== false,
              runExtract: pcfg.chain_run_extract !== false,
              emitBatchSocketEvents: false,
            });
          } catch (e) {
            console.error('[AutoPipeline] full_cycle pool sync', e);
            pushAutoLog(`❌ Pool Sync→Quét: ${e.message}`, 'error');
            autoPipeline.kpi.errors += 1;
            break;
          }
          if (!summaryPool || summaryPool.ok === false) {
            pushAutoLog(`❌ Pool Sync→Quét: ${summaryPool?.error || 'lỗi'}`, 'error');
            autoPipeline.kpi.errors += 1;
            break;
          }
          poolRounds += 1;
          poolMsgs += summaryPool.total_messages_synced || 0;
          poolExtract += summaryPool.extract_updated || 0;
          poolProcessedSum += summaryPool.processed || 0;
          offPool = summaryPool.next_offset != null ? summaryPool.next_offset : offPool + (summaryPool.processed || 0);
          autoPipeline.fullCycleSyncExtractOffset = summaryPool.done_pool ? 0 : offPool;
          if (summaryPool.done_pool || !(summaryPool.processed > 0)) break;
        }
        autoPipeline.kpi.messagesSynced += poolMsgs;
        autoPipeline.kpi.contactsProcessed += poolProcessedSum;
        autoPipeline.kpi.contactPhones += poolExtract;
        if (poolRounds > 0) {
          pushAutoLog(
            `📲 Pool Sync→Quét (${poolRounds} lô, offset tiếp ${autoPipeline.fullCycleSyncExtractOffset}): +${poolMsgs} tin, quét +${poolExtract}, ${poolProcessedSum} contact`,
            'ok',
          );
        }
      }

      const phaseMsgs = v2Msgs + poolMsgs;
      const phaseExtract = v2Extract + poolExtract;
      pushAutoLog(
        `📊 Vòng ${autoPipeline.cycleCount}: v2 ${usersPhase} contact (+${v2Msgs} tin / quét ${v2Extract}) + pool +${poolMsgs} tin / quét ${poolExtract} → lead ${created}`,
        'ok',
      );

      autoPipeline.totalSteps = 5;
      autoPipeline.step = 1;
      autoPipeline.stepLabel = '🆕 Lead (đã gộp trong pipeline v2)';
      emitAutoState();
      const createSkipped = Math.max(0, usersPhase - created);
      const createLeadDetailsSample = Array.isArray(v2.details) ? v2.details.slice(0, 120) : [];
      pushAutoLog(`✅ Lead tạo trong vòng: ${created} (không tạo / bỏ qua: ~${createSkipped})`, 'ok');
      emitAutoState();

      autoPipeline.step = 2;
      autoPipeline.stepLabel = '🔄 Refresh tên';
      emitAutoState();
      let refreshUpdated = 0;
      let refreshTotal = 0;
      try {
        const rn = await autoPipelineInternalPostJson('/facebook/refresh-names', {});
        refreshUpdated = rn.updated || 0;
        refreshTotal = rn.total || 0;
        pushAutoLog(`✅ Refresh tên: ${refreshUpdated}/${refreshTotal}`, 'ok');
      } catch (e) {
        console.error('[AutoPipeline] refresh-names', e);
        pushAutoLog(`❌ Refresh tên: ${e.message}`, 'error');
        autoPipeline.kpi.errors += 1;
      }
      emitAutoState();

      autoPipeline.step = 3;
      autoPipeline.stepLabel = '🔍 Xóa Lead trùng';
      emitAutoState();
      let dedupMerged = 0;
      let dedupMessage = '';
      try {
        const dd = await autoPipelineInternalPostJson('/facebook/dedup-leads', {});
        dedupMerged = dd.merged || 0;
        dedupMessage = dd.message || '';
        pushAutoLog(`✅ Xóa lead trùng: ${dedupMerged} lead (${dedupMessage})`, 'ok');
      } catch (e) {
        console.error('[AutoPipeline] dedup-leads', e);
        pushAutoLog(`❌ Xóa lead trùng: ${e.message}`, 'error');
        autoPipeline.kpi.errors += 1;
      }
      emitAutoState();

      autoPipeline.step = 4;
      autoPipeline.stepLabel = '🔗 Sync SĐT danh bạ → Lead';
      emitAutoState();
      let syncPhonesUpdated = 0;
      let syncPhonesTotal = 0;
      try {
        const sp = await autoPipelineInternalPostJson('/facebook/sync-contact-phones', {});
        syncPhonesUpdated = sp.updated ?? 0;
        syncPhonesTotal = sp.total ?? 0;
        pushAutoLog(`✅ Sync SĐT danh bạ → Lead: ${syncPhonesUpdated}/${syncPhonesTotal || 0}`, 'ok');
      } catch (e) {
        console.error('[AutoPipeline] sync-contact-phones', e);
        pushAutoLog(`❌ Sync SĐT danh bạ → Lead: ${e.message}`, 'error');
        autoPipeline.kpi.errors += 1;
      }
      emitAutoState();

      autoPipeline.batchResults = [
        ...autoPipeline.batchResults.slice(-98),
        {
          batch: 'full',
          cycle: autoPipeline.cycleCount,
          ts: Date.now(),
          mode: 'full_cycle_summary',
          contactsProcessed: usersPhase + poolProcessedSum,
          messagesSynced: phaseMsgs,
          contactPhones: phaseExtract,
          customerPhones: 0,
          leadPhones: created,
          status: 'done',
          post_steps: {
            create_leads: { created, skipped: createSkipped, details_sample: createLeadDetailsSample },
            pool_sync:
              pcfg.full_cycle_rescan_phones === false
                ? null
                : {
                    rounds: poolRounds,
                    messages: poolMsgs,
                    extract_updated: poolExtract,
                    contacts_processed: poolProcessedSum,
                    next_offset: autoPipeline.fullCycleSyncExtractOffset,
                  },
            refresh_names: { updated: refreshUpdated, total: refreshTotal },
            dedup: { merged: dedupMerged, message: dedupMessage },
            sync_phones: { updated: syncPhonesUpdated, total: syncPhonesTotal },
          },
        },
      ];

      pushAutoLog(`🏁 Vòng ${autoPipeline.cycleCount} xong (v2 + pool đồng bộ + CRM sau)`, 'ok');
      done = true;
      emitAutoState();
    } else if (pcfg.engine === 'chain') {
      let chainOff = 0;
      let poolLen = 0;
      const chunk = Math.min(500, Math.max(1, parseInt(pcfg.chain_chunk_users, 10) || 500));
      const rh = Math.min(168, Math.max(0, parseInt(pcfg.chain_recent_hours, 10) || 0));
      const skipStale = !!pcfg.chain_skip_stale;
      const graphPages = Math.min(30, Math.max(1, parseInt(pcfg.chain_graph_pages, 10) || FB_SYNC_SINGLE_MAX_PAGES));
      const sortOrder = pcfg.chain_sort === 'oldest_first' ? 'oldest_first' : 'newest_first';
      const skipFinal = !pcfg.chain_final_lead_sync;
      const runGraph = pcfg.chain_run_graph_sync !== false;
      const runExtract = pcfg.chain_run_extract !== false;

      while (!done && autoPipeline.enabled && !autoPipeline.stopRequested) {
        autoPipeline.batchIndex += 1;
        autoPipeline.batchOffset = chainOff;
        autoPipeline.step = 0;
        autoPipeline.totalSteps = 1;
        autoPipeline.stepLabel = `📲 Sync→Quét${!runGraph ? ' (bỏ Graph)' : ''}${!runExtract ? ' (bỏ quét)' : ''} • offset ${chainOff} (≤${chunk} user)`;
        emitAutoState();

        let summary;
        try {
          summary = await runSyncThenExtractPhonesJob({
            io: null,
            limit: chunk,
            offset: chainOff,
            recentHours: rh,
            applyStaleFilter: skipStale,
            graphPages,
            forceRescanPhones: false,
            sortOrder,
            skipFinalRound: skipFinal,
            runGraphSync: runGraph,
            runExtract,
            emitBatchSocketEvents: false,
          });
        } catch (e) {
          console.error('[AutoPipeline chain]', e);
          pushAutoLog(`❌ Chain batch ${autoPipeline.batchIndex}: ${e.message}`, 'error');
          autoPipeline.kpi.errors += 1;
          break;
        }

        if (summary.ok === false) {
          pushAutoLog(`❌ Chain batch ${autoPipeline.batchIndex}: ${summary.error || 'Lỗi'}`, 'error');
          autoPipeline.kpi.errors += 1;
          break;
        }

        poolLen = summary.pool_total != null ? summary.pool_total : poolLen;
        if (poolLen > 0) {
          autoPipeline.totalContacts = poolLen;
          autoPipeline.totalBatches = Math.ceil(poolLen / chunk) || 1;
        }

        const processed = summary.processed || 0;
        const batchEntry = {
          batch: autoPipeline.batchIndex,
          cycle: autoPipeline.cycleCount,
          ts: Date.now(),
          mode: 'chain',
          chainOffset: chainOff,
          contactsProcessed: processed,
          messagesSynced: summary.total_messages_synced || 0,
          contactPhones: summary.extract_updated || 0,
          customerPhones: 0,
          leadPhones: summary.leadsUpdatedPhone || 0,
          status: summary.ok !== false ? 'done' : 'error',
          scan_details: compactSyncExtractStepsForAuto(summary.steps),
        };
        if (summary.error) batchEntry.error = summary.error;

        autoPipeline.batchResults = [...autoPipeline.batchResults.slice(-99), batchEntry];
        autoPipeline.kpi.messagesSynced += batchEntry.messagesSynced;
        autoPipeline.kpi.contactsProcessed += batchEntry.contactsProcessed;
        autoPipeline.kpi.contactPhones += batchEntry.contactPhones;
        autoPipeline.kpi.leadPhones += batchEntry.leadPhones;

        pushAutoLog(
          `✅ Chain #${autoPipeline.batchIndex}: ${processed} user, +${batchEntry.messagesSynced} tin, quét +${batchEntry.contactPhones}, lead mô tả +${batchEntry.leadPhones}`,
          'ok',
        );

        chainOff = summary.next_offset != null ? summary.next_offset : chainOff + processed;
        done = !!summary.done_pool;
        if (summary.done_pool) {
          pushAutoLog(`🏁 Chu kỳ ${autoPipeline.cycleCount} xong pool chain (${poolLen} contacts)`, 'ok');
        } else {
          pushAutoLog(`⏭️ Chain offset tiếp: ${chainOff}`);
        }
        emitAutoState();
      }
    } else {
      /** Engine không xác định → fallback pipeline v2. */
      pushAutoLog(`⚠️ Engine "${pcfg.engine}" không hỗ trợ — fallback pipeline v2`, 'error');
      const userCap = Math.min(500_000, Math.max(0, parseInt(pcfg.full_cycle_max_users_per_round, 10) || 0));
      const gp = Math.min(30, Math.max(1, parseInt(pcfg.full_cycle_graph_pages_per_contact, 10) || FB_SYNC_BATCH_GRAPH_MAX_PAGES));
      try {
        await runPipelineV2OnePass({ limit: userCap > 0 ? userCap : 150, graphPages: gp, io: null });
      } catch (e) {
        console.error('[AutoPipeline] pipeline v2 (fallback)', e.message);
      }
      try { await autoPipelineInternalPostJson('/facebook/refresh-names', {}); } catch (e) { console.error('[AutoPipeline] refresh-names (fallback)', e.message); }
      try { await autoPipelineInternalPostJson('/facebook/dedup-leads', {}); } catch (e) { console.error('[AutoPipeline] dedup-leads (fallback)', e.message); }
      try { await autoPipelineInternalPostJson('/facebook/sync-contact-phones', {}); } catch (e) { console.error('[AutoPipeline] sync-contact-phones (fallback)', e.message); }
      done = true;
    }

    if (!autoPipeline.enabled || autoPipeline.stopRequested) break;

    const pauseMs = getAutoLoopPauseMsFromConfig(pcfg);
    if (!autoPipeline.enabled || autoPipeline.stopRequested) break;

    if (pauseMs > 0) {
      autoPipeline.phase = 'pause';
      autoPipeline.pauseUntilMs = Date.now() + pauseMs;
      autoPipeline.lastUpdatedAt = new Date().toISOString();
      // stepLabel dùng cho UI; countdown sẽ dựa vào pauseUntilMs
      autoPipeline.stepLabel = `⏳ Nghỉ ${Math.round(pauseMs / 1000)}s giữa các chu kỳ`;
      emitAutoState();
      if (pcfg.engine === 'full_cycle') {
        pushAutoLog(`⏭️ Full cycle: nghỉ ${pauseMs / 1000}s rồi lặp (từ đầu pool / đủ N user)`);
      } else if (pcfg.engine !== 'chain') {
        pushAutoLog(`⏭️ Legacy: nghỉ ${pauseMs / 1000}s rồi lặp (${AUTO_PIPELINE_RECENT_HOURS}h)`);
      } else {
        pushAutoLog(`⏭️ Chain: nghỉ ${pauseMs / 1000}s rồi lặp từ offset 0`);
      }
      pushAutoLog(`♻️ Nghỉ ${pauseMs / 1000}s rồi lặp chu kỳ ${autoPipeline.cycleCount + 1}...`);
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
      // Hết nghỉ
      autoPipeline.pauseUntilMs = null;
    } else {
      pushAutoLog(`⏭️ Chu kỳ tiếp theo (${autoPipeline.cycleCount + 1}) — chạy liền, không nghỉ giữa vòng`);
    }
  }

  autoPipeline.running = false;
  autoPipeline.enabled = false;
  autoPipeline.stopRequested = false;
  autoPipeline.phase = 'idle';
  autoPipeline.step = -1;
  autoPipeline.stepLabel = null;
  pushAutoLog('⏹️ Auto pipeline đã dừng');
  emitAutoState();
}

// ── Auto-migration: thêm cột mới nếu chưa có ──
(async () => {
  try {
    const { error } = await supabase.from('facebook_pages')
      .select('default_lead_owner_id').limit(1);
    if (error?.message?.includes('default_lead_owner_id')) {
      console.log('[FB] ⚠️ Column default_lead_owner_id chưa có, sẽ dùng fallback (created_by)');
    } else {
      console.log('[FB] ✅ Column default_lead_owner_id OK');
    }
  } catch (e) { /* ignore */ }
})();

// ── Detect optional facebook_contacts.sync_paused column (database/103_*.sql) ──
let _hasSyncPausedColumn = null;
async function ensureSyncPausedColumnDetected() {
  if (_hasSyncPausedColumn !== null) return _hasSyncPausedColumn;
  const { error } = await supabase.from('facebook_contacts').select('sync_paused').limit(1);
  if (!error) {
    _hasSyncPausedColumn = true;
    console.log('[FB] ✅ Column facebook_contacts.sync_paused OK');
    return true;
  }
  const msg = String(error.message || '');
  const missingCol =
    error.code === '42703'
    || /column.*sync_paused|sync_paused.*does not exist|undefined column/i.test(msg);
  if (missingCol) {
    _hasSyncPausedColumn = false;
    console.warn('[FB] ⚠️ Column facebook_contacts.sync_paused chưa có — bỏ qua filter. Chạy database/103_facebook_contacts_sync_flags.sql để bật.');
    return false;
  }
  // Lỗi mạng / tạm thời: không cache false để lần sau thử lại cột
  console.warn('[FB] sync_paused probe (không cache, sẽ thử lại):', msg);
  return false;
}
function hasSyncPausedColumnSync() { return _hasSyncPausedColumn === true; }
ensureSyncPausedColumnDetected().catch(() => {});

// Migration endpoint — chạy 1 lần để thêm cột mới
r.post('/migrate', async (req, res) => {
  try {
    // Kiểm tra column đã tồn tại chưa
    const { error: checkErr } = await supabase.from('facebook_pages')
      .select('default_lead_owner_id').limit(1);
    
    if (!checkErr) {
      return res.json({ message: 'Column default_lead_owner_id already exists', ok: true });
    }

    // Thử tạo RPC function bằng cách dùng supabase.rpc 
    // Nếu ko được thì hướng dẫn chạy SQL manual
    return res.json({
      message: 'Column chưa tồn tại. Vui lòng chạy SQL này trong Supabase Dashboard → SQL Editor:',
      sql: 'ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_lead_owner_id UUID;',
      ok: false,
    });
  } catch (e) {
    res.json({ 
      message: 'Run this SQL manually in Supabase Dashboard → SQL Editor:', 
      sql: 'ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_lead_owner_id UUID;',
      error: e.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// FACEBOOK WEBHOOK — Nhận Lead Ads, Messenger, Comments
// ═══════════════════════════════════════════════════════════════

// ── In-memory dedup: chống race condition khi chưa có UNIQUE INDEX ──
const _processingMids = new Set();
function acquireMidLock(mid) {
  if (!mid) return true; // no mid = no dedup
  if (_processingMids.has(mid)) return false; // already processing
  _processingMids.add(mid);
  // Auto-cleanup after 60s
  setTimeout(() => _processingMids.delete(mid), 60000);
  return true;
}

// ── Helpers ──────────────────────────────────────────────────

const _pageConfigCache = {}; // pageId → { data, ts }
async function getPageConfig(pageId) {
  const cached = _pageConfigCache[pageId];
  if (cached && Date.now() - cached.ts < 60000) return cached.data; // cache 60s
  const { data } = await supabase.from('facebook_pages')
    .select('*').eq('page_id', pageId).eq('is_active', true).single();
  _pageConfigCache[pageId] = { data, ts: Date.now() };
  return data;
}

async function getOrCreateContact(pageId, psid, name, _profilePic) {
  // Tìm contact đã có
  let { data: contact } = await supabase.from('facebook_contacts')
    .select('*').eq('page_id', pageId).eq('psid', psid).single();

  if (contact) {
    // Không tự fetch tên/avatar từ Facebook để giảm request ngoài.
    if (name && name !== contact.fb_name) {
      await supabase.from('facebook_contacts').update({
        fb_name: name,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);
      contact.fb_name = name;
    }
    return contact;
  }

  // Contact mới: tạo tối giản, không fetch profile/avatar nền.
  const { data: newContact, error } = await supabase.from('facebook_contacts')
    .insert({ page_id: pageId, psid, fb_name: name || 'Facebook User' })
    .select().single();
  if (error) {
    if (error.message.includes('duplicate key') || error.code === '23505') {
      const { data: existing } = await supabase.from('facebook_contacts')
        .select('*').eq('page_id', pageId).eq('psid', psid).single();
      if (existing) return existing;
    }
    console.error('[FB] Create contact error:', error.message);
    return null;
  }

  // Realtime: báo UI có contact mới để danh bạ cập nhật ngay (kể cả chưa có fb_message).
  try {
    if (r?._ioRef && newContact) {
      r._ioRef.emit('fb_contact_created', {
        contact_id: newContact.id,
        contact: newContact,
      });
    }
  } catch (_) { /* ignore */ }

  return newContact;
}

/** Tên tạm / rỗng — cần resolve qua Graph (Conversations API). */
function isPlaceholderFacebookName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return true;
  return (
    n === 'facebook user'
    || n === 'user'
    || n === 'unknown'
    || n === 'khách'
  );
}

const _fbMessengerNameResolveInFlight = new Set();

/** Một request Conversations API / contact; emit socket để UI đổi tên ngay. */
async function tryResolveMessengerDisplayName(pageId, psid, contactId, io) {
  if (!pageId || !psid || !contactId || _fbMessengerNameResolveInFlight.has(contactId)) return;
  _fbMessengerNameResolveInFlight.add(contactId);
  try {
    const profile = await fetchProfileViaConversations(pageId, psid);
    if (!profile?.name || isPlaceholderFacebookName(profile.name)) return;
    const upd = {
      fb_name: profile.name,
      updated_at: new Date().toISOString(),
    };
    if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
    await supabase.from('facebook_contacts').update(upd).eq('id', contactId);
    if (io) {
      io.emit('fb_contact_updated', {
        contact_id: contactId,
        fb_name: profile.name,
        fb_profile_pic: profile.profilePic || null,
      });
    }
  } catch (e) {
    console.warn('[FB] tryResolveMessengerDisplayName:', e.message);
  } finally {
    _fbMessengerNameResolveInFlight.delete(contactId);
  }
}

// Helper: ghi kết quả fetch tên vào webhook logs
async function logFetchResult(pageId, psid, status, details) {
  if (FB_DISABLE_WEBHOOK_LOGS) return;
  try {
    await supabase.from('facebook_webhook_logs').insert({
      page_id: pageId,
      payload: { type: 'fetch_name', psid, ...details },
      status,
    });
  } catch (e) { /* ignore */ }
}

// Lấy tên user qua Conversations API (không cần Advanced Access)
// Flow: resolve thread Page+PSID → GET /CONV_ID?fields=participants hoặc /messages?fields=from
async function fetchProfileViaConversations(pageId, psid) {
  try {
    const page = await getPageConfig(pageId);
    if (!page?.access_token) { await logFetchResult(pageId, psid, 'no_token', null); return null; }
    const token = page.access_token;

    const { convId, lastError } = await graphResolveConversationIdForPsid(pageId, psid, token);
    if (!convId) {
      await logFetchResult(pageId, psid, 'no_conversation', lastError || null);
      return null;
    }

    // Step 2a: Try participants API (fastest, most reliable)
    try {
      const partResp = await fetch(`https://graph.facebook.com/v22.0/${convId}?fields=participants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partData = await partResp.json();
      const participant = partData.participants?.data?.find(p => p.id === psid);
      if (participant?.name && participant.name !== 'Facebook User') {
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.name)}&background=0D8ABC&color=fff&size=200&bold=true`;
        await logFetchResult(pageId, psid, 'success_participants', { name: participant.name });
        return { name: participant.name, profilePic: avatarUrl };
      }
    } catch (e) { /* fallthrough */ }

    // Step 2b: Fallback — messages with from.name
    const msgResp = await fetch(`https://graph.facebook.com/v22.0/${convId}/messages?fields=from&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgData = await msgResp.json();
    if (!msgData.data?.length) { await logFetchResult(pageId, psid, 'no_messages', null); return null; }

    const userMsg = msgData.data.find(m => m.from?.id === psid);
    if (!userMsg?.from?.name) {
      await logFetchResult(pageId, psid, 'no_name', null);
      return null;
    }

    const userName = userMsg.from.name;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0D8ABC&color=fff&size=200&bold=true`;
    await logFetchResult(pageId, psid, 'success_messages', { name: userName });

    return { name: userName, profilePic: avatarUrl };
  } catch (e) {
    console.warn('[FB] fetchProfileViaConversations error:', e.message);
    return null;
  }
}

function _phoneDigitsLen(s) {
  if (s == null || s === '') return 0;
  return String(s).replace(/\D/g, '').length;
}

/** Lead đã gắn contact và đã có SĐT lưu (KH / contact FB / dòng SĐT trong mô tả) → không quét lại tin nhắn. */
function leadLinkedPhoneAlreadyStored(contact, lead, cust) {
  if (!contact?.lead_id || !lead) return false;
  if (_phoneDigitsLen(cust?.phone) >= 9) return true;
  if (_phoneDigitsLen(contact.phone) >= 9) return true;
  const desc = lead.description || '';
  const m = desc.match(/SĐT:\s*(\S+)/i);
  if (m?.[1] && _phoneDigitsLen(m[1]) >= 9) return true;
  return false;
}

/** Ghi default_source_id lên facebook_pages để lần sau không tra lại crm_sources */
async function persistPageDefaultSourceId(page, sourceId) {
  if (!page?.id || !sourceId) return;
  if (page.default_source_id) return;
  await supabase.from('facebook_pages').update({ default_source_id: sourceId }).eq('id', page.id);
  _pageConfigCache[page.page_id] = {
    data: { ...page, default_source_id: sourceId },
    ts: Date.now(),
  };
}

/**
 * Một page Facebook = một dòng crm_sources chuẩn `[FB:page_id] Tên page`.
 * Trước đây dùng .single() trên tên legacy `[FB] Tên` → khi có NHIỀU dòng trùng tên PostgREST lỗi / không trả row →
 * code rơi xuống insert và tạo thêm hàng trùng vô hạn. Luôn dùng .limit(1) + ORDER.
 */
async function resolveFacebookSourceId(page) {
  if (!page?.page_id) return null;

  /** Ưu page → công ty mặc định trong tab Facebook (auto_lead_config / app_settings) */
  let fallbackCompanyId = page.default_company_id || null;
  if (!fallbackCompanyId) {
    try {
      const cfg = await loadAutoLeadConfig();
      if (cfg?.default_company_id) fallbackCompanyId = cfg.default_company_id;
    } catch {
      /* ignore */
    }
  }

  const fbSourcePatch = (extra = {}) => ({
    ...extra,
    ...(fallbackCompanyId ? { company_id: fallbackCompanyId } : {}),
  });

  if (page.default_source_id) {
    if (fallbackCompanyId) {
      await supabase.from('crm_sources').update({ company_id: fallbackCompanyId }).eq('id', page.default_source_id);
    }
    return page.default_source_id;
  }

  const pid = String(page.page_id).trim();
  const pnm = (page.page_name || pid).trim();
  const canonicalName = `[FB:${pid}] ${pnm}`;

  const { data: exactRows } = await supabase
    .from('crm_sources')
    .select('id')
    .eq('name', canonicalName)
    .limit(1);
  if (exactRows?.[0]?.id) {
    if (fallbackCompanyId) {
      await supabase.from('crm_sources').update({ company_id: fallbackCompanyId }).eq('id', exactRows[0].id);
    }
    await persistPageDefaultSourceId(page, exactRows[0].id);
    return exactRows[0].id;
  }

  const { data: byPageIdRows } = await supabase
    .from('crm_sources')
    .select('id, name')
    .ilike('name', `%[FB:${pid}]%`)
    .order('id', { ascending: true })
    .limit(1);
  const byPage = byPageIdRows?.[0];
  if (byPage?.id) {
    await supabase.from('crm_sources').update(fbSourcePatch({ name: canonicalName, is_active: true })).eq('id', byPage.id);
    await persistPageDefaultSourceId(page, byPage.id);
    return byPage.id;
  }

  const legacyNames = [`[FB] ${pnm}`, 'Facebook'].filter(Boolean);
  for (const name of legacyNames) {
    const { data: legacyRows } = await supabase
      .from('crm_sources')
      .select('id, name')
      .eq('name', name)
      .order('id', { ascending: true })
      .limit(1);
    const legacy = legacyRows?.[0];
    if (legacy?.id) {
      await supabase.from('crm_sources').update(fbSourcePatch({ name: canonicalName, is_active: true })).eq('id', legacy.id);
      await persistPageDefaultSourceId(page, legacy.id);
      return legacy.id;
    }
  }

  const insertRow = fbSourcePatch({ name: canonicalName, is_active: true });
  const { data: created } = await supabase
    .from('crm_sources')
    .insert(insertRow)
    .select('id')
    .single();
  if (created?.id) await persistPageDefaultSourceId(page, created.id);
  return created?.id || null;
}

// ── In-memory lock để chống race condition tạo lead trùng ──
const _createLeadLocks = new Map();

async function createLeadFromFacebook(pageId, contact, source, extraData = {}) {
  const page = await getPageConfig(pageId);
  if (!page) return null;
  const autoLeadCfg = await loadAutoLeadConfig();

  // ── LOCK theo contact.id: chỉ 1 request được tạo lead cho 1 contact ──
  const lockKey = contact.id;
  if (_createLeadLocks.has(lockKey)) {
    console.log(`[FB] 🔒 Lock active for contact ${lockKey}, waiting...`);
    // Chờ lock giải phóng (tối đa 10s)
    const start = Date.now();
    while (_createLeadLocks.has(lockKey) && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 100));
    }
    // Sau khi lock mở → re-check lead_id
    const { data: recheck } = await supabase.from('facebook_contacts')
      .select('lead_id').eq('id', contact.id).single();
    if (recheck?.lead_id) {
      console.log(`[FB] 🔒 Lock released, lead already created: ${recheck.lead_id}`);
      return { id: recheck.lead_id };
    }
  }
  _createLeadLocks.set(lockKey, Date.now());
  // Auto-release lock sau 30s (safety)
  setTimeout(() => _createLeadLocks.delete(lockKey), 30000);

  try {

  // ── ANTI-DUPLICATE: 4 tầng kiểm tra ──
  const { data: freshContact } = await supabase.from('facebook_contacts')
    .select('lead_id, customer_id, psid, phone').eq('id', contact.id).single();
  
  // 1. Check contact đã có lead_id
  if (freshContact?.lead_id) {
    return { id: freshContact.lead_id };
  }
  
  // 2. Check trùng theo customer_id
  if (freshContact?.customer_id) {
     const { data: existing } = await supabase.from('crm_leads')
       .select('id').eq('customer_id', freshContact.customer_id).eq('type', 'lead').limit(1);
     if (existing?.length > 0) {
       console.log(`[FB] ⚠️  Đã có lead cho customer ${freshContact.customer_id}, sync lại lead_id.`);
       await supabase.from('facebook_contacts').update({ lead_id: existing[0].id }).eq('id', contact.id);
       return { id: existing[0].id };
     }
  }

  // 3. Check trùng theo PSID (cùng người FB dù khác contact record)
  if (freshContact?.psid) {
    const { data: samePsid } = await supabase.from('facebook_contacts')
      .select('lead_id').eq('psid', freshContact.psid).not('lead_id', 'is', null).limit(1);
    if (samePsid?.length > 0) {
      console.log(`[FB] ⚠️  Đã có lead cho PSID ${freshContact.psid}, sync lại.`);
      await supabase.from('facebook_contacts').update({ lead_id: samePsid[0].lead_id }).eq('id', contact.id);
      return { id: samePsid[0].lead_id };
    }
  }

  // 3.5 — Chuẩn hóa SĐT (Pipeline v2: không chặn bằng rule thuê bao VN cứng)
  const rawVin = (extraData.phone != null && String(extraData.phone).trim())
    ? String(extraData.phone).trim()
    : (freshContact?.phone && String(freshContact.phone).trim())
      ? String(freshContact.phone).trim()
      : (contact.phone && String(contact.phone).trim())
        ? String(contact.phone).trim()
        : '';
  if (rawVin) {
    const v = normalizePhoneForLeadCreation(rawVin);
    if (!v.ok) {
      console.log(`[FB] ⏭️ Không tạo lead — không chuẩn hóa được SĐT (${source}): "${rawVin}"`);
      return null;
    }
    if (v.normalized) extraData = { ...extraData, phone: v.normalized };
  }

  // 4. Check trùng theo SĐT (nếu có phone → tìm lead/customer trùng SĐT)
  const phone = extraData.phone || freshContact?.phone || contact.phone;
  if (phone && phone.trim()) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 9) {
      // Tìm customer trùng SĐT
      const { data: sameCust } = await supabase.from('customers')
        .select('id').ilike('phone', `%${cleanPhone.slice(-9)}`).limit(1);
      if (sameCust?.length > 0) {
        const { data: existLead } = await supabase.from('crm_leads')
          .select('id').eq('customer_id', sameCust[0].id).eq('type', 'lead').limit(1);
        if (existLead?.length > 0) {
          console.log(`[FB] ⚠️  Đã có lead cho SĐT ${cleanPhone}, gộp vào lead ${existLead[0].id}`);
          await supabase.from('facebook_contacts').update({ 
            lead_id: existLead[0].id, 
            customer_id: sameCust[0].id 
          }).eq('id', contact.id);
          return { id: existLead[0].id };
        }
      }
    }
  }

  // Tìm/tạo customer
  let customerId = contact.customer_id || freshContact?.customer_id;
  if (!customerId) {
    // Thử tìm customer theo SĐT trước khi tạo mới
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 9) {
        const { data: existCust } = await supabase.from('customers')
          .select('id').ilike('phone', `%${cleanPhone.slice(-9)}`).limit(1);
        if (existCust?.length > 0) {
          customerId = existCust[0].id;
          await supabase.from('facebook_contacts').update({ customer_id: customerId }).eq('id', contact.id);
          console.log(`[FB] ♻️ Reuse customer ${customerId} by phone match`);
        }
      }
    }
    // Nếu vẫn không tìm được → tạo mới
    if (!customerId) {
      const customerData = {
        full_name: extraData.full_name || contact.fb_name || 'Facebook KH',
        phone: extraData.phone || contact.phone || '',
        email: extraData.email || contact.email || null,
        address: extraData.address || null,
        source: 'Facebook',
      };
      const { data: customer } = await supabase.from('customers')
        .insert(customerData).select().single();
      if (customer) {
        customerId = customer.id;
        await supabase.from('facebook_contacts').update({ customer_id: customer.id }).eq('id', contact.id);
        console.log(`[FB] ✅ Customer created: ${customer.full_name} (phone: ${customer.phone || 'N/A'})`);
      }
    }
  } else {
    // Customer đã có → update thông tin mới nếu có
    const custUpd = {};
    if (extraData.phone) custUpd.phone = extraData.phone;
    if (extraData.address) custUpd.address = extraData.address;
    const fullName = extraData.full_name || contact.fb_name;
    if (fullName && fullName !== 'Facebook User') custUpd.full_name = fullName;
    if (Object.keys(custUpd).length) {
      await supabase.from('customers').update(custUpd).eq('id', customerId);
      console.log(`[FB] ✅ Customer updated:`, custUpd);
    }
  }

  const resolvedSourceId = await resolveFacebookSourceId(page);

  // Tạo lead code — lấy code MAX hiện có để tránh race condition (count() có thể bị stale).
  const { data: maxLead } = await supabase
    .from('crm_leads')
    .select('code')
    .eq('type', 'lead')
    .like('code', 'LEAD-%')
    .order('code', { ascending: false })
    .limit(1)
    .maybeSingle();
  const _maxNum = maxLead?.code ? parseInt(String(maxLead.code).replace(/^LEAD-/, ''), 10) : 0;
  const code = `LEAD-${String((_maxNum || 0) + 1).padStart(4, '0')}`;

  // Default stage: từ page config hoặc stage đầu tiên của pipeline lead
  let stageId = page.default_stage_id || null;
  if (!stageId) {
    const { data: defaultStage } = await supabase.from('crm_pipeline_stages')
      .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
    stageId = defaultStage?.id || null;
  }

  // Default company: từ page config
  let companyId = null;
  try {
    if (page.default_company_id) companyId = page.default_company_id;
  } catch (e) { /* column may not exist */ }

  // Fallback company từ auto-lead-config (nếu page chưa set)
  if (!companyId && autoLeadCfg?.default_company_id) companyId = autoLeadCfg.default_company_id;

  // Default lead type (company-scoped)
  let leadTypeId = null;
  const candidateLeadTypeId = (page?.default_lead_type_id || autoLeadCfg?.default_lead_type_id) || null;
  if (candidateLeadTypeId && companyId) {
    const { data: lt } = await supabase
      .from('crm_lead_types')
      .select('id, company_id, applies_to, is_active')
      .eq('id', candidateLeadTypeId)
      .maybeSingle();
    if (lt
      && String(lt.company_id || '') === String(companyId || '')
      && lt.is_active !== false
      && ['lead', 'both'].includes(String(lt.applies_to || 'both'))) {
      leadTypeId = lt.id;
    }
  }

  // ── Resolve pipeline_id theo company (giống POST /api/crm/leads) ──
  let pipelineId = null;
  if (companyId) {
    try {
      const { data: defPipe } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at')
        .limit(1)
        .maybeSingle();
      pipelineId = defPipe?.id || null;
      // Resolve first stage from company pipeline nếu chưa có stageId
      if (pipelineId && !stageId) {
        const { data: firstStage } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .eq('pipeline_type', 'lead')
          .eq('is_active', true)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        if (firstStage?.id) stageId = firstStage.id;
      }
    } catch (_) { /* ignore */ }
  }

  const leadData = {
    code,
    title: `[FB] ${extraData.full_name || contact.fb_name || 'KH Facebook'}`,
    type: 'lead',
    customer_id: customerId,
    source_id: resolvedSourceId,
    stage_id: stageId,
    pipeline_id: pipelineId,
    company_id: companyId,
    lead_type_id: leadTypeId,
    install_address: extraData.address || null,
    description: `Nguồn: Facebook ${source}\nTên: ${extraData.full_name || contact.fb_name || ''}\nSĐT: ${extraData.phone || contact.phone || ''}\nĐịa chỉ: ${extraData.address || ''}`.trim(),
    lead_owner_id: page.default_lead_owner_id || page.created_by,
    assigned_to: page.default_lead_owner_id || page.created_by,
    created_by: page.created_by,
  };

  // Tạo lead với mã duy nhất — DB hiện chưa có UNIQUE constraint trên code
  // (xem migration 108_crm_leads_code_unique.sql), nên cần pre-check application-level
  // để tránh race condition giữa các tick auto-pipeline / API thủ công.
  let lead = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const tryCode = `LEAD-${String((_maxNum || 0) + 1 + attempt).padStart(4, '0')}`;

    // Pre-check: code này đã tồn tại chưa
    const { data: existing } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('type', 'lead')
      .eq('code', tryCode)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.warn(`[FB] Lead code ${tryCode} đã tồn tại — thử mã kế tiếp (attempt ${attempt + 1})`);
      continue;
    }

    const tryData = { ...leadData, code: tryCode };
    const { data, error } = await supabase.from('crm_leads').insert(tryData).select().single();
    if (!error) { lead = data; break; }
    lastErr = error;
    const isDup = String(error.message || '').toLowerCase().includes('duplicate')
               || String(error.code || '') === '23505';
    if (!isDup) {
      console.error('[FB] Create lead error:', error.message);
      return null;
    }
    console.warn(`[FB] Lead code ${tryCode} race-collision — retry attempt ${attempt + 1}`);
  }
  if (!lead) {
    console.error('[FB] Create lead failed sau 10 lần thử:', lastErr?.message);
    return null;
  }

  // Link contact → lead (và dừng sync sâu nếu cột đã có).
  const _linkUpd = { lead_id: lead.id, updated_at: new Date().toISOString() };
  if (hasSyncPausedColumnSync()) {
    _linkUpd.sync_paused = true;
    _linkUpd.sync_pause_reason = 'lead_created';
    _linkUpd.phone_resolved_at = new Date().toISOString();
  }
  await supabase.from('facebook_contacts').update(_linkUpd).eq('id', contact.id);

  // ── Auto-gen CRM tasks (giống logic tạo thủ công) ──
  try {
    const { autoGenCrmTasks } = require('../helpers/autoGenCrmTasks');
    const created = await autoGenCrmTasks(lead.id, 'lead', page.created_by);
    if (created) console.log(`[FB] ✅ Auto-gen ${created} tasks for lead ${lead.code}`);
  } catch (e) { console.warn('[FB] Auto-gen tasks error:', e.message); }

  console.log(`[FB] Lead created: ${lead.code} — ${lead.title}`);

  // Notify lead owner only (không gửi cho tất cả admin)
  try {
    const ownerId = page?.default_lead_owner_id || page?.created_by;
    if (ownerId) {
      await supabase.from('notifications').insert({
        user_id: ownerId,
        type: 'lead_created',
        title: '📘 Lead mới từ Facebook',
        message: `${lead.title} — ${extraData.phone || contact.fb_name || ''}`,
        entity_type: 'crm_lead',
        entity_id: lead.id,
      });
      // Push via Socket.IO
      const pushFn = r._app?.get?.('pushNotification');
      if (pushFn) {
        pushFn(ownerId, { type: 'lead_created', title: '📘 Lead mới từ Facebook', message: lead.title, entity_type: 'crm_lead', entity_id: lead.id });
      }
    }
  } catch (e) { console.warn('[FB] Notify error:', e.message); }

  return lead;

  } finally {
    // Release lock
    _createLeadLocks.delete(lockKey);
  }
}

async function sendMessengerReply(pageId, psid, text) {
  const page = await getPageConfig(pageId);
  if (!page?.access_token) return null;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: page.access_token,
    }),
  });
  const result = await resp.json();
  if (result.error) console.error('[FB] Send message error:', result.error);
  return result;
}

// Gửi attachment (image/file/audio/video) qua URL
async function sendMessengerAttachment(pageId, psid, type, url) {
  const page = await getPageConfig(pageId);
  if (!page?.access_token) return null;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: {
        attachment: {
          type, // image, audio, video, file
          payload: { url, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
      access_token: page.access_token,
    }),
  });
  const result = await resp.json();
  if (result.error) console.error('[FB] Send attachment error:', result.error);
  return result;
}

// ── WEBHOOK VERIFY (GET) ─────────────────────────────────────

r.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Kiểm tra verify token từ bất kỳ page config nào
  if (mode === 'subscribe') {
    const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'tubep_pro_verify_2024';
    
    // Check env var first, then check database
    if (token === verifyToken) {
      console.log('[FB] Webhook verified via env token');
      return res.status(200).send(challenge);
    }

    const { data: pages } = await supabase.from('facebook_pages')
      .select('webhook_verify_token').eq('is_active', true);
    const valid = (pages || []).some(p => p.webhook_verify_token === token);
    if (valid) {
      console.log('[FB] Webhook verified via page config');
      return res.status(200).send(challenge);
    }
  }

  res.sendStatus(403);
});

// ── WEBHOOK RECEIVE (POST) ───────────────────────────────────

r.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Luôn trả 200 ngay để Facebook không retry
  res.sendStatus(200);

  // Ghi log vào DB
  if (!FB_DISABLE_WEBHOOK_LOGS && body.object === 'page' && body.entry) {
    for (const entry of body.entry) {
      await supabase.from('facebook_webhook_logs').insert({
        page_id: entry.id,
        payload: entry,
        status: 'received'
      });
    }
  }

  try {
    if (body.object === 'page') {
      for (const entry of (body.entry || [])) {
        const pageId = entry.id;

        // ═══ MESSENGER MESSAGES ═══
        if (entry.messaging) {
          for (const event of entry.messaging) {
            await handleMessaging(pageId, event, r._ioRef);
          }
        }

        // ═══ LEAD ADS (leadgen) ═══
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen') {
              await handleLeadGen(pageId, change.value);
            }
            if (change.field === 'feed' && change.value?.item === 'comment') {
              await handleComment(pageId, change.value);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[FB] Webhook processing error:', e.message, e.stack);
  }
});

// ── HANDLE MESSENGER ─────────────────────────────────────────

/** PSID khách: tin từ KH (sender ≠ page); echo/read/delivery thường có sender = page → lấy recipient. */
function messengerPartnerPsid(pageId, event) {
  const pid = pageId != null ? String(pageId).trim() : '';
  const sid = event.sender?.id != null ? String(event.sender.id).trim() : '';
  const rid = event.recipient?.id != null ? String(event.recipient.id).trim() : '';
  if (sid && sid !== pid) return sid;
  if (rid && rid !== pid) return rid;
  return null;
}

async function handleMessaging(pageId, event, io) {
  const partnerPsid = messengerPartnerPsid(pageId, event);
  if (!partnerPsid) return;

  console.log(`\n[FB] 📨 Messenger event — partner PSID: ${partnerPsid}`);

  const sid = event.sender?.id != null ? String(event.sender.id).trim() : '';
  const senderLabel = sid && sid !== String(pageId).trim()
    ? (event.sender?.name || null)
    : (event.recipient?.name || null);
  const contact = await getOrCreateContact(pageId, partnerPsid, senderLabel);
  if (!contact) return;

  if (isPlaceholderFacebookName(contact.fb_name)) {
    void tryResolveMessengerDisplayName(pageId, partnerPsid, contact.id, io);
  }

  console.log(`[FB] 👤 Contact: ${contact.fb_name || 'Unknown'} (ID: ${contact.id})`);

  // Log kết quả xử lý vào DB
  if (!FB_DISABLE_WEBHOOK_LOGS) {
    await supabase.from('facebook_webhook_logs').upsert({
      page_id: pageId,
      payload: { type: 'message_processed', psid: partnerPsid, event },
      status: 'processed',
      result: {
        contact_id: contact.id,
        contact_name: contact.fb_name,
        has_lead: !!contact.lead_id,
        lead_id: contact.lead_id,
        avatar: contact.fb_profile_pic || null,
      },
    }, { ignoreDuplicates: true }).then(() => {}).catch(() => {});
  }

  if (event.message) {
    const msg = event.message;
    const isEcho = msg.is_echo;

    // Determine message type & content
    let messageType = 'text';
    let content = msg.text || '';
    let attachmentUrl = null;
    let attachmentType = null;

    if (msg.attachments && msg.attachments.length > 0) {
      const att = msg.attachments[0];
      messageType = att.type || 'file'; // image, video, audio, file
      attachmentUrl = att.payload?.url;
      attachmentType = att.type;
      if (!content) content = `[${messageType}]`;
    }

    if (msg.sticker_id) {
      messageType = 'sticker';
      content = `[Sticker: ${msg.sticker_id}]`;
    }

    // Check duplicate — Facebook có thể gửi webhook 2 lần (~30ms)
    // Layer 1: In-memory lock (chống race condition khi 2 request song song)
    if (msg.mid && !acquireMidLock(msg.mid)) {
      console.log(`[FB] ⏭️  In-memory lock: duplicate mid ${msg.mid}`);
      return;
    }
    // Layer 2: DB check
    if (msg.mid) {
      const { data: existing } = await supabase.from('facebook_messages')
        .select('id').eq('fb_message_id', msg.mid).limit(1);
      if (existing?.length) {
        console.log(`[FB] ⏭️  Skip duplicate message: ${msg.mid}`);
        return;
      }
    }

    console.log(`[FB] 💬 Message type: ${messageType}, content: ${content?.substring(0, 50)}${content?.length > 50 ? '...' : ''}`);
    console.log(`[FB] 📎 Attachment: ${attachmentUrl || 'None'}`);

    // Save message — dùng upsert để tránh duplicate
    const insertData = {
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: msg.mid,
      direction: isEcho ? 'outbound' : 'inbound',
      message_type: messageType,
      content,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      metadata: msg.attachments ? { attachments: msg.attachments } : null,
    };

    // Upsert: nếu fb_message_id đã tồn tại thì bỏ qua (onConflict ignore)
    const { data: savedMsg, error: insertErr } = await supabase.from('facebook_messages')
      .upsert(insertData, { onConflict: 'fb_message_id', ignoreDuplicates: true })
      .select().single();
    
    if (insertErr) {
      // Nếu lỗi unique constraint → duplicate, skip
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate')) {
        console.log(`[FB] ⏭️  Duplicate insert blocked: ${msg.mid}`);
        return;
      }
      console.error('[FB] Insert error:', insertErr.message);
    }
    
    if (!savedMsg) {
      console.log(`[FB] ⏭️  No row returned (duplicate upsert): ${msg.mid}`);
      return;
    }

    console.log(`[FB] ✅ Message saved: ${savedMsg?.id} (${isEcho ? 'outbound' : 'inbound'})`);

    if (isEcho) {
      const previewEcho = content
        ? content.substring(0, 100)
        : (msg.attachments?.length ? '[Tệp đính kèm]' : '');
      await supabase.from('facebook_contacts').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewEcho,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);
      try {
        if (io) {
          io.emit('fb_message', {
            contact_id: contact.id,
            lead_id: contact.lead_id,
            message: savedMsg,
            contact,
          });
        }
      } catch (_) { /* ignore */ }
      void tryResolveMessengerDisplayName(pageId, partnerPsid, contact.id, io);
      return;
    }

    if (!isEcho) {
      // Update last message + unread count + preview
      const preview = content
        ? content.substring(0, 100)
        : (msg.attachments?.length ? '[Tệp đính kèm]' : '');
      await supabase.from('facebook_contacts').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);

      // ── Extract phone & address từ tin nhắn TRƯỚC khi tạo lead ──
      let extractedPhone = null;
      let extractedAddress = null;
      if (content && content.length > 5) {
        const extracted = extractContactInfo(content);
        extractedPhone = extracted.phone;
        extractedAddress = extracted.address;
        if (extractedPhone || extractedAddress) {
          console.log(`[FB] 📞 Detected — phone: ${extractedPhone || 'N/A'}, address: ${extractedAddress || 'N/A'}`);
        }
      }

      // Auto-create lead nếu chưa có — theo cấu hình auto-lead-config (gồm công ty mặc định trong tab Setup)
      const autoLeadCfg = await loadAutoLeadConfig();
      let isFirstMessage = false;
      if (!contact.lead_id) {
        // Check: có lead cũ đã bị xóa không?
        const { data: oldMsgs } = await supabase.from('facebook_messages')
          .select('lead_id').eq('contact_id', contact.id).not('lead_id', 'is', null).limit(1);
        const hadLeadBefore = oldMsgs?.length > 0;

        // Nếu lead bị xóa, check config cho phép tạo lại không
        if (hadLeadBefore && !autoLeadCfg.recreate_deleted_leads) {
          console.log(`[FB] ⏭️ Contact ${contact.id} had a lead before (deleted), config: no recreate`);
        } else {
          let shouldCreate = false;
          const reason = [];

          // Kiểm tra điều kiện tạo lead theo config
          switch (autoLeadCfg.trigger) {
            case 'first_message':
              // Tạo ngay khi có tin nhắn đầu tiên
              shouldCreate = true;
              reason.push('first_message trigger');
              break;

            case 'message_count': {
              // Tạo khi đủ X tin nhắn
              const threshold = autoLeadCfg.message_count_threshold || 2;
              const { count: msgCount } = await supabase.from('facebook_messages')
                .select('id', { count: 'exact', head: true })
                .eq('contact_id', contact.id)
                .eq('direction', 'inbound');
              if ((msgCount || 0) >= threshold) {
                shouldCreate = true;
                reason.push(`message_count: ${msgCount} >= ${threshold}`);
              } else {
                console.log(`[FB] ⏳ Contact ${contact.id}: ${msgCount}/${threshold} messages, waiting...`);
              }
              break;
            }

            case 'has_phone':
              // Chỉ tạo khi có SĐT
              if (extractedPhone || contact.phone) {
                shouldCreate = true;
                reason.push(`has_phone: ${extractedPhone || contact.phone}`);
              } else {
                console.log(`[FB] ⏳ Contact ${contact.id}: no phone yet, waiting...`);
              }
              break;

            case 'manual':
              // Không tự động tạo
              console.log(`[FB] ⏭️ Contact ${contact.id}: manual mode, skip auto-create`);
              break;

            default:
              shouldCreate = true;
              reason.push('default trigger');
          }

          if (shouldCreate) {
            const contactName = contact.fb_name || autoLeadCfg.default_customer_name || 'User';

            if (extractedPhone && !contact.phone) {
              const _phoneUpd = { phone: extractedPhone, updated_at: new Date().toISOString() };
              if (hasSyncPausedColumnSync()) _phoneUpd.phone_resolved_at = new Date().toISOString();
              await supabase.from('facebook_contacts').update(_phoneUpd).eq('id', contact.id);
              contact.phone = extractedPhone;
            }

            console.log(`[FB] 🆕 Creating lead: "${contactName}" (${reason.join(', ')})`);
            isFirstMessage = true;
            const lead = await createLeadFromFacebook(pageId, contact, 'Messenger', {
              full_name: contactName,
              phone: extractedPhone || contact.phone,
              address: extractedAddress,
              description: `Tin nhắn đầu tiên: ${content}`,
            });
            if (lead) {
              console.log(`[FB] ✅ Lead created: ${lead.code} — "${contactName}"`);
              contact.lead_id = lead.id;
              await supabase.from('facebook_contacts').update({
                sync_paused: true,
                sync_pause_reason: 'lead_created',
                phone_resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', contact.id);
              if (savedMsg) {
                await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('id', savedMsg.id);
              }

              // Không fetch profile/avatar nền để giảm request Facebook.

              // Notification đã được gửi trong createLeadFromFacebook() — không cần gửi lại
            } else {
              console.log(`[FB] ❌ Failed to create lead`);
            }
          }
        }
      } else {
        // Verify lead vẫn tồn tại — nếu bị xóa thì clear lead_id
        const { data: leadCheck } = await supabase.from('crm_leads')
          .select('id').eq('id', contact.lead_id).single();
        if (!leadCheck) {
          console.log(`[FB] 🗑️ Lead ${contact.lead_id} was deleted, clearing contact.lead_id`);
          await supabase.from('facebook_contacts').update({
            lead_id: null,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id);
          contact.lead_id = null;
        }
      }

      // Auto-reply chỉ cho tin nhắn đầu tiên (khi vừa tạo lead)
      if (isFirstMessage && autoLeadCfg.auto_reply_first_message) {
        const page = await getPageConfig(pageId);
        if (page?.auto_reply_message) {
          await sendMessengerReply(pageId, partnerPsid, page.auto_reply_message);
        }
      }

      // ── Update lead/customer/contact khi có phone/address MỚI (theo config) ──
      // Refresh contact.lead_id vì có thể vừa được tạo trong createLeadFromFacebook ở trên
      if (!contact.lead_id) {
        const { data: refreshed } = await supabase.from('facebook_contacts')
          .select('lead_id, phone').eq('id', contact.id).single();
        if (refreshed) {
          contact.lead_id = refreshed.lead_id;
          if (refreshed.phone && !contact.phone) contact.phone = refreshed.phone;
        }
      }

      // Nếu không tìm thấy SĐT trong tin nhắn hiện tại, quét tin nhắn cũ nếu lead chưa có phone
      if (!extractedPhone && contact.lead_id && !contact.phone) {
        const { data: oldMsgs } = await supabase.from('facebook_messages')
          .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
          .order('created_at', { ascending: false }).limit(500);
        for (const m of (oldMsgs || [])) {
          if (m.content) {
            const ex = extractContactInfo(m.content);
            if (ex.phone) { extractedPhone = ex.phone; break; }
            if (ex.address && !extractedAddress) extractedAddress = ex.address;
          }
        }
        if (extractedPhone) console.log(`[FB] 📞 Found phone in old messages: ${extractedPhone}`);
      }

      if ((extractedPhone && autoLeadCfg.auto_update_phone) || (extractedAddress && autoLeadCfg.auto_update_address)) {
        // Update contact — luôn cập nhật phone mới
        const contactUpd = { updated_at: new Date().toISOString() };
        if (extractedPhone && extractedPhone !== contact.phone) {
          contactUpd.phone = extractedPhone;
          console.log(`[FB] 📞 Contact phone: ${contact.phone || 'N/A'} → ${extractedPhone}`);
        }
        if (Object.keys(contactUpd).length > 1) {
          await supabase.from('facebook_contacts').update(contactUpd).eq('id', contact.id);
        }

        if (contact.lead_id) {
          // Update lead — luôn ghi đè install_address mới nhất
          const leadUpd = { updated_at: new Date().toISOString() };
          if (extractedAddress) leadUpd.install_address = extractedAddress;
          if (extractedPhone) {
            // Cập nhật description với SĐT mới
            const { data: currentLead } = await supabase.from('crm_leads')
              .select('description').eq('id', contact.lead_id).single();
            let desc = currentLead?.description || '';
            if (/SĐT:/.test(desc)) {
              desc = desc.replace(/SĐT:.*$/m, `SĐT: ${extractedPhone}`);
            } else {
              desc = desc.trimEnd() + `\nSĐT: ${extractedPhone}`;
            }
            if (extractedAddress) {
              if (/Địa chỉ:/.test(desc)) {
                desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
              } else {
                desc = desc.trimEnd() + `\nĐịa chỉ: ${extractedAddress}`;
              }
            }
            leadUpd.description = desc.trim();
          }
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
          console.log(`[FB] ✅ Updated lead ${contact.lead_id}:`, { phone: extractedPhone, address: extractedAddress });

          // Update customer — cập nhật phone/address + tên nếu vẫn là 'User'
          const { data: lead } = await supabase.from('crm_leads')
            .select('customer_id, title').eq('id', contact.lead_id).single();
          if (lead?.customer_id) {
            const { data: cust } = await supabase.from('customers')
              .select('full_name, phone, address').eq('id', lead.customer_id).single();
            const custUpd = { updated_at: new Date().toISOString() };
            // Chỉ gán phone nếu customer CHƯA CÓ phone
            if (extractedPhone && !cust?.phone) custUpd.phone = extractedPhone;
            if (extractedAddress && !cust?.address) custUpd.address = extractedAddress;
            // Nếu customer tên vẫn là 'User' và contact đã có tên thật → cập nhật
            if (contact.fb_name && contact.fb_name !== 'User' && contact.fb_name !== 'Facebook User') {
              if (cust?.full_name === 'User' || cust?.full_name === 'Facebook KH' || cust?.full_name === 'Facebook User') {
                custUpd.full_name = contact.fb_name;
                // Cũng cập nhật lead title
                await supabase.from('crm_leads').update({
                  title: `[FB] ${contact.fb_name}`,
                  updated_at: new Date().toISOString(),
                }).eq('id', contact.lead_id);
                console.log(`[FB] 🔄 Updated customer + lead name: "User" → "${contact.fb_name}"`);
              }
            }
            await supabase.from('customers').update(custUpd).eq('id', lead.customer_id);
            console.log(`[FB] ✅ Updated customer ${lead.customer_id}: phone=${extractedPhone}, address=${extractedAddress}`);
          }
        }
      }

      // Push realtime notification
      try {
        if (io) {
          io.emit('fb_message', {
            contact_id: contact.id,
            lead_id: contact.lead_id,
            message: savedMsg,
            contact,
          });
          console.log('[FB] Socket.IO emit fb_message →', contact.fb_name);
        }
      } catch (e) { /* ignore */ }

      console.log(`[FB] Messenger inbound: ${contact.fb_name} → "${content.substring(0, 50)}"`);
    }
  }

  if (event.read) {
    await supabase.from('facebook_contacts').update({ unread_count: 0 }).eq('id', contact.id);
  }
}

// ── HANDLE LEAD ADS ──────────────────────────────────────────

async function handleLeadGen(pageId, value) {
  const leadgenId = value.leadgen_id;
  const formId = value.form_id;
  
  console.log(`[FB] Lead Ad received: leadgen_id=${leadgenId}, form_id=${formId}`);

  // Check duplicate
  const { data: existing } = await supabase.from('facebook_lead_ads')
    .select('id').eq('leadgen_id', leadgenId).single();
  if (existing) { console.log('[FB] Duplicate leadgen, skipping'); return; }

  // Fetch lead data from Facebook
  const page = await getPageConfig(pageId);
  if (!page?.access_token) { console.warn('[FB] No access token for page', pageId); return; }

  let leadData = {};
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${page.access_token}`
    );
    leadData = await resp.json();
  } catch (e) {
    console.error('[FB] Fetch leadgen data error:', e.message);
  }

  // Parse fields
  const fields = {};
  for (const f of (leadData.field_data || [])) {
    fields[f.name] = f.values?.[0] || '';
  }

  const fullName = fields.full_name || fields.first_name
    ? `${fields.first_name || ''} ${fields.last_name || ''}`.trim()
    : 'KH Facebook Ads';
  const phone = fields.phone_number || fields.phone || '';
  const email = fields.email || '';

  // Save raw lead ad data
  const { data: savedAd } = await supabase.from('facebook_lead_ads').insert({
    page_id: pageId,
    leadgen_id: leadgenId,
    form_id: formId,
    form_name: leadData.form_name || value.form_name || null,
    field_data: fields,
    full_name: fullName,
    phone,
    email,
    raw_data: leadData,
  }).select().single();

  // Create contact + lead
  const contact = await getOrCreateContact(pageId, `leadad_${leadgenId}`, fullName);
  if (contact) {
    if (phone) await supabase.from('facebook_contacts').update({ phone, email }).eq('id', contact.id);
    
    const lead = await createLeadFromFacebook(pageId, contact, 'Lead Ads', {
      full_name: fullName,
      phone,
      email,
      description: `Form: ${leadData.form_name || formId}\n` +
        Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n'),
    });

    if (lead && savedAd) {
      await supabase.from('facebook_lead_ads').update({
        customer_id: contact.customer_id,
        lead_id: lead.id,
        processed: true,
      }).eq('id', savedAd.id);
    }
  }
}

// ── HANDLE COMMENTS ──────────────────────────────────────────

async function handleComment(pageId, value) {
  const commentId = value.comment_id;
  if (!commentId) return;

  // Skip page's own comments
  if (value.from?.id === pageId) return;

  console.log(`[FB] Comment: "${(value.message || '').substring(0, 50)}" by ${value.from?.name}`);

  // Check duplicate
  const { data: existing } = await supabase.from('facebook_comments')
    .select('id').eq('comment_id', commentId).single();
  if (existing) return;

  // Save comment
  await supabase.from('facebook_comments').insert({
    page_id: pageId,
    post_id: value.post_id,
    comment_id: commentId,
    parent_comment_id: value.parent_id || null,
    from_id: value.from?.id,
    from_name: value.from?.name,
    message: value.message,
    attachment_url: value.photo || value.video || null,
  });

  // Notify admins
  try {
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'fb_comment',
        title: '💬 Bình luận mới trên Facebook',
        message: `${value.from?.name}: "${(value.message || '').substring(0, 80)}"`,
        entity_type: 'fb_comment',
        entity_id: commentId,
      });
    }
  } catch (e) { /* ignore */ }
}


// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS (Authenticated — for frontend)
// ═══════════════════════════════════════════════════════════════

const { auth: authMiddleware } = require('../middleware/auth');

/** Phạm vi Page FB theo default_company_id: admin ?company_id=; NV chỉ Page gán đúng công ty. */
async function resolveFacebookPageScope(req, res) {
  const { data: pages, error } = await supabase.from('facebook_pages').select('page_id, default_company_id');
  if (error) { res.status(500).json({ error: error.message }); return null; }
  const rows = pages || [];
  if (req.user?.role === 'admin') {
    const co = req.query.company_id && String(req.query.company_id).trim();
    if (co) {
      return { mode: 'filter', pageIds: rows.filter((p) => String(p.default_company_id || '') === co).map((p) => p.page_id) };
    }
    return { mode: 'all', pageIds: null };
  }
  const cid = req.user?.company_id;
  if (!cid) { res.status(400).json({ error: 'Thiếu company_id trên tài khoản — gán công ty cho nhân viên.' }); return null; }
  return {
    mode: 'filter',
    pageIds: rows.filter((p) => p.default_company_id && String(p.default_company_id) === String(cid)).map((p) => p.page_id),
  };
}

// ── Pages config CRUD ────────────────────────────────────────

r.get('/pages', authMiddleware, async (req, res) => {
  try {
    // Try with all columns first
    let { data, error } = await supabase.from('facebook_pages')
      .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, default_lead_owner_id, default_company_id, default_lead_type_id, created_at, webhook_verify_token')
      .order('created_at', { ascending: false });
    
    // Fallback: if column doesn't exist, retry without it
    if (error && (error.message?.includes('default_lead_owner_id') || error.code === '42703')) {
      ({ data, error } = await supabase.from('facebook_pages')
        .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, default_company_id, default_lead_type_id, created_at, webhook_verify_token')
        .order('created_at', { ascending: false }));
    }
    if (error && (error.message?.includes('default_company_id') || error.code === '42703')) {
      ({ data, error } = await supabase.from('facebook_pages')
        .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, default_lead_type_id, created_at, webhook_verify_token')
        .order('created_at', { ascending: false }));
    }
    if (error && (error.message?.includes('default_lead_type_id') || error.code === '42703')) {
      ({ data, error } = await supabase.from('facebook_pages')
        .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, created_at, webhook_verify_token')
        .order('created_at', { ascending: false }));
    }
    if (error) throw error;
    const scope = await resolveFacebookPageScope(req, res);
    if (!scope) return;
    let rows = data || [];
    if (scope.mode === 'filter') {
      const set = new Set(scope.pageIds);
      rows = rows.filter((p) => set.has(p.page_id));
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/pages', authMiddleware, async (req, res) => {
  try {
    const { page_id, page_name, access_token, webhook_verify_token, auto_create_lead, auto_reply_message, default_source_id, default_stage_id, default_company_id, default_lead_owner_id, default_lead_type_id } = req.body;
    const insertData = {
      page_id, page_name, access_token,
      webhook_verify_token: webhook_verify_token || 'tubep_pro_verify_2024',
      auto_create_lead: auto_create_lead !== false,
      auto_reply_message: auto_reply_message || null,
      default_source_id: default_source_id || null,
      default_stage_id: default_stage_id || null,
      created_by: req.user.userId,
    };
    if (default_company_id) insertData.default_company_id = default_company_id;
    if (default_lead_owner_id) insertData.default_lead_owner_id = default_lead_owner_id;
    if (default_lead_type_id) insertData.default_lead_type_id = default_lead_type_id;

    let { data, error } = await supabase.from('facebook_pages').insert(insertData).select().single();
    // Retry without optional columns if they don't exist
    if (error?.message?.includes('default_company_id') || error?.message?.includes('default_lead_owner_id') || error?.message?.includes('default_lead_type_id')) {
      delete insertData.default_company_id;
      delete insertData.default_lead_owner_id;
      delete insertData.default_lead_type_id;
      ({ data, error } = await supabase.from('facebook_pages').insert(insertData).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pages/:id', authMiddleware, async (req, res) => {
  try {
    const update = {};
    ['page_name', 'access_token', 'is_active', 'auto_create_lead', 'auto_reply_message',
     'webhook_verify_token', 'default_source_id', 'default_stage_id', 'default_pipeline_id', 'default_company_id', 'default_lead_owner_id', 'default_lead_type_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    update.updated_at = new Date().toISOString();
    let { data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single();
    if (error?.message?.includes('default_company_id') || error?.message?.includes('default_lead_owner_id') || error?.message?.includes('default_lead_type_id')) {
      delete update.default_company_id;
      delete update.default_lead_owner_id;
      delete update.default_lead_type_id;
      ({ data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/pages/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('facebook_pages').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Contacts (danh sách chat FB) ─────────────────────────────

r.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveFacebookPageScope(req, res);
    if (!scope) return;
    if (scope.mode === 'filter' && !scope.pageIds.length) {
      return res.json({
        data: [], total: 0, offset: 0, limit: Math.min(parseInt(req.query.limit, 10) || 200, 200),
        hasMore: false, nextOffset: 0,
      });
    }
    const { page_id, has_lead, search, limit: rawLimit, offset: rawOffset } = req.query;
    if (page_id && scope.mode === 'filter' && !scope.pageIds.includes(String(page_id))) {
      return res.status(403).json({ error: 'Không có quyền xem Page này' });
    }
    const maxLimit = Math.min(parseInt(rawLimit, 10) || 200, 200);
    const offset = Math.max(parseInt(rawOffset) || 0, 0);
    const base = () => {
      let q = supabase
        .from('facebook_contacts')
        .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)');
      if (scope.mode === 'filter') q = q.in('page_id', scope.pageIds);
      if (page_id) q = q.eq('page_id', page_id);
      if (has_lead === 'true') q = q.not('lead_id', 'is', null);
      if (has_lead === 'false') q = q.is('lead_id', null);
      if (search) q = q.or(`fb_name.ilike.%${search}%,phone.ilike.%${search}%`);
      return q;
    };

    /**
     * Lấy rộng hơn để sort rồi mới paginate.
     *
     * Lưu ý: Nếu ORDER theo last_message_at trước khi LIMIT, các contact "mới tạo" nhưng chưa có last_message_at
     * (event read/delivery, hoặc hồ sơ mới) sẽ bị đẩy xuống cuối và có thể không lọt vào LIMIT khi tổng contact lớn.
     * → Fetch 2 nhóm (có last_message_at, và last_message_at=null) rồi merge để luôn hiển thị user mới.
     */
    const [withMsgRes, noMsgRes] = await Promise.all([
      base()
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3500),
      base()
        .is('last_message_at', null)
        .order('created_at', { ascending: false })
        .limit(2500),
    ]);
    const merged = [...(withMsgRes.data || []), ...(noMsgRes.data || [])];
    // Dedup by id (tránh trường hợp query overlap do filter).
    const seen = new Set();
    let result = [];
    for (const row of merged) {
      const id = row?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(row);
    }
    result.forEach(c => {
      c.display_phone = c.phone || c.customer?.phone || null;
    });
    // Ưu tiên contact hoạt động mới nhất lên đầu.
    result.sort((a, b) => {
      const act = activityTimestampMs(b) - activityTimestampMs(a);
      if (act !== 0) return act;
      const bp = b.display_phone ? 1 : 0;
      const ap = a.display_phone ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return 0;
    });

    const total = result.length;
    const page = result.slice(offset, offset + maxLimit);
    
    if (page.length) {
      const contactIds = page.map(c => c.id);
      const { data: counts } = await supabase.from('facebook_messages')
        .select('contact_id')
        .in('contact_id', contactIds)
        .eq('direction', 'inbound');
      const countMap = {};
      (counts || []).forEach(m => { countMap[m.contact_id] = (countMap[m.contact_id] || 0) + 1; });
      page.forEach(c => {
        c.message_count = countMap[c.id] || 0;
        c.display_phone = c.phone || c.customer?.phone || null;
        Object.assign(c, enrichContactActivityFields(c));
      });
    }

    res.json({
      data: page,
      total,
      offset,
      limit: maxLimit,
      hasMore: offset + page.length < total,
      nextOffset: offset + page.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single contact (check lead still exists)
r.get('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveFacebookPageScope(req, res);
    if (!scope) return;
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (scope.mode === 'filter' && (!scope.pageIds.length || !scope.pageIds.includes(String(contact.page_id)))) {
      return res.status(403).json({ error: 'Không có quyền xem liên hệ này' });
    }
    
    // Nếu lead_id có nhưng lead không tồn tại → clear
    if (contact.lead_id && !contact.lead) {
      await supabase.from('facebook_contacts').update({ lead_id: null }).eq('id', contact.id);
      contact.lead_id = null;
      contact.lead = null;
    }
    contact.display_phone = contact.phone || contact.customer?.phone || null;
    Object.assign(contact, enrichContactActivityFields(contact));

    res.json(contact);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Link contact → existing lead
r.put('/contacts/:id/link-lead', authMiddleware, async (req, res) => {
  try {
    const { lead_id } = req.body;
    const { data, error } = await supabase.from('facebook_contacts')
      .update({ lead_id, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    // Update all messages of this contact
    await supabase.from('facebook_messages').update({ lead_id }).eq('contact_id', req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update contact info (sửa tên, phone, email, ghi chú)
r.put('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const update = {};
    ['fb_name', 'phone', 'email', 'notes', 'lead_id', 'customer_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    // fb_name keep truthy
    if (req.body.fb_name) update.fb_name = req.body.fb_name;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('facebook_contacts')
      .update(update).eq('id', req.params.id)
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete contact (xóa contact + messages)
r.delete('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('facebook_messages').delete().eq('contact_id', req.params.id);
    await supabase.from('facebook_contacts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Tạo lead nhanh từ contact
r.post('/contacts/:id/create-lead', authMiddleware, async (req, res) => {
  try {
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (contact.lead_id) {
      // Verify lead còn tồn tại
      const { data: existLead } = await supabase.from('crm_leads').select('id').eq('id', contact.lead_id).single();
      if (existLead) return res.status(400).json({ error: 'Contact đã có Lead' });
      // Lead đã bị xóa → clear
      await supabase.from('facebook_contacts').update({ lead_id: null }).eq('id', contact.id);
    }

    // Lấy page config
    const { data: page } = await supabase.from('facebook_pages')
      .select('*').eq('page_id', contact.page_id).single();

    const autoLeadCfg = await loadAutoLeadConfig();

    // Company: body override → page default → auto-lead-config default (công ty mặc định trong Setup FB)
    let companyId = req.body.company_id || null;
    if (!companyId && page?.default_company_id) companyId = page.default_company_id;
    if (!companyId && autoLeadCfg?.default_company_id) companyId = autoLeadCfg.default_company_id;

    // Default lead type (company-scoped): page default → auto-lead-config default
    let leadTypeId = null;
    const candidateLeadTypeId = (page?.default_lead_type_id || autoLeadCfg?.default_lead_type_id) || null;
    if (candidateLeadTypeId && companyId) {
      try {
        const { data: lt } = await supabase
          .from('crm_lead_types')
          .select('id, company_id, applies_to, is_active')
          .eq('id', candidateLeadTypeId)
          .maybeSingle();
        if (
          lt
          && String(lt.company_id || '') === String(companyId || '')
          && lt.is_active !== false
          && ['lead', 'both'].includes(String(lt.applies_to || 'both'))
        ) {
          leadTypeId = lt.id;
        }
      } catch (_) { /* ignore */ }
    }

    // Stage: page default → first stage of default pipeline (company) → global first lead stage
    let stageId = page?.default_stage_id || null;
    if (!stageId && companyId) {
      try {
        const { data: defPipe } = await supabase
          .from('crm_pipelines')
          .select('id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at')
          .limit(1)
          .maybeSingle();
        if (defPipe?.id) {
          const { data: firstStage } = await supabase
            .from('crm_pipeline_stages')
            .select('id')
            .eq('pipeline_id', defPipe.id)
            .eq('pipeline_type', 'lead')
            .eq('is_active', true)
            .order('order_index')
            .limit(1)
            .maybeSingle();
          stageId = firstStage?.id || null;
        }
      } catch (_) { /* ignore */ }
    }
    if (!stageId) {
      const { data: defaultStage } = await supabase.from('crm_pipeline_stages')
        .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
      stageId = defaultStage?.id || null;
    }

    // Extract phone/address từ TẤT CẢ tin nhắn cũ
    let extractedPhone = contact.phone || null;
    let extractedAddress = null;
    const { data: messages } = await supabase.from('facebook_messages')
      .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
      .order('created_at', { ascending: false }).limit(500);

    for (const msg of (messages || [])) {
      if (msg.content) {
        const { phone, address } = extractContactInfo(msg.content);
        if (phone && !extractedPhone) extractedPhone = phone;
        if (address && !extractedAddress) extractedAddress = address;
        if (extractedPhone && extractedAddress) break;
      }
    }

    console.log(`[FB] Manual create lead — name: ${contact.fb_name}, phone: ${extractedPhone}, address: ${extractedAddress}`);

    // Tạo/lấy customer
    let customerId = contact.customer_id;
    if (!customerId) {
      const { data: customer } = await supabase.from('customers').insert({
        full_name: contact.fb_name || 'KH Facebook',
        phone: extractedPhone || '',
        address: extractedAddress,
        source: 'Facebook',
      }).select().single();
      if (customer) {
        customerId = customer.id;
        await supabase.from('facebook_contacts').update({ 
          customer_id: customer.id,
          phone: extractedPhone || contact.phone,
        }).eq('id', contact.id);
      }
    } else {
      // Update customer nếu có thông tin mới
      const custUpd = {};
      if (extractedPhone) custUpd.phone = extractedPhone;
      if (extractedAddress) custUpd.address = extractedAddress;
      if (Object.keys(custUpd).length) {
        await supabase.from('customers').update(custUpd).eq('id', customerId);
      }
    }

    const resolvedSourceId = await resolveFacebookSourceId(page);

    const ownerId = page?.default_lead_owner_id || page?.created_by || req.user.userId;
    // IMPORTANT: tạo lead qua API CRM chuẩn để auto-gen tasks + tạo Đơn 1 (fulfillment)
    const port = process.env.PORT || 3000;
    const { data: lead } = await axios.post(`http://localhost:${port}/api/crm/leads`, {
      title: `[FB] ${contact.fb_name || 'KH Facebook'}`,
      customer_id: customerId || null,
      stage_id: stageId || null,
      company_id: companyId || null,
      lead_type_id: leadTypeId || null,
      source_id: resolvedSourceId || null,
      install_address: extractedAddress || null,
      description: `Từ Facebook Messenger\nTên: ${contact.fb_name || ''}\nSĐT: ${extractedPhone || ''}\nĐịa chỉ: ${extractedAddress || ''}`.trim(),
      assigned_to: ownerId || null,
    }, { headers: { authorization: req.headers.authorization } });

    // Link contact → lead + messages
    await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);
    await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);

    console.log(`[FB] ✅ Manual lead created: ${lead.code} — ${lead.title}`);
    res.status(201).json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Dọn SĐT: nếu không quét được SĐT mới từ tin inbound nhưng đang lưu SĐT cũ → xóa SĐT (+ KH trùng chuỗi, mô tả lead).
 * Nếu SĐT quét được trùng SĐT đang lưu → không thay đổi.
 * Body: { delete_lead_if_no_phone?: bool, sync_graph_first?: bool (default true), graph_pages?: number }
 */
r.post('/contacts/:id/reconcile-inbound-phone', authMiddleware, async (req, res) => {
  try {
    const deleteLeadIfNoPhone = !!req.body?.delete_lead_if_no_phone;
    const syncGraphFirst = req.body?.sync_graph_first !== false;
    let messagesSynced = 0;
    let syncStatus = null;
    let graphError = null;
    if (syncGraphFirst) {
      const { data: contact } = await supabase
        .from('facebook_contacts')
        .select('id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at')
        .eq('id', req.params.id)
        .single();
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      const pageTokens = {};
      const gp = Math.min(30, Math.max(1, parseInt(req.body?.graph_pages, 10) || FB_SYNC_BATCH_GRAPH_MAX_PAGES));
      const syncRes = await graphSyncMessagesForContactRow(contact, pageTokens, { maxGraphPages: gp });
      messagesSynced = syncRes.synced || 0;
      syncStatus = syncRes.status;
      graphError = syncRes.graph_error || null;
      await applyExtractFromDbMessagesForContact(contact, { forceRescanPhones: true });
    }
    const result = await reconcileInboundPhoneAfterScan(supabase, req.params.id, { deleteLeadIfNoPhone });
    res.json({
      ...result,
      messages_synced: messagesSynced,
      sync_status: syncStatus,
      graph_error: graphError,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync lịch sử hội thoại cũ từ Facebook cho 1 contact
r.post('/contacts/:id/sync-history', authMiddleware, async (req, res) => {
  try {
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const page = await getPageConfig(contact.page_id);
    if (!page?.access_token) return res.status(400).json({ error: 'No page token' });

    const { convId, lastError: convErr } = await graphResolveConversationIdForPsid(
      contact.page_id,
      contact.psid,
      page.access_token,
    );
    if (!convId) {
      return res.json({
        synced: 0,
        message: 'Không tìm thấy hội thoại',
        graph_error: convErr || null,
      });
    }

    // Step 2: Get messages (nhiều trang — SĐT hay nằm trong text ở tin cũ hơn 50)
    const msgList = await graphFetchConversationMessages(convId, page.access_token, {
      maxPages: FB_SYNC_SINGLE_MAX_PAGES,
      limitPerPage: 100,
    });
    if (!msgList.length) return res.json({ synced: 0, message: 'Không có tin nhắn' });

    let synced = 0;
    for (const msg of msgList) {
      // Check duplicate (memory lock + DB check)
      const fbMsgId = msg.id;
      if (!acquireMidLock(fbMsgId)) continue;
      const { data: existing } = await supabase.from('facebook_messages')
        .select('id').eq('fb_message_id', fbMsgId).limit(1);
      if (existing?.length) continue;

      const isFromPage = msg.from?.id === contact.page_id;
      let attachmentUrl = null;
      let messageType = 'text';
      if (msg.attachments?.data?.[0]) {
        const att = msg.attachments.data[0];
        attachmentUrl = att.image_data?.url || att.file_url || att.url || null;
        messageType = att.mime_type?.startsWith('image') ? 'image' : att.mime_type?.startsWith('video') ? 'video' : att.mime_type?.startsWith('audio') ? 'audio' : 'file';
      }

      await supabase.from('facebook_messages').insert({
        contact_id: contact.id,
        lead_id: contact.lead_id,
        fb_message_id: fbMsgId,
        direction: isFromPage ? 'outbound' : 'inbound',
        message_type: messageType,
        content: msg.message || (attachmentUrl ? `[${messageType}]` : ''),
        attachment_url: attachmentUrl,
        created_at: msg.created_time || new Date().toISOString(),
      });
      synced++;
    }

    // ── Auto tạo lead nếu contact chưa có ──
    let leadCreated = null;
    if (!contact.lead_id && synced > 0) {
      // Extract phone/address từ messages vừa sync
      let extractedPhone = contact.phone || null;
      let extractedAddress = null;
      const { data: allMsgs } = await supabase.from('facebook_messages')
        .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(500);
      
      for (const m of (allMsgs || [])) {
        if (m.content) {
          const { phone, address } = extractContactInfo(m.content);
          if (phone && !extractedPhone) extractedPhone = phone;
          if (address && !extractedAddress) extractedAddress = address;
          if (extractedPhone && extractedAddress) break;
        }
      }

      // Update contact phone
      if (extractedPhone && !contact.phone) {
        await supabase.from('facebook_contacts').update({ phone: extractedPhone }).eq('id', contact.id);
      }

      // Tạo lead
      const lead = await createLeadFromFacebook(contact.page_id, contact, 'Messenger (sync)', {
        full_name: contact.fb_name,
        phone: extractedPhone,
        address: extractedAddress,
      });
      if (lead) {
        leadCreated = lead;
        // Không backfill lead_id cho toàn bộ messages khi sync lịch sử để giảm egress.
        console.log(`[FB Sync] ✅ Lead auto-created: ${lead.code} — ${contact.fb_name}`);
      }
    }

    res.json({
      synced,
      total: msgList.length,
      message: `Đã đồng bộ ${synced} tin nhắn mới` + (leadCreated ? ` + tạo Lead ${leadCreated.code}` : ''),
      lead: leadCreated ? { id: leadCreated.id, code: leadCreated.code, title: leadCreated.title } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Messages (lịch sử chat) ─────────────────────────────────

r.get('/contacts/:contactId/messages', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_messages')
      .select('*')
      .eq('contact_id', req.params.contactId)
      .order('created_at', { ascending: true })
      .limit(200);
    
    // Mark as read
    await supabase.from('facebook_contacts').update({ unread_count: 0 }).eq('id', req.params.contactId);
    
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get messages by lead_id
r.get('/leads/:leadId/messages', authMiddleware, async (req, res) => {
  try {
    // Tìm contact linked to lead
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('id, fb_name, fb_profile_pic, phone, psid, page_id')
      .eq('lead_id', req.params.leadId).limit(1).single();
    
    if (!contact) {
      // Fallback: tìm messages trực tiếp theo lead_id
      const { data } = await supabase.from('facebook_messages')
        .select('*, contact:facebook_contacts(id, fb_name, fb_profile_pic, phone, psid, page_id)')
        .eq('lead_id', req.params.leadId)
        .order('created_at', { ascending: true })
        .limit(200);
      return res.json(data || []);
    }

    // Lấy TẤT CẢ messages của contact (không chỉ theo lead_id)
    const { data } = await supabase.from('facebook_messages')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true })
      .limit(500);
    
    // Gắn contact info vào mỗi message
    const messages = (data || []).map(m => ({ ...m, contact }));
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Send reply via Messenger
r.post('/contacts/:contactId/reply', authMiddleware, async (req, res) => {
  try {
    const { message, attachment_url, attachment_type } = req.body;
    if (!message && !attachment_url) return res.status(400).json({ error: 'Message or attachment required' });

    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.contactId).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    let result;
    let msgType = 'text';
    let content = message || '';

    // Gửi attachment nếu có
    if (attachment_url) {
      const type = attachment_type || 'file'; // image, audio, video, file
      result = await sendMessengerAttachment(contact.page_id, contact.psid, type, attachment_url);
      msgType = type;
      if (!content) content = `[${type}]`;
    }

    // Gửi text nếu có
    if (message) {
      result = await sendMessengerReply(contact.page_id, contact.psid, message);
    }

    if (result?.error) return res.status(500).json({ error: result.error.message });

    // Save outbound message
    const { data: saved } = await supabase.from('facebook_messages').insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: result?.message_id,
      direction: 'outbound',
      message_type: msgType,
      content,
      attachment_url: attachment_url || null,
      attachment_type: attachment_type || null,
      sent_by: req.user.userId,
    }).select().single();

    res.json(saved);

    // Update last_message_at cho contact
    const outPreview = content ? content.substring(0, 100) : (attachment_url ? '[Tệp đính kèm]' : '');
    await supabase.from('facebook_contacts').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: outPreview ? `Bạn: ${outPreview}` : null,
    }).eq('id', contact.id);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/contacts/backfill-last-message — backfill last_message_at từ facebook_messages
r.post('/contacts/backfill-last-message', authMiddleware, async (req, res) => {
  try {
    const { data: msgs } = await supabase.from('facebook_messages')
      .select('contact_id, created_at').order('created_at', { ascending: false });
    const maxByContact = {};
    (msgs || []).forEach(m => {
      if (!maxByContact[m.contact_id] || m.created_at > maxByContact[m.contact_id])
        maxByContact[m.contact_id] = m.created_at;
    });
    const entries = Object.entries(maxByContact);
    let updated = 0;
    for (const [contactId, lastAt] of entries) {
      const { error } = await supabase.from('facebook_contacts')
        .update({ last_message_at: lastAt }).eq('id', contactId).is('last_message_at', null);
      if (!error) updated++;
    }
    console.log(`[FB Backfill] Updated ${updated} contacts with last_message_at`);
    res.json({ updated, total: entries.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/lead-ads', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_lead_ads')
      .select('*, lead:crm_leads(id, title, code)')
      .order('created_at', { ascending: false })
      .limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Comments ─────────────────────────────────────────────────

r.get('/comments', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reply to comment
r.post('/comments/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const { data: comment } = await supabase.from('facebook_comments')
      .select('*').eq('id', req.params.id).single();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const page = await getPageConfig(comment.page_id);
    if (!page?.access_token) return res.status(400).json({ error: 'No page token' });

    // Reply via Graph API
    const resp = await fetch(`https://graph.facebook.com/v19.0/${comment.comment_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: page.access_token }),
    });
    const result = await resp.json();
    if (result.error) return res.status(500).json({ error: result.error.message });

    // Update comment as replied
    await supabase.from('facebook_comments').update({ replied: true, reply_text: message }).eq('id', req.params.id);
    
    res.json({ success: true, comment_id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard stats ──────────────────────────────────────────

r.get('/stats', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveFacebookPageScope(req, res);
    if (!scope) return;
    if (scope.mode === 'filter' && !scope.pageIds.length) {
      return res.json({
        total_contacts: 0,
        messages_today: 0,
        lead_ads_today: 0,
        comments_today: 0,
        total_unread: 0,
        page_stats: [],
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const week = new Date(Date.now() - 7 * 86400000).toISOString();

    const inPages = (col) => {
      if (scope.mode !== 'filter') return col;
      return col.in('page_id', scope.pageIds);
    };

    const [contacts, messages, leadAds, comments, unread, allContacts, pages] = await Promise.all([
      inPages(supabase.from('facebook_contacts').select('id', { count: 'exact', head: true })),
      (async () => {
        const { data: cids } = await inPages(supabase.from('facebook_contacts').select('id'));
        const ids = (cids || []).map((c) => c.id);
        if (!ids.length) return { count: 0 };
        let total = 0;
        const CH = 500;
        for (let i = 0; i < ids.length; i += CH) {
          const slice = ids.slice(i, i + CH);
          const { count } = await supabase.from('facebook_messages')
            .select('id', { count: 'exact', head: true })
            .eq('direction', 'inbound')
            .gte('created_at', today)
            .in('contact_id', slice);
          total += count || 0;
        }
        return { count: total };
      })(),
      supabase.from('facebook_lead_ads').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('facebook_comments').select('id', { count: 'exact', head: true }).gte('created_at', today),
      inPages(supabase.from('facebook_contacts').select('unread_count, page_id').gt('unread_count', 0)),
      inPages(supabase.from('facebook_contacts').select('id, page_id, created_at')),
      (async () => {
        let q = supabase.from('facebook_pages').select('page_id, page_name').eq('is_active', true);
        if (scope.mode === 'filter') q = q.in('page_id', scope.pageIds);
        return await q;
      })(),
    ]);

    // Tính số user mới theo page (7 ngày gần nhất)
    const contactsData = allContacts.data || [];
    const pagesData = pages.data || [];
    const newContactsByPage = {};
    const totalByPage = {};
    contactsData.forEach(c => {
      totalByPage[c.page_id] = (totalByPage[c.page_id] || 0) + 1;
      if (c.created_at >= week) {
        newContactsByPage[c.page_id] = (newContactsByPage[c.page_id] || 0) + 1;
      }
    });
    const unreadMap = {};
    const unreadData = unread.data || [];
    unreadData.forEach(c => {
      unreadMap[c.page_id] = (unreadMap[c.page_id] || 0) + (c.unread_count || 0);
    });
    
    const pageStats = pagesData.map(p => ({
      page_id: p.page_id,
      page_name: p.page_name,
      total_contacts: totalByPage[p.page_id] || 0,
      new_contacts_7d: newContactsByPage[p.page_id] || 0,
      unread_count: unreadMap[p.page_id] || 0,
    }));

    res.json({
      total_contacts: contacts.count || 0,
      messages_today: messages.count || 0,
      lead_ads_today: leadAds.count || 0,
      comments_today: comments.count || 0,
      total_unread: (unread.data || []).reduce((s, c) => s + c.unread_count, 0),
      page_stats: pageStats,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS — Phân tích hành vi khách hàng
// ═══════════════════════════════════════════════════════════════

r.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const { page_id: rawPageId, days = 30 } = req.query;
    const page_id = rawPageId && String(rawPageId).trim() ? String(rawPageId).trim() : null;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // 1. Contacts — phân trang (Supabase mặc định tối đa ~1000/request)
    const contacts = await fetchAllAnalyticsContacts({ page_id });

    const totalContacts = contacts.length;
    const hasPhone = contacts.filter(c => c.phone).length;
    const hasLead = contacts.filter(c => c.lead_id).length;

    // Deals — .in() quá dài có thể lỗi; chia batch
    const leadIds = contacts.filter(c => c.lead_id).map(c => c.lead_id);
    let dealCount = 0;
    const DEAL_IN_BATCH = 500;
    for (let b = 0; b < leadIds.length; b += DEAL_IN_BATCH) {
      const slice = leadIds.slice(b, b + DEAL_IN_BATCH);
      const { count } = await supabase.from('crm_leads')
        .select('id', { count: 'exact', head: true })
        .in('id', slice)
        .eq('type', 'deal');
      dealCount += count || 0;
    }

    // 2. Messages — tải hết trong khoảng ngày (không dừng ở 1000 bản ghi)
    const pageContactIds = contacts.map(c => c.id);
    let messages = [];
    if (page_id && pageContactIds.length) {
      messages = await fetchAllAnalyticsMessagesForContactIds(pageContactIds, since);
    } else if (page_id) {
      messages = [];
    } else {
      messages = await fetchAllAnalyticsMessagesSince(since);
    }

    // By day + hour
    const byDay = {};
    const byHour = Array(24).fill(0);
    const inboundByHour = Array(24).fill(0);
    messages.forEach(m => {
      const d = new Date(m.created_at);
      const day = d.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { date: day, inbound: 0, outbound: 0, total: 0 };
      byDay[day][m.direction === 'inbound' ? 'inbound' : 'outbound']++;
      byDay[day].total++;
      const hour = d.getUTCHours();
      byHour[hour]++;
      if (m.direction === 'inbound') inboundByHour[hour]++;
    });

    // New contacts by day
    const newByDay = {};
    contacts.forEach(c => {
      const day = new Date(c.created_at).toISOString().split('T')[0];
      if (day >= since.split('T')[0]) { newByDay[day] = (newByDay[day] || 0) + 1; }
    });

    // Funnel
    const funnel = {
      total_contacts: totalContacts,
      has_phone: hasPhone, has_lead: hasLead, has_deal: dealCount,
      phone_rate: totalContacts ? Math.round(hasPhone / totalContacts * 100) : 0,
      lead_rate: totalContacts ? Math.round(hasLead / totalContacts * 100) : 0,
      deal_rate: hasLead ? Math.round(dealCount / hasLead * 100) : 0,
      overall_rate: totalContacts ? Math.round(dealCount / totalContacts * 100) : 0,
    };

    // Page breakdown — mọi Page đã đăng ký (kể cả 0 liên hệ) để đối chiếu webhook / nhiều Page
    const { data: pages } = await supabase.from('facebook_pages').select('page_id, page_name, is_active');
    const pageBk = {};
    (pages || []).forEach((p) => {
      const label = p.page_name || p.page_id;
      pageBk[p.page_id] = {
        page_id: p.page_id,
        page_name: p.is_active === false ? `${label} (tắt)` : label,
        contacts: 0,
        has_phone: 0,
        has_lead: 0,
      };
    });
    contacts.forEach((c) => {
      if (!pageBk[c.page_id]) {
        pageBk[c.page_id] = { page_id: c.page_id, page_name: String(c.page_id), contacts: 0, has_phone: 0, has_lead: 0 };
      }
      pageBk[c.page_id].contacts++;
      if (c.phone) pageBk[c.page_id].has_phone++;
      if (c.lead_id) pageBk[c.page_id].has_lead++;
    });

    // Avg response time
    let totalRT = 0, rtCount = 0;
    const byC = {};
    messages.forEach(m => { if (!byC[m.contact_id]) byC[m.contact_id] = []; byC[m.contact_id].push(m); });
    Object.values(byC).forEach(cm => {
      for (let i = 0; i < cm.length - 1; i++) {
        if (cm[i].direction === 'inbound' && cm[i + 1].direction === 'outbound') {
          const diff = new Date(cm[i + 1].created_at) - new Date(cm[i].created_at);
          if (diff > 0 && diff < 86400000) { totalRT += diff; rtCount++; }
        }
      }
    });

    res.json({
      totalContacts,
      registeredPages: (pages || []).length,
      hasPhone,
      hasLead,
      dealCount,
      totalMessages: messages.length,
      inboundMessages: messages.filter(m => m.direction === 'inbound').length,
      outboundMessages: messages.filter(m => m.direction === 'outbound').length,
      messagesByDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      messagesByHour: byHour.map((t, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, total: t, inbound: inboundByHour[h] })),
      newContactsByDay: newByDay,
      conversionFunnel: funnel,
      pageBreakdown: Object.values(pageBk),
      avgResponseTime: rtCount ? Math.round(totalRT / rtCount / 60000) : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Tạo lead cho TẤT CẢ contacts chưa có lead + Extract SĐT
// POST /facebook/dedup-leads — Gộp lead trùng: giữ lead tốt nhất, chuyển data, xóa phần dư
r.post('/dedup-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;

    // 1. Lấy tất cả leads (không join customer để tránh lỗi FK)
    const { data: allLeads, error: leadsErr } = await supabase.from('crm_leads')
      .select('id, code, customer_id, source_id, title, type, estimated_value, created_at, updated_at, stage_id, assigned_to, description, install_address')
      .eq('type', 'lead')
      .order('created_at', { ascending: false })
      .limit(5000);
    
    if (leadsErr) {
      console.error('[Dedup] Query error:', leadsErr.message);
      return res.status(500).json({ error: `Query lỗi: ${leadsErr.message}` });
    }
    if (!allLeads?.length) return res.json({ merged: 0, scanned: 0, message: 'Không có lead nào' });

    // 1b. Lấy customers riêng
    const custIds = [...new Set(allLeads.map(l => l.customer_id).filter(Boolean))];
    const custMap = {};
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers')
        .select('id, full_name, phone').in('id', custIds);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    // Attach customer data
    allLeads.forEach(l => { l.customer = custMap[l.customer_id] || null; });

    // 2. Lấy FB contacts map
    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('id, lead_id, psid, fb_name, phone, page_id').not('lead_id', 'is', null);
    const fbLeadMap = {}; // lead_id → { psid, fb_name, phone }
    const psidLeadMap = {}; // psid → [lead_ids]
    (fbContacts || []).forEach(c => {
      if (c.lead_id) fbLeadMap[c.lead_id] = c;
      if (c.psid) {
        if (!psidLeadMap[c.psid]) psidLeadMap[c.psid] = new Set();
        psidLeadMap[c.psid].add(c.lead_id);
      }
    });

    // 3. Normalize SĐT → last 9 digits
    const normalizePhone = (p) => {
      if (!p) return null;
      const clean = p.replace(/[^0-9]/g, '');
      return clean.length >= 9 ? clean.slice(-9) : null;
    };

    // 4. Build union-find groups bằng nhiều tiêu chí
    const leadById = {};
    allLeads.forEach(l => { leadById[l.id] = l; });

    // Parent map cho union-find
    const parent = {};
    allLeads.forEach(l => { parent[l.id] = l.id; });
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    // Group by customer_id
    const byCustomer = {};
    allLeads.forEach(l => {
      if (!l.customer_id) return;
      if (!byCustomer[l.customer_id]) byCustomer[l.customer_id] = [];
      byCustomer[l.customer_id].push(l.id);
    });
    Object.values(byCustomer).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by PSID
    Object.values(psidLeadMap).forEach(leadIdSet => {
      const ids = [...leadIdSet];
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by phone (last 9 digits)
    const byPhone = {};
    allLeads.forEach(l => {
      const p = normalizePhone(l.customer?.phone);
      if (!p) return;
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(l.id);
    });
    Object.values(byPhone).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by Title chuẩn hóa (loại [FB], lowercase, trim)
    const byTitle = {};
    allLeads.forEach(l => {
      const norm = (l.title || '').replace(/\[.*?\]/g, '').toLowerCase().trim();
      // Bỏ qua tên chung chung
      if (!norm || norm === 'kh facebook' || norm === 'user' || norm === 'facebook user' || norm.length < 3) return;
      if (!byTitle[norm]) byTitle[norm] = [];
      byTitle[norm].push(l.id);
    });
    Object.values(byTitle).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    console.log(`[Dedup] Scanned ${allLeads.length} leads | Groups: customer=${Object.values(byCustomer).filter(v=>v.length>1).length}, psid=${Object.values(psidLeadMap).filter(v=>v.size>1).length}, phone=${Object.values(byPhone).filter(v=>v.length>1).length}, title=${Object.values(byTitle).filter(v=>v.length>1).length}`);

    // 5. Collect groups
    const groups = {};
    allLeads.forEach(l => {
      const root = find(l.id);
      if (!groups[root]) groups[root] = [];
      groups[root].push(l);
    });

    // Filter: chỉ groups có >= 2 leads
    const dupGroups = Object.values(groups).filter(g => g.length > 1);
    if (!dupGroups.length) {
      return res.json({ merged: 0, scanned: allLeads.length, message: 'Không có lead trùng cần gộp' });
    }

    if (io) io.emit('batch_progress', { type: 'dedup', phase: 'start', total: dupGroups.length, current: 0 });

    let totalMerged = 0;
    const details = [];

    for (let g = 0; g < dupGroups.length; g++) {
      const group = dupGroups[g];

      // Chọn lead tốt nhất: ưu tiên có FB link > có phone > có value > cũ nhất (đầu tiên tạo)
      group.sort((a, b) => {
        const aFb = fbLeadMap[a.id] ? 1 : 0;
        const bFb = fbLeadMap[b.id] ? 1 : 0;
        if (bFb !== aFb) return bFb - aFb;
        const aPhone = (a.customer?.phone) ? 1 : 0;
        const bPhone = (b.customer?.phone) ? 1 : 0;
        if (bPhone !== aPhone) return bPhone - aPhone;
        const aVal = a.estimated_value || 0;
        const bVal = b.estimated_value || 0;
        if (bVal !== aVal) return bVal - aVal;
        return new Date(a.created_at) - new Date(b.created_at); // oldest first = keep
      });

      const keep = group[0];
      const dupes = group.slice(1);

      for (const dupe of dupes) {
        try {
          // Gộp estimated_value
          if (dupe.estimated_value > 0 && !keep.estimated_value) {
            await supabase.from('crm_leads').update({ estimated_value: dupe.estimated_value }).eq('id', keep.id);
          }
          // Gộp phone nếu keep thiếu
          const keepCust = custMap[keep.customer_id];
          const dupeCust = custMap[dupe.customer_id];
          if (keepCust && !keepCust.phone && dupeCust?.phone) {
            await supabase.from('customers').update({ phone: dupeCust.phone }).eq('id', keep.customer_id);
            keepCust.phone = dupeCust.phone;
          }
          // Gộp install_address nếu keep thiếu
          if (!keep.install_address && dupe.install_address) {
            await supabase.from('crm_leads').update({ install_address: dupe.install_address }).eq('id', keep.id);
          }

          // Move related data → keep
          await supabase.from('facebook_contacts').update({ lead_id: keep.id }).eq('lead_id', dupe.id);
          await supabase.from('facebook_messages').update({ lead_id: keep.id }).eq('lead_id', dupe.id);
          try { await supabase.from('crm_pipeline_history').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('crm_tasks').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('crm_activities').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_documents').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('quotations').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('orders').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('invoices').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_members').delete().eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_messages').delete().eq('lead_id', dupe.id); } catch (_) {}

          // Xóa duplicate lead
          await supabase.from('crm_leads').delete().eq('id', dupe.id);

          // Xóa customer trùng nếu không còn lead nào dùng
          if (dupe.customer_id && dupe.customer_id !== keep.customer_id) {
            const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('customer_id', dupe.customer_id);
            if (count === 0) {
              try { await supabase.from('customers').delete().eq('id', dupe.customer_id); } catch (_) {}
            }
          }

          totalMerged++;
          details.push({ deleted: dupe.code, kept: keep.code, reason: `Gộp → ${keep.code}` });
        } catch (e) {
          console.error(`[Dedup] Error merging ${dupe.code} → ${keep.code}:`, e.message);
          details.push({ deleted: dupe.code, kept: keep.code, reason: `Lỗi: ${e.message}` });
        }
      }

      if (io) io.emit('batch_progress', { type: 'dedup', current: g + 1, total: dupGroups.length, name: `${keep.code} (gộp ${dupes.length})`, status: 'merged' });
    }

    const summary = {
      merged: totalMerged,
      scanned: allLeads.length,
      groups: dupGroups.length,
      details: details.slice(0, 100),
      message: totalMerged > 0
        ? `Đã gộp ${totalMerged} lead trùng (${dupGroups.length} nhóm)`
        : 'Không có lead trùng cần gộp',
    };
    if (io) io.emit('batch_done', { type: 'dedup', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DEBUG: Scan duplicate leads — hiển thị nhóm trùng theo title + phone + customer
r.get('/scan-duplicates-debug', authMiddleware, async (req, res) => {
  try {
    const { data: allLeads, error: err } = await supabase.from('crm_leads')
      .select('id, code, title, customer_id, source_id, created_at')
      .eq('type', 'lead')
      .limit(5000);
    
    if (err) return res.status(500).json({ error: err.message });

    // Lấy customer phone riêng
    const custIds = [...new Set(allLeads.map(l => l.customer_id).filter(Boolean))];
    const custMap = {};
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers').select('id, full_name, phone').in('id', custIds);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    
    // Group theo title chuẩn hóa
    const byTitle = {};
    allLeads.forEach(l => {
      const norm = (l.title || '').replace(/\[.*?\]/g, '').toLowerCase().trim();
      if (!norm || norm === 'kh facebook' || norm === 'user' || norm === 'facebook user' || norm.length < 3) return;
      if (!byTitle[norm]) byTitle[norm] = [];
      const cust = custMap[l.customer_id];
      byTitle[norm].push({ id: l.id, code: l.code, title: l.title, phone: cust?.phone, custName: cust?.full_name, customer_id: l.customer_id });
    });

    // Group theo phone (last 9 digits)
    const byPhone = {};
    allLeads.forEach(l => {
      const cust = custMap[l.customer_id];
      const raw = cust?.phone;
      if (!raw) return;
      const clean = raw.replace(/[^0-9]/g, '');
      const norm = clean.length >= 9 ? clean.slice(-9) : null;
      if (!norm) return;
      if (!byPhone[norm]) byPhone[norm] = [];
      byPhone[norm].push({ id: l.id, code: l.code, title: l.title, phone: raw, customer_id: l.customer_id });
    });

    const titleDups = Object.entries(byTitle)
      .filter(([_, leads]) => leads.length > 1)
      .map(([title, leads]) => ({ match: 'title', key: title, count: leads.length, leads }));

    const phoneDups = Object.entries(byPhone)
      .filter(([_, leads]) => leads.length > 1)
      .map(([phone, leads]) => ({ match: 'phone', key: phone, count: leads.length, leads }));

    res.json({
      total_leads: allLeads.length,
      title_groups: titleDups.length,
      phone_groups: phoneDups.length,
      duplicates: [...titleDups, ...phoneDups],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/batch-create-leads
// ═══════════════════════════════════════════════════════════════

r.post('/sync-source-ids', authMiddleware, async (req, res) => {
  try {
    // Phân trang 1000 dòng/lần thay vì tải toàn bộ 1 lần
    const allContacts = [];
    let pageFrom = 0;
    while (true) {
      const { data: page } = await supabase.from('facebook_contacts')
        .select('lead_id, page_id')
        .not('lead_id', 'is', null)
        .not('page_id', 'is', null)
        .range(pageFrom, pageFrom + 999);
      if (!page?.length) break;
      allContacts.push(...page);
      if (page.length < 1000) break;
      pageFrom += 1000;
    }

    const leadPageMap = new Map();
    for (const row of allContacts) {
      if (!row.lead_id || !row.page_id || leadPageMap.has(row.lead_id)) continue;
      leadPageMap.set(row.lead_id, row.page_id);
    }

    let updated = 0;
    const details = [];
    for (const [leadId, pageId] of leadPageMap.entries()) {
      const page = await getPageConfig(pageId);
      if (!page) continue;
      const sourceId = await resolveFacebookSourceId(page);
      if (!sourceId) continue;
      const { data: lead } = await supabase.from('crm_leads').select('id, source_id, code').eq('id', leadId).single();
      if (!lead || lead.source_id === sourceId) continue;
      await supabase.from('crm_leads').update({ source_id: sourceId, updated_at: new Date().toISOString() }).eq('id', leadId);
      updated++;
      details.push({ lead_id: leadId, code: lead.code, page_id: pageId, source_id: sourceId });
    }

    res.json({ total: leadPageMap.size, updated, details });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/batch-create-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    // Giới hạn số contact tải mỗi lần để tránh egress lớn (ENV: FB_BATCH_LEADS_CAP, mặc định 500)
    const BATCH_CAP = Math.min(5000, Math.max(50, parseInt(process.env.FB_BATCH_LEADS_CAP || '500', 10) || 500));

    // ── Tôn trọng auto-lead-config (giống webhook) để tránh tạo lead "rác" ──
    const autoLeadCfg = await loadAutoLeadConfig();
    const triggerMode = String(autoLeadCfg?.trigger || 'first_message');
    if (triggerMode === 'manual') {
      return res.json({
        created: 0, updated: 0, skipped: 0, total: 0,
        results: [],
        message: 'Auto-lead trigger = manual → bỏ qua batch tạo lead',
      });
    }

    // Lấy contacts chưa có lead — giới hạn BATCH_CAP, ưu tiên hoạt động gần nhất
    await ensureSyncPausedColumnDetected();
    const _useSyncPaused = hasSyncPausedColumnSync();
    const _selectCols = _useSyncPaused
      ? 'id, fb_name, phone, page_id, last_message_at, created_at, lead_id, sync_paused, customer_id'
      : 'id, fb_name, phone, page_id, last_message_at, created_at, lead_id, customer_id';
    let baseQuery = supabase.from('facebook_contacts')
      .select(_selectCols)
      .is('lead_id', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(BATCH_CAP);
    if (_useSyncPaused) baseQuery = baseQuery.neq('sync_paused', true);
    if (triggerMode === 'has_phone') {
      baseQuery = baseQuery.not('phone', 'is', null).neq('phone', '');
    }
    const { data: contactsRaw, error: baseErr } = await baseQuery;
    if (baseErr) console.error('[FB Batch] query error:', baseErr.message);
    const contacts = sortFacebookContactsNewestFirst(contactsRaw);

    if (!contacts?.length) return res.json({ created: 0, updated: 0, skipped: 0, total: 0, results: [], message: 'Không có contact nào cần xử lý' });

    let created = 0, updated = 0, skipped = 0;
    const results = [];
    const total = contacts.length;

    // Không prefetch theo .in(..).limit(K) vì LIMIT áp dụng cho cả batch → đa số contact sẽ không có tin.
    // Thay vào đó: với mỗi contact, lấy K tin gần nhất trong DB để extract SĐT/địa chỉ.
    const MSG_PER_CONTACT = Math.min(400, Math.max(20, parseInt(process.env.FB_CREATE_LEADS_MSG_PER_CONTACT || '120', 10) || 120));

    // Cache page configs
    const pageConfigCache = {};

    // Emit start
    if (io) io.emit('batch_progress', { type: 'create_leads', phase: 'start', total, current: 0 });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      try {
        // Verify lead chưa có (double check)
        if (contact.lead_id) { skipped++; continue; }

        // Lấy page config (cached)
        if (!pageConfigCache[contact.page_id]) {
          pageConfigCache[contact.page_id] = await getPageConfig(contact.page_id);
        }
        const page = pageConfigCache[contact.page_id];
        if (!page || !page.is_active) {
          results.push({ contact: contact.fb_name, status: 'skipped', reason: 'Page không active' });
          skipped++;
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'skipped' });
          continue;
        }

        // Extract phone/address từ pre-fetched messages
        let extractedPhone = contact.phone || null;
        let extractedAddress = null;

        const { data: messages } = await supabase.from('facebook_messages')
          .select('content, direction, created_at')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(MSG_PER_CONTACT);
        
        // Chỉ tin inbound (KH FB). Không fallback quét outbound — tránh lấy SĐT từ tin page / template.
        const inboundInfo = extractInboundContactInfo(messages || [], {});
        if (!extractedPhone && inboundInfo.phone) extractedPhone = inboundInfo.phone;
        if (!extractedAddress && inboundInfo.address) extractedAddress = inboundInfo.address;

        // Fallback bổ sung: vẫn chỉ các tin direction === 'inbound' (phòng DB lưu sai chiều hiếm gặp thì đã xử lý ở trên).
        for (const msg of (messages || [])) {
          if (msg.direction !== 'inbound' || !msg.content) continue;
          const { phone, address } = extractContactInfo(msg.content);
          if (phone && !extractedPhone) extractedPhone = phone;
          if (address && !extractedAddress) extractedAddress = address;
          if (extractedPhone && extractedAddress) break;
        }

        // Cập nhật phone vào contact nếu tìm được
        if (extractedPhone && !contact.phone) {
          await supabase.from('facebook_contacts').update({
            phone: extractedPhone,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id);
          updated++;
        }

        // ── Gate theo autoLeadCfg.trigger (giống webhook) ──
        if (triggerMode === 'has_phone') {
          const finalPhone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);
          if (!finalPhone) {
            results.push({
              contact_id: contact.id,
              contact: contact.fb_name,
              phone: null,
              status: 'skipped',
              reason: 'trigger=has_phone, chưa tìm thấy SĐT',
            });
            skipped++;
            if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'skipped' });
            continue;
          }
        } else if (triggerMode === 'message_count') {
          const threshold = Math.max(1, parseInt(autoLeadCfg?.message_count_threshold, 10) || 2);
          const { count: msgCount } = await supabase.from('facebook_messages')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', contact.id)
            .eq('direction', 'inbound');
          if ((msgCount || 0) < threshold) {
            results.push({
              contact_id: contact.id,
              contact: contact.fb_name,
              phone: extractedPhone || null,
              status: 'skipped',
              reason: `trigger=message_count, ${msgCount || 0}/${threshold} tin`,
            });
            skipped++;
            if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'skipped' });
            continue;
          }
        }

        // Tạo lead
        const lead = await createLeadFromFacebook(contact.page_id, contact, 'Messenger (batch)', {
          full_name: contact.fb_name,
          phone: extractedPhone,
          address: extractedAddress,
        });

        if (lead) {
          // Link messages → lead
          await supabase.from('facebook_messages')
            .update({ lead_id: lead.id }).eq('contact_id', contact.id);
          
          created++;
          results.push({
            contact_id: contact.id,
            contact: contact.fb_name,
            phone: extractedPhone || null,
            lead_code: lead.code,
            status: 'created',
          });
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'created', code: lead.code, phone: extractedPhone });
          console.log(`[FB Batch] ✅ Lead ${lead.code} — ${contact.fb_name} (phone: ${extractedPhone || 'N/A'})`);
        } else {
          results.push({ contact_id: contact.id, contact: contact.fb_name, status: 'failed', reason: 'createLeadFromFacebook returned null' });
          skipped++;
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'failed' });
        }
      } catch (e) {
        results.push({ contact_id: contact.id, contact: contact.fb_name, status: 'error', reason: e.message });
        skipped++;
        if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'error' });
        console.error(`[FB Batch] ❌ ${contact.fb_name}:`, e.message);
      }
    }

    const summary = { total, created, phone_updated: updated, skipped, results };
    if (io) io.emit('batch_done', { type: 'create_leads', ...summary });
    console.log(`[FB Batch] Done: created=${created}, updated=${updated}, skipped=${skipped}`);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// SYNC PHONE: Contacts đã có SĐT → cập nhật vào lead/customer ngay
// POST /facebook/sync-contact-phones
// ═══════════════════════════════════════════════════════════════
r.post('/sync-contact-phones', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    console.log('[SyncPhone] START — contacts có phone → lead/customer');

    // Lấy tất cả contacts có phone (phân trang)
    let contacts = [];
    let pageStart = 0;
    while (true) {
      const { data: page } = await supabase.from('facebook_contacts')
        .select('id, fb_name, phone, lead_id, customer_id, last_message_at, created_at')
        .not('psid', 'is', null)
        .not('phone', 'is', null)
        .neq('phone', '')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(pageStart, pageStart + 999);
      if (!page?.length) break;
      contacts = contacts.concat(page);
      if (page.length < 1000) break;
      pageStart += 1000;
    }

    const total = contacts.length;
    console.log(`[SyncPhone] ${total} contacts có SĐT`);
    if (io) io.emit('batch_progress', { type: 'sync_contact_phones', phase: 'start', total, current: 0, name: `Tìm thấy ${total} contacts có SĐT` });

    if (!total) return res.json({ total: 0, updated: 0, skipped: 0, alreadyHad: 0, noLead: 0, details: [] });

    // Load leads
    const leadIds = [...new Set(contacts.map(c => c.lead_id).filter(Boolean))];
    const leadMap = {};
    for (let b = 0; b < leadIds.length; b += 500) {
      const { data: ls } = await supabase.from('crm_leads')
        .select('id, code, title, customer_id, description')
        .in('id', leadIds.slice(b, b + 500));
      (ls || []).forEach(l => { leadMap[l.id] = l; });
    }

    // Load customers
    const custIds = [...new Set([
      ...contacts.map(c => c.customer_id).filter(Boolean),
      ...Object.values(leadMap).map(l => l.customer_id).filter(Boolean),
    ])];
    const custMap = {};
    for (let b = 0; b < custIds.length; b += 500) {
      const { data: cs } = await supabase.from('customers')
        .select('id, phone, address')
        .in('id', custIds.slice(b, b + 500));
      (cs || []).forEach(c => { custMap[c.id] = c; });
    }

    let updated = 0, alreadyHad = 0, noLead = 0, skipped = 0;
    const details = []; // contacts đã được update
    const stillMissing = []; // contacts có lead nhưng vẫn thiếu (skip)

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const phone = String(c.phone).trim();
      const lead = c.lead_id ? leadMap[c.lead_id] : null;
      const custId = lead?.customer_id || c.customer_id;
      let cust = custId ? custMap[custId] : null;

      if (io && i % 50 === 0) {
        io.emit('batch_progress', { type: 'sync_contact_phones', current: i + 1, total, name: c.fb_name || c.id });
      }

      if (!lead) { noLead++; continue; }

      // Fetch customer trực tiếp nếu thiếu trong cache
      if (!cust && custId) {
        const { data: fc } = await supabase.from('customers').select('id, phone, address').eq('id', custId).single();
        if (fc) { cust = fc; custMap[custId] = fc; }
      }

      const customerAlreadyHasPhone = cust?.phone && String(cust.phone).trim();
      // Description đã có SĐT đúng chưa
      const descHasPhone = lead.description && new RegExp(`SĐT:\s*${phone.replace(/[+]/g, '\\+')}`).test(lead.description);

      if (customerAlreadyHasPhone && descHasPhone) {
        alreadyHad++;
        continue; // Đã đầy đủ, bỏ qua
      }

      const custUpd = {};
      const leadUpd = { updated_at: new Date().toISOString() };

      // Update customer phone nếu còn trống
      if (!customerAlreadyHasPhone && custId) {
        custUpd.phone = phone;
        await supabase.from('customers').update(custUpd).eq('id', custId);
        if (custMap[custId]) custMap[custId].phone = phone;
        else custMap[custId] = { id: custId, phone };
      }

      // Update lead description
      let desc = lead.description || '';
      if (!descHasPhone) {
        if (/SĐT:/.test(desc)) {
          desc = desc.replace(/SĐT:.*$/m, `SĐT: ${phone}`);
        } else {
          desc = `${desc.trimEnd()}\nSĐT: ${phone}`.trim();
        }
        leadUpd.description = desc;
      }

      if (Object.keys(leadUpd).length > 1) {
        await supabase.from('crm_leads').update(leadUpd).eq('id', lead.id);
      }

      updated++;
      details.push({
        contact_id: c.id,
        fb_name: c.fb_name,
        phone,
        lead_id: lead.id,
        lead_code: lead.code,
        lead_title: lead.title,
        updated_customer: !customerAlreadyHasPhone,
        updated_desc: !!leadUpd.description,
      });

      if (io) io.emit('batch_progress', { type: 'sync_contact_phones', current: i + 1, total, name: c.fb_name, status: 'updated', phone });
    }

    const summary = { total, updated, alreadyHad, noLead, skipped, details: details.slice(0, 500) };
    console.log(`[SyncPhone] DONE total=${total} updated=${updated} alreadyHad=${alreadyHad} noLead=${noLead}`);
    if (io) io.emit('batch_done', { type: 'sync_contact_phones', ...summary });
    res.json(summary);
  } catch (e) {
    console.error('[SyncPhone] ERROR', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Extract SĐT từ tin nhắn cho contacts ĐÃ CÓ lead nhưng thiếu phone
// POST /facebook/batch-extract-phones
// ═══════════════════════════════════════════════════════════════

r.post('/batch-extract-phones', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    // offset/limit cho phép pipeline gọi theo batch 300
    const reqOffset = parseInt(req.body?.offset) || 0;
    const reqLimit  = parseInt(req.body?.limit)  || 0; // 0 = lấy tất cả
    const skipStaleExtract = !!req.body?.skip_stale_customer_reply;
    const recentHoursBody = Math.min(Math.max(0, parseInt(req.body?.recent_hours, 10) || 0), 168);
    const pipelineAligned = !!req.body?.pipeline_aligned;
    const recentForWindow = recentHoursBody > 0 ? recentHoursBody : (pipelineAligned ? AUTO_PIPELINE_RECENT_HOURS : 0);
    const usedPipelineWindow = reqLimit > 0 && recentForWindow > 0;

    console.log(`[ExtractPhones] START offset=${reqOffset} limit=${reqLimit || 'all'} recent=${recentForWindow || '—'} pipeline=${pipelineAligned}`);

    let contacts = [];
    if (usedPipelineWindow) {
      const { contacts: wl } = await loadFacebookContactsForBatchPipeline({
        recentHours: recentForWindow,
        applyStaleFilter: skipStaleExtract,
      });
      contacts = wl.slice(reqOffset, reqOffset + reqLimit);
    } else if (reqLimit > 0) {
      const { data: page } = await supabase.from('facebook_contacts')
        .select('*')
        .not('psid', 'is', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(reqOffset, reqOffset + reqLimit - 1);
      contacts = page || [];
    } else {
      let pageStart = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: page } = await supabase.from('facebook_contacts')
          .select('*')
          .not('psid', 'is', null)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(pageStart, pageStart + PAGE_SIZE - 1);
        if (!page?.length) break;
        contacts = contacts.concat(page);
        if (page.length < PAGE_SIZE) break;
        pageStart += PAGE_SIZE;
      }
    }
    console.log(`[ExtractPhones] Loaded ${contacts.length} contacts`);

    if (skipStaleExtract && contacts.length && !usedPipelineWindow) {
      const inboundMap = await fetchLastInboundAtByContactIds(contacts.map((c) => c.id));
      if (inboundMap) {
        const fr = filterContactsStaleCustomerNoReply(contacts, inboundMap);
        contacts = fr.contacts;
        if (fr.excluded) console.log(`[ExtractPhones] Loại ${fr.excluded} contact (không liên lạc >${AUTO_PIPELINE_RECENT_HOURS}h)`);
      }
    }

    if (!contacts?.length) {
      return res.json({ total: 0, updated: 0, message: 'Không có contact nào để quét' });
    }

    // Chạy tay + auto pipeline: cùng thứ tự mới→cũ (kể cả batch pipeline_aligned).
    contacts.sort((a, b) => {
      const act = activityTimestampMs(b) - activityTimestampMs(a);
      if (act !== 0) return act;
      const score = (c) => {
        let s = 0;
        if (!c.phone) s += 2;
        if (!c.lead_id) s += 0.5;
        return s;
      };
      return score(b) - score(a);
    });

    let updated = 0;
    let foundPhones = 0;
    let foundAddresses = 0;
    let noInfo = 0;
    let updatedContactPhone = 0;
    let updatedCustomerPhone = 0;
    let updatedCustomerAddress = 0;
    let updatedLeadAddress = 0;
    let updatedLeadDescription = 0;
    const results = [];

    // ── Fix #3: Phân trang leadIds/custIds theo batch 500 để tránh Supabase 1000-row limit ──
    const leadIds = [...new Set(contacts.map(c => c.lead_id).filter(Boolean))];
    const leadMap = {};
    for (let b = 0; b < leadIds.length; b += 500) {
      const batch = leadIds.slice(b, b + 500);
      const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, description, install_address').in('id', batch);
      (leads || []).forEach(l => { leadMap[l.id] = l; });
    }

    const custIds = [...new Set([
      ...Object.values(leadMap).map((l) => l.customer_id).filter(Boolean),
      ...contacts.map((c) => c.customer_id).filter(Boolean),
    ])];
    const custMap = {};
    for (let b = 0; b < custIds.length; b += 500) {
      const batch = custIds.slice(b, b + 500);
      const { data: custs } = await supabase.from('customers').select('id, phone, address').in('id', batch);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    console.log(`[ExtractPhones] Loaded ${Object.keys(leadMap).length} leads, ${Object.keys(custMap).length} customers`);

    const forceRescanPhones = !!req.body?.force_rescan_phones;
    let skippedHasPhone = 0;
    let contactsToProcess = contacts;
    if (!forceRescanPhones) {
      const kept = [];
      for (const c of contacts) {
        if (!c.lead_id) {
          kept.push(c);
          continue;
        }
        const ld = leadMap[c.lead_id];
        const custFromLead = ld?.customer_id ? custMap[ld.customer_id] : null;
        const custFromContact = c.customer_id ? custMap[c.customer_id] : null;
        const custForSkip = custFromLead || custFromContact;
        if (leadLinkedPhoneAlreadyStored(c, ld, custForSkip)) skippedHasPhone += 1;
        else kept.push(c);
      }
      contactsToProcess = kept;
      if (skippedHasPhone) console.log(`[ExtractPhones] Bỏ qua ${skippedHasPhone} contact (lead đã có SĐT), quét ${contactsToProcess.length}`);
    }

    const total = contactsToProcess.length;

    if (io) {
      io.emit('batch_progress', {
        type: 'extract_phones',
        phase: 'start',
        total,
        pool_contacts: contacts.length,
        skipped_has_phone: skippedHasPhone,
        current: 0,
      });
    }

    for (let i = 0; i < contactsToProcess.length; i++) {
      const contact = contactsToProcess[i];
      const lead = leadMap[contact.lead_id];
      let cust = lead ? custMap[lead.customer_id] : null;

      console.log(`[ExtractPhones] Scan ${i + 1}/${total}: ${contact.fb_name || contact.id}`);
      const MSG_PAGE = 800;
      const { data: messages } = await supabase.from('facebook_messages')
        .select('id, content, direction, created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(MSG_PAGE);

      let inboundInfo = extractInboundContactInfo(messages || [], {});
      let extractedPhone = inboundInfo.phone;
      let extractedAddress = inboundInfo.address;
      let extraPhones = inboundInfo.extraPhones;

      // Fallback: nếu page tin nhắn mới nhất chưa thấy SĐT/địa chỉ,
      // thử quét thêm 1 page tin nhắn cũ hơn (giảm trường hợp KH gửi SĐT ở đoạn chat cũ).
      if ((!extractedPhone && !extractedAddress) && (messages || []).length === MSG_PAGE) {
        const { data: older } = await supabase.from('facebook_messages')
          .select('id, content, direction, created_at')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .range(MSG_PAGE, MSG_PAGE * 2 - 1);

        if (older?.length) {
          const merged = [...(messages || []), ...older];
          inboundInfo = extractInboundContactInfo(merged, {});
          extractedPhone = inboundInfo.phone;
          extractedAddress = inboundInfo.address;
          extraPhones = inboundInfo.extraPhones;
          if (extractedPhone || extractedAddress) {
            console.log(`[ExtractPhones] Fallback older-page hit: phone=${extractedPhone || '—'} addr=${extractedAddress ? 'Y' : '—'} contact=${contact.id}`);
          }
        }
      }

      if (extractedPhone) {
        const sourceMsg = (messages || []).find(m => m.content && extractContactInfo(m.content).phone === extractedPhone);
        if (sourceMsg) console.log(`[ExtractPhones] inbound phone ${extractedPhone} from msg ${sourceMsg.id} contact=${contact.id}`);
      }

      // ── Fix #1 & #4: Fallback sang contact.phone nếu tin nhắn không tìm được số mới ──
      const effectivePhone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);

      if (!effectivePhone && !extractedAddress && extraPhones.length === 0) {
        noInfo++;
        results.push({ contact_id: contact.id, contact: contact.fb_name, phone: null, address: null, status: 'no_info_found' });
        if (io) io.emit('batch_progress', { type: 'extract_phones', current: i + 1, total, name: contact.fb_name, status: 'no_info' });
        continue;
      }

      const contactUpd = { updated_at: new Date().toISOString() };
      if (extractedPhone) {
        const had = contact.phone && String(contact.phone).trim();
        const same = had && String(contact.phone).trim() === String(extractedPhone).trim();
        if (!had) {
          contactUpd.phone = extractedPhone;
          foundPhones++;
        } else if (forceRescanPhones && !same) {
          contactUpd.phone = extractedPhone;
          foundPhones++;
        }
      }
      if (Object.keys(contactUpd).length > 1) {
        await supabase.from('facebook_contacts').update(contactUpd).eq('id', contact.id);
        if (contactUpd.phone) updatedContactPhone++;
      }

      // ── Fix #1: Dùng effectivePhone (bao gồm contact.phone sẵn có) để sync sang customer ──
      const leadCustId = lead?.customer_id || contact.customer_id;
      // Nếu custMap thiếu (do không được load ban đầu) → fetch trực tiếp
      if (!cust && leadCustId) {
        const { data: freshCust } = await supabase.from('customers').select('id, phone, address').eq('id', leadCustId).single();
        if (freshCust) { cust = freshCust; custMap[leadCustId] = freshCust; }
      }
      if (leadCustId) {
        const custUpd = {};
        if (extractedPhone) {
          if (!cust?.phone || !String(cust.phone).trim()) custUpd.phone = extractedPhone;
          else if (forceRescanPhones && String(cust.phone).trim() !== String(extractedPhone).trim()) {
            custUpd.phone = extractedPhone;
          }
        } else if (effectivePhone && (!cust?.phone || !String(cust.phone).trim())) {
          custUpd.phone = effectivePhone;
        }
        if (extractedAddress && extractedAddress !== cust?.address) {
          custUpd.address = extractedAddress;
          foundAddresses++;
        }
        if (Object.keys(custUpd).length) {
          await supabase.from('customers').update(custUpd).eq('id', leadCustId);
          if (custUpd.phone) {
            updatedCustomerPhone++;
            const newPh = custUpd.phone;
            if (custMap[leadCustId]) custMap[leadCustId].phone = newPh;
            else custMap[leadCustId] = { id: leadCustId, phone: newPh };
          }
          if (custUpd.address) updatedCustomerAddress++;
        }
      }

      if (lead && contact.lead_id) {
        const leadUpd = { updated_at: new Date().toISOString() };
        if (extractedAddress && extractedAddress !== lead.install_address) leadUpd.install_address = extractedAddress;

        // Cập nhật title nếu đang là tên mặc định
        const defaultNames = ['kh facebook', 'facebook user', 'user', '[fb]'];
        const currentTitle = (lead.title || '').toLowerCase().trim();
        if (contact.fb_name && defaultNames.some(d => currentTitle.startsWith(d) || currentTitle === d)) {
          const newTitle = contact.fb_name;
          if (newTitle !== lead.title) leadUpd.title = newTitle;
        }

        let desc = lead.description || '';
        if (effectivePhone) {
          if (/SĐT:/.test(desc)) {
            const oldMatch = desc.match(/SĐT:\s*(\S*)/);
            // Chỉ update nếu SĐT trống hoặc khác
            if (!oldMatch?.[1] || oldMatch[1] !== effectivePhone) {
              desc = desc.replace(/SĐT:.*$/m, `SĐT: ${effectivePhone}`);
            }
          } else {
            desc = `${desc.trimEnd()}\nSĐT: ${effectivePhone}`.trim();
          }
        }
        if (extractedAddress) {
          if (/Địa chỉ:/.test(desc)) desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
          else desc = `${desc.trimEnd()}\nĐịa chỉ: ${extractedAddress}`.trim();
        }
        if (extraPhones.length) {
          if (/SĐT khác:/.test(desc)) desc = desc.replace(/SĐT khác:.*$/m, `SĐT khác: ${extraPhones.join(', ')}`);
          else desc = `${desc.trimEnd()}\nSĐT khác: ${extraPhones.join(', ')}`.trim();
        }
        if (desc !== (lead.description || '')) leadUpd.description = desc;

        if (Object.keys(leadUpd).length > 1) {
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
          if (leadUpd.install_address) updatedLeadAddress++;
          if (leadUpd.description) updatedLeadDescription++;
        }
      }

      updated++;
      results.push({
        contact_id: contact.id,
        contact: contact.fb_name,
        phone: effectivePhone || cust?.phone || null,
        address: extractedAddress || cust?.address || lead?.install_address || null,
        extraPhones: extraPhones.length ? extraPhones : undefined,
        status: extractedPhone ? 'updated_phone' : (effectivePhone && !extractedPhone) ? 'synced_existing' : extractedAddress ? 'updated_address' : 'refreshed',
      });
      if (io) io.emit('batch_progress', {
        type: 'extract_phones',
        current: i + 1,
        total,
        name: contact.fb_name,
        status: 'found',
        phone: extractedPhone || contact.phone || cust?.phone || null,
        address: extractedAddress || cust?.address || lead?.install_address || null,
      });
    }

    // ═══ VÒNG CUỐI: Sync phone từ customer → lead cho TẤT CẢ leads ═══
    console.log('[ExtractPhones] 🔄 Vòng cuối: sync customer.phone → lead...');
    if (io) io.emit('batch_progress', { type: 'extract_phones', phase: 'lead_sync', current: 0, total: 0, name: 'Sync SĐT vào lead...' });

    const leadsUpdated = [];
    let leadsStillMissing = 0;

    // Lấy tất cả leads loại 'lead' có customer_id
    let allLeads = [];
    let lp = 0;
    while (true) {
      const { data: lpage } = await supabase.from('crm_leads')
        .select('id, code, title, customer_id, description')
        .eq('type', 'lead')
        .not('customer_id', 'is', null)
        .range(lp, lp + 999);
      if (!lpage?.length) break;
      allLeads = allLeads.concat(lpage);
      if (lpage.length < 1000) break;
      lp += 1000;
    }

    // Lấy tất cả customers có phone
    const allCustIds = [...new Set(allLeads.map(l => l.customer_id))];
    const fullCustMap = {};
    for (let b = 0; b < allCustIds.length; b += 500) {
      const batch = allCustIds.slice(b, b + 500);
      const { data: custs } = await supabase.from('customers').select('id, phone').in('id', batch);
      (custs || []).forEach(c => { fullCustMap[c.id] = c; });
    }

    for (const lead of allLeads) {
      const cPhone = fullCustMap[lead.customer_id]?.phone;
      const leadUpd = {};

      // SĐT vào description
      if (cPhone && String(cPhone).trim()) {
        let desc = lead.description || '';
        const hasPhoneInDesc = /SĐT:\s*\S/.test(desc);
        if (hasPhoneInDesc) {
          const match = desc.match(/SĐT:\s*(\S+)/);
          if (!match || match[1] !== cPhone) {
            desc = desc.replace(/SĐT:.*$/m, `SĐT: ${cPhone}`);
            leadUpd.description = desc;
          }
        } else {
          desc = `${desc.trimEnd()}\nSĐT: ${cPhone}`.trim();
          leadUpd.description = desc;
        }
      } else {
        leadsStillMissing++;
      }

      if (Object.keys(leadUpd).length) {
        leadUpd.updated_at = new Date().toISOString();
        await supabase.from('crm_leads').update(leadUpd).eq('id', lead.id);
        leadsUpdated.push({ id: lead.id, code: lead.code, title: lead.title, phone: cPhone });
      }
    }

    // Đếm leads vẫn thiếu phone hoàn toàn (customer cũng không có)
    const totalLeads = allLeads.length;
    const leadsWithPhone = totalLeads - leadsStillMissing;

    console.log(`[ExtractPhones] ✅ Lead sync done: updated=${leadsUpdated.length}, withPhone=${leadsWithPhone}, stillMissing=${leadsStillMissing}, totalLeads=${totalLeads}`);

    const summary = {
      total,
      pool_contacts: contacts.length,
      skipped_has_phone: skippedHasPhone,
      force_rescan_phones: forceRescanPhones,
      updated,
      foundPhones,
      foundAddresses,
      noInfo,
      updatedContactPhone,
      updatedCustomerPhone,
      updatedCustomerAddress,
      updatedLeadAddress,
      updatedLeadDescription,
      // Vòng cuối: lead sync
      leadsUpdatedPhone: leadsUpdated.length,
      leadsWithPhone,
      leadsStillMissingPhone: leadsStillMissing,
      totalLeads,
      leadsUpdatedList: leadsUpdated.slice(0, 200), // giới hạn 200 mẫu
      results,
    };
    console.log(`[ExtractPhones] DONE pool=${contacts.length} quét=${total} bỏ_qua_đã_SĐT=${skippedHasPhone} updated=${updated} phones=${foundPhones} addresses=${foundAddresses} noInfo=${noInfo} leadsUpdatedPhone=${leadsUpdated.length}`);
    if (io) io.emit('batch_done', { type: 'extract_phones', ...summary });
    res.json(summary);
  } catch (e) {
    console.error('[ExtractPhones] ERROR', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Đồng bộ tin nhắn Graph → DB cho 1 contact (dùng chung batch-sync & chuỗi sync→quét).
 * @returns {{ synced: number, status: string, error?: string, graph_error?: object|null }}
 */
async function graphSyncMessagesForContactRow(contact, pageTokens, { maxGraphPages } = {}) {
  const pages = maxGraphPages ?? FB_SYNC_BATCH_GRAPH_MAX_PAGES;
  try {
    if (!pageTokens[contact.page_id]) {
      const page = await getPageConfig(contact.page_id);
      pageTokens[contact.page_id] = page?.access_token || null;
    }
    const token = pageTokens[contact.page_id];
    if (!token) return { synced: 0, status: 'no_token' };

    const { convId, lastError: convResolveError } = await graphResolveConversationIdForPsid(
      contact.page_id,
      contact.psid,
      token,
    );
    if (!convId) {
      if (convResolveError) {
        console.warn('[FB] graphSync no conversation', contact.id, convResolveError.message || JSON.stringify(convResolveError));
      }
      return { synced: 0, status: 'no_conv', graph_error: convResolveError || null };
    }
    const msgList = await graphFetchConversationMessages(convId, token, {
      maxPages: pages,
      limitPerPage: 100,
    });
    if (!msgList.length) return { synced: 0, status: 'no_msg' };

    let synced = 0;
    for (const msg of msgList) {
      const fbMsgId = msg.id;
      if (!acquireMidLock(fbMsgId)) continue;
      const { data: existing } = await supabase.from('facebook_messages')
        .select('id').eq('fb_message_id', fbMsgId).limit(1);
      if (existing?.length) continue;

      const isFromPage = msg.from?.id === contact.page_id;
      let attachmentUrl = null;
      let messageType = 'text';
      if (msg.attachments?.data?.[0]) {
        const att = msg.attachments.data[0];
        attachmentUrl = att.image_data?.url || att.file_url || att.url || null;
        messageType = att.mime_type?.startsWith('image') ? 'image' : att.mime_type?.startsWith('video') ? 'video' : att.mime_type?.startsWith('audio') ? 'audio' : 'file';
      }

      await supabase.from('facebook_messages').insert({
        contact_id: contact.id,
        lead_id: contact.lead_id,
        fb_message_id: fbMsgId,
        direction: isFromPage ? 'outbound' : 'inbound',
        message_type: messageType,
        content: msg.message || (attachmentUrl ? `[${messageType}]` : ''),
        attachment_url: attachmentUrl,
        created_at: msg.created_time || new Date().toISOString(),
      });
      synced += 1;
    }

    const upd = { last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (synced > 0 || !contact.last_message_at) {
      const latestTime = msgList[0]?.created_time;
      if (latestTime) upd.last_message_at = latestTime;
    }
    await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);

    return { synced, status: synced > 0 ? 'synced' : 'up_to_date' };
  } catch (err) {
    try {
      await supabase.from('facebook_contacts').update({ last_synced_at: new Date().toISOString() }).eq('id', contact.id);
    } catch (_) {}
    return { synced: 0, status: 'error', error: err.message };
  }
}

/**
 * Quét SĐT/địa chỉ từ DB cho 1 contact (không chạy vòng cuối sync toàn lead).
 */
async function applyExtractFromDbMessagesForContact(contact, { forceRescanPhones = false } = {}) {
  const { data: fresh } = await supabase.from('facebook_contacts')
    .select('id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, last_synced_at, created_at')
    .eq('id', contact.id)
    .single();
  if (!fresh) return { outcome: 'error', detail: 'no_contact' };

  let lead = null;
  let cust = null;
  if (fresh.lead_id) {
    const { data: ld } = await supabase.from('crm_leads')
      .select('id, customer_id, description, install_address, title')
      .eq('id', fresh.lead_id)
      .single();
    lead = ld || null;
    if (lead?.customer_id) {
      const { data: c } = await supabase.from('customers').select('id, phone, address').eq('id', lead.customer_id).single();
      cust = c || null;
    }
  }
  if (!cust && fresh.customer_id) {
    const { data: c2 } = await supabase.from('customers').select('id, phone, address').eq('id', fresh.customer_id).single();
    cust = c2 || null;
  }

  if (!forceRescanPhones && leadLinkedPhoneAlreadyStored(fresh, lead, cust)) {
    return { outcome: 'skipped_has_phone' };
  }

  const { data: messages } = await supabase.from('facebook_messages')
    .select('id, content, direction, created_at')
    .eq('contact_id', fresh.id)
    .order('created_at', { ascending: false })
    .limit(800);

  const inboundInfo = extractInboundContactInfo(messages || [], {});
  let extractedPhone = inboundInfo.phone;
  let extractedAddress = inboundInfo.address;
  const extraPhones = inboundInfo.extraPhones;
  const effectivePhone = extractedPhone || (fresh.phone && String(fresh.phone).trim() ? fresh.phone : null);

  if (!effectivePhone && !extractedAddress && extraPhones.length === 0) {
    return { outcome: 'no_info' };
  }

  const contactUpd = { updated_at: new Date().toISOString() };
  if (extractedPhone && !fresh.phone) contactUpd.phone = extractedPhone;
  if (Object.keys(contactUpd).length > 1) {
    await supabase.from('facebook_contacts').update(contactUpd).eq('id', fresh.id);
  }

  const leadCustId = lead?.customer_id || fresh.customer_id;
  if (leadCustId) {
    if (!cust && leadCustId) {
      const { data: freshCust } = await supabase.from('customers').select('id, phone, address').eq('id', leadCustId).single();
      if (freshCust) cust = freshCust;
    }
    const custUpd = {};
    if (effectivePhone && (!cust?.phone || !String(cust.phone).trim())) custUpd.phone = effectivePhone;
    if (extractedAddress && extractedAddress !== cust?.address) custUpd.address = extractedAddress;
    if (Object.keys(custUpd).length) {
      await supabase.from('customers').update(custUpd).eq('id', leadCustId);
    }
  }

  if (lead && fresh.lead_id) {
    const leadUpd = { updated_at: new Date().toISOString() };
    if (extractedAddress && extractedAddress !== lead.install_address) leadUpd.install_address = extractedAddress;
    const defaultNames = ['kh facebook', 'facebook user', 'user', '[fb]'];
    const currentTitle = (lead.title || '').toLowerCase().trim();
    if (fresh.fb_name && defaultNames.some((d) => currentTitle.startsWith(d) || currentTitle === d)) {
      const newTitle = fresh.fb_name;
      if (newTitle !== lead.title) leadUpd.title = newTitle;
    }
    let desc = lead.description || '';
    if (effectivePhone) {
      if (/SĐT:/.test(desc)) {
        const oldMatch = desc.match(/SĐT:\s*(\S*)/);
        if (!oldMatch?.[1] || oldMatch[1] !== effectivePhone) desc = desc.replace(/SĐT:.*$/m, `SĐT: ${effectivePhone}`);
      } else {
        desc = `${desc.trimEnd()}\nSĐT: ${effectivePhone}`.trim();
      }
    }
    if (extractedAddress) {
      if (/Địa chỉ:/.test(desc)) desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
      else desc = `${desc.trimEnd()}\nĐịa chỉ: ${extractedAddress}`.trim();
    }
    if (extraPhones.length) {
      if (/SĐT khác:/.test(desc)) desc = desc.replace(/SĐT khác:.*$/m, `SĐT khác: ${extraPhones.join(', ')}`);
      else desc = `${desc.trimEnd()}\nSĐT khác: ${extraPhones.join(', ')}`.trim();
    }
    if (desc !== (lead.description || '')) leadUpd.description = desc;
    if (Object.keys(leadUpd).length > 1) {
      await supabase.from('crm_leads').update(leadUpd).eq('id', fresh.lead_id);
    }
  }

  return {
    outcome: 'updated',
    phone: effectivePhone || cust?.phone || null,
    address: extractedAddress || cust?.address || lead?.install_address || null,
    extractedPhone: !!extractedPhone,
  };
}

/** Vòng cuối: customer.phone → mô tả lead (giống batch-extract-phones). */
async function runExtractPhonesFinalLeadDescriptionSync() {
  let allLeads = [];
  let lp = 0;
  while (true) {
    const { data: lpage } = await supabase.from('crm_leads')
      .select('id, code, title, customer_id, description')
      .eq('type', 'lead')
      .not('customer_id', 'is', null)
      .range(lp, lp + 999);
    if (!lpage?.length) break;
    allLeads = allLeads.concat(lpage);
    if (lpage.length < 1000) break;
    lp += 1000;
  }
  const allCustIds = [...new Set(allLeads.map((l) => l.customer_id))];
  const fullCustMap = {};
  for (let b = 0; b < allCustIds.length; b += 500) {
    const batch = allCustIds.slice(b, b + 500);
    const { data: custs } = await supabase.from('customers').select('id, phone').in('id', batch);
    (custs || []).forEach((c) => { fullCustMap[c.id] = c; });
  }
  const leadsUpdated = [];
  let leadsStillMissing = 0;
  for (const lead of allLeads) {
    const cPhone = fullCustMap[lead.customer_id]?.phone;
    const leadUpd = {};
    if (cPhone && String(cPhone).trim()) {
      let desc = lead.description || '';
      const hasPhoneInDesc = /SĐT:\s*\S/.test(desc);
      if (hasPhoneInDesc) {
        const match = desc.match(/SĐT:\s*(\S+)/);
        if (!match || match[1] !== cPhone) {
          desc = desc.replace(/SĐT:.*$/m, `SĐT: ${cPhone}`);
          leadUpd.description = desc;
        }
      } else {
        desc = `${desc.trimEnd()}\nSĐT: ${cPhone}`.trim();
        leadUpd.description = desc;
      }
    } else {
      leadsStillMissing += 1;
    }
    if (Object.keys(leadUpd).length) {
      leadUpd.updated_at = new Date().toISOString();
      await supabase.from('crm_leads').update(leadUpd).eq('id', lead.id);
      leadsUpdated.push({ id: lead.id, code: lead.code, title: lead.title, phone: cPhone });
    }
  }
  const totalLeads = allLeads.length;
  return {
    leadsUpdatedPhone: leadsUpdated.length,
    leadsWithPhone: totalLeads - leadsStillMissing,
    leadsStillMissingPhone: leadsStillMissing,
    totalLeads,
    leadsUpdatedList: leadsUpdated.slice(0, 200),
  };
}

/**
 * Một job: đồng bộ Graph (tùy chọn) → quét DB (tùy chọn) → vòng lead mô tả (tùy chọn).
 * Dùng cho API danh bạ và auto pipeline (chain).
 */
async function runSyncThenExtractPhonesJob({
  io = null,
  limit = 50,
  offset = 0,
  recentHours = 0,
  applyStaleFilter = false,
  graphPages = FB_SYNC_SINGLE_MAX_PAGES,
  forceRescanPhones = false,
  sortOrder = 'newest_first',
  skipFinalRound = false,
  runGraphSync = true,
  runExtract = true,
  emitBatchSocketEvents = true,
} = {}) {
  if (!runGraphSync && !runExtract) {
    return {
      ok: false,
      error: 'Cần bật ít nhất một trong: đồng bộ Graph hoặc quét SĐT (DB)',
      processed: 0,
      pool_total: 0,
      done_pool: true,
    };
  }
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const rh = Math.min(168, Math.max(0, parseInt(recentHours, 10) || 0));
  const gp = Math.min(30, Math.max(1, parseInt(graphPages, 10) || FB_SYNC_SINGLE_MAX_PAGES));
  const sock = emitBatchSocketEvents ? io : null;

  const { contacts: pool, excludedStaleNoContact, rawFetched } = await loadFacebookContactsForBatchPipeline({
    recentHours: rh,
    applyStaleFilter: applyStaleFilter,
  });
  let sorted = sortFacebookContactsNewestFirst(pool || []);
  if (sortOrder === 'oldest_first') sorted = [...sorted].reverse();
  const poolLen = sorted.length;
  const targets = sorted.slice(off, off + lim);
  const nextOffset = off + targets.length;
  const donePool = targets.length === 0 || nextOffset >= poolLen;

  if (!targets.length) {
    return {
      ok: true,
      message: rh ? `Không có contact trong pool (offset ${off}, ${rh}h)` : `Không có contact (offset ${off})`,
      mode: 'sync_then_extract_per_contact',
      order: sortOrder === 'oldest_first' ? 'oldest_first' : 'newest_first',
      limit: lim,
      offset_start: off,
      next_offset: poolLen > 0 ? Math.min(off, poolLen) : 0,
      pool_total: poolLen,
      done_pool: true,
      processed: 0,
      pool_fetched: rawFetched,
      excluded_stale_no_contact: excludedStaleNoContact,
      total_messages_synced: 0,
      extract_updated: 0,
      extract_no_info: 0,
      extract_skipped_has_phone: 0,
      sync_errors: 0,
      steps: [],
      leadsUpdatedPhone: 0,
      leadsWithPhone: 0,
      leadsStillMissingPhone: 0,
      totalLeads: 0,
      leadsUpdatedList: [],
      graph_pages_per_user: gp,
      recent_hours: rh || null,
    };
  }

  const pageTokens = {};
  let totalMsgsSynced = 0;
  let extractUpdated = 0;
  let extractNoInfo = 0;
  let extractSkipped = 0;
  let syncErrors = 0;
  const steps = [];
  const total = targets.length;

  if (sock) {
    sock.emit('batch_progress', {
      type: 'sync_then_extract_phones',
      phase: 'start',
      total,
      current: 0,
      name: '',
      offset: off,
      pool_total: poolLen,
    });
  }

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    if (sock) {
      sock.emit('batch_progress', {
        type: 'sync_then_extract_phones',
        phase: 'sync',
        total,
        current: i + 1,
        name: c.fb_name || c.id,
        contact_id: c.id,
        offset: off,
        pool_total: poolLen,
      });
    }
    let syncRes = { synced: 0, status: 'skipped' };
    if (runGraphSync) {
      syncRes = await graphSyncMessagesForContactRow(c, pageTokens, { maxGraphPages: gp });
      totalMsgsSynced += syncRes.synced || 0;
      if (syncRes.status === 'error') syncErrors += 1;
    }

    if (sock) {
      sock.emit('batch_progress', {
        type: 'sync_then_extract_phones',
        phase: 'extract',
        total,
        current: i + 1,
        name: c.fb_name || c.id,
        contact_id: c.id,
        synced: syncRes.synced,
        sync_status: syncRes.status,
      });
    }
    let ex = { outcome: runExtract ? 'no_info' : 'skipped_no_extract', phone: null };
    if (runExtract) {
      ex = await applyExtractFromDbMessagesForContact(c, { forceRescanPhones });
      if (ex.outcome === 'skipped_has_phone') extractSkipped += 1;
      else if (ex.outcome === 'no_info') extractNoInfo += 1;
      else if (ex.outcome === 'updated') extractUpdated += 1;
    }
    steps.push({
      contact_id: c.id,
      name: c.fb_name,
      synced: syncRes.synced,
      sync_status: syncRes.status,
      graph_error: syncRes.graph_error || null,
      extract: ex.outcome,
      phone: ex.phone,
    });
    if (i < targets.length - 1) await new Promise((r2) => setTimeout(r2, 40));
  }

  let finalRound = {
    leadsUpdatedPhone: 0,
    leadsWithPhone: 0,
    leadsStillMissingPhone: 0,
    totalLeads: 0,
    leadsUpdatedList: [],
  };
  if (!skipFinalRound && runExtract) {
    if (sock) {
      sock.emit('batch_progress', {
        type: 'sync_then_extract_phones',
        phase: 'lead_sync',
        total,
        current: total,
        name: 'Đồng bộ mô tả lead...',
      });
    }
    finalRound = await runExtractPhonesFinalLeadDescriptionSync();
  }

  const summary = {
    ok: true,
    mode: 'sync_then_extract_per_contact',
    order: sortOrder === 'oldest_first' ? 'oldest_first' : 'newest_first',
    limit: lim,
    offset_start: off,
    next_offset: nextOffset,
    pool_total: poolLen,
    done_pool: donePool,
    graph_pages_per_user: gp,
    recent_hours: rh || null,
    pool_fetched: rawFetched,
    excluded_stale_no_contact: excludedStaleNoContact,
    processed: total,
    total_messages_synced: totalMsgsSynced,
    extract_updated: extractUpdated,
    extract_no_info: extractNoInfo,
    extract_skipped_has_phone: extractSkipped,
    sync_errors: syncErrors,
    steps: steps.slice(0, 300),
    ...finalRound,
  };
  console.log(`[FB sync→extract] off=${off} users=${total} pool=${poolLen} msgs=${totalMsgsSynced} extractUpd=${extractUpdated} skip=${extractSkipped} donePool=${donePool}`);
  if (sock) sock.emit('batch_done', { type: 'sync_then_extract_phones', ...summary });
  return summary;
}

async function saveFbPipelineConfig(partial) {
  const merged = {
    ...DEFAULT_FB_PIPELINE_CONFIG,
    ...fbPipelineConfigCache,
    ...(partial && typeof partial === 'object' ? partial : {}),
  };
  if (!['chain', 'legacy', 'full_cycle'].includes(merged.engine)) merged.engine = 'full_cycle';
  merged.full_cycle_max_users_per_round = Math.min(500_000, Math.max(0, parseInt(merged.full_cycle_max_users_per_round, 10) || 0));
  merged.full_cycle_graph_pages_per_contact = Math.min(30, Math.max(1, parseInt(merged.full_cycle_graph_pages_per_contact, 10) || 10));
  merged.full_cycle_deep_retry_cap = Math.min(200, Math.max(0, parseInt(merged.full_cycle_deep_retry_cap, 10) || 0));
  merged.full_cycle_deep_retry_pages = Math.min(30, Math.max(1, parseInt(merged.full_cycle_deep_retry_pages, 10) || merged.full_cycle_graph_pages_per_contact));
  merged.chain_chunk_users = Math.min(500, Math.max(1, parseInt(merged.chain_chunk_users, 10) || 50));
  merged.chain_sort = merged.chain_sort === 'oldest_first' ? 'oldest_first' : 'newest_first';
  merged.chain_recent_hours = Math.min(168, Math.max(0, parseInt(merged.chain_recent_hours, 10) || 0));
  merged.chain_graph_pages = Math.min(30, Math.max(1, parseInt(merged.chain_graph_pages, 10) || FB_SYNC_SINGLE_MAX_PAGES));
  merged.chain_skip_stale = !!merged.chain_skip_stale;
  merged.chain_final_lead_sync = merged.chain_final_lead_sync !== false;
  merged.chain_run_graph_sync = merged.chain_run_graph_sync !== false;
  merged.chain_run_extract = merged.chain_run_extract !== false;
  merged.auto_loop_pause_sec = Math.min(3600, Math.max(0, parseInt(merged.auto_loop_pause_sec, 10) || 0));
  merged.full_cycle_rescan_phones = merged.full_cycle_rescan_phones !== false;
  merged.full_cycle_pool_sync_rounds = Math.min(100, Math.max(1, parseInt(merged.full_cycle_pool_sync_rounds, 10) || 12));
  await supabase.from('app_settings').upsert({
    key: 'fb_auto_pipeline_config',
    value: merged,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  fbPipelineConfigCache = merged;
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// BATCH: đồng bộ tin nhắn từng contact → quét SĐT ngay (mới → cũ, giới hạn N user)
// POST /facebook/batch-sync-then-extract-phones
// Body: { limit, offset?, recent_hours?, skip_stale_customer_reply?, graph_pages_per_user?, force_rescan_phones?,
//         sort?, skip_final_lead_sync?, run_graph_sync?, run_extract? }
// ═══════════════════════════════════════════════════════════════
r.post('/batch-sync-then-extract-phones', authMiddleware, async (req, res) => {
  const io = r._ioRef;
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.body?.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.body?.offset, 10) || 0);
    const recentHours = Math.min(168, Math.max(0, parseInt(req.body?.recent_hours, 10) || 0));
    const applyStale = !!req.body?.skip_stale_customer_reply;
    const graphPages = Math.min(30, Math.max(1, parseInt(req.body?.graph_pages_per_user, 10) || FB_SYNC_SINGLE_MAX_PAGES));
    const forceRescanPhones = !!req.body?.force_rescan_phones;
    const sortOrder = req.body?.sort === 'oldest_first' ? 'oldest_first' : 'newest_first';
    const skipFinalRound = !!req.body?.skip_final_lead_sync;
    const runGraphSync = req.body?.run_graph_sync !== false;
    const runExtract = req.body?.run_extract !== false;

    const summary = await runSyncThenExtractPhonesJob({
      io,
      limit,
      offset,
      recentHours,
      applyStaleFilter: applyStale,
      graphPages,
      forceRescanPhones,
      sortOrder,
      skipFinalRound,
      runGraphSync,
      runExtract,
      emitBatchSocketEvents: true,
    });
    res.json(summary);
  } catch (e) {
    console.error('[FB sync→extract]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE V2 — Đồng bộ Graph → quét inbound DB → tạo lead (một vòng, không nối batch HTTP cũ)
// ═══════════════════════════════════════════════════════════════
r.post('/pipeline-v2/run', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const limit = Math.min(500, Math.max(1, parseInt(req.body?.limit, 10) || 100));
    const graphPages = Math.min(30, Math.max(1, parseInt(req.body?.graph_pages, 10) || 10));
    const clearPhoneWhenNoNewInbound = !!req.body?.clear_phone_when_no_new_inbound;
    const deleteLeadWhenNoPhoneAfterClear = !!req.body?.delete_lead_when_no_phone_after_clear;
    const cleanupContactsWithLead = !!req.body?.cleanup_contacts_with_lead;
    const cleanupLimit = Math.min(500, Math.max(0, parseInt(req.body?.cleanup_limit, 10) || 0));
    const result = await runPipelineV2OnePass({
      limit,
      graphPages,
      io,
      clearPhoneWhenNoNewInbound,
      deleteLeadWhenNoPhoneAfterClear,
      cleanupContactsWithLead,
      cleanupLimit,
    });
    if (!result.ok && result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[FB pipeline-v2]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BATCH SYNC MESSAGES — Smart sync: chỉ contacts cần thiết
// ═══════════════════════════════════════════════════════════════
r.post('/batch-sync-messages', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const mode = req.body?.mode || 'smart'; // 'smart' | 'all'
    const offsetIdx = parseInt(req.body?.offset) || 0;  // bắt đầu từ index nào
    const batchLimit = parseInt(req.body?.limit) || 0;  // 0 = không giới hạn
    const timeoutMs = Math.min(parseInt(req.body?.timeout) || 0, 300) * 1000; // giới hạn thời gian (s)
    const startTime = Date.now();
    const recentHours = Math.min(Math.max(0, parseInt(req.body?.recent_hours, 10) || 0), 168);

    const skipStaleFilter =
      req.body?.skip_stale_customer_reply === false
        ? false
        : (req.body?.skip_stale_customer_reply === true || mode === 'smart');

    const { contacts: workContacts, excludedStaleNoContact, rawFetched } = await loadFacebookContactsForBatchPipeline({
      recentHours,
      applyStaleFilter: skipStaleFilter,
    });

    if (!workContacts?.length) {
      return res.json({
        synced: 0,
        total: 0,
        message: recentHours ? `Không có contact trong ${recentHours}h (sau lọc)` : 'Không có contact nào',
        recent_hours: recentHours || null,
        raw_fetched: rawFetched,
      });
    }

    // ── SMART FILTER: chỉ sync contacts cần thiết ──
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const ONE_WEEK = 7 * ONE_DAY;

    let candidates;
    if (mode === 'all') {
      candidates = workContacts;
    } else {
      candidates = workContacts.filter(c => {
        const lastSync = c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0;
        const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        const createdAt = c.created_at ? new Date(c.created_at).getTime() : 0;
        const age = now - (lastMsg || createdAt); // tuổi của contact

        // 1. Chưa bao giờ sync → luôn sync
        if (!lastSync) return true;

        // 2. Tin nhắn mới trong 1h → sync mỗi 5 phút
        if (age < ONE_HOUR) return (now - lastSync) > FIVE_MIN;

        // 3. Tin nhắn trong 24h → sync mỗi 30 phút
        if (age < ONE_DAY) return (now - lastSync) > 30 * 60 * 1000;

        // 4. Tin nhắn trong 7 ngày → sync mỗi 2h
        if (age < ONE_WEEK) return (now - lastSync) > 2 * ONE_HOUR;

        // 5. Cũ hơn 7 ngày → sync mỗi 24h
        return (now - lastSync) > ONE_DAY;
      });
    }
    candidates = sortFacebookContactsNewestFirst(candidates);

    if (!candidates.length) {
      return res.json({
        synced: 0,
        total: 0,
        filtered: workContacts.length,
        excluded_stale_no_contact: excludedStaleNoContact,
        stale_threshold_hours: AUTO_PIPELINE_RECENT_HOURS,
        excluded_stale_no_contact_24h: excludedStaleNoContact,
        nextOffset: 0,
        done: true,
        message:
          skipStaleFilter && excludedStaleNoContact
            ? `Không còn contact sau lọc KH không liên lạc >${AUTO_PIPELINE_RECENT_HOURS}h + smart`
            : 'Smart: tất cả đã cập nhật',
      });
    }

    // Slice từ offset, giới hạn batch nếu có
    const sliced = candidates.slice(offsetIdx);
    const contacts = batchLimit > 0 ? sliced.slice(0, batchLimit) : sliced;
    const nextOffsetAbs = offsetIdx + contacts.length;
    const batchDone = nextOffsetAbs >= candidates.length;
    if (!contacts.length) {
      return res.json({
        synced: 0,
        total: candidates.length,
        excluded_stale_no_contact: excludedStaleNoContact,
        stale_threshold_hours: AUTO_PIPELINE_RECENT_HOURS,
        excluded_stale_no_contact_24h: excludedStaleNoContact,
        nextOffset: 0,
        done: true,
        message: 'Đã đồng bộ hết',
      });
    }

    // Group contacts theo page_id để lấy token 1 lần
    const pageTokens = {};
    const total = candidates.length;
    let totalSynced = 0;
    let totalErrors = 0;
    let processedCount = 0;
    const results = [];
    const pcfg = getFbPipelineConfigSync();
    const basePages = Math.min(30, Math.max(1, parseInt(pcfg.full_cycle_graph_pages_per_contact, 10) || FB_SYNC_BATCH_GRAPH_MAX_PAGES));
    const retryPages = Math.min(30, Math.max(basePages, parseInt(pcfg.full_cycle_deep_retry_pages, 10) || basePages));
    const retryCap = Math.min(200, Math.max(0, parseInt(pcfg.full_cycle_deep_retry_cap, 10) || 0));
    let retryUsed = 0;

    if (io) io.emit('batch_progress', { type: 'sync_messages', phase: 'start', total, current: 0 });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Kiểm tra timeout — dừng và trả về nextOffset để caller tiếp tục
      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        const nextOffset = offsetIdx + i;
        if (io) io.emit('batch_progress', { type: 'sync_messages', phase: 'timeout', current: i, total: contacts.length, nextOffset });
        const summary = { total, totalSynced, totalErrors, processedCount: i, nextOffset, done: false, details: results };
        if (io) io.emit('batch_done', { type: 'sync_messages', ...summary });
        return res.json(summary);
      }

      try {
        // Lấy page token (cache)
        if (!pageTokens[contact.page_id]) {
          const page = await getPageConfig(contact.page_id);
          pageTokens[contact.page_id] = page?.access_token || null;
        }
        const token = pageTokens[contact.page_id];
        if (!token) {
          const row = { contact_id: contact.id, name: contact.fb_name, synced: 0, sync_status: 'no_token' };
          results.push(row);
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_token' });
          continue;
        }

        const { convId, lastError: convResolveErr } = await graphResolveConversationIdForPsid(
          contact.page_id,
          contact.psid,
          token,
        );
        if (!convId) {
          const row = {
            contact_id: contact.id,
            name: contact.fb_name,
            synced: 0,
            sync_status: 'no_conv',
            graph_error: convResolveErr || null,
          };
          results.push(row);
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_conv' });
          continue;
        }

        // Get messages (nhiều trang — đồng bộ đủ text cũ có SĐT)
        let msgList = await graphFetchConversationMessages(convId, token, {
          maxPages: basePages,
          limitPerPage: 100,
        });
        if (!msgList.length) {
          const row = { contact_id: contact.id, name: contact.fb_name, synced: 0, sync_status: 'no_msg' };
          results.push(row);
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_msg' });
          continue;
        }

        let synced = 0;
        for (const msg of msgList) {
          const fbMsgId = msg.id;
          if (!acquireMidLock(fbMsgId)) continue;
          const { data: existing } = await supabase.from('facebook_messages')
            .select('id').eq('fb_message_id', fbMsgId).limit(1);
          if (existing?.length) continue;

          const isFromPage = msg.from?.id === contact.page_id;
          let attachmentUrl = null;
          let messageType = 'text';
          if (msg.attachments?.data?.[0]) {
            const att = msg.attachments.data[0];
            attachmentUrl = att.image_data?.url || att.file_url || att.url || null;
            messageType = att.mime_type?.startsWith('image') ? 'image' : att.mime_type?.startsWith('video') ? 'video' : att.mime_type?.startsWith('audio') ? 'audio' : 'file';
          }

          await supabase.from('facebook_messages').insert({
            contact_id: contact.id,
            lead_id: contact.lead_id,
            fb_message_id: fbMsgId,
            direction: isFromPage ? 'outbound' : 'inbound',
            message_type: messageType,
            content: msg.message || (attachmentUrl ? `[${messageType}]` : ''),
            attachment_url: attachmentUrl,
            created_at: msg.created_time || new Date().toISOString(),
          });
          synced++;
        }

        // Adaptive deep-sync: nếu không sync được gì và contact chưa có phone → thử kéo sâu hơn (giới hạn cap/batch).
        if (synced === 0 && !contact.phone && retryCap > 0 && retryPages > basePages && retryUsed < retryCap) {
          retryUsed += 1;
          msgList = await graphFetchConversationMessages(convId, token, {
            maxPages: retryPages,
            limitPerPage: 100,
          });
          for (const msg of msgList) {
            const fbMsgId = msg.id;
            if (!acquireMidLock(fbMsgId)) continue;
            const { data: existing } = await supabase.from('facebook_messages')
              .select('id').eq('fb_message_id', fbMsgId).limit(1);
            if (existing?.length) continue;

            const isFromPage = msg.from?.id === contact.page_id;
            let attachmentUrl = null;
            let messageType = 'text';
            if (msg.attachments?.data?.[0]) {
              const att = msg.attachments.data[0];
              attachmentUrl = att.image_data?.url || att.file_url || att.url || null;
              messageType = att.mime_type?.startsWith('image') ? 'image' : att.mime_type?.startsWith('video') ? 'video' : att.mime_type?.startsWith('audio') ? 'audio' : 'file';
            }
            await supabase.from('facebook_messages').insert({
              contact_id: contact.id,
              lead_id: contact.lead_id,
              fb_message_id: fbMsgId,
              direction: isFromPage ? 'outbound' : 'inbound',
              message_type: messageType,
              content: msg.message || (attachmentUrl ? `[${messageType}]` : ''),
              attachment_url: attachmentUrl,
              created_at: msg.created_time || new Date().toISOString(),
            });
            synced += 1;
          }
        }

        // Update last_message_at + last_synced_at
        const upd = { last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (synced > 0 || !contact.last_message_at) {
          const latestTime = msgList[0]?.created_time;
          if (latestTime) upd.last_message_at = latestTime;
        }
        await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);

        totalSynced += synced;
        processedCount++;
        results.push({
          contact_id: contact.id,
          name: contact.fb_name,
          synced,
          sync_status: synced > 0 ? 'synced' : 'up_to_date',
        });
        if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: synced > 0 ? 'synced' : 'up_to_date', synced });
      } catch (err) {
        totalErrors++;
        // Vẫn đánh dấu đã sync để không retry liên tục
        try { await supabase.from('facebook_contacts').update({ last_synced_at: new Date().toISOString() }).eq('id', contact.id); } catch (_) {}
        results.push({
          contact_id: contact.id,
          name: contact.fb_name,
          synced: 0,
          sync_status: 'error',
          error: err.message,
        });
        if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'error', error: err.message });
      }

      // Rate limit: 50ms giữa mỗi contact (tránh FB API throttle)
      if (i < contacts.length - 1) await new Promise(r => setTimeout(r, 50));
    }

    const nextOffset = offsetIdx + contacts.length;
    const done = nextOffset >= total;
    const summary = {
      total,
      totalSynced,
      totalErrors,
      processedCount,
      nextOffset: done ? 0 : nextOffset,
      done,
      pool_fetched: rawFetched,
      recent_hours: recentHours || null,
      excluded_stale_no_contact: excludedStaleNoContact,
      stale_threshold_hours: AUTO_PIPELINE_RECENT_HOURS,
      excluded_stale_no_contact_24h: excludedStaleNoContact,
      skip_stale_filter: skipStaleFilter,
      mode,
      details: results,
    };
    if (io) io.emit('batch_done', { type: 'sync_messages', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-LEAD CONFIG — Điều kiện tự động tạo Lead
// ═══════════════════════════════════════════════════════════════

// Preload config vào cache khi khởi động
loadAutoLeadConfig().then(() => console.log('[AutoLead] ✅ Config loaded from DB'));

// GET /facebook/auto-lead-config
r.get('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const config = await loadAutoLeadConfig();
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /facebook/auto-lead-config
r.put('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const saved = await saveAutoLeadConfig(req.body);
    console.log('[AutoLead] ✅ Config updated:', JSON.stringify(saved));
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /facebook/auto-lead-config/defaults
r.get('/auto-lead-config/defaults', authMiddleware, (req, res) => {
  res.json(AUTO_LEAD_DEFAULTS);
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED LEAD SCAN — Quét contacts có SĐT → tạo lead tự động
// ═══════════════════════════════════════════════════════════════

let scanTimer = null;
let scanConfig = { enabled: false, interval_minutes: 60 };

async function loadScanConfig() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'lead_scan_config').single();
    if (data?.value) scanConfig = { enabled: false, interval_minutes: 60, ...data.value };
  } catch (e) { console.warn('[LeadScan] DB config load error:', e.message); }
  return scanConfig;
}
async function saveScanConfig(cfg) {
  scanConfig = { ...scanConfig, ...cfg };
  await supabase.from('app_settings').upsert({
    key: 'lead_scan_config',
    value: scanConfig,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  return scanConfig;
}

// Preload
loadScanConfig().then(() => console.log('[LeadScan] ✅ Config loaded'));
loadFbPipelineConfigFromDb().then(async () => {
  console.log('[FB] ✅ Auto pipeline config loaded');
  try {
    const wasEnabled = await loadAutoPipelineEnabledFromDb();
    if (wasEnabled && !FB_AUTO_PIPELINE_RESUME_ON_BOOT) {
      console.log('[FB] ⏸️ Auto pipeline không tự resume sau reboot (mặc định). Set FB_AUTO_PIPELINE_RESUME_ON_BOOT=1 để resume. Đồng bộ DB → OFF.');
      saveAutoPipelineEnabledToDb(false).catch(() => {});
    } else if (wasEnabled && !autoPipeline.running && FB_AUTO_PIPELINE_RESUME_ON_BOOT) {
      console.log('[FB] ▶️ Auto-resume auto pipeline (persisted=ON + FB_AUTO_PIPELINE_RESUME_ON_BOOT)');
      autoPipeline.enabled = true;
      runAutoPipelineLoop().catch(err => {
        console.error('[AutoPipeline] FATAL on resume', err.message);
        pushAutoLog(`❌ Auto pipeline lỗi nghiêm trọng: ${err.message}`, 'error');
        autoPipeline.running = false;
        autoPipeline.enabled = false;
        autoPipeline.phase = 'idle';
        autoPipeline.step = -1;
        autoPipeline.stepLabel = null;
        autoPipeline.pauseUntilMs = null;
        emitAutoState();
      });
    }
  } catch (e) { console.warn('[FB] auto-resume check:', e.message); }
});

/**
 * scanAndCreateLeads — Quét facebook_contacts có SĐT nhưng chưa có lead → tạo lead
 * Chạy theo lịch hoặc gọi thủ công
 */
async function scanAndCreateLeads() {
  console.log('[LeadScan] 🔍 Starting scan...');
  const results = { scanned: 0, created: 0, skipped: 0, errors: [], leads: [] };

  try {
    const autoLeadCfg = await loadAutoLeadConfig();

    // Lấy tất cả contacts có phone, chưa có lead
    await ensureSyncPausedColumnDetected();
    let scanQuery = supabase.from('facebook_contacts')
      .select('*')
      .not('phone', 'is', null).neq('phone', '')
      .is('lead_id', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (hasSyncPausedColumnSync()) scanQuery = scanQuery.neq('sync_paused', true);
    const { data: contactsRaw, error } = await scanQuery;

    if (error) { results.errors.push(error.message); return results; }
    const contacts = sortFacebookContactsNewestFirst(contactsRaw);
    results.scanned = (contacts || []).length;
    console.log(`[LeadScan] Found ${results.scanned} contacts with phone, no lead`);

    for (const contact of (contacts || [])) {
      try {
        // Kiểm tra lead cũ bị xóa — chỉ check khi contact đã gắn customer (tránh lỗi với null)
        if (!autoLeadCfg.recreate_deleted_leads && contact.customer_id) {
          const { data: oldLead } = await supabase.from('crm_leads')
            .select('id')
            .eq('customer_id', contact.customer_id)
            .eq('type', 'lead')
            .limit(1)
            .maybeSingle();
          if (oldLead) {
            results.skipped++;
            continue;
          }
        }

        const lead = await createLeadFromFacebook(contact.page_id, contact, 'Scan (SĐT)', {
          phone: contact.phone,
          full_name: contact.fb_name || 'KH Facebook',
        });

        if (lead && lead.code !== 'EXISTING') {
          results.created++;
          results.leads.push({ name: contact.fb_name, phone: contact.phone, code: lead.code, page_id: contact.page_id });
          console.log(`[LeadScan] ✅ Lead created: ${lead.code} — ${contact.fb_name} — ${contact.phone}`);
        } else {
          results.skipped++;
        }
      } catch (e) {
        results.errors.push(`${contact.fb_name}: ${e.message}`);
      }
    }
  } catch (e) {
    results.errors.push(e.message);
  }

  console.log(`[LeadScan] ✅ Done — Scanned: ${results.scanned}, Created: ${results.created}, Skipped: ${results.skipped} (thứ tự: hoạt động mới nhất trước)`);
  results.sort_note = 'Ưu tiên contact có hoạt động gần nhất (tin nhắn hoặc tạo hồ sơ)';
  return results;
}

function startScanTimer() {
  if (scanTimer) clearInterval(scanTimer);
  if (!scanConfig.enabled || !scanConfig.interval_minutes) return;
  const intervalMinutes = Math.max(15, parseInt(scanConfig.interval_minutes, 10) || 15);
  const ms = intervalMinutes * 60 * 1000;
  scanConfig.interval_minutes = intervalMinutes;
  console.log(`[LeadScan] ⏰ Timer started — every ${intervalMinutes} minutes`);
  scanTimer = setInterval(() => scanAndCreateLeads(), ms);
}

function stopScanTimer() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  console.log('[LeadScan] ⏹️ Timer stopped');
}

// Auto-start theo cấu hình đã lưu: nếu enabled=true thì bật timer sau khi boot.
// (Nếu muốn tắt hẳn chạy nền, set enabled=false qua /facebook/lead-scan/config)
loadScanConfig().then((cfg) => {
  if (cfg?.enabled) startScanTimer();
}).catch(() => {});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED RESCAN PHONES — Quét lại SĐT từ tin inbound theo lịch
// ═══════════════════════════════════════════════════════════════
const DEFAULT_RESCAN_PHONES_SCHEDULE = {
  enabled: false,
  interval_minutes: 60,
  limit: 50,
  mode: 'all',
  overwrite: true,
  sort: 'newest_first',
  page_id: null,
  sync_customer: true,
  /** Khi true: inbound không trích được SĐT + có lead → thử xóa (kể cả contact còn SĐT cũ). Điều kiện an toàn trong helper. */
  delete_lead_when_no_phone: false,
  delete_orphan_customer_no_phone: false,
  lead_date_from: null,
  lead_date_to: null,
  include_contacts_without_lead_in_range: false,
};
let rescanPhonesSchedule = { ...DEFAULT_RESCAN_PHONES_SCHEDULE };
let rescanPhonesScheduleTimeoutId = null;
let rescanPhonesScheduleRunning = false;
let rescanPhonesScheduleNextAtMs = null;

async function loadRescanPhonesScheduleConfig() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'fb_rescan_phones_schedule').maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      rescanPhonesSchedule = { ...DEFAULT_RESCAN_PHONES_SCHEDULE, ...data.value };
    }
  } catch (e) {
    console.warn('[RescanSchedule] DB load:', e.message);
  }
  return rescanPhonesSchedule;
}

async function saveRescanPhonesScheduleConfig(patch) {
  const merged = { ...rescanPhonesSchedule, ...patch };
  merged.interval_minutes = Math.max(15, parseInt(merged.interval_minutes, 10) || 60);
  merged.limit = Math.max(1, Math.min(1000, parseInt(merged.limit, 10) || 50));
  merged.mode = ['all', 'with_phone', 'without_phone'].includes(merged.mode) ? merged.mode : 'all';
  merged.sort = merged.sort === 'oldest_first' ? 'oldest_first' : 'newest_first';
  merged.overwrite = merged.overwrite !== false;
  merged.sync_customer = merged.sync_customer !== false;
  merged.enabled = !!merged.enabled;
  merged.delete_lead_when_no_phone = !!merged.delete_lead_when_no_phone;
  merged.delete_orphan_customer_no_phone = !!merged.delete_orphan_customer_no_phone;
  merged.include_contacts_without_lead_in_range = !!merged.include_contacts_without_lead_in_range;
  if (merged.lead_date_from != null && String(merged.lead_date_from).trim() === '') merged.lead_date_from = null;
  if (merged.lead_date_to != null && String(merged.lead_date_to).trim() === '') merged.lead_date_to = null;
  if (merged.page_id != null && String(merged.page_id).trim() !== '') {
    merged.page_id = String(merged.page_id).trim();
  } else {
    merged.page_id = null;
  }
  rescanPhonesSchedule = merged;
  await supabase.from('app_settings').upsert({
    key: 'fb_rescan_phones_schedule',
    value: rescanPhonesSchedule,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  return rescanPhonesSchedule;
}

function clearRescanPhonesScheduleTimer() {
  if (rescanPhonesScheduleTimeoutId) {
    clearTimeout(rescanPhonesScheduleTimeoutId);
    rescanPhonesScheduleTimeoutId = null;
  }
  rescanPhonesScheduleNextAtMs = null;
}

function armRescanPhonesSchedule(delayMs) {
  clearRescanPhonesScheduleTimer();
  if (!rescanPhonesSchedule.enabled) return;
  const d = Math.max(0, Number(delayMs) || 0);
  rescanPhonesScheduleNextAtMs = Date.now() + d;
  rescanPhonesScheduleTimeoutId = setTimeout(() => {
    rescanPhonesScheduleTimeoutId = null;
    runRescanPhonesScheduledTick().catch(() => {});
  }, d);
}

async function runRescanPhonesScheduledTick() {
  if (!rescanPhonesSchedule.enabled) return;
  if (rescanPhonesScheduleRunning) {
    console.warn('[RescanSchedule] tick skipped — still running, retry in 60s');
    armRescanPhonesSchedule(60_000);
    return;
  }
  rescanPhonesScheduleRunning = true;
  try {
    const body = {
      limit: rescanPhonesSchedule.limit,
      mode: rescanPhonesSchedule.mode,
      overwrite: rescanPhonesSchedule.overwrite,
      sort: rescanPhonesSchedule.sort,
      page_id: rescanPhonesSchedule.page_id,
      sync_customer: rescanPhonesSchedule.sync_customer,
      delete_lead_when_no_phone: !!rescanPhonesSchedule.delete_lead_when_no_phone,
      delete_orphan_customer_no_phone: !!rescanPhonesSchedule.delete_orphan_customer_no_phone,
      lead_date_from: rescanPhonesSchedule.lead_date_from || undefined,
      lead_date_to: rescanPhonesSchedule.lead_date_to || undefined,
      include_contacts_without_lead_in_range: !!rescanPhonesSchedule.include_contacts_without_lead_in_range,
    };
    console.log('[RescanSchedule] ▶ tick', body);
    await runRescanPhonesBatch(body, r._ioRef);
  } catch (e) {
    console.error('[RescanSchedule] tick error:', e.message);
  } finally {
    rescanPhonesScheduleRunning = false;
    if (rescanPhonesSchedule.enabled) {
      const rest = Math.max(15, parseInt(rescanPhonesSchedule.interval_minutes, 10) || 60) * 60 * 1000;
      armRescanPhonesSchedule(rest);
    }
  }
}

/** @param {boolean} immediateFirst — lần chạy đầu sau ~5s khi vừa bật trong UI; false = chờ đủ một chu kỳ (boot server). */
function startRescanPhonesSchedule(immediateFirst) {
  clearRescanPhonesScheduleTimer();
  if (!rescanPhonesSchedule.enabled) return;
  const intervalMs = Math.max(15, parseInt(rescanPhonesSchedule.interval_minutes, 10) || 60) * 60 * 1000;
  const firstMs = immediateFirst ? 5000 : intervalMs;
  console.log(`[RescanSchedule] ⏰ armed — first run in ${firstMs / 1000}s, rest ${intervalMs / 60000} min between runs`);
  armRescanPhonesSchedule(firstMs);
}

function getRescanPhonesScheduleStatus() {
  return {
    ...rescanPhonesSchedule,
    timer_armed: !!rescanPhonesScheduleTimeoutId,
    running: rescanPhonesScheduleRunning,
    next_run_at: rescanPhonesScheduleNextAtMs
      ? new Date(rescanPhonesScheduleNextAtMs).toISOString()
      : null,
  };
}

loadRescanPhonesScheduleConfig().then((cfg) => {
  if (cfg?.enabled) startRescanPhonesSchedule(false);
}).catch(() => {});

// GET /facebook/audit-phone-sync — đối soát contact/customer/lead
r.get('/audit-phone-sync', authMiddleware, async (req, res) => {
  try {
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('id, fb_name, phone, lead_id, customer_id, page_id, updated_at')
      .not('psid', 'is', null)
      .limit(5000);

    const leadIds = [...new Set((contacts || []).map(c => c.lead_id).filter(Boolean))];
    const { data: leads } = leadIds.length
      ? await supabase.from('crm_leads').select('id, code, title, customer_id, description, install_address').in('id', leadIds)
      : { data: [] };
    const leadMap = {};
    (leads || []).forEach(l => { leadMap[l.id] = l; });

    const custIds = [...new Set([
      ...(contacts || []).map(c => c.customer_id).filter(Boolean),
      ...(leads || []).map(l => l.customer_id).filter(Boolean),
    ])];
    const { data: customers } = custIds.length
      ? await supabase.from('customers').select('id, full_name, phone, address').in('id', custIds)
      : { data: [] };
    const custMap = {};
    (customers || []).forEach(c => { custMap[c.id] = c; });

    const summary = {
      total_contacts: contacts?.length || 0,
      contacts_with_phone: 0,
      contacts_with_lead: 0,
      leads_with_customer_phone: 0,
      mismatches_contact_has_phone_customer_missing: 0,
      mismatches_lead_exists_no_customer_phone: 0,
      samples: [],
    };

    for (const c of (contacts || [])) {
      const lead = c.lead_id ? leadMap[c.lead_id] : null;
      const cust = custMap[c.customer_id || lead?.customer_id] || null;
      const contactPhone = c.phone && String(c.phone).trim() ? c.phone : null;
      const customerPhone = cust?.phone && String(cust.phone).trim() ? cust.phone : null;
      if (contactPhone) summary.contacts_with_phone++;
      if (lead) summary.contacts_with_lead++;
      if (lead && customerPhone) summary.leads_with_customer_phone++;

      if (contactPhone && !customerPhone) {
        summary.mismatches_contact_has_phone_customer_missing++;
        if (summary.samples.length < 100) {
          summary.samples.push({
            kind: 'contact_has_phone_customer_missing',
            contact_id: c.id,
            fb_name: c.fb_name,
            contact_phone: contactPhone,
            lead_id: c.lead_id,
            lead_code: lead?.code || null,
            customer_id: cust?.id || c.customer_id || lead?.customer_id || null,
            customer_phone: customerPhone,
          });
        }
      } else if (lead && !customerPhone) {
        summary.mismatches_lead_exists_no_customer_phone++;
        if (summary.samples.length < 100) {
          summary.samples.push({
            kind: 'lead_exists_no_customer_phone',
            contact_id: c.id,
            fb_name: c.fb_name,
            contact_phone: contactPhone,
            lead_id: c.lead_id,
            lead_code: lead?.code || null,
            customer_id: cust?.id || c.customer_id || lead?.customer_id || null,
            customer_phone: customerPhone,
          });
        }
      }
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /facebook/lead-scan/config — xem cấu hình
r.get('/lead-scan/config', authMiddleware, async (req, res) => {
  const cfg = await loadScanConfig();
  res.json({ ...cfg, timer_active: !!scanTimer });
});

// PUT /facebook/lead-scan/config — cập nhật cấu hình
r.put('/lead-scan/config', authMiddleware, async (req, res) => {
  try {
    const { enabled, interval_minutes } = req.body;
    const cfg = await saveScanConfig({
      ...(enabled !== undefined && { enabled }),
      ...(interval_minutes && { interval_minutes: Math.max(15, parseInt(interval_minutes, 10) || 15) }),
    });
    // Restart timer
    stopScanTimer();
    if (cfg.enabled) startScanTimer();
    res.json({ ...cfg, timer_active: !!scanTimer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/lead-scan/run — chạy quét thủ công
r.post('/lead-scan/run', authMiddleware, async (req, res) => {
  try {
    const results = await scanAndCreateLeads();
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /facebook/lead-scan/preview — xem trước contacts sẽ được tạo lead
r.get('/lead-scan/preview', authMiddleware, async (req, res) => {
  try {
    await ensureSyncPausedColumnDetected();
    const _selectColsPreview = hasSyncPausedColumnSync()
      ? 'id, fb_name, phone, page_id, updated_at, created_at, last_message_at, sync_paused'
      : 'id, fb_name, phone, page_id, updated_at, created_at, last_message_at';
    let previewQuery = supabase.from('facebook_contacts')
      .select(_selectColsPreview)
      .not('phone', 'is', null).neq('phone', '')
      .is('lead_id', null);
    if (hasSyncPausedColumnSync()) previewQuery = previewQuery.neq('sync_paused', true);
    const { data: contactsRaw } = await previewQuery;

    const contacts = sortFacebookContactsNewestFirst(contactsRaw || []);
    const pageIds = [...new Set(contacts.map(c => c.page_id).filter(Boolean))];
    let pageMap = {};
    if (pageIds.length) {
      const { data: pages } = await supabase.from('facebook_pages')
        .select('page_id, page_name').in('page_id', pageIds);
      pageMap = Object.fromEntries((pages || []).map(p => [p.page_id, p.page_name]));
    }

    let countMap = {};
    if (contacts.length) {
      const { data: counts } = await supabase.from('facebook_messages')
        .select('contact_id')
        .in('contact_id', contacts.map(c => c.id))
        .eq('direction', 'inbound');
      (counts || []).forEach(m => {
        countMap[m.contact_id] = (countMap[m.contact_id] || 0) + 1;
      });
    }

    res.json({
      count: contacts.length,
      sort_note: 'Mới nhất theo hoạt động (tin nhắn hoặc tạo hồ sơ) — trùng thứ tự khi quét / chạy ngay',
      contacts: contacts.map((c) => ({
        ...c,
        page_name: pageMap[c.page_id] || c.page_id,
        message_count: countMap[c.id] || 0,
        ...enrichContactActivityFields(c),
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Refresh tên cho các contact đang bị "Facebook User" ──
r.post('/refresh-names', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const { data: stuckContacts } = await supabase.from('facebook_contacts')
      .select('id, page_id, psid, fb_name, lead_id, last_message_at, created_at')
      .or('fb_name.eq.Facebook User,fb_name.eq.User,fb_name.is.null')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (!stuckContacts?.length) return res.json({ updated: 0, message: 'Không có contact nào cần cập nhật' });

    const total = stuckContacts.length;
    let updated = 0;
    if (io) io.emit('batch_progress', { type: 'refresh_names', phase: 'start', total, current: 0 });

    for (let i = 0; i < stuckContacts.length; i++) {
      const c = stuckContacts[i];
      const profile = await fetchProfileViaConversations(c.page_id, c.psid);
      if (profile?.name && profile.name !== 'Facebook User') {
        const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
        if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
        await supabase.from('facebook_contacts').update(upd).eq('id', c.id);

        if (c.lead_id) {
          await supabase.from('crm_leads')
            .update({ title: `[FB] ${profile.name}`, updated_at: new Date().toISOString() })
            .eq('id', c.lead_id).or('title.ilike.%Facebook User%,title.ilike.%[FB] User%');
          const { data: leadData } = await supabase.from('crm_leads')
            .select('customer_id').eq('id', c.lead_id).single();
          if (leadData?.customer_id) {
            await supabase.from('customers')
              .update({ full_name: profile.name, updated_at: new Date().toISOString() })
              .eq('id', leadData.customer_id).ilike('full_name', '%Facebook%');
          }
        }
        updated++;
        if (io) io.emit('batch_progress', { type: 'refresh_names', current: i + 1, total, name: profile.name, oldName: c.fb_name, status: 'updated' });
        console.log(`[FB Refresh] ${c.psid}: "${c.fb_name}" → "${profile.name}"`);
      } else {
        if (io) io.emit('batch_progress', { type: 'refresh_names', current: i + 1, total, name: c.fb_name, status: 'unchanged' });
      }
    }
    const summary = { updated, total };
    if (io) io.emit('batch_done', { type: 'refresh_names', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/webhook-logs', authMiddleware, async (req, res) => {
  try {
    if (FB_DISABLE_WEBHOOK_LOGS) return res.json([]);
    const { data } = await supabase.from('facebook_webhook_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(100);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/webhook-logs', authMiddleware, async (req, res) => {
  try {
    if (FB_DISABLE_WEBHOOK_LOGS) return res.json({ ok: true, disabled: true });
    await supabase.from('facebook_webhook_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO PIPELINE CONTROL (backend-managed realtime)
// ═══════════════════════════════════════════════════════════════
r.get('/auto-pipeline/status', authMiddleware, async (_req, res) => {
  res.json(getAutoState());
});

r.get('/auto-pipeline/config', authMiddleware, async (_req, res) => {
  await loadFbPipelineConfigFromDb();
  res.json({ config: getFbPipelineConfigSync(), defaults: DEFAULT_FB_PIPELINE_CONFIG });
});

r.put('/auto-pipeline/config', authMiddleware, async (req, res) => {
  try {
    const saved = await saveFbPipelineConfig(req.body || {});
    emitAutoState();
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/auto-pipeline/start', authMiddleware, async (_req, res) => {
  await loadFbPipelineConfigFromDb();
  if (!autoPipeline.running) {
    autoPipeline.enabled = true;
    runAutoPipelineLoop().catch(err => {
      console.error('[AutoPipeline] FATAL', err.message);
      pushAutoLog(`❌ Auto pipeline lỗi nghiêm trọng: ${err.message}`, 'error');
      autoPipeline.running = false;
      autoPipeline.enabled = false;
      autoPipeline.phase = 'idle';
      autoPipeline.step = -1;
      autoPipeline.stepLabel = null;
      autoPipeline.pauseUntilMs = null;
      emitAutoState();
    });
  } else {
    autoPipeline.enabled = true;
    emitAutoState();
  }
  saveAutoPipelineEnabledToDb(true).catch(() => {});
  res.json({ ok: true, state: getAutoState() });
});

r.post('/auto-pipeline/stop', authMiddleware, async (_req, res) => {
  autoPipeline.stopRequested = true;
  autoPipeline.enabled = false;
  autoPipeline.pauseUntilMs = null;
  saveAutoPipelineEnabledToDb(false).catch(() => {});
  pushAutoLog('🛑 Đã yêu cầu dừng auto pipeline');
  res.json({ ok: true, state: getAutoState() });
});

// ═══════════════════════════════════════════════════════════════
// TOOL: Quét lại SĐT theo số lượng yêu cầu (+ lịch tự động)
// POST /facebook/rescan-phones
// Body:
//   limit: số contact cần quét (1..1000, default 50)
//   mode: 'all' | 'with_phone' | 'without_phone' (default 'all')
//   overwrite: true → ghi đè SĐT cũ nếu phát hiện SĐT mới khác (default true)
//   sort: 'newest_first' | 'oldest_first' (default 'newest_first')
//   page_id: filter theo page (optional)
//   sync_customer: true → đồng bộ SĐT mới sang customer.phone (default true)
//   delete_lead_when_no_phone: true → inbound không trích được SĐT (kể cả contact vẫn đang lưu SĐT cũ), có lead_id → xóa lead nếu đủ điều kiện an toàn (type=lead, không project/đơn/báo giá/…).
//   delete_orphan_customer_no_phone: true → sau khi xóa lead (khi bật delete_lead_when_no_phone), thử xóa customer không SĐT nếu chỉ gắn contact này và không còn lead/dự án/đơn/BG.
//   lead_date_from / lead_date_to: YYYY-MM-DD (optional) — chỉ lấy contact có lead CRM type=lead với created_at trong khoảng (UTC). Contact chưa có lead bị loại trừ trừ khi include_contacts_without_lead_in_range.
//   include_contacts_without_lead_in_range: khi có lead_date_* — gồm contact chưa lead nhưng created_at của contact nằm trong cùng khoảng ngày.
//
// Thứ tự: khớp danh bạ — max(last_message_at, created_at) (activityTimestampMs), không chỉ last_message_at.
// Logic: chỉ quét tin nhắn direction='inbound' (tin của user FB),
// extractContactInfo đã loại URL bằng stripUrlLikeSegments.
// ═══════════════════════════════════════════════════════════════

function parseUtcDayBoundary(fromStr, toStr) {
  let fromMs = null;
  let toMs = null;
  if (fromStr && String(fromStr).trim()) {
    const d = new Date(`${String(fromStr).trim()}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) fromMs = d.getTime();
  }
  if (toStr && String(toStr).trim()) {
    const d = new Date(`${String(toStr).trim()}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) toMs = d.getTime();
  }
  return { fromMs, toMs };
}

async function loadLeadMapForContacts(supabaseClient, contactsList) {
  const ids = [...new Set((contactsList || []).map((c) => c.lead_id).filter(Boolean))];
  const map = {};
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data: leads, error } = await supabaseClient
      .from('crm_leads')
      .select('id, created_at, type')
      .in('id', slice);
    if (error) throw new Error(error.message);
    (leads || []).forEach((L) => {
      map[L.id] = L;
    });
  }
  return map;
}

async function filterContactsByLeadDateRange(supabaseClient, contactsList, body) {
  const fromS = body.lead_date_from && String(body.lead_date_from).trim();
  const toS = body.lead_date_to && String(body.lead_date_to).trim();
  if (!fromS && !toS) return { filtered: contactsList, skippedByDate: 0 };
  const { fromMs, toMs } = parseUtcDayBoundary(fromS, toS);
  const includeNoLead = !!body.include_contacts_without_lead_in_range;
  const leadMap = await loadLeadMapForContacts(supabaseClient, contactsList);
  const out = [];
  let skippedByDate = 0;
  for (const c of contactsList || []) {
    const createdMs = c.created_at ? new Date(c.created_at).getTime() : null;
    if (c.lead_id) {
      const lead = leadMap[c.lead_id];
      if (!lead || lead.type !== 'lead') {
        skippedByDate += 1;
        continue;
      }
      const t = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
      if (Number.isNaN(t)) {
        skippedByDate += 1;
        continue;
      }
      if (fromMs != null && t < fromMs) {
        skippedByDate += 1;
        continue;
      }
      if (toMs != null && t > toMs) {
        skippedByDate += 1;
        continue;
      }
      out.push(c);
      continue;
    }
    if (includeNoLead && createdMs != null && !Number.isNaN(createdMs)) {
      if (fromMs != null && createdMs < fromMs) {
        skippedByDate += 1;
        continue;
      }
      if (toMs != null && createdMs > toMs) {
        skippedByDate += 1;
        continue;
      }
      out.push(c);
      continue;
    }
    skippedByDate += 1;
  }
  return { filtered: out, skippedByDate };
}

async function runRescanPhonesBatch(body, ioRef) {
  const b = body && typeof body === 'object' ? body : {};
  const limit = Math.max(1, Math.min(1000, parseInt(b.limit, 10) || 50));
  const mode = ['all', 'with_phone', 'without_phone'].includes(b.mode) ? b.mode : 'all';
  const overwrite = b.overwrite !== false;
  const sort = b.sort === 'oldest_first' ? 'oldest_first' : 'newest_first';
  const pageId = b.page_id || null;
  const syncCustomer = b.sync_customer !== false;
  const deleteLeadWhenNoPhone = !!b.delete_lead_when_no_phone;
  const deleteOrphanCustomerNoPhone = !!b.delete_orphan_customer_no_phone && deleteLeadWhenNoPhone;
  const io = ioRef || r._ioRef;

  const dateFilterActive = !!(b.lead_date_from && String(b.lead_date_from).trim()) || !!(b.lead_date_to && String(b.lead_date_to).trim());

  /** Lấy dư rồi sort theo hoạt động (mới→cũ) rồi cắt limit — tránh sai thứ tự chỉ với ORDER BY last_message_at. */
  const fetchPoolCap = dateFilterActive
    ? Math.min(50_000, Math.max(limit * 80, 5000))
    : Math.min(10_000, Math.max(limit, limit * 40));

  let q = supabase.from('facebook_contacts')
    .select('id, fb_name, phone, page_id, last_message_at, created_at, customer_id, lead_id');
  if (pageId) q = q.eq('page_id', pageId);
  if (mode === 'with_phone') q = q.not('phone', 'is', null).neq('phone', '');
  if (mode === 'without_phone') q = q.or('phone.is.null,phone.eq.');
  if (sort === 'newest_first') {
    q = q.order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    q = q.order('last_message_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
  }
  q = q.limit(fetchPoolCap);

  const { data: contactsRaw, error } = await q;
  if (error) throw new Error(error.message);

  let contacts = contactsRaw || [];
  const poolFetched = contacts.length;

  const dateFilterResult = await filterContactsByLeadDateRange(supabase, contacts, b);
  contacts = dateFilterResult.filtered;
  const skippedByLeadDate = dateFilterResult.skippedByDate;
  const poolAfterDateFilter = contacts.length;

  if (sort === 'newest_first') {
    contacts = sortFacebookContactsNewestFirst(contacts).slice(0, limit);
  } else {
    contacts = [...sortFacebookContactsNewestFirst(contacts)].reverse().slice(0, limit);
  }

  const sortNote = sort === 'newest_first'
    ? 'Thứ tự: hoạt động mới nhất trước — max(tin cuối, lúc tạo hồ sơ), giống tab Danh bạ.'
    : 'Thứ tự: hoạt động cũ nhất trước — cùng mốc thời gian như trên.';

  console.log(`[Rescan] mode=${mode} limit=${limit} pool=${poolFetched} afterDate=${poolAfterDateFilter} final=${contacts.length} overwrite=${overwrite} sort=${sort} delLead=${deleteLeadWhenNoPhone} delCust=${deleteOrphanCustomerNoPhone} dateF=${dateFilterActive} page=${pageId || '*'}`);

  const totalToScan = contacts.length;
  const counters = {
    scanned: 0,
    updated_set: 0,
    updated_replaced: 0,
    unchanged_same: 0,
    kept_existing: 0,
    no_phone_found: 0,
    errors: 0,
    leads_deleted: 0,
    leads_delete_blocked: 0,
    customers_deleted: 0,
    customers_delete_blocked: 0,
  };
  const results = [];

  for (const c of contacts || []) {
    counters.scanned += 1;
    try {
      const { data: msgs } = await supabase.from('facebook_messages')
        .select('content, direction, created_at')
        .eq('contact_id', c.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(500);

      const inbound = (msgs || []).filter(m => m && m.content && m.direction === 'inbound');
      const found = extractInboundContactInfo(inbound);
      const newPhone = found?.phone || null;

      const item = {
        contact_id: c.id,
        fb_name: c.fb_name,
        page_id: c.page_id,
        old_phone: c.phone || null,
        new_phone: newPhone,
        messages_scanned: inbound.length,
        extra_phones: found?.extraPhones || [],
        action: 'no_phone_found',
      };

      if (!newPhone) {
        counters.no_phone_found += 1;
        if (deleteLeadWhenNoPhone && c.lead_id) {
          const custIdBefore = c.customer_id || null;
          const delRes = await deleteLeadIfAllowedForRescan(supabase, c.lead_id, c.id);
          if (delRes.ok) {
            item.action = 'lead_deleted';
            item.deleted_lead_id = c.lead_id;
            counters.leads_deleted += 1;
            if (deleteOrphanCustomerNoPhone && custIdBefore) {
              const oc = await deleteOrphanCustomerIfAllowed(supabase, custIdBefore, c.id);
              if (oc.ok) {
                item.customer_deleted = true;
                item.deleted_customer_id = custIdBefore;
                counters.customers_deleted += 1;
              } else {
                item.customer_delete_blocked = oc.reason;
                counters.customers_delete_blocked += 1;
              }
            }
          } else {
            item.lead_delete_blocked = delRes.reason;
            counters.leads_delete_blocked += 1;
          }
        }
      } else if (!c.phone) {
        const { error: updErr } = await supabase.from('facebook_contacts')
          .update({ phone: newPhone, updated_at: new Date().toISOString() })
          .eq('id', c.id);
        if (updErr) {
          item.action = 'error';
          item.error = updErr.message;
          counters.errors += 1;
        } else {
          item.action = 'set_new';
          counters.updated_set += 1;
          if (syncCustomer && c.customer_id) {
            await supabase.from('customers')
              .update({ phone: newPhone, updated_at: new Date().toISOString() })
              .eq('id', c.customer_id)
              .then(() => {}, () => {});
          }
        }
      } else if (String(c.phone).trim() === String(newPhone).trim()) {
        item.action = 'unchanged_same';
        counters.unchanged_same += 1;
      } else if (overwrite) {
        const { error: updErr } = await supabase.from('facebook_contacts')
          .update({ phone: newPhone, updated_at: new Date().toISOString() })
          .eq('id', c.id);
        if (updErr) {
          item.action = 'error';
          item.error = updErr.message;
          counters.errors += 1;
        } else {
          item.action = 'replaced';
          counters.updated_replaced += 1;
          if (syncCustomer && c.customer_id) {
            await supabase.from('customers')
              .update({ phone: newPhone, updated_at: new Date().toISOString() })
              .eq('id', c.customer_id)
              .then(() => {}, () => {});
          }
        }
      } else {
        item.action = 'kept_existing';
        counters.kept_existing += 1;
      }

      results.push(item);

      try {
        if (io) {
          io.emit('rescan_phones_progress', {
            current: counters.scanned, total: totalToScan,
            name: c.fb_name, action: item.action,
          });
        }
      } catch (_) {}
    } catch (e) {
      counters.errors += 1;
      results.push({ contact_id: c.id, fb_name: c.fb_name, action: 'error', error: e.message });
    }
  }

  return {
    ok: true,
    mode,
    overwrite,
    sort,
    limit,
    page_id: pageId || null,
    delete_lead_when_no_phone: deleteLeadWhenNoPhone,
    delete_orphan_customer_no_phone: deleteOrphanCustomerNoPhone,
    lead_date_from: b.lead_date_from || null,
    lead_date_to: b.lead_date_to || null,
    include_contacts_without_lead_in_range: !!b.include_contacts_without_lead_in_range,
    date_filter_active: dateFilterActive,
    pool_fetched: poolFetched,
    pool_after_lead_date_filter: poolAfterDateFilter,
    skipped_by_lead_date: skippedByLeadDate,
    total_to_scan: totalToScan,
    sort_note: sortNote,
    ...counters,
    total_updated: counters.updated_set + counters.updated_replaced,
    results: results.slice(0, 500),
  };
}

// ═══════════════════════════════════════════════════════════════
// Quét SĐT sai (không chuẩn VN / dài / nghi từ link) — danh sách + cập nhật / xóa
// POST /facebook/phone-quality-scan
// POST /facebook/phone-quality-apply  body: { update_contact_ids, delete_contact_ids, sync_customer, delete_customer }
// ═══════════════════════════════════════════════════════════════

async function patchLeadDescriptionPhone(leadId, phone) {
  if (!leadId || !phone) return;
  const { data: lead } = await supabase.from('crm_leads').select('id, description').eq('id', leadId).maybeSingle();
  if (!lead) return;
  let desc = lead.description || '';
  if (/SĐT:/.test(desc)) desc = desc.replace(/SĐT:.*$/m, `SĐT: ${phone}`);
  else desc = `${desc.trimEnd()}\nSĐT: ${phone}`.trim();
  await supabase
    .from('crm_leads')
    .update({ description: desc, updated_at: new Date().toISOString() })
    .eq('id', leadId);
}

/**
 * Quét lead/user theo khoảng ngày tạo lead: cập nhật SĐT nếu có từ tin inbound;
 * nếu đang có SĐT lưu nhưng quét không ra → xóa lead (an toàn) + xóa contact FB (+ KH mồ côi nếu được).
 * POST /facebook/scan-leads-by-date — bắt buộc lead_date_from + lead_date_to (YYYY-MM-DD).
 */
async function runLeadScanByDateBatch(body, ioRef) {
  const b = body && typeof body === 'object' ? body : {};
  const fromS = b.lead_date_from && String(b.lead_date_from).trim();
  const toS = b.lead_date_to && String(b.lead_date_to).trim();
  if (!fromS || !toS) {
    throw new Error('Cần chọn đủ «Từ ngày» và «Đến ngày»');
  }

  const limit = Math.max(1, Math.min(2000, parseInt(b.limit, 10) || 300));
  const syncGraphFirst = b.sync_graph_first !== false;
  const graphPages = Math.min(30, Math.max(1, parseInt(b.graph_pages, 10) || 10));
  const syncCustomer = b.sync_customer !== false;
  const includeNoLead = !!b.include_contacts_without_lead_in_range;

  const fetchPoolCap = Math.min(50_000, Math.max(limit * 80, 5000));
  let q = supabase
    .from('facebook_contacts')
    .select('id, fb_name, phone, page_id, psid, last_message_at, created_at, customer_id, lead_id');
  q = q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(fetchPoolCap);

  const { data: contactsRaw, error } = await q;
  if (error) throw new Error(error.message);

  let contacts = sortFacebookContactsNewestFirst(contactsRaw || []);
  const dateFilterResult = await filterContactsByLeadDateRange(supabase, contacts, {
    lead_date_from: fromS,
    lead_date_to: toS,
    include_contacts_without_lead_in_range: includeNoLead,
  });
  contacts = dateFilterResult.filtered;
  const skipped_by_lead_date = dateFilterResult.skippedByDate;
  const pool_after_lead_date_filter = contacts.length;
  contacts = contacts.slice(0, limit);

  const totalToScan = contacts.length;
  const io = ioRef || r._ioRef;
  const pageTokens = {};

  const counters = {
    scanned: 0,
    updated_set: 0,
    updated_replaced: 0,
    unchanged_same: 0,
    still_no_phone: 0,
    deleted_contacts: 0,
    leads_deleted: 0,
    lead_delete_blocked: 0,
    customers_deleted: 0,
    graph_messages_synced: 0,
    errors: 0,
  };
  const results = [];

  for (const c of contacts) {
    counters.scanned += 1;
    const item = { contact_id: c.id, fb_name: c.fb_name };
    try {
      const row = { ...c };
      if (syncGraphFirst) {
        const syncRes = await graphSyncMessagesForContactRow(row, pageTokens, { maxGraphPages: graphPages });
        counters.graph_messages_synced += syncRes.synced || 0;
        await applyExtractFromDbMessagesForContact(row, { forceRescanPhones: true });
      }

      const { data: fresh, error: frErr } = await supabase
        .from('facebook_contacts')
        .select('id, fb_name, phone, page_id, psid, customer_id, lead_id')
        .eq('id', c.id)
        .maybeSingle();
      if (frErr) throw new Error(frErr.message);
      if (!fresh) {
        item.action = 'contact_missing';
        results.push(item);
        continue;
      }

      const { data: msgs } = await supabase
        .from('facebook_messages')
        .select('content, direction, created_at')
        .eq('contact_id', fresh.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(500);

      const inbound = (msgs || []).filter((m) => m && m.content && m.direction === 'inbound');
      const found = extractInboundContactInfo(inbound);
      const newPhone = found?.phone || null;

      const oldPhone =
        fresh.phone && String(fresh.phone).trim() ? String(fresh.phone).trim() : null;

      if (newPhone) {
        if (!oldPhone) {
          const { error: updErr } = await supabase
            .from('facebook_contacts')
            .update({ phone: newPhone, updated_at: new Date().toISOString() })
            .eq('id', fresh.id);
          if (updErr) throw new Error(updErr.message);
          if (syncCustomer && fresh.customer_id) {
            await supabase
              .from('customers')
              .update({ phone: newPhone, updated_at: new Date().toISOString() })
              .eq('id', fresh.customer_id);
          }
          if (fresh.lead_id) await patchLeadDescriptionPhone(fresh.lead_id, newPhone);
          counters.updated_set += 1;
          item.action = 'set_new';
          item.new_phone = newPhone;
        } else if (phonesEqualDigits(oldPhone, newPhone)) {
          counters.unchanged_same += 1;
          item.action = 'unchanged_same';
          item.phone = oldPhone;
        } else {
          const { error: updErr } = await supabase
            .from('facebook_contacts')
            .update({ phone: newPhone, updated_at: new Date().toISOString() })
            .eq('id', fresh.id);
          if (updErr) throw new Error(updErr.message);
          if (syncCustomer && fresh.customer_id) {
            await supabase
              .from('customers')
              .update({ phone: newPhone, updated_at: new Date().toISOString() })
              .eq('id', fresh.customer_id);
          }
          if (fresh.lead_id) await patchLeadDescriptionPhone(fresh.lead_id, newPhone);
          counters.updated_replaced += 1;
          item.action = 'replaced';
          item.old_phone = oldPhone;
          item.new_phone = newPhone;
        }
        results.push(item);
        try {
          if (io) {
            io.emit('rescan_phones_progress', {
              current: counters.scanned,
              total: totalToScan,
              name: fresh.fb_name,
              action: item.action,
            });
          }
        } catch (_) {}
        continue;
      }

      if (!oldPhone) {
        counters.still_no_phone += 1;
        item.action = 'still_no_phone';
        results.push(item);
        try {
          if (io) {
            io.emit('rescan_phones_progress', {
              current: counters.scanned,
              total: totalToScan,
              name: fresh.fb_name,
              action: item.action,
            });
          }
        } catch (_) {}
        continue;
      }

      const leadIdBefore = fresh.lead_id || null;
      const custIdBefore = fresh.customer_id || null;

      if (leadIdBefore) {
        const delRes = await deleteLeadIfAllowedForRescan(supabase, leadIdBefore, fresh.id);
        if (!delRes.ok) {
          counters.lead_delete_blocked += 1;
          item.action = 'lead_delete_blocked';
          item.reason = delRes.reason;
          results.push(item);
          try {
            if (io) {
              io.emit('rescan_phones_progress', {
                current: counters.scanned,
                total: totalToScan,
                name: fresh.fb_name,
                action: item.action,
              });
            }
          } catch (_) {}
          continue;
        }
        counters.leads_deleted += 1;
        item.lead_deleted_id = leadIdBefore;
      }

      const { data: beforeDelContact } = await supabase
        .from('facebook_contacts')
        .select('id, customer_id')
        .eq('id', fresh.id)
        .maybeSingle();
      const custId = beforeDelContact?.customer_id || custIdBefore;

      if (custId) {
        const { data: cust } = await supabase.from('customers').select('id, phone').eq('id', custId).maybeSingle();
        if (cust && String(cust.phone || '').trim() === oldPhone) {
          await supabase
            .from('customers')
            .update({ phone: '', updated_at: new Date().toISOString() })
            .eq('id', custId);
        }
        const oc = await deleteOrphanCustomerIfAllowed(supabase, custId, fresh.id);
        if (oc.ok) {
          counters.customers_deleted += 1;
          item.customer_deleted = true;
        }
      }

      await supabase.from('facebook_messages').delete().eq('contact_id', fresh.id);
      const { error: delCErr } = await supabase.from('facebook_contacts').delete().eq('id', fresh.id);
      if (delCErr) throw new Error(delCErr.message);

      counters.deleted_contacts += 1;
      item.action = leadIdBefore ? 'deleted_contact_after_lead' : 'deleted_contact_no_lead';
      results.push(item);
      try {
        if (io) {
          io.emit('rescan_phones_progress', {
            current: counters.scanned,
            total: totalToScan,
            name: fresh.fb_name,
            action: 'deleted_contact',
          });
        }
      } catch (_) {}
    } catch (e) {
      counters.errors += 1;
      item.action = 'error';
      item.error = e.message;
      results.push(item);
    }
  }

  return {
    ok: true,
    lead_date_from: fromS,
    lead_date_to: toS,
    include_contacts_without_lead_in_range: includeNoLead,
    sync_graph_first: syncGraphFirst,
    graph_pages: graphPages,
    limit,
    pool_fetched: (contactsRaw || []).length,
    pool_after_lead_date_filter,
    skipped_by_lead_date,
    total_to_scan: totalToScan,
    sync_customer: syncCustomer,
    ...counters,
    total_updated: counters.updated_set + counters.updated_replaced,
    results: results.slice(0, 500),
  };
}

/**
 * Lead CRM trong khoảng ngày có SĐT khách hàng (customers.phone) xấu — lấy facebook_contacts tương ứng
 * (kể cả contact.phone trống hoặc tạm đúng nhưng KH lưu số nghi từ link).
 */
async function fetchContactsForLeadsWithBadCustomerPhoneInDateRange(body) {
  const fromS = body.lead_date_from && String(body.lead_date_from).trim();
  const toS = body.lead_date_to && String(body.lead_date_to).trim();
  if (!fromS && !toS) return [];
  const { fromMs, toMs } = parseUtcDayBoundary(fromS, toS);
  let lq = supabase.from('crm_leads').select('id, customer_id').eq('type', 'lead');
  if (fromMs != null) lq = lq.gte('created_at', new Date(fromMs).toISOString());
  if (toMs != null) lq = lq.lte('created_at', new Date(toMs).toISOString());
  const { data: leads, error: lErr } = await lq.limit(8000);
  if (lErr) throw new Error(lErr.message);
  if (!leads?.length) return [];

  const custIds = [...new Set(leads.map((L) => L.customer_id).filter(Boolean))];
  const custMap = {};
  for (let i = 0; i < custIds.length; i += 400) {
    const chunk = custIds.slice(i, i + 400);
    const { data: custs } = await supabase.from('customers').select('id, phone').in('id', chunk);
    (custs || []).forEach((row) => {
      custMap[row.id] = row.phone;
    });
  }

  const badLeadIds = [];
  for (const L of leads) {
    const p = L.customer_id ? custMap[L.customer_id] : '';
    if (p != null && String(p).trim() && analyzeStoredPhoneIssue(String(p).trim()).is_bad) {
      badLeadIds.push(L.id);
    }
  }
  if (!badLeadIds.length) return [];

  const pick = 'id, fb_name, phone, page_id, last_message_at, created_at, customer_id, lead_id';
  let cq = supabase.from('facebook_contacts').select(pick).in('lead_id', badLeadIds);
  if (body.page_id) cq = cq.eq('page_id', body.page_id);
  const { data: contacts, error: cErr } = await cq;
  if (cErr) throw new Error(cErr.message);
  return contacts || [];
}

async function runPhoneQualityScan(body) {
  const b = body && typeof body === 'object' ? body : {};
  const limit = Math.min(500, Math.max(1, parseInt(b.limit, 10) || 150));
  const pageId = b.page_id || null;
  const dateFilterActive =
    !!(b.lead_date_from && String(b.lead_date_from).trim()) ||
    !!(b.lead_date_to && String(b.lead_date_to).trim());
  const fetchPoolCap = dateFilterActive
    ? Math.min(40_000, Math.max(limit * 100, 5000))
    : Math.min(25_000, Math.max(limit * 50, 2000));
  const includeLeadBadCustomer = b.include_lead_bad_customer_phone !== false;

  let q = supabase
    .from('facebook_contacts')
    .select('id, fb_name, phone, page_id, last_message_at, created_at, customer_id, lead_id')
    .not('phone', 'is', null)
    .neq('phone', '');
  if (pageId) q = q.eq('page_id', pageId);
  q = q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(fetchPoolCap);

  const { data: contactsRaw, error } = await q;
  if (error) throw new Error(error.message);

  let poolFromContact = sortFacebookContactsNewestFirst(contactsRaw || []).filter((c) => analyzeStoredPhoneIssue(c.phone).is_bad);

  let extraFromCustomer = [];
  if (dateFilterActive && includeLeadBadCustomer) {
    try {
      extraFromCustomer = await fetchContactsForLeadsWithBadCustomerPhoneInDateRange(b);
    } catch (e) {
      console.warn('[PhoneQuality] extra customer phone:', e.message);
    }
  }

  const mergedMap = new Map();
  poolFromContact.forEach((c) => mergedMap.set(c.id, c));
  sortFacebookContactsNewestFirst(extraFromCustomer || []).forEach((c) => {
    if (!mergedMap.has(c.id)) mergedMap.set(c.id, c);
  });
  let pool = sortFacebookContactsNewestFirst([...mergedMap.values()]);
  const bad_stored_count = pool.length;
  const merged_from_customer_phone_row = extraFromCustomer.length;

  const dateFilterResult = await filterContactsByLeadDateRange(supabase, pool, b);
  pool = dateFilterResult.filtered;
  const skipped_by_lead_date = dateFilterResult.skippedByDate;
  const pool_after_date_filter = pool.length;

  pool = pool.slice(0, limit);

  const leadIds = [...new Set(pool.map((c) => c.lead_id).filter(Boolean))];
  const leadToCustomer = {};
  if (leadIds.length) {
    const { data: ldRows } = await supabase.from('crm_leads').select('id, customer_id').in('id', leadIds);
    (ldRows || []).forEach((L) => {
      leadToCustomer[L.id] = L.customer_id || null;
    });
  }
  const custIdsForPool = [...new Set(Object.values(leadToCustomer).filter(Boolean))];
  const custPhoneById = {};
  for (let i = 0; i < custIdsForPool.length; i += 400) {
    const chunk = custIdsForPool.slice(i, i + 400);
    const { data: custs } = await supabase.from('customers').select('id, phone').in('id', chunk);
    (custs || []).forEach((row) => {
      custPhoneById[row.id] = row.phone;
    });
  }

  const rows = [];
  for (const c of pool) {
    const contactStr = c.phone && String(c.phone).trim() ? String(c.phone).trim() : '';
    let eff = contactStr;
    let issueSource = 'contact';
    let analysis = analyzeStoredPhoneIssue(eff);

    if (!analysis.is_bad && c.lead_id) {
      const custId = leadToCustomer[c.lead_id] || c.customer_id;
      const cp = custId ? custPhoneById[custId] : '';
      if (cp != null && String(cp).trim()) {
        const cs = String(cp).trim();
        const a2 = analyzeStoredPhoneIssue(cs);
        if (a2.is_bad) {
          eff = cs;
          issueSource = 'customer';
          analysis = a2;
        }
      }
    } else if (analysis.is_bad && contactStr) {
      issueSource = 'contact';
    }

    const { data: msgs } = await supabase
      .from('facebook_messages')
      .select('content, direction, created_at')
      .eq('contact_id', c.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(500);

    const inbound = (msgs || []).filter((m) => m && m.content && m.direction === 'inbound');
    const found = extractInboundContactInfo(inbound);
    const scannedPhone = found?.phone || null;
    const scannedOk = !!(scannedPhone && validateVnSubscriberPhoneStored(scannedPhone).valid);

    rows.push({
      contact_id: c.id,
      fb_name: c.fb_name,
      page_id: c.page_id,
      stored_phone: eff,
      phone_issue_source: issueSource,
      stored_issue: analysis,
      scanned_phone: scannedPhone,
      scanned_ok: scannedOk,
      messages_scanned: inbound.length,
      lead_id: c.lead_id || null,
      customer_id: c.customer_id || null,
      suggested_action: scannedOk ? 'update' : 'delete',
    });
  }

  return {
    ok: true,
    limit,
    date_filter_active: dateFilterActive,
    pool_fetched: (contactsRaw || []).length,
    merged_from_customer_phone: merged_from_customer_phone_row,
    bad_stored_count,
    pool_after_date_filter,
    skipped_by_lead_date,
    rows_returned: rows.length,
    rows,
  };
}

async function applyPhoneQualityActions(body) {
  const b = body && typeof body === 'object' ? body : {};
  const updateIds = [...new Set((b.update_contact_ids || []).map((x) => String(x)))];
  const deleteIds = [...new Set((b.delete_contact_ids || []).map((x) => String(x)))];
  const syncCustomer = b.sync_customer !== false;
  const deleteCustomer = !!b.delete_customer;

  const out = {
    ok: true,
    updated: [],
    update_skipped: [],
    deleted: [],
    delete_blocked: [],
    customers_deleted: [],
  };

  for (const id of updateIds) {
    if (deleteIds.includes(id)) continue;
    const { data: c } = await supabase
      .from('facebook_contacts')
      .select('id, customer_id, lead_id')
      .eq('id', id)
      .maybeSingle();
    if (!c) {
      out.update_skipped.push({ contact_id: id, reason: 'contact_missing' });
      continue;
    }
    const { data: msgs } = await supabase
      .from('facebook_messages')
      .select('content, direction, created_at')
      .eq('contact_id', c.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(500);
    const inbound = (msgs || []).filter((m) => m && m.content && m.direction === 'inbound');
    const found = extractInboundContactInfo(inbound);
    const scanned = found?.phone || null;
    if (!scanned || !validateVnSubscriberPhoneStored(scanned).valid) {
      out.update_skipped.push({ contact_id: id, reason: 'no_valid_inbound_phone' });
      continue;
    }
    const { error: uErr } = await supabase
      .from('facebook_contacts')
      .update({ phone: scanned, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (uErr) {
      out.update_skipped.push({ contact_id: id, reason: uErr.message });
      continue;
    }
    if (syncCustomer && c.customer_id) {
      await supabase
        .from('customers')
        .update({ phone: scanned, updated_at: new Date().toISOString() })
        .eq('id', c.customer_id)
        .then(() => {}, () => {});
    }
    if (c.lead_id) await patchLeadDescriptionPhone(c.lead_id, scanned);
    out.updated.push({ contact_id: id, new_phone: scanned });
  }

  for (const id of deleteIds) {
    const { data: c } = await supabase
      .from('facebook_contacts')
      .select('id, lead_id, customer_id')
      .eq('id', id)
      .maybeSingle();
    if (!c) {
      out.delete_blocked.push({ contact_id: id, reason: 'contact_missing' });
      continue;
    }
    const custId = c.customer_id || null;
    if (c.lead_id) {
      const delRes = await deleteLeadIfAllowedForRescan(supabase, c.lead_id, c.id);
      if (!delRes.ok) {
        out.delete_blocked.push({ contact_id: id, reason: delRes.reason });
        continue;
      }
    }
    if (deleteCustomer && custId) {
      const oc = await deleteOrphanCustomerIfAllowed(supabase, custId, c.id);
      if (oc.ok) out.customers_deleted.push(custId);
    }
    await supabase.from('facebook_messages').delete().eq('contact_id', c.id);
    const { error: delContactErr } = await supabase.from('facebook_contacts').delete().eq('id', c.id);
    if (delContactErr) {
      out.delete_blocked.push({ contact_id: id, reason: delContactErr.message });
      continue;
    }
    out.deleted.push({ contact_id: id });
  }

  return out;
}

r.post('/phone-quality-scan', authMiddleware, async (req, res) => {
  try {
    const out = await runPhoneQualityScan(req.body || {});
    res.json(out);
  } catch (e) {
    console.error('[PhoneQuality] scan', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/phone-quality-apply', authMiddleware, async (req, res) => {
  try {
    const out = await applyPhoneQualityActions(req.body || {});
    res.json(out);
  } catch (e) {
    console.error('[PhoneQuality] apply', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/rescan-phones/schedule/config', authMiddleware, async (_req, res) => {
  await loadRescanPhonesScheduleConfig();
  res.json(getRescanPhonesScheduleStatus());
});

r.put('/rescan-phones/schedule/config', authMiddleware, async (req, res) => {
  try {
    const prevEnabled = rescanPhonesSchedule.enabled;
    clearRescanPhonesScheduleTimer();
    await saveRescanPhonesScheduleConfig(req.body || {});
    if (rescanPhonesSchedule.enabled) {
      const justTurnedOn = !prevEnabled && rescanPhonesSchedule.enabled;
      // Vừa bật → chạy sớm; đang bật chỉ đổi tham số → hẹn lại ~5s để áp dụng cấu hình mới
      startRescanPhonesSchedule(justTurnedOn || prevEnabled);
    }
    res.json(getRescanPhonesScheduleStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/rescan-phones', authMiddleware, async (req, res) => {
  try {
    const out = await runRescanPhonesBatch(req.body || {}, r._ioRef);
    res.json(out);
  } catch (e) {
    console.error('[Rescan] error', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/scan-leads-by-date', authMiddleware, async (req, res) => {
  try {
    const out = await runLeadScanByDateBatch(req.body || {}, r._ioRef);
    res.json(out);
  } catch (e) {
    console.error('[scan-leads-by-date]', e);
    const msg = e?.message || String(e);
    const badReq = /^Cần chọn/.test(msg);
    res.status(badReq ? 400 : 500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTO TOOL v2 — Công cụ tự động mới (đơn giản)
// ═══════════════════════════════════════════════════════════════
const autoTool = require('../helpers/autoTool');

// Inject core functions vào autoTool
autoTool.injectCoreFunctions({
  graphSyncMessagesForContactRow,
  extractInboundContactInfo,
  createLeadFromFacebook,
});

// Inject socket.io khi _ioRef được set
let _autoToolIoInjected = false;
setInterval(() => {
  if (!_autoToolIoInjected && r._ioRef) {
    autoTool.setIO(r._ioRef);
    _autoToolIoInjected = true;
  }
}, 500);

// Load config from DB on startup
autoTool.loadConfigFromDb().then(() => console.log('[AutoTool] ✅ Config loaded'));

r.get('/auto-tool/status', authMiddleware, async (_req, res) => {
  res.json(autoTool.getState());
});

r.get('/auto-tool/config', authMiddleware, async (_req, res) => {
  res.json({ config: autoTool.getConfig() });
});

r.put('/auto-tool/config', authMiddleware, async (req, res) => {
  try {
    autoTool.setConfig(req.body || {});
    res.json({ ok: true, config: autoTool.getConfig() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/auto-tool/start', authMiddleware, async (_req, res) => {
  const st = autoTool.getState();
  if (!st.running) {
    autoTool.startLoop().catch(err => {
      console.error('[AutoTool] FATAL', err.message);
    });
  }
  // Wait a tick for state to update
  await new Promise(r2 => setTimeout(r2, 100));
  res.json({ ok: true, state: autoTool.getState() });
});

r.post('/auto-tool/stop', authMiddleware, async (_req, res) => {
  autoTool.stop();
  res.json({ ok: true, state: autoTool.getState() });
});

module.exports = r;

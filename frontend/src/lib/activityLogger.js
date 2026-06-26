/**
 * Activity Logger — gửi hành vi UI lên backend để AI Chat Bot "học".
 *
 * Quy tắc:
 *   • Batch theo 2 giây hoặc đầy 20 entry → flush 1 POST /api/user-activity
 *   • Fail-safe: lỗi mạng KHÔNG đẩy ra UI (chỉ console.debug)
 *   • Auto session_id (sinh 1 lần / tab, lưu sessionStorage)
 *   • Helper logFilter / logView / logClick / logCRUD / logExport
 *
 * Cách dùng:
 *   import { logFilter, logView } from '@/lib/activityLogger';
 *   logFilter({ module: 'crm', feature: 'leads_list', query: filters, label: 'Lọc Lead · Cty A · 7 ngày' });
 */

import api from './api';
import { getCachedActivityContext } from './deviceHeartbeat';

const BATCH_MS = 2000;
const BATCH_MAX = 20;
const SESSION_KEY = 'activity_session_id';

let queue = [];
let timer = null;
let flushing = false;
let disabled = false;

function getSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

async function flush() {
  if (flushing || disabled) return;
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  flushing = true;
  try {
    await api.post('/user-activity', { entries: batch });
  } catch (err) {
    const status = err?.response?.status;
    if (status === 503) {
      console.warn('[activity] Bảng user_activity_log chưa migrate — tắt log cho phiên này');
      disabled = true;
    } else if (status === 404) {
      console.warn('[activity] Route /api/user-activity chưa enabled — tắt log cho phiên này');
      disabled = true;
    } else if (process.env.NODE_ENV !== 'production') {
      console.debug('[activity] flush failed (silent):', err?.message);
    }
  } finally {
    flushing = false;
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, BATCH_MS);
}

function enqueue(entry) {
  if (disabled) return;
  const ctx = getCachedActivityContext();
  queue.push({
    session_id: getSessionId(),
    path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    device_id: ctx.device_id,
    device_name: ctx.device_name,
    ...(ctx.geo_lat != null ? { geo_lat: ctx.geo_lat, geo_lng: ctx.geo_lng } : {}),
    ...entry,
  });
  if (queue.length >= BATCH_MAX) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flush();
  } else {
    schedule();
  }
}

/* ────────── Helpers chuyên dụng ────────── */

/** Ghi nhận user xem 1 trang/list (importance 0 mặc định để khỏi spam AI) */
export function logView({ module, feature, label, entity_type, entity_id, metadata }) {
  enqueue({
    action_type: 'view',
    module,
    feature,
    entity_type,
    entity_id,
    label,
    metadata,
    importance: 0,
  });
}

/** Ghi nhận user áp filter — đây là tín hiệu QUAN TRỌNG để AI học */
export function logFilter({ module, feature, query, label, metadata, importance = 1 }) {
  enqueue({
    action_type: 'filter',
    module,
    feature,
    query,
    label,
    metadata,
    importance,
  });
}

/** Ghi nhận tìm kiếm (search box) */
export function logSearch({ module, feature, keyword, label, metadata }) {
  enqueue({
    action_type: 'search',
    module,
    feature,
    query: { keyword },
    label: label || (keyword ? `Tìm: "${keyword}"` : null),
    metadata,
    importance: 1,
  });
}

/** Ghi nhận click 1 nút / link quan trọng */
export function logClick({ module, feature, label, entity_type, entity_id, metadata }) {
  enqueue({
    action_type: 'click',
    module,
    feature,
    entity_type,
    entity_id,
    label,
    metadata,
    importance: 1,
  });
}

/** Ghi nhận CRUD — importance 2 */
export function logCRUD({ action, module, feature, entity_type, entity_id, label, metadata }) {
  const a = String(action).toLowerCase();
  if (!['create', 'update', 'delete'].includes(a)) return;
  enqueue({
    action_type: a,
    module,
    feature,
    entity_type,
    entity_id,
    label,
    metadata,
    importance: a === 'delete' ? 3 : 2,
  });
}

/** Ghi nhận export file */
export function logExport({ module, feature, label, metadata }) {
  enqueue({
    action_type: 'export',
    module,
    feature,
    label,
    metadata,
    importance: 2,
  });
}

/** Ghi nhận điều hướng route — tự gọi từ useActivityRouteTracker */
export function logNavigate({ path, referrer_path, label }) {
  enqueue({
    action_type: 'navigate',
    path,
    referrer_path,
    label,
    importance: 0,
  });
}

/** Ghi nhận user mở chat AI / gửi tin → tách kênh để AI nhận diện loại hành vi */
export function logChat({ event, label, metadata }) {
  const a = event === 'send' ? 'chat_send' : 'chat_open';
  enqueue({
    action_type: a,
    module: 'messenger',
    feature: 'ai_chat_bot',
    label,
    metadata,
    importance: 1,
  });
}

/** Flush ngay (gọi khi user logout / chuẩn bị reload) */
export function flushNow() {
  return flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!queue.length) return;
    try {
      const url = (api.defaults.baseURL || '') + '/user-activity';
      const token = localStorage.getItem('token');
      const body = JSON.stringify({ entries: queue.splice(0, queue.length) });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(`${url}?bearer=${encodeURIComponent(token || '')}`, blob);
      }
    } catch {}
  });
}

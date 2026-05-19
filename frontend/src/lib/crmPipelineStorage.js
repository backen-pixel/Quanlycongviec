const UI_KEY = 'crm_pipeline_ui_v1';
/** Backup: giữ bộ lọc khi đổi trang CRM (Khách hàng, KPI…) hoặc mở tab mới trong phiên. */
const UI_LS_KEY = 'crm_pipeline_ui_ls_v1';
const FOCUS_KEY = 'crm_focus_pipeline_card_id';

function parseSnapshotJson(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** Gọi ngay trước khi mở chi tiết lead/deal — đảm bảo snapshot mới nhất. */
let persistUiHook = null;

export function registerCrmPipelinePersistUi(fn) {
  persistUiHook = typeof fn === 'function' ? fn : null;
  return () => {
    if (persistUiHook === fn) persistUiHook = null;
  };
}

export function persistCrmPipelineUiNow() {
  try {
    persistUiHook?.();
  } catch (_) {}
}

export function snapshotHasProperty(snapshot, key) {
  return snapshot != null
    && typeof snapshot === 'object'
    && Object.prototype.hasOwnProperty.call(snapshot, key);
}

export function loadCrmPipelineSnapshot() {
  try {
    const fromSession = parseSnapshotJson(sessionStorage.getItem(UI_KEY));
    if (fromSession) return fromSession;
    return parseSnapshotJson(localStorage.getItem(UI_LS_KEY));
  } catch {
    return null;
  }
}

export function saveCrmPipelineSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  let serialized;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    return;
  }
  try {
    sessionStorage.setItem(UI_KEY, serialized);
  } catch (_) {}
  try {
    localStorage.setItem(UI_LS_KEY, serialized);
  } catch (_) {}
}

/** Gọi trước khi mở chi tiết / nút quay lại — khi về pipeline sẽ cuộn tới thẻ này */
export function markCrmPipelineCardFocus(id) {
  if (!id) return;
  try {
    sessionStorage.setItem(FOCUS_KEY, String(id));
  } catch (_) {}
}

export function peekCrmPipelineCardFocus() {
  try {
    return sessionStorage.getItem(FOCUS_KEY) || null;
  } catch {
    return null;
  }
}

export function clearCrmPipelineCardFocus() {
  try {
    sessionStorage.removeItem(FOCUS_KEY);
  } catch (_) {}
}

const viewedLeadsKey = (userKey) => `crm_lead_detail_viewed:${String(userKey || '').trim()}`;

function peekUserIdFromLocalStorage() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const u = JSON.parse(raw);
    return String(u?.id || u?.userId || '').trim();
  } catch {
    return '';
  }
}

/** id user để khớp sessionStorage «đã xem lead» (hook Auth có thể chưa kịp có user). */
export function getCurrentUserKeyForLeadSeen(userFromHook) {
  return String(userFromHook?.id || userFromHook?.userId || peekUserIdFromLocalStorage() || '').trim();
}

/** Ghi nhớ đã mở chi tiết (tab hiện tại) — dùng khi API lead_seen_by lỗi/RLS hoặc chưa migration. */
export function markLeadDetailViewedLocally(leadId, userKey) {
  const uk = userKey || peekUserIdFromLocalStorage();
  if (!leadId || !uk || typeof window === 'undefined') return;
  try {
    const k = viewedLeadsKey(uk);
    const raw = sessionStorage.getItem(k);
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    const id = String(leadId);
    if (!list.includes(id)) {
      list.push(id);
      if (list.length > 4000) list.splice(0, list.length - 4000);
      sessionStorage.setItem(k, JSON.stringify(list));
    }
  } catch (_) {}
}

export function getLocallyViewedLeadIdSet(userKey) {
  const uk = userKey || peekUserIdFromLocalStorage();
  if (!uk || typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(viewedLeadsKey(uk));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(arr) ? arr : []).map(String));
  } catch {
    return new Set();
  }
}

/** Sau khi user mở chi tiết lead/deal — session + event để pipeline bỏ badge "Mới". */
export function notifyCrmLeadSeenByCurrentUser(leadId, userKey) {
  if (!leadId || typeof window === 'undefined') return;
  markLeadDetailViewedLocally(leadId, userKey || peekUserIdFromLocalStorage());
  try {
    window.dispatchEvent(new CustomEvent('crm-lead-seen', { detail: { id: String(leadId) } }));
  } catch (_) {}
}

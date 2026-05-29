/**
 * Cache cho CRM Dashboard — pattern stale-while-revalidate.
 *
 * Mục tiêu: hiển thị dashboard ngay lập tức bằng dữ liệu cache khi mở lại
 * tab / chuyển bộ lọc đã từng dùng, sau đó refresh ngầm.
 *
 * - Lưu trong sessionStorage (clear khi đóng tab) để tránh dữ liệu CRM cũ rò rỉ.
 * - TTL: 10 phút. Quá hạn vẫn áp dụng (stale) NHƯNG đánh dấu để buộc revalidate.
 * - Key gồm user.id + bộ lọc → chuyển công ty/NV không lẫn dữ liệu cũ.
 */

const STORAGE_KEY = 'crm-dashboard-cache:v1';
const HARD_EXPIRY_MS = 30 * 60 * 1000; // 30 phút mới xóa hẳn
const FRESH_TTL_MS = 10 * 60 * 1000; // < 10 phút coi là tươi

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded — ignore, cache là tuỳ chọn */
  }
}

function pruneExpired(store) {
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(store)) {
    const entry = store[k];
    if (!entry || typeof entry.savedAt !== 'number' || now - entry.savedAt > HARD_EXPIRY_MS) {
      delete store[k];
      changed = true;
    }
  }
  return changed;
}

/**
 * Tạo key ổn định từ context người dùng + bộ lọc dashboard.
 * Truyền chuỗi rỗng cho field không có giá trị để key luôn xác định.
 */
export function buildCrmDashboardCacheKey(opts = {}) {
  const {
    userId = '',
    filterCompany = '',
    filterAssignee = '',
    filterPhone = '',
    filterLeadType = '',
    customDateFrom = '',
    customDateTo = '',
    kanbanLoadLimit = '',
  } = opts;
  return [
    String(userId || ''),
    String(filterCompany || ''),
    String(filterAssignee || ''),
    String(filterPhone || ''),
    String(filterLeadType || ''),
    String(customDateFrom || ''),
    String(customDateTo || ''),
    String(kanbanLoadLimit || ''),
  ].join('|');
}

/**
 * Lấy cache theo key. Trả về { data, savedAt, isFresh } hoặc null.
 *
 * Caller nên: nếu có cache → áp dụng ngay (stale-while-revalidate),
 * sau đó vẫn fetch API mới.
 */
export function getCrmDashboardCache(key) {
  if (!key) return null;
  const store = readStore();
  const entry = store[key];
  if (!entry || typeof entry.savedAt !== 'number') return null;
  const age = Date.now() - entry.savedAt;
  if (age > HARD_EXPIRY_MS) {
    // Quá hạn cứng — xóa và bỏ qua
    delete store[key];
    writeStore(store);
    return null;
  }
  return {
    data: entry.data,
    savedAt: entry.savedAt,
    isFresh: age < FRESH_TTL_MS,
  };
}

/**
 * Ghi cache. `payload` chứa các field state đã áp dụng (xem CRMDashboard.load).
 */
export function saveCrmDashboardCache(key, payload) {
  if (!key || !payload) return;
  try {
    const store = readStore();
    pruneExpired(store);
    // Giới hạn 8 entry gần nhất để tránh sessionStorage phình to
    const keys = Object.keys(store).sort((a, b) => (store[b].savedAt || 0) - (store[a].savedAt || 0));
    while (keys.length >= 8) {
      const drop = keys.pop();
      delete store[drop];
    }
    store[key] = { savedAt: Date.now(), data: payload };
    writeStore(store);
  } catch {
    /* ignore */
  }
}

/** Xoá toàn bộ cache (vd: khi đăng xuất, hoặc khi force refresh thủ công). */
export function clearCrmDashboardCache() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Xoá 1 key cụ thể. */
export function invalidateCrmDashboardCache(key) {
  if (!key) return;
  try {
    const store = readStore();
    if (store[key]) {
      delete store[key];
      writeStore(store);
    }
  } catch {
    /* ignore */
  }
}

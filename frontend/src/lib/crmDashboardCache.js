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

// v3: Kanban phân trang 40 thẻ; không hydrate lại cache v2 từng chứa 500+ thẻ.
const STORAGE_KEY = 'crm-dashboard-cache:v3';
const META_STORAGE_KEY = 'crm-dashboard-meta-cache:v1'; // localStorage — metadata tĩnh
const HARD_EXPIRY_MS = 30 * 60 * 1000; // 30 phút mới xóa hẳn
const FRESH_TTL_MS = 10 * 60 * 1000; // < 10 phút coi là tươi
const VERY_FRESH_MS = 30 * 1000; // < 30 giây → có thể bỏ qua silent refetch
const META_HARD_EXPIRY_MS = 60 * 60 * 1000; // metadata: 1 giờ
const META_FRESH_MS = 5 * 60 * 1000; // metadata: < 5 phút coi là tươi

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
    filterAssigneeName = '',
    filterPhone = '',
    filterLeadType = '',
    filterReferrer = '',
    filterCustomerCompany = '',
    filterRegion = '',
    filterStage = '',
    filterSource = '',
    searchText = '',
    resolvedPipelineId = '',
    customDateFrom = '',
    customDateTo = '',
    kanbanLoadLimit = '',
  } = opts;
  return [
    String(userId || ''),
    String(filterCompany || ''),
    String(filterAssignee || ''),
    String(filterAssigneeName || ''),
    String(filterPhone || ''),
    String(filterLeadType || ''),
    String(filterReferrer || ''),
    String(filterCustomerCompany || ''),
    String(filterRegion || ''),
    String(filterStage || ''),
    String(filterSource || ''),
    String(searchText || '').trim().toLowerCase(),
    String(resolvedPipelineId || ''),
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
    age,
    isFresh: age < FRESH_TTL_MS,
    isVeryFresh: age < VERY_FRESH_MS,
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

/**
 * Cập nhật field trên 1 lead/deal trong mọi entry cache Kanban (vd. sau đổi tên từ chi tiết).
 * Tránh hydrate «very fresh» hiện title cũ khi quay lại dashboard trong <30s.
 */
export function patchCrmDashboardCacheLeadFields(leadId, fields) {
  if (!leadId || !fields || typeof fields !== 'object') return;
  const sid = String(leadId);
  try {
    const store = readStore();
    let storeChanged = false;
    for (const key of Object.keys(store)) {
      const entry = store[key];
      const data = entry?.data;
      if (!data || typeof data !== 'object') continue;
      let entryChanged = false;
      const patchArr = (arr) => {
        if (!Array.isArray(arr)) return arr;
        let any = false;
        const next = arr.map((row) => {
          if (String(row?.id) !== sid) return row;
          any = true;
          return { ...row, ...fields };
        });
        if (any) entryChanged = true;
        return any ? next : arr;
      };
      const nextAllLeads = patchArr(data.allLeads);
      const nextAllDeals = patchArr(data.allDeals);
      if (!entryChanged) continue;
      store[key] = {
        ...entry,
        data: {
          ...data,
          allLeads: nextAllLeads,
          allDeals: nextAllDeals,
        },
      };
      storeChanged = true;
    }
    if (storeChanged) writeStore(store);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// METADATA CACHE — companies/users/pipelines/stages/sources/leadTypes
// localStorage để sống qua đóng tab (data này hiếm khi đổi).
// ─────────────────────────────────────────────────────────────────────────

function readMetaStore() {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMetaStore(store) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/**
 * Đọc metadata cache theo userId. Trả về null nếu không có / hết hạn.
 * Trả { data, age, isFresh, savedAt } khi có.
 */
export function getCrmDashboardMetaCache(userId) {
  if (!userId) return null;
  try {
    const store = readMetaStore();
    const entry = store[String(userId)];
    if (!entry || typeof entry.savedAt !== 'number') return null;
    const age = Date.now() - entry.savedAt;
    if (age > META_HARD_EXPIRY_MS) {
      delete store[String(userId)];
      writeMetaStore(store);
      return null;
    }
    return {
      data: entry.data,
      savedAt: entry.savedAt,
      age,
      isFresh: age < META_FRESH_MS,
    };
  } catch {
    return null;
  }
}

/**
 * Lưu metadata cache. payload có thể chứa các field:
 * companies, users, pipelines, stagesLead, stagesDeal, sources, leadTypes, fbPages.
 */
export function saveCrmDashboardMetaCache(userId, payload) {
  if (!userId || !payload) return;
  try {
    const store = readMetaStore();
    // Giữ tối đa 4 user gần nhất (multi-account)
    const keys = Object.keys(store).sort((a, b) => (store[b].savedAt || 0) - (store[a].savedAt || 0));
    while (keys.length >= 4) {
      const drop = keys.pop();
      delete store[drop];
    }
    store[String(userId)] = { savedAt: Date.now(), data: payload };
    writeMetaStore(store);
  } catch {
    /* ignore */
  }
}

export function clearCrmDashboardMetaCache() {
  try {
    localStorage.removeItem(META_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

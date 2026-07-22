import { clearCrmPipelineUiPersistence } from './crmPipelineStorage';
import { clearWorkshopDashFilterStorage } from './sessionReset';

/**
 * Công ty dùng để lọc dữ liệu CRM (admin) — đồng bộ với trang Pipeline, Nguồn, Dashboard…
 * Cùng key với CRMDashboard (localStorage).
 */
export const LS_CRM_FILTER_COMPANY_ID = 'crm_dash_filter_company_id';

/** Theo dõi user CRM gần nhất — khi đổi tài khoản thì xóa bộ lọc lưu chung. */
export const LS_CRM_SESSION_USER_ID = 'crm_session_user_id';

export const LS_CRM_DASH_LEAD_TYPE = 'crm_dash_filter_lead_type_id';

/** Giữ tên cũ khi import từ code đã tồn tại */
export const LS_CRM_DASH_COMPANY = LS_CRM_FILTER_COMPANY_ID;

export function getStoredCrmFilterCompanyId() {
  try {
    const s = localStorage.getItem(LS_CRM_FILTER_COMPANY_ID);
    return s && String(s).trim() ? String(s).trim() : '';
  } catch {
    return '';
  }
}

export function setStoredCrmFilterCompanyId(companyId) {
  try {
    if (companyId) {
      localStorage.setItem(LS_CRM_FILTER_COMPANY_ID, String(companyId));
    } else {
      localStorage.removeItem(LS_CRM_FILTER_COMPANY_ID);
    }
  } catch {
    /* ignore */
  }
}

/** Xóa bộ lọc CRM lưu chung (localStorage / snapshot pipeline) — tránh dính giữa các tài khoản. */
export function clearCrmSessionFilterStorage() {
  try {
    localStorage.removeItem(LS_CRM_FILTER_COMPANY_ID);
    localStorage.removeItem(LS_CRM_DASH_LEAD_TYPE);
  } catch {
    /* ignore */
  }
  clearCrmPipelineUiPersistence();
}

/**
 * Gọi sau khi đăng nhập: nếu user khác phiên trước thì reset bộ lọc CRM.
 * @returns {boolean} true nếu đã xóa bộ lọc do đổi user
 */
export function syncCrmSessionUserOnLogin(userId) {
  const newId = userId != null ? String(userId).trim() : '';
  let prevId = '';
  try {
    prevId = localStorage.getItem(LS_CRM_SESSION_USER_ID) || '';
  } catch {
    /* ignore */
  }
  const userChanged = !!(prevId && newId && prevId !== newId);
  if (userChanged) {
    clearCrmSessionFilterStorage();
    clearWorkshopDashFilterStorage();
  }
  try {
    if (newId) localStorage.setItem(LS_CRM_SESSION_USER_ID, newId);
    else localStorage.removeItem(LS_CRM_SESSION_USER_ID);
  } catch {
    /* ignore */
  }
  return userChanged;
}

export function clearCrmSessionUserMarker() {
  try {
    localStorage.removeItem(LS_CRM_SESSION_USER_ID);
  } catch {
    /* ignore */
  }
}

/** Admin CRM: ưu tiên Công ty Phúc Đạt (khớp tên / tên ngắn) khi chưa có bản ghi lưu */
export function findDefaultAdminCrmCompanyPhucDat(companies) {
  if (!companies?.length) return '';
  const hit = companies.find((c) => {
    const t = `${c.name || ''} ${c.short_name || ''}`.toLowerCase();
    return t.includes('phúc đạt') || t.includes('phuc dat') || (t.includes('phúc') && t.includes('đạt'));
  });
  return hit?.id ? String(hit.id) : '';
}

/** Công ty CRM thường chưa có lead (dễ làm admin tưởng "mất dữ liệu" nếu giữ bộ lọc cũ). */
export function isLikelyEmptyCrmLeadCompany(company) {
  if (!company) return false;
  const t = `${company.name || ''} ${company.short_name || ''}`.toLowerCase();
  return t.includes('metalla') || t.includes('nextgo');
}

/**
 * Sắp xếp dropdown công ty CRM: Phúc Đạt → Vạn Phú Thành → còn lại (Metalla/NextGo cuối).
 * Tránh Metalla (0 lead) đứng đầu danh sách.
 */
export function sortCrmCompaniesForAdminFilter(companies) {
  const list = Array.isArray(companies) ? [...companies] : [];
  const rank = (c) => {
    const t = `${c?.name || ''} ${c?.short_name || ''}`.toLowerCase();
    if (t.includes('phúc đạt') || t.includes('phuc dat') || (t.includes('phúc') && t.includes('đạt'))) return 0;
    if (t.includes('vạn phú') || t.includes('van phu')) return 1;
    if (t.includes('metalla') || t.includes('nextgo')) return 9;
    return 5;
  };
  return list.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi');
  });
}

/**
 * Công ty mặc định trên form cài đặt CRM / admin tổng mở dashboard:
 * → đã lưu (bộ lọc pipeline / dashboard) nếu còn trong danh sách
 * → công ty đầu danh sách API (thứ tự `for_module: 'crm'`)
 */
export function resolveDefaultCrmAdminCompanyId(companies) {
  if (!companies?.length) return '';
  const stored = getStoredCrmFilterCompanyId();
  if (stored && companies.some((c) => String(c.id) === String(stored))) {
    const hit = companies.find((c) => String(c.id) === String(stored));
    // Bỏ qua Metalla/NextGo đã lưu — admin hay kẹt bộ lọc 0 lead.
    if (!isLikelyEmptyCrmLeadCompany(hit)) return String(stored);
  }
  return findDefaultAdminCrmCompanyPhucDat(companies) || (companies[0]?.id ? String(companies[0].id) : '');
}

/**
 * Dashboard CRM: giữ đúng một pipeline (mặc định công ty) trong state — tránh trộn nhiều ống CRM.
 * Khi chưa chọn công ty (`companyId` rỗng) trả về toàn bộ response (hành vi cũ cho admin chưa gắn bộ lọc).
 */
export function narrowPipelinesToDefaultForCompany(allPipelines, companyId) {
  const all = Array.isArray(allPipelines) ? allPipelines : [];
  if (!companyId) return all;
  const forCo = all.filter((p) => String(p.company_id || '') === String(companyId));
  if (forCo.length === 0) return [];
  const def = forCo.find((p) => p.is_default) || forCo[0];
  return def ? [def] : [];
}

/**
 * True nếu công ty đã tách pipeline CRM theo khu vực (≥2 pipeline active của công ty
 * này có `region_id` khác nhau, không null) — dùng để quyết định có bắt buộc chọn
 * khu vực trước khi hiển thị Kanban hay không.
 */
export function companyHasRegionPipelines(allPipelines, companyId) {
  if (!companyId) return false;
  const all = Array.isArray(allPipelines) ? allPipelines : [];
  const regionIds = new Set(
    all
      .filter((p) => String(p.company_id || '') === String(companyId) && p.region_id)
      .map((p) => String(p.region_id)),
  );
  return regionIds.size >= 2;
}

/** Pipeline riêng của một khu vực cụ thể trong công ty (null nếu không có / chưa tách theo khu vực). */
export function resolvePipelineForCompanyRegion(allPipelines, companyId, regionId) {
  if (!companyId || !regionId || regionId === '__none__') return null;
  const all = Array.isArray(allPipelines) ? allPipelines : [];
  const forCo = all.filter((p) => String(p.company_id || '') === String(companyId));
  return forCo.find((p) => String(p.region_id || '') === String(regionId)) || null;
}

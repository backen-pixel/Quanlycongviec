/**
 * Công ty dùng để lọc dữ liệu CRM (admin) — đồng bộ với trang Pipeline, Nguồn, Dashboard…
 * Cùng key với CRMDashboard (localStorage).
 */
export const LS_CRM_FILTER_COMPANY_ID = 'crm_dash_filter_company_id';

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

/** Admin CRM: ưu tiên Công ty Phúc Đạt (khớp tên / tên ngắn) khi chưa có bản ghi lưu */
export function findDefaultAdminCrmCompanyPhucDat(companies) {
  if (!companies?.length) return '';
  const hit = companies.find((c) => {
    const t = `${c.name || ''} ${c.short_name || ''}`.toLowerCase();
    return t.includes('phúc đạt') || t.includes('phuc dat') || (t.includes('phúc') && t.includes('đạt'));
  });
  return hit?.id ? String(hit.id) : '';
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
    return String(stored);
  }
  return companies[0]?.id ? String(companies[0].id) : '';
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

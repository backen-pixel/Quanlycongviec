import type { AuthUser } from '../context/AuthContext';

/** Lưu công ty đang xem trên mobile cho admin hệ thống (role admin, không gắn company). */
export const CRM_MOBILE_SYSTEM_ADMIN_COMPANY_KEY = 'crm_mobile_system_admin_company_id_v1';

/** Admin tổng: role admin và không có company_id trên JWT — có thể xem nhiều công ty (cần chọn). */
export function isCrmSystemAdmin(user: AuthUser | null | undefined): boolean {
  if (!user?.role || String(user.role).toLowerCase() !== 'admin') return false;
  const c = user.company_id;
  return c == null || String(c).trim() === '';
}

/**
 * `company_id` trên query — backend dùng cho admin; NV vẫn bị khóa theo JWT nhưng gửi trùng company_id là an toàn.
 * Admin công ty (admin + company_id): luôn gửi company của mình để các route chỉ kiểm tra `role === admin` vẫn lọc đúng.
 */
export function crmCompanyQueryParams(
  user: AuthUser | null | undefined,
  systemAdminSelectedCompanyId: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!user) return out;
  const own = user.company_id != null && String(user.company_id).trim() !== '';
  if (own) {
    out.company_id = String(user.company_id).trim();
    return out;
  }
  if (isCrmSystemAdmin(user)) {
    const sel = systemAdminSelectedCompanyId != null && String(systemAdminSelectedCompanyId).trim() !== '';
    if (sel) out.company_id = String(systemAdminSelectedCompanyId).trim();
  }
  return out;
}

import { isSystemAdmin, isCompanyScopedAdmin } from './adminRole';

/**
 * Phân loại admin CRM:
 * - Admin hệ thống: role `admin`, không gắn công ty → xem/lọc mọi công ty trong HST (tenantGate giới hạn phạm vi).
 * - Admin công ty:  role `admin` hoặc `sales_admin` và có `company_id` → khoá theo một công ty.
 */
export function isCrmSystemAdmin(user) {
  return isSystemAdmin(user);
}

export function isCrmCompanyAdmin(user) {
  return isCompanyScopedAdmin(user);
}

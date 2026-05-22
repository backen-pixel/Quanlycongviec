import { isSystemAdmin, isCompanyScopedAdmin } from './adminRole';

/**
 * Phân loại admin CRM:
 * - Admin hệ thống: role `admin` và không gắn công ty → xem/lọc mọi công ty.
 * - Admin công ty:  role `admin` hoặc `sales_admin` và có `company_id` → khoá theo một công ty.
 */
export function isCrmSystemAdmin(user) {
  return isSystemAdmin(user);
}

export function isCrmCompanyAdmin(user) {
  return isCompanyScopedAdmin(user);
}

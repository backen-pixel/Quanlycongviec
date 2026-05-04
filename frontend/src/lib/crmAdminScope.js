/**
 * Phân loại admin CRM (cùng role `admin` trong DB):
 * - Admin hệ thống: không gắn công ty → lọc/xem được mọi công ty (theo UI & query).
 * - Admin công ty: có `user.company_id` → API & dashboard khóa theo một công ty.
 */
export function isCrmSystemAdmin(user) {
  return user?.role === 'admin' && !user?.company_id;
}

export function isCrmCompanyAdmin(user) {
  return user?.role === 'admin' && !!user?.company_id;
}

/** Công ty mặc định khi mở CRM / báo cáo — khớp CrmHubScreen. */
export function defaultCompanyIdForUser(
  user: { company_id?: string | null } | null | undefined,
  companies: { id: string }[],
): string {
  if (user?.company_id) return String(user.company_id);
  if (companies.length === 1) return companies[0]?.id || '';
  return '';
}

/** Admin hệ thống (không gắn company_id) — được chọn «Tất cả công ty». */
export function isSystemWideAdmin(user: { role?: string | null; company_id?: string | null } | null | undefined): boolean {
  return String(user?.role || '').trim().toLowerCase() === 'admin' && !user?.company_id;
}

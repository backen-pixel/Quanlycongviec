/** Hiển thị tên công ty từ company_id + danh sách đã tải (tránh join Supabase thiếu FK). */
export function resolveTrashCompanyLabel(companyId, companies = []) {
  if (!companyId) return '—';
  const c = companies.find((x) => String(x.id) === String(companyId));
  return c?.short_name || c?.name || '—';
}

import { Search } from 'lucide-react';

/**
 * Thanh lọc phạm vi — dùng cùng `useScopeFilter` hoặc truyền props thủ công.
 */
export default function ScopeFilterBar({
  scope,
  className = '',
  companyLabel = 'Công ty',
  departmentLabel = 'Phòng ban',
  searchPlaceholder = 'Tìm kiếm…',
  companyAllowAll = true,
  emptyCompanyLabel = 'Tất cả',
  departmentDisabledWithoutCompany = true,
}) {
  const s = scope || {};
  const {
    showCompany = true,
    showDepartment = true,
    showSearch = false,
    showDateRange = false,
    companies = [],
    departmentsForCompany = [],
    companyId = '',
    setCompanyId,
    departmentId = '',
    setDepartmentId,
    search = '',
    setSearch,
    dateFrom = '',
    setDateFrom,
    dateTo = '',
    setDateTo,
    metaLoading = false,
  } = s;

  const cols = [
    showCompany,
    showDepartment,
    showSearch,
    showDateRange,
  ].filter(Boolean).length;

  if (!cols) return null;

  const gridClass =
    cols >= 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : cols === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : cols === 2
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1';

  return (
    <div className={`grid gap-2 ${gridClass} ${className}`}>
      {showCompany && (
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            {companyLabel}
          </span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId?.(e.target.value)}
            disabled={metaLoading}
            className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
          >
            <option value="">{companyAllowAll ? emptyCompanyLabel : (emptyCompanyLabel || '— Chọn công ty —')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name || c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showDepartment && (
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            {departmentLabel}
          </span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId?.(e.target.value)}
            disabled={
              metaLoading ||
              (departmentDisabledWithoutCompany && !companyId)
            }
            className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
          >
            <option value="">Tất cả</option>
            {departmentsForCompany.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showSearch && (
        <label className={`block ${cols <= 2 ? '' : 'sm:col-span-2'}`}>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Tìm kiếm
          </span>
          <div className="relative mt-0.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </label>
      )}

      {showDateRange && (
        <>
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Từ ngày
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom?.(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Đến ngày
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo?.(e.target.value)}
              className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </label>
        </>
      )}
    </div>
  );
}

import { Building2, Search, User, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TRASH_PAGE_SIZE } from '../lib/trashPageUtils';

export function UnifiedTrashFilters({
  showCompanyFilter,
  companies = [],
  employees = [],
  filterCompany,
  onFilterCompanyChange,
  filterEmployee,
  onFilterEmployeeChange,
  search,
  onSearchChange,
  lockedCompanyLabel = '',
}) {
  const hasActiveFilters = !!(filterCompany || filterEmployee || search.trim());

  return (
    <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {showCompanyFilter ? (
          <div className="flex flex-col gap-1 min-w-[11rem] flex-1 sm:flex-initial">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Công ty
            </label>
            <select
              value={filterCompany}
              onChange={(e) => {
                onFilterCompanyChange(e.target.value);
                onFilterEmployeeChange('');
              }}
              className="h-9 w-full min-w-[11rem] px-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 cursor-pointer"
            >
              <option value="">Tất cả công ty</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </div>
        ) : lockedCompanyLabel ? (
          <div className="h-9 inline-flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
            <Building2 className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
            {lockedCompanyLabel}
          </div>
        ) : null}

        <div className="flex flex-col gap-1 min-w-[11rem] flex-1 sm:flex-initial">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
            <User className="h-3 w-3" /> Người xóa
          </label>
          <select
            value={filterEmployee}
            onChange={(e) => onFilterEmployeeChange(e.target.value)}
            className="h-9 w-full min-w-[11rem] px-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 cursor-pointer"
          >
            <option value="">Tất cả nhân viên</option>
            {employees.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Tìm nhanh</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tên, mã, lý do…"
              className="h-9 w-full pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-400 cursor-pointer"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              if (showCompanyFilter) onFilterCompanyChange('');
              onFilterEmployeeChange('');
              onSearchChange('');
            }}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer shrink-0"
          >
            Xóa lọc
          </button>
        )}
      </div>
    </div>
  );
}

export function TrashTablePagination({ page, totalPages, total, pageSize = TRASH_PAGE_SIZE, onPageChange }) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50/80 text-xs text-gray-600">
      <span>
        Hiển thị <strong className="text-gray-800">{from}–{to}</strong> / <strong className="text-gray-800">{total}</strong>
      </span>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer inline-flex items-center gap-0.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Trước
        </button>
        <span className="px-2 tabular-nums">{page} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer inline-flex items-center gap-0.5"
        >
          Sau <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Khung bảng cuộn — thead dính, tránh cuộn cả trang. */
export function TrashScrollTableShell({ header, footer, children, className = '' }) {
  return (
    <div className={`flex flex-col min-h-0 h-full max-h-[min(560px,calc(100vh-15rem))] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm ${className}`}>
      {header}
      <div className="flex-1 min-h-0 overflow-auto [scrollbar-width:thin]">
        {children}
      </div>
      {footer}
    </div>
  );
}

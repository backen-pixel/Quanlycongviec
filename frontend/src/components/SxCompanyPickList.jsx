import { companyPreferredForLeadType } from '../lib/sxCompanySuggestFromLeadType';

/** Danh sách chọn công ty SX — ★ gợi ý màu đỏ (option native không tô màu được). */
export default function SxCompanyPickList({
  companies = [],
  value = '',
  onChange,
  leadTypeRow = null,
  kind = null,
  disabled = false,
  accent = 'teal',
}) {
  const selectedCls = accent === 'orange'
    ? 'bg-orange-50 ring-inset ring-1 ring-orange-200'
    : accent === 'amber'
      ? 'bg-amber-50 ring-inset ring-1 ring-amber-200'
      : 'bg-teal-50 ring-inset ring-1 ring-teal-200';
  return (
    <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 divide-y bg-white">
      {(companies || []).length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-gray-400">Không có công ty SX.</p>
      ) : (
        (companies || []).map((c) => {
          const preferred = companyPreferredForLeadType(c, leadTypeRow, kind);
          const selected = String(value || '') === String(c.id);
          return (
            <button
              type="button"
              key={c.id}
              disabled={disabled}
              onClick={() => onChange?.(String(c.id))}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selected ? selectedCls : 'hover:bg-gray-50'
              }`}
            >
              <span className={`w-4 shrink-0 text-center font-bold ${preferred ? 'text-red-600' : 'text-transparent'}`} aria-hidden>
                ★
              </span>
              <span className={selected ? 'font-semibold text-gray-900' : 'text-gray-800'}>
                {c.short_name || c.name}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

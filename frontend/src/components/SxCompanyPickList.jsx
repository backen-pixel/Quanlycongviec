import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { companyPreferredForLeadType } from '../lib/sxCompanySuggestFromLeadType';

/** Chọn công ty SX dạng dropdown gọn — ★ gợi ý màu đỏ; đóng thì chỉ 1 hàng, mở thì cuộn nội bộ. */
export default function SxCompanyPickList({
  companies = [],
  value = '',
  onChange,
  leadTypeRow = null,
  kind = null,
  disabled = false,
  accent = 'teal',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedCls = accent === 'orange'
    ? 'bg-orange-50 ring-inset ring-1 ring-orange-200'
    : accent === 'amber'
      ? 'bg-amber-50 ring-inset ring-1 ring-amber-200'
      : 'bg-teal-50 ring-inset ring-1 ring-teal-200';

  const triggerRing = accent === 'orange'
    ? 'border-orange-300 ring-orange-100'
    : accent === 'amber'
      ? 'border-amber-300 ring-amber-100'
      : 'border-teal-300 ring-teal-100';

  const checkCls = accent === 'orange'
    ? 'text-orange-600'
    : accent === 'amber'
      ? 'text-amber-600'
      : 'text-teal-600';

  const list = companies || [];
  const selected = list.find((c) => String(c.id) === String(value || ''));
  const selectedPreferred = selected
    ? companyPreferredForLeadType(selected, leadTypeRow, kind)
    : false;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const pick = (id) => {
    onChange?.(String(id));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="mt-1">
      <button
        type="button"
        disabled={disabled || list.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-10 px-3 flex items-center gap-2 rounded-xl border bg-white text-sm text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? `${triggerRing} ring-2 rounded-b-none` : 'border-gray-200 hover:border-gray-300'
        } ${selected && !open ? selectedCls : ''}`}
      >
        {list.length === 0 ? (
          <span className="flex-1 text-gray-400">Không có công ty SX.</span>
        ) : selected ? (
          <>
            <span className={`w-4 shrink-0 text-center font-bold ${selectedPreferred ? 'text-red-600' : 'text-transparent'}`} aria-hidden>
              ★
            </span>
            <span className="flex-1 truncate font-semibold text-gray-900">
              {selected.short_name || selected.name}
            </span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">— Chọn công ty SX —</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && list.length > 0 && (
        <div
          role="listbox"
          className="max-h-40 overflow-y-auto rounded-b-xl border border-t-0 border-gray-200 bg-white divide-y shadow-sm"
        >
          {list.map((c) => {
            const preferred = companyPreferredForLeadType(c, leadTypeRow, kind);
            const isSelected = String(value || '') === String(c.id);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={c.id}
                disabled={disabled}
                onClick={() => pick(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer disabled:opacity-50 ${
                  isSelected ? selectedCls : 'hover:bg-gray-50'
                }`}
              >
                <span className={`w-4 shrink-0 text-center font-bold ${preferred ? 'text-red-600' : 'text-transparent'}`} aria-hidden>
                  ★
                </span>
                <span className={`flex-1 truncate ${isSelected ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                  {c.short_name || c.name}
                </span>
                {isSelected ? <Check className={`h-4 w-4 shrink-0 ${checkCls}`} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

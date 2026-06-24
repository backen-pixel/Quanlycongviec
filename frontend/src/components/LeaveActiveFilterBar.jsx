import { X } from 'lucide-react';

export default function LeaveActiveFilterBar({ chips = [], onClearAll, className = '' }) {
  if (!chips.length) return null;

  return (
    <div className={`rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-violet-800 shrink-0">Đang lọc:</span>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 max-w-full pl-2.5 pr-1 py-1 rounded-full bg-white border border-violet-200 text-xs font-medium text-violet-900 shadow-sm"
          >
            <span className="truncate">{chip.label}</span>
            {chip.onRemove && (
              <button
                type="button"
                onClick={chip.onRemove}
                className="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-full text-violet-500 hover:bg-violet-100 hover:text-violet-800 cursor-pointer"
                aria-label={`Bỏ lọc ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer shrink-0"
          >
            Xóa tất cả lọc
          </button>
        )}
      </div>
    </div>
  );
}

import { X } from 'lucide-react';
import { useHorizontalDragScroll } from '../lib/useHorizontalDragScroll';

const CHIP_CLASS = 'inline-flex items-center gap-0.5 shrink-0 pl-1.5 pr-0.5 py-0.5 rounded-md border text-[10px] font-medium backdrop-blur-[1px] transition-colors duration-200 bg-white/25 border-violet-200/35 text-violet-900/45 group-hover/search:bg-violet-100 group-hover/search:border-violet-300 group-hover/search:text-violet-900';

export function SearchClearButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-red-500 bg-red-50 ring-1 ring-red-200/80 hover:text-red-700 hover:bg-red-100 hover:ring-red-300 shadow-sm cursor-pointer transition-colors ${className}`}
      aria-label="Xóa tìm kiếm"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export default function SearchInlineFilterChips({
  chips,
  opacityClass = '',
  onClearChip,
  onClearAll,
  showClearAll = false,
  clearAllTitle = 'Xóa tất cả bộ lọc',
}) {
  const { ref, onMouseDown } = useHorizontalDragScroll();

  if (!chips.length) return null;

  return (
    <>
      <div
        ref={ref}
        onMouseDown={onMouseDown}
        className={`flex items-center gap-1 shrink-0 max-w-[min(58%,13rem)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-opacity duration-200 cursor-grab active:cursor-grabbing ${opacityClass}`}
        aria-label="Bộ lọc đang áp dụng"
        title="Giữ chuột trái và kéo để xem thêm bộ lọc"
      >
        {chips.map((chip) => (
          <span key={chip.key} className={CHIP_CLASS}>
            <span className="max-w-[5.5rem] truncate">{chip.label}</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onClearChip(chip)}
              className="p-0.5 rounded text-violet-600/50 hover:bg-violet-200/70 hover:text-violet-900 cursor-pointer group-hover/search:text-violet-700"
              aria-label={`Bỏ lọc ${chip.label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      {showClearAll && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClearAll}
          className="shrink-0 text-[9px] font-medium text-violet-700/40 hover:text-red-600 group-hover/search:text-violet-700/70 px-0.5 cursor-pointer whitespace-nowrap transition-colors"
          title={clearAllTitle}
        >
          Xóa
        </button>
      )}
    </>
  );
}

import { Plus, X } from 'lucide-react';

/**
 * Hàng preview ảnh chờ gửi (Zalo-style): «N ảnh» + thumbnail + nút thêm.
 */
export default function ChatPendingImagesBar({
  items = [],
  onRemove,
  onAddClick,
  disabled = false,
  accent = 'violet',
}) {
  if (!items.length) return null;

  const ring = accent === 'blue' ? 'ring-blue-300 hover:ring-blue-400' : 'ring-violet-300 hover:ring-violet-400';
  const addBorder = accent === 'blue' ? 'border-blue-300 text-blue-500 hover:bg-blue-50' : 'border-violet-300 text-violet-500 hover:bg-violet-50';

  return (
    <div className="mt-2 pt-2 border-t border-slate-200/80">
      <p className="text-[12px] font-medium text-slate-600 mb-2">
        {items.length} ảnh
      </p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div key={item.id} className="relative shrink-0">
            <img
              src={item.previewUrl}
              alt=""
              className={`w-14 h-14 rounded-lg object-cover bg-slate-100 ring-1 ${ring}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove?.(item.id)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800/85 text-white flex items-center justify-center hover:bg-slate-900 disabled:opacity-40"
              title="Xóa ảnh"
              aria-label="Xóa ảnh"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onAddClick}
          className={`shrink-0 w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors disabled:opacity-40 ${addBorder}`}
          title="Thêm ảnh"
          aria-label="Thêm ảnh"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

import { Copy, Forward, Trash2, Undo2, X } from 'lucide-react';

/**
 * Thanh thao tác khi chọn nhiều tin nhắn Messenger.
 */
export default function MessengerMessageSelectionBar({
  count,
  canRecallCount = 0,
  onCopy,
  onForward,
  onRecall,
  onDeleteForMe,
  onCancel,
}) {
  if (!count) return null;

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-violet-50/80">
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 w-7 h-7 rounded-full hover:bg-slate-200/80 flex items-center justify-center text-slate-600"
        title="Hủy chọn"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="text-xs font-semibold text-violet-800 min-w-[4.5rem]">
        Đã chọn {count}
      </span>
      <div className="flex-1 flex items-center justify-end gap-1 flex-wrap">
        <ActionChip icon={Copy} label="Sao chép" onClick={onCopy} />
        <ActionChip icon={Forward} label="Chia sẻ" onClick={onForward} />
        {canRecallCount > 0 ? (
          <ActionChip icon={Undo2} label="Thu hồi" onClick={onRecall} danger />
        ) : null}
        <ActionChip icon={Trash2} label="Xóa" onClick={onDeleteForMe} danger />
      </div>
    </div>
  );
}

function ActionChip({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
        danger
          ? 'text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100'
          : 'text-violet-800 border-violet-200 bg-white hover:bg-violet-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

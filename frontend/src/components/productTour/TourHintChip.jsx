import { BookOpen, X } from 'lucide-react';

export default function TourHintChip({ onStart, onDismiss, title = 'Làm quen CRM — 6 bước' }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-[99970] flex items-center gap-2 rounded-2xl border border-sky-200 bg-white shadow-xl shadow-sky-900/10 pl-3 pr-2 py-2 max-w-[min(340px,calc(100vw-2rem))]"
      role="status"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
        <BookOpen className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
        <p className="text-[11px] text-slate-500">Tour trên màn hình — bấm từng nút</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="shrink-0 h-9 px-3 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 cursor-pointer"
      >
        Bắt đầu
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        aria-label="Ẩn gợi ý"
        title="Ẩn"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

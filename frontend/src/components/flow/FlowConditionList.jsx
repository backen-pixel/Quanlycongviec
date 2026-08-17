import { Plus, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';

/**
 * Danh sách điều kiện của một node hoặc một cạnh.
 * Điều kiện bắt buộc thì chặn, điều kiện tuỳ chọn chỉ để tham chiếu.
 */
export default function FlowConditionList({ conditions, onAdd, onRemove, onToggleRequired, emptyHint }) {
  return (
    <div className="space-y-1.5">
      {conditions.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-2.5 py-3 text-[11px] italic leading-relaxed text-slate-400">
          {emptyHint}
        </p>
      ) : (
        conditions.map((c) => (
          <div
            key={c.cid}
            className="group flex items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
          >
            <button
              type="button"
              onClick={() => onToggleRequired(c.cid)}
              title={c.is_required ? 'Bắt buộc — bỏ để chuyển thành tham chiếu' : 'Tham chiếu — bấm để thành bắt buộc'}
              className={`mt-0.5 shrink-0 rounded p-0.5 transition-colors ${
                c.is_required ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'
              }`}
            >
              {c.is_required ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            </button>
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-700">
              {c.config?.label || c.condition_type}
            </p>
            <button
              type="button"
              onClick={() => onRemove(c.cid)}
              className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
              title="Xoá điều kiện"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-[#296DFF] hover:text-[#296DFF]"
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm điều kiện
      </button>
    </div>
  );
}

import { ArrowRight, Trash2 } from 'lucide-react';
import { CONDITION_LOGIC_OPTIONS } from '../../lib/flowGraphModel';
import FlowConditionList from './FlowConditionList';

/**
 * Panel thuộc tính của một cạnh: quan hệ giữa hai node, cách hợp điều kiện
 * và danh sách điều kiện phải thoả để đi qua cạnh này.
 */
export default function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  cardinality,
  branchMode,
  conditions,
  onChange,
  onDelete,
  onAddCondition,
  onRemoveCondition,
  onToggleConditionRequired,
}) {
  const data = edge.data || {};

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <span className="min-w-0 truncate">{sourceLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 truncate">{targetLabel}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-[#296DFF]/30 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#296DFF]">
            {cardinality}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            Nguồn chạy: {branchMode}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          Quan hệ được suy ra từ số cạnh hai đầu. Muốn đổi sang 1-N hay N-N thì nối thêm cạnh
          trên canvas, còn cách chạy song song hay tuần tự thì chỉnh ở node nguồn.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Nhãn cạnh
        </span>
        <input
          value={data.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Ví dụ: hàng cần lắp đặt"
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Hợp điều kiện
        </span>
        <select
          value={data.condition_logic || 'all'}
          onChange={(e) => onChange({ condition_logic: e.target.value })}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
        >
          {CONDITION_LOGIC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Điều kiện đi qua cạnh
        </p>
        <FlowConditionList
          conditions={conditions}
          onAdd={onAddCondition}
          onRemove={onRemoveCondition}
          onToggleRequired={onToggleConditionRequired}
          emptyHint="Chưa có điều kiện. Cạnh sẽ luôn được đi qua khi node nguồn hoàn tất."
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 py-2 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Xoá cạnh
      </button>
    </div>
  );
}

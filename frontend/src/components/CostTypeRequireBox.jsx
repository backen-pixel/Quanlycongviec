import { FileSpreadsheet } from 'lucide-react';

/** Checkbox gắn loại chi phí với bộ mẫu / nhiệm vụ — bắt upload Excel. */
export function CostTypeTemplateChecks({ types, selectedIds, onToggle, emptyHint }) {
  const selected = (selectedIds || []).map(String);
  if (!types?.length) {
    return (
      <p className="text-xs text-gray-500 rounded-lg border border-dashed border-slate-200 px-3 py-2">
        {emptyHint || 'Chưa có loại chi phí. Tạo ở Setup chi phí (menu Công việc → Setup công thức chi phí).'}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-semibold text-teal-900 inline-flex items-center gap-1">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Việc này phải nộp Excel chi phí nào?
      </p>
      <p className="text-[11px] text-teal-800/80">Tích loại nào thì hoàn thành công việc phải đã upload file Excel loại đó trên tab Kế toán.</p>
      <div className="flex flex-wrap gap-2">
        {types.map((t) => {
          const on = selected.includes(String(t.id));
          return (
            <label
              key={t.id}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 h-8 rounded-lg border cursor-pointer ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-slate-200'}`}
            >
              <input
                type="checkbox"
                className="accent-teal-700"
                checked={on}
                onChange={(e) => onToggle(t, e.target.checked)}
              />
              {t.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function CostTypeItemSelect({ types, requireExcel, costTypeId, onChange }) {
  if (!types?.length) return null;
  return (
    <label className={`flex flex-wrap items-center gap-1.5 text-[11px] font-medium px-2 min-h-8 rounded-lg border cursor-pointer select-none ${requireExcel ? 'text-teal-900 bg-teal-50 border-teal-300' : 'text-gray-600 bg-white border-slate-200'}`}>
      <input
        type="checkbox"
        className="accent-teal-600"
        checked={!!requireExcel}
        onChange={(e) => onChange({
          require_cost_excel: e.target.checked,
          cost_type_id: e.target.checked ? (costTypeId || types[0]?.id || null) : null,
        })}
      />
      <FileSpreadsheet className="h-3 w-3" /> Phải nộp Excel
      {!!requireExcel && (
        <select
          value={costTypeId || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ require_cost_excel: true, cost_type_id: e.target.value || null })}
          className="h-6 max-w-[160px] px-1 rounded border bg-white text-[11px]"
        >
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </label>
  );
}

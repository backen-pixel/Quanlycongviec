/**
 * Setup khổ giấy: tự động chọn loại vừa đủ, hoặc tự nhập W×H.
 */
import { STANDARD_SHEETS } from '../../lib/rigidBoxDieline';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500';

export default function HopCungSheetSetup({
  mode = 'auto',
  onModeChange,
  sheets,
  onSheetsChange,
  autoLabel = '',
  compact = false,
}) {
  const setField = (key, v) => onSheetsChange?.({ ...sheets, [key]: v });

  const applyPreset = (s) => {
    if (s.type === 'chipboard') {
      onSheetsChange?.({ ...sheets, chipboardW: s.w, chipboardH: s.h });
    } else {
      onSheetsChange?.({ ...sheets, paperW: s.w, paperH: s.h });
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className="text-xs font-semibold text-gray-800 mb-1.5">Khổ giấy</p>
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => onModeChange?.('auto')}
            className={`flex-1 py-1.5 px-2 ${
              mode === 'auto' ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tự động vừa đủ
          </button>
          <button
            type="button"
            onClick={() => onModeChange?.('manual')}
            className={`flex-1 py-1.5 px-2 border-l border-gray-200 ${
              mode === 'manual' ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tự setup
          </button>
        </div>
      </div>

      {mode === 'auto' ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 overflow-hidden">
          <div className="px-2.5 py-2 border-b border-sky-100">
            <p className="text-[10px] uppercase tracking-wide text-sky-600 font-semibold">Đã chọn tự động</p>
            {autoLabel ? (
              <p className="text-[11px] text-sky-900 mt-0.5 leading-snug break-words">{autoLabel}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 divide-x divide-sky-100">
            <div className="px-2.5 py-2">
              <p className="text-[10px] text-slate-500 font-medium">Chipboard</p>
              <p className="text-sm font-bold tabular-nums text-slate-900">
                {sheets?.chipboardW}×{sheets?.chipboardH}
                <span className="text-[10px] font-semibold text-slate-500 ml-0.5">cm</span>
              </p>
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[10px] text-slate-500 font-medium">Giấy bồi</p>
              <p className="text-sm font-bold tabular-nums text-slate-900">
                {sheets?.paperW}×{sheets?.paperH}
                <span className="text-[10px] font-semibold text-slate-500 ml-0.5">cm</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Num label="CB W (cm)" value={sheets?.chipboardW} onChange={(v) => setField('chipboardW', v)} />
            <Num label="CB H (cm)" value={sheets?.chipboardH} onChange={(v) => setField('chipboardH', v)} />
            <Num label="Giấy W (cm)" value={sheets?.paperW} onChange={(v) => setField('paperW', v)} />
            <Num label="Giấy H (cm)" value={sheets?.paperH} onChange={(v) => setField('paperH', v)} />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 mb-1">Chọn nhanh kho chuẩn</p>
            <div className="flex flex-wrap gap-1">
              {STANDARD_SHEETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applyPreset(s)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-sky-300 hover:text-sky-800"
                  title={s.label}
                >
                  {s.type === 'paper' ? 'Giấy' : 'CB'} {s.w}×{s.h}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input
        type="number"
        className={inputClass}
        value={value ?? ''}
        min={1}
        step="0.1"
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

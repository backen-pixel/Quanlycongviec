import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function formatYmdVi(ymd) {
  if (!ymd || ymd.length < 10) return ymd || '';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatYmdListVi(ymds) {
  const list = [...(ymds || [])].map((d) => String(d || '').slice(0, 10)).filter(Boolean).sort();
  if (!list.length) return '';
  if (list.length === 1) return formatYmdVi(list[0]);
  return list.map(formatYmdVi).join(', ');
}

/**
 * Mini lịch chọn nhiều ngày (toggle). Liên tiếp hoặc cách ngày (1, 3, 5…).
 * minYmd: ngày trước đó bị khóa (vd. không lắp trước ngày nhận hàng VC).
 * accent: 'orange' | 'teal'
 */
export default function MultiDayDatePicker({
  selectedYmds,
  onChange,
  anchorYmd,
  minYmd = '',
  hint = 'Chọn một hoặc nhiều ngày (có thể cách ngày: 1, 3, 5…)',
  accent = 'orange',
  disabled = false,
}) {
  const isTeal = accent === 'teal';
  const wrapCls = isTeal
    ? 'rounded-xl border border-teal-300 bg-teal-50/50 p-3 space-y-2'
    : 'rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2';
  const onCls = isTeal
    ? 'bg-teal-600 text-white shadow-sm ring-2 ring-teal-300 cursor-pointer'
    : 'bg-orange-500 text-white shadow-sm ring-2 ring-orange-300 cursor-pointer';
  const offCls = isTeal
    ? 'bg-white text-gray-700 hover:bg-teal-100 border border-teal-200 cursor-pointer'
    : 'bg-white text-gray-700 hover:bg-orange-100 border border-gray-200 cursor-pointer';
  const chipCls = isTeal
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 text-[11px] font-medium cursor-pointer hover:bg-teal-200'
    : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[11px] font-medium cursor-pointer hover:bg-orange-200';
  const emptyHintCls = isTeal ? 'text-[11px] text-teal-800' : 'text-[11px] text-amber-700';
  const sorted = [...(selectedYmds || [])].filter(Boolean).sort();
  const base = anchorYmd || sorted[0] || (() => {
    const n = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  })();
  const [viewY, viewM] = (() => {
    const [y, m] = String(base).slice(0, 10).split('-').map(Number);
    return [y, m];
  })();
  const [cursor, setCursor] = useState({ y: viewY, m: viewM });

  useEffect(() => {
    const src = sorted[0] || anchorYmd;
    if (!src) return;
    const [y, m] = String(src).slice(0, 10).split('-').map(Number);
    if (y && m) setCursor({ y, m });
  }, [anchorYmd]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstDow = new Date(cursor.y, cursor.m - 1, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const selectedSet = new Set(sorted);
  const min = minYmd ? String(minYmd).slice(0, 10) : '';
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const toggleDay = (d) => {
    if (disabled) return;
    const ymd = `${cursor.y}-${pad(cursor.m)}-${pad(d)}`;
    if (min && ymd < min) return;
    const next = selectedSet.has(ymd)
      ? sorted.filter((x) => x !== ymd)
      : [...sorted, ymd].sort();
    onChange(next);
  };

  const monthLabel = `Tháng ${cursor.m}/${cursor.y}`;

  return (
    <div className={`${wrapCls}${disabled ? ' opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg hover:bg-white text-gray-600 cursor-pointer"
          onClick={() => setCursor((c) => {
            const m = c.m - 1;
            return m < 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m };
          })}
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button
          type="button"
          className="w-8 h-8 rounded-lg hover:bg-white text-gray-600 cursor-pointer"
          onClick={() => setCursor((c) => {
            const m = c.m + 1;
            return m > 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m };
          })}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-gray-500">
        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} className="h-8" />;
          const ymd = `${cursor.y}-${pad(cursor.m)}-${pad(d)}`;
          const on = selectedSet.has(ymd);
          const blocked = !!(min && ymd < min);
          return (
            <button
              key={ymd}
              type="button"
              disabled={blocked || disabled}
              onClick={() => toggleDay(d)}
              className={`h-8 rounded-lg text-xs font-semibold transition ${
                blocked
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : on
                    ? onCls
                    : offCls
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {sorted.length === 0 ? (
          <span className={emptyHintCls}>{hint}</span>
        ) : (
          <>
            <span className="text-[11px] text-gray-600 font-medium">{sorted.length} ngày:</span>
            {sorted.map((ymd) => (
              <button
                key={ymd}
                type="button"
                onClick={() => onChange(sorted.filter((x) => x !== ymd))}
                className={chipCls}
                title="Bỏ ngày này"
              >
                {formatYmdVi(ymd)} <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-red-600 hover:underline cursor-pointer ml-1"
            >
              Xóa hết
            </button>
          </>
        )}
      </div>
    </div>
  );
}

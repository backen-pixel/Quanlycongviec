import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const HEADS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function parseYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map((n) => Number(n));
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatChip(ymd) {
  const date = parseYmd(ymd);
  if (!date) return 'Chưa chọn';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAY_SHORT[date.getDay()]} ${dd}/${mm}/${date.getFullYear()}`;
}

function dayCount(start, end) {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function includesSunday(start, end) {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (!a || !b) return false;
  const cursor = new Date(a);
  while (cursor <= b) {
    if (cursor.getDay() === 0) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

function monthCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const total = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) cells.push(new Date(year, month - 1, day));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function LeaveRangeCalendar({ startDate, endDate, onChange }) {
  const [cursor, setCursor] = useState(() => {
    const base = parseYmd(startDate) || new Date();
    return { y: base.getFullYear(), m: base.getMonth() + 1 };
  });

  const today = toYmd(new Date());
  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const count = dayCount(startDate, endDate);
  const hasRange = Boolean(startDate && endDate);
  const single = hasRange && startDate === endDate;
  const sunday = hasRange && !single && includesSunday(startDate, endDate);

  const shiftMonth = (delta) => {
    setCursor((current) => {
      const next = new Date(current.y, current.m - 1 + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() + 1 };
    });
  };

  const pick = (ymd) => {
    if (!startDate || (endDate && startDate !== endDate)) {
      onChange({ start_date: ymd, end_date: ymd });
      return;
    }
    if (ymd === startDate) {
      onChange({ start_date: ymd, end_date: ymd });
      return;
    }
    const from = ymd < startDate ? ymd : startDate;
    const to = ymd < startDate ? startDate : ymd;
    onChange({ start_date: from, end_date: to });
  };

  let hint = 'Bấm ngày bắt đầu, rồi bấm ngày kết thúc. Mọi ngày ở giữa đều được tính, kể cả chủ nhật.';
  if (single) hint = 'Đang nghỉ 1 ngày. Bấm một ngày khác để nghỉ liên tiếp đến ngày đó.';
  else if (hasRange) hint = `${count} ngày liên tiếp${sunday ? ', gồm chủ nhật' : ''}. Bấm một ngày bất kỳ để chọn lại.`;

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[10px] font-medium text-gray-600 mb-0.5">Nghỉ từ ngày</p>
          <div className="h-9 px-3 rounded-lg border border-violet-200 bg-white text-sm font-medium text-gray-900 flex items-center">
            {formatChip(startDate)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium text-gray-600 mb-0.5">Đến ngày</p>
          <div className="h-9 px-3 rounded-lg border border-violet-200 bg-white text-sm font-medium text-gray-900 flex items-center">
            {formatChip(endDate)}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-violet-900/80 mb-2">{hint}</p>
      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-white text-gray-600 cursor-pointer inline-flex items-center justify-center" aria-label="Tháng trước">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">Tháng {cursor.m}, {cursor.y}</span>
        <button type="button" onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg hover:bg-white text-gray-600 cursor-pointer inline-flex items-center justify-center" aria-label="Tháng sau">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {HEADS.map((label) => (
          <div key={label} className={`text-[10px] font-semibold py-1 ${label === 'CN' ? 'text-rose-500' : 'text-gray-500'}`}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="h-9" />;
          const ymd = toYmd(date);
          const isEdge = ymd === startDate || ymd === endDate;
          const inside = hasRange && ymd >= startDate && ymd <= endDate;
          const isToday = ymd === today;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => pick(ymd)}
              className={`h-9 rounded-lg text-sm cursor-pointer transition ${
                isEdge
                  ? 'bg-violet-600 text-white font-semibold'
                  : inside
                    ? 'bg-violet-200 text-violet-950 font-medium'
                    : 'bg-white text-gray-800 hover:bg-violet-100 border border-violet-100'
              } ${isToday && !isEdge ? 'ring-1 ring-violet-400' : ''}`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

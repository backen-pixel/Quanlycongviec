import { useEffect, useMemo, useState } from 'react';

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const DOW_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const ACCENT = {
  violet: {
    headerBg: 'bg-violet-50',
    headerBtn: 'text-violet-600 hover:bg-violet-100',
    todayDot: 'bg-violet-600 text-white',
    todayCell: 'bg-violet-50/50',
    todayBtn: 'border-violet-200 text-violet-700 hover:bg-violet-100',
  },
  indigo: {
    headerBg: 'bg-indigo-50',
    headerBtn: 'text-indigo-600 hover:bg-indigo-100',
    todayDot: 'bg-indigo-600 text-white',
    todayCell: 'bg-indigo-50/40',
    todayBtn: 'border-indigo-200 text-indigo-700 hover:bg-indigo-100',
  },
  orange: {
    headerBg: 'bg-orange-50',
    headerBtn: 'text-orange-600 hover:bg-orange-100',
    todayDot: 'bg-orange-600 text-white',
    todayCell: 'bg-orange-50/40',
    todayBtn: 'border-orange-200 text-orange-700 hover:bg-orange-100',
  },
};

const TONE_CHIP = {
  overdue: 'bg-red-100 text-red-700 hover:bg-red-200',
  task: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
  kanban: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
  sla: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  expected_close: 'bg-violet-100 text-violet-700 hover:bg-violet-200',
  delivery: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  production: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
  deadline: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  install: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
  done: 'bg-slate-100 text-slate-400 hover:bg-slate-200',
  default: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
};

function localTodayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Khoảng ngày đầu → cuối tháng (local YYYY-MM-DD). */
export function getCalendarMonthRange(year, month0) {
  const fromD = new Date(year, month0, 1);
  const toD = new Date(year, month0 + 1, 0);
  return {
    year,
    month: month0,
    from: `${fromD.getFullYear()}-${pad2(fromD.getMonth() + 1)}-${pad2(fromD.getDate())}`,
    to: `${toD.getFullYear()}-${pad2(toD.getMonth() + 1)}-${pad2(toD.getDate())}`,
  };
}

function parseYearMonthFromIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return null;
  return { year, month };
}

/**
 * Lưới lịch tháng dùng chung cho dashboard CRM / SX / VC.
 *
 * @param {object} props
 * @param {{ id: string|number, dateKey: string, label: string, subLabel?: string, meta?: string, title?: string, tone?: string, overdue?: boolean, chipClassName?: string, chipStyle?: object, raw?: any }[]} props.items
 * @param {'violet'|'indigo'|'orange'} [props.accent]
 * @param {(item: object) => void} [props.onItemClick]
 * @param {{ label: string, className: string }[]} [props.legend]
 * @param {string} [props.footerRight]
 * @param {number} [props.maxPerDay]
 * @param {string} [props.filterFrom] — YYYY-MM-DD: đồng bộ tháng đang xem với bộ lọc
 * @param {(range: { year: number, month: number, from: string, to: string }) => void} [props.onVisibleMonthChange]
 */
export default function DashboardMonthCalendar({
  items = [],
  accent = 'indigo',
  onItemClick,
  legend = [],
  footerRight,
  maxPerDay = 3,
  filterFrom,
  onVisibleMonthChange,
}) {
  const theme = ACCENT[accent] || ACCENT.indigo;
  const today = new Date();
  const seed = parseYearMonthFromIso(filterFrom) || {
    year: today.getFullYear(),
    month: today.getMonth(),
  };
  const [year, setYear] = useState(seed.year);
  const [month, setMonth] = useState(seed.month);
  const todayKey = localTodayKey();

  // Đồng bộ tháng hiển thị khi bộ lọc thời gian đổi từ toolbar
  useEffect(() => {
    const parsed = parseYearMonthFromIso(filterFrom);
    if (!parsed) return;
    setYear((y) => (y === parsed.year ? y : parsed.year));
    setMonth((m) => (m === parsed.month ? m : parsed.month));
  }, [filterFrom]);

  const goToMonth = (nextYear, nextMonth) => {
    setYear(nextYear);
    setMonth(nextMonth);
    if (typeof onVisibleMonthChange === 'function') {
      onVisibleMonthChange(getCalendarMonthRange(nextYear, nextMonth));
    }
  };

  const prevMonth = () => {
    if (month === 0) goToMonth(year - 1, 11);
    else goToMonth(year, month - 1);
  };
  const nextMonth = () => {
    if (month === 11) goToMonth(year + 1, 0);
    else goToMonth(year, month + 1);
  };
  const goToday = () => {
    const n = new Date();
    goToMonth(n.getFullYear(), n.getMonth());
  };

  const dateMap = useMemo(() => {
    const map = {};
    for (const item of items) {
      const key = item?.dateKey;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 ${theme.headerBg}`}>
        <button
          type="button"
          onClick={prevMonth}
          className={`h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer font-bold text-lg ${theme.headerBtn}`}
          aria-label="Tháng trước"
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900">
            {MONTH_NAMES[month]} {year}
          </h3>
          <button
            type="button"
            onClick={goToday}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-white/80 cursor-pointer ${theme.todayBtn}`}
          >
            Hôm nay
          </button>
        </div>
        <button
          type="button"
          onClick={nextMonth}
          className={`h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer font-bold text-lg ${theme.headerBtn}`}
          aria-label="Tháng sau"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100">
        {DOW_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red-400' : 'text-gray-500'}`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return (
              <div
                key={`pad-${idx}`}
                className="min-h-[96px] bg-gray-50/50 border-b border-r border-gray-100"
              />
            );
          }
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayItems = dateMap[key] || [];
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const hasOverdue = dayItems.some((i) => i.overdue && !i.done);
          const dow = idx % 7;
          return (
            <div
              key={key}
              className={`min-h-[96px] p-1.5 border-b border-r border-gray-100 ${
                isPast && hasOverdue ? 'bg-red-50/30' : isToday ? theme.todayCell : ''
              }`}
            >
              <div
                className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? theme.todayDot : dow === 0 ? 'text-red-500' : 'text-gray-600'
                }`}
              >
                {day}
              </div>
              <div className="space-y-0.5">
                {dayItems.slice(0, maxPerDay).map((item) => {
                  const done = !!item.done;
                  const overdue = !done && !!item.overdue;
                  const toneKey = done ? 'done' : (overdue ? 'overdue' : (item.tone || 'default'));
                  const chipCls = item.chipClassName
                    || TONE_CHIP[toneKey]
                    || TONE_CHIP.default;
                  const hasSub = !!(item.subLabel || item.meta);
                  return (
                    <div
                      key={item.id}
                      role={onItemClick ? 'button' : undefined}
                      tabIndex={onItemClick ? 0 : undefined}
                      onClick={() => onItemClick?.(item)}
                      onKeyDown={(e) => {
                        if (!onItemClick) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onItemClick(item);
                        }
                      }}
                      title={item.title || item.label}
                      className={`px-1.5 py-0.5 rounded font-medium leading-tight ${
                        onItemClick ? 'cursor-pointer' : ''
                      } ${hasSub ? 'text-[10px]' : 'truncate text-[10px]'} ${chipCls} ${
                        done ? 'line-through decoration-slate-400' : ''
                      }`}
                      style={item.chipStyle}
                    >
                      <div className="truncate">{item.label}</div>
                      {item.subLabel ? (
                        <div className="truncate text-[9px] font-normal opacity-80">{item.subLabel}</div>
                      ) : null}
                      {item.meta ? (
                        <div className="truncate text-[9px] font-semibold opacity-70">{item.meta}</div>
                      ) : null}
                    </div>
                  );
                })}
                {dayItems.length > maxPerDay && (
                  <div className="text-[9px] text-gray-400 px-1.5">
                    +{dayItems.length - maxPerDay} nữa
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(legend.length > 0 || footerRight) && (
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
          {legend.map((leg) => (
            <span key={leg.label} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded inline-block ${leg.className}`} />
              {leg.label}
            </span>
          ))}
          {footerRight ? <span className="ml-auto">{footerRight}</span> : null}
        </div>
      )}
    </div>
  );
}

/** YYYY-MM-DD theo lịch local từ timestamp hoặc ISO string. */
export function toLocalDateKey(tsOrIso) {
  if (tsOrIso == null || tsOrIso === '') return null;
  const d = typeof tsOrIso === 'number' ? new Date(tsOrIso) : new Date(tsOrIso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Giờ:phút local từ timestamp / ISO (vd. "14:30"). */
export function formatCalendarDeadlineTime(tsOrIso) {
  if (tsOrIso == null || tsOrIso === '') return '';
  const d = typeof tsOrIso === 'number' ? new Date(tsOrIso) : new Date(tsOrIso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Ngày + giờ ngắn: "07/08 14:30" (local). */
export function formatCalendarDeadlineDateTime(tsOrIso) {
  if (tsOrIso == null || tsOrIso === '') return '';
  const d = typeof tsOrIso === 'number' ? new Date(tsOrIso) : new Date(tsOrIso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const time = formatCalendarDeadlineTime(d.getTime());
  return `${dd}/${mm} ${time}`;
}

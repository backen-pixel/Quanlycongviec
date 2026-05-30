import { useMemo, useState } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Phone, X, CalendarDays,
} from 'lucide-react';

const WEEK_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function toLocalISODate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildMonthMatrix(monthStart) {
  const firstWeekDay = monthStart.getDay();
  const start = new Date(monthStart);
  start.setDate(start.getDate() - firstWeekDay);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function formatMonthLabel(d) {
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Lịch tháng hiển thị các ghi âm theo ngày — kèm danh sách SĐT để click lọc nhanh.
 * Có thể thu gọn / mở rộng.
 *
 * Props:
 *   - recordings: mảng ghi âm (mỗi item cần có `call_started_at` hoặc `created_at`, `phone_number`)
 *   - selectedDate: ISO 'YYYY-MM-DD' hoặc null
 *   - onSelectDate(dateIso | null): khi click ô ngày
 *   - selectedPhone: string hoặc ''
 *   - onSelectPhone(phone): khi click chip SĐT
 */
export default function VoiceCalendarPanel({
  recordings = [],
  selectedDate,
  onSelectDate,
  selectedPhone = '',
  onSelectPhone,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => {
    if (selectedDate) {
      const d = new Date(selectedDate);
      if (!Number.isNaN(d.getTime())) return startOfMonth(d);
    }
    return startOfMonth(new Date());
  });

  const byDate = useMemo(() => {
    const map = new Map();
    for (const r of recordings) {
      const dateIso = toLocalISODate(r?.call_started_at || r?.created_at);
      if (!dateIso) continue;
      const slot = map.get(dateIso) || { count: 0, phones: new Map(), rows: [] };
      slot.count += 1;
      slot.rows.push(r);
      const phone = String(r?.phone_number || '').replace(/\s/g, '').trim();
      if (phone) {
        slot.phones.set(phone, (slot.phones.get(phone) || 0) + 1);
      }
      map.set(dateIso, slot);
    }
    return map;
  }, [recordings]);

  const cells = useMemo(() => buildMonthMatrix(monthCursor), [monthCursor]);
  const todayIso = toLocalISODate(new Date());
  const currentMonth = monthCursor.getMonth();
  const currentYear = monthCursor.getFullYear();

  const phonesForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const slot = byDate.get(selectedDate);
    if (!slot) return [];
    return Array.from(slot.phones.entries())
      .map(([phone, count]) => ({ phone, count }))
      .sort((a, b) => b.count - a.count);
  }, [byDate, selectedDate]);

  const monthSummary = useMemo(() => {
    let total = 0;
    const phoneSet = new Set();
    for (const [iso, slot] of byDate.entries()) {
      const d = new Date(iso);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        total += slot.count;
        for (const ph of slot.phones.keys()) phoneSet.add(ph);
      }
    }
    return { total, phones: phoneSet.size };
  }, [byDate, currentMonth, currentYear]);

  const goPrev = () => setMonthCursor((d) => addMonths(d, -1));
  const goNext = () => setMonthCursor((d) => addMonths(d, 1));
  const goToday = () => {
    setMonthCursor(startOfMonth(new Date()));
    onSelectDate?.(todayIso);
  };
  const clearSelection = () => {
    onSelectDate?.(null);
    onSelectPhone?.('');
  };

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-white shadow-md overflow-hidden">
      {/* ===== HEADER ===== */}
      <div className="relative bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-md shrink-0">
            <CalendarDays className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide leading-tight">
              Lịch ghi âm
            </h3>
            <p className="text-[11px] text-violet-100/95 mt-0.5">
              {monthSummary.total} bản · {monthSummary.phones} SĐT trong tháng
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs font-semibold hover:bg-white/25 transition-colors cursor-pointer"
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            {collapsed ? 'Mở rộng' : 'Thu gọn'}
          </button>
        </div>
      </div>

      {/* ===== BODY ===== */}
      {!collapsed && (
        <div className="p-4 space-y-3 bg-gradient-to-b from-violet-50/40 to-white">
          {/* Toolbar tháng */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={goPrev}
                className="h-8 w-8 flex items-center justify-center text-violet-700 hover:bg-violet-50 cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm font-bold tabular-nums" style={{ color: '#000000' }}>
                {formatMonthLabel(monthCursor)}
              </span>
              <button
                type="button"
                onClick={goNext}
                className="h-8 w-8 flex items-center justify-center text-violet-700 hover:bg-violet-50 cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={goToday}
                className="h-8 px-3 rounded-lg border border-violet-200 bg-white text-violet-800 text-xs font-semibold hover:bg-violet-50 cursor-pointer inline-flex items-center gap-1"
              >
                <Calendar className="h-3.5 w-3.5" />
                Hôm nay
              </button>
              {(selectedDate || selectedPhone) && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-8 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer inline-flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Bỏ lọc
                </button>
              )}
            </div>
          </div>

          {/* Tên cột thứ */}
          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((wd) => (
              <div
                key={wd}
                className="text-center text-[11px] font-bold uppercase tracking-wide py-1"
                style={{ color: '#000000' }}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Lưới ngày */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const iso = toLocalISODate(d);
              const slot = byDate.get(iso);
              const inMonth = d.getMonth() === currentMonth;
              const isToday = iso === todayIso;
              const isSelected = iso === selectedDate;
              const hasData = !!slot;
              const count = slot?.count || 0;
              const phoneCount = slot?.phones?.size || 0;

              const baseColor = !inMonth ? 'text-gray-300' : '';
              const cellBg = isSelected
                ? 'bg-gradient-to-br from-violet-600 to-indigo-600 border-violet-700 shadow-lg ring-2 ring-violet-300'
                : hasData
                  ? 'bg-gradient-to-br from-violet-50 to-fuchsia-50 border-violet-200 hover:from-violet-100 hover:to-fuchsia-100 hover:border-violet-400'
                  : isToday
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-gray-100 hover:bg-gray-50';
              const isClickable = inMonth && hasData;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => {
                    if (!isClickable) return;
                    onSelectDate?.(isSelected ? null : iso);
                  }}
                  className={`relative h-16 rounded-lg border transition-all p-1.5 flex flex-col items-start justify-between text-left ${cellBg} ${
                    isClickable ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  title={
                    hasData
                      ? `${count} bản ghi · ${phoneCount} SĐT`
                      : inMonth
                        ? 'Không có ghi âm'
                        : ''
                  }
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-[13px] font-bold tabular-nums ${baseColor}`}
                      style={
                        isSelected
                          ? { color: '#ffffff' }
                          : inMonth
                            ? { color: '#000000' }
                            : undefined
                      }
                    >
                      {d.getDate()}
                    </span>
                    {isToday && !isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </div>
                  {hasData && (
                    <div className="flex items-center gap-1 self-end">
                      {phoneCount > 0 && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
                            isSelected ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700'
                          }`}
                          title={`${phoneCount} SĐT`}
                        >
                          <Phone className="h-2 w-2" />
                          {phoneCount}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center justify-center min-w-[20px] h-4 px-1 text-[10px] font-extrabold rounded-full shadow-sm ${
                          isSelected
                            ? 'bg-white text-violet-700'
                            : 'bg-violet-600 text-white'
                        }`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Danh sách SĐT của ngày đã chọn */}
          {selectedDate && (
            <div className="rounded-xl border border-violet-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: '#000000' }}>
                  <Calendar className="h-3.5 w-3.5 text-violet-600" />
                  Ngày {selectedDate.split('-').reverse().join('/')}
                </p>
                <span className="text-[11px] font-semibold text-violet-700">
                  {byDate.get(selectedDate)?.count || 0} bản ghi
                </span>
              </div>
              {phonesForSelectedDate.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Không có SĐT — các ghi âm trong ngày không gắn số.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {phonesForSelectedDate.map(({ phone, count }) => {
                    const active = selectedPhone === phone;
                    return (
                      <button
                        key={phone}
                        type="button"
                        onClick={() => onSelectPhone?.(active ? '' : phone)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-violet-600 text-white border-violet-700 shadow-md'
                            : 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100'
                        }`}
                      >
                        <Phone className="h-3 w-3" />
                        <span className="font-mono">{phone}</span>
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-extrabold rounded-full ${
                            active ? 'bg-white text-violet-700' : 'bg-violet-600 text-white'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

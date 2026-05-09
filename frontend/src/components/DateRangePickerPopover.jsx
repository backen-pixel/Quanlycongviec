import { useMemo, useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

function iso(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(s) {
  if (!s || typeof s !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day, from, to) {
  if (!day || !from || !to) return false;
  const t = day.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function clampRange(a, b) {
  if (!a || !b) return { from: a, to: b };
  return a.getTime() <= b.getTime() ? { from: a, to: b } : { from: b, to: a };
}

/** Tuần 1–5 trong tháng: chia 7 ngày/lần (1–7, 8–14, …) */
function weekOfMonthRange(year, monthIndex0, weekNum1To5) {
  const lastDay = endOfMonth(new Date(year, monthIndex0, 1)).getDate();
  const startDay = (weekNum1To5 - 1) * 7 + 1;
  if (startDay > lastDay) return null;
  const endDay = Math.min(weekNum1To5 * 7, lastDay);
  return {
    from: new Date(year, monthIndex0, startDay),
    to: new Date(year, monthIndex0, endDay),
  };
}

export default function DateRangePickerPopover({
  open,
  title = 'Chọn khoảng ngày',
  from,
  to,
  onChange,
  onClose,
  allowClear = true,
  showPresets = true,
}) {
  const fromD = useMemo(() => parseIso(from), [from]);
  const toD = useMemo(() => parseIso(to), [to]);

  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(fromD || toD || new Date()));
  const [draftFrom, setDraftFrom] = useState(fromD);
  const [draftTo, setDraftTo] = useState(toD);

  useEffect(() => {
    if (!open) return;
    const base = fromD || toD || new Date();
    setCursorMonth(startOfMonth(base));
    setDraftFrom(fromD);
    setDraftTo(toD);
  }, [open, fromD, toD]);

  const days = useMemo(() => {
    const first = startOfMonth(cursorMonth);
    const last = endOfMonth(cursorMonth);
    const startWeekday = (first.getDay() + 6) % 7; // Monday=0
    const total = startWeekday + last.getDate();
    const rows = Math.ceil(total / 7);
    const out = [];
    for (let i = 0; i < rows * 7; i += 1) {
      const dayNum = i - startWeekday + 1;
      if (dayNum < 1 || dayNum > last.getDate()) out.push(null);
      else out.push(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), dayNum));
    }
    return out;
  }, [cursorMonth]);

  const monthLabel = useMemo(() => {
    const m = cursorMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    // Normalize leading "tháng" already in vi-VN
    return m;
  }, [cursorMonth]);

  const pickDay = useCallback((day) => {
    if (!day) return;
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(day);
      setDraftTo(null);
      return;
    }
    const { from: f, to: t } = clampRange(draftFrom, day);
    setDraftFrom(f);
    setDraftTo(t);
  }, [draftFrom, draftTo]);

  const apply = () => {
    if (!draftFrom || !draftTo) return;
    onChange?.({ from: iso(draftFrom), to: iso(draftTo) });
    onClose?.();
  };

  const applyPreset = (fromD, toD) => {
    if (!fromD || !toD) return;
    const { from: f, to: t } = clampRange(fromD, toD);
    setDraftFrom(f);
    setDraftTo(t);
    onChange?.({ from: iso(f), to: iso(t) });
    onClose?.();
  };

  const clear = () => {
    onChange?.({ from: '', to: '' });
    onClose?.();
  };

  const now = new Date();
  const yCur = cursorMonth.getFullYear();
  const mCur = cursorMonth.getMonth();

  const presetFullCursorMonth = () => {
    const f = startOfMonth(cursorMonth);
    const t = endOfMonth(cursorMonth);
    applyPreset(f, t);
  };

  const presetThisMonth = () => {
    const f = startOfMonth(now);
    const t = endOfMonth(now);
    setCursorMonth(startOfMonth(now));
    applyPreset(f, t);
  };

  const presetPrevMonth = () => {
    const ref = addMonths(now, -1);
    const f = startOfMonth(ref);
    const t = endOfMonth(ref);
    setCursorMonth(startOfMonth(ref));
    applyPreset(f, t);
  };

  const presetWeek = (weekNum) => {
    const r = weekOfMonthRange(yCur, mCur, weekNum);
    if (!r) return;
    applyPreset(r.from, r.to);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-h-[min(92vh,720px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Từ ngày</p>
              <div className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm flex items-center tabular-nums">
                {draftFrom ? iso(draftFrom) : '—'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Đến ngày</p>
              <div className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm flex items-center tabular-nums">
                {draftTo ? iso(draftTo) : '—'}
              </div>
            </div>
          </div>

          {showPresets && (
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Chọn nhanh theo tháng</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={presetFullCursorMonth}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-900 font-medium hover:bg-indigo-50 cursor-pointer"
                >
                  Cả tháng đang xem
                </button>
                <button
                  type="button"
                  onClick={presetThisMonth}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-900 font-medium hover:bg-indigo-50 cursor-pointer"
                >
                  Tháng này
                </button>
                <button
                  type="button"
                  onClick={presetPrevMonth}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-900 font-medium hover:bg-indigo-50 cursor-pointer"
                >
                  Tháng trước
                </button>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900 pt-1">Tuần trong tháng đang xem</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((w) => {
                  const r = weekOfMonthRange(yCur, mCur, w);
                  const disabled = !r;
                  return (
                    <button
                      key={w}
                      type="button"
                      disabled={disabled}
                      onClick={() => presetWeek(w)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                      title={r ? `${iso(r.from)} → ${iso(r.to)}` : undefined}
                    >
                      Tuần {w}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                Tuần 1 = ngày 1–7, tuần 2 = 8–14, … trong tháng của lịch (đổi tháng bằng mũi tên dưới).
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setCursorMonth((m) => addMonths(m, -1))} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <div className="text-sm font-semibold text-gray-900">{monthLabel}</div>
            <button type="button" onClick={() => setCursorMonth((m) => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
              <div key={d} className="text-[10px] font-semibold text-gray-500 py-1">{d}</div>
            ))}
            {days.map((d, idx) => {
              if (!d) return <div key={`e-${idx}`} className="h-9" />;
              const isStart = sameDay(d, draftFrom);
              const isEnd = sameDay(d, draftTo);
              const inside = inRange(d, draftFrom, draftTo);
              const base =
                inside ? 'bg-indigo-50' : 'bg-white';
              const edge =
                isStart || isEnd ? 'bg-indigo-600 text-white' : 'text-gray-800';
              return (
                <button
                  key={iso(d)}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`h-9 rounded-lg text-sm cursor-pointer hover:bg-indigo-100 transition ${base} ${edge}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            {allowClear ? (
              <button type="button" onClick={clear} className="text-sm text-gray-600 hover:bg-gray-100 px-3 h-9 rounded-lg cursor-pointer">
                Xóa
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:bg-gray-100 px-3 h-9 rounded-lg cursor-pointer">
                Hủy
              </button>
              <button
                type="button"
                disabled={!draftFrom || !draftTo}
                onClick={apply}
                className="text-sm bg-indigo-600 text-white px-4 h-9 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


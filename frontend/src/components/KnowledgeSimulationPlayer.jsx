/**
 * Sân tập mô phỏng cho bài kiểm tra thao tác (knowledge_exercises.type = 'simulation').
 *
 * Dựng lại 4 không gian làm việc giả (CRM · Sản xuất · VC/LĐ · Lịch) để học viên bấm
 * đúng luồng thật: lập kế hoạch → thẻ vào cột lắp đặt tạm (khoá) → xưởng bàn giao →
 * Sale xác nhận lần hai → thẻ sang cột tiếp nhận. Mọi thao tác được ghi lại và gửi
 * về backend chấm điểm theo từng bước (không sinh dữ liệu thật trong hệ thống).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, CheckCircle2, Lock, Truck, Factory, Bell, Calendar, ClipboardList,
  AlertTriangle, MessageSquare, RefreshCcw, ChevronLeft, ChevronRight, X, Plus, FileText,
  GripVertical,
} from 'lucide-react';
import MultiDayDatePicker, { formatYmdVi, formatYmdListVi } from './MultiDayDatePicker';
import { ShiftQuickPick } from './SxMultiTargetPicker';

export const SIM_BRIEF_SHORT = `Điền 3 mục rồi bấm **Thêm dự án**:

• Công ty SX: **Xưởng HCB** (phân loại **Tủ bếp**)
• Công ty VC/LĐ: **VC Phúc Đạt**
• Ngày giờ: lắp **2 ngày liền nhau** (sau hôm nay) lúc **Sáng** — lấy hàng **không sau ngày lắp đầu** lúc **Chiều**`;

export function BriefRich({ text, className = '' }) {
  return (
    <div className={className}>
      {String(text || '').split('\n').map((line, li) => (
        <p key={li} className={li ? 'mt-1' : ''}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
            const m = part.match(/^\*\*([^*]+)\*\*$/);
            return m
              ? <strong key={i} className="font-extrabold text-amber-950 underline decoration-2 decoration-amber-400 underline-offset-2">{m[1]}</strong>
              : <span key={i}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

function NeedTag() {
  return (
    <span className="ml-1 inline-flex items-center rounded bg-amber-200 text-amber-950 px-1 py-px text-[9px] font-extrabold tracking-wide align-middle">
      CẦN LÀM
    </span>
  );
}

function todayYmdVn() {
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

function ymdList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).sort();
  return value ? [String(value)] : [];
}

function daysBetweenYmd(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

function isSimStepDone(id, a) {
  const dates = ymdList(a.install_dates);
  switch (id) {
    case 'sx_company': return a.sx_company === 'hcb';
    case 'classification': return a.classification === 'tu-bep';
    case 'install_two_days':
      return dates.length >= 2 && dates.every((d, i) => i === 0 || daysBetweenYmd(dates[i - 1], d) === 1);
    case 'install_future':
      return dates.length > 0 && dates.every((d) => d > todayYmdVn());
    case 'install_shift': return a.install_time === '08:00';
    case 'pickup_not_after':
      return Boolean(a.pickup_date && dates[0] && a.pickup_date <= dates[0]);
    case 'pickup_shift': return a.pickup_time === '14:00';
    case 'vc_company': return a.vc_company === 'phuc-dat';
    case 'vc_notes':
      return String(a.vc_notes || '').split('\n').map((s) => s.trim()).filter(Boolean).length >= 2;
    case 'saved': return a.saved === true;
    case 'temp_seen': return a.temp_card_seen === true;
    case 'drag_blocked': return a.drag_blocked_seen === true;
    case 'events_seen': return a.events_seen === true;
    case 'sx_handover': return a.sx_handover === true;
    case 'sale_confirm': return a.sale_confirm === true;
    case 'final_column': return a.final_column === 'Chờ giao hàng';
    default: return false;
  }
}

const SCORE_GROUPS = [
  {
    id: 'plan',
    title: 'Form kế hoạch',
    hint: 'Mở popup rồi điền đúng 3 mục đề bài',
    go: 'crm-plan',
    goLabel: 'Mở form',
    items: [
      { id: 'sx_company', short: 'Công ty SX: Xưởng HCB' },
      { id: 'classification', short: 'Phân loại: Tủ bếp' },
      { id: 'vc_company', short: 'Công ty VC/LĐ: VC Phúc Đạt' },
      { id: 'install_two_days', short: 'Lắp 2 ngày liền nhau' },
      { id: 'install_future', short: 'Ngày lắp sau hôm nay' },
      { id: 'install_shift', short: 'Giờ lắp: Sáng' },
      { id: 'pickup_not_after', short: 'Lấy hàng ≤ ngày lắp đầu' },
      { id: 'pickup_shift', short: 'Giờ lấy hàng: Chiều' },
      { id: 'vc_notes', short: 'Ghi chú VC/LĐ 2 dòng' },
      { id: 'saved', short: 'Bấm Thêm dự án' },
    ],
  },
  {
    id: 'see',
    title: 'Xem kết quả',
    hint: 'Sau khi lưu — sang tab VC/LĐ và Lịch',
    go: 'vc',
    goLabel: 'Sang VC/LĐ',
    items: [
      { id: 'temp_seen', short: 'Thấy thẻ ở cột tạm' },
      { id: 'drag_blocked', short: 'Thử chuyển thẻ TẠM → bị chặn' },
      { id: 'events_seen', short: 'Mở tab Lịch xem 3 mốc' },
    ],
  },
  {
    id: 'handover',
    title: 'Bàn giao',
    hint: 'Xưởng xong hàng → Sale xác nhận trên CRM',
    go: 'sx',
    goLabel: 'Sang Sản xuất',
    items: [
      { id: 'sx_handover', short: 'SX → cột «Đơn hàng đã chuẩn bị xong»' },
      { id: 'sale_confirm', short: 'CRM → Chọn & bàn giao' },
      { id: 'final_column', short: 'Thẻ ở «Chờ giao hàng», hết TẠM' },
    ],
  },
];

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ddmm(ymdStr) {
  if (!ymdStr) return '—';
  const [, m, d] = String(ymdStr).split('-');
  return m && d ? `${d}/${m}` : '—';
}

function addDaysYmd(ymd, n) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

function formatLocalVi(local) {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildMonthCells(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: firstDow }, () => null);
  for (let d = 1; d <= lastDay; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MiniVcCalendar({ installDates, pickupDate, finishYmd, onPickInstall, onPickPickup }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [pickTarget, setPickTarget] = useState('both');
  const installSet = new Set(installDates || []);
  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const todayYmd = toYmd(now);
  const eventCount = (installDates?.length || 0) + (pickupDate ? 1 : 0) + (finishYmd ? 1 : 0);

  const handleDay = (ymd) => {
    if (pickTarget === 'pickup') {
      onPickPickup?.(ymd);
      return;
    }
    if (pickTarget === 'install') {
      onPickInstall?.(ymd);
      return;
    }
    onPickInstall?.(ymd);
    if (!pickupDate) onPickPickup?.(ymd);
  };

  return (
    <div className="min-w-0 rounded-xl border-2 border-orange-200 bg-orange-50/30 overflow-hidden lg:sticky lg:top-0 lg:self-start flex flex-col h-[min(720px,calc(94vh-9rem))] min-h-[480px]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 border-b border-orange-100 bg-orange-50 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-900">Lịch sự kiện</p>
          <p className="text-[10px] text-orange-800/80 truncate">
            {pickTarget === 'install'
              ? 'Bấm ngày trên lịch → chọn/bỏ ngày lắp (có thể nhiều ngày)'
              : pickTarget === 'pickup'
                ? 'Bấm một ngày → chọn lấy hàng'
                : 'Bấm ngày → chọn lắp; nếu chưa có lấy hàng thì gán luôn ngày đó'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[
            ['install', 'Lắp', 'teal'],
            ['pickup', 'Lấy hàng', 'sky'],
            ['both', 'Cả hai', 'orange'],
          ].map(([id, label, tone]) => {
            const on = pickTarget === id;
            const cls = on
              ? (tone === 'teal' ? 'bg-teal-600 text-white border-teal-600'
                : tone === 'sky' ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-orange-600 text-white border-orange-600')
              : (tone === 'teal' ? 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50'
                : tone === 'sky' ? 'bg-white text-sky-800 border-sky-200 hover:bg-sky-50'
                  : 'bg-white text-orange-800 border-orange-200 hover:bg-orange-50');
            return (
              <button key={id} type="button" onClick={() => setPickTarget(id)} className={`h-7 px-2 rounded-md text-[10px] font-bold border ${cls}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative w-full h-full min-h-0 flex flex-col bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0 bg-gradient-to-r from-orange-50 via-white to-teal-50">
          <Calendar className="h-4 w-4 text-orange-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">Lịch sự kiện — chọn ngày</p>
            <p className="text-[11px] text-gray-500 truncate">Lịch tạm theo form đang sửa</p>
          </div>
        </div>
        <div className="px-3 pt-2 flex flex-wrap gap-1 shrink-0">
          <span className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border bg-slate-800 text-white border-slate-800">Tất cả</span>
          <span className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border bg-white text-gray-600 border-gray-200">Sản xuất ({finishYmd ? 1 : 0})</span>
          <span className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border bg-white text-gray-600 border-gray-200">VC/LĐ ({(installDates?.length || 0) + (pickupDate ? 1 : 0)})</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="m-3 rounded-2xl border border-gray-200 shadow-sm overflow-hidden bg-white">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/70 border-b border-gray-100">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
                  onClick={() => setCursor((c) => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-bold text-gray-900 px-1 tabular-nums">{MONTH_NAMES[cursor.month]} {cursor.year}</h2>
                <button
                  type="button"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
                  onClick={() => setCursor((c) => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-[11px] text-gray-500">{eventCount} sự kiện</span>
            </div>
            <div className="p-2 sm:p-3">
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className={`text-center text-[11px] font-bold py-1 uppercase tracking-wide ${i === 0 ? 'text-rose-500' : 'text-gray-500'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="rounded-lg bg-gray-50/40 border border-dashed border-gray-100 min-h-[72px]" />;
                  const ymd = `${cursor.year}-${pad2(cursor.month)}-${pad2(day)}`;
                  const isInstall = installSet.has(ymd);
                  const isPickup = pickupDate === ymd;
                  const isFinish = finishYmd === ymd;
                  const isToday = ymd === todayYmd;
                  const cellBg = isInstall
                    ? 'bg-teal-100/80 border-teal-300'
                    : isPickup
                      ? 'bg-sky-100/80 border-sky-300'
                      : isFinish
                        ? 'bg-indigo-50 border-indigo-200'
                        : isToday
                          ? 'bg-blue-50/40 border-blue-200'
                          : 'bg-white border-gray-200 hover:border-orange-300';
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => handleDay(ymd)}
                      className={`rounded-lg border min-h-[72px] text-left px-1.5 py-1 ${cellBg}`}
                    >
                      <span className={`block text-[11px] font-bold tabular-nums ${i % 7 === 0 ? 'text-rose-500' : 'text-gray-800'}`}>{day}</span>
                      {isFinish ? <span className="mt-0.5 inline-block rounded px-1 py-px text-[9px] font-bold bg-indigo-600 text-white">HT SX</span> : null}
                      {isPickup ? <span className="mt-0.5 ml-0.5 inline-block rounded px-1 py-px text-[9px] font-bold bg-sky-600 text-white">Lấy tạm</span> : null}
                      {isInstall ? <span className="mt-0.5 ml-0.5 inline-block rounded px-1 py-px text-[9px] font-bold bg-teal-600 text-white">Lắp tạm</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="px-3 pb-3 text-[10px] text-orange-800">
            Lịch tạm theo form đang sửa — chọn Lắp / Lấy hàng / Cả hai rồi bấm ngày trên lịch.
          </p>
        </div>
      </div>
    </div>
  );
}

function EventsNoticeCalendar({
  installDates,
  pickupDate,
  finishYmd,
  installTime,
  pickupTime,
  projectCode,
  notifications,
}) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const todayYmd = toYmd(now);
  const installSet = new Set(installDates || []);

  const chipsByDay = useMemo(() => {
    const map = {};
    const add = (ymd, chip) => {
      if (!ymd) return;
      if (!map[ymd]) map[ymd] = [];
      map[ymd].push(chip);
    };
    if (finishYmd) {
      add(finishYmd, { key: 'ht', label: `✅ HT SX · ${projectCode || ''}`, cls: 'bg-indigo-100 text-indigo-800' });
    }
    (installDates || []).forEach((d) => {
      add(d, { key: `lap-${d}`, label: `🔧 Lắp đặt${installTime ? ` ${installTime}` : ''}`, cls: 'bg-teal-100 text-teal-800' });
    });
    if (pickupDate) {
      add(pickupDate, { key: 'lay', label: `📦 Lấy hàng${pickupTime ? ` ${pickupTime}` : ''}`, cls: 'bg-sky-100 text-sky-800' });
    }
    (notifications || []).forEach((n) => {
      const dates = (n.dates || []).filter(Boolean);
      const targets = dates.length ? dates : [todayYmd];
      targets.forEach((d) => {
        add(d, {
          key: `tb-${n.id}-${d}`,
          label: n.kind === 'plan' ? '🚚 TB kế hoạch lắp đặt' : n.kind === 'handover' ? '🏭 TB bàn giao xưởng' : '✅ TB bàn giao',
          cls: n.kind === 'plan' ? 'bg-amber-100 text-amber-900' : n.kind === 'handover' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800',
          title: n.text,
        });
      });
    });
    return map;
  }, [installDates, pickupDate, finishYmd, installTime, pickupTime, projectCode, notifications, todayYmd]);

  const eventCount = Object.values(chipsByDay).reduce((n, list) => n + list.length, 0);

  return (
    <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/70 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
            onClick={() => setCursor((c) => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-bold text-gray-900 px-1 tabular-nums">{MONTH_NAMES[cursor.month]} {cursor.year}</h2>
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
            onClick={() => setCursor((c) => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-[11px] text-gray-500">{eventCount} sự kiện / thông báo</span>
      </div>
      <div className="p-2 sm:p-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-[11px] font-bold py-1.5 uppercase tracking-wide ${i === 0 ? 'text-rose-500' : 'text-gray-500'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="rounded-lg bg-gray-50/40 border border-dashed border-gray-100 min-h-[88px]" />;
            const ymd = `${cursor.year}-${pad2(cursor.month)}-${pad2(day)}`;
            const chips = chipsByDay[ymd] || [];
            const isToday = ymd === todayYmd;
            const isInstall = installSet.has(ymd);
            const isWeekend = i % 7 === 0;
            return (
              <div
                key={ymd}
                className={`rounded-lg border min-h-[88px] flex flex-col overflow-hidden ${
                  isInstall ? 'border-teal-300 bg-teal-50/40' : isToday ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center px-1.5 py-1 border-b border-gray-100">
                  <span className={`text-[12px] font-bold w-6 h-6 inline-flex items-center justify-center rounded-full tabular-nums ${
                    isToday ? 'bg-blue-600 text-white' : isWeekend ? 'text-rose-600' : 'text-gray-800'
                  }`}>{day}</span>
                </div>
                <div className="flex-1 p-0.5 space-y-0.5 overflow-hidden">
                  {chips.map((c) => (
                    <div
                      key={c.key}
                      title={c.title || c.label}
                      className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium ${c.cls}`}
                    >
                      {c.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SimBriefFloat({ brief, instructions }) {
  const [open, setOpen] = useState(true);
  const [pos, setPos] = useState({ x: null, y: 72 });
  const drag = useRef(null);
  const boxRef = useRef(null);
  const text = String(brief || instructions || SIM_BRIEF_SHORT).trim();
  if (!text) return null;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const box = boxRef.current;
    const host = box?.offsetParent;
    if (!box || !host) return;
    const boxR = box.getBoundingClientRect();
    const hostR = host.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      dx: e.clientX - boxR.left,
      dy: e.clientY - boxR.top,
      hostW: hostR.width,
      hostH: hostR.height,
    };
    setPos({ x: boxR.left - hostR.left, y: boxR.top - hostR.top });
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const x = Math.max(8, Math.min(d.hostW - w - 8, e.clientX - d.dx));
    const y = Math.max(8, Math.min(d.hostH - h - 8, e.clientY - d.dy));
    setPos({ x, y });
  };

  const onPointerUp = (e) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return (
    <div
      ref={boxRef}
      className="absolute z-[30] w-[min(300px,calc(100%-1.5rem))] rounded-xl border-2 border-amber-300 bg-amber-50 shadow-2xl"
      style={pos.x == null ? { right: 16, top: pos.y } : { left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-amber-200 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripVertical className="h-4 w-4 text-amber-700 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800 flex-1 truncate">
          Đề bài
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[10px] font-semibold text-amber-800 hover:text-amber-950 px-1.5 py-0.5 rounded hover:bg-amber-100"
        >
          {open ? 'Thu gọn' : 'Mở'}
        </button>
      </div>
      {open ? (
        <div className="px-2.5 py-2">
          <BriefRich text={text} className="text-[12px] text-amber-950 leading-snug" />
        </div>
      ) : (
        <p className="px-2.5 py-1.5 text-[10px] text-amber-800/80 truncate">SX · VC/LĐ · ngày giờ — kéo để di chuyển</p>
      )}
    </div>
  );
}

function SimBriefPanel({ brief, instructions, compact = false, sticky = false }) {
  const [open, setOpen] = useState(true);
  const text = String(brief || instructions || SIM_BRIEF_SHORT).trim();
  if (!text) return null;
  return (
    <div className={`${sticky ? 'sticky top-0 z-30' : ''} rounded-2xl border-2 border-amber-300 bg-amber-50 ${compact ? 'px-3 py-2' : 'p-4'} shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-amber-800 inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Đề bài
        </span>
        <span className="text-[11px] font-semibold text-amber-700 shrink-0">{open ? 'Thu gọn' : 'Mở đề bài'}</span>
      </button>
      {open ? (
        <BriefRich text={text} className={`text-amber-950 ${compact ? 'mt-1.5 text-[13px] leading-snug' : 'mt-2 text-sm leading-relaxed'}`} />
      ) : (
        <p className="mt-1 text-[11px] text-amber-800/80">SX · VC/LĐ · ngày giờ</p>
      )}
    </div>
  );
}

function SimFbComment({ author, text }) {
  const initial = String(author || '?').replace(/^[^A-Za-zÀ-ỹ0-9]+/, '').slice(0, 1).toUpperCase() || '?';
  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <span className="w-8 h-8 rounded-full bg-[#1877f2] text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
        {initial}
      </span>
      <div className="bg-white rounded-[18px] px-3 py-2 shadow-sm max-w-[560px]">
        <p className="text-[13px] font-semibold text-[#050505] leading-tight">{author}</p>
        <p className="text-[13px] text-[#050505] whitespace-pre-line leading-snug">{text}</p>
      </div>
    </div>
  );
}

function SimVcHandoverCard({
  deal,
  shopName,
  typeName,
  vcCompanies,
  form,
  setForm,
  installDates,
  saleConfirmed,
  onConfirm,
}) {
  const sxOrigin = [shopName, typeName].filter(Boolean).join(' · ');
  const pickupLabel = form.pickupDate
    ? formatLocalVi(`${form.pickupDate}T${form.pickupTime || '08:00'}`)
    : '';
  const installLabel = installDates.length
    ? `${installDates.length > 1 ? `${installDates.length} ngày: ` : ''}${formatYmdListVi(installDates)}${form.installTime ? ` ${form.installTime}` : ''}`
    : '';
  const arriveLabel = form.pickupDate
    ? formatLocalVi(`${(installDates[0] || form.pickupDate)}T11:00`)
    : '';

  return (
    <div className="my-2 flex justify-center">
      <div className="w-full max-w-[560px] rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
            <Truck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-orange-800 leading-tight">
              Bàn giao Lắp đặt
              {sxOrigin ? (
                <span className="ml-1.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 align-middle">
                  {sxOrigin}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-orange-700/80 leading-tight truncate">
              Dự án: {deal.title || deal.project_code || 'Dự án mô phỏng'}
            </p>
          </div>
          <span className="ml-auto shrink-0 text-[10px] text-orange-700/70">{saleConfirmed ? 'xong' : 'vừa xong'}</span>
        </div>

        {!saleConfirmed ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại
              </p>
              <p className="text-[11px] text-emerald-900">
                Công ty VC/LĐ: <span className="font-semibold">{vcCompanies.find((c) => c.id === form.vcCompany)?.name || '—'}</span>
              </p>
              <p className="text-[11px] text-emerald-900">
                Ngày lắp dự kiến: <span className="font-semibold">{installLabel || '—'}</span>
              </p>
              {form.vcNotes ? (
                <p className="text-[11px] text-emerald-900 whitespace-pre-wrap">
                  Ghi chú cho VC/LĐ: <span className="font-semibold">{form.vcNotes}</span>
                </p>
              ) : null}
              <p className="text-[10px] text-emerald-700">
                Dự án đã nằm ở cột lắp đặt tạm trên bảng VC — bàn giao chỉ chuyển sang cột tiếp nhận, không tạo dự án mới.
              </p>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold text-gray-600">Công ty VC/LĐ *</span>
              <select
                value={form.vcCompany}
                onChange={(e) => setForm((f) => ({ ...f, vcCompany: e.target.value }))}
                className="mt-1 w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400"
              >
                <option value="">— Chọn công ty —</option>
                {vcCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-600">Ghi chú</span>
              <textarea
                rows={2}
                defaultValue={[typeName, shopName].filter(Boolean).join(' - ')}
                className="mt-1 w-full px-2 py-1.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400 resize-y"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-600">Ghi chú cho bên VC / lắp đặt</span>
              <textarea
                rows={2}
                value={form.vcNotes}
                onChange={(e) => setForm((f) => ({ ...f, vcNotes: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400 resize-y"
              />
            </label>

            <div className="rounded-lg border border-orange-100 bg-white/70 p-2 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">
                Thông tin giao / lắp (đồng bộ panel VC + lịch sự kiện)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="block text-[11px] font-semibold text-gray-600">Ngày nhận hàng *</span>
                  <div className="mt-1 h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white inline-flex items-center gap-1.5 w-full">
                    <Calendar className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                    <span className={`truncate ${pickupLabel ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                      {pickupLabel || '—'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-gray-600">VC tới nơi LĐ</span>
                  <div className="mt-1 h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white inline-flex items-center gap-1.5 w-full">
                    <Calendar className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                    <span className="truncate text-gray-900 font-medium">{arriveLabel || '—'}</span>
                  </div>
                </div>
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-gray-600">Ngày lắp đặt (nhiều ngày)</span>
                <div className="mt-1 rounded-md border border-orange-100 bg-orange-50/50 px-2 py-1.5 text-[11px] text-gray-800">
                  <p className="font-semibold">Lắp đặt</p>
                  <p className="text-[10px] text-gray-500">{installLabel || '—'}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!form.vcCompany}
              onClick={onConfirm}
              className="w-full h-9 rounded-lg bg-orange-600 text-white text-[13px] font-semibold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Truck className="h-4 w-4" />
              Chọn &amp; bàn giao
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-white border border-orange-100 px-3 py-2 text-[12px] text-gray-700 space-y-0.5">
            <p><span className="text-gray-500">Công ty:</span> <strong>{vcCompanies.find((c) => c.id === form.vcCompany)?.name || '—'}</strong></p>
            {form.vcNotes ? (
              <p className="whitespace-pre-wrap"><span className="text-gray-500">Ghi chú cho VC/LĐ:</span> <strong>{form.vcNotes}</strong></p>
            ) : null}
            <p><span className="text-gray-500">Ngày nhận hàng:</span> <strong>{pickupLabel || '—'}</strong></p>
            <p><span className="text-gray-500">Ngày lắp đặt:</span> <strong>{installLabel || '—'}</strong></p>
            <p className="text-[11px] text-emerald-700 pt-1">Đã xác nhận bàn giao. Thẻ sang cột tiếp nhận — không tạo dự án mới.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SimDealComments({
  comments,
  handoverRequested,
  saleConfirmed,
  deal,
  shopName,
  typeName,
  vcCompanies,
  form,
  setForm,
  installDates,
  onConfirm,
}) {
  return (
    <div className="rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#e4e6eb] bg-white px-3 py-1.5">
        <MessageSquare className="h-4 w-4 text-[#1877f2]" />
        <p className="text-[13px] font-bold text-[#050505]">Bình luận</p>
      </div>
      <div className="relative min-h-[320px] max-h-[min(720px,75vh)] overflow-y-auto px-2 py-3 scroll-smooth">
        {!comments.length && !handoverRequested && (
          <p className="py-8 text-center text-sm text-[#65676b]">Chưa có bình luận. Hãy là người đầu tiên!</p>
        )}
        {comments.map((c) => (
          <SimFbComment key={c.id} author={c.author} text={c.text} />
        ))}
        {handoverRequested ? (
          <SimVcHandoverCard
            deal={deal}
            shopName={shopName}
            typeName={typeName}
            vcCompanies={vcCompanies}
            form={form}
            setForm={setForm}
            installDates={installDates}
            saleConfirmed={saleConfirmed}
            onConfirm={onConfirm}
          />
        ) : null}
      </div>
      <div className="border-t border-[#e4e6eb] bg-white px-3 py-2">
        <div className="h-9 rounded-full bg-[#f0f2f5] px-3 text-[13px] text-[#65676b] flex items-center">
          Viết bình luận…
        </div>
      </div>
    </div>
  );
}

function ScoreGuide({ steps, answers, submitting, onSubmit, onGo }) {
  const byId = Object.fromEntries((steps || []).map((s) => [s.id, s]));
  const groups = SCORE_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((it) => {
      const meta = byId[it.id] || {};
      return {
        ...it,
        done: isSimStepDone(it.id, answers),
        required: !!meta.required,
        points: meta.points || 0,
      };
    }),
  }));
  const all = groups.flatMap((g) => g.items);
  const doneN = all.filter((i) => i.done).length;
  const pct = all.length ? Math.round((doneN / all.length) * 100) : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-gray-900">Làm theo 3 nhóm này</p>
          <p className="text-[11px] text-gray-500">Tick xanh = đã đúng. Nhóm có chữ đỏ là bước bắt buộc.</p>
        </div>
        <span className="text-xs font-bold tabular-nums text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
          {doneN}/{all.length} · {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {groups.map((g, gi) => {
          const ok = g.items.filter((i) => i.done).length;
          const allDone = ok === g.items.length;
          return (
            <div
              key={g.id}
              className={`rounded-xl border p-3 ${allDone ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-800">
                    {gi + 1}. {g.title}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{g.hint}</p>
                </div>
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${allDone ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  {ok}/{g.items.length}
                </span>
              </div>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-1.5 text-[12px]">
                    {it.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <span className="mt-0.5 w-3.5 h-3.5 rounded-full border border-gray-300 bg-white shrink-0" />
                    )}
                    <span className={it.done ? 'text-emerald-800 font-medium' : 'text-gray-800'}>
                      {it.short}
                      {it.required ? (
                        <span className="ml-1 text-[9px] font-extrabold text-red-600">bắt buộc</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onGo(g.go)}
                className="mt-2.5 w-full h-8 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-700 hover:bg-gray-100"
              >
                {g.goLabel}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        className="w-full px-5 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        {doneN === all.length && all.length ? 'Hoàn thành & nộp bài' : 'Nộp bài mô phỏng'}
      </button>
      <p className="text-[11px] text-gray-500 text-center">
        Sân tập không ghi dữ liệu thật — tick xanh chỉ để bạn biết đã làm đúng trước khi nộp.
      </p>
    </div>
  );
}

function ModuleTabs({ tab, setTab, badges }) {
  const items = [
    { key: 'crm', label: 'CRM', icon: ClipboardList, color: 'bg-blue-600' },
    { key: 'sx', label: 'Sản xuất', icon: Factory, color: 'bg-orange-600' },
    { key: 'vc', label: 'VC / Lắp đặt', icon: Truck, color: 'bg-teal-600' },
    { key: 'lich', label: 'Lịch', icon: Calendar, color: 'bg-violet-600' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = tab === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={`relative px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 border-2 transition-all ${
              active ? `${it.color} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <Icon className="h-4 w-4" /> {it.label}
            {badges?.[it.key] ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {badges[it.key]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function KanbanBoard({ columns, cardColumn, card, onMove, lockedMessage }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col} className="w-56 shrink-0 rounded-xl border border-gray-200 bg-gray-50">
          <div className="px-2.5 py-2 border-b border-gray-200 flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold uppercase text-gray-600 truncate">{col}</span>
            {cardColumn === col ? (
              <span className="text-[10px] text-gray-400">1</span>
            ) : null}
          </div>
          <div className="p-2 min-h-24 space-y-2">
            {cardColumn === col && card}
            {cardColumn !== col && (
              <button
                type="button"
                onClick={() => onMove(col)}
                className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-700"
                title={lockedMessage || `Chuyển thẻ sang «${col}»`}
              >
                Chuyển thẻ vào đây
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function KnowledgeSimulationPlayer({ exercise, onSubmit, submitting, onAnswersChange }) {
  const cfg = exercise?.questions || {};
  const sc = cfg.scenario || {};
  const steps = cfg.steps || [];
  const deal = sc.deal || {};
  const sxCompanies = sc.sx_companies || [];
  const classifications = sc.classifications || [];
  const vcCompanies = sc.vc_companies || [];
  const sxColumns = sc.sx_columns || [];
  const vcColumns = sc.vc_columns || [];
  const sxHandoverColumn = sc.sx_handover_column || sxColumns[sxColumns.length - 1] || '';

  const [tab, setTab] = useState('crm');
  const [planOpen, setPlanOpen] = useState(false);
  const [form, setForm] = useState({
    sxCompany: '', classification: '', installDates: [], installTime: '14:00',
    pickupDate: '', pickupTime: '', vcCompany: '', vcNotes: '',
  });
  const [saved, setSaved] = useState(false);
  const [sxColumn, setSxColumn] = useState(sxColumns[0] || '');
  const [vcColumn, setVcColumn] = useState('');
  const [tempStaged, setTempStaged] = useState(false);
  const [tempCardSeen, setTempCardSeen] = useState(false);
  const [dragBlockedSeen, setDragBlockedSeen] = useState(false);
  const [eventsSeen, setEventsSeen] = useState(false);
  const [handoverRequested, setHandoverRequested] = useState(false);
  const [saleConfirmed, setSaleConfirmed] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [comments, setComments] = useState([]);
  const [flash, setFlash] = useState(null);

  const vcCompanyCfg = vcCompanies.find((c) => c.id === form.vcCompany) || null;
  const installDates = [...form.installDates].sort();
  const primaryInstall = installDates[0] || '';
  const finishYmd = primaryInstall ? addDaysYmd(primaryInstall, -2) : '';
  const installLabel = installDates.length > 1
    ? `${installDates.length} ngày: ${formatYmdListVi(installDates)}`
    : (primaryInstall ? formatYmdVi(primaryInstall) : '');
  const pickupAt = form.pickupDate ? `${form.pickupDate}T${form.pickupTime || '08:00'}` : '';
  const shopName = sxCompanies.find((c) => String(c.id) === String(form.sxCompany))?.name || '';
  const typeName = classifications.find((c) => String(c.id) === String(form.classification))?.name || '';
  const titleParts = [shopName, typeName].filter(Boolean);
  const fieldCls = 'w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400';

  const setPickupAt = (value) => {
    const [d, t] = String(value || '').split('T');
    setForm((f) => ({ ...f, pickupDate: d || '', pickupTime: (t || '').slice(0, 5) }));
  };
  const setPickupShift = (hm) => {
    const ymd = form.pickupDate || primaryInstall;
    if (!ymd) return;
    setForm((f) => ({ ...f, pickupDate: ymd, pickupTime: hm }));
  };

  const pushNotification = (text, extra = {}) => setNotifications((prev) => [{
    id: `${Date.now()}-${prev.length}`,
    text,
    dates: extra.dates || [],
    kind: extra.kind || 'info',
  }, ...prev]);
  const pushComment = (author, text) => setComments((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, author, text }]);
  const say = (text, tone = 'info') => setFlash({ text, tone });

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  const answers = useMemo(() => ({
    sx_company: form.sxCompany || null,
    classification: form.classification || null,
    install_dates: installDates,
    install_time: form.installTime || null,
    pickup_date: form.pickupDate || null,
    pickup_time: form.pickupTime || null,
    vc_company: form.vcCompany || null,
    vc_notes: form.vcNotes || '',
    saved,
    temp_card_seen: tempCardSeen,
    drag_blocked_seen: dragBlockedSeen,
    events_seen: eventsSeen,
    sx_handover: handoverRequested,
    sale_confirm: saleConfirmed,
    final_column: vcColumn || null,
  }), [
    form, installDates, saved, tempCardSeen, dragBlockedSeen, eventsSeen,
    handoverRequested, saleConfirmed, vcColumn,
  ]);

  useEffect(() => { onAnswersChange?.(answers); }, [answers, onAnswersChange]);

  useEffect(() => {
    if (saved && tab === 'vc' && tempStaged) setTempCardSeen(true);
  }, [saved, tab, tempStaged]);

  useEffect(() => {
    if (saved && tab === 'lich') setEventsSeen(true);
  }, [saved, tab]);

  const canSave = form.sxCompany && form.classification && installDates.length > 0
    && form.installTime && form.pickupDate && form.vcCompany;

  const savePlan = () => {
    if (!canSave) {
      say('Còn ô chưa điền — chọn xưởng, ngày lắp, giờ lắp, công ty VC/LĐ rồi bấm Thêm dự án / Lưu lịch.', 'warn');
      return;
    }
    const vc = vcCompanies.find((c) => c.id === form.vcCompany);
    const staged = Boolean(vc?.temp_column);
    setSaved(true);
    setPlanOpen(false);
    setSxColumn(sxColumns[0] || '');
    setVcColumn(staged ? vc.temp_column : (vc?.intake_column || vcColumns[0] || ''));
    setTempStaged(staged);
    pushNotification(
      `🚚 Kế hoạch lắp đặt sắp tới — ${deal.project_code || 'TB-MP-001'} · lắp đặt ${installDates.map(ddmm).join(', ')} · lấy hàng ${ddmm(form.pickupDate)}${staged ? ' — đang ở cột lắp đặt tạm, chờ xưởng bàn giao.' : ''}`,
      { kind: 'plan', dates: [...installDates, form.pickupDate].filter(Boolean) },
    );
    pushComment('Hệ thống', `📋 Đã tạo dự án sản xuất tại ${sxCompanies.find((c) => c.id === form.sxCompany)?.name || 'xưởng'} và ${staged ? `đặt dự án vào cột «${vc.temp_column}»` : 'gắn công ty VC/LĐ'}.`);
    say(staged
      ? 'Đã lưu kế hoạch. Thẻ dự án đang ở cột lắp đặt tạm bên VC/LĐ.'
      : 'Đã lưu kế hoạch, nhưng công ty VC/LĐ này chưa bật cột lắp đặt tạm nên tổ VC/LĐ không thấy trước.', staged ? 'ok' : 'warn');
    setTab('vc');
  };

  const moveSxCard = (col) => {
    if (!saved) {
      say('Chưa có dự án nào ở xưởng — lập kế hoạch bên CRM trước.', 'warn');
      return;
    }
    setSxColumn(col);
    if (col === sxHandoverColumn && !handoverRequested) {
      setHandoverRequested(true);
      pushNotification('🏭 Xưởng đã chuẩn bị xong — Sale CRM cần xác nhận lại thông tin VC/LĐ.', {
        kind: 'handover',
        dates: [...installDates, form.pickupDate].filter(Boolean),
      });
      pushComment('Xưởng SX', 'Đơn hàng đã chuẩn bị xong, đề nghị bàn giao cho VC/LĐ.');
      say('Xưởng đã bấm bàn giao. Sang tab CRM → Bình luận để xác nhận.', 'ok');
      setTab('crm');
    }
  };

  const moveVcCard = (col) => {
    if (!saved) {
      say('Chưa có dự án nào bên VC/LĐ — lập kế hoạch bên CRM trước.', 'warn');
      return;
    }
    if (tempStaged) {
      setDragBlockedSeen(true);
      say('Thẻ đang ở cột «lắp đặt tạm» → khoá chuyển cột tới khi xưởng bàn giao và Sale CRM xác nhận lại thông tin.', 'warn');
      return;
    }
    setVcColumn(col);
    say(`Đã chuyển thẻ sang «${col}».`, 'ok');
  };

  const confirmHandover = () => {
    if (!handoverRequested) return;
    const vc = vcCompanies.find((c) => c.id === form.vcCompany);
    setSaleConfirmed(true);
    setTempStaged(false);
    setVcColumn(vc?.intake_column || vcColumns[1] || vcColumns[0] || '');
    pushNotification('✅ Đã bàn giao — dự án chuyển sang cột tiếp nhận của bảng Lắp đặt.', {
      kind: 'done',
      dates: [...installDates, form.pickupDate].filter(Boolean),
    });
    pushComment('Sale CRM', `Đã xác nhận thông tin VC/LĐ: ${vc?.name || 'công ty VC'} · lắp đặt ${installDates.map(ddmm).join(', ')} · lấy hàng ${ddmm(form.pickupDate)}.`);
    say('Xác nhận xong. Không tạo dự án mới — thẻ chỉ rời cột tạm sang cột tiếp nhận.', 'ok');
    setTab('vc');
  };

  const resetAll = () => {
    setForm({ sxCompany: '', classification: '', installDates: [], installTime: '14:00', pickupDate: '', pickupTime: '', vcCompany: '', vcNotes: '' });
    setSaved(false); setPlanOpen(false); setTempStaged(false); setTempCardSeen(false);
    setDragBlockedSeen(false); setEventsSeen(false); setHandoverRequested(false);
    setSaleConfirmed(false); setNotifications([]); setComments([]);
    setSxColumn(sxColumns[0] || ''); setVcColumn(''); setTab('crm');
    say('Đã làm mới sân tập.', 'info');
  };

  const projectCode = deal.project_code || 'TB-MP-001';

  const vcCard = (
    <div className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm" style={{ borderLeft: '4px solid #f97316' }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-gray-700">{projectCode}</span>
        {tempStaged && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold">
            <Lock className="h-3 w-3" /> TẠM
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-900 mt-1">{deal.title || 'Dự án mô phỏng'}</p>
      {form.vcNotes ? (
        <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 whitespace-pre-line">
          🚚 Ghi chú VC/LĐ: {form.vcNotes}
        </p>
      ) : null}
      <p className="text-[10px] text-gray-500 mt-1.5">
        Lắp: {installDates.map(ddmm).join(', ') || '—'} · Lấy hàng: {ddmm(form.pickupDate)}
      </p>
    </div>
  );

  const sxCard = (
    <div className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm" style={{ borderLeft: '4px solid #ea580c' }}>
      <p className="text-[11px] font-bold text-gray-700">{projectCode}</p>
      <p className="text-xs font-semibold text-gray-900 mt-1">{deal.title || 'Dự án mô phỏng'}</p>
      <p className="text-[10px] text-gray-500 mt-1.5">
        Hoàn thiện SX: {ddmm(installDates[0] ? toYmd(new Date(new Date(`${installDates[0]}T00:00:00`).getTime() - 2 * 86400000)) : '')}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <SimBriefPanel sticky brief={SIM_BRIEF_SHORT} />

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <ModuleTabs tab={tab} setTab={setTab} badges={{ crm: handoverRequested && !saleConfirmed ? 1 : 0 }} />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600">
              <Bell className="h-3.5 w-3.5" /> {notifications.length} thông báo
            </span>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600 hover:border-gray-400"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Làm mới sân tập
            </button>
          </div>
        </div>

        {flash && (
          <div className={`px-4 py-2.5 text-sm border-b flex items-start gap-2 ${
            flash.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : flash.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {flash.tone === 'warn' ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
            <span>{flash.text}</span>
          </div>
        )}

        <div className="p-4">
          {tab === 'crm' && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold text-blue-700">{deal.code || 'DEAL-MP-001'}</p>
                    <p className="text-base font-bold text-gray-900">{deal.title || 'Deal mô phỏng'}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {deal.customer || 'Khách hàng'} · {deal.phone || '09xx'} · {deal.address || 'Địa chỉ lắp đặt'}
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                      Giai đoạn: {deal.stage || 'Đã ký hợp đồng'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlanOpen((v) => !v)}
                    className="px-3.5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
                  >
                    {saved ? 'Kế hoạch SX & VC/LĐ' : 'Thiết lập kế hoạch SX & VC/LĐ'}
                  </button>
                </div>

                {saved && (
                  <div className="mt-3 rounded-lg bg-white border border-gray-200 p-2.5 text-xs text-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">Dự án sản xuất</p>
                        <p>{projectCode} · {sxCompanies.find((c) => c.id === form.sxCompany)?.name} · {classifications.find((c) => c.id === form.classification)?.name}</p>
                        <p className="mt-0.5">VC/LĐ: {vcCompanyCfg?.name || '—'}</p>
                        <p className="mt-0.5">Lắp: {installDates.map(ddmm).join(', ')} {form.installTime} · Lấy hàng: {ddmm(form.pickupDate)} {form.pickupTime}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPlanOpen(true)}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold border border-teal-200 text-teal-800 bg-white hover:bg-teal-50 shrink-0"
                      >
                        Sửa lịch
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {planOpen && (
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 bg-black/40"
                  onClick={() => setPlanOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in w-[min(96vw,1600px)] max-w-[96vw] h-[94vh] max-h-[94vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            {saved ? 'Sửa lịch lắp đặt' : 'Thiết lập kế hoạch sản xuất và vận chuyển lắp đặt'}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {saved
                              ? `${projectCode} — đồng bộ công ty VC/LĐ, ngày lắp / lấy hàng và sự kiện dự kiến.`
                              : 'Deal đã ký hợp đồng — chọn xưởng (công ty + phân loại), ngày lắp / lấy hàng (VC/LĐ) và lịch sự kiện bên phải.'}
                          </p>
                        </div>
                        <button type="button" onClick={() => setPlanOpen(false)} className="h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-500 inline-flex items-center justify-center">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <SimBriefFloat brief={SIM_BRIEF_SHORT} />
                    <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.72fr)_minmax(420px,1.35fr)] gap-3 items-start">
                      <div className="min-w-0 space-y-2">
                        <p className="text-[10px] text-gray-500">
                          Ngày lắp = deadline VC/LĐ (có thể nhiều ngày) · hoàn thiện SX = deadline tổng dự án (= lắp đầu − 2) · công ty VC không bắt buộc
                        </p>
                        <div className="text-[10px] text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5 leading-snug space-y-0.5">
                          <p>
                            <strong>Lắp đặt</strong> = deadline VC/LĐ (ngày giờ lắp tại công trình).
                            {' · '}
                            <strong>Hoàn thiện</strong> = deadline tổng dự án SX (= lắp − 2 ngày).
                          </p>
                          <p>
                            <strong>Lấy hàng</strong> = giờ VC đi lấy tại xưởng. Khi lưu, tạo sự kiện dự kiến trên <strong>Sự kiện → Lắp đặt</strong>.
                            Chọn ngày trên lịch bên phải (CRM / Sản xuất / VC/LĐ).
                          </p>
                        </div>

                        <div className="rounded-xl border border-teal-200 overflow-hidden bg-white divide-y divide-slate-100">
                          <div className="px-3 py-3 space-y-2.5 hover:bg-teal-50/40">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold tabular-nums">
                                1
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-bold truncate ${titleParts.length ? 'text-teal-800' : 'text-slate-400'}`}>
                                  {titleParts.length ? titleParts.join(' · ') : 'Chưa chọn xưởng'}
                                </p>
                                {primaryInstall ? (
                                  <p className="text-[10px] text-slate-500 truncate tabular-nums">
                                    Lắp đặt {installLabel}{form.installTime ? ` · ${form.installTime}` : ''}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400">Chưa chọn ngày lắp</p>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="min-w-0">
                                <label className="block text-[10px] font-extrabold uppercase tracking-wide text-amber-900 mb-0.5">
                                  Công ty SX <span className="text-red-500">*</span>
                                  <NeedTag />
                                </label>
                                <select
                                  value={form.sxCompany}
                                  onChange={(e) => setForm((f) => ({ ...f, sxCompany: e.target.value }))}
                                  className={`${fieldCls} ring-2 ring-amber-400 font-bold`}
                                >
                                  <option value="">— Chọn công ty SX —</option>
                                  {sxCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div className="min-w-0">
                                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                                  Phân loại <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={form.classification}
                                  onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                                  disabled={!form.sxCompany}
                                  className={fieldCls}
                                >
                                  <option value="">{form.sxCompany ? '— Chọn phân loại —' : '— Chọn công ty trước —'}</option>
                                  {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="rounded-xl border-2 border-teal-300 bg-teal-50 px-3 py-2.5 space-y-2 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-teal-900">
                                    Deadline lắp đặt (VC/LĐ) &amp; hoàn thiện (SX)
                                  </p>
                                  {primaryInstall ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-600 text-white px-2 py-1 text-[11px] font-bold tabular-nums shadow-sm max-w-full">
                                      Lắp đặt {installLabel}
                                      {form.installTime ? ` · ${form.installTime}` : ''}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                                      Chưa chọn deadline lắp đặt
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="min-w-0">
                                    <label className="block text-[10px] font-extrabold text-amber-900 mb-0.5">
                                      Ngày lắp đặt <NeedTag />
                                      <span className="font-normal text-teal-700"> (2 ngày liền nhau · sau hôm nay)</span>
                                    </label>
                                    <MultiDayDatePicker
                                      accent="teal"
                                      selectedYmds={form.installDates}
                                      onChange={(ymds) => setForm((f) => ({ ...f, installDates: ymds }))}
                                      anchorYmd={primaryInstall || undefined}
                                      hint="Bấm chọn từng ngày lắp — liên tiếp hoặc cách ngày (1, 3, 5…)"
                                    />
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        className="h-8 px-2.5 rounded-lg border border-teal-400 bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 inline-flex items-center gap-1"
                                        title="Chọn nhiều ngày lắp từ lịch bên phải"
                                      >
                                        <Calendar className="h-3.5 w-3.5" />
                                        Lịch lớn
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="min-w-0">
                                      <label className="block text-[10px] font-extrabold text-amber-900 mb-0.5">
                                        Giờ lắp <NeedTag />
                                        <span className="font-normal text-teal-700"> (bấm Sáng)</span>
                                      </label>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <ShiftQuickPick
                                          tone="teal"
                                          hm={form.installTime || '14:00'}
                                          disabled={!primaryInstall}
                                          onPick={(hm) => setForm((f) => ({ ...f, installTime: hm }))}
                                        />
                                        <input
                                          type="time"
                                          value={form.installTime || '14:00'}
                                          disabled={!primaryInstall}
                                          onChange={(e) => setForm((f) => ({ ...f, installTime: e.target.value }))}
                                          title="Giờ khác — nhập trực tiếp"
                                          className={`${fieldCls} w-[7.5rem] sm:max-w-[7.5rem] border-teal-400 bg-white text-red-600 disabled:text-red-600/70 font-bold tabular-nums ring-1 ring-teal-200 focus:ring-2 focus:ring-teal-500 scheme-light`}
                                        />
                                      </div>
                                    </div>
                                    <div className="min-w-0">
                                      <label className="block text-[10px] font-bold text-indigo-800 mb-0.5">
                                        Ngày hoàn thiện
                                        <span className="font-normal text-indigo-600"> (tự tính = lắp đầu − 2 · sự kiện SX)</span>
                                      </label>
                                      <input
                                        type="date"
                                        value={finishYmd}
                                        readOnly
                                        disabled
                                        title="Deadline tổng dự án sản xuất = ngày lắp đầu (VC/LĐ) − 2"
                                        className={`${fieldCls} bg-indigo-100 border-indigo-400 text-red-600 disabled:text-red-600 font-bold tabular-nums ring-1 ring-indigo-200 sm:max-w-[11.5rem] scheme-light`}
                                      />
                                    </div>
                                  </div>
                                </div>
                                {primaryInstall && finishYmd ? (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="rounded-md bg-indigo-600 text-white px-2 py-1 font-bold tabular-nums">
                                      Hoàn thiện SX {formatYmdVi(finishYmd)}
                                    </span>
                                    <span className="text-indigo-800/80 font-medium">deadline tổng SX</span>
                                    <span className="text-teal-700 font-bold">·</span>
                                    <span className="rounded-md bg-teal-600 text-white px-2 py-1 font-bold tabular-nums max-w-full">
                                      Lắp đặt {installLabel}
                                    </span>
                                    <span className="text-teal-800/80 font-medium">deadline VC/LĐ</span>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-teal-800/70 font-medium">
                                    Chọn một hoặc nhiều ngày lắp đặt (deadline VC/LĐ) → tự điền hoàn thiện SX (= deadline tổng SX, lắp đầu − 2).
                                  </p>
                                )}
                              </div>

                              <div className="rounded-xl border-2 border-sky-300 bg-sky-50 px-3 py-2.5 space-y-2 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
                                    Lấy hàng (VC)
                                  </p>
                                  {pickupAt ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 text-white px-2 py-1 text-[11px] font-bold tabular-nums shadow-sm">
                                      Lấy hàng {formatLocalVi(pickupAt)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold">
                                      Chưa chọn lấy hàng
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <label className="block text-[10px] font-extrabold text-amber-900 mb-0.5">
                                    Thời gian lấy hàng tại xưởng <NeedTag />
                                    <span className="font-normal text-sky-700"> (không sau ngày lắp đầu · bấm Chiều)</span>
                                  </label>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <ShiftQuickPick
                                      tone="sky"
                                      hm={form.pickupTime || ''}
                                      onPick={setPickupShift}
                                    />
                                    <input
                                      type="datetime-local"
                                      value={pickupAt}
                                      onChange={(e) => setPickupAt(e.target.value)}
                                      title="Ngày giờ khác — nhập trực tiếp"
                                      className={`${fieldCls} sm:max-w-[13rem] border-sky-400 bg-white text-red-600 disabled:text-red-600 font-bold tabular-nums ring-1 ring-sky-200 focus:ring-2 focus:ring-sky-500 scheme-light`}
                                    />
                                    <button
                                      type="button"
                                      className="h-9 px-2.5 rounded-lg border border-sky-400 bg-sky-600 text-white text-[11px] font-bold hover:bg-sky-700 inline-flex items-center gap-1"
                                      title="Chọn giờ lấy hàng từ lịch bên phải"
                                    >
                                      <Calendar className="h-3.5 w-3.5" />
                                      Lịch
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <label className="block text-[10px] font-extrabold uppercase tracking-wide text-amber-900 mb-0.5">
                                  Công ty VC / lắp đặt <NeedTag />
                                </label>
                                <select
                                  value={form.vcCompany}
                                  onChange={(e) => setForm((f) => ({ ...f, vcCompany: e.target.value }))}
                                  className={`${fieldCls} ring-2 ring-amber-400 font-bold`}
                                >
                                  <option value="">— Chưa chọn công ty VC/LĐ —</option>
                                  {vcCompanies.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}{c.temp_column ? ` — có cột tạm «${c.temp_column}»` : ' — chưa bật cột tạm'}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="min-w-0">
                                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                                  Ghi chú cho bên VC / lắp đặt
                                  <span className="font-normal normal-case text-gray-400"> (không bắt buộc)</span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={form.vcNotes}
                                  onChange={(e) => setForm((f) => ({ ...f, vcNotes: e.target.value }))}
                                  placeholder="VD: hàng dễ vỡ, gọi trước 30 phút, thang máy nhỏ — cần tháo cánh…"
                                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white resize-y min-h-[3.75rem]"
                                />
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  Ghi chú riêng cho xưởng này &amp; công ty VC/LĐ đã chọn — hiện lại ở thẻ bàn giao và trên dự án VC.
                                </p>
                              </div>
                              <p className="text-[10px] font-semibold text-orange-800 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1">
                                Đang chọn ngày trên lịch bên phải → áp dụng cho xưởng này
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-teal-300 text-sm font-medium text-teal-700 hover:bg-teal-50"
                        >
                          <Plus className="h-4 w-4" />
                          Thêm xưởng
                        </button>
                      </div>

                      <MiniVcCalendar
                        installDates={form.installDates}
                        pickupDate={form.pickupDate}
                        finishYmd={finishYmd}
                        onPickInstall={(d) => setForm((f) => ({
                          ...f,
                          installDates: f.installDates.includes(d)
                            ? f.installDates.filter((x) => x !== d)
                            : [...f.installDates, d],
                          installTime: f.installTime || '14:00',
                        }))}
                        onPickPickup={(d) => setForm((f) => ({
                          ...f,
                          pickupDate: f.pickupDate === d ? '' : d,
                          pickupTime: f.pickupDate === d ? '' : (f.pickupTime || '08:00'),
                        }))}
                      />
                    </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPlanOpen(false)}
                        className="flex-1 h-11 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        {saved ? 'Hủy' : 'Để sau'}
                      </button>
                      <button
                        type="button"
                        onClick={savePlan}
                        className="flex-[1.4] h-11 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                      >
                        {saved ? 'Lưu lịch' : 'Thêm dự án'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <SimDealComments
                comments={comments}
                handoverRequested={handoverRequested}
                saleConfirmed={saleConfirmed}
                deal={deal}
                shopName={shopName}
                typeName={typeName}
                vcCompanies={vcCompanies}
                form={form}
                setForm={setForm}
                installDates={installDates}
                onConfirm={confirmHandover}
              />
            </div>
          )}

          {tab === 'sx' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Kanban xưởng sản xuất. Xong hàng thì chuyển thẻ vào cột <strong>{sxHandoverColumn}</strong> để bàn giao.
              </p>
              {!saved && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Chưa có dự án — lập kế hoạch bên CRM trước.</p>}
              <KanbanBoard
                columns={sxColumns}
                cardColumn={saved ? sxColumn : null}
                card={sxCard}
                onMove={moveSxCard}
              />
            </div>
          )}

          {tab === 'vc' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Bảng Lắp đặt của <strong>{vcCompanyCfg?.name || 'công ty VC/LĐ'}</strong>.
                {vcCompanyCfg?.temp_column ? ` Cột lắp đặt tạm: «${vcCompanyCfg.temp_column}».` : ''}
              </p>
              {!saved && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Chưa có dự án — lập kế hoạch bên CRM trước.</p>}
              {saved && tempStaged && (
                <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg p-2 flex items-start gap-1.5">
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Thẻ có badge TẠM đang bị khoá chuyển cột. Thử bấm «Chuyển thẻ vào đây» ở cột khác để xem hệ thống chặn thế nào.
                </p>
              )}
              <KanbanBoard
                columns={vcColumns}
                cardColumn={saved ? vcColumn : null}
                card={vcCard}
                onMove={moveVcCard}
                lockedMessage={tempStaged ? 'Thẻ TẠM đang khoá chuyển cột' : null}
              />
            </div>
          )}

          {tab === 'lich' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Sự kiện và thông báo hiện trên ô lịch (giống trang Lịch). Lưu kế hoạch xong sẽ thấy chip Lắp / Lấy hàng / HT SX / TB.
              </p>
              {!saved && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Chưa có mốc nào — lập kế hoạch bên CRM trước.
                </p>
              )}
              <EventsNoticeCalendar
                installDates={saved ? installDates : []}
                pickupDate={saved ? form.pickupDate : ''}
                finishYmd={saved ? finishYmd : ''}
                installTime={form.installTime}
                pickupTime={form.pickupTime}
                projectCode={deal.project_code || 'TB-MP-001'}
                notifications={notifications}
              />
              {form.vcNotes && saved ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 whitespace-pre-line">
                  🚚 Ghi chú VC/LĐ: {form.vcNotes}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ScoreGuide
        steps={steps}
        answers={answers}
        submitting={submitting}
        onSubmit={() => onSubmit(answers)}
        onGo={(go) => {
          if (go === 'crm-plan') {
            setTab('crm');
            setPlanOpen(true);
            return;
          }
          setTab(go);
        }}
      />
    </div>
  );
}

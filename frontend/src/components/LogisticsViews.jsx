import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { markWorkshopPipelineCardFocus } from '../lib/workshopPipelineStorage';
import { KanbanBoardEdgeScrollChrome } from '../lib/kanbanEdgeScrollControls';
import DashboardMonthCalendar, { toLocalDateKey, formatCalendarDeadlineTime } from './dashboard/DashboardMonthCalendar';

// ─── List View ───────────────────────────────────────────────────────────────
export function LogisticsListView({ pipeline, calculateDays }) {
  const navigate = useNavigate();
  const goProject = (id) => {
    markWorkshopPipelineCardFocus(id, 'vc');
    navigate(`/vc/projects/${id}`);
  };
  const allProjects = pipeline?.flatMap((s) => s.items.map((p) => ({ ...p, _stageName: s.name, _stageColor: s.color }))) || [];

  const headerCellCls = 'px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-slate-100 border-b-2 border-slate-300 border-r border-slate-200 last:border-r-0 sticky top-0 z-20';
  const bodyCellCls = 'px-3 py-2.5 align-middle border-b border-slate-200 border-r border-slate-100 last:border-r-0';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-auto h-[calc(100vh-12.5rem)] min-h-[28rem]">
        <table className="w-full text-sm min-w-[1100px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${headerCellCls} w-[7.5rem]`}>Mã</th>
              <th className={`${headerCellCls} min-w-[14rem]`}>Tên dự án</th>
              <th className={`${headerCellCls} min-w-[9rem]`}>Khách hàng</th>
              <th className={`${headerCellCls} min-w-[9rem]`}>Giai đoạn VC</th>
              <th className={`${headerCellCls} min-w-[7.5rem]`}>CRM</th>
              <th className={`${headerCellCls} min-w-[7.5rem]`}>SX</th>
              <th className={`${headerCellCls} min-w-[7.5rem]`}>VC</th>
              <th className={`${headerCellCls} min-w-[7.5rem]`}>LĐ</th>
              <th className={`${headerCellCls} w-[7rem]`}>Deadline</th>
              <th className={`${headerCellCls} w-[5.5rem]`}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {allProjects.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-gray-400 py-12 text-sm border-b border-slate-200">Không có dự án nào</td>
              </tr>
            ) : (
              allProjects.map((p) => {
                const deals = Array.isArray(p.crm_deals) ? p.crm_deals : [];
                const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
                const crmName = primaryDeal?.assignee?.full_name || primaryDeal?.lead_owner?.full_name || p.sales_person?.full_name || '—';
                const sxName = p.production_person?.full_name || '—';
                const vcName = p.logistics_person?.full_name || '—';
                const ldName = p.installer_person?.full_name || '—';
                return (
                  <tr
                    key={p.id}
                    onClick={() => goProject(p.id)}
                    className="group/row hover:bg-orange-50 cursor-pointer transition-colors"
                  >
                    <td className={`${bodyCellCls} whitespace-nowrap`}>
                      <span className="text-xs font-mono font-semibold text-orange-600" title={p.code || ''}>
                        {p.code || '—'}
                      </span>
                    </td>
                    <td className={`${bodyCellCls} max-w-[18rem]`}>
                      <p className="font-medium text-force-black truncate" title={p.name || ''}>{p.name || '—'}</p>
                    </td>
                    <td className={`${bodyCellCls} max-w-[11rem]`}>
                      <p className="text-gray-600 truncate" title={p.customer?.full_name || ''}>{p.customer?.full_name || '—'}</p>
                    </td>
                    <td className={`${bodyCellCls} whitespace-nowrap`}>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold max-w-[12rem] truncate"
                        style={{ backgroundColor: `${p._stageColor || '#f97316'}20`, color: p._stageColor || '#f97316' }}
                        title={p._stageName}
                      >
                        {p._stageName}
                      </span>
                    </td>
                    <td className={`${bodyCellCls} max-w-[9rem]`}>
                      <span className="text-gray-600 truncate block" title={crmName}>{crmName}</span>
                    </td>
                    <td className={`${bodyCellCls} max-w-[9rem]`}>
                      <span className="text-gray-600 truncate block" title={sxName}>{sxName}</span>
                    </td>
                    <td className={`${bodyCellCls} max-w-[9rem]`}>
                      <span className="text-gray-600 truncate block" title={vcName}>{vcName}</span>
                    </td>
                    <td className={`${bodyCellCls} max-w-[9rem]`}>
                      <span className="text-gray-600 truncate block" title={ldName}>{ldName}</span>
                    </td>
                    <td className={`${bodyCellCls} whitespace-nowrap`}>
                      {p.deadline ? (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${new Date(p.deadline) < new Date() ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                          {formatDate(p.deadline)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`${bodyCellCls} whitespace-nowrap`}>
                      <span className="text-xs text-gray-500">{calculateDays?.(p.created_at) || '—'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Planner View (nhóm theo người phụ trách VC) ────────────────────────────
export function LogisticsPlannerView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (id) => {
    markWorkshopPipelineCardFocus(id, 'vc');
    navigate(`/vc/projects/${id}`);
  };
  const allProjects = pipeline?.flatMap((s) => s.items.map((p) => ({ ...p, _stageName: s.name, _stageColor: s.color }))) || [];

  const byPerson = {};
  allProjects.forEach((p) => {
    const key = p.logistics_person?.full_name || p.production_person?.full_name || '__unassigned';
    const label = p.logistics_person?.full_name || p.production_person?.full_name || '(Chưa phân công)';
    if (!byPerson[key]) byPerson[key] = { label, projects: [] };
    byPerson[key].projects.push(p);
  });

  const groups = Object.values(byPerson).sort((a, b) => {
    if (a.label === '(Chưa phân công)') return 1;
    if (b.label === '(Chưa phân công)') return -1;
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Không có dự án</div>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">
                  {g.label === '(Chưa phân công)' ? '?' : g.label.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{g.label}</p>
                  <p className="text-xs text-gray-500">{g.projects.length} dự án</p>
                </div>
              </div>
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.projects.map((p) => (
                <div key={p.id} onClick={() => goProject(p.id)}
                  className="border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow hover:-translate-y-0.5"
                  style={{ borderLeft: `3px solid ${p._stageColor || '#f97316'}` }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold text-orange-600">{p.code}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate mb-1">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.customer?.full_name}</p>
                  <div className="mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: `${p._stageColor}20`, color: p._stageColor }}>
                      {p._stageName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Deadline helpers (dùng chung Calendar + Deadline view) ───────────────────
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Ưu tiên deadline dự án; fallback ngày lắp đặt. */
function resolveVcDeadlineRaw(item) {
  if (item?.deadline) return { raw: item.deadline, source: 'deadline' };
  if (item?.install_date) return { raw: item.install_date, source: 'install_date' };
  return { raw: null, source: null };
}

/** YYYY-MM-DD từ install_date / pickup_at. */
function resolveVcDateKey(raw) {
  if (raw == null || raw === '') return null;
  const ymd = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return toLocalDateKey(raw);
}

function shouldHideVcDeadlineCard(item, stage) {
  if (item?.status === 'completed') return true;
  const slug = String(stage?.bucket_slug || stage?.slug || '').toLowerCase();
  return slug === 'completed' || slug === 'done';
}

const VC_CAL_MODES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pickup', label: 'Chỉ lấy hàng' },
  { id: 'install', label: 'Chỉ lắp đặt' },
];

// ─── Calendar View — lấy hàng (pickup_at) + lắp đặt (install_date) ───────────
export function LogisticsCalendarView({ pipeline, filterFrom, onVisibleMonthChange }) {
  const navigate = useNavigate();
  const todayKey = toLocalDateKey(Date.now());
  const [calMode, setCalMode] = useState('all');

  const calendarItems = useMemo(() => {
    const built = [];
    for (const s of pipeline || []) {
      for (const p of s.items || []) {
        if (shouldHideVcDeadlineCard(p, s)) continue;
        const code = p.code || `#${p.id}`;
        const name = p.name || p.customer_name || '';

        const pickupKey = resolveVcDateKey(p.pickup_at);
        if (pickupKey) {
          const overdue = pickupKey < todayKey;
          const timeStr = formatCalendarDeadlineTime(p.pickup_at);
          built.push({
            id: `${p.id}:pickup`,
            kind: 'pickup',
            dateKey: pickupKey,
            label: `LH · ${code}`,
            subLabel: name,
            meta: [timeStr, 'Lấy hàng', s.name].filter(Boolean).join(' · '),
            title: [
              code,
              name,
              `Lấy hàng: ${pickupKey}`,
              timeStr && `Giờ: ${timeStr}`,
              s.name && `Cột: ${s.name}`,
            ].filter(Boolean).join('\n'),
            tone: overdue ? 'overdue' : 'delivery',
            overdue,
            raw: p,
          });
        }

        const installKey = resolveVcDateKey(p.install_date);
        if (installKey) {
          const overdue = installKey < todayKey;
          const timeStr = formatCalendarDeadlineTime(p.install_date);
          built.push({
            id: `${p.id}:install`,
            kind: 'install',
            dateKey: installKey,
            label: `LĐ · ${code}`,
            subLabel: name,
            meta: [timeStr, 'Lắp đặt', s.name].filter(Boolean).join(' · '),
            title: [
              code,
              name,
              `Lắp đặt: ${installKey}`,
              timeStr && `Giờ: ${timeStr}`,
              s.name && `Cột: ${s.name}`,
            ].filter(Boolean).join('\n'),
            tone: overdue ? 'overdue' : 'install',
            overdue,
            raw: p,
          });
        }
      }
    }
    if (calMode === 'pickup') return built.filter((x) => x.kind === 'pickup');
    if (calMode === 'install') return built.filter((x) => x.kind === 'install');
    return built;
  }, [pipeline, todayKey, calMode]);

  const modeHint = calMode === 'pickup'
    ? 'lịch lấy hàng'
    : calMode === 'install'
      ? 'lịch lắp đặt'
      : 'lấy hàng + lắp đặt';

  const pickupCount = useMemo(
    () => (pipeline || []).flatMap((s) => s.items || []).filter((p) => resolveVcDateKey(p.pickup_at)).length,
    [pipeline],
  );
  const installCount = useMemo(
    () => (pipeline || []).flatMap((s) => s.items || []).filter((p) => resolveVcDateKey(p.install_date)).length,
    [pipeline],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {VC_CAL_MODES.map((m) => {
          const active = calMode === m.id;
          const countHint = m.id === 'pickup'
            ? pickupCount
            : m.id === 'install'
              ? installCount
              : pickupCount + installCount;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setCalMode(m.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                active
                  ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50/60'
              }`}
            >
              {m.label}
              <span className={`ml-1.5 tabular-nums ${active ? 'text-orange-100' : 'text-slate-400'}`}>
                {countHint}
              </span>
            </button>
          );
        })}
      </div>
      {calMode === 'pickup' && calendarItems.length === 0 && (
        <p className="text-xs text-slate-500 px-1">
          Không có lịch lấy hàng trong dữ liệu đang tải{pickupCount === 0 ? ' (chưa có ngày lấy hàng trên dự án)' : ''}.
        </p>
      )}
      <DashboardMonthCalendar
        key={`vc-cal-${calMode}`}
        accent="orange"
        items={calendarItems}
        filterFrom={filterFrom}
        onVisibleMonthChange={onVisibleMonthChange}
        onItemClick={(calItem) => {
          const pid = calItem.raw?.id || String(calItem.id || '').split(':')[0];
          if (!pid) return;
          markWorkshopPipelineCardFocus(pid, 'vc');
          navigate(`/vc/projects/${pid}`);
        }}
        legend={[
          { label: 'Lấy hàng', className: 'bg-emerald-100' },
          { label: 'Lắp đặt', className: 'bg-teal-100' },
          { label: 'Đã trễ', className: 'bg-red-100' },
        ]}
        footerRight={`${calendarItems.length} lịch · ${modeHint}`}
      />
    </div>
  );
}

// ─── Deadline View (gom theo hạn — giống SX) ─────────────────────────────────
const VC_DEADLINE_BUCKETS = [
  { key: 'overdue', label: 'Quá hạn', color: '#dc2626' },
  { key: 'today', label: 'Hôm nay', color: '#ea580c' },
  { key: 'this_week', label: 'Tuần này', color: '#d97706' },
  { key: 'next_week', label: 'Tuần sau', color: '#0891b2' },
  { key: 'this_month', label: 'Tháng này', color: '#0d9488' },
  { key: 'later', label: 'Sau', color: '#475569' },
  { key: 'none', label: 'Chưa có deadline', color: '#9ca3af' },
];

function resolveVcDeadlineBucket(item, todayMs = Date.now()) {
  const { raw, source } = resolveVcDeadlineRaw(item);
  if (!raw) return { bucket: 'none', ts: null, source: null };
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return { bucket: 'none', ts: null, source: null };
  if (item?.status === 'completed') return { bucket: 'later', ts: t, source };
  const today = startOfDay(new Date(todayMs));
  const dayMs = 86400000;
  const diffDays = Math.floor((startOfDay(t).getTime() - today.getTime()) / dayMs);
  if (diffDays < 0) return { bucket: 'overdue', ts: t, source };
  if (diffDays === 0) return { bucket: 'today', ts: t, source };
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const daysToEndOfWeek = 7 - dow;
  if (diffDays <= daysToEndOfWeek) return { bucket: 'this_week', ts: t, source };
  if (diffDays <= daysToEndOfWeek + 7) return { bucket: 'next_week', ts: t, source };
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getTime();
  if (t <= endOfMonth) return { bucket: 'this_month', ts: t, source };
  return { bucket: 'later', ts: t, source };
}

function targetDateForVcBucket(bucketKey) {
  const fmt = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const today = startOfDay(new Date());
  const addDays = (n) => {
    const x = new Date(today);
    x.setDate(x.getDate() + n);
    return x;
  };
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const daysToEndOfWeek = 7 - dow;
  switch (bucketKey) {
    case 'overdue': return fmt(addDays(-1));
    case 'today': return fmt(today);
    case 'this_week': return fmt(addDays(daysToEndOfWeek));
    case 'next_week': return fmt(addDays(daysToEndOfWeek + 7));
    case 'this_month': {
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return fmt(last);
    }
    case 'later': return fmt(addDays(60));
    case 'none': return null;
    default: return fmt(today);
  }
}

function VcDeadlineBoardShell({ children }) {
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onDragStart = (e) => {
      if (e.target?.closest?.('[data-vc-deadline-card]')) {
        draggingRef.current = true;
        setDragging(true);
      }
    };
    const onDragEnd = () => {
      draggingRef.current = false;
      setDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    const EDGE = 56;
    const MIN = 5;
    const MAX = 34;
    const tick = () => {
      rafRef.current = 0;
      if (!draggingRef.current) return;
      const sc = scrollRef.current;
      const wrap = wrapRef.current;
      if (!sc || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const x = pointerRef.current.x;
      const innerL = r.left + EDGE;
      const innerR = r.right - EDGE;
      let delta = 0;
      if (x < innerL) {
        const t = Math.min(1, (innerL - x) / EDGE);
        delta = -(MIN + t * t * (MAX - MIN));
      } else if (x > innerR) {
        const t = Math.min(1, (x - innerR) / EDGE);
        delta = (MIN + t * t * (MAX - MIN));
      }
      if (delta !== 0) {
        const maxL = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const before = sc.scrollLeft;
        sc.scrollLeft = Math.max(0, Math.min(maxL, before + delta));
        if (sc.scrollLeft !== before && (x < innerL || x > innerR)) {
          rafRef.current = requestAnimationFrame(tick);
        }
      }
    };
    const onDragOver = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (!draggingRef.current) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const innerL = r.left + EDGE;
      const innerR = r.right - EDGE;
      if ((e.clientX < innerL || e.clientX > innerR) && !rafRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('dragover', onDragOver, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('dragover', onDragOver, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const nudge = (dir) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const w = 280;
    sc.scrollLeft = Math.max(
      0,
      Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)),
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <KanbanBoardEdgeScrollChrome
        wrapRef={wrapRef}
        scrollRef={scrollRef}
        isDraggingCard={dragging}
        onNudgeLeft={() => nudge('left')}
        onNudgeRight={() => nudge('right')}
        leftTitle="Giữ chuột để cuộn chậm sang trái — bấm để cuộn nhanh"
        rightTitle="Giữ chuột để cuộn chậm sang phải — bấm để cuộn nhanh"
      />
      <div ref={scrollRef} className="overflow-x-auto pb-4 [scrollbar-gutter:stable]">
        <div className="flex min-w-max gap-3">{children}</div>
      </div>
    </div>
  );
}

function VcDeadlineColumn({
  topBarColor, title, subtitle, count, children, isDragOver, onDragOver, onDragLeave, onDrop,
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex-shrink-0 w-80 rounded-lg overflow-hidden transition-all duration-200 ${isDragOver ? 'ring-2 ring-orange-500 ring-dashed' : ''}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: topBarColor || '#e5e7eb' }} />
      <div className={`bg-white border border-gray-200 border-t-0 p-3 ${isDragOver ? 'bg-orange-50' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 text-force-black truncate text-sm flex-1">{title}</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded text-[10px] shrink-0">{count}</span>
        </div>
        {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
      </div>
      <div
        className={`border border-gray-200 border-t-0 overflow-y-auto p-2 space-y-2 bg-transparent ${isDragOver ? 'bg-orange-50/40' : ''}`}
        style={{ maxHeight: '70vh', minHeight: '160px' }}
      >
        {children}
      </div>
    </div>
  );
}

function VcDeadlineCard({ item, goProject }) {
  return (
    <div
      data-vc-deadline-card
      onClick={() => goProject(item.id)}
      className="!bg-white rounded-lg border border-gray-200 p-2.5 hover:shadow-md transition-all cursor-pointer"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-orange-600 font-medium">{item.code}</p>
          <p className="text-sm font-medium text-gray-900 text-force-black truncate mt-0.5">{item.name}</p>
          {item.customer?.full_name && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{item.customer.full_name}</p>
          )}
        </div>
        {item._stage && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap"
            style={{ backgroundColor: `${item._stage.color || '#f97316'}20`, color: item._stage.color || '#ea580c' }}
          >
            {item._stage.icon} {item._stage.name}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-500">
          {item._deadlineTs ? formatDate(item._deadlineTs) : '—'}
          {item._deadlineSource === 'install_date'
            ? ' · Ngày LĐ'
            : item._deadlineSource === 'deadline'
              ? ' · Deadline'
              : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * Deadline view VC/LĐ — gom dự án theo deadline (ưu tiên) hoặc install_date
 * vào bucket Quá hạn / Hôm nay / Tuần này / … Giống ProductionDeadlineView.
 */
export function LogisticsDeadlineView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'vc');
    navigate(`/vc/projects/${projectId}`);
  };

  const [localOverride, setLocalOverride] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const todayMs = Date.now();
  const grouped = useMemo(() => {
    const out = {};
    VC_DEADLINE_BUCKETS.forEach((b) => { out[b.key] = []; });
    (pipeline || []).forEach((s) => {
      (s.items || []).forEach((item) => {
        if (shouldHideVcDeadlineCard(item, s)) return;
        let { bucket, ts, source } = resolveVcDeadlineBucket(item, todayMs);
        const ovr = localOverride[String(item.id)];
        if (ovr) {
          bucket = ovr.bucket;
          ts = ovr.ts;
          source = ovr.source;
        }
        out[bucket].push({ ...item, _stage: s, _deadlineTs: ts, _deadlineSource: source });
      });
    });
    Object.values(out).forEach((arr) => arr.sort((a, b) => {
      const ax = a._deadlineTs == null ? Infinity : a._deadlineTs;
      const bx = b._deadlineTs == null ? Infinity : b._deadlineTs;
      return ax - bx;
    }));
    return out;
  }, [pipeline, todayMs, localOverride]);

  const totalCount = VC_DEADLINE_BUCKETS.reduce((n, b) => n + (grouped[b.key]?.length || 0), 0);

  const handleDrop = async (toBucket) => {
    const id = draggingId;
    setDragOverKey(null);
    setDraggingId(null);
    if (!id) return;

    let target = null;
    for (const s of pipeline || []) {
      const found = (s.items || []).find((it) => String(it.id) === String(id));
      if (found) {
        target = found;
        break;
      }
    }
    if (!target) return;

    const newDate = targetDateForVcBucket(toBucket);
    // Giữ field nguồn nếu đã có; mặc định ghi deadline
    const fieldKey = target.deadline
      ? 'deadline'
      : target.install_date
        ? 'install_date'
        : 'deadline';
    const newTs = newDate ? new Date(`${newDate}T00:00:00`).getTime() : null;
    const newSource = newDate ? fieldKey : null;

    setLocalOverride((prev) => ({
      ...prev,
      [String(id)]: { bucket: toBucket, ts: newTs, source: newSource },
    }));
    setSavingId(id);
    try {
      await api.put(`/projects/${id}`, { [fieldKey]: newDate });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cập nhật deadline');
      setLocalOverride((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  if (totalCount === 0) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án vận chuyển / lắp đặt</p>;
  }

  return (
    <div className="space-y-2">
      <VcDeadlineBoardShell>
        {VC_DEADLINE_BUCKETS.map((b) => {
          const items = grouped[b.key] || [];
          const isDragOver = dragOverKey === b.key;
          return (
            <VcDeadlineColumn
              key={b.key}
              topBarColor={b.color}
              title={b.label}
              count={items.length}
              isDragOver={isDragOver}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverKey(b.key);
              }}
              onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOverKey(null); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(b.key); }}
            >
              {items.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p className="text-sm">{isDragOver ? '⬇️ Thả vào đây' : '—'}</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                    className={`${draggingId === item.id ? 'opacity-40' : ''} ${savingId === item.id ? 'pointer-events-none opacity-70' : ''}`}
                  >
                    <VcDeadlineCard item={item} goProject={goProject} />
                  </div>
                ))
              )}
            </VcDeadlineColumn>
          );
        })}
      </VcDeadlineBoardShell>
    </div>
  );
}


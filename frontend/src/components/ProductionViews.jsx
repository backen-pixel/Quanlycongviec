import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, X, Search, GripVertical, ChevronLeft, ChevronRight, MessageSquare,
} from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { markWorkshopPipelineCardFocus } from '../lib/workshopPipelineStorage';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmFbRelativeTime } from './crmFbCommentUi';
import { upsertComment } from './CommentsPanels';

/** Bộ emoji được phép — đồng bộ với backend PROJECT_COMMENT_ALLOWED_REACTION_EMOJI */
const PROJECT_COMMENT_REACTION_PICKER = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function groupProjectCommentsByParent(flat) {
  const m = new Map();
  for (const c of flat || []) {
    const pk = c.parent_id != null && c.parent_id !== '' ? String(c.parent_id) : '__root__';
    if (!m.has(pk)) m.set(pk, []);
    m.get(pk).push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return m;
}

function ProjectCommentReactionStrip({ comment, disabled, onPick }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const countOf = (em) => (rx.summary || []).find((s) => s.emoji === em)?.count || 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5" role="toolbar" aria-label="Thả cảm xúc">
      {PROJECT_COMMENT_REACTION_PICKER.map((em) => {
        const n = countOf(em);
        const mine = rx.mine === em;
        return (
          <button
            key={em}
            type="button"
            disabled={disabled}
            title={mine ? 'Bỏ cảm xúc' : 'Thả cảm xúc'}
            onClick={() => onPick(em)}
            className={`inline-flex min-h-[26px] items-center gap-0.5 rounded-full border px-2 py-0.5 text-[14px] leading-none transition-colors disabled:opacity-50 ${
              mine
                ? 'border-[#1877f2] bg-[#e7f3ff] shadow-sm'
                : n > 0
                  ? 'border-[#e4e6eb] bg-white hover:bg-[#f0f2f5]'
                  : 'border-transparent bg-[#f0f2f5]/80 text-[#65676b] hover:bg-[#e4e6eb]'
            }`}
          >
            <span aria-hidden>{em}</span>
            {n > 0 && <span className="text-[11px] font-semibold text-[#65676b] tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ProjectCommentReactionCornerBadge({ comment }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const items = (rx.summary || []).filter((s) => s.count > 0);
  if (!items.length) return null;
  const total = items.reduce((acc, s) => acc + s.count, 0);
  const label = items.map((i) => `${i.emoji} ${i.count}`).join(', ');
  return (
    <div className="pointer-events-none absolute bottom-0 right-1 z-10 translate-y-1/2 select-none" aria-label={`Cảm xúc: ${label}`}>
      <div className="flex items-center gap-0.5 rounded-full border border-[#e4e6eb] bg-white py-0.5 pl-0.5 pr-1.5 shadow-md ring-1 ring-black/[0.04]">
        <div className="flex items-center -space-x-1.5 pl-0.5">
          {items.slice(0, 3).map((s) => (
            <span
              key={s.emoji}
              className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-white text-[12px] leading-none shadow-sm ${
                rx.mine === s.emoji ? 'bg-[#e7f3ff]' : 'bg-[#f0f2f5]'
              }`}
            >
              {s.emoji}
            </span>
          ))}
        </div>
        {total > 1 && (
          <span className="pr-0.5 text-[11px] font-semibold tabular-nums text-[#65676b]">{total}</span>
        )}
      </div>
    </div>
  );
}

function formatVND(v) {
  if (!v) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

// ── Helpers cho list view (đồng bộ với CRM ListView) ────────────────────────
function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_PALETTE = [
  '#0891b2', '#0d9488', '#059669', '#65a30d', '#ca8a04',
  '#d97706', '#ea580c', '#dc2626', '#db2777', '#c026d3',
  '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0284c7',
];

function colorFromName(name) {
  if (!name) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function PersonAvatarCell({ name, fallback = '—' }) {
  if (!name) return <span className="text-gray-400">{fallback}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full" title={name}>
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
        style={{ backgroundColor: colorFromName(name) }}
        aria-hidden
      >
        {getInitials(name)}
      </span>
      <span className="truncate text-gray-700">{name}</span>
    </span>
  );
}

/** Danh sách dạng bảng — đồng bộ design với CRM ListView (sticky header, hover xanh,
 *  ô xếp chồng cho Mã / Tên / Người, avatar màu, lazy render 150 + 300) */
export function ProductionListView({ pipeline, calculateDays }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };

  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );

  // Lazy render: 150 dòng đầu, +300 mỗi lần cuộn gần đáy.
  const INITIAL_PAGE = 150;
  const PAGE_STEP = 300;
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE);
  const scrollContainerRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setVisibleCount(INITIAL_PAGE);
    loadingMoreRef.current = false;
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [pipeline]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (loadingMoreRef.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          loadingMoreRef.current = true;
          setVisibleCount((c) => c + PAGE_STEP);
          requestAnimationFrame(() => {
            loadingMoreRef.current = false;
          });
        }
      },
      { root, rootMargin: '600px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [allItems.length]);

  if (!allItems.length) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án xưởng</p>;
  }

  const totalValue = allItems.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0);

  const headerCellCls = 'px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-100 border-b border-gray-300 sticky top-0 text-left z-20';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-gray-500">
          {allItems.length} dự án
          {pipeline.length ? ` · ${pipeline.length} cột pipeline` : ''}
        </p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-auto max-h-[calc(100vh-18rem)] min-h-[24rem]"
        >
          <table className="w-full text-sm min-w-max border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[10px] text-gray-600 uppercase tracking-wide">
                <th className={`${headerCellCls} left-0 z-30`}>Mã</th>
                <th className={headerCellCls}>Tên dự án</th>
                <th className={headerCellCls}>Khách hàng</th>
                <th className={headerCellCls}>Cột pipeline</th>
                <th className={`${headerCellCls} text-right`}>Giá trị</th>
                <th className={headerCellCls}>SX phụ trách</th>
                <th className={headerCellCls}>Sale</th>
                <th className={headerCellCls}>Deadline</th>
                <th className={headerCellCls}>Thời gian</th>
              </tr>
            </thead>
            <tbody className="[&_tr:not(:last-child)>td]:border-b [&_tr>td]:border-gray-200">
              {allItems.slice(0, visibleCount).map((item) => {
                const daysTotal = calculateDays(item.created_at);
                const stage = item._stage;
                const sxName = item.production_person?.full_name || '';
                const saleName = item.sales_person?.full_name || '';
                const phone = item.customer?.phone || '';
                return (
                  <tr
                    key={item.id}
                    onClick={() => goProject(item.id)}
                    className="group/row hover:bg-blue-100 cursor-pointer transition-colors"
                  >
                    {/* Mã + ngày tạo */}
                    <td className="px-3 py-2 text-xs whitespace-normal align-top max-w-[200px] sticky left-0 z-[1] bg-white group-hover/row:bg-blue-100 transition-colors">
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="font-medium text-teal-600 truncate" title={item.code || ''}>
                          {item.code || '—'}
                        </span>
                        {item.created_at && (
                          <span
                            className="text-[12px] font-medium text-gray-500 mt-1 tabular-nums"
                            title={`Ngày tạo: ${new Date(item.created_at).toLocaleString('vi-VN')}`}
                          >
                            📅 {formatDate(item.created_at)}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Tên dự án + SĐT */}
                    <td className="px-3 py-2 text-xs whitespace-normal align-top max-w-[260px]">
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="font-medium text-gray-800 truncate" title={item.name || ''}>
                          {item.name || '—'}
                        </span>
                        {phone ? (
                          <a
                            href={`tel:${phone}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="text-[12px] font-mono font-bold text-emerald-600 hover:text-emerald-700 mt-1 tabular-nums truncate inline-block"
                            title={`Gọi ${phone}`}
                          >
                            📞 {phone}
                          </a>
                        ) : (
                          <span className="text-[12px] text-gray-300 mt-1">📞 —</span>
                        )}
                      </div>
                    </td>
                    {/* Khách hàng */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap max-w-[200px] truncate text-gray-700">
                      {item.customer?.full_name || '—'}
                    </td>
                    {/* Cột pipeline */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {stage ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: `${stage.color || '#0d9488'}20`,
                            color: stage.color || '#0f766e',
                          }}
                        >
                          {stage.icon} {stage.name}
                        </span>
                      ) : '—'}
                    </td>
                    {/* Giá trị */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-right tabular-nums text-gray-900 font-medium">
                      {Number(item.estimated_value) > 0 ? formatVND(item.estimated_value) : '—'}
                    </td>
                    {/* SX phụ trách */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap max-w-[200px]">
                      <PersonAvatarCell name={sxName} />
                    </td>
                    {/* Sale */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap max-w-[200px]">
                      <PersonAvatarCell name={saleName} />
                    </td>
                    {/* Deadline */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-700">
                      {item.deadline ? formatDate(item.deadline) : '—'}
                    </td>
                    {/* Thời gian (highlight theo độ trễ) */}
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span
                        className={
                          daysTotal > 30
                            ? 'text-red-600 font-bold'
                            : daysTotal > 14
                              ? 'text-amber-600 font-semibold'
                              : 'text-gray-500'
                        }
                      >
                        {daysTotal} ngày
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleCount < allItems.length && (
            <div
              ref={loadMoreSentinelRef}
              className="flex items-center justify-center py-3 text-[11px] text-gray-400"
            >
              <span
                className="inline-block h-3 w-3 mr-2 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"
                aria-hidden
              />
              Đang tải thêm… ({visibleCount.toLocaleString()}/{allItems.length.toLocaleString()})
            </div>
          )}
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t">
          <span>
            Hiển thị: {Math.min(visibleCount, allItems.length).toLocaleString()} / {allItems.length.toLocaleString()} dự án
          </span>
          <span>GT: {formatVND(totalValue)}</span>
        </div>
      </div>
    </div>
  );
}

/** Calendar view — lịch tháng hiển thị production_deadline và deadline của dự án */
export function ProductionCalendarView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };
  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build date → projects map (using production_deadline first, fallback to deadline)
  const dateMap = useMemo(() => {
    const map = {};
    allItems.forEach((item) => {
      const d = item.production_deadline || item.deadline;
      if (!d) return;
      const key = d.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [allItems]);

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const cells = [];
  // Pad start
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad end to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const dowLabels = ['CN','T2','T3','T4','T5','T6','T7'];

  const todayKey = today.toISOString().substring(0, 10);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 cursor-pointer text-gray-600 font-bold text-lg">‹</button>
        <h3 className="text-base font-bold text-gray-900">{monthNames[month]} {year}</h3>
        <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 cursor-pointer text-gray-600 font-bold text-lg">›</button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dowLabels.map((d, i) => (
          <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red-400' : 'text-gray-500'}`}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`pad-${idx}`} className="min-h-[80px] bg-gray-50/50 border-b border-r border-gray-100" />;
          }
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const items = dateMap[key] || [];
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const dow = (idx) % 7;
          return (
            <div key={key}
              className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${isPast && items.length ? 'bg-red-50/30' : isToday ? 'bg-blue-50/40' : ''}`}>
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : 'text-gray-600'
              }`}>{day}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((item) => {
                  const usePD = !!item.production_deadline;
                  const isOverdue = usePD
                    ? new Date(item.production_deadline) < today
                    : item.deadline && new Date(item.deadline) < today;
                  return (
                    <div
                      key={item.id}
                      onClick={() => goProject(item.id)}
                      title={`${item.code} — ${item.name}${usePD ? ' (Giao xưởng)' : ' (Deadline)'}`}
                      className={`truncate text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium ${
                        isOverdue
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : usePD
                          ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                      }`}
                    >
                      {item._stage.icon} {item.code || item.name}
                    </div>
                  );
                })}
                {items.length > 3 && (
                  <div className="text-[9px] text-gray-400 px-1.5">+{items.length - 3} nữa</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-100 inline-block" /> Ngày giao xưởng</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-100 inline-block" /> Deadline tổng</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Đã trễ</span>
        <span className="ml-auto">{allItems.filter(i => i.production_deadline || i.deadline).length} dự án có lịch</span>
      </div>
    </div>
  );
}

/**
 * Planner sản xuất với 2 sub-tab:
 *  - "Theo người phụ trách": gom dự án theo SX assignee
 *  - "Cá nhân của tôi": user tự tạo cột và kéo-thả dự án vào (lưu DB)
 */
export function ProductionPlannerView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };
  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );
  const [tab, setTab] = useState(() => {
    if (typeof window === 'undefined') return 'by_owner';
    return localStorage.getItem('sx_planner_sub_tab') || 'by_owner';
  });
  useEffect(() => {
    try { localStorage.setItem('sx_planner_sub_tab', tab); } catch { /* ignore */ }
  }, [tab]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 bg-white border rounded-lg p-1 w-fit">
        {[
          { id: 'by_owner', label: 'Theo người phụ trách' },
          { id: 'personal', label: 'Cá nhân của tôi' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-7 px-3 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'by_owner' ? (
        <ProductionPlannerByOwner
          allItems={allItems}
          goProject={goProject}
          onGoPersonal={() => setTab('personal')}
        />
      ) : (
        <ProductionPlannerPersonal allItems={allItems} goProject={goProject} />
      )}
    </div>
  );
}

function ProductionByOwnerCard({ item, goProject }) {
  return (
    <div
      onClick={() => goProject(item.id)}
      className="!bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all cursor-pointer group"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-teal-600 font-medium">{item.code}</p>
          <p className="text-sm font-medium text-gray-900 text-force-black truncate mt-0.5">{item.name}</p>
          {item.customer?.full_name && <p className="text-xs text-gray-500 mt-0.5">{item.customer.full_name}</p>}
        </div>
        {item._stage && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ backgroundColor: `${item._stage.color || '#0d9488'}20`, color: item._stage.color || '#0f766e' }}
          >
            {item._stage.icon} {item._stage.name}
          </span>
        )}
      </div>
      {Number(item.estimated_value) > 0 && (
        <p className="text-xs font-bold text-gray-900 mt-2">{formatVND(item.estimated_value)}</p>
      )}
    </div>
  );
}

function ProductionPlannerByOwner({ allItems, goProject, onGoPersonal }) {
  const groups = useMemo(() => {
    const map = {};
    const unassigned = [];
    allItems.forEach((item) => {
      const u = item.production_person;
      const uid = u?.id;
      if (uid && u) {
        if (!map[uid]) map[uid] = { user: u, items: [], totalValue: 0 };
        map[uid].items.push(item);
        map[uid].totalValue += Number(item.estimated_value) || 0;
      } else {
        unassigned.push(item);
      }
    });
    return { assignees: Object.values(map).sort((a, b) => b.items.length - a.items.length), unassigned };
  }, [allItems]);

  if (!allItems.length) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án xưởng</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
        <span>
          <strong>Thêm cột</strong> và kéo thẻ giữa các cột chỉ dùng trên tab <strong>Cá nhân của tôi</strong>.
        </span>
        <button
          type="button"
          onClick={onGoPersonal}
          className="h-7 shrink-0 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
        >
          Mở Planner cá nhân
        </button>
      </div>
      {groups.assignees.map((group) => (
        <div key={group.user.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
              {group.user.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{group.user.full_name}</p>
              <p className="text-[10px] text-gray-500">
                {group.items.length} dự án • {formatVND(group.totalValue)}
              </p>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.items.map((item) => (
              <ProductionByOwnerCard key={item.id} item={item} goProject={goProject} />
            ))}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-500">Chưa gán SX ({groups.unassigned.length})</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {groups.unassigned.map((item) => (
              <ProductionByOwnerCard key={item.id} item={item} goProject={goProject} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KANBAN BOARD SHELL — cuộn ngang + auto-scroll khi kéo gần mép (port từ CRMViews) ─────
function PlannerBoardShell({ children }) {
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onDragStart = (e) => {
      if (e.target?.closest?.('[data-sx-planner-card]') || e.target?.closest?.('[data-sx-deadline-card]')) {
        draggingRef.current = true;
        setDragging(true);
      }
    };
    const onDragEnd = () => {
      draggingRef.current = false;
      setDragging(false);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    };
    const EDGE = 56, MIN = 5, MAX = 34;
    const tick = () => {
      rafRef.current = 0;
      if (!draggingRef.current) return;
      const sc = scrollRef.current; const wrap = wrapRef.current;
      if (!sc || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const x = pointerRef.current.x;
      const innerL = r.left + EDGE; const innerR = r.right - EDGE;
      let delta = 0;
      if (x < innerL) { const t = Math.min(1, (innerL - x) / EDGE); delta = -(MIN + t * t * (MAX - MIN)); }
      else if (x > innerR) { const t = Math.min(1, (x - innerR) / EDGE); delta = (MIN + t * t * (MAX - MIN)); }
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
      const wrap = wrapRef.current; if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const innerL = r.left + EDGE; const innerR = r.right - EDGE;
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
    const sc = scrollRef.current; if (!sc) return;
    const w = 280;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)));
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className={`pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14 transition-opacity ${dragging ? 'opacity-100' : 'opacity-40'}`} aria-hidden>
        <div className="flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5">
          <ChevronLeft className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} />
        </div>
      </div>
      <div className={`pointer-events-none absolute right-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14 transition-opacity ${dragging ? 'opacity-100' : 'opacity-40'}`} aria-hidden>
        <div className="ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5">
          <ChevronRight className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} />
        </div>
      </div>
      <button
        type="button"
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'}`}
        title="Cuộn nhanh sang trái"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={`absolute right-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'}`}
        title="Cuộn nhanh sang phải"
        onClick={() => nudge('right')}
      />
      <div ref={scrollRef} className="overflow-x-auto pb-4 [scrollbar-gutter:stable]">
        <div className="flex min-w-max gap-3">{children}</div>
      </div>
    </div>
  );
}

function PlannerColumn({ topBarColor, title, subtitle, count, headerExtras, children, isDragOver, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex-shrink-0 w-80 rounded-lg overflow-hidden transition-all duration-200 ${isDragOver ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: topBarColor || '#e5e7eb' }} />
      <div className={`bg-white border border-gray-200 border-t-0 p-3 ${isDragOver ? 'bg-blue-50' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 text-force-black truncate text-sm flex-1">{title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtras}
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded text-[10px]">{count}</span>
          </div>
        </div>
        {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
      </div>
      <div
        className={`border border-gray-200 border-t-0 overflow-y-auto p-2 space-y-2 bg-transparent ${isDragOver ? 'bg-blue-50/40' : ''}`}
        style={{ maxHeight: '70vh', minHeight: '160px' }}
      >
        {children}
      </div>
    </div>
  );
}

function ProductionPlannerPersonal({ allItems, goProject }) {
  const [columns, setColumns] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [draggingItemId, setDraggingItemId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [colModal, setColModal] = useState(null);
  const [colNameDraft, setColNameDraft] = useState('');
  const [colModalSaving, setColModalSaving] = useState(false);

  const itemsByProjectId = useMemo(() => {
    const m = new Map();
    allItems.forEach((it) => m.set(String(it.id), it));
    return m;
  }, [allItems]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get('/production/planner/me');
      setColumns(r.data?.columns || []);
      setItems(r.data?.items || []);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Lỗi tải planner');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAddColumnModal = () => { setColNameDraft(''); setColModal({ mode: 'add' }); };
  const openRenameModal = (col) => { setColNameDraft(col.name || ''); setColModal({ mode: 'rename', col }); };

  const submitColumnModal = async () => {
    const name = colNameDraft.trim();
    if (!name || !colModal) return;
    setColModalSaving(true);
    try {
      if (colModal.mode === 'add') {
        const r = await api.post('/production/planner/columns', { name });
        setColumns((prev) => [...prev, r.data].sort((a, b) => a.position - b.position));
      } else {
        const col = colModal.col;
        if (name === col.name) {
          setColModal(null); setColNameDraft(''); setColModalSaving(false); return;
        }
        const r = await api.patch(`/production/planner/columns/${col.id}`, { name });
        setColumns((prev) => prev.map((c) => (c.id === col.id ? r.data : c)));
      }
      setColModal(null);
      setColNameDraft('');
    } catch (e) {
      alert(e?.response?.data?.error || (colModal.mode === 'add' ? 'Không tạo được cột' : 'Lỗi đổi tên'));
    }
    setColModalSaving(false);
  };

  const deleteColumn = async (col) => {
    if (!window.confirm(`Xóa cột "${col.name}"? Mọi dự án trong cột sẽ bị bỏ.`)) return;
    try {
      await api.delete(`/production/planner/columns/${col.id}`);
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      setItems((prev) => prev.filter((it) => it.column_id !== col.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa cột');
    }
  };

  const removeItem = async (it) => {
    try {
      await api.delete(`/production/planner/items/${it.id}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const addProjectsToColumn = async (columnId, projectIds) => {
    if (!projectIds.length) return;
    try {
      const r = await api.post(`/production/planner/columns/${columnId}/items`, { project_ids: projectIds });
      const newRows = Array.isArray(r.data) ? r.data : [];
      setItems((prev) => [...prev, ...newRows]);
      setAddingTo(null);
      setPickerQuery('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi thêm');
    }
  };

  const onDragStart = (it) => setDraggingItemId(it.id);
  const onDragEnd = () => { setDraggingItemId(null); setDragOverCol(null); };
  const onDropToColumn = async (colId, beforeItemId = null) => {
    if (!draggingItemId) return;
    setItems((prev) => {
      const moving = prev.find((x) => x.id === draggingItemId);
      if (!moving) return prev;
      const rest = prev.filter((x) => x.id !== draggingItemId);
      const colItems = rest
        .filter((x) => x.column_id === colId)
        .sort((a, b) => a.position - b.position);
      let insertAt = colItems.length;
      if (beforeItemId != null) {
        const idx = colItems.findIndex((x) => x.id === beforeItemId);
        if (idx >= 0) insertAt = idx;
      }
      const updatedCol = [...colItems];
      updatedCol.splice(insertAt, 0, { ...moving, column_id: colId });
      const renumbered = updatedCol.map((x, i) => ({ ...x, position: i }));
      const otherItems = rest.filter((x) => x.column_id !== colId);
      const next = [...otherItems, ...renumbered];

      const payload = renumbered.map((x) => ({ id: x.id, column_id: colId, position: x.position }));
      api.post('/production/planner/reorder', { items: payload }).catch(() => { /* ignore */ });
      return next;
    });
    onDragEnd();
  };

  const itemsByCol = useMemo(() => {
    const m = new Map();
    items.forEach((it) => {
      const arr = m.get(it.column_id) || [];
      arr.push(it);
      m.set(it.column_id, arr);
    });
    m.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return m;
  }, [items]);

  if (loading) return <p className="text-center text-gray-400 py-12 text-sm">Đang tải…</p>;

  const pickerResults = pickerQuery.trim()
    ? allItems
        .filter((it) => {
          const q = pickerQuery.trim().toLowerCase();
          return (it.name || '').toLowerCase().includes(q)
            || (it.code || '').toLowerCase().includes(q)
            || (it.customer?.full_name || '').toLowerCase().includes(q);
        })
        .slice(0, 30)
    : allItems.slice(0, 30);

  return (
    <div className="space-y-3">
      {error && <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openAddColumnModal}
          className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm cột
        </button>
        <p className="text-xs text-gray-500">Kéo-thả dự án giữa các cột. Cấu hình này chỉ thuộc về bạn.</p>
      </div>

      {columns.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-500">
          Bạn chưa có cột nào. Bấm <strong>Thêm cột</strong> để bắt đầu sắp xếp planner cá nhân.
        </div>
      ) : (
        <PlannerBoardShell>
          {columns.map((col) => {
            const colItems = (itemsByCol.get(col.id) || [])
              .map((it) => ({ planner: it, data: itemsByProjectId.get(String(it.project_id)) }))
              .filter((x) => x.data);
            const totalValue = colItems.reduce((s, x) => s + (Number(x.data?.estimated_value) || 0), 0);
            return (
              <PlannerColumn
                key={col.id}
                topBarColor={col.color || '#0d9488'}
                title={col.name}
                count={colItems.length}
                subtitle={`Giá trị: ${formatVND(totalValue)}`}
                isDragOver={dragOverCol === col.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); setDragOverCol(null); onDropToColumn(col.id, null); }}
                headerExtras={(
                  <>
                    <button type="button" onClick={() => openRenameModal(col)} title="Đổi tên"
                      className="p-1 text-gray-400 hover:text-blue-600 cursor-pointer"><Edit2 className="h-3 w-3" /></button>
                    <button type="button" onClick={() => deleteColumn(col)} title="Xóa cột"
                      className="p-1 text-gray-400 hover:text-rose-600 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                  </>
                )}
              >
                {colItems.length === 0 && (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <p className="text-sm flex items-center gap-1">
                      {dragOverCol === col.id ? '⬇️ Thả vào đây' : '📥 Kéo vào đây'}
                    </p>
                  </div>
                )}
                {colItems.map(({ planner, data }) => (
                  <div
                    key={planner.id}
                    data-sx-planner-card
                    draggable
                    onDragStart={() => onDragStart(planner)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCol(null); onDropToColumn(col.id, planner.id); }}
                    className={`relative ${draggingItemId === planner.id ? 'opacity-40' : ''}`}
                  >
                    <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5">
                      <span className="p-0.5 text-gray-300 cursor-grab"><GripVertical className="h-3 w-3" /></span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeItem(planner); }}
                        title="Bỏ khỏi cột"
                        className="p-0.5 text-gray-300 hover:text-rose-600 cursor-pointer bg-white/60 rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <ProductionByOwnerCard item={data} goProject={goProject} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAddingTo(col.id)}
                  className="w-full h-8 rounded-lg border border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:bg-white hover:border-blue-400 hover:text-blue-600 cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm dự án
                </button>
              </PlannerColumn>
            );
          })}
        </PlannerBoardShell>
      )}

      {addingTo != null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6"
             onClick={() => { setAddingTo(null); setPickerQuery(''); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold text-gray-900">Chọn dự án để thêm</p>
              <button type="button" onClick={() => { setAddingTo(null); setPickerQuery(''); }}
                      className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Tìm theo mã / tên / khách hàng…"
                  className="w-full h-9 pl-8 pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pickerResults.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-4">Không có kết quả</p>
              )}
              {pickerResults.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => addProjectsToColumn(addingTo, [it.id])}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer"
                >
                  <p className="text-xs text-blue-600 font-medium">{it.code}</p>
                  <p className="text-sm text-gray-900 truncate">{it.name}</p>
                  {it.customer?.full_name && (
                    <p className="text-[11px] text-gray-500 truncate">{it.customer.full_name}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {colModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center p-6"
          onClick={() => { if (!colModalSaving) { setColModal(null); setColNameDraft(''); } }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mt-12 p-4 border" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">
              {colModal.mode === 'add' ? 'Tên cột mới' : 'Đổi tên cột'}
            </p>
            <input
              autoFocus
              value={colNameDraft}
              onChange={(e) => setColNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !colModalSaving) submitColumnModal();
                if (e.key === 'Escape' && !colModalSaving) { setColModal(null); setColNameDraft(''); }
              }}
              placeholder="Nhập tên cột…"
              className="mt-3 w-full h-10 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={colModalSaving}
                onClick={() => { setColModal(null); setColNameDraft(''); }}
                className="h-9 px-4 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={colModalSaving || !colNameDraft.trim()}
                onClick={submitColumnModal}
                className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-50"
              >
                {colModalSaving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Deadline view — gom dự án theo `production_deadline` (ưu tiên) hoặc `deadline`
 * vào các bucket cố định: Quá hạn / Hôm nay / Tuần này / Tuần sau / Tháng này /
 * Sau / Chưa có. Layout grid columns giống Kanban để quen mắt.
 */
const SX_DEADLINE_BUCKETS = [
  { key: 'overdue',   label: 'Quá hạn',         color: '#dc2626', accent: 'bg-red-50 border-red-200' },
  { key: 'today',     label: 'Hôm nay',         color: '#ea580c', accent: 'bg-orange-50 border-orange-200' },
  { key: 'this_week', label: 'Tuần này',        color: '#d97706', accent: 'bg-amber-50 border-amber-200' },
  { key: 'next_week', label: 'Tuần sau',        color: '#0891b2', accent: 'bg-cyan-50 border-cyan-200' },
  { key: 'this_month',label: 'Tháng này',       color: '#0d9488', accent: 'bg-teal-50 border-teal-200' },
  { key: 'later',     label: 'Sau',             color: '#475569', accent: 'bg-slate-50 border-slate-200' },
  { key: 'none',      label: 'Chưa có deadline', color: '#9ca3af', accent: 'bg-gray-50 border-gray-200' },
];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function resolveSxDeadlineBucket(item, todayMs) {
  const raw = item.production_deadline || item.deadline;
  if (!raw) return { bucket: 'none', ts: null, source: null };
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return { bucket: 'none', ts: null, source: null };
  const source = item.production_deadline ? 'production_deadline' : 'deadline';
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

/** Trả về ISO date YYYY-MM-DD đại diện cho bucket khi kéo-thả. null = clear. */
function targetDateForSxBucket(bucketKey) {
  const fmt = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const today = startOfDay(new Date());
  const addDays = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const daysToEndOfWeek = 7 - dow;
  switch (bucketKey) {
    case 'overdue':    return fmt(addDays(-1));
    case 'today':      return fmt(today);
    case 'this_week':  return fmt(addDays(daysToEndOfWeek));
    case 'next_week':  return fmt(addDays(daysToEndOfWeek + 7));
    case 'this_month': {
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return fmt(last);
    }
    case 'later':      return fmt(addDays(60));
    case 'none':       return null;
    default:           return fmt(today);
  }
}

function DeadlineCard({ item, goProject }) {
  return (
    <div
      data-sx-deadline-card
      onClick={() => goProject(item.id)}
      className="!bg-white rounded-lg border border-gray-200 p-2.5 hover:shadow-md transition-all cursor-pointer"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-teal-600 font-medium">{item.code}</p>
          <p className="text-sm font-medium text-gray-900 text-force-black truncate mt-0.5">{item.name}</p>
          {item.customer?.full_name && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{item.customer.full_name}</p>
          )}
        </div>
        {item._stage && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap"
            style={{ backgroundColor: `${item._stage.color || '#0d9488'}20`, color: item._stage.color || '#0f766e' }}
          >
            {item._stage.icon} {item._stage.name}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-500">
          {item._deadlineTs ? formatDate(item._deadlineTs) : '—'}
          {item._deadlineSource === 'production_deadline'
            ? ' · Giao xưởng'
            : item._deadlineSource === 'deadline'
            ? ' · Deadline'
            : ''}
        </span>
        {Number(item.estimated_value) > 0 && (
          <span className="font-semibold text-gray-900 text-force-black">{formatVND(item.estimated_value)}</span>
        )}
      </div>
    </div>
  );
}

export function ProductionDeadlineView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };

  // localOverride: id → { bucket, ts, source }, dùng để giữ thẻ ở cột mới sau khi
  // PATCH thành công + hiển thị deadline mới ngay, chờ parent refetch để có data thật.
  const [localOverride, setLocalOverride] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const todayMs = Date.now();
  const grouped = useMemo(() => {
    const out = {};
    SX_DEADLINE_BUCKETS.forEach((b) => { out[b.key] = []; });
    pipeline.forEach((s) => {
      s.items.forEach((item) => {
        let { bucket, ts, source } = resolveSxDeadlineBucket(item, todayMs);
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

  const totalCount = SX_DEADLINE_BUCKETS.reduce((n, b) => n + (grouped[b.key]?.length || 0), 0);

  const handleDrop = async (toBucket) => {
    const id = draggingId;
    setDragOverKey(null);
    setDraggingId(null);
    if (!id) return;

    // Tìm item trong pipeline gốc để biết source field hiện có
    let target = null;
    for (const s of pipeline) {
      const found = s.items.find((it) => String(it.id) === String(id));
      if (found) { target = found; break; }
    }
    if (!target) return;

    const newDate = targetDateForSxBucket(toBucket);
    // Quyết định trường nào để cập nhật:
    // - Đã có production_deadline → cập nhật production_deadline
    // - Có deadline (chưa có production_deadline) → cập nhật deadline
    // - Chưa có gì → mặc định ghi vào production_deadline
    const fieldKey = target.production_deadline
      ? 'production_deadline'
      : target.deadline
        ? 'deadline'
        : 'production_deadline';

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
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án xưởng</p>;
  }

  return (
    <div className="space-y-2">
      <PlannerBoardShell>
        {SX_DEADLINE_BUCKETS.map((b) => {
          const items = grouped[b.key] || [];
          const totalValue = items.reduce((s, it) => s + (Number(it.estimated_value) || 0), 0);
          const isDragOver = dragOverKey === b.key;
          return (
            <PlannerColumn
              key={b.key}
              topBarColor={b.color}
              title={b.label}
              count={items.length}
              subtitle={totalValue > 0 ? `Giá trị: ${formatVND(totalValue)}` : undefined}
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
                    <DeadlineCard item={item} goProject={goProject} />
                  </div>
                ))
              )}
            </PlannerColumn>
          );
        })}
      </PlannerBoardShell>
    </div>
  );
}

export function ProductionCommentsView({ pipeline, commentsIndex, onRefreshIndex }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );

  const filtered = useMemo(() => {
    const idx = commentsIndex || {};
    const q = search.trim().toLowerCase();
    return allItems
      .map((it) => {
        const meta = idx[String(it.id)];
        return meta && meta.count > 0 ? { ...it, _comments: meta } : null;
      })
      .filter(Boolean)
      .filter((it) => {
        if (onlyMine && String(it._comments.last_user_id || '') !== String(user?.id || '')) return false;
        if (!q) return true;
        return (it.name || '').toLowerCase().includes(q)
          || (it.code || '').toLowerCase().includes(q)
          || (it.customer?.full_name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => String(b._comments.last_at || '').localeCompare(String(a._comments.last_at || '')));
  }, [allItems, commentsIndex, search, onlyMine, user?.id]);

  return (
    <div className="space-y-3 rounded-xl bg-[#f0f2f5] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm trong các dự án đã bình luận…"
            className="w-full h-9 px-3 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Bình luận cuối là của tôi
        </label>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} / {allItems.length} dự án có bình luận
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-12 text-sm">Chưa có dự án nào có bình luận.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          {filtered.map((it) => (
            <ProductionCommentCard
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => setExpandedId((prev) => (prev === it.id ? null : it.id))}
              onChanged={onRefreshIndex}
              navigate={navigate}
              user={user}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionCommentCard({ item, expanded, onToggle, onChanged, navigate, user }) {
  const [comments, setComments] = useState(null);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactionBusy, setReactionBusy] = useState(null);

  const load = useCallback(async (opts) => {
    const silent = opts?.silent;
    try {
      if (!silent) setLoading(true);
      const r = await api.get(`/projects/${item.id}/comments`);
      const rows = Array.isArray(r.data?.comments) ? r.data.comments : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
    } catch {
      setComments([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { if (expanded && comments == null) load(); }, [expanded, comments, load]);
  useEffect(() => { if (!expanded) setReplyTo(null); }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:project', item.id);
    const merge = (payload) => {
      if (String(payload?.project_id) !== String(item.id)) return;
      const action = payload?.action;
      if (action === 'deleted' || payload?.comment_id) {
        const cid = payload.comment_id || payload.comment?.id;
        if (cid) setComments((prev) => (prev || []).filter((c) => String(c.id) !== String(cid)));
        return;
      }
      const row = payload.comment;
      if (!row?.id) return;
      if (action === 'updated') {
        setComments((prev) => (prev || []).map((c) => (String(c.id) === String(row.id) ? { ...c, ...row, reactions: row.reactions ?? c.reactions } : c)));
        return;
      }
      setComments((prev) => upsertComment(prev, row));
    };
    socket.on('project:comment', merge);
    socket.on('project:comment:deleted', (p) => merge({ ...p, action: 'deleted' }));
    socket.on('project:comment:updated', (p) => merge({ ...p, action: 'updated' }));
    return () => {
      socket.off('project:comment', merge);
      socket.off('project:comment:deleted', merge);
      socket.off('project:comment:updated', merge);
    };
  }, [expanded, item.id]);

  const commentsByParent = useMemo(() => groupProjectCommentsByParent(comments || []), [comments]);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      setPosting(true);
      const payload = { content: text };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      const r = await api.post(`/projects/${item.id}/comments`, payload);
      const row = r.data?.comment || r.data;
      if (row?.id) {
        setComments((prev) => upsertComment(prev, row));
      } else {
        await load({ silent: true });
      }
      setBody('');
      setReplyTo(null);
      onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditingBody(c.content || ''); };
  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/projects/${item.id}/comments/${editingId}`, { content: v });
      const row = r.data || {};
      setComments((prev) => (prev || []).map((c) => (c.id === editingId
        ? { ...row, reactions: row.reactions ?? c.reactions }
        : c
      )));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/projects/${item.id}/comments/${c.id}`);
      await load({ silent: true });
      onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const startReply = (c) => {
    setReplyTo({ id: c.id, name: c.user?.full_name || c.user?.email || 'Thành viên' });
    setEditingId(null);
    setEditingBody('');
  };

  const pickCommentReaction = async (c, emoji) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/projects/${item.id}/comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => (prev || []).map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  const renderCommentBranch = (parentKey, depth) => {
    const list = commentsByParent.get(parentKey) || [];
    return list.map((c) => {
      const showCornerRx = editingId !== c.id && (c.reactions?.summary || []).some((s) => s.count > 0);
      return (
        <div key={c.id} className={depth > 0 ? 'ml-5 border-l border-[#ccd0d5] pl-2.5 pt-0.5' : ''}>
          <div className="group/sxrx flex gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-black/[0.025]">
            <FbCrmAvatar user={c.user} className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className={`relative inline-block max-w-full ${showCornerRx ? 'mb-2.5' : ''}`}>
                <div className={`max-w-full rounded-2xl border border-[#e4e6eb]/90 bg-white px-3 py-2 shadow-sm ${showCornerRx ? 'pb-2.5' : ''}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="text-[13px] font-semibold text-[#050505]">{c.user?.full_name || 'Thành viên'}</span>
                    <span className="text-[11px] text-[#65676b]">
                      {formatCrmFbRelativeTime(c.created_at)}
                      {c.updated_at && c.updated_at !== c.created_at && (
                        <span className="text-[#65676b]/70"> · Đã chỉnh sửa</span>
                      )}
                    </span>
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[15px] text-[#050505] focus:border-[#1877f2]/40 focus:outline-none focus:ring-1 focus:ring-[#1877f2]/30"
                      />
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={saveEdit} className="text-[13px] font-semibold text-[#1877f2] hover:underline">Lưu</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditingBody(''); }}
                                className="text-[13px] font-semibold text-[#65676b] hover:underline">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 break-words text-[15px] leading-snug text-[#050505] whitespace-pre-wrap">{c.content || ''}</p>
                  )}
                </div>
                {editingId !== c.id && <ProjectCommentReactionCornerBadge comment={c} />}
              </div>
              {editingId !== c.id && (
                <div className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-28 opacity-100 pointer-events-auto sm:max-h-0 sm:opacity-0 sm:pointer-events-none sm:group-hover/sxrx:max-h-28 sm:group-hover/sxrx:opacity-100 sm:group-hover/sxrx:pointer-events-auto sm:group-focus-within/sxrx:max-h-28 sm:group-focus-within/sxrx:opacity-100 sm:group-focus-within/sxrx:pointer-events-auto">
                  <div className="pt-1">
                    <ProjectCommentReactionStrip
                      comment={c}
                      disabled={reactionBusy === c.id}
                      onPick={(em) => pickCommentReaction(c, em)}
                    />
                  </div>
                </div>
              )}
              {editingId !== c.id && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-1 text-[12px]">
                  <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => startReply(c)}>
                    Trả lời
                  </button>
                  {String(c.user_id || '') === String(user?.id || '') && (
                    <>
                      <span className="text-[#ccd0d5]">·</span>
                      <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => startEdit(c)}>
                        Sửa
                      </button>
                      <span className="text-[#ccd0d5]">·</span>
                      <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => removeComment(c)}>
                        Xóa
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {renderCommentBranch(String(c.id), depth + 1)}
        </div>
      );
    });
  };

  const postInitial = (item.name || item.code || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[#e4e6eb] bg-white shadow-sm">
      <div className="px-3 pt-3 pb-2">
        <div className="flex gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb] text-[15px] font-bold text-[#65676b]" aria-hidden>
            {postInitial}
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                markWorkshopPipelineCardFocus(item.id, 'sx');
                navigate(`/sx/projects/${item.id}?tab=comments`);
              }}
              className="group/h w-full text-left"
            >
              <p className="truncate text-[15px] font-semibold text-[#050505] group-hover/h:underline">{item.name}</p>
              <p className="mt-0.5 text-xs text-[#65676b]">
                {item.code}
                {item.customer?.full_name ? ` · ${item.customer.full_name}` : ''}
              </p>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#65676b]">
              {item._stage && (
                <span
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: `${item._stage.color || '#0ea5e9'}18`, color: item._stage.color || '#0369a1' }}
                >
                  {item._stage.icon || '🏭'} {item._stage.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-medium text-[#65676b]">
                <MessageSquare className="h-3.5 w-3.5 text-[#65676b]" />
                {item._comments.count} bình luận
                {item._comments.last_at && (
                  <span className="font-normal text-[#65676b]/80"> · {formatCrmFbRelativeTime(item._comments.last_at)}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mx-3 mb-2 rounded-md px-2 py-1.5 text-left text-[13px] font-semibold text-[#65676b] transition-colors hover:bg-[#f0f2f5]"
      >
        {expanded ? 'Ẩn bình luận' : `Xem ${item._comments.count} bình luận trước`}
      </button>

      {expanded && (
        <div className="max-h-[min(360px,55vh)] overflow-y-auto border-t border-[#e4e6eb] bg-[#f0f2f5] px-2 py-2">
          {loading && <p className="py-6 text-center text-sm text-[#65676b]">Đang tải…</p>}
          {!loading && (comments || []).length === 0 && (
            <p className="py-6 text-center text-sm text-[#65676b]">Chưa có bình luận nào.</p>
          )}
          {!loading && renderCommentBranch('__root__', 0)}
        </div>
      )}

      <div className="border-t border-[#e4e6eb] bg-white">
        {replyTo && (
          <div className="flex items-center justify-between gap-2 border-b border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[13px] text-[#050505]">
            <span className="min-w-0 truncate">
              Đang trả lời <span className="font-semibold">{replyTo.name}</span>
            </span>
            <button type="button" className="shrink-0 font-semibold text-[#65676b] hover:underline"
                    onClick={() => setReplyTo(null)}>Hủy</button>
          </div>
        )}
        <FbCrmCommentComposer
          user={user}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onSubmit={submit}
          posting={posting}
          placeholder={
            replyTo
              ? `Trả lời ${replyTo.name}…`
              : `Bình luận với tư cách ${user?.full_name || user?.email || 'bạn'}…`
          }
        />
      </div>
    </div>
  );
}

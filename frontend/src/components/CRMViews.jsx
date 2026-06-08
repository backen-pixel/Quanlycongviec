import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { markCrmPipelineCardFocus, persistCrmPipelineUiNow } from '../lib/crmPipelineStorage';
import {
  CRM_DEADLINE_SOURCE_META,
  formatCrmRemainingMs,
  getCrmDeadlineUrgencyBadgeClass,
  getCrmDeadlineUrgencyFromTs,
  isCrmPipelineStageLost,
  pickDeadlineConfigValueWithSource,
} from '../lib/crmLeadDeadlineDisplay';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmFbRelativeTime } from './crmFbCommentUi';
import {
  Plus, X, Trash2, MessageSquare, GripVertical, Search, Edit2, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, CheckSquare, Eye, Clock,
} from 'lucide-react';

function formatVND(v) {
  if (!v) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('vi-VN');
}

function formatKpiLedgerCell(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return n > 0 ? `+${s}` : s;
}

/** Đồng bộ với backend CRM_COMMENT_ALLOWED_REACTION_EMOJI */
const CRM_COMMENT_REACTION_PICKER = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function CrmCommentReactionStrip({ comment, disabled, onPick }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const countOf = (em) => (rx.summary || []).find((s) => s.emoji === em)?.count || 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5" role="toolbar" aria-label="Thả cảm xúc">
      {CRM_COMMENT_REACTION_PICKER.map((em) => {
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

/** Tóm tắt cảm xúc dính góc dưới-phải bong bóng bình luận */
function CrmCommentReactionCornerBadge({ comment }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const items = (rx.summary || []).filter((s) => s.count > 0);
  if (!items.length) return null;
  const total = items.reduce((acc, s) => acc + s.count, 0);
  const label = items.map((i) => `${i.emoji} ${i.count}`).join(', ');
  return (
    <div
      className="pointer-events-none absolute bottom-0 right-1 z-10 translate-y-1/2 select-none"
      aria-label={`Cảm xúc: ${label}`}
    >
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

// ── LIST VIEW (cột cấu hình + lịch sử stage) ───────────────────────────────
export { ListView } from './CrmListView';

/** Badge nguồn hạn: nhiệm vụ / SLA cột / ngày chốt dự kiến */
export function CrmDeadlineSourceBadge({ source, className = '' }) {
  if (!source) return null;
  const meta = CRM_DEADLINE_SOURCE_META[source];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold leading-tight ${meta.className} ${className}`}
      title={`Hạn từ: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

// ── Render thẻ chung dùng cho Planner / Deadline / Comments ────────────────
/** mergePick: bật vùng Chọn / Chi tiết giống Kanban (deadline…) */
function renderItemCard(item, navigate, extras = null, mergePick = null) {
  const openDetail = () => {
    persistCrmPipelineUiNow();
    markCrmPipelineCardFocus(item.id);
    navigate(`/crm/leads/${item.id}`);
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-blue-600 font-medium">{item.code}</p>
          <div className="flex items-start gap-1.5 mt-0.5 min-w-0">
            <p className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: '#000000' }}>{item.title}</p>
            {item.is_new_for_current_user && (
              <span className="shrink-0 text-[9px] font-bold uppercase text-white bg-rose-500 px-1 py-0.5 rounded leading-tight">Mới</span>
            )}
          </div>
          {item.customer?.full_name && <p className="text-xs text-gray-500 mt-0.5">{item.customer.full_name}</p>}
        </div>
        {item._stage && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: item._stage.color + '20', color: item._stage.color }}>
            {item._stage.icon} {item._stage.name}
          </span>
        )}
      </div>
      {item.estimated_value > 0 && <p className="text-xs font-bold mt-2" style={{ color: '#000000' }}>{formatVND(item.estimated_value)}</p>}
      {typeof item.kpi_ledger_month_net === 'number' && (
        <p className={`text-[10px] font-mono font-semibold mt-1 ${
          item.kpi_ledger_month_net > 0 ? 'text-emerald-700' : item.kpi_ledger_month_net < 0 ? 'text-red-700' : 'text-gray-600'
        }`} title="Điểm ròng sổ cái KPI tháng">
          KPI {formatKpiLedgerCell(item.kpi_ledger_month_net)}
        </p>
      )}
      {extras}
    </>
  );

  const mergeOn = mergePick?.onToggleMergeSelect && typeof mergePick.onToggleMergeSelect === 'function';
  const selected = mergeOn && (mergePick.mergeSelectedIds || []).some((x) => String(x) === String(item.id));

  if (!mergeOn) {
    return (
      <div
        data-crm-pipeline-card={item.id}
        onClick={openDetail}
        className="!bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group">
        {body}
      </div>
    );
  }

  return (
    <div
      data-crm-pipeline-card={item.id}
      className={`relative overflow-hidden rounded-lg border border-gray-200 !bg-white transition-all group/card hover:shadow-md ${
        selected ? 'ring-2 ring-amber-400 ring-offset-1' : ''
      }`}>
      <div
        className="pointer-events-none absolute inset-0 z-[5] flex flex-col rounded-lg opacity-0 transition-opacity duration-150 group-hover/card:opacity-100"
        aria-hidden
      >
        <div className="h-[30%] min-h-[2rem] shrink-0 border-b border-dashed border-amber-300/70 bg-white" />
        <div className="min-h-0 flex-1 bg-white" />
      </div>
      <button
        type="button"
        data-kanban-select-zone
        title="30% trên: chọn để gộp / xóa / chuyển hàng loạt"
        onClick={(ev) => {
          ev.stopPropagation();
          mergePick.onToggleMergeSelect(item.id);
        }}
        className={`absolute left-0 right-0 top-0 z-20 flex h-[30%] min-h-[2rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
          selected ? 'ring-1 ring-inset ring-amber-400/70' : ''
        }`}
      >
        <span className="pointer-events-none flex flex-col items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
          <CheckSquare className="h-3.5 w-3.5 text-amber-900 drop-shadow-sm" />
          <span className="font-bold text-[9px] text-amber-950 drop-shadow-sm">Chọn</span>
        </span>
      </button>
      <button
        type="button"
        data-kanban-detail-zone
        title="70% dưới: mở chi tiết"
        onClick={(ev) => {
          ev.stopPropagation();
          openDetail();
        }}
        className="absolute bottom-0 left-0 right-0 top-[30%] z-[15] min-h-0 cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
          <Eye className="h-3.5 w-3.5 text-sky-900 drop-shadow-sm" />
          <span className="font-bold text-[9px] text-sky-950 drop-shadow-sm">Chi tiết</span>
        </span>
      </button>
      <div className="relative z-0 pointer-events-none p-3">
        {body}
      </div>
    </div>
  );
}

// ── PLANNER VIEW (có 2 sub-tab: theo người phụ trách / cá nhân) ────────────
export function PlannerView({ pipeline, pipelineType }) {
  const navigate = useNavigate();
  const allItems = useMemo(
    () => pipeline.flatMap(s => s.items.map(item => ({ ...item, _stage: s }))),
    [pipeline],
  );
  const [tab, setTab] = useState(() => localStorage.getItem('crm_planner_sub_tab') || 'by_owner');
  useEffect(() => { localStorage.setItem('crm_planner_sub_tab', tab); }, [tab]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 bg-white border rounded-lg p-1 w-fit">
        {[
          { id: 'by_owner', label: 'Theo người phụ trách' },
          { id: 'personal', label: 'Cá nhân của tôi' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`h-7 px-3 rounded-md text-xs font-medium cursor-pointer transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'by_owner'
        ? <PlannerByOwner allItems={allItems} pipelineType={pipelineType} navigate={navigate} onGoPersonal={() => setTab('personal')} />
        : <PlannerPersonal allItems={allItems} pipelineType={pipelineType} navigate={navigate} />}
    </div>
  );
}

function PlannerByOwner({ allItems, pipelineType, navigate, onGoPersonal }) {
  const groups = useMemo(() => {
    const map = {};
    const unassigned = [];
    allItems.forEach((item) => {
      const ownerId = item.assigned_to || item.lead_owner_id;
      const ownerUser = item.assignee || item.lead_owner;
      if (ownerId && ownerUser) {
        if (!map[ownerId]) map[ownerId] = { user: ownerUser, items: [], totalValue: 0 };
        map[ownerId].items.push(item);
        map[ownerId].totalValue += (item.estimated_value || 0);
      } else {
        unassigned.push(item);
      }
    });
    return { assignees: Object.values(map).sort((a, b) => b.items.length - a.items.length), unassigned };
  }, [allItems]);

  if (!allItems.length) return <p className="text-center text-gray-400 py-12 text-sm">Không có dữ liệu</p>;

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
      {groups.assignees.map(group => (
        <div key={group.user.id} className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {group.user.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#000000' }}>{group.user.full_name}</p>
              <p className="text-[10px] text-gray-500">{group.items.length} {pipelineType === 'deal' ? 'deal' : 'lead'} • {formatVND(group.totalValue)}</p>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.items.map(item => renderItemCard(item, navigate))}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed overflow-hidden">
          <div className="px-4 py-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-500">Chưa giao ({groups.unassigned.length})</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {groups.unassigned.map(item => renderItemCard(item, navigate))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban board shell (horizontal scroll + edge auto-scroll khi kéo) ───────
function KanbanBoardShell({ children }) {
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onDragStart = (e) => {
      if (e.target?.closest?.('[data-crm-pipeline-card]')) {
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
      const sc = scrollRef.current, wrap = wrapRef.current;
      if (!sc || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const x = pointerRef.current.x;
      const innerL = r.left + EDGE, innerR = r.right - EDGE;
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
      const innerL = r.left + EDGE, innerR = r.right - EDGE;
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
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)));
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14 transition-opacity ${dragging ? 'opacity-100' : 'opacity-40'}`}
        aria-hidden
      >
        <div className="flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5">
          <ChevronLeft className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} />
        </div>
      </div>
      <div
        className={`pointer-events-none absolute right-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14 transition-opacity ${dragging ? 'opacity-100' : 'opacity-40'}`}
        aria-hidden
      >
        <div className="ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5">
          <ChevronRight className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} />
        </div>
      </div>
      <button
        type="button"
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Cuộn nhanh sang trái (hoặc kéo thẻ tới mép để tự cuộn)"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={`absolute right-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Cuộn nhanh sang phải (hoặc kéo thẻ tới mép để tự cuộn)"
        onClick={() => nudge('right')}
      />
      <div ref={scrollRef} className="overflow-x-auto pb-4 [scrollbar-gutter:stable]">
        <div className="flex min-w-max gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ topBarColor, title, subtitle, count, headerExtras, children, isDragOver, onDragOver, onDragLeave, onDrop, width = 'w-80' }) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex-shrink-0 ${width} rounded-lg overflow-hidden transition-all duration-200 ${isDragOver ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: topBarColor || '#e5e7eb' }} />
      <div className={`bg-white border border-gray-200 border-t-0 p-3 ${isDragOver ? 'bg-blue-50' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold truncate text-sm flex-1" style={{ color: '#000000' }}>{title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtras}
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded text-[10px]">{count}</span>
          </div>
        </div>
        {subtitle && <p className="text-[10px] text-gray-500">{subtitle}</p>}
      </div>
      <div className={`border border-white/30 border-t-0 overflow-y-auto p-2 space-y-2 ${isDragOver ? 'bg-blue-50/60' : ''}`}
        style={{ maxHeight: '70vh', minHeight: '160px' }}>
        {children}
      </div>
    </div>
  );
}

// ── PLANNER CÁ NHÂN ─────────────────────────────────────────────────────────
function PlannerPersonal({ allItems, pipelineType, navigate }) {
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

  const itemsByLeadId = useMemo(() => {
    const m = new Map();
    allItems.forEach(it => m.set(String(it.id), it));
    return m;
  }, [allItems]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get('/crm/planner/me');
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

  const openAddColumnModal = () => {
    setColNameDraft('');
    setColModal({ mode: 'add' });
  };

  const openRenameModal = (col) => {
    setColNameDraft(col.name || '');
    setColModal({ mode: 'rename', col });
  };

  const submitColumnModal = async () => {
    const name = colNameDraft.trim();
    if (!name || !colModal) return;
    setColModalSaving(true);
    try {
      if (colModal.mode === 'add') {
        const r = await api.post('/crm/planner/columns', { name });
        setColumns((prev) => [...prev, r.data].sort((a, b) => a.position - b.position));
      } else {
        const col = colModal.col;
        if (name === col.name) {
          setColModal(null);
          setColNameDraft('');
          return;
        }
        const r = await api.patch(`/crm/planner/columns/${col.id}`, { name });
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
    if (!window.confirm(`Xóa cột "${col.name}"? Mọi mục trong cột sẽ bị bỏ.`)) return;
    try {
      await api.delete(`/crm/planner/columns/${col.id}`);
      setColumns(prev => prev.filter(c => c.id !== col.id));
      setItems(prev => prev.filter(it => it.column_id !== col.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa cột');
    }
  };

  const removeItem = async (it) => {
    try {
      await api.delete(`/crm/planner/items/${it.id}`);
      setItems(prev => prev.filter(x => x.id !== it.id));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const addLeadsToColumn = async (columnId, leadIds) => {
    if (!leadIds.length) return;
    try {
      const r = await api.post(`/crm/planner/columns/${columnId}/items`, { lead_ids: leadIds });
      const newRows = Array.isArray(r.data) ? r.data : [];
      setItems(prev => [...prev, ...newRows]);
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
    setItems(prev => {
      const moving = prev.find(x => x.id === draggingItemId);
      if (!moving) return prev;
      const rest = prev.filter(x => x.id !== draggingItemId);
      const colItems = rest
        .filter(x => x.column_id === colId)
        .sort((a, b) => a.position - b.position);
      let insertAt = colItems.length;
      if (beforeItemId != null) {
        const idx = colItems.findIndex(x => x.id === beforeItemId);
        if (idx >= 0) insertAt = idx;
      }
      const updatedCol = [...colItems];
      updatedCol.splice(insertAt, 0, { ...moving, column_id: colId });
      const renumbered = updatedCol.map((x, i) => ({ ...x, position: i }));
      const otherItems = rest.filter(x => x.column_id !== colId);
      const next = [...otherItems, ...renumbered];

      const payload = renumbered.map(x => ({ id: x.id, column_id: colId, position: x.position }));
      api.post('/crm/planner/reorder', { items: payload }).catch(() => {/* ignore */});
      return next;
    });
    onDragEnd();
  };

  const itemsByCol = useMemo(() => {
    const m = new Map();
    items.forEach(it => {
      const arr = m.get(it.column_id) || [];
      arr.push(it);
      m.set(it.column_id, arr);
    });
    m.forEach(arr => arr.sort((a, b) => a.position - b.position));
    return m;
  }, [items]);

  if (loading) return <p className="text-center text-gray-400 py-12 text-sm">Đang tải…</p>;

  const pickerResults = pickerQuery.trim()
    ? allItems
        .filter(it => {
          const q = pickerQuery.trim().toLowerCase();
          return (it.title || '').toLowerCase().includes(q)
            || (it.code || '').toLowerCase().includes(q)
            || (it.customer?.full_name || '').toLowerCase().includes(q);
        })
        .slice(0, 30)
    : allItems.slice(0, 30);

  return (
    <div className="space-y-3">
      {error && <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">{error}</div>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={openAddColumnModal}
          className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Thêm cột
        </button>
        <p className="text-xs text-gray-500">Kéo-thả {pipelineType === 'deal' ? 'deal' : 'lead'} giữa các cột. Cấu hình này chỉ thuộc về bạn.</p>
      </div>

      {columns.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-500">
          Bạn chưa có cột nào. Bấm <strong>Thêm cột</strong> để bắt đầu sắp xếp planner cá nhân.
        </div>
      ) : (
        <KanbanBoardShell>
          {columns.map(col => {
            const colItems = (itemsByCol.get(col.id) || [])
              .map(it => ({ planner: it, data: itemsByLeadId.get(String(it.lead_id)) }))
              .filter(x => x.data);
            const totalValue = colItems.reduce((s, x) => s + (x.data?.estimated_value || 0), 0);
            return (
              <KanbanColumn key={col.id}
                topBarColor={col.color || '#6366f1'}
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
                    <button onClick={() => deleteColumn(col)} title="Xóa cột"
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
                  <div key={planner.id}
                    draggable
                    onDragStart={() => onDragStart(planner)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverCol(null); onDropToColumn(col.id, planner.id); }}
                    className={`relative ${draggingItemId === planner.id ? 'opacity-40' : ''}`}>
                    <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5">
                      <span className="p-0.5 text-gray-300 cursor-grab"><GripVertical className="h-3 w-3" /></span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(planner); }}
                        title="Bỏ khỏi cột"
                        className="p-0.5 text-gray-300 hover:text-rose-600 cursor-pointer bg-white/60 rounded">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {renderItemCard(data, navigate)}
                  </div>
                ))}
                <button onClick={() => setAddingTo(col.id)}
                  className="w-full h-8 rounded-lg border border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:bg-white hover:border-blue-400 hover:text-blue-600 cursor-pointer inline-flex items-center justify-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Thêm {pipelineType === 'deal' ? 'deal' : 'lead'}
                </button>
              </KanbanColumn>
            );
          })}
        </KanbanBoardShell>
      )}

      {addingTo != null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6" onClick={() => { setAddingTo(null); setPickerQuery(''); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold text-gray-900">Chọn {pipelineType === 'deal' ? 'deal' : 'lead'} để thêm</p>
              <button onClick={() => { setAddingTo(null); setPickerQuery(''); }} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input autoFocus value={pickerQuery} onChange={e => setPickerQuery(e.target.value)}
                  placeholder="Tìm theo mã / tên / khách hàng…"
                  className="w-full h-9 pl-8 pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pickerResults.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Không có kết quả</p>}
              {pickerResults.map(it => (
                <button key={it.id} onClick={() => addLeadsToColumn(addingTo, [it.id])}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer">
                  <p className="text-xs text-blue-600 font-medium">{it.code}</p>
                  <p className="text-sm text-gray-900 truncate">{it.title}</p>
                  {it.customer?.full_name && <p className="text-[11px] text-gray-500 truncate">{it.customer.full_name}</p>}
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

// ── DEADLINE VIEW (buckets) ─────────────────────────────────────────────────
const BUCKET_ORDER = [
  'overdue', 'today', 'this_week', 'next_week',
  'in_2_weeks', 'in_3_weeks', 'in_4_weeks', 'in_1_month',
  'next_month', 'no_deadline',
];

const BUCKET_COLOR = {
  overdue:     '#f43f5e',
  today:       '#f97316',
  this_week:   '#f59e0b',
  next_week:   '#eab308',
  in_2_weeks:  '#0ea5e9',
  in_3_weeks:  '#3b82f6',
  in_4_weeks:  '#6366f1',
  in_1_month:  '#8b5cf6',
  next_month:  '#10b981',
  no_deadline: '#9ca3af',
};

// Trả ISO date YYYY-MM-DD đại diện cho bucket khi kéo-thả (set expected_close_date).
function targetDateForBucket(bucketKey, buckets) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const addDays = (n) => { const x = new Date(startOfToday); x.setDate(x.getDate() + n); return x; };
  const dow = (now.getDay() + 6) % 7; // Mon=0
  switch (bucketKey) {
    case 'overdue':     return fmt(addDays(-1));
    case 'today':       return fmt(startOfToday);
    case 'this_week':   return fmt(addDays(Math.max(0, 6 - dow)));
    case 'next_week':   return fmt(addDays(7 - dow + 3));
    case 'in_2_weeks':  return fmt(addDays(buckets?.in_2_weeks?.days || 14));
    case 'in_3_weeks':  return fmt(addDays(buckets?.in_3_weeks?.days || 21));
    case 'in_4_weeks':  return fmt(addDays(buckets?.in_4_weeks?.days || 28));
    case 'in_1_month':  return fmt(addDays(buckets?.in_1_month?.days || 30));
    case 'next_month': {
      const x = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return fmt(x);
    }
    case 'no_deadline': return null;
    default: return null;
  }
}

function resolveBucket(deadlineTs, buckets) {
  if (deadlineTs == null) return 'no_deadline';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000 - 1;
  if (deadlineTs < startOfToday) return 'overdue';
  if (deadlineTs <= endOfToday) return 'today';

  // Tuần bắt đầu Thứ Hai
  const dow = (now.getDay() + 6) % 7;
  const startOfThisWeek = startOfToday - dow * 86400000;
  const endOfThisWeek = startOfThisWeek + 7 * 86400000 - 1;
  if (deadlineTs <= endOfThisWeek) return 'this_week';
  const endOfNextWeek = endOfThisWeek + 7 * 86400000;
  if (deadlineTs <= endOfNextWeek) return 'next_week';

  const inDays = (n) => startOfToday + n * 86400000;
  const d2 = (buckets?.in_2_weeks?.days ?? 14);
  const d3 = (buckets?.in_3_weeks?.days ?? 21);
  const d4 = (buckets?.in_4_weeks?.days ?? 28);
  const d1m = (buckets?.in_1_month?.days ?? 30);
  if (deadlineTs <= inDays(d2)) return 'in_2_weeks';
  if (deadlineTs <= inDays(d3)) return 'in_3_weeks';
  if (deadlineTs <= inDays(d4)) return 'in_4_weeks';
  if (deadlineTs <= inDays(d1m)) return 'in_1_month';

  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1).getTime() - 1;
  if (deadlineTs >= startOfNextMonth && deadlineTs <= endOfNextMonth) return 'next_month';
  return 'in_1_month';
}

export function DeadlineView({
  pipeline,
  pipelineType,
  deadlineConfig,
  onOpenSettings,
  mergeSelectedIds,
  onToggleMergeSelect,
  onToggleSelectAllInColumn,
}) {
  const navigate = useNavigate();
  const allItems = useMemo(
    () => pipeline.flatMap((s) => {
      if (isCrmPipelineStageLost(s)) return [];
      return s.items.map((item) => ({ ...item, _stage: s }));
    }),
    [pipeline],
  );
  const cfg = deadlineConfig || {
    primary_field: 'crm_next_open_task_deadline',
    fallback_field: 'expected_close_date',
    buckets: {},
  };

  // Override deadline-bucket cục bộ sau khi kéo-thả (chờ silent refetch của dashboard)
  const [localOverride, setLocalOverride] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const grouped = useMemo(() => {
    const out = {};
    BUCKET_ORDER.forEach(k => { out[k] = []; });
    allItems.forEach(it => {
      let bucket = localOverride[String(it.id)];
      let ts = null;
      let source = null;
      if (!bucket) {
        const picked = pickDeadlineConfigValueWithSource(it, cfg.primary_field, cfg.fallback_field);
        ts = picked.deadlineTs;
        source = picked.source;
        bucket = resolveBucket(ts, cfg.buckets);
      }
      const enriched = { ...it, _deadlineTs: ts, _deadlineSource: source, _bucket: bucket };
      (out[bucket] || (out[bucket] = [])).push(enriched);
    });
    BUCKET_ORDER.forEach(k => {
      out[k].sort((a, b) => {
        const ax = a._deadlineTs == null ? Infinity : a._deadlineTs;
        const bx = b._deadlineTs == null ? Infinity : b._deadlineTs;
        return ax - bx;
      });
    });
    return out;
  }, [allItems, cfg, localOverride]);

  // Kéo-thả: chỉ ghi được nếu trường nguồn (chính hoặc fallback) có expected_close_date.
  const canDrag = (cfg.primary_field === 'expected_close_date') || (cfg.fallback_field === 'expected_close_date');

  const handleDrop = async (toBucket) => {
    if (!draggingId || !canDrag) { setDragOverKey(null); setDraggingId(null); return; }
    const id = draggingId;
    setDragOverKey(null);
    setDraggingId(null);
    const newDate = targetDateForBucket(toBucket, cfg.buckets);
    setLocalOverride(prev => ({ ...prev, [String(id)]: toBucket }));
    try {
      await api.put(`/crm/leads/${id}`, { expected_close_date: newDate });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cập nhật deadline');
      setLocalOverride(prev => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
    }
  };

  const mergePick =
    onToggleMergeSelect && typeof onToggleMergeSelect === 'function'
      ? { mergeSelectedIds, onToggleMergeSelect }
      : null;

  if (!allItems.length) return <p className="text-center text-gray-400 py-12 text-sm">Không có dữ liệu</p>;

  return (
    <div className="space-y-3">
      {onOpenSettings && (
        <div className="flex items-center justify-end px-2">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Cấu hình trường deadline & quy tắc hiển thị"
            className="group inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-blue-300 bg-white/80 backdrop-blur-sm text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 hover:border-blue-500 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <SettingsIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            Cấu hình deadline
          </button>
        </div>
      )}
      <KanbanBoardShell>
        {BUCKET_ORDER.map(key => {
          const meta = cfg.buckets?.[key];
          if (meta && meta.enabled === false) return null;
          const list = grouped[key] || [];
          const label = meta?.label || key;
          const totalValue = list.reduce((s, x) => s + (x.estimated_value || 0), 0);
          const columnItemIds = list.map((x) => x.id);
          const allInColumnSelected =
            columnItemIds.length > 0 &&
            columnItemIds.every((id) => (mergeSelectedIds || []).some((x) => String(x) === String(id)));
          return (
            <KanbanColumn key={key}
              topBarColor={BUCKET_COLOR[key]}
              title={label}
              count={list.length}
              subtitle={`Giá trị: ${formatVND(totalValue)}`}
              headerExtras={
                mergePick && onToggleSelectAllInColumn && list.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onToggleSelectAllInColumn(columnItemIds)}
                    className="px-2 py-1 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-amber-50 hover:border-amber-300 transition-colors text-[10px]"
                    title={allInColumnSelected ? 'Bỏ chọn mọi thẻ trong cột này' : 'Chọn tất cả trong cột'}
                  >
                    {allInColumnSelected ? 'Bỏ chọn cột' : 'Chọn tất cả'}
                  </button>
                ) : null
              }
              isDragOver={dragOverKey === key}
              onDragOver={canDrag ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key); } : undefined}
              onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOverKey(null); }}
              onDrop={canDrag ? (e) => { e.preventDefault(); handleDrop(key); } : undefined}
            >
              {list.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p className="text-sm">{dragOverKey === key ? '⬇️ Thả vào đây' : '—'}</p>
                </div>
              ) : list.map(it => (
                <div key={it.id}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    if (mergePick && e.target?.closest?.('[data-kanban-select-zone]')) {
                      e.preventDefault();
                      return;
                    }
                    if (canDrag) setDraggingId(it.id);
                  }}
                  onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                  className={draggingId === it.id ? 'opacity-40' : ''}>
                  {renderItemCard(it, navigate, (
                    it._deadlineTs != null && (() => {
                      const urg = getCrmDeadlineUrgencyFromTs(it._deadlineTs);
                      const remainLabel = urg.level === 'overdue'
                        ? formatCrmRemainingMs(Math.abs(urg.remainingMs))
                        : formatCrmRemainingMs(urg.remainingMs);
                      const isUrgent = urg.level === 'overdue' || urg.level === 'soon';
                      return (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <CrmDeadlineSourceBadge source={it._deadlineSource} />
                          {remainLabel && (
                            <span className={`inline-flex items-center gap-1 rounded-md border tabular-nums leading-none ${
                              isUrgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
                            } ${getCrmDeadlineUrgencyBadgeClass(urg.level)}`}>
                              <Clock className={isUrgent ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.6} />
                              {urg.level === 'overdue' ? <>Quá {remainLabel}</> : <>Còn {remainLabel}</>}
                            </span>
                          )}
                          <p className={`text-[10px] ${isUrgent ? 'text-slate-700 font-medium' : 'text-gray-600'}`}>
                            Hạn: {formatDateTime(new Date(it._deadlineTs).toISOString())}
                          </p>
                        </div>
                      );
                    })()
                  ), mergePick)}
                </div>
              ))}
            </KanbanColumn>
          );
        })}
      </KanbanBoardShell>
    </div>
  );
}

// ── COMMENTS VIEW ───────────────────────────────────────────────────────────
export function CommentsView({ pipeline, pipelineType, commentsIndex, onRefreshIndex }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const allItems = useMemo(
    () => pipeline.flatMap(s => s.items.map(item => ({ ...item, _stage: s }))),
    [pipeline],
  );
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const filtered = useMemo(() => {
    const idx = commentsIndex || {};
    const q = search.trim().toLowerCase();
    return allItems
      .map(it => {
        const meta = idx[String(it.id)];
        return meta && meta.count > 0 ? { ...it, _comments: meta } : null;
      })
      .filter(Boolean)
      .filter(it => {
        if (onlyMine && String(it._comments.last_user_id || '') !== String(user?.id || '')) return false;
        if (!q) return true;
        return (it.title || '').toLowerCase().includes(q)
          || (it.code || '').toLowerCase().includes(q)
          || (it.customer?.full_name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ax = a._comments.last_at || '';
        const bx = b._comments.last_at || '';
        return bx.localeCompare(ax);
      });
  }, [allItems, commentsIndex, search, onlyMine, user?.id]);

  return (
    <div
      className="space-y-3 rounded-xl p-3 sm:p-4 border border-white/30"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(150%)',
        WebkitBackdropFilter: 'blur(10px) saturate(150%)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm trong các mục đã bình luận…"
            className="w-full h-9 pl-8 pr-3 text-sm border rounded-lg bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
          Bình luận cuối là của tôi
        </label>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} / {allItems.length} {pipelineType === 'deal' ? 'deal' : 'lead'} có bình luận
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-12 text-sm">
          Chưa có {pipelineType === 'deal' ? 'deal' : 'lead'} nào có bình luận.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          {filtered.map(it => (
            <CommentCard key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => setExpandedId(prev => prev === it.id ? null : it.id)}
              onChanged={onRefreshIndex}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Nhóm bình luận phẳng theo parent_id để render cây (một hoặc nhiều cấp). */
function groupCrmCommentsByParent(flat) {
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

function CommentCard({ item, expanded, onToggle, onChanged, navigate }) {
  const { user } = useAuth();
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
      const r = await api.get(`/crm/leads/${item.id}/comments`);
      const rows = r.data || [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
    } catch (e) {
      setComments([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { if (expanded && comments == null) load(); }, [expanded, comments, load]);

  useEffect(() => {
    if (!expanded) setReplyTo(null);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:lead', item.id);
    const handler = (payload) => {
      if (String(payload?.lead_id) !== String(item.id)) return;
      const action = payload?.action || 'created';
      if (action === 'deleted') {
        setComments((prev) => (prev || []).filter((c) => c.id !== payload.comment_id));
        onChanged?.();
        return;
      }
      const row = payload.comment;
      if (!row?.id) return;
      if (action === 'updated') {
        setComments((prev) => (prev || []).map((c) => (c.id === row.id ? { ...c, ...row, reactions: row.reactions ?? c.reactions } : c)));
        return;
      }
      setComments((prev) => ((prev || []).some((c) => c.id === row.id) ? prev : [...(prev || []), { ...row, reactions: row.reactions || { summary: [], mine: null } }]));
      onChanged?.();
    };
    socket.on('lead:comment', handler);
    return () => {
      socket.emit('leave:lead', item.id);
      socket.off('lead:comment', handler);
    };
  }, [expanded, item.id, onChanged]);

  const commentsByParent = useMemo(() => groupCrmCommentsByParent(comments || []), [comments]);

  const submit = async () => {
    const v = body.trim();
    if (!v) return;
    try {
      setPosting(true);
      const payload = { body: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      const r = await api.post(`/crm/leads/${item.id}/comments`, payload);
      const row = r.data || {};
      setComments(prev => [...(prev || []), { ...row, reactions: row.reactions || { summary: [], mine: null } }]);
      setBody('');
      setReplyTo(null);
      onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditingBody(c.body || ''); };
  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/crm/lead-comments/${editingId}`, { body: v });
      const row = r.data || {};
      setComments(prev => (prev || []).map((c) => (c.id === editingId ? { ...row, reactions: row.reactions ?? c.reactions } : c)));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/crm/lead-comments/${c.id}`);
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
      const r = await api.put(`/crm/lead-comments/${c.id}/reaction`, { emoji });
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
        <div className="group/crmrx flex gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-black/[0.025]">
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
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="text-[13px] font-semibold text-[#1877f2] hover:underline"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditingBody(''); }}
                      className="text-[13px] font-semibold text-[#65676b] hover:underline"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 break-words text-[15px] leading-snug text-[#050505] whitespace-pre-wrap">{c.body}</p>
              )}
            </div>
            {editingId !== c.id && <CrmCommentReactionCornerBadge comment={c} />}
            </div>
            {editingId !== c.id && (
              <div
                className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-28 opacity-100 pointer-events-auto sm:max-h-0 sm:opacity-0 sm:pointer-events-none sm:group-hover/crmrx:max-h-28 sm:group-hover/crmrx:opacity-100 sm:group-hover/crmrx:pointer-events-auto sm:group-focus-within/crmrx:max-h-28 sm:group-focus-within/crmrx:opacity-100 sm:group-focus-within/crmrx:pointer-events-auto"
              >
                <div className="pt-1">
                  <CrmCommentReactionStrip
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

  const postInitial = (item.title || item.code || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-white/40 shadow-sm"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
      }}
    >
      {/* Header kiểu bài đăng Facebook */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex gap-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb] text-[15px] font-bold text-[#65676b]"
            aria-hidden
          >
            {postInitial}
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => { persistCrmPipelineUiNow(); markCrmPipelineCardFocus(item.id); navigate(`/crm/leads/${item.id}`); }}
              className="group/h w-full text-left"
            >
              <p className="truncate text-[15px] font-semibold text-[#050505] group-hover/h:underline">{item.title}</p>
              <p className="mt-0.5 text-xs text-[#65676b]">
                {item.code}
                {item.customer?.full_name ? ` · ${item.customer.full_name}` : ''}
              </p>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#65676b]">
              {item._stage && (
                <span
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: `${item._stage.color}18`, color: item._stage.color }}
                >
                  {item._stage.icon} {item._stage.name}
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
            <button
              type="button"
              className="shrink-0 font-semibold text-[#65676b] hover:underline"
              onClick={() => setReplyTo(null)}
            >
              Hủy
            </button>
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

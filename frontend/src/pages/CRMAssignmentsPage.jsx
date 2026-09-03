import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/utils';
import {
  LayoutGrid, List as ListIcon, Users as UsersIcon, AlertTriangle, Search, Plus,
  Building2, X, CheckCircle2, Circle, Clock, Calendar, User as UserIcon, Trash2,
  Pencil, GripVertical, Flag, MoreVertical, MessageSquare, Send, Paperclip,
  FileText as FileIcon, Download, Upload, Repeat2, CalendarClock, ChevronDown,
  ChevronUp, ClipboardList, ChevronRight, ChevronLeft, Lock, ArrowLeft, RefreshCw, Filter, RotateCcw,
  Eye, BookOpen, TrendingUp, TrendingDown, Minus, SlidersHorizontal, LayoutList, Check,
} from 'lucide-react';
import ViewModeDropdownMenu from '../components/ViewModeDropdownMenu';
import AnchoredDropdownMenu from '../components/AnchoredDropdownMenu';
import {
  RequirementFilesGallery,
  SubmitFilesCompact,
  StagedAttachmentsSection,
} from '../components/crm/CrmAssignmentFiles';
import {
  loadPersonalColumns,
  savePersonalColumns,
  loadPersonalTaskMap,
  savePersonalTaskMap,
  setTaskPersonalColumn,
  newPersonalColumnId,
} from '../lib/crmAssignmentPersonalColumns';
import {
  buildAssignmentSourceHref,
  assignmentSourceLabel,
  assignmentSourceTooltip,
  assignmentDealCardLabel,
  assignmentSourceFieldLabel,
  isProductionAssignmentsPage,
  isLogisticsAssignmentsPage,
  normalizeAssignmentPageModule,
} from '../lib/assignmentSourceLink';
import CommentDisplayHiddenBanner, { useCommentShowOnScreenEnabled } from '../components/CommentDisplayHiddenBanner';
import TaskFillFormModal from '../components/TaskFillFormModal';
import LeadDealPicker from '../components/LeadDealPicker';

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Thấp',   color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'TB',     color: 'bg-blue-100 text-blue-700' },
  { value: 'high',   label: 'Cao',    color: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Gấp',    color: 'bg-red-100 text-red-700' },
];
const PRIORITY_MAP = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p]));

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Chưa làm',  icon: Circle,        color: 'text-gray-400' },
  { value: 'in_progress', label: 'Đang làm',  icon: Clock,         color: 'text-blue-500' },
  { value: 'completed',   label: 'Đã làm',    icon: CheckCircle2,  color: 'text-emerald-500' },
  { value: 'cancelled',   label: 'Huỷ',       icon: X,             color: 'text-gray-400' },
];
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

const STATUS_BOARD_META = [
  {
    key: 'pending',
    label: 'Chưa làm',
    color: '#94A3B8',
    headerBg: 'bg-slate-50',
    border: 'border-slate-200',
    statuses: ['pending', 'cancelled'],
  },
  {
    key: 'in_progress',
    label: 'Đang làm',
    color: '#3B82F6',
    headerBg: 'bg-blue-50',
    border: 'border-blue-200',
    statuses: ['in_progress'],
  },
  {
    key: 'completed',
    label: 'Đã làm',
    color: '#10B981',
    headerBg: 'bg-emerald-50',
    border: 'border-emerald-200',
    statuses: ['completed'],
  },
];

const DEADLINE_BUCKET_META = [
  { key: 'overdue',    label: '🔴 Quá hạn',     color: '#EF4444' },
  { key: 'today',      label: '🟡 Hôm nay',     color: '#F59E0B' },
  { key: 'thisWeek',   label: '🔵 Tuần này',    color: '#3B82F6' },
  { key: 'later',      label: '⚪ Sau đó',      color: '#94A3B8' },
  { key: 'noDeadline', label: '⏳ Chưa có hạn', color: '#6B7280' },
];

function normalizeTaskStatus(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'completed' || s === 'done') return 'completed';
  if (s === 'in_progress' || s === 'doing') return 'in_progress';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'pending';
}

function groupTasksByStatus(tasks) {
  const g = { pending: [], in_progress: [], completed: [] };
  (tasks || []).forEach((t) => {
    const s = normalizeTaskStatus(t.status);
    if (s === 'completed') g.completed.push(t);
    else if (s === 'in_progress') g.in_progress.push(t);
    else g.pending.push(t); // cancelled → chưa làm / chưa xong
  });
  return g;
}

function groupTasksByDeadline(tasks) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const g = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
  (tasks || []).forEach((t) => {
    if (normalizeTaskStatus(t.status) === 'completed') return;
    if (!t.deadline) { g.noDeadline.push(t); return; }
    const d = new Date(t.deadline);
    if (Number.isNaN(d.getTime())) { g.noDeadline.push(t); return; }
    if (d < today) g.overdue.push(t);
    else if (d < new Date(today.getTime() + 86400000)) g.today.push(t);
    else if (d < weekEnd) g.thisWeek.push(t);
    else g.later.push(t);
  });
  return g;
}

function computeTaskStats(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const pending = list.filter((t) => {
    const s = normalizeTaskStatus(t.status);
    return s === 'pending' || s === 'cancelled';
  }).length;
  const inProgress = list.filter((t) => normalizeTaskStatus(t.status) === 'in_progress').length;
  const completed = list.filter((t) => normalizeTaskStatus(t.status) === 'completed').length;
  const overdue = list.filter((t) => (
    t.deadline
    && new Date(t.deadline) < new Date()
    && normalizeTaskStatus(t.status) !== 'completed'
  )).length;
  return { total: list.length, pending, inProgress, completed, overdue };
}

/** Theme theo module — đồng bộ CRM (violet) / SX (indigo) / VC (orange). */
const ASSIGN_VIEW_MODES = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'status', icon: ClipboardList, label: 'Trạng thái' },
  { id: 'list', icon: ListIcon, label: 'List' },
  { id: 'planner', icon: UsersIcon, label: 'Planner' },
  { id: 'deadline', icon: AlertTriangle, label: 'Deadline' },
];
const ASSIGN_ALT_VIEW_MODES = ASSIGN_VIEW_MODES.filter((v) => v.id !== 'kanban');

function getAssignmentTheme(assignmentModule) {
  const mod = normalizeAssignmentPageModule(assignmentModule);
  const isCustom = mod && !['crm', 'production', 'logistics'].includes(mod);
  if (isCustom) {
    return {
      mod,
      shortTitle: 'Giao việc',
      viewTheme: 'teal',
      activeText: 'text-teal-700',
      headerGrad: 'from-teal-50/70 via-white to-cyan-50/50',
      cta: 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/20',
      kpiBorder: 'border-teal-200/80 hover:border-teal-300/80',
      kpiLabel: 'text-teal-700/80',
      filterField: 'border-teal-200 focus:ring-teal-300/80 focus:border-teal-400',
      filterLabel: 'text-teal-800/90',
      filterActiveBtn: 'bg-teal-100 text-teal-700 border-teal-300',
      filterDot: 'bg-teal-600',
      filterTitle: 'text-teal-950',
      filterIcon: 'text-teal-600',
      filterClose: 'text-teal-500 hover:text-teal-800 hover:bg-teal-200/60',
      filterReset: 'border-teal-300 text-teal-700 hover:bg-teal-100',
      searchIdle: 'border-slate-200 bg-white hover:border-slate-300',
      searchActive: 'border-teal-300 bg-teal-50/80',
      searchFocus: 'border-teal-400 bg-white ring-1 ring-teal-200/60',
      searchIcon: 'text-teal-600',
      searchIconIdle: 'text-slate-400',
      suggestShell: 'border-2 border-teal-200 shadow-xl shadow-teal-500/15 ring-1 ring-teal-100',
      suggestHeader: 'bg-gradient-to-r from-teal-50 to-cyan-50/80 border-teal-100',
      suggestHeaderText: 'text-teal-800',
      suggestHeaderMuted: 'text-teal-600/90',
      suggestCount: 'text-teal-700',
      suggestHover: 'hover:bg-teal-50/80',
      suggestMeta: 'text-teal-600',
      suggestCodeBg: 'bg-slate-100 text-slate-500 group-hover/item:bg-teal-100 group-hover/item:text-teal-700',
      suggestChevron: 'text-slate-300 group-hover/item:text-teal-400',
      suggestEye: 'hover:bg-teal-100 hover:text-teal-700',
      panelRing: 'ring-1 ring-slate-900/[0.04]',
      kpiToggle: 'border-teal-100/70',
    };
  }
  if (mod === 'production') {
    return {
      mod,
      shortTitle: 'Giao việc Sản xuất',
      viewTheme: 'indigo',
      activeText: 'text-indigo-700',
      headerGrad: 'from-indigo-50/70 via-white to-sky-50/60',
      cta: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20',
      kpiBorder: 'border-indigo-200/80 hover:border-indigo-300/80',
      kpiLabel: 'text-indigo-700/80',
      filterField: 'border-indigo-200 focus:ring-indigo-300/80 focus:border-indigo-400',
      filterLabel: 'text-indigo-800/90',
      filterActiveBtn: 'bg-indigo-100 text-indigo-700 border-indigo-300',
      filterDot: 'bg-indigo-600',
      filterTitle: 'text-indigo-950',
      filterIcon: 'text-indigo-600',
      filterClose: 'text-indigo-500 hover:text-indigo-800 hover:bg-indigo-200/60',
      filterReset: 'border-indigo-300 text-indigo-700 hover:bg-indigo-100',
      searchIdle: 'border-slate-200 bg-white hover:border-slate-300',
      searchActive: 'border-indigo-300 bg-indigo-50/80',
      searchFocus: 'border-indigo-400 bg-white ring-1 ring-indigo-200/60',
      searchIcon: 'text-indigo-600',
      searchIconIdle: 'text-slate-400',
      suggestShell: 'border-2 border-indigo-200 shadow-xl shadow-indigo-500/15 ring-1 ring-indigo-100',
      suggestHeader: 'bg-gradient-to-r from-indigo-50 to-sky-50/80 border-indigo-100',
      suggestHeaderText: 'text-indigo-800',
      suggestHeaderMuted: 'text-indigo-600/90',
      suggestCount: 'text-indigo-700',
      suggestHover: 'hover:bg-indigo-50/80',
      suggestMeta: 'text-indigo-600',
      suggestCodeBg: 'bg-slate-100 text-slate-500 group-hover/item:bg-indigo-100 group-hover/item:text-indigo-700',
      suggestChevron: 'text-slate-300 group-hover/item:text-indigo-400',
      suggestEye: 'hover:bg-indigo-100 hover:text-indigo-700',
      panelRing: 'ring-1 ring-slate-900/[0.04]',
      kpiToggle: 'border-indigo-100/70',
    };
  }
  if (mod === 'logistics') {
    return {
      mod,
      shortTitle: 'Giao việc Lắp đặt',
      viewTheme: 'orange',
      activeText: 'text-orange-700',
      headerGrad: 'from-orange-50/70 via-white to-amber-50/50',
      cta: 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20',
      kpiBorder: 'border-orange-200/80 hover:border-orange-300/80',
      kpiLabel: 'text-orange-700/80',
      filterField: 'border-orange-200 focus:ring-orange-300/80 focus:border-orange-400',
      filterLabel: 'text-orange-800/90',
      filterActiveBtn: 'bg-orange-100 text-orange-700 border-orange-300',
      filterDot: 'bg-orange-600',
      filterTitle: 'text-orange-950',
      filterIcon: 'text-orange-600',
      filterClose: 'text-orange-500 hover:text-orange-800 hover:bg-orange-200/60',
      filterReset: 'border-orange-300 text-orange-700 hover:bg-orange-100',
      searchIdle: 'border-slate-200 bg-white hover:border-slate-300',
      searchActive: 'border-orange-300 bg-orange-50/80',
      searchFocus: 'border-orange-400 bg-white ring-1 ring-orange-200/60',
      searchIcon: 'text-orange-600',
      searchIconIdle: 'text-slate-400',
      suggestShell: 'border-2 border-orange-200 shadow-xl shadow-orange-500/15 ring-1 ring-orange-100',
      suggestHeader: 'bg-gradient-to-r from-orange-50 to-amber-50/80 border-orange-100',
      suggestHeaderText: 'text-orange-800',
      suggestHeaderMuted: 'text-orange-600/90',
      suggestCount: 'text-orange-700',
      suggestHover: 'hover:bg-orange-50/80',
      suggestMeta: 'text-orange-600',
      suggestCodeBg: 'bg-slate-100 text-slate-500 group-hover/item:bg-orange-100 group-hover/item:text-orange-700',
      suggestChevron: 'text-slate-300 group-hover/item:text-orange-400',
      suggestEye: 'hover:bg-orange-100 hover:text-orange-700',
      panelRing: 'ring-1 ring-slate-900/[0.04]',
      kpiToggle: 'border-orange-100/70',
    };
  }
  return {
    mod: 'crm',
    shortTitle: 'Giao việc CRM',
    viewTheme: 'violet',
    activeText: 'text-violet-700',
    headerGrad: 'from-violet-50/70 via-white to-indigo-50/40',
    cta: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20',
    kpiBorder: 'border-violet-200/80 hover:border-violet-300/80',
    kpiLabel: 'text-violet-700/80',
    filterField: 'border-violet-200 focus:ring-violet-300/80 focus:border-violet-400',
    filterLabel: 'text-violet-800/90',
    filterActiveBtn: 'bg-violet-100 text-violet-700 border-violet-300',
    filterDot: 'bg-violet-600',
    filterTitle: 'text-violet-950',
    filterIcon: 'text-violet-600',
    filterClose: 'text-violet-500 hover:text-violet-800 hover:bg-violet-200/60',
    filterReset: 'border-violet-300 text-violet-700 hover:bg-violet-100',
    searchIdle: 'border-slate-200 bg-white hover:border-slate-300',
    searchActive: 'border-violet-300 bg-violet-50/80',
    searchFocus: 'border-violet-400 bg-white ring-1 ring-violet-200/60',
    searchIcon: 'text-violet-600',
    searchIconIdle: 'text-slate-400',
    suggestShell: 'border-2 border-violet-200 shadow-xl shadow-violet-500/15 ring-1 ring-violet-100',
    suggestHeader: 'bg-gradient-to-r from-violet-50 to-violet-100/60 border-violet-100',
    suggestHeaderText: 'text-violet-800',
    suggestHeaderMuted: 'text-violet-600/90',
    suggestCount: 'text-violet-700',
    suggestHover: 'hover:bg-violet-50/80',
    suggestMeta: 'text-violet-600',
    suggestCodeBg: 'bg-slate-100 text-slate-500 group-hover/item:bg-violet-100 group-hover/item:text-violet-700',
    suggestChevron: 'text-slate-300 group-hover/item:text-violet-400',
    suggestEye: 'hover:bg-violet-100 hover:text-violet-700',
    panelRing: '',
    kpiToggle: 'border-violet-100/70',
  };
}

function SegmentedControl({ value, onChange, options, activeText = 'text-violet-700' }) {
  return (
    <div
      className="inline-flex items-center gap-px p-0.5 rounded-md bg-slate-100 border border-slate-200/80 shrink-0"
      data-tour="assign-page-tabs"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            data-tour={opt.dataTour || undefined}
            onClick={() => onChange(opt.id)}
            className={`h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
              active
                ? `bg-white ${activeText} shadow-sm`
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
            {opt.label}
            {opt.badge != null && opt.badge > 0 ? (
              <span className={`tabular-nums ${active ? 'opacity-70' : 'text-slate-400'}`}>({opt.badge})</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const PRIVATE_INBOX_VIEW_MODES = [
  { id: 'deal', icon: Building2, label: 'Theo deal' },
  { id: 'status', icon: ClipboardList, label: 'Trạng thái' },
  { id: 'deadline', icon: AlertTriangle, label: 'Deadline' },
];

/** Primary + dropdown chế độ xem khác — giống CRM dashboard. */
function ViewModeSwitcher({ view, onChange, theme, modes, primaryId, fallbackIcon: FallbackIcon = ListIcon }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const primary = modes.find((v) => v.id === primaryId) || modes[0];
  const altModes = modes.filter((v) => v.id !== primary.id);
  const activeAlt = altModes.find((v) => v.id === view);
  const PrimaryIcon = primary?.icon || FallbackIcon;
  const AltIcon = activeAlt?.icon || FallbackIcon;
  const toolbarBtn = 'h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0';
  return (
    <div className="inline-flex items-center gap-px p-0.5 rounded-md bg-slate-100 border border-slate-200/80" data-tour="assign-view-mode">
      <button
        type="button"
        data-tour={primary.id === 'kanban' ? 'assign-view-kanban' : undefined}
        onClick={() => onChange(primary.id)}
        className={`${toolbarBtn} ${
          view === primary.id ? `bg-white ${theme.activeText} shadow-sm` : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <PrimaryIcon className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{primary.label}</span>
      </button>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          data-tour="crm-view-mode-more"
          onClick={() => setOpen((v) => !v)}
          className={`${toolbarBtn} ${
            view !== primary.id ? `bg-white ${theme.activeText} shadow-sm` : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Chế độ xem khác"
          aria-expanded={open}
        >
          <AltIcon className="h-3.5 w-3.5" />
          <span className="hidden md:inline max-w-[5rem] truncate">{activeAlt?.label || 'Thêm'}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <ViewModeDropdownMenu
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          modes={altModes}
          activeId={view}
          theme={theme.viewTheme || 'violet'}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}

function AssignViewModeSwitcher({ view, onChange, theme }) {
  return (
    <ViewModeSwitcher
      view={view}
      onChange={onChange}
      theme={theme}
      modes={ASSIGN_VIEW_MODES}
      primaryId="kanban"
      fallbackIcon={ListIcon}
    />
  );
}

function AssignKpiCard({
  icon: Icon, label, value, iconBg, iconColor, borderCls, labelCls, onClick, compact = false, sub = null,
}) {
  // compact: dải KPI nhỏ trong hộp thư cá nhân (InboxStatsBar) — giữ nguyên kiểu cũ.
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`group relative h-full min-w-0 flex flex-col items-center justify-center text-center gap-1 px-2 py-2 rounded-lg border bg-white shadow-sm outline-none transition-all duration-200 ${borderCls} ${
          onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
        }`}
      >
        <div className={`shrink-0 rounded-md p-1 ${iconBg} ${iconColor}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 w-full flex flex-col items-center gap-0.5">
          <p className={`font-semibold uppercase tracking-wide leading-tight max-w-full truncate px-0.5 text-[9px] ${labelCls}`}>{label}</p>
          <p className="text-sm font-bold tabular-nums leading-snug text-slate-900">{value}</p>
        </div>
      </button>
    );
  }

  // Thẻ KPI chính: icon khối màu bên trái, nhãn nhỏ + số lớn bên phải, dòng phụ ở dưới.
  // Kích thước thu nhỏ so với bản đầu — bản đó chỉ vừa mắt ở đúng 5 cột (xl:1280px+); ở các
  // bề rộng phổ biến hơn (laptop ~1024-1279px) lưới rơi về 3 cột, mỗi thẻ giãn quá to so với
  // nội dung bên trong (icon 40px, số cỡ 2xl) và lệch hẳn với hàng "Bộ lọc nhanh" bên dưới.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group relative h-full min-w-0 flex flex-col items-start gap-1.5 rounded-xl border bg-white px-2.5 py-2 shadow-sm outline-none transition-all duration-200 ${borderCls} ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-px' : 'cursor-default'
      }`}
    >
      <div className="flex w-full min-w-0 items-center gap-2">
        <span className={`shrink-0 grid h-8 w-8 place-items-center rounded-lg ${iconBg} ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className={`block truncate text-[9px] font-semibold uppercase tracking-wide ${labelCls}`}>{label}</span>
          <span className="block text-lg font-bold leading-tight tabular-nums text-slate-900">{value}</span>
        </span>
      </div>
      {sub ? (
        <span className={`flex w-full items-center gap-1 text-left text-[10px] leading-tight ${sub.tone || 'text-slate-400'}`}>
          {sub.icon ? <sub.icon className="h-3 w-3 shrink-0" /> : null}
          <span className="min-w-0 truncate">{sub.text}</span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * Số liệu cho dòng phụ của thẻ KPI — CHỈ tính từ dữ liệu có thật.
 * `created_at` và `completed_at` có trong payload nên so được tuần này với tuần trước cho
 * «Tổng» và «Đã làm». Còn «Chưa làm»/«Đang làm»/«Quá hạn» là trạng thái tại thời điểm hiện
 * tại, không có lịch sử để đối chiếu — nên hiển thị tỷ trọng trên tổng thay vì bịa xu hướng.
 */
function computeAssignKpiSubs(tasks, stats) {
  const list = Array.isArray(tasks) ? tasks : [];
  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const countBetween = (field, from, to) => list.filter((t) => {
    const v = t?.[field];
    if (!v) return false;
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) && ms >= from && ms < to;
  }).length;

  const trend = (field) => {
    const thisWeek = countBetween(field, now - WEEK, now + 1);
    const prevWeek = countBetween(field, now - 2 * WEEK, now - WEEK);
    if (!thisWeek && !prevWeek) return null;
    if (!prevWeek) return { text: `+${thisWeek} trong 7 ngày qua`, tone: 'text-emerald-600', icon: TrendingUp };
    const pct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
    if (pct === 0) return { text: 'không đổi so với tuần trước', tone: 'text-slate-400', icon: Minus };
    return pct > 0
      ? { text: `${pct}% so với tuần trước`, tone: 'text-emerald-600', icon: TrendingUp }
      : { text: `${Math.abs(pct)}% so với tuần trước`, tone: 'text-rose-600', icon: TrendingDown };
  };

  const share = (n) => (stats.total ? { text: `${Math.round((n / stats.total) * 100)}% tổng số`, tone: 'text-slate-400' } : null);

  return {
    total: trend('created_at'),
    completed: trend('completed_at'),
    pending: share(stats.pending),
    inProgress: share(stats.inProgress),
    overdue: share(stats.overdue),
  };
}

/**
 * Bảng màu «Thống kê theo nhân viên» — xoay vòng theo thứ hạng, dùng chung cho avatar
 * (nền nhạt + chữ đậm) và thanh tiến độ (nền đặc) để mắt nối được avatar với thanh của
 * đúng người đó khi danh sách dài.
 */
const ASSIGN_STAFF_COLORS = [
  { avatarBg: 'bg-violet-100', avatarText: 'text-violet-700', bar: 'bg-violet-500' },
  { avatarBg: 'bg-sky-100', avatarText: 'text-sky-700', bar: 'bg-sky-500' },
  { avatarBg: 'bg-emerald-100', avatarText: 'text-emerald-700', bar: 'bg-emerald-500' },
  { avatarBg: 'bg-amber-100', avatarText: 'text-amber-700', bar: 'bg-amber-500' },
  { avatarBg: 'bg-rose-100', avatarText: 'text-rose-700', bar: 'bg-rose-500' },
];

/** Viết tắt tên để làm avatar chữ khi người dùng chưa có ảnh. */
function assignInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Dropdown tuỳ chỉnh thay cho `<select>` gốc trình duyệt trong Bộ lọc nhanh — trình duyệt
 * tự vẽ popup của `<select>` theo giao diện hệ điều hành (chữ đen, nền trắng trơn, không
 * theo được font/màu của app), không cách nào style được nhất quán giữa các trình duyệt.
 * Component này tự vẽ toàn bộ menu nên trông giống phần còn lại của trang, và có thêm ô
 * tìm khi danh sách dài (vd 100+ nhân viên) — điều `<select>` gốc không hỗ trợ được.
 */
function QuickFilterDropdown({ icon: Icon, label, value, onChange, options, placeholder = 'Tất cả' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const current = options.find((o) => String(o.v) === String(value));
  const searchable = options.length > 8;
  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const s = q.trim().toLowerCase();
    return options.filter((o) => o.t.toLowerCase().includes(s));
  }, [options, q, searchable]);

  useEffect(() => {
    if (!open) { setQ(''); return undefined; }
    if (!searchable) return undefined;
    const id = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, searchable]);

  const pick = (v) => { onChange(v); setOpen(false); };

  return (
    <div className="rounded-lg">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left cursor-pointer hover:bg-slate-50"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 min-w-0 truncate text-[11px] text-slate-600">{label}</span>
        <span className={`shrink-0 max-w-[6.5rem] truncate text-[11px] font-medium ${value ? 'text-violet-700' : 'text-slate-500'}`}>
          {current?.t || placeholder}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnchoredDropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        align="right"
        className="rounded-xl p-0 overflow-hidden w-[min(88vw,15rem)]"
      >
        {searchable && (
          <div className="p-1.5 border-b border-slate-100">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm..."
                className="w-full h-7 pl-6 pr-2 rounded-md border border-slate-200 text-[11px] outline-none focus:border-violet-400"
              />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-1 [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => pick('')}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] cursor-pointer hover:bg-violet-50 ${!value ? 'font-semibold text-violet-700' : 'text-slate-700'}`}
          >
            <span className="flex-1 truncate">{placeholder}</span>
            {!value && <Check className="h-3 w-3 shrink-0" />}
          </button>
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-slate-400">Không tìm thấy</p>
          ) : filtered.map((o) => {
            const active = String(value) === String(o.v);
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => pick(o.v)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] cursor-pointer hover:bg-violet-50 ${active ? 'font-semibold text-violet-700 bg-violet-50/60' : 'text-slate-700'}`}
              >
                <span className="flex-1 min-w-0 truncate">{o.t}</span>
                {active && <Check className="h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      </AnchoredDropdownMenu>
    </div>
  );
}

/**
 * Cột trái: bộ lọc nhanh + thống kê khối lượng theo nhân viên.
 * Mọi ô lọc đều nối vào state lọc CÓ THẬT của trang (công ty / nhân viên / trạng thái /
 * ưu tiên) — không dựng ô trang trí không chạy. Thống kê đếm trực tiếp từ danh sách việc
 * đang hiển thị nên luôn khớp với board bên phải.
 * "Chọn công ty" đặt TRƯỚC "Chọn nhân viên" và có tác dụng thu hẹp nó: đổi công ty sẽ nạp
 * lại `users` theo đúng công ty đó (xem effect load users ở component cha) — người vốn ở
 * công ty khác sẽ không còn hiện trong danh sách nhân viên nữa.
 * Không có ô lọc theo nhóm/phòng ban — bỏ theo yêu cầu người dùng (dễ gây nhầm lẫn vì
 * "Chọn nhân viên" ở đây liệt kê TOÀN BỘ nhân viên, không theo nhóm nào cả).
 */
function AssignQuickFilterPanel({
  tasks, users, theme, isAdmin,
  companies, filterCompanyId, setFilterCompanyId,
  filterAssignee, setFilterAssignee,
  filterStatus, setFilterStatus,
  filterPriority, setFilterPriority,
  onSeeAllStaff,
}) {
  // Trên mobile panel này nằm TRÊN bảng Kanban; để mở sẵn (cao ~455px) sẽ đẩy bảng xuống
  // quá sâu. Mặc định thu gọn ở màn hẹp, giống cách dải KPI đang làm.
  const [open, setOpen] = useState(defaultKpiPanelOpen);
  const [showAllStaff, setShowAllStaff] = useState(false);

  const staffStats = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    const byId = new Map();
    for (const t of list) {
      // `assignees` là danh sách nhiều người; rơi về `assignee` khi chỉ có một.
      const people = Array.isArray(t?.assignees) && t.assignees.length
        ? t.assignees
        : (t?.assignee ? [t.assignee] : []);
      for (const p of people) {
        const id = String(p?.id || p?.user_id || '');
        if (!id) continue;
        const name = p?.full_name || p?.name || 'Không rõ';
        const cur = byId.get(id) || { id, name, count: 0 };
        cur.count += 1;
        byId.set(id, cur);
      }
    }
    const rows = [...byId.values()].sort((a, b) => b.count - a.count);
    const total = list.length || 0;
    // Thanh tiến độ = đúng % trên tổng số việc — KHÔNG co giãn theo người cao nhất.
    // Bản trước lấy chiều rộng theo tỷ lệ với người nhiều việc nhất nên người đứng đầu
    // luôn có thanh đầy 100%, dù số ghi bên cạnh là "30%" — nhìn thanh no đủ mà số nhỏ
    // khiến người dùng khó hiểu. Giờ thanh và số luôn khớp nhau: 30% thì thanh dài 30%.
    return rows.map((r, i) => ({
      ...r,
      pct: total ? Math.round((r.count / total) * 100) : 0,
      ...ASSIGN_STAFF_COLORS[i % ASSIGN_STAFF_COLORS.length],
    }));
  }, [tasks]);

  const shownStaff = showAllStaff ? staffStats : staffStats.slice(0, 4);

  // QuickFilterDropdown tự vẽ dòng "Tất cả" riêng — options ở đây KHÔNG kèm nó (khác với
  // <select> gốc trước đây phải tự thêm option rỗng).
  const rows = [
    // Chỉ admin mới thấy — nhân viên thường (isAdmin=false) đã bị khoá vào đúng công ty
    // của họ từ backend, hiện thêm ô này sẽ không lọc được gì (không có công ty khác để
    // chọn) nên chỉ gây rối giao diện.
    ...(isAdmin && companies?.length ? [{
      key: 'company', icon: Building2, label: 'Chọn công ty',
      value: filterCompanyId, onChange: setFilterCompanyId,
      options: companies.map((co) => ({ v: String(co.id), t: co.short_name || co.name })),
    }] : []),
    {
      key: 'assignee', icon: UserIcon, label: 'Chọn nhân viên',
      value: filterAssignee, onChange: setFilterAssignee,
      options: users.map((u) => ({ v: String(u.id), t: u.full_name || u.email })),
    },
    {
      key: 'status', icon: CheckCircle2, label: 'Chọn trạng thái',
      value: filterStatus, onChange: setFilterStatus,
      options: STATUS_OPTIONS.map((s) => ({ v: s.value, t: s.label })),
    },
    {
      key: 'priority', icon: Flag, label: 'Chọn mức ưu tiên',
      value: filterPriority, onChange: setFilterPriority,
      options: PRIORITY_OPTIONS.map((p) => ({ v: p.value, t: p.label })),
    },
  ];

  // Thu gọn trên desktop (lg+): dải hẹp thẳng đứng bên trái — không đẩy board sang phải
  // thêm nữa và không "biến mất theo chiều cao" như accordion. Mobile vẫn thu gọn thành
  // thanh ngang mỏng như trước (thu theo chiều cao mới hợp lý khi các cột xếp chồng).
  if (!open) {
    return (
      <aside className="w-full lg:w-11 lg:shrink-0 self-start rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Mở bộ lọc nhanh"
          aria-expanded={false}
          className="flex lg:hidden w-full items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50/80"
        >
          <SlidersHorizontal className={`h-4 w-4 shrink-0 ${theme.activeText}`} />
          <span className="flex-1 text-sm font-semibold text-slate-800">Bộ lọc nhanh</span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Mở bộ lọc nhanh"
          aria-expanded={false}
          className="hidden lg:flex w-11 flex-col items-center gap-2 py-3 cursor-pointer hover:bg-slate-50/80"
        >
          <SlidersHorizontal className={`h-4 w-4 shrink-0 ${theme.activeText}`} />
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span
            className="text-[11px] font-semibold tracking-wide text-slate-500"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Bộ lọc nhanh
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-full lg:w-60 lg:shrink-0 rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden self-start">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded={true}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50/80"
      >
        <SlidersHorizontal className={`h-4 w-4 shrink-0 ${theme.activeText}`} />
        <span className="flex-1 text-sm font-semibold text-slate-800">Bộ lọc nhanh</span>
        <ChevronLeft className="hidden lg:block h-4 w-4 text-slate-400" />
        <ChevronUp className="lg:hidden h-4 w-4 text-slate-400" />
      </button>

      <>
          <div className="px-2 pb-2 space-y-0.5">
            {rows.map((r) => (
              <QuickFilterDropdown
                key={r.key}
                icon={r.icon}
                label={r.label}
                value={r.value}
                onChange={r.onChange}
                options={r.options}
              />
            ))}
          </div>

          <div className="border-t border-slate-100 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Số việc theo nhân viên
            </p>
            {/* Nói rõ mẫu số của % bên dưới là gì — không có dòng này người xem dễ hiểu
                nhầm % là so với tổng toàn hệ thống thay vì đúng danh sách đang lọc. */}
            <p className="mb-2 text-[10px] text-slate-400">
              Trên {tasks?.length || 0} việc đang hiển thị
            </p>
            {!shownStaff.length ? (
              <p className="py-2 text-[11px] text-slate-400">Chưa có việc nào được giao.</p>
            ) : (
              <ul className="space-y-2.5">
                {shownStaff.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center gap-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold ${s.avatarBg} ${s.avatarText}`}>
                        {assignInitials(s.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700" title={s.name}>{s.name}</span>
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-800">{s.count} việc</span>
                    </div>
                    {/* Thanh dài đúng bằng %, không co theo người đứng đầu — nhìn thanh là
                        biết ngay tỷ trọng thật, khỏi phải đọc số mới hiểu. */}
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-400">{s.pct}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {staffStats.length > 4 && (
              <button
                type="button"
                onClick={() => { if (showAllStaff) setShowAllStaff(false); else if (onSeeAllStaff) onSeeAllStaff(); else setShowAllStaff(true); }}
                className={`mt-2.5 inline-flex w-full items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${theme.activeText} hover:underline`}
              >
                {showAllStaff ? 'Thu gọn' : `Xem tất cả (${staffStats.length})`}
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </>
    </aside>
  );
}

function InboxStatsBar({ stats, theme }) {
  const t = theme || getAssignmentTheme('crm');
  const cards = [
    { label: 'Chưa làm', value: stats.pending, icon: Circle, iconBg: 'bg-slate-100', iconColor: 'text-slate-600' },
    { label: 'Đang làm', value: stats.inProgress, icon: Clock, iconBg: 'bg-blue-100', iconColor: 'text-blue-700' },
    { label: 'Đã làm', value: stats.completed, icon: CheckCircle2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700' },
    { label: 'Quá hạn', value: stats.overdue, icon: AlertTriangle, iconBg: 'bg-red-100', iconColor: 'text-red-700' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cards.map((c) => (
        <AssignKpiCard
          key={c.label}
          icon={c.icon}
          label={c.label}
          value={c.value}
          iconBg={c.iconBg}
          iconColor={c.iconColor}
          borderCls={t.kpiBorder}
          labelCls={t.kpiLabel}
          compact
        />
      ))}
    </div>
  );
}

function InboxTaskRow({ task, actionLabel = 'Mở', extraMeta = null }) {
  const StIcon = STATUS_MAP[normalizeTaskStatus(task.status)]?.icon || Circle;
  const stColor = STATUS_MAP[normalizeTaskStatus(task.status)]?.color || 'text-slate-400';
  const dealLabel = assignmentDealCardLabel(task.lead) || task.lead?.title || null;
  const statusLabel = STATUS_MAP[normalizeTaskStatus(task.status)]?.label || '—';
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 hover:border-violet-200 hover:shadow-sm transition">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          <StIcon className={`h-4 w-4 mt-0.5 shrink-0 ${stColor}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{task.title || 'Nhiệm vụ'}</p>
            {dealLabel ? (
              <p className="text-xs text-slate-500 truncate">
                {dealLabel}
                {task.lead?.project_code ? ` · ${task.lead.project_code}` : ''}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">{statusLabel}</span>
          {task.deadline && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 inline-flex items-center gap-0.5 font-medium">
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(task.deadline)}
            </span>
          )}
          {task.assignee?.full_name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 inline-flex items-center gap-0.5 font-medium">
              <UserIcon className="h-2.5 w-2.5" />
              {task.assignee.full_name}
            </span>
          )}
          {extraMeta}
        </div>
      </div>
      {task.href ? (
        <Link
          to={task.href}
          className="shrink-0 h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-[11px] font-semibold inline-flex items-center justify-center shadow-sm"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function InboxStatusBoard({ tasks, actionLabel }) {
  const grouped = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 280 }}>
      {STATUS_BOARD_META.map((col) => {
        const list = grouped[col.key] || [];
        return (
          <div
            key={col.key}
            className="w-72 shrink-0 rounded-xl border border-slate-200/90 bg-white flex flex-col shadow-sm"
          >
            <div
              className={`px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 ${col.headerBg} rounded-t-xl`}
              style={{ borderTopColor: col.color, borderTopWidth: 3 }}
            >
              <span className="text-sm font-semibold flex-1" style={{ color: col.color }}>{col.label}</span>
              <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{list.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
              {list.map((t) => (
                <InboxTaskRow key={t.id} task={t} actionLabel={actionLabel} />
              ))}
              {!list.length && (
                <p className="text-[11px] text-gray-400 text-center py-8">Không có nhiệm vụ</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InboxDeadlineBoard({ tasks, actionLabel }) {
  const grouped = useMemo(() => groupTasksByDeadline(tasks), [tasks]);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 280 }}>
      {DEADLINE_BUCKET_META.map((col) => {
        const list = grouped[col.key] || [];
        return (
          <div
            key={col.key}
            className="w-72 shrink-0 rounded-xl border border-slate-200/90 bg-white flex flex-col shadow-sm"
          >
            <div
              className="px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 rounded-t-xl"
              style={{ borderTopColor: col.color, borderTopWidth: 3 }}
            >
              <span className="text-sm font-semibold flex-1 text-slate-800">{col.label}</span>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{list.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[100px] max-h-[60vh] overflow-y-auto">
              {list.map((t) => (
                <InboxTaskRow key={t.id} task={t} actionLabel={actionLabel} />
              ))}
              {!list.length && (
                <p className="text-[11px] text-slate-400 text-center py-8">Không có nhiệm vụ</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Modal phải portal ra body — tránh bị sidebar (z-30) đè vì main nằm trong stacking context z-10. */
const ASSIGNMENTS_MODAL_Z = 'z-[100]';
/**
 * Dải KPI 5 thẻ: dưới 768px xếp 2 cột = 3 hàng (~290px), đẩy bảng Kanban xuống
 * quá nửa màn. Mặc định thu gọn ở màn hẹp — dòng tóm tắt trên nút vẫn đủ số liệu,
 * và người dùng bấm mở lại được. Chỉ là giá trị khởi tạo nên không khoá thao tác.
 */
function defaultKpiPanelOpen() {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 768;
}

function portalAssignmentsModal(node) {
  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}

/** Tab «Không gian chung» — nhiệm vụ deal được giao cho tôi, nhóm theo deal / trạng thái / deadline. */
function PrivateDealInbox({ groups, loading, assignmentModule, search, onSearchChange, theme }) {
  const t = theme || getAssignmentTheme(assignmentModule);
  const [inboxView, setInboxView] = useState('deal');
  const [collapsed, setCollapsed] = useState({});
  const [searchFocused, setSearchFocused] = useState(false);
  const [kpiPanelOpen, setKpiPanelOpen] = useState(defaultKpiPanelOpen);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const q = String(search || '').trim().toLowerCase();
  const hasSelectFilters = !!(filterStatus || filterPriority);
  const activeFilterCount = [filterStatus, filterPriority].filter(Boolean).length;
  const searchBoxCls = searchFocused
    ? t.searchFocus
    : (q || hasSelectFilters)
      ? t.searchActive
      : t.searchIdle;
  const spinBorder = t.mod === 'logistics' ? 'border-orange-600' : t.mod === 'production' ? 'border-indigo-600' : 'border-violet-600';
  const filterFieldCls = `h-8 w-full min-w-0 px-2.5 bg-white border rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow ${t.filterField}`;
  const filterSelectCls = `${filterFieldCls} cursor-pointer appearance-none pr-7`;
  const filterLabelCls = `text-[10px] font-semibold uppercase tracking-wide mb-1 block ${t.filterLabel}`;

  useEffect(() => {
    if (!showAdvFilter) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowAdvFilter(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvFilter]);

  const clearFilters = () => {
    setFilterStatus('');
    setFilterPriority('');
    onSearchChange?.('');
  };

  const filteredGroups = useMemo(() => {
    const list = Array.isArray(groups) ? groups : [];
    const matchTask = (task) => {
      if (filterStatus && normalizeTaskStatus(task.status) !== filterStatus) return false;
      if (filterPriority && String(task.priority || '') !== filterPriority) return false;
      return true;
    };
    return list
      .map((g) => {
        const dealHay = [
          g.lead?.code,
          g.lead?.title,
          g.lead?.project_code,
          g.lead?.project_name,
        ].filter(Boolean).join(' ').toLowerCase();
        const dealMatch = !q || dealHay.includes(q);
        const tasks = (g.tasks || []).filter((task) => {
          if (!matchTask(task)) return false;
          if (!q || dealMatch) return true;
          const hay = [task.title, task.assignee?.full_name, task.stage_slug]
            .filter(Boolean).join(' ').toLowerCase();
          return hay.includes(q);
        });
        if (!tasks.length) return null;
        return { ...g, tasks };
      })
      .filter(Boolean);
  }, [groups, q, filterStatus, filterPriority]);

  const flatTasks = useMemo(
    () => filteredGroups.flatMap((g) => g.tasks || []),
    [filteredGroups],
  );
  const stats = useMemo(() => computeTaskStats(flatTasks), [flatTasks]);

  return (
    <div className="space-y-0 rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden" data-tour="assign-private-board">
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 sm:px-3 border-b border-slate-200/50">
        <div className={`group/search flex items-center shrink-0 flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${searchBoxCls}`}>
          <div className="relative flex-1 min-w-0 flex items-center pl-7 pr-1">
            <Search
              className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
                searchFocused || q ? t.searchIcon : t.searchIconIdle
              }`}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Tìm deal hoặc nhiệm vụ…"
              className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${q ? 'pr-7' : ''}`}
            />
            {q ? (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="shrink-0 pr-1">
            <button
              type="button"
              onClick={() => setShowAdvFilter((v) => !v)}
              aria-expanded={showAdvFilter}
              className={`relative h-6 w-6 flex items-center justify-center rounded border transition-colors cursor-pointer ${
                showAdvFilter || hasSelectFilters
                  ? t.filterActiveBtn
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc'}
              aria-label="Bộ lọc"
            >
              <Filter className="h-3 w-3" />
              {activeFilterCount > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-white ${t.filterDot}`} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80">
          <ViewModeSwitcher
            view={inboxView}
            onChange={setInboxView}
            theme={t}
            modes={PRIVATE_INBOX_VIEW_MODES}
            primaryId="deal"
            fallbackIcon={Building2}
          />
        </div>
      </div>

      {showAdvFilter && portalAssignmentsModal(
        <div
          className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),520px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
          style={{ top: '4.5rem', right: '1rem' }}
          role="region"
          aria-label="Bộ lọc không gian chung"
        >
          <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <Filter className={`h-4 w-4 shrink-0 ${t.filterIcon}`} aria-hidden />
              <p className={`text-sm font-bold tracking-tight flex-1 min-w-0 ${t.filterTitle}`}>
                Bộ lọc
                {activeFilterCount > 0 ? (
                  <span className={`ml-1.5 text-[11px] font-medium ${t.activeText}`}>
                    · {activeFilterCount} đang bật
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => setShowAdvFilter(false)}
                className={`h-7 w-7 rounded-md cursor-pointer flex items-center justify-center shrink-0 transition-colors ${t.filterClose}`}
                aria-label="Thu gọn bộ lọc"
                title="Thu gọn"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
            <div className="py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={filterLabelCls}>Trạng thái</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={filterSelectCls}>
                  <option value="">Tất cả trạng thái</option>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className={filterLabelCls}>Ưu tiên</label>
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={filterSelectCls}>
                  <option value="">Tất cả ưu tiên</option>
                  {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
            <button
              type="button"
              onClick={clearFilters}
              className={`h-8 px-3 rounded-lg border bg-white text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm ${t.filterReset}`}
            >
              <RotateCcw className="h-3 w-3" />
              Đặt lại
            </button>
          </div>
        </div>,
      )}

      {!loading && flatTasks.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setKpiPanelOpen((v) => !v)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 sm:px-4 text-left border-b ${t.kpiToggle} bg-white/40 hover:bg-slate-50/80 cursor-pointer transition-colors`}
          >
            <span className="text-[11px] font-semibold text-slate-700 shrink-0">
              KPI
              {/* Ẩn tên trang khi đang thu gọn ở màn hẹp — nhường chỗ cho dòng số liệu */}
              <span className={`ml-1 font-medium ${t.activeText} ${kpiPanelOpen ? '' : 'hidden sm:inline'}`}>· Không gian chung</span>
            </span>
            {!kpiPanelOpen && (
              <span className="min-w-0 text-[10px] text-slate-500 tabular-nums truncate">
                {stats.total} tổng · {stats.pending} chưa · {stats.inProgress} đang · {stats.completed} xong
                {stats.overdue > 0 ? ` · ${stats.overdue} quá hạn` : ''}
              </span>
            )}
            <span className="shrink-0 ml-auto flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
              <span className="hidden sm:inline">{kpiPanelOpen ? 'Thu gọn' : 'Mở rộng'}</span>
              {kpiPanelOpen
                ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </span>
          </button>
          {kpiPanelOpen && (
            <div className={`border-b ${t.kpiToggle} bg-white/40 px-2 sm:px-3 pb-2 pt-2`}>
              <InboxStatsBar stats={stats} theme={t} />
            </div>
          )}
        </>
      )}

      <div className="p-2.5 sm:p-3 space-y-3">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className={`animate-spin h-8 w-8 border-3 border-t-transparent rounded-full ${spinBorder}`} />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
          {q || hasSelectFilters
            ? 'Không có nhiệm vụ khớp bộ lọc / từ khóa hiện tại.'
            : assignmentModule === 'production'
              ? 'Chưa có nhiệm vụ deal Sản xuất được giao cho bạn (cột CRM Sản xuất, task SX, hoặc Giao việc gắn deal).'
              : assignmentModule === 'logistics'
                ? 'Chưa có nhiệm vụ deal VC/LD được giao cho bạn (Vận chuyển · Lắp đặt, hoặc Giao việc gắn deal).'
                : 'Chưa có nhiệm vụ deal được giao cho bạn.'}
        </div>
      ) : inboxView === 'status' ? (
        <InboxStatusBoard tasks={flatTasks} actionLabel="Mở nhiệm vụ" />
      ) : inboxView === 'deadline' ? (
        <InboxDeadlineBoard tasks={flatTasks} actionLabel="Mở nhiệm vụ" />
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((g) => {
            const dealLabel = assignmentDealCardLabel(g.lead) || g.lead?.title || 'Deal';
            const isCollapsed = !!collapsed[g.lead_id];
            const gStats = computeTaskStats(g.tasks || []);
            const allDone = gStats.completed === gStats.total && gStats.total > 0;
            return (
              <div key={g.lead_id} className="rounded-xl border border-slate-200/90 overflow-hidden bg-white shadow-sm">
                <div className="flex items-center gap-1 bg-slate-50/80 border-b border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [g.lead_id]: !prev[g.lead_id] }))}
                    className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/80 cursor-pointer min-w-0"
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                    <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{dealLabel}</p>
                      {g.lead?.project_code ? (
                        <p className="text-[11px] text-slate-500 truncate">{g.lead.project_code}</p>
                      ) : null}
                    </div>
                    <div className="hidden sm:flex items-center gap-1 shrink-0 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">{gStats.pending} chưa</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">{gStats.inProgress} đang</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">{gStats.completed} xong</span>
                      {gStats.overdue > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 font-medium">{gStats.overdue} quá hạn</span>
                      )}
                    </div>
                    {allDone ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 shrink-0">
                        Xong hết
                      </span>
                    ) : null}
                  </button>
                  {g.href ? (
                    <Link
                      to={g.href}
                      className={`shrink-0 mr-2 h-7 px-2.5 rounded-md text-white text-[11px] font-semibold inline-flex items-center shadow-sm ${t.cta}`}
                    >
                      Mở deal
                    </Link>
                  ) : null}
                </div>
                {!isCollapsed && (
                  <div className="p-2.5 space-y-2 bg-white">
                    {(g.tasks || []).map((task) => (
                      <InboxTaskRow key={task.id} task={task} actionLabel="Mở nhiệm vụ" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        {stats.total} nhiệm vụ · {filteredGroups.length} deal — tab Công việc trên deal
      </p>
      </div>
    </div>
  );
}

/**
 * Trang "Giao việc CRM" — độc lập với module Công việc và CRM tasks gắn lead.
 * Chế độ xem: Kanban, Trạng thái, List, Planner, Deadline.
 */

const COLUMN_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#6B7280', '#0EA5E9'];

const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Hàng ngày' },
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' },
];

const DEFAULT_LS_COMPANY = 'crm_assignments_company_id';
const DEFAULT_LS_VIEW_SCOPE = 'crm_assignments_view_scope';

const AssignmentsPageContext = createContext({
  apiBase: '/crm/assignments',
  assignmentModule: 'crm',
  theme: getAssignmentTheme('crm'),
});

function useAssignmentsPageContext() {
  return useContext(AssignmentsPageContext);
}

function isAssignmentCreator(task, userId) {
  return String(task?.created_by_id || '') === String(userId || '');
}

function isAssignmentAssignee(task, userId) {
  if (!userId) return false;
  const list = (task?.assignees?.length) ? task.assignees : (task?.assignee ? [task.assignee] : []);
  if (list.some((a) => String(a.id) === String(userId))) return true;
  if (task?.assignee_id && String(task.assignee_id) === String(userId)) return true;
  return false;
}

/** Kéo cột / đổi trạng thái: người tạo hoặc người được giao (chung một cột cho cả nhóm). */
function canMoveAssignment(task, userId) {
  return isAssignmentCreator(task, userId) || isAssignmentAssignee(task, userId);
}

const PIPELINE_STATUS_STAGES = [
  { value: 'pending', label: 'Chưa làm', icon: Circle, activeClass: 'bg-gray-100 border-gray-300 text-gray-700' },
  { value: 'in_progress', label: 'Đang làm', icon: Clock, activeClass: 'bg-blue-100 border-blue-400 text-blue-800' },
  { value: 'completed', label: 'Đã làm', icon: CheckCircle2, activeClass: 'bg-emerald-100 border-emerald-400 text-emerald-800' },
];

function AssignmentStatusStages({ status, canEdit, onChange, compact = false }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-1'}`}>
      {PIPELINE_STATUS_STAGES.map((st) => {
        const Icon = st.icon;
        const active = status === st.value;
        return (
          <button
            key={st.value}
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && onChange(st.value)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? st.activeClass + ' ring-1 ring-offset-1' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            } ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
            title={canEdit ? `Đặt: ${st.label}` : st.label}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-50'}`} />
            {st.label}
            {active && <CheckCircle2 className="h-3 w-3 ml-0.5" />}
          </button>
        );
      })}
    </div>
  );
}

function PipelineTaskNotesSection({ item, canEdit, onNotesSaved }) {
  const [text, setText] = useState(item.crm_task?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(item.crm_task?.notes || '');
  }, [item.id, item.crm_task?.notes]);

  if (!item.crm_task_id || !item.lead?.id) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/crm/leads/${item.lead.id}/tasks/${item.crm_task_id}/notes`, { notes: text });
      onNotesSaved?.(text);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
    }
    setSaving(false);
  };

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
      <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4" /> Ghi chú (đồng bộ tab Nhiệm vụ lead/deal)
      </h4>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        rows={3}
        placeholder={canEdit ? 'Nhập ghi chú tiến độ, kết quả làm việc…' : 'Chưa có ghi chú'}
        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white resize-y outline-none focus:ring-2 focus:ring-amber-300"
      />
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="h-8 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu ghi chú'}
          </button>
        </div>
      )}
    </div>
  );
}

function LeadAssignmentLink({ assignment, className = '', variant = 'chip' }) {
  const { assignmentModule } = useAssignmentsPageContext();
  const lead = assignment?.lead;
  if (!lead?.id) return null;
  const href = buildAssignmentSourceHref(assignment, assignmentModule);
  if (!href) return null;
  const isSx = isProductionAssignmentsPage(assignmentModule);
  const isVc = isLogisticsAssignmentsPage(assignmentModule);
  const label = variant === 'card' ? assignmentDealCardLabel(lead) : assignmentSourceLabel(lead);
  const tooltip = assignmentSourceTooltip(lead, assignmentModule);
  const taskHint = assignment?.crm_task_id
    ? `${tooltip} (focus nhiệm vụ pipeline)`
    : tooltip;
  const isDeal = String(lead.type || '').toLowerCase() === 'deal';
  const icon = isSx ? '🏭' : isVc ? '🚚' : (isDeal ? '🎯' : '💼');
  const tone = isSx
    ? 'text-teal-800 hover:text-teal-950'
    : isVc
      ? 'text-orange-800 hover:text-orange-950'
      : 'text-indigo-800 hover:text-indigo-950';
  const chipTone = isSx
    ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
    : isVc
      ? 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100'
      : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100';

  if (variant === 'card') {
    return (
      <Link
        to={href}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-1 mt-1 min-w-0 text-[11px] font-medium hover:underline ${tone} ${className}`}
        title={taskHint}
      >
        <span className="shrink-0" aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium max-w-[200px] truncate ${chipTone} ${className}`}
      title={taskHint}
    >
      {icon} {label}
    </Link>
  );
}

export default function CRMAssignmentsPage({
  apiBase = '/crm/assignments',
  pageTitle = 'Giao việc CRM',
  companiesModule = 'crm',
  assignmentModule = 'crm',
  storagePrefix = 'crm_assignments',
  dashboardLink = '/crm/dashboard',
} = {}) {
  const LS_COMPANY = `${storagePrefix}_company_id`;
  const LS_DEPARTMENT = `${storagePrefix}_department_id`;
  const LS_VIEW_SCOPE = `${storagePrefix}_view_scope`;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = ['admin', 'manager', 'sales_admin'].includes(user?.role);
  const uid = String(user?.id || '');
  const canManageTask = useCallback((t) => isAssignmentCreator(t, uid), [uid]);
  const canMoveTask = useCallback((t) => canMoveAssignment(t, uid), [uid]);

  const [pageTab, setPageTab] = useState(() => (
    String(searchParams.get('pageTab') || '').toLowerCase() === 'private' ? 'private' : 'assignments'
  ));
  const [view, setView] = useState('kanban');
  const [columns, setColumns] = useState([]);
  const [items, setItems] = useState([]);
  const [serverStats, setServerStats] = useState(null);
  const [privateGroups, setPrivateGroups] = useState([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateTaskCount, setPrivateTaskCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Chặn phản hồi lỗi thời: đổi liên tiếp 2 bộ lọc nhanh (vd Trạng thái rồi Mức ưu tiên)
  // bắn 2 lượt load() chồng nhau; không có gì đảm bảo request GỬI SAU sẽ VỀ SAU. Nếu
  // request cũ hơn về muộn hơn, nó ghi đè items/serverStats bằng dữ liệu sai — bộ lọc
  // trên UI hiện đúng lựa chọn mới nhưng board hiện dữ liệu của lựa chọn cũ hơn. Đo được
  // trực tiếp: chọn "Đã làm"+"Gấp" phải ra 17 việc, nhưng board giữ 27 (kết quả của lượt
  // chỉ lọc "Gấp" trước đó).
  const loadSeqRef = useRef(0);

  const [search, setSearch] = useState('');
  const [privateSearch, setPrivateSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    try { return localStorage.getItem(LS_COMPANY) || ''; } catch { return ''; }
  });
  const [filterDepartmentId, setFilterDepartmentId] = useState(() => {
    try { return localStorage.getItem(LS_DEPARTMENT) || ''; } catch { return ''; }
  });

  const [editingItem, setEditingItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  /** true = tạo từ tab Không gian chung — bắt buộc gắn deal */
  const [createForSharedWorkspace, setCreateForSharedWorkspace] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [showColumnModal, setShowColumnModal] = useState(null); // null | { id?, name, color, is_done_column }
  const [showPersonalColumnModal, setShowPersonalColumnModal] = useState(null); // null | { view, column? }
  const [viewScope, setViewScope] = useState(() => {
    try { return localStorage.getItem(LS_VIEW_SCOPE) || 'personal'; } catch { return 'personal'; }
  });
  const [showCompletedOpen, setShowCompletedOpen] = useState(false);
  const [personalPlannerCols, setPersonalPlannerCols] = useState([]);
  const [personalDeadlineCols, setPersonalDeadlineCols] = useState([]);
  const [personalPlannerMap, setPersonalPlannerMap] = useState({});
  const [personalDeadlineMap, setPersonalDeadlineMap] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [showSchedulesPanel, setShowSchedulesPanel] = useState(false);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [kpiPanelOpen, setKpiPanelOpen] = useState(defaultKpiPanelOpen);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestDismissed, setSearchSuggestDismissed] = useState(false);
  const [dealSuggestResults, setDealSuggestResults] = useState([]);
  const [dealSuggestLoading, setDealSuggestLoading] = useState(false);
  const filterPanelRef = useRef(null);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setSearchSuggestDismissed(false);
  }, [search]);

  useEffect(() => {
    const q = search.trim();
    if (pageTab !== 'assignments' || q.length < 2 || searchSuggestDismissed) {
      setDealSuggestResults([]);
      setDealSuggestLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDealSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set('type', 'deal');
        params.set('q', q);
        params.set('limit', '10');
        if (isAdmin && filterCompanyId) params.set('company_id', filterCompanyId);
        const { data } = await api.get(`/crm/leads/picker?${params.toString()}`);
        if (!cancelled) setDealSuggestResults(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!cancelled) setDealSuggestResults([]);
      } finally {
        if (!cancelled) setDealSuggestLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, pageTab, searchSuggestDismissed, isAdmin, filterCompanyId]);

  useEffect(() => {
    if (!showAdvFilter) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowAdvFilter(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvFilter]);

  // NV thường: chỉ xem việc giao cho mình
  useEffect(() => {
    if (!uid || isAdmin) return;
    setFilterAssignee(uid);
  }, [isAdmin, uid]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_COMPANY);
    } catch { /* ignore */ }
  }, [filterCompanyId, isAdmin, LS_COMPANY]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterDepartmentId) localStorage.setItem(LS_DEPARTMENT, filterDepartmentId);
      else localStorage.removeItem(LS_DEPARTMENT);
    } catch { /* ignore */ }
  }, [filterDepartmentId, isAdmin, LS_DEPARTMENT]);

  useEffect(() => {
    if (!isAdmin) {
      setDepartments([]);
      if (user?.id) {
        setUsers([{
          id: user.id,
          full_name: user.full_name || user.email || 'Tôi',
          email: user.email,
        }]);
      } else {
        setUsers([]);
      }
      return undefined;
    }
    // Admin đang xem "Tất cả công ty" (filterCompanyId rỗng) → KHÔNG gửi company_id, để
    // /users và /departments trả về danh sách TOÀN HỆ THỐNG (đã xác nhận backend hỗ trợ sẵn:
    // gọi không kèm company_id trả đủ 103 nhân viên / 19 nhóm). Trước đây nhánh này ép rỗng
    // ngay khi chưa chọn công ty cụ thể, khiến ô "Chọn nhân viên"/"Chọn nhóm" LUÔN chỉ có
    // "Tất cả" — không phải lúc có lúc không, mà hoàn toàn vô dụng với mọi admin hệ thống
    // (mặc định vào trang là xem tất cả công ty).
    let cancelled = false;
    const scopeParams = filterCompanyId ? { company_id: filterCompanyId } : {};
    Promise.all([
      api.get('/departments', { params: scopeParams }),
      api.get('/users', { params: scopeParams }),
    ])
      .then(([dRes, uRes]) => {
        if (cancelled) return;
        const depts = dRes.data?.departments || dRes.data || [];
        setDepartments(Array.isArray(depts) ? depts : []);
        setUsers(uRes.data?.users || uRes.data || []);
      })
      .catch(() => {
        if (!cancelled) {
          setDepartments([]);
          setUsers([]);
        }
      });
    return () => { cancelled = true; };
  }, [isAdmin, filterCompanyId, user?.id, user?.full_name, user?.email]);

  useEffect(() => {
    if (!isAdmin) return;
    setFilterDepartmentId('');
  }, [filterCompanyId, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !filterDepartmentId) return;
    const exists = departments.some((d) => String(d.id) === String(filterDepartmentId));
    if (!exists && departments.length) setFilterDepartmentId('');
  }, [departments, filterDepartmentId, isAdmin]);

  const filteredAssigneeOptions = useMemo(() => {
    if (!isAdmin) {
      return user?.id ? [{
        id: user.id,
        full_name: user.full_name || user.email || 'Tôi',
      }] : [];
    }
    if (filterDepartmentId) {
      return users.filter((u) => String(u.department_id || '') === String(filterDepartmentId));
    }
    return users;
  }, [isAdmin, users, filterDepartmentId, user?.id, user?.full_name, user?.email]);

  // Kiểm tra hợp lệ theo `users` (danh sách ĐẦY ĐỦ, không lọc theo nhóm) — CHỨ KHÔNG phải
  // `filteredAssigneeOptions` (đã thu hẹp theo `filterDepartmentId`). "Chọn nhân viên" ở
  // Bộ lọc nhanh liệt kê TOÀN BỘ `users`, không lọc theo nhóm; `filteredAssigneeOptions` chỉ
  // dùng cho select trong panel Bộ lọc nâng cao. Trước đây dùng nhầm danh sách đã thu hẹp:
  // hễ có nhóm đang được lọc (kể cả set từ trước, phục hồi qua localStorage) mà nhân viên
  // vừa chọn ở Bộ lọc nhanh không thuộc nhóm đó, effect này lập tức xoá lựa chọn về "Tất cả"
  // ngay sau khi chọn — người dùng thấy như "chọn không được".
  useEffect(() => {
    if (!isAdmin || !filterAssignee) return;
    const ok = users.some((u) => String(u.id) === String(filterAssignee));
    if (!ok) setFilterAssignee('');
  }, [users, filterAssignee, isAdmin]);

  useEffect(() => {
    if (!uid) return;
    setPersonalPlannerCols(loadPersonalColumns(uid, 'planner'));
    setPersonalDeadlineCols(loadPersonalColumns(uid, 'deadline'));
    setPersonalPlannerMap(loadPersonalTaskMap(uid, 'planner'));
    setPersonalDeadlineMap(loadPersonalTaskMap(uid, 'deadline'));
  }, [uid]);

  useEffect(() => {
    try { localStorage.setItem(LS_VIEW_SCOPE, viewScope); } catch { /* ignore */ }
  }, [viewScope]);

  // ─── Load companies (admin) ──
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: companiesModule } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [isAdmin, companiesModule]);

  // ─── Load all data ──
  const load = useCallback(async ({ soft = false } = {}) => {
    // Lượt gọi CỦA CHÍNH LẦN NÀY — nếu khi response về mà loadSeqRef đã nhảy sang số khác
    // (một lượt load() mới hơn đã bắt đầu), nghĩa là lượt này đã lỗi thời: bỏ qua toàn bộ
    // kết quả, không ghi đè state. Không có guard này thì 2 lượt load() chồng nhau (đổi
    // liên tiếp 2 ô lọc nhanh) ai VỀ SAU thắng — kể cả khi đó là request GỬI TRƯỚC.
    const mySeq = ++loadSeqRef.current;
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const params = {};
      if (isAdmin && filterCompanyId) params.company_id = filterCompanyId;
      if (isAdmin && filterDepartmentId) params.department_id = filterDepartmentId;
      if (filterAssignee) params.assignee_id = filterAssignee;
      else if (!isAdmin && uid) params.assignee_id = uid;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchDebounced) params.q = searchDebounced;
      if (assignmentModule) params.assignment_module = assignmentModule;

      const [colRes, itRes, schedRes, statsRes] = await Promise.all([
        api.get(`${apiBase}/columns`),
        api.get(apiBase, { params }),
        api.get(`${apiBase}/schedules`, { params: { assignment_module: assignmentModule, ...(isAdmin && filterCompanyId ? { company_id: filterCompanyId } : {}) } }).catch(() => ({ data: { schedules: [] } })),
        api.get(`${apiBase}/stats`, { params }).catch(() => ({ data: null })),
      ]);
      if (mySeq !== loadSeqRef.current) return;
      setColumns(colRes.data?.columns || []);
      const nextItems = itRes.data?.assignments || [];
      setItems(nextItems);
      const s = statsRes?.data;
      setServerStats(s && typeof s.total === 'number' ? {
        total: s.total || 0,
        pending: s.pending || 0,
        inProgress: s.in_progress || 0,
        completed: s.completed || 0,
        overdue: s.overdue || 0,
      } : null);
      setSchedules(schedRes.data?.schedules || []);
      setViewingItem((prev) => {
        if (!prev) return prev;
        const fresh = nextItems.find((t) => String(t.id) === String(prev.id));
        return fresh ? { ...prev, ...fresh } : prev;
      });
    } catch (e) { if (mySeq === loadSeqRef.current) console.error(e); }
    if (mySeq === loadSeqRef.current) {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, filterCompanyId, filterDepartmentId, filterAssignee, filterStatus, filterPriority, searchDebounced, apiBase, assignmentModule, uid]);

  const refreshStats = useCallback(async () => {
    try {
      const params = {};
      if (isAdmin && filterCompanyId) params.company_id = filterCompanyId;
      if (isAdmin && filterDepartmentId) params.department_id = filterDepartmentId;
      if (filterAssignee) params.assignee_id = filterAssignee;
      else if (!isAdmin && uid) params.assignee_id = uid;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchDebounced) params.q = searchDebounced;
      if (assignmentModule) params.assignment_module = assignmentModule;
      const { data: s } = await api.get(`${apiBase}/stats`, { params });
      if (s && typeof s.total === 'number') {
        setServerStats({
          total: s.total || 0,
          pending: s.pending || 0,
          inProgress: s.in_progress || 0,
          completed: s.completed || 0,
          overdue: s.overdue || 0,
        });
      }
    } catch { /* giữ KPI cũ */ }
  }, [isAdmin, filterCompanyId, filterDepartmentId, filterAssignee, filterStatus, filterPriority, searchDebounced, apiBase, assignmentModule, uid]);

  useEffect(() => { void load({ soft: true }); }, [load]);

  const loadPrivateTasks = useCallback(async () => {
    setPrivateLoading(true);
    try {
      const { data } = await api.get(`${apiBase}/private-deal-tasks`, {
        params: { assignment_module: assignmentModule },
      });
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setPrivateGroups(groups);
      setPrivateTaskCount(
        Array.isArray(data?.tasks)
          ? data.tasks.length
          : groups.reduce((n, g) => n + (g.tasks?.length || 0), 0),
      );
    } catch (e) {
      console.error(e);
      setPrivateGroups([]);
      setPrivateTaskCount(0);
    }
    setPrivateLoading(false);
  }, [apiBase, assignmentModule]);

  useEffect(() => {
    // Prefetch badge + sẵn dữ liệu tab Không gian chung (CRM / SX / VC)
    void loadPrivateTasks();
  }, [loadPrivateTasks]);

  const setPageTabAndUrl = useCallback((tab) => {
    const next = tab === 'private' ? 'private' : 'assignments';
    setPageTab(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'private') p.set('pageTab', 'private');
      else p.delete('pageTab');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const onSetTab = (e) => {
      const tab = e?.detail?.tab === 'private' ? 'private' : 'assignments';
      setPageTabAndUrl(tab);
    };
    const onSetView = (e) => {
      const v = String(e?.detail?.view || '');
      if (v) setView(v);
    };
    window.addEventListener('product-tour:set-assign-tab', onSetTab);
    window.addEventListener('product-tour:set-assign-view', onSetView);
    return () => {
      window.removeEventListener('product-tour:set-assign-tab', onSetTab);
      window.removeEventListener('product-tour:set-assign-view', onSetView);
    };
  }, [setPageTabAndUrl]);

  useEffect(() => {
    const raw = String(searchParams.get('pageTab') || '').toLowerCase();
    // pageTab=shared cũ → về Giao việc
    const t = raw === 'private' ? 'private' : 'assignments';
    setPageTab((prev) => (prev === t ? prev : t));
  }, [searchParams]);

  // Mở chi tiết từ thông báo / liên kết (?open=id)
  const openHandledRef = useRef(null);
  const pendingOpenId = searchParams.get('open');

  useEffect(() => {
    if (!pendingOpenId) openHandledRef.current = null;
  }, [pendingOpenId]);

  useEffect(() => {
    if (!pendingOpenId) return;
    if (openHandledRef.current === pendingOpenId) return;

    let cancelled = false;
    (async () => {
      try {
        let assignment = items.find((t) => String(t.id) === String(pendingOpenId));
        if (!assignment) {
          const { data } = await api.get(`${apiBase}/${pendingOpenId}`);
          assignment = data?.assignment;
        }
        if (cancelled || !assignment) {
          if (!cancelled && !assignment) alert('Không tìm thấy nhiệm vụ này.');
          return;
        }

        openHandledRef.current = pendingOpenId;
        setView('kanban');
        setViewingItem(assignment);
        setItems((prev) => (
          prev.some((t) => String(t.id) === String(assignment.id)) ? prev : [assignment, ...prev]
        ));

        if (isAdmin && assignment.company_id) {
          setFilterCompanyId(String(assignment.company_id));
        }

        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
      } catch (e) {
        if (!cancelled) alert(e.response?.data?.error || e.message || 'Không mở được nhiệm vụ');
      }
    })();

    return () => { cancelled = true; };
  }, [pendingOpenId, items, isAdmin, searchParams, setSearchParams]);

  // ─── Stats: ưu tiên aggregate server (không bị cắt 1000), fallback đếm từ list ──
  const stats = useMemo(() => {
    if (serverStats) return serverStats;
    return computeTaskStats(items);
  }, [serverStats, items]);

  // Dòng phụ dưới mỗi thẻ KPI — tính từ chính danh sách việc đang tải (created_at /
  // completed_at), không có số liệu nào được bịa ra.
  const kpiSubs = useMemo(() => computeAssignKpiSubs(items, stats), [items, stats]);

  const itemsByStatus = useMemo(() => groupTasksByStatus(items), [items]);

  // ─── Group items by column (kanban) ──
  const itemsByColumn = useMemo(() => {
    const map = new Map();
    columns.forEach((c) => map.set(c.id, []));
    map.set('__none__', []);
    items.forEach((t) => {
      const key = t.column_id ? t.column_id : '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    map.forEach((arr) => arr.sort((a, b) => (a.position - b.position) || (a.id - b.id)));
    return map;
  }, [columns, items]);

  const openItems = useMemo(() => {
    let list = items;
    if (!showCompletedOpen) list = list.filter((t) => t.status !== 'completed');
    if (viewScope === 'personal' && uid && (view === 'planner' || view === 'deadline')) {
      list = list.filter((t) => isAssignmentAssignee(t, uid) || isAssignmentCreator(t, uid));
    }
    return list;
  }, [items, showCompletedOpen, viewScope, uid, view]);

  // ─── Planner: group by assignee ──
  const plannerGroups = useMemo(() => {
    const map = new Map();
    const unassigned = [];
    const personalBuckets = new Map();
    personalPlannerCols.forEach((c) => personalBuckets.set(c.id, []));

    openItems.forEach((t) => {
      const pinnedCol = personalPlannerMap[String(t.id)];
      if (pinnedCol && personalBuckets.has(pinnedCol)) {
        personalBuckets.get(pinnedCol).push(t);
        return;
      }
      const list = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
      if (!list.length) { unassigned.push(t); return; }
      list.forEach((u) => {
        if (!map.has(u.id)) map.set(u.id, { user: u, tasks: [] });
        map.get(u.id).tasks.push(t);
      });
    });
    return {
      assignees: [...map.values()],
      unassigned,
      personal: personalPlannerCols.map((c) => ({ column: c, tasks: personalBuckets.get(c.id) || [] })),
    };
  }, [openItems, personalPlannerCols, personalPlannerMap]);

  // ─── Deadline groups ──
  const deadlineGroups = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const g = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    const personalBuckets = new Map();
    personalDeadlineCols.forEach((c) => personalBuckets.set(c.id, []));

    openItems.forEach((t) => {
      const pinnedCol = personalDeadlineMap[String(t.id)];
      if (pinnedCol && personalBuckets.has(pinnedCol)) {
        personalBuckets.get(pinnedCol).push(t);
        return;
      }
      if (!t.deadline) { g.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) g.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) g.today.push(t);
      else if (d < weekEnd) g.thisWeek.push(t);
      else g.later.push(t);
    });
    return {
      ...g,
      personal: personalDeadlineCols.map((c) => ({ column: c, tasks: personalBuckets.get(c.id) || [] })),
    };
  }, [openItems, personalDeadlineCols, personalDeadlineMap]);

  // ─── Mutations ──
  const uploadStagedFiles = async (targetBase, targetId, stagedFiles) => {
    if (!targetId || !stagedFiles.length) return;
    for (const item of stagedFiles) {
      try {
        if (item?._stagedUrl) {
          await api.post(`${targetBase}/${targetId}/files/link`, {
            url: item.url,
            file_name: item.name,
            kind: 'req',
          });
        } else {
          const fd = new FormData();
          fd.append('file', item);
          fd.append('kind', 'req');
          await api.post(`${targetBase}/${targetId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } catch (upErr) {
        console.warn('Upload error:', upErr.response?.data?.error || upErr.message);
      }
    }
  };

  const upsertItem = async (payload, stagedFiles = []) => {
    try {
      let assignmentId = payload.id;
      let saved = null;
      if (payload.id) {
        const r = await api.put(`${apiBase}/${payload.id}`, payload);
        saved = r.data?.assignment || null;
      } else {
        const r = await api.post(apiBase, { ...payload, assignment_module: assignmentModule });
        assignmentId = r.data?.assignment?.id || r.data?.id;
        saved = r.data?.assignment || null;
        const scheduleId = r.data?.schedule?.id;
        if (scheduleId && stagedFiles.length && !assignmentId) {
          await uploadStagedFiles(`${apiBase}/schedules`, scheduleId, stagedFiles);
        }
        if (r.data?.schedule && !r.data?.spawned) {
          alert(`Đã lên lịch giao việc — chạy lúc ${new Date(r.data.schedule.next_run_at).toLocaleString('vi-VN')}`);
        }
      }
      if (assignmentId && stagedFiles.length) {
        await uploadStagedFiles(apiBase, assignmentId, stagedFiles);
      }
      if (saved) {
        setItems((prev) => {
          const id = String(saved.id);
          const idx = prev.findIndex((t) => String(t.id) === id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...saved };
            return next;
          }
          return [saved, ...prev];
        });
        setViewingItem((prev) => (prev && String(prev.id) === String(saved.id) ? { ...prev, ...saved } : prev));
      }
      setShowItemModal(false); setEditingItem(null); setCreateForSharedWorkspace(false);
      void load({ soft: true });
      if (payload.lead_id || createForSharedWorkspace) {
        void loadPrivateTasks();
      }
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu nhiệm vụ'); }
  };

  const cancelSchedule = async (scheduleId) => {
    if (!confirm('Huỷ lịch giao việc này?')) return;
    try {
      await api.delete(`${apiBase}/schedules/${scheduleId}`);
      void load({ soft: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Không huỷ được lịch');
    }
  };
  const removeItem = async (id) => {
    if (!confirm('Xoá nhiệm vụ này?')) return;
    try {
      await api.delete(`${apiBase}/${id}`);
      setViewingItem((prev) => (prev && String(prev.id) === String(id) ? null : prev));
      void load({ soft: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không xóa được nhiệm vụ');
    }
  };
  const updateItem = async (id, patch) => {
    const task = items.find((t) => String(t.id) === String(id));
    const progressKeys = new Set(['status', 'column_id', 'position']);
    const progressOnly = patch && Object.keys(patch).every((k) => progressKeys.has(k));
    if (progressOnly && task && !canMoveTask(task)) {
      alert('Chỉ người tạo hoặc người được giao mới được cập nhật tiến độ công việc này.');
      return;
    }
    try {
      const { data } = await api.put(`${apiBase}/${id}`, patch);
      const updated = data?.assignment;
      if (updated) {
        setItems((prev) => prev.map((t) => (String(t.id) === String(id) ? { ...t, ...updated } : t)));
        setViewingItem((prev) => (prev && String(prev.id) === String(id) ? { ...prev, ...updated } : prev));
        if (patch?.status != null) void refreshStats();
      } else {
        void load({ soft: true });
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không cập nhật được nhiệm vụ');
    }
  };
  const moveItem = async (id, column_id, position) => {
    const task = items.find((t) => String(t.id) === String(id));
    if (task && !canMoveTask(task)) {
      alert('Chỉ người tạo hoặc người được giao mới được di chuyển công việc này.');
      return;
    }
    try {
      const { data } = await api.post(`${apiBase}/${id}/move`, { column_id, position });
      const updated = data?.assignment;
      if (updated) {
        setItems((prev) => prev.map((t) => (String(t.id) === String(id) ? { ...t, ...updated } : t)));
        setViewingItem((prev) => (prev && String(prev.id) === String(id) ? { ...prev, ...updated } : prev));
        void refreshStats();
      } else {
        void load({ soft: true });
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không di chuyển được nhiệm vụ');
    }
  };

  const upsertColumn = async (payload) => {
    try {
      const { company_id: _drop, ...body } = payload;
      if (payload.id) await api.put(`${apiBase}/columns/${payload.id}`, body);
      else await api.post(`${apiBase}/columns`, body);
      setShowColumnModal(null);
      void load({ soft: true });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu cột'); }
  };
  const removeColumn = async (id) => {
    if (!confirm('Xoá cột này? Các nhiệm vụ sẽ về cột "Chưa phân loại".')) return;
    try { await api.delete(`${apiBase}/columns/${id}`); void load({ soft: true }); } catch {}
  };

  const upsertPersonalColumn = (payload) => {
    const targetView = payload.view || showPersonalColumnModal?.view || view;
    if (!uid || !targetView) return;
    const setter = targetView === 'planner' ? setPersonalPlannerCols : setPersonalDeadlineCols;
    const current = targetView === 'planner' ? personalPlannerCols : personalDeadlineCols;
    const next = payload.id
      ? current.map((c) => (c.id === payload.id ? { ...c, name: payload.name.trim(), color: payload.color } : c))
      : [...current, { id: newPersonalColumnId(), name: payload.name.trim(), color: payload.color, position: current.length }];
    setter(next);
    savePersonalColumns(uid, targetView, next);
    setShowPersonalColumnModal(null);
  };

  const removePersonalColumn = (targetView, colId) => {
    if (!uid || !confirm('Xoá cột cá nhân này? Việc trong cột sẽ quay về nhóm mặc định.')) return;
    const cols = targetView === 'planner' ? personalPlannerCols : personalDeadlineCols;
    const map = targetView === 'planner' ? personalPlannerMap : personalDeadlineMap;
    const nextCols = cols.filter((c) => c.id !== colId);
    const nextMap = { ...map };
    Object.keys(nextMap).forEach((k) => { if (nextMap[k] === colId) delete nextMap[k]; });
    if (targetView === 'planner') {
      setPersonalPlannerCols(nextCols);
      setPersonalPlannerMap(nextMap);
    } else {
      setPersonalDeadlineCols(nextCols);
      setPersonalDeadlineMap(nextMap);
    }
    savePersonalColumns(uid, targetView, nextCols);
    savePersonalTaskMap(uid, targetView, nextMap);
  };

  const pinTaskToPersonalColumn = (targetView, taskId, colId) => {
    if (!uid) return;
    const nextMap = setTaskPersonalColumn(uid, targetView, taskId, colId);
    if (targetView === 'planner') setPersonalPlannerMap(nextMap);
    else setPersonalDeadlineMap(nextMap);
  };

  // ─── DnD ──
  const [dragId, setDragId] = useState(null);
  const onDragStart = (id) => () => setDragId(id);
  const onDropCol = (colId) => (e) => {
    e.preventDefault();
    if (!dragId) return;
    const list = itemsByColumn.get(colId) || [];
    void moveItem(dragId, colId === '__none__' ? null : colId, list.length);
    setDragId(null);
  };
  const allowDrop = (e) => e.preventDefault();

  const hasSelectFilters = !!(filterPriority || filterStatus
    || (isAdmin && (filterCompanyId || filterDepartmentId || filterAssignee)));
  const hasFilters = !!(search || hasSelectFilters);
  const activeFilterCount = [
    filterStatus,
    filterPriority,
    isAdmin ? filterCompanyId : '',
    isAdmin ? filterDepartmentId : '',
    isAdmin ? filterAssignee : '',
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearch(''); setFilterPriority(''); setFilterStatus('');
    if (isAdmin) {
      setFilterCompanyId('');
      setFilterDepartmentId('');
      setFilterAssignee('');
    } else if (uid) {
      setFilterAssignee(uid);
    }
  };

  const theme = useMemo(() => getAssignmentTheme(assignmentModule), [assignmentModule]);
  const filterFieldCls = `h-8 w-full min-w-0 px-2.5 bg-white border rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow disabled:opacity-50 ${theme.filterField}`;
  const filterSelectCls = `${filterFieldCls} cursor-pointer appearance-none pr-7`;
  const filterLabelCls = `text-[10px] font-semibold uppercase tracking-wide mb-1 block ${theme.filterLabel}`;
  const displayTitle = theme.shortTitle || String(pageTitle || '').replace(/^[^\wÀ-ỹ]+/, '').trim() || 'Giao việc';
  const spinBorder = theme.mod === 'logistics' ? 'border-orange-600' : theme.mod === 'production' ? 'border-indigo-600' : 'border-violet-600';
  const searchBoxCls = searchFocused
    ? theme.searchFocus
    : (search.trim() || hasSelectFilters)
      ? theme.searchActive
      : theme.searchIdle;

  const assignTaskCountByLead = useMemo(() => {
    const map = new Map();
    items.forEach((t) => {
      const id = t.lead?.id || t.lead_id;
      if (!id) return;
      const key = String(id);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [items]);

  const dealSuggestItems = useMemo(() => dealSuggestResults.slice(0, 10), [dealSuggestResults]);
  const dealSuggestOpen = pageTab === 'assignments'
    && search.trim().length >= 2
    && !searchSuggestDismissed
    && (dealSuggestLoading || dealSuggestItems.length > 0);

  const selectDealSuggest = useCallback((deal) => {
    const nextQ = String(deal?.code || deal?.title || '').trim();
    if (nextQ) setSearch(nextQ);
    setSearchSuggestDismissed(true);
    setSearchFocused(false);
    searchInputRef.current?.blur();
    const match = items.find((t) => String(t.lead?.id || t.lead_id) === String(deal?.id));
    if (match) setViewingItem(match);
  }, [items]);

  const openDealSuggestDetail = useCallback((dealId) => {
    setSearchSuggestDismissed(true);
    setSearchFocused(false);
    navigate(`/crm/leads/${dealId}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`animate-spin h-8 w-8 border-3 border-t-transparent rounded-full ${spinBorder}`} />
      </div>
    );
  }

  return (
    <AssignmentsPageContext.Provider value={{ apiBase, assignmentModule, theme }}>
    <div className="space-y-3">
      {/* Panel điều khiển — đồng bộ dashboard CRM / SX / VC */}
      <div className={`ui-solid-white rounded-2xl border border-slate-200/90 bg-white shadow-md overflow-hidden ${theme.panelRing}`}>
        <div className={`border-b border-slate-200/80 bg-gradient-to-r ${theme.headerGrad}`} data-tour="assign-page-header">
          <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {dashboardLink ? (
                <Link
                  to={dashboardLink}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm shrink-0"
                  title="Về dashboard"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 leading-tight truncate">{displayTitle}</h1>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {pageTab === 'assignments'
                    ? `${stats.total} việc · ${stats.pending} chưa · ${stats.inProgress} đang · ${stats.completed} xong`
                    : `${privateTaskCount} nhiệm vụ deal · ${privateGroups.length} deal`}
                </p>
              </div>
              <SegmentedControl
                value={pageTab}
                onChange={setPageTabAndUrl}
                activeText={theme.activeText}
                options={[
                  { id: 'assignments', label: 'Giao việc', dataTour: 'assign-tab-assignments' },
                  { id: 'private', label: 'Không gian chung', badge: privateTaskCount, dataTour: 'assign-tab-private' },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                type="button"
                data-tour="assign-tour-btn"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('product-tour:start', {
                    detail: { id: 'crm-assignments-page', preferCurrentPath: true },
                  }));
                }}
                className="h-8 w-8 shrink-0 border border-sky-200 text-sky-600 hover:bg-sky-50 hover:border-sky-300 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                title="Hướng dẫn Giao việc"
                aria-label="Hướng dẫn Giao việc"
              >
                <BookOpen className="h-3.5 w-3.5" />
              </button>
              {pageTab === 'assignments' && (
                <>
                  <button
                    type="button"
                    data-tour="assign-create-btn"
                    onClick={() => {
                      setEditingItem(null);
                      setCreateForSharedWorkspace(false);
                      setShowItemModal(true);
                    }}
                    className={`h-8 px-3 rounded-md text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm flex-1 sm:flex-none ${theme.cta}`}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />Giao việc
                  </button>
                  <button
                    type="button"
                    data-tour="assign-create-shared-btn"
                    onClick={() => {
                      setEditingItem(null);
                      setCreateForSharedWorkspace(true);
                      setShowItemModal(true);
                    }}
                    className="h-8 px-3 rounded-md bg-white border border-teal-200 text-teal-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-teal-50 shadow-sm flex-1 sm:flex-none"
                    title="Tạo giao việc gắn deal — hiện ở Không gian chung"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />KG chung
                  </button>
                  {schedules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSchedulesPanel((v) => !v)}
                      className="h-8 px-2.5 rounded-md bg-white border border-violet-200 text-violet-800 text-xs font-medium inline-flex items-center gap-1 cursor-pointer hover:bg-violet-50"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      Lịch ({schedules.length})
                      <ChevronDown className={`h-3.5 w-3.5 transition ${showSchedulesPanel ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </>
              )}
              {pageTab === 'private' && (
                <>
                  <button
                    type="button"
                    data-tour="assign-create-shared-btn"
                    onClick={() => {
                      setEditingItem(null);
                      setCreateForSharedWorkspace(true);
                      setShowItemModal(true);
                    }}
                    className={`h-8 px-3 rounded-md text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm ${theme.cta}`}
                    title="Tạo giao việc gắn deal — hiện ở Không gian chung"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />Giao việc KG chung
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadPrivateTasks()}
                    className="h-8 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 shadow-sm"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />Làm mới
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {pageTab === 'assignments' && (
          <>
            {/* Hàng tìm kiếm + chế độ xem — giống dashboard CRM */}
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 sm:px-3 border-b border-slate-200/50" data-tour="assign-toolbar">
              <div
                ref={searchBoxRef}
                data-tour="assign-search"
                className={`group/search flex items-center shrink-0 flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${searchBoxCls}`}
              >
                <div className="relative flex-1 min-w-0 flex items-center pl-7 pr-1">
                  <Search
                    className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
                      searchFocused || search.trim() ? theme.searchIcon : theme.searchIconIdle
                    }`}
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSearchSuggestDismissed(false);
                      setSearchFocused(true);
                    }}
                    onFocus={() => {
                      setSearchFocused(true);
                      setSearchSuggestDismissed(false);
                    }}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                    placeholder={assignmentModule === 'production'
                      ? 'Tìm mã TB, deal, tên khách, SĐT…'
                      : assignmentModule === 'logistics'
                        ? 'Tìm mã TB, deal, nhiệm vụ VC…'
                        : 'Tìm nhiệm vụ, mã deal, tên khách, SĐT…'}
                    className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${search ? 'pr-7' : ''}`}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setSearchSuggestDismissed(false);
                        setDealSuggestResults([]);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="Xóa tìm kiếm"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {refreshing && (
                    <span className={`absolute right-7 top-1/2 -translate-y-1/2 h-3 w-3 border-2 border-t-transparent rounded-full animate-spin ${spinBorder}`} />
                  )}
                </div>
                <AnchoredDropdownMenu
                  open={dealSuggestOpen}
                  onClose={() => setSearchSuggestDismissed(true)}
                  anchorRef={searchBoxRef}
                  align="left"
                  matchAnchorWidth
                  className={`rounded-xl p-0 overflow-hidden max-h-80 overflow-y-auto [scrollbar-width:thin] animate-fade-in ${theme.suggestShell}`}
                >
                  <div className={`px-3 py-2 border-b ${theme.suggestHeader}`}>
                    <p className={`text-[11px] font-semibold ${theme.suggestHeaderText}`}>
                      {dealSuggestLoading ? (
                        <>Đang tìm deal…</>
                      ) : (
                        <>
                          <span className={`font-bold ${theme.suggestCount}`}>{dealSuggestResults.length}</span>
                          {' '}deal cho &ldquo;{search.trim()}&rdquo;
                          <span className={`block text-[10px] font-normal mt-0.5 ${theme.suggestHeaderMuted}`}>
                            Chọn dòng để lọc nhiệm vụ · biểu tượng mắt để mở deal
                            {dealSuggestResults.length > 10 ? ' · Hiển thị 10 kết quả đầu' : ''}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {dealSuggestItems.map((deal) => {
                    const taskCount = assignTaskCountByLead.get(String(deal.id)) || 0;
                    return (
                      <div
                        key={deal.id}
                        className="flex items-stretch border-b border-slate-50 last:border-0 group/item"
                      >
                        <button
                          type="button"
                          className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer text-left ${theme.suggestHover}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectDealSuggest(deal)}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-mono font-semibold transition-colors ${theme.suggestCodeBg}`}>
                            {(deal.code || '?').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-400">{deal.code}</span>
                              <p className="text-sm font-medium text-slate-900 truncate">{deal.title || 'Deal'}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {deal.customer_phone ? (
                                <span className="text-[10px] text-emerald-600">{deal.customer_phone}</span>
                              ) : null}
                              {deal.customer_name ? (
                                <span className="text-[10px] text-slate-500 truncate max-w-[8rem]">{deal.customer_name}</span>
                              ) : null}
                              {deal.assignee_name ? (
                                <span className={`text-[10px] truncate max-w-[8rem] ${theme.suggestMeta}`}>{deal.assignee_name}</span>
                              ) : null}
                              {taskCount > 0 ? (
                                <span className="text-[10px] text-slate-500">{taskCount} nhiệm vụ</span>
                              ) : null}
                            </div>
                          </div>
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${theme.suggestChevron}`} />
                        </button>
                        <button
                          type="button"
                          title="Mở chi tiết deal"
                          aria-label={`Mở chi tiết ${deal.code || deal.title || deal.id}`}
                          className={`shrink-0 flex items-center justify-center px-2.5 border-l border-slate-100 text-slate-400 transition-colors cursor-pointer ${theme.suggestEye}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openDealSuggestDetail(deal.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {!dealSuggestLoading && dealSuggestItems.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-slate-500 text-center">Không tìm thấy deal phù hợp</p>
                  ) : null}
                </AnchoredDropdownMenu>
                <div className="shrink-0 pr-1">
                  <button
                    type="button"
                    data-tour="assign-filter"
                    onClick={() => setShowAdvFilter((v) => !v)}
                    aria-expanded={showAdvFilter}
                    className={`relative h-6 w-6 flex items-center justify-center rounded border transition-colors cursor-pointer ${
                      showAdvFilter || hasSelectFilters
                        ? theme.filterActiveBtn
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                    title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc'}
                    aria-label="Bộ lọc"
                  >
                    <Filter className="h-3 w-3" />
                    {activeFilterCount > 0 && (
                      <span className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-white ${theme.filterDot}`} />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80">
                <AssignViewModeSwitcher view={view} onChange={setView} theme={theme} />
              </div>
            </div>

            {/* KPI thu gọn / mở rộng — giống dashboard */}
            <button
              type="button"
              data-tour="assign-kpis"
              onClick={() => setKpiPanelOpen((v) => !v)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 sm:px-4 text-left border-b ${theme.kpiToggle} bg-white/40 hover:bg-slate-50/80 cursor-pointer transition-colors`}
            >
              <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                KPI
                {/* Ẩn tên trang khi đang thu gọn ở màn hẹp — nhường chỗ cho dòng số liệu */}
                <span className={`ml-1 font-medium ${theme.activeText} ${kpiPanelOpen ? '' : 'hidden sm:inline'}`}>· {displayTitle}</span>
              </span>
              {!kpiPanelOpen && (
                <span className="min-w-0 text-[10px] text-slate-500 tabular-nums truncate">
                  {stats.total} tổng · {stats.pending} chưa · {stats.inProgress} đang · {stats.completed} xong
                  {stats.overdue > 0 ? ` · ${stats.overdue} quá hạn` : ''}
                </span>
              )}
              <span className="shrink-0 ml-auto flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                <span className="hidden sm:inline">{kpiPanelOpen ? 'Thu gọn' : 'Mở rộng'}</span>
                {kpiPanelOpen
                  ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
              </span>
            </button>
            {kpiPanelOpen && (
              <div className={`border-b ${theme.kpiToggle} bg-white/40 px-2 sm:px-3 pb-2 pt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2`}>
                {[
                  { label: 'Tổng', value: stats.total, icon: ListIcon, iconBg: 'bg-violet-100', iconColor: 'text-violet-700', viewId: null, sub: kpiSubs.total },
                  { label: 'Chưa làm', value: stats.pending, icon: Circle, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', viewId: 'status', sub: kpiSubs.pending },
                  { label: 'Đang làm', value: stats.inProgress, icon: Clock, iconBg: 'bg-blue-100', iconColor: 'text-blue-700', viewId: 'status', sub: kpiSubs.inProgress },
                  { label: 'Đã làm', value: stats.completed, icon: CheckCircle2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', viewId: 'status', sub: kpiSubs.completed },
                  { label: 'Quá hạn', value: stats.overdue, icon: AlertTriangle, iconBg: 'bg-red-100', iconColor: 'text-red-700', viewId: 'deadline', sub: kpiSubs.overdue },
                ].map((kpi) => (
                  <AssignKpiCard
                    key={kpi.label}
                    icon={kpi.icon}
                    label={kpi.label}
                    value={kpi.value}
                    iconBg={kpi.iconBg}
                    iconColor={kpi.iconColor}
                    borderCls={theme.kpiBorder}
                    labelCls={theme.kpiLabel}
                    onClick={kpi.viewId ? () => setView(kpi.viewId) : undefined}
                    sub={kpi.sub}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bộ lọc — panel nổi giống CRM dashboard */}
      {showAdvFilter && pageTab === 'assignments' && portalAssignmentsModal(
        <div
          ref={filterPanelRef}
          data-tour="assign-filter-panel"
          className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
          style={{ top: '4.5rem', right: '1rem' }}
          role="region"
          aria-label="Bộ lọc giao việc"
        >
          <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <Filter className={`h-4 w-4 shrink-0 ${theme.filterIcon}`} aria-hidden />
              <p className={`text-sm font-bold tracking-tight flex-1 min-w-0 ${theme.filterTitle}`}>
                Bộ lọc
                {activeFilterCount > 0 ? (
                  <span className={`ml-1.5 text-[11px] font-medium ${theme.activeText}`}>
                    · {activeFilterCount} đang bật
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                data-tour="assign-filter-close"
                onClick={() => setShowAdvFilter(false)}
                className={`h-7 w-7 rounded-md cursor-pointer flex items-center justify-center shrink-0 transition-colors ${theme.filterClose}`}
                aria-label="Thu gọn bộ lọc"
                title="Thu gọn"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
            <div className="py-2.5 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {isAdmin && (
                  <>
                    <div className="min-w-0">
                      <label className={filterLabelCls}>Công ty</label>
                      <select
                        value={filterCompanyId}
                        onChange={(e) => setFilterCompanyId(e.target.value)}
                        className={filterSelectCls}
                      >
                        <option value="">Tất cả công ty</option>
                        {companies.map((co) => (
                          <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className={filterLabelCls}>Phòng ban</label>
                      <select
                        value={filterDepartmentId}
                        onChange={(e) => setFilterDepartmentId(e.target.value)}
                        disabled={!filterCompanyId}
                        className={filterSelectCls}
                        title={filterCompanyId ? 'Lọc theo phòng ban' : 'Chọn công ty trước'}
                      >
                        <option value="">{filterCompanyId ? 'Tất cả phòng ban' : 'Chọn công ty trước'}</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div className="min-w-0 sm:col-span-2">
                  <label className={filterLabelCls}>Nhân viên</label>
                  {isAdmin ? (
                    <select
                      value={filterAssignee}
                      onChange={(e) => setFilterAssignee(e.target.value)}
                      className={filterSelectCls}
                    >
                      <option value="">Tất cả nhân viên</option>
                      {filteredAssigneeOptions.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={`${filterFieldCls} flex items-center bg-slate-50 text-slate-700 cursor-default`}>
                      {user?.full_name || 'Việc của tôi'}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <label className={filterLabelCls}>Trạng thái</label>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={filterSelectCls}>
                    <option value="">Tất cả trạng thái</option>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className={filterLabelCls}>Ưu tiên</label>
                  <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={filterSelectCls}>
                    <option value="">Tất cả ưu tiên</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={clearFilters}
                className={`h-8 px-3 rounded-lg border bg-white text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm ${theme.filterReset}`}
              >
                <RotateCcw className="h-3 w-3" />
                Đặt lại
              </button>
            </div>
          </div>
        </div>,
      )}

      {showSchedulesPanel && schedules.length > 0 && (
        <div className="ui-solid-white rounded-xl border border-violet-200/80 bg-violet-50/40 p-3 space-y-2 shadow-sm">
          <p className="text-xs font-semibold text-violet-900 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> Lịch giao việc đang chờ
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-violet-100 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{s.title}</p>
                  <p className="text-slate-500">
                    {new Date(s.next_run_at).toLocaleString('vi-VN')}
                    {s.recurrence_type && (
                      <span className="ml-1 text-violet-600">
                        · <Repeat2 className="inline h-3 w-3" /> {RECURRENCE_OPTIONS.find((o) => o.value === s.recurrence_type)?.label || s.recurrence_type}
                      </span>
                    )}
                    {' · '}{(s.assignee_ids || []).length} NV
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelSchedule(s.id)}
                  className="shrink-0 text-red-500 hover:text-red-700 cursor-pointer"
                  title="Huỷ lịch"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pageTab === 'private' && (
        <PrivateDealInbox
          groups={privateGroups}
          loading={privateLoading}
          assignmentModule={assignmentModule}
          search={privateSearch}
          onSearchChange={setPrivateSearch}
          theme={theme}
        />
      )}

      {pageTab === 'assignments' && (
      <>
      {/* VIEWS */}
      {view === 'kanban' && (
      <div className="flex flex-col lg:flex-row gap-3 items-start">
        <AssignQuickFilterPanel
          tasks={items}
          users={users}
          theme={theme}
          isAdmin={isAdmin}
          companies={companies}
          filterCompanyId={filterCompanyId}
          setFilterCompanyId={setFilterCompanyId}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
        />
        <div className="min-w-0 flex-1 w-full">
        <KanbanView
          columns={columns}
          itemsByColumn={itemsByColumn}
          users={users}
          onAddColumn={() => setShowColumnModal({ name: '', color: COLUMN_COLORS[0], is_done_column: false, is_in_progress_column: false })}
          onEditColumn={(col) => setShowColumnModal(col)}
          onDeleteColumn={removeColumn}
          onAddCard={(colId) => {
            setEditingItem({ column_id: colId });
            setCreateForSharedWorkspace(false);
            setShowItemModal(true);
          }}
          onOpenCard={(t) => setViewingItem(t)}
          onEditCard={(t) => {
            if (!canManageTask(t)) return;
            setEditingItem(t);
            setCreateForSharedWorkspace(false);
            setShowItemModal(true);
          }}
          onDeleteCard={removeItem}
          onUpdateCard={updateItem}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onDragStart={onDragStart}
          onDropCol={onDropCol}
          allowDrop={allowDrop}
        />
        </div>
      </div>
      )}

      {view === 'status' && (
        <StatusBoardView
          itemsByStatus={itemsByStatus}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
        />
      )}

      {view === 'list' && (
        <ListView
          items={items}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
        />
      )}

      {(view === 'planner' || view === 'deadline') && (
        <PersonalViewToolbar
          view={view}
          viewScope={viewScope}
          onViewScopeChange={setViewScope}
          showCompletedOpen={showCompletedOpen}
          onShowCompletedOpenChange={setShowCompletedOpen}
          onAddColumn={() => setShowPersonalColumnModal({ view, column: null })}
        />
      )}

      {view === 'planner' && (
        <PlannerView
          groups={plannerGroups}
          viewScope={viewScope}
          personalColumns={personalPlannerCols}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onEditPersonalColumn={(col) => setShowPersonalColumnModal({ view: 'planner', column: col })}
          onDeletePersonalColumn={(colId) => removePersonalColumn('planner', colId)}
          onDropPersonalColumn={(taskId, colId) => pinTaskToPersonalColumn('planner', taskId, colId)}
        />
      )}

      {view === 'deadline' && (
        <DeadlineView
          groups={deadlineGroups}
          personalColumns={personalDeadlineCols}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onEditPersonalColumn={(col) => setShowPersonalColumnModal({ view: 'deadline', column: col })}
          onDeletePersonalColumn={(colId) => removePersonalColumn('deadline', colId)}
          onDropPersonalColumn={(taskId, colId) => pinTaskToPersonalColumn('deadline', taskId, colId)}
        />
      )}
      </>
      )}

      {showItemModal && (
        <ItemModal
          item={editingItem}
          users={users}
          columns={columns}
          companies={companies}
          isAdmin={isAdmin}
          defaultCompanyId={isAdmin ? filterCompanyId : (user?.company_id || '')}
          requireLead={createForSharedWorkspace && !editingItem?.id}
          sharedWorkspaceMode={createForSharedWorkspace}
          onClose={() => {
            setShowItemModal(false);
            setEditingItem(null);
            setCreateForSharedWorkspace(false);
          }}
          onSave={upsertItem}
        />
      )}
      {showColumnModal && (
        <ColumnModal
          column={showColumnModal}
          onClose={() => setShowColumnModal(null)}
          onSave={upsertColumn}
        />
      )}
      {showPersonalColumnModal && (
        <PersonalColumnModal
          column={showPersonalColumnModal.column}
          viewLabel={showPersonalColumnModal.view === 'deadline' ? 'Deadline' : 'Planner'}
          onClose={() => setShowPersonalColumnModal(null)}
          onSave={(form) => upsertPersonalColumn({ ...form, view: showPersonalColumnModal.view })}
        />
      )}
      {viewingItem && (
        <DetailModal
          item={viewingItem}
          columns={columns}
          onClose={() => setViewingItem(null)}
          onEdit={(t) => { if (!canManageTask(t)) return; setViewingItem(null); setEditingItem(t); setShowItemModal(true); }}
          onUpdate={updateItem}
          onDelete={(id) => { removeItem(id); setViewingItem(null); }}
        />
      )}
    </div>
    </AssignmentsPageContext.Provider>
  );
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
function KanbanView({
  columns, itemsByColumn, users: _users, onAddColumn, onEditColumn, onDeleteColumn,
  onAddCard, onOpenCard, onEditCard, onDeleteCard, onUpdateCard, onDragStart, onDropCol, allowDrop,
  canManageTask, canMoveTask,
}) {
  const noneList = itemsByColumn.get('__none__') || [];
  // items-start: mặc định flex-row kéo giãn mọi item bằng chiều cao item cao nhất
  // (align-items: stretch). Cột nào có hàng nghìn thẻ sẽ cực kỳ cao, và MỌI cột khác —
  // kể cả ô "Thêm cột mới" (nội dung căn giữa theo chiều dọc) — bị kéo giãn theo, đẩy
  // nội dung của chúng xuống lưng chừng khoảng trắng mênh mông đó. items-start cho mỗi
  // cột cao theo đúng nội dung của chính nó, nằm ngay sát trên cùng như dự kiến.
  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-3" style={{ minHeight: 400 }} data-tour="assign-kanban">
      {columns.map((col) => {
        const list = itemsByColumn.get(col.id) || [];
        return (
          <div
            key={col.id}
            className="w-72 shrink-0 rounded-xl border border-slate-200/90 bg-white flex flex-col shadow-sm"
            onDragOver={allowDrop}
            onDrop={onDropCol(col.id)}
          >
            <div
              className="px-3 py-2 flex items-center gap-2 border-b border-slate-100 rounded-t-xl bg-slate-50/80"
              style={{ borderTopColor: col.color, borderTopWidth: 3 }}
            >
              <GripVertical className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-sm font-semibold flex-1 truncate" style={{ color: col.color }}>
                {col.name}
                {col.is_in_progress_column ? <Clock className="h-3 w-3 inline ml-0.5 text-blue-500" title="Cột đang làm" /> : null}
                {col.is_done_column ? <CheckCircle2 className="h-3 w-3 inline ml-0.5 text-emerald-500" title="Cột hoàn thành" /> : null}
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">{list.length}</span>
              <button onClick={() => onEditColumn(col)} className="text-slate-400 hover:text-violet-600 cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => onDeleteColumn(col.id)} className="text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[80px] bg-white">
              {list.map((t) => (
                <Card key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} onDragStart={onDragStart} onOpen={onOpenCard} onEdit={onEditCard} onDelete={onDeleteCard} onUpdate={onUpdateCard} />
              ))}
              <button
                onClick={() => onAddCard(col.id)}
                className="w-full h-8 rounded-lg text-xs text-slate-500 hover:bg-slate-50 hover:text-violet-700 flex items-center justify-center gap-1 cursor-pointer border border-dashed border-transparent hover:border-slate-200"
              >
                <Plus className="h-3.5 w-3.5" />Thêm việc
              </button>
            </div>
          </div>
        );
      })}

      {noneList.length > 0 && (
        <div className="w-72 shrink-0 bg-slate-50 rounded-xl border border-dashed border-slate-300" onDragOver={allowDrop} onDrop={onDropCol('__none__')}>
          <div className="px-3 py-2 border-b border-slate-200 text-sm font-semibold text-slate-500">
            Chưa phân loại <span className="text-[11px] text-slate-400">{noneList.length}</span>
          </div>
          <div className="p-2 space-y-2">
            {noneList.map((t) => (
              <Card key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} onDragStart={onDragStart} onOpen={onOpenCard} onEdit={onEditCard} onDelete={onDeleteCard} onUpdate={onUpdateCard} />
            ))}
          </div>
        </div>
      )}

      <div
        className="group/newcol w-72 shrink-0 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 hover:border-violet-400 hover:bg-violet-50/40 transition-colors flex flex-col items-center justify-center gap-2 px-4 py-6 text-center"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 group-hover/newcol:bg-violet-100 group-hover/newcol:text-violet-600 transition-colors">
          <LayoutList className="h-6 w-6" />
        </span>
        <span className="text-sm font-semibold text-slate-600">Thêm cột mới</span>
        <span className="text-[11px] leading-snug text-slate-400">
          Kéo thả thẻ để đổi trạng thái công việc
        </span>
        <button
          type="button"
          onClick={onAddColumn}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />Thêm cột
        </button>
      </div>
    </div>
  );
}

function Card({ task, canManage, canMove, onDragStart, onOpen, onEdit, onDelete, onUpdate }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
  return (
    <div
      draggable={!!canMove}
      data-tour="assign-card"
      onDragStart={canMove ? onDragStart(task.id) : undefined}
      onClick={() => onOpen?.(task)}
      className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-sm hover:shadow-md hover:border-violet-200 cursor-pointer group"
      title={canMove ? 'Click xem chi tiết — kéo để chuyển cột' : 'Click xem chi tiết (chỉ người tạo / người được giao mới kéo được)'}
    >
      <div className="flex items-start gap-1.5">
        {canMove ? (
        <div className="mt-0.5 shrink-0 flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onUpdate(task.id, { status: task.status === 'in_progress' ? 'pending' : 'in_progress' })}
            className={`p-0.5 rounded cursor-pointer ${task.status === 'in_progress' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-500'}`}
            title="Đang làm"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' })}
            className={`p-0.5 rounded cursor-pointer ${task.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-emerald-500'}`}
            title="Hoàn thành"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        </div>
        ) : (
          <span className="mt-0.5 shrink-0" title="Chỉ người tạo / người được giao đổi trạng thái">
            {task.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : task.status === 'in_progress' ? (
              <Clock className="h-4 w-4 text-blue-500" />
            ) : (
              <Circle className="h-4 w-4 text-gray-300" />
            )}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <LeadAssignmentLink assignment={task} variant="card" />
          {task.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pri.color}`}>{pri.label}</span>
            {task.deadline && (
              <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
              </span>
            )}
            <AssigneeStack assignees={task.assignees} fallback={task.assignee} />
          </div>
        </div>
        {canManage && (
          <div className="opacity-0 group-hover:opacity-100 flex flex-col gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3 w-3" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssigneeStack({ assignees, fallback, compact }) {
  const list = (assignees && assignees.length) ? assignees : (fallback ? [fallback] : []);
  if (!list.length) return null;
  if (list.length === 1) {
    return (
      <span className="text-[10px] text-blue-700 flex items-center gap-0.5">
        <UserIcon className="h-2.5 w-2.5" />{list[0].full_name}
      </span>
    );
  }
  const max = 4;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="inline-flex items-center" title={list.map((u) => u.full_name).join(', ')}>
      <span className="flex -space-x-1.5">
        {shown.map((u) => (
          <span
            key={u.id}
            className={`${compact ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]'} rounded-full bg-blue-500 text-white font-bold flex items-center justify-center border border-white`}
          >
            {(u.full_name || '?').charAt(0)}
          </span>
        ))}
        {extra > 0 && (
          <span className={`${compact ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]'} rounded-full bg-gray-500 text-white font-bold flex items-center justify-center border border-white`}>
            +{extra}
          </span>
        )}
      </span>
      <span className="text-[10px] text-blue-700 ml-1">{list.length} NV</span>
    </span>
  );
}

// ─── LIST / PLANNER / DEADLINE — shared row ──────────────────────────────────
function TaskRow({ task, canManage, canMove, onOpen, onEdit, onDelete, onUpdate, columns }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
  const col = columns.find((c) => c.id === task.column_id);
  return (
    <div className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 border-b last:border-0">
      {canMove ? (
      <div className="shrink-0 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: task.status === 'in_progress' ? 'pending' : 'in_progress' })}
          className={`p-1 rounded cursor-pointer ${task.status === 'in_progress' ? 'text-blue-600 bg-blue-50' : 'text-gray-300 hover:text-blue-500'}`}
          title="Đang làm"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' })}
          className={`p-1 rounded cursor-pointer ${task.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-300 hover:text-emerald-500'}`}
          title="Đã làm"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      </div>
      ) : (
        <span className="shrink-0">
          {task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : task.status === 'in_progress' ? <Clock className="h-4 w-4 text-blue-500" />
            : <Circle className="h-4 w-4 text-gray-300" />}
        </span>
      )}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => (onOpen || onEdit)?.(task)}>
        <p className={`text-sm hover:text-blue-700 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
        <LeadAssignmentLink assignment={task} variant="card" />
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {col && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (col.color || '#999') + '20', color: col.color }}>{col.name}</span>}
          {task.deadline && (
            <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
              <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
            </span>
          )}
          <AssigneeStack assignees={task.assignees} fallback={task.assignee} compact />
          {task.created_by && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5" title="Người giao">
              <Flag className="h-2.5 w-2.5" />{task.created_by.full_name}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pri.color}`}>{pri.label}</span>
      {canManage && (
        <>
          <button onClick={() => onEdit(task)} className="text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(task.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}

function ListView({ items, columns, onOpen, onEdit, onDelete, onUpdate, canManageTask, canMoveTask }) {
  if (!items.length) return <p className="text-center text-sm text-slate-400 py-12">Chưa có nhiệm vụ nào</p>;
  return (
    <div className="ui-solid-white bg-white rounded-xl border border-slate-200/90 shadow-sm divide-y divide-slate-100">
      {items.map((t) => <TaskRow key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} columns={columns} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} />)}
    </div>
  );
}

/** Board 3 cột: Chưa làm / Đang làm / Đã làm — kéo thả đổi trạng thái. */
function StatusBoardView({
  itemsByStatus, onOpen, onEdit, onDelete, onUpdate, canManageTask, canMoveTask,
}) {
  const [dragId, setDragId] = useState(null);
  const onDragStart = (id) => () => setDragId(id);
  const allowDrop = (e) => e.preventDefault();
  const onDropStatus = (status) => (e) => {
    e.preventDefault();
    if (!dragId) return;
    void onUpdate(dragId, { status });
    setDragId(null);
  };

  const total = STATUS_BOARD_META.reduce(
    (n, col) => n + ((itemsByStatus?.[col.key] || []).length),
    0,
  );
  if (!total) {
    return <p className="text-center text-sm text-gray-400 py-12">Chưa có nhiệm vụ nào</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">
        Kéo thẻ sang cột để đổi trạng thái: <strong>Chưa làm</strong> · <strong>Đang làm</strong> · <strong>Đã làm</strong>
      </p>
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 360 }}>
        {STATUS_BOARD_META.map((col) => {
          const list = itemsByStatus?.[col.key] || [];
          return (
            <div
              key={col.key}
              className="w-80 shrink-0 rounded-xl border border-slate-200/90 bg-white flex flex-col shadow-sm"
              onDragOver={allowDrop}
              onDrop={onDropStatus(col.key === 'pending' ? 'pending' : col.key)}
            >
              <div
                className={`px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 ${col.headerBg} rounded-t-xl`}
                style={{ borderTopColor: col.color, borderTopWidth: 3 }}
              >
                <span className="text-sm font-semibold flex-1" style={{ color: col.color }}>{col.label}</span>
                <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{list.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 min-h-[120px] max-h-[65vh] overflow-y-auto">
                {list.map((t) => (
                  <Card
                    key={t.id}
                    task={t}
                    canManage={canManageTask(t)}
                    canMove={canMoveTask(t)}
                    onDragStart={onDragStart}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                  />
                ))}
                {!list.length && (
                  <p className="text-[11px] text-gray-400 text-center py-8">Kéo việc vào đây</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonalViewToolbar({
  view, viewScope, onViewScopeChange, showCompletedOpen, onShowCompletedOpenChange, onAddColumn,
}) {
  const { theme } = useAssignmentsPageContext();
  const t = theme || getAssignmentTheme('crm');
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${t.activeText}`}>
        {view === 'deadline' ? 'Deadline' : 'Planner'} — giao diện cá nhân
      </span>
      <SegmentedControl
        value={viewScope}
        onChange={onViewScopeChange}
        activeText={t.activeText}
        options={[
          { id: 'personal', label: 'Của tôi' },
          { id: 'team', label: 'Toàn team' },
        ]}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showCompletedOpen}
          onChange={(e) => onShowCompletedOpenChange(e.target.checked)}
          className="rounded border-slate-300"
        />
        Hiện việc đã xong
      </label>
      <button
        type="button"
        onClick={onAddColumn}
        className="ml-auto h-8 px-3 rounded-lg border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50/50 text-xs text-slate-600 hover:text-violet-700 font-medium flex items-center gap-1.5 cursor-pointer bg-white"
      >
        <Plus className="h-3.5 w-3.5" />Thêm cột cá nhân
      </button>
    </div>
  );
}

function PersonalColumnBoard({
  column, tasks, onEditColumn, onDeleteColumn, onDropTask, droppable = true, onOpen, onEdit, onDelete, onUpdate,
  columns, canManageTask, canMoveTask, dragId, setDragId,
}) {
  const allowDrop = droppable ? (e) => e.preventDefault() : undefined;
  const onDrop = droppable ? (e) => {
    e.preventDefault();
    if (dragId && onDropTask) {
      onDropTask(dragId, column.id);
      setDragId(null);
    }
  } : undefined;
  const onDragStart = (id) => () => setDragId(id);

  return (
    <div
      className="w-72 shrink-0 rounded-xl border border-slate-200/90 bg-white flex flex-col shadow-sm"
      onDragOver={allowDrop}
      onDrop={onDrop}
    >
      <div
        className="px-3 py-2 flex items-center gap-2 border-b border-slate-100 rounded-t-xl bg-slate-50/80"
        style={{ borderTopColor: column.color, borderTopWidth: 3 }}
      >
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: column.color }}>{column.name}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{tasks.length}</span>
        {onEditColumn && (
          <button type="button" onClick={() => onEditColumn(column)} className="text-gray-400 hover:text-blue-600 cursor-pointer">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDeleteColumn && (
          <button type="button" onClick={() => onDeleteColumn(column.id)} className="text-gray-400 hover:text-red-500 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[80px]">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            canManage={canManageTask(t)}
            canMove={canMoveTask(t)}
            onDragStart={onDragStart}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
        {!tasks.length && (
          <p className="text-[10px] text-gray-400 text-center py-4 px-1">Kéo việc vào đây</p>
        )}
      </div>
    </div>
  );
}

function PlannerView({
  groups, viewScope, personalColumns, onOpen, onEdit, onDelete, onUpdate, columns,
  canManageTask, canMoveTask, onEditPersonalColumn, onDeletePersonalColumn, onDropPersonalColumn,
}) {
  const [dragId, setDragId] = useState(null);
  const teamCols = [
    ...groups.assignees.map((g) => ({
      id: `user_${g.user.id}`,
      name: g.user.full_name,
      color: '#3B82F6',
      tasks: g.tasks,
      fixed: true,
    })),
    ...(groups.unassigned.length ? [{
      id: '__unassigned',
      name: 'Chưa giao',
      color: '#94A3B8',
      tasks: groups.unassigned,
      fixed: true,
    }] : []),
  ];
  const personalCols = (groups.personal || []).map((g) => ({
    id: g.column.id,
    name: g.column.name,
    color: g.column.color,
    tasks: g.tasks,
    fixed: false,
  }));
  const allMineTasks = [
    ...groups.assignees.flatMap((g) => g.tasks),
    ...groups.unassigned,
  ];
  const personalDisplayCols = personalCols.length
    ? personalCols
    : [{
      id: '__mine',
      name: 'Việc của tôi',
      color: '#3B82F6',
      tasks: allMineTasks,
      fixed: true,
    }];
  const displayCols = viewScope === 'personal'
    ? personalDisplayCols
    : [...teamCols, ...personalCols];

  if (viewScope === 'team' && !displayCols.length) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-gray-500">Chưa có nhiệm vụ đang mở trong Planner.</p>
        <p className="text-xs text-gray-400">Bật «Hiện việc đã xong», chuyển sang <strong>Của tôi</strong>, hoặc bấm <strong>Thêm cột cá nhân</strong>.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 360 }}>
      {displayCols.map((col) => (
        <PersonalColumnBoard
          key={col.id}
          column={col}
          tasks={col.tasks}
          droppable={!col.fixed || String(col.id).startsWith('pc_')}
          onEditColumn={col.fixed ? null : onEditPersonalColumn}
          onDeleteColumn={col.fixed ? null : onDeletePersonalColumn}
          onDropTask={onDropPersonalColumn}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
          onUpdate={onUpdate}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          dragId={dragId}
          setDragId={setDragId}
        />
      ))}
    </div>
  );
}

function DeadlineView({
  groups, personalColumns, onOpen, onEdit, onDelete, onUpdate, columns,
  canManageTask, canMoveTask, onEditPersonalColumn, onDeletePersonalColumn, onDropPersonalColumn,
}) {
  const [dragId, setDragId] = useState(null);
  const bucketCols = DEADLINE_BUCKET_META.map((b) => ({
    id: b.key,
    name: b.label,
    color: b.color,
    tasks: groups[b.key] || [],
    fixed: true,
  }));
  const personalCols = (groups.personal || []).map((g) => ({
    id: g.column.id,
    name: g.column.name,
    color: g.column.color,
    tasks: g.tasks,
    fixed: false,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Nhóm theo hạn</p>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 280 }}>
          {bucketCols.map((col) => (
            <PersonalColumnBoard
              key={col.id}
              column={col}
              tasks={col.tasks}
              droppable={false}
              onEditColumn={null}
              onDeleteColumn={null}
              onDropTask={null}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdate={onUpdate}
              columns={columns}
              canManageTask={canManageTask}
              canMoveTask={canMoveTask}
              dragId={dragId}
              setDragId={setDragId}
            />
          ))}
        </div>
      </div>
      {(personalCols.length > 0 || personalColumns.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">Cột cá nhân</p>
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 200 }}>
            {personalCols.map((col) => (
              <PersonalColumnBoard
                key={col.id}
                column={col}
                tasks={col.tasks}
                onEditColumn={onEditPersonalColumn}
                onDeleteColumn={onDeletePersonalColumn}
                onDropTask={onDropPersonalColumn}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
                onUpdate={onUpdate}
                columns={columns}
                canManageTask={canManageTask}
                canMoveTask={canMoveTask}
                dragId={dragId}
                setDragId={setDragId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalColumnModal({ column, viewLabel, onClose, onSave }) {
  const [form, setForm] = useState({
    id: column?.id,
    name: column?.name || '',
    color: column?.color || COLUMN_COLORS[0],
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };
  return portalAssignmentsModal(
    <div className={`fixed inset-0 bg-black/40 ${ASSIGNMENTS_MODAL_Z} flex items-center justify-center p-4`} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{form.id ? 'Sửa cột cá nhân' : `Thêm cột ${viewLabel}`}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-gray-500">Cột chỉ hiển thị với bạn — dùng để nhóm việc theo ý (kéo thả nhiệm vụ vào cột).</p>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Tên cột <span className="text-red-500">*</span></label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
            placeholder="VD: Việc khẩn, Chờ duyệt…"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Màu</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLUMN_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((p) => ({ ...p, color: c }))}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-gray-900' : 'border-white'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Huỷ</button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer">Lưu</button>
        </div>
      </form>
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ItemModal({
  item,
  users: _initialUsers,
  columns,
  companies,
  isAdmin,
  defaultCompanyId,
  requireLead = false,
  sharedWorkspaceMode = false,
  onClose,
  onSave,
}) {
  const { apiBase, assignmentModule, theme } = useAssignmentsPageContext();
  const initialAssigneeIds = item?.assignees?.length
    ? item.assignees.map((a) => String(a.id))
    : (item?.assignee_id ? [String(item.assignee_id)] : []);

  const [form, setForm] = useState(() => ({
    id: item?.id || undefined,
    title: item?.title || '',
    description: item?.description || '',
    column_id: item?.column_id || (columns[0]?.id ?? ''),
    priority: item?.priority || 'medium',
    status: item?.status || 'pending',
    deadline: item?.deadline ? new Date(item.deadline).toISOString().slice(0, 16) : '',
    company_id: item?.company_id || defaultCompanyId || '',
    schedule_enabled: false,
    scheduled_start: '',
    recurrence_enabled: false,
    recurrence_type: 'weekly',
    recurrence_interval: 1,
    recurrence_end_at: '',
  }));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const [lookups, setLookups] = useState({ departments: [], regions: [], users: [] });
  const [loadingLk, setLoadingLk] = useState(true);
  const [selRegions, setSelRegions] = useState(new Set());
  const [selDepts, setSelDepts] = useState(new Set());
  const [selUsers, setSelUsers] = useState(new Set(initialAssigneeIds));
  const [userSearch, setUserSearch] = useState('');
  const [showAssigneePicker, setShowAssigneePicker] = useState(!item?.id);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [linkedLead, setLinkedLead] = useState(() => (
    item?.lead?.id
      ? {
        id: item.lead.id,
        code: item.lead.code,
        title: item.lead.title,
        type: item.lead.type || 'deal',
        project_id: item.lead.project_id || null,
        project_code: item.lead.project_code || null,
        company_id: item.company_id || item.lead.company_id || null,
      }
      : null
  ));
  const [filterLeadMembers, setFilterLeadMembers] = useState(() => !!(item?.lead?.id || item?.lead_id));
  const [leadMemberIds, setLeadMemberIds] = useState(null);
  const [loadingLeadMembers, setLoadingLeadMembers] = useState(false);
  /** Lọc danh sách deal theo NV phụ trách (assigned_to) */
  const [dealAssigneeFilter, setDealAssigneeFilter] = useState('');
  const [dealAssigneeSearch, setDealAssigneeSearch] = useState('');

  const linkFieldLabel = assignmentSourceFieldLabel(assignmentModule);
  const isSxLink = isProductionAssignmentsPage(assignmentModule);
  const isVcLink = isLogisticsAssignmentsPage(assignmentModule);
  const linkPlaceholder = isSxLink
    ? 'Tìm dự án / deal SX theo mã TB, mã deal, tên…'
    : isVcLink
      ? 'Tìm dự án / deal Lắp đặt theo mã TB, mã deal…'
      : 'Tìm deal theo mã / tên / SĐT khách…';
  const linkEmptyLabel = isSxLink
    ? 'Chọn dự án / deal SX (tuỳ chọn)'
    : isVcLink
      ? 'Chọn dự án / deal Lắp đặt (tuỳ chọn)'
      : 'Chọn lead / deal CRM (tuỳ chọn)';
  const membersFilterLabel = isSxLink || isVcLink
    ? 'Chỉ thành viên dự án/deal'
    : 'Chỉ thành viên deal';

  // Tải lookups mỗi khi đổi công ty
  useEffect(() => {
    let cancel = false;
    setLoadingLk(true);
    const params = {};
    if (form.company_id) params.company_id = form.company_id;
    api.get(`${apiBase}/lookups`, { params })
      .then((r) => {
        if (cancel) return;
        const lk = r.data || { departments: [], regions: [], users: [] };
        setLookups(lk);
      })
      .catch(() => { if (!cancel) setLookups({ departments: [], regions: [], users: [] }); })
      .finally(() => { if (!cancel) setLoadingLk(false); });
    return () => { cancel = true; };
  }, [form.company_id, apiBase]);

  // Thành viên deal/dự án — dùng để lọc NV khi đã gắn liên kết
  useEffect(() => {
    const leadId = linkedLead?.id;
    if (!leadId) {
      setLeadMemberIds(null);
      setLoadingLeadMembers(false);
      return undefined;
    }
    let cancel = false;
    setLoadingLeadMembers(true);
    api.get(`/crm/leads/${leadId}/members`)
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : (r.data?.members || []);
        const ids = new Set(
          list.map((m) => String(m?.user_id || m?.user?.id || '')).filter(Boolean),
        );
        setLeadMemberIds(ids);
      })
      .catch(() => { if (!cancel) setLeadMemberIds(new Set()); })
      .finally(() => { if (!cancel) setLoadingLeadMembers(false); });
    return () => { cancel = true; };
  }, [linkedLead?.id]);

  const onPickLinkedLead = (deal) => {
    setLinkedLead(deal);
    if (deal) {
      setFilterLeadMembers(true);
      if (deal.company_id && isAdmin && !form.company_id) {
        set('company_id', deal.company_id);
      }
    } else {
      setFilterLeadMembers(false);
      setLeadMemberIds(null);
    }
  };

  // Lọc danh sách NV theo region/department/search (+ thành viên deal nếu bật)
  const filteredUsers = useMemo(() => {
    const all = lookups.users || [];
    return all.filter((u) => {
      if (filterLeadMembers && leadMemberIds) {
        if (!leadMemberIds.has(String(u.id))) return false;
      }
      if (selDepts.size && !selDepts.has(String(u.department_id))) return false;
      if (selRegions.size) {
        const uregs = (u.region_ids || []).map(String);
        if (!uregs.some((r) => selRegions.has(r))) return false;
      }
      if (userSearch) {
        const s = userSearch.toLowerCase();
        if (!(u.full_name || '').toLowerCase().includes(s)
          && !(u.email || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [lookups.users, selDepts, selRegions, userSearch, filterLeadMembers, leadMemberIds]);

  const toggleSet = (set, value) => {
    const next = new Set(set);
    const v = String(value);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const addAllFiltered = () => setSelUsers((p) => {
    const next = new Set(p);
    filteredUsers.forEach((u) => next.add(String(u.id)));
    return next;
  });
  const clearAllSelected = () => setSelUsers(new Set());

  const addUsersOfDept = (deptId) => setSelUsers((p) => {
    const next = new Set(p);
    (lookups.users || []).filter((u) => String(u.department_id) === String(deptId)).forEach((u) => next.add(String(u.id)));
    return next;
  });
  const addUsersOfRegion = (regionId) => setSelUsers((p) => {
    const next = new Set(p);
    (lookups.users || []).filter((u) => (u.region_ids || []).map(String).includes(String(regionId))).forEach((u) => next.add(String(u.id)));
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (!form.id && form.schedule_enabled && !form.scheduled_start) {
      alert('Chọn thời gian bắt đầu lịch giao việc');
      return;
    }
    if (requireLead && !linkedLead?.id) {
      alert('Không gian chung bắt buộc gắn deal / dự án trước khi giao việc');
      return;
    }
    if (!selUsers.size) {
      alert('Chọn ít nhất một nhân viên');
      return;
    }
    onSave({
      ...form,
      assignee_ids: [...selUsers],
      department_ids: [],
      region_ids: [],
      column_id: form.column_id || null,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      company_id: form.company_id || null,
      lead_id: linkedLead?.id || null,
      schedule_enabled: !form.id && form.schedule_enabled,
      scheduled_start: form.schedule_enabled && form.scheduled_start
        ? new Date(form.scheduled_start).toISOString()
        : null,
      recurrence_type: !form.id && form.schedule_enabled && form.recurrence_enabled
        ? form.recurrence_type
        : null,
      recurrence_interval: form.recurrence_interval || 1,
      recurrence_end_at: form.recurrence_enabled && form.recurrence_end_at
        ? new Date(form.recurrence_end_at).toISOString()
        : null,
    }, stagedFiles);
  };

  const selectedUserObjects = useMemo(() => {
    const byId = new Map((lookups.users || []).map((u) => [String(u.id), u]));
    return [...selUsers].map((id) => byId.get(id)).filter(Boolean);
  }, [selUsers, lookups.users]);

  const dealAssigneeOptions = useMemo(() => {
    const all = lookups.users || [];
    const q = dealAssigneeSearch.trim().toLowerCase();
    const sorted = [...all].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
    if (!q) return sorted;
    const matched = sorted.filter((u) => {
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
    // Giữ option đang chọn dù không khớp ô tìm — tránh select trống
    if (dealAssigneeFilter && !matched.some((u) => String(u.id) === String(dealAssigneeFilter))) {
      const selected = sorted.find((u) => String(u.id) === String(dealAssigneeFilter));
      if (selected) return [selected, ...matched];
    }
    return matched;
  }, [lookups.users, dealAssigneeSearch, dealAssigneeFilter]);

  const dealAssigneeLabel = useMemo(() => {
    if (!dealAssigneeFilter) return '';
    const u = (lookups.users || []).find((x) => String(x.id) === String(dealAssigneeFilter));
    return u?.full_name || '';
  }, [dealAssigneeFilter, lookups.users]);

  const t = theme || getAssignmentTheme(assignmentModule);
  const isLd = t.mod === 'logistics';
  const isSx = t.mod === 'production';
  const focusCls = isLd
    ? 'focus:border-orange-400 focus:ring-2 focus:ring-orange-100'
    : isSx
      ? 'focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
      : 'focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const fieldCls = `w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none bg-white ${focusCls}`;
  const selectCls = `${fieldCls} cursor-pointer`;
  const sectionTitleCls = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2';
  const ctaCls = isLd
    ? 'bg-orange-600 hover:bg-orange-700'
    : isSx
      ? 'bg-indigo-600 hover:bg-indigo-700'
      : 'bg-blue-600 hover:bg-blue-700';
  const headerGrad = t.headerGrad || 'from-slate-50 via-white to-white';

  const assigneePanel = (
    <div
      data-tour="assign-create-assignees"
      className={`rounded-2xl border p-3 flex flex-col min-h-0 ${isLd ? 'border-orange-200 bg-orange-50/40' : isSx ? 'border-indigo-200 bg-indigo-50/40' : 'border-blue-200 bg-blue-50/40'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-bold text-gray-900">Giao cho</p>
          <p className="text-[11px] text-gray-500">{selUsers.size} nhân viên đã chọn</p>
        </div>
        <div className="flex items-center gap-1.5">
          {selUsers.size > 0 && (
            <button type="button" onClick={clearAllSelected} className="text-[11px] text-red-600 hover:underline cursor-pointer">Bỏ hết</button>
          )}
          <button
            type="button"
            onClick={() => setShowAssigneePicker((v) => !v)}
            className="h-8 px-2.5 rounded-lg border border-white/80 bg-white text-gray-700 text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-gray-50 shadow-sm"
          >
            <Search className="h-3.5 w-3.5" />
            {showAssigneePicker ? 'Thu gọn' : 'Tìm NV'}
          </button>
        </div>
      </div>

      {selectedUserObjects.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-2 p-2 bg-white/80 rounded-xl border border-emerald-200 max-h-20 overflow-y-auto">
          {selectedUserObjects.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 text-xs text-emerald-900">
              {u.full_name}
              <button type="button" onClick={() => setSelUsers((p) => toggleSet(p, u.id))} className="text-emerald-600/70 hover:text-red-500 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          Chọn ít nhất 1 nhân viên bên dưới.
        </p>
      )}

      {showAssigneePicker && (
        <div className="flex flex-col min-h-0 gap-2">
          {linkedLead?.id && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs cursor-pointer border border-teal-200 bg-white text-teal-800">
                <input
                  type="checkbox"
                  checked={filterLeadMembers}
                  onChange={(e) => setFilterLeadMembers(e.target.checked)}
                  className="cursor-pointer"
                />
                {membersFilterLabel}
                {loadingLeadMembers ? (
                  <span className="text-teal-500">…</span>
                ) : leadMemberIds ? (
                  <span className="text-teal-600/80">({leadMemberIds.size})</span>
                ) : null}
              </label>
              {filterLeadMembers && leadMemberIds && leadMemberIds.size === 0 && !loadingLeadMembers ? (
                <span className="text-[11px] text-amber-700">Deal chưa có thành viên — tắt lọc để chọn NV khác.</span>
              ) : null}
            </div>
          )}
          {lookups.regions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Khu vực</p>
              <div className="flex flex-wrap gap-1">
                {lookups.regions.map((r) => {
                  const active = selRegions.has(String(r.id));
                  return (
                    <span key={r.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => setSelRegions((p) => toggleSet(p, r.id))}
                        className={`h-6 px-2 rounded-l-full text-[11px] cursor-pointer ${active ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-200'}`}
                      >
                        {r.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => addUsersOfRegion(r.id)}
                        title="Chọn cả khu vực"
                        className="h-6 px-1.5 rounded-r-full text-[11px] bg-purple-100 hover:bg-purple-200 text-purple-700 cursor-pointer border border-l-0 border-purple-200"
                      >
                        +
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {lookups.departments.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Phòng ban</p>
              <div className="flex flex-wrap gap-1">
                {lookups.departments.map((d) => {
                  const active = selDepts.has(String(d.id));
                  return (
                    <span key={d.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => setSelDepts((p) => toggleSet(p, d.id))}
                        className={`h-6 px-2 rounded-l-full text-[11px] cursor-pointer ${active ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 border border-sky-200'}`}
                      >
                        {d.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => addUsersOfDept(d.id)}
                        title="Chọn cả phòng"
                        className="h-6 px-1.5 rounded-r-full text-[11px] bg-sky-100 hover:bg-sky-200 text-sky-700 cursor-pointer border border-l-0 border-sky-200"
                      >
                        +
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Tìm tên nhân viên…"
                className={`w-full h-9 pl-8 pr-2 border border-gray-200 rounded-xl text-xs outline-none bg-white ${focusCls}`}
              />
            </div>
            <button
              type="button"
              onClick={addAllFiltered}
              className="h-9 px-2.5 text-[11px] rounded-xl bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
            >
              + Tất cả ({filteredUsers.length})
            </button>
          </div>
          <div className="max-h-52 lg:max-h-[min(22rem,42vh)] overflow-y-auto border border-gray-200 rounded-xl divide-y bg-white">
            {loadingLk ? (
              <p className="text-center text-xs text-gray-400 py-6">Đang tải...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">Không có nhân viên phù hợp</p>
            ) : (
              filteredUsers.map((u) => {
                const checked = selUsers.has(String(u.id));
                const dept = lookups.departments.find((d) => String(d.id) === String(u.department_id));
                return (
                  <label key={u.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${checked ? (isLd ? 'bg-orange-50' : isSx ? 'bg-indigo-50' : 'bg-blue-50') : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelUsers((p) => toggleSet(p, u.id))}
                      className="cursor-pointer"
                    />
                    <span className="text-sm flex-1 min-w-0 truncate">{u.full_name}</span>
                    {dept && <span className="text-[10px] text-gray-500 shrink-0">{dept.name}</span>}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  return portalAssignmentsModal(
    <div className={`fixed inset-0 bg-black/40 ${ASSIGNMENTS_MODAL_Z} flex items-center justify-center p-3 sm:p-4`} onClick={onClose} data-tour="assign-create-modal">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden"
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-3.5 border-b bg-gradient-to-r ${headerGrad}`}>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${t.activeText || 'text-gray-500'}`}>
              {sharedWorkspaceMode ? 'Không gian chung' : (t.shortTitle || 'Giao việc')}
            </p>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {form.id
                ? 'Sửa nhiệm vụ'
                : sharedWorkspaceMode
                  ? 'Giao việc Không gian chung'
                  : 'Giao việc mới'}
            </h3>
            {sharedWorkspaceMode && !form.id ? (
              <p className="text-[11px] text-teal-700 mt-1">
                Bắt buộc gắn deal — người nhận sẽ thấy việc ở tab Không gian chung.
              </p>
            ) : null}          </div>
          <button
            type="button"
            data-tour="assign-create-modal-close"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/80 cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4">
            <div className="space-y-3 min-w-0">
              <section className={`rounded-2xl border p-3.5 space-y-3 ${
                requireLead
                  ? 'border-teal-300 bg-teal-50/50 ring-1 ring-teal-200/60'
                  : 'border-gray-200 bg-gray-50/60'
              }`}>
                <p className={sectionTitleCls}>
                  1. Gắn dự án / deal
                  {requireLead ? <span className="text-red-500 normal-case tracking-normal"> *</span> : null}
                </p>
                {requireLead ? (
                  <p className="text-[11px] text-teal-800 -mt-1">
                    Chọn deal để việc xuất hiện ở Không gian chung của người được giao.
                  </p>
                ) : null}                {isAdmin && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Công ty</label>
                    <select
                      value={form.company_id}
                      onChange={(e) => {
                        set('company_id', e.target.value);
                        setSelRegions(new Set());
                        setSelDepts(new Set());
                        setSelUsers(new Set());
                        setDealAssigneeFilter('');
                        setDealAssigneeSearch('');
                      }}
                      className={selectCls}
                    >
                      <option value="">Tất cả công ty module này</option>
                      {(companies || []).map((co) => <option key={co.id} value={co.id}>{co.short_name || co.name}</option>)}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">Chọn công ty trước để danh sách deal gọn hơn.</p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nhân viên phụ trách deal</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <input
                        value={dealAssigneeSearch}
                        onChange={(e) => setDealAssigneeSearch(e.target.value)}
                        placeholder="Tìm tên NV để lọc deal…"
                        className={`w-full h-10 pl-8 pr-2 border border-gray-200 rounded-xl text-sm outline-none bg-white ${focusCls}`}
                      />
                    </div>
                    <select
                      value={dealAssigneeFilter}
                      onChange={(e) => setDealAssigneeFilter(e.target.value)}
                      className={`${selectCls} flex-[1.2] min-w-0`}
                      title="Chỉ hiện deal của nhân viên này"
                    >
                      <option value="">Tất cả nhân viên</option>
                      {dealAssigneeOptions.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                  {dealAssigneeFilter ? (
                    <p className="text-[11px] text-purple-700 mt-1">
                      Đang lọc deal của <span className="font-semibold">{dealAssigneeLabel || 'NV đã chọn'}</span>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => { setDealAssigneeFilter(''); setDealAssigneeSearch(''); }}
                        className="underline hover:text-purple-900 cursor-pointer"
                      >
                        Bỏ lọc
                      </button>
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1">Chọn NV để chỉ hiện deal đang phụ trách.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{linkFieldLabel}</label>
                  <LeadDealPicker
                    value={linkedLead}
                    onChange={onPickLinkedLead}
                    type="deal"
                    companyId={form.company_id || null}
                    assigneeId={dealAssigneeFilter || null}
                    forModule={assignmentModule || null}
                    placeholder={linkPlaceholder}
                    emptyLabel={requireLead
                      ? (isSxLink || isVcLink
                        ? 'Chọn dự án / deal (bắt buộc)'
                        : 'Chọn deal CRM (bắt buộc)')
                      : linkEmptyLabel}
                    warnOrphan={requireLead}
                  />
                  {linkedLead?.project_code ? (
                    <p className="text-[11px] text-teal-700 mt-1.5 font-mono">Dự án: {linkedLead.project_code}{linkedLead.project_name ? ` — ${linkedLead.project_name}` : ''}</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 p-3.5 space-y-3">
                <p className={sectionTitleCls}>2. Việc cần làm</p>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Tiêu đề <span className="text-red-500">*</span></label>
                  <input
                    data-tour="assign-create-title"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    className={fieldCls}
                    placeholder="VD: Lắp đặt tủ bếp — kiểm tra hiện trường"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Mô tả <span className="text-gray-400 font-normal">(tuỳ chọn)</span></label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={3}
                    placeholder="Ghi chú ngắn cho người nhận việc…"
                    className={`w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none bg-white resize-y min-h-[72px] ${focusCls}`}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 p-3.5 space-y-3">
                <p className={sectionTitleCls}>3. Cột · ưu tiên · hạn</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Cột Kanban</label>
                    <select value={form.column_id || ''} onChange={(e) => set('column_id', e.target.value)} className={selectCls}>
                      <option value="">Chưa phân loại</option>
                      {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Ưu tiên</label>
                    <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={selectCls}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Trạng thái</label>
                    <select value={form.status} onChange={(e) => set('status', e.target.value)} className={selectCls}>
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Deadline</label>
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={(e) => set('deadline', e.target.value)}
                      className={fieldCls}
                    />
                  </div>
                </div>
                {!form.id && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-violet-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.schedule_enabled}
                        onChange={(e) => set('schedule_enabled', e.target.checked)}
                        className="cursor-pointer"
                      />
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      Giao việc theo lịch
                    </label>
                    {form.schedule_enabled && (
                      <>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Thời gian bắt đầu <span className="text-red-500">*</span></label>
                          <input
                            type="datetime-local"
                            value={form.scheduled_start}
                            onChange={(e) => set('scheduled_start', e.target.value)}
                            className="w-full h-10 px-3 border rounded-xl text-sm outline-none focus:border-violet-500 bg-white"
                            required={form.schedule_enabled}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.recurrence_enabled}
                            onChange={(e) => set('recurrence_enabled', e.target.checked)}
                            className="cursor-pointer"
                          />
                          <Repeat2 className="h-3.5 w-3.5 text-violet-600" />
                          Lặp lại định kỳ
                        </label>
                        {form.recurrence_enabled && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">Chu kỳ</label>
                              <select
                                value={form.recurrence_type}
                                onChange={(e) => set('recurrence_type', e.target.value)}
                                className="w-full h-9 px-2 border rounded-xl text-xs bg-white"
                              >
                                {RECURRENCE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">Mỗi (N lần)</label>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={form.recurrence_interval}
                                onChange={(e) => set('recurrence_interval', Math.max(1, Number(e.target.value) || 1))}
                                className="w-full h-9 px-2 border rounded-xl text-xs bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-500 block mb-1">Kết thúc lặp</label>
                              <input
                                type="datetime-local"
                                value={form.recurrence_end_at}
                                onChange={(e) => set('recurrence_end_at', e.target.value)}
                                className="w-full h-9 px-2 border rounded-xl text-xs bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>

              <div className="lg:hidden">{assigneePanel}</div>

              {form.id ? (
                <AttachmentsSection
                  assignmentId={form.id}
                  kind="req"
                  title="📋 File yêu cầu công việc"
                  hint="File brief / hướng dẫn cho NV thực hiện. Người giao việc tải lên."
                  emptyText="Chưa có file yêu cầu nào"
                  color="blue"
                />
              ) : (
                <StagedAttachmentsSection files={stagedFiles} onChange={setStagedFiles} />
              )}
              {form.id && <CommentSection assignmentId={form.id} />}
            </div>

            <aside className="hidden lg:block min-w-0">
              <div className="lg:sticky lg:top-0">{assigneePanel}</div>
            </aside>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50">
          <p className="text-[11px] text-gray-500 hidden sm:block">
            {selUsers.size ? `${selUsers.size} người sẽ nhận việc` : 'Chưa chọn người nhận'}
          </p>
          <div className="flex justify-end gap-2 ml-auto">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm cursor-pointer hover:bg-gray-50">Huỷ</button>
            <button
              type="submit"
              data-tour="assign-create-save"
              className={`h-10 px-5 rounded-xl text-white text-sm font-semibold cursor-pointer shadow-sm ${ctaCls}`}
            >
              {form.id ? 'Lưu thay đổi' : form.schedule_enabled ? `Lên lịch (${selUsers.size} NV)` : `Giao cho ${selUsers.size} NV`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ColumnModal({ column, onClose, onSave }) {
  const [form, setForm] = useState({
    id: column?.id,
    name: column?.name || '',
    color: column?.color || COLUMN_COLORS[0],
    is_done_column: !!column?.is_done_column,
    is_in_progress_column: !!column?.is_in_progress_column,
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };
  return portalAssignmentsModal(
    <div className={`fixed inset-0 bg-black/40 ${ASSIGNMENTS_MODAL_Z} flex items-center justify-center p-4`} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{form.id ? 'Sửa cột' : 'Thêm cột'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Tên cột <span className="text-red-500">*</span></label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Màu</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLUMN_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((p) => ({ ...p, color: c }))}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-gray-900' : 'border-white'}`}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_in_progress_column}
            onChange={(e) => setForm((p) => ({
              ...p,
              is_in_progress_column: e.target.checked,
              is_done_column: e.target.checked ? false : p.is_done_column,
            }))}
          />
          Cột &quot;Đang làm&quot; — kéo việc vào đây tự chuyển trạng thái đang làm
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_done_column}
            onChange={(e) => setForm((p) => ({
              ...p,
              is_done_column: e.target.checked,
              is_in_progress_column: e.target.checked ? false : p.is_in_progress_column,
            }))}
          />
          Cột &quot;Hoàn thành&quot; — kéo việc vào đây tự đánh dấu xong
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Huỷ</button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer">Lưu</button>
        </div>
      </form>
    </div>
  );
}

// ─── DETAIL MODAL (chỉ XEM khi bấm vào thẻ) ──────────────────────────────────
function DetailModal({ item, columns, onClose, onEdit, onUpdate, onDelete }) {
  const { user } = useAuth();
  const { assignmentModule } = useAssignmentsPageContext();
  const uid = String(user?.id || '');
  const isCreator = String(item.created_by_id || '') === uid;
  const assigneeList = (item.assignees && item.assignees.length) ? item.assignees : (item.assignee ? [item.assignee] : []);
  const isAssignee = assigneeList.some((a) => String(a.id) === uid);
  const canMove = isCreator || isAssignee;

  const [localItem, setLocalItem] = useState(item);
  const [fillFormOpen, setFillFormOpen] = useState(false);
  useEffect(() => { setLocalItem(item); }, [item]);

  const pri = PRIORITY_MAP[localItem.priority] || PRIORITY_MAP.medium;
  const status = STATUS_MAP[localItem.status] || STATUS_MAP.pending;
  const col = columns.find((c) => c.id === localItem.column_id);
  const overdue = localItem.deadline && new Date(localItem.deadline) < new Date() && localItem.status !== 'completed';
  const linkedLeadId = localItem.lead?.id || localItem.crm_task?.lead_id || null;
  const showFillForm = !!(localItem.crm_task_id && localItem.crm_task?.show_fill_form && linkedLeadId);
  const fillTask = showFillForm
    ? {
      id: localItem.crm_task_id,
      title: localItem.title,
      show_fill_form: true,
      form_config: localItem.crm_task?.form_config || {},
      form_data: localItem.crm_task?.form_data || {},
      lead_id: linkedLeadId,
    }
    : null;

  const fmtDt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const setStatus = (nextStatus) => {
    onUpdate(localItem.id, { status: nextStatus });
    setLocalItem((prev) => ({ ...prev, status: nextStatus }));
  };

  const onNotesSaved = (notes) => {
    setLocalItem((prev) => ({
      ...prev,
      crm_task: { ...(prev.crm_task || {}), notes },
    }));
  };

  const StatusIcon = status.icon;

  return (
    <>
      {portalAssignmentsModal(
        <div className={`fixed inset-0 bg-black/50 ${ASSIGNMENTS_MODAL_Z} flex items-center justify-center p-4`} onClick={onClose}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* HEADER */}
            <div className="px-5 py-3 border-b flex items-start justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {col && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (col.color || '#999') + '20', color: col.color }}>{col.name}</span>}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${pri.color}`}>⚑ {pri.label}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 bg-gray-100 ${status.color}`}>
                    <StatusIcon className="h-3 w-3" />{status.label}
                  </span>
                  {overdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">🚨 Quá hạn</span>}
                  {localItem.crm_task_id && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      Tuần tự từ nhiệm vụ lead/deal
                    </span>
                  )}
                </div>
                <h2 className={`text-xl font-bold break-words ${localItem.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{localItem.title}</h2>
                {canMove && (
                  <AssignmentStatusStages status={localItem.status} canEdit onChange={setStatus} />
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {showFillForm && canMove && (
                  <button
                    type="button"
                    onClick={() => setFillFormOpen(true)}
                    title="Điền form nhiệm vụ CRM"
                    className="h-8 px-2.5 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-800 text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Điền form
                  </button>
                )}
                {isCreator && (
                  <>
                    <button onClick={() => onEdit(localItem)} title="Sửa" className="h-8 w-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center cursor-pointer">
                      <Pencil className="h-4 w-4 text-gray-600" />
                    </button>
                    <button onClick={() => onDelete(localItem.id)} title="Xoá" className="h-8 w-8 rounded-lg border hover:bg-red-50 flex items-center justify-center cursor-pointer">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </>
                )}
                <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* BODY */}
            <div className="px-5 py-4 overflow-y-auto space-y-4 min-h-0 flex-1">
              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-gray-500">Người giao</p>
                  <p className="font-medium">{localItem.created_by?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">Công ty</p>
                  <p className="font-medium">{localItem.company?.short_name || localItem.company?.name || '—'}</p>
                </div>
                {localItem.lead && (
                  <div className="md:col-span-2">
                    <p className="text-[11px] text-gray-500">{assignmentSourceFieldLabel(assignmentModule)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <LeadAssignmentLink assignment={localItem} />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-gray-500">Tạo lúc</p>
                  <p className="font-medium">{fmtDt(localItem.created_at)}</p>
                </div>
                <div>
                  <p className={`text-[11px] ${overdue ? 'text-red-500' : 'text-gray-500'}`}>Deadline</p>
                  <p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{fmtDt(localItem.deadline)}</p>
                </div>
              </div>

              {localItem.description && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600 font-semibold mb-1">📋 Mô tả công việc</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{localItem.description}</p>
                </div>
              )}

              <PipelineTaskNotesSection item={localItem} canEdit={canMove} onNotesSaved={onNotesSaved} />

              {/* Assignees */}
              <div>
                <p className="text-[11px] text-gray-500 mb-1">Giao cho ({assigneeList.length} nhân viên)</p>
                <div className="flex flex-wrap gap-1.5">
                  {assigneeList.length === 0 ? (
                    <span className="text-xs text-gray-400">Chưa giao</span>
                  ) : assigneeList.map((u) => (
                    <span key={u.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${String(u.id) === uid ? 'bg-blue-100 border-blue-300 text-blue-800 font-semibold' : 'bg-white border-gray-300 text-gray-700'}`}>
                      <span className="h-4 w-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold">{(u.full_name || '?').charAt(0)}</span>
                      {u.full_name}
                      {String(u.id) === uid && <span className="text-[9px]">(Bạn)</span>}
                    </span>
                  ))}
                </div>
              </div>

              <RequirementFilesGallery assignmentId={localItem.id} canUpload={isCreator} />

              <CommentSection assignmentId={localItem.id} />

              <SubmitFilesCompact assignmentId={localItem.id} canUpload={isAssignee || isCreator} />
            </div>

            <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-2 shrink-0">
              <button onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Đóng</button>
            </div>
          </div>
        </div>,
      )}
      {fillFormOpen && fillTask && linkedLeadId ? (
        <TaskFillFormModal
          leadId={linkedLeadId}
          task={fillTask}
          onClose={() => setFillFormOpen(false)}
          onSaved={(updated) => {
            if (updated) {
              setLocalItem((prev) => ({
                ...prev,
                crm_task: {
                  ...(prev.crm_task || {}),
                  form_data: updated.form_data ?? prev.crm_task?.form_data,
                  form_config: updated.form_config ?? prev.crm_task?.form_config,
                  show_fill_form: updated.show_fill_form ?? prev.crm_task?.show_fill_form,
                },
              }));
            }
            setFillFormOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// ─── ATTACHMENTS (file đính kèm nhiệm vụ) ────────────────────────────────────
// kind: 'req' (yêu cầu, do người giao) hoặc 'sub' (nộp bài, do NV làm)
function AttachmentsSection({ assignmentId, kind = 'req', canUpload = true, title, hint, color = 'blue', emptyText }) {
  const { apiBase } = useAssignmentsPageContext();
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`${apiBase}/${assignmentId}/files`, { params: { kind } });
      setFiles(r.data?.files || []);
    } catch { setFiles([]); }
    setLoading(false);
  }, [assignmentId, kind]);

  useEffect(() => { void load(); }, [load]);

  const onPick = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        await api.post(`${apiBase}/${assignmentId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      void load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi upload file. Nếu mới deploy, chạy migration database/194_crm_assignment_files.sql');
    }
    setUploading(false);
  };

  const remove = async (fileId) => {
    if (!confirm('Xoá file này?')) return;
    try {
      await api.delete(`${apiBase}/${assignmentId}/files/${fileId}`);
      void load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi xóa file');
    }
  };

  const fmtSize = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImg = (f) => (f.mime_type || '').startsWith('image/');
  const isVid = (f) => (f.mime_type || '').startsWith('video/');

  const palette = {
    blue:    { btn: 'bg-blue-600 hover:bg-blue-700',       border: 'border-blue-200',    bg: 'bg-blue-50/40' },
    emerald: { btn: 'bg-emerald-600 hover:bg-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50/40' },
  }[color] || { btn: 'bg-blue-600 hover:bg-blue-700', border: 'border-blue-200', bg: 'bg-blue-50/40' };

  return (
    <div className={`border rounded-xl ${palette.border} p-3 ${palette.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          {title} ({files.length})
        </h4>
        {canUpload && (
          <label className={`h-8 px-3 rounded-lg ${palette.btn} text-white text-xs font-medium flex items-center gap-1 cursor-pointer`}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Đang tải...' : 'Tải lên'}
            <input type="file" multiple onChange={onPick} disabled={uploading} className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.dwg,.dxf" />
          </label>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-500 mb-2">{hint}</p>}

      {loading ? (
        <p className="text-center text-xs text-gray-400 py-3">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-3">{emptyText || 'Chưa có file'}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 p-2 border rounded-lg bg-white hover:bg-gray-50 group">
              {isImg(f) ? (
                <a href={f.file_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={f.file_url} alt={f.file_name} className="h-10 w-10 object-cover rounded" />
                </a>
              ) : isVid(f) ? (
                <div className="h-10 w-10 rounded bg-purple-50 flex items-center justify-center text-lg shrink-0">🎬</div>
              ) : (
                <div className="h-10 w-10 rounded bg-blue-50 flex items-center justify-center shrink-0">
                  <FileIcon className="h-5 w-5 text-blue-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <a href={f.file_url} target="_blank" rel="noreferrer" className="text-sm text-gray-800 hover:text-blue-600 hover:underline truncate block" title={f.file_name}>
                  {f.file_name}
                </a>
                <p className="text-[10px] text-gray-400">
                  {fmtSize(f.file_size)} • {f.uploader?.full_name || ''}
                </p>
              </div>
              <a href={f.file_url} download={f.file_name} className="text-gray-400 hover:text-blue-600 cursor-pointer opacity-0 group-hover:opacity-100">
                <Download className="h-3.5 w-3.5" />
              </a>
              {(String(f.uploaded_by) === String(user?.id)) && (
                <button type="button" onClick={() => remove(f.id)} className="text-gray-400 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COMMENT THREAD (có trả lời) ─────────────────────────────────────────────
function groupAssignmentCommentsByParent(flat) {
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

function CommentSection({ assignmentId }) {
  const showOnScreen = useCommentShowOnScreenEnabled();
  const { apiBase } = useAssignmentsPageContext();
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'sales_admin'].includes(user?.role);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`${apiBase}/${assignmentId}/comments`);
      setComments(r.data?.comments || []);
    } catch { setComments([]); }
    setLoading(false);
  }, [apiBase, assignmentId]);

  useEffect(() => {
    if (!showOnScreen) {
      setComments([]);
      setLoading(false);
      return;
    }
    void load();
  }, [showOnScreen, load]);

  const commentsByParent = useMemo(() => groupAssignmentCommentsByParent(comments), [comments]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const v = text.trim();
    if (!v || posting) return;
    setPosting(true);
    try {
      const payload = { content: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      await api.post(`${apiBase}/${assignmentId}/comments`, payload);
      setText('');
      setReplyTo(null);
      void load();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi gửi'); }
    setPosting(false);
  };

  const saveEdit = async (cid) => {
    const v = editText.trim();
    if (!v) return;
    try {
      await api.put(`${apiBase}/${assignmentId}/comments/${cid}`, { content: v });
      setEditingId(null); setEditText('');
      void load();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
  };

  const remove = async (cid) => {
    if (!confirm('Xoá ghi chú này? Các trả lời liên quan cũng sẽ bị xoá.')) return;
    try { await api.delete(`${apiBase}/${assignmentId}/comments/${cid}`); void load(); } catch {}
  };

  const startReply = (c) => {
    setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' });
    setEditingId(null);
    setEditText('');
  };

  const fmt = (dt) => {
    try {
      const d = new Date(dt);
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const canEdit = (c) => String(c.user_id) === String(user?.id) || isAdmin;

  const renderCommentBranch = (parentKey, depth) => {
    const list = commentsByParent.get(parentKey) || [];
    return list.map((c) => (
      <div key={c.id} className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-3 pt-1' : ''}>
        <div className="flex items-start gap-2 group">
          <div className="h-7 w-7 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {(c.user?.full_name || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-800">{c.user?.full_name || 'Đã xóa'}</span>
                <span className="text-[10px] text-gray-400">{fmt(c.created_at)}</span>
                {c.updated_at && c.updated_at !== c.created_at && (
                  <span className="text-[10px] text-gray-400 italic">(đã sửa)</span>
                )}
              </div>
              {editingId === c.id ? (
                <div className="space-y-1">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border rounded text-sm outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => saveEdit(c.id)} className="h-7 px-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-pointer">Lưu</button>
                    <button type="button" onClick={() => { setEditingId(null); setEditText(''); }} className="h-7 px-2.5 rounded border text-xs cursor-pointer">Huỷ</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
              )}
            </div>
            {editingId !== c.id && (
              <div className="flex flex-wrap gap-2 mt-0.5 px-1 text-[11px] opacity-70 group-hover:opacity-100">
                <button type="button" onClick={() => startReply(c)} className="text-blue-600 hover:underline cursor-pointer">Trả lời</button>
                {canEdit(c) && (
                  <>
                    <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.content); setReplyTo(null); }} className="text-blue-600 hover:underline cursor-pointer">Sửa</button>
                    <button type="button" onClick={() => remove(c.id)} className="text-red-500 hover:underline cursor-pointer">Xoá</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {renderCommentBranch(String(c.id), depth + 1)}
      </div>
    ));
  };

  if (!showOnScreen) {
    return (
      <div className="border-t pt-3">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
          <MessageSquare className="h-4 w-4" />
          Ghi chú & bình luận
        </h4>
        <CommentDisplayHiddenBanner />
      </div>
    );
  }

  return (
    <div className="border-t pt-3">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
        <MessageSquare className="h-4 w-4" />
        Ghi chú & bình luận ({comments.length})
      </h4>

      <div className="space-y-2 max-h-72 overflow-y-auto mb-2">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-4">Đang tải...</p>
        ) : comments.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-4">Chưa có ghi chú nào</p>
        ) : (
          renderCommentBranch('__root__', 0)
        )}
      </div>

      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800">
          <span>Đang trả lời <strong>{replyTo.name}</strong></span>
          <button type="button" onClick={() => setReplyTo(null)} className="text-blue-600 hover:underline cursor-pointer shrink-0">Huỷ</button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
          }}
          rows={2}
          placeholder={replyTo ? `Trả lời ${replyTo.name}... (Ctrl+Enter để gửi)` : 'Thêm ghi chú/bình luận... (Ctrl+Enter để gửi)'}
          className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:border-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || posting}
          className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" />{replyTo ? 'Trả lời' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}


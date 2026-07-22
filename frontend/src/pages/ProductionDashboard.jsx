import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { isAdminLike, isSystemAdmin, isProductionAdmin, isProductionStaff } from '../lib/adminRole';
import {
  canPickWorkshopCompany,
  isCrossWorkshopProductionViewer,
  workshopCompaniesForCrossViewer,
  shouldShowDealCompanyFilter,
  isVptCompanyChip,
  productionCreateCompanyOptions,
  isDealParticipantProductionViewer,
  findVptCompany,
  isMetallaOrHucabiCompanyId,
  isAccountingUser,
  sxWorkshopFilterCompanies,
  resolveWorkshopCompanyForTypes,
  resolveStaffWorkshopCompanyId,
  isWorkshopProductionStaff,
  productionWorkshopFilterCompanies,
} from '../lib/crossWorkshopProduction';
import { formatVND, formatDate, formatStaffDisplayName, getStaffInitials } from '../lib/utils';
import { HIDE_PRODUCTION_DEAL_VALUES } from '../lib/hideProductionDealValues';
import { resolveSxProjectLeadId, resolveSxProjectLeadIdAsync, partitionSxProjectsByCommentSource } from '../lib/sxProjectComments';
import { CrmCommentMentionComposer } from '../components/crmCommentMentionUi';
import { resolveMentionIdsFromContent } from '../lib/crmCommentMentions';
import {
  getWorkshopDateRange, WS_TIME_PRESETS,
  workshopCreatedInRange, fetchWorkshopProjectPages, WS_KANBAN_LOAD_ALL_MAX,
} from '../lib/workshopDashboardUtils';
import {
  CheckCircle2, Search, X, Calendar, Plus,
  Factory, Users, LayoutGrid, List,
  CheckSquare, UserCheck, Loader2, Truck, Filter, Clock, Layers, Trash2, MessageSquare, Pin, Building2, ArrowRightLeft, Settings, ChevronDown, Eye, ChevronRight,
} from 'lucide-react';
import { ProductionListView, ProductionPlannerView, ProductionCalendarView, ProductionCommentsView, ProductionDeadlineView } from '../components/ProductionViews';
import WorkshopPipelineKanbanScroll, { useWorkshopKanbanScrollLayout } from '../components/WorkshopPipelineKanbanScroll';
import { useKanbanColumnTheme, UI_KANBAN_FIXED_CLASS, KANBAN_BOARD_COLUMN_RAILS_CLASS, KANBAN_COLUMN_RAIL_CLASS, KANBAN_COLUMN_VALUE_METRIC_CLASS, KANBAN_CARDS_BODY_CLASS, KANBAN_CARDS_BODY_EMPTY_PIN_CLASS, KANBAN_COLUMN_EMPTY_CLASS, KANBAN_COLUMN_EMPTY_PIN_CLASS, KANBAN_PIPELINE_CARD_CLASS, getKanbanPipelineCardBorderStyle, useKanbanEmptyPlaceholderStickyTop } from '../lib/kanbanColumnTheme';
import AssignedTasksToolbarButton from '../components/AssignedTasksToolbarButton';
import WorkshopDashboardFilterPanel, { SX_FILTER_TABS_META } from '../components/WorkshopDashboardFilterPanel';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import KanbanCardQuickMove from '../components/KanbanCardQuickMove';
import KanbanCardOptionsMenu from '../components/KanbanCardOptionsMenu';
import { useWorkshopStaffFilter } from '../hooks/useWorkshopStaffFilter';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
} from '../lib/workshopPipelineStorage';
import {
  SX_KANBAN_SEARCH_HIT_CLASS,
  SX_KANBAN_SEARCH_HIT_TW,
  findKanbanCard,
  scrollKanbanCardIntoView,
  useKanbanSearchHighlight,
} from '../lib/kanbanCardSearchHighlight';
import {
  buildSxPipelineStageMeta,
  computeSxRevenueKpis,
  countSxDeadlineViewOverdue,
  resolveSxProjectValue,
  resolveSxProjectRemaining,
  getSxPipelineStageSlaTone,
  resolveSxHandoverColumnId,
  shouldHideSxKanbanDeadlineOnCard,
  shouldIgnoreSxOrderDeliveryOverdue,
  getSxOrderDeliveryDateUrgency,
  VC_KANBAN_STATUSES,
} from '../lib/sxPipelineRevenue';
import { isProjectAlreadyInLogistics } from '../lib/projectLogistics';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import NewDealModal from '../components/NewDealModal';
import { DashboardLoaderGate } from '../components/DashboardLoaderGate';
import { isClickOutside } from '../lib/domUtils';
import { getCrmDeadlineUrgencyFromIso, getCrmDeadlineUrgencyBadgeClass } from '../lib/crmLeadDeadlineDisplay';
import { showCopyToast } from '../lib/copyToast';
import SearchInlineFilterChips, { SearchClearButton } from '../components/SearchInlineFilterChips';
import ViewModeDropdownMenu from '../components/ViewModeDropdownMenu';
import AnchoredDropdownMenu from '../components/AnchoredDropdownMenu';

const INTAKE_BUCKET = 'won_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'deadline', 'comments', 'calendar'];

const SX_VIEW_MODES = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'list', icon: List, label: 'Danh sách' },
  { id: 'planner', icon: Users, label: 'Planner' },
  { id: 'deadline', icon: Clock, label: 'Deadline' },
  { id: 'comments', icon: MessageSquare, label: 'Bình luận' },
  { id: 'calendar', icon: Calendar, label: 'Lịch' },
];
const SX_ALT_VIEW_MODES = SX_VIEW_MODES.filter((v) => v.id !== 'kanban');

const LS_SX = 'sx_dash_filters_v1';
const LS_SX_FILTER_PANEL_POS = 'sx_filter_panel_pos';
const LS_SX_KANBAN_COLUMN_SCROLL = 'sx_kanban_column_scroll_mode';
const KANBAN_COLUMN_SCROLL_MODES = ['unified', 'per-column'];
const KANBAN_DEFAULT_COLUMN_SCROLL_MODE = 'unified';

function readStoredSxFilterPanelPos() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_SX_FILTER_PANEL_POS);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function storeSxFilterPanelPos(pos) {
  if (typeof window === 'undefined') return;
  try {
    if (!pos) localStorage.removeItem(LS_SX_FILTER_PANEL_POS);
    else localStorage.setItem(LS_SX_FILTER_PANEL_POS, JSON.stringify(pos));
  } catch { /* ignore */ }
}
function readSxDashPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_SX);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // NV xưởng: sửa filter công ty xưởng khác còn trong localStorage (vd. Metalla khi user thuộc HCB).
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      const ownWs = resolveStaffWorkshopCompanyId(u, []);
      if (ownWs && data.filterCompany && String(data.filterCompany) !== ownWs) {
        data.filterCompany = ownWs;
      }
    } catch { /* ignore */ }
    return data;
  } catch {
    try { localStorage.removeItem(LS_SX); } catch { /* ignore */ }
    return null;
  }
}

function scheduleCrmBadgeRefresh(projectId) {
  if (!projectId || typeof window === 'undefined') return;
  const pid = String(projectId);
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', { detail: { projectId: pid } }));
  }, 280);
}

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

function formatAgeDetailed(fromIso) {
  if (!fromIso) return '—';
  const ms = Date.now() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Vừa xong';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return 'Vừa xong';
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  return `${mins} phút`;
}

function formatRemainingMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  const abs = Math.max(0, Math.floor(Math.abs(ms)));
  const totalMin = Math.floor(abs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  return `${mins} phút`;
}

const ONE_DAY_MS = 86400000;

/** Phân mức cảnh báo deadline → quyết định màu / pulse trên badge. */
function getDeadlineUrgency(dateLike) {
  if (!dateLike) return null;
  const ts = new Date(dateLike).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = ts - Date.now();
  if (diffMs < 0) return { tone: 'overdue', diffMs, pulse: true };
  if (diffMs <= ONE_DAY_MS) return { tone: 'urgent', diffMs, pulse: true };
  if (diffMs <= 3 * ONE_DAY_MS) return { tone: 'soon', diffMs, pulse: false };
  return { tone: 'normal', diffMs, pulse: false };
}

const DEADLINE_TONE_CLASS = {
  overdue: 'bg-red-600 text-white border-red-700',
  urgent: 'bg-rose-100 text-rose-700 border-rose-300',
  soon: 'bg-amber-100 text-amber-800 border-amber-300',
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** Pill cảnh báo deadline thống nhất. */
function DeadlineBadge({ date, icon = '📅', label = 'Hạn', suppressUrgency = false }) {
  if (!date) return null;
  const u = suppressUrgency
    ? { tone: 'normal', pulse: false }
    : getDeadlineUrgency(date);
  if (!u) return null;
  const cls = DEADLINE_TONE_CLASS[u.tone] || DEADLINE_TONE_CLASS.normal;
  const dateText = formatDate(date);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls} ${u.pulse ? 'animate-pulse' : ''}`}
      title={`${label}: ${dateText}`}
    >
      <span aria-hidden>{icon}</span>
      {dateText}
    </span>
  );
}

const SX_SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'oldest', label: 'Cũ nhất' },
  { id: 'deadline_asc', label: 'Deadline gần nhất' },
  { id: 'value_desc', label: 'Giá trị cao → thấp' },
  { id: 'value_asc', label: 'Giá trị thấp → cao' },
  { id: 'name_asc', label: 'Tên A → Z' },
];

const SX_SORT_OPTIONS_VISIBLE = HIDE_PRODUCTION_DEAL_VALUES
  ? SX_SORT_OPTIONS.filter((o) => o.id !== 'value_desc' && o.id !== 'value_asc')
  : SX_SORT_OPTIONS;

function projectMatchesDealCompanyExternalFilter(project, externalFilter) {
  if (!externalFilter) return true;
  const deals = Array.isArray(project?.crm_deals) ? project.crm_deals : [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  if (!deal) return false;
  if (externalFilter.catalogId && deal.external_catalog_id
    && String(deal.external_catalog_id) === String(externalFilter.catalogId)) {
    return true;
  }
  if (externalFilter.name) {
    const dealName = String(deal.external_company_name || '').trim();
    if (dealName && dealName === externalFilter.name) return true;
  }
  return false;
}

function prioritizePinnedProjects(items) {
  if (!Array.isArray(items) || items.length < 2) return items || [];
  const pinned = [];
  const rest = [];
  for (const it of items) {
    if (it?.is_pinned) pinned.push(it);
    else rest.push(it);
  }
  return pinned.length ? pinned.concat(rest) : items;
}

function sortProjectsBy(items, sortBy) {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  const cloned = [...items];
  const toTs = (d) => (d ? new Date(d).getTime() || 0 : 0);
  const toNum = (v) => Number(v) || 0;
  switch (sortBy) {
    case 'oldest': return cloned.sort((a, b) => toTs(a.created_at) - toTs(b.created_at));
    case 'deadline_asc': return cloned.sort((a, b) => {
      const da = toTs(a.production_deadline || a.deadline);
      const db = toTs(b.production_deadline || b.deadline);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return da - db;
    });
    case 'value_desc': return cloned.sort((a, b) => toNum(b.production_value) - toNum(a.production_value));
    case 'value_asc': return cloned.sort((a, b) => toNum(a.production_value) - toNum(b.production_value));
    case 'name_asc': return cloned.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
    case 'newest':
    default: return cloned.sort((a, b) => toTs(b.created_at) - toTs(a.created_at));
  }
}

export default function ProductionDashboard() {
  const P0 = useMemo(() => readSxDashPersisted(), []);
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const crossWorkshopViewer = isCrossWorkshopProductionViewer(user);

  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [firstLoaded, setFirstLoaded] = useState(false);
  /** Flash ngắn «Đã lọc xong» sau khi sync/load filter hoàn tất. */
  const [filterAppliedHint, setFilterAppliedHint] = useState(false);
  const wasFilterBusyRef = useRef(false);
  const loadSeqRef = useRef(0);
  const sxLoaderGateRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState(() => (typeof P0?.searchQuery === 'string' ? P0.searchQuery : ''));
  const [priorityFilter, setPriorityFilter] = useState(() => (typeof P0?.priorityFilter === 'string' ? P0.priorityFilter : ''));
  const [stageFilter, setStageFilter] = useState(() => (typeof P0?.stageFilter === 'string' ? P0.stageFilter : ''));
  const [viewMode, setViewMode] = useState(() => {
    const v = P0?.viewMode;
    return WS_DASH_VIEW_MODES.includes(v) ? v : 'kanban';
  });
  const [sortBy, setSortBy] = useState(() => {
    const v = P0?.sortBy;
    return SX_SORT_OPTIONS_VISIBLE.some((o) => o.id === v) ? v : 'newest';
  });
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuRef = useRef(null);
  const [companies, setCompanies] = useState([]);
  const [workshopOptionsForDeal, setWorkshopOptionsForDeal] = useState([]);
  /** Công ty đặt hàng theo xưởng — CRM + danh mục ngoài (giống modal Tạo deal). */
  const [clientCompaniesForDeal, setClientCompaniesForDeal] = useState([]);
  const [filterCompany, setFilterCompany] = useState(() => P0?.filterCompany ?? '');
  const [filterDealCompany, setFilterDealCompany] = useState(() => P0?.filterDealCompany ?? '');
  const [filterSxWorkshopCompany, setFilterSxWorkshopCompany] = useState(() => P0?.filterSxWorkshopCompany ?? '');
  const [timePreset, setTimePreset] = useState(() => P0?.timePreset ?? '');
  const [customFrom, setCustomFrom] = useState(() => P0?.customFrom ?? '');
  const [customTo, setCustomTo] = useState(() => P0?.customTo ?? '');
  const [showCustomDate, setShowCustomDate] = useState(
    () => !!P0?.showCustomDate || P0?.timePreset === 'custom',
  );
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [kanbanLoadKey, setKanbanLoadKey] = useState(() => P0?.kanbanLoadKey ?? '500');
  const [filterPhone, setFilterPhone] = useState(() => P0?.filterPhone ?? '');
  const [showAdvFilter, setShowAdvFilter] = useState(() => !!P0?.showAdvFilter);
  const [sxFilterTab, setSxFilterTab] = useState(() => P0?.sxFilterTab || 'employee');
  const [filterPanelPos, setFilterPanelPos] = useState(() => readStoredSxFilterPanelPos());
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestDismissed, setSearchSuggestDismissed] = useState(false);
  const {
    highlightId: kanbanSearchHighlightId,
    triggerHighlight: triggerKanbanSearchHighlight,
    clearHighlight: clearKanbanSearchHighlight,
  } = useKanbanSearchHighlight('data-sx-kanban-card', {
    hitClass: SX_KANBAN_SEARCH_HIT_CLASS,
  });
  const filterPanelRef = useRef(null);
  const filterPanelDragRef = useRef(null);
  const [filterWorkTypeId, setFilterWorkTypeId] = useState(() => P0?.filterWorkTypeId ?? '');
  const filterWorkTypeIdRef = useRef(filterWorkTypeId);
  filterWorkTypeIdRef.current = filterWorkTypeId;
  const [workTypes, setWorkTypes] = useState([]);
  /** Công ty mà danh sách `workTypes` hiện tại thuộc về — chống dùng nhầm loại của công ty cũ khi đổi công ty. */
  const [workTypesCompanyId, setWorkTypesCompanyId] = useState('');
  /** true khi đang fetch /workshop/project-types — chặn load() với phân loại cũ (regression c6e2f07d). */
  const [workTypesFetching, setWorkTypesFetching] = useState(false);
  /** Hiện cột ảo «Chưa phân loại» ở đầu Kanban — gom các project chưa có workshop_type_id. */
  const [showOrphanColumn, setShowOrphanColumn] = useState(() => !!P0?.showOrphanColumn);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [allUsers, setAllUsers] = useState([]);
  const [showBulkDeadline, setShowBulkDeadline] = useState(false);
  const [showBulkPerson, setShowBulkPerson] = useState(false);
  const [showBulkWorkType, setShowBulkWorkType] = useState(false);
  const [bulkDeadlineVal, setBulkDeadlineVal] = useState('');
  const [bulkPersonId, setBulkPersonId] = useState('');
  const [bulkWorkTypeId, setBulkWorkTypeId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [handoverModal, setHandoverModal] = useState(null); // { projectId, projectName }
  const [handoverTargetSxColId, setHandoverTargetSxColId] = useState('');
  const [handoverLogisticsCompanyId, setHandoverLogisticsCompanyId] = useState('');
  const [handoverLogisticsCompanies, setHandoverLogisticsCompanies] = useState([]);
  const [handoverDeliveryTeamId, setHandoverDeliveryTeamId] = useState('');
  const [handoverInstallationTeamId, setHandoverInstallationTeamId] = useState('');
  const [handoverDeliveryTeams, setHandoverDeliveryTeams] = useState([]);
  const [handoverInstallationTeams, setHandoverInstallationTeams] = useState([]);
  const [handoverErr, setHandoverErr] = useState('');
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [switchWorkshopModal, setSwitchWorkshopModal] = useState(null);
  const [switchWorkshopSaving, setSwitchWorkshopSaving] = useState(false);
  const [commentsIndex, setCommentsIndex] = useState({});
  const [kanbanCommentItem, setKanbanCommentItem] = useState(null);
  const [kanbanCommentBody, setKanbanCommentBody] = useState('');
  const [kanbanCommentPosting, setKanbanCommentPosting] = useState(false);
  const [kanbanCommentMembers, setKanbanCommentMembers] = useState([]);
  const [kanbanCommentLeadId, setKanbanCommentLeadId] = useState(null);
  const [deadlineCtx, setDeadlineCtx] = useState(null);
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showKanbanSettings, setShowKanbanSettings] = useState(false);
  const kanbanSettingsTriggerRef = useRef(null);
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const viewModeTriggerRef = useRef(null);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const pendingSxSearchFocusRef = useRef(null);
  const [kanbanColumnScrollMode, setKanbanColumnScrollMode] = useState(() => {
    const fromP = P0?.kanbanColumnScrollMode;
    if (fromP && KANBAN_COLUMN_SCROLL_MODES.includes(fromP)) return fromP;
    try {
      const s = localStorage.getItem(LS_SX_KANBAN_COLUMN_SCROLL);
      if (s && KANBAN_COLUMN_SCROLL_MODES.includes(s)) return s;
    } catch {
      /* ignore */
    }
    return KANBAN_DEFAULT_COLUMN_SCROLL_MODE;
  });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /** Từ thông báo workshop_new_deal (?open=projectId) → highlight thẻ trên Kanban SX. */
  useEffect(() => {
    const openId = searchParams.get('open') || searchParams.get('project');
    if (!openId) return;
    markWorkshopPipelineCardFocus(openId, 'sx');
    if (viewMode !== 'kanban') setViewMode('kanban');
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    next.delete('project');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, viewMode]);

  const staffFilter = useWorkshopStaffFilter({
    user,
    isAdmin,
    companies,
    filterCompany,
    setFilterCompany,
    dealCompanyFilter: filterDealCompany,
    forModule: 'production',
    persisted: P0,
  });

  const {
    isCompanyScopedAdmin,
    userCompanyId,
    dashboardScopeCompanyId,
    filterRegion,
    setFilterRegion,
    filterPersonId,
    setFilterPersonId,
    filterPersonName,
    setFilterPersonName,
    companyRegions,
    companyEmployees,
    companyDepts,
    employeeFilterListByRegion,
    employeeOptionsForSelect,
    assigneeListSearch,
    setAssigneeListSearch,
    onCompanyChange: onStaffFilterCompanyChange,
    resetStaffFilters,
    matchesProject,
    staffFilterActiveCount,
  } = staffFilter;

  const showDealCompanyFilter = useMemo(
    () => shouldShowDealCompanyFilter(user, companies),
    [user, companies],
  );

  const dealCompanyOptions = useMemo(
    () => (clientCompaniesForDeal.length > 0 ? clientCompaniesForDeal : []),
    [clientCompaniesForDeal],
  );

  const clientCrmDealOptions = useMemo(
    () => dealCompanyOptions.filter((c) => c.client_company_id),
    [dealCompanyOptions],
  );
  const clientExternalDealOptions = useMemo(
    () => dealCompanyOptions.filter((c) => !c.client_company_id),
    [dealCompanyOptions],
  );

  const resolvedDealCompanyPick = useMemo(() => {
    if (!filterDealCompany) return null;
    return dealCompanyOptions.find((c) => String(c.id) === String(filterDealCompany)) || null;
  }, [filterDealCompany, dealCompanyOptions]);

  const dealCompanyParam = useMemo(() => {
    if (resolvedDealCompanyPick?.client_company_id) {
      return String(resolvedDealCompanyPick.client_company_id);
    }
    if (filterDealCompany && !String(filterDealCompany).startsWith('ext:')) {
      return String(filterDealCompany);
    }
    if (showDealCompanyFilter && !isAdmin && !isSystemAdmin(user) && user?.company_id) {
      return String(user.company_id);
    }
    return undefined;
  }, [resolvedDealCompanyPick, filterDealCompany, showDealCompanyFilter, user, isAdmin]);

  const dealCompanyExternalFilter = useMemo(() => {
    if (!resolvedDealCompanyPick || resolvedDealCompanyPick.client_company_id) return null;
    const rawId = String(resolvedDealCompanyPick.id || '');
    const catalogId = resolvedDealCompanyPick.external_catalog_id
      || (rawId.startsWith('ext:') ? rawId.slice(4) : null);
    return {
      catalogId,
      name: String(resolvedDealCompanyPick.short_name || resolvedDealCompanyPick.name || '').trim(),
    };
  }, [resolvedDealCompanyPick]);

  const canPickDealCompany = isSystemAdmin(user) && showDealCompanyFilter;

  const canPickCompany = canPickWorkshopCompany(user, isAdmin, isCompanyScopedAdmin);
  const workshopCompanyPickerList = useMemo(() => {
    // Admin hệ thống: hiện toàn bộ công ty backend trả về cho module SX (đã lọc tenant + division ở /api/companies?for_module=production).
    // Không hard-code HCB/Metalla nữa — hệ sinh thái có thể có nhiều công ty SX khác.
    if (isAdmin && !dealCompanyParam) {
      return companies || [];
    }
    if (workshopOptionsForDeal.length) {
      const ids = new Set(workshopOptionsForDeal.map((w) => String(w.id)));
      const fromApi = (companies || []).filter((c) => ids.has(String(c.id)));
      if (fromApi.length) return fromApi;
      return workshopOptionsForDeal;
    }
    const staffWs = resolveStaffWorkshopCompanyId(user, companies);
    if (staffWs) {
      const own = (companies || []).find((c) => String(c.id) === staffWs);
      return own ? [own] : [{ id: staffWs, name: staffWs, short_name: staffWs }];
    }
    return workshopCompaniesForCrossViewer(companies, user);
  }, [companies, user, workshopOptionsForDeal, dealCompanyParam, isAdmin]);

  const selectedDealCompanyLabel = useMemo(() => {
    if (resolvedDealCompanyPick) {
      return resolvedDealCompanyPick.short_name || resolvedDealCompanyPick.name || '';
    }
    const id = showDealCompanyFilter && user?.company_id ? String(user.company_id) : '';
    if (!id) return '';
    const c = dealCompanyOptions.find((x) => String(x.id) === String(id) || String(x.client_company_id) === id)
      || companies.find((x) => String(x.id) === id);
    return c?.short_name || c?.name || '';
  }, [resolvedDealCompanyPick, showDealCompanyFilter, user?.company_id, dealCompanyOptions, companies]);

  const deferredPersonName = useDeferredValue(filterPersonName);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const handleStaffFilterCompanyChange = useCallback((companyId) => {
    const next = companyId ? String(companyId) : '';
    const prev = String(filterCompany || '');
    onStaffFilterCompanyChange(companyId);
    // Chỉ xóa phân loại khi user đổi xưởng (không xóa lúc khởi tạo công ty từ localStorage).
    if (next && prev && next !== prev) {
      setFilterWorkTypeId('');
      setFilterSxWorkshopCompany('');
    }
  }, [onStaffFilterCompanyChange, filterCompany]);

  const handleDealCompanyChange = useCallback((dealCompanyId) => {
    setFilterDealCompany(dealCompanyId);
    // workTypes refetch theo deal_company_id — effect bên dưới tự reset nếu loại không còn hợp lệ.
  }, []);

  const companyParam = useMemo(() => {
    const staffWs = resolveStaffWorkshopCompanyId(user, companies);
    if (staffWs) return staffWs;
    if (filterCompany) return String(filterCompany);
    return undefined;
  }, [filterCompany, user, companies]);

  const showVptSxWorkshopFilter = useMemo(() => {
    const cid = companyParam || filterCompany || user?.company_id || '';
    return isVptCompanyChip(cid, companies, user);
  }, [companyParam, filterCompany, companies, user]);

  const sxWorkshopFilterOptions = useMemo(
    () => sxWorkshopFilterCompanies(companies, user),
    [companies, user],
  );

  const companyForTypes = useMemo(() => resolveWorkshopCompanyForTypes({
    filterCompany: companyParam || filterCompany,
    filterSxWorkshopCompany,
    userCompanyId: user?.company_id,
    user,
    showVptSxWorkshopFilter,
    companies,
  }), [companyParam, filterCompany, filterSxWorkshopCompany, user, showVptSxWorkshopFilter, companies]);

  const productionCreateCompanyIdDefault = useMemo(() => {
    if (filterCompany && isMetallaOrHucabiCompanyId(filterCompany, companies, user)) return String(filterCompany);
    if (filterSxWorkshopCompany) return String(filterSxWorkshopCompany);
    const opts = productionCreateCompanyOptions(companies);
    return opts[0]?.id ? String(opts[0].id) : '';
  }, [filterCompany, filterSxWorkshopCompany, companies]);

  /** Cùng company_id như modal Tạo deal → GET /production/client-companies */
  const clientCompaniesWorkshopId = productionCreateCompanyIdDefault;

  const vptExternalCompanyLabel = useMemo(() => {
    const vpt = findVptCompany(companies);
    return vpt?.short_name || vpt?.name || 'VPT';
  }, [companies]);

  const canPickProductionCreateCompany = crossWorkshopViewer || isDealParticipantProductionViewer(user) || isAccountingUser(user);

  const sxLoaderCompanyName = useMemo(() => {
    if (filterCompany) {
      const c = companies.find((x) => String(x.id) === String(filterCompany));
      return c?.short_name || c?.name || '';
    }
    if (filterDealCompany) {
      const c = dealCompanyOptions.find((x) => String(x.id) === String(filterDealCompany));
      return c?.short_name || c?.name || '';
    }
    if (filterSxWorkshopCompany) {
      const c = sxWorkshopFilterOptions.find((x) => String(x.id) === String(filterSxWorkshopCompany));
      return c?.short_name || c?.name || '';
    }
    return '';
  }, [filterCompany, filterDealCompany, filterSxWorkshopCompany, companies, dealCompanyOptions, sxWorkshopFilterOptions]);

  const load = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    const bustCache = !!opts.bustCache;
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    const fetchCompanyId = opts.companyId || companyParam;
    const fetchDealCompanyId = opts.dealCompanyId !== undefined ? opts.dealCompanyId : dealCompanyParam;
    const fetchSxWorkshopId = opts.sxWorkshopCompanyId !== undefined
      ? opts.sxWorkshopCompanyId
      : (showVptSxWorkshopFilter && filterSxWorkshopCompany ? filterSxWorkshopCompany : undefined);
    if (silent) setSyncing(true);
    else {
      setLoading(true);
      sxLoaderGateRef.current?.start();
    }
    const markLoadComplete = () => {
      if (isStale()) return;
      if (silent) {
        setSyncing(false);
        return;
      }
      sxLoaderGateRef.current?.finish(() => {
        if (isStale()) return;
        setLoading(false);
        setFirstLoaded(true);
      });
    };
    try {
      const maxRecords = kanbanLoadKey === 'all' ? WS_KANBAN_LOAD_ALL_MAX
        : Math.min(parseInt(kanbanLoadKey, 10) || 500, WS_KANBAN_LOAD_ALL_MAX);
      const workshopTypeFilter = opts.workshopTypeId !== undefined
        ? (opts.workshopTypeId ? String(opts.workshopTypeId) : undefined)
        : (filterWorkTypeIdRef.current ? String(filterWorkTypeIdRef.current) : undefined);

      // KPI tính từ scopeProjects (scopeKpis) — không gọi /dashboard (trùng /projects).
      // Cột Kanban do effect `/production/pipeline-stages`.
      const projectList = await fetchWorkshopProjectPages(api, '/production/projects', {
        companyId: fetchCompanyId,
        dealCompanyId: fetchDealCompanyId,
        sxWorkshopCompanyId: fetchSxWorkshopId,
        workshopTypeId: workshopTypeFilter,
        maxRecords,
        pageSize: 500,
        bustCache,
        view: 'kanban',
      }).catch(() => null);
      if (projectList !== null) setProjects(projectList);
      if (!isStale()) markLoadComplete();
    } catch (e) {
      console.error(e);
      if (!isStale()) {
        if (silent) setSyncing(false);
        else {
          sxLoaderGateRef.current?.reset();
          setLoading(false);
          setFirstLoaded(true);
        }
      }
    }
  }, [companyParam, dealCompanyParam, kanbanLoadKey, showVptSxWorkshopFilter, filterSxWorkshopCompany]);

  /** Chờ phân loại theo đúng công ty xưởng — cho phép filterWorkTypeId rỗng (= Tất cả). */
  const dataLoadReady = !workTypesFetching && workTypesCompanyId === companyForTypes;

  useEffect(() => {
    if (!dataLoadReady) return;
    load();
  }, [
    dataLoadReady,
    load,
    companyParam,
    dealCompanyParam,
    kanbanLoadKey,
    showVptSxWorkshopFilter,
    filterSxWorkshopCompany,
  ]);

  /** Tránh spinner vô hạn nếu phân loại xưởng / API treo */
  useEffect(() => {
    if (firstLoaded) return undefined;
    const t = window.setTimeout(() => {
      if (firstLoaded) return;
      console.warn('[sx-dashboard] load timeout — hiển thị dashboard');
      sxLoaderGateRef.current?.reset();
      setLoading(false);
      setFirstLoaded(true);
      void load({ bustCache: true });
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [firstLoaded, load]);

  const prevWorkTypeForReloadRef = useRef(filterWorkTypeId);
  useEffect(() => {
    if (workTypesCompanyId !== companyForTypes) return;
    const prev = prevWorkTypeForReloadRef.current;
    prevWorkTypeForReloadRef.current = filterWorkTypeId;
    if (prev === filterWorkTypeId) return;
    // Đổi loại (kể cả → «Tất cả» / «Chưa phân loại») → tải lại project theo filter API.
    load({ silent: true, bustCache: true });
  }, [filterWorkTypeId, load, workTypesCompanyId, companyForTypes]);

  const handleNewDealCreated = useCallback(async (created) => {
    const projectId = created?.project_id;
    const wktId = created?.workshop_type_id ? String(created.workshop_type_id) : '';
    const createdCompanyId = created?.company_id ? String(created.company_id) : '';

    if (isAdmin && createdCompanyId && isMetallaOrHucabiCompanyId(createdCompanyId, companies)
      && createdCompanyId !== String(filterCompany || '')) {
      const onVptChip = isVptCompanyChip(filterCompany || user?.company_id || '', companies, user);
      if (onVptChip) {
        setFilterSxWorkshopCompany(createdCompanyId);
      } else {
        setFilterCompany(createdCompanyId);
      }
    }
    if (canPickProductionCreateCompany && createdCompanyId && isMetallaOrHucabiCompanyId(createdCompanyId, companies)) {
      const onVptChip = isVptCompanyChip(filterCompany || user?.company_id || '', companies, user);
      if (onVptChip) {
        setFilterSxWorkshopCompany(createdCompanyId);
      } else {
        setFilterCompany(createdCompanyId);
      }
    }
    if (wktId && wktId !== String(filterWorkTypeId || '')) {
      setFilterWorkTypeId(wktId);
    }

    const reloadCompanyId = (() => {
      if (isMetallaOrHucabiCompanyId(createdCompanyId, companies)) {
        if (isVptCompanyChip(filterCompany || user?.company_id || '', companies, user)) {
          return filterCompany || user?.company_id || companyParam;
        }
        return createdCompanyId;
      }
      return companyParam;
    })();
    const reloadDealCompanyId = dealCompanyParam;
    const reloadSxWorkshopId = (() => {
      if (canPickProductionCreateCompany && isMetallaOrHucabiCompanyId(createdCompanyId, companies)
        && isVptCompanyChip(filterCompany || user?.company_id || '', companies, user)) {
        return createdCompanyId;
      }
      return showVptSxWorkshopFilter && filterSxWorkshopCompany ? filterSxWorkshopCompany : undefined;
    })();

    try {
      await load({
        silent: true,
        bustCache: true,
        companyId: reloadCompanyId,
        dealCompanyId: reloadDealCompanyId,
        sxWorkshopCompanyId: reloadSxWorkshopId,
      });
    } catch (e) {
      console.error(e);
      alert('Đã tạo đơn xưởng nhưng tải lại danh sách thất bại — thử F5 trang.');
      return;
    }

    if (!projectId) return;

    setProjects((prev) => {
      if (prev.some((p) => String(p.id) === String(projectId))) return prev;
      const intakeCol = pipeline.find((s) => s.bucket_slug === 'won_pending') || pipeline[0] || null;
      const optimistic = {
        id: projectId,
        code: created.project_code,
        name: created.project_name,
        company_id: createdCompanyId || companyParam || null,
        created_at: new Date().toISOString(),
        status: 'consulting',
        current_stage_id: null,
        sx_intake: true,
        sx_won_deal: true,
        sx_kanban_column_id: intakeCol?.id || null,
        workshop_type_id: wktId || null,
        workshop_type: wktId
          ? (workTypes.find((w) => String(w.id) === wktId) || { id: wktId, name: '' })
          : null,
        customer: (created.customer_name || created.customer_phone)
          ? { full_name: created.customer_name || '', phone: created.customer_phone || '' }
          : null,
        crm_deals: created.deal_id
          ? [{ id: created.deal_id, code: created.deal_code, type: 'deal' }]
          : [],
        tasks: [],
      };
      return [optimistic, ...prev];
    });
  }, [load, pipeline, workTypes, companyParam, dealCompanyParam, filterCompany, filterWorkTypeId, companies, user, showVptSxWorkshopFilter, filterSxWorkshopCompany, canPickProductionCreateCompany]);

  /**
   * Nguồn DUY NHẤT của cột Kanban (`pipeline`).
   * - Có filterWorkTypeId (uuid): chỉ cột của phân loại đó (+ global/intake theo BE).
   * - Rỗng («Tất cả»): bỏ workshop_type_id → toàn bộ cột của công ty xưởng.
   * - «none»: cột global / intake (chưa phân loại).
   * Chờ workTypesCompanyId khớp để tránh nhảy cột khi đổi công ty.
   */
  useEffect(() => {
    // workTypes chưa khớp công ty hiện hành (đang refetch) → chờ, tránh tải nhầm cột.
    if (workTypesCompanyId !== companyForTypes) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const params = { all: 'false' };
        if (companyParam) params.company_id = companyParam;
        // «Tất cả» → không gửi workshop_type_id. «Chưa phân loại» → global.
        if (filterWorkTypeId === 'none') params.workshop_type_id = 'global';
        else if (filterWorkTypeId) params.workshop_type_id = filterWorkTypeId;
        const { data } = await api.get('/production/pipeline-stages', { params });
        if (cancelled) return;
        setPipeline(Array.isArray(data) ? data : []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [companyParam, companyForTypes, filterWorkTypeId, workTypesCompanyId]);

  useEffect(() => {
    if (!dealCompanyParam) {
      setWorkshopOptionsForDeal([]);
      return;
    }
    let cancel = false;
    api.get('/production/workshop-options', { params: { deal_company_id: dealCompanyParam } })
      .then((r) => {
        if (!cancel) setWorkshopOptionsForDeal(r.data?.workshops || []);
      })
      .catch(() => {
        if (!cancel) setWorkshopOptionsForDeal([]);
      });
    return () => { cancel = true; };
  }, [dealCompanyParam]);

  useEffect(() => {
    const cid = String(clientCompaniesWorkshopId || '').trim();
    if (!cid) {
      setClientCompaniesForDeal([]);
      return;
    }
    let cancel = false;
    api.get('/production/client-companies', { params: { company_id: cid } })
      .then((r) => {
        if (!cancel) setClientCompaniesForDeal(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => {
        if (!cancel) setClientCompaniesForDeal([]);
      });
    return () => { cancel = true; };
  }, [clientCompaniesWorkshopId]);

  useEffect(() => {
    if (!filterDealCompany || !dealCompanyOptions.length || !isSystemAdmin(user)) return;
    const ok = dealCompanyOptions.some((c) => String(c.id) === String(filterDealCompany));
    if (!ok) setFilterDealCompany('');
  }, [dealCompanyOptions, filterDealCompany, user]);

  useEffect(() => {
    if (!workshopCompanyPickerList.length || isAdmin) return;
    const staffWs = resolveStaffWorkshopCompanyId(user, companies);
    if (staffWs && String(filterCompany || '') !== staffWs) {
      handleStaffFilterCompanyChange(staffWs);
      return;
    }
    if (filterCompany && workshopCompanyPickerList.some((c) => String(c.id) === String(filterCompany))) return;
    const own = user?.company_id
      ? workshopCompanyPickerList.find((c) => String(c.id) === String(user.company_id))
      : null;
    const pick = own || workshopCompanyPickerList[0];
    if (pick?.id) handleStaffFilterCompanyChange(pick.id);
  }, [workshopCompanyPickerList, filterCompany, handleStaffFilterCompanyChange, isAdmin, user, companies]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!showDealCompanyFilter || filterDealCompany || isAdmin) return;
    if (user?.company_id) setFilterDealCompany(String(user.company_id));
  }, [showDealCompanyFilter, filterDealCompany, user?.company_id, isAdmin]);

  useEffect(() => {
    if (filterCompany || !companies.length || isSystemAdmin(user)) return;
    if (dealCompanyParam) return;
    const list = workshopCompanyPickerList;
    if (!list.length) return;
    const ownWorkshop = user?.company_id
      ? list.find((c) => String(c.id) === String(user.company_id))
      : null;
    if (ownWorkshop?.id) {
      handleStaffFilterCompanyChange(ownWorkshop.id);
      return;
    }
    if (!user?.company_id && (isProductionAdmin(user) || isProductionStaff(user))) {
      handleStaffFilterCompanyChange(list[0].id);
    }
  }, [companies, filterCompany, user, handleStaffFilterCompanyChange, workshopCompanyPickerList, dealCompanyParam]);

  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) setFilterCompany('');
  }, [isAdmin, filterCompany, companies]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SX, JSON.stringify({
        filterCompany, filterDealCompany, filterSxWorkshopCompany, timePreset, customFrom, customTo, showCustomDate, kanbanLoadKey,
        filterPersonId, filterPersonName, filterRegion, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode, sortBy,
        showOrphanColumn, showAdvFilter, sxFilterTab, kanbanColumnScrollMode,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, filterDealCompany, filterSxWorkshopCompany, timePreset, customFrom, customTo, showCustomDate, kanbanLoadKey, filterPersonId, filterPersonName,
    filterRegion, filterPhone, filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode, sortBy,
    showOrphanColumn, showAdvFilter, sxFilterTab, kanbanColumnScrollMode,
  ]);

  // Đóng menu sắp xếp khi click ra ngoài
  useEffect(() => {
    if (!sortOpen) return undefined;
    const onDown = (e) => {
      if (isClickOutside(sortMenuRef.current, e)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortOpen]);

  useEffect(() => {
    if (!companyForTypes) {
      setWorkTypes([]);
      setWorkTypesCompanyId('');
      setWorkTypesFetching(false);
      return undefined;
    }
    let cancelled = false;
    setWorkTypesFetching(true);
    setWorkTypes([]);
    // Chỉ gắn công ty sau khi fetch xong — tránh dataLoadReady=true với phân loại cũ (c6e2f07d).
    setWorkTypesCompanyId('');
    const typeParams = { company_id: companyForTypes, module: 'production' };
    if (dealCompanyParam) typeParams.client_company_id = dealCompanyParam;
    api.get('/workshop/project-types', { params: typeParams })
      .then((r) => {
        if (cancelled) return;
        setWorkTypes(Array.isArray(r.data) ? r.data : []);
        setWorkTypesCompanyId(companyForTypes);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkTypes([]);
        setWorkTypesCompanyId(companyForTypes);
      })
      .finally(() => {
        if (!cancelled) setWorkTypesFetching(false);
      });
    return () => { cancelled = true; };
  }, [companyForTypes, dealCompanyParam]);

  // Giữ «Tất cả» (rỗng) / «Chưa phân loại»; chỉ reset khi UUID loại không còn thuộc công ty hiện hành.
  useEffect(() => {
    // Chỉ resolve khi workTypes đã đúng công ty hiện hành — tránh "nhảy" sang loại của công ty cũ.
    if (workTypesCompanyId !== companyForTypes) return;
    if (!Array.isArray(workTypes) || workTypes.length === 0) {
      if (filterWorkTypeId && filterWorkTypeId !== 'none') setFilterWorkTypeId('');
      return;
    }
    if (!filterWorkTypeId || filterWorkTypeId === 'none') return;

    const stillExists = workTypes.some((w) => String(w.id) === String(filterWorkTypeId));
    if (!stillExists) setFilterWorkTypeId('');
  }, [workTypes, workTypesCompanyId, companyForTypes, filterWorkTypeId]);


  useEffect(() => {
    api.get('/users').then(r => setAllUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  const dateFromTo = useMemo(() => {
    if (timePreset === 'custom') {
      if (!customFrom || !customTo) return { from: '', to: '' };
      return { from: customFrom, to: customTo };
    }
    if (timePreset) {
      return getWorkshopDateRange(timePreset);
    }
    return { from: '', to: '' };
  }, [timePreset, customFrom, customTo]);

  const handleTimePresetChange = useCallback((preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowCustomDate(true);
      return;
    }
    setShowCustomDate(false);
    setShowDateRangePicker(false);
    if (preset === '') {
      setCustomFrom('');
      setCustomTo('');
      return;
    }
    const range = getWorkshopDateRange(preset);
    setCustomFrom(range.from);
    setCustomTo(range.to);
  }, []);

  const timeFilterLabel = useMemo(() => {
    if (!timePreset) return '';
    if (timePreset === 'custom') {
      if (customFrom && customTo) return `${customFrom} → ${customTo}`;
      return 'Tùy chỉnh';
    }
    return WS_TIME_PRESETS.find((p) => p.key === timePreset)?.label || '';
  }, [timePreset, customFrom, customTo]);

  const scopeProjects = useMemo(() => {
    return projects.filter((p) => {
      const { from, to } = dateFromTo;
      if (from && to && !workshopCreatedInRange(p.created_at, from, to)) return false;
      if (!matchesProject(p, { personNameQ: deferredPersonName })) return false;
      if (filterPhone === 'has' && !p.customer?.phone) return false;
      if (filterPhone === 'no' && p.customer?.phone) return false;
      const wt = p.workshop_type_id || p.workshop_type?.id;
      const isOrphanRow = !wt;
      // Filter phân loại client-side (không reload trang khi đổi loại)
      if (filterWorkTypeId === 'none') {
        if (!isOrphanRow) return false;
      } else if (filterWorkTypeId) {
        if (isOrphanRow) {
          // Chưa phân loại chỉ hiện khi bật cột ảo (tránh lẫn vào pipeline loại khác)
          return showOrphanColumn;
        }
        if (String(wt) !== String(filterWorkTypeId)) return false;
      }
      if (dealCompanyExternalFilter && !projectMatchesDealCompanyExternalFilter(p, dealCompanyExternalFilter)) {
        return false;
      }
      return true;
    });
  }, [projects, dateFromTo, matchesProject, deferredPersonName, filterPhone, filterWorkTypeId, showOrphanColumn, dealCompanyExternalFilter]);

  const toggleSelect = useCallback((id, e) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const filteredKanbanPipelineRef = useRef([]);
  const selectAll = useCallback(() => {
    const allVisible = filteredKanbanPipelineRef.current.flatMap(s => s.items).map(p => p.id);
    setSelectedIds(new Set(allVisible));
  }, []);

  const selectColumn = useCallback((stageId) => {
    const col = (filteredKanbanPipelineRef.current || []).find((s) => String(s.id) === String(stageId));
    const ids = (col?.items || []).map((p) => p.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const applyBulkDeadline = useCallback(async () => {
    if (!bulkDeadlineVal || !selectedIds.size) return;
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id =>
        api.put(`/projects/${id}`, { deadline: bulkDeadlineVal })
      ));
      await load({ silent: true });
      setShowBulkDeadline(false);
      setBulkDeadlineVal('');
      clearSelection();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gắn deadline'); }
    setBulkSaving(false);
  }, [bulkDeadlineVal, selectedIds, load, clearSelection]);

  const applyBulkPerson = useCallback(async () => {
    if (!bulkPersonId || !selectedIds.size) return;
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id =>
        api.put(`/projects/${id}`, { production_person_id: bulkPersonId })
      ));
      await load({ silent: true });
      setShowBulkPerson(false);
      setBulkPersonId('');
      clearSelection();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gắn người phụ trách'); }
    setBulkSaving(false);
  }, [bulkPersonId, selectedIds, load, clearSelection]);

  const applyBulkWorkType = useCallback(async () => {
    if (!selectedIds.size) return;
    const typeId = bulkWorkTypeId || null;
    const typeObj = typeId ? workTypes.find((w) => String(w.id) === String(typeId)) : null;
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map((id) =>
        api.put(`/projects/${id}`, { workshop_type_id: typeId }),
      ));
      setProjects((prev) => prev.map((p) => (selectedIds.has(p.id)
        ? {
          ...p,
          workshop_type_id: typeId,
          workshop_type: typeObj,
        }
        : p)));
      await load({ silent: true });
      setShowBulkWorkType(false);
      setBulkWorkTypeId('');
      clearSelection();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gắn phân loại');
    }
    setBulkSaving(false);
  }, [bulkWorkTypeId, selectedIds, workTypes, load, clearSelection]);

  const applyBulkDelete = useCallback(async () => {
    if (!selectedIds.size || bulkDeleting) return;
    const count = selectedIds.size;
    const idsToDelete = [...selectedIds];
    const reason = window.prompt(`Xóa ${count} dự án đã chọn?\n\nDự án sẽ được chuyển vào Thùng rác — admin có thể khôi phục.\nNhập lý do (không bắt buộc):`, '');
    if (reason === null) return;
    setBulkDeleting(true);
      clearSelection();
    setProjects((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
    try {
      const results = await Promise.allSettled(
        idsToDelete.map((id) => api.delete(`/projects/${id}`, { data: { delete_reason: reason || undefined } })),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        const msg = failed[0]?.reason?.response?.data?.error || failed[0]?.reason?.message || 'Lỗi xóa';
        alert(failed.length === idsToDelete.length
          ? msg
          : `Đã xóa ${idsToDelete.length - failed.length}/${idsToDelete.length}. Lỗi: ${msg}`);
      }
      await load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa dự án');
      await load({ silent: true });
    }
    setBulkDeleting(false);
  }, [selectedIds, bulkDeleting, load, clearSelection]);

  const kanbanPipeline = useMemo(() => {
    const baseStages = pipeline.length
      ? pipeline
      : [
          { id: 'ph', name: 'Chờ vào xưởng', slug: 'won_pending', icon: '⏳', color: '#64748b', workflow_stage_id: null },
          { id: 'pr', name: 'Sản xuất', slug: 'production', icon: '🏭', color: '#0f766e', workflow_stage_id: null },
          { id: 'cc', name: 'CSKH', slug: 'customer-care', icon: '🤝', color: '#5eead4', workflow_stage_id: null },
        ];

    const sortSxItems = (a, b) => {
      const aPin = !!a?.is_pinned;
      const bPin = !!b?.is_pinned;
      if (aPin !== bPin) return aPin ? -1 : 1;
      const aFromCrm = !!a?.sx_intake;
      const bFromCrm = !!b?.sx_intake;
      if (aFromCrm !== bFromCrm) return aFromCrm ? -1 : 1;
      const ta = new Date(a?.created_at || 0).getTime();
      const tb = new Date(b?.created_at || 0).getTime();
      return tb - ta;
    };

    /**
     * Resolve cột Kanban cho 1 project trên pipeline hiện hành (client-side).
     * Replicate logic BE `kanbanColumnIdForProject` để khi đổi phân loại không
     * cần đợi BE gắn lại sx_kanban_column_id.
     */
    const sortedStages = [...baseStages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const intake = sortedStages.find((s) => s.bucket_slug === 'won_pending');

    const colIdFor = (project) => {
      if (VC_KANBAN_STATUSES.has(project.status)) {
        let preferred = null;
        if (project.sx_kanban_column_id && sortedStages.some((s) => String(s.id) === String(project.sx_kanban_column_id))) {
          const pinned = sortedStages.find((s) => String(s.id) === String(project.sx_kanban_column_id));
          if (pinned?.is_handover_to_logistics) preferred = project.sx_kanban_column_id;
        }
        const handoverId = resolveSxHandoverColumnId(sortedStages, project, preferred);
        if (handoverId) return handoverId;
      }
      // Ưu tiên cột Kanban đã gắn (CRM deal / enrich) — khớp logic BE khi nhiều cột dùng chung workflow.
      if (project.sx_kanban_column_id && sortedStages.some((s) => String(s.id) === String(project.sx_kanban_column_id))) {
        return project.sx_kanban_column_id;
      }
      const cid = project.current_stage_id;
      if (cid) {
        const wfMatches = sortedStages.filter((col) => {
          const wid = col.workflow_stage_id || col.workflow_stage?.id;
          return wid && String(wid) === String(cid);
        });
        if (wfMatches.length === 1) return wfMatches[0].id;
        if (wfMatches.length > 1) {
          const deals = Array.isArray(project.crm_deals) ? project.crm_deals : [];
          const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
          const leadColId = primaryDeal?.sx_pipeline_stage_id || null;
          const ids = new Set(wfMatches.map((m) => String(m.id)));
          if (project.sx_kanban_column_id && ids.has(String(project.sx_kanban_column_id))) {
            return project.sx_kanban_column_id;
          }
          if (leadColId && ids.has(String(leadColId))) return leadColId;
          return wfMatches.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))[0]?.id || null;
        }
      }
      // Won deal nhưng chưa map được workflow → cột intake hoặc cột đầu tiên
      if (project.sx_won_deal || project.sx_intake) {
        if (intake) return intake.id;
        return sortedStages[0]?.id || null;
      }
      return null;
    };

    const resolveColumnId = (project) => {
      const mapped = colIdFor(project);
      if (mapped) return mapped;
      if (intake?.id) return intake.id;
      return sortedStages[0]?.id || null;
    };

    /** Project được coi là «chưa phân loại» khi không có workshop_type_id. */
    const isOrphan = (p) => !p.workshop_type_id && !p.workshop_type?.id;
    const hasOrphans = scopeProjects.some(isOrphan);
    const includeOrphan = hasOrphans && (showOrphanColumn || filterWorkTypeId === 'none');

    const buckets = new Map(baseStages.map((s) => [String(s.id), []]));
    const orphanItems = [];

    for (const project of scopeProjects) {
      if (includeOrphan && isOrphan(project)) {
        orphanItems.push(project);
        continue;
      }
      const colId = resolveColumnId(project);
      if (!colId) continue;
      const bucket = buckets.get(String(colId));
      if (bucket) bucket.push(project);
    }

    for (const items of buckets.values()) {
      items.sort(sortSxItems);
    }
    orphanItems.sort(sortSxItems);

    const baseColumns = baseStages.map((stage) => ({
      ...stage,
      items: buckets.get(String(stage.id)) || [],
    }));

    if (!includeOrphan) return baseColumns;
    const orphanCol = {
      id: '__orphan_no_type__',
      __virtual: true,
      name: 'Chưa phân loại',
      slug: 'unclassified',
      icon: '📦',
      color: '#94a3b8',
      description: 'Project chưa được gán phân loại (Tủ bếp / Cánh kính / …). Tích phân loại để chuyển vào pipeline.',
      items: orphanItems,
      bucket_slug: 'orphan',
      workflow_stage_id: null,
    };
    return [orphanCol, ...baseColumns];
  }, [pipeline, scopeProjects, showOrphanColumn, filterWorkTypeId]);

  const filteredKanbanPipeline = useMemo(() => {
    const result = kanbanPipeline.map((stage) => ({
      ...stage,
      items: prioritizePinnedProjects(sortProjectsBy(
        stage.items.filter((project) => {
          if (deferredSearchQuery) {
            const q = deferredSearchQuery.toLowerCase();
          const hit = project.code?.toLowerCase().includes(q)
            || project.name?.toLowerCase().includes(q)
            || project.notes?.toLowerCase().includes(q)
            || project.customer?.full_name?.toLowerCase().includes(q)
            || String(project.customer?.phone || '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (priorityFilter && project.priority !== priorityFilter) return false;
        if (stageFilter && project.sx_kanban_column_id !== stageFilter) return false;
        return true;
      }),
        sortBy,
      )),
    }));
    filteredKanbanPipelineRef.current = result;
    return result;
  }, [kanbanPipeline, deferredSearchQuery, priorityFilter, stageFilter, sortBy]);

  const allVisibleProjectIds = useMemo(
    () => filteredKanbanPipeline.flatMap((s) => (s.items || []).map((x) => x.id)).filter(Boolean),
    [filteredKanbanPipeline],
  );

  const filteredCardCount = allVisibleProjectIds.length;

  const sxSearchSuggestMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return [];
    return filteredKanbanPipeline.flatMap((s) => s.items || []);
  }, [filteredKanbanPipeline, searchQuery]);

  const sxSearchSuggestItems = useMemo(
    () => sxSearchSuggestMatches.slice(0, 10),
    [sxSearchSuggestMatches],
  );

  const sxSearchSuggestOpen = searchQuery.trim().length >= 2
    && sxSearchSuggestItems.length > 0
    && !searchSuggestDismissed;

  const refreshProjectCommentsIndex = useCallback(async (ids = allVisibleProjectIds) => {
    const uniqIds = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!uniqIds.length) {
      setCommentsIndex({});
      return;
    }
    try {
      const itemsById = new Map();
      for (const col of filteredKanbanPipelineRef.current || []) {
        for (const it of col.items || []) {
          if (it?.id) itemsById.set(String(it.id), it);
        }
      }
      const items = uniqIds.map((pid) => itemsById.get(pid)).filter(Boolean);
      const { projectOnlyIds, leadIds, leadIdToProjectId } = partitionSxProjectsByCommentSource(items);
      const merged = {};

      const fetchIndexChunks = async (urlPrefix, idList) => {
        const out = {};
      const chunks = [];
        for (let i = 0; i < idList.length; i += 200) chunks.push(idList.slice(i, i + 200));
      const maps = await Promise.all(
          chunks.map((chunk) => api.get(`${urlPrefix}${chunk.join(',')}`).then((r) => r.data || {}).catch(() => ({}))),
        );
        maps.forEach((m) => Object.assign(out, m || {}));
        return out;
      };

      if (projectOnlyIds.length) {
        Object.assign(merged, await fetchIndexChunks('/projects/comments/index?project_ids=', projectOnlyIds));
      }

      if (leadIds.length) {
        const leadIndex = await fetchIndexChunks('/crm/lead-comments/index?lead_ids=', leadIds);
        for (const leadId of leadIds) {
          const meta = leadIndex[leadId] || leadIndex[String(leadId)];
          const pid = leadIdToProjectId[leadId];
          if (pid && meta) merged[pid] = meta;
        }
      }

      setCommentsIndex(merged);
    } catch {
      setCommentsIndex({});
    }
  }, [allVisibleProjectIds]);

  useEffect(() => {
    if (viewMode !== 'comments') return;
    refreshProjectCommentsIndex();
  }, [viewMode, refreshProjectCommentsIndex]);

  /** Realtime cập nhật badge bình luận trên Kanban / chế độ Bình luận */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const resolveProjectId = (payload, fromLead = false) => {
      if (!fromLead) return payload?.project_id ? String(payload.project_id) : null;
      const lid = payload?.lead_id;
      if (!lid) return null;
      for (const col of filteredKanbanPipelineRef.current || []) {
        for (const it of col.items || []) {
          if (resolveSxProjectLeadId(it) === String(lid) && it?.id) return String(it.id);
        }
      }
      return null;
    };

    const bumpIndex = (payload, fromLead = false) => {
      const pid = resolveProjectId(payload, fromLead);
      if (!pid) return;
      const action = payload?.action;
      if (action === 'deleted') {
        setCommentsIndex((prev) => {
          const cur = prev[pid];
          if (!cur) return prev;
          return {
            ...prev,
            [pid]: {
              ...cur,
              count: Math.max(0, (cur.count || 1) - 1),
            },
          };
        });
        return;
      }
      const c = payload.comment;
      if (!c) return;
      setCommentsIndex((prev) => ({
        ...prev,
        [pid]: {
          count: action === 'created' ? ((prev[pid]?.count || 0) + 1) : (prev[pid]?.count || 1),
          last_at: c.created_at || new Date().toISOString(),
          last_user_id: c.user_id ?? null,
        },
      }));
    };

    const onProjectComment = (p) => bumpIndex(p, false);
    const onLeadComment = (p) => bumpIndex(p, true);
    const onProjectDeleted = (p) => bumpIndex({ ...p, action: 'deleted' }, false);

    socket.on('project:comment', onProjectComment);
    socket.on('project:comment:deleted', onProjectDeleted);
    socket.on('lead:comment', onLeadComment);
    return () => {
      socket.off('project:comment', onProjectComment);
      socket.off('project:comment:deleted', onProjectDeleted);
      socket.off('lead:comment', onLeadComment);
    };
  }, []);

  /** Realtime Kanban SX: kéo thẻ / sửa nhiệm vụ / badge CRM / board changed */
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    let timer = null;
    /** Debounce dài hơn — gộp nhiều sự kiện; bỏ badge/task CRM (không cần reload cả board). */
    const scheduleBoardRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        // Không bustCache: dùng TTL 20s — tránh burst load khi nhiều người kéo thẻ.
        // Thao tác local (kéo thẻ / đổi loại / tạo deal) vẫn bustCache riêng.
        loadRef.current?.({ silent: true });
      }, 2000);
    };
    const onStage = () => scheduleBoardRefresh();
    const onBoard = () => scheduleBoardRefresh();
    socket.on('project:stage_changed', onStage);
    socket.on('production:board_changed', onBoard);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('project:stage_changed', onStage);
      socket.off('production:board_changed', onBoard);
    };
  }, []);

  useEffect(() => {
    if (!kanbanCommentItem?.id) {
      setKanbanCommentMembers([]);
      setKanbanCommentLeadId(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const leadId = await resolveSxProjectLeadIdAsync(api, kanbanCommentItem);
      if (cancelled) return;
      setKanbanCommentLeadId(leadId);
      if (!leadId) {
        setKanbanCommentMembers([]);
        return;
      }
      api.get(`/crm/leads/${leadId}/members`)
        .then((r) => { if (!cancelled) setKanbanCommentMembers(Array.isArray(r.data) ? r.data : []); })
        .catch(() => { if (!cancelled) setKanbanCommentMembers([]); });
    })();
    return () => { cancelled = true; };
  }, [kanbanCommentItem?.id]);

  const submitKanbanQuickComment = useCallback(async ({ mention_user_ids } = {}) => {
    const v = kanbanCommentBody.trim();
    const it = kanbanCommentItem;
    if (!v || !it) return;
    setKanbanCommentPosting(true);
    try {
      const leadId = kanbanCommentLeadId || await resolveSxProjectLeadIdAsync(api, it);
      if (leadId) {
        const payload = { body: v };
        const ids = mention_user_ids?.length
          ? mention_user_ids
          : resolveMentionIdsFromContent(v, kanbanCommentMembers, { excludeUserId: user?.id });
        if (ids.length) payload.mention_user_ids = ids;
        await api.post(`/crm/leads/${leadId}/comments`, payload);
      } else {
        await api.post(`/projects/${it.id}/comments`, { content: v });
      }
      setKanbanCommentItem(null);
      setKanbanCommentBody('');
      setKanbanCommentLeadId(null);
      setKanbanCommentMembers([]);
      setCommentsIndex((prev) => ({
        ...prev,
        [String(it.id)]: {
          count: (prev[String(it.id)]?.count || 0) + 1,
          last_at: new Date().toISOString(),
          last_user_id: user?.id ?? null,
        },
      }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    }
    setKanbanCommentPosting(false);
  }, [kanbanCommentBody, kanbanCommentItem, kanbanCommentLeadId, kanbanCommentMembers, user?.id]);

  /** Từ chi tiết: cuộn tới thẻ vừa xem (cần đặt sau filteredKanbanPipeline) */
  useEffect(() => {
    if (loading) return;
    const id = peekWorkshopPipelineCardFocus('sx');
    if (!id) return;
    if (viewMode !== 'kanban') {
      setViewMode('kanban');
      return;
    }
    triggerKanbanSearchHighlight(id, { onDone: () => clearWorkshopPipelineCardFocus('sx') });
  }, [loading, viewMode, filteredKanbanPipeline, triggerKanbanSearchHighlight]);

  const openSxSearchResultDetail = useCallback((projectId) => {
    setSearchSuggestDismissed(true);
    setSearchFocused(false);
    searchInputRef.current?.blur();
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  }, [navigate]);

  const focusSxSearchResult = useCallback((projectId) => {
    setSearchSuggestDismissed(true);
    setSearchFocused(false);
    searchInputRef.current?.blur();

    const sid = String(projectId);
    if (viewMode !== 'kanban') {
      pendingSxSearchFocusRef.current = sid;
      setViewMode('kanban');
      return;
    }
    triggerKanbanSearchHighlight(sid, { persist: true });
  }, [viewMode, triggerKanbanSearchHighlight]);

  useEffect(() => {
    const pendingId = pendingSxSearchFocusRef.current;
    if (viewMode !== 'kanban' || !pendingId) return;
    pendingSxSearchFocusRef.current = null;
    requestAnimationFrame(() => {
      triggerKanbanSearchHighlight(pendingId, { persist: true });
    });
  }, [viewMode, filteredKanbanPipeline, triggerKanbanSearchHighlight]);

  useEffect(() => {
    if (viewMode !== 'kanban' || !kanbanSearchHighlightId) return undefined;
    let tryNum = 0;
    let timer = null;
    const tick = () => {
      const el = findKanbanCard('data-sx-kanban-card', kanbanSearchHighlightId);
      if (el) {
        scrollKanbanCardIntoView(el);
        return;
      }
      if (tryNum < 32) {
        tryNum += 1;
        timer = window.setTimeout(tick, 50 + tryNum * 45);
      }
    };
    tick();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [viewMode, kanbanSearchHighlightId, filteredKanbanPipeline]);

  useEffect(() => {
    if (searchQuery.trim()) return;
    clearKanbanSearchHighlight();
  }, [searchQuery, clearKanbanSearchHighlight]);

  const scopeKpis = useMemo(() => {
    const list = scopeProjects;
    const revenue = computeSxRevenueKpis(list, pipeline);
    // Khớp đúng số thẻ cột «Quá hạn» trên view Deadline
    const deadlineOverdueCount = countSxDeadlineViewOverdue(filteredKanbanPipeline);
    if (!list.length) {
      return {
        total: 0, producing: 0, awaiting_delivery: 0, shipped: 0, completed: 0, overdue: 0,
        avg_progress: 0,
        intake_pending: 0, delivering: 0, customer_care: 0,
        won_revenue_value: 0,
        completed_revenue_value: 0,
        collected_revenue_value: 0,
        debt_revenue_value: 0,
        debt_count: 0,
        collected_count: 0,
        weighted_pipeline_value: 0,
        column_sla_overdue: 0,
      };
    }
    return {
      total: list.length,
      producing: revenue.producing,
      awaiting_delivery: revenue.awaitingDelivery,
      shipped: revenue.shipped,
      delivering: revenue.awaitingDelivery,
      customer_care: list.filter((p) => p.current_stage?.slug === 'customer-care' || p.status === 'warranty').length,
      completed: list.filter((p) => p.status === 'completed').length,
      overdue: deadlineOverdueCount,
      intake_pending: list.filter((p) => p.sx_intake).length,
      avg_progress: Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length),
      won_revenue_value: revenue.wonRevenue,
      completed_revenue_value: revenue.completedRevenue,
      collected_revenue_value: revenue.collectedRevenue,
      debt_revenue_value: revenue.debtRevenue,
      debt_count: revenue.debtCount,
      collected_count: revenue.collectedCount,
      weighted_pipeline_value: revenue.weightedPipeline,
      column_sla_overdue: deadlineOverdueCount,
    };
  }, [scopeProjects, pipeline, filteredKanbanPipeline]);

  const togglePinFlag = useCallback(async (item, next) => {
    const leadId = resolveSxProjectLeadId(item);
    if (!leadId || !item?.id) {
      alert('Không tìm thấy deal CRM liên kết — không thể ghim thẻ này.');
      return;
    }
    const projectId = item.id;
    const patch = {
      is_pinned: !!next,
      pinned_at: next ? new Date().toISOString() : null,
      crm_lead_id: leadId,
    };
    setProjects((prev) => prev.map((p) => (String(p.id) === String(projectId) ? { ...p, ...patch } : p)));
    try {
      if (next) await api.post(`/crm/leads/${leadId}/pin`);
      else await api.delete(`/crm/leads/${leadId}/pin`);
    } catch (e) {
      setProjects((prev) => prev.map((p) => (
        String(p.id) === String(projectId)
          ? { ...p, is_pinned: !next, pinned_at: next ? null : p.pinned_at }
          : p
      )));
      alert(e.response?.data?.error || 'Không ghim được thẻ');
    }
  }, []);

  const executeStageMove = useCallback(async (projectId, targetCol, { deadlineIso, reason } = {}) => {
    const current = projects.find((p) => String(p.id) === String(projectId));
    const wid = targetCol?.workflow_stage_id;
    const colId = targetCol?.id;
    const currentColId = current?.sx_kanban_column_id || null;
    const optimisticStage = wid ? {
      id: wid,
      slug: targetCol.slug,
      name: targetCol.name,
      color: targetCol.color,
      icon: targetCol.icon,
    } : null;

    const clearsDeadline = !!targetCol?.counts_as_completed_revenue;

    setProjects((prev) => prev.map((p) => (p.id === projectId
      ? {
        ...p,
        current_stage: optimisticStage,
        current_stage_id: wid || null,
        sx_kanban_column_id: colId,
        sx_intake: false,
        sx_pipeline_stage: buildSxPipelineStageMeta(targetCol) || p.sx_pipeline_stage,
        ...(clearsDeadline ? {
          sx_kanban_deadline_at: null,
          sx_kanban_deadline_reason: null,
        } : deadlineIso ? {
          sx_kanban_deadline_at: deadlineIso,
          sx_kanban_deadline_reason: reason || null,
        } : {}),
      }
      : p)));

    try {
      const { data } = await api.patch(`/production/projects/${projectId}/stage`, {
        production_pipeline_stage_id: colId,
        current_sx_pipeline_stage_id: currentColId,
        company_id: companyParam || undefined,
        ...(deadlineIso ? { sx_kanban_deadline_at: deadlineIso, deadline_reason: reason || '' } : {}),
      });
      const applied = data?.stage_staff_applied;
      const staffList = data?.project?.production_staff || applied?.production_staff;
      if (staffList?.length || applied?.users?.length) {
        setProjects((prev) => prev.map((p) => {
          if (String(p.id) !== String(projectId)) return p;
          const next = { ...p };
          if (staffList?.length) next.production_staff = staffList;
          const primaryProd = staffList?.find((u) => u.is_primary) || staffList?.[0];
          if (primaryProd && !next.production_person) next.production_person = primaryProd;
          const logistics = applied?.users?.find((u) => u.kind === 'logistics');
          const installer = applied?.users?.find((u) => u.kind === 'installation');
          if (logistics && !next.logistics_person) next.logistics_person = logistics;
          if (installer && !next.installer_person) next.installer_person = installer;
          return next;
        }));
      }
      if (applied?.users?.length) {
        const names = applied.users.map((u) => u.full_name || u.email).filter(Boolean).join(', ');
        const stageLabel = applied.stage_name || targetCol?.name || 'cột pipeline';
        showCopyToast(`👥 Đã thêm ${applied.users.length} thành viên («${stageLabel}»): ${names}`);
      }
      scheduleCrmBadgeRefresh(projectId);
    } catch (e) {
      console.error(e);
      if (e.response?.data?.code === 'requires_deadline') {
        setDeadlineCtx({
          projectId,
          targetCol,
          project: current,
          mode: 'stage_move',
        });
        load({ silent: true, bustCache: true });
        return;
      }
      window.alert(e.response?.data?.error || e.message || 'Không chuyển được cột pipeline');
      load({ silent: true, bustCache: true });
    }
  }, [load, projects, companyParam]);

  const handleMoveStage = useCallback(async (projectId, targetCol) => {
    const current = projects.find((p) => String(p.id) === String(projectId));
    const alreadyInLogistics = isProjectAlreadyInLogistics(current);
    const isHandover = targetCol?.is_handover_to_logistics === true;

    // Kéo vào cột ảo «Chưa phân loại» → bỏ workshop_type_id của project.
    if (targetCol?.__virtual && targetCol?.id === '__orphan_no_type__') {
      try {
        await api.put(`/projects/${projectId}`, { workshop_type_id: null });
        setProjects((prev) => prev.map((p) => (p.id === projectId
          ? { ...p, workshop_type_id: null, workshop_type: null }
          : p)));
      } catch (e) {
        alert(e.response?.data?.error || 'Lỗi gỡ phân loại');
      }
      return;
    }

    const isIntake = targetCol?.bucket_slug === INTAKE_BUCKET
      || String(targetCol?.id || '').startsWith('__fb_');
    const isSwitchWorkshopType = targetCol?.is_switch_workshop_type === true
      && !!targetCol?.target_workshop_type_id;

    if (isIntake) {
      setProjects((prev) => prev.map((p) => (p.id === projectId
        ? { ...p, current_stage: null, sx_kanban_column_id: targetCol.id, sx_intake: true }
        : p)));
      try {
        await api.patch(`/production/projects/${projectId}/stage`, { move_to_intake: true });
        scheduleCrmBadgeRefresh(projectId);
      } catch (e) {
        console.error(e);
        load({ silent: true, bustCache: true });
      }
      return;
    }

    // Cột được đánh dấu "bàn giao VC" → hỏi lần đầu; đã bàn giao thì chỉ cập nhật cột SX
    if (isHandover) {
      if (alreadyInLogistics) {
        await executeStageMove(projectId, targetCol);
        return;
      }
      setHandoverModal({ projectId, projectName: current?.name || current?.code || projectId });
      setHandoverTargetSxColId(targetCol?.id ? String(targetCol.id) : '');
      setHandoverErr('');
      setHandoverLogisticsCompanyId('');
      setHandoverLogisticsCompanies([]);
      setHandoverDeliveryTeamId('');
      setHandoverInstallationTeamId('');
      setHandoverDeliveryTeams([]);
      setHandoverInstallationTeams([]);
      return;
    }

    // Cột chuyển phân loại (vd: Chốt → Data đầu ra)
    if (isSwitchWorkshopType) {
      const fromName = current?.workshop_type?.name
        || workTypes.find((w) => String(w.id) === String(current?.workshop_type_id))?.name
        || 'Phân loại hiện tại';
      const toName = targetCol?.target_workshop_type?.name
        || workTypes.find((w) => String(w.id) === String(targetCol.target_workshop_type_id))?.name
        || 'Phân loại đích';
      setSwitchWorkshopModal({
        projectId,
        projectName: current?.name || current?.code || projectId,
        targetCol,
        fromName,
        toName,
        currentColId: current?.sx_kanban_column_id || null,
      });
      return;
    }

    // Luôn gửi production_pipeline_stages.id (không chỉ workflow stage_id) — giống chi tiết dự án.
    const colId = targetCol?.id;
    const currentColId = current?.sx_kanban_column_id || null;
    const isSameCol = colId && currentColId && String(colId) === String(currentColId);
    if (!isSameCol && targetCol?.requires_deadline && !targetCol?.counts_as_completed_revenue) {
      setDeadlineCtx({
        projectId,
        targetCol,
        project: current,
        mode: 'stage_move',
      });
      return;
    }

    await executeStageMove(projectId, targetCol);
  }, [executeStageMove, projects, workTypes]);

  const confirmSwitchWorkshopType = useCallback(async () => {
    if (!switchWorkshopModal || switchWorkshopSaving) return;
    setSwitchWorkshopSaving(true);
    try {
      const { data } = await api.patch(`/production/projects/${switchWorkshopModal.projectId}/switch-workshop-type`, {
        production_pipeline_stage_id: switchWorkshopModal.targetCol?.id,
        current_sx_pipeline_stage_id: switchWorkshopModal.currentColId || null,
      });
      const updated = data?.project;
      const pid = String(switchWorkshopModal.projectId);
      const targetType = updated?.workshop_type
        || workTypes.find((w) => String(w.id) === String(data?.to_workshop_type_id));
      setProjects((prev) => prev.map((p) => (String(p.id) === pid
        ? {
            ...p,
            workshop_type_id: updated?.workshop_type_id ?? data?.to_workshop_type_id ?? p.workshop_type_id,
            workshop_type: targetType || p.workshop_type,
            sx_kanban_column_id: updated?.sx_kanban_column_id ?? data?.pipeline_stage_id ?? p.sx_kanban_column_id,
            sx_pipeline_stage: updated?.sx_pipeline_stage ?? p.sx_pipeline_stage,
            sx_intake: false,
            current_stage_id: updated?.current_stage_id ?? p.current_stage_id,
            current_stage: updated?.current_stage ?? p.current_stage,
            status: updated?.status ?? p.status,
          }
        : p)));
      scheduleCrmBadgeRefresh(switchWorkshopModal.projectId);
      setSwitchWorkshopModal(null);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi chuyển phân loại');
      load({ silent: true, bustCache: true });
    } finally {
      setSwitchWorkshopSaving(false);
    }
  }, [switchWorkshopModal, switchWorkshopSaving, workTypes, load]);

  const openDeadlineFromCard = useCallback((item) => {
    setDeadlineCtx({
      projectId: item.id,
      targetCol: null,
      project: item,
      mode: 'edit_only',
    });
  }, []);

  const confirmDeadlineMove = async ({ deadlineIso, reason }) => {
    const ctx = deadlineCtx;
    if (!ctx) return;
    setDeadlineBusy(true);
    try {
      if (ctx.mode === 'edit_only') {
        await api.patch(`/production/projects/${ctx.projectId}/kanban-deadline`, {
          sx_kanban_deadline_at: deadlineIso,
          reason: reason || '',
        });
        const pid = String(ctx.projectId);
        const patch = {
          sx_kanban_deadline_at: deadlineIso,
          sx_kanban_deadline_reason: reason || null,
        };
        setProjects((prev) => prev.map((p) => (String(p.id) === pid ? { ...p, ...patch } : p)));
        setDeadlineCtx(null);
        return;
      }
      await executeStageMove(ctx.projectId, ctx.targetCol, { deadlineIso, reason });
      setDeadlineCtx(null);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật deadline');
    } finally {
      setDeadlineBusy(false);
    }
  };

  const handleHandoverVC = useCallback(async (projectId, projectName, logisticsCompanyId, sxPipelineStageId = '') => {
    const sxColId = sxPipelineStageId ? String(sxPipelineStageId) : '';
    const targetCol = sxColId ? pipeline.find((s) => String(s.id) === sxColId) : null;
    const sxStageMeta = buildSxPipelineStageMeta(targetCol);
    try {
      const { data } = await api.patch(`/production/projects/${projectId}/handover-vc`, {
        logistics_company_id: logisticsCompanyId || undefined,
        ...(sxColId ? { production_pipeline_stage_id: sxColId } : {}),
      });
      const updated = data?.project;
      const resolvedSxCol = data?.sx_pipeline_stage_id || updated?.sx_kanban_column_id || sxColId || null;
      const resolvedCol = resolvedSxCol
        ? (pipeline.find((s) => String(s.id) === String(resolvedSxCol)) || targetCol)
        : targetCol;
      setProjects((prev) => prev.map((p) => (String(p.id) === String(projectId)
          ? {
              ...p,
            status: updated?.status ?? 'shipping',
            current_stage_id: updated?.current_stage_id ?? null,
            current_stage: updated?.current_stage ?? null,
            sx_kanban_column_id: resolvedSxCol || p.sx_kanban_column_id,
            sx_pipeline_stage: buildSxPipelineStageMeta(resolvedCol) || sxStageMeta || p.sx_pipeline_stage,
            sx_intake: false,
            vc_kanban_column_id: updated?.vc_kanban_column_id ?? p.vc_kanban_column_id,
            logistics_person_id: updated?.logistics_person_id ?? p.logistics_person_id,
            delivery_team_id: updated?.delivery_team_id ?? p.delivery_team_id,
            installation_team_id: updated?.installation_team_id ?? p.installation_team_id,
            }
          : p)));
      scheduleCrmBadgeRefresh(projectId);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Lỗi bàn giao VC');
      load({ silent: true, bustCache: true });
    }
  }, [load, pipeline]);

  const openHandoverModal = useCallback((projectId, projectName, sxTargetColId = '') => {
    setHandoverModal({ projectId, projectName });
    setHandoverTargetSxColId(sxTargetColId ? String(sxTargetColId) : '');
    setHandoverErr('');
    setHandoverLogisticsCompanyId('');
    setHandoverLogisticsCompanies([]);
    setHandoverDeliveryTeamId('');
    setHandoverInstallationTeamId('');
    setHandoverDeliveryTeams([]);
    setHandoverInstallationTeams([]);
  }, []);

  // Load logistics companies for VC handover modal
  useEffect(() => {
    if (!handoverModal) return;
    api
      .get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        const arr = Array.isArray(list) ? list : [];
        setHandoverLogisticsCompanies(arr);
        if (arr.length === 1) setHandoverLogisticsCompanyId(String(arr[0].id));
      })
      .catch(() => {
        setHandoverLogisticsCompanies([]);
      });
  }, [handoverModal, companyParam]);

  // Load teams for VC handover modal after choosing logistics company
  useEffect(() => {
    if (!handoverModal) return;
    if (!handoverLogisticsCompanyId) return;
    const params = { company_id: handoverLogisticsCompanyId };
    Promise.all([
      api.get('/workshop-teams', { params: { ...params, type: 'delivery' } }).catch(() => ({ data: [] })),
      api.get('/workshop-teams', { params: { ...params, type: 'installation' } }).catch(() => ({ data: [] })),
    ])
      .then(([d, i]) => {
        setHandoverDeliveryTeams(Array.isArray(d.data) ? d.data : []);
        setHandoverInstallationTeams(Array.isArray(i.data) ? i.data : []);
      })
      .catch(() => {
        setHandoverDeliveryTeams([]);
        setHandoverInstallationTeams([]);
      });
  }, [handoverModal, handoverLogisticsCompanyId]);

  const confirmHandoverVC = useCallback(async () => {
    if (!handoverModal) return;
    if (!handoverLogisticsCompanyId) {
      setHandoverErr('Vui lòng chọn công ty Vận chuyển.');
      return;
    }
    setHandoverSaving(true);

    const sxColId = handoverTargetSxColId || '';
    const targetCol = sxColId ? pipeline.find((s) => String(s.id) === sxColId) : null;
    const sxStageMeta = buildSxPipelineStageMeta(targetCol);

    // Optimistic: ghim thẻ ở cột bàn giao VC để không bị nhảy cột / mất thẻ
    setProjects((prev) => prev.map((p) => (String(p.id) === String(handoverModal.projectId)
      ? {
          ...p,
          status: 'shipping',
          current_stage: null,
          current_stage_id: null,
          sx_kanban_column_id: sxColId || p.sx_kanban_column_id,
          sx_pipeline_stage: sxStageMeta || p.sx_pipeline_stage,
          sx_intake: false,
        }
      : p)));

    await handleHandoverVC(
      handoverModal.projectId,
      handoverModal.projectName,
      handoverLogisticsCompanyId,
      sxColId,
    );
    setHandoverSaving(false);
    setHandoverModal(null);
    setHandoverTargetSxColId('');
    setHandoverLogisticsCompanyId('');
    setHandoverDeliveryTeamId('');
    setHandoverInstallationTeamId('');
    setHandoverErr('');
  }, [handoverModal, handoverLogisticsCompanyId, handoverTargetSxColId, handleHandoverVC, pipeline]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày';
    if (days < 7) return `${days} ngày`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
  };

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilter('');
    setStageFilter('');
    handleTimePresetChange('');
    setFilterPhone('');
    setFilterWorkTypeId('');
    setShowOrphanColumn(false);
    setFilterSxWorkshopCompany('');
    if (isSystemAdmin(user)) setFilterDealCompany('');
    resetStaffFilters();
  }, [resetStaffFilters, handleTimePresetChange, user]);

  const openSxFilterPanel = useCallback(() => {
    setShowAdvFilter((open) => !open);
    if (!showAdvFilter) setSxFilterTab('employee');
  }, [showAdvFilter]);

  const closeSxFilterPanel = useCallback(() => {
    setShowAdvFilter(false);
    setShowDateRangePicker(false);
  }, []);

  const beginFilterPanelDrag = useCallback((e) => {
    if (e.button !== 0) return;
    const panel = filterPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const originX = filterPanelPos?.x ?? rect.left;
    const originY = filterPanelPos?.y ?? rect.top;
    filterPanelDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX,
      originY,
      width: rect.width,
      height: rect.height,
    };
    if (!filterPanelPos) setFilterPanelPos({ x: originX, y: originY });
    e.preventDefault();
  }, [filterPanelPos]);

  useEffect(() => {
    const onMove = (e) => {
      const drag = filterPanelDragRef.current;
      if (!drag?.dragging) return;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - drag.width - margin);
      const maxY = Math.max(margin, window.innerHeight - drag.height - margin);
      const x = Math.min(maxX, Math.max(margin, drag.originX + (e.clientX - drag.startX)));
      const y = Math.min(maxY, Math.max(margin, drag.originY + (e.clientY - drag.startY)));
      setFilterPanelPos({ x, y });
    };
    const onUp = () => {
      const drag = filterPanelDragRef.current;
      if (!drag?.dragging) return;
      drag.dragging = false;
      setFilterPanelPos((pos) => {
        if (pos) storeSxFilterPanelPos(pos);
        return pos;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!showAdvFilter) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !showDateRangePicker) closeSxFilterPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvFilter, showDateRangePicker, closeSxFilterPanel]);

  const activeSxFilterChips = useMemo(() => {
    const chips = [];
    const push = (key, label, onClear) => chips.push({ key, label, onClear });

    if (searchQuery.trim()) {
      push('search', `Tìm: “${searchQuery.trim()}”`, () => setSearchQuery(''));
    }
    if (filterCompany && canPickCompany) {
      const name = companies.find((c) => String(c.id) === String(filterCompany))?.short_name
        || companies.find((c) => String(c.id) === String(filterCompany))?.name
        || filterCompany;
      push('company', `Xưởng: ${name}`, () => handleStaffFilterCompanyChange(''));
    }
    if (filterDealCompany && showDealCompanyFilter) {
      const name = selectedDealCompanyLabel
        || dealCompanyOptions.find((c) => String(c.id) === String(filterDealCompany))?.short_name
        || dealCompanyOptions.find((c) => String(c.id) === String(filterDealCompany))?.name
        || filterDealCompany;
      push('dealCompany', `Đặt hàng: ${name}`, () => {
        setFilterDealCompany('');
        setFilterWorkTypeId('');
      });
    }
    if (filterSxWorkshopCompany && showVptSxWorkshopFilter) {
      const name = sxWorkshopFilterOptions.find((c) => String(c.id) === String(filterSxWorkshopCompany))?.short_name
        || sxWorkshopFilterOptions.find((c) => String(c.id) === String(filterSxWorkshopCompany))?.name
        || filterSxWorkshopCompany;
      push('sxWorkshop', `SX tại: ${name}`, () => {
        setFilterSxWorkshopCompany('');
        setFilterWorkTypeId('');
      });
    }
    if (filterRegion) {
      const label = filterRegion === '__none__'
        ? 'Khu vực: Chưa gán'
        : `Khu vực: ${companyRegions.find((r) => String(r.id) === String(filterRegion))?.name || filterRegion}`;
      push('region', label, () => {
        setFilterRegion('');
        setFilterPersonId('');
        setFilterPersonName('');
      });
    }
    if (filterPersonId) {
      const name = employeeOptionsForSelect.find((u) => String(u.id) === String(filterPersonId))?.full_name
        || filterPersonId;
      push('person', `NV: ${name}`, () => {
        setFilterPersonId('');
        setFilterPersonName('');
      });
    }
    if (filterPersonName.trim()) {
      push('personName', `Tên: ${filterPersonName.trim()}`, () => setFilterPersonName(''));
    }
    if (stageFilter) {
      const name = pipeline.find((s) => String(s.id) === String(stageFilter))?.name || stageFilter;
      push('stage', `Giai đoạn: ${name}`, () => setStageFilter(''));
    }
    if (filterWorkTypeId === 'none') {
      push('workType', 'Phân loại: Chưa phân loại', () => setFilterWorkTypeId(''));
    } else if (filterWorkTypeId) {
      const name = workTypes.find((wt) => String(wt.id) === String(filterWorkTypeId))?.name || filterWorkTypeId;
      push('workType', `Phân loại: ${name}`, () => setFilterWorkTypeId(''));
    }
    if (priorityFilter) {
      const label = priorityFilter === 'high' ? 'Cao' : priorityFilter === 'medium' ? 'TB' : 'Thấp';
      push('priority', `Ưu tiên: ${label}`, () => setPriorityFilter(''));
    }
    if (filterPhone === 'has') {
      push('phone', 'Có SĐT', () => setFilterPhone(''));
    } else if (filterPhone === 'no') {
      push('phone', 'Chưa có SĐT', () => setFilterPhone(''));
    }
    if (timePreset) {
      push('time', `Thời gian: ${timeFilterLabel || timePreset}`, () => handleTimePresetChange(''));
    }
    if (showOrphanColumn) {
      push('orphan', 'Cột «Chưa PL»', () => setShowOrphanColumn(false));
    }
    return chips;
  }, [
    searchQuery, filterCompany, canPickCompany, companies, handleStaffFilterCompanyChange,
    filterDealCompany, showDealCompanyFilter, selectedDealCompanyLabel, dealCompanyOptions,
    filterSxWorkshopCompany, showVptSxWorkshopFilter, sxWorkshopFilterOptions,
    filterRegion, companyRegions, filterPersonId, filterPersonName, employeeOptionsForSelect,
    stageFilter, pipeline, filterWorkTypeId, workTypes, priorityFilter, filterPhone,
    timePreset, timeFilterLabel, handleTimePresetChange, showOrphanColumn,
    setFilterRegion, setFilterPersonId, setFilterPersonName,
  ]);

  const activeSxFilterCount = activeSxFilterChips.length;

  const sxInlineFilterChips = useMemo(
    () => activeSxFilterChips.filter((c) => c.key !== 'search'),
    [activeSxFilterChips],
  );

  const sxFilterTabCounts = useMemo(() => ({
    employee: staffFilterActiveCount
      + (filterDealCompany && showDealCompanyFilter ? 1 : 0)
      + (filterSxWorkshopCompany && showVptSxWorkshopFilter ? 1 : 0),
    pipeline: (stageFilter ? 1 : 0) + (filterWorkTypeId ? 1 : 0) + (priorityFilter ? 1 : 0)
      + (filterPhone ? 1 : 0) + (showOrphanColumn ? 1 : 0),
    display: (timePreset ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0) + (kanbanLoadKey !== '500' ? 1 : 0),
  }), [
    staffFilterActiveCount, filterDealCompany, showDealCompanyFilter,
    filterSxWorkshopCompany, showVptSxWorkshopFilter,
    stageFilter, filterWorkTypeId,
    priorityFilter, filterPhone, showOrphanColumn,
    timePreset, sortBy, kanbanLoadKey,
  ]);

  const sxFilterTabs = useMemo(
    () => SX_FILTER_TABS_META.map((t) => ({ ...t, count: sxFilterTabCounts[t.id] || 0 })),
    [sxFilterTabCounts],
  );

  const sxFilterPanelActive = showAdvFilter
    || filterCompany || filterDealCompany || filterSxWorkshopCompany || filterRegion || filterPersonId
    || filterPersonName || stageFilter || filterWorkTypeId || priorityFilter || filterPhone
    || timePreset || showOrphanColumn || searchQuery.trim();

  const sxMainContentLoading = loading && !firstLoaded;

  const filterBusy = !!(
    workTypesFetching
    || (companyForTypes && workTypesCompanyId !== companyForTypes)
    || (loading && !firstLoaded)
    || syncing
  );

  useEffect(() => {
    if (filterBusy) {
      wasFilterBusyRef.current = true;
      setFilterAppliedHint(false);
      return undefined;
    }
    if (!wasFilterBusyRef.current || !firstLoaded) return undefined;
    wasFilterBusyRef.current = false;
    setFilterAppliedHint(true);
    const t = window.setTimeout(() => setFilterAppliedHint(false), 2800);
    return () => window.clearTimeout(t);
  }, [filterBusy, firstLoaded]);

  const workTypeFilterLabel = useMemo(() => {
    if (!companyForTypes || !workTypes.length) return '';
    if (filterWorkTypeId === 'none') return 'Chưa phân loại';
    if (filterWorkTypeId) {
      return workTypes.find((wt) => String(wt.id) === String(filterWorkTypeId))?.name || 'Phân loại';
    }
    return 'Tất cả phân loại';
  }, [companyForTypes, workTypes, filterWorkTypeId]);

  return (
    <div className="space-y-3">
      {/* Panel điều khiển xưởng SX — hành động, KPI, tìm kiếm */}
      <div className="ui-solid-white rounded-2xl border border-slate-200/90 bg-white shadow-md overflow-hidden ring-1 ring-slate-900/[0.04]">
        {/* Hành động + tìm kiếm + chế độ xem */}
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/60">
          <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0 shrink-0">
              {loading && !firstLoaded && (
                <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  Đang tải…
                </span>
              )}
              {filterBusy && firstLoaded && (
                <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                  Đang lọc…
                </span>
              )}
              {filterAppliedHint && !filterBusy && (
                <span
                  className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 animate-in fade-in duration-200"
                  title="Dữ liệu đã khớp bộ lọc hiện tại"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Đã lọc xong · {filteredCardCount} thẻ
                </span>
              )}
          <button
                type="button"
                onClick={() => setShowNewDeal(true)}
                className="h-8 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer text-sm shrink-0 shadow-sm shadow-indigo-500/20"
                title="Tạo deal mới và đưa vào cột Chờ vào xưởng"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo deal
          </button>
              <AssignedTasksToolbarButton to="/sx/assignments" variant="outlined" className="!h-8 !rounded-lg !text-sm" />
      </div>

            {/* Tìm kiếm — giữa toolbar, chiếm phần trống còn lại */}
            <div className="flex items-center gap-2 flex-1 min-w-0 order-2 lg:order-none">
              <div
                ref={searchBoxRef}
                className={`group/search flex items-center flex-1 min-w-0 max-w-none lg:max-w-[22rem] xl:max-w-[26rem] rounded-lg border transition-all duration-200 ${
                  searchFocused
                    ? 'border-violet-400 bg-white shadow-md shadow-violet-500/15 ring-2 ring-violet-200/60'
                    : searchQuery.trim()
                      ? 'border-violet-300 bg-violet-50/90 shadow-sm ring-1 ring-violet-200/40'
                      : sxInlineFilterChips.length && !showAdvFilter
                        ? 'border-violet-200 bg-violet-50/50 shadow-sm ring-1 ring-violet-100/60'
                        : 'border-violet-200/90 bg-white/80 hover:border-violet-300 hover:bg-white hover:shadow-sm'
                }`}
              >
                <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-8 pr-1">
                  <Search
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors duration-200 ${
                      searchFocused || searchQuery.trim() ? 'text-violet-600' : 'text-violet-500'
                    }`}
                  />
                  {!showAdvFilter && sxInlineFilterChips.length > 0 && (
                    <SearchInlineFilterChips
                      chips={sxInlineFilterChips}
                      opacityClass={
                        searchFocused ? 'opacity-40' : searchQuery.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'
                      }
                      onClearChip={(chip) => chip.onClear()}
                      onClearAll={clearAllFilters}
                      showClearAll={sxInlineFilterChips.length > 1}
                    />
                  )}
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchFocused(true);
                      setSearchSuggestDismissed(false);
                    }}
                    onFocus={() => {
                      setSearchFocused(true);
                      setSearchSuggestDismissed(false);
                    }}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                    placeholder="Tìm mã TB, tên khách, SĐT…"
                    className={`flex-1 min-w-[4.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-violet-500/60 focus:outline-none focus:ring-0 rounded-l-lg ${searchQuery ? 'pr-7' : ''}`}
                  />
                  {searchQuery && (
                    <SearchClearButton onClick={() => { setSearchQuery(''); setSearchFocused(false); setSearchSuggestDismissed(false); }} />
                  )}
            </div>
                <AnchoredDropdownMenu
                  open={sxSearchSuggestOpen}
                  onClose={() => setSearchSuggestDismissed(true)}
                  anchorRef={searchBoxRef}
                  align="left"
                  matchAnchorWidth
                  className="rounded-xl border-2 border-violet-200 p-0 overflow-hidden max-h-80 overflow-y-auto [scrollbar-width:thin] animate-fade-in shadow-xl shadow-violet-500/15 ring-1 ring-violet-100"
                >
                  <div className="px-3 py-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-violet-100/60">
                    <p className="text-[11px] font-semibold text-violet-800">
                      <span className="font-bold text-violet-700">{sxSearchSuggestMatches.length}</span>
                      {' '}kết quả cho &ldquo;{searchQuery}&rdquo;
                      {sxSearchSuggestMatches.length > 10 && (
                        <span className="block text-[10px] font-normal text-violet-600/90 mt-0.5">
                          Hiển thị 10 kết quả đầu
                        </span>
                      )}
                      <span className="block text-[10px] font-normal text-violet-600/90 mt-0.5">
                        Nhấn dòng để cuộn tới thẻ trên Kanban · biểu tượng mắt để mở chi tiết
                      </span>
                    </p>
          </div>
                  {sxSearchSuggestItems.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-stretch border-b border-slate-50 last:border-0 group/item"
                    >
                      <button
                        type="button"
                        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50/80 transition-colors cursor-pointer text-left"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => focusSxSearchResult(project.id)}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-mono font-semibold text-slate-500 group-hover/item:bg-indigo-100 group-hover/item:text-indigo-700 transition-colors">
                          {(project.code || '?').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400">{project.code}</span>
                            <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {project.customer?.phone && (
                              <span className="text-[10px] text-emerald-600">📞 {project.customer.phone}</span>
                            )}
                            {project.customer?.full_name && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[8rem]">👤 {project.customer.full_name}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover/item:text-indigo-400 transition-colors shrink-0" />
                      </button>
                      <button
                        type="button"
                        title="Mở chi tiết"
                        aria-label={`Mở chi tiết ${project.code || project.name || project.id}`}
                        className="shrink-0 flex items-center justify-center px-2.5 border-l border-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 transition-colors cursor-pointer"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openSxSearchResultDetail(project.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </AnchoredDropdownMenu>
                <div className="shrink-0 pr-1 pl-0.5">
                  <button
                    type="button"
                    onClick={openSxFilterPanel}
                    aria-expanded={showAdvFilter}
                    className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all duration-200 cursor-pointer ${
                      showAdvFilter || sxFilterPanelActive
                        ? 'bg-violet-200 text-violet-800 border-violet-400 shadow-sm ring-1 ring-violet-200/60'
                        : 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100 hover:text-violet-800 hover:border-violet-300'
                    }`}
                    title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                    aria-label="Bộ lọc"
                  >
                    <Filter className="h-3 w-3" />
                    {activeSxFilterCount > 0 && (
                      <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-violet-600 ring-1 ring-white" />
            )}
          </button>
                </div>
              </div>
              <span
                className="hidden md:inline text-[10px] text-slate-500 shrink-0 tabular-nums whitespace-nowrap"
                title={workTypeFilterLabel ? `Đang xem: ${workTypeFilterLabel}` : undefined}
              >
                {filterBusy && firstLoaded ? (
                  <span className="text-amber-700 font-medium">Đang lọc…</span>
                ) : (
                  <>
                    {workTypeFilterLabel && (
                      <span className="text-violet-600 font-medium mr-1">{workTypeFilterLabel} ·</span>
                    )}
                    <strong className="text-slate-700">{projects.length}</strong>
                    {' / '}
                    <strong className="text-indigo-700">{filteredCardCount}</strong>
                    <span className="text-slate-400 font-normal"> thẻ</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end shrink-0 order-3 lg:order-none">
              {companyForTypes && workTypes.length > 0 && (
                <div
                  className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg border shrink-0 ${
                    filterBusy
                      ? 'border-amber-300 bg-amber-50/80'
                      : filterWorkTypeId === 'none'
                        ? 'border-amber-300 bg-amber-50'
                        : filterWorkTypeId
                          ? 'border-teal-300 bg-teal-50'
                          : 'border-violet-300 bg-violet-50'
                  }`}
                  title={filterBusy ? 'Đang áp dụng bộ lọc phân loại…' : `Đang xem: ${workTypeFilterLabel}`}
                >
                  {filterBusy ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600" />
                  ) : (
                    <Layers className={`h-3 w-3 shrink-0 ${
                      filterWorkTypeId === 'none' ? 'text-amber-600'
                      : filterWorkTypeId ? 'text-teal-700' : 'text-violet-600'
                    }`} />
                  )}
                  <select
                    value={filterWorkTypeId}
                    onChange={(e) => setFilterWorkTypeId(e.target.value)}
                    disabled={filterBusy && !firstLoaded}
                    className={`h-6 text-[11px] bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[11rem] font-semibold ${
                      filterWorkTypeId === 'none' ? 'text-amber-700'
                      : filterWorkTypeId ? 'text-teal-800' : 'text-violet-800'
                    }`}
                  >
                    <option value="">Phân loại: Tất cả</option>
                    <option value="none">Chưa phân loại</option>
                    {workTypes.map((wt) => (
                      <option key={wt.id} value={wt.id}>{wt.name}</option>
                    ))}
                  </select>
                  {!filterBusy && !filterWorkTypeId && (
                    <span title="Đang xem tất cả phân loại" className="inline-flex">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-violet-500" />
                    </span>
                  )}
                  {filterWorkTypeId && !filterBusy && (
            <button
              type="button"
                      onClick={() => setFilterWorkTypeId('')}
                      className="p-0.5 rounded hover:bg-white/70 cursor-pointer"
                      title="Về Tất cả phân loại"
            >
                      <X className="h-3 w-3" />
            </button>
          )}
                </div>
              )}
              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-white/90 border border-slate-200 shadow-inner">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`h-7 px-2.5 sm:px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'kanban'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
                <div className="relative">
                  <button
                    ref={viewModeTriggerRef}
                    type="button"
                    onClick={() => setShowViewModeMenu((v) => !v)}
                    className={`h-7 px-2 sm:px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-all ${
                      viewMode !== 'kanban'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title="Chế độ xem khác"
                    aria-expanded={showViewModeMenu}
                  >
                    {(() => {
                      const active = SX_ALT_VIEW_MODES.find((v) => v.id === viewMode);
                      const Icon = active?.icon || List;
                      return (
                        <>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline max-w-[5.5rem] truncate">
                            {active?.label || 'Thêm'}
          </span>
                          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showViewModeMenu ? 'rotate-180' : ''}`} />
                        </>
                      );
                    })()}
                  </button>
                  <ViewModeDropdownMenu
                    open={showViewModeMenu}
                    onClose={() => setShowViewModeMenu(false)}
                    anchorRef={viewModeTriggerRef}
                    modes={SX_ALT_VIEW_MODES}
                    activeId={viewMode}
                    theme="indigo"
                    onSelect={(id) => {
                      setViewMode(id);
                      setShowViewModeMenu(false);
                    }}
                  />
        </div>
              </div>
              {viewMode === 'kanban' && (
                <div className="relative">
                  <button
                    ref={kanbanSettingsTriggerRef}
                    type="button"
                    onClick={() => setShowKanbanSettings((v) => !v)}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                      showKanbanSettings || kanbanColumnScrollMode === 'per-column'
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                    title="Tùy chỉnh cuộn Kanban"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tùy chỉnh</span>
                  </button>
                  <AnchoredDropdownMenu
                    open={showKanbanSettings}
                    onClose={() => setShowKanbanSettings(false)}
                    anchorRef={kanbanSettingsTriggerRef}
                    className="rounded-xl border-gray-200 p-3 w-[min(100vw-1.5rem,18rem)]"
                    align="right"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2.5">Cuộn cột Kanban</p>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50 has-[:checked]:border-blue-400 has-[:checked]:bg-white has-[:checked]:shadow-sm">
              <input
                          type="radio"
                          name="sx-kanban-column-scroll"
                          className="mt-0.5 shrink-0"
                          checked={kanbanColumnScrollMode === 'unified'}
                          onChange={() => {
                            setKanbanColumnScrollMode('unified');
                            try { localStorage.setItem(LS_SX_KANBAN_COLUMN_SCROLL, 'unified'); } catch { /* ignore */ }
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-gray-800">Cuộn chung tất cả cột</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">Kéo một lần, mọi cột cuộn cùng chiều dọc (mặc định).</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50 has-[:checked]:border-blue-400 has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input
                          type="radio"
                          name="sx-kanban-column-scroll"
                          className="mt-0.5 shrink-0"
                          checked={kanbanColumnScrollMode === 'per-column'}
                          onChange={() => {
                            setKanbanColumnScrollMode('per-column');
                            try { localStorage.setItem(LS_SX_KANBAN_COLUMN_SCROLL, 'per-column'); } catch { /* ignore */ }
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-gray-800">Cuộn riêng từng cột</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">Mỗi cột có thanh cuộn dọc riêng; cuộn ngang giữa các cột.</span>
                        </span>
                      </label>
                    </div>
                  </AnchoredDropdownMenu>
                </div>
              )}
            </div>
            </div>

          {/* Lọc nhanh SX tại — chỉ hiện khi cần */}
          {showVptSxWorkshopFilter && sxWorkshopFilterOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2 sm:px-4 border-t border-slate-200/50 pt-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full min-w-0 shrink scrollbar-thin scrollbar-thumb-violet-200">
                <span className="text-[10px] font-semibold text-violet-700/80 shrink-0 uppercase tracking-wide">SX tại</span>
                {[{ id: '', name: 'Tất cả' }, ...sxWorkshopFilterOptions].map((c) => {
                  const active = filterSxWorkshopCompany === c.id;
                  return (
                    <button
                      key={c.id || 'all-sx'}
                      type="button"
                      onClick={() => {
                        if (active) return;
                        setFilterSxWorkshopCompany(c.id);
                        setFilterWorkTypeId('');
                      }}
                      className={`shrink-0 h-7 px-2 rounded-full text-[10px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white border-violet-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50'
                      }`}
                    >
                      {active && <span className="mr-0.5">✓</span>}
                      {c.id === '' ? 'Tất cả' : (c.short_name || c.name)}
                    </button>
                  );
                })}
                </div>
              <span className="text-[10px] text-slate-500 ml-auto shrink-0 tabular-nums md:hidden">
                {filterBusy && firstLoaded
                  ? 'Đang lọc…'
                  : `${workTypeFilterLabel ? `${workTypeFilterLabel} · ` : ''}${projects.length} / ${filteredCardCount} thẻ`}
              </span>
              </div>
          ) : (
            <div className="flex md:hidden justify-end px-3 pb-2 sm:px-4">
              <span className="text-[10px] text-slate-500 tabular-nums">
                {filterBusy && firstLoaded
                  ? 'Đang lọc…'
                  : `${workTypeFilterLabel ? `${workTypeFilterLabel} · ` : ''}${projects.length} / ${filteredCardCount} thẻ`}
              </span>
                </div>
              )}
        </div>

        {/* KPI */}
        <div className="px-3 py-2 sm:px-4 border-b border-slate-100 bg-slate-50/40">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-1.5 sm:gap-2">
            <KPICard accent="bg-violet-500" label="Tổng dự án" value={scopeKpis.total} descriptor={scopeKpis.total > 0 ? `${scopeKpis.total} dự án` : '—'} />
            <KPICard accent="bg-teal-500" label="Đang sản xuất" value={scopeKpis.producing} descriptor={scopeKpis.producing > 0 ? `${scopeKpis.producing} dự án` : '—'} />
            <KPICard accent="bg-slate-500" label="Chờ vận chuyển" value={scopeKpis.awaiting_delivery} descriptor={scopeKpis.awaiting_delivery > 0 ? 'ở cột bàn giao VC' : '—'} />
            <KPICard accent="bg-blue-500" label="Đã vận chuyển" value={scopeKpis.shipped} descriptor={scopeKpis.shipped > 0 ? 'đang / đã giao' : '—'} />
            <KPICard accent="bg-red-500" label="Quá hạn" value={scopeKpis.overdue} descriptor={scopeKpis.overdue > 0 ? 'cột Deadline Quá hạn' : 'không có'} valueTone={scopeKpis.overdue > 0 ? 'danger' : undefined} />
            <KPICard
              accent="bg-amber-500"
              label="Công nợ"
              value={(scopeKpis.debt_count > 0 || scopeKpis.debt_revenue_value > 0) ? formatVND(scopeKpis.debt_revenue_value || 0) : '—'}
              descriptor={scopeKpis.debt_count > 0 ? `${scopeKpis.debt_count} dự án · đã công, chưa thu` : 'đã công, chưa thu'}
            />
            <KPICard
              accent="bg-emerald-600"
              label="Đã thu"
              value={(scopeKpis.collected_count > 0 || scopeKpis.collected_revenue_value > 0) ? formatVND(scopeKpis.collected_revenue_value || 0) : '—'}
              descriptor={scopeKpis.collected_count > 0 ? `${scopeKpis.collected_count} dự án · theo cột pipeline` : 'theo cột pipeline'}
            />
          </div>
        </div>
      </div>

      {/* Chip lọc / panel nâng cao */}
      <div className="space-y-2">
{!showAdvFilter && showCustomDate && (
          <div className="flex flex-wrap items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-3 shadow-sm">
            <span className="text-xs font-bold text-violet-600 uppercase flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Khoảng thời gian:
            </span>
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-9 px-3 bg-white border border-violet-200 rounded-lg text-sm hover:bg-violet-50 cursor-pointer"
              title="Chọn khoảng ngày"
            >
              {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Chọn ngày bắt đầu/kết thúc'}
            </button>
            <button
              type="button"
              onClick={() => handleTimePresetChange('')}
              className="h-9 px-3 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg text-sm transition cursor-pointer border border-gray-200"
            >
              Hủy
            </button>
              </div>
        )}
        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tuỳ chỉnh"
          from={customFrom}
          to={customTo}
          onChange={({ from, to }) => {
            setCustomFrom(from);
            setCustomTo(to);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />

        {!showAdvFilter && timePreset && timePreset !== 'custom' && timeFilterLabel && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium border border-violet-200">
              <Clock className="h-3 w-3" />
              {timeFilterLabel}
              <button type="button" onClick={() => handleTimePresetChange('')} className="ml-1 hover:text-violet-900 cursor-pointer" title="Bỏ lọc thời gian">
                <X className="h-3 w-3" />
              </button>
            </span>
            </div>
        )}

        {showAdvFilter && (
          <WorkshopDashboardFilterPanel
            panelRef={filterPanelRef}
            position={filterPanelPos}
            onDragStart={beginFilterPanelDrag}
            onClose={closeSxFilterPanel}
            tab={sxFilterTab}
            onTabChange={setSxFilterTab}
            tabs={sxFilterTabs}
            onReset={clearAllFilters}
            onResetPosition={() => {
              setFilterPanelPos(null);
              storeSxFilterPanelPos(null);
            }}
            hasCustomPosition={!!filterPanelPos}
              isAdmin={isAdmin}
              isCompanyScopedAdmin={isCompanyScopedAdmin}
              userCompanyId={userCompanyId}
              companies={companies}
              filterCompany={filterCompany}
              onCompanyChange={handleStaffFilterCompanyChange}
              dashboardScopeCompanyId={dashboardScopeCompanyId}
              companyRegions={companyRegions}
              filterRegion={filterRegion}
              setFilterRegion={setFilterRegion}
              assigneeListSearch={assigneeListSearch}
              setAssigneeListSearch={setAssigneeListSearch}
              filterPersonId={filterPersonId}
              setFilterPersonId={setFilterPersonId}
              setFilterPersonName={setFilterPersonName}
              employeeOptionsForSelect={employeeOptionsForSelect}
              companyDepts={companyDepts}
              filterPersonName={filterPersonName}
              employeeFilterListByRegion={employeeFilterListByRegion}
              companyEmployees={companyEmployees}
            personSelectLabel="NV phụ trách SX"
            panelTitle="Lọc NV phụ trách sản xuất (xưởng → khu vực → NV)"
            canPickCompany={canPickCompany}
            workshopCompanyPickerList={workshopCompanyPickerList}
            showAllWorkshopOption={isAdmin}
            showDealCompanyFilter={showDealCompanyFilter}
            canPickDealCompany={canPickDealCompany}
            filterDealCompany={filterDealCompany}
            onDealCompanyChange={handleDealCompanyChange}
            clientCompaniesWorkshopId={clientCompaniesWorkshopId}
            clientCrmDealOptions={clientCrmDealOptions}
            clientExternalDealOptions={clientExternalDealOptions}
            selectedDealCompanyLabel={selectedDealCompanyLabel}
            pipeline={pipeline}
            stageFilter={stageFilter}
            setStageFilter={setStageFilter}
            filterWorkTypeId={filterWorkTypeId}
            setFilterWorkTypeId={setFilterWorkTypeId}
            workTypes={workTypes}
            companyForTypes={companyForTypes}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            filterPhone={filterPhone}
            setFilterPhone={setFilterPhone}
            showOrphanColumn={showOrphanColumn}
            setShowOrphanColumn={setShowOrphanColumn}
            viewMode={viewMode}
            showVptSxWorkshopFilter={showVptSxWorkshopFilter}
            sxWorkshopFilterOptions={sxWorkshopFilterOptions}
            filterSxWorkshopCompany={filterSxWorkshopCompany}
            setFilterSxWorkshopCompany={setFilterSxWorkshopCompany}
            timePreset={timePreset}
            onTimePresetChange={handleTimePresetChange}
            onOpenDateRangePicker={() => setShowDateRangePicker(true)}
            customFrom={customFrom}
            customTo={customTo}
            kanbanLoadKey={kanbanLoadKey}
            setKanbanLoadKey={setKanbanLoadKey}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortOpen={sortOpen}
            setSortOpen={setSortOpen}
            sortMenuRef={sortMenuRef}
            sortOptions={SX_SORT_OPTIONS_VISIBLE}
          />
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex-wrap">
          <span className="text-sm font-semibold">✓ Đã chọn <strong>{selectedIds.size}</strong> dự án</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button onClick={selectAll} className="h-8 px-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors">
              <CheckSquare className="h-3.5 w-3.5" /> Chọn tất cả
            </button>
            <button onClick={() => { setShowBulkDeadline(true); setBulkDeadlineVal(''); }}
              className="h-8 px-3 bg-white text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors">
              <Calendar className="h-3.5 w-3.5" /> Gắn deadline
            </button>
            <button onClick={() => { setShowBulkPerson(true); setBulkPersonId(''); }}
              className="h-8 px-3 bg-white text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors">
              <UserCheck className="h-3.5 w-3.5" /> Gắn người SX
            </button>
            {workTypes.length > 0 && (
              <button
                onClick={() => { setShowBulkWorkType(true); setBulkWorkTypeId(''); }}
                className="h-8 px-3 bg-white text-teal-700 hover:bg-teal-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                <Layers className="h-3.5 w-3.5" /> Gắn phân loại
              </button>
            )}
            <button
              onClick={applyBulkDelete}
              disabled={bulkDeleting}
              className="h-8 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Đang xóa...' : `Xóa (${selectedIds.size})`}
            </button>
            <button onClick={clearSelection} className="h-8 px-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs cursor-pointer flex items-center gap-1 transition-colors">
              <X className="h-3.5 w-3.5" /> Bỏ chọn
            </button>
          </div>
        </div>
      )}


      <div className="relative min-h-[min(700px,calc(100vh-128px))]">
        {sxMainContentLoading ? (
          <DashboardLoaderGate
            ref={sxLoaderGateRef}
            show
            variant="production"
            companyName={sxLoaderCompanyName}
            tourId="sx-loading"
          />
        ) : (
          <>
      {viewMode === 'kanban' && (
        <KanbanView pipeline={filteredKanbanPipeline} onMoveStage={handleMoveStage} calculateDays={calculateDays}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectColumn={selectColumn}
            onHandoverVC={openHandoverModal}
            onOpenKanbanComment={(item) => { setKanbanCommentItem(item); setKanbanCommentBody(''); }}
            workTypes={workTypes}
            columnScrollMode={kanbanColumnScrollMode}
            onSetWorkType={async (projectId, typeId) => {
              try {
                const { data } = await api.put(`/projects/${projectId}`, { workshop_type_id: typeId || null });
                const updated = data?.project || {};
                setProjects((prev) => prev.map((p) => (p.id === projectId
                  ? {
                    ...p,
                    ...updated,
                    workshop_type_id: typeId || null,
                    workshop_type: typeId ? (workTypes.find((w) => String(w.id) === String(typeId)) || null) : null,
                    production_staff: updated.production_staff || p.production_staff || [],
                    production_person: updated.production_person || p.production_person,
                  }
                  : p)));
              } catch (e) {
                alert(e.response?.data?.error || 'Lỗi đổi phân loại');
              }
            }}
            onOpenDeadline={openDeadlineFromCard}
            onTogglePin={togglePinFlag}
            remeasureToken={showAdvFilter ? 'adv-on' : 'adv-off'}
            searchHighlightId={kanbanSearchHighlightId} />
      )}

      {viewMode === 'list' && <ProductionListView pipeline={filteredKanbanPipeline} calculateDays={calculateDays} />}

      {viewMode === 'planner' && <ProductionPlannerView pipeline={filteredKanbanPipeline} />}

        {viewMode === 'deadline' && <ProductionDeadlineView pipeline={filteredKanbanPipeline} />}

      {viewMode === 'calendar' && <ProductionCalendarView pipeline={filteredKanbanPipeline} />}

      {viewMode === 'comments' && (
        <ProductionCommentsView
          pipeline={filteredKanbanPipeline}
          commentsIndex={commentsIndex}
          onRefreshIndex={() => refreshProjectCommentsIndex()}
        />
      )}
          </>
        )}
      </div>

      {/* Bulk Deadline Modal */}
      {showBulkDeadline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulkDeadline(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" /> Gắn deadline hàng loạt
              </h2>
              <button onClick={() => setShowBulkDeadline(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Áp dụng cho <strong className="text-blue-700">{selectedIds.size}</strong> dự án đã chọn</p>
            <input
              type="date"
              value={bulkDeadlineVal}
              onChange={e => setBulkDeadlineVal(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowBulkDeadline(false)}
                className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={applyBulkDeadline} disabled={!bulkDeadlineVal || bulkSaving}
                className="flex-1 h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {bulkSaving ? 'Đang lưu...' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk phân loại Modal */}
      {showBulkWorkType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulkWorkType(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Layers className="h-5 w-5 text-teal-600" /> Gắn phân loại hàng loạt
              </h2>
              <button onClick={() => setShowBulkWorkType(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Áp dụng cho <strong className="text-teal-700">{selectedIds.size}</strong> dự án đã chọn — dự án sẽ hiển thị đúng pipeline theo phân loại.
            </p>
            <select
              value={bulkWorkTypeId}
              onChange={(e) => setBulkWorkTypeId(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 mb-4 bg-white"
              autoFocus
            >
              <option value="">⚠️ Bỏ phân loại (Chưa phân loại)</option>
              {workTypes.map((wt) => (
                <option key={wt.id} value={wt.id}>{wt.icon ? `${wt.icon} ` : ''}{wt.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkWorkType(false)}
                className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={applyBulkWorkType} disabled={bulkSaving}
                className="flex-1 h-10 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                {bulkSaving ? 'Đang lưu...' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Person Modal */}
      {showBulkPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulkPerson(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-green-500" /> Gắn người SX hàng loạt
              </h2>
              <button onClick={() => setShowBulkPerson(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Áp dụng cho <strong className="text-blue-700">{selectedIds.size}</strong> dự án đã chọn</p>
            <select
              value={bulkPersonId}
              onChange={e => setBulkPersonId(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 mb-4 bg-white"
              autoFocus
            >
              <option value="">— Chọn người phụ trách SX —</option>
              {(employeeOptionsForSelect.length ? employeeOptionsForSelect : allUsers).map((u) => (
                <option key={u.id} value={u.id}>{formatStaffDisplayName(u.full_name)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkPerson(false)}
                className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={applyBulkPerson} disabled={!bulkPersonId || bulkSaving}
                className="flex-1 h-10 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {bulkSaving ? 'Đang lưu...' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chuyển phân loại Modal */}
      {switchWorkshopModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!switchWorkshopSaving) setSwitchWorkshopModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-violet-600" /> Chuyển phân loại
              </h2>
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Dự án <strong>{switchWorkshopModal.projectName}</strong> sẽ chuyển sang pipeline phân loại mới.
            </p>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm mb-4 space-y-1">
              <p><span className="text-gray-500">Từ:</span> <strong>{switchWorkshopModal.fromName}</strong> → cột «{switchWorkshopModal.targetCol?.name}»</p>
              <p><span className="text-gray-500">Sang:</span> <strong>{switchWorkshopModal.toName}</strong> → cột đầu pipeline</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)}
                className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button type="button" onClick={confirmSwitchWorkshopType} disabled={switchWorkshopSaving}
                className="flex-1 h-10 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {switchWorkshopSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {switchWorkshopSaving ? 'Đang chuyển...' : 'Xác nhận chuyển'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover VC Modal */}
      {handoverModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!handoverSaving) setHandoverModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Truck className="h-5 w-5 text-orange-500" /> Bàn giao sang VC
              </h2>
              <button onClick={() => !handoverSaving && setHandoverModal(null)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Chọn người nhận cho dự án <strong>{handoverModal.projectName}</strong>.
            </p>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-xs font-semibold text-gray-600">Công ty VC *</span>
              <select
                value={handoverLogisticsCompanyId}
                onChange={(e) => {
                  setHandoverLogisticsCompanyId(e.target.value);
                  setHandoverErr('');
                  setHandoverDeliveryTeamId('');
                  setHandoverInstallationTeamId('');
                }}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value="">— Chọn công ty —</option>
                {handoverLogisticsCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500">
                Pipeline VC và danh sách đội sẽ theo công ty này.
              </span>
            </label>
            {handoverErr && <p className="text-xs text-red-600 mb-3">{handoverErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => !handoverSaving && setHandoverModal(null)}
                className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={confirmHandoverVC} disabled={!handoverLogisticsCompanyId || handoverSaving}
                className="flex-1 h-10 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {handoverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {handoverSaving ? 'Đang bàn giao...' : 'Xác nhận bàn giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bình luận nhanh — deal CRM → crm_lead_comments; dự án độc lập → project_comments */}
      {kanbanCommentItem && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
          onClick={() => { if (!kanbanCommentPosting) { setKanbanCommentItem(null); setKanbanCommentBody(''); } }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e4e6eb] bg-white px-3 py-2.5">
              <p className="text-[15px] font-bold text-[#050505]">Bình luận nhanh</p>
              <button
                type="button"
                disabled={kanbanCommentPosting}
                onClick={() => { setKanbanCommentItem(null); setKanbanCommentBody(''); }}
                className="rounded-full p-1.5 text-[#65676b] hover:bg-[#f0f2f5] cursor-pointer disabled:opacity-50"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-[#e4e6eb] bg-white px-3 py-3">
              <div className="flex gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb] text-[14px] font-bold text-[#65676b]">
                  {(kanbanCommentItem.name || kanbanCommentItem.code || '?').trim().charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#050505]">{kanbanCommentItem.name}</p>
                  <p className="text-xs text-[#65676b]">
                    {kanbanCommentItem.code}
                    {kanbanCommentItem.customer?.full_name ? ` · ${kanbanCommentItem.customer.full_name}` : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white px-3 py-3">
              {kanbanCommentLeadId ? (
                <CrmCommentMentionComposer
                  user={user}
                  members={kanbanCommentMembers}
                  value={kanbanCommentBody}
                  onChange={(e) => setKanbanCommentBody(e.target.value)}
                  onSubmit={submitKanbanQuickComment}
                  posting={kanbanCommentPosting}
                  placeholder="Viết bình luận… (@ để nhắc thành viên)"
                  autoFocus
                />
              ) : (
                <>
                  <textarea
                    autoFocus
                    value={kanbanCommentBody}
                    onChange={(e) => setKanbanCommentBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        submitKanbanQuickComment();
                      }
                    }}
                    disabled={kanbanCommentPosting}
                    rows={3}
                    placeholder={`Bình luận với tư cách ${user?.full_name || user?.email || 'bạn'}…`}
                    className="w-full resize-y rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-sm text-[#050505] focus:border-[#1877f2]/40 focus:outline-none focus:ring-1 focus:ring-[#1877f2]/30"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-[#65676b]">Ctrl+Enter để gửi nhanh</p>
                    <button
                      type="button"
                      disabled={kanbanCommentPosting || !kanbanCommentBody.trim()}
                      onClick={() => submitKanbanQuickComment()}
                      className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {kanbanCommentPosting ? 'Đang gửi…' : 'Gửi'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewDeal && (
        <NewDealModal
          variant="production"
          onClose={() => setShowNewDeal(false)}
          onSuccess={handleNewDealCreated}
          companies={companies}
          workTypes={workTypes}
          defaultWorkshopTypeId={filterWorkTypeId && filterWorkTypeId !== 'none' ? filterWorkTypeId : ''}
          defaultCompanyId={productionCreateCompanyIdDefault}
          allowProductionCompanyPick={canPickProductionCreateCompany}
          productionCompanyOptions={productionCreateCompanyOptions(companies)}
          defaultExternalCompanyName={
            canPickProductionCreateCompany && isMetallaOrHucabiCompanyId(productionCreateCompanyIdDefault, companies)
              ? vptExternalCompanyLabel
              : ''
          }
          defaultRegionId={filterRegion && filterRegion !== '__none__' ? filterRegion : ''}
          currentUser={user}
        />
      )}

      <CrmDeadlineModal
        open={!!deadlineCtx}
        title={deadlineCtx?.mode === 'edit_only' ? 'Deadline thẻ SX' : 'Đặt deadline khi chuyển cột'}
        subtitle={
          deadlineCtx?.mode === 'edit_only'
            ? (deadlineCtx?.project?.name || deadlineCtx?.project?.code || '')
            : 'Chọn hạn hoàn thành cho thẻ trước khi chuyển sang cột mới.'
        }
        stageName={deadlineCtx?.mode === 'stage_move' ? deadlineCtx?.targetCol?.name : ''}
        initialDeadline={deadlineCtx?.project?.sx_kanban_deadline_at || null}
        currentDeadline={deadlineCtx?.project?.sx_kanban_deadline_at || null}
        mandatory={deadlineCtx?.mode === 'stage_move'}
        requireReason={deadlineCtx?.mode === 'edit_only' && !!deadlineCtx?.project?.sx_kanban_deadline_at}
        allowClear={deadlineCtx?.mode === 'edit_only' && !!deadlineCtx?.project?.sx_kanban_deadline_at}
        submitting={deadlineBusy}
        onClose={() => !deadlineBusy && setDeadlineCtx(null)}
        onConfirm={confirmDeadlineMove}
      />
    </div>
  );
}

// KPI Card — nổi bật trong panel xưởng SX
function KPICard({ accent = 'bg-blue-500', label, value, descriptor, valueTone }) {
  const isDanger = valueTone === 'danger';
  const isWarning = valueTone === 'warning';
  const valueClass = isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="relative min-w-0 rounded-xl border border-slate-200/90 bg-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all overflow-hidden">
      <div className={`h-1 w-full ${accent}`} />
      <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 flex flex-col gap-0.5">
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide truncate" title={label}>{label}</p>
        <p className={`text-base sm:text-lg font-bold leading-none tabular-nums ${valueClass}`}>{value}</p>
        {descriptor && <p className="text-[10px] text-slate-400 truncate" title={descriptor}>{descriptor}</p>}
      </div>
    </div>
  );
}

// ── KANBAN STAGE CARD — header tối giản (dot + tên + count + total) ────────
const KanbanStageCard = memo(function KanbanStageCard({
  stage,
  items,
  onMoveStage,
  pipelineStages,
  calculateDays,
  selectedIds,
  onToggleSelect,
  onSelectColumn,
  onHandoverVC,
  onOpenKanbanComment,
  workTypes,
  onSetWorkType,
  onOpenDeadline,
  onTogglePin,
  columnScrollMode = 'unified',
  columnIndex = 0,
  searchHighlightId = null,
  boardScrollRef = null,
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const { columnScrollMaxH } = useWorkshopKanbanScrollLayout();
  const columnTheme = useKanbanColumnTheme(columnIndex);
  /** Cột «Đã công» (chưa thu) = công nợ → tổng theo phần còn lại (giá SX − cọc). */
  const isDebtColumn = !!(stage?.counts_as_completed_revenue && !stage?.counts_as_collected_revenue);
  const totalValue = items.reduce(
    (sum, p) => sum + (isDebtColumn ? resolveSxProjectRemaining(p) : resolveSxProjectValue(p)),
    0,
  );
  const perColumnScroll = columnScrollMode === 'per-column';
  const pinEmptyPlaceholder = !perColumnScroll && items.length === 0;
  const emptyPlaceholderTop = useKanbanEmptyPlaceholderStickyTop(headerRef, pinEmptyPlaceholder);

  const renderCard = useCallback((item) => (
    <KanbanCard
      item={item}
      stage={stage}
      onMoveStage={onMoveStage}
      pipelineStages={pipelineStages}
      calculateDays={calculateDays}
      isSelected={selectedIds?.has(item.id)}
      onToggleSelect={onToggleSelect}
      onHandoverVC={onHandoverVC}
      onOpenKanbanComment={onOpenKanbanComment}
      workTypes={workTypes}
      onSetWorkType={onSetWorkType}
      onOpenDeadline={onOpenDeadline}
      onTogglePin={onTogglePin}
      columnAccent={columnTheme.accent}
      searchHighlighted={String(searchHighlightId) === String(item.id)}
    />
  ), [
    stage, onMoveStage, pipelineStages, calculateDays, selectedIds, onToggleSelect,
    onHandoverVC, onOpenKanbanComment, workTypes, onSetWorkType, onOpenDeadline,
    onTogglePin, searchHighlightId, columnTheme.accent,
  ]);

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };
  const handleColumnDragLeave = (e) => {
    if (e.target === e.currentTarget) setIsOverColumn(false);
  };
  const handleColumnDrop = (e) => {
    e.preventDefault();
    setIsOverColumn(false);
    const projectId = e.dataTransfer.getData('projectId');
    if (projectId) onMoveStage(projectId, stage);
  };

  return (
    <div
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
      className={`flex flex-col flex-shrink-0 w-[15rem] max-[400px]:w-[13.5rem] rounded-lg transition-all duration-200 kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} ${
        perColumnScroll ? 'h-full self-stretch overflow-x-visible overflow-y-hidden' : 'overflow-visible kanban-unified-scroll-column'
      } ${isOverColumn ? 'ring-2 ring-blue-400 ring-dashed' : ''}`}
      style={{
        ...(perColumnScroll && columnScrollMaxH ? { height: columnScrollMaxH, maxHeight: columnScrollMaxH } : {}),
      }}
    >
      {/* Header — nền theo màu stage; cuộn chung: dính top vùng scroll */}
      <div
        ref={headerRef}
        className={`${perColumnScroll ? 'shrink-0' : 'sticky top-0 kanban-column-header-sticky'} z-10 px-2 py-2.5 border-b rounded-t-md transition-colors kanban-column-surface`}
        style={{
          backgroundColor: isOverColumn ? columnTheme.dropBg : columnTheme.headerBg,
          borderColor: columnTheme.border,
          boxShadow: columnTheme.headerShadow,
        }}
      >
        <div className="flex flex-nowrap items-center gap-1 min-w-0">
          <h3
            className="flex-1 min-w-0 text-sm font-semibold truncate leading-snug"
            style={{ color: '#000000' }}
            title={stage.name}
          >
            {stage.name}
          </h3>
          <div className="flex flex-nowrap items-center gap-1 shrink-0">
          <span
            className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-md text-[13px] font-bold tabular-nums leading-none"
            style={{
              backgroundColor: columnTheme.badgeBg,
              color: columnTheme.accent,
              border: `1px solid ${columnTheme.badgeBorder}`,
            }}
            title={`${items.length} đơn`}
          >
            {items.length}
          </span>
            {stage.is_handover_to_logistics && (
            <span className="px-1 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-bold rounded shrink-0">→VC</span>
          )}
          {stage.is_switch_workshop_type && (
            <span className="px-1 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-bold rounded shrink-0" title="Chuyển phân loại khi thả thẻ">⇄PL</span>
          )}
          {stage.counts_as_completed_revenue && (
            <span className="px-1 py-0.5 bg-teal-100 text-teal-700 text-[9px] font-bold rounded shrink-0" title="Cột tính «Đã công»">✓Công</span>
          )}
          {stage.counts_as_collected_revenue && (
            <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded shrink-0" title="Cột tính «Đã thu tiền»">💰Thu</span>
          )}
          {stage.auto_add_members_on_enter && (
            <span className="px-1 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-bold rounded shrink-0" title="Tự thêm thành viên khi kéo thẻ vào cột">👥Đội</span>
          )}
            {onSelectColumn && items.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectColumn(stage.id); }}
              className="px-1 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded cursor-pointer whitespace-nowrap"
                title="Chọn tất cả dự án trong cột này"
              >
                Chọn cột
              </button>
            )}
          </div>
        </div>
        {/* Mô tả phân loại — gắn với workshop_type của cột */}
        {(() => {
          const typeName = stage.workshop_type?.name;
          if (!typeName) return null;
          return (
            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[10px] font-medium text-teal-700 max-w-full">
              <span className="shrink-0">📦</span>
              <span className="truncate" title={`Phân loại: ${typeName}`}>{typeName}</span>
            </div>
          );
        })()}
        <p className={`text-[11px] tabular-nums mt-0.5 ${KANBAN_COLUMN_VALUE_METRIC_CLASS}`}>
          {totalValue > 0 ? formatVND(totalValue) : '0đ'}
        </p>
        {stage.auto_add_members_on_enter && (() => {
          const ds = stage.default_staff;
          const team = [
            ...(Array.isArray(ds?.users) ? ds.users : []),
            ds?.logistics_person ? { ...ds.logistics_person, _role: 'VC' } : null,
            ds?.installer_person ? { ...ds.installer_person, _role: 'LĐ' } : null,
          ].filter(Boolean);
          if (!team.length) {
            return (
              <p className="mt-1 text-[10px] text-indigo-600/80 italic" title="Cột bật tự thêm NV nhưng chưa cấu hình đội">
                👥 Chưa cấu hình đội
              </p>
            );
          }
          return (
            <div
              className="mt-1 flex flex-wrap items-center gap-1"
              title={`Đội tự thêm khi kéo vào cột: ${team.map((u) => `${u.full_name || u.email || ''}${u._role ? ` (${u._role})` : ''}`).join(', ')}`}
            >
              <span className="text-[9px] font-semibold text-indigo-700 shrink-0">👥</span>
              {team.slice(0, 4).map((u) => (
                <span
                  key={`${u.id}-${u._role || 'sx'}`}
                  className="inline-flex max-w-[88px] truncate items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-800"
                >
                  {u.full_name || u.email}
                  {u._role ? ` ·${u._role}` : ''}
                </span>
              ))}
              {team.length > 4 && (
                <span className="text-[9px] font-semibold text-indigo-600">+{team.length - 4}</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Cards container */}
      <div
        ref={containerRef}
        className={`flex-1 px-1 pt-1.5 pb-2.5 transition-colors ${KANBAN_CARDS_BODY_CLASS} ${
          isOverColumn ? 'kanban-cards-body--drop' : ''
        } ${
          pinEmptyPlaceholder ? KANBAN_CARDS_BODY_EMPTY_PIN_CLASS : ''
        } ${
          perColumnScroll ? 'min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]' : ''
        }`}
        style={perColumnScroll ? undefined : { minHeight: '180px' }}
      >
        {items.length === 0 ? (
          <div
            className={`${KANBAN_COLUMN_EMPTY_CLASS}${isOverColumn ? ' kanban-column-empty--drop' : ''}${pinEmptyPlaceholder ? ` ${KANBAN_COLUMN_EMPTY_PIN_CLASS}` : ''}`}
            style={pinEmptyPlaceholder ? { top: emptyPlaceholderTop } : undefined}
          >
            <Layers aria-hidden />
            <p>{isOverColumn ? 'Thả vào đây' : 'Chưa có dự án'}</p>
          </div>
        ) : (
          <KanbanColumnVirtualList
            items={items}
            columnScrollRef={containerRef}
            boardScrollRef={perColumnScroll ? null : boardScrollRef}
            compact={false}
            searchHighlightId={searchHighlightId}
            cardDomAttr="data-sx-kanban-card"
            renderCard={renderCard}
          />
        )}
      </div>
    </div>
  );
});

// ── KANBAN ITEM CARD (y hệt CRM KanbanCard) ─────────────────────────────────
const KanbanCard = memo(function KanbanCard({ item, stage, columnAccent, onMoveStage, pipelineStages, calculateDays, isSelected, onToggleSelect, onHandoverVC, onOpenKanbanComment, workTypes, onSetWorkType, onOpenDeadline, onTogglePin, searchHighlighted = false }) {
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const [handingOver, setHandingOver] = useState(false);
  const sxLeadId = resolveSxProjectLeadId(item);
  const isDebtCard = !!(
    (stage?.counts_as_completed_revenue || item.sx_pipeline_stage?.counts_as_completed_revenue)
    && !(stage?.counts_as_collected_revenue || item.sx_pipeline_stage?.counts_as_collected_revenue)
  );
  const projectValue = isDebtCard ? resolveSxProjectRemaining(item) : resolveSxProjectValue(item);

  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-workshop-bulk-checkbox]')) {
      e.preventDefault();
      return;
    }
    if (e.target.closest?.('[data-sx-kanban-deadline-btn]')) {
      e.preventDefault();
      return;
    }
    if (e.target.closest?.('[data-sx-quick-btn]') || e.target.closest?.('[data-kanban-options-menu]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };

  const stageColor = stage.color || '#e5e7eb';
  const staffList = Array.isArray(item.production_staff) ? item.production_staff : [];
  const primaryStaff = staffList.find((u) => u.is_primary) || staffList[0] || null;
  const assignee = item.production_person || primaryStaff || item.assignee;
  const deals = Array.isArray(item.crm_deals) ? item.crm_deals : [];
  const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  const cardTitle = (primaryDeal?.title || '').trim() || item.name || '';
  const crmAssignee = primaryDeal?.assignee || primaryDeal?.lead_owner || item.sales_person || null;
  const leadCreatedAt = primaryDeal?.created_at || item.created_at || null;
  const columnEnteredAt = item.sx_pipeline_stage_entered_at || item.stage_entered_at || item.updated_at || item.created_at || null;
  const sxStage = stage || item.sx_pipeline_stage;
  const hideColumnDeadline = shouldHideSxKanbanDeadlineOnCard(item, sxStage);
  const columnSlaTone = hideColumnDeadline
    ? null
    : getSxPipelineStageSlaTone(item.sx_pipeline_stage_entered_at, sxStage);
  const manualDlUrgency = !hideColumnDeadline && item.sx_kanban_deadline_at
    ? getCrmDeadlineUrgencyFromIso(item.sx_kanban_deadline_at)
    : null;
  const manualDlLevel = manualDlUrgency && manualDlUrgency.level !== 'ok' ? manualDlUrgency.level : null;
  const companyName = item.company?.short_name || item.company?.name || null;
  const externalCompanyName = primaryDeal?.external_company_name?.trim() || null;
  const slaDeadlineTs = hideColumnDeadline ? null : (() => {
    const raw = item.deadline || item.production_deadline || null;
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
  })();
  const nowTs = Date.now();
  const slaRemainingMs = slaDeadlineTs == null ? null : slaDeadlineTs - nowTs;
  const slaOverdue = slaRemainingMs != null && slaRemainingMs < 0;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Deal mới từ CRM (sx_intake) luôn ưu tiên badge "Mới"; fallback theo 24h như cũ
  const isNew = !!item.sx_intake || (item.created_at && (Date.now() - new Date(item.created_at).getTime()) < 86400000);
  const lockedInVc = ['shipping', 'installing', 'warranty', 'completed'].includes(String(item.status || ''));
  const crmRegionName = (() => {
    try {
      const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0];
      return deal?.crm_region?.name || null;
    } catch {
      return null;
    }
  })();

  const ignoreOrderDeliveryOverdue = shouldIgnoreSxOrderDeliveryOverdue(sxStage);
  const primaryDeadline = hideColumnDeadline ? null : (item.production_deadline || item.deadline || null);
  const customerInitials = getInitials(item.customer?.full_name || item.name || '');
  const progress = item.sx_pipeline_percent != null ? Math.max(0, Math.min(100, Number(item.sx_pipeline_percent) || 0)) : null;

  const cardBorderTone = (manualDlLevel === 'overdue' || columnSlaTone?.level === 'overdue')
    ? 'overdue'
    : isSelected
      ? 'selected'
      : 'default';

  useEffect(() => {
    if (!searchHighlighted || !cardRef.current) return;
    cardRef.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
  }, [searchHighlighted]);

  return (
    <div
      ref={cardRef}
      data-sx-kanban-card={item.id}
      draggable={!lockedInVc}
      onDragStart={handleDragStart}
      onClick={(e) => {
        if (e.target.closest?.('[data-workshop-bulk-checkbox]')) return;
        if (e.target.closest?.('[data-sx-quick-btn]')) return;
        markWorkshopPipelineCardFocus(item.id, 'sx');
        navigate(`/sx/projects/${item.id}`);
      }}
      className={`relative !bg-white rounded-lg px-2.5 pt-2.5 pb-2 transition-all duration-200 group hover:shadow-md ${KANBAN_PIPELINE_CARD_CLASS} ${
        searchHighlighted ? `${SX_KANBAN_SEARCH_HIT_TW} ${SX_KANBAN_SEARCH_HIT_CLASS}` : 'overflow-hidden'
      } ${
        lockedInVc ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''
      }`}
      style={{
        backgroundColor: '#ffffff',
        ...getKanbanPipelineCardBorderStyle(columnAccent, cardBorderTone),
      }}
    >
      {onToggleSelect && (
        <label
          data-workshop-bulk-checkbox
          className="absolute z-20 top-1.5 right-1.5 flex items-center justify-center cursor-pointer rounded p-0.5 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
          title="Chọn nhiều dự án"
        >
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </label>
      )}

      {/* Row 1: Code (nhỏ) + ngày tạo lead + Mới badge */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-mono font-semibold text-blue-600 truncate">{item.code}</span>
        {leadCreatedAt && (
          <span
            className="text-[10px] text-gray-500 tabular-nums shrink-0"
            title={`Tạo lead: ${formatDate(leadCreatedAt)}`}
          >
            {formatDate(leadCreatedAt)}
          </span>
        )}
        {isNew && (
          <span className="text-[9px] font-bold uppercase text-white bg-rose-500 px-1 py-px rounded leading-none">
            Mới
          </span>
        )}
        {lockedInVc && (
          <span className="text-[9px] font-bold uppercase text-orange-700 bg-orange-100 px-1 py-px rounded leading-none">
            VC
          </span>
        )}
      </div>

      {/* Row 2: Tên dự án — chính, đậm, 2 dòng */}
      <h4
        className="text-[13px] font-semibold leading-snug line-clamp-2 mb-1"
        style={{ color: '#000000' }}
        title={cardTitle}
      >
        {cardTitle}
      </h4>

      {/* Row phân loại — click đổi nhanh, không kích hoạt navigate (data-sx-quick-btn) */}
      {Array.isArray(workTypes) && workTypes.length > 0 && typeof onSetWorkType === 'function' && (
        <div data-sx-quick-btn className="mb-1.5" onClick={(ev) => ev.stopPropagation()}>
          <select
            value={item.workshop_type_id || ''}
            onChange={(ev) => {
              ev.stopPropagation();
              onSetWorkType(item.id, ev.target.value || null);
            }}
            className={`max-w-full h-6 text-[10px] px-1.5 pr-5 rounded border bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-400 ${
              item.workshop_type_id
                ? 'border-teal-200 text-teal-800'
                : 'border-amber-300 text-amber-700 bg-amber-50'
            }`}
            title={item.workshop_type_id ? `Phân loại: ${item.workshop_type?.name || ''}` : 'Bấm để chọn phân loại'}
          >
            <option value="">⚠️ Chưa phân loại</option>
            {workTypes.map((wt) => (
              <option key={wt.id} value={wt.id}>{wt.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Ngày đặt hàng + ngày giao hàng */}
      {(item.order_date || item.delivery_date) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {item.order_date && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 tabular-nums"
              title={`Ngày đặt hàng: ${formatDate(item.order_date)}`}
            >
              <Calendar className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
              Đặt: {formatDate(item.order_date)}
            </span>
          )}
          {item.delivery_date && (() => {
            const urgency = getSxOrderDeliveryDateUrgency(item.delivery_date, sxStage);
            const overdue = urgency?.overdue;
            const soon = urgency?.soon;
            return (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border tabular-nums ${
                  overdue
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : soon
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}
                title={`Ngày giao hàng: ${formatDate(item.delivery_date)}${ignoreOrderDeliveryOverdue ? ' · Cột đang bỏ quá hạn' : ''}`}
              >
                <Truck className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
                Giao: {formatDate(item.delivery_date)}
            </span>
            );
          })()}
        </div>
      )}

      {/* Row 3: Giá trị + Deadline cùng hàng */}
      {((projectValue > 0) || primaryDeadline) && (
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          {(
            projectValue > 0
              ? (
                <p className="text-sm font-bold text-emerald-600 tabular-nums truncate">
                  {formatVND(projectValue)}
                </p>
              )
              : (
                <span className="text-[11px] text-gray-400 italic">Chưa có giá trị</span>
              )
          )}
          {primaryDeadline && (
            <DeadlineBadge
              date={primaryDeadline}
              icon={item.production_deadline ? '🏭' : '📅'}
              label={item.production_deadline ? 'Giao xưởng' : 'Deadline'}
              suppressUrgency={ignoreOrderDeliveryOverdue}
            />
          )}
        </div>
      )}

      {/* Cờ thanh toán theo cột Kanban hiện tại */}
      {(() => {
        const showCompleted = !!(stage?.counts_as_completed_revenue || item.sx_pipeline_stage?.counts_as_completed_revenue);
        const showCollected = !!(stage?.counts_as_collected_revenue || item.sx_pipeline_stage?.counts_as_collected_revenue);
        if (!showCompleted && !showCollected) return null;
        return (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {showCompleted && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              ✓ Đã công
                </span>
              )}
          {showCollected && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              💰 Đã thu tiền
            </span>
        )}
      </div>
        );
      })()}

      {/* Deadline thẻ (sx_kanban_deadline_at) — bấm để sửa */}
      {!hideColumnDeadline && typeof onOpenDeadline === 'function' && item.sx_kanban_deadline_at && (() => {
        const { level } = getCrmDeadlineUrgencyFromIso(item.sx_kanban_deadline_at);
        const tone = `${getCrmDeadlineUrgencyBadgeClass(level)} hover:opacity-90 cursor-pointer`;
        const urgent = level === 'overdue' || level === 'soon';
        return (
          <button
            type="button"
            data-sx-kanban-deadline-btn
            onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
            className={`inline-flex items-center gap-1 rounded-md border transition-opacity mb-1.5 ${urgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px] font-semibold'} ${tone}`}
            title={`Deadline thẻ — bấm để sửa (${formatDate(item.sx_kanban_deadline_at)})`}
          >
            <Clock className="h-3 w-3" strokeWidth={2.4} />
            Deadline: {formatDate(item.sx_kanban_deadline_at)}
          </button>
        );
      })()}

      {/* Row 4: Khách hàng + Khu vực — 1 dòng với icon nhỏ */}
      {(item.customer?.full_name || crmRegionName) && (
        <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-0.5 min-w-0">
          {item.customer?.full_name && (
            <span className="inline-flex items-center gap-1 truncate min-w-0" title={item.customer.full_name}>
              <Users className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{item.customer.full_name}</span>
            </span>
          )}
          {crmRegionName && (
            <span className="inline-flex items-center gap-1 text-gray-500 shrink-0">
              <span className="text-[10px]">📍</span>{crmRegionName}
            </span>
          )}
        </div>
      )}

      {/* Người phụ trách CRM (deal) */}
      {crmAssignee?.full_name && (
        <div
          className="flex items-center gap-1.5 text-[11px] text-violet-700 mb-1 min-w-0"
          title={`Phụ trách CRM: ${crmAssignee.full_name}`}
        >
          <UserCheck className="h-3 w-3 text-violet-500 shrink-0" strokeWidth={2.4} />
          {crmAssignee.avatar ? (
            <img src={crmAssignee.avatar} alt="" className="h-4 w-4 rounded-full shrink-0" />
          ) : (
            <span
              className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ backgroundColor: '#7c3aed' }}
            >
              {getStaffInitials(crmAssignee.full_name)}
            </span>
          )}
          <span className="truncate font-medium" title={crmAssignee.full_name}>
            {formatStaffDisplayName(crmAssignee.full_name)}
          </span>
          <span className="text-[10px] text-violet-500 shrink-0">CRM</span>
        </div>
      )}

      {/* Row 5: Công ty SX / bên ngoài + SĐT — 1 dòng */}
      {(companyName || externalCompanyName || item.customer?.phone) && (
        <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-1.5 min-w-0">
          {companyName && (
            <span className="inline-flex items-center gap-1 truncate min-w-0" title={companyName}>
              <Factory className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{companyName}</span>
        </span>
          )}
          {externalCompanyName && (
            <span className="inline-flex items-center gap-1 truncate min-w-0 text-indigo-700" title={`Công ty bên ngoài: ${externalCompanyName}`}>
              <Building2 className="h-3 w-3 text-indigo-400 shrink-0" />
              <span className="truncate">{externalCompanyName}</span>
            </span>
          )}
          {item.customer?.phone && (
            <a
              href={`tel:${item.customer.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-gray-700 font-medium tabular-nums hover:text-blue-600"
            >
              {item.customer.phone}
            </a>
          )}
        </div>
      )}

      {/* Row 6: Tiến độ (nếu có) */}
      {progress != null && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-gray-500 shrink-0">Tiến độ</span>
          <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-teal-700 tabular-nums shrink-0">{progress}%</span>
        </div>
      )}

      {/* Footer: meta trái + actions phải — nút luôn nằm trong thẻ */}
      <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-gray-100 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0"
            title={columnEnteredAt ? `Vào cột: ${formatDate(columnEnteredAt)}` : `Tạo: ${formatDate(item.created_at)}`}
          >
            <Clock className="h-2.5 w-2.5" />
            {columnEnteredAt ? formatDate(columnEnteredAt) : formatDate(item.created_at)}
          </span>
          {columnSlaTone && columnSlaTone.level !== 'ok' && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                columnSlaTone.level === 'overdue'
                  ? 'bg-red-100 text-red-700'
                  : columnSlaTone.level === 'soon'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-yellow-50 text-yellow-800'
              }`}
              title="SLA cột pipeline"
            >
              SLA {columnSlaTone.level === 'overdue' ? 'quá hạn' : 'sắp hết'}
            </span>
          )}

          {/* Avatar / đội SX — tối đa 2 + badge, không chiếm chỗ nút thao tác */}
          {staffList.length > 1 ? (
            <span
              className="inline-flex items-center -space-x-1 min-w-0 overflow-hidden"
              title={staffList.map((u) => u.full_name).join(', ')}
            >
              {staffList.slice(0, 2).map((u) => (
                u.avatar ? (
                  <img key={u.id} src={u.avatar} alt="" className="h-5 w-5 rounded-full ring-2 ring-white shrink-0" />
                ) : (
                  <div
                    key={u.id}
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ring-2 ring-white shrink-0"
                    style={{ backgroundColor: u.is_primary ? '#4f46e5' : stageColor }}
                  >
                    {getStaffInitials(u.full_name)}
            </div>
                )
              ))}
              {staffList.length > 2 && (
                <span className="h-5 min-w-[20px] px-1 rounded-full bg-gray-200 text-[9px] font-bold text-gray-600 flex items-center justify-center ring-2 ring-white shrink-0">
                  +{staffList.length - 2}
                </span>
              )}
            </span>
          ) : assignee?.full_name ? (
            assignee.avatar ? (
              <img src={assignee.avatar} alt="" className="h-5 w-5 rounded-full shrink-0" title={assignee.full_name} />
            ) : (
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: stageColor }}
                title={assignee.full_name}
              >
                {getStaffInitials(assignee.full_name)}
            </div>
            )
          ) : (
            <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 text-[10px] flex items-center justify-center shrink-0" title="Chưa có người phụ trách">?</span>
          )}
        </div>

        {/* Nhóm icon thao tác nhanh — luôn cố định bên phải */}
        <div className="flex items-center gap-0.5 shrink-0 ml-0.5 rounded-full border border-teal-100 bg-white px-1 py-0.5 shadow-sm">
        {typeof onMoveStage === 'function' && Array.isArray(pipelineStages) && pipelineStages.length > 1 && (
          <KanbanCardQuickMove
            stages={pipelineStages}
            currentStageId={stage.id}
            onMove={(target) => onMoveStage(item.id, target)}
            disabled={lockedInVc}
            disabledTitle="Deal đã bàn giao VC — không thể chuyển cột"
            theme="sx"
            blockVirtualTargets={false}
          />
        )}

        {/* Quick: bình luận nhanh (nếu có handler) hoặc mở chat */}
        <button
          type="button"
          data-sx-quick-btn
          data-sx-kanban-comment-btn
          title={typeof onOpenKanbanComment === 'function' ? 'Bình luận nhanh' : 'Mở trao đổi'}
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onOpenKanbanComment === 'function') {
              onOpenKanbanComment(item);
            } else {
              navigate(`/sx/projects/${item.id}?tab=comments`);
            }
          }}
          className="h-5 w-5 inline-flex items-center justify-center rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-100 cursor-pointer"
        >
          <MessageSquare className="h-3 w-3" />
        </button>
        <KanbanCardOptionsMenu
          item={item}
          theme="sx"
          deadlineAt={item.sx_kanban_deadline_at}
          onOpenDeadline={onOpenDeadline}
          hideDeadlineOption={hideColumnDeadline}
          onTogglePin={onTogglePin}
          pinEnabled={!!sxLeadId}
        />
        </div>
      </div>

      {/* SLA cảnh báo (chỉ khi quá hạn / sắp) — đặt cuối */}
      {!hideColumnDeadline && slaDeadlineTs != null && slaOverdue && (
        <p className="mt-1.5 text-[10px] text-red-600 font-semibold flex items-center gap-1">
          ⚠️ Quá hạn SLA {formatDate(new Date(slaDeadlineTs).toISOString())}
        </p>
      )}

      {/* VC status (khi đã bàn giao) — gọn 1 dòng nhỏ */}
      {(item.status === 'shipping' || item.status === 'installing' || item.status === 'warranty' || item.vc_kanban_column_id) && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
          <Truck className="h-2.5 w-2.5" />
          <span className="font-medium">
            {item.vc_stage?.name || (item.status === 'shipping' ? 'Đang vận chuyển' : item.status === 'installing' ? 'Đang lắp đặt' : 'Bảo hành')}
          </span>
        </div>
      )}

      {/* Nút Bàn giao VC: chỉ hiện ở cột được đánh dấu is_handover_to_logistics */}
      {onHandoverVC && stage?.is_handover_to_logistics === true && !isProjectAlreadyInLogistics(item) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (handingOver) return;
            setHandingOver(true);
            Promise.resolve(onHandoverVC(item.id, item.name, stage?.id)).finally(() => setHandingOver(false));
          }}
          className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title="Bàn giao sang Vận chuyển"
        >
          {handingOver ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
          {handingOver ? 'Đang bàn giao...' : 'Bàn giao VC'}
        </button>
      )}
    </div>
  );
});

// ── KANBAN VIEW CONTAINER (y hệt CRM KanbanView) ─────────────────────────────
function KanbanView({
  pipeline,
  onMoveStage,
  calculateDays,
  selectedIds,
  onToggleSelect,
  onSelectColumn,
  onHandoverVC,
  onOpenKanbanComment,
  workTypes,
  onSetWorkType,
  onOpenDeadline,
  onTogglePin,
  remeasureToken,
  columnScrollMode = 'unified',
  searchHighlightId = null,
}) {
  const pipelineStages = useMemo(
    () => (pipeline || []).map(({ items, ...stage }) => stage),
    [pipeline],
  );
  const perColumnScroll = columnScrollMode === 'per-column';
  const boardScrollRef = useRef(null);

  return (
    <WorkshopPipelineKanbanScroll
      cardSelector="[data-sx-kanban-card]"
      columnScrollMode={columnScrollMode}
      remeasureToken={remeasureToken}
      scrollContainerRef={boardScrollRef}
      showLegend={false}
    >
      <div
        className={`flex min-w-max items-stretch gap-1 ${KANBAN_BOARD_COLUMN_RAILS_CLASS} ${perColumnScroll ? 'h-full' : ''} ${UI_KANBAN_FIXED_CLASS}`}
        style={{ '--kanban-col-gap': '0.25rem' }}
      >
        {pipeline.map((stage, columnIndex) => (
          <KanbanStageCard
            key={stage.id || stage.slug}
            columnIndex={columnIndex}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            pipelineStages={pipelineStages}
            calculateDays={calculateDays}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onSelectColumn={onSelectColumn}
            onHandoverVC={onHandoverVC}
            onOpenKanbanComment={onOpenKanbanComment}
            workTypes={workTypes}
            onSetWorkType={onSetWorkType}
            onOpenDeadline={onOpenDeadline}
            onTogglePin={onTogglePin}
            columnScrollMode={columnScrollMode}
            searchHighlightId={searchHighlightId}
            boardScrollRef={perColumnScroll ? null : boardScrollRef}
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

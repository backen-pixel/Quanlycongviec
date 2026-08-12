import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isSystemAdmin } from '../lib/adminRole';
import { isInstallVcStage } from '../lib/managementDashboardUtils';
import {
  canPickWorkshopCompany,
  isCrossWorkshopProductionViewer,
  workshopCompaniesForCrossViewer,
} from '../lib/crossWorkshopProduction';
import { getSocket } from '../lib/socket';
import {
  getWorkshopDateRange, WS_TIME_PRESETS, WS_KANBAN_LOAD_OPTIONS, WS_KANBAN_LOAD_ALL_MAX,
  workshopCreatedInRange, fetchWorkshopProjectPages,
} from '../lib/workshopDashboardUtils';
import {
  Truck, CheckCircle2, AlertTriangle, Search, X, Calendar,
  Package, Users, LayoutGrid, List, Plus,
  CheckSquare, UserCheck, Loader2, Wrench, ShieldCheck,
  Filter, Clock, Layers, Trash2, Settings, BarChart3,
  ChevronDown, ChevronUp, MessageSquare, Phone, ExternalLink,
} from 'lucide-react';
import { LogisticsListView, LogisticsPlannerView, LogisticsCalendarView, LogisticsDeadlineView } from '../components/LogisticsViews';
import { getCalendarMonthRange } from '../components/dashboard/DashboardMonthCalendar';
import NewLogisticsProjectModal from '../components/NewLogisticsProjectModal';
import WorkshopPipelineKanbanScroll, { useWorkshopKanbanScrollLayout } from '../components/WorkshopPipelineKanbanScroll';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import KanbanCardQuickMove from '../components/KanbanCardQuickMove';
import {
  useKanbanColumnTheme, KANBAN_CARDS_BODY_CLASS, UI_KANBAN_FIXED_CLASS,
  KANBAN_BOARD_COLUMN_RAILS_CLASS, KANBAN_COLUMN_RAIL_CLASS,
  KANBAN_CARDS_BODY_EMPTY_PIN_CLASS, KANBAN_COLUMN_EMPTY_CLASS, KANBAN_COLUMN_EMPTY_PIN_CLASS,
  useKanbanEmptyPlaceholderStickyTop,
} from '../lib/kanbanColumnTheme';
import WorkshopDashboardFilterPanel, { SX_FILTER_TABS_META } from '../components/WorkshopDashboardFilterPanel';
import SearchInlineFilterChips, { SearchClearButton } from '../components/SearchInlineFilterChips';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import ViewModeDropdownMenu from '../components/ViewModeDropdownMenu';
import AnchoredDropdownMenu from '../components/AnchoredDropdownMenu';
import AssignedTasksToolbarButton from '../components/AssignedTasksToolbarButton';
import { useWorkshopStaffFilter } from '../hooks/useWorkshopStaffFilter';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
  applyWorkshopProjectRenamePatches,
} from '../lib/workshopPipelineStorage';

const INTAKE_BUCKET = 'delivery_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'deadline', 'calendar'];
const VC_VIEW_MODE_OPTIONS = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'list', icon: List, label: 'Danh sách' },
  { id: 'planner', icon: Users, label: 'Planner' },
  { id: 'deadline', icon: Clock, label: 'Deadline' },
  { id: 'calendar', icon: Calendar, label: 'Lịch' },
];
const VC_ALT_VIEW_MODES = VC_VIEW_MODE_OPTIONS.filter((v) => v.id !== 'kanban');
const VC_SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'oldest', label: 'Cũ nhất' },
  { id: 'deadline', label: 'Deadline gần nhất' },
  { id: 'value', label: 'Giá trị cao → thấp' },
];
const LS_VC_FILTER_PANEL_POS = 'vc_filter_panel_pos';
const LS_VC_KANBAN_COLUMN_SCROLL = 'vc_kanban_column_scroll_mode';

function readStoredVcFilterPanelPos() {
  try {
    const raw = localStorage.getItem(LS_VC_FILTER_PANEL_POS);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
  } catch { /* ignore */ }
  return null;
}
function storeVcFilterPanelPos(pos) {
  try {
    if (!pos) localStorage.removeItem(LS_VC_FILTER_PANEL_POS);
    else localStorage.setItem(LS_VC_FILTER_PANEL_POS, JSON.stringify(pos));
  } catch { /* ignore */ }
}

const DEFAULT_VC_STAGES = [
  { id: 'vc_intake', name: 'Tiếp nhận', slug: 'delivery_pending', icon: '📦', color: '#f97316', bucket_slug: INTAKE_BUCKET },
  { id: 'vc_shipping', name: 'Đang giao', slug: 'delivery', icon: '🚚', color: '#ea580c' },
  { id: 'vc_delivered', name: 'Đã giao', slug: 'delivered', icon: '📬', color: '#c2410c' },
  { id: 'vc_install', name: 'Lắp đặt', slug: 'installation', icon: '🔧', color: '#d97706' },
  { id: 'vc_acceptance', name: 'Nghiệm thu - bàn giao', slug: 'acceptance', icon: '📋', color: '#0d9488' },
  { id: 'vc_done', name: 'Hoàn thiện', slug: 'completed', icon: '✅', color: '#16a34a' },
];

const LS_VC = 'vc_dash_filters_v1';
const LS_VC_KPI_PANEL = 'vc_kpi_panel_open';
function readVcDashPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_VC);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    try { localStorage.removeItem(LS_VC); } catch { /* ignore */ }
    return null;
  }
}

function readVcKpiPanelOpen() {
  try {
    const v = localStorage.getItem(LS_VC_KPI_PANEL);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* ignore */ }
  return true;
}

export default function LogisticsDashboard() {
  const P0 = useMemo(() => readVcDashPersisted(), []);
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const crossWorkshopViewer = isCrossWorkshopProductionViewer(user);

  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const projectsRef = useRef([]);
  const loadSeqRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => (typeof P0?.searchQuery === 'string' ? P0.searchQuery : ''));
  const [priorityFilter, setPriorityFilter] = useState(() => (typeof P0?.priorityFilter === 'string' ? P0.priorityFilter : ''));
  const [stageFilter, setStageFilter] = useState(() => (typeof P0?.stageFilter === 'string' ? P0.stageFilter : ''));
  const [viewMode, setViewMode] = useState(() => {
    const v = P0?.viewMode;
    return WS_DASH_VIEW_MODES.includes(v) ? v : 'kanban';
  });
  const [showNewProject, setShowNewProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState(() => P0?.filterCompany ?? '');
  const [timePreset, setTimePreset] = useState(() => P0?.timePreset ?? '');
  const [customFrom, setCustomFrom] = useState(() => P0?.customFrom ?? '');
  const [customTo, setCustomTo] = useState(() => P0?.customTo ?? '');
  const [kanbanLoadKey, setKanbanLoadKey] = useState(() => P0?.kanbanLoadKey ?? '500');
  const [filterPhone, setFilterPhone] = useState(() => P0?.filterPhone ?? '');
  const [showAdvFilter, setShowAdvFilter] = useState(() => !!P0?.showAdvFilter);
  const [vcFilterTab, setVcFilterTab] = useState('employee');
  const [filterPanelPos, setFilterPanelPos] = useState(() => readStoredVcFilterPanelPos());
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(() => P0?.timePreset === 'custom');
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const [showKanbanSettings, setShowKanbanSettings] = useState(false);
  const [showOverduePopover, setShowOverduePopover] = useState(false);
  const [kanbanColumnScrollMode, setKanbanColumnScrollMode] = useState(() => {
    try {
      const s = localStorage.getItem(LS_VC_KANBAN_COLUMN_SCROLL);
      if (s === 'per-column' || s === 'unified') return s;
    } catch { /* ignore */ }
    return P0?.kanbanColumnScrollMode === 'per-column' ? 'per-column' : 'unified';
  });
  const [sortBy, setSortBy] = useState(() => P0?.sortBy || 'newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const filterPanelRef = useRef(null);
  const filterPanelDragRef = useRef(null);
  const viewModeTriggerRef = useRef(null);
  const kanbanSettingsTriggerRef = useRef(null);
  const overdueTriggerRef = useRef(null);
  const sortMenuRef = useRef(null);
  const [filterWorkTypeId, setFilterWorkTypeId] = useState(() => P0?.filterWorkTypeId ?? '');
  const [workTypes, setWorkTypes] = useState([]);
  const [kpiPanelOpen, setKpiPanelOpen] = useState(() => readVcKpiPanelOpen());

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [allUsers, setAllUsers] = useState([]);
  const [showBulkDeadline, setShowBulkDeadline] = useState(false);
  const [showBulkPerson, setShowBulkPerson] = useState(false);
  const [bulkDeadlineVal, setBulkDeadlineVal] = useState('');
  const [bulkPersonId, setBulkPersonId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const navigate = useNavigate();

  const staffFilter = useWorkshopStaffFilter({
    user,
    isAdmin,
    companies,
    filterCompany,
    setFilterCompany,
    forModule: 'logistics',
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

  const deferredPersonName = useDeferredValue(filterPersonName);

  const handleStaffFilterCompanyChange = useCallback((companyId) => {
    onStaffFilterCompanyChange(companyId);
    setFilterWorkTypeId('');
  }, [onStaffFilterCompanyChange]);

  const companyParam = useMemo(() => {
    if (filterCompany) return String(filterCompany);
    return undefined;
  }, [filterCompany]);
  const companyForTypes = companyParam || '';

  const canPickCompany = canPickWorkshopCompany(user, isAdmin, isCompanyScopedAdmin);
  const workshopCompanyPickerList = useMemo(() => {
    if (isSystemAdmin(user)) return companies;
    if (isCompanyScopedAdmin && user?.company_id) {
      const cid = String(user.company_id);
      const own = (companies || []).find((c) => String(c.id) === cid);
      return own ? [own] : [{ id: cid, name: cid, short_name: cid }];
    }
    if (user?.company_id) return workshopCompaniesForCrossViewer(companies, user);
    if (crossWorkshopViewer && !isAdmin) return workshopCompaniesForCrossViewer(companies, user);
    return companies;
  }, [companies, crossWorkshopViewer, isAdmin, isCompanyScopedAdmin, user]);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    setLoading(true);
    try {
      const dashQ = {
        ...(companyParam ? { company_id: companyParam } : {}),
        ...(filterWorkTypeId ? { workshop_type_id: filterWorkTypeId } : {}),
      };
      const maxRecords = kanbanLoadKey === 'all' ? WS_KANBAN_LOAD_ALL_MAX
        : Math.min(parseInt(kanbanLoadKey, 10) || 500, WS_KANBAN_LOAD_ALL_MAX);
      // Thử lại /logistics/dashboard nếu lỗi tạm hoặc trả pipeline rỗng — tránh
      // toàn bộ cột Kanban «biến mất» khi API treo trong lúc quay lại dashboard.
      const fetchDashboard = async () => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const res = await api.get('/logistics/dashboard', { params: dashQ });
            const pipe = res?.data?.pipeline;
            if (Array.isArray(pipe) && pipe.length > 0) return res;
            if (attempt < 3) {
              await new Promise((r) => { window.setTimeout(r, 800 * attempt); });
              continue;
            }
            return res;
          } catch (err) {
            if (attempt >= 3) throw err;
            await new Promise((r) => { window.setTimeout(r, 800 * attempt); });
          }
        }
        return null;
      };
      const [dashRes, projectList] = await Promise.all([
        fetchDashboard().catch(() => null),
        fetchWorkshopProjectPages(api, '/logistics/projects', {
          companyId: companyParam,
          workshopTypeId: filterWorkTypeId || undefined,
          maxRecords,
          pageSize: 500,
          bustCache: !!peekWorkshopPipelineCardFocus('vc'),
        }).catch(() => null),
      ]);
      if (isStale()) return;
      // Chỉ ghi state khi request thành công — tránh lỗi tạm ghi đè list/pipeline đúng bằng rỗng.
      if (dashRes) {
        setKpis(dashRes.data?.kpis || {});
        setPipeline(dashRes.data?.pipeline || []);
      }
      if (projectList !== null) {
        setProjects(applyWorkshopProjectRenamePatches(projectList));
      }
      if (dashRes || projectList !== null) setLastSyncedAt(new Date());
    } catch (e) {
      console.error(e);
    }
    if (!isStale()) setLoading(false);
  }, [companyParam, kanbanLoadKey, filterWorkTypeId]);

  useEffect(() => { load(); }, [load]);

  /** Vào Lịch: reload để có pickup_at / install_date (list Kanban cũ có thể thiếu field). */
  const calendarReloadOnceRef = useRef(false);
  useEffect(() => {
    if (viewMode !== 'calendar') {
      calendarReloadOnceRef.current = false;
      return;
    }
    if (calendarReloadOnceRef.current) return;
    calendarReloadOnceRef.current = true;
    load();
  }, [viewMode, load]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Tự reload khi có project bàn giao sang VC qua socket / sự kiện local
  useEffect(() => {
    const socket = getSocket();
    const handler = (data) => {
      // Chỉ reload khi có dự án "mới xuất hiện" trong module VC (bàn giao từ SX),
      // tránh reload toàn trang khi user đang kéo thả đổi cột ngay trong VC.
      const pid = data?.id || data?.project_id || data?.project?.id;
      if (!pid) return;
      const existed = (projectsRef.current || []).some((p) => String(p.id) === String(pid));
      if (existed) return;

      const s = data?.status || data?.project?.status;
      const handedOver = Boolean(
        data?.reason === 'vc_handover'
        || data?.reason === 'handover_vc'
        || data?.reason === 'vc_handover_reassert'
        || data?.logistics_company_id
        || data?.vc_kanban_column_id
        || data?.project?.logistics_company_id
        || data?.project?.vc_kanban_column_id,
      );
      if (handedOver || s === 'shipping' || s === 'installing' || s === 'warranty' || s === 'completed') {
        load();
      }
    };
    const onLocal = (ev) => handler(ev?.detail || {});
    if (socket) {
      socket.on('project:stage_changed', handler);
      socket.on('logistics:board_changed', handler);
    }
    window.addEventListener('vc-handover:board-refresh', onLocal);
    return () => {
      if (socket) {
        socket.off('project:stage_changed', handler);
        socket.off('logistics:board_changed', handler);
      }
      window.removeEventListener('vc-handover:board-refresh', onLocal);
    };
  }, [load]);

  useEffect(() => {
    api.get('/users').then(r => setAllUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  /** Pipeline VC gắn theo công ty — không dùng bộ Global khi chọn «Tất cả». */
  useEffect(() => {
    if (!workshopCompanyPickerList.length) return;
    const valid = filterCompany
      && workshopCompanyPickerList.some((c) => String(c.id) === String(filterCompany));
    if (valid) return;
    let saved = '';
    try { saved = String(localStorage.getItem('vc_pipeline_settings_company_id') || ''); } catch { /* ignore */ }
    const fromSaved = saved
      ? workshopCompanyPickerList.find((c) => String(c.id) === saved)
      : null;
    const pick = fromSaved || workshopCompanyPickerList[0];
    if (pick?.id) handleStaffFilterCompanyChange(pick.id);
  }, [workshopCompanyPickerList, filterCompany, handleStaffFilterCompanyChange]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_VC, JSON.stringify({
        filterCompany, timePreset, customFrom, customTo, kanbanLoadKey,
        filterPersonId, filterPersonName, filterRegion, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode,
        showAdvFilter, kanbanColumnScrollMode, sortBy,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, timePreset, customFrom, customTo, kanbanLoadKey, filterPersonId, filterPersonName,
    filterRegion, filterPhone, filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode,
    showAdvFilter, kanbanColumnScrollMode, sortBy,
  ]);

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

  /** Lịch tháng: prev/next/Hôm nay → lọc thời gian = cả tháng đang xem. */
  const handleCalendarMonthChange = useCallback(({ from, to }) => {
    if (!from || !to) return;
    setTimePreset('custom');
    setCustomFrom(from);
    setCustomTo(to);
    setShowCustomDate(true);
    setShowDateRangePicker(false);
  }, []);

  /** Vào tab Lịch: nếu chưa có khoảng ngày → neo tháng hiện tại (đồng bộ header lịch ↔ bộ lọc). */
  useEffect(() => {
    if (viewMode !== 'calendar') return;
    if (customFrom && customTo) return;
    const now = new Date();
    const range = getCalendarMonthRange(now.getFullYear(), now.getMonth());
    setTimePreset('custom');
    setCustomFrom(range.from);
    setCustomTo(range.to);
    setShowCustomDate(true);
  }, [viewMode, customFrom, customTo]);

  const timeFilterLabel = useMemo(() => {
    if (!timePreset) return '';
    if (timePreset === 'custom') {
      if (customFrom && customTo) return `${customFrom} → ${customTo}`;
      return 'Tùy chỉnh';
    }
    return WS_TIME_PRESETS.find((p) => p.key === timePreset)?.label || '';
  }, [timePreset, customFrom, customTo]);

  const openVcFilterPanel = useCallback(() => {
    setShowAdvFilter((open) => !open);
    if (!showAdvFilter) setVcFilterTab('employee');
  }, [showAdvFilter]);

  const closeVcFilterPanel = useCallback(() => {
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
        if (pos) storeVcFilterPanelPos(pos);
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
      if (e.key === 'Escape' && !showDateRangePicker) closeVcFilterPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvFilter, showDateRangePicker, closeVcFilterPanel]);

  useEffect(() => {
    if (!companyForTypes) {
      setWorkTypes([]);
      return;
    }
    api.get('/workshop/project-types', { params: { company_id: companyForTypes, module: 'logistics' } })
      .then((r) => setWorkTypes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setWorkTypes([]));
  }, [companyForTypes]);

  const dateFromTo = useMemo(() => {
    if (timePreset === 'custom') {
      if (!customFrom || !customTo) return { from: '', to: '' };
      return { from: customFrom, to: customTo };
    }
    if (timePreset) return getWorkshopDateRange(timePreset);
    return { from: '', to: '' };
  }, [timePreset, customFrom, customTo]);

  /** Tháng neo lịch = đầu khoảng lọc (preset hoặc custom). */
  const calendarFilterFrom = useMemo(() => {
    if (timePreset === 'custom') return customFrom || '';
    if (timePreset) return dateFromTo.from || customFrom || '';
    return customFrom || '';
  }, [timePreset, customFrom, dateFromTo.from]);

  const scopeProjects = useMemo(() => {
    return projects.filter((p) => {
      const { from, to } = dateFromTo;
      // Tab Lịch: neo tháng theo install_date trên lưới — không lọc theo ngày tạo
      if (viewMode !== 'calendar' && from && to && !workshopCreatedInRange(p.created_at, from, to)) {
        return false;
      }
      if (!matchesProject(p, { personNameQ: deferredPersonName })) return false;
      if (filterPhone === 'has' && !p.customer?.phone) return false;
      if (filterPhone === 'no' && p.customer?.phone) return false;
      return true;
    });
  }, [projects, dateFromTo, matchesProject, deferredPersonName, filterPhone, viewMode]);

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

  const applyBulkDeadline = useCallback(async () => {
    if (!bulkDeadlineVal || !selectedIds.size) return;
    setBulkSaving(true);
    try {
      await Promise.all([...selectedIds].map(id => api.put(`/projects/${id}`, { deadline: bulkDeadlineVal })));
      await load();
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
      await Promise.all([...selectedIds].map(id => api.put(`/projects/${id}`, { logistics_person_id: bulkPersonId })));
      await load();
      setShowBulkPerson(false);
      setBulkPersonId('');
      clearSelection();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gắn người VC'); }
    setBulkSaving(false);
  }, [bulkPersonId, selectedIds, load, clearSelection]);

  const kanbanPipeline = useMemo(() => {
    const baseStages = pipeline.length ? pipeline : DEFAULT_VC_STAGES;

    const stageIds = new Set(baseStages.map((s) => String(s.id)));
    const orphans = scopeProjects.filter((p) => !p.vc_kanban_column_id || !stageIds.has(String(p.vc_kanban_column_id)));
    const firstStageId = baseStages[0]?.id;

    return baseStages.map((stage) => ({
      ...stage,
      items: [
        ...scopeProjects.filter((p) => String(p.vc_kanban_column_id) === String(stage.id)),
        ...(String(stage.id) === String(firstStageId) ? orphans : []),
      ],
    }));
  }, [pipeline, scopeProjects]);

  const filteredKanbanPipeline = useMemo(() => {
    const sortItems = (arr) => {
      const list = [...arr];
      if (sortBy === 'oldest') {
        list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      } else if (sortBy === 'deadline') {
        list.sort((a, b) => {
          const ta = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const tb = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return ta - tb;
        });
      } else if (sortBy === 'value') {
        list.sort((a, b) => (Number(b.estimated_value) || 0) - (Number(a.estimated_value) || 0));
      } else {
        list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      }
      return list;
    };
    const result = kanbanPipeline.map((stage) => ({
      ...stage,
      items: sortItems(stage.items.filter((p) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const hit = p.code?.toLowerCase().includes(q)
            || p.name?.toLowerCase().includes(q)
            || p.notes?.toLowerCase().includes(q)
            || p.customer?.full_name?.toLowerCase().includes(q)
            || String(p.customer?.phone || '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (priorityFilter && p.priority !== priorityFilter) return false;
        if (stageFilter && p.vc_kanban_column_id !== stageFilter) return false;
        return true;
      })),
    }));
    filteredKanbanPipelineRef.current = result;
    return result;
  }, [kanbanPipeline, searchQuery, priorityFilter, stageFilter, sortBy]);

  const filteredProjectCount = useMemo(
    () => filteredKanbanPipeline.reduce((n, s) => n + s.items.length, 0),
    [filteredKanbanPipeline],
  );

  /** Từ chi tiết: cuộn tới thẻ vừa xem (cần đặt sau filteredKanbanPipeline) */
  useEffect(() => {
    if (loading) return;
    const id = peekWorkshopPipelineCardFocus('vc');
    if (!id) return;
    if (viewMode !== 'kanban') {
      setViewMode('kanban');
      return;
    }
    const pulse = (el) => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-orange-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      }, 2200);
      clearWorkshopPipelineCardFocus('vc');
    };
    const tryOnce = () => {
      const el = document.querySelector(`[data-vc-kanban-card="${id}"]`);
      if (el) {
        pulse(el);
        return true;
      }
      return false;
    };
    if (tryOnce()) return undefined;
    const t = window.setTimeout(() => {
      if (!tryOnce()) clearWorkshopPipelineCardFocus('vc');
    }, 500);
    return () => clearTimeout(t);
  }, [loading, viewMode, filteredKanbanPipeline]);

  const handleMoveStage = useCallback(async (projectId, targetCol) => {
    const isIntake = targetCol?.bucket_slug === INTAKE_BUCKET || String(targetCol?.id || '').startsWith('__vc_');
    if (isIntake) {
      setProjects((prev) => prev.map((p) => (String(p.id) === String(projectId)
        ? { ...p, current_stage: null, vc_kanban_column_id: targetCol.id, vc_intake: true } : p)));
      try {
        await api.patch(`/logistics/projects/${projectId}/stage`, { move_to_intake: true });
      } catch (e) { console.error(e); load(); }
      return;
    }

    const willJumpToInstall = !!targetCol?.is_handover_to_install && !isInstallVcStage(targetCol);
    if (willJumpToInstall) {
      const current = projects.find((p) => String(p.id) === String(projectId));
      const label = current?.name || current?.code || 'dự án';
      if (!window.confirm(`Chuyển «${label}» từ Vận chuyển sang Lắp đặt?`)) return;
    }

    // Optimistic: nếu nhảy LĐ thì đặt vào cột lắp đặt đầu tiên (nếu biết), không thì giữ target
    const installCol = willJumpToInstall
      ? (kanbanPipeline || []).find((s) => isInstallVcStage(s))
      : null;
    const landCol = installCol || targetCol;
    const wid = landCol?.workflow_stage_id;
    const optimisticStage = wid
      ? { id: wid, slug: landCol.slug || landCol.bucket_slug, name: landCol.name, color: landCol.color, icon: landCol.icon }
      : { id: landCol.id, slug: landCol.bucket_slug || landCol.slug, name: landCol.name, color: landCol.color, icon: landCol.icon };
    setProjects((prev) => prev.map((p) => (String(p.id) === String(projectId)
      ? {
        ...p,
        current_stage: optimisticStage,
        vc_kanban_column_id: landCol.id,
        vc_intake: false,
        ...(willJumpToInstall ? { status: 'installing' } : {}),
      } : p)));

    try {
      // Gửi id cột gate (có cờ → LĐ); backend tự nhảy sang cột Lắp đặt
      const body = { vc_stage_id: targetCol.id };
      if (targetCol?.workflow_stage_id) body.stage_id = targetCol.workflow_stage_id;
      const { data } = await api.patch(`/logistics/projects/${projectId}/stage`, body);
      if (data?.jumped_to_install && data?.install_stage_id) {
        setProjects((prev) => prev.map((p) => (String(p.id) === String(projectId)
          ? {
            ...p,
            vc_kanban_column_id: data.install_stage_id,
            status: 'installing',
            current_stage: {
              ...(p.current_stage || {}),
              id: data.install_stage_id,
              name: data.install_stage_name || p.current_stage?.name,
            },
          } : p)));
      }
    } catch (e) { console.error(e); load(); }
  }, [load, projects, kanbanPipeline]);

  const handleDeleteCard = useCallback((projectId, projectLabel) => {
    if (!projectId) return;
    setDeleteTarget({ id: projectId, label: projectLabel });
    setDeleteReason('');
  }, []);

  const cancelDelete = useCallback(() => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteReason('');
  }, [deleteBusy]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const targetId = deleteTarget.id;
    const reason = deleteReason.trim();
    const prev = projectsRef.current;
    setProjects((cur) => cur.filter((p) => String(p.id) !== String(targetId)));
    try {
      await api.delete(`/logistics/projects/${targetId}`, {
        data: { delete_reason: reason || null },
      });
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Lỗi xóa dự án');
      setProjects(prev);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deleteReason]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày';
    if (days < 7) return `${days} ngày`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
  };

  const hasTimeFilter = Boolean(
    (timePreset && timePreset !== 'custom') || (timePreset === 'custom' && customFrom && customTo),
  );
  const hasActiveFilter = !!(
    searchQuery || priorityFilter || stageFilter || hasTimeFilter
    || filterPhone || filterWorkTypeId || staffFilterActiveCount
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilter('');
    setStageFilter('');
    handleTimePresetChange('');
    setFilterPhone('');
    setFilterWorkTypeId('');
    resetStaffFilters();
  }, [resetStaffFilters, handleTimePresetChange]);

  const activeVcFilterChips = useMemo(() => {
    const chips = [];
    const push = (key, label, onClear) => chips.push({ key, label, onClear });
    if (searchQuery.trim()) {
      push('search', `Tìm: “${searchQuery.trim()}”`, () => setSearchQuery(''));
    }
    if (filterCompany && canPickCompany && workshopCompanyPickerList.length > 1) {
      const name = companies.find((c) => String(c.id) === String(filterCompany))?.short_name
        || companies.find((c) => String(c.id) === String(filterCompany))?.name
        || filterCompany;
      // Không clear về «Tất cả» (pipeline Global lệch) — chuyển sang công ty kế tiếp.
      push('company', `Công ty: ${name}`, () => {
        const idx = workshopCompanyPickerList.findIndex((c) => String(c.id) === String(filterCompany));
        const next = workshopCompanyPickerList[(idx + 1) % workshopCompanyPickerList.length];
        if (next?.id) handleStaffFilterCompanyChange(next.id);
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
    if (filterWorkTypeId) {
      const name = workTypes.find((wt) => String(wt.id) === String(filterWorkTypeId))?.name || filterWorkTypeId;
      push('workType', `Phân loại: ${name}`, () => setFilterWorkTypeId(''));
    }
    if (priorityFilter) {
      const label = priorityFilter === 'high' ? 'Cao' : priorityFilter === 'medium' ? 'TB' : 'Thấp';
      push('priority', `Ưu tiên: ${label}`, () => setPriorityFilter(''));
    }
    if (filterPhone === 'has') push('phone', 'Có SĐT', () => setFilterPhone(''));
    else if (filterPhone === 'no') push('phone', 'Chưa có SĐT', () => setFilterPhone(''));
    if (timePreset) {
      push('time', `Thời gian: ${timeFilterLabel || timePreset}`, () => handleTimePresetChange(''));
    }
    return chips;
  }, [
    searchQuery, filterCompany, canPickCompany, companies, workshopCompanyPickerList,
    handleStaffFilterCompanyChange,
    filterRegion, companyRegions, filterPersonId, filterPersonName, employeeOptionsForSelect,
    stageFilter, pipeline, filterWorkTypeId, workTypes, priorityFilter, filterPhone,
    timePreset, timeFilterLabel, handleTimePresetChange,
    setFilterRegion, setFilterPersonId, setFilterPersonName,
  ]);

  const activeVcFilterCount = activeVcFilterChips.length;
  const vcInlineFilterChips = useMemo(
    () => activeVcFilterChips.filter((c) => c.key !== 'search'),
    [activeVcFilterChips],
  );

  const vcFilterTabCounts = useMemo(() => ({
    employee: staffFilterActiveCount,
    pipeline: (stageFilter ? 1 : 0) + (filterWorkTypeId ? 1 : 0) + (priorityFilter ? 1 : 0) + (filterPhone ? 1 : 0),
    display: (timePreset ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0) + (kanbanLoadKey !== '500' ? 1 : 0),
  }), [staffFilterActiveCount, stageFilter, filterWorkTypeId, priorityFilter, filterPhone, timePreset, sortBy, kanbanLoadKey]);

  const vcFilterTabs = useMemo(
    () => SX_FILTER_TABS_META.map((t) => ({ ...t, count: vcFilterTabCounts[t.id] || 0 })),
    [vcFilterTabCounts],
  );

  const vcFilterPanelActive = showAdvFilter
    || filterCompany || filterRegion || filterPersonId || filterPersonName
    || stageFilter || filterWorkTypeId || priorityFilter || filterPhone
    || timePreset || searchQuery.trim();

  const selectColumn = useCallback((stageId) => {
    const stage = filteredKanbanPipelineRef.current.find((s) => String(s.id) === String(stageId));
    if (!stage?.items?.length) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      stage.items.forEach((p) => next.add(p.id));
      return next;
    });
  }, []);

  const overdueItems = useMemo(() => {
    const list = (kanbanPipeline || []).flatMap((s) => (s.items || []).map((p) => ({
      ...p,
      stageName: s.name,
    })));
    return list
      .filter((p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed')
      .map((p) => ({
        id: p.id,
        code: p.code || `#${p.id}`,
        title: p.name || '',
        customerName: p.customer?.full_name || '',
        stageName: p.stageName || '',
        overdueMs: Date.now() - new Date(p.deadline).getTime(),
      }))
      .sort((a, b) => b.overdueMs - a.overdueMs);
  }, [kanbanPipeline]);

  const focusOverdueItem = useCallback((it) => {
    const el = document.querySelector(`[data-vc-kanban-card="${it.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
      setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2'), 2500);
    } else {
      markWorkshopPipelineCardFocus(it.id, 'vc');
      navigate(`/vc/projects/${it.id}`);
    }
    setShowOverduePopover(false);
  }, [navigate]);

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return '';
    try {
      return lastSyncedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [lastSyncedAt]);

  const toggleKpiPanel = useCallback(() => {
    setKpiPanelOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_VC_KPI_PANEL, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /** KPI toàn pipeline VC + Lắp đặt. */
  const tabKpis = useMemo(() => {
    const list = kanbanPipeline.flatMap((s) => s.items || []);
    const overdue = list.filter(
      (p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed',
    ).length;
    return {
      total: list.length,
      shipping: list.filter((p) => p.status === 'shipping' || p.current_stage?.slug === 'delivery').length,
      installing: list.filter((p) => p.status === 'installing' || p.current_stage?.slug === 'installation').length,
      warranty: list.filter((p) => p.status === 'warranty' || p.current_stage?.slug === 'customer-care').length,
      completed: list.filter((p) => p.status === 'completed').length,
      overdue,
      avgProgress: list.length
        ? Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length)
        : 0,
    };
  }, [kanbanPipeline]);

  const ctrlH = 'h-8';
  const ctrlIcon = 'h-7 w-7';
  const ctrlTxt = 'text-xs';
  const toolbarBtn = `${ctrlH} px-2 rounded-md ${ctrlTxt} font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Panel điều khiển VC — tabs / tìm kiếm / KPI giống CRM */}
      <div className="ui-solid-white rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200/60">
          {/* Hàng 1 — tab pipeline & hành động */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap px-2.5 py-1 sm:px-3 bg-slate-50/50">
            <div className="flex items-center gap-1 min-w-0">
              <div
                data-tour="vc-pipeline-tabs"
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-orange-200/80 bg-white text-[11px] font-semibold text-orange-700 shrink-0"
                title="Pipeline Lắp đặt"
              >
                <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">Lắp đặt</span>
                {tabKpis.total > 0 && (
                  <span className="tabular-nums text-orange-600/80 font-bold">{tabKpis.total.toLocaleString('vi-VN')}</span>
                )}
              </div>
              {canPickCompany && workshopCompanyPickerList.length > 0 && (
                <label
                  className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md border border-orange-200 bg-white text-orange-700 shrink-0"
                  title="Chọn công ty Lắp đặt"
                >
                  <Truck className="h-3.5 w-3.5 shrink-0" />
                  <select
                    value={filterCompany}
                    onChange={(e) => handleStaffFilterCompanyChange(e.target.value)}
                    className="h-6 max-w-[13rem] border-0 bg-transparent p-0 pr-5 text-[11px] font-semibold text-slate-700 focus:ring-0 cursor-pointer"
                    aria-label="Công ty Lắp đặt"
                  >
                    {workshopCompanyPickerList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short_name || c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {overdueItems.length > 0 && (
                <div className="relative">
                  <button
                    ref={overdueTriggerRef}
                    type="button"
                    onClick={() => setShowOverduePopover((v) => !v)}
                    className={`relative inline-flex items-center justify-center h-7 w-7 rounded-md border cursor-pointer transition-colors ${
                      showOverduePopover
                        ? 'border-red-400 bg-red-100 text-red-700'
                        : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                    aria-label={`${overdueItems.length} dự án quá hạn`}
                    aria-expanded={showOverduePopover}
                    title={`${overdueItems.length} dự án quá hạn — bấm để xem danh sách`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white text-[8px] font-bold flex items-center justify-center tabular-nums leading-none">
                      {overdueItems.length > 99 ? '99+' : overdueItems.length}
                    </span>
                  </button>
                  <AnchoredDropdownMenu
                    open={showOverduePopover}
                    onClose={() => setShowOverduePopover(false)}
                    anchorRef={overdueTriggerRef}
                    align="left"
                    className="rounded-xl border-red-200 p-0 w-[min(100vw-1.5rem,20rem)] overflow-hidden shadow-xl"
                  >
                    <div className="px-3 py-2 border-b border-red-100 bg-red-50 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-red-800">
                        {overdueItems.length} dự án quá hạn
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowOverduePopover(false)}
                        className="p-0.5 rounded text-red-500 hover:bg-red-100 cursor-pointer"
                        aria-label="Đóng"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
                      {overdueItems.slice(0, 30).map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => focusOverdueItem(it)}
                          className="w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 hover:bg-red-50/80 cursor-pointer"
                        >
                          <p className="text-[11px] font-mono text-slate-500">{it.code}</p>
                          <p className="text-xs font-semibold text-slate-900 truncate">{it.title || '—'}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {it.stageName}{it.customerName ? ` · ${it.customerName}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  </AnchoredDropdownMenu>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {loading ? (
                <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-amber-700 mr-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
                </span>
              ) : lastSyncLabel ? (
                <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-slate-500 mr-1" title="Lần cập nhật gần nhất">
                  <span className="inline-block rounded-full bg-emerald-500 h-1.5 w-1.5" />
                  Cập nhật {lastSyncLabel} · {filteredProjectCount.toLocaleString('vi-VN')} thẻ
                </span>
              ) : (
                <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-slate-500 mr-1" title="Số thẻ sau lọc / tiến độ TB">
                  <span className="inline-block rounded-full bg-emerald-500 h-1.5 w-1.5" />
                  {filteredProjectCount.toLocaleString('vi-VN')} thẻ · TB {tabKpis.avgProgress}%
                </span>
              )}
              <AssignedTasksToolbarButton
                to="/vc/assignments"
                assignmentModule="logistics"
                variant="outlined"
                className="!h-7 !rounded-md !text-[11px]"
              />
              <button
                type="button"
                onClick={() => navigate('/admin/trash?tab=vc')}
                className={`${ctrlIcon} shrink-0 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-md flex items-center justify-center cursor-pointer transition-colors`}
                title="Thùng rác — dự án VC đã xóa"
                aria-label="Thùng rác"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/vc/pipeline-settings"
                className={`${ctrlIcon} shrink-0 border border-slate-200 text-slate-500 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 rounded-md flex items-center justify-center transition-colors`}
                title="Cài đặt pipeline VC"
                aria-label="Cài đặt pipeline"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className={`${ctrlH} shrink-0 px-2.5 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors text-white shadow-sm bg-orange-600 hover:bg-orange-700`}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className={ctrlTxt}>Thêm dự án</span>
              </button>
            </div>
          </div>

          {/* Hàng 2 — tìm kiếm & chế độ xem */}
          <div className="flex flex-wrap items-center gap-1 px-2.5 py-1 sm:px-3 border-t border-slate-200/50">
            <div
              className={`group/search flex items-center shrink-0 flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${
                searchQuery.trim()
                  ? 'border-orange-300 bg-orange-50/80'
                  : vcInlineFilterChips.length && !showAdvFilter
                    ? 'border-orange-200 bg-orange-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-7 pr-1">
                <Search
                  className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
                    searchQuery.trim() ? 'text-orange-600' : 'text-slate-400'
                  }`}
                />
                {!showAdvFilter && vcInlineFilterChips.length > 0 && (
                  <SearchInlineFilterChips
                    chips={vcInlineFilterChips}
                    opacityClass={searchQuery.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'}
                    onClearChip={(chip) => chip.onClear()}
                    onClearAll={clearAllFilters}
                    showClearAll={vcInlineFilterChips.length > 1}
                  />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm dự án VC/LĐ, KH, SĐT, mã…"
                  className={`flex-1 min-w-[3.5rem] ${ctrlH} bg-transparent border-0 ${ctrlTxt} font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${searchQuery ? 'pr-7' : ''}`}
                />
                {searchQuery && (
                  <SearchClearButton onClick={() => setSearchQuery('')} />
                )}
              </div>
              <div className="shrink-0 pr-1 pl-0.5 border-l border-slate-200/80">
                <button
                  type="button"
                  onClick={openVcFilterPanel}
                  aria-expanded={showAdvFilter}
                  className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all cursor-pointer ${
                    showAdvFilter || vcFilterPanelActive
                      ? 'bg-orange-200 text-orange-800 border-orange-400 shadow-sm ring-1 ring-orange-200/60'
                      : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 hover:text-orange-800'
                  }`}
                  title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                  aria-label="Bộ lọc"
                >
                  <Filter className="h-3 w-3" />
                  {activeVcFilterCount > 0 && (
                    <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-orange-600 ring-1 ring-white" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80">
              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`${toolbarBtn} ${
                    viewMode === 'kanban'
                      ? 'bg-white text-orange-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
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
                    className={`${toolbarBtn} ${
                      viewMode !== 'kanban'
                        ? 'bg-white text-orange-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Chế độ xem khác"
                    aria-expanded={showViewModeMenu}
                  >
                    {(() => {
                      const active = VC_ALT_VIEW_MODES.find((v) => v.id === viewMode);
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
                    modes={VC_ALT_VIEW_MODES}
                    activeId={viewMode}
                    theme="orange"
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
                    className={`${ctrlH} px-2 rounded-md border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                      showKanbanSettings || kanbanColumnScrollMode === 'per-column'
                        ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
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
                      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50 has-[:checked]:border-orange-400 has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input
                          type="radio"
                          name="vc-kanban-column-scroll"
                          className="mt-0.5 shrink-0"
                          checked={kanbanColumnScrollMode === 'unified'}
                          onChange={() => {
                            setKanbanColumnScrollMode('unified');
                            try { localStorage.setItem(LS_VC_KANBAN_COLUMN_SCROLL, 'unified'); } catch { /* ignore */ }
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-gray-800">Cuộn chung tất cả cột</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">Kéo một lần, mọi cột cuộn cùng chiều dọc (mặc định).</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50 has-[:checked]:border-orange-400 has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input
                          type="radio"
                          name="vc-kanban-column-scroll"
                          className="mt-0.5 shrink-0"
                          checked={kanbanColumnScrollMode === 'per-column'}
                          onChange={() => {
                            setKanbanColumnScrollMode('per-column');
                            try { localStorage.setItem(LS_VC_KANBAN_COLUMN_SCROLL, 'per-column'); } catch { /* ignore */ }
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-gray-800">Cuộn riêng từng cột</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">Mỗi cột có thanh cuộn dọc riêng.</span>
                        </span>
                      </label>
                    </div>
                  </AnchoredDropdownMenu>
                </div>
              )}
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className={`${ctrlH} px-2 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md ${ctrlTxt} transition cursor-pointer border border-slate-200`}
                  title="Xóa bộ lọc"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bộ lọc nổi + chip thời gian — giống CRM/SX */}
        {!showAdvFilter && showCustomDate && (
          <div className="flex flex-wrap items-center gap-3 px-2.5 sm:px-3 py-2 border-b border-orange-100 bg-orange-50/60">
            <span className="text-xs font-bold text-orange-600 uppercase flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Khoảng thời gian:
            </span>
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-8 px-3 bg-white border border-orange-200 rounded-lg text-xs hover:bg-orange-50 cursor-pointer"
            >
              {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Chọn ngày bắt đầu/kết thúc'}
            </button>
            <button
              type="button"
              onClick={() => handleTimePresetChange('')}
              className="h-8 px-3 bg-white text-gray-500 hover:text-gray-700 rounded-lg text-xs cursor-pointer border border-gray-200"
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
            setTimePreset('custom');
            setCustomFrom(from);
            setCustomTo(to);
            setShowCustomDate(true);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />
        {!showAdvFilter && timePreset && timePreset !== 'custom' && timeFilterLabel && (
          <div className="px-2.5 sm:px-3 py-1.5 border-b border-slate-200/50">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium border border-orange-200">
              <Clock className="h-3 w-3" />
              {timeFilterLabel}
              <button type="button" onClick={() => handleTimePresetChange('')} className="ml-1 hover:text-orange-900 cursor-pointer" title="Bỏ lọc thời gian">
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
            onClose={closeVcFilterPanel}
            tab={vcFilterTab}
            onTabChange={setVcFilterTab}
            tabs={vcFilterTabs}
            onReset={clearAllFilters}
            onResetPosition={() => {
              setFilterPanelPos(null);
              storeVcFilterPanelPos(null);
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
            personSelectLabel="NV phụ trách VC/LĐ"
            panelTitle="Lọc NV phụ trách vận chuyển / lắp đặt"
            canPickCompany={canPickCompany}
            workshopCompanyPickerList={workshopCompanyPickerList}
            showAllWorkshopOption={false}
            hideCompanySelect
            pipeline={kanbanPipeline}
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
            showOrphanColumn={false}
            setShowOrphanColumn={() => {}}
            hideOrphanColumnToggle
            viewMode={viewMode}
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
            sortOptions={VC_SORT_OPTIONS}
          />
        )}

        {/* KPI — có thể thu gọn như CRM */}
        <section data-tour="vc-kpis" className="border-t border-slate-200/60 bg-slate-50/30">
          <button
            type="button"
            onClick={toggleKpiPanel}
            aria-expanded={kpiPanelOpen}
            className="w-full flex items-center gap-1.5 px-2.5 py-1 sm:px-3 text-left cursor-pointer transition-colors hover:bg-slate-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-inset"
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-orange-600" aria-hidden />
            <span className="text-[11px] font-semibold text-slate-800 shrink-0 whitespace-nowrap">
              KPI
              <span className="ml-1 font-medium text-orange-600">· VC / LĐ</span>
            </span>
            {!kpiPanelOpen && (
              <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500 ml-2">
                Tổng {tabKpis.total.toLocaleString('vi-VN')}
                {` · VC ${tabKpis.shipping} · LĐ ${tabKpis.installing} · BH ${tabKpis.warranty}`}
                {tabKpis.overdue > 0 ? ` · Quá hạn ${tabKpis.overdue}` : ''}
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
            <div className="border-t border-orange-100/70 bg-white/40 px-2 sm:px-3 pb-2 pt-2 grid items-stretch gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {/* Không hiện KPI «Giá trị» trên VC/LĐ */}
              <KPICard
                compact
                icon={<Package className="h-3 w-3" />}
                iconBgColor="bg-orange-100"
                iconColor="text-orange-600"
                label="Tổng VC / LĐ"
                value={tabKpis.total}
              />
              <KPICard
                compact
                icon={<Truck className="h-3 w-3" />}
                iconBgColor="bg-orange-100"
                iconColor="text-orange-600"
                label="Đang vận chuyển"
                value={tabKpis.shipping}
              />
              <KPICard
                compact
                icon={<Wrench className="h-3 w-3" />}
                iconBgColor="bg-amber-100"
                iconColor="text-amber-600"
                label="Đang lắp đặt"
                value={tabKpis.installing}
              />
              <KPICard
                compact
                icon={<ShieldCheck className="h-3 w-3" />}
                iconBgColor="bg-teal-100"
                iconColor="text-teal-600"
                label="Bảo hành"
                value={tabKpis.warranty}
              />
              <KPICard
                compact
                icon={<CheckCircle2 className="h-3 w-3" />}
                iconBgColor="bg-green-100"
                iconColor="text-green-600"
                label="Hoàn thành"
                value={tabKpis.completed}
              />
              <KPICard
                compact
                icon={<AlertTriangle className="h-3 w-3" />}
                iconBgColor={tabKpis.overdue > 0 ? 'bg-red-100' : 'bg-gray-100'}
                iconColor={tabKpis.overdue > 0 ? 'text-red-600' : 'text-gray-400'}
                label="Quá hạn"
                value={tabKpis.overdue}
              />
            </div>
          )}
        </section>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex-wrap">
          <span className="text-sm font-semibold">✓ Đã chọn <strong>{selectedIds.size}</strong> dự án</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button onClick={selectAll} className="h-8 px-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" /> Chọn tất cả
            </button>
            <button onClick={() => { setShowBulkDeadline(true); setBulkDeadlineVal(''); }}
              className="h-8 px-3 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Gắn deadline
            </button>
            <button onClick={() => { setShowBulkPerson(true); setBulkPersonId(''); }}
              className="h-8 px-3 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> Gắn người VC
            </button>
            <button onClick={clearSelection} className="h-8 px-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs cursor-pointer flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {viewMode === 'kanban' && (
        <KanbanView pipeline={filteredKanbanPipeline} onMoveStage={handleMoveStage} onDelete={handleDeleteCard}
          calculateDays={calculateDays} selectedIds={selectedIds} onToggleSelect={toggleSelect}
          onSelectColumn={selectColumn} columnScrollMode={kanbanColumnScrollMode} />
      )}
      {viewMode === 'list' && <LogisticsListView pipeline={filteredKanbanPipeline} calculateDays={calculateDays} />}
      {viewMode === 'planner' && <LogisticsPlannerView pipeline={filteredKanbanPipeline} />}
      {viewMode === 'deadline' && <LogisticsDeadlineView pipeline={filteredKanbanPipeline} />}
      {viewMode === 'calendar' && (
        <LogisticsCalendarView
          pipeline={filteredKanbanPipeline}
          filterFrom={calendarFilterFrom}
          onVisibleMonthChange={handleCalendarMonthChange}
        />
      )}

      {showNewProject && <NewLogisticsProjectModal onClose={() => { setShowNewProject(false); load(); }} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={cancelDelete}>
          <div
            className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900">Xóa khỏi Lắp đặt?</h3>
                <p className="text-sm text-gray-600 mt-0.5 truncate" title={deleteTarget.label}>
                  Dự án: <strong className="text-gray-900">{deleteTarget.label}</strong>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Dự án sẽ được chuyển vào thùng rác VC, có thể khôi phục từ <code className="bg-gray-100 px-1 rounded">/admin/trash?tab=vc</code>.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Lý do xóa <span className="text-gray-400 font-normal">(không bắt buộc, tối đa 500 ký tự)</span>
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value.slice(0, 500))}
                placeholder="VD: Khách hủy đơn / chuyển sang dự án khác / nhập trùng..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none"
              />
              <div className="text-[10px] text-gray-400 text-right mt-0.5">{deleteReason.length}/500</div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleteBusy}
                className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="h-9 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {deleteBusy ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xóa...</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" /> Xóa vào thùng rác</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Deadline Modal */}
      {showBulkDeadline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulkDeadline(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-500" /> Gắn deadline hàng loạt
              </h2>
              <button onClick={() => setShowBulkDeadline(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Áp dụng cho <strong className="text-orange-700">{selectedIds.size}</strong> dự án đã chọn</p>
            <input type="date" value={bulkDeadlineVal} onChange={e => setBulkDeadlineVal(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setShowBulkDeadline(false)} className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={applyBulkDeadline} disabled={!bulkDeadlineVal || bulkSaving}
                className="flex-1 h-10 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
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
                <UserCheck className="h-5 w-5 text-orange-500" /> Gắn người VC hàng loạt
              </h2>
              <button onClick={() => setShowBulkPerson(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Áp dụng cho <strong className="text-orange-700">{selectedIds.size}</strong> dự án đã chọn</p>
            <select value={bulkPersonId} onChange={e => setBulkPersonId(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 mb-4 bg-white" autoFocus>
              <option value="">— Chọn người phụ trách VC —</option>
              {(employeeOptionsForSelect.length ? employeeOptionsForSelect : allUsers).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkPerson(false)} className="flex-1 h-10 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Hủy</button>
              <button onClick={applyBulkPerson} disabled={!bulkPersonId || bulkSaving}
                className="flex-1 h-10 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {bulkSaving ? 'Đang lưu...' : 'Áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// KPI Card — compact giống CRM
function KPICard({ icon, iconBgColor, iconColor, label, value, compact }) {
  const isNumeric = typeof value === 'number';
  const displayValue = isNumeric ? value.toLocaleString('vi-VN') : value;
  const isMoneyLike = !isNumeric && typeof displayValue === 'string' && /₫|VND|\.000/.test(String(displayValue));
  return (
    <div
      className={`group relative h-full min-w-0 flex flex-col items-center justify-center text-center rounded-lg border border-orange-200/80 bg-white shadow-sm outline-none transition-all duration-200 hover:shadow-md hover:border-orange-300/80 ${
        compact ? 'gap-1 px-2 py-2' : 'gap-1.5 px-2 py-2.5'
      }`}
    >
      <div className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}>{icon}</div>
      <div className="min-w-0 w-full flex flex-col items-center justify-center gap-0.5">
        <p
          className={`text-orange-700/80 font-semibold uppercase tracking-wide leading-tight max-w-full truncate px-0.5 ${
            compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'
          }`}
          title={label}
        >
          {label}
        </p>
        <p
          className={`font-bold tabular-nums leading-snug max-w-full truncate px-0.5 ${
            compact
              ? (isMoneyLike ? 'text-[11px] sm:text-xs' : 'text-sm')
              : (isMoneyLike ? 'text-xs md:text-sm' : 'text-sm md:text-base')
          }`}
          style={{ color: '#000000' }}
          title={String(displayValue)}
        >
          {displayValue}
        </p>
      </div>
    </div>
  );
}

// Kanban Stage Column
const KanbanStageCard = memo(function KanbanStageCard({
  stage, items, onMoveStage, onDelete, calculateDays, selectedIds, onToggleSelect, onSelectColumn,
  columnIndex = 0, pipelineStages = [],
  columnScrollMode = 'unified', boardScrollRef = null,
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const { columnScrollMaxH } = useWorkshopKanbanScrollLayout();
  const columnTheme = useKanbanColumnTheme(columnIndex);
  const perColumnScroll = columnScrollMode === 'per-column';
  const pinEmptyPlaceholder = !perColumnScroll && items.length === 0;
  const emptyPlaceholderTop = useKanbanEmptyPlaceholderStickyTop(headerRef, pinEmptyPlaceholder);

  const renderCard = useCallback((item) => (
    <KanbanCard
      item={item}
      stage={stage}
      calculateDays={calculateDays}
      isSelected={selectedIds?.has(item.id)}
      onToggleSelect={onToggleSelect}
      onDelete={onDelete}
      onMoveStage={onMoveStage}
      pipelineStages={pipelineStages}
    />
  ), [stage, calculateDays, selectedIds, onToggleSelect, onDelete, onMoveStage, pipelineStages]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOverColumn(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setIsOverColumn(false); }}
      onDrop={(e) => { e.preventDefault(); setIsOverColumn(false); const pid = e.dataTransfer.getData('projectId'); if (pid) onMoveStage(pid, stage); }}
      className={`flex flex-col flex-shrink-0 w-[17rem] max-[420px]:w-[15rem] rounded-lg transition-all duration-200 kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} ${
        perColumnScroll ? 'h-full self-stretch overflow-x-visible overflow-y-hidden' : 'overflow-visible kanban-unified-scroll-column'
      } ${isOverColumn ? 'ring-2 ring-orange-500 ring-dashed' : ''}`}
      style={{
        ...(perColumnScroll && columnScrollMaxH ? { height: columnScrollMaxH, maxHeight: columnScrollMaxH } : {}),
      }}
    >
      <div
        ref={headerRef}
        className={`${perColumnScroll ? 'shrink-0' : 'sticky top-0 kanban-column-header-sticky'} z-10 px-3 py-2.5 border-b rounded-t-md transition-all kanban-column-surface`}
        style={{
          backgroundColor: isOverColumn ? columnTheme.dropBg : columnTheme.headerBg,
          borderColor: columnTheme.border,
          boxShadow: columnTheme.headerShadow,
        }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base shrink-0 leading-none">{stage.icon || '📦'}</span>
            <h3 className="text-sm font-semibold truncate leading-snug kanban-stage-title" style={{ color: '#000000' }} title={stage.name}>{stage.name}</h3>
            {stage.is_handover_to_install && !isInstallVcStage(stage) && (
              <span
                className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200"
                title="Kéo dự án vào cột này → nhảy sang Lắp đặt"
              >
                → LĐ
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span
              className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-md text-[13px] font-bold tabular-nums leading-none"
              style={{
                backgroundColor: columnTheme.badgeBg,
                color: columnTheme.accent,
                border: `1px solid ${columnTheme.badgeBorder}`,
              }}
            >
              {items.length}
            </span>
            {onSelectColumn && items.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectColumn(stage.id); }}
                className="px-1 py-0.5 text-[10px] font-medium text-orange-600 hover:bg-orange-50 rounded cursor-pointer whitespace-nowrap"
                title="Chọn tất cả dự án trong cột này"
              >
                Chọn cột
              </button>
            )}
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`flex-1 border border-white/30 border-t-0 p-1.5 space-y-0 transition-all ${KANBAN_CARDS_BODY_CLASS} ${
          isOverColumn ? 'kanban-cards-body--drop' : ''
        } ${
          pinEmptyPlaceholder ? KANBAN_CARDS_BODY_EMPTY_PIN_CLASS : ''
        } ${
          perColumnScroll ? 'min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]' : ''
        }`}
        style={perColumnScroll ? undefined : { minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div
            className={`${KANBAN_COLUMN_EMPTY_CLASS}${isOverColumn ? ' kanban-column-empty--drop' : ''}${pinEmptyPlaceholder ? ` ${KANBAN_COLUMN_EMPTY_PIN_CLASS}` : ''}`}
            style={pinEmptyPlaceholder ? { top: emptyPlaceholderTop } : undefined}
          >
            <Layers aria-hidden />
            <p className="text-sm">{isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}</p>
          </div>
        ) : (
          <KanbanColumnVirtualList
            items={items}
            columnScrollRef={containerRef}
            boardScrollRef={perColumnScroll ? null : boardScrollRef}
            renderCard={renderCard}
          />
        )}
      </div>
    </div>
  );
});

// Kanban Card
const KanbanCard = memo(function KanbanCard({
  item, stage, calculateDays, isSelected, onToggleSelect, onDelete, onMoveStage, pipelineStages = [],
}) {
  const navigate = useNavigate();
  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-workshop-bulk-checkbox]') || e.target.closest?.('[data-vc-quick-btn]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };
  const stageColor = stage.color || '#f97316';
  const isInstallStage = isInstallVcStage(stage);
  const doneTasks = isInstallStage
    ? (item.done_tasks_install ?? 0)
    : (item.done_tasks_vc ?? item.done_tasks ?? 0);
  const totalTasks = isInstallStage
    ? (item.task_total_install ?? 0)
    : (item.task_total_vc ?? item.task_total ?? 0);
  const taskBadgeTitle = isInstallStage ? 'Nhiệm vụ Lắp đặt' : 'Nhiệm vụ Vận chuyển';
  const deals = Array.isArray(item.crm_deals) ? item.crm_deals : [];
  const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  const cardTitle = (primaryDeal?.title || '').trim() || item.name || '';
  const crmAssignee = primaryDeal?.assignee || primaryDeal?.lead_owner || item.sales_person || null;
  const sxAssignee = item.production_person || null;
  const vcAssignee = item.logistics_person || null;
  const ldAssignee = item.installer_person || null;
  const customerPhone = String(item.customer?.phone || '').trim();
  const getInitials = (name) => !name ? '?' : name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const isNew = item.created_at && (Date.now() - new Date(item.created_at).getTime()) < 86400000;

  const goTab = (tab) => {
    markWorkshopPipelineCardFocus(item.id, 'vc');
    const qs = new URLSearchParams();
    if (tab) qs.set('tab', tab);
    qs.set('vcTab', isInstallStage ? 'install' : 'shipping');
    navigate(`/vc/projects/${item.id}?${qs.toString()}`);
  };

  const PersonChip = ({ label, person, tone = 'gray' }) => {
    if (!person?.full_name) return null;
    const toneMap = {
      violet: 'bg-violet-50 text-violet-800 border-violet-100',
      teal: 'bg-teal-50 text-teal-800 border-teal-100',
      orange: 'bg-orange-50 text-orange-800 border-orange-100',
      amber: 'bg-amber-50 text-amber-800 border-amber-100',
      gray: 'bg-gray-50 text-gray-700 border-gray-100',
    };
    return (
      <span
        className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded border text-[10px] min-w-0 ${toneMap[tone] || toneMap.gray}`}
        title={`${label}: ${person.full_name}`}
      >
        {person.avatar ? (
          <img src={person.avatar} alt="" className="h-3.5 w-3.5 rounded-full shrink-0" />
        ) : (
          <span className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: stageColor }}>
            {getInitials(person.full_name)}
          </span>
        )}
        <span className="truncate font-medium">{person.full_name}</span>
        <span className="shrink-0 opacity-70">{label}</span>
      </span>
    );
  };

  return (
    <div
      data-vc-kanban-card={item.id}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        if (e.target.closest?.('[data-workshop-bulk-checkbox]') || e.target.closest?.('[data-vc-quick-btn]')) return;
        markWorkshopPipelineCardFocus(item.id, 'vc');
        navigate(`/vc/projects/${item.id}`);
      }}
      className={`relative !bg-white rounded-lg border p-2.5 pt-8 transition-all duration-200 cursor-pointer group hover:-translate-y-0.5 hover:shadow-lg ${
        isSelected ? 'ring-2 ring-orange-400 ring-offset-1 border-orange-300' : 'border-gray-200'
      }`}
      style={{ backgroundColor: '#ffffff', borderLeft: `4px solid ${stageColor}` }}
    >
      {onToggleSelect && (
        <label
          data-workshop-bulk-checkbox
          className="absolute z-20 top-2 right-2 flex items-center justify-center cursor-pointer rounded-md p-0.5 hover:bg-gray-100"
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
          title="Chọn nhiều dự án"
        >
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
          />
        </label>
      )}
      {onDelete && (
        <button
          type="button"
          data-workshop-bulk-checkbox
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete(item.id, item.name || item.code || item.id);
          }}
          onMouseDown={(ev) => ev.stopPropagation()}
          onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
          className="absolute z-20 top-2 right-9 rounded-md p-1 text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 cursor-pointer transition-opacity"
          title="Xóa khỏi VC (vào thùng rác)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between pr-7 mb-2">
        <p className="text-xs font-semibold text-orange-600">{item.code}</p>
      </div>

      <div className="flex items-start gap-1.5 min-w-0 mb-2">
        <p className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: '#000000' }} title={cardTitle}>{cardTitle}</p>
        {isNew && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-rose-500 px-1.5 py-0.5 rounded leading-tight">Mới</span>}
      </div>
      {item.workshop_type?.name && (
        <p className="text-[10px] text-slate-600 mb-2">
          <span className="text-slate-500 font-medium">Loại:</span> {item.workshop_type.name}
        </p>
      )}

      {(item.customer?.full_name || item.customer?.phone) && (
        <div className="space-y-0.5 mb-2">
          {item.customer?.full_name && <p className="text-xs text-gray-600 truncate">👤 {item.customer.full_name}</p>}
          {item.customer?.phone && <p className="text-xs text-green-600 font-medium truncate">📞 {item.customer.phone}</p>}
        </div>
      )}

      {(crmAssignee || sxAssignee || vcAssignee || ldAssignee) && (
        <div className="flex flex-wrap gap-1 mb-2">
          <PersonChip label="CRM" person={crmAssignee} tone="violet" />
          <PersonChip label="SX" person={sxAssignee} tone="teal" />
          <PersonChip label="VC" person={vcAssignee} tone="orange" />
          <PersonChip label="LĐ" person={ldAssignee} tone="amber" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {!crmAssignee && !sxAssignee && !vcAssignee && !ldAssignee && (
            <p className="text-[10px] text-gray-400"><span className="text-gray-500">Phụ trách:</span> —</p>
          )}
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap shrink-0">{calculateDays(item.created_at)}</span>
      </div>

      {item.deadline && (
        <div className={`mt-2 text-[10px] px-2 py-1 rounded-lg font-medium ${
          new Date(item.deadline) < new Date() ? 'bg-red-100 text-red-600'
          : new Date(item.deadline) < new Date(Date.now() + 3 * 86400000) ? 'bg-amber-100 text-amber-600'
          : 'bg-orange-100 text-orange-600'
        }`}>
          📅 Deadline: {new Date(item.deadline).toLocaleDateString('vi-VN')}
          {new Date(item.deadline) < new Date() && ' ⚠️'}
        </div>
      )}

      {typeof onMoveStage === 'function' && stage?.is_handover_to_install && !isInstallVcStage(stage) && (
        <button
          type="button"
          data-vc-quick-btn
          onClick={(e) => {
            e.stopPropagation();
            onMoveStage(item.id, stage);
          }}
          className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 cursor-pointer"
          title="Chuyển dự án sang Lắp đặt"
        >
          <Wrench className="h-3 w-3" />
          Chuyển LĐ
        </button>
      )}

      {/* Nút chức năng nhanh — thay thanh % hoàn thành */}
      <div
        className="mt-2 flex items-center justify-between gap-1.5 pt-1.5 border-t border-gray-100"
        data-vc-quick-btn
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div className="min-w-0 text-[10px] text-gray-400 truncate">
          {totalTasks > 0 ? (
            <span title={taskBadgeTitle}>✅ {doneTasks}/{totalTasks}</span>
          ) : (
            <span className="opacity-60">—</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 rounded-full border border-orange-100 bg-white px-1 py-0.5 shadow-sm">
          {typeof onMoveStage === 'function' && Array.isArray(pipelineStages) && pipelineStages.length > 1 && (
            <KanbanCardQuickMove
              stages={pipelineStages}
              currentStageId={stage.id}
              onMove={(target) => onMoveStage(item.id, target)}
              theme="sx"
              blockVirtualTargets={false}
            />
          )}
          {customerPhone && (
            <a
              href={`tel:${customerPhone}`}
              data-vc-quick-btn
              title={`Gọi ${customerPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 inline-flex items-center justify-center rounded-full text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            data-vc-quick-btn
            title="Công việc"
            onClick={(e) => { e.stopPropagation(); goTab('tasks'); }}
            className="relative h-5 w-5 inline-flex items-center justify-center rounded-full text-orange-500 hover:text-orange-700 hover:bg-orange-50 cursor-pointer"
          >
            <CheckSquare className="h-3 w-3" />
            {totalTasks > 0 && doneTasks < totalTasks && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </button>
          <button
            type="button"
            data-vc-quick-btn
            title="Bình luận"
            onClick={(e) => { e.stopPropagation(); goTab('comments'); }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
          <button
            type="button"
            data-vc-quick-btn
            title="Mở chi tiết"
            onClick={(e) => { e.stopPropagation(); goTab(''); }}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

// Kanban View Container
function KanbanView({
  pipeline, onMoveStage, onDelete, calculateDays, selectedIds, onToggleSelect, onSelectColumn,
  columnScrollMode = 'unified',
}) {
  const boardScrollRef = useRef(null);
  const pipelineStages = useMemo(
    () => (pipeline || []).map(({ items, ...stage }) => stage),
    [pipeline],
  );
  const perColumnScroll = columnScrollMode === 'per-column';
  return (
    <WorkshopPipelineKanbanScroll
      cardSelector="[data-vc-kanban-card]"
      columnScrollMode={columnScrollMode}
      scrollContainerRef={boardScrollRef}
    >
      <div className={`flex min-w-max items-stretch gap-2.5 ${KANBAN_BOARD_COLUMN_RAILS_CLASS} ${perColumnScroll ? 'h-full' : ''} ${UI_KANBAN_FIXED_CLASS}`}>
        {pipeline.map((stage, columnIndex) => (
          <KanbanStageCard
            key={stage.id || stage.slug}
            columnIndex={columnIndex}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            onDelete={onDelete}
            calculateDays={calculateDays}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onSelectColumn={onSelectColumn}
            pipelineStages={pipelineStages}
            columnScrollMode={columnScrollMode}
            boardScrollRef={boardScrollRef}
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

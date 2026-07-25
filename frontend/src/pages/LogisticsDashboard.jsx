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
import { formatVND } from '../lib/utils';
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
import { LogisticsListView, LogisticsPlannerView, LogisticsCalendarView } from '../components/LogisticsViews';
import NewLogisticsProjectModal from '../components/NewLogisticsProjectModal';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import KanbanCardQuickMove from '../components/KanbanCardQuickMove';
import { useKanbanColumnTheme, KANBAN_CARDS_BODY_CLASS, UI_KANBAN_FIXED_CLASS, KANBAN_BOARD_COLUMN_RAILS_CLASS, KANBAN_COLUMN_RAIL_CLASS, KANBAN_COLUMN_VALUE_METRIC_CLASS } from '../lib/kanbanColumnTheme';
import WorkshopStaffFilterPanel from '../components/WorkshopStaffFilterPanel';
import { useWorkshopStaffFilter } from '../hooks/useWorkshopStaffFilter';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
  applyWorkshopProjectRenamePatches,
} from '../lib/workshopPipelineStorage';

const INTAKE_BUCKET = 'delivery_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'calendar'];

const DEFAULT_VC_STAGES = [
  { id: 'vc_intake', name: 'Chờ vận chuyển', slug: 'delivery_pending', icon: '📦', color: '#f97316', bucket_slug: INTAKE_BUCKET },
  { id: 'vc_ship', name: 'Đang vận chuyển', slug: 'delivery', icon: '🚚', color: '#ea580c' },
  { id: 'vc_install', name: 'Đang lắp đặt', slug: 'installation', icon: '🔧', color: '#d97706' },
  { id: 'vc_warranty', name: 'Bảo hành', slug: 'customer-care', icon: '🤝', color: '#0f766e' },
];

/** Tab pipeline VC — tách «Vận chuyển» / «Lắp đặt» giống 2 tab Deal/Đơn hàng của CRM. */
const VC_PIPELINE_TABS = [
  { id: 'shipping', label: 'Vận chuyển', icon: '🚚' },
  { id: 'install', label: 'Lắp đặt', icon: '🔧' },
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
  const [vcPipelineTab, setVcPipelineTab] = useState(() => (P0?.vcPipelineTab === 'install' ? 'install' : 'shipping'));
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
  const [showAdvFilter, setShowAdvFilter] = useState(false);
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
    if (user?.company_id) return workshopCompaniesForCrossViewer(companies, user);
    if (crossWorkshopViewer && !isAdmin) return workshopCompaniesForCrossViewer(companies, user);
    return companies;
  }, [companies, crossWorkshopViewer, isAdmin, user]);

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
    } catch (e) {
      console.error(e);
    }
    if (!isStale()) setLoading(false);
  }, [companyParam, kanbanLoadKey, filterWorkTypeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Tự reload khi có project bàn giao sang VC qua socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data) => {
      // Chỉ reload khi có dự án "mới xuất hiện" trong module VC (bàn giao từ SX),
      // tránh reload toàn trang khi user đang kéo thả đổi cột ngay trong VC.
      const pid = data?.id || data?.project_id || data?.project?.id;
      if (!pid) return;
      const existed = (projectsRef.current || []).some((p) => String(p.id) === String(pid));
      if (existed) return;

      const s = data?.status || data?.project?.status;
      if (s === 'shipping' || s === 'installing' || s === 'warranty' || s === 'completed') load();
    };
    socket.on('project:stage_changed', handler);
    return () => socket.off('project:stage_changed', handler);
  }, [load]);

  useEffect(() => {
    api.get('/users').then(r => setAllUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) setFilterCompany('');
  }, [isAdmin, filterCompany, companies]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_VC, JSON.stringify({
        filterCompany, timePreset, customFrom, customTo, kanbanLoadKey,
        filterPersonId, filterPersonName, filterRegion, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode, vcPipelineTab,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, timePreset, customFrom, customTo, kanbanLoadKey, filterPersonId, filterPersonName,
    filterRegion, filterPhone, filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode, vcPipelineTab,
  ]);

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

  const scopeProjects = useMemo(() => {
    return projects.filter((p) => {
      const { from, to } = dateFromTo;
      if (from && to && !workshopCreatedInRange(p.created_at, from, to)) return false;
      if (!matchesProject(p, { personNameQ: deferredPersonName })) return false;
      if (filterPhone === 'has' && !p.customer?.phone) return false;
      if (filterPhone === 'no' && p.customer?.phone) return false;
      return true;
    });
  }, [projects, dateFromTo, matchesProject, deferredPersonName, filterPhone]);

  const scopeKpis = useMemo(() => {
    const list = scopeProjects;
    if (!list.length) {
      return {
        total: 0, shipping: 0, installing: 0, warranty: 0, completed: 0, overdue: 0, avg_progress: kpis?.avg_progress || 0,
      };
    }
    return {
      total: list.length,
      shipping: list.filter((p) => p.status === 'shipping' || p.current_stage?.slug === 'delivery').length,
      installing: list.filter((p) => p.status === 'installing' || p.current_stage?.slug === 'installation').length,
      warranty: list.filter((p) => p.status === 'warranty' || p.current_stage?.slug === 'customer-care').length,
      completed: list.filter((p) => p.status === 'completed').length,
      overdue: list.filter(
        (p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed',
      ).length,
      avg_progress: Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length),
    };
  }, [scopeProjects, kpis]);

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

  /** Số dự án theo từng tab «Vận chuyển» / «Lắp đặt» — dùng để hiện badge trên tab. */
  const vcTabCounts = useMemo(() => {
    let shipping = 0;
    let install = 0;
    kanbanPipeline.forEach((stage) => {
      const n = stage.items?.length || 0;
      if (isInstallVcStage(stage)) install += n;
      else shipping += n;
    });
    return { shipping, install };
  }, [kanbanPipeline]);

  /** Tách pipeline VC theo tab — cột nào tên chứa "lắp" (hoặc bucket_slug chứa "install") vào tab Lắp đặt. */
  const tabKanbanPipeline = useMemo(() => {
    return kanbanPipeline.filter((stage) => (
      vcPipelineTab === 'install' ? isInstallVcStage(stage) : !isInstallVcStage(stage)
    ));
  }, [kanbanPipeline, vcPipelineTab]);

  const switchVcTab = useCallback((tab) => {
    setVcPipelineTab(tab);
    setStageFilter((prev) => {
      if (!prev) return prev;
      const baseStages = pipeline.length ? pipeline : DEFAULT_VC_STAGES;
      const stillValid = baseStages.some((s) => (
        String(s.id) === String(prev) && (tab === 'install' ? isInstallVcStage(s) : !isInstallVcStage(s))
      ));
      return stillValid ? prev : '';
    });
  }, [pipeline]);

  const filteredKanbanPipeline = useMemo(() => {
    const result = tabKanbanPipeline.map((stage) => ({
      ...stage,
      items: stage.items.filter((p) => {
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
      }),
    }));
    filteredKanbanPipelineRef.current = result;
    return result;
  }, [tabKanbanPipeline, searchQuery, priorityFilter, stageFilter]);

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

    if (willJumpToInstall) setVcPipelineTab('install');

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
  }, [load, projects, kanbanPipeline, setVcPipelineTab]);

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
  const advFilterCount =
    staffFilterActiveCount + (filterPhone ? 1 : 0) + (hasTimeFilter ? 1 : 0)
    + (filterWorkTypeId ? 1 : 0) + (priorityFilter ? 1 : 0) + (stageFilter ? 1 : 0);

  const hasActiveFilter = !!(
    searchQuery || priorityFilter || stageFilter || hasTimeFilter
    || filterPhone || filterWorkTypeId || staffFilterActiveCount
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilter('');
    setStageFilter('');
    setTimePreset('');
    setCustomFrom('');
    setCustomTo('');
    setFilterPhone('');
    setFilterWorkTypeId('');
    resetStaffFilters();
  }, [resetStaffFilters]);

  const toggleKpiPanel = useCallback(() => {
    setKpiPanelOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_VC_KPI_PANEL, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /** KPI theo tab đang mở — giống CRM đổi KPI theo Lead/Deal. */
  const tabKpis = useMemo(() => {
    const list = tabKanbanPipeline.flatMap((s) => s.items || []);
    const overdue = list.filter(
      (p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed',
    ).length;
    const valueSum = list.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0);
    if (vcPipelineTab === 'install') {
      return {
        total: list.length,
        shipping: 0,
        installing: list.filter((p) => p.status === 'installing' || p.current_stage?.slug === 'installation').length || list.length,
        warranty: 0,
        completed: list.filter((p) => p.status === 'completed').length,
        overdue,
        valueSum,
        avgProgress: list.length
          ? Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length)
          : 0,
      };
    }
    return {
      total: list.length,
      shipping: list.filter((p) => p.status === 'shipping' || p.current_stage?.slug === 'delivery').length,
      installing: 0,
      warranty: list.filter((p) => p.status === 'warranty' || p.current_stage?.slug === 'customer-care').length,
      completed: list.filter((p) => p.status === 'completed').length,
      overdue,
      valueSum,
      avgProgress: list.length
        ? Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length)
        : 0,
    };
  }, [tabKanbanPipeline, vcPipelineTab]);

  const ctrlH = 'h-8';
  const ctrlIcon = 'h-7 w-7';
  const ctrlTxt = 'text-xs';
  const toolbarBtn = `${ctrlH} px-2 rounded-md ${ctrlTxt} font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0`;
  const activeTabLabel = vcPipelineTab === 'install' ? 'Lắp đặt' : 'Vận chuyển';
  const tabCountLabel = (n) => (n > 0 ? ` ${n.toLocaleString('vi-VN')}` : '');

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
              <div data-tour="vc-pipeline-tabs" className="inline-flex gap-px p-0.5 bg-slate-200/60 border border-slate-300/50 rounded-lg shrink-0">
                {VC_PIPELINE_TABS.map((t) => {
                  const active = vcPipelineTab === t.id;
                  const count = t.id === 'install' ? vcTabCounts.install : vcTabCounts.shipping;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => switchVcTab(t.id)}
                      className={`rounded-md font-semibold transition-colors flex items-center gap-1 px-2 py-1 text-[11px] whitespace-nowrap cursor-pointer ${
                        active
                          ? (t.id === 'install' ? 'bg-white text-amber-700 shadow-sm' : 'bg-white text-orange-700 shadow-sm')
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span aria-hidden>{t.icon}</span>
                      {t.label}{tabCountLabel(count)}
                    </button>
                  );
                })}
              </div>
              {scopeKpis.overdue > 0 && (
                <span
                  className="relative inline-flex items-center justify-center h-7 w-7 rounded-md border border-red-200 bg-red-50 text-red-600"
                  title={`${scopeKpis.overdue} dự án quá hạn`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white text-[8px] font-bold flex items-center justify-center tabular-nums leading-none">
                    {scopeKpis.overdue > 99 ? '99+' : scopeKpis.overdue}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-slate-500 mr-1" title="Số thẻ sau lọc / tiến độ TB">
                <span className="inline-block rounded-full bg-emerald-500 h-1.5 w-1.5" />
                {filteredProjectCount.toLocaleString('vi-VN')} thẻ · TB {tabKpis.avgProgress}%
              </span>
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
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="relative flex-1 min-w-0 flex items-center pl-7 pr-1">
                <Search
                  className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
                    searchQuery.trim() ? 'text-orange-600' : 'text-slate-400'
                  }`}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={vcPipelineTab === 'install' ? 'Tìm dự án lắp đặt, KH, SĐT, mã…' : 'Tìm dự án VC, KH, SĐT, mã…'}
                  className={`flex-1 min-w-[3.5rem] ${ctrlH} bg-transparent border-0 ${ctrlTxt} font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${searchQuery ? 'pr-7' : ''}`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Xóa tìm kiếm"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAdvFilter((s) => !s)}
                className={`${ctrlH} px-2 border-l border-slate-200/80 rounded-r-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  showAdvFilter || advFilterCount
                    ? 'bg-orange-50 text-orange-800'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                aria-label="Bộ lọc"
              >
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Bộ lọc</span>
                {advFilterCount > 0 && (
                  <span className="text-[10px] font-bold bg-orange-600 text-white rounded-full min-w-[1.1rem] px-1 text-center">
                    {advFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80">
              <div className="inline-flex items-center gap-px p-0.5 rounded-md bg-slate-100 border border-slate-200/80">
                {[
                  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
                  { id: 'list', icon: List, label: 'Danh sách' },
                  { id: 'planner', icon: Users, label: 'Planner' },
                  { id: 'calendar', icon: Calendar, label: 'Lịch' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id)}
                    className={`${toolbarBtn} ${
                      viewMode === v.id
                        ? 'bg-white text-orange-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title={v.label}
                  >
                    <v.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{v.label}</span>
                  </button>
                ))}
              </div>
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

        {/* Công ty — chip ngang (giống CRM) */}
        {canPickCompany && workshopCompanyPickerList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full px-2.5 sm:px-3 py-1.5 border-b border-slate-200/50 scrollbar-thin scrollbar-thumb-gray-200">
            {(isAdmin ? [{ id: '', name: 'Tất cả' }, ...workshopCompanyPickerList] : workshopCompanyPickerList).map((c) => {
              const active = filterCompany === c.id;
              return (
                <button
                  key={c.id || 'all'}
                  type="button"
                  onClick={() => {
                    if (active) return;
                    handleStaffFilterCompanyChange(c.id);
                  }}
                  className={`shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-orange-600 border-orange-600 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-700 hover:bg-orange-50'
                  }`}
                >
                  {active && <span className="mr-1">✓</span>}
                  {c.id === '' ? 'Tất cả' : (c.short_name || c.name)}
                </button>
              );
            })}
          </div>
        )}

        {/* Bộ lọc nâng cao */}
        {showAdvFilter && (
          <div className="space-y-3 p-3 border-b border-slate-200/60 bg-slate-50/80">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide mb-1">Thời gian tạo</p>
                <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1.5 h-8">
                  <Clock className="h-3.5 w-3.5 text-gray-400 ml-0.5 shrink-0" />
                  <select
                    value={timePreset}
                    onChange={(e) => setTimePreset(e.target.value)}
                    className="h-7 pr-1 text-xs bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[8rem]"
                  >
                    {WS_TIME_PRESETS.map((o) => (
                      <option key={o.key || 'all'} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {timePreset === 'custom' && (
                <div className="flex items-center gap-1 flex-wrap">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white" />
                  <span className="text-gray-400">–</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white" />
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide mb-1">Tải tối đa</p>
                <select
                  value={kanbanLoadKey}
                  onChange={(e) => setKanbanLoadKey(e.target.value)}
                  className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-amber-50/80"
                  title="Số bản ghi tối đa từ server"
                >
                  {WS_KANBAN_LOAD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <WorkshopStaffFilterPanel
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
              ringFocusClass="focus:ring-orange-500"
            />

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5 min-w-[10rem]">
                <label className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide">Giai đoạn</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="h-8 w-40 px-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                >
                  <option value="">Tất cả giai đoạn</option>
                  {tabKanbanPipeline.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.icon || '•'} {stage.name}</option>
                  ))}
                </select>
              </div>
              {companyForTypes && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide">Phân loại</label>
                  <div className="inline-flex items-center gap-1 h-8 px-2 bg-white border border-gray-200 rounded-lg">
                    <Layers className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <select
                      value={filterWorkTypeId}
                      onChange={(e) => setFilterWorkTypeId(e.target.value)}
                      className="h-7 text-xs bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[11rem]"
                    >
                      <option value="">{workTypes.length === 0 ? 'Chưa cấu hình' : 'Tất cả loại'}</option>
                      {workTypes.map((wt) => (
                        <option key={wt.id} value={wt.id}>{wt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide">Ưu tiên</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="h-8 w-28 px-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                >
                  <option value="">Tất cả</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-semibold text-orange-800/90 uppercase tracking-wide">SĐT</label>
                <select
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  className="h-8 w-36 px-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                >
                  <option value="">Không lọc</option>
                  <option value="has">Có SĐT</option>
                  <option value="no">Chưa có SĐT</option>
                </select>
              </div>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="h-8 px-3 rounded-lg border border-orange-300 bg-white text-xs font-semibold text-orange-700 hover:bg-orange-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Đặt lại
                </button>
              )}
            </div>
          </div>
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
              <span className={`ml-1 font-medium ${vcPipelineTab === 'install' ? 'text-amber-600' : 'text-orange-600'}`}>
                · {activeTabLabel}
              </span>
            </span>
            {!kpiPanelOpen && (
              <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500 ml-2">
                Tổng {tabKpis.total.toLocaleString('vi-VN')}
                {vcPipelineTab === 'install'
                  ? ` · Lắp đặt ${tabKpis.installing}`
                  : ` · VC ${tabKpis.shipping} · BH ${tabKpis.warranty}`}
                {tabKpis.overdue > 0 ? ` · Quá hạn ${tabKpis.overdue}` : ''}
                {' · '}{formatVND(tabKpis.valueSum)}
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
            <div className={`border-t border-orange-100/70 bg-white/40 px-2 sm:px-3 pb-2 pt-2 grid items-stretch gap-2 ${
              vcPipelineTab === 'install'
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
            }`}
            >
              <KPICard
                compact
                icon={<Package className="h-3 w-3" />}
                iconBgColor="bg-orange-100"
                iconColor="text-orange-600"
                label={vcPipelineTab === 'install' ? 'Tổng lắp đặt' : 'Tổng vận chuyển'}
                value={tabKpis.total}
              />
              {vcPipelineTab === 'install' ? (
                <KPICard
                  compact
                  icon={<Wrench className="h-3 w-3" />}
                  iconBgColor="bg-amber-100"
                  iconColor="text-amber-600"
                  label="Đang lắp đặt"
                  value={tabKpis.installing}
                />
              ) : (
                <>
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
                    icon={<ShieldCheck className="h-3 w-3" />}
                    iconBgColor="bg-teal-100"
                    iconColor="text-teal-600"
                    label="Bảo hành"
                    value={tabKpis.warranty}
                  />
                </>
              )}
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
              {vcPipelineTab === 'install' && (
                <KPICard
                  compact
                  icon={<Package className="h-3 w-3" />}
                  iconBgColor="bg-emerald-100"
                  iconColor="text-emerald-600"
                  label="Giá trị"
                  value={formatVND(tabKpis.valueSum)}
                />
              )}
              {vcPipelineTab !== 'install' && (
                <KPICard
                  compact
                  icon={<Package className="h-3 w-3" />}
                  iconBgColor="bg-emerald-100"
                  iconColor="text-emerald-600"
                  label="Giá trị"
                  value={formatVND(tabKpis.valueSum)}
                />
              )}
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
          calculateDays={calculateDays} selectedIds={selectedIds} onToggleSelect={toggleSelect} vcPipelineTab={vcPipelineTab} />
      )}
      {viewMode === 'list' && <LogisticsListView pipeline={filteredKanbanPipeline} calculateDays={calculateDays} />}
      {viewMode === 'planner' && <LogisticsPlannerView pipeline={filteredKanbanPipeline} />}
      {viewMode === 'calendar' && <LogisticsCalendarView pipeline={filteredKanbanPipeline} />}

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
                <h3 className="text-base font-bold text-gray-900">Xóa khỏi Vận chuyển?</h3>
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
  stage, items, onMoveStage, onDelete, calculateDays, selectedIds, onToggleSelect, columnIndex = 0, pipelineStages = [], vcPipelineTab = 'shipping',
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const [columnMaxH, setColumnMaxH] = useState('70vh');

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
      vcPipelineTab={vcPipelineTab}
    />
  ), [stage, calculateDays, selectedIds, onToggleSelect, onDelete, onMoveStage, pipelineStages, vcPipelineTab]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setColumnMaxH(`${Math.max(300, window.innerHeight - rect.top - 40)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const columnTheme = useKanbanColumnTheme(columnIndex);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOverColumn(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setIsOverColumn(false); }}
      onDrop={(e) => { e.preventDefault(); setIsOverColumn(false); const pid = e.dataTransfer.getData('projectId'); if (pid) onMoveStage(pid, stage); }}
      className={`flex flex-col flex-shrink-0 w-[17rem] max-[420px]:w-[15rem] rounded-lg overflow-hidden transition-all duration-200 kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} ${isOverColumn ? 'ring-2 ring-orange-500 ring-dashed' : ''}`}
    >
      <div
        className="px-3 py-2.5 border-b rounded-t-md transition-all kanban-column-surface"
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
          <span
            className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-md text-[13px] font-bold tabular-nums leading-none shrink-0"
            style={{
              backgroundColor: columnTheme.badgeBg,
              color: columnTheme.accent,
              border: `1px solid ${columnTheme.badgeBorder}`,
            }}
          >
            {items.length}
          </span>
        </div>
        <p className={`text-xs ${KANBAN_COLUMN_VALUE_METRIC_CLASS}`}>
          Giá trị: {formatVND(items.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0))}
        </p>
      </div>
      <div
        ref={containerRef}
        className={`border border-white/30 border-t-0 p-1.5 space-y-0 transition-all overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] ${KANBAN_CARDS_BODY_CLASS} ${
          isOverColumn ? 'kanban-cards-body--drop' : ''
        }`}
        style={{ maxHeight: columnMaxH, minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm">{isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}</p>
          </div>
        ) : (
          <KanbanColumnVirtualList
            items={items}
            columnScrollRef={containerRef}
            renderCard={renderCard}
          />
        )}
      </div>
    </div>
  );
});

// Kanban Card
const KanbanCard = memo(function KanbanCard({
  item, stage, calculateDays, isSelected, onToggleSelect, onDelete, onMoveStage, pipelineStages = [], vcPipelineTab = 'shipping',
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
  const isInstallTab = vcPipelineTab === 'install';
  const doneTasks = isInstallTab
    ? (item.done_tasks_install ?? 0)
    : (item.done_tasks_vc ?? item.done_tasks ?? 0);
  const totalTasks = isInstallTab
    ? (item.task_total_install ?? 0)
    : (item.task_total_vc ?? item.task_total ?? 0);
  const taskBadgeTitle = isInstallTab ? 'Nhiệm vụ Lắp đặt' : 'Nhiệm vụ Vận chuyển';
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
    qs.set('vcTab', isInstallTab ? 'install' : 'shipping');
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
        {item.estimated_value > 0 && (
          <p className="text-sm font-bold text-emerald-600 text-right leading-tight max-w-[55%]">{formatVND(item.estimated_value)}</p>
        )}
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
function KanbanView({ pipeline, onMoveStage, onDelete, calculateDays, selectedIds, onToggleSelect, vcPipelineTab = 'shipping' }) {
  const pipelineStages = useMemo(
    () => (pipeline || []).map(({ items, ...stage }) => stage),
    [pipeline],
  );
  return (
    <WorkshopPipelineKanbanScroll cardSelector="[data-vc-kanban-card]">
      <div className={`flex min-w-max items-stretch gap-2.5 ${KANBAN_BOARD_COLUMN_RAILS_CLASS} ${UI_KANBAN_FIXED_CLASS}`}>
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
            pipelineStages={pipelineStages}
            vcPipelineTab={vcPipelineTab}
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

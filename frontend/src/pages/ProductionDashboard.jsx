import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import {
  getWorkshopDateRange, WS_TIME_PRESETS, WS_KANBAN_LOAD_OPTIONS,
  workshopCreatedInRange, fetchWorkshopProjectPages,
} from '../lib/workshopDashboardUtils';
import {
  CheckCircle2, Search, X, Calendar, Plus,
  Factory, Users, LayoutGrid, List,
  CheckSquare, UserCheck, Loader2, Truck, Filter, Clock, Layers, Trash2, MessageSquare, Pin, ArrowUpDown,
} from 'lucide-react';
import { ProductionListView, ProductionPlannerView, ProductionCalendarView, ProductionCommentsView, ProductionDeadlineView } from '../components/ProductionViews';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import WorkshopStaffFilterPanel from '../components/WorkshopStaffFilterPanel';
import { useWorkshopStaffFilter } from '../hooks/useWorkshopStaffFilter';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
} from '../lib/workshopPipelineStorage';
import { computeSxRevenueKpis, getSxPipelineStageSlaTone, isSxColumnSlaOverdue } from '../lib/sxPipelineRevenue';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import NewDealModal from '../components/NewDealModal';
import { getCrmDeadlineUrgencyFromIso, getCrmDeadlineUrgencyBadgeClass } from '../lib/crmLeadDeadlineDisplay';

const INTAKE_BUCKET = 'won_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'deadline', 'comments', 'calendar'];

const LS_SX = 'sx_dash_filters_v1';
function readSxDashPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_SX);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
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
function DeadlineBadge({ date, icon = '📅', label = 'Hạn' }) {
  if (!date) return null;
  const u = getDeadlineUrgency(date);
  if (!u) return null;
  const cls = DEADLINE_TONE_CLASS[u.tone] || DEADLINE_TONE_CLASS.normal;
  const remaining = formatRemainingMs(u.diffMs);
  const dateText = new Date(date).toLocaleDateString('vi-VN');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls} ${u.pulse ? 'animate-pulse' : ''}`}
      title={`${label}: ${dateText}`}
    >
      <span aria-hidden>{icon}</span>
      {u.tone === 'overdue' ? `Trễ ${remaining}` : `${remaining}`}
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
    case 'value_desc': return cloned.sort((a, b) => toNum(b.estimated_value) - toNum(a.estimated_value));
    case 'value_asc': return cloned.sort((a, b) => toNum(a.estimated_value) - toNum(b.estimated_value));
    case 'name_asc': return cloned.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
    case 'newest':
    default: return cloned.sort((a, b) => toTs(b.created_at) - toTs(a.created_at));
  }
}

export default function ProductionDashboard() {
  const P0 = useMemo(() => readSxDashPersisted(), []);
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => (typeof P0?.searchQuery === 'string' ? P0.searchQuery : ''));
  const [priorityFilter, setPriorityFilter] = useState(() => (typeof P0?.priorityFilter === 'string' ? P0.priorityFilter : ''));
  const [stageFilter, setStageFilter] = useState(() => (typeof P0?.stageFilter === 'string' ? P0.stageFilter : ''));
  const [viewMode, setViewMode] = useState(() => {
    const v = P0?.viewMode;
    return WS_DASH_VIEW_MODES.includes(v) ? v : 'kanban';
  });
  const [sortBy, setSortBy] = useState(() => {
    const v = P0?.sortBy;
    return SX_SORT_OPTIONS.some((o) => o.id === v) ? v : 'newest';
  });
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuRef = useRef(null);
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
  /** Hiện cột ảo «Chưa phân loại» ở cuối Kanban — gom các project chưa có workshop_type_id. */
  const [showOrphanColumn, setShowOrphanColumn] = useState(() => !!P0?.showOrphanColumn);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [allUsers, setAllUsers] = useState([]);
  const [showBulkDeadline, setShowBulkDeadline] = useState(false);
  const [showBulkPerson, setShowBulkPerson] = useState(false);
  const [bulkDeadlineVal, setBulkDeadlineVal] = useState('');
  const [bulkPersonId, setBulkPersonId] = useState('');
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
  const [commentsIndex, setCommentsIndex] = useState({});
  const [kanbanCommentItem, setKanbanCommentItem] = useState(null);
  const [kanbanCommentBody, setKanbanCommentBody] = useState('');
  const [kanbanCommentPosting, setKanbanCommentPosting] = useState(false);
  const [deadlineCtx, setDeadlineCtx] = useState(null);
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const navigate = useNavigate();

  const staffFilter = useWorkshopStaffFilter({
    user,
    isAdmin,
    companies,
    filterCompany,
    setFilterCompany,
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

  const deferredPersonName = useDeferredValue(filterPersonName);

  const handleStaffFilterCompanyChange = useCallback((companyId) => {
    onStaffFilterCompanyChange(companyId);
    setFilterWorkTypeId('');
  }, [onStaffFilterCompanyChange]);

  const companyParam = useMemo(() => {
    if (isAdmin) return filterCompany || undefined;
    return user?.company_id ? String(user.company_id) : undefined;
  }, [isAdmin, filterCompany, user?.company_id]);
  const companyForTypes = companyParam || (user?.company_id ? String(user.company_id) : '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dashQ = {
        ...(companyParam ? { company_id: companyParam } : {}),
      };
      const maxRecords = kanbanLoadKey === 'all' ? 5000
        : Math.min(parseInt(kanbanLoadKey, 10) || 500, 5000);

      // KHÔNG truyền workshop_type_id ở fetch chính — filter loại làm phía client để
      // đổi loại không reload toàn trang. Pipeline columns được refetch silent ở
      // useEffect bên dưới khi filterWorkTypeId đổi.
      const [dashRes, projectList] = await Promise.all([
        api.get('/production/dashboard', { params: dashQ }).catch(() => ({ data: { kpis: {}, pipeline: [] } })),
        fetchWorkshopProjectPages(api, '/production/projects', {
          companyId: companyParam,
          maxRecords,
          pageSize: 500,
        }).catch(() => []),
      ]);
      setKpis(dashRes.data?.kpis || {});
      setPipeline(dashRes.data?.pipeline || []);
      setProjects(projectList);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setFirstLoaded(true);
  }, [companyParam, kanbanLoadKey]);

  useEffect(() => { load(); }, [load]);

  /**
   * Refetch pipeline columns SILENT khi đổi phân loại — không bật spinner toàn trang.
   * Bỏ qua lần đầu (load() đã set pipeline). Chỉ chạy khi filterWorkTypeId thay đổi.
   */
  const initialWorkTypeRef = useRef(true);
  useEffect(() => {
    if (initialWorkTypeRef.current) {
      initialWorkTypeRef.current = false;
      return;
    }
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const params = { all: 'false' };
        if (companyParam) params.company_id = companyParam;
        if (filterWorkTypeId) params.workshop_type_id = filterWorkTypeId;
        const { data } = await api.get('/production/pipeline-stages', { params });
        if (cancelled) return;
        if (Array.isArray(data) && data.length) setPipeline(data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [filterWorkTypeId, companyParam, loading]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) setFilterCompany('');
  }, [isAdmin, filterCompany, companies]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SX, JSON.stringify({
        filterCompany, timePreset, customFrom, customTo, kanbanLoadKey,
        filterPersonId, filterPersonName, filterRegion, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode, sortBy,
        showOrphanColumn,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, timePreset, customFrom, customTo, kanbanLoadKey, filterPersonId, filterPersonName,
    filterRegion, filterPhone, filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode, sortBy,
    showOrphanColumn,
  ]);

  // Đóng menu sắp xếp khi click ra ngoài
  useEffect(() => {
    if (!sortOpen) return undefined;
    const onDown = (e) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(e.target)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortOpen]);

  useEffect(() => {
    if (!companyForTypes) {
      setWorkTypes([]);
      return;
    }
    api.get('/workshop/project-types', { params: { company_id: companyForTypes, module: 'production' } })
      .then((r) => setWorkTypes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setWorkTypes([]));
  }, [companyForTypes]);


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

  const scopeProjects = useMemo(() => {
    return projects.filter((p) => {
      const { from, to } = dateFromTo;
      if (from && to && !workshopCreatedInRange(p.created_at, from, to)) return false;
      if (!matchesProject(p, { personNameQ: deferredPersonName })) return false;
      if (filterPhone === 'has' && !p.customer?.phone) return false;
      if (filterPhone === 'no' && p.customer?.phone) return false;
      // Filter phân loại client-side (không reload trang khi đổi loại)
      if (filterWorkTypeId === 'none') {
        if (p.workshop_type_id || p.workshop_type?.id) return false;
      } else if (filterWorkTypeId) {
        if (String(p.workshop_type_id || p.workshop_type?.id || '') !== String(filterWorkTypeId)) return false;
      }
      return true;
    });
  }, [projects, dateFromTo, matchesProject, deferredPersonName, filterPhone, filterWorkTypeId]);

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
      await Promise.all([...selectedIds].map(id =>
        api.put(`/projects/${id}`, { production_person_id: bulkPersonId })
      ));
      await load();
      setShowBulkPerson(false);
      setBulkPersonId('');
      clearSelection();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gắn người phụ trách'); }
    setBulkSaving(false);
  }, [bulkPersonId, selectedIds, load, clearSelection]);

  const applyBulkDelete = useCallback(async () => {
    if (!selectedIds.size || bulkDeleting) return;
    const count = selectedIds.size;
    const reason = window.prompt(`Xóa ${count} dự án đã chọn?\n\nDự án sẽ được chuyển vào Thùng rác — admin có thể khôi phục.\nNhập lý do (không bắt buộc):`, '');
    if (reason === null) return; // user nhấn Cancel
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/projects/${id}`, { data: { delete_reason: reason || undefined } })));
      await load();
      clearSelection();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa dự án');
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
    const handover = sortedStages.find((s) => s.is_handover_to_logistics === true);
    const VC_STATUSES = new Set(['shipping', 'installing', 'warranty']);

    const colIdFor = (project) => {
      if (VC_STATUSES.has(project.status) && handover) return handover.id;
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
      }
      // Won deal nhưng chưa map được workflow → cột intake hoặc cột đầu tiên
      if (project.sx_won_deal || project.sx_intake) {
        if (intake) return intake.id;
        return sortedStages[0]?.id || null;
      }
      return null;
    };

    /** Project được coi là «chưa phân loại» khi không có workshop_type_id. */
    const isOrphan = (p) => !p.workshop_type_id && !p.workshop_type?.id;
    /** Bật cột ảo khi user tích checkbox & đang xem Tất cả loại (không lọc cụ thể). */
    const includeOrphan = showOrphanColumn && !filterWorkTypeId;

    const baseColumns = baseStages.map((stage) => ({
      ...stage,
      items: scopeProjects
        .filter((project) => {
          if (includeOrphan && isOrphan(project)) return false; // chuyển sang cột ảo
          return colIdFor(project) === stage.id;
        })
        .sort(sortSxItems),
    }));

    if (!includeOrphan) return baseColumns;

    const orphanItems = scopeProjects.filter(isOrphan).sort(sortSxItems);
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
    return [...baseColumns, orphanCol];
  }, [pipeline, scopeProjects, showOrphanColumn, filterWorkTypeId]);

  const filteredKanbanPipeline = useMemo(() => {
    const result = kanbanPipeline.map((stage) => ({
      ...stage,
      items: sortProjectsBy(
        stage.items.filter((project) => {
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
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
      ),
    }));
    filteredKanbanPipelineRef.current = result;
    return result;
  }, [kanbanPipeline, searchQuery, priorityFilter, stageFilter, sortBy]);

  const allVisibleProjectIds = useMemo(
    () => filteredKanbanPipeline.flatMap((s) => (s.items || []).map((x) => x.id)).filter(Boolean),
    [filteredKanbanPipeline],
  );

  const refreshProjectCommentsIndex = useCallback(async (ids = allVisibleProjectIds) => {
    const uniqIds = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!uniqIds.length) {
      setCommentsIndex({});
      return;
    }
    try {
      const chunks = [];
      for (let i = 0; i < uniqIds.length; i += 200) chunks.push(uniqIds.slice(i, i + 200));
      const maps = await Promise.all(
        chunks.map((chunk) => api.get(`/projects/comments/index?project_ids=${chunk.join(',')}`).then((r) => r.data || {}).catch(() => ({}))),
      );
      const merged = {};
      maps.forEach((m) => Object.assign(merged, m || {}));
      setCommentsIndex(merged);
    } catch {
      setCommentsIndex({});
    }
  }, [allVisibleProjectIds]);

  useEffect(() => {
    if (viewMode !== 'comments') return;
    refreshProjectCommentsIndex();
  }, [viewMode, refreshProjectCommentsIndex]);

  const submitKanbanQuickComment = useCallback(async () => {
    const v = kanbanCommentBody.trim();
    const it = kanbanCommentItem;
    if (!v || !it) return;
    setKanbanCommentPosting(true);
    try {
      await api.post(`/projects/${it.id}/comments`, { content: v });
      setKanbanCommentItem(null);
      setKanbanCommentBody('');
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
  }, [kanbanCommentBody, kanbanCommentItem, user?.id]);

  /** Từ chi tiết: cuộn tới thẻ vừa xem (cần đặt sau filteredKanbanPipeline) */
  useEffect(() => {
    if (loading) return;
    const id = peekWorkshopPipelineCardFocus('sx');
    if (!id) return;
    if (viewMode !== 'kanban') {
      setViewMode('kanban');
      return;
    }
    const pulse = (el) => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-teal-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-teal-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      }, 2200);
      clearWorkshopPipelineCardFocus('sx');
    };
    const tryOnce = () => {
      const el = document.querySelector(`[data-sx-kanban-card="${id}"]`);
      if (el) {
        pulse(el);
        return true;
      }
      return false;
    };
    if (tryOnce()) return undefined;
    const t = window.setTimeout(() => {
      if (!tryOnce()) clearWorkshopPipelineCardFocus('sx');
    }, 500);
    return () => clearTimeout(t);
  }, [loading, viewMode, filteredKanbanPipeline]);

  const scopeKpis = useMemo(() => {
    const list = scopeProjects;
    const revenue = computeSxRevenueKpis(list, pipeline);
    const columnSlaOverdue = list.filter((p) => isSxColumnSlaOverdue(p)).length;
    if (!list.length) {
      return {
        total: 0, producing: 0, completed: 0, overdue: 0, avg_progress: kpis?.avg_progress || 0,
        intake_pending: 0, delivering: 0, customer_care: 0,
        won_revenue_value: kpis?.won_revenue_value || 0,
        completed_revenue_value: kpis?.completed_revenue_value || 0,
        weighted_pipeline_value: kpis?.weighted_pipeline_value || 0,
        column_sla_overdue: 0,
      };
    }
    return {
      total: list.length,
      producing: list.filter((p) => p.current_stage?.slug === 'production' || p.status === 'producing').length,
      delivering: list.filter((p) => p.current_stage?.slug === 'delivery' || p.status === 'shipping' || p.status === 'installing').length,
      customer_care: list.filter((p) => p.current_stage?.slug === 'customer-care' || p.status === 'warranty').length,
      completed: list.filter((p) => p.status === 'completed').length,
      overdue: list.filter((p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed').length,
      intake_pending: list.filter((p) => p.sx_intake).length,
      avg_progress: Math.round(list.reduce((s, p) => s + (p.progress || 0), 0) / list.length),
      won_revenue_value: revenue.wonRevenue,
      completed_revenue_value: revenue.completedRevenue,
      weighted_pipeline_value: revenue.weightedPipeline,
      column_sla_overdue: columnSlaOverdue,
    };
  }, [scopeProjects, kpis, pipeline]);

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

    setProjects((prev) => prev.map((p) => (p.id === projectId
      ? {
        ...p,
        current_stage: optimisticStage,
        current_stage_id: wid || null,
        sx_kanban_column_id: colId,
        sx_intake: false,
        ...(deadlineIso ? {
          sx_kanban_deadline_at: deadlineIso,
          sx_kanban_deadline_reason: reason || null,
        } : {}),
      }
      : p)));

    try {
      await api.patch(`/production/projects/${projectId}/stage`, {
        production_pipeline_stage_id: colId,
        current_sx_pipeline_stage_id: currentColId,
        company_id: companyParam || undefined,
        ...(deadlineIso ? { sx_kanban_deadline_at: deadlineIso, deadline_reason: reason || '' } : {}),
      });
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
        load();
        return;
      }
      window.alert(e.response?.data?.error || e.message || 'Không chuyển được cột pipeline');
      load();
    }
  }, [load, projects, companyParam]);

  const handleMoveStage = useCallback(async (projectId, targetCol) => {
    const current = projects.find((p) => String(p.id) === String(projectId));
    const lockedInVc = ['shipping', 'installing', 'warranty', 'completed'].includes(String(current?.status || ''));
    if (lockedInVc) {
      alert('Deal đã bàn giao sang Vận chuyển nên không thể kéo về cột khác.');
      return;
    }

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
    const isHandover = targetCol?.is_handover_to_logistics === true;

    if (isIntake) {
      setProjects((prev) => prev.map((p) => (p.id === projectId
        ? { ...p, current_stage: null, sx_kanban_column_id: targetCol.id, sx_intake: true }
        : p)));
      try {
        await api.patch(`/production/projects/${projectId}/stage`, { move_to_intake: true });
        scheduleCrmBadgeRefresh(projectId);
      } catch (e) {
        console.error(e);
        load();
      }
      return;
    }

    // Cột được đánh dấu "bàn giao VC" → gọi handover-vc, giữ card trong cột
    if (isHandover) {
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

    // Luôn gửi production_pipeline_stages.id (không chỉ workflow stage_id) — giống chi tiết dự án.
    const colId = targetCol?.id;
    const currentColId = current?.sx_kanban_column_id || null;
    const isSameCol = colId && currentColId && String(colId) === String(currentColId);
    if (!isSameCol && targetCol?.requires_deadline) {
      setDeadlineCtx({
        projectId,
        targetCol,
        project: current,
        mode: 'stage_move',
      });
      return;
    }

    await executeStageMove(projectId, targetCol);
  }, [executeStageMove, projects]);

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

  const handleHandoverVC = useCallback(async (projectId, projectName, logisticsCompanyId) => {
    try {
      // Cập nhật optimistic: đổi status thành shipping, GIỮ trong kanban
      setProjects((prev) => prev.map((p) => (p.id === projectId
        ? { ...p, status: 'shipping', current_stage: null }
        : p)));
      const { data } = await api.patch(`/production/projects/${projectId}/handover-vc`, {
        logistics_company_id: logisticsCompanyId || undefined,
      });
      const updated = data?.project;
      if (updated) {
        setProjects((prev) => prev.map((p) => (p.id === projectId
          ? {
              ...p,
              status: updated.status ?? p.status,
              current_stage_id: updated.current_stage_id ?? null,
              current_stage: updated.current_stage ?? null,
              vc_kanban_column_id: updated.vc_kanban_column_id ?? p.vc_kanban_column_id,
              logistics_person_id: updated.logistics_person_id ?? p.logistics_person_id,
              delivery_team_id: updated.delivery_team_id ?? p.delivery_team_id,
              installation_team_id: updated.installation_team_id ?? p.installation_team_id,
            }
          : p)));
      }
      scheduleCrmBadgeRefresh(projectId);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Lỗi bàn giao VC');
      load();
    }
  }, [load]);

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
      setHandoverErr('Vui lòng chọn công ty Vận chuyển/Lắp đặt.');
      return;
    }
    setHandoverSaving(true);

    // Optimistic: ghim thẻ ở cột bàn giao VC để không bị nhảy cột
    setProjects((prev) => prev.map((p) => (String(p.id) === String(handoverModal.projectId)
      ? {
          ...p,
          status: 'shipping',
          current_stage: null,
          current_stage_id: null,
          sx_kanban_column_id: handoverTargetSxColId || p.sx_kanban_column_id,
        }
      : p)));

    await handleHandoverVC(
      handoverModal.projectId,
      handoverModal.projectName,
      handoverLogisticsCompanyId,
    );
    setHandoverSaving(false);
    setHandoverModal(null);
    setHandoverTargetSxColId('');
    setHandoverLogisticsCompanyId('');
    setHandoverDeliveryTeamId('');
    setHandoverInstallationTeamId('');
    setHandoverErr('');
  }, [handoverModal, handoverLogisticsCompanyId, handoverTargetSxColId, handleHandoverVC]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
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
    + (filterWorkTypeId ? 1 : 0)
    + (String(searchQuery || '').trim() ? 1 : 0) + (priorityFilter ? 1 : 0) + (stageFilter ? 1 : 0);

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

  // Lần đầu chưa có data → spinner toàn vùng. Reload sau đó dùng overlay nhẹ
  // (xem block <main className="relative"> ở dưới) để toolbar/KPI vẫn hiển thị.
  if (loading && !firstLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header — gọn nhẹ, view-mode buttons outlined */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-1.5">
            <Factory className="h-5 w-5 text-blue-600" />
            Quản lý sản xuất
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowNewDeal(true)}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2 cursor-pointer text-sm shrink-0"
            title="Tạo deal mới và đưa vào cột Chờ vào xưởng"
          >
            <Plus className="h-4 w-4" />
            Tạo deal
          </button>
          {[
            { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
            { id: 'list', icon: List, label: 'Danh sách' },
            { id: 'planner', icon: Users, label: 'Planner' },
            { id: 'deadline', icon: Clock, label: 'Deadline' },
            { id: 'comments', icon: MessageSquare, label: 'Bình luận' },
            { id: 'calendar', icon: Calendar, label: 'Lịch' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewMode(v.id)}
              className={`h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewMode === v.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
              style={viewMode === v.id ? undefined : { color: '#000000' }}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI — thanh màu trên đầu + nhãn / số / descriptor (giống mockup) */}
      {(() => {
        const overdueProd = scopeProjects.filter((p) => p.is_production_overdue).length;
        const total = scopeKpis.total;
        const producingValue = scopeProjects
          .filter((p) => p.current_stage?.slug === 'production' || p.status === 'producing')
          .reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <KPICard accent="bg-violet-500" label="Tổng dự án" value={total} descriptor={total > 0 ? `↑ ${total} tuần này` : '—'} />
            <KPICard
              accent="bg-teal-500"
              label="Đang sản xuất"
              value={scopeKpis.producing}
              descriptor={scopeKpis.producing > 0 ? formatVND(producingValue) : '—'}
            />
            <KPICard
              accent="bg-amber-500"
              label="DT thắng (SX)"
              value={scopeKpis.won_revenue_value > 0 ? formatVND(scopeKpis.won_revenue_value) : '—'}
              descriptor="theo cột pipeline"
            />
            <KPICard
              accent="bg-emerald-600"
              label="DT hoàn thành"
              value={scopeKpis.completed_revenue_value > 0 ? formatVND(scopeKpis.completed_revenue_value) : '—'}
              descriptor="theo cột pipeline"
            />
            <KPICard accent="bg-emerald-500" label="Hoàn thành" value={scopeKpis.completed} descriptor="tuần này" />
            <KPICard accent="bg-red-500" label="Quá hạn" value={scopeKpis.overdue} descriptor={scopeKpis.overdue > 0 ? 'cần xử lý' : 'không có'} valueTone={scopeKpis.overdue > 0 ? 'danger' : undefined} />
            <KPICard
              accent="bg-rose-500"
              label="Trễ SLA cột"
              value={scopeKpis.column_sla_overdue}
              descriptor={scopeKpis.column_sla_overdue > 0 ? 'cần xử lý' : 'không có'}
              valueTone={scopeKpis.column_sla_overdue > 0 ? 'danger' : undefined}
            />
            <KPICard accent="bg-orange-500" label="Trễ giao xưởng" value={overdueProd} descriptor={overdueProd > 0 ? 'cần xử lý' : 'không có'} valueTone={overdueProd > 0 ? 'danger' : undefined} />
          </div>
        );
      })()}

      {/* Toolbar 1 dòng: Search + Chip filter inline + Bộ lọc + Sắp xếp (luôn hiển thị) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[18rem] max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo mã TB, tên khách, số điện thoại..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer" title="Xóa tìm kiếm">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Active filter chips — inline, có nút × để bỏ */}
          {filterCompany && companies.length > 0 && (() => {
            const c = companies.find((x) => String(x.id) === String(filterCompany));
            if (!c) return null;
            return (
              <span className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium">
                {c.short_name || c.name}
                <button type="button" onClick={() => handleStaffFilterCompanyChange('')} className="p-1 rounded hover:bg-blue-100 cursor-pointer" title="Bỏ lọc công ty">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })()}
          {priorityFilter && (
            <span className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium">
              Ưu tiên: {priorityFilter === 'high' ? 'Cao' : priorityFilter === 'medium' ? 'TB' : 'Thấp'}
              <button type="button" onClick={() => setPriorityFilter('')} className="p-1 rounded hover:bg-amber-100 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {stageFilter && (() => {
            const st = pipeline.find((s) => String(s.id) === String(stageFilter));
            if (!st) return null;
            return (
              <span className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-lg text-sm font-medium">
                {st.icon || '•'} {st.name}
                <button type="button" onClick={() => setStageFilter('')} className="p-1 rounded hover:bg-violet-100 cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })()}

          {/* Phân loại — luôn hiển thị trên toolbar (không cần mở Bộ lọc) */}
          {companyForTypes && (
            <div
              className={`inline-flex items-center gap-1 h-9 px-2 rounded-lg border shrink-0 ${
                filterWorkTypeId === 'none'
                  ? 'border-amber-300 bg-amber-50'
                  : filterWorkTypeId
                    ? 'border-teal-300 bg-teal-50'
                    : 'border-gray-200 bg-white'
              }`}
              title="Phân loại dự án xưởng"
            >
              <Layers className={`h-3.5 w-3.5 shrink-0 ${
                filterWorkTypeId === 'none' ? 'text-amber-600'
                : filterWorkTypeId ? 'text-teal-700' : 'text-gray-500'
              }`} />
              <select
                value={filterWorkTypeId}
                onChange={(e) => setFilterWorkTypeId(e.target.value)}
                className={`h-8 text-sm bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[12rem] font-medium ${
                  filterWorkTypeId === 'none' ? 'text-amber-700'
                  : filterWorkTypeId ? 'text-teal-800' : 'text-gray-700'
                }`}
              >
                <option value="">{workTypes.length === 0 ? 'Chưa cấu hình loại' : 'Phân loại: Tất cả'}</option>
                <option value="none">⚠️ Chưa phân loại</option>
                {workTypes.map((wt) => (
                  <option key={wt.id} value={wt.id}>{wt.name}</option>
                ))}
              </select>
              {filterWorkTypeId && (
                <button
                  type="button"
                  onClick={() => setFilterWorkTypeId('')}
                  className="p-1 rounded hover:bg-white/70 cursor-pointer"
                  title="Bỏ lọc phân loại"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Cột ảo «Chưa phân loại» — chỉ hiển thị khi đang xem Tất cả loại */}
          {viewMode === 'kanban' && !filterWorkTypeId && (
            <label
              className={`inline-flex items-center gap-1.5 h-9 px-2.5 border rounded-lg text-xs cursor-pointer transition-colors shrink-0 ${
                showOrphanColumn
                  ? 'bg-slate-100 border-slate-400 text-slate-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              title="Hiện cột ảo ở cuối Kanban — gom các project chưa được gán phân loại (workshop type)."
            >
              <input
                type="checkbox"
                checked={showOrphanColumn}
                onChange={(e) => setShowOrphanColumn(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-slate-600"
              />
              <span>📦 Chưa phân loại</span>
            </label>
          )}

          {/* Bộ lọc */}
          <button
            type="button"
            onClick={() => setShowAdvFilter((s) => !s)}
            className={`h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
              showAdvFilter || advFilterCount
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
            style={(showAdvFilter || advFilterCount) ? undefined : { color: '#000000' }}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc
            {advFilterCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-600 text-white rounded-full min-w-[1.1rem] px-1 text-center">
                {advFilterCount}
              </span>
            )}
          </button>

          {/* Sắp xếp */}
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setSortOpen((s) => !s)}
              className={`h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                sortOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
              style={sortOpen ? undefined : { color: '#000000' }}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SX_SORT_OPTIONS.find((o) => o.id === sortBy)?.label || 'Sắp xếp'}
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
                {SX_SORT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { setSortBy(o.id); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${
                      sortBy === o.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="h-9 px-2.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1"
              title="Xóa toàn bộ bộ lọc"
            >
              <X className="h-3.5 w-3.5" /> Xóa lọc
            </button>
          )}
        </div>

        {showAdvFilter && (
          <div className="space-y-3 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Thời gian tạo</p>
                <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1.5 h-9">
                  <Clock className="h-3.5 w-3.5 text-gray-400 ml-0.5 shrink-0" />
                  <select
                    value={timePreset}
                    onChange={(e) => setTimePreset(e.target.value)}
                    className="h-8 pr-1 text-xs sm:text-sm bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[8rem]"
                  >
                    {WS_TIME_PRESETS.map((o) => (
                      <option key={o.key || 'all'} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {timePreset === 'custom' && (
                <div className="flex items-center gap-1 flex-wrap">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 px-2 border border-gray-200 rounded-lg text-xs bg-white" />
                  <span className="text-gray-400">–</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 px-2 border border-gray-200 rounded-lg text-xs bg-white" />
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Tải tối đa</p>
                <select
                  value={kanbanLoadKey}
                  onChange={(e) => setKanbanLoadKey(e.target.value)}
                  className="h-9 px-2 border border-gray-200 rounded-lg text-xs sm:text-sm bg-amber-50/80"
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
              ringFocusClass="focus:ring-blue-500"
            />

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5 min-w-[10rem]">
                <label className="text-[10px] text-gray-500 font-medium">Giai đoạn</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                >
                  <option value="">Tất cả giai đoạn</option>
                  {pipeline.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.icon || '•'} {stage.name}</option>
                  ))}
                </select>
              </div>
              {companyForTypes && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Phân loại</label>
                  <div className="inline-flex items-center gap-1 h-8 px-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <Layers className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <select
                      value={filterWorkTypeId}
                      onChange={(e) => setFilterWorkTypeId(e.target.value)}
                      className="h-7 text-xs bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[11rem]"
                    >
                      <option value="">{workTypes.length === 0 ? 'Chưa cấu hình' : 'Tất cả loại'}</option>
                      <option value="none">⚠️ Chưa phân loại</option>
                      {workTypes.map((wt) => (
                        <option key={wt.id} value={wt.id}>{wt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Ưu tiên</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="h-8 w-28 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                >
                  <option value="">Tất cả</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">SĐT</label>
                <select
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  className="h-8 w-36 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                >
                  <option value="">Không lọc</option>
                  <option value="has">Có SĐT</option>
                  <option value="no">Chưa có SĐT</option>
                </select>
              </div>
            </div>

          </div>
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

      <div className="relative">
        {loading && firstLoaded && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-xs text-gray-700">Đang cập nhật…</span>
            </div>
          </div>
        )}

        {viewMode === 'kanban' && (
          <KanbanView pipeline={filteredKanbanPipeline} onMoveStage={handleMoveStage} calculateDays={calculateDays}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectColumn={selectColumn}
            onHandoverVC={openHandoverModal}
            onOpenKanbanComment={(item) => { setKanbanCommentItem(item); setKanbanCommentBody(''); }}
            workTypes={workTypes}
            onSetWorkType={async (projectId, typeId) => {
              try {
                await api.put(`/projects/${projectId}`, { workshop_type_id: typeId || null });
                setProjects((prev) => prev.map((p) => (p.id === projectId
                  ? { ...p, workshop_type_id: typeId || null,
                      workshop_type: typeId ? (workTypes.find((w) => String(w.id) === String(typeId)) || null) : null }
                  : p)));
              } catch (e) {
                alert(e.response?.data?.error || 'Lỗi đổi phân loại');
              }
            }}
            onOpenDeadline={openDeadlineFromCard}
            remeasureToken={showAdvFilter ? 'adv-on' : 'adv-off'} />
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
                <option key={u.id} value={u.id}>{u.full_name}</option>
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
              <span className="text-xs font-semibold text-gray-600">Công ty VC/Lắp đặt *</span>
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

      {/* Bình luận nhanh trên thẻ Kanban — gửi vào /projects/:id/comments */}
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
                  onClick={submitKanbanQuickComment}
                  className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {kanbanCommentPosting ? 'Đang gửi…' : 'Gửi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewDeal && (
        <NewDealModal
          variant="production"
          onClose={() => setShowNewDeal(false)}
          onSuccess={() => load()}
          companies={companies}
          workTypes={workTypes}
          defaultWorkshopTypeId={filterWorkTypeId && filterWorkTypeId !== 'none' ? filterWorkTypeId : ''}
          defaultCompanyId={
            isAdmin
              ? (filterCompany || dashboardScopeCompanyId || user?.company_id || '')
              : (dashboardScopeCompanyId || user?.company_id || '')
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

// KPI Card — thanh màu mảnh ở trên + label / value / descriptor (giống mockup)
function KPICard({ accent = 'bg-blue-500', label, value, descriptor, valueTone }) {
  const isDanger = valueTone === 'danger';
  const isWarning = valueTone === 'warning';
  const valueClass = isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : '';
  const valueStyle = !isDanger && !isWarning ? { color: '#000000' } : undefined;
  return (
    <div className="relative min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className={`h-[3px] w-full ${accent}`} />
      <div className="px-3 py-2 flex flex-col gap-0.5">
        <p className="text-[11px] text-gray-500 font-medium truncate" title={label}>{label}</p>
        <p className={`text-2xl font-bold leading-none tabular-nums ${valueClass}`} style={valueStyle}>{value}</p>
        {descriptor && <p className="text-[11px] text-gray-400 truncate" title={descriptor}>{descriptor}</p>}
      </div>
    </div>
  );
}

// ── KANBAN STAGE CARD — header tối giản (dot + tên + count + total) ────────
function KanbanStageCard({ stage, items, onMoveStage, calculateDays, selectedIds, onToggleSelect, onSelectColumn, onHandoverVC, onOpenKanbanComment, workTypes, onSetWorkType, onOpenDeadline }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const stageColor = stage.color || '#94a3b8';
  const totalValue = items.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0);

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
      className={`flex flex-col flex-shrink-0 w-72 transition-all duration-200 ${
        isOverColumn ? 'ring-2 ring-blue-400 ring-dashed rounded-lg' : ''
      }`}
    >
      {/* Header tối giản — sticky khi cuộn dọc, có thanh accent màu cột ở đỉnh */}
      <div
        className={`sticky top-0 z-10 bg-gray-200/95 backdrop-blur supports-[backdrop-filter]:bg-gray-200/85 px-2 py-2.5 border-b rounded-t-md transition-colors ${isOverColumn ? 'bg-blue-100/90 border-blue-300' : 'border-gray-300/70'}`}
        style={{ borderTop: `8px solid ${stageColor}` }}
      >
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold truncate" style={{ color: '#000000' }}>{stage.name}</h3>
          <span
            className="shrink-0 inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-md text-[13px] font-bold tabular-nums leading-none"
            style={{
              backgroundColor: `${stageColor}22`,
              color: stageColor,
              border: `1px solid ${stageColor}55`,
            }}
            title={`${items.length} đơn`}
          >
            {items.length}
          </span>
          {stage.is_handover_to_logistics && (
            <span className="px-1 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-bold rounded shrink-0">→VC</span>
          )}
          {onSelectColumn && items.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectColumn(stage.id); }}
              className="ml-auto px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
              title="Chọn tất cả dự án trong cột này"
            >
              Chọn cột
            </button>
          )}
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
        <p className="text-[11px] text-gray-500 tabular-nums mt-0.5">
          {totalValue > 0 ? formatVND(totalValue) : '0đ'}
        </p>
      </div>

      {/* Cards container — không viền, không nền (sạch sẽ như mockup) */}
      <div
        className={`flex-1 px-1 pt-2 pb-3 space-y-2 transition-colors ${isOverColumn ? 'bg-blue-50/60 rounded-b-lg' : ''}`}
        style={{ minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-1.5">
            <Layers className="h-6 w-6 opacity-50" />
            <p className="text-xs">{isOverColumn ? 'Thả vào đây' : 'Chưa có dự án'}</p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} stage={stage} calculateDays={calculateDays}
              isSelected={selectedIds?.has(item.id)} onToggleSelect={onToggleSelect}
              onHandoverVC={onHandoverVC} onOpenKanbanComment={onOpenKanbanComment}
              workTypes={workTypes} onSetWorkType={onSetWorkType} onOpenDeadline={onOpenDeadline} />
          ))
        )}
      </div>
    </div>
  );
}

// ── KANBAN ITEM CARD (y hệt CRM KanbanCard) ─────────────────────────────────
function KanbanCard({ item, stage, calculateDays, isSelected, onToggleSelect, onHandoverVC, onOpenKanbanComment, workTypes, onSetWorkType, onOpenDeadline }) {
  const navigate = useNavigate();
  const [handingOver, setHandingOver] = useState(false);
  const [localPinned, setLocalPinned] = useState(!!item.is_pinned);
  const [localInteracted, setLocalInteracted] = useState(!!item.is_interacted);

  useEffect(() => {
    setLocalPinned(!!item.is_pinned);
    setLocalInteracted(!!item.is_interacted);
  }, [item.is_pinned, item.is_interacted]);

  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-workshop-bulk-checkbox]')) {
      e.preventDefault();
      return;
    }
    if (e.target.closest?.('[data-sx-kanban-deadline-btn]')) {
      e.preventDefault();
      return;
    }
    if (e.target.closest?.('[data-sx-quick-btn]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };

  const stageColor = stage.color || '#e5e7eb';
  const assignee = item.production_person || item.assignee;
  const deals = Array.isArray(item.crm_deals) ? item.crm_deals : [];
  const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
  const leadCreatedAt = primaryDeal?.created_at || item.created_at || null;
  const columnEnteredAt = item.sx_pipeline_stage_entered_at || item.stage_entered_at || item.updated_at || item.created_at || null;
  const columnSlaTone = getSxPipelineStageSlaTone(item.sx_pipeline_stage_entered_at, item.sx_pipeline_stage);
  const manualDlUrgency = item.sx_kanban_deadline_at
    ? getCrmDeadlineUrgencyFromIso(item.sx_kanban_deadline_at)
    : null;
  const manualDlLevel = manualDlUrgency && manualDlUrgency.level !== 'ok' ? manualDlUrgency.level : null;
  const companyName = item.company?.short_name || item.company?.name || null;
  const slaDeadlineTs = (() => {
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

  const primaryDeadline = item.production_deadline || item.deadline || null;
  const primaryUrgency = getDeadlineUrgency(primaryDeadline);
  const customerInitials = getInitials(item.customer?.full_name || item.name || '');
  const progress = item.sx_pipeline_percent != null ? Math.max(0, Math.min(100, Number(item.sx_pipeline_percent) || 0)) : null;

  const statusStripClass = manualDlLevel === 'overdue' || columnSlaTone?.level === 'overdue'
    ? 'bg-red-500'
    : manualDlLevel === 'soon' || columnSlaTone?.level === 'soon'
      ? 'bg-amber-500'
      : manualDlLevel === 'warn' || columnSlaTone?.level === 'warn'
        ? 'bg-yellow-400'
        : slaOverdue
          ? 'bg-orange-400'
          : 'bg-gray-200';
  const cardBorderToneClass = (manualDlLevel === 'overdue' || columnSlaTone?.level === 'overdue')
    ? 'border-red-300'
    : 'border-gray-200';

  return (
    <div
      data-sx-kanban-card={item.id}
      draggable={!lockedInVc}
      onDragStart={handleDragStart}
      onClick={(e) => {
        if (e.target.closest?.('[data-workshop-bulk-checkbox]')) return;
        if (e.target.closest?.('[data-sx-quick-btn]')) return;
        markWorkshopPipelineCardFocus(item.id, 'sx');
        navigate(`/sx/projects/${item.id}`);
      }}
      className={`relative !bg-white rounded-lg border overflow-hidden px-3 pt-3 pb-2.5 transition-all duration-200 group hover:shadow-md ${
        lockedInVc ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelected
          ? 'ring-2 ring-blue-400 ring-offset-1 border-blue-200'
          : cardBorderToneClass
      }`}
      style={{ backgroundColor: '#ffffff' }}
    >
      {/* Thanh trạng thái 3px trên đầu — nhận biết deadline khi lướt */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-0 left-0 right-0 h-[3px] ${statusStripClass}`}
      />

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
            title={`Tạo lead: ${new Date(leadCreatedAt).toLocaleString('vi-VN')}`}
          >
            {new Date(leadCreatedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
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
        title={item.name}
      >
        {item.name}
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

      {/* Row 3: Giá trị + Deadline cùng hàng */}
      {(Number(item.estimated_value) > 0 || primaryDeadline) && (
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          {Number(item.estimated_value) > 0 ? (
            <p className="text-sm font-bold text-emerald-600 tabular-nums truncate">
              {formatVND(item.estimated_value)}
            </p>
          ) : (
            <span className="text-[11px] text-gray-400 italic">Chưa có giá trị</span>
          )}
          {primaryDeadline && (
            <DeadlineBadge
              date={primaryDeadline}
              icon={item.production_deadline ? '🏭' : '📅'}
              label={item.production_deadline ? 'Giao xưởng' : 'Deadline'}
            />
          )}
        </div>
      )}

      {/* Deadline thẻ (sx_kanban_deadline_at) — bấm để sửa */}
      {typeof onOpenDeadline === 'function' && item.sx_kanban_deadline_at && (() => {
        const { level } = getCrmDeadlineUrgencyFromIso(item.sx_kanban_deadline_at);
        const tone = `${getCrmDeadlineUrgencyBadgeClass(level)} hover:opacity-90 cursor-pointer`;
        const urgent = level === 'overdue' || level === 'soon';
        return (
          <button
            type="button"
            data-sx-kanban-deadline-btn
            onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
            className={`inline-flex items-center gap-1 rounded-md border transition-opacity mb-1.5 ${urgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px] font-semibold'} ${tone}`}
            title={`Deadline thẻ — bấm để sửa (${new Date(item.sx_kanban_deadline_at).toLocaleString('vi-VN')})`}
          >
            <Clock className="h-3 w-3" strokeWidth={2.4} />
            Deadline: {new Date(item.sx_kanban_deadline_at).toLocaleDateString('vi-VN')}
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

      {/* Row 5: Công ty + SĐT — 1 dòng */}
      {(companyName || item.customer?.phone) && (
        <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-1.5 min-w-0">
          {companyName && (
            <span className="inline-flex items-center gap-1 truncate min-w-0" title={companyName}>
              <Factory className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{companyName}</span>
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

      {/* Footer: time chip + avatar + quick actions */}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100">
        {/* Time chip */}
        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
          <Clock className="h-2.5 w-2.5" />
          {columnEnteredAt ? formatAgeDetailed(columnEnteredAt) : calculateDays(item.created_at)}
        </span>
        {columnSlaTone && columnSlaTone.level !== 'ok' && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
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

        {/* Spacer */}
        <span className="flex-1" />

        {/* Avatar */}
        {assignee?.full_name ? (
          assignee.avatar ? (
            <img src={assignee.avatar} alt="" className="h-5 w-5 rounded-full shrink-0" title={assignee.full_name} />
          ) : (
            <div
              className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ backgroundColor: stageColor }}
              title={assignee.full_name}
            >
              {getInitials(assignee.full_name)}
            </div>
          )
        ) : (
          <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 text-[10px] flex items-center justify-center shrink-0" title="Chưa có người phụ trách">?</span>
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
              navigate(`/sx/projects/${item.id}?tab=chat`);
            }
          }}
          className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
        >
          <MessageSquare className="h-3 w-3" />
        </button>
        {typeof onOpenDeadline === 'function' && (
          <button
            type="button"
            data-sx-kanban-deadline-btn
            title={item.sx_kanban_deadline_at ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ'}
            onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
            className={`h-5 w-5 inline-flex items-center justify-center rounded transition-colors cursor-pointer ${
              item.sx_kanban_deadline_at
                ? 'text-rose-600 hover:bg-rose-50'
                : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        )}
        <button
          type="button"
          data-sx-quick-btn
          title={localPinned ? 'Bỏ ghim' : 'Ghim'}
          onClick={(e) => { e.stopPropagation(); setLocalPinned((v) => !v); }}
          className={`h-5 w-5 inline-flex items-center justify-center rounded hover:bg-amber-50 cursor-pointer ${
            localPinned ? 'text-amber-600' : 'text-gray-400 hover:text-amber-600'
          }`}
        >
          <Pin className={`h-3 w-3 ${localPinned ? 'rotate-45 fill-amber-500' : ''}`} />
        </button>
      </div>

      {/* SLA cảnh báo (chỉ khi quá hạn / sắp) — đặt cuối */}
      {slaDeadlineTs != null && slaOverdue && (
        <p className="mt-1.5 text-[10px] text-red-600 font-semibold flex items-center gap-1">
          ⚠️ Quá SLA {formatRemainingMs(slaRemainingMs)}
        </p>
      )}

      {/* VC status (khi đã bàn giao) — gọn 1 dòng nhỏ */}
      {(item.status === 'shipping' || item.status === 'installing' || item.status === 'warranty') && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
          <Truck className="h-2.5 w-2.5" />
          <span className="font-medium">
            {item.vc_stage?.name || (item.status === 'shipping' ? 'Đang vận chuyển' : item.status === 'installing' ? 'Đang lắp đặt' : 'Bảo hành')}
          </span>
        </div>
      )}

      {/* Nút Bàn giao VC: chỉ hiện ở cột được đánh dấu is_handover_to_logistics */}
      {onHandoverVC && stage?.is_handover_to_logistics === true && item.status !== 'shipping' && item.status !== 'installing' && item.status !== 'warranty' && item.status !== 'completed' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (handingOver) return;
            setHandingOver(true);
            Promise.resolve(onHandoverVC(item.id, item.name, stage?.id)).finally(() => setHandingOver(false));
          }}
          className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title="Bàn giao sang Vận chuyển & Lắp đặt"
        >
          {handingOver ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
          {handingOver ? 'Đang bàn giao...' : 'Bàn giao VC'}
        </button>
      )}
    </div>
  );
}

// ── KANBAN VIEW CONTAINER (y hệt CRM KanbanView) ─────────────────────────────
function KanbanView({ pipeline, onMoveStage, calculateDays, selectedIds, onToggleSelect, onSelectColumn, onHandoverVC, onOpenKanbanComment, workTypes, onSetWorkType, onOpenDeadline, remeasureToken }) {
  return (
    <WorkshopPipelineKanbanScroll
      cardSelector="[data-sx-kanban-card]"
      enableViewportScroll
      remeasureToken={remeasureToken}
    >
      <div className="flex min-w-max items-stretch gap-1">
        {pipeline.map((stage) => (
          <KanbanStageCard
            key={stage.id || stage.slug}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            calculateDays={calculateDays}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onSelectColumn={onSelectColumn}
            onHandoverVC={onHandoverVC}
            onOpenKanbanComment={onOpenKanbanComment}
            workTypes={workTypes}
            onSetWorkType={onSetWorkType}
            onOpenDeadline={onOpenDeadline}
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

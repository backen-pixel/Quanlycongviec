import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND, formatDate } from '../lib/utils';
import {
  getWorkshopDateRange, WS_TIME_PRESETS, WS_KANBAN_LOAD_OPTIONS,
  workshopCreatedInRange, fetchWorkshopProjectPages,
} from '../lib/workshopDashboardUtils';
import {
  Zap, CheckCircle2, AlertTriangle, Search, X, Calendar,
  Factory, Users, LayoutGrid, List, Plus,
  CheckSquare, UserCheck, Loader2, Truck, Filter, Clock, Layers, Trash2, MessageSquare, Pin,
} from 'lucide-react';
import { ProductionListView, ProductionPlannerView, ProductionCalendarView, ProductionCommentsView } from '../components/ProductionViews';
import NewProductionProjectModal from '../components/NewProductionProjectModal';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import WorkshopStaffFilterPanel from '../components/WorkshopStaffFilterPanel';
import { useWorkshopStaffFilter } from '../hooks/useWorkshopStaffFilter';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
} from '../lib/workshopPipelineStorage';

const INTAKE_BUCKET = 'won_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'calendar', 'comments'];

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

export default function ProductionDashboard() {
  const P0 = useMemo(() => readSxDashPersisted(), []);
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => (typeof P0?.searchQuery === 'string' ? P0.searchQuery : ''));
  const [priorityFilter, setPriorityFilter] = useState(() => (typeof P0?.priorityFilter === 'string' ? P0.priorityFilter : ''));
  const [stageFilter, setStageFilter] = useState(() => (typeof P0?.stageFilter === 'string' ? P0.stageFilter : ''));
  const [viewMode, setViewMode] = useState(() => {
    const v = P0?.viewMode;
    return WS_DASH_VIEW_MODES.includes(v) ? v : 'kanban';
  });
  const [showNewProject, setShowNewProject] = useState(false);
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
        ...(filterWorkTypeId ? { workshop_type_id: filterWorkTypeId } : {}),
      };
      const maxRecords = kanbanLoadKey === 'all' ? 5000
        : Math.min(parseInt(kanbanLoadKey, 10) || 500, 5000);

      const [dashRes, projectList] = await Promise.all([
        api.get('/production/dashboard', { params: dashQ }).catch(() => ({ data: { kpis: {}, pipeline: [] } })),
        fetchWorkshopProjectPages(api, '/production/projects', {
          companyId: companyParam,
          workshopTypeId: filterWorkTypeId || undefined,
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
  }, [companyParam, kanbanLoadKey, filterWorkTypeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'production' } }).then((r) => setCompanies(r.data?.companies || r.data || [])).catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) setFilterCompany('');
  }, [isAdmin, filterCompany, companies]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SX, JSON.stringify({
        filterCompany, timePreset, customFrom, customTo, kanbanLoadKey,
        filterPersonId, filterPersonName, filterRegion, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, timePreset, customFrom, customTo, kanbanLoadKey, filterPersonId, filterPersonName,
    filterRegion, filterPhone, filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode,
  ]);

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
      return true;
    });
  }, [projects, dateFromTo, matchesProject, deferredPersonName, filterPhone]);

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
    if (!window.confirm(`Xóa ${count} dự án đã chọn khỏi Sản xuất? Hành động không thể hoàn tác.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/projects/${id}`)));
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

    return baseStages.map((stage) => ({
      ...stage,
      items: scopeProjects
        .filter((project) => project.sx_kanban_column_id === stage.id)
        .sort(sortSxItems),
    }));
  }, [pipeline, scopeProjects]);

  const filteredKanbanPipeline = useMemo(() => {
    const result = kanbanPipeline.map((stage) => ({
      ...stage,
      items: stage.items.filter((project) => {
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
    }));
    filteredKanbanPipelineRef.current = result;
    return result;
  }, [kanbanPipeline, searchQuery, priorityFilter, stageFilter]);

  const filteredProjectCount = useMemo(
    () => filteredKanbanPipeline.reduce((n, s) => n + s.items.length, 0),
    [filteredKanbanPipeline],
  );

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

  const totalValue = useMemo(
    () => scopeProjects.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0),
    [scopeProjects],
  );

  const scopeKpis = useMemo(() => {
    const list = scopeProjects;
    if (!list.length) {
      return {
        total: 0, producing: 0, completed: 0, overdue: 0, avg_progress: kpis?.avg_progress || 0,
        intake_pending: 0, delivering: 0, customer_care: 0,
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
    };
  }, [scopeProjects, kpis]);

  const handleMoveStage = useCallback(async (projectId, targetCol) => {
    const current = projects.find((p) => String(p.id) === String(projectId));
    const lockedInVc = ['shipping', 'installing', 'warranty', 'completed'].includes(String(current?.status || ''));
    if (lockedInVc) {
      alert('Deal đã bàn giao sang Vận chuyển nên không thể kéo về cột khác.');
      return;
    }

    const wid = targetCol?.workflow_stage_id;
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
      // Không auto-call API khi kéo thả vào cột bàn giao VC vì cần chọn công ty VC + đội + người nhận.
      openHandoverModal(projectId, current?.name || current?.code || projectId, targetCol?.id || '');
      return;
    }

    if (!wid) return;

    const optimisticStage = {
      id: wid,
      slug: targetCol.slug,
      name: targetCol.name,
      color: targetCol.color,
      icon: targetCol.icon,
    };

    setProjects((prev) => prev.map((p) => (p.id === projectId
      ? { ...p, current_stage: optimisticStage, sx_kanban_column_id: targetCol.id, sx_intake: false }
      : p)));

    try {
      await api.patch(`/production/projects/${projectId}/stage`, { stage_id: wid, company_id: companyParam || undefined });
      scheduleCrmBadgeRefresh(projectId);
    } catch (e) {
      console.error(e);
      load();
    }
  }, [load, projects]);

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
    + (String(searchQuery || '').trim() ? 1 : 0) + (priorityFilter ? 1 : 0) + (stageFilter ? 1 : 0)
    + (viewMode !== 'kanban' ? 1 : 0);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — same style as CRMDashboard */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 font-semibold">Sản xuất / Quản lý xưởng</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">🏭 Quản lý Sản xuất</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setShowNewProject(true)}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 text-sm"
          >
            <Plus className="h-4 w-4" /> + Thêm dự án SX
          </button>
          <Link to="/sx/pipeline-settings" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">
            Cài đặt pipeline
          </Link>
        </div>
      </div>

      {/* KPI — compact horizontal style, same as CRMDashboard */}
      {(() => {
        const overdueProd = scopeProjects.filter((p) => p.is_production_overdue).length;
        const soonProd = scopeProjects.filter((p) => {
          if (!p.production_deadline || p.is_production_overdue) return false;
          return new Date(p.production_deadline) < new Date(Date.now() + 3 * 86400000);
        }).length;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
              <span>
                Tổng giá trị ước tính (sau bộ lọc):{' '}
                <strong className="text-blue-800 tabular-nums">{formatVND(totalValue)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-1 md:gap-1.5">
              <KPICard icon={<Factory className="h-3.5 w-3.5" />} iconBgColor="bg-blue-100" iconColor="text-blue-600" label="Tổng dự án SX" value={scopeKpis.total} />
              <KPICard icon={<Zap className="h-3.5 w-3.5" />} iconBgColor="bg-teal-100" iconColor="text-teal-600" label="Đang sản xuất" value={scopeKpis.producing} />
              <KPICard icon={<CheckCircle2 className="h-3.5 w-3.5" />} iconBgColor="bg-green-100" iconColor="text-green-600" label="Hoàn thành" value={scopeKpis.completed} />
              <KPICard icon={<AlertTriangle className="h-3.5 w-3.5" />} iconBgColor="bg-red-100" iconColor="text-red-600" label="Quá hạn" value={scopeKpis.overdue} />
              <KPICard
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                iconBgColor={overdueProd > 0 ? 'bg-red-100' : 'bg-gray-100'}
                iconColor={overdueProd > 0 ? 'text-red-600' : 'text-gray-400'}
                label="Trễ giao xưởng"
                value={overdueProd > 0 ? <span className="text-red-600">{overdueProd}</span> : overdueProd}
              />
              <KPICard
                icon={<Calendar className="h-3.5 w-3.5" />}
                iconBgColor={soonProd > 0 ? 'bg-amber-100' : 'bg-gray-100'}
                iconColor={soonProd > 0 ? 'text-amber-600' : 'text-gray-400'}
                label="Sắp giao (3 ngày)"
                value={soonProd > 0 ? <span className="text-amber-600">{soonProd}</span> : soonProd}
              />
            </div>
          </div>
        );
      })()}

      {/* Bộ lọc gọn: khi đóng chỉ còn 1 hàng; mở rộng có tìm kiếm + mọi điều kiện */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvFilter((s) => !s)}
            className={`h-9 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 shrink-0 ${
              showAdvFilter || advFilterCount
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc và tìm kiếm
            {advFilterCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-600 text-white rounded-full min-w-[1.1rem] px-1 text-center">
                {advFilterCount}
              </span>
            )}
          </button>
          {hasActiveFilter && !showAdvFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="h-9 px-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" /> Xóa bộ lọc
            </button>
          )}
          <span className="text-[11px] text-gray-500 ml-auto">
            Tải: <strong>{projects.length}</strong> · Tiến độ TB <strong className="text-blue-700">{scopeKpis.avg_progress}%</strong>
            {' · '}<strong>{filteredProjectCount}</strong> thẻ sau lọc
          </span>
        </div>

        {showAdvFilter && (
          <div className="space-y-3 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm mã, tên dự án, khách hàng, SĐT, ghi chú..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

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
                  <div className="inline-flex items-center gap-1 h-8 px-2 bg-gray-50 border border-gray-200 rounded-lg" title="Cấu hình tại Cài đặt pipeline">
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

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200/80">
              <p className="text-[10px] font-semibold text-gray-500 w-full sm:w-auto sm:mr-1">Chế độ xem</p>
              {[
                { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
                { id: 'list', icon: List, label: 'Danh sách' },
                { id: 'planner', icon: Users, label: 'Planner' },
                { id: 'calendar', icon: Calendar, label: 'Lịch' },
                { id: 'comments', icon: MessageSquare, label: 'Bảng tin' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setViewMode(v.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <v.icon className="h-3.5 w-3.5" />
                  {v.label}
                </button>
              ))}
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="h-8 px-3 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-white cursor-pointer flex items-center gap-1.5 sm:ml-auto"
                >
                  <X className="h-3.5 w-3.5" /> Xóa bộ lọc
                </button>
              )}
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

      {viewMode === 'kanban' && (
        <KanbanView pipeline={filteredKanbanPipeline} onMoveStage={handleMoveStage} calculateDays={calculateDays}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectColumn={selectColumn}
          onHandoverVC={openHandoverModal} remeasureToken={showAdvFilter ? 'adv-on' : 'adv-off'} />
      )}

      {viewMode === 'list' && <ProductionListView pipeline={filteredKanbanPipeline} calculateDays={calculateDays} />}

      {viewMode === 'planner' && <ProductionPlannerView pipeline={filteredKanbanPipeline} />}

      {viewMode === 'calendar' && <ProductionCalendarView pipeline={filteredKanbanPipeline} />}

      {viewMode === 'comments' && (
        <ProductionCommentsView
          pipeline={filteredKanbanPipeline}
          commentsIndex={commentsIndex}
          onRefreshIndex={() => refreshProjectCommentsIndex()}
        />
      )}

      {showNewProject && (
        <NewProductionProjectModal
          onClose={() => { setShowNewProject(false); load(); }}
        />
      )}

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
    </div>
  );
}

// KPI Card — compact horizontal style, identical to CRMDashboard KPICard
function KPICard({ icon, iconBgColor, iconColor, label, value }) {
  return (
    <div className="min-w-0 flex items-center gap-1.5 p-2 md:gap-2 md:p-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0">
        <p className="text-[10px] md:text-[11px] text-gray-500 font-semibold uppercase tracking-wide truncate leading-none" title={label}>
          {label}
        </p>
        <p className="text-sm md:text-base font-bold text-gray-900 tabular-nums leading-tight break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

// ── KANBAN STAGE CARD (y hệt CRM KanbanStageCard) ──────────────────────────
function KanbanStageCard({ stage, items, onMoveStage, calculateDays, selectedIds, onToggleSelect, onSelectColumn, onHandoverVC }) {
  const [isOverColumn, setIsOverColumn] = useState(false);

  const stageColor = stage.color || '#e5e7eb';

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
      className={`flex flex-col flex-shrink-0 w-80 rounded-lg overflow-hidden transition-all duration-200 ${
        isOverColumn ? 'ring-2 ring-blue-500 ring-dashed' : ''
      }`}
    >
      {/* Colored top bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: stageColor }} />

      {/* Stage header */}
      <div className={`bg-white border border-gray-200 border-t-0 p-4 transition-all ${isOverColumn ? 'bg-blue-50' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg shrink-0">{stage.icon || '📌'}</span>
            <h3 className="font-semibold text-gray-900 truncate">{stage.name}</h3>
            {stage.is_handover_to_logistics && (
              <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-bold rounded border border-orange-200 shrink-0">→VC</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSelectColumn && items.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectColumn(stage.id); }}
                className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold rounded border border-blue-100 cursor-pointer"
                title="Chọn tất cả dự án trong cột này"
              >
                Chọn cột
              </button>
            )}
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">{items.length}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Giá trị: {formatVND(items.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0))}
        </p>
      </div>

      {/* Cards container */}
      <div
        className={`flex-1 bg-gray-50 border border-gray-200 border-t-0 p-3 space-y-3 transition-all ${isOverColumn ? 'bg-blue-50' : ''}`}
        style={{ minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} stage={stage} calculateDays={calculateDays}
              isSelected={selectedIds?.has(item.id)} onToggleSelect={onToggleSelect}
              onHandoverVC={onHandoverVC} />
          ))
        )}
      </div>
    </div>
  );
}

// ── KANBAN ITEM CARD (y hệt CRM KanbanCard) ─────────────────────────────────
function KanbanCard({ item, stage, calculateDays, isSelected, onToggleSelect, onHandoverVC }) {
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
  const stageEnteredAt = item.stage_entered_at || item.updated_at || item.created_at || null;
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
      className={`relative bg-white rounded-lg border p-3 pt-9 transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-lg ${
        lockedInVc ? 'cursor-default' : 'cursor-pointer'
      } ${
        isSelected ? 'ring-2 ring-blue-400 ring-offset-1 border-blue-200 bg-blue-50/30' : 'border-gray-200'
      }`}
      style={{ borderLeft: `3px solid ${stageColor}` }}
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
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </label>
      )}

      {/* Header: Code + Value — chừa chỗ checkbox góc phải (giống CRM) */}
      <div className="flex items-start justify-between pr-7 mb-2">
        <p className="text-xs font-semibold text-blue-600">{item.code}</p>
        {item.estimated_value > 0 && (
          <p className="text-sm font-bold text-emerald-600 text-right leading-tight max-w-[55%]">
            {formatVND(item.estimated_value)}
          </p>
        )}
      </div>

      {/* Title + "Mới" badge */}
      <div className="flex items-start gap-1.5 min-w-0 mb-2">
        <p className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{item.name}</p>
        {isNew && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-rose-500 px-1.5 py-0.5 rounded leading-tight">
            Mới
          </span>
        )}
      </div>
      {item.workshop_type?.name && (
        <p className="text-[10px] text-slate-600 mb-2">
          <span className="text-slate-500 font-medium">Loại:</span> {item.workshop_type.name}
        </p>
      )}

      {(companyName || crmRegionName) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {companyName && (
            <span className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700">
              🏢 {companyName}
            </span>
          )}
          {crmRegionName && (
            <span className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-800">
              📍 {crmRegionName}
            </span>
          )}
        </div>
      )}

      {/* Customer name + phone */}
      {(item.customer?.full_name || item.customer?.phone) && (
        <div className="space-y-0.5 mb-2">
          {item.customer?.full_name && (
            <p className="text-xs text-gray-600 truncate">👤 {item.customer.full_name}</p>
          )}
          {item.customer?.phone && (
            <p className="text-xs text-green-600 font-medium truncate">📞 {item.customer.phone}</p>
          )}
        </div>
      )}

      <div className="space-y-0.5 border-t border-gray-200/70 mt-2 pt-2 mb-2">
        <p className="font-bold text-gray-500 uppercase tracking-wide text-[9px]">Liên kế hoạch thực hiện</p>
        <p className="text-[11px] text-gray-600 leading-snug">
          <span className="text-gray-500">Tạo lead:</span>{' '}
          {leadCreatedAt ? (
            <>
              {formatDate(leadCreatedAt)}
              <span className="text-gray-400"> · {formatAgeDetailed(leadCreatedAt)}</span>
            </>
          ) : '—'}
        </p>
        <p className="text-[11px] text-gray-800 leading-snug">
          <span className="text-gray-500">Tại cột:</span>{' '}
          <span className="font-semibold text-gray-900">{stageEnteredAt ? formatAgeDetailed(stageEnteredAt) : '—'}</span>
        </p>
        {slaDeadlineTs != null && (
          <div className="mt-0.5">
            <span className={`inline-flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              slaOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
            }`}>
              <span>SLA cột</span>
              <span className="font-medium">
                Hạn: {new Date(slaDeadlineTs).toLocaleString('vi-VN')}
              </span>
              {slaRemainingMs != null && (
                <span className={slaOverdue ? 'text-red-700' : 'text-amber-800'}>
                  · {slaOverdue ? `Quá hạn ${formatRemainingMs(slaRemainingMs)}` : `Còn ${formatRemainingMs(slaRemainingMs)}`}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Assignee + time badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {assignee?.full_name ? (
            <div className="flex items-center gap-2 min-w-0">
              {assignee.avatar ? (
                <img src={assignee.avatar} alt="" className="h-6 w-6 rounded-full shrink-0" />
              ) : (
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: stageColor }}
                >
                  {getInitials(assignee.full_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 leading-tight">Phụ trách</p>
                <p className="text-xs text-gray-700 font-medium truncate">{assignee.full_name}</p>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-gray-400"><span className="text-gray-500">Phụ trách:</span> —</p>
          )}
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap shrink-0">
          {calculateDays(item.created_at)}
        </span>
      </div>

      {/* Ngày giao xưởng (production_deadline) */}
      {item.production_deadline && (
        <div className={`mt-2 text-[10px] px-2 py-1 rounded-lg font-medium ${
          item.is_production_overdue
            ? 'bg-red-100 text-red-600'
            : new Date(item.production_deadline) < new Date(Date.now() + 3 * 86400000)
            ? 'bg-amber-100 text-amber-600'
            : 'bg-sky-100 text-sky-600'
        }`}>
          🏭 Giao xưởng: {new Date(item.production_deadline).toLocaleDateString('vi-VN')}
          {item.is_production_overdue && ' ⚠️'}
        </div>
      )}

      {/* % hoàn thành theo cột pipeline SX (setup %) */}
      {item.sx_pipeline_percent !== null && item.sx_pipeline_percent !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">🏭 % hoàn thành (theo cột)</span>
            <span className="text-[10px] font-bold text-teal-700">{Number(item.sx_pipeline_percent) || 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 bg-teal-500"
              style={{ width: `${Math.max(0, Math.min(100, Number(item.sx_pipeline_percent) || 0))}%` }}
            />
          </div>
        </div>
      )}

      {/* Deadline — màu sắc như CRM */}
      {item.deadline && !item.production_deadline && (
        <div className={`mt-2 text-[10px] px-2 py-1 rounded-lg font-medium ${
          new Date(item.deadline) < new Date()
            ? 'bg-red-100 text-red-600'
            : new Date(item.deadline) < new Date(Date.now() + 3 * 86400000)
            ? 'bg-amber-100 text-amber-600'
            : 'bg-purple-100 text-purple-600'
        }`}>
          📅 Deadline: {new Date(item.deadline).toLocaleDateString('vi-VN')}
        </div>
      )}

      {/* Badge trạng thái VC — hiển thị khi đã bàn giao (giống CRM) */}
      {(item.status === 'shipping' || item.status === 'installing' || item.status === 'warranty') && (
        <div className="mt-2 flex flex-col gap-1">
          {item.vc_stage ? (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold"
              style={{
                background: `${item.vc_stage.color || '#f97316'}18`,
                borderColor: `${item.vc_stage.color || '#f97316'}40`,
                color: item.vc_stage.color || '#ea580c',
              }}
            >
              <span>{item.vc_stage.icon || '🚚'}</span>
              <span className="text-[10px] font-bold opacity-70">VC:</span>
              <span>{item.vc_stage.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold bg-orange-50 border-orange-200 text-orange-700">
              <Truck className="h-3 w-3" />
              <span className="text-[10px] font-bold opacity-70">VC:</span>
              <span>{item.status === 'shipping' ? 'Đang vận chuyển' : item.status === 'installing' ? 'Đang lắp đặt' : 'Bảo hành'}</span>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-2 right-2 z-[35] flex items-center gap-1">
        <button
          type="button"
          data-sx-quick-btn
          title={localPinned ? 'Bỏ ghim thẻ' : 'Ghim thẻ'}
          onClick={(e) => {
            e.stopPropagation();
            setLocalPinned((v) => !v);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 shadow-md transition-colors cursor-pointer ${
            localPinned
              ? 'border-amber-300 text-amber-600 hover:bg-amber-50'
              : 'border-gray-200/90 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50'
          }`}
        >
          <Pin className={`h-3.5 w-3.5 ${localPinned ? 'rotate-45 fill-amber-500' : ''}`} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          data-sx-quick-btn
          title={localInteracted ? 'Bỏ đánh dấu đã tương tác' : 'Đánh dấu đã tương tác'}
          onClick={(e) => {
            e.stopPropagation();
            setLocalInteracted((v) => !v);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 shadow-md transition-colors cursor-pointer ${
            localInteracted
              ? 'border-blue-300 text-blue-600 hover:bg-blue-50'
              : 'border-gray-200/90 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
          }`}
        >
          <CheckCircle2 className={`h-3.5 w-3.5 ${localInteracted ? 'fill-blue-500 text-white' : ''}`} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          data-sx-quick-btn
          title="Mở trao đổi"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/sx/projects/${item.id}?tab=chat`);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200/90 bg-white/95 text-slate-600 shadow-md transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
        >
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>

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
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold
            bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 hover:border-orange-400
            opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          title="Bàn giao sang module Vận chuyển & Lắp đặt"
        >
          {handingOver
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Truck className="h-3.5 w-3.5" />}
          {handingOver ? 'Đang bàn giao...' : 'Bàn giao VC'}
        </button>
      )}
    </div>
  );
}

// ── KANBAN VIEW CONTAINER (y hệt CRM KanbanView) ─────────────────────────────
function KanbanView({ pipeline, onMoveStage, calculateDays, selectedIds, onToggleSelect, onSelectColumn, onHandoverVC, remeasureToken }) {
  return (
    <WorkshopPipelineKanbanScroll
      cardSelector="[data-sx-kanban-card]"
      enableViewportScroll
      remeasureToken={remeasureToken}
    >
      <div className="flex min-w-max items-stretch gap-3">
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
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

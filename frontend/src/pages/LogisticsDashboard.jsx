import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket } from '../lib/socket';
import { formatVND, formatDate } from '../lib/utils';
import {
  getWorkshopDateRange, WS_TIME_PRESETS, WS_KANBAN_LOAD_OPTIONS,
  workshopCreatedInRange, fetchWorkshopProjectPages,
} from '../lib/workshopDashboardUtils';
import {
  Truck, CheckCircle2, AlertTriangle, Search, X, Calendar,
  Package, Users, LayoutGrid, List, Plus,
  CheckSquare, UserCheck, Loader2, Wrench, ShieldCheck,
  Filter, Clock, Building2, Layers,
} from 'lucide-react';
import { LogisticsListView, LogisticsPlannerView, LogisticsCalendarView } from '../components/LogisticsViews';
import NewLogisticsProjectModal from '../components/NewLogisticsProjectModal';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import {
  peekWorkshopPipelineCardFocus, clearWorkshopPipelineCardFocus, markWorkshopPipelineCardFocus,
} from '../lib/workshopPipelineStorage';

const INTAKE_BUCKET = 'delivery_pending';

const WS_DASH_VIEW_MODES = ['kanban', 'list', 'planner', 'calendar'];

const LS_VC = 'vc_dash_filters_v1';
function readVcDashPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(LS_VC) || 'null');
  } catch {
    return null;
  }
}

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

export default function LogisticsDashboard() {
  const P0 = useMemo(() => readVcDashPersisted(), []);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

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
  const [filterPersonId, setFilterPersonId] = useState(() => P0?.filterPersonId ?? '');
  const [filterPhone, setFilterPhone] = useState(() => P0?.filterPhone ?? '');
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterWorkTypeId, setFilterWorkTypeId] = useState(() => P0?.filterWorkTypeId ?? '');
  const [workTypes, setWorkTypes] = useState([]);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [allUsers, setAllUsers] = useState([]);
  const [showBulkDeadline, setShowBulkDeadline] = useState(false);
  const [showBulkPerson, setShowBulkPerson] = useState(false);
  const [bulkDeadlineVal, setBulkDeadlineVal] = useState('');
  const [bulkPersonId, setBulkPersonId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const navigate = useNavigate();
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
        api.get('/logistics/dashboard', { params: dashQ }).catch(() => ({ data: { kpis: {}, pipeline: [] } })),
        fetchWorkshopProjectPages(api, '/logistics/projects', {
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

  // Tự reload khi có project bàn giao sang VC qua socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data) => {
      // Reload nếu project chuyển sang trạng thái logistics
      const s = data?.status || data?.project?.status;
      if (s === 'shipping' || s === 'installing' || s === 'warranty' || s === 'completed') {
        load();
      }
    };
    socket.on('project:stage_changed', handler);
    return () => socket.off('project:stage_changed', handler);
  }, [load]);

  useEffect(() => {
    api.get('/users').then(r => setAllUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'logistics' } }).then((r) => setCompanies(r.data?.companies || r.data || [])).catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) setFilterCompany('');
  }, [isAdmin, filterCompany, companies]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_VC, JSON.stringify({
        filterCompany, timePreset, customFrom, customTo, kanbanLoadKey,
        filterPersonId, filterPhone, filterWorkTypeId,
        searchQuery, priorityFilter, stageFilter, viewMode,
      }));
    } catch { /* ignore */ }
  }, [
    filterCompany, timePreset, customFrom, customTo, kanbanLoadKey, filterPersonId, filterPhone,
    filterWorkTypeId, searchQuery, priorityFilter, stageFilter, viewMode,
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
      if (filterPersonId) {
        const id = p.logistics_person?.id ?? p.logistics_person_id;
        if (String(id) !== String(filterPersonId)) return false;
      }
      if (filterPhone === 'has' && !p.customer?.phone) return false;
      if (filterPhone === 'no' && p.customer?.phone) return false;
      return true;
    });
  }, [projects, dateFromTo, filterPersonId, filterPhone]);

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

  const totalValue = useMemo(
    () => scopeProjects.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0),
    [scopeProjects],
  );

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
    const baseStages = pipeline.length
      ? pipeline
      : [
          { id: 'vc_intake', name: 'Chờ vận chuyển', slug: 'delivery_pending', icon: '📦', color: '#f97316', bucket_slug: INTAKE_BUCKET },
          { id: 'vc_ship', name: 'Đang vận chuyển', slug: 'delivery', icon: '🚚', color: '#ea580c' },
          { id: 'vc_install', name: 'Đang lắp đặt', slug: 'installation', icon: '🔧', color: '#d97706' },
          { id: 'vc_warranty', name: 'Bảo hành', slug: 'customer-care', icon: '🤝', color: '#0f766e' },
        ];

    const stageIds = new Set(baseStages.map((s) => s.id));
    const orphans = scopeProjects.filter((p) => !p.vc_kanban_column_id || !stageIds.has(p.vc_kanban_column_id));
    const firstStageId = baseStages[0]?.id;

    return baseStages.map((stage) => ({
      ...stage,
      items: [
        ...scopeProjects.filter((p) => p.vc_kanban_column_id === stage.id),
        ...(stage.id === firstStageId ? orphans : []),
      ],
    }));
  }, [pipeline, scopeProjects]);

  const filteredKanbanPipeline = useMemo(() => {
    const result = kanbanPipeline.map((stage) => ({
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
  }, [kanbanPipeline, searchQuery, priorityFilter, stageFilter]);

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
      setProjects((prev) => prev.map((p) => (p.id === projectId
        ? { ...p, current_stage: null, vc_kanban_column_id: targetCol.id, vc_intake: true } : p)));
      try {
        await api.patch(`/logistics/projects/${projectId}/stage`, { move_to_intake: true });
      } catch (e) { console.error(e); load(); }
      return;
    }

    // Optimistic update: dùng workflow_stage nếu có, không thì dùng thông tin từ cột
    const wid = targetCol?.workflow_stage_id;
    const optimisticStage = wid
      ? { id: wid, slug: targetCol.slug || targetCol.bucket_slug, name: targetCol.name, color: targetCol.color, icon: targetCol.icon }
      : { id: targetCol.id, slug: targetCol.bucket_slug || targetCol.slug, name: targetCol.name, color: targetCol.color, icon: targetCol.icon };
    setProjects((prev) => prev.map((p) => (p.id === projectId
      ? { ...p, current_stage: optimisticStage, vc_kanban_column_id: targetCol.id, vc_intake: false } : p)));

    try {
      // Luôn gửi vc_stage_id (logistics_pipeline_stages.id); thêm stage_id nếu có workflow_stage_id
      const body = { vc_stage_id: targetCol.id };
      if (wid) body.stage_id = wid;
      await api.patch(`/logistics/projects/${projectId}/stage`, body);
    } catch (e) { console.error(e); load(); }
  }, [load]);

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
    (filterPersonId ? 1 : 0) + (filterPhone ? 1 : 0) + (hasTimeFilter ? 1 : 0) + (isAdmin && filterCompany ? 1 : 0)
    + (filterWorkTypeId ? 1 : 0)
    + (String(searchQuery || '').trim() ? 1 : 0) + (priorityFilter ? 1 : 0) + (stageFilter ? 1 : 0)
    + (viewMode !== 'kanban' ? 1 : 0);

  const hasActiveFilter = !!(
    searchQuery || priorityFilter || stageFilter || hasTimeFilter
    || filterPersonId || filterPhone || (isAdmin && filterCompany) || filterWorkTypeId
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilter('');
    setStageFilter('');
    setTimePreset('');
    setCustomFrom('');
    setCustomTo('');
    setFilterPersonId('');
    setFilterPhone('');
    setFilterWorkTypeId('');
    if (isAdmin) setFilterCompany('');
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 font-semibold">Vận chuyển & Lắp đặt</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">🚚 Quản lý Vận chuyển</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setShowNewProject(true)}
            className="h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 text-sm"
          >
            <Plus className="h-4 w-4" /> + Thêm dự án VC
          </button>
          <Link to="/vc/pipeline-settings" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">
            Cài đặt pipeline
          </Link>
        </div>
      </div>

      {/* KPI — thống kê theo bộ lọc thời gian / công ty / SĐT / người VC */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-500">
          Tổng giá trị ước tính (sau bộ lọc phạm vi):{' '}
          <strong className="text-orange-800 tabular-nums">{formatVND(totalValue)}</strong>
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1 md:gap-1.5">
          <KPICard icon={<Package className="h-3.5 w-3.5" />} iconBgColor="bg-orange-100" iconColor="text-orange-600" label="Tổng dự án VC" value={scopeKpis.total} />
          <KPICard icon={<Truck className="h-3.5 w-3.5" />} iconBgColor="bg-orange-100" iconColor="text-orange-600" label="Đang vận chuyển" value={scopeKpis.shipping} />
          <KPICard icon={<Wrench className="h-3.5 w-3.5" />} iconBgColor="bg-amber-100" iconColor="text-amber-600" label="Đang lắp đặt" value={scopeKpis.installing} />
          <KPICard icon={<ShieldCheck className="h-3.5 w-3.5" />} iconBgColor="bg-teal-100" iconColor="text-teal-600" label="Bảo hành" value={scopeKpis.warranty} />
          <KPICard icon={<CheckCircle2 className="h-3.5 w-3.5" />} iconBgColor="bg-green-100" iconColor="text-green-600" label="Hoàn thành" value={scopeKpis.completed} />
          <KPICard
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            iconBgColor={scopeKpis.overdue > 0 ? 'bg-red-100' : 'bg-gray-100'}
            iconColor={scopeKpis.overdue > 0 ? 'text-red-600' : 'text-gray-400'}
            label="Quá hạn"
            value={scopeKpis.overdue > 0 ? <span className="text-red-600">{scopeKpis.overdue}</span> : scopeKpis.overdue}
          />
        </div>
      </div>

      {/* Bộ lọc gọn: khi đóng chỉ còn 1 hàng */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvFilter((s) => !s)}
            className={`h-9 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 shrink-0 ${
              showAdvFilter || advFilterCount
                ? 'border-orange-300 bg-orange-50 text-orange-900'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc và tìm kiếm
            {advFilterCount > 0 && (
              <span className="text-[10px] font-bold bg-orange-600 text-white rounded-full min-w-[1.1rem] px-1 text-center">
                {advFilterCount}
              </span>
            )}
          </button>
          {isAdmin && (
            <div className="inline-flex items-center gap-1 h-9 px-2 border border-gray-200 rounded-lg bg-white shrink-0" title="Lọc dữ liệu dashboard theo công ty">
              <Building2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <select
                value={filterCompany}
                onChange={(e) => { setFilterCompany(e.target.value); setFilterWorkTypeId(''); }}
                className="h-7 text-sm bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[10rem] sm:max-w-[14rem]"
              >
                <option value="">Mọi công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name || c.id}</option>
                ))}
              </select>
            </div>
          )}
          {!isAdmin && user?.company_id && (
            <span className="text-[11px] text-gray-500 shrink-0 max-w-[10rem] truncate" title="Dữ liệu theo công ty tài khoản">
              Công ty tài khoản
            </span>
          )}
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
            Tải: <strong>{projects.length}</strong> · Tiến độ TB <strong className="text-orange-700">{scopeKpis.avg_progress}%</strong>
            {' · '}<strong>{filteredProjectCount}</strong> thẻ sau lọc
          </span>
        </div>

        {showAdvFilter && (
          <div className="space-y-3 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/80">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm mã, tên dự án, KH, SĐT, ghi chú..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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

            <div className="flex flex-wrap items-end gap-2">
              {companyForTypes && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Loại dự án</p>
                  <div className="inline-flex items-center gap-1 h-9 px-2 border border-gray-200 rounded-lg bg-white" title="Cài đặt pipeline">
                    <Layers className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <select
                      value={filterWorkTypeId}
                      onChange={(e) => setFilterWorkTypeId(e.target.value)}
                      className="h-7 text-sm bg-transparent border-0 focus:ring-0 cursor-pointer max-w-[11rem]"
                    >
                      <option value="">Mọi loại</option>
                      {workTypes.map((wt) => (
                        <option key={wt.id} value={wt.id}>{wt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="min-w-[140px]">
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Cột pipeline</p>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Tất cả cột</option>
                  {pipeline.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.icon || '•'} {stage.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Ưu tiên</p>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Tất cả</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div className="min-w-[160px]">
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Người phụ trách VC</p>
                <select
                  value={filterPersonId}
                  onChange={(e) => setFilterPersonId(e.target.value)}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">Mọi người</option>
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">SĐT khách</p>
                <select
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
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
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setViewMode(v.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === v.id ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
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
        <KanbanView pipeline={filteredKanbanPipeline} onMoveStage={handleMoveStage}
          calculateDays={calculateDays} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}
      {viewMode === 'list' && <LogisticsListView pipeline={filteredKanbanPipeline} calculateDays={calculateDays} />}
      {viewMode === 'planner' && <LogisticsPlannerView pipeline={filteredKanbanPipeline} />}
      {viewMode === 'calendar' && <LogisticsCalendarView pipeline={filteredKanbanPipeline} />}

      {showNewProject && <NewLogisticsProjectModal onClose={() => { setShowNewProject(false); load(); }} />}

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
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
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

// KPI Card
function KPICard({ icon, iconBgColor, iconColor, label, value }) {
  return (
    <div className="min-w-0 flex items-center gap-1.5 p-2 md:gap-2 md:p-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}>{icon}</div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0">
        <p className="text-[10px] md:text-[11px] text-gray-500 font-semibold uppercase tracking-wide truncate leading-none">{label}</p>
        <p className="text-sm md:text-base font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );
}

// Kanban Stage Column
function KanbanStageCard({ stage, items, onMoveStage, calculateDays, selectedIds, onToggleSelect }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const [columnMaxH, setColumnMaxH] = useState('70vh');

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

  const stageColor = stage.color || '#f97316';
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOverColumn(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setIsOverColumn(false); }}
      onDrop={(e) => { e.preventDefault(); setIsOverColumn(false); const pid = e.dataTransfer.getData('projectId'); if (pid) onMoveStage(pid, stage); }}
      className={`flex-shrink-0 w-80 rounded-lg overflow-hidden transition-all duration-200 ${isOverColumn ? 'ring-2 ring-orange-500 ring-dashed' : ''}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: stageColor }} />
      <div className={`bg-white border border-gray-200 border-t-0 p-4 transition-all ${isOverColumn ? 'bg-orange-50' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg shrink-0">{stage.icon || '📦'}</span>
            <h3 className="font-semibold text-gray-900 truncate">{stage.name}</h3>
          </div>
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">{items.length}</span>
        </div>
        <p className="text-xs text-gray-500">
          Giá trị: {formatVND(items.reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0))}
        </p>
      </div>
      <div
        ref={containerRef}
        className={`bg-gray-50 border border-gray-200 border-t-0 p-3 space-y-3 overflow-y-auto transition-all ${isOverColumn ? 'bg-orange-50' : ''}`}
        style={{ maxHeight: columnMaxH, minHeight: '200px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm">{isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo dự án vào đây'}</p>
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} stage={stage} calculateDays={calculateDays}
              isSelected={selectedIds?.has(item.id)} onToggleSelect={onToggleSelect} />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Card
function KanbanCard({ item, stage, calculateDays, isSelected, onToggleSelect }) {
  const navigate = useNavigate();
  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-workshop-bulk-checkbox]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('projectId', item.id);
  };
  const stageColor = stage.color || '#f97316';
  const doneTasks = item.done_tasks ?? 0;
  const totalTasks = item.task_total ?? 0;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : (item.progress || 0);
  const assignee = item.logistics_person || item.production_person || item.assignee;
  const getInitials = (name) => !name ? '?' : name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const isNew = item.created_at && (Date.now() - new Date(item.created_at).getTime()) < 86400000;

  return (
    <div
      data-vc-kanban-card={item.id}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        if (e.target.closest?.('[data-workshop-bulk-checkbox]')) return;
        markWorkshopPipelineCardFocus(item.id, 'vc');
        navigate(`/vc/projects/${item.id}`);
      }}
      className={`relative bg-white rounded-lg border p-3 pt-9 transition-all duration-200 cursor-pointer group hover:-translate-y-0.5 hover:shadow-lg ${
        isSelected ? 'ring-2 ring-orange-400 ring-offset-1 border-orange-200 bg-orange-50/30' : 'border-gray-200'
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
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
          />
        </label>
      )}

      <div className="flex items-start justify-between pr-7 mb-2">
        <p className="text-xs font-semibold text-orange-600">{item.code}</p>
        {item.estimated_value > 0 && (
          <p className="text-sm font-bold text-emerald-600 text-right leading-tight max-w-[55%]">{formatVND(item.estimated_value)}</p>
        )}
      </div>

      <div className="flex items-start gap-1.5 min-w-0 mb-2">
        <p className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{item.name}</p>
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

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {assignee?.full_name ? (
            <div className="flex items-center gap-2 min-w-0">
              {assignee.avatar ? (
                <img src={assignee.avatar} alt="" className="h-6 w-6 rounded-full shrink-0" />
              ) : (
                <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: stageColor }}>
                  {getInitials(assignee.full_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 leading-tight">Phụ trách VC</p>
                <p className="text-xs text-gray-700 font-medium truncate">{assignee.full_name}</p>
              </div>
            </div>
          ) : (
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

      {totalTasks > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">✅ Hoàn thành <span className="text-gray-500">{doneTasks}/{totalTasks} việc</span></span>
            <span className={`text-[10px] font-bold ${progressPercent >= 100 ? 'text-green-600' : progressPercent >= 50 ? 'text-orange-600' : 'text-amber-600'}`}>{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressPercent >= 100 ? 'bg-green-500' : progressPercent >= 50 ? 'bg-orange-500' : 'bg-amber-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Kanban View Container
function KanbanView({ pipeline, onMoveStage, calculateDays, selectedIds, onToggleSelect }) {
  return (
    <WorkshopPipelineKanbanScroll cardSelector="[data-vc-kanban-card]">
      <div className="flex gap-0 min-w-max">
        {pipeline.map((stage) => (
          <KanbanStageCard
            key={stage.id || stage.slug}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            calculateDays={calculateDays}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </WorkshopPipelineKanbanScroll>
  );
}

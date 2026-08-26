import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import { getCrmDateRangeFromPreset } from '../lib/crmDateRangePresets';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import ManagementFilterPanel from '../components/ManagementFilterPanel';
import {
  MODULE_TABS, MODULE_FOR_COMPANIES,
  TAB_QUICK_PRESETS, TAB_TABLE_COLUMNS,
  readStoredManagementFilters, storeManagementFilters,
  stageIdsParam, stageFilterValue, getListTitle, getColumnLabel, isInstallVcStage,
} from '../lib/managementDashboardUtils';
import {
  LayoutDashboard, Search, Filter, RefreshCw, Target, Factory, Truck, Wrench,
  CheckSquare, AlertTriangle, ChevronRight, X, Calendar, Users,
} from 'lucide-react';
import SupabaseMonitorButton from '../components/SupabaseMonitorButton';

function StageBadge({ stage, fallback = '—', className = '' }) {
  if (!stage) return <span className="text-xs text-gray-300">{fallback}</span>;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}
      style={{ backgroundColor: `${stage.color || '#94a3b8'}22`, color: stage.color || '#64748b' }}
    >
      {stage.name}
    </span>
  );
}

function PipelineStrip({ title, icon: Icon, color, stages, onStageClick, activeStageId }) {
  const max = Math.max(...(stages || []).map((s) => s.count || 0), 1);
  const total = (stages || []).reduce((sum, s) => sum + (s.count || 0), 0);
  if (!stages?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-900 flex items-center justify-between gap-2 mb-3">
        <span className="flex items-center gap-2">
          {Icon ? <Icon className={`h-4 w-4 ${color}`} /> : null}
          {title}
        </span>
        <span className="text-xs font-bold text-gray-500 tabular-nums">{total} tổng</span>
      </h3>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {stages.map((s) => {
          const active = activeStageId != null && String(activeStageId) === String(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStageClick?.(s)}
              className={`shrink-0 min-w-[72px] max-w-[120px] text-left rounded-lg p-1 transition-colors cursor-pointer ${
                active ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'
              }`}
            >
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(((s.count || 0) / max) * 100, s.count > 0 ? 12 : 0)}%`,
                    backgroundColor: s.color || '#3b82f6',
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-500 truncate" title={s.name}>
                {s.icon ? `${s.icon} ` : ''}{s.name}
              </p>
              <p className="text-xs font-bold text-gray-800">{s.count || 0}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiTile({ label, value, sub, color, bg, onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border p-4 text-left w-full transition-all ${bg} ${
        onClick ? 'cursor-pointer hover:brightness-[0.98] hover:shadow-sm' : ''
      } ${active ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </Tag>
  );
}

function UrgentBar({ urgent, alerts, onFilter }) {
  const items = useMemo(() => {
    const list = [];
    if (urgent?.crm_deal_overdue > 0) {
      list.push({ key: 'overdue_crm', label: `${urgent.crm_deal_overdue} deal CRM trễ`, tone: 'text-red-700 bg-red-50 border-red-100' });
    }
    if (urgent?.sx_intake > 0) {
      list.push({ key: 'sx_intake', label: `${urgent.sx_intake} chờ tiếp nhận SX`, tone: 'text-blue-700 bg-blue-50 border-blue-100' });
    }
    if (urgent?.sx_overdue > 0) {
      list.push({ key: 'sx_overdue', label: `${urgent.sx_overdue} dự án SX trễ`, tone: 'text-orange-700 bg-orange-50 border-orange-100' });
    }
    if (urgent?.vc_overdue > 0) {
      list.push({ key: 'vc_overdue', label: `${urgent.vc_overdue} dự án VC trễ`, tone: 'text-amber-700 bg-amber-50 border-amber-100' });
    }
    if (alerts?.pending_approvals > 0) {
      list.push({ key: 'approvals', label: `${alerts.pending_approvals} chờ duyệt`, tone: 'text-indigo-700 bg-indigo-50 border-indigo-100', link: '/approval-rules' });
    }
    return list;
  }, [urgent, alerts]);

  if (!items.length) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-emerald-800">
        <CheckSquare className="h-4 w-4 shrink-0" />
        Không có mục cần xử lý gấp
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-gray-900">Cần xử lý ngay</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          it.link ? (
            <Link
              key={it.key}
              to={it.link}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-semibold hover:opacity-90 ${it.tone}`}
            >
              {it.label}
            </Link>
          ) : (
            <button
              key={it.key}
              type="button"
              onClick={() => onFilter(it.key)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer hover:opacity-90 ${it.tone}`}
            >
              {it.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

export default function ManagementDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const userCompanyId = user?.company_id ? String(user.company_id) : '';
  const stored = readStoredManagementFilters();

  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const [moduleTab, setModuleTab] = useState(stored.moduleTab || 'overview');
  const [recordType, setRecordType] = useState(stored.recordType || 'all');
  const [companyId, setCompanyId] = useState(stored.companyId || '');
  const [assigneeId, setAssigneeId] = useState(stored.assigneeId || '');
  const [timePreset, setTimePreset] = useState(stored.timePreset || '');
  const [dateFrom, setDateFrom] = useState(stored.dateFrom || '');
  const [dateTo, setDateTo] = useState(stored.dateTo || '');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTab, setFilterTab] = useState('employee');
  const [filterPanelPos, setFilterPanelPos] = useState(null);
  const filterPanelDragRef = useRef(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [phase, setPhase] = useState('');
  const [focus, setFocus] = useState('');
  const [crmStageId, setCrmStageId] = useState('');
  const [crmStageIds, setCrmStageIds] = useState('');
  const [leadStageId, setLeadStageId] = useState('');
  const [leadStageIds, setLeadStageIds] = useState('');
  const [sxStageId, setSxStageId] = useState('');
  const [sxStageIds, setSxStageIds] = useState('');
  const [vcStageId, setVcStageId] = useState('');
  const [vcStageIds, setVcStageIds] = useState('');

  const reloadRef = useRef(null);

  const effectiveCompanyId = useMemo(() => {
    if (isCompanyScoped && userCompanyId) return userCompanyId;
    if (isAdmin && companyId) return companyId;
    if (!isAdmin && userCompanyId) return userCompanyId;
    return '';
  }, [isAdmin, isCompanyScoped, companyId, userCompanyId]);

  useEffect(() => {
    if (isCompanyScoped && userCompanyId) setCompanyId(userCompanyId);
  }, [isCompanyScoped, userCompanyId]);

  const dateRange = useMemo(() => {
    if (!timePreset) return { from: '', to: '' };
    if (timePreset === 'custom') {
      if (!dateFrom || !dateTo) return { from: '', to: '' };
      return { from: dateFrom, to: dateTo };
    }
    return getCrmDateRangeFromPreset(timePreset);
  }, [timePreset, dateFrom, dateTo]);

  useEffect(() => {
    storeManagementFilters({
      moduleTab, recordType, companyId, assigneeId, timePreset, dateFrom, dateTo,
    });
  }, [moduleTab, recordType, companyId, assigneeId, timePreset, dateFrom, dateTo]);

  useEffect(() => {
    const mod = MODULE_FOR_COMPANIES[moduleTab] || 'crm';
    api.get('/companies', { params: { for_module: mod } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [moduleTab, isAdmin, isCompanyScoped]);

  useEffect(() => {
    const params = {};
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    api.get('/users', { params })
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : r.data?.users || []))
      .catch(() => setUsers([]));
  }, [effectiveCompanyId]);

  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowDateRangePicker(true);
      return;
    }
    const range = getCrmDateRangeFromPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleModuleTabChange = (tabId) => {
    setModuleTab(tabId);
    setPhase(
      tabId === 'sx' ? 'sx'
        : tabId === 'vc' ? 'vc'
          : tabId === 'install' ? 'install'
            : '',
    );
    setFocus('');
    setCrmStageId('');
    setCrmStageIds('');
    setLeadStageId('');
    setLeadStageIds('');
    setSxStageId('');
    setSxStageIds('');
    setVcStageId('');
    setVcStageIds('');
    if (tabId === 'crm' || tabId === 'overview') setRecordType('all');
    else setRecordType('deal');
  };

  const companyDisplayName = useMemo(() => {
    if (!userCompanyId) return 'Công ty của bạn';
    const co = companies.find((c) => String(c.id) === String(userCompanyId));
    return co?.short_name || co?.name || 'Công ty của bạn';
  }, [companies, userCompanyId]);

  const loadRecordType = useMemo(() => {
    if (moduleTab === 'sx' || moduleTab === 'vc' || moduleTab === 'install') return 'deal';
    return recordType || 'all';
  }, [moduleTab, recordType]);

  const tableColumns = useMemo(
    () => TAB_TABLE_COLUMNS[moduleTab] || TAB_TABLE_COLUMNS.overview,
    [moduleTab],
  );

  const quickPresets = useMemo(
    () => TAB_QUICK_PRESETS[moduleTab] || TAB_QUICK_PRESETS.overview,
    [moduleTab],
  );

  const filterParams = useMemo(() => {
    const p = {};
    if (effectiveCompanyId) p.company_id = effectiveCompanyId;
    else if (companyId) p.company_id = companyId;
    if (assigneeId) p.assignee_id = assigneeId;
    if (searchQ) p.q = searchQ;
    if (phase) p.phase = phase;
    if (focus) p.focus = focus;
    if (dateRange.from) p.date_from = dateRange.from;
    if (dateRange.to) p.date_to = dateRange.to;
    p.record_type = loadRecordType;
    if (loadRecordType === 'lead') {
      if (leadStageIds) p.lead_stage_ids = leadStageIds;
      else if (leadStageId) p.lead_stage_id = leadStageId;
    } else if (loadRecordType === 'deal') {
      if (crmStageIds) p.crm_stage_ids = crmStageIds;
      else if (crmStageId) p.crm_stage_id = crmStageId;
    }
    if (sxStageIds) p.sx_stage_ids = sxStageIds;
    else if (sxStageId) p.sx_stage_id = sxStageId;
    if (vcStageIds) p.vc_stage_ids = vcStageIds;
    else if (vcStageId) p.vc_stage_id = vcStageId;
    p.module_tab = moduleTab;
    return p;
  }, [effectiveCompanyId, companyId, assigneeId, searchQ, phase, focus, dateRange, loadRecordType, moduleTab,
    crmStageId, crmStageIds, leadStageId, leadStageIds, sxStageId, sxStageIds, vcStageId, vcStageIds]);

  const loadOverview = useCallback(async () => {
    try {
      const params = {};
      if (effectiveCompanyId) params.company_id = effectiveCompanyId;
      else if (companyId) params.company_id = companyId;
      if (assigneeId) params.assignee_id = assigneeId;
      if (dateRange.from) params.date_from = dateRange.from;
      if (dateRange.to) params.date_to = dateRange.to;
      const [{ data }, alertsRes] = await Promise.all([
        api.get('/management/overview', { params }),
        api.get('/dashboard/alerts').catch(() => ({ data: null })),
      ]);
      setOverview(data);
      setAlerts(alertsRes.data);
      setLastSyncAt(new Date());
    } catch {
      setOverview(null);
    }
  }, [effectiveCompanyId, companyId, assigneeId, dateRange]);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const { data } = await api.get('/management/deals', {
        params: { ...filterParams, all: 1 },
      });
      setRecords(data.deals || []);
      setTotal(data.total ?? (data.deals || []).length);
    } catch {
      setRecords([]);
      setTotal(0);
    }
    setRecordsLoading(false);
  }, [filterParams]);

  const reloadAll = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    if (silent) setSyncing(true);
    else setLoading(true);
    await Promise.all([loadOverview(), loadRecords()]);
    if (silent) setSyncing(false);
    else setLoading(false);
  }, [loadOverview, loadRecords]);

  reloadRef.current = reloadAll;

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const socket = getSocket();
    let debounceTimer = null;
    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void reloadRef.current?.({ silent: true });
      }, 800);
    };
    const events = ['project:stage_changed', 'task:updated', 'crm:dashboard_changed', 'approval:updated'];
    if (socket) events.forEach((ev) => socket.on(ev, schedule));

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      schedule();
    }, 30_000);

    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') schedule();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (socket) events.forEach((ev) => socket.off(ev, schedule));
      clearInterval(intervalId);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const applySearch = () => setSearchQ(searchInput.trim());

  const clearStageFilters = () => {
    setPhase(
      moduleTab === 'sx' ? 'sx'
        : moduleTab === 'vc' ? 'vc'
          : moduleTab === 'install' ? 'install'
            : '',
    );
    setFocus('');
    setCrmStageId('');
    setCrmStageIds('');
    setLeadStageId('');
    setLeadStageIds('');
    setSxStageId('');
    setSxStageIds('');
    setVcStageId('');
    setVcStageIds('');
    setSearchQ('');
    setSearchInput('');
  };

  const resetFilters = () => {
    setAssigneeId('');
    setTimePreset('');
    setDateFrom('');
    setDateTo('');
    if (isAdmin && !isCompanyScoped) setCompanyId('');
    clearStageFilters();
  };

  const defaultFilters = () => {
    resetFilters();
    setModuleTab('overview');
    setRecordType('all');
  };

  const applyFocus = (key) => {
    setFocus((prev) => (prev === key ? '' : key));
    setCrmStageId('');
    setCrmStageIds('');
    setLeadStageId('');
    setLeadStageIds('');
    setSxStageId('');
    setSxStageIds('');
    setVcStageId('');
    setVcStageIds('');
  };

  const applyCrmStage = (s, kind = 'deal') => {
    const id = stageFilterValue(s);
    const ids = stageIdsParam(s);
    if (kind === 'lead') {
      setLeadStageId((prev) => (prev === id ? '' : id));
      setLeadStageIds((prev) => (prev === ids ? '' : ids));
      setRecordType('lead');
    } else {
      setCrmStageId((prev) => (prev === id ? '' : id));
      setCrmStageIds((prev) => (prev === ids ? '' : ids));
      setRecordType('deal');
    }
    setFocus('');
    setModuleTab('crm');
  };

  const applySxStage = (s) => {
    const id = String(s.id) === '__intake__' ? '__intake__' : stageFilterValue(s);
    const ids = String(s.id) === '__intake__' ? '' : stageIdsParam(s);
    setSxStageId((prev) => (prev === id ? '' : id));
    setSxStageIds((prev) => (prev === ids ? '' : ids));
    setFocus('');
    setPhase('sx');
    setModuleTab('sx');
    setCrmStageId('');
    setCrmStageIds('');
    setVcStageId('');
    setVcStageIds('');
  };

  const applyVcStage = (s) => {
    const id = stageFilterValue(s);
    const ids = stageIdsParam(s);
    setVcStageId((prev) => (prev === id ? '' : id));
    setVcStageIds((prev) => (prev === ids ? '' : ids));
    setFocus('');
    setPhase('vc');
    setModuleTab('vc');
    setCrmStageId('');
    setCrmStageIds('');
    setSxStageId('');
    setSxStageIds('');
  };

  const applyInstallStage = (s) => {
    const id = stageFilterValue(s);
    const ids = stageIdsParam(s);
    setVcStageId((prev) => (prev === id ? '' : id));
    setVcStageIds((prev) => (prev === ids ? '' : ids));
    setFocus('');
    setPhase('install');
    setModuleTab('install');
    setCrmStageId('');
    setCrmStageIds('');
    setSxStageId('');
    setSxStageIds('');
  };

  const filterActiveCounts = useMemo(() => ({
    employee: (companyId && isAdmin && !isCompanyScoped ? 1 : 0) + (assigneeId ? 1 : 0),
    time: timePreset ? 1 : 0,
  }), [companyId, isAdmin, isCompanyScoped, assigneeId, timePreset]);

  const beginFilterPanelDrag = (e) => {
    if (e.button !== 0) return;
    const originX = filterPanelPos?.x ?? (typeof window !== 'undefined' ? window.innerWidth - 360 : 0);
    const originY = filterPanelPos?.y ?? 72;
    filterPanelDragRef.current = { startX: e.clientX, startY: e.clientY, originX, originY };
    if (!filterPanelPos) setFilterPanelPos({ x: originX, y: originY });
    const onMove = (ev) => {
      const drag = filterPanelDragRef.current;
      if (!drag) return;
      setFilterPanelPos({
        x: Math.max(8, drag.originX + ev.clientX - drag.startX),
        y: Math.max(8, drag.originY + ev.clientY - drag.startY),
      });
    };
    const onUp = () => {
      filterPanelDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const applyKpiFilter = (key) => {
    clearStageFilters();
    if (key === 'sx') { setPhase('sx'); setModuleTab('sx'); }
    else if (key === 'vc') { setPhase('vc'); setModuleTab('vc'); }
    else if (key === 'install') { setPhase('install'); setModuleTab('install'); }
    else if (key === 'crm_leads') { setModuleTab('crm'); setRecordType('lead'); }
    else if (key === 'crm_deals') { setModuleTab('crm'); setRecordType('deal'); }
    else if (key === 'sx_intake') setFocus('sx_intake');
    else if (key === 'overdue_crm') setFocus('overdue_crm');
    else if (key === 'sx_overdue') setFocus('sx_overdue');
    else if (key === 'vc_overdue') setFocus('vc_overdue');
  };

  const kpis = overview?.kpis;
  const pipelines = overview?.pipelines;
  const hasActiveStageFilter = !!(phase || focus || crmStageId || leadStageId || sxStageId || vcStageId || searchQ);
  const visibleColumns = useMemo(
    () => tableColumns.filter((c) => c !== 'company' || isAdmin),
    [tableColumns, isAdmin],
  );
  const listTitle = getListTitle(moduleTab, loadRecordType);
  const colSpan = visibleColumns.length;

  const renderTableCell = (col, d) => {
    const isLead = d.type === 'lead';
    const crmStage = d.stage;
    const sxStage = d.project?.sx_stage;
    const vcStage = d.project?.vc_stage;
    const installStage = vcStage && isInstallVcStage(vcStage) ? vcStage : null;
    const shippingStage = vcStage && !isInstallVcStage(vcStage) ? vcStage : null;
    const crmOverdue = d.deadline && new Date(d.deadline) < new Date() && !crmStage?.is_won;
    const projectDeadline = d.project?.deadline || d.deadline;
    const projectOverdue = d.project_id && projectDeadline
      && new Date(projectDeadline) < new Date()
      && d.project?.status !== 'completed';

    switch (col) {
      case 'record':
        return (
          <td key={col} className="px-4 py-3 min-w-[200px]">
            <Link
              to={isLead ? `/crm/leads/${d.id}` : `/management/deals/${d.id}`}
              className="font-semibold text-gray-900 hover:text-blue-600"
            >
              {(moduleTab === 'overview' || moduleTab === 'crm') && (
                <span className={`inline-block text-[9px] font-bold uppercase px-1 py-0.5 rounded mr-1.5 ${
                  isLead ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {isLead ? 'Lead' : 'Deal'}
                </span>
              )}
              {d.code && <span className="text-blue-600 mr-1">{d.code}</span>}
              {d.title || d.project?.name || '—'}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">{d.customer?.full_name || '—'}</p>
            {d.project?.code && (
              <p className="text-[10px] text-gray-400 mt-0.5">DA: {d.project.code}</p>
            )}
          </td>
        );
      case 'company':
        return (
          <td key={col} className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
            {d.company?.short_name || d.company?.name || '—'}
          </td>
        );
      case 'assignee':
        return (
          <td key={col} className="px-4 py-3">
            {d.assignee ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: avatarColor(d.assignee.full_name) }}
                >
                  {getInitials(d.assignee.full_name)}
                </div>
                <span className="text-xs text-gray-700 truncate max-w-[100px]" title={d.assignee.full_name}>
                  {d.assignee.full_name}
                </span>
              </div>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </td>
        );
      case 'deadline':
        return (
          <td key={col} className="px-4 py-3 text-xs whitespace-nowrap">
            {projectDeadline ? (
              <span className={projectOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                <Calendar className="inline h-3 w-3 mr-0.5 -mt-px" />
                {formatDate(projectDeadline)}
              </span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        );
      case 'crm':
        return (
          <td key={col} className="px-4 py-3">
            <StageBadge stage={crmStage} />
            {crmOverdue && <AlertTriangle className="inline h-3.5 w-3.5 text-red-500 ml-1" />}
          </td>
        );
      case 'sx':
        return (
          <td key={col} className="px-4 py-3">
            {d.project_id ? (
              sxStage ? (
                <StageBadge stage={sxStage} className="bg-orange-100 text-orange-800" />
              ) : (
                <span className="text-xs text-blue-600 font-medium">Tiếp nhận</span>
              )
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
            {projectOverdue && moduleTab === 'sx' && (
              <AlertTriangle className="inline h-3.5 w-3.5 text-orange-500 ml-1" />
            )}
          </td>
        );
      case 'vc':
        return (
          <td key={col} className="px-4 py-3">
            <StageBadge stage={shippingStage} className="bg-amber-100 text-amber-800" />
          </td>
        );
      case 'install':
        return (
          <td key={col} className="px-4 py-3">
            <StageBadge stage={installStage} className="bg-teal-100 text-teal-800" />
            {projectOverdue && moduleTab === 'install' && (
              <AlertTriangle className="inline h-3.5 w-3.5 text-teal-600 ml-1" />
            )}
          </td>
        );
      case 'address':
        return (
          <td key={col} className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate" title={d.project?.install_address || ''}>
            {d.project?.install_address || '—'}
          </td>
        );
      case 'tasks':
        return (
          <td key={col} className="px-4 py-3 text-xs text-gray-600">
            <span title="Nhiệm vụ CRM">{d.task_stats?.crm_done}/{d.task_stats?.crm_total} NV</span>
            <span className="mx-1 text-gray-300">·</span>
            <span title="Tài liệu">{d.document_count} TL</span>
          </td>
        );
      case 'value':
        return (
          <td key={col} className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
            {d.value ? formatVND(d.value) : '—'}
          </td>
        );
      case 'link':
        return (
          <td key={col} className="px-4 py-3">
            <Link
              to={isLead ? `/crm/leads/${d.id}` : `/management/deals/${d.id}`}
              className="inline-flex items-center text-blue-600 hover:text-blue-800"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7 text-blue-600" />
            Tổng hợp Quản lý
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>CRM · Sản xuất · Vận chuyển · Lắp đặt — một màn hình</span>
            {lastSyncAt && (
              <span className="inline-flex items-center gap-1 text-xs">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncing ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
                {syncing
                  ? 'Đang đồng bộ…'
                  : `Cập nhật ${lastSyncAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium cursor-pointer ${
              showFilters || companyId || assigneeId || timePreset
                ? 'bg-violet-50 border-violet-300 text-violet-700'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            Bộ lọc
            {(companyId || assigneeId || timePreset) && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {(companyId ? 1 : 0) + (assigneeId ? 1 : 0) + (timePreset ? 1 : 0)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => void reloadAll()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          {isAdmin && <SupabaseMonitorButton />}
        </div>
      </div>

      {/* Tab khối + bộ lọc */}
      <div className="flex flex-wrap gap-2">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleModuleTabChange(tab.id)}
            className={`h-9 px-4 rounded-lg text-sm font-semibold cursor-pointer border transition-colors ${
              moduleTab === tab.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tìm kiếm nhanh */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="Tìm mã, tên deal/lead…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
            />
          </div>
        </div>
        <button type="button" onClick={applySearch}
          className="h-9 px-3 rounded-lg bg-gray-900 text-white text-sm font-medium cursor-pointer">
          Tìm
        </button>
        {hasActiveStageFilter && (
          <button type="button" onClick={clearStageFilters}
            className="h-9 px-2 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1 cursor-pointer">
            <X className="h-4 w-4" /> Xóa lọc cột
          </button>
        )}
      </div>

      {overview?.urgent && (
        <UrgentBar urgent={overview.urgent} alerts={alerts} onFilter={applyFocus} />
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {(moduleTab === 'overview' || moduleTab === 'crm') && (
            <>
              <KpiTile
                label="Lead CRM"
                value={kpis.crm_leads}
                sub="Tất cả lead trong pipeline"
                bg="bg-purple-50 border-purple-100"
                color="text-purple-700"
                onClick={() => applyKpiFilter('crm_leads')}
                active={moduleTab === 'crm' && recordType === 'lead'}
              />
              <KpiTile
                label="Deal CRM"
                value={kpis.crm_deals}
                sub={`${kpis.crm_won} thắng${kpis.crm_overdue ? ` · ${kpis.crm_overdue} trễ` : ''}`}
                bg="bg-emerald-50 border-emerald-100"
                color="text-emerald-700"
                onClick={() => applyKpiFilter('crm_deals')}
                active={moduleTab === 'crm' && recordType === 'deal'}
              />
              <KpiTile
                label="Pipeline"
                value={formatVND(kpis.pipeline_value || 0)}
                sub="Giá trị deal đang mở"
                bg="bg-slate-50 border-slate-200"
                color="text-slate-800"
              />
            </>
          )}
          {(moduleTab === 'overview' || moduleTab === 'sx') && (
            <>
              <KpiTile
                label="Đang SX"
                value={kpis.sx_active}
                sub={kpis.sx_overdue ? `${kpis.sx_overdue} trễ` : undefined}
                bg="bg-orange-50 border-orange-100"
                color="text-orange-700"
                onClick={() => applyKpiFilter('sx')}
                active={moduleTab === 'sx' && phase === 'sx'}
              />
              <KpiTile
                label="Chờ SX"
                value={kpis.sx_intake || 0}
                sub="Tiếp nhận xưởng"
                bg="bg-blue-50 border-blue-100"
                color="text-blue-700"
                onClick={() => applyKpiFilter('sx_intake')}
                active={focus === 'sx_intake'}
              />
            </>
          )}
          {(moduleTab === 'overview' || moduleTab === 'vc') && (
            <KpiTile
              label="Đang VC"
              value={kpis.vc_active}
              sub={kpis.vc_overdue ? `${kpis.vc_overdue} trễ` : undefined}
              bg="bg-amber-50 border-amber-100"
              color="text-amber-700"
              onClick={() => applyKpiFilter('vc')}
              active={moduleTab === 'vc' && phase === 'vc'}
            />
          )}
          {(moduleTab === 'overview' || moduleTab === 'install') && (
            <KpiTile
              label="Đang lắp đặt"
              value={kpis.install_active ?? 0}
              sub={kpis.install_overdue ? `${kpis.install_overdue} trễ` : undefined}
              bg="bg-teal-50 border-teal-100"
              color="text-teal-700"
              onClick={() => applyKpiFilter('install')}
              active={moduleTab === 'install' && phase === 'install'}
            />
          )}
          {moduleTab === 'overview' && (
            <>
              <KpiTile
                label="NV mở"
                value={kpis.open_tasks}
                bg="bg-indigo-50 border-indigo-100"
                color="text-indigo-700"
              />
              <KpiTile
                label="NV quá hạn"
                value={kpis.overdue_tasks}
                bg="bg-red-50 border-red-100"
                color="text-red-700"
                onClick={() => applyKpiFilter('overdue_tasks')}
              />
            </>
          )}
        </div>
      )}

      {pipelines && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(moduleTab === 'overview' || moduleTab === 'crm') && (
            <>
              <PipelineStrip
                title="Pipeline Lead CRM"
                icon={Users}
                color="text-purple-600"
                stages={pipelines.crm_lead}
                activeStageId={leadStageId}
                onStageClick={(s) => applyCrmStage(s, 'lead')}
              />
              <PipelineStrip
                title="Pipeline Deal CRM"
                icon={Target}
                color="text-emerald-600"
                stages={pipelines.crm_deal}
                activeStageId={crmStageId}
                onStageClick={(s) => applyCrmStage(s, 'deal')}
              />
            </>
          )}
          {(moduleTab === 'overview' || moduleTab === 'sx') && (
            <PipelineStrip
              title="Pipeline Sản xuất"
              icon={Factory}
              color="text-orange-600"
              stages={pipelines.sx}
              activeStageId={sxStageId}
              onStageClick={applySxStage}
            />
          )}
          {(moduleTab === 'overview' || moduleTab === 'vc') && (
            <PipelineStrip
              title="Pipeline Vận chuyển"
              icon={Truck}
              color="text-amber-600"
              stages={pipelines.vc}
              activeStageId={moduleTab === 'vc' ? vcStageId : null}
              onStageClick={applyVcStage}
            />
          )}
          {(moduleTab === 'overview' || moduleTab === 'install') && (
            <PipelineStrip
              title="Pipeline Lắp đặt"
              icon={Wrench}
              color="text-teal-600"
              stages={pipelines.install}
              activeStageId={moduleTab === 'install' ? vcStageId : null}
              onStageClick={applyInstallStage}
            />
          )}
        </div>
      )}

      {(moduleTab === 'crm' || moduleTab === 'overview') && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setRecordType('all'); setCrmStageId(''); setCrmStageIds(''); setLeadStageId(''); setLeadStageIds(''); }}
            className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer border ${
              loadRecordType === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-gray-200'
            }`}
          >
            Tất cả ({(kpis?.crm_leads ?? 0) + (kpis?.crm_deals ?? 0)})
          </button>
          <button
            type="button"
            onClick={() => { setRecordType('lead'); setCrmStageId(''); setCrmStageIds(''); }}
            className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer border ${
              loadRecordType === 'lead' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-200'
            }`}
          >
            Lead ({kpis?.crm_leads ?? 0})
          </button>
          <button
            type="button"
            onClick={() => { setRecordType('deal'); setLeadStageId(''); setLeadStageIds(''); }}
            className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer border ${
              loadRecordType === 'deal' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-200'
            }`}
          >
            Deal ({kpis?.crm_deals ?? 0})
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">
            {listTitle}
            <span className="ml-2 text-gray-400 font-normal">({total})</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {quickPresets.map((p) => (
              <button
                key={p.id || 'all'}
                type="button"
                onClick={() => {
                  if (!p.id) clearStageFilters();
                  else applyFocus(p.id);
                }}
                className={`h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  (p.id ? focus === p.id : !hasActiveStageFilter)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                {visibleColumns.map((col) => (
                  <th
                    key={col}
                    className={`px-4 py-2.5 font-semibold ${col === 'value' ? 'text-right' : ''}`}
                  >
                    {getColumnLabel(moduleTab, col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recordsLoading && (
                <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-gray-400">Đang tải…</td></tr>
              )}
              {!recordsLoading && records.length === 0 && (
                <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-gray-400">Không có bản ghi phù hợp bộ lọc</td></tr>
              )}
              {records.map((d) => (
                <tr key={d.id} className="hover:bg-blue-50/40 transition-colors">
                  {visibleColumns.map((col) => renderTableCell(col, d))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ManagementFilterPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        filterTab={filterTab}
        onFilterTabChange={setFilterTab}
        isAdmin={isAdmin}
        isCompanyScoped={isCompanyScoped}
        userCompanyId={userCompanyId}
        companyDisplayName={companyDisplayName}
        companies={companies}
        companyId={companyId}
        onCompanyChange={(v) => { setCompanyId(v); setAssigneeId(''); }}
        users={users}
        assigneeId={assigneeId}
        onAssigneeChange={setAssigneeId}
        timePreset={timePreset}
        onTimePresetChange={handleTimePresetChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onOpenDatePicker={() => setShowDateRangePicker(true)}
        onReset={resetFilters}
        onDefault={defaultFilters}
        panelPos={filterPanelPos}
        onDragStart={beginFilterPanelDrag}
        activeCounts={filterActiveCounts}
      />

      {showDateRangePicker && (
        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tùy chỉnh"
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }) => {
            setDateFrom(from || '');
            setDateTo(to || '');
            setTimePreset('custom');
          }}
          onClose={() => setShowDateRangePicker(false)}
        />
      )}
    </div>
  );
}

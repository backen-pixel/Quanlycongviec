import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Link, useParams, useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Loader2, Plus, Search, Layers, Settings, Settings2, Filter, LayoutGrid, List, Clock,
  BarChart3, ChevronDown, ChevronUp, Pin, Trash2, CheckSquare, MinusSquare,
  X, RotateCcw, Target, Zap, CheckCircle2, XCircle, AlertTriangle,
  Pencil, Building2, MapPin, MessageSquare,
} from 'lucide-react';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import KanbanCardQuickMove from '../components/KanbanCardQuickMove';
import KanbanCardOptionsMenu from '../components/KanbanCardOptionsMenu';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import AssignedTasksToolbarButton from '../components/AssignedTasksToolbarButton';
import AnchoredDropdownMenu from '../components/AnchoredDropdownMenu';
import ViewModeDropdownMenu from '../components/ViewModeDropdownMenu';
import SearchInlineFilterChips, { SearchClearButton } from '../components/SearchInlineFilterChips';
import {
  useKanbanColumnTheme,
  UI_KANBAN_FIXED_CLASS,
  KANBAN_BOARD_COLUMN_RAILS_CLASS,
  KANBAN_COLUMN_RAIL_CLASS,
  KANBAN_CARDS_BODY_CLASS,
  KANBAN_CARDS_BODY_EMPTY_PIN_CLASS,
  KANBAN_COLUMN_EMPTY_CLASS,
  KANBAN_COLUMN_EMPTY_PIN_CLASS,
  KANBAN_PIPELINE_CARD_CLASS,
  getKanbanPipelineCardBorderStyle,
  useKanbanEmptyPlaceholderStickyTop,
} from '../lib/kanbanColumnTheme';
import { decorateAppModuleRecords, decorateAppModuleRecord } from '../lib/appModuleRecordDisplay';
import {
  getCrmDeadlineUrgencyFromTs,
  getCrmDeadlineUrgencyBadgeClass,
} from '../lib/crmLeadDeadlineDisplay';
import { formatDate, formatVND as formatVndUtil } from '../lib/utils';

const TAB_ACTIVE_COLORS = [
  'bg-white text-blue-700 shadow-sm',
  'bg-white text-emerald-700 shadow-sm',
  'bg-white text-cyan-700 shadow-sm',
  'bg-white text-violet-700 shadow-sm',
  'bg-white text-amber-700 shadow-sm',
];

const ADD_BTN_COLORS = [
  'bg-blue-600 hover:bg-blue-700',
  'bg-emerald-600 hover:bg-emerald-700',
  'bg-cyan-600 hover:bg-cyan-700',
  'bg-violet-600 hover:bg-violet-700',
  'bg-amber-600 hover:bg-amber-700',
];

const VIEW_MODES = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'list', icon: List, label: 'Danh sách' },
  { id: 'deadline', icon: Clock, label: 'Deadline' },
];
const ALT_VIEW_MODES = VIEW_MODES.filter((v) => v.id !== 'kanban');

const CTRL_H = 'h-8';
const CTRL_ICON = 'h-7 w-7';
const CTRL_TXT = 'text-xs';
const TOOLBAR_BTN = `${CTRL_H} px-2 rounded-md ${CTRL_TXT} font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0`;

const LS_PIN_TAB = 'app_module_pinned_tab';
const LS_SCROLL = 'app_module_kanban_column_scroll';
const LS_KPI = 'app_module_kpi_open';

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatVND(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  try {
    const s = formatVndUtil(v);
    if (s) return s;
  } catch { /* fall through */ }
  return `${Math.round(v).toLocaleString('vi-VN')}đ`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function readPinnedTab(moduleKey) {
  try {
    const raw = localStorage.getItem(`${LS_PIN_TAB}:${moduleKey}`);
    return raw || null;
  } catch {
    return null;
  }
}

function writePinnedTab(moduleKey, tabKey) {
  try {
    if (!tabKey) localStorage.removeItem(`${LS_PIN_TAB}:${moduleKey}`);
    else localStorage.setItem(`${LS_PIN_TAB}:${moduleKey}`, tabKey);
  } catch { /* ignore */ }
}

function ModuleKpiStrip({ segments, title }) {
  const toneClass = {
    count: 'text-slate-700',
    processing: 'text-emerald-700',
    won: 'text-green-700',
    lost: 'text-red-700',
  };
  const toneBg = {
    count: 'bg-slate-100/80',
    processing: 'bg-emerald-50',
    won: 'bg-green-50',
    lost: 'bg-red-50',
  };
  if (!segments?.length) return null;
  return (
    <div
      className="flex-1 min-w-0 grid gap-px mx-1"
      style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
      title={title}
    >
      {segments.map((seg) => (
        <div
          key={seg.key}
          className={`flex flex-col items-center justify-center rounded px-1 py-0.5 min-w-0 ${toneBg[seg.tone] || toneBg.count}`}
        >
          <span className="text-[8px] font-medium text-slate-500 uppercase tracking-wide truncate max-w-full leading-none">
            {seg.label}
          </span>
          <span className={`text-[11px] font-bold tabular-nums truncate max-w-full leading-tight ${toneClass[seg.tone] || toneClass.count}`}>
            {seg.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ModuleKpiCard({ icon, iconBgColor, iconColor, label, value, sublabel }) {
  const isNumeric = typeof value === 'number';
  const displayValue = isNumeric ? value.toLocaleString('vi-VN') : value;
  return (
    <div className="group relative h-full min-w-0 flex flex-col items-center justify-center text-center rounded-lg border border-violet-200/80 bg-white shadow-sm outline-none transition-all duration-200 hover:shadow-md hover:border-violet-300/80 gap-1 px-2 py-2">
      <div className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}>{icon}</div>
      <div className="min-w-0 w-full flex flex-col items-center justify-center gap-0.5">
        <p className="text-violet-700/80 font-semibold uppercase tracking-wide leading-tight max-w-full truncate px-0.5 text-[9px]" title={label}>
          {label}
        </p>
        <p className="font-bold tabular-nums leading-snug max-w-full truncate px-0.5 text-sm" style={{ color: '#000000' }} title={String(displayValue)}>
          {displayValue}
        </p>
        {sublabel && (
          <p className="text-[8px] text-amber-700/90 leading-tight truncate max-w-full" title={sublabel}>{sublabel}</p>
        )}
      </div>
    </div>
  );
}

export default function AppModuleDashboard() {
  const { moduleKey } = useParams();
  const { mod, isAdmin: outletIsAdmin } = useOutletContext() || {};
  const isAdmin = !!outletIsAdmin;
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [stages, setStages] = useState([]);
  const [records, setRecords] = useState([]);
  const [stageTransfers, setStageTransfers] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newEstimatedValue, setNewEstimatedValue] = useState('');
  const [deadlineCtx, setDeadlineCtx] = useState(null);
  const [transferringId, setTransferringId] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStageId, setFilterStageId] = useState('');
  const [pinnedTabKey, setPinnedTabKey] = useState(() => readPinnedTab(moduleKey));
  const [columnScrollMode, setColumnScrollMode] = useState(() => {
    try { return localStorage.getItem(LS_SCROLL) || 'unified'; } catch { return 'unified'; }
  });
  const [kpiOpen, setKpiOpen] = useState(() => {
    try { return localStorage.getItem(LS_KPI) !== '0'; } catch { return true; }
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStageId, setBulkStageId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showOverduePopover, setShowOverduePopover] = useState(false);
  const kanbanHScrollRef = useRef(null);
  const viewModeTriggerRef = useRef(null);
  const settingsTriggerRef = useRef(null);
  const overdueTriggerRef = useRef(null);
  const searchBoxRef = useRef(null);
  const navigate = useNavigate();

  const tabById = useMemo(() => {
    const map = {};
    tabs.forEach((t) => { map[String(t.id)] = t; });
    return map;
  }, [tabs]);

  const activeTab = useMemo(
    () => tabs.find((t) => String(t.id) === String(activeTabId)) || null,
    [tabs, activeTabId],
  );

  const loadTabs = useCallback(async () => {
    const tRes = await api.get(`/app-modules/${moduleKey}/tabs`);
    const list = (tRes.data.tabs || []).filter((t) => t.is_active !== false);
    setTabs(list);
    const fromUrl = searchParams.get('tab');
    const pinned = readPinnedTab(moduleKey);
    let next = null;
    if (fromUrl) {
      next = list.find((t) => t.tab_key === fromUrl || String(t.id) === fromUrl) || null;
    }
    if (!next && pinned) {
      next = list.find((t) => t.tab_key === pinned || String(t.id) === pinned) || null;
    }
    if (!next) next = list[0] || null;
    setActiveTabId(next?.id || null);
    return next;
  }, [moduleKey, searchParams]);

  const loadBoard = useCallback(async (tabId) => {
    if (!tabId) {
      setStages([]);
      setRecords([]);
      setStageTransfers({});
      return;
    }
    const [sRes, rRes] = await Promise.all([
      api.get(`/app-modules/${moduleKey}/stages`, { params: { tab_id: tabId } }),
      api.get(`/app-modules/${moduleKey}/records`, { params: { tab_id: tabId } }),
    ]);
    const stageList = (sRes.data.stages || []).filter((s) => s.is_active !== false);
    setStages(stageList);
    setRecords(decorateAppModuleRecords(rRes.data.records || []));
    setSelectedIds([]);
    setLastSyncAt(new Date());

    const ids = stageList.map((s) => s.id).filter(Boolean);
    if (!ids.length) {
      setStageTransfers({});
      return;
    }
    try {
      const linksRes = await api.post('/app-modules/links/by-stages', {
        source_kind: 'custom',
        stage_ids: ids,
      });
      const map = {};
      (linksRes.data?.links || []).forEach((link) => {
        if (link.link_type !== 'transfer' || !link.target_module?.module_key) return;
        const sid = String(link.source_stage_id);
        if (!map[sid]) map[sid] = [];
        map[sid].push({
          id: link.target_module.id,
          module_key: link.target_module.module_key,
          name: link.target_module.name,
          icon: link.target_module.icon,
        });
      });
      setStageTransfers(map);
    } catch {
      setStageTransfers({});
    }
  }, [moduleKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const tab = await loadTabs();
      await loadBoard(tab?.id);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [loadTabs, loadBoard]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPinnedTabKey(readPinnedTab(moduleKey)); }, [moduleKey]);

  const selectTab = async (tab) => {
    setActiveTabId(tab.id);
    setSearchParams(tab.tab_key && tab.tab_key !== 'main' ? { tab: tab.tab_key } : {});
    setLoading(true);
    try {
      await loadBoard(tab.id);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  const togglePinTab = () => {
    if (!activeTab) return;
    const key = activeTab.tab_key || String(activeTab.id);
    if (pinnedTabKey === key) {
      writePinnedTab(moduleKey, null);
      setPinnedTabKey(null);
    } else {
      writePinnedTab(moduleKey, key);
      setPinnedTabKey(key);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterStatus && String(r.status || '') !== filterStatus) return false;
      if (filterStageId && String(r.stage_id || '') !== String(filterStageId)) return false;
      if (!q) return true;
      const name = String(r.name || r.title || '').toLowerCase();
      const code = String(r.code || r.id || '').toLowerCase();
      const assignee = String(r.assignee?.full_name || '').toLowerCase();
      const customer = String(r.customer?.full_name || r.meta?.customer_name || '').toLowerCase();
      const phone = String(r.customer?.phone || r.meta?.customer_phone || '').toLowerCase();
      return name.includes(q) || code.includes(q) || assignee.includes(q) || customer.includes(q) || phone.includes(q);
    });
  }, [records, q, filterStatus, filterStageId]);

  const byStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.id] = []; });
    const unstaged = [];
    filteredRecords.forEach((r) => {
      if (r.stage_id && map[r.stage_id]) map[r.stage_id].push(r);
      else unstaged.push(r);
    });
    return { map, unstaged };
  }, [stages, filteredRecords]);

  const kpiSegments = useMemo(() => {
    const total = filteredRecords.length;
    const doneIds = new Set(stages.filter((s) => s.is_done).map((s) => String(s.id)));
    const lostIds = new Set(stages.filter((s) => s.is_lost).map((s) => String(s.id)));
    let done = 0;
    let lost = 0;
    let processing = 0;
    let valueSum = 0;
    filteredRecords.forEach((r) => {
      const sid = String(r.stage_id || '');
      if (doneIds.has(sid)) done += 1;
      else if (lostIds.has(sid)) lost += 1;
      else processing += 1;
      valueSum += Number(r.estimated_value) || Number(r.meta?.estimated_value) || 0;
    });
    return [
      { key: 'total', label: 'Tổng', value: total, tone: 'count' },
      { key: 'proc', label: 'Đang XL', value: processing, tone: 'processing' },
      { key: 'done', label: 'Hoàn thành', value: done, tone: 'won' },
      { key: 'lost', label: 'Hủy', value: lost, tone: 'lost' },
      { key: 'value', label: 'Giá trị', value: formatVND(valueSum) || '0đ', tone: 'count', rawValue: valueSum },
    ];
  }, [filteredRecords, stages]);

  const overdueItems = useMemo(() => {
    const now = Date.now();
    return filteredRecords
      .map((r) => {
        const ts = r.kanban_deadline_at || r.meta?.kanban_deadline_at || r.deadline_at;
        if (!ts) return null;
        const t = new Date(ts).getTime();
        if (!Number.isFinite(t) || t >= now) return null;
        const stage = stages.find((s) => String(s.id) === String(r.stage_id));
        return {
          id: r.id,
          code: r.code || String(r.id).slice(0, 8),
          title: r.name || r.title || '',
          customerName: r.customer?.full_name || r.meta?.customer_name || '',
          assigneeName: r.assignee?.full_name || '',
          stageName: stage?.name || '—',
          overdueMs: now - t,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.overdueMs - a.overdueMs);
  }, [filteredRecords, stages]);

  const inlineFilterChips = useMemo(() => {
    const chips = [];
    if (filterStatus) {
      const labels = { open: 'Đang mở', done: 'Hoàn thành', cancelled: 'Đã hủy' };
      chips.push({
        key: 'status',
        label: labels[filterStatus] || filterStatus,
        onClear: () => setFilterStatus(''),
      });
    }
    if (filterStageId) {
      const stage = stages.find((s) => String(s.id) === String(filterStageId));
      chips.push({
        key: 'stage',
        label: stage?.name || 'Cột',
        onClear: () => setFilterStageId(''),
      });
    }
    return chips;
  }, [filterStatus, filterStageId, stages]);

  const activeFilterCount = inlineFilterChips.length;
  const activeTabIndex = Math.max(0, tabs.findIndex((t) => String(t.id) === String(activeTabId)));
  const addBtnClass = ADD_BTN_COLORS[activeTabIndex % ADD_BTN_COLORS.length];

  const focusOverdueItem = (it) => {
    setShowOverduePopover(false);
    navigate(`/m/${moduleKey}/records/${it.id}`);
  };

  const moveRecord = async (recordId, stageId) => {
    try {
      await api.put(`/app-modules/${moduleKey}/records/${recordId}`, { stage_id: stageId });
      await loadBoard(activeTabId);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const saveRecordMeta = async (record, patchMeta) => {
    try {
      const meta = { ...(record.meta || {}), ...patchMeta };
      if (patchMeta.deadline !== undefined && patchMeta.kanban_deadline_at === undefined) {
        meta.kanban_deadline_at = patchMeta.deadline;
      }
      if (patchMeta.kanban_deadline_at !== undefined && patchMeta.deadline === undefined) {
        meta.deadline = patchMeta.kanban_deadline_at;
      }
      const { data } = await api.put(`/app-modules/${moduleKey}/records/${record.id}`, { meta });
      const next = decorateAppModuleRecord(data?.record || { ...record, meta });
      setRecords((prev) => prev.map((r) => (r.id === record.id ? next : r)));
      return next;
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
      throw e;
    }
  };

  const openRecordDeadline = (record) => {
    setDeadlineCtx({ record });
  };

  const saveRecordDeadline = async ({ deadlineIso, reason }) => {
    if (!deadlineCtx?.record) return;
    await saveRecordMeta(deadlineCtx.record, {
      kanban_deadline_at: deadlineIso || null,
      deadline: deadlineIso || null,
      kanban_deadline_reason: reason || null,
    });
    setDeadlineCtx(null);
  };

  const deleteRecord = async (recordId) => {
    if (!confirm('Xóa bản ghi này?')) return;
    try {
      await api.delete(`/app-modules/${moduleKey}/records/${recordId}`);
      await loadBoard(activeTabId);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
  };

  const transferRecord = async (e, recordId, targetModuleId, targetName) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!confirm(`Chuyển bản ghi sang «${targetName}»?`)) return;
    setTransferringId(recordId);
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/records/${recordId}/transfer`, {
        target_module_id: targetModuleId,
      });
      setMessage(data?.created === false
        ? `Đã có bản ghi tương ứng trong «${targetName}».`
        : `Đã chuyển sang «${targetName}».`);
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
    setTransferringId(null);
  };

  const moveToTab = async (e, recordId, targetTab) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!confirm(`Chuyển sang tab «${targetTab.name}»?`)) return;
    setTransferringId(recordId);
    try {
      await api.post(`/app-modules/${moduleKey}/records/${recordId}/move-tab`, {
        target_tab_id: targetTab.id,
      });
      setMessage(`Đã chuyển sang tab «${targetTab.name}».`);
      await loadBoard(activeTabId);
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
    setTransferringId(null);
  };

  const createRecord = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !activeTabId) return;
    setCreating(true);
    try {
      const valueNum = Number(String(newEstimatedValue || '').replace(/[^\d.]/g, ''));
      await api.post(`/app-modules/${moduleKey}/records`, {
        name: newName.trim(),
        tab_id: activeTabId,
        customer_name: newCustomerName.trim() || undefined,
        customer_phone: newCustomerPhone.trim() || undefined,
        estimated_value: Number.isFinite(valueNum) && valueNum > 0 ? valueNum : undefined,
      });
      setNewName('');
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewEstimatedValue('');
      setShowCreate(false);
      await loadBoard(activeTabId);
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
    setCreating(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (
      prev.some((x) => String(x) === String(id))
        ? prev.filter((x) => String(x) !== String(id))
        : [...prev, id]
    ));
  };

  const toggleSelectColumn = (ids) => {
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.some((x) => String(x) === String(id)));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.some((x) => String(x) === String(id))));
    } else {
      setSelectedIds((prev) => {
        const next = [...prev];
        ids.forEach((id) => {
          if (!next.some((x) => String(x) === String(id))) next.push(id);
        });
        return next;
      });
    }
  };

  const runBulkMove = async () => {
    if (!bulkStageId || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => (
        api.put(`/app-modules/${moduleKey}/records/${id}`, { stage_id: bulkStageId })
      )));
      setSelectedIds([]);
      setBulkStageId('');
      await loadBoard(activeTabId);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setBulkBusy(false);
  };

  const runBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Xóa ${selectedIds.length} bản ghi đã chọn?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/app-modules/${moduleKey}/records/${id}`)));
      setSelectedIds([]);
      await loadBoard(activeTabId);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setBulkBusy(false);
  };

  const isDragCardTarget = useCallback((e) => !!e.target?.closest?.('[data-app-module-card]'), []);

  const setScrollMode = (mode) => {
    setColumnScrollMode(mode);
    try { localStorage.setItem(LS_SCROLL, mode); } catch { /* ignore */ }
  };

  const toggleKpi = () => {
    setKpiOpen((v) => {
      const next = !v;
      try { localStorage.setItem(LS_KPI, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const resetFilters = () => {
    setFilterStatus('');
    setFilterStageId('');
    setSearch('');
  };

  const isPinnedActive = activeTab && pinnedTabKey === (activeTab.tab_key || String(activeTab.id));

  if (loading && !stages.length && !tabs.length) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  return (
    <div className={`min-h-screen space-y-2 ${UI_KANBAN_FIXED_CLASS}`}>
      {message && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{message}</span>
          <button type="button" className="text-amber-700 text-xs font-semibold shrink-0" onClick={() => setMessage('')}>Đóng</button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-amber-800">Đã chọn {selectedIds.length}</span>
          <select
            value={bulkStageId}
            onChange={(e) => setBulkStageId(e.target.value)}
            className="h-8 rounded-md border border-amber-200 bg-white text-xs px-2"
          >
            <option value="">Chuyển cột…</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            type="button"
            disabled={!bulkStageId || bulkBusy}
            onClick={runBulkMove}
            className="h-8 px-2.5 rounded-md bg-amber-600 text-white text-[11px] font-semibold disabled:opacity-50"
          >
            Chuyển
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={runBulkDelete}
            className="h-8 px-2.5 rounded-md border border-red-200 bg-white text-red-700 text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa
          </button>
          <button type="button" onClick={() => setSelectedIds([])} className="h-8 px-2 text-[11px] text-amber-800 font-semibold ml-auto">
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Panel điều khiển — bố cục giống CRM Dashboard */}
      <div className="ui-solid-white rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200/60">
          {/* Hàng 1 — tab pipeline & Thêm */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap px-2.5 py-1 sm:px-3 bg-slate-50/50">
            <div className="flex items-center gap-1 min-w-0">
              {tabs.length > 0 && (
                <div data-tour="pipeline-tabs" className="inline-flex gap-px p-0.5 bg-slate-200/60 border border-slate-300/50 rounded-lg shrink-0 max-w-full overflow-x-auto">
                  {tabs.map((t, idx) => {
                    const active = String(activeTabId) === String(t.id);
                    const key = t.tab_key || String(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTab(t)}
                        className={`rounded-md font-semibold transition-colors flex items-center gap-1 px-2 py-1 text-[11px] whitespace-nowrap ${
                          active ? TAB_ACTIVE_COLORS[idx % TAB_ACTIVE_COLORS.length] : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                        }`}
                      >
                        {t.name}
                        {active && <span className="tabular-nums opacity-80">{records.length.toLocaleString('vi-VN')}</span>}
                        {pinnedTabKey === key && (
                          <Pin className={`h-3 w-3 rotate-45 ${active ? 'text-amber-500 fill-amber-400' : 'text-amber-600 fill-amber-500'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={togglePinTab}
                title={isPinnedActive ? 'Bỏ ghim tab' : 'Ghim tab — mở module sẽ vào thẳng'}
                aria-label={isPinnedActive ? 'Bỏ ghim tab' : 'Ghim tab'}
                className={`${CTRL_ICON} shrink-0 rounded-md font-medium transition-colors cursor-pointer flex items-center justify-center border ${
                  isPinnedActive
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300 hover:text-amber-600'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${isPinnedActive ? 'rotate-45 fill-amber-500' : ''}`} />
              </button>
              {overdueItems.length > 0 && (
                <div className="relative shrink-0">
                  <button
                    ref={overdueTriggerRef}
                    type="button"
                    onClick={() => setShowOverduePopover((v) => !v)}
                    aria-label={`${overdueItems.length} bản ghi quá hạn`}
                    aria-expanded={showOverduePopover}
                    title={`${overdueItems.length} bản ghi quá hạn — bấm để xem danh sách`}
                    className={`relative ${CTRL_ICON} rounded-md flex items-center justify-center cursor-pointer border transition-colors ${
                      showOverduePopover
                        ? 'bg-red-600 border-red-700 text-white'
                        : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    }`}
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
                    className="rounded-xl border-red-200 w-[min(calc(100vw-2rem),340px)] overflow-hidden p-0 shadow-xl shadow-red-500/20"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-red-800">{overdueItems.length} bản ghi quá hạn</p>
                        <p className="text-[10px] text-red-600/80">Deadline cột · bấm mã để mở</p>
                      </div>
                      <button type="button" onClick={() => setShowOverduePopover(false)} className="p-1 rounded-lg text-red-500 hover:bg-red-100 cursor-pointer" aria-label="Đóng">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="p-2 flex flex-wrap gap-1 max-h-[min(50vh,280px)] overflow-y-auto [scrollbar-width:thin] bg-white">
                      {overdueItems.slice(0, 50).map((it) => {
                        const days = Math.floor(it.overdueMs / 86400000);
                        const hours = Math.floor((it.overdueMs % 86400000) / 3600000);
                        const overdueLabel = days > 0 ? `${days}d` : `${hours}h`;
                        return (
                          <button
                            key={it.id}
                            type="button"
                            title={[it.title, it.customerName, it.assigneeName, it.stageName].filter(Boolean).join('\n')}
                            onClick={() => focusOverdueItem(it)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-md text-[10px] font-mono font-semibold text-red-700 hover:bg-red-100 hover:border-red-300 transition cursor-pointer"
                          >
                            <span>{it.code}</span>
                            <span className="font-sans font-normal text-red-500">{overdueLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AnchoredDropdownMenu>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
                  <Loader2 className="h-3 w-3 animate-spin text-violet-600" />
                  Đang tải…
                </span>
              ) : lastSyncAt ? (
                <span className="inline-flex items-center gap-1 text-slate-500 shrink-0 text-[10px]" title="Đồng bộ lần gần nhất">
                  <span className="inline-block rounded-full bg-emerald-500 h-1.5 w-1.5" />
                  <span className="whitespace-nowrap hidden lg:inline">
                    {`Cập nhật ${lastSyncAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('/admin/trash')}
                className={`${CTRL_ICON} shrink-0 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-md flex items-center justify-center cursor-pointer transition-colors`}
                title="Thùng rác"
                aria-label="Thùng rác"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className={`${CTRL_H} shrink-0 px-2.5 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors text-white shadow-sm ${addBtnClass}`}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className={CTRL_TXT}>Thêm {activeTab?.name || 'bản ghi'}</span>
              </button>
            </div>
          </div>

          {/* Hàng 2 — tìm kiếm & công cụ */}
          <div className="flex flex-wrap items-center gap-1 px-2.5 py-1 sm:px-3 border-t border-slate-200/50">
            <div
              ref={searchBoxRef}
              className={`group/search flex items-center shrink-0 flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${
                searchFocused
                  ? 'border-violet-400 bg-white ring-1 ring-violet-200/60'
                  : search.trim()
                    ? 'border-violet-300 bg-violet-50/80'
                    : inlineFilterChips.length && !showFilters
                      ? 'border-violet-200 bg-violet-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-7 pr-1">
                <Search
                  className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    searchFocused || search.trim() ? 'text-violet-600' : 'text-slate-400'
                  }`}
                />
                {!showFilters && inlineFilterChips.length > 0 && (
                  <SearchInlineFilterChips
                    chips={inlineFilterChips}
                    opacityClass={
                      searchFocused ? 'opacity-40' : search.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'
                    }
                    onClearChip={(chip) => { chip.onClear(); }}
                    onClearAll={resetFilters}
                    showClearAll={inlineFilterChips.length > 1}
                  />
                )}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  placeholder={`Tìm ${activeTab?.name || 'bản ghi'}, tên, SĐT, mã…`}
                  className={`flex-1 min-w-[3.5rem] ${CTRL_H} bg-transparent border-0 ${CTRL_TXT} font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${search ? 'pr-7' : ''}`}
                />
                {search && (
                  <SearchClearButton onClick={() => { setSearch(''); setSearchFocused(false); }} />
                )}
              </div>
              <div className="shrink-0 pr-1">
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  className={`relative h-6 w-6 flex items-center justify-center rounded border transition-colors cursor-pointer ${
                    showFilters || activeFilterCount
                      ? 'bg-violet-100 text-violet-700 border-violet-300'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  title={showFilters ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                  aria-label="Bộ lọc"
                >
                  <Filter className="h-3 w-3" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-violet-600 ring-1 ring-white" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80">
              <div className="inline-flex items-center gap-px p-0.5 rounded-md bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`${TOOLBAR_BTN} ${
                    viewMode === 'kanban' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Kanban</span>
                </button>
                <div className="relative">
                  <button
                    ref={viewModeTriggerRef}
                    type="button"
                    onClick={() => setShowViewMenu((v) => !v)}
                    className={`${TOOLBAR_BTN} ${
                      viewMode !== 'kanban' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Chế độ xem khác"
                    aria-expanded={showViewMenu}
                  >
                    {(() => {
                      const active = ALT_VIEW_MODES.find((v) => v.id === viewMode);
                      const Icon = active?.icon || List;
                      return (
                        <>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden md:inline max-w-[5rem] truncate">{active?.label || 'Thêm'}</span>
                          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showViewMenu ? 'rotate-180' : ''}`} />
                        </>
                      );
                    })()}
                  </button>
                  <ViewModeDropdownMenu
                    open={showViewMenu}
                    onClose={() => setShowViewMenu(false)}
                    anchorRef={viewModeTriggerRef}
                    modes={ALT_VIEW_MODES}
                    activeId={viewMode}
                    theme="violet"
                    onSelect={(id) => {
                      setViewMode(id);
                      setShowViewMenu(false);
                    }}
                  />
                </div>
              </div>

              <AssignedTasksToolbarButton compact variant="outlined" className="!rounded-md !px-2" />

              {isAdmin && (
                <Link
                  to={`/ecosystem/app-modules/${moduleKey}`}
                  className={`${TOOLBAR_BTN} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
                  title="Cấu hình pipeline & bộ nhiệm vụ"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Cấu hình</span>
                </Link>
              )}

              <div className="relative">
                <button
                  ref={settingsTriggerRef}
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className={`${TOOLBAR_BTN} border ${
                    showSettings || columnScrollMode === 'per-column'
                      ? 'bg-white text-violet-700 border-violet-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Tùy chỉnh hiển thị"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Tùy chỉnh</span>
                </button>
                <AnchoredDropdownMenu
                  open={showSettings}
                  onClose={() => setShowSettings(false)}
                  anchorRef={settingsTriggerRef}
                  className="rounded-xl border-gray-200 p-3 w-[min(100vw-1.5rem,18rem)] max-h-[min(80vh,32rem)] overflow-y-auto"
                  align="right"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2.5">Cuộn cột Kanban</p>
                  <div className="space-y-2">
                    {[
                      { id: 'unified', title: 'Cuộn chung tất cả cột', desc: 'Kéo một lần, mọi cột cuộn cùng chiều dọc (mặc định).' },
                      { id: 'per-column', title: 'Cuộn riêng từng cột', desc: 'Mỗi cột có thanh cuộn dọc riêng.' },
                    ].map((opt) => (
                      <label key={opt.id} className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50 has-[:checked]:border-violet-400 has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input
                          type="radio"
                          name="app-mod-scroll"
                          className="mt-0.5 shrink-0"
                          checked={columnScrollMode === opt.id}
                          onChange={() => setScrollMode(opt.id)}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-gray-800">{opt.title}</span>
                          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{opt.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </AnchoredDropdownMenu>
              </div>
            </div>
          </div>

          {showCreate && (
            <form onSubmit={createRecord} className="flex flex-wrap gap-2 items-center px-2.5 pb-2.5 sm:px-3 border-t border-slate-100 pt-2">
              <input
                autoFocus
                className="h-8 px-2.5 border border-slate-200 rounded-md text-xs flex-1 min-w-[140px] max-w-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200/60"
                placeholder={`Tên bản ghi — ${activeTab?.name || mod?.name || 'module'}…`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="h-8 px-2.5 border border-slate-200 rounded-md text-xs w-[9rem] focus:outline-none focus:border-blue-400"
                placeholder="Khách hàng"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
              />
              <input
                className="h-8 px-2.5 border border-slate-200 rounded-md text-xs w-[8rem] focus:outline-none focus:border-blue-400"
                placeholder="SĐT"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
              <input
                className="h-8 px-2.5 border border-slate-200 rounded-md text-xs w-[8rem] tabular-nums focus:outline-none focus:border-blue-400"
                placeholder="Giá trị"
                inputMode="numeric"
                value={newEstimatedValue}
                onChange={(e) => setNewEstimatedValue(e.target.value)}
              />
              <button type="submit" disabled={creating || !activeTabId || !newName.trim()} className="h-8 px-3 rounded-md bg-blue-600 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Tạo
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setNewName('');
                  setNewCustomerName('');
                  setNewCustomerPhone('');
                  setNewEstimatedValue('');
                }}
                className="h-8 px-2.5 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                Hủy
              </button>
            </form>
          )}

          {showFilters && (
            <div className="border-t border-slate-200/60 bg-slate-50/40 px-2.5 py-2.5 sm:px-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-end">
                <label className="text-[11px] font-semibold text-slate-600">
                  Trạng thái
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="mt-1 block h-8 min-w-[8rem] rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="">Tất cả</option>
                    <option value="open">Đang mở</option>
                    <option value="done">Hoàn thành</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Cột pipeline
                  <select value={filterStageId} onChange={(e) => setFilterStageId(e.target.value)} className="mt-1 block h-8 min-w-[10rem] rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="">Tất cả cột</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button type="button" onClick={resetFilters} className="h-8 px-3 rounded-lg border border-violet-300 bg-white text-xs font-semibold text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Đặt lại
                </button>
              </div>
            </div>
          )}
        </div>

        {/* KPI */}
        <section className="border-t border-slate-200/60 bg-slate-50/30">
          <button
            type="button"
            onClick={toggleKpi}
            aria-expanded={kpiOpen}
            className="w-full flex items-center gap-1.5 px-2.5 py-1 sm:px-3 text-left cursor-pointer hover:bg-slate-100/60"
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-violet-600" />
            <span className="text-[11px] font-semibold text-slate-800 shrink-0">
              KPI <span className="ml-1 font-medium text-violet-600">· {activeTab?.name || mod?.name || 'Module'}</span>
            </span>
            {!kpiOpen && (
              <ModuleKpiStrip
                segments={kpiSegments.filter((s) => s.key !== 'value')}
                title={kpiSegments.map((s) => `${s.label} ${s.value}`).join(' · ')}
              />
            )}
            <span className="shrink-0 ml-auto flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
              <span className="hidden sm:inline">{kpiOpen ? 'Thu gọn' : 'Mở rộng'}</span>
              {kpiOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>
          {kpiOpen && (
            <div className="border-t border-violet-100/70 bg-white/40 px-2 sm:px-3 pb-2 pt-2 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <ModuleKpiCard icon={<Target className="h-3 w-3" />} iconBgColor="bg-blue-100" iconColor="text-blue-600" label="Tổng" value={kpiSegments[0].value} sublabel={activeTab?.name} />
                <ModuleKpiCard icon={<Zap className="h-3 w-3" />} iconBgColor="bg-emerald-100" iconColor="text-emerald-600" label="Đang xử lý" value={kpiSegments[1].value} />
                <ModuleKpiCard icon={<CheckCircle2 className="h-3 w-3" />} iconBgColor="bg-green-100" iconColor="text-green-600" label="Hoàn thành" value={kpiSegments[2].value} />
                <ModuleKpiCard icon={<XCircle className="h-3 w-3" />} iconBgColor="bg-red-100" iconColor="text-red-600" label="Hủy" value={kpiSegments[3].value} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-violet-200/80 bg-white px-3 py-2 shadow-sm">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-700/80">Giá trị dự kiến</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900">{kpiSegments[4]?.value || '0đ'}</p>
                </div>
                <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Tab đang xem</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{activeTab?.name || mod?.name || '—'}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="relative min-h-[min(700px,calc(100vh-128px))]" data-tour="kanban-pipeline">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 pointer-events-none rounded-xl">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          </div>
        )}

        {viewMode === 'list' || viewMode === 'deadline' ? (
          <ModuleListView
            mode={viewMode}
            records={filteredRecords}
            stages={stages}
            moduleKey={moduleKey}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onMoveStage={moveRecord}
            onDelete={deleteRecord}
          />
        ) : !loading && stages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
            <p className="text-sm text-slate-500">Tab này chưa có cột pipeline. Thêm cột trong cấu hình module.</p>
            <Link to={`/ecosystem/app-modules/${moduleKey}`} className="inline-flex mt-3 text-xs font-semibold text-violet-700 hover:underline">
              Mở cấu hình →
            </Link>
          </div>
        ) : (
          <WorkshopPipelineKanbanScroll
            cardSelector="[data-app-module-card]"
            isDragCardTarget={isDragCardTarget}
            columnScrollMode={columnScrollMode}
            remeasureToken={`${moduleKey}-${activeTabId}-${stages.length}-${columnScrollMode}`}
            showLegend={false}
            scrollContainerRef={kanbanHScrollRef}
          >
            <div
              className={`flex min-w-max items-stretch ${KANBAN_BOARD_COLUMN_RAILS_CLASS} gap-1.5 ${columnScrollMode === 'per-column' ? 'h-full' : ''}`}
              style={{ '--kanban-col-gap': '0.375rem' }}
            >
              {stages.map((stage, columnIndex) => (
                <AppModuleStageColumn
                  key={stage.id}
                  stage={stage}
                  items={byStage.map[stage.id] || []}
                  columnIndex={columnIndex}
                  moduleKey={moduleKey}
                  stages={stages}
                  tabById={tabById}
                  stageTransfers={stageTransfers[String(stage.id)] || []}
                  transferringId={transferringId}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onToggleSelectColumn={toggleSelectColumn}
                  onMoveStage={moveRecord}
                  onMoveToTab={moveToTab}
                  onTransfer={transferRecord}
                  onSaveMeta={saveRecordMeta}
                  onOpenDeadline={openRecordDeadline}
                  onDelete={deleteRecord}
                  columnScrollMode={columnScrollMode}
                />
              ))}
              {byStage.unstaged.length > 0 && (
                <div className={`flex flex-col flex-shrink-0 w-[15rem] rounded-lg kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} border border-dashed border-slate-300 bg-white/80`}>
                  <div className="p-2 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-500">Chưa có cột</h3>
                    <span className="text-[10px] font-bold text-slate-400">{byStage.unstaged.length}</span>
                  </div>
                  <div className={`p-1.5 space-y-1.5 ${KANBAN_CARDS_BODY_CLASS}`}>
                    {byStage.unstaged.map((r) => (
                      <AppModuleKanbanCard
                        key={r.id}
                        item={r}
                        moduleKey={moduleKey}
                        columnAccent="#94a3b8"
                        stages={stages}
                        tabTargets={[]}
                        transfers={[]}
                        transferringId={transferringId}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onMoveStage={moveRecord}
                        onMoveToTab={moveToTab}
                        onTransfer={transferRecord}
                        onSaveMeta={saveRecordMeta}
                        onOpenDeadline={openRecordDeadline}
                        onDelete={deleteRecord}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </WorkshopPipelineKanbanScroll>
        )}
      </div>

      <CrmDeadlineModal
        open={!!deadlineCtx}
        title={deadlineCtx?.record?.kanban_deadline_at ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ'}
        subtitle="Deadline hiển thị trên thẻ Kanban (giống CRM)."
        initialDeadline={deadlineCtx?.record?.kanban_deadline_at || null}
        currentDeadline={deadlineCtx?.record?.kanban_deadline_at || null}
        requireReason={!!deadlineCtx?.record?.kanban_deadline_at}
        allowClear={!!deadlineCtx?.record?.kanban_deadline_at}
        onClose={() => setDeadlineCtx(null)}
        onConfirm={saveRecordDeadline}
      />
    </div>
  );
}

function ModuleListView({ mode, records, stages, moduleKey, selectedIds, onToggleSelect, onMoveStage, onDelete }) {
  const navigate = useNavigate();
  const stageName = (id) => stages.find((s) => String(s.id) === String(id))?.name || '—';
  const sorted = useMemo(() => {
    const list = [...records];
    if (mode === 'deadline') {
      list.sort((a, b) => {
        const da = (a.kanban_deadline_at || a.meta?.deadline) ? new Date(a.kanban_deadline_at || a.meta.deadline).getTime() : Infinity;
        const db = (b.kanban_deadline_at || b.meta?.deadline) ? new Date(b.kanban_deadline_at || b.meta.deadline).getTime() : Infinity;
        return da - db;
      });
    }
    return list;
  }, [records, mode]);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden h-full min-h-0 flex flex-col">
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
            <tr className="text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 font-semibold">Tên</th>
              <th className="px-2 py-2 font-semibold">Cột</th>
              <th className="px-2 py-2 font-semibold">Giá trị</th>
              <th className="px-2 py-2 font-semibold">Deadline</th>
              <th className="px-2 py-2 font-semibold">Phụ trách</th>
              <th className="px-2 py-2 font-semibold">Cập nhật</th>
              <th className="w-28 px-2 py-2 font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const selected = selectedIds.some((x) => String(x) === String(r.id));
              return (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-violet-50/40">
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => onToggleSelect(r.id)} className={`h-5 w-5 rounded border inline-flex items-center justify-center ${selected ? 'border-amber-500 bg-amber-100 text-amber-700' : 'border-slate-300 text-slate-400'}`}>
                      <CheckSquare className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => navigate(`/m/${moduleKey}/records/${r.id}`)} className="font-semibold text-slate-900 hover:text-violet-700 text-left">
                      {r.name}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{stageName(r.stage_id)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{formatVND(r.meta?.estimated_value) || '—'}</td>
                  <td className="px-2 py-1.5">{r.meta?.deadline ? formatShortDate(r.meta.deadline) : '—'}</td>
                  <td className="px-2 py-1.5">{r.assignee?.full_name || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-500">{formatShortDate(r.updated_at)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <select
                        className="h-7 rounded border border-slate-200 text-[10px] max-w-[6.5rem]"
                        value={r.stage_id || ''}
                        onChange={(e) => e.target.value && onMoveStage(r.id, e.target.value)}
                      >
                        <option value="">Cột…</option>
                        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button type="button" onClick={() => onDelete(r.id)} className="h-7 w-7 rounded border border-red-100 text-red-600 hover:bg-red-50 inline-flex items-center justify-center">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Không có bản ghi phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const AppModuleStageColumn = memo(function AppModuleStageColumn({
  stage,
  items,
  columnIndex,
  moduleKey,
  stages,
  tabById,
  stageTransfers,
  transferringId,
  selectedIds,
  onToggleSelect,
  onToggleSelectColumn,
  onMoveStage,
  onMoveToTab,
  onTransfer,
  onSaveMeta,
  onOpenDeadline,
  onDelete,
  columnScrollMode,
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const headerRef = useRef(null);
  const columnTheme = useKanbanColumnTheme(columnIndex);
  const perColumn = columnScrollMode === 'per-column';
  const pinEmptyPlaceholder = !perColumn && items.length === 0;
  const emptyPlaceholderTop = useKanbanEmptyPlaceholderStickyTop(headerRef, pinEmptyPlaceholder);
  const itemIds = items.map((i) => i.id);
  const allSelected = itemIds.length > 0 && itemIds.every((id) => selectedIds.some((x) => String(x) === String(id)));

  const tabTargets = (stage.transfer_tab_ids || [])
    .map((id) => tabById[String(id)])
    .filter(Boolean);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOverColumn(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setIsOverColumn(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOverColumn(false);
        const id = e.dataTransfer.getData('text/record-id') || e.dataTransfer.getData('recordId');
        if (id) onMoveStage(id, stage.id);
      }}
      className={`flex flex-col flex-shrink-0 w-[15rem] max-[380px]:w-[13.5rem] rounded-lg transition-all duration-200 kanban-column-surface ${KANBAN_COLUMN_RAIL_CLASS} ${
        perColumn ? 'h-full self-stretch overflow-x-visible overflow-y-hidden' : 'overflow-visible kanban-unified-scroll-column'
      } ${isOverColumn ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}
    >
      <div ref={headerRef} className={`${perColumn ? 'shrink-0' : 'sticky top-0 kanban-column-header-sticky'} z-20 overflow-hidden rounded-t-lg`}>
        <div
          className="border-b transition-all kanban-column-surface p-2"
          style={{
            backgroundColor: isOverColumn ? columnTheme.dropBg : columnTheme.headerBg,
            borderColor: columnTheme.border,
            boxShadow: columnTheme.headerShadow,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-base shrink-0">{stage.icon || '📌'}</span>
              <h3 className="font-semibold truncate text-sm text-black">{stage.name}</h3>
              {stage.is_done && <span className="text-[9px] font-bold px-1 rounded bg-emerald-100 text-emerald-700 shrink-0">HT</span>}
              {stage.is_lost && <span className="text-[9px] font-bold px-1 rounded bg-red-100 text-red-700 shrink-0">Hủy</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {itemIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleSelectColumn(itemIds)}
                  className={`h-6 w-6 inline-flex items-center justify-center rounded-lg border ${
                    allSelected
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                  title={allSelected ? 'Bỏ chọn cột' : 'Chọn tất cả trong cột'}
                >
                  {allSelected ? <MinusSquare className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                </button>
              )}
              <span
                className="px-2 py-1 font-bold rounded text-[10px]"
                style={{
                  backgroundColor: columnTheme.badgeBg,
                  color: columnTheme.accent,
                  border: `1px solid ${columnTheme.badgeBorder}`,
                }}
              >
                {items.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`rounded-b-lg transition-all ${KANBAN_CARDS_BODY_CLASS} ${isOverColumn ? 'kanban-cards-body--drop' : ''} ${
          pinEmptyPlaceholder ? KANBAN_CARDS_BODY_EMPTY_PIN_CLASS : ''
        } px-1.5 pt-1 pb-1.5 ${perColumn ? 'flex-1 min-h-0 overflow-y-auto overscroll-y-contain' : 'flex-1'}`}
        style={perColumn ? undefined : { minHeight: '160px' }}
      >
        {items.length === 0 ? (
          <div
            className={`${KANBAN_COLUMN_EMPTY_CLASS}${isOverColumn ? ' kanban-column-empty--drop' : ''} kanban-column-empty--compact${
              pinEmptyPlaceholder ? ` ${KANBAN_COLUMN_EMPTY_PIN_CLASS}` : ''
            }`}
            style={pinEmptyPlaceholder ? { top: emptyPlaceholderTop } : undefined}
          >
            <Layers aria-hidden />
            <p>{isOverColumn ? 'Thả vào đây' : 'Kéo bản ghi vào đây'}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <AppModuleKanbanCard
                key={item.id}
                item={item}
                moduleKey={moduleKey}
                columnAccent={columnTheme.accent}
                stages={stages}
                tabTargets={tabTargets}
                transfers={stageTransfers}
                transferringId={transferringId}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onMoveStage={onMoveStage}
                onMoveToTab={onMoveToTab}
                onTransfer={onTransfer}
                onSaveMeta={onSaveMeta}
                onOpenDeadline={onOpenDeadline}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const AppModuleKanbanCard = memo(function AppModuleKanbanCard({
  item,
  moduleKey,
  columnAccent,
  stages,
  tabTargets,
  transfers,
  transferringId,
  selectedIds,
  onToggleSelect,
  onMoveStage,
  onMoveToTab,
  onTransfer,
  onSaveMeta,
  onOpenDeadline,
  onDelete,
}) {
  const navigate = useNavigate();
  const [editingValue, setEditingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState('');
  const [valueSaving, setValueSaving] = useState(false);
  const valueInputRef = useRef(null);
  const busy = transferringId === item.id;
  const selected = selectedIds.some((x) => String(x) === String(item.id));
  const stage = stages.find((s) => String(s.id) === String(item.stage_id)) || item.stage || {};
  const stageColor = stage.color || columnAccent || '#94a3b8';
  const createdDateLabel = item.created_at ? formatDate(item.created_at) : (item.created_at ? formatShortDate(item.created_at) : null);
  const cardEstimatedValue = Number(item.estimated_value ?? item.meta?.estimated_value) || 0;
  const hasCardValue = cardEstimatedValue > 0;
  const canEditValue = typeof onSaveMeta === 'function';
  const assigneeUser = item.assignee || null;
  const leadTypeLabel = item.record_type || null;
  const companyLabel = item.company?.short_name || item.company?.name || null;
  const regionLabel = item.crm_region?.name || item.meta?.region_name || null;
  const contextMetaLine = [companyLabel, regionLabel].filter(Boolean).join(' · ');
  const deadlineIso = item.kanban_deadline_at || item.meta?.kanban_deadline_at || item.meta?.deadline || null;
  const scheduleBlocked = !!(stage?.is_done || stage?.is_lost);
  const deadlineTs = (!scheduleBlocked && deadlineIso) ? new Date(deadlineIso).getTime() : null;
  const scheduleUrgency = deadlineTs != null && !Number.isNaN(deadlineTs)
    ? getCrmDeadlineUrgencyFromTs(deadlineTs)
    : { level: 'ok', remainingMs: null, deadlineTs: null };
  const cardToneLevel = scheduleUrgency.level;

  const scheduleBadge = (() => {
    if (deadlineTs == null) return null;
    const deadlineDateLabel = formatDate(new Date(deadlineTs).toISOString());
    const isOverdue = cardToneLevel === 'overdue';
    const tonePalette = getCrmDeadlineUrgencyBadgeClass(cardToneLevel);
    const isUrgent = cardToneLevel === 'overdue' || cardToneLevel === 'soon';
    const badgeCls = `shrink-0 inline-flex items-center gap-1 rounded-md border tabular-nums leading-none ${
      isUrgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px] font-semibold'
    } ${tonePalette}`;
    const badgeContent = (
      <>
        <Clock className={isUrgent ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.6} />
        <span className="font-extrabold tracking-wide uppercase">Setup</span>
        <span className="opacity-80" aria-hidden>·</span>
        {isOverdue ? <>Quá hạn {deadlineDateLabel}</> : <>Hạn {deadlineDateLabel}</>}
      </>
    );
    if (typeof onOpenDeadline === 'function') {
      return (
        <button
          type="button"
          data-kanban-deadline-btn
          onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
          className={`${badgeCls} hover:opacity-90 cursor-pointer transition-opacity`}
          title={`Hạn: ${deadlineDateLabel}\nLoại: Deadline tự setup`}
        >
          {badgeContent}
        </button>
      );
    }
    return <span className={badgeCls} title={`Hạn: ${deadlineDateLabel}\nLoại: Deadline tự setup`}>{badgeContent}</span>;
  })();

  const startEditValue = (ev) => {
    ev?.stopPropagation?.();
    if (!canEditValue || valueSaving) return;
    setValueDraft(hasCardValue ? String(cardEstimatedValue) : '');
    setEditingValue(true);
    setTimeout(() => valueInputRef.current?.focus(), 0);
  };

  const commitValueEdit = async () => {
    if (!editingValue) return;
    setEditingValue(false);
    if (!canEditValue) return;
    const raw = String(valueDraft || '').replace(/[^\d.]/g, '');
    const num = raw ? Math.max(0, parseFloat(raw) || 0) : 0;
    if (num === cardEstimatedValue) return;
    setValueSaving(true);
    try {
      await onSaveMeta(item, { estimated_value: num });
    } finally {
      setValueSaving(false);
    }
  };

  const hasContextChips = (tabTargets?.length > 0) || (transfers?.length > 0) || !!item.source_crm_lead_id;

  return (
    <div
      data-app-module-card={item.id}
      draggable
      onDragStart={(e) => {
        if (
          e.target.closest?.('[data-kanban-select-zone]')
          || e.target.closest?.('[data-kanban-value-zone]')
          || e.target.closest?.('[data-kanban-quick-move]')
          || e.target.closest?.('[data-kanban-options-menu]')
          || e.target.closest?.('[data-kanban-transfer]')
          || e.target.closest?.('[data-kanban-deadline-btn]')
          || e.target.closest?.('[data-kanban-sx-btn]')
        ) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/record-id', item.id);
        e.dataTransfer.setData('recordId', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(ev) => {
        if (
          ev.target.closest?.('[data-kanban-select-zone]')
          || ev.target.closest?.('[data-kanban-value-zone]')
          || ev.target.closest?.('[data-kanban-quick-move]')
          || ev.target.closest?.('[data-kanban-options-menu]')
          || ev.target.closest?.('[data-kanban-transfer]')
          || ev.target.closest?.('[data-kanban-deadline-btn]')
          || ev.target.closest?.('[data-kanban-sx-btn]')
        ) return;
        navigate(`/m/${moduleKey}/records/${item.id}`);
      }}
      className={`relative rounded-lg !bg-white transition-[box-shadow,transform,z-index,background-color,border-color] duration-150 group/card hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${KANBAN_PIPELINE_CARD_CLASS} ${
        selected ? 'ring-2 ring-amber-400 ring-offset-1' : 'overflow-hidden'
      }`}
      style={{ backgroundColor: '#ffffff', ...getKanbanPipelineCardBorderStyle(columnAccent, selected ? 'selected' : 'default') }}
    >
      <button
        type="button"
        data-kanban-select-zone
        title={selected ? 'Bỏ chọn' : 'Chọn để chuyển / xóa hàng loạt'}
        onClick={(ev) => { ev.stopPropagation(); onToggleSelect(item.id); }}
        className={`absolute top-1.5 right-1.5 z-30 flex h-5 w-5 items-center justify-center rounded border bg-white/95 shadow-sm transition-colors cursor-pointer ${
          selected
            ? 'border-amber-500 bg-amber-100 text-amber-700'
            : 'border-slate-300 text-slate-400 opacity-0 group-hover/card:opacity-100 hover:border-amber-400 hover:text-amber-600'
        }`}
      >
        <CheckSquare className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>

      <div className="p-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 pr-6">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 flex-1">
            <span className="font-mono text-[10px] font-semibold text-slate-500 shrink-0" title={item.code}>
              {item.code}
            </span>
            {createdDateLabel && (
              <>
                <span className="text-slate-300 text-[10px] select-none" aria-hidden>·</span>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0" title={`Tạo: ${createdDateLabel}`}>
                  {createdDateLabel}
                </span>
              </>
            )}
          </div>
          {item.is_new_for_current_user && (
            <span className="shrink-0 inline-flex items-center rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white leading-none">
              Mới
            </span>
          )}
        </div>

        <h4
          title={item.title || item.name}
          className="font-semibold text-slate-900 leading-snug text-[12px] line-clamp-2"
        >
          {(item.title || item.name) || <span className="italic font-normal text-slate-400">(Không tiêu đề)</span>}
        </h4>

        {(leadTypeLabel || contextMetaLine) && (
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {leadTypeLabel && (
              <span
                className="inline-flex items-center max-w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold truncate shrink-0"
                style={{
                  backgroundColor: leadTypeLabel.color ? `${leadTypeLabel.color}14` : '#f5f3ff',
                  borderColor: leadTypeLabel.color ? `${leadTypeLabel.color}45` : '#ddd6fe',
                  color: leadTypeLabel.color || '#6d28d9',
                }}
                title={`Phân loại: ${leadTypeLabel.name}`}
              >
                {leadTypeLabel.name}
              </span>
            )}
            {contextMetaLine && (
              <span className="inline-flex items-center gap-1 min-w-0 text-[10px] text-slate-500 truncate" title={contextMetaLine}>
                {companyLabel && <Building2 className="h-3 w-3 shrink-0 text-indigo-400" strokeWidth={2.2} />}
                {!companyLabel && regionLabel && <MapPin className="h-3 w-3 shrink-0 text-rose-400" strokeWidth={2.2} />}
                <span className="truncate">{contextMetaLine}</span>
              </span>
            )}
          </div>
        )}

        <div
          data-kanban-value-zone
          className="rounded-md border border-emerald-100/90 bg-emerald-50/40 px-2 py-1.5 min-w-0"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex items-center gap-1 min-w-0">
            {editingValue ? (
              <input
                ref={valueInputRef}
                type="text"
                inputMode="numeric"
                value={valueDraft}
                disabled={valueSaving}
                onChange={(e) => setValueDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitValueEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditingValue(false); }
                }}
                onBlur={() => { commitValueEdit(); }}
                placeholder="Giá trị (VNĐ)"
                className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-1 font-mono tabular-nums text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-400/60 text-[12px]"
              />
            ) : hasCardValue ? (
              <>
                <p className="font-bold tabular-nums leading-none text-emerald-700 min-w-0 truncate flex-1 text-[14px]">
                  {formatVND(cardEstimatedValue)}
                </p>
                {canEditValue && (
                  <button
                    type="button"
                    onClick={startEditValue}
                    disabled={valueSaving}
                    className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-white/80 transition-colors cursor-pointer disabled:opacity-40"
                    title="Sửa giá trị"
                  >
                    <Pencil className="h-3 w-3" strokeWidth={2.2} />
                  </button>
                )}
              </>
            ) : canEditValue ? (
              <button
                type="button"
                onClick={startEditValue}
                disabled={valueSaving}
                className="inline-flex items-center gap-1 rounded border border-dashed border-emerald-300 bg-white/70 px-2 py-0.5 font-medium text-emerald-700 hover:bg-white transition-colors cursor-pointer disabled:opacity-40 text-[11px]"
                title="Nhập giá trị thẻ"
              >
                <Pencil className="h-3 w-3" strokeWidth={2.2} />
                Nhập giá trị
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 italic">Chưa định giá</span>
            )}
          </div>
        </div>

        {scheduleBadge && <div className="w-full min-w-0 flex">{scheduleBadge}</div>}

        {(item.customer?.full_name || item.customer?.phone) && (
          <p
            className="text-[11px] leading-snug min-w-0 truncate"
            title={[item.customer?.full_name, item.customer?.phone].filter(Boolean).join(' · ')}
          >
            {item.customer?.full_name && (
              <span className="font-medium text-slate-800">{item.customer.full_name}</span>
            )}
            {item.customer?.full_name && item.customer?.phone && (
              <span className="text-slate-300 mx-1.5" aria-hidden>·</span>
            )}
            {item.customer?.phone && (
              <a
                href={`tel:${item.customer.phone}`}
                onClick={(ev) => ev.stopPropagation()}
                className="font-mono tabular-nums text-slate-700 hover:text-slate-900 transition-colors"
                title={`Gọi ${item.customer.phone}`}
              >
                {item.customer.phone}
              </a>
            )}
          </p>
        )}

        {hasContextChips && (
          <div className="flex flex-wrap gap-1 min-w-0" data-kanban-transfer onClick={(e) => e.stopPropagation()}>
            {item.source_crm_lead_id && (
              <span className="inline-flex items-center gap-0.5 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                CRM
              </span>
            )}
            {tabTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                data-kanban-sx-btn
                onClick={(e) => onMoveToTab(e, item.id, t)}
                className="inline-flex items-center gap-1 max-w-full rounded border px-1.5 py-0.5 text-[10px] font-medium truncate border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                {t.icon || '📋'} → {t.name}
              </button>
            ))}
            {transfers.map((tm) => (
              <button
                key={tm.id}
                type="button"
                disabled={busy}
                data-kanban-sx-btn
                onClick={(e) => onTransfer(e, item.id, tm.id, tm.name)}
                className="inline-flex items-center gap-1 max-w-full rounded border px-1.5 py-0.5 text-[10px] font-medium truncate border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                {tm.icon || '📦'} → {tm.name}
              </button>
            ))}
          </div>
        )}

        {item.lost_reason && stage?.is_lost && (
          <>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600/85 group-hover/card:hidden">
              <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={2.2} />
              Có lý do hủy
            </span>
            <div className="hidden group-hover/card:block rounded-md border border-red-200 bg-red-50 px-2 py-1.5 shadow-sm">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-red-500">Lý do hủy</p>
              <p className="text-[11px] text-red-700 leading-snug whitespace-pre-wrap">{item.lost_reason}</p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-slate-100">
          <div className="flex items-center gap-1.5 min-w-0">
            {assigneeUser ? (
              <>
                <div
                  className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: stageColor }}
                  title={`Phụ trách: ${assigneeUser.full_name}`}
                >
                  {initials(assigneeUser.full_name)}
                </div>
                <span className="truncate text-[11px] font-medium text-slate-700" title={assigneeUser.full_name}>
                  {assigneeUser.full_name}
                </span>
              </>
            ) : (
              <>
                <div
                  className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 bg-slate-100 border border-dashed border-slate-300"
                  title="Chưa gán phụ trách"
                >
                  ?
                </div>
                <span className="truncate text-[11px] italic text-slate-400">Chưa gán</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0 rounded-full border border-indigo-100 bg-white px-1 py-0.5 shadow-sm">
            {typeof onMoveStage === 'function' && Array.isArray(stages) && stages.length > 1 && (
              <KanbanCardQuickMove
                stages={stages}
                currentStageId={item.stage_id}
                onMove={(target) => onMoveStage(item.id, target.id)}
                theme="crm"
                blockVirtualTargets={false}
              />
            )}
            <KanbanCardOptionsMenu
              item={item}
              theme="crm"
              hideDeadlineOption={scheduleBlocked}
              deadlineAt={deadlineIso}
              onOpenDeadline={onOpenDeadline}
              onTogglePin={async () => {
                await onSaveMeta(item, { is_pinned: !item.is_pinned });
              }}
              onToggleInteracted={async () => {
                await onSaveMeta(item, { is_interacted: !item.is_interacted });
              }}
            />
            {typeof onDelete === 'function' && (
              <button
                type="button"
                data-kanban-options-menu
                title="Xóa bản ghi"
                onClick={(ev) => { ev.stopPropagation(); onDelete(item.id); }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

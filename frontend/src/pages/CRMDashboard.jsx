import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket, connectSocket } from '../lib/socket';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, User, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronLeft, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingDown, AlertTriangle, Building2, Rocket, Pin,
  Clock, List, LayoutGrid, GitMerge, UserCheck, Trash2, CheckSquare
} from 'lucide-react';
import { ListView, PlannerView } from '../components/CRMViews';
import EmployeePicker from '../components/EmployeePicker';
import {
  loadCrmPipelineSnapshot,
  saveCrmPipelineSnapshot,
  markCrmPipelineCardFocus,
  peekCrmPipelineCardFocus,
  clearCrmPipelineCardFocus,
  getLocallyViewedLeadIdSet,
  getCurrentUserKeyForLeadSeen,
} from '../lib/crmPipelineStorage';
import { userSeesAllCrmDealsScoped } from '../lib/crmDealAccess';
import {
  findDefaultAdminCrmCompanyPhucDat,
  getStoredCrmFilterCompanyId,
  narrowPipelinesToDefaultForCompany,
  resolveDefaultCrmAdminCompanyId,
  setStoredCrmFilterCompanyId,
} from '../lib/crmCompanyFilter';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import DealStageEventModal from '../components/DealStageEventModal';
import DateRangePickerPopover from '../components/DateRangePickerPopover';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

/** Tuổi chi tiết từ mốc thời gian — ngày + giờ (+ phút nếu dưới 1 giờ) */
function formatAgeDetailed(fromIso) {
  if (!fromIso) return '—';
  const ms = Date.now() - new Date(fromIso).getTime();
  if (ms < 0) return '0 giờ';
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 24 * 60) / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (!days && !hours) parts.push(`${mins} phút`);
  return parts.join(' ');
}

function formatRemainingMs(ms) {
  if (ms == null || ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const hr = h % 24;
  if (d > 0) return `${d} ngày ${hr} giờ`;
  if (h > 0) return `${h} giờ`;
  const m = Math.floor(ms / 60000);
  return `${m} phút`;
}

/** SLA cột pipeline: mặc định 7 ngày nếu chưa cấuỉnh sla_days — vàng ≤3 ngày còn, cam ≤24h, đỏ quá hạn */
function getPipelineStageSlaTone(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return { level: 'ok', remainingMs: null, deadlineTs: null };
  if (stage.is_won || stage.is_lost) return { level: 'ok', remainingMs: null, deadlineTs: null };
  const slaDays = Number(stage.sla_days) > 0 ? Number(stage.sla_days) : 7;
  const deadlineTs = new Date(stageEnteredAt).getTime() + slaDays * 86400000;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

/** Nhiệm vụ CRM có deadline (API `crm_next_open_task_deadline`): ngưỡng màu giống SLA cột — đỏ / cam / vàng / trắng. */
function getCrmOpenTaskDeadlineTone(deadlineIso) {
  if (deadlineIso == null || deadlineIso === '') return null;
  const deadlineTs = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadlineTs)) return null;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

function pipelineCardToneClasses(level) {
  switch (level) {
    case 'overdue':
      return 'bg-red-50 border-red-300';
    case 'soon':
      return 'bg-orange-50 border-orange-300';
    case 'warn':
      return 'bg-amber-50 border-amber-200';
    default:
      return 'bg-white border-gray-200';
  }
}

// ── HELPER: tính khoảng thời gian ──
function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today': {
      return { from: today.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
    }
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: monday.toISOString().split('T')[0], to: sunday.toISOString().split('T')[0] };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: lastMonday.toISOString().split('T')[0], to: lastSunday.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const firstDay = new Date(now.getFullYear(), qMonth, 1);
      const lastDay = new Date(now.getFullYear(), qMonth + 3, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_year': {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    default:
      return { from: '', to: '' };
  }
}

const TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chỉnh' },
];

const KANBAN_LOAD_OPTIONS = ['500', '1000', '2000', 'all'];

/** Phân loại lead/deal trên dashboard (localStorage; khác key với công ty) */
const LS_CRM_DASH_LEAD_TYPE = 'crm_dash_filter_lead_type_id';

/** Lead/Deal đang trên pipeline (chưa cột Thắng / Thua) — dùng stage từ API, không dùng is_won ở root. */
function isActiveCrmPipelineItem(item) {
  const st = item?.stage;
  return !st?.is_won && !st?.is_lost;
}

/** Cột Thắng — fallback lookup stages list nếu embed stage thiếu is_won. */
function dealIsWonStage(item, stagesDeal) {
  if (item?.stage?.is_won) return true;
  const sid = item?.stage_id;
  if (!sid || !Array.isArray(stagesDeal) || stagesDeal.length === 0) return false;
  const st = stagesDeal.find((s) => String(s.id) === String(sid));
  return !!st?.is_won;
}

/**
 * Kanban phải có đúng một dòng mỗi id. RPC/load-more có thể trả cùng id hai lần với stage_id khác thời điểm
 * → cùng deal hiện ở hai cột; xóa một thẻ vẫn chỉ một bản ghi DB nên cả hai biến mất.
 */
function dedupeCrmKanbanRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const r of list) {
    if (!r || r.id == null || r.id === '') continue;
    const k = String(r.id);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      continue;
    }
    const ta = new Date(prev.updated_at || prev.created_at || 0).getTime();
    const tb = new Date(r.updated_at || r.created_at || 0).getTime();
    map.set(k, tb >= ta ? r : prev);
  }
  return [...map.values()];
}

export default function CRMDashboard() {
  const { user } = useAuth();
  const seesAllCrmDeals = userSeesAllCrmDealsScoped(user);
  const isAdmin = user?.role === 'admin';
  /** Admin công ty (khác admin hệ thống): backend khóa API + GET /companies chỉ trả một công ty. */
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);

  const persistedUiRef = useRef(undefined);
  if (persistedUiRef.current === undefined) {
    persistedUiRef.current = typeof window !== 'undefined' ? loadCrmPipelineSnapshot() : null;
  }
  const P = persistedUiRef.current;

  const [dataLead, setDataLead] = useState(null);
  const [dataDeal, setDataDeal] = useState(null);
  // leads & deals are computed via useMemo (client-side filter) - see below
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [sources, setSources] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const allDealsRef = useRef(allDeals);
  allDealsRef.current = allDeals;
  const [filterCompany, setFilterCompany] = useState(() => {
    if (P?.filterCompany) return P.filterCompany;
    const ls = getStoredCrmFilterCompanyId();
    return ls || '';
  });
  const [searchText, setSearchText] = useState(() => P?.searchText ?? '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState(() => P?.filterAssignee ?? '');
  /** Gõ tên để thu hẹp danh sách trong dropdown NV */
  const [assigneeListSearch, setAssigneeListSearch] = useState(() => P?.assigneeListSearch ?? '');
  /** Lọc lead/deal theo tên người phụ trách / chủ lead (không lẫn tên khách hàng) */
  const [filterAssigneeName, setFilterAssigneeName] = useState(() => P?.filterAssigneeName ?? '');
  const [filterSource, setFilterSource] = useState(() => P?.filterSource ?? '');
  const [filterStage, setFilterStage] = useState(() => P?.filterStage ?? '');
  /** Lọc pipeline theo khu vực CRM (company_regions); `__none__` = chưa gán khu vực */
  const [filterRegion, setFilterRegion] = useState(() => P?.filterRegion ?? '');
  const [companyRegions, setCompanyRegions] = useState([]);
  const [filterLeadType, setFilterLeadType] = useState(() => P?.filterLeadType ?? '');
  const companyFilterFromLsRef = useRef(false);
  /** Admin + filter rỗng: chỉ tự gán Phúc Đạt một lần; sau đó NV chọn «Tất cả» (= '') vẫn load đúng */
  const adminCompanyDefaultResolvedRef = useRef(false);
  const leadTypeFilterFromLsRef = useRef(false);
  // Mặc định luôn chỉ hiện lead đã có SĐT; không phục hồi giá trị '' (tất cả)
  const [filterPhone, setFilterPhone] = useState(() => {
    const v = P?.filterPhone;
    return v === 'no_phone' ? v : 'has_phone';
  });
  const [showAdvSearch, setShowAdvSearch] = useState(() => !!P?.showAdvSearch);
  const [users, setUsers] = useState([]);
  const [pipelineType, setPipelineType] = useState(() => {
    const t = P?.pipelineType;
    if (t === 'lead' || t === 'deal') return t;
    return localStorage.getItem('crm_pinned_tab') || 'lead';
  });
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [wonAssignModal, setWonAssignModal] = useState(false);
  const [wonAssignLeadId, setWonAssignLeadId] = useState(null);
  const [wonAssignUser, setWonAssignUser] = useState('');
  const [wonAssigning, setWonAssigning] = useState(false);
  const [wonAssignError, setWonAssignError] = useState('');
  const [pinnedTab, setPinnedTab] = useState(() => P?.pinnedTab ?? (localStorage.getItem('crm_pinned_tab') || ''));
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    const v = P?.viewMode;
    return ['kanban', 'list', 'planner', 'calendar'].includes(v) ? v : 'kanban';
  });
  /** Chọn thẻ Kanban để gộp thủ công (không dùng quét trùng) */
  const [manualMergeIds, setManualMergeIds] = useState([]);
  const [manualMergeModalOpen, setManualMergeModalOpen] = useState(false);
  const [bulkStageTarget, setBulkStageTarget] = useState('');
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  /** Deal pipeline: mở popup chọn giờ rồi POST /events sau PATCH stage (bật theo từng pipeline tại Cài đặt pipeline) */
  const [dealKanbanEventCtx, setDealKanbanEventCtx] = useState(null);
  const [dealKanbanEventBusy, setDealKanbanEventBusy] = useState(false);
  /** Deal kéo sang Thắng, chưa có dự án: chọn công ty SX trước khi PATCH stage */
  const [dealWonProductionCtx, setDealWonProductionCtx] = useState(null);
  const [dealWonProductionCompanyId, setDealWonProductionCompanyId] = useState('');
  const [dealWonProductionError, setDealWonProductionError] = useState('');
  const [productionCompaniesForSx, setProductionCompaniesForSx] = useState([]);
  /** Server trả deal_won (tạo dự án lỗi) hoặc cần tạo dự án sau khi đã Thắng */
  const [dealAutoCreatePick, setDealAutoCreatePick] = useState(null);
  const [dealAutoCreateCompanyId, setDealAutoCreateCompanyId] = useState('');
  const [dealAutoCreatePickError, setDealAutoCreatePickError] = useState('');
  const loadRef = useRef(null);
  /** Giá trị GET /crm/live-version gần nhất — đổi → silent reload Kanban/KPI */
  const crmLiveVersionRef = useRef(null);
  /** Số bản ghi lead/deal tải cho Kanban (API /crm/leads có phân trang; "all" = lặp offset đến hết) */
  const [kanbanLoadLimit, setKanbanLoadLimit] = useState(() => {
    const fromP = P?.kanbanLoadLimit != null ? String(P.kanbanLoadLimit) : null;
    if (fromP && KANBAN_LOAD_OPTIONS.includes(fromP)) return fromP;
    const s = localStorage.getItem('crm_kanban_load_limit');
    return KANBAN_LOAD_OPTIONS.includes(s) ? s : 'all';
  });

  /** Tổng số lead/deal theo SĐT từ API (limit=1, chỉ đọc `total`) — không phụ thuộc mức tải Kanban; theo NV + ngày trên server */
  const [pipelinePhoneTotals, setPipelinePhoneTotals] = useState({ lead: null, deal: null });
  /** Trạng thái "Tải thêm": offset đang dừng, total server, và đang loading */
  const [loadMoreState, setLoadMoreState] = useState({ leadOffset: 0, dealOffset: 0, leadTotal: null, dealTotal: null, loading: false });

  // ── TIME FILTER STATE ──
  const [timePreset, setTimePreset] = useState(() => (typeof P?.timePreset === 'string' ? P.timePreset : ''));
  const [customDateFrom, setCustomDateFrom] = useState(() => P?.customDateFrom ?? '');
  const [customDateTo, setCustomDateTo] = useState(() => P?.customDateTo ?? '');
  const [showCustomDate, setShowCustomDate] = useState(() => !!P?.showCustomDate);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);

  // ── COMPANY-BASED EMPLOYEE FILTER ──
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [companyDepts, setCompanyDepts] = useState([]);
  const [userCompanyId, setUserCompanyId] = useState('');
  const [fbPages, setFbPages] = useState([]); // Facebook pages for source labels

  const switchTab = (tab) => {
    setPipelineType(tab);
  };

  const toggleManualMergeSelect = useCallback((id) => {
    setManualMergeIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return [...s];
    });
  }, []);

  /** Gộp / bỏ toàn bộ id trong cột (chọn tất cả cột) */
  const toggleSelectAllInColumn = useCallback((columnItemIds) => {
    const ids = (columnItemIds || []).map(String);
    if (!ids.length) return;
    setManualMergeIds((prev) => {
      const prevSet = new Set(prev.map(String));
      const allSelected = ids.every((id) => prevSet.has(id));
      if (allSelected) {
        const drop = new Set(ids);
        return prev.filter((id) => !drop.has(String(id)));
      }
      return [...new Set([...prev.map(String), ...ids])];
    });
  }, []);

  const bulkDeleteSelected = useCallback(() => {
    const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
    if (!ids.length) return;
    setBulkDeleteReason('');
    setBulkDeleteModalOpen(true);
  }, [manualMergeIds]);

  const confirmBulkDelete = useCallback(async () => {
    const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
    if (!ids.length) return;
    setBulkDeleting(true);
    try {
      for (const id of ids) {
        await api.delete(`/crm/leads/${encodeURIComponent(id)}`, {
          data: { delete_reason: bulkDeleteReason.trim() || null },
        });
      }
      setManualMergeIds([]);
      setBulkDeleteModalOpen(false);
      await loadRef.current?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xóa');
    }
    setBulkDeleting(false);
  }, [manualMergeIds, bulkDeleteReason]);

  useEffect(() => {
    setManualMergeIds([]);
    setBulkStageTarget('');
  }, [pipelineType]);

  const itemsByIdForMerge = useMemo(() => {
    const m = {};
    [...allLeads, ...allDeals].forEach((x) => { m[x.id] = x; });
    return m;
  }, [allLeads, allDeals]);

  const togglePinTab = (tab) => {
    if (pinnedTab === tab) {
      localStorage.removeItem('crm_pinned_tab');
      setPinnedTab('');
    } else {
      localStorage.setItem('crm_pinned_tab', tab);
      setPinnedTab(tab);
    }
  };
  const navigate = useNavigate();

  // Auto-create project (chạy ngầm)
  const [autoCreateStatus, setAutoCreateStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [autoCreateResult, setAutoCreateResult] = useState(null);
  const [autoCreateError, setAutoCreateError] = useState('');
  const autoCreateCalledRef = useRef(false);

  const autoCreateProject = async (dealId, productionCompanyId) => {
    if (!productionCompanyId) {
      const d = allDealsRef.current.find((x) => String(x.id) === String(dealId));
      const pref = isAdmin ? findDefaultAdminCrmCompanyPhucDat(productionCompaniesForSx) : '';
      setDealAutoCreatePick(dealId);
      setDealAutoCreateCompanyId(filterCompany || (d?.company_id ? String(d.company_id) : '') || pref);
      setDealAutoCreatePickError('');
      return;
    }
    if (autoCreateCalledRef.current) return;
    autoCreateCalledRef.current = true;
    setAutoCreateStatus('loading');
    setAutoCreateError('');
    try {
      const { data } = await api.post(`/crm/deals/${dealId}/auto-create-project`, {
        production_company_id: productionCompanyId,
      });
      setAutoCreateResult(data);
      setAutoCreateStatus('success');
      load();
    } catch (e) {
      const msg = e.response?.data?.error || 'Lỗi tạo dự án';
      if (e.response?.data?.project_id) {
        setAutoCreateResult({ project_id: e.response.data.project_id });
        setAutoCreateStatus('success');
      } else {
        setAutoCreateError(msg);
        setAutoCreateStatus('error');
      }
      autoCreateCalledRef.current = false;
    }
  };

  // ── Handle time preset change ──
  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowCustomDate(true);
    } else {
      setShowCustomDate(false);
      if (preset === '') {
        setCustomDateFrom('');
        setCustomDateTo('');
      } else {
        const range = getDateRange(preset);
        setCustomDateFrom(range.from);
        setCustomDateTo(range.to);
      }
    }
  };

  // ── Load company employees on mount ──
  useEffect(() => {
    const loadCompanyEmployees = async () => {
      try {
        const { data } = await api.get('/crm/employees-by-company');
        setCompanyEmployees(data.users || []);
        setCompanyDepts(data.departments || []);
        setUserCompanyId(data.company_id || '');
      } catch (e) {
        console.warn('Load company employees failed:', e.message);
      }
    };
    loadCompanyEmployees();
  }, []);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setProductionCompaniesForSx(r.data?.companies || []))
      .catch(() => setProductionCompaniesForSx([]));
  }, []);

  // Phục hồi bộ lọc công ty (admin) + phân loại từ localStorage khi không có session snapshot
  useEffect(() => {
    if (user == null) return;
    if (companyFilterFromLsRef.current) return;
    if (P?.filterCompany) {
      companyFilterFromLsRef.current = true;
      return;
    }
    if (!isAdmin || isCompanyScopedAdmin) {
      companyFilterFromLsRef.current = true;
      return;
    }
    companyFilterFromLsRef.current = true;
    try {
      const s = getStoredCrmFilterCompanyId();
      if (s) setFilterCompany(s);
    } catch {
      // ignore
    }
  }, [isAdmin, isCompanyScopedAdmin, user, P?.filterCompany]);

  // Admin tổng: chưa có lọc công ty đã lưu → mặc định công ty đầu danh sách CRM
  useEffect(() => {
    if (isCompanyScopedAdmin) return;
    if (!isAdmin || !companies.length) return;
    try {
      if (getStoredCrmFilterCompanyId()) return;
    } catch {
      /* ignore */
    }
    if (P?.filterCompany) return;
    if (filterCompany) return;
    const cid = resolveDefaultCrmAdminCompanyId(companies);
    if (!cid) return;
    setFilterCompany(cid);
    try {
      setStoredCrmFilterCompanyId(cid);
    } catch {
      /* ignore */
    }
  }, [isAdmin, isCompanyScopedAdmin, companies, filterCompany, P?.filterCompany]);

  useEffect(() => {
    if (user == null) return;
    if (leadTypeFilterFromLsRef.current) return;
    if (P?.filterLeadType) {
      leadTypeFilterFromLsRef.current = true;
      return;
    }
    leadTypeFilterFromLsRef.current = true;
    try {
      const s = localStorage.getItem(LS_CRM_DASH_LEAD_TYPE);
      if (s) setFilterLeadType(s);
    } catch {
      // ignore
    }
  }, [user, P?.filterLeadType]);

  useEffect(() => { load(); }, [filterPhone, customDateFrom, customDateTo, kanbanLoadLimit, filterAssignee, filterCompany, filterLeadType]);

  // Admin: công ty đang lọc không còn trong danh sách (sau giới hạn khối theo module CRM) → bỏ lọc
  useEffect(() => {
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) {
      setFilterCompany('');
      setStoredCrmFilterCompanyId('');
    }
  }, [isAdmin, filterCompany, companies]);

  // Admin: khi đổi filterCompany thì nạp đúng stages của pipeline công ty đó (không reload toàn bộ Kanban)
  useEffect(() => {
    if (!isAdmin) return;
    let cancel = false;
    (async () => {
      try {
        const { data: pls } = await api.get('/crm/pipelines').catch(() => ({ data: [] }));
        if (cancel) return;
        const list = Array.isArray(pls) ? pls : [];
        setPipelines(narrowPipelinesToDefaultForCompany(list, filterCompany || null));

        if (!filterCompany) {
          const [leadRes, dealRes] = await Promise.all([
            api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
            api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
          ]);
          if (cancel) return;
          setStagesLead(leadRes.data || []);
          setStagesDeal(dealRes.data || []);
          return;
        }

        const byCompany = list.filter((p) => String(p.company_id || '') === String(filterCompany));
        const def = byCompany.find((p) => p.is_default) || byCompany[0] || null;
        const pipelineId = def?.id || null;
        const [leadRes, dealRes] = await Promise.all([
          api.get('/crm/pipeline-stages', { params: pipelineId ? { type: 'lead', pipeline_id: pipelineId } : { type: 'lead' } }).catch(() => ({ data: [] })),
          api.get('/crm/pipeline-stages', { params: pipelineId ? { type: 'deal', pipeline_id: pipelineId } : { type: 'deal' } }).catch(() => ({ data: [] })),
        ]);
        if (cancel) return;
        setStagesLead(leadRes.data || []);
        setStagesDeal(dealRes.data || []);
      } catch (e) {
        // ignore
      }
    })();
    return () => { cancel = true; };
  }, [isAdmin, filterCompany]);

  // Reset stage filter if it doesn't exist in current company pipeline stages
  useEffect(() => {
    if (!filterStage) return;
    const list = pipelineType === 'lead' ? stagesLead : stagesDeal;
    const ok = (list || []).some((s) => String(s.id) === String(filterStage));
    if (!ok) setFilterStage('');
  }, [filterStage, pipelineType, stagesLead, stagesDeal]);

  // Reset phân loại nếu không còn trong lead types (đúng công ty + lead/deal tab)
  useEffect(() => {
    if (!filterLeadType || !leadTypes.length) return;
    const list = leadTypes.filter((t) => t.applies_to === 'both' || t.applies_to === pipelineType);
    const ok = list.some((t) => String(t.id) === String(filterLeadType));
    if (!ok) setFilterLeadType('');
  }, [filterLeadType, leadTypes, pipelineType]);

  // ── Realtime: cập nhật badge SX/VC khi project thay đổi stage ──
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return;

    /**
     * Backend emit `crm:badge_updated` sau mỗi syncCrmLead*FromProject.
     * Payload: { lead_id, project_id, stage_id, sx_pipeline_stage, vc_pipeline_stage }
     */
    const badgeHandler = (payload) => {
      if (!payload?.lead_id) return;
      const lid = String(payload.lead_id);
      const patch = {};
      if (payload.sx_pipeline_stage !== undefined) patch.sx_pipeline_stage = payload.sx_pipeline_stage;
      if (payload.vc_pipeline_stage !== undefined) patch.vc_pipeline_stage = payload.vc_pipeline_stage;
      if (payload.stage_id !== undefined) patch.stage_id = payload.stage_id;
      if (Object.keys(patch).length === 0) return;

      const matchId = (row) => String(row.id) === lid;
      console.log('[CRM] badge realtime update:', lid, '→', patch.vc_pipeline_stage?.name || patch.sx_pipeline_stage?.name);
      setAllDeals((prev) => dedupeCrmKanbanRows(prev.map((d) => (matchId(d) ? { ...d, ...patch } : d))));
      setAllLeads((prev) => dedupeCrmKanbanRows(prev.map((l) => (matchId(l) ? { ...l, ...patch } : l))));
    };

    socket.on('crm:badge_updated', badgeHandler);
    return () => socket.off('crm:badge_updated', badgeHandler);
  }, []);

  /** Khi xưởng/VC đổi cột: refetch badge REST (dự phòng nếu socket chậm hoặc tab CRM mở trước khi sync xong) */
  useEffect(() => {
    const EVENT = 'crm-project-badges-refresh';
    const onRefresh = async (e) => {
      const projectId = e.detail?.projectId;
      if (!projectId) return;
      const targets = allDealsRef.current.filter(
        (d) => String(d.project_id || '') === String(projectId),
      );
      if (!targets.length) return;
      const patches = await Promise.all(
        targets.map(async (d) => {
          try {
            const { data } = await api.get(`/crm/leads/${d.id}/badge`);
            return { id: d.id, data };
          } catch {
            return null;
          }
        }),
      );
      setAllDeals((prev) => {
        const map = new Map((patches.filter(Boolean) || []).map((p) => [String(p.id), p.data]));
        if (map.size === 0) return prev;
        return dedupeCrmKanbanRows(
          prev.map((x) => {
            const badge = map.get(String(x.id));
            if (!badge) return x;
            return {
              ...x,
              sx_pipeline_stage: badge.sx_pipeline_stage ?? null,
              vc_pipeline_stage: badge.vc_pipeline_stage ?? null,
              stage_id: badge.stage_id != null ? badge.stage_id : x.stage_id,
            };
          }),
        );
      });
    };
    window.addEventListener(EVENT, onRefresh);
    return () => window.removeEventListener(EVENT, onRefresh);
  }, []);

  /** Tải thêm 1000 records tiếp theo (append, không reload lại) */
  const handleLoadMore = useCallback(async () => {
    if (loadMoreState.loading) return;
    const type = pipelineType;
    const offset = type === 'lead' ? loadMoreState.leadOffset : loadMoreState.dealOffset;
    const total = type === 'lead' ? loadMoreState.leadTotal : loadMoreState.dealTotal;
    if (total !== null && offset >= total) return; // hết rồi
    setLoadMoreState((s) => ({ ...s, loading: true }));
    try {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const common = { type, phone_filter: filterPhone || undefined, ...dateParams, limit: 1000, offset };
      if (filterAssignee) common.assigned_to = filterAssignee;
      if (filterCompany) common.company_id = filterCompany;
      if (filterLeadType) common.lead_type_id = filterLeadType;
      const res = await api.get('/crm/leads', { params: common });
      const d = res.data;
      const rows = Array.isArray(d) ? d : (d?.data || []);
      const newTotal = typeof d?.total === 'number' ? d.total : total;
      const newNextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : offset + rows.length;
      const userKey = getCurrentUserKeyForLeadSeen(user);
      const viewedLocal = getLocallyViewedLeadIdSet(userKey);
      const merged = rows.map((l) =>
        viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l,
      );
      if (type === 'lead') {
        setAllLeads((prev) => dedupeCrmKanbanRows([...prev, ...merged]));
        setLoadMoreState((s) => ({ ...s, leadOffset: newNextOffset, leadTotal: newTotal, loading: false }));
      } else {
        setAllDeals((prev) => dedupeCrmKanbanRows([...prev, ...merged]));
        setLoadMoreState((s) => ({ ...s, dealOffset: newNextOffset, dealTotal: newTotal, loading: false }));
      }
    } catch (e) {
      console.error('[loadMore]', e);
      setLoadMoreState((s) => ({ ...s, loading: false }));
    }
  }, [
    loadMoreState,
    pipelineType,
    filterPhone,
    filterAssignee,
    filterCompany,
    filterLeadType,
    customDateFrom,
    customDateTo,
    user,
  ]);

  useEffect(() => {
    if (!user?.company_id) return;
    const cid = String(user.company_id);
    setUserCompanyId(cid);
    if (!isAdmin || isCompanyScopedAdmin) {
      setFilterCompany(cid);
      try {
        setStoredCrmFilterCompanyId(cid);
      } catch {
        /* ignore */
      }
    }
  }, [user?.company_id, isAdmin, isCompanyScopedAdmin]);

  const resolvePipelineIdForCompany = useCallback((companyId) => {
    if (!companyId) return null;
    const list = pipelines || [];
    const byCompany = list.filter((p) => String(p.company_id || '') === String(companyId));
    const def = byCompany.find((p) => p.is_default);
    return (def || byCompany[0] || null)?.id || null;
  }, [pipelines]);

  /** Công ty đang áp dụng cho dashboard (admin: theo bộ lọc; user: theo company_id). */
  const dashboardScopeCompanyId = useMemo(() => {
    if (isCompanyScopedAdmin && user?.company_id) return String(user.company_id);
    if (!isAdmin && user?.company_id) return String(user.company_id);
    if (isAdmin && filterCompany) return String(filterCompany);
    return '';
  }, [isCompanyScopedAdmin, isAdmin, user?.company_id, filterCompany]);

  useEffect(() => {
    crmLiveVersionRef.current = null;
  }, [dashboardScopeCompanyId, customDateFrom, customDateTo]);

  /** Sau khi tạo Lead/Deal: cập nhật Kanban + KPI header + số SĐT — không gọi load() full trang. */
  const refreshKanbanListAfterCreate = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const common = { type, phone_filter: filterPhone || undefined, ...dateParams };
      if (filterAssignee) common.assigned_to = filterAssignee;
      if (filterCompany) common.company_id = filterCompany;
      if (filterLeadType) common.lead_type_id = filterLeadType;

      const loadAll = String(kanbanLoadLimit ?? '').trim().toLowerCase() === 'all';
      let rows = [];
      let nextOffset = 0;
      let total = null;

      try {
        if (loadAll) {
          const chunk = 1000;
          let offset = 0;
          let guard = 0;
          while (guard < 500) {
            guard += 1;
            const res = await api.get('/crm/leads', { params: { ...common, limit: chunk, offset } }).catch(() => ({ data: {} }));
            const payload = res.data || {};
            const page = Array.isArray(payload) ? payload : (payload.data || []);
            rows.push(...page);
            if (page.length === 0) break;
            const totalKnown = typeof payload.total === 'number' ? payload.total : null;
            const nextOff = typeof payload.nextOffset === 'number' ? payload.nextOffset : offset + page.length;
            const hasMore =
              typeof payload.hasMore === 'boolean'
                ? payload.hasMore
                : totalKnown != null
                  ? nextOff < totalKnown
                  : page.length >= chunk;
            if (!hasMore) break;
            offset = nextOff;
          }
          nextOffset = null;
          total = rows.length;
        } else {
          const limit = parseInt(kanbanLoadLimit, 10) || 1000;
          const res = await api.get('/crm/leads', { params: { ...common, limit, offset: 0 } }).catch(() => ({ data: {} }));
          const d = res.data;
          rows = Array.isArray(d) ? d : (d?.data || []);
          total = typeof d?.total === 'number' ? d.total : null;
          nextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : rows.length;
        }

        const userKey = getCurrentUserKeyForLeadSeen(user);
        const viewedLocal = getLocallyViewedLeadIdSet(userKey);
        const merged = dedupeCrmKanbanRows(
          rows.map((l) => (viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l)),
        );

        if (type === 'lead') {
          setAllLeads(merged);
          setLoadMoreState((s) => ({
            ...s,
            leadOffset: nextOffset ?? merged.length,
            leadTotal: total,
            loading: false,
          }));
        } else {
          setAllDeals(merged);
          setLoadMoreState((s) => ({
            ...s,
            dealOffset: nextOffset ?? merged.length,
            dealTotal: total,
            loading: false,
          }));
        }
      } catch (e) {
        console.error('[refreshKanbanListAfterCreate]', e);
      }
    },
    [
      customDateFrom,
      customDateTo,
      filterPhone,
      filterAssignee,
      filterCompany,
      filterLeadType,
      kanbanLoadLimit,
      user,
    ],
  );

  const refreshCrmDashboardSlice = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      try {
        const { data } = await api.get('/crm/dashboard', {
          params: { type, ...dateParams, ...(dashboardScopeCompanyId ? { company_id: dashboardScopeCompanyId } : {}) },
        });
        if (type === 'lead') setDataLead(data);
        else setDataDeal(data);
      } catch (e) {
        console.error('[refreshCrmDashboardSlice]', e);
      }
    },
    [customDateFrom, customDateTo, dashboardScopeCompanyId],
  );

  const refreshPipelinePhoneTotalsForType = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const co = dashboardScopeCompanyId || filterCompany;
      const buildCountParams = (phone_filter) => {
        const p = { type, ...dateParams, limit: 1, offset: 0 };
        if (filterAssignee) p.assigned_to = filterAssignee;
        if (co) p.company_id = co;
        if (filterLeadType) p.lead_type_id = filterLeadType;
        if (phone_filter) p.phone_filter = phone_filter;
        return p;
      };
      const countListTotal = (payload) => {
        const t = payload?.total;
        return typeof t === 'number' ? t : null;
      };
      try {
        const [hasRes, noRes, allRes] = await Promise.all([
          api.get('/crm/leads', { params: buildCountParams('has_phone') }).catch(() => ({ data: {} })),
          api.get('/crm/leads', { params: buildCountParams('no_phone') }).catch(() => ({ data: {} })),
          api.get('/crm/leads', { params: buildCountParams() }).catch(() => ({ data: {} })),
        ]);
        setPipelinePhoneTotals((prev) => ({
          ...prev,
          [type]: {
            hasPhone: countListTotal(hasRes.data),
            noPhone: countListTotal(noRes.data),
            all: countListTotal(allRes.data),
          },
        }));
      } catch (e) {
        console.error('[refreshPipelinePhoneTotalsForType]', e);
      }
    },
    [
      customDateFrom,
      customDateTo,
      filterAssignee,
      filterCompany,
      filterLeadType,
      dashboardScopeCompanyId,
    ],
  );

  const refreshAfterNewLeadOrDeal = useCallback(
    (type) => {
      void Promise.all([
        refreshKanbanListAfterCreate(type),
        refreshCrmDashboardSlice(type),
        refreshPipelinePhoneTotalsForType(type),
      ]);
    },
    [refreshKanbanListAfterCreate, refreshCrmDashboardSlice, refreshPipelinePhoneTotalsForType],
  );

  const scopedCompanyName = useMemo(() => {
    if (!dashboardScopeCompanyId || !companies?.length) return '';
    const c = companies.find((x) => String(x.id) === String(dashboardScopeCompanyId));
    return c?.name || '';
  }, [dashboardScopeCompanyId, companies]);

  useEffect(() => {
    if (!dashboardScopeCompanyId) {
      setCompanyRegions([]);
      return;
    }
    let cancel = false;
    api
      .get('/crm/company-regions', { params: { company_id: dashboardScopeCompanyId } })
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list);
      })
      .catch(() => {
        if (!cancel) setCompanyRegions([]);
      });
    return () => {
      cancel = true;
    };
  }, [dashboardScopeCompanyId]);

  /** Đổi công ty / danh sách khu vực → bỏ chọn uuid không còn trong danh mục (chỉ khi đã có danh mục tải về) */
  useEffect(() => {
    if (!filterRegion || filterRegion === '__none__') return;
    if (companyRegions.length === 0) return;
    const ok = companyRegions.some((reg) => String(reg.id) === String(filterRegion));
    if (!ok) setFilterRegion('');
  }, [companyRegions, filterRegion]);

  const companyHasNoPipeline = useMemo(() => {
    if (!dashboardScopeCompanyId) return false;
    const list = pipelines || [];
    return !list.some((p) => String(p.company_id || '') === String(dashboardScopeCompanyId));
  }, [dashboardScopeCompanyId, pipelines]);

  const showNoPipelineMainViews = useMemo(
    () =>
      companyHasNoPipeline &&
      (viewMode === 'kanban' || viewMode === 'list' || viewMode === 'planner'),
    [companyHasNoPipeline, viewMode],
  );

  const buildStagesParams = useCallback((type) => {
    // Admin: khi đã chọn company filter → nạp stages đúng pipeline của công ty đó
    if (isAdmin && filterCompany) {
      const pid = resolvePipelineIdForCompany(filterCompany);
      if (pid) return { type, pipeline_id: pid };
      return { type };
    }
    // Non-admin: backend đã tự scope theo company user (fallback default pipeline)
    return { type };
  }, [isAdmin, filterCompany, resolvePipelineIdForCompany]);

  useEffect(() => {
    const onSeen = (e) => {
      const seenId = e.detail?.id;
      if (!seenId) return;
      setAllLeads((prev) => prev.map((l) => (String(l.id) === String(seenId) ? { ...l, is_new_for_current_user: false } : l)));
      setAllDeals((prev) => prev.map((l) => (String(l.id) === String(seenId) ? { ...l, is_new_for_current_user: false } : l)));
    };
    window.addEventListener('crm-lead-seen', onSeen);
    return () => window.removeEventListener('crm-lead-seen', onSeen);
  }, []);

  const load = async (opts) => {
    const silent = !!(opts && opts.silent);
    if (!silent) setLoading(true);
    try {
      let resolvedCompanyId = filterCompany;
      if (isCompanyScopedAdmin && user?.company_id) {
        resolvedCompanyId = String(user.company_id);
      } else if (!isAdmin && user?.company_id) {
        resolvedCompanyId = resolvedCompanyId || String(user.company_id);
      }
      if (isAdmin && !isCompanyScopedAdmin && !resolvedCompanyId && !adminCompanyDefaultResolvedRef.current) {
        const { data: crd } = await api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: {} }));
        const list = crd?.companies || [];
        const arr = Array.isArray(list) ? list : [];
        let fromLs = '';
        try {
          fromLs = getStoredCrmFilterCompanyId();
        } catch {
          /* ignore */
        }
        resolvedCompanyId = fromLs || resolveDefaultCrmAdminCompanyId(arr);
        adminCompanyDefaultResolvedRef.current = true;
        if (resolvedCompanyId && String(resolvedCompanyId) !== String(filterCompany)) {
          setFilterCompany(resolvedCompanyId);
          try {
            setStoredCrmFilterCompanyId(resolvedCompanyId);
          } catch {
            /* ignore */
          }
        } else if (resolvedCompanyId) {
          try {
            setStoredCrmFilterCompanyId(resolvedCompanyId);
          } catch {
            /* ignore */
          }
        }
      } else if (isAdmin && !isCompanyScopedAdmin && resolvedCompanyId) {
        adminCompanyDefaultResolvedRef.current = true;
      }

      let stagesLeadParams = buildStagesParams('lead');
      let stagesDealParams = buildStagesParams('deal');
      if (isAdmin && resolvedCompanyId) {
        const { data: plsPre } = await api.get('/crm/pipelines').catch(() => ({ data: [] }));
        const plist = Array.isArray(plsPre) ? plsPre : [];
        const byCo = plist.filter((p) => String(p.company_id || '') === String(resolvedCompanyId));
        const def = byCo.find((p) => p.is_default) || byCo[0];
        const pid = def?.id;
        if (pid) {
          stagesLeadParams = { type: 'lead', pipeline_id: pid };
          stagesDealParams = { type: 'deal', pipeline_id: pid };
        }
      }

      // Build date params for API
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;

      const countListTotal = (payload) => {
        const t = payload?.total;
        return typeof t === 'number' ? t : null;
      };

      const buildCountParams = (type, phone_filter) => {
        const p = { type, ...dateParams, limit: 1, offset: 0 };
        if (filterAssignee) p.assigned_to = filterAssignee;
        if (resolvedCompanyId) p.company_id = resolvedCompanyId;
        if (filterLeadType) p.lead_type_id = filterLeadType;
        if (phone_filter) p.phone_filter = phone_filter;
        return p;
      };

      const fetchKanbanRows = async (type) => {
        const common = { type, phone_filter: filterPhone || undefined, ...dateParams };
        if (filterAssignee) common.assigned_to = filterAssignee;
        if (resolvedCompanyId) common.company_id = resolvedCompanyId;
        if (filterLeadType) common.lead_type_id = filterLeadType;
        const loadAll =
          String(kanbanLoadLimit ?? '')
            .trim()
            .toLowerCase() === 'all';
        if (loadAll) {
          const chunk = 1000;
          let offset = 0;
          const out = [];
          let guard = 0;
          while (guard < 500) {
            guard += 1;
            const res = await api.get('/crm/leads', { params: { ...common, limit: chunk, offset } }).catch(() => ({ data: {} }));
            const payload = res.data || {};
            const page = Array.isArray(payload) ? payload : (payload.data || []);
            out.push(...page);
            if (page.length === 0) break;
            const totalKnown = typeof payload.total === 'number' ? payload.total : null;
            const nextOffset =
              typeof payload.nextOffset === 'number' ? payload.nextOffset : offset + page.length;
            const hasMore =
              typeof payload.hasMore === 'boolean'
                ? payload.hasMore
                : totalKnown != null
                  ? nextOffset < totalKnown
                  : page.length >= chunk;
            if (!hasMore) break;
            offset = nextOffset;
          }
          return { rows: out, nextOffset: null, total: out.length };
        }
        const limit = parseInt(kanbanLoadLimit, 10) || 1000;
        const res = await api.get('/crm/leads', { params: { ...common, limit, offset: 0 } }).catch(() => ({ data: {} }));
        const d = res.data;
        const rows = Array.isArray(d) ? d : (d?.data || []);
        const total = typeof d?.total === 'number' ? d.total : null;
        const nextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : rows.length;
        return { rows, nextOffset, total };
      };

      const [dashLeadRes, dashDealRes, leadsRows, dealsRows, pipelinesRes, stagesLeadRes, stagesDealRes, sourcesRes, leadTypesRes, companiesRes, usersRes, lcHas, lcNo, lcAll, dcHas, dcNo, dcAll] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead', ...dateParams, ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal', ...dateParams, ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        fetchKanbanRows('lead'),
        fetchKanbanRows('deal'),
        api.get('/crm/pipelines').catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: stagesLeadParams }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: stagesDealParams }).catch(() => ({ data: [] })),
        api.get('/crm/sources', { params: { ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: [] })),
        api.get('/crm/lead-types', { params: { ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: [] })),
        api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: { companies: [] } })),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/crm/leads', { params: buildCountParams('lead', 'has_phone') }).catch(() => ({ data: {} })),
        api.get('/crm/leads', { params: buildCountParams('lead', 'no_phone') }).catch(() => ({ data: {} })),
        api.get('/crm/leads', { params: buildCountParams('lead') }).catch(() => ({ data: {} })),
        api.get('/crm/leads', { params: buildCountParams('deal', 'has_phone') }).catch(() => ({ data: {} })),
        api.get('/crm/leads', { params: buildCountParams('deal', 'no_phone') }).catch(() => ({ data: {} })),
        api.get('/crm/leads', { params: buildCountParams('deal') }).catch(() => ({ data: {} })),
      ]);
      setPipelinePhoneTotals({
        lead: {
          hasPhone: countListTotal(lcHas.data),
          noPhone: countListTotal(lcNo.data),
          all: countListTotal(lcAll.data),
        },
        deal: {
          hasPhone: countListTotal(dcHas.data),
          noPhone: countListTotal(dcNo.data),
          all: countListTotal(dcAll.data),
        },
      });
      setDataLead(dashLeadRes.data);
      setDataDeal(dashDealRes.data);
      setPipelines(
        narrowPipelinesToDefaultForCompany(
          Array.isArray(pipelinesRes.data) ? pipelinesRes.data : [],
          resolvedCompanyId || null,
        ),
      );
      const userKey = getCurrentUserKeyForLeadSeen(user);
      const viewedLocal = getLocallyViewedLeadIdSet(userKey);
      const mergeLeadSeenLocal = (rows) =>
        (rows || []).map((l) =>
          viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l,
        );
      const leadsResult = leadsRows || { rows: [], nextOffset: 0, total: null };
      const dealsResult = dealsRows || { rows: [], nextOffset: 0, total: null };
      const leadsData = Array.isArray(leadsResult) ? leadsResult : leadsResult.rows;
      const dealsData = Array.isArray(dealsResult) ? dealsResult : dealsResult.rows;
      setAllLeads(dedupeCrmKanbanRows(mergeLeadSeenLocal(leadsData)));
      setAllDeals(dedupeCrmKanbanRows(mergeLeadSeenLocal(dealsData)));
      setLoadMoreState({
        leadOffset: Array.isArray(leadsResult) ? leadsData.length : (leadsResult.nextOffset ?? leadsData.length),
        dealOffset: Array.isArray(dealsResult) ? dealsData.length : (dealsResult.nextOffset ?? dealsData.length),
        leadTotal: Array.isArray(leadsResult) ? null : leadsResult.total,
        dealTotal: Array.isArray(dealsResult) ? null : dealsResult.total,
        loading: false,
      });
      setStagesLead(stagesLeadRes.data);
      setStagesDeal(stagesDealRes.data);
      setSources(sourcesRes.data?.sources || (Array.isArray(sourcesRes.data) ? sourcesRes.data : []));
      setLeadTypes(Array.isArray(leadTypesRes.data) ? leadTypesRes.data : []);
      if (sourcesRes.data?.fb_pages) setFbPages(sourcesRes.data.fb_pages);
      setCompanies(companiesRes.data?.companies || companiesRes.data || []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || []);
    } catch (e) { console.error(e); }
    try {
      const dateParamsLv = {};
      if (customDateFrom) dateParamsLv.date_from = customDateFrom;
      if (customDateTo) dateParamsLv.date_to = customDateTo;
      const paramsLv = { ...dateParamsLv };
      if (dashboardScopeCompanyId) paramsLv.company_id = dashboardScopeCompanyId;
      const { data: lv } = await api.get('/crm/live-version', { params: paramsLv });
      if (lv && lv.v != null) crmLiveVersionRef.current = lv.v;
    } catch {
      /* ignore */
    }
    if (!silent) setLoading(false);
  };

  // ── Reload when time filter changes (debounced) ──
  const timeFilterRef = useRef(null);
  useEffect(() => {
    // Skip initial mount (load() already called above)
    if (timeFilterRef.current === null) {
      timeFilterRef.current = true;
      return;
    }
    // Only reload when we have valid dates or clearing filter
    if (timePreset === 'custom' && (!customDateFrom || !customDateTo)) return;
    load();
  }, [customDateFrom, customDateTo]);

  // ── Computed: label hiển thị cho time filter ──
  const timeFilterLabel = useMemo(() => {
    if (!timePreset) return '';
    if (timePreset === 'custom') {
      if (customDateFrom && customDateTo) {
        return `${customDateFrom} → ${customDateTo}`;
      }
      return 'Tùy chỉnh';
    }
    return TIME_PRESETS.find(p => p.key === timePreset)?.label || '';
  }, [timePreset, customDateFrom, customDateTo]);

  // ── Computed: danh sách nhân viên hiển thị trong filter ──
  // Ưu tiên companyEmployees (phòng kinh doanh), fallback users (tất cả)
  const employeeFilterList = useMemo(() => {
    if (companyEmployees.length > 0) return companyEmployees;
    return users;
  }, [companyEmployees, users]);

  const employeeOptionsFiltered = useMemo(() => {
    const q = assigneeListSearch.trim().toLowerCase();
    if (!q) return employeeFilterList;
    return employeeFilterList.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || pos.includes(q);
    });
  }, [employeeFilterList, assigneeListSearch]);

  /** Giữ option đang chọn trong select dù đã lọc tên (tránh select trống) */
  const employeeOptionsForSelect = useMemo(() => {
    let list = employeeOptionsFiltered;
    if (filterAssignee) {
      const fid = String(filterAssignee);
      const has = list.some((u) => String(u.id) === fid);
      if (!has) {
        const found = employeeFilterList.find((u) => String(u.id) === fid) || users.find((u) => String(u.id) === fid);
        if (found) list = [found, ...list];
      }
    }
    return list;
  }, [employeeOptionsFiltered, filterAssignee, employeeFilterList, users]);

  // ── Computed: nguồn thông minh - non-FB giữ nguyên, FB → [FB] Tên Page ──
  const smartSources = useMemo(() => {
    // Non-FB sources (chỉ đang dùng)
    const allItems = [...allLeads, ...allDeals];
    const usedIds = new Set(allItems.map(l => l.source_id).filter(Boolean));
    const nonFb = sources
      .filter(s => usedIds.has(s.id) && !(s.name || '').toLowerCase().includes('facebook'))
      .map(s => ({ id: s.id, type: 'source', label: `${s.icon || ''} ${s.name}`.trim() }));
    const seenFb = new Set();
    const fb = fbPages
      .filter(p => {
        if (!p.is_active || seenFb.has(p.page_id)) return false;
        seenFb.add(p.page_id);
        return true;
      })
      .map(p => ({ id: `fbp:${p.page_id}`, type: 'fb_page', page_id: p.page_id, label: `[FB] ${p.page_name}` }));
    return [...fb, ...nonFb];
  }, [sources, allLeads, allDeals, fbPages]);

  // ── Map grouped FB source → lead_ids ──
  const [fbPageLeadIds, setFbPageLeadIds] = useState(new Set());
  const lastFbFilter = useRef('');
  useEffect(() => {
    if (!filterSource.startsWith('fbp:')) {
      setFbPageLeadIds(new Set());
      lastFbFilter.current = '';
      return;
    }
    const pageId = filterSource.replace('fbp:', '');
    const co = filterCompany || (user?.company_id ? String(user.company_id) : '');
    const key = `${pageId}|${co}`;
    if (lastFbFilter.current === key) return;
    lastFbFilter.current = key;
    (async () => {
      try {
        const { data } = await api.get('/crm/leads-by-fb-page', {
          params: { page_id: pageId, type: pipelineType, ...(co ? { company_id: co } : {}) },
        });
        setFbPageLeadIds(new Set((data || []).map(l => l.id)));
      } catch { setFbPageLeadIds(new Set()); }
    })();
  }, [filterSource, pipelineType, filterCompany, user?.company_id]);

  // ── Client-side search + filter (instant, no API) ──
  const hasPhoneNumber = useCallback((item) => {
    return !!((item.customer?.phone && item.customer.phone.trim()) || (item.phone && item.phone.trim()));
  }, []);

  /** pipelineKind: 'lead' | 'deal' — một người phụ trách (assigned_to đồng bộ lead_owner) */
  const filterItemsForPipeline = useCallback((items, _pipelineKind) => {
    let result = items;

    // Company filter
    if (filterCompany) {
      result = result.filter((l) => String(l.company_id || '') === String(filterCompany));
    }

    // Assignee filter (UUID — so khớp cả chuỗi normalize + embed id)
    if (filterAssignee) {
      const fid = String(filterAssignee).trim().toLowerCase();
      result = result.filter((l) => {
        const ids = [l.assigned_to, l.lead_owner_id, l.assignee?.id, l.lead_owner?.id]
          .filter(Boolean)
          .map((x) => String(x).trim().toLowerCase());
        return ids.includes(fid);
      });
    }

    // Lọc theo tên NV (chỉ assignee / lead_owner, tránh trùng với tên KH ở ô tìm nhanh)
    if (filterAssigneeName.trim()) {
      const qn = filterAssigneeName.trim().toLowerCase();
      result = result.filter((l) => {
        const name = (l.assignee?.full_name || l.lead_owner?.full_name || '').toLowerCase();
        return name.includes(qn);
      });
    }

    // Source filter - FB page dùng lead IDs, non-FB dùng source_id
    if (filterSource) {
      if (filterSource.startsWith('fbp:')) {
        result = result.filter(l => fbPageLeadIds.has(l.id));
      } else {
        result = result.filter(l => l.source_id === filterSource);
      }
    }

    // Stage filter
    if (filterStage) {
      result = result.filter((l) => String(l.stage_id || '') === String(filterStage));
    }

    // Khu vực CRM (company_regions)
    if (filterRegion) {
      if (filterRegion === '__none__') {
        result = result.filter((l) => l.region_id == null || String(l.region_id).trim() === '');
      } else {
        result = result.filter((l) => String(l.region_id || '') === String(filterRegion));
      }
    }

    // Phone filter
    // Phone filter đã được ưu tiên xử lý ở backend để không bị phụ thuộc vào 500 bản ghi đầu.

    // Text search - tìm trong tên, mã, SĐT, mô tả, tên KH, email
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(l => {
        const fields = [
          l.title,
          l.code,
          l.description,
          l.install_address,
          l.customer?.full_name,
          l.customer?.phone,
          l.phone,
          l.customer?.email,
          l.customer?.address,
          l.customer?.company,
          l.assignee?.full_name,
          l.lead_owner?.full_name,
          l.source?.name,
        ].filter(Boolean).map(s => s.toLowerCase());
        return fields.some(f => f.includes(q));
      });
    }

    // Ưu tiên đẩy lead/deal có số điện thoại lên đầu danh sách trước khi render Kanban
    result = [...result].sort((a, b) => Number(hasPhoneNumber(b)) - Number(hasPhoneNumber(a)));
    return result;
  }, [searchText, filterCompany, filterAssignee, filterAssigneeName, filterSource, filterStage, filterRegion, filterPhone, fbPageLeadIds, hasPhoneNumber]);

  const leads = useMemo(() => filterItemsForPipeline(allLeads, 'lead'), [allLeads, filterItemsForPipeline]);
  const deals = useMemo(() => filterItemsForPipeline(allDeals, 'deal'), [allDeals, filterItemsForPipeline]);

  const activePipelinePhoneTotals = useMemo(
    () => pipelinePhoneTotals[pipelineType === 'lead' ? 'lead' : 'deal'],
    [pipelinePhoneTotals, pipelineType],
  );

  const leadActiveCount = useMemo(() => leads.filter(isActiveCrmPipelineItem).length, [leads]);
  const dealNegotiatingCount = useMemo(() => deals.filter(isActiveCrmPipelineItem).length, [deals]);

  /**
   * KPI "Tổng" dùng `total` từ API khi đủ bản ghi (tránh hiển thị 1000 trong khi DB có 5000).
   * Khi bật lọc chỉ trên client (tìm nhanh, cột, khu vực, nguồn, tên NV) → hiển thị số sau lọc trên dữ liệu đã tải.
   */
  const kpiUsesClientOnlyFilters = useMemo(
    () =>
      !!(
        searchText.trim() ||
        filterStage ||
        filterRegion ||
        filterSource ||
        filterAssigneeName.trim()
      ),
    [searchText, filterStage, filterRegion, filterSource, filterAssigneeName],
  );

  const leadKpiTotalCount = useMemo(() => {
    if (kpiUsesClientOnlyFilters) return leads.length;
    const t = loadMoreState.leadTotal;
    return typeof t === 'number' ? t : leads.length;
  }, [kpiUsesClientOnlyFilters, leads.length, loadMoreState.leadTotal]);

  /** KPI Deal (Tổng / Thắng / Doanh thu thắng) theo cùng bộ lọc UI như Kanban — không dùng kpis API thuần server. */
  const dealKpisFromFilters = useMemo(() => {
    const won = deals.filter((d) => dealIsWonStage(d, stagesDeal));
    const wonValue = won.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
    const totalHeadline = kpiUsesClientOnlyFilters
      ? deals.length
      : typeof loadMoreState.dealTotal === 'number'
        ? loadMoreState.dealTotal
        : deals.length;
    return {
      total_deals: totalHeadline,
      won_deals: won.length,
      won_value: wonValue,
    };
  }, [deals, stagesDeal, kpiUsesClientOnlyFilters, loadMoreState.dealTotal]);

  // Pipeline view: group leads/deals by stage
  const pipelineLead = useMemo(() => {
    if (!stagesLead.length) return [];
    return stagesLead.map((s) => ({
      ...s,
      items: leads.filter((l) => String(l.stage_id || '') === String(s.id)),
      totalValue: leads.filter((l) => String(l.stage_id || '') === String(s.id)).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
    }));
  }, [stagesLead, leads]);

  const pipelineDeal = useMemo(() => {
    if (!stagesDeal.length) return [];
    return stagesDeal.map((s) => ({
      ...s,
      items: deals.filter((l) => String(l.stage_id || '') === String(s.id)),
      totalValue: deals.filter((l) => String(l.stage_id || '') === String(s.id)).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
    }));
  }, [stagesDeal, deals]);

  const currentData = pipelineType === 'lead' ? dataLead : dataDeal;
  const currentPipeline = pipelineType === 'lead' ? pipelineLead : pipelineDeal;
  const kpis = currentData?.kpis || {};

  useEffect(() => {
    saveCrmPipelineSnapshot({
      filterCompany,
      searchText,
      filterAssignee,
      assigneeListSearch,
      filterAssigneeName,
      filterSource,
      filterStage,
      filterRegion,
      filterLeadType,
      filterPhone,
      showAdvSearch,
      pipelineType,
      pinnedTab,
      timePreset,
      customDateFrom,
      customDateTo,
      showCustomDate,
      viewMode,
      kanbanLoadLimit,
    });
    try {
      if (isAdmin) {
        setStoredCrmFilterCompanyId(filterCompany ? String(filterCompany) : '');
      }
      if (filterLeadType) localStorage.setItem(LS_CRM_DASH_LEAD_TYPE, String(filterLeadType));
      else localStorage.removeItem(LS_CRM_DASH_LEAD_TYPE);
    } catch {
      // ignore
    }
  }, [
    isAdmin,
    filterCompany,
    searchText,
    filterAssignee,
    assigneeListSearch,
    filterAssigneeName,
    filterSource,
    filterStage,
    filterRegion,
    filterLeadType,
    filterPhone,
    showAdvSearch,
    pipelineType,
    pinnedTab,
    timePreset,
    customDateFrom,
    customDateTo,
    showCustomDate,
    viewMode,
    kanbanLoadLimit,
  ]);

  useEffect(() => {
    if (loading) return;
    const id = peekCrmPipelineCardFocus();
    if (!id) return;
    const pulse = (el) => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      }, 2200);
      clearCrmPipelineCardFocus();
    };
    const tryOnce = () => {
      const el = document.querySelector(`[data-crm-pipeline-card="${id}"]`);
      if (el) {
        pulse(el);
        return true;
      }
      return false;
    };
    if (tryOnce()) return undefined;
    const t = window.setTimeout(() => {
      if (!tryOnce()) clearCrmPipelineCardFocus();
    }, 500);
    return () => clearTimeout(t);
  }, [loading, viewMode, pipelineType, currentPipeline]);

  const applyKanbanStageChange = useCallback(
    async (leadId, newStageId, extraData = {}, opts = {}) => {
      const throwOnError = !!opts.throwOnError;
      const prevLeads = allLeads;
      const prevDeals = allDeals;
      const lid = String(leadId);
      const entered = new Date().toISOString();
      if (pipelineType === 'lead') {
        setAllLeads((prev) =>
          dedupeCrmKanbanRows(prev.map((l) => (String(l.id) === lid ? { ...l, stage_id: newStageId, stage_entered_at: entered, ...extraData } : l))),
        );
      } else {
        setAllDeals((prev) =>
          dedupeCrmKanbanRows(prev.map((l) => (String(l.id) === lid ? { ...l, stage_id: newStageId, stage_entered_at: entered, ...extraData } : l))),
        );
      }
      try {
        const { data } = await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: newStageId, ...extraData });

        if (data.requires_conversion) {
          if (pipelineType === 'lead') setAllLeads(prevLeads);
          else setAllDeals(prevDeals);
          if (throwOnError) {
            throw new Error('Thao tác này cần bước chuyển đổi riêng — không áp dụng khi chuyển hàng loạt.');
          }
          return;
        }

        if (data.deal_won) {
          autoCreateProject(leadId, null);
        } else if (data.project_auto_created?.project_id) {
          setAutoCreateResult({
            project_id: data.project_auto_created.project_id,
            project_code: data.project_auto_created.project_code,
            tasks_created: data.project_auto_created.tasks_created,
          });
          setAutoCreateStatus('success');
          load();
        }
      } catch (e) {
        console.error(e);
        if (pipelineType === 'lead') setAllLeads(prevLeads);
        else setAllDeals(prevDeals);
        if (throwOnError) throw e;
      }
    },
    [pipelineType, allLeads, allDeals, load],
  );

  const handleMoveStage = useCallback(
    async (leadId, newStageId) => {
      const stages = pipelineType === 'lead' ? stagesLead : stagesDeal;
      const targetStage = stages.find((s) => s.id === newStageId);
      const stageName = String(targetStage?.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const isProductionStage = stageName.includes('san xuat');

      let extraData = {};
      if (targetStage?.is_lost) {
        const lostReason = window.prompt(`Nhập lý do thua cho ${pipelineType === 'lead' ? 'lead' : 'deal'}:`)?.trim();
        if (!lostReason) return;
        extraData.lost_reason = lostReason;
      }

      if (pipelineType === 'deal' && (targetStage?.is_won || isProductionStage)) {
        const deal = allDeals.find((d) => d.id === leadId);
        if (deal && !deal.project_id) {
          try {
            await applyKanbanStageChange(leadId, newStageId, extraData, { throwOnError: true });
            return;
          } catch (e) {
            const needsCo = e.response?.data?.requires_production_company;
            if (!needsCo) {
              console.error(e);
              window.alert(e.response?.data?.error || e.message || 'Không chuyển được giai đoạn');
              return;
            }
            setDealWonProductionError(e.response?.data?.error || '');
            const pref = isAdmin ? findDefaultAdminCrmCompanyPhucDat(productionCompaniesForSx) : '';
            const lt = deal.lead_type_id && leadTypes.find((t) => String(t.id) === String(deal.lead_type_id));
            const fromType = lt?.default_production_company_id ? String(lt.default_production_company_id) : '';
            setDealWonProductionCompanyId(
              fromType || filterCompany || (deal.company_id ? String(deal.company_id) : '') || pref,
            );
            setDealWonProductionCtx({ leadId, newStageId, extraData, targetStage, deal });
            return;
          }
        }
      }

      if (targetStage?.is_won && pipelineType === 'lead') {
        const lead = allLeads.find((l) => l.id === leadId);
        setWonAssignLeadId(leadId);
        setWonAssignUser(lead?.assigned_to || lead?.lead_owner_id || '');
        setWonAssignModal(true);
        return;
      }

      if (pipelineType === 'deal' && targetStage && !targetStage.is_lost && targetStage.create_event_on_enter) {
        const deal = allDeals.find((d) => d.id === leadId);
        if (deal) {
          setDealKanbanEventCtx({ leadId, newStageId, extraData, targetStage, deal });
          return;
        }
      }

      await applyKanbanStageChange(leadId, newStageId, extraData);
    },
    [
      pipelineType,
      stagesLead,
      stagesDeal,
      allLeads,
      allDeals,
      applyKanbanStageChange,
      isAdmin,
      filterCompany,
      productionCompaniesForSx,
      leadTypes,
    ],
  );

  /** Chuyển hàng loạt sang giai đoạn (Kanban) — không áp dụng Thắng / deal đặc biệt */
  const bulkMoveSelectedToStage = useCallback(
    async (targetStageId) => {
      const stages = pipelineType === 'lead' ? stagesLead : stagesDeal;
      const targetStage = stages.find((s) => String(s.id) === String(targetStageId));
      if (!targetStage) return;
      const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
      if (!ids.length) return;

      const stageName = String(targetStage?.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const isProductionStage = stageName.includes('san xuat');

      if (pipelineType === 'lead' && targetStage.is_won) {
        window.alert('Chuyển sang cột Thắng cần chọn người phụ trách cho từng lead. Vui lòng kéo thẻ hoặc xử lý từng lead.');
        return;
      }

      if (pipelineType === 'deal') {
        if (targetStage.is_won || isProductionStage) {
          window.alert('Không hỗ trợ chuyển hàng loạt sang giai đoạn Thắng / Sản xuất — vui lòng kéo từng deal.');
          return;
        }
        if (targetStage.create_event_on_enter) {
          window.alert('Giai đoạn này yêu cầu đặt lịch khi vào — vui lòng kéo từng deal.');
          return;
        }
      }

      if (targetStage.is_lost) {
        const lostReason = window.prompt(`Nhập lý do thua (áp dụng cho ${ids.length} ${pipelineType === 'deal' ? 'deal' : 'lead'}):`)?.trim();
        if (!lostReason) return;
        setBulkMoving(true);
        try {
          for (const id of ids) {
            await applyKanbanStageChange(id, targetStageId, { lost_reason: lostReason }, { throwOnError: true });
          }
          setManualMergeIds([]);
          setBulkStageTarget('');
          await loadRef.current?.();
        } catch (e) {
          window.alert(e.response?.data?.error || e.message || 'Lỗi chuyển giai đoạn');
        } finally {
          setBulkMoving(false);
        }
        return;
      }

      setBulkMoving(true);
      try {
        for (const id of ids) {
          await applyKanbanStageChange(id, targetStageId, {}, { throwOnError: true });
        }
        setManualMergeIds([]);
        setBulkStageTarget('');
        await loadRef.current?.();
      } catch (e) {
        window.alert(e.response?.data?.error || e.message || 'Lỗi chuyển giai đoạn');
      } finally {
        setBulkMoving(false);
      }
    },
    [pipelineType, stagesLead, stagesDeal, manualMergeIds, applyKanbanStageChange],
  );

  const confirmDealWonProduction = async () => {
    if (!dealWonProductionCompanyId) {
      setDealWonProductionError('Vui lòng chọn công ty thuộc module Sản xuất.');
      return;
    }
    const ctx = dealWonProductionCtx;
    if (!ctx) return;
    setDealWonProductionError('');
    const nextExtra = { ...ctx.extraData, production_company_id: dealWonProductionCompanyId };
    setDealWonProductionCtx(null);
    setDealWonProductionCompanyId('');
    if (ctx.targetStage.create_event_on_enter) {
      setDealKanbanEventCtx({
        leadId: ctx.leadId,
        newStageId: ctx.newStageId,
        extraData: nextExtra,
        targetStage: ctx.targetStage,
        deal: ctx.deal,
      });
    } else {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, nextExtra);
    }
  };

  const submitDealAutoCreateCompanyPick = async () => {
    if (!dealAutoCreateCompanyId) {
      setDealAutoCreatePickError('Vui lòng chọn công ty Sản xuất.');
      return;
    }
    const dealId = dealAutoCreatePick;
    const cid = dealAutoCreateCompanyId;
    if (!dealId) return;
    setDealAutoCreatePickError('');
    setDealAutoCreatePick(null);
    setDealAutoCreateCompanyId('');
    autoCreateCalledRef.current = false;
    await autoCreateProject(dealId, cid);
  };

  const handleWonAssignConvert = async () => {
    if (!wonAssignUser) { setWonAssignError('Vui lòng chọn nhân viên phụ trách'); return; }
    setWonAssigning(true);
    setWonAssignError('');
    const lead = allLeads.find(l => l.id === wonAssignLeadId);
    try {
      await api.post(`/crm/leads/${wonAssignLeadId}/convert-to-deal`, {
        assigned_to: wonAssignUser,
        company_id: lead?.company_id || undefined,
      });
      setWonAssignModal(false);
      const snap = loadCrmPipelineSnapshot();
      saveCrmPipelineSnapshot({ ...(snap || {}), pipelineType: 'deal' });
      markCrmPipelineCardFocus(wonAssignLeadId);
      setPipelineType('deal');
      load();
    } catch (e) {
      setWonAssignError(e.response?.data?.error || 'Lỗi chuyển sang Deal');
    } finally {
      setWonAssigning(false);
    }
  };

  const confirmDealKanbanEvent = async ({ startIso, endIso, titlePreview, locPreview }) => {
    const ctx = dealKanbanEventCtx;
    if (!ctx) return;
    setDealKanbanEventBusy(true);
    try {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, ctx.extraData, { throwOnError: true });
      await api.post('/events', {
        title: titlePreview,
        description: ctx.deal?.description || null,
        location: locPreview && locPreview !== '—' ? locPreview : null,
        start_time: startIso,
        end_time: endIso,
        lead_id: ctx.leadId,
        customer_id: ctx.deal?.customer_id || null,
        assignee_id: ctx.deal?.assigned_to || ctx.deal?.lead_owner_id || null,
        event_type: 'site_visit',
        status: 'planned',
      });
      setDealKanbanEventCtx(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật giai đoạn / tạo sự kiện');
    } finally {
      setDealKanbanEventBusy(false);
    }
  };

  const skipDealKanbanEvent = async () => {
    const ctx = dealKanbanEventCtx;
    if (!ctx) return;
    setDealKanbanEventBusy(true);
    try {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, ctx.extraData, { throwOnError: true });
      setDealKanbanEventCtx(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật giai đoạn');
    } finally {
      setDealKanbanEventBusy(false);
    }
  };

  loadRef.current = load;

  /**
   * Đồng bộ nhẹ: poll GET /crm/live-version (~vài chục byte). Chỉ khi v thay đổi mới gọi load({ silent }).
   * Tab ẩn: chu kỳ dài hơn; tab hiện: ~45s. Focus lại tab có thể chạy một lần ngay.
   */
  useEffect(() => {
    /** Cứ 2 phút tự reload ngầm một lần khi tab đang hiện; tab ẩn thì bỏ qua. */
    const POLL_MS = 120_000;
    let intervalId = null;
    const clearInt = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const runTick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        await loadRef.current?.({ silent: true });
      } catch {
        /* ignore */
      }
    };
    clearInt();
    intervalId = setInterval(() => void runTick(), POLL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void runTick();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      clearInt();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [dashboardScopeCompanyId, customDateFrom, customDateTo]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày';
    if (days < 7) return `${days} ngày`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const compactLeadUi = pipelineType === 'lead';
  const ctrlH = compactLeadUi ? 'h-9' : 'h-10';
  const ctrlTxt = compactLeadUi ? 'text-xs' : 'text-sm';

  return (
    <div className={`min-h-screen bg-gray-50 ${compactLeadUi ? 'space-y-3' : 'space-y-6'}`}>
      {/* Auto-create project banner */}
      {autoCreateStatus === 'loading' && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white shadow-lg flex items-center gap-4">
          <div className="animate-spin h-8 w-8 border-3 border-white/30 border-t-white rounded-full flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">🚀 Đang tự động tạo dự án...</p>
            <p className="text-sm text-white/80">Deal thắng - hệ thống đang tạo dự án và phân công nhiệm vụ</p>
          </div>
        </div>
      )}
      {autoCreateStatus === 'success' && autoCreateResult && (
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-xl p-4 text-white shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-full text-xl">✅</div>
            <div>
              <p className="font-bold text-lg">Dự án {autoCreateResult.project_code || ''} đã tạo!</p>
              <p className="text-sm text-white/90">{autoCreateResult.tasks_created || 0} nhiệm vụ được tạo tự động</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAutoCreateStatus(null)}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              Đóng
            </button>
            <button onClick={() => navigate(`/sx/projects/${autoCreateResult.project_id}`)}
              className="h-9 px-4 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-sm font-semibold cursor-pointer transition">
              Xem xưởng →
            </button>
            <button onClick={() => navigate(`/projects/${autoCreateResult.project_id}`)}
              className="h-9 px-4 bg-white/90 text-gray-800 hover:bg-white rounded-lg text-sm font-medium cursor-pointer transition">
              Dự án đầy đủ
            </button>
          </div>
        </div>
      )}
      {autoCreateStatus === 'error' && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-4 text-white shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-full text-xl">❌</div>
            <div>
              <p className="font-bold">Lỗi tạo dự án</p>
              <p className="text-sm text-white/80">{autoCreateError}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { autoCreateCalledRef.current = false; setAutoCreateStatus(null); }}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              Đóng
            </button>
          </div>
        </div>
      )}
      {/* Header — tab Lead: gọn hơn để nhường chỗ Kanban */}
      <div className={`flex items-center justify-between px-0 ${compactLeadUi ? 'gap-2' : ''}`}>
        <div>
          <div className={`flex items-center gap-2 ${compactLeadUi ? 'mb-0.5' : 'mb-2'}`}>
            <span className={`text-gray-500 font-semibold ${compactLeadUi ? 'text-[10px]' : 'text-xs'}`}>CRM / Quản lý khách hàng</span>
          </div>
          <h1 className={`font-bold text-gray-900 ${compactLeadUi ? 'text-xl sm:text-2xl' : 'text-3xl'}`}>
            {pipelineType === 'lead' ? '💼 Quản lý Leads' : '🎯 Quản lý Deals'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/trash')}
            className={`border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${compactLeadUi ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'}`}
            title="Xem lead/deal đã xóa"
          >
            <Trash2 className={compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Thùng rác
          </button>
          <button data-tour="add-lead" onClick={() => pipelineType === 'lead' ? setShowNewLead(true) : setShowNewDeal(true)} className={`bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 ${compactLeadUi ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm'}`}>
            <Plus className={compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> + Thêm {pipelineType === 'lead' ? 'Lead' : 'Deal'}
          </button>
        </div>
      </div>

      {/* Pill-style Tab Switcher + Pin */}
      <div className={`flex items-center ${compactLeadUi ? 'gap-2' : 'gap-3'}`}>
        <div data-tour="pipeline-tabs" className={`inline-flex gap-1 bg-gray-200 rounded-full ${compactLeadUi ? 'p-0.5' : 'p-1'}`}>
          <button
            onClick={() => switchTab('lead')}
            className={`rounded-full font-medium transition-all duration-200 flex items-center gap-1.5 ${compactLeadUi ? 'px-3 py-1.5 text-xs' : 'px-6 py-2 text-sm'} ${pipelineType === 'lead' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            💼 Leads ({leads.length}) {pinnedTab === 'lead' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
          <button
            onClick={() => switchTab('deal')}
            className={`rounded-full font-medium transition-all duration-200 flex items-center gap-1.5 ${compactLeadUi ? 'px-3 py-1.5 text-xs' : 'px-6 py-2 text-sm'} ${pipelineType === 'deal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🎯 Deals ({deals.length}) {pinnedTab === 'deal' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
        </div>
        <button
          onClick={() => togglePinTab(pipelineType)}
          title={pinnedTab === pipelineType ? `Bỏ ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'}` : `Ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'} - mở CRM sẽ vào thẳng`}
          className={`rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${compactLeadUi ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'} ${pinnedTab === pipelineType ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 border border-gray-200'}`}
        >
          <Pin className={`${compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${pinnedTab === pipelineType ? 'rotate-45' : ''}`} />
          {pinnedTab === pipelineType ? 'Đã ghim' : 'Ghim'}
        </button>
      </div>

      {/* Search & Filters */}
      <div className={compactLeadUi ? 'space-y-2' : 'space-y-3'}>
        <div className={`flex flex-wrap items-center ${compactLeadUi ? 'gap-2' : 'gap-3'}`}>
          {/* Search with instant results dropdown */}
          <div className="relative flex-1 min-w-[200px] max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              placeholder={`🔍 Tìm nhanh: tên, SĐT, mã, mô tả, người phụ trách...`}
              className={`w-full ${ctrlH} pl-9 pr-8 bg-white border border-gray-200 rounded-xl ${ctrlTxt} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm`}
            />
            {searchText && (
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setSearchText(''); setSearchFocused(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Instant search results dropdown — chỉ hiện khi ô tìm đang focus */}
            {searchFocused && searchText.trim().length >= 2 && (pipelineType === 'lead' ? leads : deals).length > 0 && (pipelineType === 'lead' ? leads : deals).length <= 10 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2 border-b bg-gray-50 rounded-t-xl">
                  <p className="text-[11px] text-gray-500 font-medium">
                    ⚡ {(pipelineType === 'lead' ? leads : deals).length} kết quả cho "{searchText}"
                  </p>
                </div>
                {(pipelineType === 'lead' ? leads : deals).map(item => (
                  <Link key={item.id} to={`/crm/leads/${item.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition cursor-pointer border-b border-gray-50 last:border-0"
                    data-crm-pipeline-card={item.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      markCrmPipelineCardFocus(item.id);
                      setSearchText('');
                      setSearchFocused(false);
                    }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{item.code}</span>
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        {item.is_new_for_current_user && (
                          <span className="shrink-0 text-[9px] font-bold uppercase text-white bg-rose-500 px-1.5 py-0.5 rounded">Mới</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.customer?.phone && <span className="text-[10px] text-green-600">📞 {item.customer.phone}</span>}
                        {item.customer?.full_name && <span className="text-[10px] text-gray-500">👤 {item.customer.full_name}</span>}
                        {item.assignee?.full_name && <span className="text-[10px] text-blue-500">🤝 {item.assignee.full_name}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── TIME FILTER DROPDOWN ── */}
          <div className="relative">
            <select
              value={timePreset}
              onChange={e => handleTimePresetChange(e.target.value)}
              className={`${ctrlH} px-3 pl-9 rounded-xl ${ctrlTxt} font-medium cursor-pointer transition-all border appearance-none pr-8 ${
                timePreset
                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              style={{ minWidth: compactLeadUi ? '140px' : '160px' }}
            >
              {TIME_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${timePreset ? 'text-purple-500' : 'text-gray-400'}`} />
          </div>

          {/* Số bản ghi pipeline (lead + deal) tải từ API */}
          <div className="relative" title="Giới hạn số lead/deal tải cho Kanban (mỗi loại). Tải tất cả = gọi API lặp theo trang tối đa 5000/trang.">
            <select
              value={kanbanLoadLimit}
              onChange={(e) => {
                const v = e.target.value;
                setKanbanLoadLimit(v);
                localStorage.setItem('crm_kanban_load_limit', v);
              }}
              className={`${ctrlH} px-3 pl-9 rounded-xl ${ctrlTxt} font-medium cursor-pointer transition-all border appearance-none pr-8 bg-white text-gray-700 border-gray-200 hover:bg-gray-50`}
              style={{ minWidth: compactLeadUi ? '142px' : '158px' }}
            >
              <option value="500">📥 Tải 500</option>
              <option value="1000">📥 Tải 1.000</option>
              <option value="2000">📥 Tải 2.000</option>
              <option value="all">📥 Tải tất cả</option>
            </select>
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>


          {/* Toggle advanced filters */}
          <button onClick={() => setShowAdvSearch(!showAdvSearch)}
            className={`h-10 px-4 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer transition-all border ${
              showAdvSearch || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterPhone
                ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            <Filter className="h-4 w-4" />
            Bộ lọc
            {(filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterPhone === 'no_phone') && (
              <span className="bg-blue-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {[filterAssignee, filterAssigneeName, filterCompany, filterSource, filterStage, filterRegion, filterLeadType, filterPhone === 'no_phone' ? filterPhone : ''].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear all filters */}
          {(searchText || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterPhone !== 'has_phone' || timePreset) && (
            <button onClick={() => {
              setSearchText('');
              setFilterAssignee('');
              setAssigneeListSearch('');
              setFilterAssigneeName('');
              setFilterCompany('');
              setFilterSource('');
              setFilterStage('');
              setFilterRegion('');
              setFilterLeadType('');
              setFilterPhone('has_phone');
              handleTimePresetChange('');
              try {
                setStoredCrmFilterCompanyId('');
                localStorage.removeItem(LS_CRM_DASH_LEAD_TYPE);
              } catch {
                // ignore
              }
            }}
              className="h-10 px-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all border border-red-200">
              <X className="h-3.5 w-3.5" /> Xóa bộ lọc
            </button>
          )}

          {/* Result count */}
          {(searchText || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterPhone === 'no_phone' || timePreset) && (
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">
              {pipelineType === 'lead' ? leads.length : deals.length} / {pipelineType === 'lead' ? allLeads.length : allDeals.length} trên Kanban
              {activePipelinePhoneTotals?.all != null && filterPhone && (
                <span className="text-gray-600"> · tổng khớp lọc SĐT (API): {(filterPhone === 'has_phone' ? activePipelinePhoneTotals.hasPhone : activePipelinePhoneTotals.noPhone)?.toLocaleString('vi-VN') ?? '—'}</span>
              )}
            </span>
          )}
        </div>

        {/* ── CUSTOM DATE RANGE PICKER ── */}
        {showCustomDate && (
          <div className="flex flex-wrap items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl p-3 shadow-sm">
            <span className="text-xs font-bold text-purple-600 uppercase flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Khoảng thời gian:
            </span>
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-9 px-3 bg-white border border-purple-200 rounded-lg text-sm hover:bg-purple-50 cursor-pointer"
              title="Chọn khoảng ngày"
            >
              {customDateFrom && customDateTo ? `${customDateFrom} → ${customDateTo}` : 'Chọn ngày bắt đầu/kết thúc'}
            </button>
            <button
              onClick={() => { handleTimePresetChange(''); }}
              className="h-9 px-3 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg text-sm transition cursor-pointer border border-gray-200"
            >
              Hủy
            </button>
          </div>
        )}

        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tuỳ chỉnh"
          from={customDateFrom}
          to={customDateTo}
          onChange={({ from, to }) => {
            setCustomDateFrom(from);
            setCustomDateTo(to);
            if (from && to) window.setTimeout(() => load(), 0);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />

        {/* ── ACTIVE TIME FILTER BADGE ── */}
        {timePreset && timePreset !== 'custom' && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium border border-purple-200">
              <Clock className="h-3 w-3" />
              {timeFilterLabel}
              <button onClick={() => handleTimePresetChange('')} className="ml-1 hover:text-purple-900 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* Advanced filters row */}
        {showAdvSearch && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            {/* Row 1: Nhân viên */}
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-1">NV</span>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Tìm NV</label>
                <input
                  type="search"
                  value={assigneeListSearch}
                  onChange={(e) => setAssigneeListSearch(e.target.value)}
                  placeholder="Gõ tên, email…"
                  className="h-8 w-36 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Chọn NV</label>
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                  title={!seesAllCrmDeals && pipelineType === 'deal' ? 'Deal: chỉ hiển thị deal do bạn phụ trách.' : undefined}
                  className={`h-8 w-44 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${!seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <option value="">Tất cả nhân viên</option>
                  {companyDepts.length > 0 ? (
                    companyDepts.map((dept) => {
                      const deptUsers = employeeOptionsForSelect.filter((u) => u.department_id === dept.id);
                      if (!deptUsers.length) return null;
                      return (
                        <optgroup key={dept.id} label={`📁 ${dept.name}`}>
                          {deptUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.full_name}{u.position ? ` (${u.position})` : ''}</option>
                          ))}
                        </optgroup>
                      );
                    })
                  ) : (
                    employeeOptionsForSelect.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)
                  )}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Tên NV trên pipeline</label>
                <input
                  type="search"
                  value={filterAssigneeName}
                  onChange={(e) => setFilterAssigneeName(e.target.value)}
                  disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                  placeholder="Tên người phụ trách…"
                  title={!seesAllCrmDeals && pipelineType === 'deal' ? 'Deal: lọc NV đã cố định theo tài khoản của bạn.' : ''}
                  className={`h-8 w-44 px-2 bg-amber-50/80 border border-amber-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 ${!seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              {companyDepts.length > 0 && (
                <span className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100 self-end">
                  {companyEmployees.length} NV
                </span>
              )}
            </div>

            {/* Row 2: Công ty · Nguồn · Giai đoạn · Khu vực · Loại · SĐT */}
            <div className="flex flex-wrap items-end gap-2">
              {/* Company */}
              {isAdmin && !isCompanyScopedAdmin && companies.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Công ty</label>
                  <select
                    value={filterCompany}
                    onChange={e => setFilterCompany(e.target.value)}
                    className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                  >
                    <option value="">Tất cả công ty</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                  </select>
                </div>
              )}
              {!isAdmin && userCompanyId && (
                <span className="h-8 inline-flex items-center px-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 self-end">
                  🏢 Công ty của bạn
                </span>
              )}
              {isCompanyScopedAdmin && userCompanyId && (
                <span className="h-8 inline-flex items-center px-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800 self-end" title="Admin phạm vi một công ty">
                  🏢 {companies.find((c) => String(c.id) === String(userCompanyId))?.short_name
                    || companies.find((c) => String(c.id) === String(userCompanyId))?.name
                    || 'Công ty của bạn'}
                </span>
              )}

              {/* Source */}
              {smartSources.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Nguồn</label>
                  <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                    className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                    <option value="">Tất cả nguồn</option>
                    {smartSources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              )}

              {/* Stage */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Giai đoạn</label>
                <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                  className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                  <option value="">Tất cả giai đoạn</option>
                  {(pipelineType === 'lead' ? stagesLead : stagesDeal).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Region */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Khu vực</label>
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  disabled={!dashboardScopeCompanyId}
                  title={!dashboardScopeCompanyId ? 'Chọn phạm vi công ty để lọc theo khu vực' : 'Lọc theo khu vực'}
                  className={`h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    dashboardScopeCompanyId ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <option value="">Tất cả khu vực</option>
                  <option value="__none__">Chưa gán khu vực</option>
                  {companyRegions.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.is_active === false ? '· ' : ''}{reg.name}{reg.code ? ` (${reg.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead/Deal type */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Phân loại</label>
                <div className="flex items-center gap-1">
                  <select
                    value={filterLeadType}
                    onChange={e => setFilterLeadType(e.target.value)}
                    disabled={leadTypes.length === 0}
                    className={`h-8 w-36 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                      leadTypes.length === 0 ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    title={leadTypes.length === 0 ? 'Chưa cấu hình phân loại' : 'Lọc theo phân loại'}
                  >
                    <option value="">{leadTypes.length === 0 ? 'Chưa cấu hình' : 'Tất cả loại'}</option>
                    {leadTypes
                      .filter((t) => t.applies_to === 'both' || t.applies_to === pipelineType)
                      .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {leadTypes.length === 0 && (
                    <button
                      onClick={() => navigate('/crm/pipeline-settings')}
                      className="h-8 px-2 rounded-lg text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                      title="Mở Pipeline Settings để thêm phân loại"
                    >
                      Cấu hình
                    </button>
                  )}
                </div>
              </div>

              {/* Phone filter */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">SĐT</label>
                <select value={filterPhone} onChange={e => setFilterPhone(e.target.value)}
                  className={`h-8 w-32 px-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                    filterPhone === 'has_phone' ? 'bg-green-50 border-green-300 text-green-700' :
                    filterPhone === 'no_phone'  ? 'bg-red-50 border-red-300 text-red-700' : 'bg-gray-50 border-gray-200'
                  }`}>
                  <option value="has_phone">✅ Có SĐT</option>
                  <option value="no_phone">❌ Chưa có SĐT</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI — hàng ngang trong từng ô, min-w-0 để 4 cột chia đều không chừa khoảng trống */}
      <div
        data-tour="crm-kpis"
        className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-1.5"
      >
        {pipelineType === 'lead' ? (
          <>
            <KPICard
              compact
              icon={<Target className="h-3 w-3" />}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
              label="Tổng Lead"
              value={leadKpiTotalCount}
              sublabel={kpiUsesClientOnlyFilters ? 'Sau lọc (trên bản ghi đã tải)' : undefined}
              trend={null}
            />
            <KPICard
              compact
              icon={<Zap className="h-3 w-3" />}
              iconBgColor="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Đang xử lý"
              value={leadActiveCount}
              trend={null}
            />
            <KPICard
              compact
              icon={<CheckCircle2 className="h-3 w-3" />}
              iconBgColor="bg-purple-100"
              iconColor="text-purple-600"
              label="Chuyển Deal"
              value={kpis.converted_to_deals || 0}
              trend={null}
            />
            <KPICard
              compact
              icon={<Percent className="h-3 w-3" />}
              iconBgColor="bg-amber-100"
              iconColor="text-amber-600"
              label="Tỷ lệ chuyển đổi"
              value={`${kpis.conversion_rate || 0}%`}
              trend={null}
            />
          </>
        ) : (
          <>
            <KPICard
              icon={<Zap className="h-3.5 w-3.5" />}
              iconBgColor="bg-cyan-100"
              iconColor="text-cyan-600"
              label="Tổng Deal"
              value={dealKpisFromFilters.total_deals}
              sublabel={kpiUsesClientOnlyFilters ? 'Sau lọc (trên bản ghi đã tải)' : undefined}
              trend={null}
            />
            <KPICard
              icon={<FileText className="h-3.5 w-3.5" />}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
              label="Đang đàm phán"
              value={dealNegotiatingCount}
              trend={null}
            />
            <KPICard
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
              label="Thắng"
              value={dealKpisFromFilters.won_deals}
              trend={null}
            />
            <KPICard
              icon={<DollarSign className="h-3.5 w-3.5" />}
              iconBgColor="bg-amber-100"
              iconColor="text-amber-600"
              label="Doanh thu thắng"
              value={formatVND(dealKpisFromFilters.won_value)}
              trend={null}
            />
          </>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className={`flex items-center gap-1 ${compactLeadUi ? 'mb-2' : 'mb-3'}`}>
        {[
          { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
          { id: 'list', icon: List, label: 'Danh sách' },
          { id: 'planner', icon: Users, label: 'Planner' },
          { id: 'calendar', icon: Calendar, label: 'Lịch' },
        ].map(v => (
          <button key={v.id} onClick={() => setViewMode(v.id)}
            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <v.icon className="h-3.5 w-3.5" />{v.label}
          </button>
        ))}
      </div>

      {showNoPipelineMainViews ? (
        <div
          data-tour="crm-no-pipeline"
          className="rounded-xl border border-amber-200 bg-amber-50/90 px-6 py-10 sm:px-10 sm:py-12 text-center shadow-sm"
        >
          <Building2 className="h-12 w-12 mx-auto text-amber-600 mb-4 opacity-90" />
          <h2 className="text-lg sm:text-xl font-bold text-amber-950 mb-2">Chưa có pipeline CRM cho công ty này</h2>
          {scopedCompanyName && (
            <p className="text-sm font-medium text-amber-900/85 mb-3">{scopedCompanyName}</p>
          )}
          <p className="text-sm text-amber-900/90 max-w-lg mx-auto mb-6 leading-relaxed">
            Khi chưa tạo pipeline (và các giai đoạn Lead/Deal), Kanban không có cột nên nhìn như trống. Hãy cấu hình pipeline trước, sau đó tải lại trang.
          </p>
          {isAdmin ? (
            <Link
              to="/crm/pipeline-settings"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shadow-sm transition-colors"
            >
              Mở cài đặt pipeline
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <p className="text-sm text-amber-900/85 max-w-md mx-auto">
              Vui lòng liên hệ quản trị viên để tạo pipeline và các giai đoạn cho công ty bạn.
            </p>
          )}
        </div>
      ) : (
        <>
          {viewMode === 'kanban' && manualMergeIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <GitMerge className="h-4 w-4 text-amber-700 shrink-0" />
              <span className="text-amber-900">
                Đã chọn <strong>{manualMergeIds.length}</strong> {pipelineType === 'deal' ? 'deal' : 'lead'}
                {manualMergeIds.length < 2 && <span className="text-amber-700/80"> — chọn ít nhất 2 để gộp</span>}
              </span>
              {manualMergeIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setManualMergeModalOpen(true)}
                  className="h-9 px-4 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 cursor-pointer shadow-sm"
                >
                  Gộp đã chọn
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setBulkAssignModalOpen(true)}
                  className="h-9 px-4 rounded-lg bg-white border border-amber-400 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  Gán phụ trách
                </button>
              )}
              <button
                type="button"
                onClick={bulkDeleteSelected}
                disabled={bulkDeleting}
                className="h-9 px-4 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                {bulkDeleting ? 'Đang xóa…' : `Xóa (${manualMergeIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setManualMergeIds([])}
                className="h-9 px-3 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100 cursor-pointer"
              >
                Bỏ chọn
              </button>
              <span className="hidden sm:block w-px h-6 shrink-0 bg-amber-300/70 self-center" aria-hidden />
              <span className="text-xs font-semibold text-amber-900 shrink-0 whitespace-nowrap">Chuyển sang giai đoạn:</span>
              <select
                value={bulkStageTarget}
                onChange={(e) => setBulkStageTarget(e.target.value)}
                disabled={bulkMoving}
                className="h-9 min-w-[min(100%,12rem)] sm:min-w-[200px] max-w-full px-3 rounded-lg border border-amber-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
              >
                <option value="">— Chọn cột đích —</option>
                {(pipelineType === 'lead' ? stagesLead : stagesDeal).map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.icon ? `${s.icon} ` : '')}{s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkStageTarget || bulkMoving}
                onClick={() => bulkMoveSelectedToStage(bulkStageTarget)}
                className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {bulkMoving ? 'Đang chuyển…' : 'Chuyển'}
              </button>
            </div>
          )}

          {/* Kanban View */}
          {viewMode === 'kanban' && (
          <div data-tour="kanban-pipeline" className="rounded-xl overflow-hidden">
            <KanbanView
              pipeline={currentPipeline}
              onMoveStage={handleMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={manualMergeIds}
              onToggleMergeSelect={toggleManualMergeSelect}
              onToggleSelectAllInColumn={toggleSelectAllInColumn}
              compact={pipelineType === 'lead'}
            />
            {/* Nút Tải thêm 1000 */}
            {kanbanLoadLimit !== 'all' && (() => {
              const offset = pipelineType === 'lead' ? loadMoreState.leadOffset : loadMoreState.dealOffset;
              const total = pipelineType === 'lead' ? loadMoreState.leadTotal : loadMoreState.dealTotal;
              const loaded = pipelineType === 'lead' ? allLeads.length : allDeals.length;
              const hasMore = total === null || offset < total;
              if (!hasMore) return null;
              return (
                <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
                  <span className="text-xs text-gray-500">
                    Đã tải <span className="font-semibold text-gray-700">{loaded.toLocaleString()}</span>
                    {total !== null && <> / <span className="font-semibold text-indigo-600">{total.toLocaleString()}</span> lead</>}
                  </span>
                  <button
                    onClick={handleLoadMore}
                    disabled={loadMoreState.loading}
                    className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors"
                  >
                    {loadMoreState.loading
                      ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Đang tải...</>
                      : <>📥 Tải thêm 1.000 {pipelineType === 'lead' ? 'lead' : 'deal'}</>
                    }
                  </button>
                  <button
                    onClick={() => { setKanbanLoadLimit('all'); localStorage.setItem('crm_kanban_load_limit', 'all'); }}
                    className="h-8 px-3 border border-gray-200 bg-white text-xs text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Tải tất cả
                  </button>
                </div>
              );
            })()}
          </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <ListView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
              calculateDays={calculateDays}
            />
          )}

          {/* Planner View */}
          {viewMode === 'planner' && (
            <PlannerView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
              users={users}
            />
          )}
        </>
      )}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Chức năng Lịch đang được phát triển</p>
        </div>
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onSuccess={() => refreshAfterNewLeadOrDeal('lead')}
          leadTypes={leadTypes}
          companies={companies}
          type={pipelineType}
          defaultCompanyId={isAdmin ? (filterCompany || user?.company_id || '') : (user?.company_id ? String(user.company_id) : '')}
          currentUser={user}
        />
      )}
      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onSuccess={() => refreshAfterNewLeadOrDeal('deal')}
          leadTypes={leadTypes}
          companies={companies}
          defaultCompanyId={isAdmin ? (filterCompany || user?.company_id || '') : (user?.company_id ? String(user.company_id) : '')}
          currentUser={user}
        />
      )}

      {/* Modal chọn người phụ trách khi kéo Lead sang cột Thắng */}
      {wonAssignModal && (() => {
        const wonLead = allLeads.find(l => l.id === wonAssignLeadId);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { if (!wonAssigning) { setWonAssignModal(false); setWonAssignError(''); } }}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🏆</span>
                <h3 className="text-base font-bold text-gray-900">Chuyển sang Deal</h3>
              </div>

              {/* Thông tin lead */}
              {wonLead && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4 mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Lead:</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{wonLead.title}</p>
                  {wonLead.customer?.full_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      👤 {wonLead.customer.full_name}
                      {wonLead.customer.phone && <span className="ml-2 text-green-600">📞 {wonLead.customer.phone}</span>}
                      {!wonLead.customer.phone && <span className="ml-2 text-amber-500">⚠️ Chưa có SĐT</span>}
                    </p>
                  )}
                  {!wonLead.customer_id && (
                    <p className="text-xs text-red-500 mt-0.5 font-medium">⛔ Chưa liên kết khách hàng — cần vào chi tiết Lead để thêm trước</p>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">👤 Người phụ trách deal</label>
                <EmployeePicker
                  companyId={wonLead?.company_id}
                  value={wonAssignUser}
                  onChange={(userId) => { setWonAssignUser(userId || ''); setWonAssignError(''); }}
                  placeholder="Tìm và chọn nhân viên..."
                  size="md"
                />
                {!wonLead?.company_id && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — hiển thị toàn bộ nhân viên</p>
                )}
              </div>

              {/* Lỗi inline */}
              {wonAssignError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  ⛔ {wonAssignError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setWonAssignModal(false); setWonAssignError(''); }}
                  disabled={wonAssigning}
                  className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleWonAssignConvert}
                  disabled={wonAssigning || !wonAssignUser || !wonLead?.customer_id}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {wonAssigning ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Đang xử lý...</>
                  ) : (
                    <>✅ Xác nhận & Chuyển Deal</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {dealWonProductionCtx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { setDealWonProductionCtx(null); setDealWonProductionError(''); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Chọn công ty Sản xuất</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Deal <span className="font-mono text-teal-700">{dealWonProductionCtx.deal?.code}</span> chuyển sang <strong>Thắng</strong>.
              Chọn công ty thuộc <strong>module Sản xuất</strong> để gắn cho dự án xưởng (bắt buộc).
            </p>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Công ty Sản xuất</label>
            <select
              value={dealWonProductionCompanyId}
              onChange={(e) => { setDealWonProductionCompanyId(e.target.value); setDealWonProductionError(''); }}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-2"
            >
              <option value="">— Chọn công ty —</option>
              {productionCompaniesForSx.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
            {dealWonProductionError && (
              <p className="text-xs text-red-600 mb-3">{dealWonProductionError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => { setDealWonProductionCtx(null); setDealWonProductionError(''); }}
              >
                Hủy
              </button>
              <button
                type="button"
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => confirmDealWonProduction()}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      {dealAutoCreatePick && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { setDealAutoCreatePick(null); setDealAutoCreatePickError(''); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-amber-600" />
              <h3 className="text-lg font-bold text-gray-900">Tạo dự án — chọn công ty SX</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Deal đã ở trạng thái Thắng nhưng chưa có dự án. Chọn công ty <strong>module Sản xuất</strong> để tạo dự án xưởng.
            </p>
            <select
              value={dealAutoCreateCompanyId}
              onChange={(e) => { setDealAutoCreateCompanyId(e.target.value); setDealAutoCreatePickError(''); }}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-2"
            >
              <option value="">— Chọn công ty —</option>
              {productionCompaniesForSx.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
            {dealAutoCreatePickError && (
              <p className="text-xs text-red-600 mb-3">{dealAutoCreatePickError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => { setDealAutoCreatePick(null); setDealAutoCreatePickError(''); }}
              >
                Đóng
              </button>
              <button
                type="button"
                className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => submitDealAutoCreateCompanyPick()}
              >
                Tạo dự án
              </button>
            </div>
          </div>
        </div>
      )}

      <DealStageEventModal
        open={!!dealKanbanEventCtx}
        onClose={() => {
          if (!dealKanbanEventBusy) setDealKanbanEventCtx(null);
        }}
        deal={dealKanbanEventCtx?.deal}
        targetStageName={dealKanbanEventCtx?.targetStage?.name}
        onConfirm={confirmDealKanbanEvent}
        onMoveWithoutEvent={skipDealKanbanEvent}
        submitting={dealKanbanEventBusy}
      />

      <BulkAssignLeadsModal
        open={bulkAssignModalOpen}
        onClose={() => setBulkAssignModalOpen(false)}
        ids={manualMergeIds}
        pipelineType={pipelineType}
        users={users}
        onDone={() => {
          setBulkAssignModalOpen(false);
          load();
        }}
      />
      <ManualMergeLeadsModal
        open={manualMergeModalOpen}
        onClose={() => setManualMergeModalOpen(false)}
        ids={manualMergeIds}
        itemsById={itemsByIdForMerge}
        pipelineType={pipelineType}
        onMerged={() => {
          setManualMergeModalOpen(false);
          setManualMergeIds([]);
          load();
        }}
      />

      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !bulkDeleting && setBulkDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Xóa {manualMergeIds.length} {pipelineType === 'deal' ? 'deal' : 'lead'} đã chọn
            </h3>
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-4">
              Thao tác xóa sẽ xóa luôn dữ liệu liên quan (tài liệu / hoạt động / dự án liên kết nếu có). Bạn có thể phục hồi từ Thùng rác.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Lý do xóa</label>
              <textarea
                value={bulkDeleteReason}
                onChange={(e) => setBulkDeleteReason(e.target.value)}
                placeholder="Nhập lý do xóa (không bắt buộc)…"
                className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={confirmBulkDelete}
                className="h-9 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? 'Đang xóa…' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// KPI — layout ngang, kích thước ~một nửa bản trước (Lead + Deal)
function KPICard({ icon, iconBgColor, iconColor, label, value, sublabel, trend, compact }) {
  return (
    <div
      className={`min-w-0 flex items-center rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200 ${
        compact ? 'gap-1.5 p-1.5' : 'gap-1.5 p-2 md:gap-2 md:p-2'
      }`}
    >
      <div
        className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0">
        <p
          className={`text-gray-500 font-semibold uppercase tracking-wide truncate leading-none ${
            compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'
          }`}
          title={label}
        >
          {label}
        </p>
        <p
          className={`font-bold text-gray-900 tabular-nums leading-tight break-words ${
            compact ? 'text-xs md:text-sm' : 'text-sm md:text-base'
          }`}
        >
          {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
        </p>
        {sublabel && (
          <p className="text-[9px] text-amber-700/90 leading-tight truncate" title={sublabel}>
            {sublabel}
          </p>
        )}
        {trend != null && trend !== '' && (
          <p className={`text-emerald-600 leading-none ${compact ? 'text-[9px]' : 'text-[10px]'}`}>↑ {trend}%</p>
        )}
      </div>
    </div>
  );
}

/** Gán NV phụ trách hàng loạt — dùng cùng ô chọn Kanban với gộp thủ công */
function BulkAssignLeadsModal({ open, onClose, ids, pipelineType, users, onDone }) {
  const [assignUserId, setAssignUserId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAssignUserId('');
      setAssigneeSearch('');
    }
  }, [open, ids]);

  const idList = useMemo(() => [...new Set((ids || []).filter(Boolean))], [ids]);
  const activeUsers = useMemo(
    () => (users || []).filter((u) => u && u.is_active !== false && u.id),
    [users]
  );

  const filteredBase = useMemo(() => {
    const q = (assigneeSearch || '').trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || pos.includes(q);
    });
  }, [activeUsers, assigneeSearch]);

  const pinSelected = (list, selectedId) => {
    const sel = selectedId ? activeUsers.find((u) => String(u.id) === String(selectedId)) : null;
    if (sel && !list.some((u) => String(u.id) === String(selectedId))) return [sel, ...list];
    return list;
  };

  const filteredUsers = useMemo(
    () => pinSelected(filteredBase, assignUserId),
    [filteredBase, activeUsers, assignUserId]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idList.length) return;
    if (!assignUserId) {
      alert('Chọn người phụ trách');
      return;
    }
    setSaving(true);
    try {
      const body = { ids: idList, assigned_to: assignUserId };
      await api.post('/crm/leads/bulk-assign', body);
      onDone();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Gán thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const kind = pipelineType === 'deal' ? 'deal' : 'lead';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-600" />
              Gán phụ trách hàng loạt
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Áp dụng cho <strong>{idList.length}</strong> {kind} đang chọn trên Kanban.
            </p>
            <p className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
              Mỗi thẻ chỉ có <strong>một người phụ trách</strong> (áp dụng cho cả Lead và Deal). Gán sẽ cập nhật trên toàn bộ thẻ đã chọn.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {idList.length === 0 ? (
          <p className="text-sm text-amber-700">Chưa có thẻ nào được chọn.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Tìm nhân viên</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="search"
                  value={assigneeSearch}
                  onChange={(ev) => setAssigneeSearch(ev.target.value)}
                  placeholder="Gõ tên, email, chức danh…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">Người phụ trách</label>
                <select
                  value={assignUserId}
                  onChange={(ev) => setAssignUserId(ev.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">— Chọn —</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id}{u.position ? ` — ${u.position}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {assigneeSearch.trim() && filteredBase.length === 0 && !assignUserId && (
                <p className="text-xs text-amber-700 mt-1.5">
                  {`Không có nhân viên khớp "${assigneeSearch.trim()}".`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || !assignUserId}
                className="h-10 px-5 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Đang lưu…' : 'Xác nhận gán'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Gộp thủ công 2+ lead/deal đã chọn trên Kanban (API merge-selected: gộp KH + tài liệu) */
function ManualMergeLeadsModal({ open, onClose, ids, itemsById, pipelineType, onMerged }) {
  const sortedIds = useMemo(() => {
    const v = [...new Set(ids || [])].filter((id) => itemsById[id]);
    v.sort((a, b) => String(itemsById[a]?.code || '').localeCompare(String(itemsById[b]?.code || '')));
    return v;
  }, [ids, itemsById]);

  const [keepId, setKeepId] = useState('');
  const [titleMode, setTitleMode] = useState('keep'); // keep | pick | custom
  const [titlePickId, setTitlePickId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [docByLead, setDocByLead] = useState({});
  const [submitting, setSubmitting] = useState(false);
  /** true: gộp KH + chuyển tài liệu/nhiệm vụ/… sang bản giữ; false: chỉ giữ dữ liệu của bản được chọn */
  const [includeSecondaryData, setIncludeSecondaryData] = useState(true);

  useEffect(() => {
    if (!open || sortedIds.length < 2) return;
    const first = sortedIds[0];
    setKeepId(first);
    setTitleMode('keep');
    setTitlePickId(first);
    setCustomTitle('');
    setIncludeSecondaryData(true);
    const init = {};
    sortedIds.forEach((id) => {
      init[id] = { loading: true, list: [], error: null };
    });
    setDocByLead(init);
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        sortedIds.map(async (id) => {
          try {
            const res = await api.get(`/crm/leads/${id}/documents`);
            const raw = res.data;
            const list = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
            return { id, list, error: null };
          } catch (err) {
            return {
              id,
              list: [],
              error: err.response?.data?.error || err.message || 'Lỗi tải',
            };
          }
        })
      );
      if (cancelled) return;
      setDocByLead((prev) => {
        const next = { ...prev };
        results.forEach(({ id, list, error }) => {
          next[id] = { loading: false, list: list || [], error };
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [open, sortedIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sortedIds.length < 2 || !keepId) return;
    const delete_ids = sortedIds.filter((id) => String(id) !== String(keepId));
    if (!delete_ids.length) return;

    let title;
    if (titleMode === 'pick') {
      title = (itemsById[titlePickId]?.title || '').trim();
      if (!title) {
        alert('Chọn bản ghi để lấy tiêu đề');
        return;
      }
    } else if (titleMode === 'custom') {
      title = customTitle.trim();
      if (!title) {
        alert('Nhập tiêu đề mới');
        return;
      }
    }

    const body = { keep_id: keepId, delete_ids, include_secondary_data: includeSecondaryData };
    if (titleMode !== 'keep' && title) body.title = title;

    setSubmitting(true);
    try {
      await api.post('/crm/leads/merge-selected', body);
      onMerged();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Gộp thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const labelType = pipelineType === 'deal' ? 'Deal' : 'Lead';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-amber-600" />
              Gộp {labelType} đã chọn
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Chọn bản ghi giữ lại, xem khách hàng &amp; tài liệu từng bên, rồi chọn cách gộp dữ liệu và tiêu đề.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sortedIds.length < 2 ? (
          <p className="text-sm text-amber-700">Không đủ bản ghi hợp lệ để gộp (cần ít nhất 2).</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedIds.map((id) => {
                const item = itemsById[id];
                const docState = docByLead[id] || { loading: true, list: [], error: null };
                const cust = item?.customer;
                return (
                  <div
                    key={id}
                    className={`rounded-xl border p-4 ${String(keepId) === String(id) ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-200' : 'border-gray-200'}`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="merge-keep"
                        checked={String(keepId) === String(id)}
                        onChange={() => setKeepId(id)}
                        className="mt-1 h-4 w-4 text-amber-600 border-gray-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-blue-600">{item?.code}</p>
                        <p className="text-sm font-medium text-gray-900 truncate">{item?.title}</p>
                        <p className="text-xs text-gray-500 mt-2 font-medium">Khách hàng</p>
                        {cust ? (
                          <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
                            {cust.full_name && <li>👤 {cust.full_name}</li>}
                            {cust.phone && <li>📞 {cust.phone}</li>}
                            {cust.email && <li>✉️ {cust.email}</li>}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-400">Chưa gắn khách</p>
                        )}
                        <p className="text-xs text-gray-500 mt-3 font-medium">Tài liệu ({docState.loading ? '…' : docState.list.length})</p>
                        {docState.error && (
                          <p className="text-xs text-red-600 mt-1">{docState.error}</p>
                        )}
                        {!docState.loading && !docState.error && docState.list.length === 0 && (
                          <p className="text-xs text-gray-400 mt-1">Không có tệp</p>
                        )}
                        {!docState.loading && docState.list.length > 0 && (
                          <ul className="text-xs text-gray-600 mt-1 max-h-28 overflow-y-auto space-y-0.5">
                            {docState.list.slice(0, 12).map((d) => (
                              <li key={d.id} className="truncate">{d.file_name || d.name || d.title || 'Tệp'}</li>
                            ))}
                            {docState.list.length > 12 && (
                              <li className="text-gray-400">+{docState.list.length - 12} tệp khác…</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Dữ liệu &amp; tài liệu</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-data-mode"
                    checked={includeSecondaryData}
                    onChange={() => setIncludeSecondaryData(true)}
                    className="mt-0.5 h-4 w-4 text-amber-600"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Gộp từ cả hai bản ghi</span>
                    <span className="block text-gray-600 text-xs mt-0.5">
                      Gộp thông tin khách hàng; chuyển tài liệu, nhiệm vụ CRM, hoạt động, báo giá, đơn hàng, hóa đơn, Facebook… sang bản được giữ; cộng thêm giá trị ước tính từ bản xóa.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-data-mode"
                    checked={!includeSecondaryData}
                    onChange={() => setIncludeSecondaryData(false)}
                    className="mt-0.5 h-4 w-4 text-amber-600"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Chỉ giữ bản được chọn</span>
                    <span className="block text-gray-600 text-xs mt-0.5">
                      Không gộp khách hàng; không chuyển tài liệu hay dữ liệu từ bản kia. Các bản bị gộp (xóa) sẽ mất tài liệu, nhiệm vụ, báo giá, đơn hàng… gắn với chúng (theo quy tắc xóa trong hệ thống).
                    </span>
                  </span>
                </label>
                {!includeSecondaryData && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Cảnh báo: tùy chọn này có thể xóa vĩnh viễn dữ liệu riêng của các thẻ bị loại bỏ. Chỉ dùng khi chắc chắn không cần giữ.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Tiêu đề sau khi gộp</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'keep'}
                    onChange={() => setTitleMode('keep')}
                    className="h-4 w-4 text-amber-600"
                  />
                  Giữ tiêu đề của bản ghi được chọn giữ
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'pick'}
                    onChange={() => setTitleMode('pick')}
                    className="h-4 w-4 text-amber-600"
                  />
                  Dùng tiêu đề từ
                  <select
                    value={titlePickId}
                    onChange={(ev) => { setTitlePickId(ev.target.value); setTitleMode('pick'); }}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm max-w-[200px]"
                  >
                    {sortedIds.map((id) => (
                      <option key={id} value={id}>{itemsById[id]?.code} — {(itemsById[id]?.title || '').slice(0, 40)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'custom'}
                    onChange={() => setTitleMode('custom')}
                    className="h-4 w-4 text-amber-600 mt-0.5"
                  />
                  <span className="flex-1">
                    Tùy chỉnh
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(ev) => { setCustomTitle(ev.target.value); setTitleMode('custom'); }}
                      placeholder="Nhập tiêu đề mới"
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || sortedIds.length < 2}
                className="h-10 px-5 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Đang gộp…' : 'Xác nhận gộp'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Kanban Stage Card - MISA Style (responsive scroll)

function KanbanStageCard({
  stage,
  items,
  onMoveStage,
  pipelineType,
  mergeSelectedIds,
  onToggleMergeSelect,
  onToggleSelectAllInColumn,
  compact,
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const [columnMaxH, setColumnMaxH] = useState('70vh');

  // Đo vị trí thực tế của container → tính maxHeight responsive
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Chiều cao viewport trừ vị trí top của container, trừ padding bottom (40px)
        const available = window.innerHeight - rect.top - 20;
        setColumnMaxH(`${Math.max(260, available)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const stageColor = stage.color || '#e5e7eb';
  const columnWeighted = (items || []).reduce((sum, item) => {
    const ev = item.estimated_value || 0;
    let p = item.probability;
    if (p == null || p === '') p = stage.default_probability;
    const n = Number(p);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    return sum + ev * (pct / 100);
  }, 0);
  const columnItemIds = (items || []).map((i) => i.id);
  const allInColumnSelected =
    columnItemIds.length > 0 &&
    columnItemIds.every((id) => (mergeSelectedIds || []).some((x) => String(x) === String(id)));

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };

  const handleColumnDragLeave = (e) => {
    if (e.target === e.currentTarget) {
      setIsOverColumn(false);
    }
  };

  const handleColumnDrop = (e) => {
    e.preventDefault();
    setIsOverColumn(false);
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      onMoveStage(leadId, stage.id);
    }
  };

  return (
    <div
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
      className={`flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 ${
        compact ? 'w-[17rem] max-[380px]:w-[15.5rem]' : 'w-80 max-[420px]:w-[17rem]'
      } ${isOverColumn ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}
    >
      {/* Colored Header Bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: stageColor }}
      />

      {/* Stage Header */}
      <div className={`bg-white border border-gray-200 border-t-0 transition-all ${
        compact ? 'p-2.5' : 'p-4'
      } ${isOverColumn ? 'bg-blue-50' : ''}`}>
        <div className={`flex items-start justify-between gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={compact ? 'text-base shrink-0' : 'text-lg shrink-0'}>{stage.icon || '📌'}</span>
              <h3 className={`font-semibold text-gray-900 truncate ${compact ? 'text-sm' : ''}`}>{stage.name}</h3>
            </div>
            {String(stage.description || '').trim() !== '' && (
              <p
                className={`text-gray-500 leading-snug pl-0.5 ${compact ? 'text-[10px] line-clamp-2' : 'text-[11px] line-clamp-3'}`}
                title={String(stage.description).trim()}
              >
                {String(stage.description).trim()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {columnItemIds.length > 0 && onToggleSelectAllInColumn && (
              <button
                type="button"
                onClick={() => onToggleSelectAllInColumn(columnItemIds)}
                className={`px-2 py-1 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-amber-50 hover:border-amber-300 transition-colors ${
                  compact ? 'text-[10px]' : 'text-xs'
                }`}
                title={allInColumnSelected ? 'Bỏ chọn mọi lead/deal trong cột này' : 'Chọn tất cả trong cột'}
              >
                {allInColumnSelected ? 'Bỏ chọn cột' : 'Chọn tất cả'}
              </button>
            )}
            <span className={`px-2 py-1 bg-gray-100 text-gray-700 font-bold rounded ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {items.length}
            </span>
          </div>
        </div>
        <p className={compact ? 'text-[10px] text-gray-500' : 'text-xs text-gray-500'}>
          Giá trị: {formatVND(items.reduce((sum, item) => sum + (item.estimated_value || 0), 0))}
          {' · '}
          Trọng số: {formatVND(columnWeighted)}
        </p>
      </div>

      {/* Cards Container - responsive height theo màn hình */}
      <div
        ref={containerRef}
        className={`bg-gray-50 border border-gray-200 border-t-0 overflow-y-auto transition-all ${
          compact ? 'p-2 space-y-2' : 'p-3 space-y-3'
        } ${isOverColumn ? 'bg-blue-50' : ''}`}
        style={{ maxHeight: columnMaxH, minHeight: compact ? '160px' : '180px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo lead vào đây'}
            </p>
          </div>
        ) : (
          items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              stage={stage}
              onMoveStage={onMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={mergeSelectedIds}
              onToggleMergeSelect={onToggleMergeSelect}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Item Card - MISA Style
function KanbanCard({ item, stage, onMoveStage, pipelineType, mergeSelectedIds, onToggleMergeSelect, compact }) {
  const navigate = useNavigate();
  const openLeadDetail = () => {
    localStorage.setItem('crm_pinned_tab', pipelineType);
    markCrmPipelineCardFocus(item.id);
    navigate(`/crm/leads/${item.id}`);
  };

  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-kanban-select-zone]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('leadId', item.id);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const stageColor = stage.color || '#e5e7eb';

  const selectedForMerge = mergeSelectedIds && mergeSelectedIds.some((x) => String(x) === String(item.id));

  const splitPickZones = !!onToggleMergeSelect;

  const slaTone = getPipelineStageSlaTone(item.stage_entered_at, stage);
  // Có NV có deadline → màu theo deadline; không → SLA cột
  const taskTone = getCrmOpenTaskDeadlineTone(item.crm_next_open_task_deadline);
  const cardToneLevel = taskTone ? taskTone.level : slaTone.level;
  const cardSurface = pipelineCardToneClasses(cardToneLevel);

  return (
    <div
      data-crm-pipeline-card={item.id}
      draggable
      onDragStart={handleDragStart}
      onClick={
        splitPickZones
          ? undefined
          : () => {
              openLeadDetail();
            }
      }
      className={`relative ${compact ? 'min-h-[5.25rem]' : 'min-h-[7rem]'} overflow-hidden rounded-lg border transition-all duration-200 group/card hover:-translate-y-0.5 hover:shadow-lg ${cardSurface} ${
        splitPickZones ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${selectedForMerge ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
      style={{
        borderLeft: `3px solid ${stageColor}`,
      }}
    >
      {splitPickZones && (
        <>
          {/* Hai vùng màu — chỉ hiện khi hover thẻ */}
          <div
            className="pointer-events-none absolute inset-0 z-[5] flex flex-col rounded-lg opacity-0 transition-opacity duration-150 group-hover/card:opacity-100"
            aria-hidden
          >
            <div className="h-[30%] min-h-[2.25rem] shrink-0 border-b border-amber-200/60 bg-amber-100/65" />
            <div className="min-h-0 flex-1 bg-sky-100/50" />
          </div>

          <button
            type="button"
            data-kanban-select-zone
            title="30% trên: chọn để gộp / xóa / chuyển hàng loạt"
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleMergeSelect(item.id);
            }}
            className={`absolute left-0 right-0 top-0 z-20 flex h-[30%] min-h-[2.25rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
              selectedForMerge ? 'ring-1 ring-inset ring-amber-400/70' : ''
            }`}
          >
            <span className="pointer-events-none flex flex-col items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
              <CheckSquare className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-amber-900 drop-shadow-sm`} />
              <span className={`font-bold text-amber-950 drop-shadow-sm ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Chọn</span>
            </span>
          </button>

          <button
            type="button"
            data-kanban-detail-zone
            title="70% dưới: mở chi tiết lead/deal"
            onClick={(ev) => {
              ev.stopPropagation();
              openLeadDetail();
            }}
            className="absolute bottom-0 left-0 right-0 top-[30%] z-[15] cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          >
            <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
              <Eye className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-sky-900 drop-shadow-sm`} />
              <span className={`font-bold text-sky-950 drop-shadow-sm ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Chi tiết</span>
            </span>
          </button>
        </>
      )}

      <div
        className={`relative z-0 ${splitPickZones ? 'pointer-events-none' : ''} ${compact ? 'p-2' : 'p-3'}`}
      >
      {/* Header: Code + Value */}
      <div className={`flex items-start justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
        <p className={`font-semibold text-blue-600 flex items-center gap-1 min-w-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <span className="truncate">{item.code}</span>
          {slaTone.level === 'overdue' && (
            <AlertTriangle className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-red-600 shrink-0`} aria-hidden />
          )}
        </p>
        {item.estimated_value > 0 && (
          <p className={`font-bold text-emerald-600 ${compact ? 'text-[10px] leading-tight text-right max-w-[52%]' : 'text-sm'}`}>{formatVND(item.estimated_value)}</p>
        )}
      </div>

      {/* Title */}
      <div className={`flex items-start gap-1.5 min-w-0 ${compact ? 'mb-1' : 'mb-2'}`}>
        <div className="flex-1 min-w-0">
          <p
            title={splitPickZones ? undefined : item.title}
            className={`font-medium text-gray-900 truncate ${compact ? 'text-xs' : 'text-sm'}`}
          >{item.title}</p>
        </div>
        {item.is_new_for_current_user && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-rose-500 px-1.5 py-0.5 rounded leading-tight">Mới</span>
        )}
      </div>

      {(item.company?.short_name || item.company?.name || item.crm_region?.name) && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mb-1' : 'mb-2'}`}>
          {(item.company?.short_name || item.company?.name) && (
            <span className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700">
              🏢 {item.company.short_name || item.company.name}
            </span>
          )}
          {item.crm_region?.name && (
            <span className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-800">
              📍 {item.crm_region.name}
            </span>
          )}
        </div>
      )}

      {/* Customer name + Phone */}
      {(item.customer?.full_name || item.customer?.phone) && (
        <div className={`space-y-0.5 ${compact ? 'mb-1' : 'mb-2'}`}>
          {item.customer?.full_name && (
            <p className={`text-gray-600 truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>👤 {item.customer.full_name}</p>
          )}
          {item.customer?.phone && (
            <p className={`text-green-600 font-medium truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>📞 {item.customer.phone}</p>
          )}
        </div>
      )}

      {/* Thời gian tạo / thời gian tại cột — reset khi đổi cột */}
      <div className={`space-y-0.5 border-t border-gray-200/70 ${compact ? 'mt-1 pt-1.5 mb-1' : 'mt-2 pt-2 mb-2'}`}>
        <p className={`font-bold text-gray-500 uppercase tracking-wide ${compact ? 'text-[8px]' : 'text-[9px]'}`}>Lên kế hoạch thực hiện</p>
        <p className={`text-gray-600 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <span className="text-gray-500">Tạo lead:</span>{' '}
          {item.created_at ? (
            <>
              {formatDate(item.created_at)}
              <span className="text-gray-400"> · {formatAgeDetailed(item.created_at)}</span>
            </>
          ) : (
            '—'
          )}
        </p>
        <p className={`text-gray-800 leading-snug ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <span className="text-gray-500">Tại cột:</span>{' '}
          <span className="font-semibold text-gray-900">
            {item.stage_entered_at ? formatAgeDetailed(item.stage_entered_at) : '—'}
          </span>
          {slaTone.deadlineTs != null && !stage?.is_won && !stage?.is_lost && (
            <span className="block mt-0.5 text-gray-500 font-normal">
              Hạn SLA cột: {new Date(slaTone.deadlineTs).toLocaleString('vi-VN')}
              {slaTone.remainingMs != null && slaTone.level !== 'ok' && (
                <>
                  {' · '}
                  {slaTone.level === 'overdue' ? (
                    <span className="text-red-600 font-semibold">
                      Quá hạn {formatRemainingMs(Math.abs(slaTone.remainingMs))}
                    </span>
                  ) : (
                    <span>Còn {formatRemainingMs(slaTone.remainingMs)}</span>
                  )}
                </>
              )}
            </span>
          )}
        </p>
      </div>

      {/* Một người phụ trách (Lead & Deal) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {(() => {
            const u = item.assignee || item.lead_owner;
            if (!u) {
              return <p className="text-[10px] text-gray-400"><span className="text-gray-500">Phụ trách:</span> —</p>;
            }
            return (
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${
                    compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'
                  }`}
                  style={{ backgroundColor: stageColor }}
                >
                  {getInitials(u.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-tight">Phụ trách</p>
                  <p className={`text-gray-700 font-medium truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>{u.full_name}</p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Deadline */}
      {item.expected_close_date && (
        <div className={`${compact ? 'mt-1' : 'mt-2'} text-[10px] px-2 py-1 rounded-lg font-medium ${
          new Date(item.expected_close_date) < new Date()
            ? 'bg-red-100 text-red-600'
            : new Date(item.expected_close_date) < new Date(Date.now() + 3 * 86400000)
            ? 'bg-amber-100 text-amber-600'
            : 'bg-purple-100 text-purple-600'
        }`}>
          📅 Deadline: {new Date(item.expected_close_date).toLocaleDateString('vi-VN')}
        </div>
      )}

      {/* Badge trạng thái module — ưu tiên VC nếu đã bàn giao, còn lại hiện SX */}
      {(item.sx_pipeline_stage || item.vc_pipeline_stage) && (() => {
        const vcStage = item.vc_pipeline_stage;
        const sxStage = item.sx_pipeline_stage;

        // Ưu tiên: nếu deal đã sang VC → chỉ hiện VC (sản xuất đã xong)
        // Nếu chưa sang VC → chỉ hiện SX
        const activeStage = vcStage || sxStage;
        const isVC = !!vcStage;
        const icon = activeStage?.icon
          || (isVC
            ? (activeStage?.bucket_slug === 'delivery_pending' ? '📦'
              : activeStage?.bucket_slug === 'completed' ? '✅' : '🚚')
            : (activeStage?.bucket_slug === 'won_pending' ? '⏳'
              : activeStage?.bucket_slug === 'completed' ? '✅' : '🏭'));
        const label = isVC ? 'VC' : 'SX';
        const defaultColor = isVC ? '#ea580c' : '#0369a1';

        return (
          <div className={`${compact ? 'mt-1' : 'mt-2'}`}>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{
                backgroundColor: activeStage.color ? `${activeStage.color}12` : (isVC ? '#fff7ed' : '#f0f9ff'),
                border: `1px solid ${activeStage.color ? `${activeStage.color}50` : (isVC ? '#fed7aa' : '#bae6fd')}`,
              }}>
              <span className="text-[11px] shrink-0">{icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide shrink-0"
                style={{ color: activeStage.color || defaultColor }}>{label}</span>
              <span className={`font-semibold truncate ${compact ? 'text-[10px]' : 'text-xs'}`}
                style={{ color: activeStage.color || defaultColor }}>
                {activeStage.name}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Ngày giao xưởng từ linked project */}
      {item.linked_project?.production_deadline && (() => {
        const pd = item.linked_project.production_deadline;
        const isOverdue = new Date(pd) < new Date();
        const isSoon = !isOverdue && new Date(pd) < new Date(Date.now() + 3 * 86400000);
        return (
          <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-center gap-1.5 px-2 py-1 rounded-lg ${isOverdue ? 'bg-red-50 border border-red-200' : isSoon ? 'bg-amber-50 border border-amber-200' : 'bg-teal-50 border border-teal-200'}`}>
            <span className="text-[10px]">🏭</span>
            <span className={`font-medium truncate ${compact ? 'text-[10px]' : 'text-xs'} ${isOverdue ? 'text-red-700' : isSoon ? 'text-amber-700' : 'text-teal-700'}`}>
              Giao xưởng: {new Date(pd).toLocaleDateString('vi-VN')}
              {isOverdue ? ' ⚠️' : isSoon ? ' ⚡' : ''}
            </span>
          </div>
        );
      })()}

      {/* Lý do thua */}
      {item.lost_reason && (
        <div className="mt-2 px-2 py-1.5 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-[10px] text-red-400 font-medium">❌ Lý do thua</p>
          <p className="text-xs text-red-600 line-clamp-2">{item.lost_reason}</p>
        </div>
      )}
      </div>
    </div>
  );
}

// Kanban View Container - MISA Style
function KanbanView({
  pipeline,
  onMoveStage,
  pipelineType,
  mergeSelectedIds,
  onToggleMergeSelect,
  onToggleSelectAllInColumn,
  compact,
}) {
  const kanbanHScrollRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const pipelineDraggingRef = useRef(false);
  const scrollRafRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);

  useEffect(() => {
    const isOurCard = (e) => !!e.target?.closest?.('[data-crm-pipeline-card]');

    const onDragStart = (e) => {
      if (isOurCard(e)) {
        pipelineDraggingRef.current = true;
        setIsDraggingCard(true);
      }
    };
    const onDragEnd = () => {
      pipelineDraggingRef.current = false;
      setIsDraggingCard(false);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };

    const EDGE_ZONE_PX = 56;
    const MIN_STEP = 5;
    const MAX_STEP = 34;

    const runScroll = () => {
      scrollRafRef.current = 0;
      if (!pipelineDraggingRef.current) return;
      const sc = kanbanHScrollRef.current;
      const wrap = kanbanWrapRef.current;
      if (!sc || !wrap) return;
      const { x } = lastPointerRef.current;
      const r = wrap.getBoundingClientRect();
      const innerLeft = r.left + EDGE_ZONE_PX;
      const innerRight = r.right - EDGE_ZONE_PX;
      let delta = 0;
      if (x < innerLeft) {
        const t = Math.min(1, (innerLeft - x) / EDGE_ZONE_PX);
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = -step;
      } else if (x > innerRight) {
        const t = Math.min(1, (x - innerRight) / EDGE_ZONE_PX);
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = step;
      }
      if (delta !== 0) {
        const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const before = sc.scrollLeft;
        sc.scrollLeft = Math.max(0, Math.min(maxLeft, before + delta));
        const moved = sc.scrollLeft !== before;
        const inZone = x < innerLeft || x > innerRight;
        if (inZone && moved) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
      }
    };

    const onDragOver = (e) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pipelineDraggingRef.current) return;
      e.preventDefault();
      const wrap = kanbanWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const innerLeft = r.left + EDGE_ZONE_PX;
      const innerRight = r.right - EDGE_ZONE_PX;
      if (e.clientX < innerLeft || e.clientX > innerRight) {
        if (!scrollRafRef.current) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
      }
    };

    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('dragover', onDragOver, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('dragover', onDragOver, true);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const nudge = (dir) => {
    const sc = kanbanHScrollRef.current;
    if (!sc) return;
    const w = 280;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)));
  };

  return (
    <div ref={kanbanWrapRef} className="relative">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronLeft
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronRight
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <button
        type="button"
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Kéo thẻ tới mép này để tự cuộn sang cột bên trái — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={`absolute right-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Kéo thẻ tới mép này để tự cuộn sang cột bên phải — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('right')}
      />

      <div ref={kanbanHScrollRef} className="overflow-x-auto pb-4 [scrollbar-gutter:stable]">
        <div className={`flex min-w-max ${compact ? 'gap-2' : 'gap-3'}`}>
          {pipeline.map((stage) => (
            <KanbanStageCard
              key={stage.id}
              stage={stage}
              items={stage.items}
              onMoveStage={onMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={mergeSelectedIds}
              onToggleMergeSelect={onToggleMergeSelect}
              onToggleSelectAllInColumn={onToggleSelectAllInColumn}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── NEW DEAL MODAL ─────────────────────────────────────────────────────────
function NewDealModal({ onClose, onSuccess, leadTypes, companies, defaultCompanyId, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    region_id: '',
    lead_type_id: '',
    estimated_value: 0,
    probability: 50,
    install_address: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [modalSources, setModalSources] = useState([]);
  const [modalRegions, setModalRegions] = useState([]);

  const visibleLeadTypes = useMemo(() => {
    const cid = String(formData.company_id || '');
    return (Array.isArray(leadTypes) ? leadTypes : [])
      .filter((t) => String(t.company_id || '') === cid)
      .filter((t) => t.applies_to === 'both' || t.applies_to === 'deal');
  }, [leadTypes, formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalSources([]);
      return;
    }
    let cancelled = false;
    api.get('/crm/sources', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.sources || (Array.isArray(r.data) ? r.data : []);
        setModalSources(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setModalSources([]); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalRegions([]);
      return;
    }
    const selectedCo = (companies || []).find((c) => String(c.id) === cid);
    const divId = selectedCo?.division_unit_id || null;
    let cancelled = false;
    const params = { company_id: cid };
    if (divId) params.division_unit_id = divId;
    api.get('/crm/company-regions', { params })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setModalRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => { if (!cancelled) setModalRegions([]); });
    return () => { cancelled = true; };
  }, [formData.company_id, companies]);

  useEffect(() => {
    const uidRegions = currentUser?.crm_region_ids;
    if (!Array.isArray(uidRegions) || uidRegions.length !== 1) return;
    const only = String(uidRegions[0]);
    const ok = modalRegions.some((r) => String(r.id) === only);
    if (ok && String(formData.region_id || '') !== only) {
      setFormData((prev) => ({ ...prev, region_id: only }));
    }
  }, [modalRegions, currentUser?.crm_region_ids, formData.region_id]);

  // Lock company for non-admin — ưu tiên company trên user, không lấy filter Kanban (có thể là admin/LS khác)
  useEffect(() => {
    if (isAdmin) return;
    const cid = (currentUser?.company_id ? String(currentUser.company_id) : '') || (defaultCompanyId ? String(defaultCompanyId) : '');
    if (cid && String(formData.company_id || '') !== String(cid)) {
      setFormData((prev) => ({ ...prev, company_id: cid }));
    }
  }, [isAdmin, defaultCompanyId, currentUser?.company_id]);

  // Reset lead_type when company changes
  useEffect(() => {
    if (!formData.lead_type_id) return;
    const ok = visibleLeadTypes.some((t) => String(t.id) === String(formData.lead_type_id));
    if (!ok) setFormData((prev) => ({ ...prev, lead_type_id: '' }));
  }, [formData.company_id, visibleLeadTypes, formData.lead_type_id]);

  useEffect(() => {
    if (!formData.source_id) return;
    const ok = modalSources.some((s) => String(s.id) === String(formData.source_id));
    if (!ok) setFormData((prev) => ({ ...prev, source_id: '' }));
  }, [modalSources, formData.source_id]);

  useEffect(() => {
    if (!formData.region_id) return;
    const ok = modalRegions.some((r) => String(r.id) === String(formData.region_id));
    if (!ok) setFormData((prev) => ({ ...prev, region_id: '' }));
  }, [modalRegions, formData.region_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên Deal');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!formData.customer_name) return alert('Nhập tên khách hàng');
    if (!formData.customer_phone) return alert('Nhập số điện thoại khách hàng');
    if (modalRegions.length > 0 && !formData.region_id) return alert('Chọn khu vực');

    setSaving(true);
    try {
      // 1. Create customer
      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone,
        email: formData.customer_email || null,
        address: formData.install_address || null,
        ...(formData.company_id ? { company_id: formData.company_id } : {}),
      });
      const customerId = customer?.id || customer?.customer?.id;

      // 2. Create deal directly
      await api.post('/crm/deals', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        region_id: formData.region_id || null,
        lead_type_id: formData.lead_type_id || null,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
        install_address: formData.install_address || null,
        description: formData.description || null,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo Deal');
    }
    setSaving(false);
  };

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const companyName = companies.find((c) => String(c.id) === String(formData.company_id))?.short_name
    || companies.find((c) => String(c.id) === String(formData.company_id))?.name || '';
  const regionName = modalRegions.find((r) => String(r.id) === String(formData.region_id))?.name || '';
  const sourceName = modalSources.find((s) => String(s.id) === String(formData.source_id))?.name || '';
  const leadTypeName = visibleLeadTypes.find((t) => String(t.id) === String(formData.lead_type_id))?.name || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>

        {/* ── LEFT: Form ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">🎯 Tạo Deal mới</h2>
              <p className="text-xs text-gray-400 mt-0.5">Tạo deal trực tiếp — không cần qua Lead</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="deal-form" onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Deal <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.title} onChange={e => set('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm"
                  placeholder="VD: Tủ bếp gỗ sồi nhà anh Minh" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">🏢 Công ty <span className="text-red-500">*</span></label>
                  {isAdmin ? (
                    <select value={formData.company_id} onChange={(e) => setFormData((prev) => ({ ...prev, company_id: e.target.value, region_id: '' }))} required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                      <option value="">-- Chọn --</option>
                      {(companies || []).map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">{companyName || 'Công ty của bạn'}</div>
                  )}
                </div>
                {modalRegions.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Khu vực <span className="text-red-500">*</span></label>
                    <select required value={formData.region_id} onChange={(e) => set('region_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm">
                      <option value="">-- Chọn --</option>
                      {modalRegions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.division?.short_name ? ` — ${r.division.short_name}` : ''}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3.5 space-y-2.5">
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">👤 Thông tin khách hàng</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.customer_name} onChange={e => set('customer_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm bg-white"
                    placeholder="Nguyễn Văn A" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                    <input type="text" required value={formData.customer_phone} onChange={e => set('customer_phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm bg-white"
                      placeholder="0901234567" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input type="email" value={formData.customer_email} onChange={e => set('customer_email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm bg-white"
                      placeholder="email@example.com" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Địa chỉ lắp đặt</label>
                <input type="text" value={formData.install_address} onChange={e => set('install_address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm"
                  placeholder="Số nhà, đường, quận/huyện, TP..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nguồn</label>
                  <select value={formData.source_id} onChange={e => set('source_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm">
                    <option value="">-- Nguồn --</option>
                    {modalSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {visibleLeadTypes.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">🏷️ Loại Deal</label>
                    <select value={formData.lead_type_id} onChange={e => set('lead_type_id', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm">
                      <option value="">-- Không bắt buộc --</option>
                      {visibleLeadTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Giá trị (VND)</label>
                  <input type="number" value={formData.estimated_value} onChange={e => set('estimated_value', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Xác suất (%)</label>
                  <input type="number" min="0" max="100" value={formData.probability} onChange={e => set('probability', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú</label>
                <textarea value={formData.description} onChange={e => set('description', e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 text-sm resize-none"
                  placeholder="Ghi chú thêm về deal..." />
              </div>
            </form>
          </div>

          {/* Footer buttons */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50">
            {currentUser && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <User className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-xs text-gray-500 truncate">Phụ trách: <span className="font-semibold text-gray-700">{currentUser.full_name || currentUser.email}</span></span>
              </div>
            )}
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition cursor-pointer shrink-0">
              Hủy
            </button>
            <button type="submit" form="deal-form" disabled={saving}
              className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50 cursor-pointer shrink-0">
              {saving ? 'Đang tạo...' : '🎯 Tạo Deal'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Kanban Card Preview ── */}
        <div className="w-72 shrink-0 bg-gray-50 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Xem trước thẻ Deal</p>
          </div>
          <div className="flex-1 px-4 py-5 overflow-y-auto">
            <div className="bg-white rounded-xl border border-purple-200 shadow-sm p-4 space-y-3">
              {/* Title */}
              <div>
                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide mb-1">🎯 Deal</p>
                <p className="text-sm font-bold text-gray-900 leading-snug min-h-[1.5rem]">
                  {formData.title || <span className="text-gray-300 italic font-normal">Chưa có tên...</span>}
                </p>
              </div>

              {/* Customer */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5">
                <User className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {formData.customer_name || <span className="text-gray-300 italic font-normal">Tên khách hàng</span>}
                  </p>
                  {formData.customer_phone && <p className="text-[11px] text-gray-500">{formData.customer_phone}</p>}
                  {formData.customer_email && <p className="text-[11px] text-gray-400 truncate">{formData.customer_email}</p>}
                </div>
              </div>

              {/* Meta info */}
              <div className="space-y-1.5 text-[11px] text-gray-500">
                {companyName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏢</span><span className="truncate">{companyName}</span></div>
                )}
                {regionName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">📍</span><span className="truncate">{regionName}</span></div>
                )}
                {formData.install_address && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏠</span><span className="truncate">{formData.install_address}</span></div>
                )}
                {sourceName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">📣</span><span>{sourceName}</span></div>
                )}
                {leadTypeName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏷️</span><span>{leadTypeName}</span></div>
                )}
              </div>

              {/* Value & probability */}
              {(Number(formData.estimated_value) > 0 || formData.probability) && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {Number(formData.estimated_value) > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {Number(formData.estimated_value).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                  {formData.probability > 0 && (
                    <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{formData.probability}%</span>
                  )}
                </div>
              )}

              {/* Assigned */}
              {currentUser && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                  <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center text-[9px] font-bold text-green-800 shrink-0">
                    {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] text-gray-500 truncate">{currentUser.full_name || currentUser.email}</span>
                </div>
              )}
            </div>

            {/* Pipeline hint */}
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400">📋 Pipeline mặc định</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">Giai đoạn đầu tiên</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// New Lead Modal - Auto create customer
function NewLeadModal({ onClose, onSuccess, leadTypes, companies, type, defaultCompanyId, currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    region_id: '',
    lead_type_id: '',
    estimated_value: 0,
    probability: 50,
    assigned_to: currentUser?.id || '',
  });
  const [saving, setSaving] = useState(false);
  const [modalSources, setModalSources] = useState([]);
  const [modalRegions, setModalRegions] = useState([]);

  const visibleLeadTypes = useMemo(() => {
    const cid = String(formData.company_id || '');
    return (Array.isArray(leadTypes) ? leadTypes : [])
      .filter((t) => String(t.company_id || '') === cid)
      .filter((t) => t.applies_to === 'both' || t.applies_to === 'lead');
  }, [leadTypes, formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalSources([]);
      return;
    }
    let cancelled = false;
    api.get('/crm/sources', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.sources || (Array.isArray(r.data) ? r.data : []);
        setModalSources(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setModalSources([]); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalRegions([]);
      return;
    }
    const selectedCo = (companies || []).find((c) => String(c.id) === cid);
    const divId = selectedCo?.division_unit_id || null;
    let cancelled = false;
    const params = { company_id: cid };
    if (divId) params.division_unit_id = divId;
    api.get('/crm/company-regions', { params })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setModalRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => { if (!cancelled) setModalRegions([]); });
    return () => { cancelled = true; };
  }, [formData.company_id, companies]);

  useEffect(() => {
    const uidRegions = currentUser?.crm_region_ids;
    if (!Array.isArray(uidRegions) || uidRegions.length !== 1) return;
    const only = String(uidRegions[0]);
    const ok = modalRegions.some((r) => String(r.id) === only);
    if (ok && String(formData.region_id || '') !== only) {
      setFormData((prev) => ({ ...prev, region_id: only }));
    }
  }, [modalRegions, currentUser?.crm_region_ids, formData.region_id]);

  // Lock company for non-admin — ưu tiên công ty nhân viên, tránh mặc định Phúc Đạt từ bộ lọc admin/LS
  useEffect(() => {
    if (isAdmin) return;
    const cid = (currentUser?.company_id ? String(currentUser.company_id) : '') || (defaultCompanyId ? String(defaultCompanyId) : '');
    if (cid && String(formData.company_id || '') !== String(cid)) {
      setFormData((prev) => ({ ...prev, company_id: cid }));
    }
  }, [isAdmin, defaultCompanyId, currentUser?.company_id]);

  // Reset lead_type when company changes
  useEffect(() => {
    if (!formData.lead_type_id) return;
    const ok = visibleLeadTypes.some((t) => String(t.id) === String(formData.lead_type_id));
    if (!ok) setFormData((prev) => ({ ...prev, lead_type_id: '' }));
  }, [formData.company_id, visibleLeadTypes, formData.lead_type_id]);

  useEffect(() => {
    if (!formData.source_id) return;
    const ok = modalSources.some((s) => String(s.id) === String(formData.source_id));
    if (!ok) setFormData((prev) => ({ ...prev, source_id: '' }));
  }, [modalSources, formData.source_id]);

  useEffect(() => {
    if (!formData.region_id) return;
    const ok = modalRegions.some((r) => String(r.id) === String(formData.region_id));
    if (!ok) setFormData((prev) => ({ ...prev, region_id: '' }));
  }, [modalRegions, formData.region_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên lead');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!formData.customer_name) return alert('Nhập tên khách hàng');
    if (modalRegions.length > 0 && !formData.region_id) return alert('Chọn khu vực');

    if (!formData.customer_phone) {
      if (!confirm('⚠️ Chưa có số điện thoại khách hàng.\nBạn có thể nhập sau ở trang chi tiết Lead.\n\nTiếp tục tạo Lead?')) return;
    }

    setSaving(true);
    try {
      // 1. Create customer first
      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone || null,
        ...(formData.company_id ? { company_id: formData.company_id } : {}),
      });
      const customerId = customer?.id || customer?.customer?.id;

      // 2. Giai đoạn đầu pipeline đúng công ty
      const { data: stages } = await api.get('/crm/pipeline-stages', {
        params: { type: 'lead', ...(formData.company_id ? { company_id: formData.company_id } : {}) },
      });
      const firstStage = stages?.[0];

      // 3. Create lead with customer_id
      await api.post('/crm/leads', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        region_id: formData.region_id || null,
        lead_type_id: formData.lead_type_id || null,
        assigned_to: formData.assigned_to || null,
        type: 'lead',
        stage_id: firstStage?.id,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  const companyName = companies.find((c) => String(c.id) === String(formData.company_id))?.short_name
    || companies.find((c) => String(c.id) === String(formData.company_id))?.name || '';
  const regionName = modalRegions.find((r) => String(r.id) === String(formData.region_id))?.name || '';
  const sourceName = modalSources.find((s) => String(s.id) === String(formData.source_id))?.name || '';
  const leadTypeName = visibleLeadTypes.find((t) => String(t.id) === String(formData.lead_type_id))?.name || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>

        {/* ── LEFT: Form ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">🚀 Thêm Lead mới</h2>
              <p className="text-xs text-gray-400 mt-0.5">Điền thông tin — chi tiết bổ sung sau ở trang Lead</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="lead-form" onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên lead <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm"
                  placeholder="VD: Tủ bếp gỗ sồi nhà anh A..." autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">🏢 Công ty <span className="text-red-500">*</span></label>
                  {isAdmin ? (
                    <select value={formData.company_id}
                      onChange={(e) => setFormData((prev) => ({ ...prev, company_id: e.target.value, region_id: '' }))}
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                      <option value="">-- Chọn --</option>
                      {(companies || []).map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">{companyName || 'Công ty của bạn'}</div>
                  )}
                </div>
                {modalRegions.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Khu vực <span className="text-red-500">*</span></label>
                    <select required value={formData.region_id}
                      onChange={(e) => setFormData({ ...formData, region_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                      <option value="">-- Chọn --</option>
                      {modalRegions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.division?.short_name ? ` — ${r.division.short_name}` : ''}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3.5 space-y-2.5">
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">👤 Khách hàng</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white"
                    placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại</label>
                  <input type="text" value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white"
                    placeholder="0901234567" />
                </div>
                <p className="text-[10px] text-blue-500">Thông tin chi tiết sẽ nhập thêm ở trang Lead</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nguồn</label>
                  <select value={formData.source_id}
                    onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                    <option value="">-- Nguồn --</option>
                    {modalSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {visibleLeadTypes.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">🏷️ Loại Lead</label>
                    <select value={formData.lead_type_id}
                      onChange={(e) => setFormData({ ...formData, lead_type_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                      <option value="">-- Không bắt buộc --</option>
                      {visibleLeadTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Giá trị (VND)</label>
                  <input type="number" value={formData.estimated_value}
                    onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Xác suất (%)</label>
                  <input type="number" min="0" max="100" value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm" />
                </div>
              </div>
            </form>
          </div>

          {/* Footer buttons */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50">
            {currentUser && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <User className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-xs text-gray-500 truncate">Phụ trách: <span className="font-semibold text-gray-700">{currentUser.full_name || currentUser.email}</span></span>
              </div>
            )}
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition cursor-pointer shrink-0">
              Hủy
            </button>
            <button type="submit" form="lead-form" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shrink-0">
              {saving ? 'Đang tạo...' : '🚀 Tạo Lead'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Kanban Card Preview ── */}
        <div className="w-72 shrink-0 bg-gray-50 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Xem trước thẻ Lead</p>
          </div>
          <div className="flex-1 px-4 py-5 overflow-y-auto">
            <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 space-y-3">
              {/* Title */}
              <div>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-1">🚀 Lead</p>
                <p className="text-sm font-bold text-gray-900 leading-snug min-h-[1.5rem]">
                  {formData.title || <span className="text-gray-300 italic font-normal">Chưa có tên...</span>}
                </p>
              </div>

              {/* Customer */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5">
                <User className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {formData.customer_name || <span className="text-gray-300 italic font-normal">Tên khách hàng</span>}
                  </p>
                  {formData.customer_phone && <p className="text-[11px] text-gray-500">{formData.customer_phone}</p>}
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-1.5 text-[11px] text-gray-500">
                {companyName && <div className="flex items-center gap-1.5"><span className="text-gray-400">🏢</span><span className="truncate">{companyName}</span></div>}
                {regionName && <div className="flex items-center gap-1.5"><span className="text-gray-400">📍</span><span className="truncate">{regionName}</span></div>}
                {sourceName && <div className="flex items-center gap-1.5"><span className="text-gray-400">📣</span><span>{sourceName}</span></div>}
                {leadTypeName && <div className="flex items-center gap-1.5"><span className="text-gray-400">🏷️</span><span>{leadTypeName}</span></div>}
              </div>

              {/* Value & probability */}
              {(Number(formData.estimated_value) > 0 || formData.probability > 0) && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {Number(formData.estimated_value) > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {Number(formData.estimated_value).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                  {formData.probability > 0 && (
                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{formData.probability}%</span>
                  )}
                </div>
              )}

              {/* Assigned */}
              {currentUser && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                  <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center text-[9px] font-bold text-green-800 shrink-0">
                    {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] text-gray-500 truncate">{currentUser.full_name || currentUser.email}</span>
                </div>
              )}
            </div>

            {/* Pipeline hint */}
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400">📋 Pipeline mặc định</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">Giai đoạn đầu tiên</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

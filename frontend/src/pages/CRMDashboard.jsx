import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, User, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingDown, AlertTriangle, Building2, Rocket, Pin,
  Clock, List, LayoutGrid, GitMerge, UserCheck
} from 'lucide-react';
import { ListView, PlannerView } from '../components/CRMViews';
import {
  loadCrmPipelineSnapshot,
  saveCrmPipelineSnapshot,
  markCrmPipelineCardFocus,
  peekCrmPipelineCardFocus,
  clearCrmPipelineCardFocus,
  getLocallyViewedLeadIdSet,
  getCurrentUserKeyForLeadSeen,
} from '../lib/crmPipelineStorage';
import { userSeesAllCrmDeals } from '../lib/crmDealAccess';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

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

const KANBAN_LOAD_OPTIONS = ['1000', '2000', '5000', 'all'];

export default function CRMDashboard() {
  const { user } = useAuth();
  const seesAllCrmDeals = userSeesAllCrmDeals(user?.role);

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
  const [companies, setCompanies] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [filterCompany, setFilterCompany] = useState(() => P?.filterCompany ?? '');
  const [searchText, setSearchText] = useState(() => P?.searchText ?? '');
  const [filterAssignee, setFilterAssignee] = useState(() => P?.filterAssignee ?? '');
  /** Gõ tên để thu hẹp danh sách trong dropdown NV */
  const [assigneeListSearch, setAssigneeListSearch] = useState(() => P?.assigneeListSearch ?? '');
  /** Lọc lead/deal theo tên người phụ trách / chủ lead (không lẫn tên khách hàng) */
  const [filterAssigneeName, setFilterAssigneeName] = useState(() => P?.filterAssigneeName ?? '');
  const [filterSource, setFilterSource] = useState(() => P?.filterSource ?? '');
  const [filterStage, setFilterStage] = useState(() => P?.filterStage ?? '');
  const [filterPhone, setFilterPhone] = useState(() => {
    const v = P?.filterPhone;
    return v === '' || v === 'has_phone' || v === 'no_phone' ? v : 'has_phone';
  });
  const [showAdvSearch, setShowAdvSearch] = useState(() => !!P?.showAdvSearch);
  const [users, setUsers] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [pipelineType, setPipelineType] = useState(() => {
    const t = P?.pipelineType;
    if (t === 'lead' || t === 'deal') return t;
    return localStorage.getItem('crm_pinned_tab') || 'lead';
  });
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [pinnedTab, setPinnedTab] = useState(() => P?.pinnedTab ?? (localStorage.getItem('crm_pinned_tab') || ''));
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    const v = P?.viewMode;
    return ['kanban', 'list', 'planner', 'calendar'].includes(v) ? v : 'kanban';
  });
  /** Chọn thẻ Kanban để gộp thủ công (không dùng quét trùng) */
  const [manualMergeIds, setManualMergeIds] = useState([]);
  const [manualMergeModalOpen, setManualMergeModalOpen] = useState(false);
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  /** Số bản ghi lead/deal tải cho Kanban (API /crm/leads có phân trang; "all" = lặp offset đến hết) */
  const [kanbanLoadLimit, setKanbanLoadLimit] = useState(() => {
    const fromP = P?.kanbanLoadLimit != null ? String(P.kanbanLoadLimit) : null;
    if (fromP && KANBAN_LOAD_OPTIONS.includes(fromP)) return fromP;
    const s = localStorage.getItem('crm_kanban_load_limit');
    return KANBAN_LOAD_OPTIONS.includes(s) ? s : 'all';
  });

  /** Tổng số lead/deal theo SĐT từ API (limit=1, chỉ đọc `total`) — không phụ thuộc mức tải Kanban; theo NV + ngày trên server */
  const [pipelinePhoneTotals, setPipelinePhoneTotals] = useState({ lead: null, deal: null });

  // ── TIME FILTER STATE ──
  const [timePreset, setTimePreset] = useState(() => (typeof P?.timePreset === 'string' ? P.timePreset : ''));
  const [customDateFrom, setCustomDateFrom] = useState(() => P?.customDateFrom ?? '');
  const [customDateTo, setCustomDateTo] = useState(() => P?.customDateTo ?? '');
  const [showCustomDate, setShowCustomDate] = useState(() => !!P?.showCustomDate);

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

  useEffect(() => {
    setManualMergeIds([]);
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

  const autoCreateProject = async (dealId) => {
    if (autoCreateCalledRef.current) return;
    autoCreateCalledRef.current = true;
    setAutoCreateStatus('loading');
    try {
      const { data } = await api.post(`/crm/deals/${dealId}/auto-create-project`);
      setAutoCreateResult(data);
      setAutoCreateStatus('success');
      load(); // Reload pipeline
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

  useEffect(() => { load(); }, [filterPhone, customDateFrom, customDateTo, kanbanLoadLimit, filterAssignee]);

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

  const load = async () => {
    setLoading(true);
    try {
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
        if (phone_filter) p.phone_filter = phone_filter;
        return p;
      };

      const fetchKanbanRows = async (type) => {
        const common = { type, phone_filter: filterPhone || undefined, ...dateParams };
        if (filterAssignee) common.assigned_to = filterAssignee;
        const loadAll =
          String(kanbanLoadLimit ?? '')
            .trim()
            .toLowerCase() === 'all';
        if (loadAll) {
          const chunk = 5000;
          let offset = 0;
          const out = [];
          let guard = 0;
          while (guard < 200) {
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
          return out;
        }
        const limit = parseInt(kanbanLoadLimit, 10) || 1000;
        const res = await api.get('/crm/leads', { params: { ...common, limit } }).catch(() => ({ data: {} }));
        const d = res.data;
        return Array.isArray(d) ? d : (d?.data || []);
      };

      const [dashLeadRes, dashDealRes, leadsRows, dealsRows, stagesLeadRes, stagesDealRes, sourcesRes, alertsRes, companiesRes, usersRes, lcHas, lcNo, lcAll, dcHas, dcNo, dcAll] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead', ...dateParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal', ...dateParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        fetchKanbanRows('lead'),
        fetchKanbanRows('deal'),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources').catch(() => ({ data: [] })),
        api.get('/crm/alerts/follow-ups').catch(() => ({ data: { overdue: [], stale: [], total: 0 } })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
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
      const userKey = getCurrentUserKeyForLeadSeen(user);
      const viewedLocal = getLocallyViewedLeadIdSet(userKey);
      const mergeLeadSeenLocal = (rows) =>
        (rows || []).map((l) =>
          viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l,
        );
      setAllLeads(mergeLeadSeenLocal(leadsRows));
      setAllDeals(mergeLeadSeenLocal(dealsRows));
      setStagesLead(stagesLeadRes.data);
      setStagesDeal(stagesDealRes.data);
      setSources(sourcesRes.data?.sources || (Array.isArray(sourcesRes.data) ? sourcesRes.data : []));
      if (sourcesRes.data?.fb_pages) setFbPages(sourcesRes.data.fb_pages);
      setCompanies(companiesRes.data?.companies || companiesRes.data || []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || []);
      setAlerts(alertsRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
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
    if (lastFbFilter.current === pageId) return;
    lastFbFilter.current = pageId;
    (async () => {
      try {
        const { data } = await api.get('/crm/leads-by-fb-page', { params: { page_id: pageId, type: pipelineType } });
        setFbPageLeadIds(new Set((data || []).map(l => l.id)));
      } catch { setFbPageLeadIds(new Set()); }
    })();
  }, [filterSource, pipelineType]);

  // ── Client-side search + filter (instant, no API) ──
  const hasPhoneNumber = useCallback((item) => {
    return !!((item.customer?.phone && item.customer.phone.trim()) || (item.phone && item.phone.trim()));
  }, []);

  /** pipelineKind: 'lead' | 'deal' — deal chỉ lọc theo phụ trách deal (assigned_to), không lẫn chủ lead */
  const filterItemsForPipeline = useCallback((items, pipelineKind) => {
    let result = items;

    // Company filter
    if (filterCompany) {
      result = result.filter(l => l.company_id === filterCompany);
    }

    // Assignee filter (UUID — so khớp cả chuỗi normalize + embed id)
    if (filterAssignee) {
      const fid = String(filterAssignee).trim().toLowerCase();
      result = result.filter((l) => {
        if (pipelineKind === 'deal') {
          const ids = [l.assigned_to, l.assignee?.id]
            .filter(Boolean)
            .map((x) => String(x).trim().toLowerCase());
          return ids.includes(fid);
        }
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
        if (pipelineKind === 'deal') {
          return (l.assignee?.full_name || '').toLowerCase().includes(qn);
        }
        const an = (l.assignee?.full_name || '').toLowerCase();
        const lo = (l.lead_owner?.full_name || '').toLowerCase();
        return an.includes(qn) || lo.includes(qn);
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
      result = result.filter(l => l.stage_id === filterStage);
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
  }, [searchText, filterCompany, filterAssignee, filterAssigneeName, filterSource, filterStage, filterPhone, fbPageLeadIds, hasPhoneNumber]);

  const leads = useMemo(() => filterItemsForPipeline(allLeads, 'lead'), [allLeads, filterItemsForPipeline]);
  const deals = useMemo(() => filterItemsForPipeline(allDeals, 'deal'), [allDeals, filterItemsForPipeline]);

  const activePipelinePhoneTotals = useMemo(
    () => pipelinePhoneTotals[pipelineType === 'lead' ? 'lead' : 'deal'],
    [pipelinePhoneTotals, pipelineType],
  );

  // Pipeline view: group leads/deals by stage
  const pipelineLead = useMemo(() => {
    if (!stagesLead.length) return [];
    return stagesLead.map(s => ({
      ...s,
      items: leads.filter(l => l.stage_id === s.id),
      totalValue: leads.filter(l => l.stage_id === s.id).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
    }));
  }, [stagesLead, leads]);

  const pipelineDeal = useMemo(() => {
    if (!stagesDeal.length) return [];
    return stagesDeal.map(s => ({
      ...s,
      items: deals.filter(l => l.stage_id === s.id),
      totalValue: deals.filter(l => l.stage_id === s.id).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
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
  }, [
    filterCompany,
    searchText,
    filterAssignee,
    assigneeListSearch,
    filterAssigneeName,
    filterSource,
    filterStage,
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

  const handleMoveStage = useCallback(async (leadId, newStageId) => {
    const prevLeads = allLeads;
    const prevDeals = allDeals;
    const stages = pipelineType === 'lead' ? stagesLead : stagesDeal;
    const targetStage = stages.find(s => s.id === newStageId);

    let extraData = {};
    if (targetStage?.is_lost) {
      const lostReason = window.prompt(`Nhập lý do thua cho ${pipelineType === 'lead' ? 'lead' : 'deal'}:`)?.trim();
      if (!lostReason) return;
      extraData.lost_reason = lostReason;
    }

    // Optimistic update
    if (pipelineType === 'lead') {
      setAllLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId, ...extraData } : l));
    } else {
      setAllDeals(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId, ...extraData } : l));
    }

    try {
      const { data } = await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: newStageId, ...extraData });

      if (data.requires_conversion) {
        alert('Để chuyển Lead sang Deal, vui lòng dùng nút "Chuyển sang Deal" trên trang chi tiết.');
        if (pipelineType === 'lead') setAllLeads(prevLeads);
        else setAllDeals(prevDeals);
      }

      if (data.deal_won) {
        autoCreateProject(leadId);
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
    }
  }, [pipelineType, allLeads, allDeals, stagesLead, stagesDeal]);

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

  const followUpAlert = alerts?.total > 0;

  return (
    <div className="min-h-screen bg-gray-50 space-y-6">
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
      {/* Follow-up Alert Banner */}
      {followUpAlert && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">⚠️ {alerts.total} lead cần follow-up</p>
          </div>
          <button onClick={() => navigate('/crm')} className="text-xs text-amber-600 hover:text-amber-800 font-medium">Xem →</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-0">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 font-semibold">CRM / Quản lý khách hàng</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {pipelineType === 'lead' ? '💼 Quản lý Leads' : '🎯 Quản lý Deals'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button data-tour="add-lead" onClick={() => pipelineType === 'lead' ? setShowNewLead(true) : setShowNewDeal(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-all duration-200">
            <Plus className="h-4 w-4" /> + Thêm {pipelineType === 'lead' ? 'Lead' : 'Deal'}
          </button>
        </div>
      </div>

      {/* Pill-style Tab Switcher + Pin */}
      <div className="flex items-center gap-3">
        <div data-tour="pipeline-tabs" className="inline-flex gap-1 bg-gray-200 rounded-full p-1">
          <button
            onClick={() => switchTab('lead')}
            className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-1.5 ${pipelineType === 'lead' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            💼 Leads ({leads.length}) {pinnedTab === 'lead' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
          <button
            onClick={() => switchTab('deal')}
            className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-1.5 ${pipelineType === 'deal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🎯 Deals ({deals.length}) {pinnedTab === 'deal' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
        </div>
        <button
          onClick={() => togglePinTab(pipelineType)}
          title={pinnedTab === pipelineType ? `Bỏ ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'}` : `Ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'} - mở CRM sẽ vào thẳng`}
          className={`h-9 px-3 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${pinnedTab === pipelineType ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 border border-gray-200'}`}
        >
          <Pin className={`h-4 w-4 ${pinnedTab === pipelineType ? 'rotate-45' : ''}`} />
          {pinnedTab === pipelineType ? 'Đã ghim' : 'Ghim'}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search with instant results dropdown */}
          <div className="relative flex-1 min-w-[200px] max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={`🔍 Tìm nhanh: tên, SĐT, mã, mô tả, người phụ trách...`}
              className="w-full h-10 pl-9 pr-8 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
            {searchText && (
              <button onClick={() => setSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Instant search results dropdown */}
            {searchText.trim().length >= 2 && (pipelineType === 'lead' ? leads : deals).length > 0 && (pipelineType === 'lead' ? leads : deals).length <= 10 && (
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
                    onClick={() => {
                      markCrmPipelineCardFocus(item.id);
                      setSearchText('');
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
              className={`h-10 px-3 pl-9 rounded-xl text-sm font-medium cursor-pointer transition-all border appearance-none pr-8 ${
                timePreset
                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              style={{ minWidth: '160px' }}
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
              className="h-10 px-3 pl-9 rounded-xl text-sm font-medium cursor-pointer transition-all border appearance-none pr-8 bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              style={{ minWidth: '158px' }}
            >
              <option value="1000">📥 Tải 1.000</option>
              <option value="2000">📥 Tải 2.000</option>
              <option value="5000">📥 Tải 5.000</option>
              <option value="all">📥 Tải tất cả</option>
            </select>
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          {activePipelinePhoneTotals?.all != null && (
            <span
              className="text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 px-2.5 py-2 rounded-lg max-w-[min(100vw-2rem,24rem)] leading-snug"
              title="Đếm từ API (limit=1, chỉ dùng trường total) — không phụ thuộc mức Tải Kanban. Theo lọc NV + khoảng ngày trên server; chưa gồm lọc công ty / nguồn / giai đoạn / tìm nhanh (lọc phía client)."
            >
              <span className="font-semibold">{pipelineType === 'lead' ? 'Lead' : 'Deal'} — tổng:</span>{' '}
              {activePipelinePhoneTotals.all.toLocaleString('vi-VN')}
              {' · '}
              <span className="text-emerald-700">📞 có SĐT {typeof activePipelinePhoneTotals.hasPhone === 'number' ? activePipelinePhoneTotals.hasPhone.toLocaleString('vi-VN') : '—'}</span>
              {' · '}
              <span className="text-amber-800">chưa SĐT {typeof activePipelinePhoneTotals.noPhone === 'number' ? activePipelinePhoneTotals.noPhone.toLocaleString('vi-VN') : '—'}</span>
            </span>
          )}

          {/* Toggle advanced filters */}
          <button onClick={() => setShowAdvSearch(!showAdvSearch)}
            className={`h-10 px-4 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer transition-all border ${
              showAdvSearch || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterPhone
                ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            <Filter className="h-4 w-4" />
            Bộ lọc
            {(filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterPhone) && (
              <span className="bg-blue-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {[filterAssignee, filterAssigneeName, filterCompany, filterSource, filterStage, filterPhone].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear all filters */}
          {(searchText || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterPhone || timePreset) && (
            <button onClick={() => {
              setSearchText('');
              setFilterAssignee('');
              setAssigneeListSearch('');
              setFilterAssigneeName('');
              setFilterCompany('');
              setFilterSource('');
              setFilterStage('');
              setFilterPhone('');
              handleTimePresetChange('');
            }}
              className="h-10 px-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all border border-red-200">
              <X className="h-3.5 w-3.5" /> Xóa bộ lọc
            </button>
          )}

          {/* Result count */}
          {(searchText || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterPhone || timePreset) && (
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
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
                className="h-9 px-3 bg-white border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-gray-400 text-sm">→</span>
              <input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
                min={customDateFrom || undefined}
                className="h-9 px-3 bg-white border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
            </div>
            {customDateFrom && customDateTo && (
              <button
                onClick={() => load()}
                className="h-9 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition cursor-pointer flex items-center gap-1.5"
              >
                <Search className="h-3.5 w-3.5" /> Áp dụng
              </button>
            )}
            <button
              onClick={() => { handleTimePresetChange(''); }}
              className="h-9 px-3 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg text-sm transition cursor-pointer border border-gray-200"
            >
              Hủy
            </button>
          </div>
        )}

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
          <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <span className="text-xs font-bold text-gray-500 uppercase">Lọc nâng cao:</span>

            {/* NV: tìm trong list + chọn + lọc pipeline theo tên (Lead & Deal) */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Tìm tên trong danh sách NV</label>
                <input
                  type="search"
                  value={assigneeListSearch}
                  onChange={(e) => setAssigneeListSearch(e.target.value)}
                  placeholder="Gõ tên, email…"
                  className="h-9 w-44 max-w-[min(100vw-2rem,11rem)] px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Chọn NV (API + lọc)</label>
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                  title={!seesAllCrmDeals && pipelineType === 'deal' ? 'Deal: chỉ hiển thị deal do bạn phụ trách (theo tài khoản đăng nhập).' : undefined}
                  className={`h-9 min-w-[10rem] px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${!seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <option value="">👤 Tất cả nhân viên</option>
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
                <label className="text-[10px] text-gray-500 font-medium">Lọc theo tên NV trên pipeline</label>
                <input
                  type="search"
                  value={filterAssigneeName}
                  onChange={(e) => setFilterAssigneeName(e.target.value)}
                  disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                  placeholder="Chỉ tên người phụ trách / chủ lead"
                  title={!seesAllCrmDeals && pipelineType === 'deal' ? 'Deal: lọc NV đã cố định theo tài khoản của bạn.' : 'Không lọc theo tên khách hàng — tránh trùng với ô tìm nhanh phía trên'}
                  className={`h-9 w-52 max-w-[min(100vw-2rem,13rem)] px-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 ${!seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            {/* Company */}
            {companies.length > 0 && (
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="">🏢 Tất cả công ty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
              </select>
            )}

            {/* Source - smart: chỉ nguồn đang dùng, FB → [FB] Tên Page */}
            {smartSources.length > 0 && (
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="">🔗 Tất cả nguồn</option>
                {smartSources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}

            {/* Stage */}
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              <option value="">📊 Tất cả giai đoạn</option>
              {(pipelineType === 'lead' ? stagesLead : stagesDeal).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* Phone filter */}
            <select value={filterPhone} onChange={e => setFilterPhone(e.target.value)}
              className={`h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                filterPhone ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200'
              }`}>
              <option value="">📞 SĐT: Tất cả</option>
              <option value="has_phone">✅ Đã có SĐT</option>
              <option value="no_phone">❌ Chưa có SĐT</option>
            </select>

            {/* Company employees info badge */}
            {companyDepts.length > 0 && (
              <span className="text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                🏢 {companyEmployees.length} NV kinh doanh
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI Summary Row - MISA Style */}
      <div data-tour="crm-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pipelineType === 'lead' ? (
          <>
            <KPICard
              icon={<Target className="h-6 w-6" />}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
              label="Tổng Lead"
              value={kpis.total_leads || 0}
              trend={null}
            />
            <KPICard
              icon={<Zap className="h-6 w-6" />}
              iconBgColor="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Đang xử lý"
              value={leads.filter(l => !l.is_won).length}
              trend={null}
            />
            <KPICard
              icon={<CheckCircle2 className="h-6 w-6" />}
              iconBgColor="bg-purple-100"
              iconColor="text-purple-600"
              label="Chuyển Deal"
              value={kpis.converted_to_deals || 0}
              trend={null}
            />
            <KPICard
              icon={<Percent className="h-6 w-6" />}
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
              icon={<Zap className="h-6 w-6" />}
              iconBgColor="bg-cyan-100"
              iconColor="text-cyan-600"
              label="Tổng Deal"
              value={kpis.total_deals || 0}
              trend={null}
            />
            <KPICard
              icon={<FileText className="h-6 w-6" />}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
              label="Đang đàm phán"
              value={deals.filter(d => !d.is_won).length}
              trend={null}
            />
            <KPICard
              icon={<CheckCircle2 className="h-6 w-6" />}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
              label="Thắng"
              value={kpis.won_deals || 0}
              trend={null}
            />
            <KPICard
              icon={<DollarSign className="h-6 w-6" />}
              iconBgColor="bg-amber-100"
              iconColor="text-amber-600"
              label="Doanh thu thắng"
              value={formatVND(kpis.won_value || 0)}
              trend={null}
            />
          </>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 mb-3">
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

      {viewMode === 'kanban' && manualMergeIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
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
          <button
            type="button"
            onClick={() => setBulkAssignModalOpen(true)}
            className="h-9 px-4 rounded-lg bg-white border border-amber-400 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            Gán phụ trách
          </button>
          <button
            type="button"
            onClick={() => setManualMergeIds([])}
            className="h-9 px-3 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100 cursor-pointer"
          >
            Bỏ chọn
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
          calculateDays={calculateDays}
          mergeSelectedIds={manualMergeIds}
          onToggleMergeSelect={toggleManualMergeSelect}
        />
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
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Chức năng Lịch đang được phát triển</p>
        </div>
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => { setShowNewLead(false); load(); }}
          sources={sources}
          companies={companies}
          type={pipelineType}
          defaultCompanyId={filterCompany || user?.company_id}
          currentUser={user}
        />
      )}
      {showNewDeal && (
        <NewDealModal
          onClose={() => { setShowNewDeal(false); load(); }}
          sources={sources}
          companies={companies}
          defaultCompanyId={filterCompany || user?.company_id}
          currentUser={user}
        />
      )}

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
    </div>
  );
}

// KPI Card Component - MISA Style
function KPICard({ icon, iconBgColor, iconColor, label, value, trend }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${iconBgColor}`}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">{label}</p>
        <p className="text-2xl md:text-3xl font-bold text-gray-900">{value}</p>
        {trend && <p className="text-xs text-emerald-600 mt-2">↑ {trend}%</p>}
      </div>
    </div>
  );
}

/** Gán NV phụ trách hàng loạt — dùng cùng ô chọn Kanban với gộp thủ công */
function BulkAssignLeadsModal({ open, onClose, ids, pipelineType, users, onDone }) {
  const [assignDealId, setAssignDealId] = useState('');
  const [assignLeadOwnerId, setAssignLeadOwnerId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAssignDealId('');
      setAssignLeadOwnerId('');
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

  const filteredDealUsers = useMemo(
    () => pinSelected(filteredBase, assignDealId),
    [filteredBase, activeUsers, assignDealId]
  );
  const filteredOwnerUsers = useMemo(
    () => pinSelected(filteredBase, assignLeadOwnerId),
    [filteredBase, activeUsers, assignLeadOwnerId]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idList.length) return;
    if (!assignDealId && !assignLeadOwnerId) {
      alert('Chọn ít nhất phụ trách deal hoặc chủ lead');
      return;
    }
    setSaving(true);
    try {
      const body = { ids: idList };
      if (assignDealId) body.assigned_to = assignDealId;
      if (assignLeadOwnerId) body.lead_owner_id = assignLeadOwnerId;
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
              <strong>Phụ trách deal</strong> (NV được giao) và <strong>chủ lead</strong> (người giữ lead gốc) là hai vai trò khác nhau — áp dụng cho cả Lead và Deal. Chọn một hoặc cả hai; dòng nào để trống thì giữ nguyên trên thẻ.
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
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Tìm nhân viên (lọc cả hai danh sách)</label>
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
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">Phụ trách deal</label>
                  <select
                    value={assignDealId}
                    onChange={(ev) => setAssignDealId(ev.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
                  >
                    <option value="">— Giữ nguyên —</option>
                    {filteredDealUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email || u.id}{u.position ? ` — ${u.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-indigo-800 mb-1">Chủ lead / phụ trách lead</label>
                  <select
                    value={assignLeadOwnerId}
                    onChange={(ev) => setAssignLeadOwnerId(ev.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
                  >
                    <option value="">— Giữ nguyên —</option>
                    {filteredOwnerUsers.map((u) => (
                      <option key={`lo-${u.id}`} value={u.id}>
                        {u.full_name || u.email || u.id}{u.position ? ` — ${u.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {assigneeSearch.trim() && filteredBase.length === 0 && !assignDealId && !assignLeadOwnerId && (
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
                disabled={saving || (!assignDealId && !assignLeadOwnerId)}
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

function KanbanStageCard({ stage, items, onMoveStage, pipelineType, calculateDays, mergeSelectedIds, onToggleMergeSelect }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);
  const [columnMaxH, setColumnMaxH] = useState('70vh');

  // Đo vị trí thực tế của container → tính maxHeight responsive
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Chiều cao viewport trừ vị trí top của container, trừ padding bottom (40px)
        const available = window.innerHeight - rect.top - 40;
        setColumnMaxH(`${Math.max(300, available)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const stageColor = stage.color || '#e5e7eb';

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
      className={`flex-shrink-0 w-96 rounded-lg overflow-hidden transition-all duration-200 ${
        isOverColumn
          ? 'ring-2 ring-blue-500 ring-dashed'
          : ''
      }`}
    >
      {/* Colored Header Bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: stageColor }}
      />

      {/* Stage Header */}
      <div className={`bg-white border border-gray-200 border-t-0 p-4 transition-all ${
        isOverColumn ? 'bg-blue-50' : ''
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{stage.icon || '📌'}</span>
            <h3 className="font-semibold text-gray-900">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
              {items.length}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Giá trị: {formatVND(items.reduce((sum, item) => sum + (item.estimated_value || 0), 0))}
        </p>
      </div>

      {/* Cards Container - responsive height theo màn hình */}
      <div
        ref={containerRef}
        className={`bg-gray-50 border border-gray-200 border-t-0 p-3 overflow-y-auto space-y-3 transition-all ${
          isOverColumn ? 'bg-blue-50' : ''
        }`}
        style={{ maxHeight: columnMaxH, minHeight: '200px' }}
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
              calculateDays={calculateDays}
              mergeSelectedIds={mergeSelectedIds}
              onToggleMergeSelect={onToggleMergeSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Item Card - MISA Style
function KanbanCard({ item, stage, onMoveStage, pipelineType, calculateDays, mergeSelectedIds, onToggleMergeSelect }) {
  const navigate = useNavigate();
  const handleDragStart = (e) => {
    if (e.target.closest?.('[data-merge-checkbox]')) {
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

  return (
    <div
      data-crm-pipeline-card={item.id}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        if (e.target.closest?.('[data-merge-checkbox]')) return;
        localStorage.setItem('crm_pinned_tab', pipelineType);
        markCrmPipelineCardFocus(item.id);
        navigate(`/crm/leads/${item.id}`);
      }}
      className={`relative bg-white rounded-lg border border-gray-200 p-3 pt-9 transition-all duration-200 cursor-move group hover:-translate-y-0.5 hover:shadow-lg ${selectedForMerge ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
      style={{
        borderLeft: `3px solid ${stageColor}`,
      }}
    >
      {onToggleMergeSelect && (
        <label
          data-merge-checkbox
          className="absolute top-2 right-2 z-20 flex items-center justify-center cursor-pointer rounded-md p-0.5 hover:bg-gray-100"
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
          title="Chọn để gộp thủ công"
        >
          <input
            type="checkbox"
            checked={!!selectedForMerge}
            onChange={() => onToggleMergeSelect(item.id)}
            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
          />
        </label>
      )}
      {/* Header: Code + Value */}
      <div className="flex items-start justify-between mb-2 pr-7">
        <p className="text-xs font-semibold text-blue-600">{item.code}</p>
        {item.estimated_value > 0 && (
          <p className="text-sm font-bold text-emerald-600">{formatVND(item.estimated_value)}</p>
        )}
      </div>

      {/* Title */}
      <div className="flex items-start gap-2 mb-2 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{item.title}</p>
        {item.is_new_for_current_user && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-rose-500 px-1.5 py-0.5 rounded leading-tight">Mới</span>
        )}
      </div>

      {/* Customer name + Phone */}
      {(item.customer?.full_name || item.customer?.phone) && (
        <div className="mb-2 space-y-0.5">
          {item.customer?.full_name && (
            <p className="text-xs text-gray-600 truncate">👤 {item.customer.full_name}</p>
          )}
          {item.customer?.phone && (
            <p className="text-xs text-green-600 font-medium truncate">📞 {item.customer.phone}</p>
          )}
        </div>
      )}

      {/* Tab Lead: hiển thị phụ trách lead (chủ lead) + phụ trách deal (NV được giao); tab Deal: chỉ NV được giao */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {pipelineType === 'lead' ? (
            (() => {
              const lo = item.lead_owner;
              const as = item.assignee;
              const same = lo && as && String(lo.id) === String(as.id);
              if (same) {
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: stageColor }}
                    >
                      {getInitials(as.full_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 leading-tight">Phụ trách lead và deal</p>
                      <p className="text-xs text-gray-700 font-medium truncate">{as.full_name}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {lo ? (
                      <>
                        <div
                          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-indigo-500"
                        >
                          {getInitials(lo.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 leading-tight">Phụ trách lead</p>
                          <p className="text-xs text-gray-700 truncate">{lo.full_name}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-gray-400"><span className="text-gray-500">Phụ trách lead:</span> —</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {as ? (
                      <>
                        <div
                          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: stageColor }}
                        >
                          {getInitials(as.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 leading-tight">Phụ trách deal</p>
                          <p className="text-xs text-gray-600 truncate">{as.full_name}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-gray-400"><span className="text-gray-500">Phụ trách deal:</span> —</p>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex items-center gap-2">
              {item.assignee && (
                <>
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: stageColor }}
                  >
                    {getInitials(item.assignee.full_name)}
                  </div>
                  <span className="text-xs text-gray-600">{item.assignee.full_name}</span>
                </>
              )}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap shrink-0">
          {calculateDays(item.created_at)}
        </span>
      </div>

      {/* Deadline */}
      {item.expected_close_date && (
        <div className={`mt-2 text-[10px] px-2 py-1 rounded-lg font-medium ${
          new Date(item.expected_close_date) < new Date()
            ? 'bg-red-100 text-red-600'
            : new Date(item.expected_close_date) < new Date(Date.now() + 3 * 86400000)
            ? 'bg-amber-100 text-amber-600'
            : 'bg-purple-100 text-purple-600'
        }`}>
          📅 Deadline: {new Date(item.expected_close_date).toLocaleDateString('vi-VN')}
        </div>
      )}

      {/* Lý do thua */}
      {item.lost_reason && (
        <div className="mt-2 px-2 py-1.5 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-[10px] text-red-400 font-medium">❌ Lý do thua</p>
          <p className="text-xs text-red-600 line-clamp-2">{item.lost_reason}</p>
        </div>
      )}
    </div>
  );
}

// Kanban View Container - MISA Style
function KanbanView({ pipeline, onMoveStage, pipelineType, calculateDays, mergeSelectedIds, onToggleMergeSelect }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {pipeline.map(stage => (
          <KanbanStageCard
            key={stage.id}
            stage={stage}
            items={stage.items}
            onMoveStage={onMoveStage}
            pipelineType={pipelineType}
            calculateDays={calculateDays}
            mergeSelectedIds={mergeSelectedIds}
            onToggleMergeSelect={onToggleMergeSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ── NEW DEAL MODAL ─────────────────────────────────────────────────────────
function NewDealModal({ onClose, sources, companies, defaultCompanyId, currentUser }) {
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    estimated_value: 0,
    probability: 50,
    install_address: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên Deal');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!formData.customer_name) return alert('Nhập tên khách hàng');
    if (!formData.customer_phone) return alert('Nhập số điện thoại khách hàng');

    setSaving(true);
    try {
      // 1. Create customer
      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone,
        email: formData.customer_email || null,
        address: formData.install_address || null,
      });
      const customerId = customer?.id || customer?.customer?.id;

      // 2. Create deal directly
      await api.post('/crm/deals', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
        install_address: formData.install_address || null,
        description: formData.description || null,
      });
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo Deal');
    }
    setSaving(false);
  };

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">🎯 Tạo Deal mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Tạo deal trực tiếp - không cần qua Lead</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition cursor-pointer"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tên Deal */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Tên Deal *</label>
            <input type="text" required value={formData.title} onChange={e => set('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              placeholder="VD: Tủ bếp gỗ sồi nhà anh Minh" />
          </div>

          {/* Công ty */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">🏢 Công ty *</label>
            <select value={formData.company_id} onChange={e => set('company_id', e.target.value)} required
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
              <option value="">-- Chọn công ty --</option>
              {(companies || []).map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
            </select>
          </div>

          {/* Khách hàng */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <p className="text-xs font-bold text-blue-800 uppercase">👤 Thông tin khách hàng</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên khách hàng *</label>
              <input type="text" required value={formData.customer_name} onChange={e => set('customer_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Nguyễn Văn A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại *</label>
                <input type="text" required value={formData.customer_phone} onChange={e => set('customer_phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="0901234567" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.customer_email} onChange={e => set('customer_email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="email@example.com" />
              </div>
            </div>
          </div>

          {/* Địa chỉ lắp đặt */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">📍 Địa chỉ lắp đặt</label>
            <input type="text" value={formData.install_address} onChange={e => set('install_address', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              placeholder="Số nhà, đường, quận/huyện, TP..." />
          </div>

          {/* Nguồn */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Nguồn</label>
            <select value={formData.source_id} onChange={e => set('source_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
              <option value="">-- Chọn nguồn --</option>
              {(sources || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Giá trị + Xác suất */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Giá trị (VND)</label>
              <input type="number" value={formData.estimated_value} onChange={e => set('estimated_value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Xác suất (%)</label>
              <input type="number" min="0" max="100" value={formData.probability} onChange={e => set('probability', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Ghi chú</label>
            <textarea value={formData.description} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
              placeholder="Ghi chú thêm về deal..." />
          </div>

          {/* Phụ trách */}
          {currentUser && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <User className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-green-700 font-medium">Phụ trách:</span>
                <span className="text-sm font-semibold text-green-900 ml-1.5">{currentUser.full_name || currentUser.email}</span>
              </div>
              <span className="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded">Tự động</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all duration-200 disabled:opacity-50 text-sm cursor-pointer">
              {saving ? 'Đang tạo...' : '🎯 Tạo Deal'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition text-sm cursor-pointer">
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// New Lead Modal - Auto create customer
function NewLeadModal({ onClose, sources, companies, type, defaultCompanyId, currentUser }) {
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    estimated_value: 0,
    probability: 50,
    assigned_to: currentUser?.id || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên lead');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!formData.customer_name) return alert('Nhập tên khách hàng');

    if (!formData.customer_phone) {
      if (!confirm('⚠️ Chưa có số điện thoại khách hàng.\nBạn có thể nhập sau ở trang chi tiết Lead.\n\nTiếp tục tạo Lead?')) return;
    }

    setSaving(true);
    try {
      // 1. Create customer first
      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone || null,
      });
      const customerId = customer?.id || customer?.customer?.id;

      // 2. Get first lead stage
      const { data: stages } = await api.get('/crm/pipeline-stages', { params: { type: 'lead' } });
      const firstStage = stages?.[0];

      // 3. Create lead with customer_id
      await api.post('/crm/leads', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        assigned_to: formData.assigned_to || null,
        type: 'lead',
        stage_id: firstStage?.id,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
      });
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Thêm Lead mới</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition cursor-pointer"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Tên lead *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              placeholder="VD: Tủ bếp gỗ sồi nhà anh A..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">🏢 Công ty *</label>
            <select
              value={formData.company_id}
              onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
              required
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            >
              <option value="">-- Chọn công ty --</option>
              {(companies || []).map(c => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
            {!formData.company_id && <p className="text-xs text-red-500 mt-1">Bắt buộc chọn công ty</p>}
          </div>

          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <p className="text-xs font-bold text-blue-800 uppercase">👤 Khách hàng mới</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên khách hàng *</label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại</label>
              <input
                type="text"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="0901234567"
              />
            </div>
            <p className="text-xs text-blue-600">Thông tin chi tiết sẽ nhập thêm ở trang Lead</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Nguồn</label>
            <select
              value={formData.source_id}
              onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">-- Chọn nguồn --</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Người phụ trách - auto filled */}
          {currentUser && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <User className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-green-700 font-medium">Phụ trách:</span>
                <span className="text-sm font-semibold text-green-900 ml-1.5">{currentUser.full_name || currentUser.email}</span>
              </div>
              <span className="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded">Tự động</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Giá trị (VND)</label>
              <input
                type="number"
                value={formData.estimated_value}
                onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Xác suất (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.probability}
                onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 text-sm cursor-pointer"
            >
              {saving ? 'Đang tạo...' : 'Tạo Lead'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all duration-200 text-sm cursor-pointer"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  Clock, List, LayoutGrid
} from 'lucide-react';
import { ListView, PlannerView } from '../components/CRMViews';

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

export default function CRMDashboard() {
  const { user } = useAuth();
  const [dataLead, setDataLead] = useState(null);
  const [dataDeal, setDataDeal] = useState(null);
  // leads & deals are computed via useMemo (client-side filter) — see below
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [sources, setSources] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterPhone, setFilterPhone] = useState('has_phone'); // '' | 'has_phone' | 'no_phone'
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [users, setUsers] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [pipelineType, setPipelineType] = useState(() => localStorage.getItem('crm_pinned_tab') || 'lead'); // lead | deal
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [pinnedTab, setPinnedTab] = useState(() => localStorage.getItem('crm_pinned_tab') || '');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban'); // kanban | list | planner

  // ── TIME FILTER STATE ──
  const [timePreset, setTimePreset] = useState(''); // '' = all time
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [showCustomDate, setShowCustomDate] = useState(false);

  // ── COMPANY-BASED EMPLOYEE FILTER ──
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [companyDepts, setCompanyDepts] = useState([]);
  const [userCompanyId, setUserCompanyId] = useState('');
  const [fbPages, setFbPages] = useState([]); // Facebook pages for source labels

  const switchTab = (tab) => {
    setPipelineType(tab);
  };

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

  useEffect(() => { load(); }, [filterPhone, customDateFrom, customDateTo]);

  const load = async () => {
    setLoading(true);
    try {
      // Build date params for API
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;

      const [dashLeadRes, dashDealRes, leadsRes, dealsRes, stagesLeadRes, stagesDealRes, sourcesRes, alertsRes, companiesRes, usersRes] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead', ...dateParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal', ...dateParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/leads', { params: { type: 'lead', limit: 500, phone_filter: filterPhone || undefined, ...dateParams } }).catch(() => ({ data: [] })),
        api.get('/crm/leads', { params: { type: 'deal', limit: 500, phone_filter: filterPhone || undefined, ...dateParams } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources').catch(() => ({ data: [] })),
        api.get('/crm/alerts/follow-ups').catch(() => ({ data: { overdue: [], stale: [], total: 0 } })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setDataLead(dashLeadRes.data);
      setDataDeal(dashDealRes.data);
      setAllLeads(leadsRes.data);
      setAllDeals(dealsRes.data);
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

  // ── Computed: nguồn thông minh — non-FB giữ nguyên, FB → [FB] Tên Page ──
  const smartSources = useMemo(() => {
    // Non-FB sources (chỉ đang dùng)
    const allItems = [...allLeads, ...allDeals];
    const usedIds = new Set(allItems.map(l => l.source_id).filter(Boolean));
    const nonFb = sources
      .filter(s => usedIds.has(s.id) && !(s.name || '').toLowerCase().includes('facebook'))
      .map(s => ({ id: s.id, type: 'source', label: `${s.icon || ''} ${s.name}`.trim() }));
    // FB pages (luôn hiển thị nếu active)
    const fb = fbPages
      .filter(p => p.is_active)
      .map(p => ({ id: `fb:${p.page_id}`, type: 'fb_page', page_id: p.page_id, label: `[FB] ${p.page_name}` }));
    return [...fb, ...nonFb];
  }, [sources, allLeads, allDeals, fbPages]);

  // ── Map FB page_id → lead_ids (từ allLeads/allDeals join facebook_contacts) ──
  // Fetch once when filterSource starts with 'fb:'
  const [fbPageLeadIds, setFbPageLeadIds] = useState(new Set());
  const lastFbFilter = useRef('');
  useEffect(() => {
    if (!filterSource.startsWith('fb:')) {
      setFbPageLeadIds(new Set());
      lastFbFilter.current = '';
      return;
    }
    const pageId = filterSource.replace('fb:', '');
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

  const filterItems = useCallback((items) => {
    let result = items;
    
    // Company filter
    if (filterCompany) {
      result = result.filter(l => l.company_id === filterCompany);
    }
    
    // Assignee filter
    if (filterAssignee) {
      result = result.filter(l => l.assigned_to === filterAssignee || l.lead_owner_id === filterAssignee);
    }

    // Source filter — FB page dùng lead IDs, non-FB dùng source_id
    if (filterSource) {
      if (filterSource.startsWith('fb:')) {
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

    // Text search — tìm trong tên, mã, SĐT, mô tả, tên KH, email
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
  }, [searchText, filterCompany, filterAssignee, filterSource, filterStage, filterPhone, fbPageLeadIds, hasPhoneNumber]);

  const leads = useMemo(() => filterItems(allLeads), [allLeads, filterItems]);
  const deals = useMemo(() => filterItems(allDeals), [allDeals, filterItems]);

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
            <p className="text-sm text-white/80">Deal thắng — hệ thống đang tạo dự án và phân công nhiệm vụ</p>
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
            <button onClick={() => navigate(`/projects/${autoCreateResult.project_id}`)}
              className="h-9 px-4 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-sm font-semibold cursor-pointer transition">
              Xem dự án →
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
          title={pinnedTab === pipelineType ? `Bỏ ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'}` : `Ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'} — mở CRM sẽ vào thẳng`}
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
                    onClick={() => setSearchText('')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{item.code}</span>
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
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

          {/* Toggle advanced filters */}
          <button onClick={() => setShowAdvSearch(!showAdvSearch)}
            className={`h-10 px-4 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer transition-all border ${
              showAdvSearch || filterAssignee || filterCompany || filterSource || filterStage || filterPhone
                ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            <Filter className="h-4 w-4" />
            Bộ lọc
            {(filterAssignee || filterCompany || filterSource || filterStage || filterPhone) && (
              <span className="bg-blue-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {[filterAssignee, filterCompany, filterSource, filterStage, filterPhone].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear all filters */}
          {(searchText || filterAssignee || filterCompany || filterSource || filterStage || filterPhone || timePreset) && (
            <button onClick={() => { setSearchText(''); setFilterAssignee(''); setFilterCompany(''); setFilterSource(''); setFilterStage(''); setFilterPhone(''); handleTimePresetChange(''); }}
              className="h-10 px-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all border border-red-200">
              <X className="h-3.5 w-3.5" /> Xóa bộ lọc
            </button>
          )}

          {/* Result count */}
          {(searchText || filterAssignee || filterCompany || filterSource || filterStage || filterPhone || timePreset) && (
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">
              {pipelineType === 'lead' ? leads.length : deals.length} / {pipelineType === 'lead' ? allLeads.length : allDeals.length} kết quả
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
            
            {/* Assignee — filtered by company's sales departments */}
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
              className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              <option value="">👤 Tất cả nhân viên</option>
              {companyDepts.length > 0 ? (
                // Group by department
                companyDepts.map(dept => {
                  const deptUsers = employeeFilterList.filter(u => u.department_id === dept.id);
                  if (!deptUsers.length) return null;
                  return (
                    <optgroup key={dept.id} label={`📁 ${dept.name}`}>
                      {deptUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.position ? ` (${u.position})` : ''}</option>)}
                    </optgroup>
                  );
                })
              ) : (
                // Fallback: flat list
                employeeFilterList.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)
              )}
            </select>

            {/* Company */}
            {companies.length > 0 && (
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="">🏢 Tất cả công ty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
              </select>
            )}

            {/* Source — smart: chỉ nguồn đang dùng, FB → [FB] Tên Page */}
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

      {/* Kanban View */}
      {viewMode === 'kanban' && (
      <div data-tour="kanban-pipeline" className="rounded-xl overflow-hidden">
        <KanbanView 
          pipeline={currentPipeline} 
          onMoveStage={handleMoveStage}
          pipelineType={pipelineType}
          calculateDays={calculateDays}
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

// Kanban Stage Card - MISA Style (with pagination)
const ITEMS_PER_PAGE = 10;

function KanbanStageCard({ stage, items, onMoveStage, pipelineType, calculateDays }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const [page, setPage] = useState(0);
  
  const stageColor = stage.color || '#e5e7eb';
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const pagedItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Reset page khi items thay đổi
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [items.length, totalPages, page]);
  
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
      
      {/* Cards Container */}
      <div className={`bg-gray-50 border border-gray-200 border-t-0 p-3 min-h-96 max-h-96 overflow-y-auto space-y-3 transition-all ${
        isOverColumn ? 'bg-blue-50' : ''
      }`}>
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo lead vào đây'}
            </p>
          </div>
        ) : (
          pagedItems.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              stage={stage}
              onMoveStage={onMoveStage}
              pipelineType={pipelineType}
              calculateDays={calculateDays}
            />
          ))
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="bg-white border border-gray-200 border-t-0 px-3 py-2 flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-7 px-2 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            ← Trước
          </button>
          <span className="text-[11px] text-gray-500 font-medium">
            {page + 1}/{totalPages} ({items.length})
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="h-7 px-2 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  );
}

// Kanban Item Card - MISA Style
function KanbanCard({ item, stage, onMoveStage, pipelineType, calculateDays }) {
  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('leadId', item.id);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const stageColor = stage.color || '#e5e7eb';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => { localStorage.setItem('crm_pinned_tab', pipelineType); window.location.href = `/crm/leads/${item.id}`; }}
      className={`bg-white rounded-lg border border-gray-200 p-3 transition-all duration-200 cursor-move group hover:-translate-y-0.5 hover:shadow-lg`}
      style={{
        borderLeft: `3px solid ${stageColor}`,
      }}
    >
      {/* Header: Code + Value */}
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-blue-600">{item.code}</p>
        {item.estimated_value > 0 && (
          <p className="text-sm font-bold text-emerald-600">{formatVND(item.estimated_value)}</p>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 truncate mb-2">{item.title}</p>

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

      {/* Avatar + Assignee + Age tag */}
      <div className="flex items-center justify-between">
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
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
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
function KanbanView({ pipeline, onMoveStage, pipelineType, calculateDays }) {
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
            <p className="text-xs text-gray-500 mt-0.5">Tạo deal trực tiếp — không cần qua Lead</p>
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

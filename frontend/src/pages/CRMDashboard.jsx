import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, User, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingDown, AlertTriangle, Building2, Rocket, Pin
} from 'lucide-react';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

export default function CRMDashboard() {
  const { user } = useAuth();
  const [dataLead, setDataLead] = useState(null);
  const [dataDeal, setDataDeal] = useState(null);
  const [leads, setLeads] = useState([]);
  const [deals, setDeals] = useState([]);
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [sources, setSources] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [alerts, setAlerts] = useState(null);
  const [pipelineType, setPipelineType] = useState(() => localStorage.getItem('crm_pinned_tab') || 'lead'); // lead | deal
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [pinnedTab, setPinnedTab] = useState(() => localStorage.getItem('crm_pinned_tab') || '');
  const [loading, setLoading] = useState(true);

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

  // Auto-create project countdown
  const [autoCountdown, setAutoCountdown] = useState(null);
  const [autoWonDealId, setAutoWonDealId] = useState(null);
  const autoTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current.redirect);
        clearInterval(autoTimerRef.current.countdown);
      }
    };
  }, []);

  const startAutoCreateCountdown = (dealId) => {
    setAutoWonDealId(dealId);
    setAutoCountdown(3);
    const countdown = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev <= 1) { clearInterval(countdown); return 0; }
        return prev - 1;
      });
    }, 1000);
    const redirect = setTimeout(() => {
      navigate(`/projects/create?deal_id=${dealId}`);
    }, 3000);
    autoTimerRef.current = { redirect, countdown };
  };

  const cancelAutoCreate = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current.redirect);
      clearInterval(autoTimerRef.current.countdown);
    }
    setAutoCountdown(null);
    setAutoWonDealId(null);
    autoTimerRef.current = null;
  };

  const skipToCreate = () => {
    const dealId = autoWonDealId;
    cancelAutoCreate();
    navigate(`/projects/create?deal_id=${dealId}`);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [filterCompany]);

  const load = async () => {
    setLoading(true);
    const companyParam = filterCompany ? { company_id: filterCompany } : {};
    try {
      const [dashLeadRes, dashDealRes, leadsRes, dealsRes, stagesLeadRes, stagesDealRes, sourcesRes, alertsRes, companiesRes] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead', ...companyParam } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal', ...companyParam } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/leads', { params: { type: 'lead', ...companyParam } }).catch(() => ({ data: [] })),
        api.get('/crm/leads', { params: { type: 'deal', ...companyParam } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources').catch(() => ({ data: [] })),
        api.get('/crm/alerts/follow-ups').catch(() => ({ data: { overdue: [], stale: [], total: 0 } })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
      ]);
      setDataLead(dashLeadRes.data);
      setDataDeal(dashDealRes.data);
      setLeads(leadsRes.data);
      setDeals(dealsRes.data);
      setStagesLead(stagesLeadRes.data);
      setStagesDeal(stagesDealRes.data);
      setSources(sourcesRes.data);
      setCompanies(companiesRes.data?.companies || companiesRes.data || []);
      setAlerts(alertsRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

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
    const prevLeads = leads;
    const prevDeals = deals;
    
    // Optimistic update
    if (pipelineType === 'lead') {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l));
    } else {
      setDeals(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l));
    }

    try {
      const { data } = await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: newStageId });
      
      if (data.requires_conversion) {
        alert('Để chuyển Lead sang Deal, vui lòng dùng nút "Chuyển sang Deal" trên trang chi tiết.');
        if (pipelineType === 'lead') setLeads(prevLeads);
        else setDeals(prevDeals);
      }

      if (data.deal_won) {
        // Deal thắng → hiển thị thông báo 5s rồi chuyển sang tạo dự án
        startAutoCreateCountdown(leadId);
      }
    } catch (e) {
      console.error(e);
      // Revert on error
      if (pipelineType === 'lead') setLeads(prevLeads);
      else setDeals(prevDeals);
    }
  }, [pipelineType, leads, deals]);

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
      {/* Auto-create project countdown banner */}
      {autoCountdown !== null && autoCountdown > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white shadow-lg flex items-center justify-between mx-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-full font-bold text-xl animate-bounce">{autoCountdown}</div>
            <div>
              <p className="font-bold text-lg">🎉 Deal Thắng!</p>
              <p className="text-sm text-white/90">Hệ thống sẽ tự động tạo dự án trong <strong>{autoCountdown} giây</strong>...</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={cancelAutoCreate}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              ✋ Hủy
            </button>
            <button onClick={skipToCreate}
              className="h-9 px-4 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-semibold cursor-pointer transition flex items-center gap-1">
              <Rocket className="h-4 w-4" /> Tạo ngay
            </button>
          </div>
        </div>
      )}
      {autoCountdown === 0 && (
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-xl p-4 text-white shadow-lg flex items-center gap-4 mx-0">
          <div className="animate-spin h-8 w-8 border-3 border-white/30 border-t-white rounded-full" />
          <div>
            <p className="font-bold">🚀 Đang chuyển sang tạo dự án...</p>
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

      {/* Company Filter */}
      {companies.length > 0 && (
        <div data-tour="crm-company-filter" className="flex items-center gap-3 flex-wrap">
          <Building2 className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Công ty:</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button onClick={() => setFilterCompany('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                !filterCompany ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
              }`}>Tất cả</button>
            {companies.map(c => (
              <button key={c.id} onClick={() => setFilterCompany(c.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  filterCompany === c.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                }`}>{c.short_name || c.name}</button>
            ))}
          </div>
        </div>
      )}

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

      {/* Kanban View - MISA Style */}
      <div data-tour="kanban-pipeline" className="rounded-xl overflow-hidden">
        <KanbanView 
          pipeline={currentPipeline} 
          onMoveStage={handleMoveStage}
          pipelineType={pipelineType}
          calculateDays={calculateDays}
        />
      </div>

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

// Kanban Stage Card - MISA Style
function KanbanStageCard({ stage, items, onMoveStage, pipelineType, calculateDays }) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  
  const stageColor = stage.color || '#e5e7eb';
  
  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };

  const handleColumnDragLeave = (e) => {
    // Only leave if dragging out of the column completely
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
          items.map(item => (
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

      {/* Customer name */}
      {item.customer?.full_name && (
        <p className="text-xs text-gray-600 truncate mb-2">{item.customer.full_name}</p>
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

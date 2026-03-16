import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingDown, AlertTriangle
} from 'lucide-react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

export default function CRMDashboard() {
  const [dataLead, setDataLead] = useState(null);
  const [dataDeal, setDataDeal] = useState(null);
  const [leads, setLeads] = useState([]);
  const [deals, setDeals] = useState([]);
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [sources, setSources] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [pipelineType, setPipelineType] = useState('lead'); // lead | deal
  const [showNewLead, setShowNewLead] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [dashLeadRes, dashDealRes, leadsRes, dealsRes, stagesLeadRes, stagesDealRes, sourcesRes, alertsRes] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead' } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal' } }).catch(() => ({ data: { pipeline: [], kpis: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/leads', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/leads', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/crm/sources').catch(() => ({ data: [] })),
        api.get('/crm/alerts/follow-ups').catch(() => ({ data: { overdue: [], stale: [], total: 0 } })),
      ]);
      setDataLead(dashLeadRes.data);
      setDataDeal(dashDealRes.data);
      setLeads(leadsRes.data);
      setDeals(dealsRes.data);
      setStagesLead(stagesLeadRes.data);
      setStagesDeal(stagesDealRes.data);
      setSources(sourcesRes.data);
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
        // Revert
        if (pipelineType === 'lead') setLeads(prevLeads);
        else setDeals(prevDeals);
      }

      if (data.auto_project) {
        alert(`🎉 Deal Thắng! Dự án ${data.auto_project.code || ''} đã liên kết.`);
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
          <h1 className="text-3xl font-bold text-gray-900">CRM</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNewLead(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-all duration-200">
            <Plus className="h-4 w-4" /> + Thêm {pipelineType === 'lead' ? 'Lead' : 'Deal'}
          </button>
        </div>
      </div>

      {/* Pill-style Tab Switcher */}
      <div className="inline-flex gap-1 bg-gray-200 rounded-full p-1">
        <button
          onClick={() => setPipelineType('lead')}
          className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-200 ${pipelineType === 'lead' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          💼 Leads ({leads.length})
        </button>
        <button
          onClick={() => setPipelineType('deal')}
          className={`px-6 py-2 rounded-full font-medium text-sm transition-all duration-200 ${pipelineType === 'deal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          🎯 Deals ({deals.length})
        </button>
      </div>

      {/* KPI Summary Row - MISA Style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      <div className="rounded-xl overflow-hidden">
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
          type={pipelineType}
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
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {trend && <p className="text-xs text-emerald-600 mt-2">↑ {trend}%</p>}
      </div>
    </div>
  );
}

// Kanban Stage Card - MISA Style
function KanbanStageCard({ stage, items, onMoveStage, pipelineType, calculateDays }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  
  const stageColor = stage.color || '#e5e7eb';
  
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-96 rounded-lg overflow-hidden transition-all duration-200 ${isOver ? 'ring-2 ring-blue-400' : ''}`}
    >
      {/* Colored Header Bar */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: stageColor }}
      />
      
      {/* Stage Header */}
      <div className="bg-white border border-gray-200 border-t-0 p-4">
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
      <div className="bg-gray-50 border border-gray-200 border-t-0 p-3 min-h-96 max-h-96 overflow-y-auto space-y-3">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm">Kéo lead vào đây</p>
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
  const [draggedOver, setDraggedOver] = useState(false);

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('leadId', item.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOver(true);
  };

  const handleDragLeave = () => {
    setDraggedOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggedOver(false);
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId && leadId !== item.id.toString()) {
      onMoveStage(leadId, stage.id);
    }
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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => window.location.href = `/crm/leads/${item.id}`}
      className={`bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all duration-200 cursor-move group`}
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

// New Lead Modal - Professional Style
function NewLeadModal({ onClose, sources, type }) {
  const [formData, setFormData] = useState({
    title: '',
    customer_id: '',
    source_id: '',
    estimated_value: 0,
    probability: 50,
  });
  const [customers, setCustomers] = useState([]);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (searchCustomer.length > 0) {
      api.get('/customers', { params: { search: searchCustomer } })
        .then(res => setCustomers(res.data?.customers || res.data || []))
        .catch(() => setCustomers([]));
    }
  }, [searchCustomer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên lead');
    
    setSaving(true);
    try {
      // Get first lead stage
      const { data: stages } = await api.get('/crm/pipeline-stages', { params: { type: 'lead' } });
      const firstStage = stages?.[0];

      await api.post('/crm/leads', {
        ...formData,
        type: 'lead',
        stage_id: firstStage?.id,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
      });
      alert('Đã thêm lead mới');
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
          <h2 className="text-xl font-bold text-gray-900">Thêm {type === 'lead' ? 'Lead' : 'Deal'} mới</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Tên {type === 'lead' ? 'lead' : 'deal'} *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              placeholder="VD: Dự án tủ bếp..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">Khách hàng</label>
            <div className="relative">
              <input
                type="text"
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Tìm khách hàng..."
              />
              {customers.length > 0 && searchCustomer && (
                <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                  {customers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, customer_id: c.id });
                        setSearchCustomer('');
                        setCustomers([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-b-0"
                    >
                      {c.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 text-sm"
            >
              {saving ? 'Đang lưu...' : 'Thêm'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all duration-200 text-sm"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

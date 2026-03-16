import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingDown
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
  const [view, setView] = useState('pipeline'); // pipeline | list
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
    }));
  }, [stagesLead, leads]);

  const pipelineDeal = useMemo(() => {
    if (!stagesDeal.length) return [];
    return stagesDeal.map(s => ({
      ...s,
      items: deals.filter(l => l.stage_id === s.id),
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM - Quản lý khách hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Pipeline bán hàng, leads & deals</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNewLead(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> {pipelineType === 'lead' ? 'Thêm Lead' : 'Thêm Deal'}
          </button>
        </div>
      </div>

      {/* Lead/Deal Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setPipelineType('lead')}
          className={`px-4 py-2 rounded-lg font-medium transition ${pipelineType === 'lead' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          💼 Leads ({leads.length})
        </button>
        <button
          onClick={() => setPipelineType('deal')}
          className={`px-4 py-2 rounded-lg font-medium transition ${pipelineType === 'deal' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          🎯 Deals ({deals.length})
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pipelineType === 'lead' ? (
          <>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Target className="h-5 w-5 text-blue-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Tổng Leads</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.total_leads || 0}</h3>
              <p className="text-sm text-gray-500">Đang quản lý</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Zap className="h-5 w-5 text-emerald-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Chuyển Deal</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.converted_to_deals || 0}</h3>
              <p className="text-sm text-gray-500">Đã chuyển thành Deal</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><Percent className="h-5 w-5 text-purple-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Tỷ lệ</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.conversion_rate || 0}%</h3>
              <p className="text-sm text-gray-500">Lead → Deal</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><DollarSign className="h-5 w-5 text-amber-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Pipeline</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{formatVND(kpis.total_value || 0)}</h3>
              <p className="text-sm text-gray-500">Giá trị lead</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center"><Zap className="h-5 w-5 text-cyan-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Tổng Deals</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.total_deals || 0}</h3>
              <p className="text-sm text-gray-500">Đang xử lý</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Thắng</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.won_deals || 0}</h3>
              <p className="text-sm text-gray-500">Deal Thắng</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><TrendingDown className="h-5 w-5 text-red-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Tỷ lệ</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">{kpis.won_rate || 0}%</h3>
              <p className="text-sm text-gray-500">Tỷ lệ chiến thắng</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><DollarSign className="h-5 w-5 text-amber-600" /></div>
                <span className="text-xs text-gray-500 font-semibold uppercase">Doanh thu</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{formatVND(kpis.won_value || 0)}</h3>
              <p className="text-sm text-gray-500">Deal Thắng</p>
            </div>
          </>
        )}
      </div>

      {/* Kanban View */}
      <div className="bg-white rounded-xl border p-6 overflow-x-auto">
        <KanbanView 
          pipeline={currentPipeline} 
          onMoveStage={handleMoveStage}
          pipelineType={pipelineType}
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

// Kanban Stage Card
function KanbanStageCard({ stage, leads, onMoveStage, pipelineType }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  
  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4 border border-gray-200"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg">{stage.icon || '📌'}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{stage.name}</h3>
            <p className="text-xs text-gray-500">{leads.length} item</p>
          </div>
        </div>
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: stage.color || '#e5e7eb', color: 'white' }}
        >
          {leads.length}
        </span>
      </div>
      <div className="space-y-2">
        {leads.map(lead => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            stage={stage}
            onMoveStage={onMoveStage}
            pipelineType={pipelineType}
          />
        ))}
      </div>
    </div>
  );
}

// Kanban Item Card
function KanbanCard({ lead, stage, onMoveStage, pipelineType }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        onMoveStage(leadId, stage.id);
      }}
      onClick={() => window.location.href = `/crm/leads/${lead.id}`}
      className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer"
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-600">{lead.code}</p>
          <p className="text-sm font-medium text-gray-900 truncate">{lead.title}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <MoreHorizontal className="h-4 w-4 text-gray-400" />
        </button>
      </div>
      
      {lead.estimated_value > 0 && (
        <p className="text-sm font-semibold text-emerald-600 mb-2">{formatVND(lead.estimated_value)}</p>
      )}
      
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {lead.customer?.full_name && (
          <>
            <Users className="h-3 w-3" />
            <span className="truncate">{lead.customer.full_name}</span>
          </>
        )}
      </div>

      {menuOpen && (
        <div className="absolute mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <Link
            to={`/crm/leads/${lead.id}`}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => setMenuOpen(false)}
          >
            Xem chi tiết
          </Link>
        </div>
      )}
    </div>
  );
}

// Kanban View Container
function KanbanView({ pipeline, onMoveStage, pipelineType }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {pipeline.map(stage => (
        <KanbanStageCard
          key={stage.id}
          stage={stage}
          leads={stage.items}
          onMoveStage={onMoveStage}
          pipelineType={pipelineType}
        />
      ))}
    </div>
  );
}

// New Lead Modal
function NewLeadModal({ onClose, sources, type }) {
  const [formData, setFormData] = useState({
    title: '',
    source_id: '',
    estimated_value: 0,
    probability: 50,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
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
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Thêm Lead mới</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Tên lead *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Tên tủ bếp, dự án..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Nguồn</label>
            <select
              value={formData.source_id}
              onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Chọn nguồn --</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Giá trị ước tính</label>
              <input
                type="number"
                value={formData.estimated_value}
                onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Xác suất (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.probability}
                onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t">
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              Thêm Lead
            </button>
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

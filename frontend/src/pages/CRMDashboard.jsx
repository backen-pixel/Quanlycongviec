import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  TrendingUp, Users, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical
} from 'lucide-react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

export default function CRMDashboard() {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [sources, setSources] = useState([]);
  const [view, setView] = useState('pipeline'); // pipeline | list
  const [showNewLead, setShowNewLead] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, leadsRes, stagesRes, sourcesRes] = await Promise.all([
        api.get('/crm/dashboard'),
        api.get('/crm/leads'),
        api.get('/crm/pipeline-stages'),
        api.get('/crm/sources'),
      ]);
      setData(dashRes.data);
      setLeads(leadsRes.data);
      setStages(stagesRes.data);
      setSources(sourcesRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Pipeline view: group leads by stage
  const pipeline = useMemo(() => {
    if (!stages.length) return [];
    return stages.map(s => ({
      ...s,
      leads: leads.filter(l => l.stage_id === s.id),
    }));
  }, [stages, leads]);

  const kpis = data?.kpis || {};

  const handleMoveStage = useCallback(async (leadId, newStageId) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l));
    try {
      await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: newStageId });
    } catch (e) {
      console.error(e);
      load(); // Revert on error
    }
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM - Quản lý khách hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Pipeline bán hàng, leads, báo giá & đơn hàng</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNewLead(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm Lead
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Target className="h-5 w-5 text-blue-600" /></div>
            <span className="text-xs text-gray-500 font-semibold uppercase">Leads</span>
          </div>
          <h3 className="text-3xl font-bold text-gray-900">{kpis.total_leads || 0}</h3>
          <p className="text-sm text-gray-500">{kpis.won_leads || 0} đã chốt</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Percent className="h-5 w-5 text-emerald-600" /></div>
            <span className="text-xs text-gray-500 font-semibold uppercase">Tỷ lệ chốt</span>
          </div>
          <h3 className="text-3xl font-bold text-gray-900">{kpis.conversion_rate || 0}%</h3>
          <p className="text-sm text-gray-500">Lead → Hợp đồng</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><DollarSign className="h-5 w-5 text-amber-600" /></div>
            <span className="text-xs text-gray-500 font-semibold uppercase">Pipeline</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{formatVND(kpis.pipeline_value || 0)}</h3>
          <p className="text-sm text-gray-500">Đang đàm phán</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
            <span className="text-xs text-gray-500 font-semibold uppercase">Doanh thu</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{formatVND(kpis.won_value || 0)}</h3>
          <p className="text-sm text-gray-500">Đã chốt</p>
        </div>
      </div>

      {/* Pipeline Kanban - Drag & Drop */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">📊 Pipeline bán hàng <span className="text-xs text-gray-400 font-normal ml-2">Kéo thả để chuyển stage</span></h2>
          <div className="flex items-center gap-2">
            <Link to="/crm/quotations" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Báo giá</Link>
            <Link to="/crm/orders" className="text-xs text-emerald-600 hover:underline flex items-center gap-1 ml-3"><ShoppingCart className="h-3.5 w-3.5" /> Đơn hàng</Link>
            <Link to="/crm/invoices" className="text-xs text-purple-600 hover:underline flex items-center gap-1 ml-3"><Receipt className="h-3.5 w-3.5" /> Hóa đơn</Link>
          </div>
        </div>

        <PipelineKanban pipeline={pipeline} stages={stages} onMoveStage={handleMoveStage} navigate={navigate} />
      </div>

      {/* Mini Pipeline Funnel Chart */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">📈 Phễu chuyển đổi</h3>
        <div className="flex items-end gap-2 justify-center" style={{ height: '120px' }}>
          {pipeline.map((s, i) => {
            const maxCount = Math.max(...pipeline.map(p => p.count), 1);
            const h = Math.max((s.count / maxCount) * 100, s.count > 0 ? 12 : 4);
            return (
              <div key={s.id} className="flex flex-col items-center flex-1 max-w-[100px]">
                <span className="text-xs font-bold text-gray-900 mb-1">{s.count}</span>
                <div className="w-full rounded-t-lg transition-all" style={{ height: `${h}%`, backgroundColor: s.color, minHeight: '4px' }} />
                <span className="text-[9px] text-gray-500 mt-1 text-center leading-tight">{s.icon}<br />{s.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick links: Recent Quotations & Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Quotations */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-600" /> Báo giá gần đây</h3>
            <Link to="/crm/quotations" className="text-xs text-blue-600 hover:underline">Xem tất cả →</Link>
          </div>
          <div className="space-y-2">
            {(data?.recent_quotations || []).map(q => (
              <Link to={`/crm/quotations/${q.id}`} key={q.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                <div>
                  <span className="text-xs font-bold text-blue-600">{q.code}</span>
                  <p className="text-sm text-gray-900 font-medium">{q.title || q.customer_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formatVND(q.total || 0)}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${q.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : q.status === 'sent' ? 'bg-blue-100 text-blue-700' : q.status === 'converted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {q.status === 'draft' ? 'Nháp' : q.status === 'sent' ? 'Đã gửi' : q.status === 'accepted' ? 'Chấp nhận' : q.status === 'converted' ? 'Đã chuyển ĐH' : q.status}
                  </span>
                </div>
              </Link>
            ))}
            {(!data?.recent_quotations?.length) && <p className="text-center text-xs text-gray-400 py-4">Chưa có báo giá</p>}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-emerald-600" /> Đơn hàng gần đây</h3>
            <Link to="/crm/orders" className="text-xs text-emerald-600 hover:underline">Xem tất cả →</Link>
          </div>
          <div className="space-y-2">
            {(data?.recent_orders || []).map(o => (
              <Link to={`/crm/orders/${o.id}`} key={o.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                <div>
                  <span className="text-xs font-bold text-emerald-600">{o.code}</span>
                  <p className="text-sm text-gray-900 font-medium">{o.title || o.customer_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formatVND(o.total || 0)}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${o.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : o.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {o.payment_status === 'paid' ? 'Đã TT' : o.payment_status === 'partial' ? 'TT 1 phần' : 'Chưa TT'}
                  </span>
                </div>
              </Link>
            ))}
            {(!data?.recent_orders?.length) && <p className="text-center text-xs text-gray-400 py-4">Chưa có đơn hàng</p>}
          </div>
        </div>
      </div>

      {/* Invoice Stats */}
      {data?.invoice_stats && (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><Receipt className="h-5 w-5 text-purple-600" /> Hóa đơn</h3>
            <Link to="/crm/invoices" className="text-xs text-purple-600 hover:underline">Xem tất cả →</Link>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-xl"><p className="text-2xl font-bold text-gray-900">{data.invoice_stats.total}</p><p className="text-xs text-gray-500">Tổng HĐ</p></div>
            <div className="text-center p-3 bg-emerald-50 rounded-xl"><p className="text-lg font-bold text-emerald-700">{formatVND(data.invoice_stats.paid_amount)}</p><p className="text-xs text-emerald-600">Đã thu</p></div>
            <div className="text-center p-3 bg-amber-50 rounded-xl"><p className="text-lg font-bold text-amber-700">{formatVND(data.invoice_stats.total_amount - data.invoice_stats.paid_amount)}</p><p className="text-xs text-amber-600">Còn nợ</p></div>
            <div className="text-center p-3 bg-red-50 rounded-xl"><p className="text-2xl font-bold text-red-700">{data.invoice_stats.unpaid}</p><p className="text-xs text-red-600">Chưa TT</p></div>
          </div>
        </div>
      )}

      {/* New Lead Modal */}
      {showNewLead && <NewLeadModal sources={sources} stages={stages} onClose={() => setShowNewLead(false)} onSave={() => { setShowNewLead(false); load(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE KANBAN with Drag & Drop
// ═══════════════════════════════════════════════════════════════════════════
function PipelineKanban({ pipeline, stages, onMoveStage, navigate }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allLeads = useMemo(() => {
    const m = {};
    pipeline.forEach(s => s.leads.forEach(l => { m[l.id] = l; }));
    return m;
  }, [pipeline]);

  const handleDragStart = (event) => setActiveId(event.active.id);
  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const leadId = active.id;
    const overId = over.id;
    // overId can be a stage id (droppable) or another lead id
    let targetStageId = stages.find(s => s.id === overId)?.id;
    if (!targetStageId) {
      // Find which stage the over lead belongs to
      const overLead = allLeads[overId];
      targetStageId = overLead?.stage_id;
    }
    if (targetStageId && allLeads[leadId]?.stage_id !== targetStageId) {
      onMoveStage(leadId, targetStageId);
    }
  };

  const activeLead = activeId ? allLeads[activeId] : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {pipeline.map(stage => (
          <StageColumn key={stage.id} stage={stage} navigate={navigate} />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function StageColumn({ stage, navigate }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: '260px' }}>
      <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: stage.color, borderTopWidth: '4px' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><span>{stage.icon}</span> {stage.name}</h3>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{stage.leads.length}</span>
        </div>
        {stage.leads.length > 0 && <p className="text-xs text-gray-400 mt-1">{formatVND(stage.leads.reduce((s, l) => s + (l.estimated_value || 0), 0))}</p>}
      </div>
      <div ref={setNodeRef} className={`flex-1 rounded-b-xl border p-2 space-y-2 overflow-y-auto transition-colors ${isOver ? 'bg-blue-50 border-blue-300' : 'bg-gray-50/50'}`} style={{ maxHeight: '60vh', minHeight: '120px' }}>
        {stage.leads.map(lead => <DraggableLeadCard key={lead.id} lead={lead} navigate={navigate} />)}
        {stage.leads.length === 0 && <p className="text-center py-8 text-xs text-gray-300">Kéo lead vào đây</p>}
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead, navigate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : {};
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <LeadCard lead={lead} dragListeners={listeners} onClick={() => navigate(`/crm/leads/${lead.id}`)} />
    </div>
  );
}

function LeadCard({ lead, isDragging, dragListeners, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 p-3 transition-all cursor-pointer group ${isDragging ? 'shadow-xl border-blue-400 rotate-2' : 'hover:shadow-md hover:border-blue-400'}`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="flex items-center gap-1">
          <span {...dragListeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-100 rounded" onClick={e => e.stopPropagation()}>
            <GripVertical className="h-3 w-3 text-gray-300" />
          </span>
          <span className="text-[10px] text-blue-600 font-bold">{lead.code}</span>
        </div>
        {lead.source && <span className="text-[10px]">{lead.source?.icon}</span>}
      </div>
      <h4 className="text-xs font-bold text-gray-900 group-hover:text-blue-600 mb-1 leading-snug">{lead.title}</h4>
      {lead.customer && <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><Users className="h-3 w-3" />{lead.customer.full_name}</p>}
      {lead.estimated_value > 0 && <p className="text-xs font-bold text-green-600">{formatVND(lead.estimated_value)}</p>}
      {lead.assignee && <p className="text-[10px] text-gray-400 mt-1">{lead.assignee.full_name}</p>}
      {lead.next_follow_up && (
        <div className={`text-[10px] mt-1 flex items-center gap-1 ${new Date(lead.next_follow_up) < new Date() ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
          <Calendar className="h-3 w-3" />{formatDate(lead.next_follow_up)}
        </div>
      )}
    </div>
  );
}

function NewLeadModal({ sources, stages, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', customer_id: '', estimated_value: 0, source_id: '', stage_id: stages[0]?.id || '', description: '', probability: 50 });
  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/customers', { params: { limit: 200 } }).then(r => setCustomers(r.data.customers || r.data || [])); }, []);

  const filteredCust = customers.filter(c => {
    if (!custSearch) return true;
    const s = custSearch.toLowerCase();
    return (c.full_name || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
  });

  const createCustomer = async () => {
    if (!newCust.full_name) return alert('Nhập tên KH');
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(prev => [...prev, data]);
      setForm(f => ({ ...f, customer_id: data.id }));
      setShowNewCust(false);
      setNewCust({ full_name: '', phone: '', email: '' });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const save = async () => {
    if (!form.title) return alert('Nhập tên cơ hội');
    setSaving(true);
    try {
      await api.post('/crm/leads', form);
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const selectedCust = customers.find(c => c.id === form.customer_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Thêm Lead mới</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Tên cơ hội *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Tủ bếp căn hộ A.Minh" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Khách hàng</label>
              {selectedCust ? (
                <div className="flex items-center gap-2 mt-1 h-10 px-3 border rounded-lg bg-blue-50">
                  <span className="text-sm font-medium text-blue-700 flex-1">{selectedCust.full_name} {selectedCust.phone ? `· ${selectedCust.phone}` : ''}</span>
                  <button onClick={() => setForm(f => ({ ...f, customer_id: '' }))} className="text-gray-400 hover:text-red-500 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <div className="mt-1 space-y-1">
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Tìm tên, SĐT..." className="w-full h-9 px-3 border rounded-lg text-sm" />
                  {custSearch && (
                    <div className="border rounded-lg max-h-28 overflow-y-auto bg-white shadow-lg">
                      {filteredCust.slice(0, 8).map(c => (
                        <button key={c.id} onClick={() => { setForm(f => ({ ...f, customer_id: c.id })); setCustSearch(''); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 cursor-pointer flex justify-between">
                          <span className="font-medium">{c.full_name}</span><span className="text-xs text-gray-400">{c.phone}</span>
                        </button>
                      ))}
                      {filteredCust.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Không tìm thấy</p>}
                    </div>
                  )}
                  <button onClick={() => setShowNewCust(!showNewCust)} className="text-xs text-blue-600 hover:underline cursor-pointer">+ Tạo KH mới</button>
                  {showNewCust && (
                    <div className="border rounded-lg p-2 bg-gray-50 space-y-1">
                      <input value={newCust.full_name} onChange={e => setNewCust(p => ({ ...p, full_name: e.target.value }))} placeholder="Tên KH *" className="w-full h-8 px-2 border rounded text-xs" />
                      <div className="grid grid-cols-2 gap-1">
                        <input value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))} placeholder="SĐT" className="h-8 px-2 border rounded text-xs" />
                        <input value={newCust.email} onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="h-8 px-2 border rounded text-xs" />
                      </div>
                      <button onClick={createCustomer} className="h-7 px-3 bg-emerald-600 text-white rounded text-xs cursor-pointer">Tạo</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Nguồn</label>
              <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value || null }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                <option value="">Chọn nguồn</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Giá trị ước tính</label>
              <input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: parseFloat(e.target.value) || 0 }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Xác suất (%)</label>
              <input type="number" min={0} max={100} value={form.probability} onChange={e => setForm(f => ({ ...f, probability: parseInt(e.target.value) || 0 }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Ghi chú</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Tạo Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

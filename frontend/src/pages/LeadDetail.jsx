import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, Edit2, Trash2, X, Save, Building2, FolderKanban,
  FileUp, FileText, Zap, ChevronDown
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showDocuments, setShowDocuments] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRes, actRes, docRes, stagesLeadRes, stagesDealRes, flowsRes] = await Promise.all([
        api.get(`/crm/leads/${id}/detail`).then(r => r.data),
        api.get(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/workflow-flows').catch(() => ({ data: [] })),
      ]);
      setLead(leadRes);
      setCustomer(leadRes?.customer);
      setActivities(actRes.data || []);
      setDocuments(docRes.data || []);
      setStagesLead(stagesLeadRes.data || []);
      setStagesDeal(stagesDealRes.data || []);
      setFlows(flowsRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const moveStage = async (stageId) => {
    try {
      const { data } = await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId });
      if (data.requires_conversion) {
        setShowConvertModal(true);
      } else {
        load();
      }
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteLead = async () => {
    if (!confirm('Xóa lead này?')) return;
    await api.delete(`/crm/leads/${id}`);
    navigate('/crm');
  };

  const startEditField = (field, value) => {
    setEditingField(field);
    setEditValue(value || '');
  };

  const saveField = async (field) => {
    try {
      await api.put(`/customers/${customer.id}`, { [field]: editValue });
      setCustomer(prev => ({ ...prev, [field]: editValue }));
      setEditingField(null);
      alert('Đã lưu');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  if (loading || !lead) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const stages = lead.type === 'deal' ? stagesDeal : stagesLead;
  const currentStageIdx = stages.findIndex(s => s.id === lead.stage_id);
  const isPipelineComplete = stages.some(s => s.id === lead.stage_id && s.is_won);
  const canConvert = lead.type === 'lead' && !lead.project_id;

  const deleteDocument = async (docId) => {
    if (!confirm('Xóa tài liệu?')) return;
    try {
      await api.delete(`/crm/leads/${id}/documents/${docId}`);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const uploadDocument = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data: uploadRes } = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        // Create document record
        const { data: doc } = await api.post(`/crm/leads/${id}/documents`, {
          name: file.name.replace(/\.[^.]+$/, ''),
          doc_type: file.type.startsWith('image/') ? 'image' : file.name.endsWith('.dwg') || file.name.endsWith('.dxf') ? 'drawing' : 'other',
          file_url: uploadRes.url || uploadRes.file_url,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        });
        setDocuments(prev => [doc, ...prev]);
      } catch (err) {
        alert(err.response?.data?.error || 'Upload lỗi');
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <p className="text-xs text-blue-600 font-bold">{lead.code} • {lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'}</p>
            <h1 className="text-2xl font-bold text-gray-900">{lead.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canConvert && (
            <button onClick={() => setShowConvertModal(true)} className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
              <Zap className="h-4 w-4" /> Chuyển Deal
            </button>
          )}
          <button onClick={() => navigate(`/crm/quotations/new?lead_id=${id}`)} className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
            <FileText className="h-4 w-4" /> Báo giá
          </button>
          {lead.project_id && (
            <Link to={`/projects/${lead.project_id}`} className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
              <FolderKanban className="h-4 w-4" /> Dự án
            </Link>
          )}
          <button onClick={deleteLead} className="h-9 px-3 text-red-500 border border-red-200 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {stages.map((s, i) => {
            const isCurrent = s.id === lead.stage_id;
            const isPast = i < currentStageIdx;
            return (
              <button key={s.id} onClick={() => moveStage(s.id)}
                className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                  isCurrent ? 'text-white shadow-md' : isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={isCurrent ? { backgroundColor: s.color } : {}}>
                <span>{s.icon} {s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Customer Card - Inline Edit */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Khách hàng</h3>
            
            {customer ? (
              <div className="space-y-3">
                {['full_name', 'phone', 'email', 'address', 'company', 'tax_code'].map(field => (
                  <div key={field} className="group">
                    <p className="text-xs text-gray-500 mb-0.5">{field === 'full_name' ? 'Tên' : field === 'phone' ? 'SĐT' : field === 'email' ? 'Email' : field === 'address' ? 'Địa chỉ' : field === 'company' ? 'Công ty' : 'Mã số thuế'}</p>
                    {editingField === field ? (
                      <div className="flex gap-1">
                        <input
                          type={field === 'email' ? 'email' : 'text'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 h-8 px-2 border rounded text-sm"
                          autoFocus
                        />
                        <button onClick={() => saveField(field)} className="px-2 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                          <Save className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 hover:bg-gray-50 p-1 rounded cursor-pointer group-hover:bg-gray-50"
                        onClick={() => startEditField(field, customer[field])}>
                        {customer[field] || '—'} <Edit2 className="h-3 w-3 inline opacity-0 group-hover:opacity-100 ml-1" />
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chưa chọn khách hàng</p>
            )}
          </div>

          {/* Lead Info */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Thông tin</h3>
            <div className="space-y-2">
              {lead.estimated_value > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Giá trị</p>
                  <p className="text-sm font-bold text-emerald-600">{formatVND(lead.estimated_value)}</p>
                </div>
              )}
              {lead.probability && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Xác suất</p>
                  <p className="text-sm font-bold text-blue-600">{lead.probability}%</p>
                </div>
              )}
              {lead.source && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Nguồn</p>
                  <p className="text-sm font-medium">{lead.source.icon} {lead.source.name}</p>
                </div>
              )}
              {lead.assignee && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Phụ trách</p>
                  <p className="text-sm font-medium">👤 {lead.assignee.full_name}</p>
                </div>
              )}
              {lead.expected_close_date && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Dự kiến chốt</p>
                  <p className="text-sm font-medium">{formatDate(lead.expected_close_date)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Documents + Activities */}
        <div className="lg:col-span-2 space-y-6">
          {/* Documents Section */}
          {lead.type === 'lead' && (
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase">📋 Tài liệu khách hàng</h3>
                <button
                  onClick={() => setShowDocuments(!showDocuments)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {showDocuments ? 'Ẩn' : 'Hiện'}
                </button>
              </div>

              {showDocuments && (
                <div>
                  {documents.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                      <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Chưa upload tài liệu</p>
                      <p className="text-xs text-gray-400 mt-1">Cần ít nhất 1 tài liệu để chuyển sang Deal</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <DocumentRow key={doc.id} doc={doc} onDelete={() => { deleteDocument(doc.id); }} />
                      ))}
                    </div>
                  )}

                  <button
                    onClick={uploadDocument}
                    className="mt-4 w-full h-9 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileUp className="h-4 w-4" /> Upload tài liệu
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Activities */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase">Hoạt động</h3>
              <button onClick={() => setShowAddActivity(true)} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Plus className="h-3.5 w-3.5" /> Thêm
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Chưa có hoạt động</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {activities.map(act => {
                  const typeInfo = ACTIVITY_TYPES.find(t => t.value === act.type) || ACTIVITY_TYPES[4];
                  return (
                    <div key={act.id} className="p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-start gap-2">
                        <span className="text-lg shrink-0">{typeInfo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">{act.title}</p>
                            <span className="text-[10px] text-gray-400">{formatDate(act.activity_date)}</span>
                          </div>
                          {act.description && <p className="text-xs text-gray-600 mt-1">{act.description}</p>}
                          {act.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {act.outcome}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddActivity && <AddActivityModal leadId={id} onClose={() => setShowAddActivity(false)} onSave={() => { setShowAddActivity(false); load(); }} />}
      {showConvertModal && (
        <ConvertToDeadModal
          leadId={id}
          customer={customer}
          documents={documents}
          flows={flows}
          onClose={() => setShowConvertModal(false)}
          onSuccess={() => { setShowConvertModal(false); load(); }}
        />
      )}
    </div>
  );
}

function DocumentRow({ doc, onDelete }) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border">
      <div className="flex items-center gap-2 flex-1">
        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
          <p className="text-xs text-gray-500">{doc.doc_type}</p>
        </div>
      </div>
      <button onClick={onDelete} className="p-1 hover:bg-red-100 text-red-600 rounded">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddActivityModal({ leadId, onClose, onSave }) {
  const [form, setForm] = useState({ type: 'call', title: '', description: '', outcome: '', duration_minutes: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title) return alert('Nhập tiêu đề');
    setSaving(true);
    try {
      await api.post(`/crm/leads/${leadId}/activities`, form);
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Thêm hoạt động</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Loại</label>
            <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 px-2 border rounded mt-1 text-sm">
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Tiêu đề *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="VD: Gọi tư vấn" className="w-full h-9 px-2 border rounded mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">Nội dung</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-2 py-1 border rounded mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">Kết quả</label>
            <input value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} className="w-full h-9 px-2 border rounded mt-1 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-9 border rounded text-sm">Hủy</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 bg-blue-600 text-white rounded text-sm">{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}

function ConvertToDeadModal({ leadId, customer, documents, flows, onClose, onSuccess }) {
  const [selectedFlow, setSelectedFlow] = useState('');
  const [converting, setConverting] = useState(false);

  const canConvert = customer?.full_name && customer?.phone && documents?.length > 0;

  const handleConvert = async () => {
    if (!selectedFlow) return alert('Chọn luồng quy trình');
    setConverting(true);
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/convert-to-deal`, { flow_id: selectedFlow });
      alert(`✅ ${data.message}`);
      onSuccess();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setConverting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">🚀 Chuyển Lead sang Deal</h2>

        <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
          {/* Validation Checklist */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700 uppercase">Yêu cầu:</p>
            <div className={`text-sm flex items-center gap-2 ${customer?.full_name && customer?.phone ? 'text-emerald-600' : 'text-red-600'}`}>
              <span className="text-lg">{customer?.full_name && customer?.phone ? '✅' : '❌'}</span>
              Khách hàng: {customer?.full_name || '—'}, {customer?.phone || '—'}
            </div>
            <div className={`text-sm flex items-center gap-2 ${documents?.length > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              <span className="text-lg">{documents?.length > 0 ? '✅' : '❌'}</span>
              Tài liệu: {documents?.length || 0} file
            </div>
          </div>

          {/* Flow Selection */}
          <div>
            <label className="text-sm font-medium">Luồng quy trình *</label>
            <select value={selectedFlow} onChange={(e) => setSelectedFlow(e.target.value)} className="w-full h-10 px-3 border rounded mt-2 text-sm">
              <option value="">-- Chọn luồng --</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 border rounded font-medium">Hủy</button>
          <button
            onClick={handleConvert}
            disabled={!canConvert || !selectedFlow || converting}
            className="flex-1 h-10 bg-emerald-600 text-white rounded font-medium disabled:opacity-50"
          >
            {converting ? 'Đang xử lý...' : 'Chuyển Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}

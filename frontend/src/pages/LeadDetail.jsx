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
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeTab, setActiveTab] = useState('documents');

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
        api.get('/flows').then(r => r.data?.flows || r.data || []).catch(() => []),
      ]);
      setLead(leadRes);
      setCustomer(leadRes?.customer);
      setActivities(actRes.data || []);
      setDocuments(docRes.data || []);
      setStagesLead(stagesLeadRes.data || []);
      setStagesDeal(stagesDealRes.data || []);
      setFlows(flowsRes || []);
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
  const canConvert = (lead.type === 'lead' || !lead.type || lead.type === '') && !lead.project_id;

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
        formData.append('files', file); // backend expects 'files' field
        const { data: uploadRes } = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploaded = uploadRes.files?.[0];
        if (!uploaded) throw new Error('Upload thất bại');
        // Create document record
        const { data: doc } = await api.post(`/crm/leads/${id}/documents`, {
          name: file.name.replace(/\.[^.]+$/, ''),
          doc_type: file.type.startsWith('image/') ? 'image' : file.name.match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: uploaded.file_url,
          file_name: uploaded.file_name,
          file_size: uploaded.file_size,
          mime_type: uploaded.mime_type,
        });
        setDocuments(prev => [doc, ...prev]);
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
    };
    input.click();
  };

  const addTextDocument = async (name, docType, notes) => {
    try {
      const { data: doc } = await api.post(`/crm/leads/${id}/documents`, {
        name,
        doc_type: docType || 'other',
        notes,
      });
      setDocuments(prev => [doc, ...prev]);
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi');
    }
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

      {/* Pipeline Progress - MISA Style Stepper */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between overflow-x-auto">
          {stages.map((s, i) => {
            const isCurrent = s.id === lead.stage_id;
            const isPast = i < currentStageIdx;
            
            return (
              <div key={s.id} className="flex items-start flex-1 min-w-0">
                {/* Step: circle + name stacked vertically */}
                <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 70 }}>
                  <button 
                    onClick={() => moveStage(s.id)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 cursor-pointer ${
                      isPast ? 'bg-emerald-500 text-white shadow-sm' 
                      : isCurrent ? 'text-white shadow-lg ring-4 ring-blue-100' 
                      : 'border-2 border-gray-300 text-gray-400 hover:border-gray-400'
                    }`}
                    style={isCurrent ? { backgroundColor: s.color || '#3B82F6' } : {}}
                    title={s.name}
                  >
                    {isPast ? '✓' : s.icon || (i + 1)}
                  </button>
                  <p className={`mt-2 text-xs text-center leading-tight max-w-[80px] ${
                    isCurrent ? 'text-gray-900 font-bold' : isPast ? 'text-emerald-600 font-medium' : 'text-gray-500'
                  }`}>
                    {s.name}
                  </p>
                </div>
                
                {/* Connecting line */}
                {i < stages.length - 1 && (
                  <div className="flex-1 flex items-center pt-5 px-1">
                    <div className={`w-full h-0.5 ${isPast ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Customer Card - Inline Edit */}
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Khách hàng</h3>
            
            {customer ? (
              <div className="space-y-3">
                {/* Contact Info Section */}
                <div className="space-y-3">
                  {['full_name', 'phone', 'email'].map(field => (
                    <div key={field} className="group">
                      <p className="text-xs text-gray-500 mb-0.5 font-medium">
                        {field === 'full_name' ? '👤 Tên' : field === 'phone' ? '📞 SĐT' : '✉️ Email'}
                      </p>
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

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Business Info Section */}
                <div className="space-y-3">
                  {['address', 'company', 'tax_code'].map(field => (
                    <div key={field} className="group">
                      <p className="text-xs text-gray-500 mb-0.5 font-medium">
                        {field === 'address' ? '📍 Địa chỉ' : field === 'company' ? '🏢 Công ty' : '🧾 MST'}
                      </p>
                      {editingField === field ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
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
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chưa chọn khách hàng</p>
            )}
          </div>

          {/* Lead Info */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Thông tin</h3>
            <div className="space-y-3">
              {lead.estimated_value > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">💰 Giá trị</p>
                  <p className="text-sm font-bold text-emerald-600">{formatVND(lead.estimated_value)}</p>
                </div>
              )}
              {lead.probability && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500">📊 Xác suất</p>
                    <p className="text-sm font-bold text-blue-600">{lead.probability}%</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${lead.probability}%` }}
                    />
                  </div>
                </div>
              )}
              {lead.source && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">🔗 Nguồn</p>
                  <p className="text-sm font-medium">{lead.source.icon} {lead.source.name}</p>
                </div>
              )}
              {lead.assignee && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">👤 Phụ trách</p>
                  <p className="text-sm font-medium">{lead.assignee.full_name}</p>
                </div>
              )}
              {lead.expected_close_date && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">📅 Dự kiến chốt</p>
                  <p className="text-sm font-medium">{formatDate(lead.expected_close_date)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{activities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{documents.length}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Cuộc gọi</p>
              <p className="text-xl font-bold text-purple-600">{activities.filter(a => a.type === 'call').length}</p>
            </div>
          </div>
        </div>

        {/* Right: Documents + Activities with Tabs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Switcher */}
          <div className="bg-white rounded-xl border">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Tài liệu ({documents.length})
              </button>
              <button
                onClick={() => setActiveTab('activities')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'activities'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💬 Hoạt động ({activities.length})
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {activeTab === 'documents' ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowAddDoc(true)} className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                        <Plus className="h-3.5 w-3.5" /> Nhập văn bản
                      </button>
                      <button onClick={uploadDocument} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                        <FileUp className="h-3.5 w-3.5" /> Upload file
                      </button>
                    </div>
                  </div>

                  {documents.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                      <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Chưa có tài liệu</p>
                      <p className="text-xs text-gray-400 mt-1">Upload file hoặc nhập văn bản để thêm tài liệu</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {documents.map(doc => (
                        <DocumentRow key={doc.id} doc={doc} onDelete={() => deleteDocument(doc.id)} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
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
                      {/* Vertical timeline line */}
                      <div className="relative">
                        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                        {activities.map((act, idx) => {
                          const typeInfo = ACTIVITY_TYPES.find(t => t.value === act.type) || ACTIVITY_TYPES[4];
                          return (
                            <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4">
                              <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
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
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddActivity && <AddActivityModal leadId={id} onClose={() => setShowAddActivity(false)} onSave={() => { setShowAddActivity(false); load(); }} />}
      {showAddDoc && (
        <AddDocumentModal
          onClose={() => setShowAddDoc(false)}
          onSave={(name, docType, notes) => {
            addTextDocument(name, docType, notes);
            setShowAddDoc(false);
          }}
        />
      )}
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

const DOC_TYPES = [
  { value: 'requirement', label: 'Yêu cầu KH', icon: '📝' },
  { value: 'drawing', label: 'Bản vẽ', icon: '📐' },
  { value: 'image', label: 'Hình ảnh', icon: '🖼️' },
  { value: 'contract', label: 'Hợp đồng', icon: '📄' },
  { value: 'measurement', label: 'Số đo', icon: '📏' },
  { value: 'other', label: 'Khác', icon: '📎' },
];

function DocumentRow({ doc, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = DOC_TYPES.find(t => t.value === doc.doc_type) || DOC_TYPES[5];
  const isFile = !!doc.file_url;

  return (
    <div className="bg-gray-50 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => doc.notes && setExpanded(!expanded)}>
          <span className="text-lg shrink-0">{typeInfo.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
            <p className="text-xs text-gray-500">{typeInfo.label}{isFile ? ` • ${doc.file_name}` : ' • Văn bản'}</p>
          </div>
          {isFile && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0 px-2" onClick={e => e.stopPropagation()}>
              Mở
            </a>
          )}
          {doc.notes && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        <button onClick={onDelete} className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && doc.notes && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-white rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">{doc.notes}</div>
        </div>
      )}
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

function AddDocumentModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('requirement');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">📝 Thêm tài liệu văn bản</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Tên tài liệu *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Yêu cầu khách hàng, Kích thước bếp..." className="w-full h-9 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Loại</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm mt-1">
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Nội dung *</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
              placeholder="Nhập nội dung tài liệu, yêu cầu khách hàng, ghi chú kích thước, chất liệu mong muốn..."
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-9 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button
            onClick={() => { if (!name.trim()) return alert('Nhập tên tài liệu'); if (!notes.trim()) return alert('Nhập nội dung'); onSave(name, docType, notes); }}
            className="flex-1 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Lưu tài liệu
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertToDeadModal({ leadId, customer, documents, flows, onClose, onSuccess }) {
  const [selectedFlow, setSelectedFlow] = useState('');
  const [converting, setConverting] = useState(false);
  const [flowPreview, setFlowPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const canConvert = customer?.full_name && customer?.phone && documents?.length > 0;

  // Load flow preview when flow selected
  useEffect(() => {
    if (!selectedFlow) { setFlowPreview(null); return; }
    const flow = flows.find(f => f.id === selectedFlow);
    if (flow?.steps?.length) {
      setFlowPreview(flow);
    } else {
      // Fetch full flow details
      setLoadingPreview(true);
      api.get(`/flows/${selectedFlow}`)
        .then(r => setFlowPreview(r.data?.flow || r.data))
        .catch(() => setFlowPreview(null))
        .finally(() => setLoadingPreview(false));
    }
  }, [selectedFlow]);

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
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">🚀 Chuyển Lead sang Deal</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Validation Checklist */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700 uppercase">Yêu cầu:</p>
            <div className={`text-sm flex items-center gap-2 ${customer?.full_name && customer?.phone ? 'text-emerald-600' : 'text-red-600'}`}>
              {customer?.full_name && customer?.phone ? '✅' : '❌'} Khách hàng: {customer?.full_name || '—'}, {customer?.phone || 'Chưa có SĐT'}
            </div>
            <div className={`text-sm flex items-center gap-2 ${documents?.length > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {documents?.length > 0 ? '✅' : '❌'} Tài liệu: {documents?.length || 0} tài liệu
            </div>
          </div>

          {/* Flow Selection */}
          <div>
            <label className="text-sm font-bold text-gray-900">Chọn luồng quy trình *</label>
            <select value={selectedFlow} onChange={(e) => setSelectedFlow(e.target.value)} className="w-full h-10 px-3 border border-gray-300 rounded-lg mt-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">-- Chọn luồng --</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name} {f.is_default ? '⭐' : ''}</option>)}
            </select>
          </div>

          {/* Flow Preview */}
          {loadingPreview && (
            <div className="text-center py-4"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" /></div>
          )}
          {flowPreview && flowPreview.steps?.length > 0 && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <p className="text-xs font-bold text-blue-800 uppercase mb-3">📋 Tổng quan luồng: {flowPreview.name}</p>
              <div className="space-y-3">
                {flowPreview.steps.map((step, i) => {
                  const levelInfo = step.division?.level;
                  // Collect all tasks: template tasks + process tasks
                  const templateTasks = step.tasks || [];
                  const processes = step.processes || [];
                  const processTasks = processes.flatMap(p => (p.tasks || []).map(t => ({ ...t, _processName: p.name, _processIcon: p.icon })));
                  const allTasks = [...templateTasks, ...processTasks];
                  const totalChecklists = allTasks.reduce((sum, t) => sum + (t.checklists?.length || 0), 0);

                  return (
                    <div key={step.id || i} className="bg-white rounded-lg p-3 border border-blue-100">
                      {/* Step header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white bg-blue-500 rounded-full w-5 h-5 flex items-center justify-center">{i + 1}</span>
                          <span className="text-sm font-bold text-gray-900">
                            {step.division?.name || 'Khối ' + (i + 1)}
                          </span>
                          {levelInfo && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: (levelInfo.color || '#6366F1') + '20', color: levelInfo.color || '#6366F1' }}>{levelInfo.icon} {levelInfo.name}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {allTasks.length > 0 && <span>📌 {allTasks.length} NV</span>}
                          {totalChecklists > 0 && <span>☑️ {totalChecklists} CL</span>}
                        </div>
                      </div>

                      {step.company?.name && (
                        <p className="text-xs text-gray-600 ml-7">🏢 {step.company.name}</p>
                      )}
                      {step.template_set?.name && (
                        <p className="text-xs text-gray-600 ml-7">📦 Bộ mẫu: {step.template_set.name}</p>
                      )}

                      {/* Processes */}
                      {processes.length > 0 && (
                        <div className="ml-7 mt-2 space-y-2">
                          {processes.map((proc, pi) => (
                            <div key={proc.id || pi} className="bg-gray-50 rounded-lg p-2 border">
                              <p className="text-xs font-bold text-gray-800 mb-1">{proc.icon || '⚙️'} {proc.name} <span className="font-normal text-gray-500">({proc.tasks?.length || 0} NV)</span></p>
                              {proc.tasks?.length > 0 && (
                                <div className="space-y-0.5 ml-2">
                                  {proc.tasks.slice(0, 4).map((t, j) => (
                                    <div key={t.id || j} className="flex items-center gap-1.5 text-xs text-gray-600">
                                      <span className="text-gray-300">•</span>
                                      <span>{t.title}</span>
                                      {t.checklists?.length > 0 && <span className="text-gray-400">({t.checklists.length} CL)</span>}
                                    </div>
                                  ))}
                                  {proc.tasks.length > 4 && <p className="text-xs text-blue-500 ml-3">+{proc.tasks.length - 4} NV khác</p>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Template tasks (if no processes) */}
                      {processes.length === 0 && templateTasks.length > 0 && (
                        <div className="ml-7 mt-2 space-y-0.5">
                          {templateTasks.slice(0, 5).map((t, j) => (
                            <div key={t.id || j} className="flex items-center gap-1.5 text-xs text-gray-600">
                              <span className="text-gray-300">•</span>
                              <span>{t.title}</span>
                              {t.checklists?.length > 0 && <span className="text-gray-400">({t.checklists.length} CL)</span>}
                            </div>
                          ))}
                          {templateTasks.length > 5 && <p className="text-xs text-blue-500 ml-3">+{templateTasks.length - 5} NV khác</p>}
                        </div>
                      )}

                      {/* Empty state */}
                      {allTasks.length === 0 && processes.length === 0 && (
                        <p className="text-xs text-gray-400 ml-7 mt-1 italic">Chưa có nhiệm vụ (sẽ dùng mặc định)</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-blue-200 flex items-center gap-4 text-xs text-blue-700">
                <span>🔄 {flowPreview.steps.length} bước</span>
                <span>📌 {flowPreview.steps.reduce((s, st) => {
                  const tpl = st.tasks?.length || 0;
                  const proc = (st.processes || []).reduce((ps, p) => ps + (p.tasks?.length || 0), 0);
                  return s + tpl + proc;
                }, 0)} nhiệm vụ</span>
                <span>☑️ {flowPreview.steps.reduce((s, st) => {
                  const all = [...(st.tasks || []), ...(st.processes || []).flatMap(p => p.tasks || [])];
                  return s + all.reduce((cs, t) => cs + (t.checklists?.length || 0), 0);
                }, 0)} checklist</span>
              </div>
            </div>
          )}
          {flowPreview && (!flowPreview.steps || flowPreview.steps.length === 0) && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <p className="text-xs text-amber-700">⚠️ Luồng này chưa có bước quy trình. Hệ thống sẽ tạo nhiệm vụ mặc định cho tất cả giai đoạn.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 border rounded-lg font-medium cursor-pointer">Hủy</button>
          <button
            onClick={handleConvert}
            disabled={!canConvert || !selectedFlow || converting}
            className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50 cursor-pointer transition-colors"
          >
            {converting ? 'Đang xử lý...' : '🚀 Chuyển Deal & Tạo Dự Án'}
          </button>
        </div>
      </div>
    </div>
  );
}

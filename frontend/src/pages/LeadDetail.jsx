import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import CRMTasksTab from '../components/CRMTasksTab';
import ExcelQuotationImport from '../components/ExcelQuotationImport';
import EmployeePicker from '../components/EmployeePicker';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, Edit2, Trash2, X, Save, Building2, FolderKanban,
  FileUp, FileText, Zap, ChevronDown, Send, Image, Paperclip, RefreshCw
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
  const [taskDocuments, setTaskDocuments] = useState([]);
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [flows, setFlows] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeTab, setActiveTab] = useState('tasks');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);

  // Auto-create project (chạy ngầm)
  const [autoCreateStatus, setAutoCreateStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [autoCreateResult, setAutoCreateResult] = useState(null); // { project_id, project_code, tasks_created }
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
      load(); // Reload deal để cập nhật project_id
    } catch (e) {
      const msg = e.response?.data?.error || 'Lỗi tạo dự án';
      if (e.response?.data?.project_id) {
        // Deal đã có dự án
        setAutoCreateResult({ project_id: e.response.data.project_id });
        setAutoCreateStatus('success');
      } else {
        setAutoCreateError(msg);
        setAutoCreateStatus('error');
      }
      autoCreateCalledRef.current = false;
    }
  };

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRes, actRes, docRes, stagesLeadRes, stagesDealRes, flowsRes, usersRes, taskDocRes] = await Promise.all([
        api.get(`/crm/leads/${id}/detail`).then(r => r.data),
        api.get(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
        api.get('/flows').then(r => r.data?.flows || r.data || []).catch(() => []),
        api.get('/users').then(r => r.data?.users || []).catch(() => []),
        api.get(`/crm/leads/${id}/task-documents`).catch(() => ({ data: [] })),
      ]);
      setLead(leadRes);
      setCustomer(leadRes?.customer);
      setActivities(actRes.data || []);
      setDocuments(docRes.data || []);
      setTaskDocuments(taskDocRes.data || taskDocRes || []);
      setStagesLead(stagesLeadRes.data || []);
      setStagesDeal(stagesDealRes.data || []);
      setFlows(flowsRes || []);
      setAllUsers(usersRes || []);

      // Deal thắng + chưa có project → tự động tạo dự án ngầm
      if (leadRes?.type === 'deal' && !leadRes?.project_id) {
        const dealStages = stagesDealRes.data || [];
        const currentStage = dealStages.find(s => s.id === leadRes.stage_id);
        if (currentStage?.is_won && !autoCreateCalledRef.current) {
          autoCreateProject(id);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const moveStage = async (stageId) => {
    const stages = lead?.type === 'deal' ? stagesDeal : stagesLead;
    const targetStage = stages.find(s => s.id === stageId);

    try {
      const { data } = await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId });
      if (data.requires_conversion) {
        setShowConvertModal(true);
      } else if (data.deal_won && !lead?.project_id) {
        // Deal thắng + chưa có dự án → tạo dự án ngầm
        autoCreateProject(id);
        load();
      } else if (data.deal_won && lead?.project_id) {
        // Deal đã có dự án → chỉ reload
        load();
      } else {
        load();
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const deleteLead = async () => {
    const type = lead?.type === 'deal' ? 'Deal' : 'Lead';
    const hasProject = lead?.project_id;
    const msg = hasProject
      ? `⚠️ Xóa ${type} "${lead.title}"?\n\nSẽ xóa luôn:\n• Dự án liên kết và tất cả nhiệm vụ\n• Tài liệu, báo giá, đơn hàng, hóa đơn\n\nHành động này KHÔNG THỂ hoàn tác!`
      : `Xóa ${type} "${lead.title}"?\n\nSẽ xóa luôn tài liệu, hoạt động liên quan.\nHành động này không thể hoàn tác.`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/crm/leads/${id}`);
      navigate('/crm');
    } catch (e) {
      alert('Lỗi xóa: ' + (e.response?.data?.error || e.message));
    }
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

  const compressImage = (file, maxWidth = 1920, quality = 0.8) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const uploadDocument = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploadingDoc(true);
      try {
        const files = await Promise.all(rawFiles.map(f => compressImage(f)));
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        const { data: uploadRes } = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploaded = uploadRes.files || [];
        // 1 request duy nhất tạo tất cả documents
        const items = uploaded.map(up => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image' : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        const { data: newDocs } = await api.post(`/crm/leads/${id}/documents/bulk`, { items });
        setDocuments(prev => [...(newDocs || []), ...prev]);
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingDoc(false);
    };
    input.click();
  };

  const addTextDocument = async (name, docType, notes, allowedDepartments, allowedCompanies) => {
    try {
      const { data: doc } = await api.post(`/crm/leads/${id}/documents`, {
        name,
        doc_type: docType || 'other',
        notes,
        allowed_departments: allowedDepartments || null,
        allowed_companies: allowedCompanies || null,
      });
      setDocuments(prev => [doc, ...prev]);
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi');
    }
  };

  return (
    <div className="space-y-4 mx-auto">
      {/* Auto-create project banner */}
      {autoCreateStatus === 'loading' && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white shadow-lg flex items-center gap-4">
          <div className="animate-spin h-8 w-8 border-3 border-white/30 border-t-white rounded-full flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">🚀 Đang tự động tạo dự án...</p>
            <p className="text-sm text-white/80">Hệ thống đang tạo dự án và phân công nhiệm vụ</p>
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
          <button onClick={() => navigate(`/projects/${autoCreateResult.project_id}`)}
            className="h-9 px-4 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-sm font-semibold cursor-pointer transition flex items-center gap-1">
            Xem dự án →
          </button>
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
            <button onClick={() => { autoCreateCalledRef.current = false; autoCreateProject(id); }}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              🔄 Thử lại
            </button>
            <button onClick={() => navigate(`/projects/create?deal_id=${id}`)}
              className="h-9 px-4 bg-white text-red-700 hover:bg-red-50 rounded-lg text-sm font-semibold cursor-pointer transition">
              Tạo thủ công →
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (lead?.type === 'deal') localStorage.setItem('crm_pinned_tab', 'deal'); navigate('/crm'); }} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.type === 'deal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {lead.type === 'deal' ? '🎯 DEAL' : '💼 LEAD'}
              </span>
              <span className="text-xs text-gray-500 font-mono">{lead.code}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{lead.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canConvert && (
            <button onClick={() => setShowConvertModal(true)} className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
              <Zap className="h-4 w-4" /> Chuyển Deal
            </button>
          )}
          {/* Deal Thắng + chưa có project → nút Tạo dự án */}
          {lead.type === 'deal' && isPipelineComplete && !lead.project_id && (
            <button onClick={() => navigate(`/projects/create?deal_id=${id}`)}
              className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
              <FolderKanban className="h-4 w-4" /> Tạo dự án
            </button>
          )}
          <button onClick={() => navigate(`/crm/quotations/new?lead_id=${id}`)} className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
            <FileText className="h-4 w-4" /> Báo giá
          </button>
          <button onClick={() => setShowExcelImport(true)} className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
            📥 Import Excel
          </button>
          {lead.project_id && (
            <Link to={`/projects/${lead.project_id}`} className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
              <FolderKanban className="h-4 w-4" /> Xem dự án
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
              <CustomerCreateForm leadId={lead?.id} onCreated={(c) => { setCustomer(c); load(); }} />
            )}
          </div>

          {/* Lead Info — Editable inline */}
          <LeadInfoPanel lead={lead} allUsers={allUsers} onUpdate={load} />

          {/* Quick Stats Card */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{activities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{documents.length + taskDocuments.length}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">File NV</p>
              <p className="text-xl font-bold text-purple-600">{taskDocuments.length}</p>
            </div>
          </div>
        </div>

        {/* Right: Documents + Activities with Tabs */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tab Switcher */}
          <div className="bg-white rounded-xl border">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'tasks'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ✅ Công việc
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Tài liệu ({documents.length + taskDocuments.length})
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
              <button
                onClick={() => setActiveTab('facebook')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'facebook'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📘 Facebook
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {activeTab === 'tasks' ? (
                <CRMTasksTab leadId={id} leadType={lead?.type || 'lead'} users={allUsers} />
              ) : activeTab === 'documents' ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowAddDoc(true)} className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                        <Plus className="h-3.5 w-3.5" /> Nhập văn bản
                      </button>
                      {uploadingDoc ? (
                        <span className="h-8 px-3 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                          <span className="animate-spin h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent rounded-full" /> Đang tải lên...
                        </span>
                      ) : (
                        <button onClick={uploadDocument} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                          <FileUp className="h-3.5 w-3.5" /> Upload file
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Task Documents — nhóm theo nhiệm vụ */}
                  {taskDocuments.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">📂 File nhiệm vụ ({taskDocuments.length})</p>
                      <div className="space-y-4">
                        {/* Nhóm theo stage_slug → task_title */}
                        {(() => {
                          const STAGE_LABELS = {
                            consulting: '💬 Tư vấn',
                            deal_new: '📋 Nhiệm vụ Deal mới',
                            deal_quote_contract: '📄 Báo giá & Hợp đồng',
                            deal_ordering: '🛒 Tiến hành đặt hàng',
                            deal_schedule: '📅 Hẹn ngày lắp đặt',
                            deal_shipping: '🚛 Đặt Vận chuyển',
                            deal_notes: '📝 Ghi chú khác',
                          };
                          // Group by stage → task
                          const stageGroups = {};
                          taskDocuments.forEach(td => {
                            const stageKey = td.stage_slug || '_other';
                            if (!stageGroups[stageKey]) stageGroups[stageKey] = {};
                            const taskKey = td.task_title || 'Khác';
                            if (!stageGroups[stageKey][taskKey]) stageGroups[stageKey][taskKey] = [];
                            stageGroups[stageKey][taskKey].push(td);
                          });
                          return Object.entries(stageGroups).map(([stageSlug, taskGroups]) => {
                            const stageLabel = STAGE_LABELS[stageSlug] || (stageSlug === '_other' ? '📋 Khác' : stageSlug);
                            const stageFileCount = Object.values(taskGroups).flat().length;
                            const stageNoteCount = Object.values(taskGroups).flat().filter(f => f.doc_type === 'task_note').length;
                            return (
                              <div key={stageSlug} className="border rounded-xl overflow-hidden">
                                {/* Stage header */}
                                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2 border-b flex items-center gap-2">
                                  <p className="text-xs font-bold text-gray-700">{stageLabel}</p>
                                  <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full">{stageFileCount} file</span>
                                  {stageNoteCount > 0 && <span className="text-[10px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">{stageNoteCount} ghi chú</span>}
                                </div>
                                {/* Tasks inside this stage */}
                                <div className="divide-y">
                                  {Object.entries(taskGroups).map(([taskTitle, files]) => {
                                    const fileFiles = files.filter(f => f.doc_type !== 'task_note');
                                    const noteFiles = files.filter(f => f.doc_type === 'task_note');
                                    return (
                                      <div key={taskTitle}>
                                        <div className="bg-white px-3 py-1.5 border-b flex items-center gap-2">
                                          <span className="text-[11px] font-semibold text-gray-600">📋 {taskTitle}</span>
                                          {fileFiles.length > 0 && <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">📎 {fileFiles.length}</span>}
                                          {noteFiles.length > 0 && <span className="text-[9px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">📝 {noteFiles.length}</span>}
                                        </div>
                                        <div className="divide-y divide-gray-50">
                                          {files.map(f => {
                                            const isVideo = f.doc_type === 'video' || f.mime_type?.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(f.file_name || '');
                                            const isImage = f.doc_type === 'image' || f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_name || '');
                                            return (
                                              <div key={f.id} className="px-4 py-2 hover:bg-blue-50 transition">
                                                <div className="flex items-center gap-3">
                                                  <span className="text-lg">{f.doc_type === 'task_note' ? '📝' : isVideo ? '🎬' : getFileIcon(f.file_name)}</span>
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 truncate">{f.doc_type === 'task_note' ? (f.name || 'Ghi chú') : (f.file_name || f.name)}</p>
                                                    {f.notes && <p className="text-[10px] text-gray-500 truncate mt-0.5">{f.notes}</p>}
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                      {f.file_size && <span className="text-[10px] text-gray-400">{f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${(f.file_size / 1024).toFixed(1)} KB`}</span>}
                                                      {f.created_at && <span className="text-[10px] text-gray-400">{new Date(f.created_at).toLocaleDateString('vi-VN')}</span>}
                                                      {f.file_url && <a href={f.file_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Mở ↗</a>}
                                                    </div>
                                                  </div>
                                                </div>
                                                {/* Video player */}
                                                {isVideo && f.file_url && (
                                                  <div className="mt-2 ml-8">
                                                    <video src={f.file_url} controls preload="metadata"
                                                      className="max-w-full max-h-64 rounded-lg border border-gray-200 bg-black shadow-sm" />
                                                  </div>
                                                )}
                                                {/* Image preview */}
                                                {isImage && f.file_url && (
                                                  <div className="mt-2 ml-8">
                                                    <a href={f.file_url} target="_blank" rel="noreferrer">
                                                      <img src={f.file_url} alt={f.name} className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain hover:opacity-90 cursor-pointer" />
                                                    </a>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Lead Documents */}
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">📄 Tài liệu Lead</p>
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
              ) : activeTab === 'activities' ? (
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
              ) : activeTab === 'facebook' ? (
                <FacebookChatTab leadId={id} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddActivity && <AddActivityModal leadId={id} onClose={() => setShowAddActivity(false)} onSave={() => { setShowAddActivity(false); load(); }} />}
      {showAddDoc && (
        <AddDocumentModal
          onClose={() => setShowAddDoc(false)}
          onSave={(name, docType, notes, allowedDepts, allowedCompanies) => {
            addTextDocument(name, docType, notes, allowedDepts, allowedCompanies);
            setShowAddDoc(false);
          }}
        />
      )}
      {showConvertModal && (
        <ConvertToDeadModal
          leadId={id}
          customer={customer}
          lead={lead}
          documents={documents}
          flows={flows}
          onClose={() => setShowConvertModal(false)}
          onSuccess={() => { setShowConvertModal(false); load(); }}
        />
      )}

      {/* Excel Import Modal */}
      {showExcelImport && (
        <ExcelQuotationImport
          dealId={id}
          onImportDone={(data) => {
            setShowExcelImport(false);
            load();
            navigate(`/crm/quotations/${data.id}`);
          }}
          onClose={() => setShowExcelImport(false)}
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

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop()?.toLowerCase();
  const map = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', dwg: '📐', dxf: '📐', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', zip: '📦', rar: '📦', mp4: '🎬', mov: '🎬', webm: '🎬', avi: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵' };
  return map[ext] || '📄';
}

function DocumentRow({ doc, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = DOC_TYPES.find(t => t.value === doc.doc_type) || DOC_TYPES[5];
  const isFile = !!doc.file_url;
  const isImage = isFile && (doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(doc.file_name || doc.file_url || ''));
  const isVideo = isFile && (doc.mime_type?.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(doc.file_name || doc.file_url || ''));
  const hasExtra = doc.notes || isImage || isVideo;

  return (
    <div className="bg-gray-50 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => hasExtra && setExpanded(!expanded)}>
          <span className="text-lg shrink-0">{isVideo ? '🎬' : typeInfo.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-gray-500">{typeInfo.label}{isFile ? ` • ${doc.file_name}` : ' • Văn bản'}{isImage ? ' • 🖼️' : ''}{isVideo ? ' • 🎬' : ''}</p>
              {doc.file_size && <span className="text-[10px] text-gray-400">{doc.file_size > 1024 * 1024 ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : `${(doc.file_size / 1024).toFixed(1)} KB`}</span>}
              {doc.is_from_task && (
                <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">📌 Từ nhiệm vụ</span>
              )}
              {(doc.allowed_departments?.length > 0 || doc.allowed_companies?.length > 0) && (
                <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium">🔒 Giới hạn</span>
              )}
            </div>
          </div>
          {isFile && !isImage && !isVideo && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0 px-2" onClick={e => e.stopPropagation()}>
              Mở
            </a>
          )}
          {hasExtra && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        <button onClick={onDelete} className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Video preview — always show player */}
      {isVideo && (
        <div className={`px-3 ${expanded ? 'pb-3' : 'pb-2'}`}>
          <video src={doc.file_url} controls preload="metadata"
            className={`w-full rounded-lg border border-gray-200 bg-black shadow-sm ${expanded ? 'max-h-96' : 'max-h-40'}`} />
        </div>
      )}
      {/* Image preview — show thumbnail even when collapsed */}
      {isImage && !expanded && (
        <div className="px-3 pb-2">
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={doc.file_url} alt={doc.name} className="max-h-24 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
          </a>
        </div>
      )}
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          {isImage && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block">
              <img src={doc.file_url} alt={doc.name} className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
            </a>
          )}
          {doc.notes && (
            <div className="bg-white rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">{doc.notes}</div>
          )}
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
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [allowedDepts, setAllowedDepts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/companies').then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {}),
      api.get('/departments').then(r => setDepartments(r.data?.departments || r.data || [])).catch(() => {}),
    ]);
  }, []);

  const toggleCompany = (id) => {
    setAllowedCompanies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDept = (id) => {
    setAllowedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Phòng ban thuộc công ty đã chọn
  const filteredDepts = allowedCompanies.length > 0
    ? departments.filter(d => allowedCompanies.includes(d.company_id))
    : departments;

  const hasRestriction = allowedCompanies.length > 0 || allowedDepts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
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

          {/* Phân quyền xem */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1">🔒 Phân quyền xem <span className="text-gray-400 font-normal">(không chọn = tất cả)</span></label>
            
            {/* Công ty */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">🏢 Công ty</p>
              <div className="flex flex-wrap gap-1.5">
                {companies.map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCompany(c.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      allowedCompanies.includes(c.id)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Phòng ban */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">🏬 Phòng ban {allowedCompanies.length > 0 && <span className="text-gray-400 font-normal">(lọc theo Cty đã chọn)</span>}</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredDepts.map(d => (
                  <button key={d.id} type="button" onClick={() => toggleDept(d.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      allowedDepts.includes(d.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {d.name}
                  </button>
                ))}
                {filteredDepts.length === 0 && <p className="text-[10px] text-gray-400 italic">Không có phòng ban</p>}
              </div>
            </div>

            {hasRestriction && (
              <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded">
                ✓ Chỉ {allowedCompanies.length > 0 ? `${allowedCompanies.length} công ty` : ''}{allowedCompanies.length > 0 && allowedDepts.length > 0 ? ' + ' : ''}{allowedDepts.length > 0 ? `${allowedDepts.length} phòng ban` : ''} + Admin được xem
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-9 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button
            onClick={() => {
              if (!name.trim()) return alert('Nhập tên tài liệu');
              if (!notes.trim()) return alert('Nhập nội dung');
              onSave(name, docType, notes, allowedDepts.length > 0 ? allowedDepts : null, allowedCompanies.length > 0 ? allowedCompanies : null);
            }}
            className="flex-1 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Lưu tài liệu
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LeadInfoPanel — Inline editable fields (always visible)
// ═══════════════════════════════════════════════════════════════════════════
function LeadInfoPanel({ lead, allUsers, onUpdate }) {
  const [sources, setSources] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);

  // Load sources + companies
  useEffect(() => {
    api.get('/crm/sources').then(r => setSources(r.data || [])).catch(() => {});
    api.get('/companies').then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
  }, []);

  const saveField = async (field, value) => {
    setSaving(true);
    try {
      const payload = {};
      if (field === 'estimated_value') payload.estimated_value = parseFloat(value) || 0;
      else if (field === 'probability') payload.probability = Math.min(100, Math.max(0, parseInt(value) || 0));
      else if (field === 'source_id') payload.source_id = value || null;
      else if (field === 'assigned_to') payload.assigned_to = value || null;
      else if (field === 'lead_owner_id') payload.lead_owner_id = value || null;
      else if (field === 'expected_close_date') payload.expected_close_date = value || null;
      else if (field === 'description') payload.description = value || null;
      else if (field === 'next_follow_up') payload.next_follow_up = value || null;
      else payload[field] = value;

      await api.put(`/crm/leads/${lead.id}`, payload);
      setEditing(null);
      onUpdate();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
    setSaving(false);
  };

  const EditableRow = ({ icon, label, field, value, displayValue, type = 'text', options }) => {
    const isEditing = editing === field;
    return (
      <div className="group">
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
          <span className="text-sm mt-0.5 shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                {type === 'select' ? (
                  <select
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    className="flex-1 h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    autoFocus
                  >
                    <option value="">-- Chọn --</option>
                    {(options || []).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : type === 'textarea' ? (
                  <textarea
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    rows={2}
                    className="flex-1 px-2 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    autoFocus
                  />
                ) : (
                  <input
                    type={type}
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    className="flex-1 h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveField(field, editVal)}
                  />
                )}
                <button onClick={() => saveField(field, editVal)} disabled={saving}
                  className="h-8 w-8 flex items-center justify-center bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 disabled:opacity-50 shrink-0">
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setEditing(null)}
                  className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg cursor-pointer hover:bg-gray-200 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => { setEditing(field); setEditVal(value ?? ''); }}
                className="cursor-pointer group/val"
              >
                {displayValue ? (
                  <p className="text-sm font-medium text-gray-900">{displayValue}</p>
                ) : (
                  <p className="text-sm text-gray-300 italic group-hover/val:text-blue-400 transition-colors">
                    Nhấn để nhập...
                  </p>
                )}
              </div>
            )}
          </div>
          {!isEditing && (
            <button onClick={() => { setEditing(field); setEditVal(value ?? ''); }}
              className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 cursor-pointer transition-opacity shrink-0">
              <Edit2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const prob = lead?.probability ?? 0;

  return (
    <div className="bg-white rounded-xl border p-5 space-y-1">
      <h3 className="text-sm font-bold text-gray-900 uppercase mb-2">Thông tin</h3>

      <EditableRow icon="💰" label="Giá trị" field="estimated_value"
        value={lead?.estimated_value || ''}
        displayValue={lead?.estimated_value > 0 ? formatVND(lead.estimated_value) : null}
        type="number" />

      <div>
        <EditableRow icon="📊" label="Xác suất" field="probability"
          value={lead?.probability ?? ''}
          displayValue={lead?.probability != null ? `${lead.probability}%` : null}
          type="number" />
        {prob > 0 && editing !== 'probability' && (
          <div className="ml-7 -mt-1 mb-1">
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${prob}%` }} />
            </div>
          </div>
        )}
      </div>

      <EditableRow icon="🔗" label="Nguồn" field="source_id"
        value={lead?.source_id || ''}
        displayValue={lead?.source ? `${lead.source.icon} ${lead.source.name}` : null}
        type="select"
        options={sources.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` }))} />

      {/* Công ty */}
      <EditableRow icon="🏢" label="Công ty" field="company_id"
        value={lead?.company_id || ''}
        displayValue={lead?.company_id ? companies.find(c => c.id === lead.company_id)?.name || null : null}
        type="select"
        options={companies.map(c => ({ value: c.id, label: c.name }))} />

      {/* Phụ trách Lead (lead_owner) */}
      <div className="group">
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
          <span className="text-sm mt-0.5 shrink-0">👤</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
              Phụ trách Lead
            </p>
            {!lead?.company_id ? (
              <p className="text-xs text-amber-500 italic">⚠️ Chọn công ty trước</p>
            ) : (
              <EmployeePicker
                companyId={lead?.company_id}
                value={lead?.lead_owner_id || ''}
                onChange={(userId) => saveField('lead_owner_id', userId || '')}
                placeholder="👤 Người phụ trách lead..."
                size="sm"
              />
            )}
          </div>
        </div>
      </div>

      {/* Phụ trách Deal (assigned_to) */}
      <div className="group">
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
          <span className="text-sm mt-0.5 shrink-0">🤝</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
              Phụ trách Deal
            </p>
            {!lead?.company_id ? (
              <p className="text-xs text-amber-500 italic">⚠️ Chọn công ty trước</p>
            ) : (
              <EmployeePicker
                companyId={lead?.company_id}
                value={lead?.assigned_to || ''}
                onChange={(userId) => saveField('assigned_to', userId || '')}
                placeholder="👤 Người phụ trách deal..."
                size="sm"
              />
            )}
          </div>
        </div>
      </div>

      <EditableRow icon="📅" label="Dự kiến chốt" field="expected_close_date"
        value={lead?.expected_close_date || ''}
        displayValue={lead?.expected_close_date ? formatDate(lead.expected_close_date) : null}
        type="date" />

      <EditableRow icon="🔔" label="Theo dõi tiếp" field="next_follow_up"
        value={lead?.next_follow_up || ''}
        displayValue={lead?.next_follow_up ? formatDate(lead.next_follow_up) : null}
        type="date" />

      <EditableRow icon="📝" label="Mô tả" field="description"
        value={lead?.description || ''}
        displayValue={lead?.description || null}
        type="textarea" />
    </div>
  );
}

// ── Form tạo khách hàng mới khi lead chưa có customer ──
function CustomerCreateForm({ leadId, onCreated }) {
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', address: '', company: '', tax_code: '',
  });
  const [saving, setSaving] = useState(false);

  const fields = [
    { key: 'full_name', label: '👤 Họ tên', required: true, placeholder: 'Nguyễn Văn A' },
    { key: 'phone', label: '📞 Số điện thoại', required: true, placeholder: '0912 345 678', type: 'tel' },
    { key: 'email', label: '✉️ Email', placeholder: 'email@example.com', type: 'email' },
    { key: 'address', label: '📍 Địa chỉ', placeholder: '123 Nguyễn Huệ, Quận 1, TP.HCM' },
    { key: 'company', label: '🏢 Công ty', placeholder: 'Tên công ty' },
    { key: 'tax_code', label: '🧾 Mã số thuế', placeholder: 'MST' },
  ];

  const handleSave = async () => {
    if (!form.full_name.trim()) return alert('Vui lòng nhập tên khách hàng');
    setSaving(true);
    try {
      const res = await api.post('/customers', { ...form, source: 'Manual' });
      if (res?.id) {
        // Link customer to lead
        await api.put(`/crm/leads/${leadId}`, { customer_id: res.id });
        onCreated(res);
      }
    } catch (e) { alert('Lỗi tạo khách hàng'); }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
        ⚠️ Chưa có thông tin khách hàng. Nhập bên dưới:
      </p>
      {fields.map(f => (
        <div key={f.key}>
          <label className="text-xs text-gray-500 font-medium">
            {f.label} {f.required && <span className="text-red-400">*</span>}
          </label>
          <input
            type={f.type || 'text'}
            value={form[f.key]}
            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="mt-0.5 w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      ))}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition">
        {saving ? 'Đang lưu...' : '💾 Lưu khách hàng'}
      </button>
    </div>
  );
}

function ConvertToDeadModal({ leadId, customer, lead, documents, flows, onClose, onSuccess }) {
  const [converting, setConverting] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedSales, setSelectedSales] = useState(lead?.assigned_to || '');

  const canConvert = customer?.full_name && customer?.phone;

  // Load companies + auto-select from lead
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/companies');
        const list = r.data.companies || r.data || [];
        setCompanies(list);
        // Auto-select company from lead
        if (lead?.company_id) {
          setSelectedCompany(lead.company_id);
        }
      } catch {}
    })();
  }, [lead?.company_id]);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/convert-to-deal`, {
        assigned_to: selectedSales || undefined,
        company_id: selectedCompany || undefined,
      });
      alert(`✅ ${data.message}`);
      onSuccess();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setConverting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">🚀 Chuyển Lead sang Deal</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Yêu cầu */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700 uppercase">Yêu cầu:</p>
            <div className={`text-sm flex items-center gap-2 ${customer?.full_name && customer?.phone ? 'text-emerald-600' : 'text-red-600'}`}>
              {customer?.full_name && customer?.phone ? '✅' : '❌'} Khách hàng: {customer?.full_name || '—'}, {customer?.phone || 'Chưa có SĐT'}
            </div>
          </div>

          {/* Chọn Công ty */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">🏢 Công ty thực hiện</label>
            <select value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedSales(''); }}
              className="w-full h-10 px-3 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Chọn công ty --</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {lead?.company_id && selectedCompany === lead.company_id && (
              <p className="text-[10px] text-emerald-600 mt-0.5">✓ Tự động lấy từ Lead</p>
            )}
          </div>

          {/* Lead owner info (read-only) */}
          {(lead?.lead_owner || lead?.assignee) && (
            <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
              <p className="text-xs font-bold text-purple-700 mb-1">👤 Phụ trách Lead hiện tại</p>
              <p className="text-sm text-purple-900">{lead?.lead_owner?.full_name || lead?.assignee?.full_name || '—'}</p>
            </div>
          )}

          {/* Chọn Sales phụ trách Deal — dùng EmployeePicker */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">👤 Nhân viên phụ trách Deal</label>
            <EmployeePicker
              companyId={selectedCompany}
              value={selectedSales}
              onChange={(userId) => setSelectedSales(userId || '')}
              placeholder="Chọn nhân viên phụ trách..."
              size="md"
            />
            {!selectedCompany && (
              <p className="text-[10px] text-amber-500 mt-0.5">⚠️ Chọn công ty trước để lọc nhân viên</p>
            )}
          </div>

          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 Lead sẽ được chuyển sang pipeline <strong>Deal</strong>. Bạn có thể tạo dự án sau từ trang Deal.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 border rounded-lg font-medium cursor-pointer">Hủy</button>
          <button
            onClick={handleConvert}
            disabled={!canConvert || converting}
            className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50 cursor-pointer transition-colors"
          >
            {converting ? 'Đang xử lý...' : '🚀 Chuyển sang Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// Facebook Chat Tab — embedded in LeadDetail (full tính năng)
// ═══════════════════════════════════════
const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

function FacebookChatTab({ leadId }) {
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [contact, setContact] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const loadMessages = useCallback(() => {
    if (!leadId) return;
    fetch(`${API}/api/facebook/leads/${leadId}/messages`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setMessages(d);
        if (d.length > 0 && d[0].contact) setContact(d[0].contact);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => {});
  }, [leadId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Auto-refresh mỗi 15s
  useEffect(() => {
    const timer = setInterval(loadMessages, 15000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  const sendReply = async () => {
    if (!reply.trim() || !contact || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/reply`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, { ...msg, contact }]);
        setReply('');
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !contact) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${API}/api/upload/single`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!upRes.ok) throw new Error('Upload failed');
      const upData = await upRes.json();

      let attType = type || 'file';
      if (file.type.startsWith('image/')) attType = 'image';
      else if (file.type.startsWith('video/')) attType = 'video';
      else if (file.type.startsWith('audio/')) attType = 'audio';

      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/reply`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ message: '', attachment_url: upData.file_url, attachment_type: attType }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, { ...msg, contact }]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) { alert('Lỗi gửi file: ' + e.message); }
    setUploading(false);
    e.target.value = '';
  };

  const syncHistory = async () => {
    if (!contact) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/sync-history`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      if (data.synced > 0) loadMessages();
    } catch (e) { /* ignore */ }
    setSyncing(false);
  };

  const formatTime = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  if (!messages.length && !contact) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p className="text-3xl mb-2">📘</p>
        <p className="text-sm">Chưa có tin nhắn Facebook nào liên kết với {leadId ? 'lead' : 'deal'} này.</p>
        <p className="text-xs mt-1">Khi KH nhắn tin qua Messenger, tin nhắn sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}>
      {/* Header */}
      {contact && (
        <div className="flex items-center justify-between pb-3 border-b mb-3 shrink-0">
          <div className="flex items-center gap-2">
            {contact.fb_profile_pic
              ? <img src={contact.fb_profile_pic} className="w-9 h-9 rounded-full shadow-sm" alt="" />
              : <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">{(contact.fb_name || 'FB')[0]}</div>}
            <div>
              <p className="font-semibold text-sm text-gray-800">{contact.fb_name}</p>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {contact.phone && <span className="text-green-600">📞 {contact.phone}</span>}
                <span>Messenger</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncHistory} disabled={syncing}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition">
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync
            </button>
            <span className="text-[10px] text-gray-400">{messages.length} tin nhắn</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map((m, i) => {
          const isOut = m.direction === 'outbound';
          const showDate = i === 0 || new Date(m.created_at).toDateString() !== new Date(messages[i-1]?.created_at).toDateString();
          return (
            <div key={m.id || i}>
              {showDate && (
                <div className="flex justify-center my-2">
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                    {new Date(m.created_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              )}
              <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  isOut ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {/* Image */}
                  {m.attachment_url && (m.message_type === 'image' || m.attachment_type === 'image') && (
                    <img src={m.attachment_url} className="max-w-[240px] rounded-xl mb-1 cursor-pointer hover:opacity-90" alt=""
                      onClick={() => window.open(m.attachment_url, '_blank')} />
                  )}
                  {/* Audio */}
                  {m.attachment_url && (m.message_type === 'audio' || m.attachment_type === 'audio') && (
                    <audio src={m.attachment_url} controls className="max-w-[240px] h-9 mb-1"
                      style={{ filter: isOut ? 'invert(1) hue-rotate(180deg)' : 'none' }} />
                  )}
                  {/* Video */}
                  {m.attachment_url && (m.message_type === 'video' || m.attachment_type === 'video') && (
                    <video src={m.attachment_url} controls className="max-w-[240px] rounded-xl mb-1" preload="metadata" />
                  )}
                  {/* File */}
                  {m.attachment_url && (m.message_type === 'file' || m.attachment_type === 'file') && (
                    <a href={m.attachment_url} target="_blank" rel="noreferrer"
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg mb-1 ${isOut ? 'bg-blue-400/30 hover:bg-blue-400/50' : 'bg-white hover:bg-gray-50'}`}>
                      📎 Tệp đính kèm
                    </a>
                  )}
                  {/* Text */}
                  {m.content && !['[image]','[audio]','[video]','[file]'].includes(m.content) && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <p className={`text-[9px] mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="pt-3 border-t mt-3 shrink-0">
        {uploading && (
          <div className="flex items-center gap-2 text-xs text-blue-600 mb-2">
            <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Đang tải lên...
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => imageInputRef.current?.click()} disabled={uploading || !contact}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg cursor-pointer transition disabled:opacity-40" title="Gửi hình ảnh">
            <Image size={18} />
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />

          <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !contact}
            className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg cursor-pointer transition disabled:opacity-40" title="Gửi file">
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />

          <input value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
            placeholder="Trả lời qua Messenger..."
            disabled={!contact}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 disabled:opacity-40" />

          <button onClick={sendReply} disabled={sending || !reply.trim() || !contact}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

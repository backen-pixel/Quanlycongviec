import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { markCrmPipelineCardFocus, notifyCrmLeadSeenByCurrentUser, saveCrmPipelineSnapshot, loadCrmPipelineSnapshot } from '../lib/crmPipelineStorage';
import { parseShareModules } from '../lib/documentShareScope';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import CRMTasksTab from '../components/CRMTasksTab';
import LeadDealWorkTab from '../components/LeadDealWorkTab';
import ExcelQuotationImport from '../components/ExcelQuotationImport';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import EmployeePicker from '../components/EmployeePicker';
import { LeadMembersTab, LeadChatTab } from '../components/LeadChatTabs';
import CallLogsTab from '../components/CallLogsTab';
import LeadVoiceRecordingsTab from '../components/LeadVoiceRecordingsTab';
import FacebookChatTab from '../components/FacebookChatTab';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';
import { useCrmNotesFab } from '../context/CrmNotesFabContext';
import PipelineStepper from '../components/PipelineStepper';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, MessageCircle, Edit2, Trash2, X, Save, Building2, FolderKanban,
  FileUp, FileText, Zap, ChevronDown, Send, RefreshCw, Users, ClipboardCheck, Loader2, Mic,
} from 'lucide-react';

/** Khớp backend: chỉ cột deal có tên chứa «Hoàn thành» mới dùng gửi Zalo OA */
function isCrmDealStageHoanThanhName(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('hoan thanh');
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { socket, user } = useAuth();
  const { setCrmNotesAnchor } = useCrmNotesFab();
  const loadRef = useRef(null);
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [taskDocuments, setTaskDocuments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
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
  // const [notesExpanded, setNotesExpanded] = useState(localStorage.getItem('crm_notes_default_open') === 'true'); // TBD
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingLostStageId, setPendingLostStageId] = useState(null);
  const [showAssignBeforeWonModal, setShowAssignBeforeWonModal] = useState(false);
  const [assignBeforeWonUser, setAssignBeforeWonUser] = useState('');
  const [assigningForWon, setAssigningForWon] = useState(false);
  const [assignBeforeWonError, setAssignBeforeWonError] = useState('');
  const [editingLeadTitle, setEditingLeadTitle] = useState(false);
  const [leadTitleDraft, setLeadTitleDraft] = useState('');
  const [savingLeadTitle, setSavingLeadTitle] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ type: 'drawing', title: '', note: '' });
  const [zaloQuickSendLoading, setZaloQuickSendLoading] = useState(false);
  const [movingStage, setMovingStage] = useState(false);

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

  /** Mở đúng tab từ URL (?tab=chat|facebook|calls|voice_crm|approvals|…) — app mobile / liên kết ngoài. */
  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return;
    const allowed = new Set([
      'tasks',
      'documents',
      'activities',
      'notes',
      'facebook',
      'team',
      'chat',
      'calls',
      'voice_crm',
      'approvals',
    ]);
    if (t === 'orders') {
      setActiveTab('tasks');
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    if (!allowed.has(t)) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    if (t === 'approvals') {
      if (!lead || String(lead.id) !== String(id)) return;
      if (lead.type !== 'deal') {
        const next = new URLSearchParams(searchParams);
        next.delete('tab');
        setSearchParams(next, { replace: true });
        return;
      }
    }
    setActiveTab(t);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [id, searchParams, setSearchParams, lead]);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRes, actRes, docRes, flowsRes, usersRes, taskDocRes] = await Promise.all([
        api.get(`/crm/leads/${id}/detail`).then(r => r.data),
        api.get(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get('/flows').then(r => r.data?.flows || r.data || []).catch(() => []),
        api.get('/users').then(r => r.data?.users || []).catch(() => []),
        api.get(`/crm/leads/${id}/task-documents`).catch(() => ({ data: [] })),
      ]);

<<<<<<< Updated upstream
      const stageParams = leadRes?.pipeline_id ? { pipeline_id: leadRes.pipeline_id } : undefined;
      const [stagesLeadRes, stagesDealRes] = await Promise.all([
        api.get('/crm/pipeline-stages', { params: { type: 'lead', ...(stageParams || {}) } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal', ...(stageParams || {}) } }).catch(() => ({ data: [] })),
      ]);

=======
      const leadCompanyId = leadRes?.company_id || leadRes?.company?.id || null;
      const leadPipelineId = leadRes?.pipeline_id || null;
      const stagesParamsBase =
        leadPipelineId
          ? { pipeline_id: leadPipelineId }
          : (leadCompanyId ? { company_id: leadCompanyId } : {});
      const [stagesLeadRes, stagesDealRes] = await Promise.all([
        api.get('/crm/pipeline-stages', { params: { type: 'lead', ...stagesParamsBase } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal', ...stagesParamsBase } }).catch(() => ({ data: [] })),
      ]);
      // Orders for Deal (orders.lead_id = deal.id)
      setOrdersLoading(true);
      if (leadRes?.type === 'deal') {
        api.get('/crm/orders', { params: { lead_id: leadRes.id, limit: 200 } })
          .then((r) => setOrders(Array.isArray(r.data) ? r.data : []))
          .catch(() => setOrders([]))
          .finally(() => setOrdersLoading(false));
      } else {
        setOrders([]);
        setOrdersLoading(false);
      }
>>>>>>> Stashed changes
      setLead(leadRes);
      setLeadTitleDraft(leadRes?.title || '');
      setCustomer(leadRes?.customer);
      setActivities(actRes.data || []);
      setDocuments(docRes.data || []);
      setTaskDocuments(taskDocRes.data || taskDocRes || []);
      setStagesLead(stagesLeadRes.data || []);
      setStagesDeal(stagesDealRes.data || []);
      setFlows(flowsRes || []);
      setAllUsers(usersRes || []);

      notifyCrmLeadSeenByCurrentUser(id, user?.id || user?.userId);

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

  const reloadOrders = useCallback(async () => {
    if (!id) return;
    setOrdersLoading(true);
    try {
      const { data } = await api.get('/crm/orders', { params: { lead_id: id, limit: 200 } });
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
    setOrdersLoading(false);
  }, [id]);

  loadRef.current = load;

  const isDealHoanThanhForZalo = useMemo(() => {
    if (!lead || lead.type !== 'deal') return false;
    const st = stagesDeal.find((s) => s.id === lead.stage_id);
    return !!(st && isCrmDealStageHoanThanhName(st.name));
  }, [lead, stagesDeal]);

  const noteActivities = useMemo(
    () => (activities || []).filter((a) => a.type === 'note'),
    [activities],
  );

  useEffect(() => {
    if (loading || !lead || !id || String(lead.id) !== String(id)) return;
    setCrmNotesAnchor({
      leadId: id,
      notes: noteActivities,
      contextLine: lead
        ? `${lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'} ${[lead.code, lead.title].filter(Boolean).join(' — ')}`
        : '',
      contextBadge: lead?.code || '',
      onPosted: () => loadRef.current?.(),
    });
  }, [loading, id, lead, noteActivities, setCrmNotesAnchor]);

  /** Một bước: điền template từ deal (cấu trúc lưu trên server / Cài đặt Pipeline) + gửi Zalo */
  const quickSendZaloOa = useCallback(async () => {
    if (!id || !isDealHoanThanhForZalo) return;
    setZaloQuickSendLoading(true);
    try {
      const { data: fillRes } = await api.post(`/crm/leads/${id}/zalo-template-fill`, {});
      const filled = fillRes?.filled;
      if (!filled || typeof filled !== 'object') {
        alert('Không điền được dữ liệu từ deal');
        return;
      }
      const postSend = async (force) => {
        const { data } = await api.post(`/crm/leads/${id}/zalo-notify-send`, { force, template_data: filled });
        return data;
      };
      let sendRes = await postSend(false);
      if (sendRes?.skipped && sendRes?.reason === 'already_sent') {
        if (!window.confirm('Đã gửi Zalo thành công cho giai đoạn này. Gửi lại lần nữa?')) return;
        sendRes = await postSend(true);
      }
      if (sendRes?.ok && !sendRes?.skipped) {
        alert('Đã gửi tin Zalo OA tới khách hàng.');
        load();
      } else if (sendRes?.skipped && sendRes?.reason && sendRes?.reason !== 'already_sent') {
        alert(sendRes.message || sendRes.reason || 'Đã bỏ qua gửi Zalo');
      } else if (!sendRes?.ok) {
        alert(sendRes?.hint_vi || sendRes?.message || JSON.stringify(sendRes || {}));
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gửi Zalo');
    } finally {
      setZaloQuickSendLoading(false);
    }
  }, [id, isDealHoanThanhForZalo, load]);

  const navigateToCrmDealFocused = (dealId) => {
    const snapshot = loadCrmPipelineSnapshot();
    saveCrmPipelineSnapshot({ ...(snapshot || {}), pipelineType: 'deal' });
    if (dealId) markCrmPipelineCardFocus(dealId);
    navigate('/crm');
  };

  const moveStage = async (stageId, extraData = {}) => {
    const stages = lead?.type === 'deal' ? stagesDeal : stagesLead;
    const targetStage = stages.find(s => s.id === stageId);

    // Nếu stage là Thua/Mất → hiện modal nhập lý do
    if (targetStage?.is_lost && !extraData.lost_reason) {
      setPendingLostStageId(stageId);
      setLostReason('');
      setShowLostModal(true);
      return;
    }

    // Nếu stage là Thắng và đây là Lead (cần chuyển sang Deal)
    if (targetStage?.is_won && lead?.type !== 'deal') {
      const hasAssignee = !!(lead?.assigned_to || lead?.lead_owner_id);
      if (!hasAssignee) {
        // Chưa có người phụ trách → chỉ hiện ô chọn nhân viên
        setAssignBeforeWonUser('');
        setShowAssignBeforeWonModal(true);
      } else {
        setShowConvertModal(true);
      }
      return;
    }

    if (movingStage) return;
    setMovingStage(true);
    // Optimistic UI: stepper cập nhật ngay, rồi load lại để đồng bộ badge/fields
    setLead((prev) => (prev ? { ...prev, stage_id: stageId } : prev));
    try {
      const { data } = await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId, ...extraData });
      if (data?.requires_conversion) setShowConvertModal(true);
      if (data?.deal_won && !lead?.project_id) autoCreateProject(id);
      await loadRef.current?.();
    } catch (e) {
      if (e.response?.data?.requires_conversion) {
        setShowConvertModal(true);
      } else {
        // rollback optimistic stage if server rejects
        await loadRef.current?.();
        alert(e.response?.data?.error || 'Lỗi');
      }
    } finally {
      setMovingStage(false);
    }
  };

  const confirmLost = () => {
    if (!lostReason.trim()) return alert('Vui lòng nhập lý do thua');
    setShowLostModal(false);
    moveStage(pendingLostStageId, { lost_reason: lostReason.trim() });
    setPendingLostStageId(null);
  };

  const handleAssignAndConvert = async () => {
    if (!assignBeforeWonUser) { setAssignBeforeWonError('Vui lòng chọn nhân viên phụ trách'); return; }
    setAssigningForWon(true);
    setAssignBeforeWonError('');
    try {
      const { data } = await api.post(`/crm/leads/${id}/convert-to-deal`, {
        assigned_to: assignBeforeWonUser,
        company_id: lead?.company_id || undefined,
      });
      setShowAssignBeforeWonModal(false);
      navigateToCrmDealFocused(data?.deal?.id || data?.id || id);
    } catch (e) {
      setAssignBeforeWonError(e.response?.data?.error || 'Lỗi chuyển sang Deal');
    } finally {
      setAssigningForWon(false);
    }
  };

  const submitDealApproval = () => {
    if (!approvalForm.title.trim()) {
      alert('Vui lòng nhập tiêu đề nội dung cần duyệt');
      return;
    }
    alert(`Đã ghi nhận yêu cầu gửi duyệt cho deal này trong CRM:\n- Loại: ${approvalForm.type}\n- Tiêu đề: ${approvalForm.title}\n\nBước tiếp theo mình sẽ nối form này với API duyệt hai chiều CRM <-> xưởng.`);
    setApprovalForm({ type: 'drawing', title: '', note: '' });
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
          <button onClick={() => { if (lead?.type === 'deal') localStorage.setItem('crm_pinned_tab', 'deal'); markCrmPipelineCardFocus(id); navigate('/crm'); }} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.type === 'deal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {lead.type === 'deal' ? '🎯 DEAL' : '💼 LEAD'}
              </span>
              <span className="text-xs text-gray-500 font-mono">{lead.code}</span>
            </div>
            {editingLeadTitle ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <input
                  value={leadTitleDraft}
                  onChange={e => setLeadTitleDraft(e.target.value)}
                  className="h-10 min-w-[320px] max-w-[560px] px-3 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900 bg-white"
                  placeholder="Nhập tên lead"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    if (!leadTitleDraft.trim() || savingLeadTitle) return;
                    setSavingLeadTitle(true);
                    try {
                      const { data } = await api.put(`/crm/leads/${id}`, { title: leadTitleDraft.trim() });
                      setLead(prev => ({ ...prev, ...data }));
                      setLeadTitleDraft(data.title || leadTitleDraft.trim());
                      setEditingLeadTitle(false);
                    } catch (e) {
                      alert(e.response?.data?.error || 'Lỗi cập nhật tên lead');
                    }
                    setSavingLeadTitle(false);
                  }}
                  disabled={savingLeadTitle || !leadTitleDraft.trim()}
                  className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {savingLeadTitle ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => { setLeadTitleDraft(lead.title || ''); setEditingLeadTitle(false); }}
                  disabled={savingLeadTitle}
                  className="h-10 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="h-4 w-4" /> Hủy
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{lead.title}</h1>
                <button
                  onClick={() => setEditingLeadTitle(true)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                  title="Sửa tên lead"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
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
          {lead.type === 'deal' && isDealHoanThanhForZalo && (
            <button
              type="button"
              disabled={zaloQuickSendLoading}
              onClick={() => quickSendZaloOa()}
              title="Điền mẫu từ deal (cấu trúc trong Cài đặt Pipeline → Zalo OA) và gửi tin Zalo OA"
              className="h-9 px-3 bg-[#0068FF] hover:bg-[#0056d4] text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {zaloQuickSendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Gửi Zalo
            </button>
          )}
          {lead.project_id && (
            <>
              <Link to={`/sx/projects/${lead.project_id}`} className="h-9 px-3 bg-teal-100 text-teal-800 rounded-lg text-sm font-medium flex items-center gap-1.5">
                <FolderKanban className="h-4 w-4" /> Xưởng / SX
              </Link>
              <Link to={`/projects/${lead.project_id}`} className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                <FolderKanban className="h-4 w-4" /> Dự án đầy đủ
              </Link>
            </>
          )}
          <button onClick={deleteLead} className="h-9 px-3 text-red-500 border border-red-200 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>

        </div>
      </div>

      {/* Lost Banner — hiển thị nổi bật khi deal/lead thua */}
      {lead?.lost_reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-lg shrink-0">❌</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-red-700">THUA / MẤT</span>
              <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full">Đã kết thúc</span>
            </div>
            <p className="text-sm text-red-800 font-medium">Lý do: {lead.lost_reason}</p>
            {lead.lost_at && (
              <p className="text-xs text-red-400 mt-1">Vào lúc {new Date(lead.lost_at).toLocaleString('vi-VN')}</p>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Progress - MISA Style Stepper */}
      <PipelineStepper stages={stages} currentStageId={lead.stage_id} onMoveToStage={moveStage} />

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
          <LeadInfoPanel lead={lead} allUsers={allUsers} onUpdate={load} currentUser={user} />

          {/* Quick Stats Card */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{activities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{documents.filter(d => !d.is_from_task && !d.source_attachment_id).length + taskDocuments.length}</p>
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
                title={lead?.type === 'deal' ? 'Nhiệm vụ deal + đơn hàng từng lượt (gộp ở đây)' : 'Công việc theo nhiệm vụ'}
              >
                {lead?.type === 'deal'
                  ? `✅ Công việc & đơn${orders.length ? ` (${orders.length})` : ''}`
                  : '✅ Công việc'}
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Tài liệu ({documents.filter(d => !d.is_from_task && !d.source_attachment_id).length + taskDocuments.length})
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
                onClick={() => setActiveTab('notes')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'notes'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📝 Ghi chú ({noteActivities.length})
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
              <button
                onClick={() => setActiveTab('team')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'team'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                👥 Thành viên
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'chat'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💬 Trao đổi
              </button>
              <button
                onClick={() => setActiveTab('calls')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'calls'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📞 Tổng đài
              </button>
              <button
                onClick={() => setActiveTab('voice_crm')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all inline-flex items-center justify-center gap-1 ${
                  activeTab === 'voice_crm'
                    ? 'text-violet-600 border-b-2 border-violet-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mic className="h-3.5 w-3.5 shrink-0" />
                Ghi âm
              </button>
              {lead?.type === 'deal' && (
                <button
                  onClick={() => setActiveTab('approvals')}
                  className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                    activeTab === 'approvals'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ✅ Gửi duyệt deal
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {activeTab === 'tasks' ? (
                lead?.type === 'deal' ? (
                  <LeadDealWorkTab
                    dealLeadId={id}
                    projectId={lead?.project_id || null}
                    useOrderTasks={!!lead?.use_order_tasks}
                    users={allUsers}
                    orders={orders}
                    ordersLoading={ordersLoading}
                    onOrdersRefresh={reloadOrders}
                    onProjectRefresh={load}
                  />
                ) : (
                  <CRMTasksTab leadId={id} leadType={lead?.type || 'lead'} users={allUsers} />
                )
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
                                            const taskFileOpen = f.file_url ? getFileOpenAnchorProps(f.file_url, { fileName: f.file_name }) : null;
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
                                                      {taskFileOpen && <a {...taskFileOpen} className="text-[10px] text-blue-500 hover:underline">Mở ↗</a>}
                                                    </div>
                                                  </div>
                                                </div>
                                                {/* Video player */}
                                                {isVideo && f.file_url && (
                                                  <div className="mt-2 ml-8">
                                                    <video src={publicFileUrl(f.file_url)} controls preload="metadata"
                                                      className="max-w-full max-h-64 rounded-lg border border-gray-200 bg-black shadow-sm" />
                                                  </div>
                                                )}
                                                {/* Image preview */}
                                                {isImage && f.file_url && taskFileOpen && (
                                                  <div className="mt-2 ml-8">
                                                    <a {...taskFileOpen}>
                                                      <img src={publicFileUrl(f.file_url)} alt={f.name} className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain hover:opacity-90 cursor-pointer" />
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

                  {/* Lead Documents — chỉ hiện file KHÔNG phải sync từ nhiệm vụ */}
                  {(() => {
                    const ownDocs = documents.filter(d => !d.is_from_task && !d.source_attachment_id);
                    return (
                      <>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">📄 Tài liệu Lead ({ownDocs.length})</p>
                        {ownDocs.length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                            <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Chưa có tài liệu</p>
                            <p className="text-xs text-gray-400 mt-1">Upload file hoặc nhập văn bản để thêm tài liệu</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {ownDocs.map(doc => (
                              <DocumentRow key={doc.id} doc={doc} onDelete={() => deleteDocument(doc.id)} />
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
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
              ) : activeTab === 'notes' ? (
                <CrmChatNotesPanel
                  variant="embedded"
                  leadId={id}
                  notes={noteActivities}
                  onPosted={load}
                  currentUserId={user?.id || user?.userId}
                  canEditAnyNote={user?.role === 'admin' || user?.role === 'manager'}
                  contextLine={
                    lead
                      ? `${lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'} ${[lead.code, lead.title].filter(Boolean).join(' — ')}`
                      : ''
                  }
                  contextBadge={lead?.code || ''}
                />
              ) : activeTab === 'facebook' ? (
                <FacebookChatTab leadId={id} />
              ) : activeTab === 'team' ? (
                <LeadMembersTab leadId={id} />
              ) : activeTab === 'chat' ? (
                <LeadChatTab leadId={id} socket={socket} />
              ) : activeTab === 'calls' ? (
                <CallLogsTab leadId={id} customerId={lead?.customer_id} />
              ) : activeTab === 'voice_crm' ? (
                <LeadVoiceRecordingsTab leadId={id} />
              ) : activeTab === 'approvals' ? (
                lead.project_id ? (
                  <ProjectApprovalsTab
                    projectId={lead.project_id}
                    project={lead}
                    onUpdated={load}
                  />
                ) : (
                  <div className="text-center py-10 text-gray-400 space-y-3">
                    <ClipboardCheck className="h-12 w-12 mx-auto opacity-20" />
                    <p className="text-sm">Deal chưa có dự án xưởng</p>
                    <p className="text-xs text-gray-400">Chuyển deal sang trạng thái <strong>Thắng</strong> để tự động tạo dự án, sau đó dùng tab này để gửi duyệt.</p>
                    {lead.type === 'deal' && (
                      <button onClick={() => navigate(`/projects/create?deal_id=${id}`)}
                        className="inline-flex h-9 px-4 items-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer">
                        <FolderKanban className="h-4 w-4" /> Tạo dự án thủ công
                      </button>
                    )}
                  </div>
                )
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
          onSuccess={(dealId) => { setShowConvertModal(false); navigateToCrmDealFocused(dealId || id); }}
        />
      )}

      {/* Modal chọn người phụ trách trước khi chuyển sang Deal (won stage) */}
      {showAssignBeforeWonModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { if (!assigningForWon) { setShowAssignBeforeWonModal(false); setAssignBeforeWonError(''); } }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🏆</span>
              <h3 className="text-base font-bold text-gray-900">Chuyển sang Deal</h3>
            </div>

            {/* Cảnh báo nếu chưa có khách hàng */}
            {!lead?.customer_id ? (
              <div className="mt-3 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                ⛔ Lead chưa được liên kết khách hàng.<br />
                <span className="text-xs">Vui lòng thêm khách hàng ở mục <strong>Thông tin</strong> trước khi chuyển Deal.</span>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4 mt-2">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Khách hàng:</p>
                <p className="text-sm font-medium text-gray-900">{customer?.full_name || '—'}</p>
                {customer?.phone
                  ? <p className="text-xs text-green-600 mt-0.5">📞 {customer.phone}</p>
                  : <p className="text-xs text-amber-500 mt-0.5">⚠️ Chưa có SĐT (có thể bổ sung sau)</p>
                }
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">👤 Người phụ trách deal</label>
              <EmployeePicker
                companyId={lead?.company_id}
                value={assignBeforeWonUser}
                onChange={(userId) => { setAssignBeforeWonUser(userId || ''); setAssignBeforeWonError(''); }}
                placeholder="Tìm và chọn nhân viên..."
                size="md"
              />
              {!lead?.company_id && (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — sẽ hiển thị toàn bộ nhân viên</p>
              )}
            </div>

            {/* Lỗi inline */}
            {assignBeforeWonError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                ⛔ {assignBeforeWonError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowAssignBeforeWonModal(false); setAssignBeforeWonError(''); }}
                disabled={assigningForWon}
                className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAssignAndConvert}
                disabled={assigningForWon || !assignBeforeWonUser || !lead?.customer_id}
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {assigningForWon ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Đang xử lý...</>
                ) : (
                  <>✅ Xác nhận & Chuyển Deal</>
                )}
              </button>
            </div>
          </div>
        </div>
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

      {/* Modal lý do thua */}
      {showLostModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLostModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">❌ Lý do thua / mất</h3>
            <textarea
              className="w-full border rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-red-300 focus:border-red-400"
              placeholder="Nhập lý do thua (giá cao, đối thủ, KH hủy...)"
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowLostModal(false); setPendingLostStageId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button onClick={confirmLost} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Xác nhận thua</button>
            </div>
          </div>
        </div>
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

const SHARE_MODULE_OPTIONS = [
  { id: 'production', label: '🏭 Sản xuất (SX)' },
  { id: 'logistics', label: '🚚 Vận chuyển (VC)' },
  { id: 'workshop', label: '📁 Công việc dự án' },
];

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop()?.toLowerCase();
  const map = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', dwg: '📐', dxf: '📐', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', zip: '📦', rar: '📦', mp4: '🎬', mov: '🎬', webm: '🎬', avi: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵' };
  return map[ext] || '📄';
}

function DocumentRow({ doc, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showVis, setShowVis] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allowedCompanies, setAllowedCompanies] = useState([]);
  const [allowedDepts, setAllowedDepts] = useState([]);
  const [savingVis, setSavingVis] = useState(false);
  const [sharedToWorkshop, setSharedToWorkshop] = useState(!!doc.shared_to_workshop);
  const [allowedShareModules, setAllowedShareModules] = useState(() => parseShareModules(doc.allowed_share_modules) || []);
  const typeInfo = DOC_TYPES.find(t => t.value === doc.doc_type) || DOC_TYPES[5];
  const fileHref = doc.file_url ? publicFileUrl(doc.file_url) : '';
  const fileOpenProps = fileHref ? getFileOpenAnchorProps(doc.file_url, { fileName: doc.file_name }) : null;
  const isFile = !!fileHref;
  const isImage = isFile && (doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(doc.file_name || doc.file_url || ''));
  const isVideo = isFile && (doc.mime_type?.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(doc.file_name || doc.file_url || ''));
  const hasExtra = doc.notes || isImage || isVideo;

  useEffect(() => {
    setAllowedCompanies(Array.isArray(doc.allowed_companies) ? doc.allowed_companies : []);
    setAllowedDepts(Array.isArray(doc.allowed_departments) ? doc.allowed_departments : []);
    setSharedToWorkshop(!!doc.shared_to_workshop);
    setAllowedShareModules(parseShareModules(doc.allowed_share_modules) || []);
  }, [doc.allowed_companies, doc.allowed_departments, doc.shared_to_workshop, doc.allowed_share_modules]);

  const openVisibility = async () => {
    setShowVis(true);
    if (companies.length || departments.length) return;
    try {
      const [cRes, dRes] = await Promise.all([
        api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: { departments: [] } })),
      ]);
      setCompanies(cRes.data?.companies || cRes.data || []);
      setDepartments(dRes.data?.departments || dRes.data || []);
    } catch (_) {}
  };

  const toggleCompany = (id) => {
    setAllowedCompanies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDept = (id) => {
    setAllowedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleShareModule = (id) => {
    setAllowedShareModules((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveVisibility = async () => {
    setSavingVis(true);
    try {
      const { data } = await api.put(`/crm/documents/${doc.id}/visibility`, {
        allowed_companies: allowedCompanies.length ? allowedCompanies : null,
        allowed_departments: allowedDepts.length ? allowedDepts : null,
        shared_to_workshop: !!sharedToWorkshop,
        allowed_share_modules: sharedToWorkshop && allowedShareModules.length ? allowedShareModules : null,
      });
      // reflect immediately in UI (LeadDetail keeps doc objects)
      doc.allowed_companies = data.allowed_companies;
      doc.allowed_departments = data.allowed_departments;
      doc.shared_to_workshop = data.shared_to_workshop;
      doc.allowed_share_modules = data.allowed_share_modules;
      setShowVis(false);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu phân quyền');
    }
    setSavingVis(false);
  };

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
                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium" title="Nhãn phòng/công ty — không ẩn với team CRM trên trang này">🏷️ Nhãn PB/Cty</span>
              )}
              {doc.shared_to_workshop && Array.isArray(doc.allowed_share_modules) && doc.allowed_share_modules.length > 0 && (
                <span className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium" title="Chỉ hiện ở một số module xưởng">
                  🧩 {doc.allowed_share_modules.join(', ')}
                </span>
              )}
            </div>
          </div>
          {isFile && !isImage && !isVideo && fileOpenProps && (
            <a {...fileOpenProps} className="text-xs text-blue-600 hover:underline shrink-0 px-2" onClick={e => e.stopPropagation()}>
              Mở
            </a>
          )}
          {hasExtra && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openVisibility(); }}
          className="p-1 hover:bg-slate-200 text-slate-600 rounded ml-1 cursor-pointer"
          title="Chia sẻ xưởng & phân quyền xem"
        >
          ⚙️
        </button>
        <button onClick={onDelete} className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Video preview — always show player */}
      {isVideo && (
        <div className={`px-3 ${expanded ? 'pb-3' : 'pb-2'}`}>
          <video src={fileHref} controls preload="metadata"
            className={`w-full rounded-lg border border-gray-200 bg-black shadow-sm ${expanded ? 'max-h-96' : 'max-h-40'}`} />
        </div>
      )}
      {/* Image preview — show thumbnail even when collapsed */}
      {isImage && !expanded && fileOpenProps && (
        <div className="px-3 pb-2">
          <a {...fileOpenProps} className="block">
            <img src={fileHref} alt={doc.name} className="max-h-24 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
          </a>
        </div>
      )}
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          {isImage && fileOpenProps && (
            <a {...fileOpenProps} className="block">
              <img src={fileHref} alt={doc.name} className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
            </a>
          )}
          {doc.notes && (
            <div className="bg-white rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">{doc.notes}</div>
          )}
        </div>
      )}

      {showVis && (
        <div className="px-3 pb-3">
          <div className="bg-white border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">🔐 Chia sẻ & phân quyền</p>
              <button type="button" onClick={() => setShowVis(false)} className="text-xs text-gray-500 hover:underline">Đóng</button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sharedToWorkshop} onChange={(e) => setSharedToWorkshop(e.target.checked)} />
              <span>Chia sẻ sang xưởng (SX/VC)</span>
            </label>

            {sharedToWorkshop && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">🧩 Module được xem tài liệu</p>
                <div className="flex flex-wrap gap-1.5">
                  {SHARE_MODULE_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleShareModule(m.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                        allowedShareModules.includes(m.id)
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Không chọn = hiển thị ở cả SX, VC và trang Công việc dự án (như trước).
                </p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">🏢 Công ty được xem</p>
              <div className="flex flex-wrap gap-1.5">
                {(companies || []).map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCompany(c.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      allowedCompanies.includes(c.id)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {c.short_name || c.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Không chọn = không giới hạn theo công ty.</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">🏷️ Phòng ban được xem</p>
              <div className="flex flex-wrap gap-1.5">
                {(departments || []).map(d => (
                  <button key={d.id} type="button" onClick={() => toggleDept(d.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      allowedDepts.includes(d.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {d.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Không chọn = không giới hạn theo phòng ban.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setAllowedCompanies([]); setAllowedDepts([]); }}
                className="h-9 px-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Bỏ giới hạn
              </button>
              <button
                type="button"
                onClick={saveVisibility}
                disabled={savingVis}
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {savingVis ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
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
      api.get('/companies', { params: { for_module: 'crm' } }).then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {}),
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

          {/* Ghi nhận phòng/công ty (tuân thủ nội bộ — không ẩn tài liệu với đồng nghiệp trên CRM) */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1">🏷️ Gắn nhãn phòng / công ty <span className="text-gray-400 font-normal font-medium">(không chọn = không gắn)</span></label>
            <p className="text-[10px] text-gray-500 leading-snug">Mọi người xem được lead/deal đều thấy tài liệu trên CRM. Chia sẻ sang <strong>Dự án / Xưởng</strong> dùng cờ riêng trên nhiệm vụ hoặc cột «Chia sẻ xưởng» trên tài liệu.</p>
            
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
                Đã gắn: {allowedCompanies.length > 0 ? `${allowedCompanies.length} công ty` : ''}{allowedCompanies.length > 0 && allowedDepts.length > 0 ? ' · ' : ''}{allowedDepts.length > 0 ? `${allowedDepts.length} phòng` : ''} — không giới hạn xem trên CRM; chỉ mang tính phân loại / báo cáo.
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
function LeadInfoPanel({ lead, allUsers, onUpdate, currentUser }) {
  const [sources, setSources] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [sxHandoverForm, setSxHandoverForm] = useState({
    construction_start_date: '',
    expected_production_start_date: '',
    expected_production_end_date: '',
    sale_acknowledged: false,
  });
  const [sxHandoverSaving, setSxHandoverSaving] = useState(false);
  const [sxHandoverNotice, setSxHandoverNotice] = useState('');
  const [sxHandoverExpanded, setSxHandoverExpanded] = useState(false);

  useEffect(() => {
    if (lead?.type !== 'deal' || lead?.sx_handover_at) return;
    setSxHandoverForm({
      construction_start_date: lead.construction_start_date || '',
      expected_production_start_date: lead.expected_production_start_date || '',
      expected_production_end_date: lead.expected_production_end_date || '',
      sale_acknowledged: false,
    });
    setSxHandoverNotice('');
    setSxHandoverExpanded(false);
  }, [lead?.id, lead?.type, lead?.project_id, lead?.sx_handover_at, lead?.construction_start_date, lead?.expected_production_start_date, lead?.expected_production_end_date]);

  // Load sources + companies
  useEffect(() => {
    api.get('/crm/sources').then(r => setSources(r.data?.sources || (Array.isArray(r.data) ? r.data : []))).catch(() => {});
    api.get('/companies', { params: { for_module: 'crm' } }).then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lead?.company_id) { setLeadTypes([]); return; }
    let cancelled = false;
    api.get('/crm/lead-types', { params: { company_id: lead.company_id } })
      .then((r) => {
        if (cancelled) return;
        setLeadTypes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => { if (!cancelled) setLeadTypes([]); });
    return () => { cancelled = true; };
  }, [lead?.company_id]);

  const saveField = async (field, value) => {
    setSaving(true);
    try {
      const payload = {};
      if (field === 'estimated_value') payload.estimated_value = parseFloat(value) || 0;
      else if (field === 'probability') payload.probability = Math.min(100, Math.max(0, parseInt(value) || 0));
      else if (field === 'source_id') payload.source_id = value || null;
      else if (field === 'lead_type_id') payload.lead_type_id = value || null;
      else if (field === 'assigned_to') {
        payload.assigned_to = value || null;
        payload.lead_owner_id = value || null;
      } else if (field === 'lead_owner_id') {
        payload.lead_owner_id = value || null;
        payload.assigned_to = value || null;
      }
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

      {lead?.type === 'deal' && (
        <EditableRow icon="📅" label="Deadline" field="expected_close_date"
          value={lead?.expected_close_date || ''}
          displayValue={lead?.expected_close_date ? formatDate(lead.expected_close_date) : null}
          type="date" />
      )}

      {lead?.lost_reason && (
        <div className="flex items-start gap-2 py-1.5 px-1">
          <span className="text-sm">❌</span>
          <div>
            <span className="text-xs text-gray-500">Lý do thua</span>
            <p className="text-sm text-red-600">{lead.lost_reason}</p>
          </div>
        </div>
      )}

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

      <EditableRow icon="🏷️" label="Loại" field="lead_type_id"
        value={lead?.lead_type_id || ''}
        displayValue={lead?.lead_type_id ? (leadTypes.find(t => t.id === lead.lead_type_id)?.name || null) : null}
        type="select"
        options={leadTypes
          .filter((t) => t.applies_to === 'both' || t.applies_to === (lead?.type === 'deal' ? 'deal' : 'lead'))
          .map((t) => ({ value: t.id, label: t.name }))} />

      {/* Công ty */}
      <EditableRow icon="🏢" label="Công ty" field="company_id"
        value={lead?.company_id || ''}
        displayValue={lead?.company_id ? companies.find(c => c.id === lead.company_id)?.name || null : null}
        type="select"
        options={companies.map(c => ({ value: c.id, label: c.name }))} />

      {/* Một người phụ trách cho cả Lead và Deal */}
      <div className="group">
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
          <span className="text-sm mt-0.5 shrink-0">👤</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
              Người phụ trách
            </p>
            {!lead?.company_id ? (
              <p className="text-xs text-amber-500 italic">⚠️ Chọn công ty trước</p>
            ) : (
              <EmployeePicker
                companyId={lead?.company_id}
                value={lead?.assigned_to || lead?.lead_owner_id || ''}
                onChange={(userId) => saveField('assigned_to', userId || '')}
                placeholder="👤 Chọn nhân viên phụ trách..."
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

      {lead?.type === 'deal' && lead?.stage?.is_won && !lead?.sx_handover_at && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-4 space-y-3">
          {!sxHandoverExpanded ? (
            <button
              type="button"
              onClick={() => setSxHandoverExpanded(true)}
              className="w-full sm:w-auto h-10 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer"
            >
              Bàn giao Sản xuất (thủ công)
            </button>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">🏭 Bàn giao Sản xuất (thủ công)</p>
                  <button
                    type="button"
                    onClick={() => { setSxHandoverExpanded(false); setSxHandoverNotice(''); }}
                    className="text-[11px] text-amber-700 hover:text-amber-900 cursor-pointer"
                    title="Ẩn"
                  >
                    Ẩn
                  </button>
                </div>
                {!!sxHandoverNotice && (
                  <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                    {sxHandoverNotice}
                  </p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[10px] font-semibold text-amber-900 block">
                  Ngày bắt đầu công trình
                  <input
                    type="date"
                    value={sxHandoverForm.construction_start_date}
                    onChange={(e) => { setSxHandoverForm((f) => ({ ...f, construction_start_date: e.target.value })); setSxHandoverNotice(''); }}
                    className="mt-0.5 w-full h-9 px-2 border border-amber-200 rounded-lg text-sm bg-white"
                  />
                </label>
                <label className="text-[10px] font-semibold text-amber-900 block">
                  Ngày dự kiến sản xuất
                  <input
                    type="date"
                    value={sxHandoverForm.expected_production_start_date}
                    onChange={(e) => { setSxHandoverForm((f) => ({ ...f, expected_production_start_date: e.target.value })); setSxHandoverNotice(''); }}
                    className="mt-0.5 w-full h-9 px-2 border border-amber-200 rounded-lg text-sm bg-white"
                  />
                </label>
                <label className="text-[10px] font-semibold text-amber-900 block">
                  Ngày dự kiến hoàn thành SX (không bắt buộc)
                  <input
                    type="date"
                    value={sxHandoverForm.expected_production_end_date}
                    onChange={(e) => { setSxHandoverForm((f) => ({ ...f, expected_production_end_date: e.target.value })); setSxHandoverNotice(''); }}
                    className="mt-0.5 w-full h-9 px-2 border border-amber-200 rounded-lg text-sm bg-white"
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 cursor-pointer text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={sxHandoverForm.sale_acknowledged}
                  onChange={(e) => { setSxHandoverForm((f) => ({ ...f, sale_acknowledged: e.target.checked })); setSxHandoverNotice(''); }}
                  className="mt-0.5 rounded border-amber-400"
                />
                <span>
                  Tôi xác nhận với tư cách <strong>Sale</strong>
                  {currentUser?.full_name ? ` (${currentUser.full_name})` : ''}: đồng ý bàn giao dự án sang quy trình Sản xuất với các mốc ngày đã nhập.
                </span>
              </label>
              <button
                type="button"
                disabled={sxHandoverSaving || !lead?.project_id}
                onClick={async () => {
                  if (!lead?.project_id) {
                    setSxHandoverNotice('Deal đang ở trạng thái Thắng nhưng chưa có dự án. Hãy tạo dự án trước, sau đó mới xác nhận bàn giao SX.');
                    return;
                  }
                  if (!sxHandoverForm.sale_acknowledged) {
                    setSxHandoverNotice('Vui lòng tick xác nhận Sale trước khi bàn giao sang Sản xuất.');
                    return;
                  }
                  if (!sxHandoverForm.construction_start_date || !sxHandoverForm.expected_production_start_date) {
                    setSxHandoverNotice('Vui lòng nhập đủ: ngày dự kiến thi công và ngày dự kiến sản xuất.');
                    return;
                  }
                  setSxHandoverSaving(true);
                  try {
                    await api.post(`/crm/leads/${lead.id}/sx-handover`, {
                      sale_acknowledged: true,
                      construction_start_date: sxHandoverForm.construction_start_date,
                      expected_production_start_date: sxHandoverForm.expected_production_start_date,
                      expected_production_end_date: sxHandoverForm.expected_production_end_date || null,
                    });
                    onUpdate();
                  } catch (e) {
                    alert(e.response?.data?.error || 'Lỗi');
                  }
                  setSxHandoverSaving(false);
                }}
                className="w-full sm:w-auto h-10 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {sxHandoverSaving ? 'Đang lưu…' : 'Xác nhận bàn giao Sản xuất'}
              </button>
            </>
          )}
        </div>
      )}

      {lead?.type === 'deal' && lead?.project_id && lead?.sx_handover_at && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-bold text-emerald-800 uppercase">Đã bàn giao Sản xuất</p>
          <p className="text-xs text-emerald-900">
            Bắt đầu CT: <strong>{lead.construction_start_date ? formatDate(lead.construction_start_date) : '—'}</strong>
            {' · '}Dự kiến SX: <strong>{lead.expected_production_start_date ? formatDate(lead.expected_production_start_date) : '—'}</strong>
            {' · '}Hoàn thành SX: <strong>{lead.expected_production_end_date ? formatDate(lead.expected_production_end_date) : '—'}</strong>
          </p>
        </div>
      )}

      {lead?.type === 'deal' && lead?.project_id && (
        <div className="flex flex-col gap-1.5">
          {/* Trạng thái Sản xuất */}
          {lead.sx_pipeline_stage && (() => {
            const sx = lead.sx_pipeline_stage;
            const icon = sx.bucket_slug === 'won_pending' ? '⏳' : sx.bucket_slug === 'completed' ? '✅' : (sx.icon || '🏭');
            const label = sx.bucket_slug === 'won_pending' ? 'Chờ vào xưởng' : sx.name;
            return (
              <div className="flex items-start gap-2 py-2 px-3 rounded-lg border"
                style={{ backgroundColor: sx.color ? `${sx.color}10` : '#f0f9ff', borderColor: sx.color ? `${sx.color}40` : '#bae6fd' }}>
                <span className="text-base mt-0.5 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: sx.color || '#0369a1' }}>
                    🏭 Sản xuất
                  </p>
                  <p className="text-sm font-semibold" style={{ color: sx.color || '#0c4a6e' }}>
                    {label}
                  </p>
                </div>
              </div>
            );
          })()}
          {/* Trạng thái Vận chuyển & Lắp đặt */}
          {lead.vc_pipeline_stage && (() => {
            const vc = lead.vc_pipeline_stage;
            const icon = vc.bucket_slug === 'delivery_pending' ? '📦'
              : vc.bucket_slug === 'installation' ? '🔧'
              : vc.bucket_slug === 'customer_care' || vc.bucket_slug === 'customer-care' ? '🤝'
              : vc.bucket_slug === 'completed' ? '✅' : (vc.icon || '🚚');
            const label = vc.bucket_slug === 'delivery_pending' ? 'Chờ vận chuyển' : vc.name;
            return (
              <div className="flex items-start gap-2 py-2 px-3 rounded-lg border"
                style={{ backgroundColor: vc.color ? `${vc.color}12` : '#fff7ed', borderColor: vc.color ? `${vc.color}50` : '#fed7aa' }}>
                <span className="text-base mt-0.5 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: vc.color || '#ea580c' }}>
                    🚚 Vận chuyển & Lắp đặt
                  </p>
                  <p className="text-sm font-semibold" style={{ color: vc.color || '#c2410c' }}>
                    {label}
                  </p>
                </div>
              </div>
            );
          })()}
          {!lead.sx_pipeline_stage && !lead.vc_pipeline_stage && (
            <p className="text-xs text-gray-400 italic px-1">Chưa có thông tin pipeline xưởng</p>
          )}
        </div>
      )}
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
  const [selectedSales, setSelectedSales] = useState(lead?.assigned_to || lead?.lead_owner_id || '');

  const canConvert = customer?.full_name && customer?.phone;

  // Load companies + auto-select from lead
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/companies', { params: { for_module: 'crm' } });
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
      onSuccess(data?.deal?.id || data?.id || leadId);
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

          {(lead?.lead_owner || lead?.assignee) && (
            <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
              <p className="text-xs font-bold text-purple-700 mb-1">👤 Người phụ trách hiện tại</p>
              <p className="text-sm text-purple-900">{lead?.assignee?.full_name || lead?.lead_owner?.full_name || '—'}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">👤 Người phụ trách sau khi chuyển Deal</label>
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


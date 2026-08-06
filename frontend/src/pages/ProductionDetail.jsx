import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCrmNotesFab } from '../context/CrmNotesFabContext';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { taskBelongsToWorkshopModule, taskBelongsToVcSubTab } from '../lib/workshopTaskScope';
import { markWorkshopPipelineCardFocus, markWorkshopProjectRename } from '../lib/workshopPipelineStorage';
import { patchCrmDashboardCacheLeadFields } from '../lib/crmDashboardCache';
import {
  isLeadDocVisibleInModule,
  isCrmSharedArtifactVisibleInModule,
  canViewerSeeByCompanyAndDept,
  parseShareModules,
  cleanShareModulesForApi,
  shareModuleLabels,
} from '../lib/documentShareScope';
import DocumentShareModulePicker from '../components/DocumentShareModulePicker';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatDate, getInitials, avatarColor, getFileEmoji } from '../lib/utils';
import { publicFileUrl as pubUrl, downloadUploadFile, printUploadImage } from '../lib/publicFileUrl';
import { FilePreviewOpenLink } from '../context/FilePreviewContext';
import UploadFileLightbox, {
  buildUploadLightboxItem,
  collectUploadLightboxItems,
  findUploadLightboxIndex,
  isUploadImageFile,
} from '../components/UploadFileLightbox';
import { downloadWorkshopDocumentsZip } from '../lib/workshopDocumentsZipDownload';
import { resolveSxProjectLeadId } from '../lib/sxProjectComments';
import { countMembersByModule } from '../lib/memberModuleCounts';
import {
  ArrowLeft, FolderKanban, MessageSquare, Plus, X,
  FileUp, Edit2, Save, ChevronDown, Trash2, Send, Paperclip,
  AlertTriangle, CheckCircle2, Circle, Clock, Truck, Wrench, ArrowRightLeft, Loader2, Download,
  Share2, Lock,
} from 'lucide-react';
import CRMTasksTab from '../components/CRMTasksTab';
import DealSharedWorkspaceTab from '../components/DealSharedWorkspaceTab';
import WorkshopProjectTasksPanel from '../components/WorkshopProjectTasksPanel';
import UnifiedTaskHistoryWidget from '../components/UnifiedTaskHistoryWidget';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import { LeadMembersTab, LeadChatTab } from '../components/LeadChatTabs';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';
import PipelineStepper from '../components/PipelineStepper';
import BlockingTasksAlertModal from '../components/BlockingTasksAlertModal';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import {
  buildCrmStageSlugLabelMapFromTasks,
  resolveCrmPipelineStageLabel,
} from '../lib/crmStageSlugLabels';
import { isProjectAlreadyInLogistics } from '../lib/projectLogistics';
import { buildCrmLeadDocTaskSections, normalizeCrmChecklist } from '../lib/crmTaskDocumentTree';
import { fetchPipelineStagesById } from '../lib/crmPipelineStages';
import { buildSxPipelineStageMeta, resolveSxDisplayColumnId, TEMP_SX_FREE_DRAG } from '../lib/sxPipelineRevenue';
import { CrmLeadCommentsPanel, ProjectCommentsPanel } from '../components/CommentsPanels';
import SharedCRMNotes from '../components/SharedCRMNotes';
import DriveAttachments from '../components/drive/DriveAttachments';
import ProjectProcurementTab from '../components/ProjectProcurementTab';
import { driveLinksCountByEntity } from '../lib/drive';
import { canManageWorkshopProjectFiles } from '../lib/fileOwnership';

/** Cùng tên tab với LeadDetail (chi tiết deal) — bỏ facebook và calls */
const DEAL_TAB_KEYS = new Set(['tasks', 'shared-workspace', 'documents', 'notes', 'comments', 'team', 'approvals', 'incidents', 'procurement']);
const LEGACY_TAB_MAP = {
  timeline: 'comments',
  'crm-notes': 'notes',
  /** Tab cũ «Đơn hàng» / crm-tasks → nhiệm vụ trên deal */
  orders: 'tasks',
  'crm-tasks': 'tasks',
  'crm-chat': 'comments',
  'crm-comments': 'comments',
  'crm-activities': 'comments',
  activities: 'comments',
  chat: 'comments',
  'crm-deal-docs': 'documents',
  'crm-members': 'team',
};

function calcProgressForTasks(taskList) {
  if (!taskList?.length) return 0;
  return Math.round((taskList.filter((t) => t.status === 'done').length / taskList.length) * 100);
}

/** Chuẩn hóa payload chi tiết dự án VC/SX từ API. */
function normalizeWorkshopProjectDetail(proj) {
  if (!proj) return proj;
  const crmDeals = proj.crmDeals || proj.crm_deals || [];
  return { ...proj, crmDeals };
}

function resolvePersonFromList(person, personId, users) {
  if (person?.full_name) return person;
  if (!personId || !Array.isArray(users) || !users.length) return person || null;
  return users.find((u) => String(u.id) === String(personId)) || null;
}

/** Khớp cột Kanban SX với dashboard — dùng chung resolveSxDisplayColumnId. */
function resolveSxKanbanCurrentStageId(project, stages) {
  return resolveSxDisplayColumnId(project, stages, {
    sxWonDeal: Boolean(project?.sx_won_deal),
  });
}

/** Cột hiện tại VC: chỉ dùng vc_kanban_column_id (không fallback workflow stage). */
function resolveVcKanbanCurrentStageId(project, stages) {
  const list = Array.isArray(stages) ? stages : [];
  const colId = project?.vc_kanban_column_id != null ? String(project.vc_kanban_column_id) : '';
  if (colId && list.some((s) => String(s.id) === colId)) return colId;
  if (project?.vc_intake) {
    const intake = list.find((s) => String(s.bucket_slug || '') === 'delivery_pending');
    if (intake?.id) return String(intake.id);
  }
  if (colId) return colId;
  return null;
}

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

const ACTIVITY_FORM_TYPES = ACTIVITY_TYPES.filter((t) =>
  ['call', 'meeting', 'email', 'zalo', 'note'].includes(t.value),
);

/** Cột trái — ngày giao/lắp, địa chỉ, tên khác (đồng bộ deal CRM / bàn giao VC). */
function WorkshopInfoPanel({
  project,
  onUpdate,
  crmDeal = null,
  onDealUpdate,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (field, value) => { setEditing(field); setDraft(value ?? ''); };
  const cancelEdit = () => { setEditing(null); setDraft(''); };

  const otherName = String(
    crmDeal?.external_company_name
    || project.customer?.full_name
    || project.customer?.name
    || crmDeal?.customer?.full_name
    || crmDeal?.title
    || project.name
    || '',
  ).trim() || null;

  const installAddress = String(
    project.install_address
    || crmDeal?.install_address
    || project.customer?.address
    || crmDeal?.customer?.address
    || '',
  ).trim() || null;

  const pickupAt = project.pickup_at || null;
  const installDate = project.install_date || null;

  const pickupDateObj = pickupAt ? new Date(pickupAt) : null;
  const pickupOverdue = pickupDateObj && !Number.isNaN(pickupDateObj.getTime()) && pickupDateObj < new Date();
  const pickupSoon = pickupDateObj && !pickupOverdue && !Number.isNaN(pickupDateObj.getTime())
    && pickupDateObj < new Date(Date.now() + 3 * 86400000);

  const installDateObj = installDate ? new Date(installDate) : null;
  const installOverdue = installDateObj && !Number.isNaN(installDateObj.getTime()) && installDateObj < new Date();
  const installSoon = installDateObj && !installOverdue && !Number.isNaN(installDateObj.getTime())
    && installDateObj < new Date(Date.now() + 3 * 86400000);

  const toDateInputValue = (raw) => {
    if (!raw) return '';
    const s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
      return '';
    }
  };

  const save = async (field, value) => {
    setSaving(true);
    try {
      let payloadValue = value || null;
      // pickup_at là timestamptz — input date → giữ giờ cũ hoặc mặc định 09:00 VN
      if (field === 'pickup_at' && payloadValue && /^\d{4}-\d{2}-\d{2}$/.test(payloadValue)) {
        const prev = project.pickup_at ? String(project.pickup_at) : '';
        const prevTime = prev.match(/T(\d{2}:\d{2})/)?.[1];
        payloadValue = `${payloadValue}T${prevTime || '09:00'}:00+07:00`;
      }

      await api.put(`/projects/${project.id}`, { [field]: payloadValue });

      // Đồng bộ sang deal CRM (cùng nguồn với phiếu/bàn giao VC của sale).
      if (crmDeal?.id) {
        const leadPatch = {};
        if (field === 'install_address') leadPatch.install_address = payloadValue;
        if (field === 'name' || field === 'external_company_name') {
          leadPatch.external_company_name = payloadValue;
        }
        if (Object.keys(leadPatch).length) {
          try {
            const { data } = await api.put(`/crm/leads/${crmDeal.id}`, leadPatch);
            onDealUpdate?.(data ? { ...crmDeal, ...data, ...leadPatch } : { ...crmDeal, ...leadPatch });
          } catch { /* dự án đã lưu */ }
        }
      }

      onUpdate?.();
      setEditing(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const saveOtherName = async (value) => {
    setSaving(true);
    try {
      const trimmed = String(value || '').trim() || null;
      if (crmDeal?.id) {
        const { data } = await api.put(`/crm/leads/${crmDeal.id}`, {
          external_company_name: trimmed,
        });
        onDealUpdate?.(data ? { ...crmDeal, ...data, external_company_name: trimmed } : {
          ...crmDeal,
          external_company_name: trimmed,
        });
      }
      onUpdate?.();
      setEditing(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu tên khác');
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-xl border p-5 space-y-1">
      <h3 className="text-sm font-bold text-gray-900 uppercase mb-2">Thông tin</h3>

      {/* Tên khác — external_company_name (gia công / đối tác) */}
      <div
        className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer"
        onClick={() => editing !== 'external_company_name' && startEdit('external_company_name', otherName || '')}
      >
        <span className="text-sm mt-0.5 shrink-0">👤</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Tên khác</p>
          {editing === 'external_company_name' ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Tên đối tác / tên khác…"
              />
              <button type="button" onClick={() => saveOtherName(draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button type="button" onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
              <span className="flex-1 min-w-0 break-words">{otherName || '—'}</span>
              <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 shrink-0" />
            </p>
          )}
        </div>
      </div>

      {/* Ngày lấy hàng (VC) */}
      <div
        className={`flex items-start gap-2 py-2 px-1 rounded-lg -mx-1 transition-colors group cursor-pointer ${pickupOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
        onClick={() => editing !== 'pickup_at' && startEdit('pickup_at', toDateInputValue(pickupAt))}
      >
        <span className="text-sm mt-0.5 shrink-0">🚚</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ngày lấy hàng</p>
          {editing === 'pickup_at' ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button type="button" onClick={() => save('pickup_at', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button type="button" onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className={`text-sm font-medium flex items-center gap-1 ${pickupOverdue ? 'text-red-600' : pickupSoon ? 'text-amber-600' : 'text-gray-900'}`}>
              <span className="flex-1 min-w-0">{pickupAt ? formatDate(pickupAt) : '—'}</span>
              {pickupOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Trễ!</span>}
              {pickupSoon && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold">Sắp tới</span>}
              <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 shrink-0" />
            </p>
          )}
        </div>
      </div>

      {/* Ngày lắp đặt */}
      <div
        className={`flex items-start gap-2 py-2 px-1 rounded-lg -mx-1 transition-colors group cursor-pointer ${installOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
        onClick={() => editing !== 'install_date' && startEdit('install_date', toDateInputValue(installDate))}
      >
        <span className="text-sm mt-0.5 shrink-0">🔧</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ngày lắp đặt</p>
          {editing === 'install_date' ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button type="button" onClick={() => save('install_date', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button type="button" onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className={`text-sm font-medium flex items-center gap-1 ${installOverdue ? 'text-red-600' : installSoon ? 'text-amber-600' : 'text-gray-900'}`}>
              <span className="flex-1 min-w-0">{installDate ? formatDate(installDate) : '—'}</span>
              {installOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Trễ!</span>}
              {installSoon && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold">Sắp tới</span>}
              <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 shrink-0" />
            </p>
          )}
        </div>
      </div>

      {/* Địa chỉ lắp đặt */}
      <div
        className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer"
        onClick={() => editing !== 'install_address' && startEdit('install_address', installAddress || '')}
      >
        <span className="text-sm mt-0.5 shrink-0">📍</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Địa chỉ lắp đặt</p>
          {editing === 'install_address' ? (
            <div className="flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                autoFocus
                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                placeholder="Nhập địa chỉ lắp đặt..."
              />
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => save('install_address', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
                <button type="button" onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-900 flex items-start gap-1">
              <span className="flex-1">{installAddress || '—'}</span>
              <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 mt-0.5 shrink-0" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const getFileIcon = (name) => getFileEmoji(name);

function getUploadFilePayload(uploadResponse) {
  if (!uploadResponse || typeof uploadResponse !== 'object') return null;
  if (Array.isArray(uploadResponse.files) && uploadResponse.files.length > 0) {
    return uploadResponse.files[0] || null;
  }
  if (uploadResponse.file_url || uploadResponse.url) return uploadResponse;
  return null;
}

const CRM_DOC_TYPES = [
  { value: 'requirement', label: 'Yêu cầu KH', icon: '📝' },
  { value: 'drawing', label: 'Bản vẽ', icon: '📐' },
  { value: 'image', label: 'Hình ảnh', icon: '🖼️' },
  { value: 'contract', label: 'Hợp đồng', icon: '📄' },
  { value: 'measurement', label: 'Số đo', icon: '📏' },
  { value: 'other', label: 'Khác', icon: '📎' },
];

/** Thứ tự giai đoạn pipeline CRM — khớp CRMTasksTab / LeadDetail */
const CRM_STAGE_ORDER = [
  'consulting', 'design', 'quotation', 'contract',
  'deal_new', 'deal_quote_contract', 'deal_ordering', 'deal_schedule', 'deal_shipping', 'deal_notes',
  'sx_tiep_nhan', 'sx_thiet_ke_ke_hoach', 'sx_kiem_tra_cheo', 'sx_vat_tu',
  'sx_san_xuat_thung', 'sx_san_xuat_alu', 'sx_hoan_thien', 'sx_dong_goi', 'sx_giao_hang',
];

const CRM_STAGE_LABELS = {
  consulting: '💬 Tư vấn',
  design: '🎨 Thiết kế',
  quotation: '💰 Báo giá',
  contract: '📄 Hợp đồng',
  deal_new: '📋 Nhiệm vụ Deal mới',
  deal_quote_contract: '📄 Báo giá & Hợp đồng',
  deal_ordering: '🛒 Tiến hành đặt hàng',
  deal_schedule: '📅 Hẹn ngày lắp đặt',
  deal_shipping: '🚛 Đặt Vận chuyển',
  deal_notes: '📝 Ghi chú khác',
  sx_tiep_nhan: '1️⃣ Tiếp nhận',
  sx_thiet_ke_ke_hoach: '2️⃣ Thiết kế và lên kế hoạch',
  sx_kiem_tra_cheo: '3️⃣ Kiểm tra chéo',
  sx_vat_tu: '4️⃣ Vật tư',
  sx_san_xuat_thung: '5️⃣ Sản xuất thùng',
  sx_san_xuat_alu: '6️⃣ Sản xuất alu',
  sx_hoan_thien: '7️⃣ Hoàn thiện',
  sx_dong_goi: '8️⃣ Đóng gói',
  sx_giao_hang: '9️⃣ Giao hàng',
};

function isCrmDocFromTask(doc) {
  return !!(doc?.source_attachment_id || doc?.source_crm_task_id || doc?.is_from_task);
}

/** lead_documents.name thường lưu `[Tên nhiệm vụ] tên file` — bóc prefix khi đã hiện tên NV ở nhóm cha. */
function stripLeadDocumentTaskPrefix(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const bracket = s.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (bracket) {
    const rest = (bracket[2] || '').trim();
    if (rest.startsWith('📝')) {
      const noteBody = rest.replace(/^📝\s*(Ghi chú:?\s*)?/i, '').trim();
      return noteBody || 'Ghi chú';
    }
    return rest || bracket[1];
  }
  if (s.startsWith('📝 Ghi chú:')) return s.replace(/^📝 Ghi chú:\s*/, '').trim() || 'Ghi chú';
  return s;
}

function resolveCrmDocDisplayTitle(doc, { preferFileName = false } = {}) {
  const fileName = doc.file_name || doc.file_path?.split('/').pop() || '';
  const isNote = doc.doc_type === 'task_inline_note' || doc.doc_type === 'task_note'
    || (!doc.file_url && !!doc.notes);
  if (isNote) return stripLeadDocumentTaskPrefix(doc.name) || 'Ghi chú';
  if (isCrmDocFromTask(doc)) {
    if (preferFileName && fileName) return fileName;
    const stripped = stripLeadDocumentTaskPrefix(doc.name);
    if (fileName && stripped !== doc.name) return fileName;
    if (stripped && stripped !== doc.name) return stripped;
    return fileName || stripped || doc.name || 'Tài liệu';
  }
  return doc.name || fileName || 'Tài liệu';
}

/** Nhóm tài liệu CRM: giai đoạn → nhiệm vụ → checklist → file (khớp tab Nhiệm vụ). */
function buildCrmSharedDocSections(docs, taskMetaMap, stageSlugLabelMap = {}) {
  const { sections, manualDocs } = buildCrmLeadDocTaskSections(
    docs,
    taskMetaMap,
    stageSlugLabelMap,
    CRM_STAGE_LABELS,
  );
  return { taskSections: sections, manualDocs };
}

/** Khối tài liệu CRM — mỗi file một dòng, nhóm theo giai đoạn → nhiệm vụ */
function CrmSharedDocumentsPanel({
  docs, workshopModule, crmLeadId, dealLabel, onVisibilitySaved,   onDeleteDocument, taskMetaMap = {}, stageSlugLabelMap = {}, onOpenImage,
  canManageDeal = false,
}) {
  const { taskSections, manualDocs } = useMemo(
    () => buildCrmSharedDocSections(docs, taskMetaMap, stageSlugLabelMap),
    [docs, taskMetaMap, stageSlugLabelMap],
  );

  if (!docs.length) return null;

  const moduleLabel = workshopModule === 'logistics' ? 'Vận chuyển' : 'Sản xuất';

  return (
    <div className="mb-5 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/90 via-white to-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-violet-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-violet-900">📋 Tài liệu từ CRM</p>
          <p className="text-xs text-violet-700/85 mt-0.5 leading-relaxed">
            {docs.length} tài liệu được chia sẻ sang <strong>{moduleLabel}</strong>
            {dealLabel ? <> · Deal <span className="font-mono">{dealLabel}</span></> : null}
          </p>
        </div>
        {crmLeadId && (
          <Link
            to={`/crm/leads/${crmLeadId}?tab=documents`}
            className="shrink-0 h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
          >
            Mở trên CRM →
          </Link>
        )}
      </div>

      <div className="p-4 space-y-4">
        {taskSections.length > 0 && (
          <div className="space-y-4">
            {taskSections.map((stage) => (
              <div key={stage.stageSlug} className="border border-violet-100 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-violet-50 to-slate-50 px-3 py-2 border-b border-violet-100 flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-700">{stage.stageLabel}</p>
                  <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full">{stage.fileCount} file</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {stage.tasks.map((task) => (
                    <div key={task.taskKey}>
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Nhiệm vụ</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-gray-900 leading-snug">{task.taskTitle}</span>
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                            📎 {task.checklistGroups.reduce((n, g) => n + g.docs.length, 0)} file
                          </span>
                        </div>
                      </div>
                      {task.checklistGroups.map((ckGroup) => (
                        <div key={`${task.taskKey}-${ckGroup.checklistId}`}>
                          {ckGroup.checklistTitle && (
                            <div className="bg-emerald-50/80 px-4 py-2 border-b border-emerald-100 border-l-4 border-l-emerald-500">
                              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Checklist</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-emerald-950 leading-snug">{ckGroup.checklistTitle}</span>
                                <span className="text-[10px] text-emerald-700 font-medium">{ckGroup.docs.length} mục</span>
                              </div>
                            </div>
                          )}
                          <div className="divide-y divide-gray-50 bg-white">
                            {ckGroup.docs.map((doc) => (
                              <div key={doc.id} className="px-3 py-1">
                                <DocRow
                                  doc={doc}
                                  crmPresentation
                                  nested
                                  workshopModule={workshopModule}
                                  onVisibilitySaved={onVisibilitySaved}
                                  onDelete={onDeleteDocument && canManageDeal ? () => onDeleteDocument(doc) : undefined}
                                  stageSlugLabelMap={stageSlugLabelMap}
                                  taskMetaMap={taskMetaMap}
                                  onOpenImage={onOpenImage}
                                  canManageDeal={canManageDeal}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {manualDocs.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">
              📄 Tài liệu thêm trên deal ({manualDocs.length})
            </p>
            <div className="space-y-2">
              {manualDocs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  crmPresentation
                  workshopModule={workshopModule}
                  onVisibilitySaved={onVisibilitySaved}
                  onDelete={onDeleteDocument && canManageDeal ? () => onDeleteDocument(doc) : undefined}
                  stageSlugLabelMap={stageSlugLabelMap}
                  taskMetaMap={taskMetaMap}
                  onOpenImage={onOpenImage}
                  canManageDeal={canManageDeal}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileDownloadButton({ rawRef, fileName, className = 'hover:underline text-xs text-emerald-600 cursor-pointer' }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          await downloadUploadFile(rawRef, fileName || 'tai-lieu');
        } catch (err) {
          alert(err?.message || 'Không tải được file');
        }
        setBusy(false);
      }}
    >
      {busy ? '...' : 'Tải'}
    </button>
  );
}

/** File đính kèm nhiệm vụ — xem ảnh inline, không cần tải */
function TaskFileRow({
  file,
  onOpenImage,
  projectId = null,
  enableShareToCrm = false,
  onShareToCrmSaved = null,
  onDelete = null,
  canManageDeal = false,
}) {
  const [showCrmShare, setShowCrmShare] = useState(false);
  const [sharedToCrm, setSharedToCrm] = useState(file.shared_to_crm === true);
  const [savingCrmShare, setSavingCrmShare] = useState(false);
  const isSharedToCrm = file.shared_to_crm === true;
  const canShareCrm = enableShareToCrm && projectId && file.id && onShareToCrmSaved && canManageDeal;

  const rawRef = file.file_url || '';
  const href = rawRef ? pubUrl(rawRef) : '';
  const isImage = href && isUploadImageFile(file.mime_type, file.file_name || rawRef);
  const canDownload = !!href;

  const openImage = () => {
    if (onOpenImage) onOpenImage(rawRef);
  };

  const saveCrmShare = async () => {
    if (!projectId || !file.id) return;
    setSavingCrmShare(true);
    try {
      await api.put(`/projects/${projectId}/documents/${file.id}/share-crm`, {
        shared_to_crm: !!sharedToCrm,
      });
      setShowCrmShare(false);
      onShareToCrmSaved?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSavingCrmShare(false);
  };

  return (
    <div className="bg-gray-50 border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm shrink-0">{getFileIcon(file.file_name)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{file.file_name}</p>
          {file.task?.title && <p className="text-[10px] text-purple-600 truncate">📌 {file.task.title}</p>}
          {canShareCrm && isSharedToCrm && (
            <span className="text-[9px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">📤 CRM</span>
          )}
        </div>
        {canShareCrm && (
          <button
            type="button"
            onClick={() => { setSharedToCrm(isSharedToCrm); setShowCrmShare(true); }}
            className={`shrink-0 h-7 px-2 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
              isSharedToCrm ? 'bg-violet-100 text-violet-800' : 'bg-white border border-violet-200 text-violet-700'
            }`}
          >
            {isSharedToCrm ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {isSharedToCrm ? 'CRM ✓' : 'Chia sẻ CRM'}
          </button>
        )}
        {href && (
          <div className="shrink-0 flex items-center gap-2">
            {isImage ? (
              <button type="button" onClick={openImage} className="text-[10px] text-blue-600 hover:underline cursor-pointer">Phóng to</button>
            ) : href ? (
              <FilePreviewOpenLink
                fileUrl={rawRef}
                fileName={file.file_name}
                mimeType={file.mime_type}
                className="text-[10px] text-blue-600 hover:underline cursor-pointer"
              >
                Xem
              </FilePreviewOpenLink>
            ) : null}
            {isImage && rawRef && (
              <button
                type="button"
                onClick={() => {
                  printUploadImage(rawRef, file.file_name || 'Ảnh').catch((err) => {
                    alert(err?.message || 'Không in được ảnh');
                  });
                }}
                className="text-[10px] text-violet-600 hover:underline cursor-pointer"
              >
                In
              </button>
            )}
            {canDownload && (
              <FileDownloadButton
                rawRef={rawRef}
                fileName={file.file_name || 'tai-lieu'}
                className="text-[10px] text-emerald-600 hover:underline cursor-pointer"
              />
            )}
            {onDelete && canManageDeal ? (
              <button
                type="button"
                onClick={() => void onDelete()}
                className="p-1 hover:bg-red-100 text-red-500 rounded cursor-pointer"
                title="Xóa file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>
      {isImage && href && (
        <div className="px-3 pb-2">
          <button type="button" onClick={openImage} className="block text-left">
            <img src={href} alt={file.file_name || ''} loading="lazy"
              className="max-h-28 rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
          </button>
        </div>
      )}

      {showCrmShare && canShareCrm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => !savingCrmShare && setShowCrmShare(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">Chia sẻ sang CRM</p>
            <p className="text-xs text-gray-500">Bên đặt hàng (Bếp / CRM) sẽ thấy file này trên tab Tài liệu deal.</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sharedToCrm} onChange={(e) => setSharedToCrm(e.target.checked)} />
              Cho CRM xem tài liệu xưởng
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => setShowCrmShare(false)} disabled={savingCrmShare}>Hủy</button>
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60" onClick={saveCrmShare} disabled={savingCrmShare}>{savingCrmShare ? '…' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Row tài liệu — rich preview như CRM DocumentRow; crmVisibility = chia sẻ từ lead_documents */
function DocRow({
  doc, onDelete, workshopModule, onVisibilitySaved, crmPresentation = false, nested = false,
  stageSlugLabelMap = {}, taskMetaMap = {}, onOpenImage, workshopProjectId = null, onShareToCrmSaved = null,
  enableShareToCrm = false, canManageDeal = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showVis, setShowVis] = useState(false);
  const [showCrmShare, setShowCrmShare] = useState(false);
  const [sharedToWorkshop, setSharedToWorkshop] = useState(!!doc.shared_to_workshop);
  const [sharedToCrm, setSharedToCrm] = useState(!!doc.shared_to_crm);
  const [allowedMods, setAllowedMods] = useState(() => parseShareModules(doc.allowed_share_modules) || []);
  const [savingVis, setSavingVis] = useState(false);
  const [savingCrmShare, setSavingCrmShare] = useState(false);

  const typeInfo = CRM_DOC_TYPES.find((t) => t.value === doc.doc_type) || CRM_DOC_TYPES[5];
  const fileName = doc.file_name || doc.file_path?.split('/').pop() || '';
  const displayTitle = crmPresentation
    ? resolveCrmDocDisplayTitle(doc, { preferFileName: nested })
    : (fileName || doc.name || 'Tài liệu');
  const rawFileRef = doc.file_url || doc.file_path || '';
  const fileHref = rawFileRef ? pubUrl(rawFileRef) : '';
  const isFile = !!fileHref;
  const mime = doc.mime_type || '';
  const isImage = isFile && isUploadImageFile(mime, fileName || doc.file_url || doc.file_path || '');
  const isVideo = isFile && (mime.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(fileName || doc.file_url || ''));
  const hasExtra = doc.notes || isImage || isVideo;
  const canManage = canManageDeal;
  const crmShareUi = typeof doc.shared_to_workshop === 'boolean' && doc.id && onVisibilitySaved && canManage;
  const workshopCrmShareUi = enableShareToCrm && doc.id && workshopProjectId && onShareToCrmSaved && canManage;
  const isSharedToCrm = doc.shared_to_crm === true;
  const showCrmMeta = crmPresentation || crmShareUi;
  const resolvedStageBadge = doc.crm_stage_slug || doc.crm_stage_group_label
    ? resolveCrmPipelineStageLabel(doc.crm_stage_slug || doc.crm_stage_group_label, {
      slugLabelMap: stageSlugLabelMap,
      taskMetaMap,
      staticLabels: CRM_STAGE_LABELS,
    })
    : null;
  const showStageBadge = showCrmMeta && resolvedStageBadge && !nested && resolvedStageBadge !== '📋 Khác';
  const visibleHere =
    !workshopModule || isLeadDocVisibleInModule(doc, workshopModule);

  const openVis = () => {
    setSharedToWorkshop(!!doc.shared_to_workshop);
    setAllowedMods(parseShareModules(doc.allowed_share_modules) || []);
    setShowVis(true);
  };

  const saveVis = async () => {
    setSavingVis(true);
    try {
      await api.put(`/crm/documents/${doc.id}/visibility`, {
        allowed_companies: doc.allowed_companies ?? null,
        allowed_departments: doc.allowed_departments ?? null,
        shared_to_workshop: !!sharedToWorkshop,
        allowed_share_modules: sharedToWorkshop ? cleanShareModulesForApi(allowedMods) : null,
      });
      setShowVis(false);
      onVisibilitySaved?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSavingVis(false);
  };

  const openCrmShare = () => {
    setSharedToCrm(isSharedToCrm);
    setShowCrmShare(true);
  };

  const saveCrmShare = async () => {
    if (!workshopProjectId) return;
    setSavingCrmShare(true);
    try {
      await api.put(`/projects/${workshopProjectId}/documents/${doc.id}/share-crm`, {
        shared_to_crm: !!sharedToCrm,
      });
      setShowCrmShare(false);
      onShareToCrmSaved?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSavingCrmShare(false);
  };

  return (
    <div className={nested ? 'border-b border-gray-50 last:border-b-0' : 'bg-gray-50 rounded-lg border overflow-hidden'}>
      <div className={`flex items-center justify-between ${nested ? 'py-2' : 'p-3'}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => hasExtra && setExpanded(!expanded)}>
          <span className="text-lg shrink-0">{isVideo ? '🎬' : (showCrmMeta ? typeInfo.icon : getFileIcon(fileName || displayTitle))}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{displayTitle}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {showCrmMeta ? (
                <span className="text-xs text-gray-500">
                  {typeInfo.label}
                  {isFile && fileName && displayTitle !== fileName ? ` · ${fileName}` : !isFile ? ' · Văn bản' : ''}
                  {isImage ? ' · 🖼️' : ''}
                  {isVideo ? ' · 🎬' : ''}
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {isFile ? (isImage ? '🖼️ Ảnh' : isVideo ? '🎬 Video' : '📄 File') : '⚠️ Thiếu URL file'}
                </span>
              )}
              {doc.file_size > 0 && <span className="text-[10px] text-gray-400">{doc.file_size > 1048576 ? `${(doc.file_size/1048576).toFixed(1)} MB` : `${(doc.file_size/1024).toFixed(1)} KB`}</span>}
              {doc.created_at && <span className="text-[10px] text-gray-400">{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>}
              {(doc.uploader?.full_name || doc.creator?.full_name) && <span className="text-[10px] text-gray-400">· {doc.uploader?.full_name || doc.creator?.full_name}</span>}
              {showCrmMeta && isCrmDocFromTask(doc) && !nested && (
                <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">📌 Từ nhiệm vụ</span>
              )}
              {showStageBadge && (
                <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{resolvedStageBadge}</span>
              )}
              {crmShareUi && doc.shared_to_workshop && (
                <span className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">🧩 {shareModuleLabels(doc.allowed_share_modules)}</span>
              )}
              {crmShareUi && workshopModule && !visibleHere && (
                <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">Ẩn ở module này</span>
              )}
              {workshopCrmShareUi && isSharedToCrm && (
                <span className="text-[9px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">📤 Đã chia sẻ CRM</span>
              )}
            </div>
          </div>
          {isFile && fileHref && (
            <div
              className={`flex items-center gap-2 shrink-0 ${nested ? 'px-1' : 'px-2'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {isImage ? (
                  <button
                    type="button"
                    onClick={() => onOpenImage?.(rawFileRef)}
                    className={`hover:underline ${nested ? 'text-[10px]' : 'text-xs'} text-blue-600 cursor-pointer`}
                  >
                    Phóng to
                  </button>
                ) : fileHref ? (
                  <FilePreviewOpenLink
                    fileUrl={rawFileRef}
                    fileName={fileName || displayTitle}
                    mimeType={mime}
                    className={`hover:underline ${nested ? 'text-[10px]' : 'text-xs'} text-blue-600 cursor-pointer`}
                  >
                    Xem
                  </FilePreviewOpenLink>
                ) : null}
              {isImage && rawFileRef && (
                <button
                  type="button"
                  onClick={() => {
                    printUploadImage(rawFileRef, fileName || displayTitle || 'Ảnh').catch((err) => {
                      alert(err?.message || 'Không in được ảnh');
                    });
                  }}
                  className={`hover:underline ${nested ? 'text-[10px]' : 'text-xs'} text-violet-600 cursor-pointer`}
                >
                  In
                </button>
              )}
              <FileDownloadButton
                rawRef={rawFileRef}
                fileName={fileName || displayTitle || 'tai-lieu'}
                className={`hover:underline ${nested ? 'text-[10px]' : 'text-xs'} text-emerald-600 cursor-pointer`}
              />
            </div>
          )}
          {hasExtra && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        <div className="flex items-center shrink-0">
          {workshopCrmShareUi && (
            <button
              type="button"
              title={isSharedToCrm ? 'Đang chia sẻ CRM — click để đổi' : 'Chia sẻ sang CRM (bên đặt hàng / Bếp)'}
              onClick={(e) => { e.stopPropagation(); openCrmShare(); }}
              className={`ml-1 h-7 px-2 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0 ${
                isSharedToCrm
                  ? 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                  : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50'
              }`}
            >
              {isSharedToCrm ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {isSharedToCrm ? 'CRM ✓' : 'Chia sẻ CRM'}
            </button>
          )}
          {crmShareUi && (
            <button
              type="button"
              title="Chia sẻ module SX / VC / CV — ai được xem"
              onClick={(e) => { e.stopPropagation(); openVis(); }}
              className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
            >
              ⚙️
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              title="Xóa tài liệu"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {isVideo && (
        <div className={`px-3 ${expanded ? 'pb-3' : 'pb-2'}`}>
          <video src={fileHref} controls preload="metadata" className={`w-full rounded-lg border border-gray-200 bg-black shadow-sm ${expanded ? 'max-h-96' : 'max-h-40'}`} />
        </div>
      )}
      {isImage && !expanded && fileHref && (
        <div className="px-3 pb-2">
          <button type="button" onClick={() => onOpenImage?.(rawFileRef)} className="block text-left">
            <img src={fileHref} alt={displayTitle} loading="lazy"
              className="max-h-24 rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
          </button>
        </div>
      )}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {isImage && fileHref && (
            <button type="button" onClick={() => onOpenImage?.(rawFileRef)} className="block text-left">
              <img src={fileHref} alt={displayTitle} loading="lazy"
                className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90" />
            </button>
          )}
          {doc.notes && <div className="bg-white rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">{doc.notes}</div>}
        </div>
      )}

      {showVis && crmShareUi && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => !savingVis && setShowVis(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">Ai được xem tài liệu này?</p>
            <p className="text-xs text-gray-500">Chọn khối được xem (vd. chỉ Sản xuất — VC không thấy).</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sharedToWorkshop} onChange={(e) => setSharedToWorkshop(e.target.checked)} />
              Chia sẻ sang khối SX / VC / Công việc dự án
            </label>
            {sharedToWorkshop && (
              <DocumentShareModulePicker value={allowedMods} onChange={setAllowedMods} />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => setShowVis(false)} disabled={savingVis}>Hủy</button>
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60" onClick={saveVis} disabled={savingVis}>{savingVis ? '…' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}

      {showCrmShare && workshopCrmShareUi && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => !savingCrmShare && setShowCrmShare(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">Chia sẻ sang CRM</p>
            <p className="text-xs text-gray-500">
              Bên đặt hàng (Bếp / CRM) sẽ thấy tài liệu này trên tab <strong>Tài liệu</strong> của deal.
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sharedToCrm} onChange={(e) => setSharedToCrm(e.target.checked)} />
              Cho CRM xem tài liệu xưởng
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => setShowCrmShare(false)} disabled={savingCrmShare}>Hủy</button>
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60" onClick={saveCrmShare} disabled={savingCrmShare}>{savingCrmShare ? '…' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab Công việc khi chưa có deal CRM gắn `project_id`: hiển thị nhiệm vụ bảng `tasks` (pipeline workflow dự án). */
function WorkshopTasksFallbackPanel({ tasks, moduleLabel, onToggleDone, onEnsureCrmDeal, ensuringCrmDeal = false }) {
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      const label = t.stage?.name || t.stage?.slug || 'Khác';
      if (!m.has(label)) m.set(label, []);
      m.get(label).push(t);
    }
    return Array.from(m.entries());
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold text-amber-900">Đang xem nhiệm vụ xưởng (bảng dự án)</p>
        <p className="text-xs text-amber-800/95 mt-1 leading-relaxed">
          Dự án này chưa có deal CRM nào được gắn <span className="font-mono bg-amber-100/90 px-1 rounded">project_id</span> — không tải được
          pipeline CRM (nhiệm vụ <span className="font-mono">sx_*</span> trên deal). Các dòng dưới là nhiệm vụ trên dự án (quy trình {moduleLabel}).
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => onEnsureCrmDeal?.()}
            disabled={!onEnsureCrmDeal || ensuringCrmDeal}
            className="h-8 px-3 rounded-lg bg-amber-900 text-amber-50 text-xs font-semibold hover:bg-amber-950 disabled:opacity-60"
            title="Tạo deal CRM gắn project_id và gen nhiệm vụ sx_*"
          >
            {ensuringCrmDeal ? 'Đang quét…' : 'Bổ sung thiếu SX'}
          </button>
          <p className="text-[11px] text-amber-900/80">
            Tạo deal CRM gắn dự án (nếu chưa có) và bổ sung nhiệm vụ sx_* thiếu theo bộ mẫu xưởng.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map(([stageLabel, rows]) => (
          <div key={stageLabel}>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{stageLabel}</p>
            <ul className="space-y-2">
              {rows.map((task) => {
                const done = task.status === 'done';
                const Icon = done ? CheckCircle2 : Circle;
                return (
                  <li
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleDone?.(task)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-teal-600 cursor-pointer"
                      title={done ? 'Đánh dấu chưa xong' : 'Hoàn thành'}
                    >
                      <Icon className={`h-4 w-4 ${done ? 'text-teal-600' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {task.title || '—'}
                      </p>
                      {task.assignee?.full_name && (
                        <p className="text-[11px] text-gray-500 mt-0.5">👤 {task.assignee.full_name}</p>
                      )}
                      {task.due_date && (
                        <p className="text-[11px] text-amber-900 mt-0.5">
                          ⏰ Hạn: {new Date(task.due_date).toLocaleString('vi-VN')}
                        </p>
                      )}
                      {task.metadata?.workshop_template_id && !task.due_date && !done && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Chưa có ngày hẹn — nhân viên tự đặt trên nhiệm vụ.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductionDetail({ moduleKey = 'sx' }) {
  // moduleKey = 'sx' (sản xuất) | 'vc' (vận chuyển)
  const MOD = moduleKey === 'vc'
    ? { apiPrefix: '/logistics', routePrefix: '/vc', label: 'Vận chuyển', icon: '🚚', stageField: 'vc_kanban_column_id', stagesKey: 'vcKanbanStages' }
    : { apiPrefix: '/production', routePrefix: '/sx', label: 'Sản xuất', icon: '🏭', stageField: 'sx_kanban_column_id', stagesKey: 'sxKanbanStages' };
  const isVC = moduleKey === 'vc';

  const { id } = useParams();
  const navigate = useNavigate();
  const goToDashboard = () => {
    if (id) markWorkshopPipelineCardFocus(id, moduleKey === 'vc' ? 'vc' : 'sx');
    navigate(`${MOD.routePrefix}/dashboard`);
  };
  const { socket, user } = useAuth();
  const { setCrmNotesAnchor } = useCrmNotesFab();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fallbackDealIdForTasks, setFallbackDealIdForTasks] = useState(null);
  /** Map crm_tasks.id → { title, stage_slug, order_index } — sắp xếp tài liệu theo nhiệm vụ */
  const [crmTaskMetaMap, setCrmTaskMetaMap] = useState({});
  /** stage_slug (kể cả pl_* uuid) → tên cột pipeline CRM */
  const [crmStageSlugLabelMap, setCrmStageSlugLabelMap] = useState({});
  const [ensuringCrmDeal, setEnsuringCrmDeal] = useState(false);
  const tabFromUrl = searchParams.get('tab');
  const normalizedUrlTab = LEGACY_TAB_MAP[tabFromUrl] || tabFromUrl;
  const tabAllowed = (t) => {
    if (!DEAL_TAB_KEYS.has(t)) return false;
    if (moduleKey === 'vc' && (t === 'approvals' || t === 'procurement')) return false;
    return true;
  };
  const [activeTab, setActiveTab] = useState(
    tabAllowed(normalizedUrlTab) ? normalizedUrlTab : 'tasks',
  );
  const vcSubTab = useMemo(() => {
    if (!isVC) return null;
    const raw = String(searchParams.get('vcTab') || '').toLowerCase();
    return raw === 'install' ? 'install' : raw === 'shipping' ? 'shipping' : null;
  }, [isVC, searchParams]);

  // Chỉ tính nhiệm vụ đúng khu SX hoặc VC; khi có vcTab thì tách LĐ / VC.
  const pickWorkshopTasksForSummary = useCallback(
    (list) =>
      (Array.isArray(list) ? list : []).filter((t) => {
        if (!taskBelongsToWorkshopModule(t, isVC ? 'vc' : 'sx')) return false;
        if (isVC && vcSubTab) return taskBelongsToVcSubTab(t, vcSubTab);
        return true;
      }),
    [isVC, vcSubTab],
  );
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmActivities, setCrmActivities] = useState([]);
  const [crmDealDocs, setCrmDealDocs] = useState([]);
  const [productionTaskSummary, setProductionTaskSummary] = useState({ total: 0, completed: 0, percent: 0 });
  /** Nhiệm vụ trên deal CRM (crm_tasks) — khớp tab CRMTasksTab khi có deal gắn dự án */
  const [crmDealTaskSummary, setCrmDealTaskSummary] = useState({ total: 0, completed: 0, percent: 0 });
  /** Danh sách thô từ GET /tasks?project_id= — dùng khi không có deal CRM để vẫn hiển thị nhiệm vụ xưởng */
  const [workshopTasksForProject, setWorkshopTasksForProject] = useState([]);
  const [savingProductionOwner, setSavingProductionOwner] = useState(false);
  const [vcTeams, setVcTeams] = useState([]);
  const [savingTeamAssign, setSavingTeamAssign] = useState(false);
  const [showAddCrmActivity, setShowAddCrmActivity] = useState(false);
  const [crmActivityForm, setCrmActivityForm] = useState({
    type: 'note', title: '', description: '', outcome: '',
  });
  const [savingCrmActivity, setSavingCrmActivity] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]); // production-native documents
  const [driveFileCount, setDriveFileCount] = useState(0);
  const [taskFiles, setTaskFiles] = useState([]); // task file attachments
  const [projectActivities, setProjectActivities] = useState([]); // production-native activities
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'note', title: '', description: '', outcome: '' });
  const [savingActivity, setSavingActivity] = useState(false);
  const [showAddTextDoc, setShowAddTextDoc] = useState(false);
  const [textDocForm, setTextDocForm] = useState({ name: '', notes: '' });

  // Title inline editing — same pattern as LeadDetail
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Production pipeline stages (loaded from API)
  const [productionStages, setProductionStages] = useState([]);
  const [handoverModal, setHandoverModal] = useState(null); // { projectId, projectName, targetSxStageId }
  // Modal cảnh báo task chặn chuyển giai đoạn (parity CRM) — bật khi PATCH /stage trả 400 code: SX_BLOCKING_TASKS_INCOMPLETE.
  const [blockingTasksModal, setBlockingTasksModal] = useState(null);
  const [deadlineCtx, setDeadlineCtx] = useState(null);
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [handoverLogisticsCompanyId, setHandoverLogisticsCompanyId] = useState('');
  const [handoverCompanies, setHandoverCompanies] = useState([]);
  const [handoverErr, setHandoverErr] = useState('');
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [switchWorkshopModal, setSwitchWorkshopModal] = useState(null);
  const [switchWorkshopSaving, setSwitchWorkshopSaving] = useState(false);

  // Document upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [downloadingDocsZip, setDownloadingDocsZip] = useState(false);

  // Incidents
  const [incidents, setIncidents] = useState([]);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ title: '', description: '', severity: 'medium' });
  const [savingIncident, setSavingIncident] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [memberModuleCounts, setMemberModuleCounts] = useState({ crm: 0, production: 0, logistics: 0, total: 0 });
  const [docLightboxIndex, setDocLightboxIndex] = useState(null);
  const [docLightboxOverride, setDocLightboxOverride] = useState(null);

  const dealIdForCommentCount = project
    ? (resolveSxProjectLeadId({
      crm_lead_id: project.crm_lead_id,
      crm_deals: project.crmDeals || project.crm_deals,
    }) || fallbackDealIdForTasks)
    : null;

  useEffect(() => {
    if (dealIdForCommentCount) {
      api.get(`/crm/lead-comments/index?lead_ids=${dealIdForCommentCount}`)
        .then((r) => {
          const meta = r.data?.[dealIdForCommentCount] || r.data?.[String(dealIdForCommentCount)];
          setCommentCount(meta?.count || 0);
        })
        .catch(() => setCommentCount(0));
      return;
    }
    if (!project?.id) return;
    api.get(`/projects/comments/index?project_ids=${project.id}`)
      .then((r) => {
        const meta = r.data?.[project.id] || r.data?.[String(project.id)];
        setCommentCount(meta?.count || 0);
      })
      .catch(() => setCommentCount(0));
  }, [project?.id, dealIdForCommentCount]);

  useEffect(() => {
    if (!dealIdForCommentCount) {
      setMemberModuleCounts({ crm: 0, production: 0, logistics: 0, total: 0 });
      return;
    }
    let cancelled = false;
    api.get(`/crm/leads/${dealIdForCommentCount}/members`)
      .then((r) => {
        if (cancelled) return;
        setMemberModuleCounts(countMembersByModule(r.data || []));
      })
      .catch(() => {
        if (!cancelled) setMemberModuleCounts({ crm: 0, production: 0, logistics: 0, total: 0 });
      });
    return () => { cancelled = true; };
  }, [dealIdForCommentCount]);

  const noteActivities = useMemo(
    () => (crmActivities || []).filter((a) => a.type === 'note'),
    [crmActivities],
  );

  const workshopShareMod = moduleKey === 'vc' ? 'logistics' : 'production';

  /** Chỉ hiện hoạt động đã chia sẻ, đúng module và phân quyền xem công ty/PB */
  const sharedActivities = useMemo(
    () => (crmActivities || []).filter(
      (a) => a.shared_to_workshop === true
        && isCrmSharedArtifactVisibleInModule(a, workshopShareMod)
        && canViewerSeeByCompanyAndDept(a, user),
    ),
    [crmActivities, workshopShareMod, user],
  );

  const sharedNotes = useMemo(
    () => sharedActivities.filter((a) => a.type === 'note'),
    [sharedActivities],
  );

  const visibleCrmSharedDocs = useMemo(
    () => (project?.sharedDocuments || []).filter(
      (d) => isLeadDocVisibleInModule(d, workshopShareMod) && canViewerSeeByCompanyAndDept(d, user),
    ),
    [project?.sharedDocuments, workshopShareMod, user],
  );

  const docImageGallery = useMemo(
    () => collectUploadLightboxItems([
      ...(visibleCrmSharedDocs || []),
      ...(projectDocs || []),
      ...(taskFiles || []),
    ]),
    [visibleCrmSharedDocs, projectDocs, taskFiles],
  );

  const activeDocImageGallery = docLightboxOverride || docImageGallery;

  const openDocImage = useCallback((rawPath) => {
    const path = String(rawPath || '').trim();
    if (!path) return;
    const idx = findUploadLightboxIndex(docImageGallery, path);
    if (idx >= 0) {
      setDocLightboxOverride(null);
      setDocLightboxIndex(idx);
      return;
    }
    const item = buildUploadLightboxItem({ file_url: path, file_path: path });
    if (item) {
      setDocLightboxOverride([item]);
      setDocLightboxIndex(0);
    }
  }, [docImageGallery]);

  const closeDocLightbox = useCallback(() => {
    setDocLightboxIndex(null);
    setDocLightboxOverride(null);
  }, []);

  const crmDealIdForDocs = project?.crmDeals?.[0]?.id || fallbackDealIdForTasks;

  useEffect(() => {
    if (!crmDealIdForDocs) {
      setCrmTaskMetaMap({});
      setCrmStageSlugLabelMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, leadRes] = await Promise.all([
          api.get(`/crm/leads/${crmDealIdForDocs}/tasks`, { params: { task_scope: 'all' } }),
          api.get(`/crm/leads/${crmDealIdForDocs}`).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
        let pipelineStages = [];
        const pipelineId = leadRes.data?.pipeline_id;
        if (pipelineId) {
          const { stages } = await fetchPipelineStagesById(pipelineId);
          pipelineStages = stages || [];
        }
        const stageOrderById = new Map(
          pipelineStages.map((s) => [String(s.id), s.order_index ?? 999]),
        );
        const map = {};
        tasks.forEach((t, idx) => {
          map[t.id] = {
            title: t.title,
            stage_slug: t.stage_slug,
            stage_name: t.pipeline_stage?.name || null,
            stage_order_index: t.pipeline_stage_id
              ? stageOrderById.get(String(t.pipeline_stage_id))
              : undefined,
            order_index: t.order_index ?? idx,
            checklist: normalizeCrmChecklist(t.checklist),
          };
        });
        setCrmTaskMetaMap(map);
        setCrmStageSlugLabelMap(buildCrmStageSlugLabelMapFromTasks(tasks, pipelineStages));
      } catch {
        if (!cancelled) {
          setCrmTaskMetaMap({});
          setCrmStageSlugLabelMap({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [crmDealIdForDocs]);

  const refreshCrmActivities = useCallback(async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) return;
    try {
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(Array.isArray(data) ? data : []);
    } catch (_) {
      /* giữ danh sách cũ */
    }
  }, [project?.crmDeals?.[0]?.id]);

  const crmFabDealId = project?.crmDeals?.[0]?.id;

  useEffect(() => {
    if (loadError || loading || !project || !crmFabDealId) return;
    const deal = project.crmDeals?.[0];
    if (!deal || String(deal.id) !== String(crmFabDealId)) return;
    setCrmNotesAnchor({
      leadId: crmFabDealId,
      notes: noteActivities,
      contextLine: `🎯 Deal ${[deal.code, deal.title].filter(Boolean).join(' — ')}`,
      contextBadge: deal?.code || project?.code || '',
      onPosted: refreshCrmActivities,
    });
  }, [
    loadError,
    loading,
    project,
    crmFabDealId,
    noteActivities,
    refreshCrmActivities,
    setCrmNotesAnchor,
  ]);

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (tab === 'tasks') p.delete('tab');
      else p.set('tab', tab);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    const crmTask = searchParams.get('crm_task');
    if (!t && crmTask) {
      setActiveTab('tasks');
      return;
    }
    if (!t) return;
    const next = LEGACY_TAB_MAP[t] || t;
    if (!tabAllowed(next)) {
      setActiveTab('tasks');
      const p = new URLSearchParams(searchParams);
      p.delete('tab');
      setSearchParams(p, { replace: true });
      return;
    }
    setActiveTab(next);
    if (next !== t) {
      const p = new URLSearchParams(searchParams);
      if (next === 'tasks') p.delete('tab');
      else p.set('tab', next);
      setSearchParams(p, { replace: true });
    }
  }, [id, searchParams, moduleKey, setSearchParams]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const entityType = moduleKey === 'vc' ? 'vc_project' : 'production_project';
    driveLinksCountByEntity(entityType, id)
      .then((count) => { if (!cancelled) setDriveFileCount(count); })
      .catch(() => { if (!cancelled) setDriveFileCount(0); });
    return () => { cancelled = true; };
  }, [id, moduleKey]);

  useEffect(() => {
    let cancelled = false;
    const cid = moduleKey === 'vc'
      ? (project?.logistics_company_id || project?.logistics_company?.id || project?.company_id || project?.company?.id || '')
      : (project?.company_id || project?.company?.id || '');
    const forModule = moduleKey === 'vc' ? 'logistics' : 'production';
    api.get('/crm/employees-by-company', {
      params: {
        ...(cid ? { company_id: cid } : {}),
        for_module: forModule,
      },
    }).then((r) => {
      const u = r.data?.users || r.data || [];
      if (!cancelled) setAllUsers(Array.isArray(u) ? u : []);
    }).catch(() => {
      api.get('/users').then((r) => {
        const u = r.data?.users || r.data || [];
        if (!cancelled) setAllUsers(Array.isArray(u) ? u : []);
      }).catch(() => {});
    });
    // Load VC teams (chỉ cần cho module VC)
    if (moduleKey === 'vc') {
      api.get('/workshop-teams').then((r) => {
        if (cancelled) return;
        const rows = r.data?.teams || r.data || [];
        setVcTeams(Array.isArray(rows) ? rows : []);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [moduleKey, project?.company_id, project?.company?.id, project?.logistics_company_id, project?.logistics_company?.id]);

  useEffect(() => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) {
      setCrmUsers([]);
      setCrmActivities([]);
      setCrmDealDocs([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, actRes, docRes] = await Promise.all([
          api.get('/crm/employees-by-company', {
            params: {
              ...(project?.company_id ? { company_id: project.company_id } : {}),
              for_module: 'crm',
            },
          }).then((r) => r.data?.users || r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/activities`).then((r) => r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/documents`).then((r) => r.data || []).catch(() => []),
        ]);
        if (!cancelled) {
          setCrmUsers(Array.isArray(usersRes) ? usersRes : []);
          setCrmActivities(Array.isArray(actRes) ? actRes : []);
          setCrmDealDocs(Array.isArray(docRes) ? docRes : []);
        }
      } catch (_) {
        if (!cancelled) {
          setCrmUsers([]);
          setCrmActivities([]);
          setCrmDealDocs([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [project?.crmDeals?.[0]?.id, project?.company_id]);

  /**
   * Pipeline SX/VC theo công ty dự án + phân loại (workshop_type_id).
   * GET /projects/:id đã trả sxKanbanStages / vcKanbanStages — chỉ fetch thêm khi thiếu.
   * VC: ưu tiên logistics_company_id (công ty vận chuyển).
   */
  useEffect(() => {
    const embedded = project?.[MOD.stagesKey];
    if (Array.isArray(embedded) && embedded.length) return undefined;
    const cid = moduleKey === 'vc'
      ? (project?.logistics_company_id || project?.logistics_company?.id || project?.company_id || project?.company?.id)
      : (project?.company_id || project?.company?.id);
    if (!cid) return undefined;
    const wtId = project?.workshop_type_id || project?.workshop_type?.id || null;
    const params = { company_id: cid };
    if (wtId && moduleKey !== 'vc') params.workshop_type_id = wtId;
    let cancelled = false;
    api.get(`${MOD.apiPrefix}/pipeline-stages`, { params }).then((r) => {
      if (cancelled) return;
      const rows = r.data || [];
      setProductionStages(rows.length ? rows : []);
    }).catch(() => { if (!cancelled) setProductionStages([]); });
    return () => { cancelled = true; };
  }, [MOD.apiPrefix, MOD.stagesKey, moduleKey, project?.company_id, project?.company?.id, project?.logistics_company_id, project?.logistics_company?.id, project?.workshop_type_id, project?.workshop_type?.id, project?.[MOD.stagesKey]]);

  const loadProjectDocs = useCallback(async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      setProjectDocs(data?.documents || []);
    } catch (_) { setProjectDocs([]); }
  }, []);

  const loadTaskFiles = useCallback(async (projectId) => {
    try {
      const forModule = moduleKey === 'vc' ? 'logistics' : 'production';
      const { data } = await api.get(`/projects/${projectId}/task-files`, { params: { for_module: forModule } });
      setTaskFiles(data?.taskFiles || []);
    } catch (_) { setTaskFiles([]); }
  }, [moduleKey]);

  const loadProjectActivities = useCallback(async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/activities`);
      setProjectActivities(data?.activities || []);
    } catch (_) { setProjectActivities([]); }
  }, []);

  const summarizeCrmTasks = useCallback((list) => {
    const rows = Array.isArray(list) ? list : [];
    const total = rows.length;
    const completed = rows.filter((t) => t.status === 'completed').length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, []);

  const fetchCrmDealTaskSummary = useCallback(async (dealId) => {
    if (!dealId) {
      setCrmDealTaskSummary({ total: 0, completed: 0, percent: 0 });
      return;
    }
    try {
      const taskScope = moduleKey === 'vc' ? 'logistics' : 'production';
      const ownerCompanyId = moduleKey === 'vc'
        ? (project?.logistics_company_id || project?.logistics_company?.id || project?.company_id || project?.company?.id || null)
        : (project?.company_id || project?.company?.id || null);
      const { data } = await api.get(`/crm/leads/${dealId}/tasks`, {
        params: {
          task_scope: taskScope,
          task_company_scope: 'own',
          ...(ownerCompanyId ? { owner_company_id: ownerCompanyId } : {}),
        },
      });
      setCrmDealTaskSummary(summarizeCrmTasks(data));
    } catch {
      setCrmDealTaskSummary({ total: 0, completed: 0, percent: 0 });
    }
  }, [moduleKey, summarizeCrmTasks, project?.company_id, project?.company?.id, project?.logistics_company_id, project?.logistics_company?.id]);

  const handleCrmTaskSummaryChange = useCallback((summary) => {
    if (!summary || typeof summary.total !== 'number') return;
    setCrmDealTaskSummary(summary);
  }, []);

  useEffect(() => {
    setLoadError(null);
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const timeoutMs = 30_000;
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Timeout tải dự án — vui lòng thử lại')), timeoutMs);
    });
    try {
      const [projRes, tasksRes] = await Promise.race([
        Promise.all([
          api.get(`${MOD.apiPrefix}/projects/${id}`),
          api.get('/tasks', { params: { project_id: id } }).catch(() => ({ data: { tasks: [] } })),
        ]),
        timeout,
      ]);
      const proj = normalizeWorkshopProjectDetail(projRes.data?.project);
      if (proj?.id && String(proj.id) !== String(id)) {
        setLoading(false);
        navigate(`${MOD.routePrefix}/projects/${proj.id}`, { replace: true });
        return;
      }
      const list = tasksRes.data?.tasks || tasksRes.data || [];
      setWorkshopTasksForProject(Array.isArray(list) ? list : []);
      const scopedTasks = pickWorkshopTasksForSummary(list);
      const total = scopedTasks.length;
      const completed = scopedTasks.filter((t) => t.status === 'done').length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      setProductionTaskSummary({ total, completed, percent });
      setProject(proj ? { ...proj, productionTaskProgress: percent } : proj);
      if (Array.isArray(proj?.crmSharedNotes) && proj.crmSharedNotes.length) {
        setCrmActivities(proj.crmSharedNotes);
      }
      if (Array.isArray(proj?.[MOD.stagesKey]) && proj[MOD.stagesKey].length) {
        setProductionStages(proj[MOD.stagesKey]);
      }
      let dealIdForTasks = proj?.crmDeals?.[0]?.id || null;
      setFallbackDealIdForTasks(null);
      try {
        if (!dealIdForTasks && proj?.id) {
          // Fallback giống tab Đơn hàng: tìm deal đơn (fulfillment) theo orders của dự án để gen/hiển thị sx_*.
          const { data: ordData } = await api.get(`/projects/${proj.id}/orders`).catch(() => ({ data: null }));
          const orders = ordData?.orders || [];
          const fid = orders.find((o) => o?.fulfillment_lead_id)?.fulfillment_lead_id || null;
          if (fid) {
            dealIdForTasks = String(fid);
            setFallbackDealIdForTasks(dealIdForTasks);
          }
        }
      } catch (_) { /* ignore */ }
      await fetchCrmDealTaskSummary(dealIdForTasks);
      if (proj?.incidents) setIncidents(proj.incidents);
      loadProjectDocs(id);
      loadTaskFiles(id);
      loadProjectActivities(id);
    } catch (e) {
      console.error(e);
      const st = e.response?.status;
      const d = e.response?.data || {};

      if (st === 404) {
        if (d.reason === 'deal_without_project' && d.crm_lead_id) {
          setLoadError({
            kind: 'deal_without_project',
            crm_lead_id: d.crm_lead_id,
            title: d.title,
            hint: d.hint,
          });
          setLoading(false);
          return;
        }
        if (d.reason === 'broken_project_link') {
          setLoadError({
            kind: 'broken_project_link',
            hint: d.hint,
            project_id: d.project_id,
          });
          setLoading(false);
          return;
        }
        try {
          const { data: lead } = await api.get(`/crm/leads/${id}/detail`);
          if (lead?.project_id) {
            setLoading(false);
            navigate(`${MOD.routePrefix}/projects/${lead.project_id}`, { replace: true });
            return;
          }
          if (lead?.id) {
            setLoadError({
              kind: 'deal_without_project',
              crm_lead_id: lead.id,
              title: lead.title,
              hint: 'Deal chưa có dự án (project_id). Chuyển deal sang Thắng hoặc tạo dự án từ deal.',
            });
            setLoading(false);
            return;
          }
        } catch (_) {
          /* ignore */
        }
        setLoadError({
          kind: 'unknown',
          message: d.hint || d.error || 'Không tìm thấy dự án hoặc deal với id này.',
        });
      } else {
        setLoadError({ kind: 'other', message: d.error || e.message || 'Lỗi tải dữ liệu' });
      }
    }
    setLoading(false);
  };

  const refreshProjectSilently = useCallback(async () => {
    try {
      const [projRes, tasksRes] = await Promise.all([
        api.get(`${MOD.apiPrefix}/projects/${id}`),
        api.get('/tasks', { params: { project_id: id } }).catch(() => ({ data: { tasks: [] } })),
      ]);
      const proj = normalizeWorkshopProjectDetail(projRes.data?.project);
      const list = tasksRes.data?.tasks || tasksRes.data || [];
      setWorkshopTasksForProject(Array.isArray(list) ? list : []);
      const scopedTasks = pickWorkshopTasksForSummary(list);
      const total = scopedTasks.length;
      const completed = scopedTasks.filter((t) => t.status === 'done').length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      setProductionTaskSummary({ total, completed, percent });
      setProject(proj ? { ...proj, productionTaskProgress: percent } : proj);
      if (Array.isArray(proj?.crmSharedNotes) && proj.crmSharedNotes.length) {
        setCrmActivities(proj.crmSharedNotes);
      }
      if (Array.isArray(proj?.[MOD.stagesKey]) && proj[MOD.stagesKey].length) {
        setProductionStages(proj[MOD.stagesKey]);
      }
      const dealId = proj?.crmDeals?.[0]?.id || fallbackDealIdForTasks || null;
      await fetchCrmDealTaskSummary(dealId);
      loadProjectDocs(id);
      loadTaskFiles(id);
    } catch (_) {
      /* giữ state cũ */
    }
  }, [id, MOD.apiPrefix, MOD.stagesKey, pickWorkshopTasksForSummary, fallbackDealIdForTasks, fetchCrmDealTaskSummary, loadProjectDocs, loadTaskFiles]);

  /** Realtime: đồng bộ Kanban + nhiệm vụ CRM giữa web và mobile */
  useEffect(() => {
    if (!socket || !id) return undefined;
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshProjectSilently(), 650);
    };
    const onStage = (payload) => {
      const pid = payload?.id || payload?.project_id;
      if (pid && String(pid) !== String(id)) return;
      schedule();
    };
    const onTask = (payload) => {
      if (payload?.project_id && String(payload.project_id) === String(id)) schedule();
    };
    socket.on('project:stage_changed', onStage);
    socket.on('crm:task_changed', onTask);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('project:stage_changed', onStage);
      socket.off('crm:task_changed', onTask);
    };
  }, [socket, id, refreshProjectSilently]);

  useEffect(() => {
    if (!handoverModal) return;
    let cancelled = false;
    setHandoverErr('');
    setHandoverSaving(false);
    setHandoverLogisticsCompanyId('');
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.companies || r.data || [];
        setHandoverCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setHandoverCompanies([]); });
    return () => { cancelled = true; };
  }, [handoverModal]);

  const closeHandoverModal = useCallback(() => {
    setHandoverModal(null);
    setHandoverLogisticsCompanyId('');
    setHandoverCompanies([]);
    setHandoverErr('');
    setHandoverSaving(false);
  }, []);

  const confirmHandoverFromDetail = useCallback(async () => {
    if (!handoverModal?.projectId) return;
    if (!handoverLogisticsCompanyId) {
      setHandoverErr('Vui lòng chọn công ty Vận chuyển.');
      return;
    }
    setHandoverSaving(true);
    setHandoverErr('');
    try {
      const sxColId = handoverModal?.targetSxStageId ? String(handoverModal.targetSxStageId) : '';
      const targetCol = sxColId
        ? (productionStages || []).find((s) => String(s.id) === sxColId)
        : null;
      const sxStageMeta = buildSxPipelineStageMeta(targetCol);

      // Optimistic: ghim thẻ sang trạng thái VC ngay trên chi tiết
      setProject((prev) => (prev ? {
        ...prev,
        status: 'shipping',
        current_stage_id: null,
        current_stage: null,
        logistics_company_id: handoverLogisticsCompanyId,
        ...(sxColId ? {
          sx_kanban_column_id: sxColId,
          sx_pipeline_stage: sxStageMeta || prev.sx_pipeline_stage,
          sx_intake: false,
        } : {}),
      } : prev));

      await api.patch(`/production/projects/${handoverModal.projectId}/handover-vc`, {
        logistics_company_id: handoverLogisticsCompanyId,
        ...(sxColId ? { production_pipeline_stage_id: sxColId } : {}),
      });
      closeHandoverModal();
      window.setTimeout(() => { refreshProjectSilently(); }, 200);
    } catch (e) {
      setHandoverErr(e.response?.data?.error || e.message || 'Lỗi bàn giao VC');
      refreshProjectSilently();
    }
    setHandoverSaving(false);
  }, [handoverModal, handoverLogisticsCompanyId, closeHandoverModal, refreshProjectSilently, productionStages]);

  const confirmSwitchWorkshopFromDetail = useCallback(async () => {
    if (!switchWorkshopModal?.targetCol || !id || switchWorkshopSaving) return;
    setSwitchWorkshopSaving(true);
    try {
      const { data } = await api.patch(`/production/projects/${id}/switch-workshop-type`, {
        production_pipeline_stage_id: switchWorkshopModal.targetCol.id,
        current_sx_pipeline_stage_id: switchWorkshopModal.currentColId || null,
      });
      const updated = data?.project;
      setProject((prev) => (prev && updated ? {
        ...prev,
        workshop_type_id: updated.workshop_type_id ?? data?.to_workshop_type_id,
        workshop_type: updated.workshop_type ?? prev.workshop_type,
        sx_kanban_column_id: updated.sx_kanban_column_id ?? data?.pipeline_stage_id,
        sx_pipeline_stage: updated.sx_pipeline_stage ?? prev.sx_pipeline_stage,
        sx_intake: false,
        current_stage_id: updated.current_stage_id ?? prev.current_stage_id,
        current_stage: updated.current_stage ?? prev.current_stage,
        status: updated.status ?? prev.status,
      } : prev));
      setSwitchWorkshopModal(null);
      window.setTimeout(() => { refreshProjectSilently(); }, 200);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', { detail: { projectId: String(id) } }));
        }, 280);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi chuyển phân loại');
      refreshProjectSilently();
    }
    setSwitchWorkshopSaving(false);
  }, [switchWorkshopModal, switchWorkshopSaving, id, refreshProjectSilently]);

  const ensureCrmDealAndSxTasks = useCallback(async () => {
    if (ensuringCrmDeal || !id) return;
    setEnsuringCrmDeal(true);
    try {
      const { data } = await api.post(
        `/production/projects/${encodeURIComponent(id)}/tasks/ensure-missing-sx`,
        { all_stages: true },
      );
      if ((data.created || 0) > 0) {
        alert(`Đã bổ sung ${data.created} nhiệm vụ Sản xuất thiếu theo bộ mẫu xưởng.`);
      } else if (data.error) {
        alert(data.error);
      } else if (data.reason === 'no_default_bundle_for_workshop_type' || data.reason === 'no_default_bundle') {
        alert(
          'Chưa có bộ mẫu Sản xuất cho phân loại này.\n\n'
          + 'Vào SX → Bộ mẫu nhiệm vụ: chọn Công ty + Phân loại → tạo/bật bộ mẫu (hoặc «Đặt bộ mặc định deal SX»).',
        );
      } else {
        alert('Đã quét — không thiếu nhiệm vụ Sản xuất nào (hoặc cột chưa có bộ mẫu).');
      }
      await refreshProjectSilently();
      await load();
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message || 'Không bổ sung được nhiệm vụ SX');
    } finally {
      setEnsuringCrmDeal(false);
    }
  }, [ensuringCrmDeal, id, refreshProjectSilently, load]);

  /** Phải đặt trước mọi return sớm (loadError / loading) — Rules of Hooks */
  const scopedWorkshopTasksForTab = useMemo(
    () => pickWorkshopTasksForSummary(workshopTasksForProject),
    [workshopTasksForProject, pickWorkshopTasksForSummary],
  );

  const toggleWorkshopTaskDone = useCallback(async (task) => {
    if (!task?.id) return;
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: next });
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật');
    }
  }, [refreshProjectSilently]);

  const setProductionPerson = useCallback(async (userId) => {
    if (!project?.id) return;
    setSavingProductionOwner(true);
    try {
      const personField = moduleKey === 'vc' ? 'logistics_person_id' : 'production_person_id';
      if (moduleKey === 'vc') {
        // Dùng endpoint assign để kèm thông báo
        await api.patch(`/workshop-teams/projects/${project.id}/assign`, { [personField]: userId || null });
      } else {
        await api.put(`/projects/${project.id}`, { [personField]: userId || null });
      }
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || `Lỗi phân công ${MOD.label}`);
    }
    setSavingProductionOwner(false);
  }, [project?.id, refreshProjectSilently, moduleKey, MOD.label]);

  const setVcTeamAssign = useCallback(async (field, value) => {
    if (!project?.id || moduleKey !== 'vc') return;
    setSavingTeamAssign(true);
    try {
      await api.patch(`/workshop-teams/projects/${project.id}/assign`, { [field]: value || null });
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gán đội');
    }
    setSavingTeamAssign(false);
  }, [project?.id, moduleKey, refreshProjectSilently]);

  const saveCrmActivity = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId || !crmActivityForm.title.trim()) {
      alert('Nhập tiêu đề hoạt động');
      return;
    }
    setSavingCrmActivity(true);
    try {
      await api.post(`/crm/leads/${dealId}/activities`, {
        type: crmActivityForm.type,
        title: crmActivityForm.title.trim(),
        description: crmActivityForm.description || '',
        outcome: crmActivityForm.outcome || '',
      });
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(data || []);
      setShowAddCrmActivity(false);
      setCrmActivityForm({ type: 'note', title: '', description: '', outcome: '' });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
    setSavingCrmActivity(false);
  };

  const moveStage = async (stageId) => {
    try {
      let body;
      let optimisticPatch = null;
      if (moduleKey === 'vc') {
        // stageId là logistics_pipeline_stages.id → gửi vc_stage_id
        // Tìm thêm workflow_stage_id nếu có
        const vcStage = pipelineStages.find((s) => String(s.id) === String(stageId));
        body = { vc_stage_id: stageId };
        if (vcStage?.workflow_stage_id) body.stage_id = vcStage.workflow_stage_id;
        // Nếu là cột intake, dùng move_to_intake
        if (vcStage?.bucket_slug === 'delivery_pending') {
          body = { move_to_intake: true };
        }
        optimisticPatch = {
          vc_kanban_column_id: vcStage?.bucket_slug === 'delivery_pending' ? stageId : stageId,
        };
      } else {
        const sxStage = pipelineStages.find((s) => String(s.id) === String(stageId));
        // Cột bàn giao VC: gửi yêu cầu để Sale CRM chọn công ty VC/LĐ trong bình luận (không mở modal).
        // TEMP_SX_FREE_DRAG: bỏ qua — chuyển cột bình thường.
        if (!TEMP_SX_FREE_DRAG && sxStage?.is_handover_to_logistics === true && !isProjectAlreadyInLogistics(project)) {
          try {
            await api.post(`/vc-handover/projects/${id}/request`, { sx_stage_id: String(sxStage?.id || stageId) });
            alert('Đã gửi thông báo cho Sale CRM phụ trách deal — họ cần chọn công ty VC/LĐ và ngày lấy/lắp (trong bình luận deal). 3 sự kiện lịch sẽ tạo sau khi Xưởng & VC/LĐ xác nhận.');
            refreshProjectSilently?.();
          } catch (e) {
            alert(e.response?.data?.error || 'Không gửi được yêu cầu bàn giao VC/LĐ');
          }
          return;
        }
        if (sxStage?.is_switch_workshop_type === true && sxStage?.target_workshop_type_id) {
          const fromName = project?.workshop_type?.name || 'Phân loại hiện tại';
          const toName = sxStage?.target_workshop_type?.name || 'Phân loại đích';
          setSwitchWorkshopModal({
            targetCol: sxStage,
            fromName,
            toName,
            currentColId: project?.sx_kanban_column_id || project?.crmDeals?.[0]?.sx_pipeline_stage?.id || null,
          });
          return;
        }
        // Intake (Chờ vào xưởng) không có workflow_stage_id → dùng move_to_intake giống Kanban drag.
        if (sxStage?.bucket_slug === 'won_pending' || String(sxStage?.id || '').startsWith('__fb_')) {
          body = { move_to_intake: true };
          optimisticPatch = {
            sx_kanban_column_id: sxStage?.id || stageId,
            sx_intake: true,
            current_stage_id: null,
            current_stage: null,
          };
        } else {
          // Cột Kanban SX (id riêng) — gửi production_pipeline_stages.id, không gửi workflow stage_id
          // (nhiều cột Phúc Đạt dùng chung workflow «Sản xuất» → stage_id không phân biệt được cột).
          const colId = sxStage?.id || stageId;
          const wid = sxStage?.workflow_stage_id || sxStage?.workflow_stage?.id || null;
          body = {
            sx_pipeline_stage_id: colId,
            current_sx_pipeline_stage_id:
              project?.sx_kanban_column_id
              || project?.crmDeals?.[0]?.sx_pipeline_stage?.id
              || null,
          };
          optimisticPatch = {
            sx_kanban_column_id: colId,
            sx_intake: false,
            current_stage_id: wid,
            current_stage: wid ? {
              id: wid,
              slug: sxStage?.slug || sxStage?.workflow_stage?.slug,
              name: sxStage?.workflow_stage?.name || sxStage?.name,
              color: sxStage?.color,
              icon: sxStage?.icon,
            } : null,
            ...(sxStage?.counts_as_completed_revenue ? {
              sx_kanban_deadline_at: null,
              sx_kanban_deadline_reason: null,
              production_deadline: null,
              delivery_date: null,
              deadline: null,
            } : {}),
          };
        }
      }

      // Optimistic update: đổi tag/cột ngay, không reload trang
      if (optimisticPatch) {
        setProject((prev) => (prev ? { ...prev, ...optimisticPatch } : prev));
      }

      const { data } = await api.patch(`${MOD.apiPrefix}/projects/${id}/stage`, body);
      const p = data.project || data;
      const newSxCol = p.sx_kanban_column_id ?? data.pipeline_stage_id ?? null;
      setProject((prev) => (prev && p ? {
        ...prev,
        status: p.status,
        current_stage_id: p.current_stage_id,
        vc_kanban_column_id: p.vc_kanban_column_id ?? prev.vc_kanban_column_id,
        sx_kanban_column_id: newSxCol ?? prev.sx_kanban_column_id,
        sx_intake: p.sx_intake ?? prev.sx_intake,
        current_stage: p.current_stage || prev.current_stage,
        crmDeals: newSxCol && prev.crmDeals?.length
          ? prev.crmDeals.map((d, i) => (i === 0 ? {
            ...d,
            sx_pipeline_stage: pipelineStages.find((s) => String(s.id) === String(newSxCol))
              || d.sx_pipeline_stage,
          } : d))
          : prev.crmDeals,
      } : prev));

      // Refresh nhẹ để đồng bộ sx_kanban_column_id/sx_intake (API patch không trả đủ field)
      window.setTimeout(() => { refreshProjectSilently(); }, 120);

      if (typeof window !== 'undefined' && id) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', { detail: { projectId: String(id) } }));
        }, 280);
      }
    } catch (e) {
      const respBody = e?.response?.data || {};
      if (respBody.code === 'SX_BLOCKING_TASKS_INCOMPLETE') {
        setBlockingTasksModal({
          currentStageName: respBody.current_stage_name || '',
          targetStageName: respBody.target_stage_name || '',
          remainingTasks: Array.isArray(respBody.remaining_tasks) ? respBody.remaining_tasks : [],
        });
        // Đồng bộ lại UI để rollback optimistic.
        refreshProjectSilently();
        return;
      }
      if (respBody.code === 'requires_deadline') {
        const targetCol = pipelineStages.find((s) => String(s.id) === String(stageId)) || null;
        setDeadlineCtx({ targetCol, stageId });
        refreshProjectSilently();
        return;
      }
      alert('Lỗi: ' + (respBody?.error || e.message));
      // Nếu optimistic sai do lỗi server, đồng bộ lại
      refreshProjectSilently();
    }
  };

  const submitStageDeadline = async ({ deadlineIso, reason }) => {
    const ctx = deadlineCtx;
    if (!ctx?.targetCol && !ctx?.stageId) return;
    setDeadlineBusy(true);
    try {
      const sxStage = ctx.targetCol || pipelineStages.find((s) => String(s.id) === String(ctx.stageId));
      const colId = sxStage?.id || ctx.stageId;
      const body = {
        sx_pipeline_stage_id: colId,
        current_sx_pipeline_stage_id: project?.sx_kanban_column_id || null,
        deadline: deadlineIso || null,
        ...(reason ? { deadline_reason: reason } : {}),
      };
      await api.patch(`${MOD.apiPrefix}/projects/${id}/stage`, body);
      setDeadlineCtx(null);
      refreshProjectSilently();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Lỗi đặt deadline');
    } finally {
      setDeadlineBusy(false);
    }
  };

  const saveTitle = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!titleDraft.trim() || savingTitle) return;
    setSavingTitle(true);
    try {
      const nextTitle = titleDraft.trim();
      if (dealId) {
        // Backend PUT /crm/leads/:id đồng bộ luôn projects.name (card Kanban SX/VC).
        const { data } = await api.put(`/crm/leads/${dealId}`, { title: nextTitle });
        const savedTitle = data?.title || nextTitle;
        setProject((prev) => (prev ? {
          ...prev,
          name: savedTitle,
          crmDeals: prev.crmDeals?.map((d) => (d.id === dealId ? { ...d, ...data, title: savedTitle } : d)),
        } : prev));
        patchCrmDashboardCacheLeadFields(dealId, { title: savedTitle });
        if (project?.id) markWorkshopProjectRename(project.id, { name: savedTitle, dealTitle: savedTitle });
      } else if (project?.id) {
        await api.put(`/projects/${project.id}`, { name: nextTitle });
        setProject((prev) => (prev ? { ...prev, name: nextTitle } : prev));
        markWorkshopProjectRename(project.id, { name: nextTitle });
      }
      setEditingTitle(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật tên');
    }
    setSavingTitle(false);
  };

  const saveProjectActivity = async () => {
    if (!activityForm.title.trim()) { alert('Nhập tiêu đề hoạt động'); return; }
    setSavingActivity(true);
    try {
      await api.post(`/projects/${project.id}/activities`, activityForm);
      await loadProjectActivities(project.id);
      setShowAddActivity(false);
      setActivityForm({ type: 'note', title: '', description: '', outcome: '' });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSavingActivity(false);
  };

  const saveIncident = async () => {
    if (!incidentForm.title.trim()) { alert('Nhập tiêu đề sự cố'); return; }
    setSavingIncident(true);
    try {
      const { data } = await api.post(`${MOD.apiPrefix}/projects/${project.id}/incidents`, incidentForm);
      setIncidents((prev) => [data.incident, ...prev]);
      setShowIncidentForm(false);
      setIncidentForm({ title: '', description: '', severity: 'medium' });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi báo sự cố'); }
    setSavingIncident(false);
  };

  const resolveIncident = async (incidentId) => {
    try {
      await api.patch(`${MOD.apiPrefix}/projects/${project.id}/incidents/${incidentId}`, { status: 'resolved' });
      setIncidents((prev) => prev.map((inc) => inc.id === incidentId ? { ...inc, status: 'resolved' } : inc));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi cập nhật sự cố'); }
  };

  const uploadProjectDocument = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploadingDoc(true);
      try {
        const uploaded = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const up = getUploadFilePayload(data);
          if (!up?.file_url && !up?.url) continue;
          uploaded.push({
            original_name: file.name,
            file_url: up.file_url || up.url,
            file_name: up.file_name || file.name,
            file_size: up.file_size || file.size,
            mime_type: up.mime_type || file.type,
          });
        }
        if (!uploaded.length) throw new Error('Upload chưa trả URL file hợp lệ');
        await api.post(`/projects/${project.id}/documents/bulk`, { items: uploaded });
        await loadProjectDocs(project.id);
      } catch (err) { alert(err.response?.data?.error || 'Lỗi upload file'); }
      setUploadingDoc(false);
    };
    input.click();
  };

  const deleteProjectDocument = async (docId) => {
    if (!docId) return;
    if (!confirm('Xóa tài liệu này?')) return;
    const projectId = project?.id || id;
    if (!projectId) return;
    try {
      await api.delete(`/projects/${projectId}/documents/${docId}`);
      await loadProjectDocs(projectId);
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xóa tài liệu');
    }
  };

  const deleteCrmDocument = async (doc) => {
    const docId = doc?.id;
    if (!docId) return;
    const projectId = project?.id || id;
    if (!projectId) {
      alert('Không xác định được dự án');
      return;
    }
    if (!confirm('Xóa tài liệu này?')) return;
    try {
      await api.delete(`/projects/${projectId}/lead-documents/${docId}`);
      await loadProjectDocs(projectId);
      await loadTaskFiles(projectId);
      await refreshProjectSilently();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Lỗi xóa tài liệu');
    }
  };

  const deleteTaskFile = async (file) => {
    const taskId = file?.task?.id || file?.entity_id;
    const attId = file?.id;
    if (!taskId || !attId) return;
    if (!confirm('Xóa file đính kèm này?')) return;
    const projectId = project?.id || id;
    try {
      await api.delete(`/tasks/${taskId}/attachments/${attId}`);
      if (projectId) {
        await loadTaskFiles(projectId);
        await loadProjectDocs(projectId);
      }
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Lỗi xóa file');
    }
  };

  const uploadDocument = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) { alert('Cần liên kết deal CRM để upload tài liệu'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploadingDoc(true);
      try {
        const uploaded = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const up = getUploadFilePayload(data);
          if (!up?.file_url && !up?.url) continue;
          uploaded.push({
            name: file.name,
            file_url: up.file_url || up.url,
            file_name: up.file_name || file.name,
            file_size: up.file_size || file.size,
            mime_type: up.mime_type || file.type,
          });
        }
        if (!uploaded.length) throw new Error('Upload chưa trả URL file hợp lệ');
        await api.post(`/crm/leads/${dealId}/documents/bulk`, { documents: uploaded });
        const { data: docs } = await api.get(`/crm/leads/${dealId}/documents`);
        setCrmDealDocs(Array.isArray(docs) ? docs : []);
      } catch (err) {
        alert(err.response?.data?.error || 'Lỗi upload file');
      }
      setUploadingDoc(false);
    };
    input.click();
  };

  if (loadError) {
    const isDealNoProject = loadError.kind === 'deal_without_project';
    const isBroken = loadError.kind === 'broken_project_link';
    return (
      <div className="max-w-lg mx-auto mt-12 p-6 bg-white rounded-xl border border-amber-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {isDealNoProject && 'Deal chưa có dự án xưởng'}
          {isBroken && 'Liên kết deal → dự án bị lỗi'}
          {loadError.kind === 'unknown' && 'Không tìm thấy dự án'}
          {loadError.kind === 'other' && 'Lỗi tải trang'}
        </h2>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{loadError.hint || loadError.message}</p>
        {isDealNoProject && loadError.crm_lead_id && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/crm/leads/${loadError.crm_lead_id}`}
              className="inline-flex h-10 px-4 items-center rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              Mở deal trên CRM → chuyển Thắng / tạo dự án
            </Link>
            <button
              type="button"
            onClick={goToDashboard}
            className="inline-flex h-10 px-4 items-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Về dashboard
            </button>
          </div>
        )}
        {!isDealNoProject && (
          <button
            type="button"
            onClick={goToDashboard}
            className="h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Về dashboard
          </button>
        )}
      </div>
    );
  }

  if (loading || !project) {
    if (!loading && !project && !loadError) {
      return (
        <div className="max-w-lg mx-auto mt-12 p-6 bg-white rounded-xl border border-gray-200 shadow-sm space-y-4 text-center">
          <p className="text-sm text-gray-600">Không tải được dữ liệu dự án.</p>
          <button type="button" onClick={goToDashboard} className="h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Về dashboard
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const safeVcTeams = Array.isArray(vcTeams) ? vcTeams : [];
  const safeTaskUsers = (Array.isArray(allUsers) && allUsers.length)
    ? allUsers
    : (Array.isArray(crmUsers) ? crmUsers : []);
  const safeProjectDocs = Array.isArray(projectDocs) ? projectDocs : [];
  const safeTaskFiles = Array.isArray(taskFiles) ? taskFiles : [];

  const defaultPipelineStages = moduleKey === 'vc'
    ? [
        { id: null, slug: 'delivery_pending', name: 'Chờ vận chuyển', color: '#f97316', icon: '📦' },
        { id: null, slug: 'delivery', name: 'Đang vận chuyển', color: '#ea580c', icon: '🚚' },
        { id: null, slug: 'installation', name: 'Đang lắp đặt', color: '#d97706', icon: '🔧' },
        { id: null, slug: 'customer-care', name: 'Bảo hành', color: '#0f766e', icon: '🤝' },
      ]
    : [
        { id: null, slug: 'won_pending', name: 'Chờ vào xưởng', color: '#64748b', icon: '⏳' },
        { id: null, slug: 'production', name: 'Sản xuất', color: '#0f766e', icon: '🏭' },
        { id: null, slug: 'customer-care', name: 'CSKH', color: '#5eead4', icon: '🤝' },
      ];
  const pipelineStages = (moduleKey !== 'vc' && project?.sxKanbanStages?.length)
    ? project.sxKanbanStages
    : (moduleKey === 'vc' && project?.vcKanbanStages?.length)
      ? project.vcKanbanStages
      : productionStages.length
        ? productionStages
        : project.workshopPipeline?.length
          ? project.workshopPipeline
          : defaultPipelineStages;
  const safePipelineStages = Array.isArray(pipelineStages) ? pipelineStages : [];

  // VC dùng vc_kanban_column_id (logistics_pipeline_stages.id) — không fallback workflow id.
  // SX phải dùng sx_kanban_column_id (production_pipeline_stages.id hoặc __fb_intake__) — không fallback workflow id.
  const currentStageId = moduleKey === 'vc'
    ? resolveVcKanbanCurrentStageId(project, safePipelineStages)
    : resolveSxKanbanCurrentStageId(project, safePipelineStages);
  const primaryCrmDeal = project.crmDeals?.[0];
  const crmAssigneePerson = resolvePersonFromList(
    primaryCrmDeal?.assignee || primaryCrmDeal?.lead_owner,
    primaryCrmDeal?.assigned_to || primaryCrmDeal?.lead_owner_id,
    safeTaskUsers,
  );
  const productionPerson = resolvePersonFromList(
    project.production_person,
    project.production_person_id,
    safeTaskUsers,
  );
  const logisticsPerson = resolvePersonFromList(
    project.logistics_person,
    project.logistics_person_id,
    safeTaskUsers,
  );
  const installerPerson = resolvePersonFromList(
    project.installer_person,
    project.installer_person_id,
    safeTaskUsers,
  );
  const canManageDeal = canManageWorkshopProjectFiles(user, primaryCrmDeal, project);
  const crmLeadId = resolveSxProjectLeadId({
    crm_lead_id: project.crm_lead_id,
    crm_deals: project.crmDeals || project.crm_deals,
  }) || fallbackDealIdForTasks;
  const dealLeadFromUrl = searchParams.get('deal_lead');
  const tasksLeadId = dealLeadFromUrl || crmLeadId;
  const focusCrmTaskId = searchParams.get('crm_task');
  const displayCode = primaryCrmDeal?.code || project.code;
  const displayTitle = primaryCrmDeal?.title || project.name;
  const taskCount = moduleKey === 'vc' && crmLeadId
    ? (crmDealTaskSummary.total || productionTaskSummary.total || 0)
    : moduleKey === 'vc'
      ? (productionTaskSummary.total || 0)
      : crmLeadId
        ? (crmDealTaskSummary.total || 0)
        : (productionTaskSummary.total || 0);
  const taskUsers = safeTaskUsers;
  const documentsForZipTotal = safeProjectDocs.length + visibleCrmSharedDocs.length + safeTaskFiles.length;

  const handleDownloadAllDocuments = async () => {
    if (downloadingDocsZip || documentsForZipTotal === 0) return;
    setDownloadingDocsZip(true);
    try {
      const result = await downloadWorkshopDocumentsZip({
        projectLabel: displayCode || displayTitle || project?.name || 'Du-an',
        moduleLabel: moduleKey === 'vc' ? 'VC' : 'SX',
        projectDocs: safeProjectDocs,
        crmDocs: visibleCrmSharedDocs,
        taskFiles: safeTaskFiles,
      });
      if (result?.missing > 0) {
        alert(`Đã tải ${result.added}/${result.total} file. Có ${result.missing} mục lỗi, xem BAO_CAO_FILE_LOI.txt trong file ZIP.`);
      }
    } catch (e) {
      alert(e?.message || 'Không tải được tài liệu');
    }
    setDownloadingDocsZip(false);
  };

  const tabBtn = (tab, label) => (
    <button
      type="button"
      key={tab}
      onClick={() => setTab(tab)}
      className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
        activeTab === tab
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );

  const teamTabLabel = (
    <span className="inline-flex flex-col items-center gap-0.5">
      {(memberModuleCounts.crm > 0 || memberModuleCounts.production > 0 || memberModuleCounts.logistics > 0) && (
        <span className="inline-flex items-center gap-0.5" title="Số thành viên theo khối CRM / SX / VC">
          <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-blue-100 text-blue-700" title={`CRM: ${memberModuleCounts.crm}`}>
            {memberModuleCounts.crm}
          </span>
          <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-teal-100 text-teal-700" title={`SX: ${memberModuleCounts.production}`}>
            {memberModuleCounts.production}
          </span>
          <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-orange-100 text-orange-700" title={`VC: ${memberModuleCounts.logistics}`}>
            {memberModuleCounts.logistics}
          </span>
        </span>
      )}
      <span>👥 Thành viên</span>
    </span>
  );

  return (
    <div className="space-y-4 mx-auto">
      {/* Header — same style as LeadDetail */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goToDashboard}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${moduleKey === 'vc' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                {MOD.icon} {moduleKey === 'vc' ? 'VC' : 'SX'}
              </span>
              <span className="text-xs text-gray-500 font-mono">{displayCode}</span>
            </div>
            {editingTitle ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-10 min-w-[320px] max-w-[560px] px-3 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900 bg-white"
                  placeholder="Nhập tên deal"
                  autoFocus
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle || !titleDraft.trim()}
                  className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {savingTitle ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(false); }}
                  disabled={savingTitle}
                  className="h-10 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="h-4 w-4" /> Hủy
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
                {crmLeadId && (
                  <button
                    onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(true); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                    title="Sửa tên deal"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/projects/${project.id}`}
            className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <FolderKanban className="h-4 w-4" /> Dự án đầy đủ
          </Link>
          {crmLeadId && (
            <Link
              to={`/crm/leads/${crmLeadId}`}
              className="h-9 px-3 bg-teal-100 text-teal-800 rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <FolderKanban className="h-4 w-4" /> CRM deal
            </Link>
          )}
        </div>
      </div>

      {/* Hint phân loại — pipeline stepper bám theo workshop_type của project (công ty + loại). */}
      {moduleKey !== 'vc' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Pipeline:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
            🏢 {project.company?.short_name || project.company?.name || 'Chưa có công ty'}
          </span>
          {project.workshop_type?.name || project.workshop_type_id ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium border border-teal-200">
              📦 {project.workshop_type?.name || 'Đã phân loại'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
              ⚠️ Chưa phân loại — chỉ hiển thị cột chung
            </span>
          )}
          {primaryCrmDeal?.crm_region?.name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-medium border border-indigo-200">
              📍 {primaryCrmDeal.crm_region.name}
            </span>
          )}
        </div>
      )}

      {/* Pipeline — shared PipelineStepper component */}
      <PipelineStepper
        stages={safePipelineStages}
        currentStageId={currentStageId}
        onMoveToStage={moveStage}
        linearProgress
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Cột trái — giống LeadDetail */}
        <div className="lg:col-span-1 space-y-4">
          <WorkshopInfoPanel
            project={project}
            onUpdate={refreshProjectSilently}
            crmDeal={primaryCrmDeal}
            onDealUpdate={(data) => {
              if (!data?.id) return;
              setProject((prev) => (prev ? {
                ...prev,
                crmDeals: prev.crmDeals?.map((d) => (
                  String(d.id) === String(data.id) ? { ...d, ...data } : d
                )),
              } : prev));
            }}
          />

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{crmActivities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{project.sharedDocuments?.length || 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Nhiệm vụ {MOD.label}</p>
              <p className="text-xl font-bold text-purple-600">{taskCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Đội ngũ</h3>
            {(primaryCrmDeal || (moduleKey === 'vc' && crmLeadId)) && (
              <div className="space-y-2 pb-3 mb-3 border-b border-gray-100">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">CRM</p>
                <PersonCard label="Phụ trách CRM" person={crmAssigneePerson} showPlaceholder />
                {primaryCrmDeal?.sx_pipeline_stage?.name && (
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase">Deal trên Kanban SX</p>
                    <p className="text-sm font-medium text-gray-900">{primaryCrmDeal?.sx_pipeline_stage?.name}</p>
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Dự án {MOD.label}</p>
            <div className="space-y-2">
              <PersonCard label="Kinh doanh" person={project.sales_person} />
              <PersonCard label="QL dự án" person={project.project_manager} />
              <PersonCard label="Giám sát" person={project.supervisor} />
              {moduleKey === 'vc' ? (
                <>
                  <PersonCard label="Phụ trách SX" person={productionPerson} showPlaceholder />
                  <PersonCard label="Vận chuyển (VC)" person={logisticsPerson} showPlaceholder />
                  <PersonCard label="Lắp đặt (LĐ)" person={installerPerson} showPlaceholder />
                </>
              ) : (
                <PersonCard label="Phụ trách chính" person={project.production_person} />
              )}
              {moduleKey !== 'vc' && (project.production_staff?.length > 0) && (
                <div className="pl-2">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Đội SX ({project.production_staff.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {project.production_staff.map((u) => (
                      <span
                        key={u.id}
                        className={`text-[11px] px-2 py-0.5 rounded ${u.is_primary ? 'bg-indigo-100 text-indigo-800 font-medium' : 'bg-gray-100 text-gray-700'}`}
                        title={u.is_primary ? 'Phụ trách chính' : undefined}
                      >
                        {u.full_name}{u.is_primary ? ' ★' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pl-2">
                <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">
                  {moduleKey === 'vc' ? '🚚 Người vận chuyển phụ trách' : `Phân công ${MOD.label}`}
                </p>
                <select
                  value={
                    moduleKey === 'vc'
                      ? (logisticsPerson?.id || project.logistics_person_id || '')
                      : (project.logistics_person?.id || project.logistics_person_id || project.production_person?.id || project.production_person_id || '')
                  }
                  onChange={(e) => setProductionPerson(e.target.value)}
                  disabled={savingProductionOwner}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="">— Chưa phân công —</option>
                  {taskUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              {/* VC-only: Đội vận chuyển & người lắp đặt */}
              {moduleKey === 'vc' && (
                <>
                  {/* Đội vận chuyển */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Truck className="h-3 w-3 text-orange-500" /> Đội vận chuyển
                    </p>
                    <select
                      value={project.delivery_team?.id || project.delivery_team_id || ''}
                      onChange={(e) => setVcTeamAssign('delivery_team_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-orange-200 rounded-lg text-sm bg-orange-50/40 focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa gán đội —</option>
                      {safeVcTeams.filter((t) => t.type === 'delivery').map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {project.delivery_team?.name && (
                      <p className="text-[10px] text-orange-600 mt-0.5">✓ {project.delivery_team.name}</p>
                    )}
                  </div>

                  {/* Người lắp đặt */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-amber-600" /> Người lắp đặt
                    </p>
                    <select
                      value={project.installer_person?.id || project.installer_person_id || ''}
                      onChange={(e) => setVcTeamAssign('installer_person_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-amber-200 rounded-lg text-sm bg-amber-50/40 focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa phân công —</option>
                      {taskUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Đội lắp đặt */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-amber-600" /> Đội lắp đặt
                    </p>
                    <select
                      value={project.installation_team?.id || project.installation_team_id || ''}
                      onChange={(e) => setVcTeamAssign('installation_team_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-amber-200 rounded-lg text-sm bg-amber-50/40 focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa gán đội —</option>
                      {safeVcTeams.filter((t) => t.type === 'installation').map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {project.installation_team?.name && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✓ {project.installation_team.name}</p>
                    )}
                  </div>
                </>
              )}

              <PersonCard label="CSKH" person={project.care_person} />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Công ty phụ trách</p>
              <p className="text-sm text-gray-800">
                {(() => {
                  const c = isVC ? (project.logistics_company || null) : (project.company || null);
                  const fallback = project.company || null;
                  const pick = c || (isVC ? fallback : null);
                  return pick
                    ? `${pick.name}${pick.short_name ? ` (${pick.short_name})` : ''}`
                    : '—';
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Cột phải — tab giống LeadDetail */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border">
            {/* Tab bar — giống LeadDetail, bỏ Facebook và Tổng đài */}
            <div className="flex border-b flex-wrap">
              {tabBtn('tasks', `✅ Công việc${taskCount ? ` (${taskCount})` : ''}`)}
              {crmLeadId && tabBtn('shared-workspace', '🤝 Không gian chung')}
              {tabBtn('documents', `📋 Tài liệu (${documentsForZipTotal})`)}
              {tabBtn('drive', `☁️ Drive (${driveFileCount})`)}
              {tabBtn('notes', `📝 Ghi chú (${sharedNotes.length})`)}
              {tabBtn('comments', `💬 Bình luận${commentCount > 0 ? ` (${commentCount})` : ''}`)}
              {tabBtn('incidents', incidents.filter(i => i.status === 'open' || i.status === 'in_progress').length > 0
                ? `⚠️ Sự cố (${incidents.filter(i => i.status === 'open' || i.status === 'in_progress').length})`
                : '⚠️ Sự cố')}
              {moduleKey !== 'vc' && tabBtn('procurement', '📦 Vật tư / Mua hàng')}
              {tabBtn('team', teamTabLabel)}
              {moduleKey !== 'vc' && tabBtn('approvals', '✅ Gửi duyệt')}
            </div>

            <div className="p-5">
              {activeTab === 'tasks' && (
                <>
                {project?.is_partner_project_view && (
                  <p className="mb-3 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    Dự án của công ty đối tác — tab Công việc chỉ hiển thị nhiệm vụ được giao cho công ty bạn.
                    Xem tab <strong>Không gian chung</strong> để thấy toàn bộ nhiệm vụ hai bên.
                  </p>
                )}
                {moduleKey === 'vc' && tasksLeadId ? (
                  <CRMTasksTab
                    key="vc-logistics-tasks"
                    leadId={tasksLeadId}
                    leadType="deal"
                    users={taskUsers}
                    taskScope="logistics"
                    taskCompanyScope="own"
                    focusTaskId={focusCrmTaskId}
                    onArtifactsSynced={refreshProjectSilently}
                    onTaskSummaryChange={handleCrmTaskSummaryChange}
                    linkedProjectId={project?.id || null}
                    embeddedVcKanbanStages={project?.vcKanbanStages || null}
                    vcTemplateCompanyId={project?.logistics_company_id || project?.logistics_company?.id || null}
                    dealResponsible={primaryCrmDeal}
                    workshopProject={project}
                    initialVcAreaTab={vcSubTab || undefined}
                    onVcAreaTabChange={(tab) => {
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        if (tab === 'shipping' || tab === 'install') next.set('vcTab', tab);
                        else next.delete('vcTab');
                        return next;
                      }, { replace: true });
                    }}
                  />
                ) : moduleKey === 'vc' ? (
                  <WorkshopProjectTasksPanel
                    project={project}
                    workArea="logistics"
                    workshopPipeline={safePipelineStages}
                    tasks={workshopTasksForProject}
                    users={taskUsers}
                    onReload={refreshProjectSilently}
                    crmDealDocs={crmDealDocs}
                    crmSharedNotes={crmActivities.filter((a) => a?.shared_to_workshop !== false)}
                    initialVcAreaTab={vcSubTab || undefined}
                    onVcAreaTabChange={(tab) => {
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        if (tab === 'shipping' || tab === 'install') next.set('vcTab', tab);
                        else next.delete('vcTab');
                        return next;
                      }, { replace: true });
                    }}
                  />
                ) : tasksLeadId ? (
                  <CRMTasksTab
                    key="crm-tasks-own"
                    leadId={tasksLeadId}
                    leadType="deal"
                    users={taskUsers}
                    taskScope={moduleKey === 'vc' ? 'crm' : 'production'}
                    taskCompanyScope="own"
                    focusTaskId={focusCrmTaskId}
                    onArtifactsSynced={refreshProjectSilently}
                    onTaskSummaryChange={handleCrmTaskSummaryChange}
                    linkedProjectId={project?.id || null}
                    embeddedSxKanbanStages={project?.sxKanbanStages || null}
                    embeddedWorkshopTypeId={project?.workshop_type_id || project?.workshop_type?.id || null}
                    sxTemplateCompanyId={project?.company_id || project?.company?.id || null}
                    dealResponsible={primaryCrmDeal}
                    workshopProject={project}
                  />
                ) : scopedWorkshopTasksForTab.length > 0 ? (
                  <WorkshopTasksFallbackPanel
                    tasks={scopedWorkshopTasksForTab}
                    moduleLabel={MOD.label}
                    onToggleDone={toggleWorkshopTaskDone}
                    onEnsureCrmDeal={ensureCrmDealAndSxTasks}
                    ensuringCrmDeal={ensuringCrmDeal}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl space-y-2 px-4">
                    <p>Chưa có deal CRM gắn dự án (<span className="font-mono text-xs">crm_leads.project_id</span>) và chưa có nhiệm vụ xưởng trên dự án.</p>
                    <p className="text-xs text-gray-400">
                      Gắn deal từ CRM (deal phải trỏ đúng <span className="font-mono">project_id</span>) để dùng tab pipeline CRM; hoặc thêm nhiệm vụ trực tiếp trên dự án / CRM.
                    </p>
                  </div>
                )}
                <div className="mt-6">
                  <UnifiedTaskHistoryWidget projectId={id} />
                </div>
                </>
              )}

      {activeTab === 'shared-workspace' && crmLeadId && (
                <DealSharedWorkspaceTab
                  leadId={crmLeadId}
                  leadType="deal"
                  users={taskUsers}
                  taskScope={moduleKey === 'vc' ? 'logistics' : 'production'}
                  companyId={primaryCrmDeal?.company_id || null}
                  sxCompanyId={project?.company_id || project?.company?.id || null}
                  vcCompanyId={project?.logistics_company_id || project?.logistics_company?.id || null}
                  onArtifactsSynced={refreshProjectSilently}
                  linkedProjectId={project?.id || null}
                  embeddedSxKanbanStages={project?.sxKanbanStages || null}
                  embeddedVcKanbanStages={project?.vcKanbanStages || null}
                  embeddedWorkshopTypeId={project?.workshop_type_id || project?.workshop_type?.id || null}
                  sxTemplateCompanyId={project?.company_id || project?.company?.id || null}
                  vcTemplateCompanyId={project?.logistics_company_id || project?.logistics_company?.id || null}
                  dealResponsible={primaryCrmDeal}
                  workshopProject={project}
                />
              )}

              {/* Tài liệu */}
              {activeTab === 'documents' && (
                <>
                  {/* Header buttons */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {crmLeadId && (
                      <p className="w-full text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                        <strong>Tài liệu từ CRM</strong> (tím): ⚙️ chia sẻ sang xưởng SX/VC.
                        {' '}<strong>Tài liệu xưởng</strong> / file nhiệm vụ: nút <strong className="text-violet-700">Chia sẻ CRM</strong> để bên Bếp xem trên deal.
                      </p>
                    )}
                    {uploadingDoc ? (
                      <span className="h-8 px-3 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent rounded-full" /> Đang tải lên...
                      </span>
                    ) : (
                      <button type="button" onClick={uploadProjectDocument} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                        <FileUp className="h-3.5 w-3.5" /> Upload file xưởng
                      </button>
                    )}
                    <button type="button" onClick={() => setShowAddTextDoc(true)} className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Nhập văn bản
                    </button>
                    {documentsForZipTotal > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadAllDocuments}
                        disabled={downloadingDocsZip}
                        className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        title="Tải ZIP tất cả tài liệu trong tab này"
                      >
                        {downloadingDocsZip ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang nén...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" /> Tải tất cả ({documentsForZipTotal})
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <CrmSharedDocumentsPanel
                    docs={visibleCrmSharedDocs}
                    workshopModule={workshopShareMod}
                    crmLeadId={crmLeadId}
                    dealLabel={displayCode}
                    taskMetaMap={crmTaskMetaMap}
                    stageSlugLabelMap={crmStageSlugLabelMap}
                    onVisibilitySaved={refreshProjectSilently}
                    onDeleteDocument={deleteCrmDocument}
                    onOpenImage={openDocImage}
                    canManageDeal={canManageDeal}
                  />

                  {/* Production-native documents */}
                  {projectDocs.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-bold text-gray-500 uppercase">📁 Tài liệu xưởng ({projectDocs.length})</p>
                        {crmLeadId && (
                          <p className="text-[10px] text-violet-700 bg-violet-50 px-2 py-1 rounded-lg">
                            Bấm <strong>Chia sẻ CRM</strong> để bên Bếp/CRM xem trên deal
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        {projectDocs.map(doc => (
                          <DocRow
                            key={doc.id}
                            doc={doc}
                            enableShareToCrm={!!crmLeadId}
                            workshopProjectId={crmLeadId ? (project?.id || id) : null}
                            onShareToCrmSaved={() => loadProjectDocs(project?.id || id)}
                            onDelete={canManageDeal ? () => deleteProjectDocument(doc.id) : undefined}
                            onOpenImage={openDocImage}
                            canManageDeal={canManageDeal}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Task file attachments */}
                  {taskFiles.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">📌 File đính kèm nhiệm vụ ({taskFiles.length})</p>
                      <div className="space-y-1">
                        {taskFiles.map((f) => (
                          <TaskFileRow
                            key={f.id}
                            file={f}
                            projectId={project?.id || id}
                            enableShareToCrm={!!crmLeadId}
                            onShareToCrmSaved={() => loadTaskFiles(project?.id || id)}
                            onOpenImage={openDocImage}
                            canManageDeal={canManageDeal}
                            onDelete={canManageDeal ? () => deleteTaskFile(f) : null}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {projectDocs.length === 0 && visibleCrmSharedDocs.length === 0 && taskFiles.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed">
                      <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Chưa có tài liệu nào</p>
                      <p className="text-xs text-gray-400 mt-1">Upload file xưởng hoặc bật chia sẻ từ CRM</p>
                    </div>
                  )}

                  {(project.hiddenDocumentsCount || 0) > 0 && (
                    <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                      Còn <strong>{project.hiddenDocumentsCount}</strong> tài liệu CRM chưa chia sẻ xưởng.
                    </div>
                  )}
                </>
              )}

              {/* Drive — file gắn từ Google Drive */}
              {activeTab === 'drive' && (
                <DriveAttachments
                  entityType={moduleKey === 'vc' ? 'vc_project' : 'production_project'}
                  entityId={id}
                  onCountChange={setDriveFileCount}
                />
              )}

              {/* Hoạt động */}
              {activeTab === 'activities' && (
                <>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <button type="button" onClick={() => crmLeadId ? setShowAddCrmActivity(true) : setShowAddActivity(true)}
                      className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Thêm hoạt động
                    </button>
                  </div>

                  {/* Production-native activities (no CRM) */}
                  {!crmLeadId && (
                    projectActivities.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <div className="relative">
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                          {projectActivities.map((act) => {
                            let parsed = null;
                            try { parsed = JSON.parse(act.content); } catch { parsed = null; }
                            const typeInfo = ACTIVITY_TYPES.find(t => t.value === parsed?.type) || ACTIVITY_TYPES[4];
                            return (
                              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
                                <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                                <div className="flex items-start gap-2">
                                  <span className="text-lg shrink-0">{typeInfo.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">{parsed?.title || act.content}</p>
                                      <span className="text-[10px] text-gray-400">{formatDate(act.created_at)}</span>
                                    </div>
                                    {parsed?.description && <p className="text-xs text-gray-600 mt-1">{parsed.description}</p>}
                                    {parsed?.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {parsed.outcome}</p>}
                                    {act.user && <p className="text-[10px] text-gray-400 mt-1">{act.user.full_name}</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}

                  {/* CRM shared activities */}
                  {crmLeadId && (
                    sharedActivities.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Chưa có hoạt động nào được chia sẻ xưởng</p>
                        <p className="text-xs text-gray-400 mt-1">Bên CRM, bật «Chia sẻ xưởng» để hiện ở đây</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <div className="relative">
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                          {sharedActivities.map((act) => {
                            const typeInfo = ACTIVITY_TYPES.find((t) => t.value === act.type) || ACTIVITY_TYPES[4];
                            return (
                              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
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
                    )
                  )}
                </>
              )}

              {/* Ghi chú — chỉ hiện ghi chú đã chia sẻ xưởng, dùng CrmChatNotesPanel giống LeadDetail */}
              {activeTab === 'notes' && (
                crmLeadId ? (
                  <>
                    <SharedCRMNotes projectId={project.id} forModule={workshopShareMod} />
                    <CrmChatNotesPanel
                    variant="embedded"
                    leadId={crmLeadId}
                    notes={sharedNotes}
                    onPosted={refreshCrmActivities}
                    currentUserId={user?.id || user?.userId}
                    canEditAnyNote={isAdminLike(user) || user?.role === 'manager'}
                    includeVoiceTimeline
                    defaultShareToWorkshop
                    defaultShareModules={['production', 'workshop']}
                    contextLine={
                      primaryCrmDeal
                        ? `🎯 Deal ${[primaryCrmDeal.code, primaryCrmDeal.title].filter(Boolean).join(' — ')}`
                        : `📋 Dự án ${project.code || ''}`
                    }
                    contextBadge={primaryCrmDeal?.code || project?.code || ''}
                  />
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để dùng ghi chú.</p>
                )
              )}

              {/* Sự cố */}
              {activeTab === 'procurement' && moduleKey !== 'vc' && project?.id && (
                <ProjectProcurementTab
                  projectId={project.id}
                  companyId={project.company_id || project.company?.id || null}
                  users={taskUsers?.length ? taskUsers : (allUsers || [])}
                />
              )}

              {activeTab === 'incidents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Báo sự cố xưởng</h3>
                    <button type="button" onClick={() => setShowIncidentForm(true)}
                      className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <AlertTriangle className="h-3.5 w-3.5" /> Báo sự cố
                    </button>
                  </div>

                  {showIncidentForm && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-sm font-bold text-red-700">Báo sự cố mới</h4>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Tiêu đề sự cố *</label>
                        <input value={incidentForm.title} onChange={e => setIncidentForm(f => ({ ...f, title: e.target.value }))}
                          className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Máy cắt bị hỏng, nguyên liệu thiếu..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Mô tả chi tiết</label>
                        <textarea value={incidentForm.description} onChange={e => setIncidentForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm resize-none" placeholder="Mô tả thêm về sự cố..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Mức độ</label>
                        <select value={incidentForm.severity} onChange={e => setIncidentForm(f => ({ ...f, severity: e.target.value }))}
                          className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm">
                          <option value="low">🟢 Thấp — không ảnh hưởng tiến độ</option>
                          <option value="medium">🟡 Trung bình — có thể chậm tiến độ</option>
                          <option value="high">🔴 Cao — ảnh hưởng nghiêm trọng</option>
                          <option value="critical">🚨 Khẩn cấp — dừng sản xuất</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setShowIncidentForm(false); setIncidentForm({ title: '', description: '', severity: 'medium' }); }}
                          className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                        <button type="button" onClick={saveIncident} disabled={savingIncident}
                          className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                          {savingIncident ? 'Đang gửi...' : 'Gửi báo cáo'}
                        </button>
                      </div>
                    </div>
                  )}

                  {incidents.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed">
                      <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 font-medium">Chưa có sự cố nào</p>
                      <p className="text-xs text-gray-400 mt-1">Dự án đang vận hành bình thường</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {incidents.map((inc) => {
                        const isOpen = inc.status === 'open' || inc.status === 'in_progress';
                        const sevColor = {
                          low: 'bg-green-100 text-green-700 border-green-200',
                          medium: 'bg-amber-100 text-amber-700 border-amber-200',
                          high: 'bg-red-100 text-red-700 border-red-200',
                          critical: 'bg-red-200 text-red-800 border-red-300',
                        }[inc.severity] || 'bg-gray-100 text-gray-700';
                        const sevLabel = { low: '🟢 Thấp', medium: '🟡 Trung bình', high: '🔴 Cao', critical: '🚨 Khẩn cấp' }[inc.severity] || inc.severity;
                        return (
                          <div key={inc.id} className={`rounded-xl border p-4 ${isOpen ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sevColor}`}>{sevLabel}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isOpen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {isOpen ? '🔴 Đang mở' : '✅ Đã giải quyết'}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-gray-900">{inc.title}</p>
                                {inc.description && <p className="text-xs text-gray-600 mt-1">{inc.description}</p>}
                                <div className="flex items-center gap-2 mt-2">
                                  {inc.reporter?.full_name && <span className="text-[10px] text-gray-400">👤 {inc.reporter.full_name}</span>}
                                  <span className="text-[10px] text-gray-400"><Clock className="h-2.5 w-2.5 inline mr-0.5" />{new Date(inc.created_at).toLocaleDateString('vi-VN')}</span>
                                </div>
                              </div>
                              {isOpen && (
                                <button type="button" onClick={() => resolveIncident(inc.id)}
                                  className="shrink-0 h-8 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium cursor-pointer">
                                  Đã xử lý
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bình luận deal / dự án — realtime */}
              {activeTab === 'comments' && (
                project?.id
                  ? (crmLeadId
                    ? <CrmLeadCommentsPanel leadId={crmLeadId} forModule="production" onCountChange={setCommentCount} />
                    : <ProjectCommentsPanel projectId={project.id} onCountChange={setCommentCount} />)
                  : <p className="text-sm text-gray-500 text-center py-8">Chưa có dữ liệu để bình luận.</p>
              )}

              {/* Thành viên */}
              {activeTab === 'team' && (
                crmLeadId
                  ? (
                    <LeadMembersTab
                      leadId={crmLeadId}
                      onMembersChange={(list) => setMemberModuleCounts(countMembersByModule(list))}
                      onOpenSharedWorkspace={() => setTab('shared-workspace')}
                    />
                  )
                  : <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để xem thành viên.</p>
              )}

              {/* Trao đổi */}
              {activeTab === 'chat' && (
                crmLeadId
                  ? <LeadChatTab leadId={crmLeadId} socket={socket} />
                  : <ProjectChatTab projectId={project.id} socket={socket} />
              )}

              {/* Gửi duyệt — dùng ProjectApprovalsTab thật */}
              {moduleKey !== 'vc' && activeTab === 'approvals' && (
                <ProjectApprovalsTab
                  variant="workshop"
                  projectId={project.id}
                  project={project}
                  onUpdated={() => load()}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddCrmActivity && project?.crmDeals?.[0]?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddCrmActivity(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động CRM</h2>
              <button type="button" onClick={() => setShowAddCrmActivity(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Loại</label>
                <select
                  value={crmActivityForm.type}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                >
                  {ACTIVITY_FORM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
                <input
                  value={crmActivityForm.title}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                  placeholder="Ví dụ: Gọi xác nhận lắp đặt"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mô tả</label>
                <textarea
                  value={crmActivityForm.description}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Kết quả / bước tiếp</label>
                <input
                  value={crmActivityForm.outcome}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, outcome: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCrmActivity(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={saveCrmActivity}
                  disabled={savingCrmActivity}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCrmActivity ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cảnh báo còn nhiệm vụ chặn chuyển giai đoạn (parity CRM) */}
      <BlockingTasksAlertModal
        open={!!blockingTasksModal}
        onClose={() => setBlockingTasksModal(null)}
        currentStageName={blockingTasksModal?.currentStageName || ''}
        targetStageName={blockingTasksModal?.targetStageName || ''}
        remainingTasks={blockingTasksModal?.remainingTasks || []}
        onGoToTasks={() => { try { setActiveTab('tasks'); } catch (_) { /* tab có thể chưa khởi tạo */ } }}
      />

      <CrmDeadlineModal
        open={!!deadlineCtx}
        title="Đặt deadline khi chuyển cột"
        subtitle="Chọn hạn hoàn thành cho thẻ trước khi chuyển sang cột mới."
        stageName={deadlineCtx?.targetCol?.name || ''}
        initialDeadline={project?.sx_kanban_deadline_at || null}
        currentDeadline={project?.sx_kanban_deadline_at || null}
        mandatory
        requireReason={false}
        allowClear={false}
        submitting={deadlineBusy}
        onClose={() => !deadlineBusy && setDeadlineCtx(null)}
        onConfirm={submitStageDeadline}
      />

      {/* Chuyển phân loại (cột có cờ is_switch_workshop_type) */}
      {switchWorkshopModal && moduleKey !== 'vc' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!switchWorkshopSaving) setSwitchWorkshopModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-violet-600" /> Chuyển phân loại
              </h2>
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)} className="p-1 hover:bg-gray-100 rounded cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Dự án <strong>{project?.name || project?.code}</strong> sẽ chuyển sang pipeline phân loại mới.
            </p>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm mb-4 space-y-1">
              <p><span className="text-gray-500">Từ:</span> <strong>{switchWorkshopModal.fromName}</strong> → cột «{switchWorkshopModal.targetCol?.name}»</p>
              <p><span className="text-gray-500">Sang:</span> <strong>{switchWorkshopModal.toName}</strong> → cột đầu pipeline</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)} disabled={switchWorkshopSaving}
                className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">Hủy</button>
              <button type="button" onClick={confirmSwitchWorkshopFromDetail} disabled={switchWorkshopSaving}
                className="h-10 px-4 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
                {switchWorkshopSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {switchWorkshopSaving ? 'Đang chuyển...' : 'Xác nhận chuyển'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SX → VC handover modal (khi đổi stage tới cột có cờ bàn giao VC) */}
      {handoverModal && moduleKey !== 'vc' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeHandoverModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">🚚 Bàn giao sang VC</h2>
              <button type="button" onClick={closeHandoverModal} className="p-1 hover:bg-gray-100 rounded cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Chọn <strong>công ty VC</strong> để bàn giao dự án. Sau khi xác nhận, dự án sẽ hiển thị trong dashboard VC của công ty đó.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">🏢 Công ty VC *</label>
              <select
                value={handoverLogisticsCompanyId}
                onChange={(e) => setHandoverLogisticsCompanyId(e.target.value)}
                className={`w-full h-10 px-3 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500 ${
                  !handoverLogisticsCompanyId && handoverErr ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              >
                <option value="">-- Chọn công ty --</option>
                {(handoverCompanies || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
              {handoverErr && <p className="text-xs text-red-600">{handoverErr}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={closeHandoverModal}
                disabled={handoverSaving}
                className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmHandoverFromDetail}
                disabled={handoverSaving}
                className="h-10 px-4 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {handoverSaving ? 'Đang bàn giao...' : 'Xác nhận bàn giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Production-native activity modal */}
      {showAddActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddActivity(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động xưởng</h2>
              <button type="button" onClick={() => setShowAddActivity(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Loại</label>
                <select value={activityForm.type} onChange={e => setActivityForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm">
                  {ACTIVITY_FORM_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
                <input value={activityForm.title} onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Kiểm tra nguyên vật liệu" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mô tả</label>
                <textarea value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Kết quả</label>
                <input value={activityForm.outcome} onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddActivity(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                <button type="button" onClick={saveProjectActivity} disabled={savingActivity} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                  {savingActivity ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nhập văn bản modal */}
      {showAddTextDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddTextDoc(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Nhập văn bản tài liệu</h2>
              <button type="button" onClick={() => setShowAddTextDoc(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Tên tài liệu</label>
                <input value={textDocForm.name} onChange={e => setTextDocForm(f => ({ ...f, name: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Phiếu nghiệm thu nội bộ" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Nội dung / ghi chú</label>
                <textarea value={textDocForm.notes} onChange={e => setTextDocForm(f => ({ ...f, notes: e.target.value }))} rows={5} className="w-full px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm resize-none" placeholder="Nhập nội dung..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddTextDoc(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                <button type="button" disabled={!textDocForm.name.trim()} onClick={async () => {
                  const content = textDocForm.notes || '';
                  const dataUrl = content ? `data:text/plain;charset=utf-8,${encodeURIComponent(content)}` : '';
                  try {
                    await api.post(`/projects/${project.id}/documents/bulk`, { items: [{ file_name: textDocForm.name + '.txt', file_url: dataUrl, file_size: content.length, mime_type: 'text/plain', original_name: textDocForm.name + '.txt', notes: content }] });
                    await loadProjectDocs(project.id);
                    setShowAddTextDoc(false);
                    setTextDocForm({ name: '', notes: '' });
                  } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
                }} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {docLightboxIndex != null && activeDocImageGallery.length > 0 && (
        <UploadFileLightbox
          items={activeDocImageGallery}
          index={docLightboxIndex}
          onIndexChange={setDocLightboxIndex}
          onClose={closeDocLightbox}
        />
      )}
    </div>
  );
}

// Tasks Tab Component
function TasksTab({ project }) {
  return (
    <div className="space-y-4">
      {project.tasksByStage && Object.keys(project.tasksByStage).length > 0 ? (
        Object.entries(project.tasksByStage).map(([stageName, tasks]) => (
          <div key={stageName} className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 capitalize">{stageName}</h4>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded transition">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    readOnly
                    className="mt-1 w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.assignee && (
                      <p className="text-xs text-gray-500 mt-1">Giao cho: {task.assignee.full_name}</p>
                    )}
                  </div>
                  {task.priority && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có nhiệm vụ</p>
      )}
    </div>
  );
}

// Documents Tab Component
function PersonCard({ label, person, showPlaceholder }) {
  if (!person?.full_name) {
    if (!showPlaceholder) return null;
    return (
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">—</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-sm text-gray-400">Chưa gán</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {person.avatar ? (
        <img src={person.avatar} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: avatarColor(person.full_name) }}>
          {getInitials(person.full_name)}
        </div>
      )}
      <div className="flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{person.full_name}</p>
      </div>
    </div>
  );
}

/** Chat nội bộ xưởng — dùng project_comments khi không có CRM deal */
function ProjectChatTab({ projectId, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/comments`);
      setMessages((data?.comments || []).slice().reverse());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    } catch (_) {}
  }, [projectId]);

  useEffect(() => {
    load();
    if (socket) {
      socket.emit('join:project', projectId);
      const handler = (payload) => {
        if (String(payload?.project_id) !== String(projectId)) return;
        setMessages(prev => prev.some(m => m.id === payload.comment?.id) ? prev : [...prev, payload.comment]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      socket.on('project:comment', handler);
      return () => socket.off('project:comment', handler);
    }
  }, [projectId, socket, load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/comments`, { content: text.trim() });
      setMessages(prev => [...prev, data.comment]);
      setText('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gửi'); }
    setSending(false);
  };

  const handleUpload = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    setSending(true);
    try {
      const uploaded = [];
      for (const file of arr) {
        const fd = new FormData();
        fd.append('file', file);
        const { data: up } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const upFile = getUploadFilePayload(up);
        if (!upFile?.file_url && !upFile?.url) continue;
        uploaded.push({
          url: upFile.file_url || upFile.url,
          name: upFile.file_name || file.name,
          type: upFile.mime_type || file.type,
          size: upFile.file_size || file.size,
        });
      }
      if (!uploaded.length) throw new Error('Upload chưa trả URL file hợp lệ');
      const { data } = await api.post(`/projects/${projectId}/comments`, { content: text.trim() || '', attachments: uploaded });
      setMessages(prev => [...prev, data.comment]);
      setText('');
    } catch (e) { alert(e.response?.data?.error || 'Lỗi upload'); }
    setSending(false);
  };

  const formatTime = (d) => {
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return isToday ? time : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
  };

  return (
    <div className="flex flex-col" style={{ height: '450px' }}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-t-xl">
        {messages.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có tin nhắn nào. Bắt đầu trao đổi!</p>}
        {messages.map(m => {
          const isMe = String(m.user_id) === String(user?.userId || user?.id);
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && (
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(m.user?.full_name || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${isMe ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'}`}>
                {!isMe && <p className="text-[10px] font-medium mb-0.5 text-blue-600">{m.user?.full_name}</p>}
                {m.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>}
                {atts.map((att, i) => {
                  const isImg = att.type?.startsWith('image/');
                  const href = pubUrl(att.url);
                  return isImg ? (
                    <img key={i} src={href} alt={att.name} className="rounded-lg max-w-full max-h-48 mt-1 object-contain" />
                  ) : (
                    <a key={i} href={href} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs underline"><Paperclip size={11} />{att.name || 'File'}</a>
                  );
                })}
                <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t bg-white rounded-b-xl flex gap-2 shrink-0">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-blue-500 p-2 cursor-pointer" title="Đính kèm">
          <Paperclip size={18} />
        </button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Nhập tin nhắn..." className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        <button type="button" onClick={send} disabled={sending || !text.trim()}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer shadow-sm">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { markCrmPipelineCardFocus, notifyCrmLeadSeenByCurrentUser, saveCrmPipelineSnapshot, loadCrmPipelineSnapshot, persistCrmPipelineUiNow } from '../lib/crmPipelineStorage';
import { patchCrmDashboardCacheLeadFields } from '../lib/crmDashboardCache';
import {
  parseShareModules,
  cleanShareModulesForApi,
  shareModuleLabels,
} from '../lib/documentShareScope';
import DocumentShareModulePicker from '../components/DocumentShareModulePicker';
import { publicFileUrl, getFileOpenAnchorProps, getFileDownloadAnchorProps, printUploadImage } from '../lib/publicFileUrl';
import UploadFileLightbox, {
  collectUploadLightboxItems,
  findUploadLightboxIndex,
  isUploadImageFile,
} from '../components/UploadFileLightbox';
import { downloadCrmLeadDocumentsZip } from '../lib/crmDocumentsZipDownload';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { canUserDeleteCrmLeadDeal } from '../lib/crmPipelineDeletePermission';
import { isDealResponsibleUser } from '../lib/fileOwnership';
import api from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { consumeCrmLeadDetailPrefetch } from '../lib/crmLeadDetailPrefetch';
import { getSocket } from '../lib/socket';
import { formatVND, formatDate, getFileEmoji } from '../lib/utils';
import CRMTasksTab from '../components/CRMTasksTab';
import { pickSurveyFillFormTask, hasFilledFormData, normalizeFormConfig } from '../lib/taskFillForm';
import DealSharedWorkspaceTab from '../components/DealSharedWorkspaceTab';
import CrmTaskDocumentsPanel from '../components/CrmTaskDocumentsPanel';
import UnifiedTaskHistoryWidget from '../components/UnifiedTaskHistoryWidget';
import BlockingTasksAlertModal from '../components/BlockingTasksAlertModal';
import ExcelQuotationImport from '../components/ExcelQuotationImport';
import QuotationSourceExcelLink from '../components/QuotationSourceExcelLink';
import { PO_STATUS, PO_COLORS } from './PurchasingInboxPage';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import EmployeePicker from '../components/EmployeePicker';
import { LeadMembersTab, LeadChatTab } from '../components/LeadChatTabs';
import { countMembersByModule } from '../lib/memberModuleCounts';
import CallLogsTab from '../components/CallLogsTab';
import LeadVoiceRecordingsTab from '../components/LeadVoiceRecordingsTab';
import FacebookChatTab from '../components/FacebookChatTab';
import ZaloChatTab from '../components/ZaloChatTab';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import CrmStageAssigneeModal from '../components/CrmStageAssigneeModal';
import { stageNeedsAssigneeConfirm } from '../lib/crmStageAssigneeConfirm';
import CrmLeadDeadlineOverview from '../components/CrmLeadDeadlineOverview';
import { crmLeadMissingPhone } from '../lib/crmLeadDeadlineDisplay';
import SxCompanyPickList from '../components/SxCompanyPickList';
import SxMultiTargetPicker, {
  validateSxTargets,
  sxTargetsToApiPayload,
} from '../components/SxMultiTargetPicker';
import { useConfirmCountdown } from '../hooks/useConfirmCountdown';
import {
  classifyCrmLeadTypeForSx,
  companyPreferredForSxKind,
  orderSxCompaniesPreferredFirst,
  orderWorkshopTypesPreferredFirst,
  pickWorkshopTypeIdForCompany,
  preferredWorkshopTypeIdForCompany,
  preferredSxFromLeadTypeRow,
  sxLeadTypeHintText,
  sxPickGuideFallbackText,
  formatCrmToSxMappingLine,
  workshopTypeMatchesSxKind,
  workshopTypePreferredForLeadType,
} from '../lib/sxCompanySuggestFromLeadType';
import SxPickGuideList from '../components/SxPickGuideList';
import Modal from '../components/Modal';
import DealCrossScoresPanel from '../components/DealCrossScoresPanel';
import LeadKpiLedgerPanel from '../components/LeadKpiLedgerPanel';
import { CrmLeadCommentsPanel } from '../components/CommentsPanels';
import { CRM_DEAL_COMMENT_QUICK_REPLIES } from '../lib/crmCommentMentions';
import { TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';
import DriveAttachments from '../components/drive/DriveAttachments';
import { driveLinksCountByEntity } from '../lib/drive';
import { useCrmNotesFab } from '../context/CrmNotesFabContext';
import PipelineStepper from '../components/PipelineStepper';
import {
  crmDealMoveToWonSxAlreadyCreatedMessage,
  crmDealRevertFromPostWonBlockedMessage,
  crmDealStageMoveBlockedMessage,
} from '../lib/crmDealStageGate';
import { sortAndDedupePipelineStages } from '../lib/crmPipelineStages';
import { resolveDealWonAnchorOrderIndex } from '../lib/crmPipelineTabs';
import DealStageEventModal from '../components/DealStageEventModal';
import EventCreateModal from '../components/EventCreateModal';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, User, Target,
  Plus, Clock, MessageSquare, MessageCircle, Edit2, Trash2, X, Save, Building2, FolderKanban,
  FileUp, FileText, Zap, ChevronDown, Send, RefreshCw, Users, ClipboardCheck, ClipboardPen, Loader2, Mic, RotateCcw, Download,
  Pin, CheckCircle2, ShoppingCart, Package, Search, Eye, BookOpen,
} from 'lucide-react';
import { useProductTour } from '../components/productTour/ProductTourProvider';
import { CRM_LEAD_DEAL_DETAIL_TOUR_ID } from '../lib/productTour/tours';

function formatLeadDealEventTitle(lead, customer) {
  const title = (lead?.title || '').trim() || (lead?.code ? String(lead.code).trim() : '') || (lead?.type === 'deal' ? 'Deal' : 'Lead');
  const cust = (customer?.full_name || customer?.name || lead?.customer?.full_name || lead?.customer_name || '').trim();
  return cust ? `${title} - ${cust}` : title;
}

function leadDealEventLocation(lead, customer) {
  return (
    customer?.address
    || lead?.customer?.address
    || lead?.install_address
    || customer?.install_address
    || ''
  );
}

/** Khớp backend: chỉ cột deal có tên chứa «Hoàn thành» mới dùng gửi Zalo OA */
function isCrmDealStageHoanThanhName(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('hoan thanh');
}

/** Lead từ Zalo OA — chuyển Deal không bắt buộc SĐT (khác Facebook/Messenger). */
function isZaloInboxLead(lead) {
  const ch = String(lead?.inbox_channel || '').trim().toLowerCase();
  if (ch === 'zalo') return true;
  const src = String(lead?.source?.name || '').toLowerCase();
  if (/zalo/.test(src)) return true;
  const title = String(lead?.title || '');
  if (/^\[Zalo\b/i.test(title)) return true;
  const desc = String(lead?.description || '');
  if (/Nguồn:\s*Zalo/i.test(desc)) return true;
  return false;
}

function customerReadyForDealConvert(customer, lead) {
  if (!String(customer?.full_name || '').trim()) return false;
  if (String(customer?.phone || '').trim()) return true;
  return isZaloInboxLead(lead);
}

function findDefaultAdminCompanyPhucDat(companies) {
  if (!companies?.length) return '';
  const hit = companies.find((c) => {
    const t = `${c.name || ''} ${c.short_name || ''}`.toLowerCase();
    return t.includes('phúc đạt') || t.includes('phuc dat') || (t.includes('phúc') && t.includes('đạt'));
  });
  return hit?.id ? String(hit.id) : '';
}

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'comment', label: 'Bình luận @', icon: '💬', color: 'bg-sky-100 text-sky-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

export default function LeadDetail() {
  const { id } = useParams();
  const productTour = useProductTour();
  const [searchParams, setSearchParams] = useSearchParams();
  const { socket, user } = useAuth();
  const isAdminUser = isAdminLike(user);
  const { setCrmNotesAnchor } = useCrmNotesFab();
  const loadRef = useRef(null);
  const loadSeqRef = useRef(0);
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [pipelineConfig, setPipelineConfig] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [taskDocuments, setTaskDocuments] = useState([]);
  const [crmTasks, setCrmTasks] = useState([]);
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  /** Các giai đoạn deal đã từng vào — stepper tích ✓ theo lịch sử (không chỉ order_index). */
  const [visitedStageIds, setVisitedStageIds] = useState(() => new Set());
  const [headerLeadTypes, setHeaderLeadTypes] = useState([]);
  const [flows, setFlows] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createEventTypes, setCreateEventTypes] = useState([]);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [showTransferRegionModal, setShowTransferRegionModal] = useState(false);
  const [transferCompanyId, setTransferCompanyId] = useState('');
  const [transferCompanies, setTransferCompanies] = useState([]);
  const [transferCanCrossCompany, setTransferCanCrossCompany] = useState(false);
  const [transferRegionId, setTransferRegionId] = useState('');
  const [transferRegions, setTransferRegions] = useState([]);
  const [transferRegionsLoading, setTransferRegionsLoading] = useState(false);
  const [transferRegionSaving, setTransferRegionSaving] = useState(false);
  const [transferRegionError, setTransferRegionError] = useState('');
  const [transferAssigneeId, setTransferAssigneeId] = useState('');
  const [transferUsers, setTransferUsers] = useState([]);
  const [transferDepartments, setTransferDepartments] = useState([]);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeTab, setActiveTab] = useState('tasks');
  const [commentCount, setCommentCount] = useState(0);
  const [memberModuleCounts, setMemberModuleCounts] = useState({ crm: 0, production: 0, logistics: 0, total: 0 });

  useEffect(() => {
    if (!id) return;
    api.get(`/crm/lead-comments/index?lead_ids=${id}`)
      .then((r) => {
        const meta = r.data?.[id] || r.data?.[String(id)];
        setCommentCount(meta?.count || 0);
      })
      .catch(() => setCommentCount(0));
  }, [id]);

  useEffect(() => {
    if (!id) {
      setMemberModuleCounts({ crm: 0, production: 0, logistics: 0, total: 0 });
      return;
    }
    let cancelled = false;
    api.get(`/crm/leads/${id}/members`)
      .then((r) => {
        if (cancelled) return;
        setMemberModuleCounts(countMembersByModule(r.data || []));
      })
      .catch(() => {
        if (!cancelled) setMemberModuleCounts({ crm: 0, production: 0, logistics: 0, total: 0 });
      });
    return () => { cancelled = true; };
  }, [id]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [downloadingDocsZip, setDownloadingDocsZip] = useState(false);
  const [docLightboxIndex, setDocLightboxIndex] = useState(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  /** Báo giá deal có file Excel gốc — mở lại từ header */
  const [dealExcelQuotations, setDealExcelQuotations] = useState([]);
  /** Đặt hàng gắn deal — CRUD đơn giản trên tab */
  const [dealPurchaseOrders, setDealPurchaseOrders] = useState([]);
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [poEditing, setPoEditing] = useState(null);
  const [poSaving, setPoSaving] = useState(false);
  const [poForm, setPoForm] = useState({
    title: '',
    notes: '',
    status: 'draft',
    order_date: new Date().toISOString().slice(0, 10),
    items: [],
  });
  const [poCatalog, setPoCatalog] = useState({ brands: [], categories: [], products: [] });
  const [poCatBrand, setPoCatBrand] = useState('');
  const [poCatCategory, setPoCatCategory] = useState('');
  const [poCatSearch, setPoCatSearch] = useState('');
  const [poCatalogLoading, setPoCatalogLoading] = useState(false);
  const [poManualName, setPoManualName] = useState('');
  const [poManualQty, setPoManualQty] = useState(1);
  const [poManualPrice, setPoManualPrice] = useState('');
  const [poDetail, setPoDetail] = useState(null);
  const [poDetailLoading, setPoDetailLoading] = useState(false);
  // const [notesExpanded, setNotesExpanded] = useState(localStorage.getItem('crm_notes_default_open') === 'true'); // TBD
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingLostStageId, setPendingLostStageId] = useState(null);
  const [showAssignBeforeWonModal, setShowAssignBeforeWonModal] = useState(false);
  const [assignBeforeWonUser, setAssignBeforeWonUser] = useState('');
  const [assigningForWon, setAssigningForWon] = useState(false);
  const [assignBeforeWonError, setAssignBeforeWonError] = useState('');
  const [assignBeforeWonRegion, setAssignBeforeWonRegion] = useState('');
  const [editingLeadTitle, setEditingLeadTitle] = useState(false);
  const [leadTitleDraft, setLeadTitleDraft] = useState('');
  const [savingLeadTitle, setSavingLeadTitle] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ type: 'drawing', title: '', note: '' });
  const [zaloQuickSendLoading, setZaloQuickSendLoading] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [blockingModal, setBlockingModal] = useState(null);
  /** Cột yêu cầu deadline khi đổi stage từ trang chi tiết */
  const [stageDeadlineCtx, setStageDeadlineCtx] = useState(null);
  const [stageDeadlineBusy, setStageDeadlineBusy] = useState(false);
  const [assigneeStageCtx, setAssigneeStageCtx] = useState(null);
  const [assigneeStageBusy, setAssigneeStageBusy] = useState(false);
  const [dealDetailEventCtx, setDealDetailEventCtx] = useState(null);
  const [dealDetailEventBusy, setDealDetailEventBusy] = useState(false);
  /** Kéo deal Thắng chưa có dự án: chọn công ty SX */
  const [dealStageWonPick, setDealStageWonPick] = useState(null);
  const [dealStageWonCompanyId, setDealStageWonCompanyId] = useState('');
  const [dealStageWonTargets, setDealStageWonTargets] = useState([]);
  const [addSxOpen, setAddSxOpen] = useState(false);
  const [addSxTargets, setAddSxTargets] = useState([]);
  const [addSxBusy, setAddSxBusy] = useState(false);
  const [addSxErr, setAddSxErr] = useState('');
  const [dealStageWonWorkTypeId, setDealStageWonWorkTypeId] = useState('');
  const [dealStageWonErr, setDealStageWonErr] = useState('');
  /** Deal đã có dự án SX — kéo lại Thắng: thông báo, không mở hộp chuyển */
  const [dealWonSxExistsCtx, setDealWonSxExistsCtx] = useState(null);
  const [productionCompaniesSx, setProductionCompaniesSx] = useState([]);
  const projectCompanyPickRef = useRef(false);
  const [pickProjectCompanyOpen, setPickProjectCompanyOpen] = useState(false);
  const [pickProjectCompanyId, setPickProjectCompanyId] = useState('');
  const [pickProjectCompanyWorkTypeId, setPickProjectCompanyWorkTypeId] = useState('');
  const [pickProjectCompanyErr, setPickProjectCompanyErr] = useState('');
  /** Admin chọn lại công ty + phân loại SX khi đã có dự án */
  const [reassignSxOpen, setReassignSxOpen] = useState(false);
  const [reassignSxCompanyId, setReassignSxCompanyId] = useState('');
  const [reassignSxWorkTypeId, setReassignSxWorkTypeId] = useState('');
  const [reassignSxErr, setReassignSxErr] = useState('');
  const [reassignSxBusy, setReassignSxBusy] = useState(false);
  /**
   * Phân loại theo công ty SX cho 2 modal won-pick / pick-project-company.
   * Cùng dùng 1 list — modal nào mở thì useEffect bên dưới fetch theo company của modal đó.
   */
  const [wonModalWorkTypes, setWonModalWorkTypes] = useState([]);
  const [wonModalWorkTypesLoading, setWonModalWorkTypesLoading] = useState(false);
  const [showDeleteLeadModal, setShowDeleteLeadModal] = useState(false);

  const parentCrmLeadTypeName = useMemo(() => {
    const nested = lead?.lead_type?.name || lead?.lead_type_name;
    if (nested) return String(nested);
    if (lead?.lead_type_id && headerLeadTypes.length) {
      return headerLeadTypes.find((t) => String(t.id) === String(lead.lead_type_id))?.name || '';
    }
    return '';
  }, [lead?.lead_type, lead?.lead_type_name, lead?.lead_type_id, headerLeadTypes]);

  const parentSxLeadKind = useMemo(
    () => classifyCrmLeadTypeForSx(parentCrmLeadTypeName),
    [parentCrmLeadTypeName],
  );

  const parentSxLeadTypeRow = useMemo(() => {
    if (!lead?.lead_type_id) return null;
    return headerLeadTypes.find((t) => String(t.id) === String(lead.lead_type_id)) || null;
  }, [lead?.lead_type_id, headerLeadTypes]);

  const parentSxDbPref = useMemo(
    () => preferredSxFromLeadTypeRow(parentSxLeadTypeRow),
    [parentSxLeadTypeRow],
  );

  const parentSxCompaniesForSelect = useMemo(
    () => orderSxCompaniesPreferredFirst(
      productionCompaniesSx,
      parentSxLeadKind,
      parentSxDbPref.companyId,
      parentSxDbPref.companyIds,
    ),
    [productionCompaniesSx, parentSxLeadKind, parentSxDbPref.companyId, parentSxDbPref.companyIds],
  );

  const parentWonTypesForSelect = useMemo(() => {
    const activeCo = dealStageWonPick
      ? dealStageWonCompanyId
      : pickProjectCompanyOpen
        ? pickProjectCompanyId
        : reassignSxOpen
          ? reassignSxCompanyId
          : '';
    const prefType = preferredWorkshopTypeIdForCompany(parentSxLeadTypeRow, activeCo)
      || parentSxDbPref.workshopTypeId;
    return orderWorkshopTypesPreferredFirst(wonModalWorkTypes, parentSxLeadKind, prefType);
  }, [
    wonModalWorkTypes,
    parentSxLeadKind,
    parentSxDbPref.workshopTypeId,
    parentSxLeadTypeRow,
    dealStageWonPick,
    dealStageWonCompanyId,
    pickProjectCompanyOpen,
    pickProjectCompanyId,
    reassignSxOpen,
    reassignSxCompanyId,
  ]);

  const parentSxHint = useMemo(() => {
    const linkLines = (parentSxDbPref.links || []).map((l) => {
      const co = productionCompaniesSx.find((c) => String(c.id) === l.companyId);
      const coName = co ? (co.short_name || co.name) : '';
      const wt = wonModalWorkTypes.find((t) => String(t.id) === l.workshopTypeId);
      const parts = [coName, wt?.name].filter(Boolean).join(' · ');
      return parts ? `${l.isPrimary ? '★ ' : ''}${parts}` : '';
    }).filter(Boolean);
    if (linkLines.length > 1) {
      const label = String(parentCrmLeadTypeName || '').trim() || '—';
      return `Loại CRM «${label}» gắn: ${linkLines.join(' | ')}. Các xưởng khác vẫn chọn được.`;
    }
    const co = productionCompaniesSx.find((c) => String(c.id) === parentSxDbPref.companyId);
    const coName = co ? (co.short_name || co.name) : '';
    const wt = wonModalWorkTypes.find((t) => String(t.id) === parentSxDbPref.workshopTypeId);
    return sxLeadTypeHintText(parentCrmLeadTypeName, parentSxLeadKind, {
      companyName: coName,
      workshopTypeName: wt?.name || '',
    });
  }, [
    parentCrmLeadTypeName,
    parentSxLeadKind,
    parentSxDbPref,
    productionCompaniesSx,
    wonModalWorkTypes,
  ]);
  const [blockPhoneOnDeleteLead, setBlockPhoneOnDeleteLead] = useState(true);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingLead, setDeletingLead] = useState(false);
  /** Tăng khi cần tab Công việc refetch (ví dụ sau kéo giai đoạn) mà không «tải lại» cả trang. */
  const [crmTasksRefreshKey, setCrmTasksRefreshKey] = useState(0);
  /** Meta phiếu khảo sát (show_fill_form) — nút Thêm trên header */
  const [surveyFillMeta, setSurveyFillMeta] = useState(null);
  const [openFillFormToken, setOpenFillFormToken] = useState(0);
  const handleSurveyFillMetaChange = useCallback((meta) => {
    setSurveyFillMeta(meta);
  }, []);

  // Khi chưa vào tab Công việc, vẫn hiện nút Thêm phiếu KS trên header
  useEffect(() => {
    if (!id) {
      setSurveyFillMeta(null);
      return undefined;
    }
    let cancelled = false;
    api.get(`/crm/leads/${id}/tasks`)
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
        const task = pickSurveyFillFormTask(list);
        if (!task) {
          setSurveyFillMeta(null);
          return;
        }
        const cfg = normalizeFormConfig(task.form_config);
        setSurveyFillMeta({
          taskId: task.id,
          title: cfg.title || cfg.button_label || 'Phiếu khảo sát',
          filled: hasFilledFormData(task.form_data),
        });
      })
      .catch(() => {
        if (!cancelled) setSurveyFillMeta(null);
      });
    return () => { cancelled = true; };
  }, [id, crmTasksRefreshKey]);

  const [reopeningLost, setReopeningLost] = useState(false);
  const [driveFileCount, setDriveFileCount] = useState(0);

  /**
   * Fetch danh sách phân loại theo công ty SX đang chọn ở các modal:
   *   - dealStageWonPick (kéo deal sang Thắng)
   *   - pickProjectCompanyOpen (tạo dự án xưởng cho deal đã Thắng)
   *   - reassignSxOpen (admin chọn lại công ty / phân loại)
   */
  useEffect(() => {
    let activeCompanyId = '';
    if (dealStageWonPick && dealStageWonCompanyId) activeCompanyId = dealStageWonCompanyId;
    else if (pickProjectCompanyOpen && pickProjectCompanyId) activeCompanyId = pickProjectCompanyId;
    else if (reassignSxOpen && reassignSxCompanyId) activeCompanyId = reassignSxCompanyId;
    if (!activeCompanyId) {
      setWonModalWorkTypes([]);
      return undefined;
    }
    let cancelled = false;
    setWonModalWorkTypesLoading(true);
    api.get('/workshop/project-types', { params: { company_id: activeCompanyId, module: 'production' } })
      .then((r) => {
        if (cancelled) return;
        const rows = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        setWonModalWorkTypes(rows);
        const inList = (id) => rows.some((t) => String(t.id) === String(id));
        const suggested = pickWorkshopTypeIdForCompany(
          parentSxLeadTypeRow,
          activeCompanyId,
          rows,
          parentSxLeadKind,
        );
        if (dealStageWonPick) {
          const nextType = (dealStageWonWorkTypeId && inList(dealStageWonWorkTypeId))
            ? dealStageWonWorkTypeId
            : (suggested || '');
          if (nextType !== dealStageWonWorkTypeId) setDealStageWonWorkTypeId(nextType);
          // Đồng bộ targets — validate đọc mảng này, không chỉ state dropdown.
          setDealStageWonTargets((prev) => {
            if (prev.length > 1) {
              return prev.map((row, i) => (
                i === 0 && nextType && !(row.workshopTypeId || row.workshop_type_id)
                  ? { ...row, workshopTypeId: nextType }
                  : row
              ));
            }
            const cid = dealStageWonCompanyId || prev[0]?.companyId || '';
            if (!cid) return prev;
            return [{ companyId: cid, workshopTypeId: nextType }];
          });
        }
        if (pickProjectCompanyOpen) {
          if (pickProjectCompanyWorkTypeId && !inList(pickProjectCompanyWorkTypeId)) setPickProjectCompanyWorkTypeId(suggested || '');
          else if (!pickProjectCompanyWorkTypeId && suggested) setPickProjectCompanyWorkTypeId(suggested);
        }
        if (reassignSxOpen) {
          if (reassignSxWorkTypeId && !inList(reassignSxWorkTypeId)) setReassignSxWorkTypeId(suggested || '');
          else if (!reassignSxWorkTypeId && suggested) setReassignSxWorkTypeId(suggested);
        }
      })
      .catch(() => { if (!cancelled) setWonModalWorkTypes([]); })
      .finally(() => { if (!cancelled) setWonModalWorkTypesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealStageWonPick, dealStageWonCompanyId, pickProjectCompanyOpen, pickProjectCompanyId, reassignSxOpen, reassignSxCompanyId, parentSxLeadKind, parentSxLeadTypeRow]);

  // Auto-create project (chạy ngầm)
  const [autoCreateStatus, setAutoCreateStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [autoCreateResult, setAutoCreateResult] = useState(null); // { project_id, project_code, tasks_created }
  const [autoCreateError, setAutoCreateError] = useState('');
  const autoCreateCalledRef = useRef(false);

  const autoCreateProject = async (dealId, productionCompanyId, workshopTypeId = null, targets = null, mode = 'create') => {
    if (!productionCompanyId && !(Array.isArray(targets) && targets.length)) {
      setPickProjectCompanyOpen(true);
      setPickProjectCompanyErr('');
      return;
    }
    if (autoCreateCalledRef.current) return;
    autoCreateCalledRef.current = true;
    setAutoCreateStatus('loading');
    setPickProjectCompanyOpen(false);
    try {
      const payload = Array.isArray(targets) && targets.length
        ? { targets: sxTargetsToApiPayload(targets), ...(mode === 'additional' ? { mode: 'additional' } : {}) }
        : {
          production_company_id: productionCompanyId,
          ...(workshopTypeId ? { workshop_type_id: workshopTypeId } : {}),
          ...(mode === 'additional' ? { mode: 'additional' } : {}),
        };
      const { data } = await api.post(`/crm/deals/${dealId}/auto-create-project`, payload);
      setAutoCreateResult(data);
      setAutoCreateStatus('success');
      projectCompanyPickRef.current = false;
      load({ silent: true });
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

  useEffect(() => {
    const cid = lead?.company_id;
    const req = cid
      ? api.get('/crm/production-companies', { params: { company_id: cid } })
      : api.get('/companies', { params: { for_module: 'production' } });
    req
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setProductionCompaniesSx(Array.isArray(list) ? list : []);
        if (isAdminUser) {
          const pref = findDefaultAdminCompanyPhucDat(list);
          if (pref) {
            setDealStageWonCompanyId((prev) => prev || pref);
            setPickProjectCompanyId((prev) => prev || pref);
          }
        }
      })
      .catch(() => setProductionCompaniesSx([]));
  }, [isAdminUser, lead?.company_id]);

  // Gợi ý mặc định công ty SX theo loại CRM / cấu hình DB (chỉ khi chưa chọn)
  useEffect(() => {
    if (!(productionCompaniesSx || []).length) return;
    let nextId = parentSxDbPref.companyId;
    if (nextId && !productionCompaniesSx.some((c) => String(c.id) === nextId)) nextId = '';
    if (!nextId && parentSxLeadKind) {
      const preferred = productionCompaniesSx.find((c) => companyPreferredForSxKind(c, parentSxLeadKind));
      nextId = preferred?.id ? String(preferred.id) : '';
    }
    if (!nextId) return;
    setDealStageWonCompanyId((prev) => prev || nextId);
    setPickProjectCompanyId((prev) => prev || nextId);
  }, [parentSxLeadKind, parentSxDbPref.companyId, productionCompaniesSx]);

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    setCrmTasksRefreshKey(0);
  }, [id]);

  useEffect(() => {
    if (!id || !lead) return;
    let cancelled = false;
    const entityType = lead.type === 'deal' ? 'deal' : 'lead';
    driveLinksCountByEntity(entityType, id)
      .then((count) => { if (!cancelled) setDriveFileCount(count); })
      .catch(() => { if (!cancelled) setDriveFileCount(0); });
    return () => { cancelled = true; };
  }, [id, lead?.type, lead]);

  // Lead/Deal types (phân loại) cho header: load theo company của lead (fallback company user)
  useEffect(() => {
    const cid = lead?.company_id || user?.company_id;
    if (!cid) { setHeaderLeadTypes([]); return; }
    let cancelled = false;
    api.get('/crm/lead-types', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        setHeaderLeadTypes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => { if (!cancelled) setHeaderLeadTypes([]); });
    return () => { cancelled = true; };
  }, [lead?.company_id, user?.company_id]);

  /** Chỉ hiện tab inbox đúng nguồn tạo lead (facebook | zalo). */
  const inboxChannel = useMemo(() => {
    const ch = String(lead?.inbox_channel || '').trim().toLowerCase();
    if (ch === 'facebook' || ch === 'zalo') return ch;
    return null;
  }, [lead?.inbox_channel]);

  /** Mở đúng tab từ URL (?tab=chat|facebook|calls|voice_crm|approvals|…) — app mobile / liên kết ngoài. */
  useEffect(() => {
    const t = searchParams.get('tab');
    const crmTask = searchParams.get('crm_task');
    if (!t && crmTask) {
      setActiveTab('tasks');
      return;
    }
    if (!t) return;
    if (t === 'chat' || t === 'crm-chat' || t === 'timeline') {
      setActiveTab('comments');
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    const allowed = new Set([
      'tasks',
      'shared-workspace',
      'documents',
      'notes',
      'facebook',
      'zalo',
      'team',
      'comments',
      'activities',
      'calls',
      'voice_crm',
      'drive',
      'deal_scores',
      'purchase_orders',
      'orders',
    ]);
    if (t === 'orders' || t === 'purchase_orders' || t === 'dat-hang') {
      setActiveTab('purchase_orders');
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    if (t === 'kpi_ledger' || t === 'approvals') {
      setActiveTab('tasks');
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    if (t === 'activities') {
      setActiveTab('notes');
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
    if (t === 'facebook' || t === 'zalo') {
      if (!lead || String(lead.id) !== String(id)) return;
      const ch = inboxChannel;
      setActiveTab(ch === 'facebook' || ch === 'zalo' ? ch : 'tasks');
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
      return;
    }
    setActiveTab(t);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [id, searchParams, setSearchParams, lead, inboxChannel]);

  const loadDealExcelQuotations = useCallback(() => {
    if (!id) return;
    api
      .get('/crm/quotations', { params: { lead_id: id, limit: 30 } })
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : [];
        setDealExcelQuotations(rows.filter((q) => q.source_excel_file_url).slice(0, 8));
      })
      .catch(() => setDealExcelQuotations([]));
  }, [id]);

  const loadDealPurchaseOrders = useCallback(() => {
    if (!id) return;
    api
      .get('/purchasing/orders', { params: { lead_id: id } })
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : [];
        setDealPurchaseOrders(rows.slice(0, 50));
      })
      .catch(() => setDealPurchaseOrders([]));
  }, [id]);

  const loadPoCatalog = useCallback(async () => {
    setPoCatalogLoading(true);
    try {
      const params = {};
      if (poCatBrand) params.brand_id = poCatBrand;
      if (poCatCategory) params.category_id = poCatCategory;
      const [bRes, cRes, pRes] = await Promise.all([
        api.get('/purchasing/brands'),
        api.get('/purchasing/categories'),
        api.get('/purchasing/products', { params }),
      ]);
      setPoCatalog({
        brands: bRes.data || [],
        categories: cRes.data || [],
        products: pRes.data || [],
      });
    } catch {
      setPoCatalog((prev) => ({ ...prev, products: [] }));
    }
    setPoCatalogLoading(false);
  }, [poCatBrand, poCatCategory]);

  const openPoCreateForm = useCallback(() => {
    setPoEditing(null);
    setPoForm({
      title: lead?.title ? `Đặt hàng — ${lead.title}` : '',
      notes: '',
      status: 'draft',
      order_date: new Date().toISOString().slice(0, 10),
      items: [],
    });
    setPoCatBrand('');
    setPoCatCategory('');
    setPoCatSearch('');
    setPoManualName('');
    setPoManualQty(1);
    setPoManualPrice('');
    setPoFormOpen(true);
  }, [lead?.title]);

  const addPoManualItem = useCallback(() => {
    const name = poManualName.trim();
    if (!name) return alert('Nhập tên hạng mục / SP');
    const qty = Number(poManualQty) || 1;
    const price = Number(poManualPrice) || 0;
    setPoForm((f) => ({
      ...f,
      items: [
        ...(f.items || []),
        {
          product_id: null,
          name,
          unit: 'cái',
          quantity: qty,
          unit_price: price,
          amount: Math.round(qty * price * 100) / 100,
          brand_name: null,
          sku: null,
          image_url: null,
        },
      ],
    }));
    setPoManualName('');
    setPoManualQty(1);
    setPoManualPrice('');
  }, [poManualName, poManualQty, poManualPrice]);

  const togglePoProduct = useCallback((p) => {
    setPoForm((f) => {
      const idx = (f.items || []).findIndex((it) => String(it.product_id) === String(p.id));
      if (idx >= 0) {
        return { ...f, items: f.items.filter((_, i) => i !== idx) };
      }
      const price = Number(p.cost_price) || Number(p.selling_price) || 0;
      return {
        ...f,
        items: [
          ...(f.items || []),
          {
            product_id: p.id,
            name: p.name,
            description: p.description || '',
            unit: p.unit || 'cái',
            quantity: 1,
            unit_price: price,
            amount: price,
            brand_name: p.brand?.name || null,
            sku: p.sku || p.code || null,
            image_url: p.image_url || null,
          },
        ],
      };
    });
  }, []);

  const updatePoItem = useCallback((idx, patch) => {
    setPoForm((f) => {
      const items = [...(f.items || [])];
      const next = { ...items[idx], ...patch };
      next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0) * 100) / 100;
      items[idx] = next;
      return { ...f, items };
    });
  }, []);

  const removePoItem = useCallback((idx) => {
    setPoForm((f) => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }));
  }, []);

  const openPoDetail = useCallback(async (orderId) => {
    setPoDetailLoading(true);
    setPoDetail({ id: orderId });
    try {
      const { data } = await api.get(`/purchasing/orders/${orderId}`);
      setPoDetail(data);
    } catch (e) {
      setPoDetail(null);
      alert(e.response?.data?.error || 'Lỗi tải chi tiết');
    }
    setPoDetailLoading(false);
  }, []);

  useEffect(() => {
    if (lead?.type === 'deal') {
      loadDealExcelQuotations();
      loadDealPurchaseOrders();
    } else {
      setDealExcelQuotations([]);
      setDealPurchaseOrders([]);
    }
  }, [lead?.type, lead?.id, loadDealExcelQuotations, loadDealPurchaseOrders]);

  const load = async (opts = {}) => {
    const silent = !!opts.silent;
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);
    try {
      const prefetchedLead = !silent ? consumeCrmLeadDetailPrefetch(id) : null;
      const leadDetailPromise = prefetchedLead
        ? Promise.resolve(prefetchedLead)
        : api.get(`/crm/leads/${id}/detail`).then((r) => r.data);
      const [leadRes, actRes, docRes, flowsRes, usersRes, taskDocRes, tasksRes] = await Promise.all([
        leadDetailPromise,
        api.get(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get('/flows').then(r => r.data?.flows || r.data || []).catch(() => []),
        api.get('/users').then(r => r.data?.users || []).catch(() => []),
        api.get(`/crm/leads/${id}/task-documents`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${id}/tasks`, { params: { task_scope: 'all' } }).catch(() => ({ data: [] })),
      ]);

      const leadCompanyId = leadRes?.company_id || leadRes?.company?.id || null;
      const leadPipelineId = leadRes?.pipeline_id || null;
      const stagesParamsBase =
        leadPipelineId
          ? { pipeline_id: leadPipelineId }
          : (leadCompanyId ? { company_id: leadCompanyId } : {});
      const stageEnsure = leadRes?.stage_id ? { ensure_stage_id: leadRes.stage_id } : {};
      const [stagesLeadRes, stagesDealRes, pipelineRes] = await Promise.all([
        api.get('/crm/pipeline-stages', { params: { type: 'lead', ...stagesParamsBase, ...stageEnsure } }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: { type: 'deal', ...stagesParamsBase, ...stageEnsure } }).catch(() => ({ data: [] })),
        leadPipelineId
          ? api.get(`/crm/pipelines/${leadPipelineId}`).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      if (seq !== loadSeqRef.current) return;
      setLead(leadRes);
      setPipelineConfig(pipelineRes?.data || null);
      setLeadTitleDraft(leadRes?.title || '');
      setCustomer(leadRes?.customer);
      setActivities(actRes.data || []);
      setDocuments(docRes.data || []);
      setTaskDocuments(taskDocRes.data || taskDocRes || []);
      setCrmTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
      setStagesLead(sortAndDedupePipelineStages(stagesLeadRes.data || []));
      setStagesDeal(sortAndDedupePipelineStages(stagesDealRes.data || []));
      const visited = new Set();
      try {
        const histBody = { lead_ids: [id] };
        if (leadPipelineId) histBody.pipeline_id = leadPipelineId;
        else if (leadCompanyId) histBody.company_id = leadCompanyId;
        const { data: histRes } = await api.post('/crm/leads/stage-history-summary', histBody);
        const rows = histRes?.by_lead?.[id] || histRes?.by_lead?.[String(id)] || [];
        for (const h of rows) {
          if (h?.to_stage_id) visited.add(String(h.to_stage_id));
        }
      } catch {
        /* ignore */
      }
      if (leadRes?.stage_id) visited.add(String(leadRes.stage_id));
      setVisitedStageIds(visited);
      setFlows(flowsRes || []);
      setAllUsers(usersRes || []);

      notifyCrmLeadSeenByCurrentUser(id, user?.id || user?.userId);

      if (leadRes?.project_id) projectCompanyPickRef.current = false;
      if (leadRes?.type === 'deal' && leadRes?.project_id) {
        api.post(`/crm/leads/${id}/repair-pipeline-display`).then((r) => {
          if (seq !== loadSeqRef.current) return;
          const patched = r.data?.lead;
          if (patched?.id) {
            setLead((prev) => (prev ? { ...prev, ...patched } : patched));
          } else if (r.data?.stage_reset_to_won) {
            void load({ silent: true });
          }
        }).catch(() => {});
      }
      // Deal thắng + chưa có dự án → bắt buộc chọn công ty SX rồi mới tạo dự án
      if (leadRes?.type === 'deal' && !leadRes?.project_id) {
        const dealStages = stagesDealRes.data || [];
        const currentStage = dealStages.find(s => s.id === leadRes.stage_id);
        if (currentStage?.is_won && !projectCompanyPickRef.current) {
          projectCompanyPickRef.current = true;
          setPickProjectCompanyOpen(true);
          setPickProjectCompanyId(
            leadRes.company_id
              ? String(leadRes.company_id)
              : (isAdminUser ? findDefaultAdminCompanyPhucDat(productionCompaniesSx) : ''),
          );
          setPickProjectCompanyErr('');
        }
      }
    } catch (e) { console.error(e); }
    finally {
      setLoading(false);
    }
  };

  /** Sau khi ghi chú/đính kèm trên nhiệm vụ CRM — đồng bộ ngay tab Tài liệu (gộp deal gốc + deal đơn fulfillment nếu khác). */
  const refreshTaskSyncedDocuments = useCallback(async (payload) => {
    if (!id) return;
    const alt = payload?.artifactLeadId && String(payload.artifactLeadId) !== String(id) ? String(payload.artifactLeadId) : null;
    const leadIds = alt ? [id, alt] : [id];
    try {
      const docLists = await Promise.all(
        leadIds.map((lid) => api.get(`/crm/leads/${lid}/documents`).catch(() => ({ data: [] }))),
      );
      const taskLists = await Promise.all(
        leadIds.map((lid) => api.get(`/crm/leads/${lid}/task-documents`).catch(() => ({ data: [] }))),
      );
      const crmTaskLists = await Promise.all(
        leadIds.map((lid) => api.get(`/crm/leads/${lid}/tasks`, { params: { task_scope: 'all' } }).catch(() => ({ data: [] }))),
      );
      const seenDoc = new Set();
      const mergedDocs = [];
      for (const dr of docLists) {
        for (const d of dr.data || []) {
          if (!d?.id || seenDoc.has(d.id)) continue;
          seenDoc.add(d.id);
          mergedDocs.push(d);
        }
      }
      const seenAtt = new Set();
      const mergedTask = [];
      for (const tr of taskLists) {
        const rows = tr.data || tr || [];
        for (const a of Array.isArray(rows) ? rows : []) {
          const k = a?.id || `${a?.task_id}|${a?.file_url}|${a?.name}`;
          if (seenAtt.has(k)) continue;
          seenAtt.add(k);
          mergedTask.push(a);
        }
      }
      const seenTaskRow = new Set();
      const mergedCrmTasks = [];
      for (const tr of crmTaskLists) {
        for (const t of tr.data || []) {
          if (!t?.id || seenTaskRow.has(t.id)) continue;
          seenTaskRow.add(t.id);
          mergedCrmTasks.push(t);
        }
      }
      setDocuments(mergedDocs);
      setTaskDocuments(mergedTask);
      setCrmTasks(mergedCrmTasks);
    } catch (_) {}
  }, [id]);

  loadRef.current = load;

  useEffect(() => {
    if (!id) return undefined;
    const sock = socket || getSocket();
    if (!sock) return undefined;
    sock.emit('join:lead', id);
    const onActivity = (payload) => {
      if (String(payload?.lead_id) !== String(id)) return;
      const row = payload?.activity;
      if (row?.id) {
        setActivities((prev) => {
          const rest = (prev || []).filter((a) => String(a.id) !== String(row.id));
          return [row, ...rest];
        });
        return;
      }
      void loadRef.current?.({ silent: true });
    };
    sock.on('lead:activity', onActivity);
    return () => {
      sock.emit('leave:lead', id);
      sock.off('lead:activity', onActivity);
    };
  }, [id, socket]);

  /** Cột pipeline có tên chứa «Hoàn thành» — dùng cho Zalo OA và tab Điểm chéo & KH */
  const isDealHoanThanhForZalo = useMemo(() => {
    if (!lead || lead.type !== 'deal') return false;
    const st = stagesDeal.find((s) => s.id === lead.stage_id);
    return !!(st && isCrmDealStageHoanThanhName(st.name));
  }, [lead, stagesDeal]);

  useEffect(() => {
    if (!lead) return;
    if ((activeTab === 'facebook' || activeTab === 'zalo') && activeTab !== inboxChannel) {
      setActiveTab(inboxChannel || 'tasks');
    }
  }, [lead?.id, inboxChannel, activeTab]);

  useEffect(() => {
    if (lead?.type === 'deal' && activeTab === 'deal_scores' && !isDealHoanThanhForZalo) {
      setActiveTab('tasks');
    }
  }, [lead?.type, activeTab, isDealHoanThanhForZalo]);

  useEffect(() => {
    if (activeTab === 'purchase_orders') loadDealPurchaseOrders();
  }, [activeTab, loadDealPurchaseOrders]);

  useEffect(() => {
    if (poFormOpen) loadPoCatalog();
  }, [poFormOpen, loadPoCatalog]);

  /** Tab Ghi chú + Hoạt động đã gộp; ẩn KPI / Gửi duyệt */
  useEffect(() => {
    if (activeTab === 'activities') setActiveTab('notes');
    else if (activeTab === 'kpi_ledger' || activeTab === 'approvals') setActiveTab('tasks');
  }, [activeTab]);

  /** Tour hướng dẫn — mở đúng tab hồ sơ (vd. tự vào Công việc ở bước task). */
  useEffect(() => {
    const TOUR_TAB = {
      'lead-tab-tasks': 'tasks',
      'lead-tab-shared': 'shared-workspace',
      'lead-tab-orders': 'purchase_orders',
      'lead-tab-documents': 'documents',
      'lead-tab-drive': 'drive',
      'lead-tab-notes': 'notes',
      'lead-tab-facebook': 'facebook',
      'lead-tab-zalo': 'zalo',
      'lead-tab-team': 'team',
      'lead-tab-comments': 'comments',
      'lead-tab-voice': 'voice_crm',
      'lead-tab-scores': 'deal_scores',
    };
    const onSetTab = (e) => {
      const tourId = e?.detail?.tourId;
      const tab = TOUR_TAB[tourId] || e?.detail?.tab;
      if (!tab) return;
      setActiveTab(tab);
    };
    window.addEventListener('product-tour:set-lead-tab', onSetTab);
    return () => window.removeEventListener('product-tour:set-lead-tab', onSetTab);
  }, []);

  /** Tour — mở form Tạo sự kiện gắn Lead/Deal */
  useEffect(() => {
    const onOpenEvent = () => {
      setShowCreateEvent(true);
      setCreateEventTypes((prev) => {
        if (prev?.length) return prev;
        api.get('/events/event-types').then((r) => setCreateEventTypes(r.data || [])).catch(() => {});
        return prev;
      });
    };
    window.addEventListener('product-tour:open-lead-event-modal', onOpenEvent);
    return () => window.removeEventListener('product-tour:open-lead-event-modal', onOpenEvent);
  }, []);

  const noteActivities = useMemo(
    () => (activities || []).filter((a) => a.type === 'note'),
    [activities],
  );

  /** Tài liệu lead: thủ công vs đồng bộ từ NV; tránh lặp với «File nhiệm vụ» khi cùng source_attachment_id. */
  const { manualLeadDocs, orphanSyncedLeadDocs, workshopSharedDocs, documentsTabTotal, taskFileCount, taskNoteCount } = useMemo(() => {
    const isNoteDoc = (d) => {
      const dt = String(d?.doc_type || '');
      return dt === 'task_note' || dt === 'task_inline_note' || dt === 'checklist_inline_note';
    };
    const fromTask = (d) =>
      !!(d?.source_attachment_id || d?.source_crm_task_id || d?.is_from_task);
    const fromWorkshop = (d) => !!d?.source_file_attachment_id;
    const workshop = (documents || []).filter(fromWorkshop);
    const manual = (documents || []).filter((d) => !fromTask(d) && !fromWorkshop(d));
    const shownAttIds = new Set(
      (taskDocuments || []).map((t) => (t?.id != null ? String(t.id) : null)).filter(Boolean),
    );
    const orphan = (documents || []).filter((d) => {
      if (!fromTask(d)) return false;
      if (d.source_attachment_id != null && shownAttIds.has(String(d.source_attachment_id))) return false;
      return true;
    });
    const taskFiles = (taskDocuments || []).filter((d) => !isNoteDoc(d)).length;
    const taskNotes = (taskDocuments || []).filter(isNoteDoc).length;
    const total = manual.length + workshop.length + (taskDocuments || []).length + orphan.length;
    return {
      manualLeadDocs: manual,
      orphanSyncedLeadDocs: orphan,
      workshopSharedDocs: workshop,
      documentsTabTotal: total,
      taskFileCount: taskFiles,
      taskNoteCount: taskNotes,
    };
  }, [documents, taskDocuments]);

  const docImageGallery = useMemo(
    () => collectUploadLightboxItems([
      ...(documents || []),
      ...(taskDocuments || []),
      ...orphanSyncedLeadDocs,
      ...manualLeadDocs,
      ...workshopSharedDocs,
    ]),
    [documents, taskDocuments, orphanSyncedLeadDocs, manualLeadDocs, workshopSharedDocs],
  );

  const openDocImage = useCallback((rawPath) => {
    const idx = findUploadLightboxIndex(docImageGallery, rawPath);
    if (idx >= 0) setDocLightboxIndex(idx);
  }, [docImageGallery]);

  const pipelineStagesForDocs = useMemo(
    () => (lead?.type === 'deal' ? stagesDeal : stagesLead),
    [lead?.type, stagesDeal, stagesLead],
  );

  const handleDownloadAllDocuments = useCallback(async () => {
    if (downloadingDocsZip || documentsTabTotal === 0) return;
    setDownloadingDocsZip(true);
    try {
      const dealLabel = [lead?.code, lead?.title].filter(Boolean).join(' - ')
        || (lead?.type === 'deal' ? 'Deal' : 'Lead');
      await downloadCrmLeadDocumentsZip({
        dealLabel,
        tasks: crmTasks,
        artifacts: taskDocuments,
        manualDocs: manualLeadDocs,
        orphanSyncedDocs: orphanSyncedLeadDocs,
        pipelineStages: pipelineStagesForDocs,
        leadCurrentStageId: lead?.stage_id,
        leadType: lead?.type || 'lead',
      });
    } catch (e) {
      alert(e?.message || 'Không tải được tài liệu');
    } finally {
      setDownloadingDocsZip(false);
    }
  }, [
    downloadingDocsZip,
    documentsTabTotal,
    lead,
    crmTasks,
    taskDocuments,
    manualLeadDocs,
    orphanSyncedLeadDocs,
    pipelineStagesForDocs,
  ]);

  useEffect(() => {
    if (loading || !lead || !id || String(lead.id) !== String(id)) return;
    setCrmNotesAnchor({
      leadId: id,
      notes: noteActivities,
      includeVoiceTimeline: true,
      contextLine: lead
        ? `${lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'} ${[lead.code, lead.title].filter(Boolean).join(' — ')}`
        : '',
      contextBadge: lead?.code || '',
      onPosted: () => loadRef.current?.({ silent: true }),
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
        load({ silent: true });
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
    persistCrmPipelineUiNow();
    const snapshot = loadCrmPipelineSnapshot();
    saveCrmPipelineSnapshot({ ...(snapshot || {}), pipelineType: 'deal' });
    if (dealId) markCrmPipelineCardFocus(dealId);
    navigate('/crm/dashboard');
  };

  const patchLeadStage = async (stageId, extraData = {}) => {
    if (movingStage) return null;
    setMovingStage(true);
    setLead((prev) => (prev ? { ...prev, stage_id: stageId } : prev));
    try {
      const { data } = await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId, ...extraData });
      if (data?.requires_conversion) setShowConvertModal(true);
      // Chỉ mở form tạo dự án khi chưa có project. Nếu đã tạo 1 phần (multi-SX)
      // thì không gọi lại mode create (sẽ lỗi «Deal đã có dự án»).
      if (data?.deal_won && !data?.project_id && !data?.project_auto_created?.project_id) {
        autoCreateProject(id, null);
      } else if (data?.project_auto_created?.partial_error || data?.project_auto_created?.warning) {
        setAutoCreateError(data.project_auto_created.partial_error || data.project_auto_created.warning);
        setAutoCreateStatus('error');
        setAutoCreateResult(data.project_auto_created);
      } else if (data?.project_auto_created?.project_id) {
        setAutoCreateResult(data.project_auto_created);
        setAutoCreateStatus('success');
      }
      if (data?.id) {
        setLead((prev) =>
          prev
            ? {
                ...prev,
                ...data,
                stage_id: data.stage_id ?? stageId,
                lost_reason: data.lost_reason ?? null,
                actual_close_date: data.actual_close_date ?? null,
                probability: data.probability ?? prev.probability,
                stage_entered_at: data.stage_entered_at ?? prev.stage_entered_at,
                project_id: data.project_id ?? prev.project_id,
                sx_pipeline_stage:
                  data.sx_pipeline_stage != null
                    ? data.sx_pipeline_stage
                    : prev.sx_pipeline_stage,
                vc_pipeline_stage:
                  data.vc_pipeline_stage != null
                    ? data.vc_pipeline_stage
                    : prev.vc_pipeline_stage,
              }
            : prev,
        );
        if (data.stage_id) {
          setVisitedStageIds((prev) => {
            const next = new Set(prev);
            next.add(String(data.stage_id));
            return next;
          });
          const pt = (data.type || lead?.type) === 'deal' ? 'deal' : 'lead';
          const base = lead?.pipeline_id
            ? { pipeline_id: lead.pipeline_id }
            : (lead?.company_id ? { company_id: lead.company_id } : {});
          api
            .get('/crm/pipeline-stages', {
              params: { type: pt, ...base, ensure_stage_id: data.stage_id },
            })
            .then((r) => {
              const list = r.data || [];
              const normalized = sortAndDedupePipelineStages(list);
              if (pt === 'deal') setStagesDeal(normalized);
              else setStagesLead(normalized);
            })
            .catch(() => {});
        }
        const pid = data.project_id || data.project_auto_created?.project_id;
        if (pid && !data.sx_pipeline_stage && !data.vc_pipeline_stage) {
          try {
            const { data: badge } = await api.get(`/crm/leads/${id}/badge`);
            setLead((prev) =>
              prev
                ? {
                    ...prev,
                    sx_pipeline_stage: badge?.sx_pipeline_stage ?? null,
                    vc_pipeline_stage: badge?.vc_pipeline_stage ?? null,
                  }
                : prev,
            );
          } catch {
            /* ignore */
          }
        }
        if (pid && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('crm-project-badges-refresh', { detail: { projectId: pid } }),
          );
        }
      }
      await loadRef.current?.({ silent: true });
      setCrmTasksRefreshKey((k) => k + 1);
      return data;
    } catch (e) {
      if (e.response?.data?.requires_conversion) {
        setShowConvertModal(true);
      } else if (e.response?.data?.code === 'requires_deadline') {
        const stagesArr = (lead?.type === 'deal') ? stagesDeal : stagesLead;
        const tgtStg = stagesArr.find((s) => String(s.id) === String(stageId));
        await loadRef.current?.({ silent: true });
        setStageDeadlineCtx({ stageId, extraData, stageName: tgtStg?.name || e.response.data.stage_name || '' });
      } else if (e.response?.data?.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
        const stagesArr = (lead?.type === 'deal') ? stagesDeal : stagesLead;
        const curStg = stagesArr.find((s) => String(s.id) === String(e.response.data.current_stage_id));
        const tgtStg = stagesArr.find((s) => String(s.id) === String(e.response.data.target_stage_id));
        setBlockingModal({
          leadId: id,
          targetStageId: e.response.data.target_stage_id || stageId,
          currentStageName: curStg?.name || '',
          targetStageName: tgtStg?.name || '',
          remainingTasks: e.response.data.remaining_tasks || [],
        });
        await loadRef.current?.({ silent: true });
      } else if (e.response?.data?.code === 'CRM_DEAL_SX_PROJECT_EXISTS') {
        await loadRef.current?.({ silent: true });
        alert(e.response?.data?.error || 'Deal đã tạo dự án Sản xuất — không thể kéo ngược.');
      } else {
        await loadRef.current?.({ silent: true });
        alert(e.response?.data?.error || 'Lỗi');
      }
      return null;
    } finally {
      setMovingStage(false);
    }
  };

  const confirmStageDeadline = async ({ deadlineIso, reason }) => {
    const ctx = stageDeadlineCtx;
    if (!ctx) return;
    setStageDeadlineBusy(true);
    try {
      const mergedExtra = {
        ...ctx.extraData,
        kanban_deadline_at: deadlineIso,
        deadline_reason: reason || '',
      };
      const targetStage = ctx.targetStage
        || (lead?.type === 'deal' ? stagesDeal : stagesLead).find((s) => String(s.id) === String(ctx.stageId));
      setStageDeadlineCtx(null);
      await proceedLeadStageMove(ctx.stageId, mergedExtra, targetStage);
      setCrmTasksRefreshKey((k) => k + 1);
    } finally {
      setStageDeadlineBusy(false);
    }
  };

  const proceedLeadStageMove = async (stageId, extraData, targetStage) => {
    const isRegularStage = targetStage
      && !targetStage.is_won
      && !targetStage.is_lost
      && !targetStage.counts_as_completed_revenue;
    const isSameStage = String(lead?.stage_id || '') === String(stageId);

    if (
      isRegularStage
      && !isSameStage
      && targetStage.requires_deadline
      && !extraData?.kanban_deadline_at
    ) {
      setStageDeadlineCtx({ stageId, extraData, targetStage, stageName: targetStage.name });
      return;
    }

    if (
      isRegularStage
      && !isSameStage
      && stageNeedsAssigneeConfirm(targetStage, lead)
      && extraData?.apply_default_assignee === undefined
    ) {
      setAssigneeStageCtx({ stageId, extraData, targetStage, card: lead });
      return;
    }

    if (
      lead?.type === 'deal'
      && targetStage
      && !targetStage.is_lost
      && targetStage.create_event_on_enter
    ) {
      setDealDetailEventCtx({ stageId, extraData, targetStage });
      return;
    }

    if (movingStage) return;
    await patchLeadStage(stageId, extraData);
  };

  const finishAssigneeStageMove = async (applyDefaultAssignee, assigneeUserId = null) => {
    const ctx = assigneeStageCtx;
    if (!ctx) return;
    setAssigneeStageBusy(true);
    try {
      const mergedExtra = { ...ctx.extraData, apply_default_assignee: applyDefaultAssignee };
      if (applyDefaultAssignee && assigneeUserId) {
        mergedExtra.assignee_user_id = assigneeUserId;
      }
      setAssigneeStageCtx(null);
      await proceedLeadStageMove(ctx.stageId, mergedExtra, ctx.targetStage);
    } finally {
      setAssigneeStageBusy(false);
    }
  };

  const reopenLostRecord = async () => {
    if (!id || reopeningLost) return;
    const isDeal = lead?.type === 'deal';
    const noun = isDeal ? 'deal' : 'lead';
    if (
      !window.confirm(
        `Hồi lại ${noun} này?\n\n• Xóa trạng thái thua/mất và lý do\n• Chuyển về giai đoạn trước khi đánh dấu thua (hoặc cột đầu pipeline)`,
      )
    ) {
      return;
    }
    setReopeningLost(true);
    try {
      const { data } = await api.post(`/crm/leads/${id}/reopen`);
      if (data?.id) {
        setLead((prev) =>
          prev
            ? {
                ...prev,
                ...data,
                lost_reason: data.lost_reason ?? null,
                stage_id: data.stage_id ?? prev.stage_id,
              }
            : prev,
        );
      }
      await loadRef.current?.({ silent: true });
      setCrmTasksRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.response?.data?.error || 'Không hồi lại được');
    } finally {
      setReopeningLost(false);
    }
  };

  const moveStage = async (stageId, extraData = {}) => {
    const stages = lead?.type === 'deal' ? stagesDeal : stagesLead;
    const targetStage = stages.find(s => s.id === stageId);

    if (lead?.type === 'deal' && targetStage) {
      const currentStage = stages.find((s) => String(s.id) === String(lead.stage_id)) || lead.stage;
      const revertBlocked = crmDealRevertFromPostWonBlockedMessage(lead, currentStage, targetStage);
      if (revertBlocked) {
        alert(revertBlocked);
        return;
      }
      // Bỏ qua gate khi deal đang ở trạng thái «orphan» (chưa có giai đoạn hợp lệ trong pipeline,
      // hoặc có project nhưng thiếu badge SX/VC) — cho phép chữa dữ liệu bằng cách kéo về cột thường.
      const validStageIds = new Set((stages || []).map((s) => String(s.id)));
      const sid = lead?.stage_id ? String(lead.stage_id) : '';
      const isOrphanSource =
        !sid ||
        !validStageIds.has(sid) ||
        (!!lead?.project_id && !lead?.sx_pipeline_stage?.id && !lead?.vc_pipeline_stage?.id);
      if (!isOrphanSource) {
        const blocked = crmDealStageMoveBlockedMessage(lead, targetStage, 'deal', {
          wonAnchorOrder: resolveDealWonAnchorOrderIndex(stagesDeal),
        });
        if (blocked) {
          alert(blocked);
          return;
        }
      }
    }

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
        setAssignBeforeWonUser('');
        setAssignBeforeWonRegion(lead?.region_id ? String(lead.region_id) : '');
        setShowAssignBeforeWonModal(true);
      } else {
        setShowConvertModal(true);
      }
      return;
    }

    if (lead?.type === 'deal' && targetStage?.is_won) {
      const alreadySx = crmDealMoveToWonSxAlreadyCreatedMessage(lead);
      if (alreadySx) {
        if (String(lead.stage_id) === String(stageId)) return;
        await patchLeadStage(stageId, extraData);
        return;
      }
      setDealStageWonErr('');
      setDealStageWonWorkTypeId('');
      setDealStageWonTargets([]);
      setDealStageWonCompanyId(
        lead.company_id
          ? String(lead.company_id)
          : (isAdminUser ? findDefaultAdminCompanyPhucDat(productionCompaniesSx) : ''),
      );
      setDealStageWonPick({ stageId, extraData, targetStage });
      return;
    }

    // Chuyển sang cột mới (trừ Thắng/Thua): kiểm tra nhiệm vụ chặn TRƯỚC;
    // hỏi deadline chỉ khi cột đích bật requires_deadline trong Cài đặt Pipeline.
    if (
      targetStage &&
      !targetStage.is_won &&
      !targetStage.is_lost &&
      !targetStage.counts_as_completed_revenue &&
      String(lead?.stage_id || '') !== String(stageId)
    ) {
      try {
        const { data: chk } = await api.get(`/crm/leads/${id}/stage-advance-check`, {
          params: { target_stage_id: stageId },
        });
        if (chk && chk.ok === false && chk.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
          const curStg = stages.find((s) => String(s.id) === String(chk.current_stage_id));
          setBlockingModal({
            leadId: id,
            targetStageId: stageId,
            currentStageName: curStg?.name || '',
            targetStageName: targetStage?.name || '',
            remainingTasks: chk.remaining_tasks || [],
          });
          return;
        }
      } catch (_) { /* lỗi pre-check → bỏ qua */ }
    }

    await proceedLeadStageMove(stageId, extraData, targetStage);
  };

  const confirmDealWonSxExistsOnlyStage = async () => {
    const ctx = dealWonSxExistsCtx;
    if (!ctx) return;
    setDealWonSxExistsCtx(null);
    await patchLeadStage(ctx.stageId, ctx.extraData);
  };

  const confirmDealStageWonProduction = async () => {
    let targets = dealStageWonTargets.length
      ? dealStageWonTargets
      : (dealStageWonCompanyId
        ? [{ companyId: dealStageWonCompanyId, workshopTypeId: dealStageWonWorkTypeId }]
        : []);
    // Dropdown 1 dòng có thể đã auto-chọn loại, nhưng targets còn workshopTypeId rỗng.
    if (targets.length === 1 && dealStageWonWorkTypeId) {
      const t0 = targets[0];
      if (!(t0.workshopTypeId || t0.workshop_type_id)) {
        targets = [{
          ...t0,
          companyId: t0.companyId || t0.production_company_id || dealStageWonCompanyId,
          workshopTypeId: dealStageWonWorkTypeId,
        }];
      }
    }
    const err = validateSxTargets(targets);
    if (err) {
      setDealStageWonErr(err);
      return;
    }
    const ctx = dealStageWonPick;
    if (!ctx) return;
    setDealStageWonErr('');
    const apiTargets = sxTargetsToApiPayload(targets);
    const merged = {
      ...ctx.extraData,
      production_company_id: apiTargets[0]?.production_company_id,
      workshop_type_id: apiTargets[0]?.workshop_type_id,
      targets: apiTargets,
    };
    setDealStageWonPick(null);
    setDealStageWonCompanyId('');
    setDealStageWonWorkTypeId('');
    setDealStageWonTargets([]);
    if (ctx.targetStage.create_event_on_enter) {
      setDealDetailEventCtx({ stageId: ctx.stageId, extraData: merged, targetStage: ctx.targetStage });
    } else {
      await patchLeadStage(ctx.stageId, merged);
    }
  };

  const submitPickProjectCompany = async () => {
    let targets = dealStageWonTargets.length
      ? dealStageWonTargets
      : (pickProjectCompanyId
        ? [{ companyId: pickProjectCompanyId, workshopTypeId: pickProjectCompanyWorkTypeId }]
        : []);
    if (targets.length === 1 && pickProjectCompanyWorkTypeId) {
      const t0 = targets[0];
      if (!(t0.workshopTypeId || t0.workshop_type_id)) {
        targets = [{
          ...t0,
          companyId: t0.companyId || t0.production_company_id || pickProjectCompanyId,
          workshopTypeId: pickProjectCompanyWorkTypeId,
        }];
      }
    }
    const err = validateSxTargets(targets);
    if (err) {
      setPickProjectCompanyErr(err);
      return;
    }
    setPickProjectCompanyErr('');
    autoCreateCalledRef.current = false;
    await autoCreateProject(id, targets[0]?.companyId, targets[0]?.workshopTypeId || null, targets);
  };

  const submitAddSxProject = async () => {
    const err = validateSxTargets(addSxTargets);
    if (err) {
      setAddSxErr(err);
      return;
    }
    setAddSxBusy(true);
    setAddSxErr('');
    try {
      const { data } = await api.post(`/crm/deals/${id}/auto-create-project`, {
        mode: 'additional',
        targets: sxTargetsToApiPayload(addSxTargets),
      });
      setAddSxOpen(false);
      setAddSxTargets([]);
      if (data?.partial_error || data?.warning) {
        setAutoCreateError(data.partial_error || data.warning);
        setAutoCreateStatus('error');
        setAutoCreateResult(data);
      } else {
        setAutoCreateResult(data);
        setAutoCreateStatus('success');
      }
      load({ silent: true });
    } catch (e) {
      setAddSxErr(e.response?.data?.error || e.message || 'Lỗi thêm dự án SX');
    } finally {
      setAddSxBusy(false);
    }
  };

  const openReassignSxModal = () => {
    setReassignSxErr('');
    setReassignSxCompanyId(lead?.sx_template_company_id || '');
    setReassignSxWorkTypeId('');
    setReassignSxOpen(true);
  };

  const submitReassignSx = async () => {
    if (!reassignSxCompanyId) {
      setReassignSxErr('Vui lòng chọn công ty Sản xuất.');
      return;
    }
    if (parentWonTypesForSelect.length > 0 && !reassignSxWorkTypeId) {
      setReassignSxErr('Vui lòng chọn phân loại sản xuất.');
      return;
    }
    if (!reassignSxWorkTypeId) {
      setReassignSxErr('Vui lòng chọn phân loại sản xuất.');
      return;
    }
    const ok = confirm(
      'Chọn lại sẽ thay thành viên SX theo phân loại mới và tạo lại nhiệm vụ mẫu xưởng / CRM sx_*. Tiến độ các nhiệm vụ mẫu cũ sẽ mất. Tiếp tục?',
    );
    if (!ok) return;
    setReassignSxBusy(true);
    setReassignSxErr('');
    try {
      const { data } = await api.post(`/crm/deals/${id}/reassign-sx`, {
        production_company_id: reassignSxCompanyId,
        workshop_type_id: reassignSxWorkTypeId,
      });
      setReassignSxOpen(false);
      setReassignSxCompanyId('');
      setReassignSxWorkTypeId('');
      await load({ silent: true });
      setCrmTasksRefreshKey((k) => k + 1);
      alert(
        data?.company_name
          ? `Đã chọn lại SX: ${data.company_name} · ${data.workshop_type_name || ''}`
          : 'Đã chọn lại công ty / phân loại SX',
      );
    } catch (e) {
      setReassignSxErr(e.response?.data?.error || e.message || 'Lỗi chọn lại SX');
    }
    setReassignSxBusy(false);
  };

  const confirmDealDetailEvent = async ({ startIso, endIso, titlePreview, locPreview }) => {
    const ctx = dealDetailEventCtx;
    if (!ctx || !lead) return;
    setDealDetailEventBusy(true);
    try {
      const data = await patchLeadStage(ctx.stageId, ctx.extraData);
      if (!data || data.requires_conversion) {
        setDealDetailEventCtx(null);
        return;
      }
      await api.post('/events', {
        title: titlePreview,
        description: lead.description || null,
        location: locPreview && locPreview !== '—' ? locPreview : null,
        start_time: startIso,
        end_time: endIso,
        lead_id: id,
        customer_id: lead.customer_id || null,
        assignee_id: lead.assigned_to || lead.lead_owner_id || null,
        event_type: 'site_visit',
        status: 'planned',
      });
      setDealDetailEventCtx(null);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi tạo sự kiện');
    } finally {
      setDealDetailEventBusy(false);
    }
  };

  const skipDealDetailEvent = async () => {
    const ctx = dealDetailEventCtx;
    if (!ctx || !lead) return;
    setDealDetailEventBusy(true);
    try {
      await patchLeadStage(ctx.stageId, ctx.extraData);
    } finally {
      setDealDetailEventBusy(false);
      setDealDetailEventCtx(null);
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
    if (!assignBeforeWonRegion) { setAssignBeforeWonError('Vui lòng chọn khu vực'); return; }
    setAssigningForWon(true);
    setAssignBeforeWonError('');
    try {
      const { data } = await api.post(`/crm/leads/${id}/convert-to-deal`, {
        assigned_to: assignBeforeWonUser,
        company_id: lead?.company_id || undefined,
        region_id: assignBeforeWonRegion,
      });
      setShowAssignBeforeWonModal(false);
      navigateToCrmDealFocused(data?.lead?.id || data?.deal?.id || data?.id || id);
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

  const deleteLead = () => {
    // Mặc định KHÔNG tick chặn — user phải chủ động tick nếu muốn chặn SĐT
    setBlockPhoneOnDeleteLead(false);
    setDeleteReason('');
    setShowDeleteLeadModal(true);
  };

  const confirmDeleteLeadWithBlock = async () => {
    setDeletingLead(true);
    try {
      const q =
        blockPhoneOnDeleteLead && customer?.phone && String(customer.phone).trim()
          ? '?block_auto_recreate_phone=true'
          : '';
      await api.delete(`/crm/leads/${id}${q}`, {
        data: { delete_reason: deleteReason.trim() || null },
      });
      setShowDeleteLeadModal(false);
      navigate('/crm');
    } catch (e) {
      alert('Lỗi xóa: ' + (e.response?.data?.error || e.message));
    } finally {
      setDeletingLead(false);
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
  const currentStageObj = stages.find((s) => s.id === lead.stage_id) || null;
  // Luôn hiện nút trên Deal — không phụ thuộc flag stage (cache taxonomy dễ làm mất cờ).
  // Backend vẫn chọn cột lead đích (is_revert_to_lead_target / cột lead đầu).
  const canRevertToLead = lead.type === 'deal';
  const canTransferRegion = !!lead.company_id;

  const openTransferRegionModal = () => {
    setTransferRegionError('');
    const initialCompany = lead?.company_id ? String(lead.company_id) : '';
    setTransferCompanyId(initialCompany);
    setTransferRegionId(lead?.region_id ? String(lead.region_id) : '');
    setTransferAssigneeId(
      lead?.assigned_to || lead?.lead_owner_id
        ? String(lead.assigned_to || lead.lead_owner_id)
        : '',
    );
    setShowTransferRegionModal(true);
    setTransferRegionsLoading(true);
    setTransferRegions([]);
    setTransferCompanies([]);
    setTransferUsers([]);
    setTransferDepartments([]);
    setTransferCanCrossCompany(false);
    if (!initialCompany) {
      setTransferRegionsLoading(false);
      setTransferRegionError('Lead/Deal chưa có công ty.');
      return;
    }
    api.get(`/crm/leads/${id}/transfer-options`, { params: { company_id: initialCompany } })
      .then((r) => {
        const companies = Array.isArray(r.data?.companies) ? r.data.companies : [];
        const regions = (Array.isArray(r.data?.regions) ? r.data.regions : []).filter((x) => x.is_active !== false);
        const users = Array.isArray(r.data?.users) ? r.data.users : [];
        const departments = Array.isArray(r.data?.departments) ? r.data.departments : [];
        setTransferCompanies(companies);
        setTransferCanCrossCompany(!!r.data?.can_cross_company && companies.length > 1);
        setTransferUsers(users);
        setTransferDepartments(departments);

        const isPrivileged = isAdminLike(user) || user?.role === 'sales_admin';
        const uidRegions = Array.isArray(user?.crm_region_ids) ? user.crm_region_ids.map(String) : [];
        let selectable = regions;
        if (!isPrivileged && uidRegions.length) {
          selectable = regions.filter((reg) => uidRegions.includes(String(reg.id)));
        }
        setTransferRegions(selectable);
        // Nếu khu vực hiện tại không thuộc CRM (vd. khu vực SX) → bỏ chọn mặc định
        const curRid = lead?.region_id ? String(lead.region_id) : '';
        if (curRid && !selectable.some((reg) => String(reg.id) === curRid)) {
          setTransferRegionId('');
          setTransferAssigneeId('');
        }
      })
      .catch(() => {
        setTransferRegions([]);
        setTransferRegionError('Không tải được danh sách khu vực/công ty.');
      })
      .finally(() => setTransferRegionsLoading(false));
  };

  const loadTransferOptionsForCompany = (companyId) => {
    if (!companyId) {
      setTransferRegions([]);
      setTransferUsers([]);
      setTransferDepartments([]);
      return;
    }
    setTransferRegionsLoading(true);
    setTransferRegionError('');
    api.get(`/crm/leads/${id}/transfer-options`, { params: { company_id: companyId } })
      .then((r) => {
        const regions = (Array.isArray(r.data?.regions) ? r.data.regions : []).filter((x) => x.is_active !== false);
        const users = Array.isArray(r.data?.users) ? r.data.users : [];
        const departments = Array.isArray(r.data?.departments) ? r.data.departments : [];
        if (Array.isArray(r.data?.companies) && r.data.companies.length) {
          setTransferCompanies(r.data.companies);
          setTransferCanCrossCompany(!!r.data?.can_cross_company && r.data.companies.length > 1);
        }
        setTransferRegions(regions);
        setTransferUsers(users);
        setTransferDepartments(departments);
      })
      .catch(() => {
        setTransferRegions([]);
        setTransferUsers([]);
        setTransferDepartments([]);
        setTransferRegionError('Không tải được danh sách khu vực.');
      })
      .finally(() => setTransferRegionsLoading(false));
  };

  const submitTransferRegion = async () => {
    if (!transferCompanyId) {
      setTransferRegionError('Vui lòng chọn công ty.');
      return;
    }
    if (!transferRegionId) {
      setTransferRegionError('Vui lòng chọn khu vực.');
      return;
    }
    if (!transferAssigneeId) {
      setTransferRegionError('Vui lòng chọn nhân viên phụ trách.');
      return;
    }
    const companyChanged = String(transferCompanyId) !== String(lead?.company_id || '');
    const regionChanged = String(transferRegionId) !== String(lead?.region_id || '');
    const assigneeChanged = String(transferAssigneeId) !== String(lead?.assigned_to || lead?.lead_owner_id || '');
    if (!companyChanged && !regionChanged && !assigneeChanged) {
      setTransferRegionError('Chưa có thay đổi công ty, khu vực hoặc người phụ trách.');
      return;
    }
    setTransferRegionSaving(true);
    setTransferRegionError('');
    try {
      if (companyChanged || regionChanged) {
        await api.post(`/crm/leads/${id}/transfer-region`, {
          company_id: transferCompanyId,
          region_id: transferRegionId,
          assigned_to: transferAssigneeId,
        });
      } else {
        await api.put(`/crm/leads/${id}`, {
          assigned_to: transferAssigneeId,
          lead_owner_id: transferAssigneeId,
        });
      }
      setShowTransferRegionModal(false);
      await load({ silent: true });
    } catch (e) {
      setTransferRegionError(e.response?.data?.error || e.message || 'Không chuyển được người phụ trách.');
    } finally {
      setTransferRegionSaving(false);
    }
  };

  const canDeleteLeadDeal = canUserDeleteCrmLeadDeal({
    pipeline: pipelineConfig,
    type: lead.type,
    user,
  });
  const canManageDeal = isDealResponsibleUser(user, lead);

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
    input.multiple = true;
    input.accept = TASK_ATTACHMENT_FILE_ACCEPT;
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 50);
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
            <button
              onClick={() => {
                autoCreateCalledRef.current = false;
                setAutoCreateStatus(null);
                setPickProjectCompanyId(
                  lead?.company_id
                    ? String(lead.company_id)
                    : (isAdminUser ? findDefaultAdminCompanyPhucDat(productionCompaniesSx) : ''),
                );
                setPickProjectCompanyErr('');
                setPickProjectCompanyOpen(true);
              }}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition"
            >
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
      <div className="flex items-center justify-between" data-tour="lead-detail-header">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-tour="lead-detail-back"
            title="Quay lại Kanban CRM"
            onClick={() => { persistCrmPipelineUiNow(); if (lead?.type === 'deal') localStorage.setItem('crm_pinned_tab', 'deal'); markCrmPipelineCardFocus(id); navigate('/crm/dashboard'); }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:text-indigo-600 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          {/* Per-user flags: ghim + đã tương tác (manual toggle) */}
          <button
            type="button"
            data-tour="lead-detail-pin"
            title={lead?.is_pinned ? 'Bỏ ghim' : 'Ghim lead/deal lên đầu Kanban'}
            onClick={async () => {
              const next = !lead?.is_pinned;
              setLead((prev) => prev ? { ...prev, is_pinned: next, pinned_at: next ? new Date().toISOString() : null } : prev);
              try {
                if (next) await api.post(`/crm/leads/${id}/pin`);
                else await api.delete(`/crm/leads/${id}/pin`);
              } catch (e) {
                setLead((prev) => prev ? { ...prev, is_pinned: !next } : prev);
                alert(e?.response?.data?.error || 'Lỗi cập nhật ghim');
              }
            }}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer border shadow-sm transition-all ${
              lead?.is_pinned
                ? 'bg-amber-100 border-amber-400 text-amber-700 shadow-amber-200/60 ring-2 ring-amber-300/50 hover:bg-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 hover:border-amber-300 hover:shadow-md'
            }`}
          >
            <Pin className={`h-5 w-5 ${lead?.is_pinned ? 'rotate-45 fill-amber-500' : ''}`} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            data-tour="lead-detail-interact"
            title={lead?.is_interacted ? 'Bỏ đã tương tác' : 'Đánh dấu đã tương tác với khách'}
            onClick={async () => {
              const next = !lead?.is_interacted;
              setLead((prev) => prev ? { ...prev, is_interacted: next, interacted_at: next ? new Date().toISOString() : null } : prev);
              try {
                if (next) await api.post(`/crm/leads/${id}/interacted`);
                else await api.delete(`/crm/leads/${id}/interacted`);
              } catch (e) {
                setLead((prev) => prev ? { ...prev, is_interacted: !next } : prev);
                alert(e?.response?.data?.error || 'Lỗi cập nhật trạng thái tương tác');
              }
            }}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl cursor-pointer border shadow-sm transition-all ${
              lead?.is_interacted
                ? 'bg-blue-100 border-blue-400 text-blue-700 shadow-blue-200/60 ring-2 ring-blue-300/50 hover:bg-blue-200'
                : 'bg-sky-50 border-sky-200 text-sky-600 hover:bg-sky-100 hover:border-sky-300 hover:shadow-md'
            }`}
          >
            <CheckCircle2 className={`h-5 w-5 ${lead?.is_interacted ? 'fill-blue-500 text-white' : ''}`} strokeWidth={2.25} />
          </button>
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
                      const nextTitle = leadTitleDraft.trim();
                      const { data } = await api.put(`/crm/leads/${id}`, { title: nextTitle });
                      const savedTitle = data?.title || nextTitle;
                      setLead(prev => ({ ...prev, ...data, title: savedTitle }));
                      setLeadTitleDraft(savedTitle);
                      setEditingLeadTitle(false);
                      // Đồng bộ cache Kanban CRM — tránh card ngoài vẫn tên cũ khi quay lại <30s
                      patchCrmDashboardCacheLeadFields(id, { title: savedTitle });
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
            {/* Phân loại (Loại lead/deal) — hiển thị dưới tên */}
            <div className="mt-1">
              {(() => {
                const typeName =
                  lead?.lead_type_id
                    ? (headerLeadTypes.find((t) => String(t.id) === String(lead.lead_type_id))?.name || '')
                    : '';
                const showName = !!typeName;
                /** Có UUID loại nhưng danh mục theo công ty hiện tại không có dòng tương ứng — vẫn phải hiện, tránh "mất nhãn" sau đồng bộ / đổi công ty */
                const showTypeIdWithoutLabel = !!lead?.lead_type_id && !typeName && headerLeadTypes.length > 0;
                const showMissing = !lead?.lead_type_id && headerLeadTypes.length > 0;
                const showNoCatalog = headerLeadTypes.length === 0;
                if (!showName && !showTypeIdWithoutLabel && !showMissing && !showNoCatalog) return null;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-gray-500">🏷️ Phân loại:</span>
                    {showName ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        {typeName}
                      </span>
                    ) : showTypeIdWithoutLabel ? (
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50/80 text-amber-900 border border-amber-200"
                        title="Loại vẫn lưu trên deal nhưng không nằm trong danh mục phân loại của công ty đang xem (hoặc loại đã tắt). Có thể chọn lại ở mục Thông tin."
                      >
                        Đã gán loại (không có trong danh mục công ty này)
                      </span>
                    ) : showMissing ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                        Chưa chọn
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                        Chưa cấu hình
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap" data-tour="lead-detail-actions">
          <button
            type="button"
            data-tour="lead-detail-tour-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Event toàn cục — không phụ thuộc context (tránh HMR / null context)
              window.dispatchEvent(new CustomEvent('product-tour:start', {
                detail: {
                  id: CRM_LEAD_DEAL_DETAIL_TOUR_ID || 'crm-lead-deal-detail',
                  preferCurrentPath: true,
                },
              }));
              // Fallback nếu listener chưa gắn
              window.setTimeout(() => {
                if (!document.querySelector('[data-product-tour-overlay]')) {
                  productTour?.startTour?.(CRM_LEAD_DEAL_DETAIL_TOUR_ID || 'crm-lead-deal-detail', {
                    preferCurrentPath: true,
                  });
                }
              }, 50);
            }}
            className="h-9 px-3 bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            title="Hướng dẫn chi tiết trang Lead / Deal"
          >
            <BookOpen className="h-4 w-4" />
            Hướng dẫn chi tiết
          </button>
          {canConvert && (
            <button
              type="button"
              data-tour="lead-convert-deal"
              onClick={() => setShowConvertModal(true)}
              className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="h-4 w-4" /> Chuyển Deal
            </button>
          )}
          {canRevertToLead && (
            <button
              type="button"
              data-tour="lead-revert-lead"
              onClick={() => setShowRevertModal(true)}
              title="Trả deal lại về Lead và chọn lại người phụ trách"
              className="h-9 px-3 bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Trả về Lead
            </button>
          )}
          {canTransferRegion && (
            <button
              type="button"
              data-tour="lead-transfer-assignee"
              onClick={openTransferRegionModal}
              title="Chuyển công ty/khu vực và người phụ trách"
              className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <User className="h-4 w-4" /> Chuyển người phụ trách
            </button>
          )}
          <button
            type="button"
            data-tour="lead-create-event"
            onClick={() => {
              setShowCreateEvent(true);
              if (!createEventTypes.length) {
                api.get('/events/event-types').then((r) => setCreateEventTypes(r.data || [])).catch(() => {});
              }
            }}
            className="h-9 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            title="Tạo sự kiện liên kết với lead/deal này"
          >
            <Calendar className="h-4 w-4" /> Tạo sự kiện
          </button>
          {surveyFillMeta ? (
            <button
              type="button"
              data-tour="lead-survey-fill-form"
              onClick={() => {
                setActiveTab('tasks');
                setOpenFillFormToken((n) => n + 1);
              }}
              className={`h-11 px-5 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer shadow-sm ${
                surveyFillMeta.filled
                  ? 'bg-orange-100 text-orange-900 border-2 border-orange-300 hover:bg-orange-200'
                  : 'bg-orange-600 hover:bg-orange-700 text-white border-2 border-orange-600'
              }`}
              title={surveyFillMeta.title}
            >
              {surveyFillMeta.filled
                ? <ClipboardPen className="h-5 w-5" />
                : <Plus className="h-5 w-5" />}
              {surveyFillMeta.filled ? 'Sửa phiếu khảo sát' : 'Thêm phiếu khảo sát'}
            </button>
          ) : null}
          <button
            type="button"
            data-tour="lead-import-excel"
            onClick={() => setShowExcelImport(true)}
            className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
          >
            📥 Import Excel
          </button>
        </div>
      </div>

      {/* Lost Banner — hiển thị nổi bật khi deal/lead thua */}
      {(lead?.lost_reason || stages.find((s) => s.id === lead.stage_id)?.is_lost) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-lg shrink-0">❌</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-red-700">THUA / MẤT</span>
              <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full">Đã kết thúc</span>
            </div>
            {lead.lost_reason && (
              <p className="text-sm text-red-800 font-medium">Lý do: {lead.lost_reason}</p>
            )}
            {lead.lost_at && (
              <p className="text-xs text-red-400 mt-1">Vào lúc {new Date(lead.lost_at).toLocaleString('vi-VN')}</p>
            )}
            {lead.type === 'deal' && (
              <button
                type="button"
                onClick={reopenLostRecord}
                disabled={reopeningLost}
                className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-50 shadow-sm"
              >
                {reopeningLost ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {reopeningLost ? 'Đang hồi lại…' : 'Hồi lại deal'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Banner lý do trả Deal → Lead */}
      {lead?.type === 'lead' && lead?.revert_to_lead_reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg shrink-0">↩️</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-amber-800">ĐÃ TRẢ TỪ DEAL VỀ LEAD</span>
            </div>
            <p className="text-sm text-amber-900 font-medium">Lý do: {lead.revert_to_lead_reason}</p>
          </div>
        </div>
      )}

      {/* Pipeline Progress - MISA Style Stepper */}
      {lead?.type === 'deal' && lead?.project_id && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            Deal đã có dự án SX — tiến độ xưởng/VC qua badge và module xưởng. Có thể thêm xưởng khác bên dưới.
          </p>
          <div className="rounded-xl border border-teal-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-gray-900">Dự án sản xuất</h4>
              <button
                type="button"
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700"
                onClick={() => { setAddSxErr(''); setAddSxTargets([]); setAddSxOpen(true); }}
              >
                + Thêm dự án SX
              </button>
            </div>
            <ul className="space-y-1.5">
              {(() => {
                const rows = Array.isArray(lead.production_projects) && lead.production_projects.length
                  ? lead.production_projects
                  : [{ project_id: lead.project_id, code: lead.linked_project?.code, name: lead.linked_project?.name, is_primary: true }];
                const showPrimary = rows.length <= 1;
                return rows.map((pp) => (
                <li key={pp.project_id || pp.code} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {pp.code || '—'} {showPrimary && pp.is_primary ? <span className="text-teal-700 font-normal">(chính)</span> : null}
                    </p>
                    <p className="text-gray-600 truncate">
                      {[pp.company_name, pp.workshop_type_name || pp.label, pp.name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {pp.project_id && (
                    <button
                      type="button"
                      className="shrink-0 text-teal-700 font-semibold hover:underline"
                      onClick={() => navigate(`/sx/projects/${pp.project_id}`)}
                    >
                      Mở SX
                    </button>
                  )}
                </li>
              ));
              })()}
            </ul>
          </div>
        </div>
      )}

      {addSxOpen && lead?.type === 'deal' && lead?.project_id && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { if (!addSxBusy) { setAddSxOpen(false); setAddSxErr(''); setAddSxTargets([]); } }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Thêm dự án SX</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Tạo thêm thẻ Kanban tại xưởng khác (vd. tủ ở HCB khi đã có cửa ở Phúc Đạt).
            </p>
            <SxMultiTargetPicker
              key="add-sx"
              companies={parentSxCompaniesForSelect}
              leadTypeRow={parentSxLeadTypeRow}
              kind={parentSxLeadKind}
              accent="teal"
              disabled={addSxBusy}
              onChange={(rows) => { setAddSxTargets(rows); setAddSxErr(''); }}
            />
            {addSxErr && <p className="text-xs text-red-600 mt-2">{addSxErr}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={addSxBusy}
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => { setAddSxOpen(false); setAddSxErr(''); setAddSxTargets([]); }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={addSxBusy || !!validateSxTargets(addSxTargets)}
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                onClick={() => submitAddSxProject()}
              >
                {addSxBusy ? 'Đang tạo…' : 'Thêm dự án'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div data-tour="lead-pipeline-stepper">
        <PipelineStepper
          stages={stages}
          currentStageId={lead.stage_id}
          currentStageName={lead.stage?.name}
          onMoveToStage={moveStage}
          visitedStageIds={visitedStageIds}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left: Customer Info */}
        <div className="lg:col-span-1 space-y-4 min-w-0" data-tour="lead-sidebar">
          {/* Customer Card - Inline Edit */}
          <div className="bg-white rounded-xl border p-5 space-y-4" data-tour="lead-info-customer">
            <h3 className="text-sm font-bold uppercase" style={{ color: '#000000' }}>Khách hàng</h3>
            
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
                        <p className="text-sm font-medium hover:bg-gray-50 p-1 rounded cursor-pointer group-hover:bg-gray-50" style={{ color: '#000000' }}
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
                        <p className="text-sm font-medium hover:bg-gray-50 p-1 rounded cursor-pointer group-hover:bg-gray-50" style={{ color: '#000000' }}
                          onClick={() => startEditField(field, customer[field])}>
                          {customer[field] || '—'} <Edit2 className="h-3 w-3 inline opacity-0 group-hover:opacity-100 ml-1" />
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <CustomerCreateForm lead={lead} leadId={lead?.id} onCreated={(c) => { setCustomer(c); load({ silent: true }); }} />
            )}
          </div>

          {/* Lead Info — Editable inline */}
          <LeadInfoPanel
            lead={lead}
            allUsers={allUsers}
            onUpdate={() => {
              load({ silent: true });
              setCrmTasksRefreshKey((k) => k + 1);
            }}
            currentUser={user}
            productionCompaniesSx={productionCompaniesSx}
            onOpenTransferAssignee={canTransferRegion ? openTransferRegionModal : null}
          />

          {/* Quick Stats Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center cursor-pointer hover:bg-blue-100/80 transition-colors"
              onClick={() => setActiveTab('notes')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('notes'); }}
              role="button"
              tabIndex={0}
              title="Xem tab Ghi chú & Hoạt động"
            >
              <p className="text-xs text-gray-600 mb-1">Ghi chú / HĐ</p>
              <p className="text-xl font-bold text-blue-600">{activities.length}</p>
            </div>
            <div
              className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center cursor-pointer hover:bg-amber-100/80 transition-colors"
              onClick={() => setActiveTab('documents')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('documents'); }}
              role="button"
              tabIndex={0}
              title="Xem tab Tài liệu"
            >
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{documentsTabTotal}</p>
            </div>
            <div
              className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center cursor-pointer hover:bg-purple-100/80 transition-colors"
              onClick={() => setActiveTab('documents')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('documents'); }}
              role="button"
              tabIndex={0}
              title="Số file đính kèm trên nhiệm vụ"
            >
              <p className="text-xs text-gray-600 mb-1">File NV</p>
              <p className="text-xl font-bold text-purple-600">{taskFileCount}</p>
            </div>
            <div
              className="bg-emerald-50 rounded-lg border border-emerald-100 p-3 text-center cursor-pointer hover:bg-emerald-100/80 transition-colors"
              onClick={() => setActiveTab('documents')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('documents'); }}
              role="button"
              tabIndex={0}
              title="Số ghi chú trên nhiệm vụ"
            >
              <p className="text-xs text-gray-600 mb-1">Ghi chú NV</p>
              <p className="text-xl font-bold text-emerald-600">{taskNoteCount}</p>
            </div>
          </div>
        </div>

        {/* Right: Documents + Activities with Tabs */}
        <div className="lg:col-span-3 space-y-4 min-w-0">
          {/* Tab Switcher */}
          <div className="bg-white rounded-xl border" data-tour="lead-detail-tabs">
            <div className="flex border-b">
              <button
                type="button"
                data-tour="lead-tab-tasks"
                onClick={() => setActiveTab('tasks')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'tasks'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Nhiệm vụ CRM (pipeline deal / lead)"
              >
                ✅ Công việc
              </button>
              <button
                type="button"
                data-tour="lead-tab-shared"
                onClick={() => setActiveTab('shared-workspace')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'shared-workspace'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Phân công thành viên deal và nhiệm vụ giao chéo công ty"
              >
                🤝 Không gian chung
              </button>
              <button
                type="button"
                data-tour="lead-tab-orders"
                onClick={() => setActiveTab('purchase_orders')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'purchase_orders'
                    ? 'text-amber-700 border-b-2 border-amber-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Lệnh đặt hàng của deal — lọc theo trạng thái"
              >
                🛒 Đặt hàng
                {dealPurchaseOrders.length > 0 && (
                  <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                    activeTab === 'purchase_orders' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {dealPurchaseOrders.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                data-tour="lead-tab-documents"
                onClick={() => setActiveTab('documents')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'documents'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📋 Tài liệu
                {documentsTabTotal > 0 && (
                  <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                    activeTab === 'documents' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {documentsTabTotal}
                  </span>
                )}
              </button>
              <button
                type="button"
                data-tour="lead-tab-drive"
                onClick={() => setActiveTab('drive')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'drive'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="File trên Google Drive đã gắn vào lead/deal này"
              >
                ☁️ Drive
                {driveFileCount > 0 && (
                  <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                    activeTab === 'drive' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {driveFileCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                data-tour="lead-tab-notes"
                onClick={() => setActiveTab('notes')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'notes'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Ghi chú và lịch sử hoạt động"
              >
                📝 Ghi chú & HĐ
                {activities.length > 0 && (
                  <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                    activeTab === 'notes' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {activities.length}
                  </span>
                )}
              </button>
              {inboxChannel === 'facebook' && (
              <button
                type="button"
                data-tour="lead-tab-facebook"
                onClick={() => setActiveTab('facebook')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'facebook'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📘 Facebook
              </button>
              )}
              {inboxChannel === 'zalo' && (
              <button
                type="button"
                data-tour="lead-tab-zalo"
                onClick={() => setActiveTab('zalo')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'zalo'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💬 Zalo OA
              </button>
              )}
              <button
                type="button"
                data-tour="lead-tab-team"
                onClick={() => setActiveTab('team')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'team'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
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
              </button>
              <button
                type="button"
                data-tour="lead-tab-comments"
                onClick={() => setActiveTab('comments')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                  activeTab === 'comments'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💬 Bình luận
                {commentCount > 0 && (
                  <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                    activeTab === 'comments' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {commentCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                data-tour="lead-tab-voice"
                onClick={() => setActiveTab('voice_crm')}
                className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all inline-flex items-center justify-center gap-1 ${
                  activeTab === 'voice_crm'
                    ? 'text-violet-600 border-b-2 border-violet-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Mic className="h-3.5 w-3.5 shrink-0" />
                Ghi âm
              </button>
              {lead?.type === 'deal' && isDealHoanThanhForZalo && (
                <button
                  type="button"
                  data-tour="lead-tab-scores"
                  onClick={() => setActiveTab('deal_scores')}
                  className={`relative flex-1 py-3 px-4 text-sm font-medium transition-all ${
                    activeTab === 'deal_scores'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Chỉ hiện sau khi deal ở cột Hoàn thành"
                >
                  ⭐ Điểm chéo & KH
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {activeTab === 'tasks' ? (
                <>
                <CRMTasksTab
                  leadId={id}
                  leadType={lead?.type || 'lead'}
                  users={allUsers}
                  focusTaskId={searchParams.get('crm_task') || null}
                  onArtifactsSynced={refreshTaskSyncedDocuments}
                  onLeadSynced={() => {
                    load({ silent: true });
                    setCrmTasksRefreshKey((k) => k + 1);
                  }}
                  refreshKey={crmTasksRefreshKey}
                  sxTemplateCompanyId={lead?.sx_template_company_id || null}
                  linkedProjectId={lead?.project_id || null}
                  dealResponsible={lead}
                  openFillFormToken={openFillFormToken}
                  onSurveyFillMetaChange={handleSurveyFillMetaChange}
                />
                <div className="mt-6">
                  <UnifiedTaskHistoryWidget
                    leadId={id}
                    projectId={lead?.project_id || undefined}
                    refreshKey={crmTasksRefreshKey}
                  />
                </div>
                </>
              ) : activeTab === 'shared-workspace' ? (
                <DealSharedWorkspaceTab
                  leadId={id}
                  leadType={lead?.type || 'lead'}
                  users={allUsers}
                  taskScope="production"
                  defaultAssignModule="crm"
                  companyId={lead?.company_id || null}
                  sxCompanyId={lead?.sx_template_company_id || null}
                  onArtifactsSynced={refreshTaskSyncedDocuments}
                  refreshKey={crmTasksRefreshKey}
                  sxTemplateCompanyId={lead?.sx_template_company_id || null}
                  linkedProjectId={lead?.project_id || null}
                  dealResponsible={lead}
                />
              ) : activeTab === 'purchase_orders' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Đặt hàng</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{dealPurchaseOrders.length} bản ghi · chọn SP từ catalog</p>
                    </div>
                    <button
                      type="button"
                      onClick={openPoCreateForm}
                      className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setPoStatusFilter('')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${!poStatusFilter ? 'bg-amber-600 text-white border-amber-600' : 'hover:bg-gray-50'}`}
                    >
                      Tất cả
                      <span className={`min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${!poStatusFilter ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {dealPurchaseOrders.length}
                      </span>
                    </button>
                    {Object.entries(PO_STATUS).map(([k, v]) => {
                      const n = dealPurchaseOrders.filter((o) => o.status === k).length;
                      if (!n) return null;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setPoStatusFilter(poStatusFilter === k ? '' : k)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${poStatusFilter === k ? 'bg-amber-600 text-white border-amber-600' : PO_COLORS[k]}`}
                        >
                          {v}
                          <span className={`min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${poStatusFilter === k ? 'bg-white/25 text-white' : 'bg-black/5'}`}>
                            {n}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const filtered = poStatusFilter
                      ? dealPurchaseOrders.filter((o) => o.status === poStatusFilter)
                      : dealPurchaseOrders;
                    if (!filtered.length) {
                      return (
                        <div className="text-center py-10 text-gray-400">
                          <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Chưa có đặt hàng</p>
                          <button
                            type="button"
                            onClick={openPoCreateForm}
                            className="mt-3 h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium cursor-pointer"
                          >
                            Thêm mới
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-auto rounded-lg border" style={{ maxHeight: 'min(480px, 60vh)' }}>
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr className="border-b text-left text-xs text-gray-500 uppercase">
                              <th className="py-2.5 px-3">Mã</th>
                              <th className="py-2.5 px-3">Tiêu đề</th>
                              <th className="py-2.5 px-3 text-right">Tổng</th>
                              <th className="py-2.5 px-3">Trạng thái</th>
                              <th className="py-2.5 px-3">Ngày</th>
                              <th className="py-2.5 px-3 w-32" />
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((o) => (
                              <tr key={o.id} className="border-b hover:bg-amber-50/40">
                                <td className="py-2.5 px-3 font-bold text-amber-700">{o.code}</td>
                                <td className="py-2.5 px-3 font-medium">{o.title || '—'}</td>
                                <td className="py-2.5 px-3 text-right font-semibold">{formatVND(o.total || 0)}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${PO_COLORS[o.status] || ''}`}>
                                    {PO_STATUS[o.status] || o.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs">{formatDate(o.order_date || o.created_at)}</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex gap-1 justify-end">
                                    <button
                                      type="button"
                                      className="p-1.5 text-gray-400 hover:text-amber-700 cursor-pointer"
                                      title="Xem chi tiết"
                                      onClick={() => openPoDetail(o.id)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="p-1.5 text-gray-400 hover:text-amber-600 cursor-pointer"
                                      title="Sửa"
                                      onClick={async () => {
                                        try {
                                          const { data } = await api.get(`/purchasing/orders/${o.id}`);
                                          setPoEditing(data);
                                          setPoForm({
                                            title: data.title || '',
                                            notes: data.notes || '',
                                            status: data.status || 'draft',
                                            order_date: data.order_date || '',
                                            items: (data.items || []).map((it) => ({
                                              product_id: it.product_id,
                                              name: it.name,
                                              description: it.description,
                                              unit: it.unit || 'cái',
                                              quantity: it.quantity ?? 1,
                                              unit_price: it.unit_price ?? 0,
                                              amount: it.amount ?? 0,
                                              brand_name: it.brand_name,
                                              sku: it.sku,
                                              image_url: it.image_url,
                                            })),
                                          });
                                          setPoCatBrand('');
                                          setPoCatCategory('');
                                          setPoCatSearch('');
                                          setPoManualName('');
                                          setPoManualQty(1);
                                          setPoManualPrice('');
                                          setPoFormOpen(true);
                                        } catch (e) {
                                          alert(e.response?.data?.error || 'Lỗi tải');
                                        }
                                      }}
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="p-1.5 text-gray-400 hover:text-red-600 cursor-pointer"
                                      title="Xóa"
                                      onClick={async () => {
                                        if (!confirm(`Xóa ${o.code}?`)) return;
                                        try {
                                          await api.delete(`/purchasing/orders/${o.id}`);
                                          loadDealPurchaseOrders();
                                        } catch (e) {
                                          alert(e.response?.data?.error || 'Lỗi xóa');
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {poDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 pb-3 border-b shrink-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="font-bold text-lg">{poDetail.code || 'Chi tiết đặt hàng'}</h2>
                              {poDetail.status && (
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${PO_COLORS[poDetail.status] || ''}`}>
                                  {PO_STATUS[poDetail.status] || poDetail.status}
                                </span>
                              )}
                            </div>
                            {poDetail.title && (
                              <p className="text-sm text-gray-600 mt-0.5 truncate">{poDetail.title}</p>
                            )}
                          </div>
                          <button type="button" onClick={() => setPoDetail(null)} className="p-1 cursor-pointer shrink-0">
                            <X className="h-5 w-5 text-gray-400" />
                          </button>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
                          {poDetailLoading || !poDetail.code ? (
                            <div className="flex justify-center py-12">
                              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg border p-3">
                                  <div className="text-[11px] uppercase text-gray-400 font-medium">Ngày đặt</div>
                                  <div className="font-medium mt-0.5">{formatDate(poDetail.order_date || poDetail.created_at)}</div>
                                </div>
                                <div className="rounded-lg border p-3">
                                  <div className="text-[11px] uppercase text-gray-400 font-medium">Tổng tiền</div>
                                  <div className="font-bold text-amber-700 mt-0.5">{formatVND(poDetail.total || 0)}</div>
                                </div>
                                <div className="rounded-lg border p-3 col-span-2">
                                  <div className="text-[11px] uppercase text-gray-400 font-medium">Khách hàng</div>
                                  <div className="font-medium mt-0.5">{poDetail.customer_name || '—'}</div>
                                  {poDetail.customer_phone && (
                                    <div className="text-xs text-gray-500">{poDetail.customer_phone}</div>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr className="border-b text-left text-xs text-gray-500 uppercase">
                                      <th className="py-2 px-3">Sản phẩm</th>
                                      <th className="py-2 px-3 text-right">SL</th>
                                      <th className="py-2 px-3 text-right">Đơn giá</th>
                                      <th className="py-2 px-3 text-right">Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(poDetail.items || []).map((it) => (
                                      <tr key={it.id || `${it.name}-${it.item_order}`} className="border-b">
                                        <td className="py-2 px-3">
                                          <div className="font-medium">{it.name}</div>
                                          {(it.brand_name || it.sku) && (
                                            <div className="text-[10px] text-gray-400">{[it.brand_name, it.sku].filter(Boolean).join(' · ')}</div>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right">{it.quantity} {it.unit || ''}</td>
                                        <td className="py-2 px-3 text-right">{formatVND(it.unit_price || 0)}</td>
                                        <td className="py-2 px-3 text-right font-medium">{formatVND(it.amount || 0)}</td>
                                      </tr>
                                    ))}
                                    {!(poDetail.items || []).length && (
                                      <tr>
                                        <td colSpan={4} className="py-6 text-center text-gray-400 text-sm">Không có dòng hàng</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                                <div className="px-3 py-2.5 border-t text-sm flex flex-col items-end gap-0.5 bg-gray-50/50">
                                  <div className="flex gap-6"><span className="text-gray-500">Tạm tính</span><span className="w-28 text-right">{formatVND(poDetail.subtotal || 0)}</span></div>
                                  <div className="flex gap-6"><span className="text-gray-500">VAT ({poDetail.tax_rate ?? 10}%)</span><span className="w-28 text-right">{formatVND(poDetail.tax_amount || 0)}</span></div>
                                  <div className="flex gap-6 font-bold"><span>Tổng</span><span className="w-28 text-right text-amber-700">{formatVND(poDetail.total || 0)}</span></div>
                                </div>
                              </div>
                              {poDetail.notes && (
                                <div className="rounded-lg border p-3 text-sm">
                                  <div className="text-[11px] uppercase text-gray-400 font-medium mb-1">Ghi chú</div>
                                  <p className="whitespace-pre-wrap text-gray-700">{poDetail.notes}</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex justify-end gap-2 p-5 pt-3 border-t shrink-0">
                          <button type="button" onClick={() => setPoDetail(null)} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">
                            Đóng
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {poFormOpen && (() => {
                    const selectedIds = new Set((poForm.items || []).map((it) => String(it.product_id)).filter((x) => x && x !== 'null' && x !== 'undefined'));
                    const q = poCatSearch.trim().toLowerCase();
                    const filteredProducts = (poCatalog.products || []).filter((p) => {
                      if (!q) return true;
                      return (p.name || '').toLowerCase().includes(q)
                        || (p.code || '').toLowerCase().includes(q)
                        || (p.sku || '').toLowerCase().includes(q)
                        || (p.brand?.name || '').toLowerCase().includes(q);
                    });
                                    const filteredCategories = poCatalog.categories || [];
                                    const itemsSubtotal = (poForm.items || []).reduce(
                      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
                      0,
                    );
                    return (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                          <div className="flex items-center justify-between p-5 pb-3 border-b shrink-0">
                            <h2 className="font-bold text-lg">{poEditing ? 'Sửa đặt hàng' : 'Thêm đặt hàng'}</h2>
                            <button type="button" onClick={() => setPoFormOpen(false)} className="p-1 cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
                          </div>
                          <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
                            <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-sm">
                              <div className="text-[11px] uppercase font-medium text-amber-700/80">Gắn deal</div>
                              <div className="font-semibold text-gray-900 mt-0.5">
                                {customer?.full_name || lead?.title || '—'}
                                {lead?.code ? <span className="text-gray-400 font-normal text-xs ml-2">{lead.code}</span> : null}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-0.5">Tiêu đề LDH tự theo deal · hiện liên kết ở module Mua hàng</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600">Ngày</label>
                                <input type="date" value={poForm.order_date} onChange={(e) => setPoForm({ ...poForm, order_date: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Trạng thái</label>
                                <select value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                                  {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
                              <div className="text-xs font-semibold text-gray-700">Nhập tên hoặc chọn từ catalog</div>
                              <div className="flex flex-wrap gap-2 items-end">
                                <div className="flex-1 min-w-[160px]">
                                  <label className="text-[11px] text-gray-500">Tên hàng *</label>
                                  <input
                                    value={poManualName}
                                    onChange={(e) => setPoManualName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPoManualItem(); } }}
                                    placeholder="Gõ tên hạng mục / SP rồi Thêm"
                                    className="w-full h-9 px-2.5 border rounded-lg text-sm bg-white mt-0.5"
                                  />
                                </div>
                                <div className="w-20">
                                  <label className="text-[11px] text-gray-500">SL</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={poManualQty}
                                    onChange={(e) => setPoManualQty(e.target.value)}
                                    className="w-full h-9 px-2 border rounded-lg text-sm bg-white mt-0.5"
                                  />
                                </div>
                                <div className="w-28">
                                  <label className="text-[11px] text-gray-500">Đơn giá</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={poManualPrice}
                                    onChange={(e) => setPoManualPrice(e.target.value)}
                                    className="w-full h-9 px-2 border rounded-lg text-sm bg-white mt-0.5"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={addPoManualItem}
                                  className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium cursor-pointer"
                                >
                                  + Thêm
                                </button>
                              </div>
                              <div className="text-[11px] text-gray-500 pt-1">Hoặc lọc & tick SP catalog:</div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">                                <select
                                  value={poCatBrand}
                                  onChange={(e) => setPoCatBrand(e.target.value)}
                                  className="h-9 px-2 border rounded-lg text-sm bg-white"
                                >
                                  <option value="">Tất cả thương hiệu</option>
                                  {(poCatalog.brands || []).map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                                <select
                                  value={poCatCategory}
                                  onChange={(e) => setPoCatCategory(e.target.value)}
                                  className="h-9 px-2 border rounded-lg text-sm bg-white"
                                >
                                  <option value="">Tất cả danh mục</option>
                                  {filteredCategories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                  <input
                                    value={poCatSearch}
                                    onChange={(e) => setPoCatSearch(e.target.value)}
                                    placeholder="Tìm tên / mã / SKU"
                                    className="w-full h-9 pl-8 pr-2 border rounded-lg text-sm bg-white"
                                  />
                                </div>
                              </div>
                              <div className="border rounded-lg bg-white max-h-44 overflow-y-auto">
                                {poCatalogLoading ? (
                                  <p className="text-center text-xs text-gray-400 py-6">Đang tải catalog...</p>
                                ) : filteredProducts.length === 0 ? (
                                  <p className="text-center text-xs text-gray-400 py-6">Không có sản phẩm phù hợp</p>
                                ) : (
                                  filteredProducts.slice(0, 80).map((p) => {
                                    const checked = selectedIds.has(String(p.id));
                                    return (
                                      <label
                                        key={p.id}
                                        className={`flex items-center gap-2.5 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-amber-50/60 ${checked ? 'bg-amber-50' : ''}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => togglePoProduct(p)}
                                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        {p.image_url ? (
                                          <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                                        ) : (
                                          <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                            <Package className="h-3.5 w-3.5 text-gray-400" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div className="text-sm font-medium truncate">{p.name}</div>
                                          <div className="text-[10px] text-gray-400 truncate">
                                            {[p.brand?.name, p.code || p.sku].filter(Boolean).join(' · ')}
                                          </div>
                                        </div>
                                        <div className="text-xs font-medium text-gray-600 shrink-0">
                                          {formatVND(Number(p.cost_price) || Number(p.selling_price) || 0)}
                                        </div>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              {selectedIds.size > 0 && (
                                <p className="text-[11px] text-amber-700 font-medium">Đã chọn {selectedIds.size} SP · tick lại để bỏ</p>
                              )}
                            </div>

                            {(poForm.items || []).length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">Dòng hàng đã chọn</div>
                                {(poForm.items || []).map((it, idx) => (
                                  <div key={`${it.product_id || it.name}-${idx}`} className="flex flex-wrap items-center gap-2 border rounded-lg p-2.5">
                                    <div className="min-w-0 flex-1 basis-[140px]">
                                      <input
                                        value={it.name || ''}
                                        onChange={(e) => updatePoItem(idx, { name: e.target.value })}
                                        className="w-full h-8 px-2 border rounded text-sm font-medium"
                                        placeholder="Tên hàng"
                                      />
                                      {(it.brand_name || it.sku) && (
                                        <div className="text-[10px] text-gray-400 mt-0.5">{[it.brand_name, it.sku].filter(Boolean).join(' · ')}</div>
                                      )}
                                    </div>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      title="Số lượng"
                                      value={it.quantity}
                                      onChange={(e) => updatePoItem(idx, { quantity: e.target.value })}
                                      className="w-20 h-8 px-2 border rounded text-sm"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      title="Đơn giá"
                                      value={it.unit_price}
                                      onChange={(e) => updatePoItem(idx, { unit_price: e.target.value })}
                                      className="w-28 h-8 px-2 border rounded text-sm"
                                    />
                                    <span className="text-xs font-semibold w-24 text-right">{formatVND(it.amount || 0)}</span>
                                    <button type="button" onClick={() => removePoItem(idx)} className="p-1.5 text-gray-400 hover:text-red-600 cursor-pointer">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <div className="text-right text-sm font-semibold text-gray-800">
                                  Tạm tính: {formatVND(itemsSubtotal)}
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="text-xs font-medium text-gray-600">Ghi chú</label>
                              <textarea value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" rows={2} />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 p-5 pt-3 border-t shrink-0">
                            <button type="button" onClick={() => setPoFormOpen(false)} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
                            <button
                              type="button"
                              disabled={poSaving}
                              onClick={async () => {
                                if (!(poForm.items || []).length) return alert('Thêm ít nhất 1 dòng hàng (nhập tên hoặc chọn catalog)');
                                if ((poForm.items || []).some((it) => !String(it.name || '').trim())) return alert('Mỗi dòng cần có tên');
                                setPoSaving(true);
                                try {
                                  const payload = {
                                    lead_id: id,
                                    company_id: lead?.company_id || undefined,
                                    sync_title_from_lead: true,
                                    notes: poForm.notes || null,
                                    status: poForm.status,
                                    order_date: poForm.order_date || null,
                                    customer_name: customer?.full_name || lead?.title || null,
                                    customer_phone: customer?.phone || null,
                                    items: (poForm.items || []).map((it, i) => ({
                                      product_id: it.product_id || null,
                                      name: it.name,
                                      description: it.description || null,
                                      unit: it.unit || 'cái',
                                      quantity: Number(it.quantity) || 1,
                                      unit_price: Number(it.unit_price) || 0,
                                      amount: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price) || 0) * 100) / 100,
                                      brand_name: it.brand_name || null,
                                      sku: it.sku || null,
                                      image_url: it.image_url || null,
                                      item_order: i,
                                    })),
                                  };
                                  if (poEditing) await api.put(`/purchasing/orders/${poEditing.id}`, payload);
                                  else await api.post('/purchasing/orders', payload);
                                  setPoFormOpen(false);
                                  loadDealPurchaseOrders();
                                } catch (e) {
                                  alert(e.response?.data?.error || 'Lỗi lưu');
                                }
                                setPoSaving(false);
                              }}
                              className="h-9 px-4 bg-amber-600 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                            >
                              {poSaving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : activeTab === 'kpi_ledger' ? (
                <LeadKpiLedgerPanel leadId={id} />
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
                    {documentsTabTotal > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadAllDocuments}
                        disabled={downloadingDocsZip}
                        className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        title="Tải ZIP — phân thư mục: Deal → giai đoạn → nhiệm vụ → checklist"
                      >
                        {downloadingDocsZip ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang nén...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" /> Tải tất cả ({documentsTabTotal})
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <CrmTaskDocumentsPanel
                    tasks={crmTasks}
                    artifacts={taskDocuments}
                    pipelineStages={pipelineStagesForDocs}
                    leadCurrentStageId={lead?.stage_id}
                    leadType={lead?.type || 'lead'}
                    onOpenImage={openDocImage}
                  />

                  {workshopSharedDocs.length > 0 && (
                    <div className="mb-4 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/90 via-white to-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-violet-100">
                        <p className="text-sm font-bold text-violet-900">🏭 Tài liệu từ Sản xuất</p>
                        <p className="text-xs text-violet-700/85 mt-0.5">
                          {workshopSharedDocs.length} tài liệu xưởng đã chia sẻ cho CRM
                        </p>
                      </div>
                      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                        {workshopSharedDocs.map((doc) => (
                          <DocumentRow key={doc.id} doc={doc} onOpenImage={openDocImage} readOnlyWorkshop />
                        ))}
                      </div>
                    </div>
                  )}

                  {orphanSyncedLeadDocs.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                        📌 Tài liệu đồng bộ từ nhiệm vụ ({orphanSyncedLeadDocs.length})
                      </p>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {orphanSyncedLeadDocs.map((doc) => (
                          <DocumentRow key={doc.id} doc={doc} onDelete={() => deleteDocument(doc.id)} onOpenImage={openDocImage} canManageDeal={canManageDeal} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lead Documents — chỉ file thêm trực tiếp trên deal (không phải bản đồng bộ từ NV) */}
                  <>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">📄 Tài liệu Lead ({manualLeadDocs.length})</p>
                    {manualLeadDocs.length === 0 ? (
                      taskDocuments.length > 0 || orphanSyncedLeadDocs.length > 0 ? (
                        <p className="text-xs text-gray-500 mb-2 py-2">Chưa có file hay văn bản thêm trực tiếp trên deal (không tính file từ nhiệm vụ).</p>
                      ) : (
                        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                          <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Chưa có tài liệu</p>
                          <p className="text-xs text-gray-400 mt-1">Upload file hoặc nhập văn bản để thêm tài liệu</p>
                        </div>
                      )
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {manualLeadDocs.map((doc) => (
                          <DocumentRow key={doc.id} doc={doc} onDelete={() => deleteDocument(doc.id)} onOpenImage={openDocImage} canManageDeal={canManageDeal} />
                        ))}
                      </div>
                    )}
                  </>
                </>
              ) : activeTab === 'activities' || activeTab === 'notes' ? (
                <div className="space-y-6">
                  <CrmChatNotesPanel
                    variant="embedded"
                    leadId={id}
                    notes={noteActivities}
                    onPosted={() => load({ silent: true })}
                    currentUserId={user?.id || user?.userId}
                    canEditAnyNote={isAdminLike(user) || user?.role === 'manager'}
                    includeVoiceTimeline
                    contextLine={
                      lead
                        ? `${lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'} ${[lead.code, lead.title].filter(Boolean).join(' — ')}`
                        : ''
                    }
                    contextBadge={lead?.code || ''}
                  />
                  <div className="border-t pt-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-800">Hoạt động</h3>
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
                      <div className="space-y-2 min-h-[200px] max-h-[min(420px,55vh)] overflow-y-auto">
                        <div className="relative">
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                          {activities.map((act) => {
                            const typeInfo = ACTIVITY_TYPES.find(t => t.value === act.type) || ACTIVITY_TYPES[4];
                            return (
                              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
                                <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                                <div className="flex items-start gap-2">
                                  <span className="text-lg shrink-0">{typeInfo.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium" style={{ color: '#000000' }}>{act.title}</p>
                                      <span className="text-[10px] text-gray-400 shrink-0">{formatDate(act.activity_date)}</span>
                                    </div>
                                    {act.creator?.full_name && (
                                      <p className="text-[10px] text-gray-400 mt-0.5">{act.creator.full_name}</p>
                                    )}
                                    {act.description && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{act.description}</p>}
                                    {act.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {act.outcome}</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'drive' ? (
                <DriveAttachments
                  entityType={lead?.type === 'deal' ? 'deal' : 'lead'}
                  entityId={id}
                  onCountChange={setDriveFileCount}
                />
              ) : activeTab === 'facebook' ? (
                <FacebookChatTab leadId={id} companyId={lead?.company_id} />
              ) : activeTab === 'zalo' ? (
                <ZaloChatTab leadId={id} />
              ) : activeTab === 'team' ? (
                <LeadMembersTab
                  leadId={id}
                  onMembersChange={(list) => setMemberModuleCounts(countMembersByModule(list))}
                  onOpenSharedWorkspace={() => setActiveTab('shared-workspace')}
                />
              ) : activeTab === 'comments' ? (
                <div data-tour="lead-comments-panel">
                  <CrmLeadCommentsPanel
                    leadId={id}
                    onCountChange={setCommentCount}
                    quickReplyTemplates={lead?.type === 'deal' ? CRM_DEAL_COMMENT_QUICK_REPLIES : []}
                  />
                </div>
              ) : activeTab === 'chat' ? (
                <LeadChatTab leadId={id} socket={socket} />
              ) : activeTab === 'voice_crm' ? (
                <LeadVoiceRecordingsTab leadId={id} />
              ) : activeTab === 'approvals' ? (
                lead.project_id ? (
                  <ProjectApprovalsTab
                    projectId={lead.project_id}
                    project={lead}
                    onUpdated={() => load({ silent: true })}
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
              ) : activeTab === 'deal_scores' ? (
                <DealCrossScoresPanel dealLeadId={id} user={user} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddActivity && <AddActivityModal leadId={id} onClose={() => setShowAddActivity(false)} onSave={() => { setShowAddActivity(false); load({ silent: true }); }} />}
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
      {showRevertModal && (
        <RevertToLeadModal
          leadId={id}
          lead={lead}
          onClose={() => setShowRevertModal(false)}
          onSuccess={() => { setShowRevertModal(false); load({ silent: true }); }}
        />
      )}

      {showTransferRegionModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!transferRegionSaving) { setShowTransferRegionModal(false); setTransferRegionError(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <User className="h-6 w-6 text-indigo-600" />
              <h3 className="text-base font-bold text-gray-900">Chuyển người phụ trách</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              {transferCanCrossCompany
                ? 'Chọn công ty CRM, khu vực rồi chọn nhân viên thuộc khu vực đó.'
                : 'Chọn khu vực (cùng công ty) rồi chọn nhân viên thuộc khu vực đó.'}
            </p>

            {(lead?.assignee?.full_name || lead?.lead_owner?.full_name || lead?.crm_region?.name || lead?.company?.name) && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3 space-y-1">
                {(lead?.company?.name || lead?.company?.short_name || lead?.company_id) && (
                  <p className="text-xs text-gray-600">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Công ty hiện tại: </span>
                    {lead?.company?.short_name || lead?.company?.name
                      || transferCompanies.find((c) => String(c.id) === String(lead.company_id))?.short_name
                      || transferCompanies.find((c) => String(c.id) === String(lead.company_id))?.name
                      || '—'}
                  </p>
                )}
                {(lead?.crm_region?.name || lead?.region_id) && (
                  <p className="text-xs text-gray-600">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Khu vực hiện tại: </span>
                    {lead?.crm_region?.name
                      || transferRegions.find((r) => String(r.id) === String(lead.region_id))?.name
                      || '—'}
                  </p>
                )}
                <p className="text-xs text-gray-600">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">Phụ trách hiện tại: </span>
                  {lead?.assignee?.full_name || lead?.lead_owner?.full_name || 'Chưa gán'}
                </p>
              </div>
            )}

            {(transferCanCrossCompany || transferCompanies.length > 1) && (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  🏢 Công ty <span className="text-red-500">*</span>
                </label>
                <select
                  value={transferCompanyId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTransferCompanyId(next);
                    setTransferRegionId('');
                    setTransferAssigneeId('');
                    setTransferRegionError('');
                    loadTransferOptionsForCompany(next);
                  }}
                  disabled={transferRegionsLoading || transferRegionSaving}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50"
                >
                  <option value="">— Chọn công ty —</option>
                  {transferCompanies.map((co) => (
                    <option key={co.id} value={String(co.id)}>
                      {co.short_name || co.name}
                      {String(co.id) === String(lead?.company_id || '') ? ' — hiện tại' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="block text-xs font-semibold text-gray-700 mb-1">
              📍 Khu vực <span className="text-red-500">*</span>
            </label>
            <select
              value={transferRegionId}
              onChange={(e) => {
                setTransferRegionId(e.target.value);
                setTransferAssigneeId('');
                setTransferRegionError('');
              }}
              disabled={!transferCompanyId || transferRegionsLoading || transferRegionSaving}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50"
            >
              <option value="">
                {transferRegionsLoading
                  ? 'Đang tải khu vực…'
                  : transferRegions.length === 0
                    ? '— Công ty chưa có khu vực —'
                    : '— Chọn khu vực —'}
              </option>
              {transferRegions.map((reg) => (
                <option key={reg.id} value={String(reg.id)}>
                  {reg.name}{reg.code ? ` (${reg.code})` : ''}
                  {String(reg.id) === String(lead?.region_id || '')
                    && String(transferCompanyId) === String(lead?.company_id || '')
                    ? ' — hiện tại'
                    : ''}
                </option>
              ))}
            </select>
            {!transferRegionsLoading && transferCompanyId && transferRegions.length === 0 && (
              <p className="text-[10px] text-amber-500 mt-1">⚠️ Công ty chưa có khu vực CRM — vào CRM/Khu vực để thêm trước</p>
            )}

            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                👤 Chuyển cho nhân viên <span className="text-red-500">*</span>
              </label>
              <EmployeePicker
                companyId={transferCompanyId || lead?.company_id}
                regionId={transferRegionId}
                requireRegion
                preloadUsers={transferUsers}
                preloadDepartments={transferDepartments}
                value={transferAssigneeId}
                onChange={(uid) => { setTransferAssigneeId(uid || ''); setTransferRegionError(''); }}
                placeholder="Chọn nhân viên thuộc khu vực..."
                size="md"
                displayFullName
              />
              {!transferRegionId && (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Chọn khu vực trước để lọc nhân viên</p>
              )}
            </div>

            {transferRegionError && (
              <p className="text-xs text-red-600 mt-2">{transferRegionError}</p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                disabled={transferRegionSaving}
                onClick={() => { setShowTransferRegionModal(false); setTransferRegionError(''); }}
                className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={
                  transferRegionSaving
                  || transferRegionsLoading
                  || !transferCompanyId
                  || !transferRegionId
                  || !transferAssigneeId
                }
                onClick={submitTransferRegion}
                className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
              >
                {transferRegionSaving ? 'Đang chuyển…' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={showDeleteLeadModal}
        onClose={() => !deletingLead && setShowDeleteLeadModal(false)}
        title={lead?.type === 'deal' ? 'Xóa Deal' : 'Xóa Lead'}
        size="md"
      >
        {lead && (
          <div className="space-y-4">
            {lead.project_id ? (
              <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-lg p-3">
                Sẽ xóa luôn dự án liên kết, nhiệm vụ, tài liệu, báo giá, đơn hàng, hóa đơn liên quan. Không hoàn tác.
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                Xóa <strong>{lead.title}</strong> và tài liệu, hoạt động liên quan. Không hoàn tác.
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lý do xóa</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Nhập lý do xóa lead/deal (không bắt buộc)…"
                className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
              />
            </div>
            {customer?.phone && String(customer.phone).trim() && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockPhoneOnDeleteLead}
                  onChange={(e) => setBlockPhoneOnDeleteLead(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  <strong>Chặn tự tạo lead Facebook</strong> từ SĐT{' '}
                  <span className="font-mono">{customer.phone}</span> (Messenger, quét SĐT, lịch quét lead…).
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingLead}
                onClick={() => setShowDeleteLeadModal(false)}
                className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deletingLead}
                onClick={confirmDeleteLeadWithBlock}
                className="h-9 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 cursor-pointer disabled:opacity-50"
              >
                {deletingLead ? 'Đang xóa…' : 'Xóa'}
              </button>
            </div>
          </div>
        )}
      </Modal>

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
                <p className="text-sm font-medium" style={{ color: '#000000' }}>{customer?.full_name || '—'}</p>
                {customer?.phone
                  ? <p className="text-xs text-green-600 mt-0.5">📞 {customer.phone}</p>
                  : <p className="text-xs text-amber-500 mt-0.5">⚠️ Chưa có SĐT (có thể bổ sung sau)</p>
                }
              </div>
            )}

            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                📍 Khu vực <span className="text-red-500">*</span>
              </label>
              <select
                value={assignBeforeWonRegion}
                onChange={(e) => {
                  setAssignBeforeWonRegion(e.target.value);
                  setAssignBeforeWonUser('');
                  setAssignBeforeWonError('');
                }}
                disabled={!lead?.company_id || selectableRegions.length === 0}
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">
                  {!lead?.company_id
                    ? '— Lead chưa có công ty —'
                    : selectableRegions.length === 0
                      ? '— Công ty chưa có khu vực —'
                      : '— Chọn khu vực —'}
                </option>
                {selectableRegions.map((reg) => (
                  <option key={reg.id} value={reg.id}>{reg.name}</option>
                ))}
              </select>
              {!lead?.company_id && (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — vào mục Thông tin để gán công ty trước</p>
              )}
              {lead?.company_id && selectableRegions.length === 0 && (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Công ty chưa có khu vực — vào CRM/Khu vực để thêm trước</p>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">👤 Người phụ trách deal</label>
              <EmployeePicker
                companyId={lead?.company_id}
                regionId={assignBeforeWonRegion}
                requireRegion
                value={assignBeforeWonUser}
                onChange={(userId) => { setAssignBeforeWonUser(userId || ''); setAssignBeforeWonError(''); }}
                placeholder="Tìm và chọn nhân viên..."
                size="md"
              />
              {!lead?.company_id ? (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — vào mục Thông tin để gán công ty trước</p>
              ) : !assignBeforeWonRegion ? (
                <p className="text-[10px] text-amber-500 mt-1">⚠️ Chọn khu vực trước để lọc nhân viên thuộc khu vực</p>
              ) : null}
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
                disabled={assigningForWon || !assignBeforeWonUser || !assignBeforeWonRegion || !lead?.customer_id}
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
            load({ silent: true });
            loadDealExcelQuotations();
            if (data?.id) navigate(`/crm/quotations/${data.id}`);
          }}
          onClose={() => setShowExcelImport(false)}
        />
      )}

      {dealWonSxExistsCtx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => setDealWonSxExistsCtx(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Đã có dự án Sản xuất</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{dealWonSxExistsCtx.message}</p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => setDealWonSxExistsCtx(null)}
              >
                Hủy
              </button>
              {lead?.project_id && (
                <button
                  type="button"
                  className="flex-1 h-10 border border-teal-200 text-teal-700 rounded-xl text-sm font-semibold hover:bg-teal-50"
                  onClick={() => {
                    setDealWonSxExistsCtx(null);
                    navigate(`/sx/projects/${lead.project_id}`);
                  }}
                >
                  Xem Sản xuất
                </button>
              )}
              <button
                type="button"
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => confirmDealWonSxExistsOnlyStage()}
              >
                Cập nhật Thắng
              </button>
            </div>
          </div>
        </div>
      )}

      {dealStageWonPick && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { setDealStageWonPick(null); setDealStageWonErr(''); setDealStageWonWorkTypeId(''); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Chọn công ty Sản xuất</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Chuyển deal sang <strong>Thắng</strong> cần gắn công ty thuộc <strong>module Sản xuất</strong> cho dự án xưởng.
            </p>
            {parentSxHint && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-3">
                {parentSxHint}
              </p>
            )}
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Công ty <span className="text-red-600">*</span>
              <span className="ml-1 font-normal text-gray-500">(<span className="text-red-600 font-bold">★</span> = gợi ý)</span>
            </label>
            <SxCompanyPickList
              companies={parentSxCompaniesForSelect}
              value={dealStageWonCompanyId}
              leadTypeRow={parentSxLeadTypeRow}
              kind={parentSxLeadKind}
              accent="teal"
              onChange={(id) => {
                setDealStageWonCompanyId(id);
                setDealStageWonWorkTypeId('');
                setDealStageWonErr('');
                setDealStageWonTargets([{ companyId: id, workshopTypeId: '' }]);
              }}
            />
            <div className="mt-2 mb-1">
              <button
                type="button"
                className="text-[11px] font-semibold text-teal-700 hover:underline"
                onClick={() => {
                  const base = dealStageWonTargets.length
                    ? dealStageWonTargets
                    : [{ companyId: dealStageWonCompanyId, workshopTypeId: dealStageWonWorkTypeId }];
                  setDealStageWonTargets([...base, { companyId: '', workshopTypeId: '' }]);
                }}
              >
                + Thêm công ty SX khác
              </button>
            </div>
            {dealStageWonTargets.length > 1 && (
              <div className="mb-3">
                <SxMultiTargetPicker
                  key={`won-multi-${dealStageWonTargets.length}`}
                  companies={parentSxCompaniesForSelect}
                  leadTypeRow={parentSxLeadTypeRow}
                  kind={parentSxLeadKind}
                  accent="teal"
                  initialRows={dealStageWonTargets}
                  onChange={(rows) => {
                    setDealStageWonTargets(rows);
                    setDealStageWonCompanyId(rows[0]?.companyId || '');
                    setDealStageWonWorkTypeId(rows[0]?.workshopTypeId || '');
                    setDealStageWonErr('');
                  }}
                />
              </div>
            )}
            {/* Phân loại theo công ty SX vừa chọn */}
            {dealStageWonTargets.length <= 1 && dealStageWonCompanyId && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Phân loại sản xuất {parentWonTypesForSelect.length > 0 && <span className="text-red-600">*</span>}
                </label>
                <select
                  value={dealStageWonWorkTypeId}
                  onChange={(e) => {
                    setDealStageWonWorkTypeId(e.target.value);
                    setDealStageWonErr('');
                    setDealStageWonTargets([{ companyId: dealStageWonCompanyId, workshopTypeId: e.target.value }]);
                  }}
                  disabled={wonModalWorkTypesLoading || parentWonTypesForSelect.length === 0}
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {wonModalWorkTypesLoading
                      ? 'Đang tải phân loại…'
                      : (parentWonTypesForSelect.length === 0
                          ? '— Công ty chưa có phân loại nào —'
                          : '— Chọn phân loại —')}
                  </option>
                  {parentWonTypesForSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, dealStageWonCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, pickProjectCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, reassignSxCompanyId)
                        || (parentSxDbPref.workshopTypeId && String(t.id) === parentSxDbPref.workshopTypeId)
                        || workshopTypeMatchesSxKind(t.name, parentSxLeadKind)
                        ? '★'
                        : '📦'} {t.name}
                    </option>
                  ))}
                </select>
                {parentWonTypesForSelect.length === 0 && !wonModalWorkTypesLoading && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Công ty này chưa cấu hình phân loại — admin có thể vào /sx/pipeline-settings để thêm.
                  </p>
                )}
              </div>
            )}
            {dealStageWonErr && <p className="text-xs text-red-600 mt-2">{dealStageWonErr}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => { setDealStageWonPick(null); setDealStageWonErr(''); setDealStageWonWorkTypeId(''); }}
              >
                Hủy
              </button>
              <button
                type="button"
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => confirmDealStageWonProduction()}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      {pickProjectCompanyOpen && lead?.type === 'deal' && !lead?.project_id && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { setPickProjectCompanyOpen(false); projectCompanyPickRef.current = false; setPickProjectCompanyErr(''); setPickProjectCompanyWorkTypeId(''); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-amber-600" />
              <h3 className="text-lg font-bold text-gray-900">Tạo dự án xưởng</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Deal đã <strong>Thắng</strong> nhưng chưa có dự án. Chọn công ty <strong>module Sản xuất</strong> để hệ thống tạo dự án.
            </p>
            {parentSxHint && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-3">
                {parentSxHint}
              </p>
            )}
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Công ty <span className="text-red-600">*</span>
              <span className="ml-1 font-normal text-gray-500">(<span className="text-red-600 font-bold">★</span> = gợi ý)</span>
            </label>
            <SxCompanyPickList
              companies={parentSxCompaniesForSelect}
              value={pickProjectCompanyId}
              leadTypeRow={parentSxLeadTypeRow}
              kind={parentSxLeadKind}
              accent="amber"
              onChange={(id) => {
                setPickProjectCompanyId(id);
                setPickProjectCompanyWorkTypeId('');
                setPickProjectCompanyErr('');
                setDealStageWonTargets([{ companyId: id, workshopTypeId: '' }]);
              }}
            />
            <div className="mt-2 mb-1">
              <button
                type="button"
                className="text-[11px] font-semibold text-amber-700 hover:underline"
                onClick={() => {
                  const base = dealStageWonTargets.length
                    ? dealStageWonTargets
                    : [{ companyId: pickProjectCompanyId, workshopTypeId: pickProjectCompanyWorkTypeId }];
                  setDealStageWonTargets([...base, { companyId: '', workshopTypeId: '' }]);
                }}
              >
                + Thêm công ty SX khác
              </button>
            </div>
            {dealStageWonTargets.length > 1 && (
              <div className="mb-3">
                <SxMultiTargetPicker
                  key={`pick-multi-${dealStageWonTargets.length}`}
                  companies={parentSxCompaniesForSelect}
                  leadTypeRow={parentSxLeadTypeRow}
                  kind={parentSxLeadKind}
                  accent="amber"
                  initialRows={dealStageWonTargets}
                  onChange={(rows) => {
                    setDealStageWonTargets(rows);
                    setPickProjectCompanyId(rows[0]?.companyId || '');
                    setPickProjectCompanyWorkTypeId(rows[0]?.workshopTypeId || '');
                    setPickProjectCompanyErr('');
                  }}
                />
              </div>
            )}
            {/* Phân loại theo công ty SX vừa chọn */}
            {dealStageWonTargets.length <= 1 && pickProjectCompanyId && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Phân loại sản xuất {parentWonTypesForSelect.length > 0 && <span className="text-red-600">*</span>}
                </label>
                <select
                  value={pickProjectCompanyWorkTypeId}
                  onChange={(e) => { setPickProjectCompanyWorkTypeId(e.target.value); setPickProjectCompanyErr(''); }}
                  disabled={wonModalWorkTypesLoading || parentWonTypesForSelect.length === 0}
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {wonModalWorkTypesLoading
                      ? 'Đang tải phân loại…'
                      : (parentWonTypesForSelect.length === 0
                          ? '— Công ty chưa có phân loại nào —'
                          : '— Chọn phân loại —')}
                  </option>
                  {parentWonTypesForSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, dealStageWonCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, pickProjectCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, reassignSxCompanyId)
                        || (parentSxDbPref.workshopTypeId && String(t.id) === parentSxDbPref.workshopTypeId)
                        || workshopTypeMatchesSxKind(t.name, parentSxLeadKind)
                        ? '★'
                        : '📦'} {t.name}
                    </option>
                  ))}
                </select>
                {parentWonTypesForSelect.length === 0 && !wonModalWorkTypesLoading && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Công ty này chưa cấu hình phân loại — admin có thể vào /sx/pipeline-settings để thêm.
                  </p>
                )}
              </div>
            )}
            {pickProjectCompanyErr && <p className="text-xs text-red-600 mt-2">{pickProjectCompanyErr}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => { setPickProjectCompanyOpen(false); projectCompanyPickRef.current = false; setPickProjectCompanyErr(''); setPickProjectCompanyWorkTypeId(''); }}
              >
                Để sau
              </button>
              <button
                type="button"
                className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => submitPickProjectCompany()}
              >
                Tạo dự án
              </button>
            </div>
          </div>
        </div>
      )}

      {reassignSxOpen && lead?.type === 'deal' && lead?.project_id && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => { if (!reassignSxBusy) { setReassignSxOpen(false); setReassignSxErr(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="h-6 w-6 text-orange-600" />
              <h3 className="text-lg font-bold text-gray-900">Chọn lại công ty / phân loại SX</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dùng khi chuyển nhầm. Hệ thống <strong>giữ cùng dự án</strong>, cập nhật công ty + phân loại,
              <strong> thay thành viên</strong> theo mặc định phân loại mới và <strong>tạo lại nhiệm vụ mẫu</strong>
              (tiến độ NV mẫu cũ sẽ mất).
            </p>
            {parentSxHint && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-3">
                {parentSxHint}
              </p>
            )}
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Công ty SX <span className="text-red-600">*</span>
              <span className="ml-1 font-normal text-gray-500">(<span className="text-red-600 font-bold">★</span> = gợi ý)</span>
            </label>
            <SxCompanyPickList
              companies={parentSxCompaniesForSelect}
              value={reassignSxCompanyId}
              leadTypeRow={parentSxLeadTypeRow}
              kind={parentSxLeadKind}
              accent="orange"
              disabled={reassignSxBusy}
              onChange={(id) => { setReassignSxCompanyId(id); setReassignSxWorkTypeId(''); setReassignSxErr(''); }}
            />
            {reassignSxCompanyId && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Phân loại sản xuất <span className="text-red-600">*</span>
                </label>
                <select
                  value={reassignSxWorkTypeId}
                  onChange={(e) => { setReassignSxWorkTypeId(e.target.value); setReassignSxErr(''); }}
                  disabled={reassignSxBusy || wonModalWorkTypesLoading || parentWonTypesForSelect.length === 0}
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {wonModalWorkTypesLoading
                      ? 'Đang tải phân loại…'
                      : (parentWonTypesForSelect.length === 0
                          ? '— Công ty chưa có phân loại nào —'
                          : '— Chọn phân loại —')}
                  </option>
                  {parentWonTypesForSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, dealStageWonCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, pickProjectCompanyId)
                        || workshopTypePreferredForLeadType(t.id, parentSxLeadTypeRow, reassignSxCompanyId)
                        || (parentSxDbPref.workshopTypeId && String(t.id) === parentSxDbPref.workshopTypeId)
                        || workshopTypeMatchesSxKind(t.name, parentSxLeadKind)
                        ? '★'
                        : '📦'} {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {reassignSxErr && <p className="text-xs text-red-600 mt-2">{reassignSxErr}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={reassignSxBusy}
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => { setReassignSxOpen(false); setReassignSxErr(''); }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={reassignSxBusy}
                className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                onClick={() => submitReassignSx()}
              >
                {reassignSxBusy ? 'Đang xử lý…' : 'Xác nhận chọn lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DealStageEventModal
        open={!!dealDetailEventCtx}
        onClose={() => {
          if (!dealDetailEventBusy) setDealDetailEventCtx(null);
        }}
        deal={lead?.type === 'deal' ? { ...lead, customer: lead.customer || customer } : null}
        targetStageName={dealDetailEventCtx?.targetStage?.name}
        onConfirm={confirmDealDetailEvent}
        onMoveWithoutEvent={skipDealDetailEvent}
        submitting={dealDetailEventBusy}
      />

      {showCreateEvent && lead && (
        <EventCreateModal
          eventTypes={createEventTypes}
          users={allUsers}
          defaultModule="crm"
          defaultCompanyId={lead.company_id || ''}
          defaultLeadId={id}
          defaultLead={{ ...lead, customer: lead.customer || customer }}
          lockLead
          defaultCustomerId={lead.customer_id || customer?.id || ''}
          defaultAssigneeId={lead.assigned_to || lead.lead_owner_id || ''}
          defaultTitle={formatLeadDealEventTitle(lead, customer)}
          defaultLocation={leadDealEventLocation(lead, customer)}
          defaultDescription={lead.description || ''}
          onClose={() => setShowCreateEvent(false)}
          onSaved={() => setShowCreateEvent(false)}
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

      <CrmDeadlineModal
        open={!!stageDeadlineCtx}
        title="Đặt deadline cho thẻ"
        subtitle="Cột này yêu cầu đặt deadline. Mọi thay đổi đều được ghi vào lịch sử."
        stageName={stageDeadlineCtx?.stageName}
        initialDeadline={lead?.kanban_deadline_at || null}
        currentDeadline={lead?.kanban_deadline_at || null}
        mandatory
        submitting={stageDeadlineBusy}
        onClose={() => { if (!stageDeadlineBusy) setStageDeadlineCtx(null); }}
        onConfirm={confirmStageDeadline}
      />

      <CrmStageAssigneeModal
        open={!!assigneeStageCtx}
        onClose={() => { if (!assigneeStageBusy) setAssigneeStageCtx(null); }}
        card={assigneeStageCtx?.card || lead}
        targetStage={assigneeStageCtx?.targetStage}
        entityLabel={lead?.type === 'deal' ? 'deal' : 'lead'}
        employeeList={allUsers}
        submitting={assigneeStageBusy}
        onConfirmTransfer={(userId) => finishAssigneeStageMove(true, userId)}
        onKeepCurrent={() => finishAssigneeStageMove(false)}
      />

      <BlockingTasksAlertModal
        open={!!blockingModal}
        onClose={() => setBlockingModal(null)}
        leadId={blockingModal?.leadId || id}
        currentStageName={blockingModal?.currentStageName}
        targetStageName={blockingModal?.targetStageName}
        remainingTasks={blockingModal?.remainingTasks || []}
        onChanged={() => {
          loadRef.current?.({ silent: true });
          setCrmTasksRefreshKey((k) => k + 1);
        }}
        onAllCleared={() => {
          const tgt = blockingModal?.targetStageId;
          setBlockingModal(null);
          // Hết nhiệm vụ chặn → chạy lại luồng chuyển cột (hộp deadline chỉ khi cột bật requires_deadline).
          if (tgt) moveStage(tgt);
        }}
        onGoToTasks={() => {
          setActiveTab('tasks');
          setBlockingModal(null);
          try {
            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
          } catch (_) { /* ignore */ }
        }}
      />

      {docLightboxIndex != null && docImageGallery.length > 0 && (
        <UploadFileLightbox
          items={docImageGallery}
          index={docLightboxIndex}
          onIndexChange={setDocLightboxIndex}
          onClose={() => setDocLightboxIndex(null)}
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

const getFileIcon = (name) => getFileEmoji(name);

function DocumentRow({ doc, onDelete, onOpenImage, readOnlyWorkshop = false, canManageDeal = false }) {
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
  const rawFileRef = doc.file_url || doc.file_path || '';
  const fileHref = rawFileRef ? publicFileUrl(rawFileRef) : '';
  const fileOpenProps = fileHref ? getFileOpenAnchorProps(rawFileRef, { fileName: doc.file_name }) : null;
  const fileDownloadProps = fileHref
    ? getFileDownloadAnchorProps(rawFileRef, { fileName: doc.file_name || doc.name || 'tai-lieu' })
    : null;
  const isFile = !!fileHref;
  const isImage = isFile && isUploadImageFile(doc.mime_type, [doc.file_name, doc.file_url, doc.file_path, doc.name].filter(Boolean).join(' '));
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

  const saveVisibility = async () => {
    setSavingVis(true);
    try {
      const { data } = await api.put(`/crm/documents/${doc.id}/visibility`, {
        allowed_companies: allowedCompanies.length ? allowedCompanies : null,
        allowed_departments: allowedDepts.length ? allowedDepts : null,
        shared_to_workshop: !!sharedToWorkshop,
        allowed_share_modules: sharedToWorkshop
          ? cleanShareModulesForApi(allowedShareModules)
          : null,
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
              {(readOnlyWorkshop || doc.source_file_attachment_id) && (
                <span className="text-[9px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">🏭 Từ xưởng SX</span>
              )}
              {(doc.allowed_departments?.length > 0 || doc.allowed_companies?.length > 0) && (
                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium" title="Nhãn phòng/công ty — không ẩn với team CRM trên trang này">🏷️ Nhãn PB/Cty</span>
              )}
              {doc.shared_to_workshop && (
                <span className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium" title="Khối được xem ngoài CRM">
                  🧩 {shareModuleLabels(doc.allowed_share_modules)}
                </span>
              )}
            </div>
          </div>
          {isFile && (fileOpenProps || fileDownloadProps) && (
            <div className="flex items-center gap-2 shrink-0 px-2" onClick={(e) => e.stopPropagation()}>
              {isImage ? (
                <button
                  type="button"
                  onClick={() => onOpenImage?.(rawFileRef)}
                  className="text-xs text-blue-600 hover:underline cursor-pointer"
                >
                  Mở
                </button>
              ) : fileOpenProps ? (
                <a {...fileOpenProps} className="text-xs text-blue-600 hover:underline">
                  Mở
                </a>
              ) : null}
              {isImage && rawFileRef && (
                <button
                  type="button"
                  onClick={() => {
                    printUploadImage(rawFileRef, doc.file_name || doc.name || 'Ảnh').catch((err) => {
                      alert(err?.message || 'Không in được ảnh');
                    });
                  }}
                  className="text-xs text-violet-600 hover:underline cursor-pointer"
                >
                  In
                </button>
              )}
              {fileDownloadProps && (
                <a {...fileDownloadProps} className="text-xs text-emerald-600 hover:underline">
                  Tải
                </a>
              )}
            </div>
          )}
          {hasExtra && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        {!readOnlyWorkshop && canManageDeal && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openVisibility(); }}
            className="p-1 hover:bg-slate-200 text-slate-600 rounded ml-1 cursor-pointer"
            title="Chia sẻ xưởng & phân quyền xem"
          >
            ⚙️
          </button>
        )}
        {!readOnlyWorkshop && onDelete && canManageDeal && (
          <button onClick={onDelete} className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Video preview — always show player */}
      {isVideo && (
        <div className={`px-3 ${expanded ? 'pb-3' : 'pb-2'}`}>
          <video src={fileHref} controls preload="metadata"
            className={`w-full rounded-lg border border-gray-200 bg-black shadow-sm ${expanded ? 'max-h-96' : 'max-h-40'}`} />
        </div>
      )}
      {/* Image preview — show thumbnail even when collapsed */}
      {isImage && !expanded && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => onOpenImage?.(rawFileRef)}
            className="block text-left"
          >
            <img src={fileHref} alt={doc.name} className="max-h-24 rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
          </button>
        </div>
      )}
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          {isImage && (
            <button type="button" onClick={() => onOpenImage?.(rawFileRef)} className="block text-left">
              <img src={fileHref} alt={doc.name} className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-zoom-in hover:opacity-90 transition-opacity" />
            </button>
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
              <span>Chia sẻ sang khối SX / VC / Công việc dự án</span>
            </label>

            {sharedToWorkshop && (
              <DocumentShareModulePicker
                value={allowedShareModules}
                onChange={setAllowedShareModules}
              />
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
// LeadInfoEditableRow — tách ra ngoài + draft cục bộ để gõ tiếng Việt (IME) ổn định
// ═══════════════════════════════════════════════════════════════════════════
function LeadInfoEditableRow({
  icon, label, field, value, displayValue, type = 'text', options,
  editing, setEditing, saving, onSave,
}) {
  const isEditing = editing === field;
  const isTextarea = type === 'textarea';
  const isSelectEmpty = type === 'select' && ((options || []).length === 0);
  const [draft, setDraft] = useState('');
  const composingRef = useRef(false);

  const startEdit = () => {
    setDraft(value ?? '');
    setEditing(field);
  };

  const handleSave = () => onSave(field, draft);

  return (
    <div className="group">
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
          {isEditing ? (
            <div
              className={`flex gap-1.5 min-w-0 relative z-30 ${isTextarea ? 'flex-col' : 'items-center'}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {type === 'select' ? (
                <select
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="flex-1 min-w-0 w-full h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  autoFocus
                  title={(options || []).find(o => String(o.value) === String(draft))?.label || ''}
                >
                  <option value="">-- Chọn --</option>
                  {isSelectEmpty && (
                    <option value="" disabled>(Chưa có lựa chọn)</option>
                  )}
                  {(options || []).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : isTextarea ? (
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={(e) => {
                    composingRef.current = false;
                    setDraft(e.currentTarget.value);
                  }}
                  rows={5}
                  className="w-full min-w-0 px-2.5 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-y min-h-[110px] leading-relaxed bg-white"
                  autoFocus
                  placeholder="Nhập mô tả chi tiết..."
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null);
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !composingRef.current) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                />
              ) : (
                <input
                  type={type}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="flex-1 min-w-0 w-full h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              )}
              <div className={`flex items-center gap-1.5 shrink-0 ${isTextarea ? 'justify-end' : ''}`}>
                <button type="button" onClick={handleSave} disabled={saving}
                  className={`flex items-center justify-center bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 disabled:opacity-50 shrink-0 ${isTextarea ? 'h-8 px-3 gap-1 text-xs font-medium' : 'h-8 w-8'}`}>
                  <Save className="h-3.5 w-3.5" />
                  {isTextarea && <span>Lưu</span>}
                </button>
                <button type="button" onClick={() => setEditing(null)}
                  className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg cursor-pointer hover:bg-gray-200 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {isTextarea && (
                <p className="text-[10px] text-gray-400">Enter xuống dòng · Ctrl+Enter để lưu</p>
              )}
            </div>
          ) : (
            <div
              onClick={startEdit}
              className="cursor-pointer group/val"
            >
              {displayValue ? (
                <p
                  className={`text-sm font-medium ${isTextarea ? 'whitespace-pre-wrap break-words leading-relaxed' : ''}`}
                  style={{ color: '#000000' }}
                >
                  {displayValue}
                </p>
              ) : (
                <p className="text-sm text-gray-300 italic group-hover/val:text-blue-400 transition-colors">
                  Nhấn để nhập...
                </p>
              )}
            </div>
          )}
        </div>
        {!isEditing && (
          <button type="button" onClick={startEdit}
            className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 cursor-pointer transition-opacity shrink-0">
            <Edit2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LeadInfoPanel — Inline editable fields (always visible)
// ═══════════════════════════════════════════════════════════════════════════
function LeadInfoPanel({ lead, allUsers, onUpdate, currentUser, productionCompaniesSx = [], onOpenTransferAssignee = null }) {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [referrers, setReferrers] = useState([]);
  /** Khu vực CRM — chỉ theo company_id của lead (company_regions) */
  const [companyRegions, setCompanyRegions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [deadlineHistory, setDeadlineHistory] = useState([]);
  const [deadlineHistoryOpen, setDeadlineHistoryOpen] = useState(false);
  const [deadlineHistoryLoading, setDeadlineHistoryLoading] = useState(false);
  const [sxHandoverForm, setSxHandoverForm] = useState({
    construction_start_date: '',
    expected_production_start_date: '',
    expected_production_end_date: '',
    sale_acknowledged: false,
    production_company_id: '',
  });
  const [sxHandoverSaving, setSxHandoverSaving] = useState(false);
  const [sxHandoverNotice, setSxHandoverNotice] = useState('');
  const [sxHandoverExpanded, setSxHandoverExpanded] = useState(false);
  const [depositDraft, setDepositDraft] = useState({ amount: '', received: '', label: '' });
  /** Admin chuyển / thêm công ty SX — popup + đếm ngược 5s */
  const [sxAssignOpen, setSxAssignOpen] = useState(false);
  const [sxAssignProjectId, setSxAssignProjectId] = useState('');
  const [sxAssignCompanyId, setSxAssignCompanyId] = useState('');
  const [sxAssignTypeId, setSxAssignTypeId] = useState('');
  const [sxAssignTypes, setSxAssignTypes] = useState([]);
  const [sxAssignTypesLoading, setSxAssignTypesLoading] = useState(false);
  const [sxAssignBusy, setSxAssignBusy] = useState(false);
  const [sxAssignNotice, setSxAssignNotice] = useState('');
  const [sxAssignBaseline, setSxAssignBaseline] = useState({
    projectId: '', companyId: '', typeId: '', typeName: '', companyName: '',
  });
  const [sxAckChecked, setSxAckChecked] = useState(false);
  const [sxAddOpen, setSxAddOpen] = useState(false);
  const [sxAddTargets, setSxAddTargets] = useState([]);
  const [sxAddBusy, setSxAddBusy] = useState(false);
  const [sxAddErr, setSxAddErr] = useState('');
  const { wait: sxConfirmWait, start: startSxConfirmCountdown, clear: clearSxConfirmTimer } = useConfirmCountdown(3);
  const sxPendingRef = useRef(false);

  const sxProjectsList = useMemo(() => {
    const fromApi = Array.isArray(lead?.production_projects)
      ? lead.production_projects.filter((p) => p?.project_id)
      : [];
    if (fromApi.length) return fromApi;
    if (!lead?.project_id) return [];
    return [{
      project_id: lead.project_id,
      code: lead.linked_project?.code || null,
      name: lead.linked_project?.name || null,
      company_id: sxAssignBaseline.companyId || lead.sx_template_company_id || null,
      company_name: sxAssignBaseline.companyName || null,
      workshop_type_id: sxAssignBaseline.typeId || null,
      workshop_type_name: sxAssignBaseline.typeName || null,
      is_primary: true,
    }];
  }, [
    lead?.production_projects,
    lead?.project_id,
    lead?.linked_project,
    lead?.sx_template_company_id,
    sxAssignBaseline.companyId,
    sxAssignBaseline.companyName,
    sxAssignBaseline.typeId,
    sxAssignBaseline.typeName,
  ]);

  const crmLeadTypeNameForSx = useMemo(() => {
    const nested = lead?.lead_type?.name || lead?.lead_type_name;
    if (nested) return String(nested);
    if (lead?.lead_type_id && (leadTypes || []).length) {
      return leadTypes.find((t) => String(t.id) === String(lead.lead_type_id))?.name || '';
    }
    return '';
  }, [lead?.lead_type, lead?.lead_type_name, lead?.lead_type_id, leadTypes]);

  const sxLeadTypeRow = useMemo(() => {
    if (!lead?.lead_type_id) return null;
    return (leadTypes || []).find((t) => String(t.id) === String(lead.lead_type_id)) || null;
  }, [lead?.lead_type_id, leadTypes]);

  const sxDbPref = useMemo(
    () => preferredSxFromLeadTypeRow(sxLeadTypeRow),
    [sxLeadTypeRow],
  );

  const sxLeadKind = useMemo(
    () => classifyCrmLeadTypeForSx(crmLeadTypeNameForSx),
    [crmLeadTypeNameForSx],
  );

  const sxCompaniesForSelect = useMemo(
    () => orderSxCompaniesPreferredFirst(
      productionCompaniesSx,
      sxLeadKind,
      sxDbPref.companyId,
      sxDbPref.companyIds,
    ),
    [productionCompaniesSx, sxLeadKind, sxDbPref.companyId, sxDbPref.companyIds],
  );

  const sxTypesForSelect = useMemo(() => {
    const prefType = preferredWorkshopTypeIdForCompany(sxLeadTypeRow, sxAssignCompanyId)
      || sxDbPref.workshopTypeId;
    return orderWorkshopTypesPreferredFirst(sxAssignTypes, sxLeadKind, prefType);
  }, [sxAssignTypes, sxLeadKind, sxDbPref.workshopTypeId, sxLeadTypeRow, sxAssignCompanyId]);

  const sxHintFromCrmType = useMemo(() => {
    const co = (productionCompaniesSx || []).find((c) => String(c.id) === sxDbPref.companyId);
    const coName = co ? (co.short_name || co.name) : '';
    const wt = (sxAssignTypes || []).find((t) => String(t.id) === sxDbPref.workshopTypeId)
      || (sxTypesForSelect || []).find((t) => String(t.id) === sxDbPref.workshopTypeId);
    return sxLeadTypeHintText(crmLeadTypeNameForSx, sxLeadKind, {
      companyName: coName,
      workshopTypeName: wt?.name || '',
    });
  }, [
    crmLeadTypeNameForSx,
    sxLeadKind,
    sxDbPref.companyId,
    sxDbPref.workshopTypeId,
    productionCompaniesSx,
    sxAssignTypes,
    sxTypesForSelect,
  ]);

  useEffect(() => {
    if (lead?.type !== 'deal' || lead?.sx_handover_at) return;
    setSxHandoverForm({
      construction_start_date: lead.construction_start_date || '',
      expected_production_start_date: lead.expected_production_start_date || '',
      expected_production_end_date: lead.expected_production_end_date || '',
      sale_acknowledged: false,
      production_company_id: lead.sx_template_company_id
        ? String(lead.sx_template_company_id)
        : (lead.company_id ? String(lead.company_id) : ''),
    });
    setSxHandoverNotice('');
    setSxHandoverExpanded(false);
  }, [lead?.id, lead?.type, lead?.project_id, lead?.sx_handover_at, lead?.sx_template_company_id, lead?.construction_start_date, lead?.expected_production_start_date, lead?.expected_production_end_date]);

  // Load công ty + phân loại primary (fallback khi chưa có production_projects)
  useEffect(() => {
    if (lead?.type !== 'deal' || !lead?.project_id) {
      setSxAssignBaseline({ projectId: '', companyId: '', typeId: '', typeName: '', companyName: '' });
      setSxAssignNotice('');
      return undefined;
    }
    const primary = (Array.isArray(lead.production_projects) ? lead.production_projects : [])
      .find((p) => p.is_primary) || (lead.production_projects || [])[0];
    if (primary?.project_id) {
      setSxAssignBaseline({
        projectId: String(primary.project_id),
        companyId: primary.company_id ? String(primary.company_id) : '',
        typeId: primary.workshop_type_id ? String(primary.workshop_type_id) : '',
        typeName: primary.workshop_type_name || '',
        companyName: primary.company_name || '',
      });
      return undefined;
    }
    let cancelled = false;
    api.get(`/production/projects/${lead.project_id}`)
      .then((r) => {
        if (cancelled) return;
        const p = r.data?.project || r.data;
        const cid = p?.company_id ? String(p.company_id) : (lead.sx_template_company_id ? String(lead.sx_template_company_id) : '');
        const tid = p?.workshop_type_id ? String(p.workshop_type_id) : '';
        const tname = p?.workshop_type?.name || '';
        const cname = p?.company?.short_name || p?.company?.name || '';
        setSxAssignBaseline({
          projectId: String(lead.project_id),
          companyId: cid,
          typeId: tid,
          typeName: tname,
          companyName: cname,
        });
      })
      .catch(() => {
        if (cancelled) return;
        const cid = lead.sx_template_company_id ? String(lead.sx_template_company_id) : '';
        setSxAssignBaseline({
          projectId: String(lead.project_id),
          companyId: cid,
          typeId: '',
          typeName: '',
          companyName: '',
        });
      });
    return () => { cancelled = true; };
  }, [lead?.id, lead?.type, lead?.project_id, lead?.sx_template_company_id, lead?.updated_at, lead?.production_projects]);

  // Load phân loại theo công ty SX đang chọn trong popup
  useEffect(() => {
    if (!sxAssignOpen || !sxAssignCompanyId) {
      if (!sxAssignOpen) setSxAssignTypes([]);
      return undefined;
    }
    let cancelled = false;
    setSxAssignTypesLoading(true);
    api.get('/workshop/project-types', { params: { company_id: sxAssignCompanyId, module: 'production' } })
      .then((r) => {
        if (cancelled) return;
        const rows = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        setSxAssignTypes(rows);
        const stillValid = sxAssignTypeId && rows.some((t) => String(t.id) === String(sxAssignTypeId));
        if (stillValid) return;
        if (sxAssignTypeId) {
          setSxAssignTypeId('');
          return;
        }
        const sug = pickWorkshopTypeIdForCompany(
          sxLeadTypeRow,
          sxAssignCompanyId,
          rows,
          sxLeadKind,
        );
        setSxAssignTypeId(sug || '');
        if (sug) setSxAssignNotice('');
      })
      .catch(() => { if (!cancelled) setSxAssignTypes([]); })
      .finally(() => { if (!cancelled) setSxAssignTypesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sxAssignOpen, sxAssignCompanyId, sxLeadTypeRow, sxLeadKind]);

  // Tự chọn phân loại ★ theo công ty đang chọn khi đang trống
  useEffect(() => {
    if (!sxAssignOpen || sxAssignTypesLoading || !sxAssignCompanyId) return;
    if (sxAssignTypeId) return;
    const sug = pickWorkshopTypeIdForCompany(
      sxLeadTypeRow,
      sxAssignCompanyId,
      sxAssignTypes,
      sxLeadKind,
    );
    if (sug) setSxAssignTypeId(sug);
  }, [
    sxAssignOpen,
    sxLeadKind,
    sxLeadTypeRow,
    sxAssignTypesLoading,
    sxAssignCompanyId,
    sxAssignTypes,
    sxAssignTypeId,
  ]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const cid = lead?.company_id || currentUser?.company_id;
    const params = cid ? { company_id: String(cid) } : {};
    let cancelled = false;
    api.get('/crm/sources', { params })
      .then((r) => {
        if (cancelled) return;
        setSources(r.data?.sources || (Array.isArray(r.data) ? r.data : []));
      })
      .catch(() => { if (!cancelled) setSources([]); });
    return () => { cancelled = true; };
  }, [lead?.company_id, currentUser?.company_id]);

  useEffect(() => {
    // Fallback: nhiều lead cũ chưa set company_id → vẫn load theo company của user để hiện danh mục phân loại
    const cid = lead?.company_id || currentUser?.company_id;
    if (!cid) { setLeadTypes([]); return; }
    let cancelled = false;
    api.get('/crm/lead-types', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        setLeadTypes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => { if (!cancelled) setLeadTypes([]); });
    return () => { cancelled = true; };
  }, [lead?.company_id, currentUser?.company_id]);

  useEffect(() => {
    const cid = lead?.company_id || currentUser?.company_id;
    if (!cid) { setReferrers([]); return; }
    let cancelled = false;
    api.get('/crm/referrers', { params: { company_id: String(cid) } })
      .then((r) => {
        if (cancelled) return;
        setReferrers(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => { if (!cancelled) setReferrers([]); });
    return () => { cancelled = true; };
  }, [lead?.company_id, currentUser?.company_id]);

  const referrerOptions = useMemo(() => {
    const names = new Set((referrers || []).map((r) => r.name).filter(Boolean));
    const cur = String(lead?.referrer_name || '').trim();
    if (cur && !names.has(cur)) names.add(cur);
    return [...names].sort((a, b) => a.localeCompare(b, 'vi')).map((name) => ({ value: name, label: name }));
  }, [referrers, lead?.referrer_name]);

  useEffect(() => {
    const cid = lead?.company_id;
    if (!cid) {
      setCompanyRegions([]);
      return;
    }
    let cancelled = false;
    api
      .get('/crm/company-regions', { params: { company_id: String(cid), for_module: 'crm' } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) setCompanyRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lead?.company_id]);

  /** NV có crm_region_ids chỉ chọn khu vực được phân; admin / sales_admin chọn mọi khu vực CRM của công ty. */
  const selectableRegions = useMemo(() => {
    const active = companyRegions;
    if (isAdminLike(currentUser)) return active;
    const uidRegions = currentUser?.crm_region_ids;
    if (Array.isArray(uidRegions) && uidRegions.length > 0) {
      const allowed = new Set(uidRegions.map(String));
      let list = active.filter((r) => allowed.has(String(r.id)));
      if (lead?.region_id) {
        const cur = active.find((r) => String(r.id) === String(lead.region_id));
        if (cur && !list.some((r) => String(r.id) === String(cur.id))) {
          list = [cur, ...list];
        }
      }
      return list;
    }
    return active;
  }, [companyRegions, currentUser, lead?.region_id]);

  const saveField = async (field, value) => {
    setSaving(true);
    try {
      const payload = {};
      if (field === 'estimated_value') payload.estimated_value = parseFloat(value) || 0;
      else if (field === 'probability') payload.probability = Math.min(100, Math.max(0, parseInt(value) || 0));
      else if (field === 'source_id') payload.source_id = value || null;
      else if (field === 'lead_type_id') payload.lead_type_id = value || null;
      else if (field === 'referrer_name') payload.referrer_name = value?.trim() || null;
      else if (field === 'assigned_to') {
        payload.assigned_to = value || null;
        payload.lead_owner_id = value || null;
      } else if (field === 'lead_owner_id') {
        payload.lead_owner_id = value || null;
        payload.assigned_to = value || null;
      }
      else if (field === 'expected_close_date') payload.expected_close_date = value || null;
      else if (field === 'description') {
        const text = value != null ? String(value) : '';
        payload.description = text.trim() ? text : null;
      }
      else if (field === 'next_follow_up') payload.next_follow_up = value || null;
      else if (field === 'region_id') {
        const rid = value != null && String(value).trim();
        payload.region_id = rid || null;
        if (payload.region_id && !selectableRegions.some((r) => String(r.id) === String(payload.region_id))) {
          alert('Khu vực không hợp lệ hoặc ngoài phạm vi được phân cho bạn');
          setSaving(false);
          return;
        }
        // Đổi khu vực → bỏ phụ trách cũ (phải chọn lại NV thuộc khu vực mới)
        if (String(payload.region_id || '') !== String(lead?.region_id || '')) {
          payload.assigned_to = null;
          payload.lead_owner_id = null;
        }
      }
      else if (field === 'company_id') {
        payload.company_id = value || null;
        payload.region_id = null;
      }
      else payload[field] = value;

      await api.put(`/crm/leads/${lead.id}`, payload);
      setEditing(null);
      onUpdate();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
    setSaving(false);
  };

  const depositDisplayValue = () => {
    const parts = [];
    const amt = Number(lead?.deposit_amount);
    if (Number.isFinite(amt) && amt > 0) parts.push(formatVND(amt));
    if (lead?.deposit_received === true) parts.push('Đã nhận cọc');
    else if (lead?.deposit_received === false) parts.push('Chưa nhận cọc');
    const lbl = lead?.deposit_label?.trim();
    if (lbl) parts.push(lbl);
    return parts.length ? parts.join(' · ') : null;
  };

  const startEditDeposit = () => {
    setEditing('deposit');
    setDepositDraft({
      amount: lead?.deposit_amount != null && Number(lead.deposit_amount) > 0 ? String(lead.deposit_amount) : '',
      received: lead?.deposit_received === true ? 'yes' : lead?.deposit_received === false ? 'no' : '',
      label: lead?.deposit_label?.trim() || '',
    });
  };

  const saveDeposit = async () => {
    setSaving(true);
    try {
      const rawAmt = depositDraft.amount;
      const deposit_amount = rawAmt === '' || rawAmt == null ? null : Number(rawAmt);
      await api.put(`/crm/leads/${lead.id}`, {
        deposit_amount: deposit_amount != null && deposit_amount > 0 ? deposit_amount : null,
        deposit_received: depositDraft.received === 'yes' ? true : depositDraft.received === 'no' ? false : null,
        deposit_label: depositDraft.label?.trim() || null,
      });
      setEditing(null);
      onUpdate();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu tiền cọc');
    }
    setSaving(false);
  };

  const loadDeadlineHistory = useCallback(async () => {
    if (!lead?.id) return;
    setDeadlineHistoryLoading(true);
    try {
      const { data } = await api.get(`/crm/leads/${lead.id}/deadline-history`);
      setDeadlineHistory(Array.isArray(data) ? data : []);
    } catch {
      setDeadlineHistory([]);
    } finally {
      setDeadlineHistoryLoading(false);
    }
  }, [lead?.id]);

  const saveKanbanDeadline = async ({ deadlineIso, reason }) => {
    if (!lead?.id) return;
    setDeadlineBusy(true);
    try {
      await api.patch(`/crm/leads/${lead.id}/deadline`, {
        kanban_deadline_at: deadlineIso,
        reason: reason || '',
      });
      setDeadlineModalOpen(false);
      onUpdate();
      if (deadlineHistoryOpen) loadDeadlineHistory();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu deadline');
    } finally {
      setDeadlineBusy(false);
    }
  };

  const toggleDeadlineHistory = () => {
    const next = !deadlineHistoryOpen;
    setDeadlineHistoryOpen(next);
    if (next && deadlineHistory.length === 0) loadDeadlineHistory();
  };

  const closeSxAssignModal = () => {
    if (sxAssignBusy) return;
    sxPendingRef.current = false;
    clearSxConfirmTimer();
    setSxAckChecked(false);
    setSxAssignOpen(false);
    setSxAssignNotice('');
  };

  const cancelSxPendingTransfer = () => {
    if (sxAssignBusy) return;
    sxPendingRef.current = false;
    clearSxConfirmTimer();
    setSxAssignNotice('Đã hủy — chưa chuyển công ty SX.');
  };

  const openSxAssignModal = (projectRow = null) => {
    sxPendingRef.current = false;
    clearSxConfirmTimer();
    setSxAckChecked(false);
    const row = projectRow || sxProjectsList.find((p) => p.is_primary) || sxProjectsList[0] || null;
    const pid = row?.project_id || sxAssignBaseline.projectId || lead?.project_id || '';
    const cid = row?.company_id ? String(row.company_id) : (sxAssignBaseline.companyId || '');
    const tid = row?.workshop_type_id ? String(row.workshop_type_id) : (sxAssignBaseline.typeId || '');
    setSxAssignProjectId(pid ? String(pid) : '');
    setSxAssignCompanyId(cid);
    setSxAssignTypeId(tid);
    setSxAssignBaseline((prev) => ({
      ...prev,
      projectId: pid ? String(pid) : prev.projectId,
      companyId: cid,
      typeId: tid,
      typeName: row?.workshop_type_name || prev.typeName,
      companyName: row?.company_name || prev.companyName,
    }));
    setSxAssignNotice('');
    setSxAssignOpen(true);
  };

  const submitSxAddProjects = async () => {
    const err = validateSxTargets(sxAddTargets);
    if (err) {
      setSxAddErr(err);
      return;
    }
    setSxAddBusy(true);
    setSxAddErr('');
    try {
      await api.post(`/crm/deals/${lead.id}/auto-create-project`, {
        mode: 'additional',
        targets: sxTargetsToApiPayload(sxAddTargets),
      });
      setSxAddOpen(false);
      setSxAddTargets([]);
      setSxAssignNotice('Đã thêm dự án SX mới');
      onUpdate();
    } catch (e) {
      setSxAddErr(e.response?.data?.error || e.message || 'Lỗi thêm dự án SX');
    } finally {
      setSxAddBusy(false);
    }
  };

  const onSxCompanyChange = (nextId) => {
    if (sxConfirmWait > 0) return;
    const next = String(nextId || '');
    const prev = String(sxAssignCompanyId || '');
    if (next === prev) return;
    clearSxConfirmTimer();
    setSxAckChecked(false);
    setSxAssignCompanyId(next);
    if (next && next !== String(sxAssignBaseline.companyId || '')) {
      setSxAssignTypes([]);
      setSxAssignTypesLoading(!!next);
      setSxAssignTypeId('');
      setSxAssignNotice('Đã đổi công ty — đang chọn phân loại gợi ý ★.');
    } else if (next === String(sxAssignBaseline.companyId || '')) {
      setSxAssignTypeId(sxAssignBaseline.typeId || '');
      setSxAssignNotice('');
    } else {
      setSxAssignTypes([]);
      setSxAssignTypeId('');
      setSxAssignNotice('');
    }
  };

  const sxAssignDirty = String(sxAssignCompanyId || '') !== String(sxAssignBaseline.companyId || '')
    || String(sxAssignTypeId || '') !== String(sxAssignBaseline.typeId || '');
  const sxCompanyChanged = String(sxAssignCompanyId || '') !== String(sxAssignBaseline.companyId || '');
  const sxNeedRepickType = sxCompanyChanged && !sxAssignTypeId;
  const sxCanStartTransfer = sxAssignDirty
    && !!sxAssignCompanyId
    && !!sxAssignTypeId
    && !sxNeedRepickType
    && sxAckChecked
    && sxConfirmWait === 0
    && !sxAssignBusy;

  const saveSxAssign = async () => {
    const targetPid = sxAssignProjectId || sxAssignBaseline.projectId || lead?.project_id;
    if (!targetPid || !sxPendingRef.current) return;
    if (!sxAssignCompanyId || !sxAssignTypeId) return;
    sxPendingRef.current = false;
    setSxAssignBusy(true);
    setSxAssignNotice('');
    try {
      const { data } = await api.post(`/crm/deals/${lead.id}/reassign-sx`, {
        production_company_id: sxAssignCompanyId,
        workshop_type_id: sxAssignTypeId,
        project_id: targetPid,
      });
      const typeName = data?.workshop_type_name
        || sxAssignTypes.find((t) => String(t.id) === String(sxAssignTypeId))?.name
        || '';
      const companyName = data?.company_name
        || (productionCompaniesSx || []).find((c) => String(c.id) === String(sxAssignCompanyId))?.short_name
        || (productionCompaniesSx || []).find((c) => String(c.id) === String(sxAssignCompanyId))?.name
        || '';
      setSxAssignBaseline({
        projectId: String(data?.project_id || targetPid),
        companyId: String(data?.to_company_id || sxAssignCompanyId),
        typeId: String(data?.to_workshop_type_id || sxAssignTypeId),
        typeName,
        companyName,
      });
      clearSxConfirmTimer();
      setSxAckChecked(false);
      setSxAssignOpen(false);
      setSxAssignNotice(`Đã chuyển: ${companyName || 'SX'}${typeName ? ` · ${typeName}` : ''}`);
      onUpdate();
    } catch (e) {
      setSxAssignNotice(e.response?.data?.error || e.message || 'Lỗi chuyển SX');
      setSxAckChecked(false);
    }
    setSxAssignBusy(false);
  };

  const requestSxTransfer = () => {
    if (!sxCanStartTransfer) return;
    sxPendingRef.current = true;
    setSxAssignNotice('');
    startSxConfirmCountdown(() => {
      if (!sxPendingRef.current) return;
      void saveSxAssign();
    });
  };

  const editableRowProps = { editing, setEditing, saving, onSave: saveField };

  const prob = lead?.probability ?? 0;

  return (
    <div className="bg-white rounded-xl border p-5 space-y-1 overflow-visible" data-tour="lead-info-panel">
      <h3 className="text-sm font-bold uppercase mb-2" style={{ color: '#000000' }}>Thông tin</h3>

      <LeadInfoEditableRow {...editableRowProps} icon="💰" label="Giá trị" field="estimated_value"
        value={lead?.estimated_value || ''}
        displayValue={lead?.estimated_value > 0 ? formatVND(lead.estimated_value) : null}
        type="number" />

      <div className="group">
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
          <span className="text-sm mt-0.5 shrink-0">💵</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Tiền cọc</p>
            {editing === 'deposit' ? (
              <div className="space-y-1.5 relative z-20">
                <input
                  type="number"
                  min="0"
                  value={depositDraft.amount}
                  onChange={(e) => setDepositDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="w-full h-8 px-2 border rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Số tiền VNĐ"
                  autoFocus
                />
                <select
                  value={depositDraft.received}
                  onChange={(e) => setDepositDraft((d) => ({ ...d, received: e.target.value }))}
                  className="w-full h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">Chưa xác định</option>
                  <option value="yes">Đã nhận</option>
                  <option value="no">Chưa nhận</option>
                </select>
                <input
                  type="text"
                  value={depositDraft.label}
                  onChange={(e) => setDepositDraft((d) => ({ ...d, label: e.target.value }))}
                  className="w-full h-8 px-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Mô tả (VD: ký HĐ, lệnh SX)"
                />
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void saveDeposit()} disabled={saving}
                    className="h-8 px-2.5 flex items-center gap-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
                    <Save className="h-3.5 w-3.5" /> Lưu
                  </button>
                  <button type="button" onClick={() => setEditing(null)}
                    className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg cursor-pointer hover:bg-gray-200">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div onClick={startEditDeposit} className="cursor-pointer group/val">
                {depositDisplayValue() ? (
                  <p className="text-sm font-medium" style={{ color: '#000000' }}>{depositDisplayValue()}</p>
                ) : (
                  <p className="text-sm text-gray-300 italic group-hover/val:text-blue-400 transition-colors">
                    Nhấn để nhập...
                  </p>
                )}
              </div>
            )}
          </div>
          {editing !== 'deposit' && (
            <button type="button" onClick={startEditDeposit}
              className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 cursor-pointer transition-opacity shrink-0">
              <Edit2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {lead?.type === 'deal' && (
        <LeadInfoEditableRow {...editableRowProps} icon="📅" label="Dự kiến chốt" field="expected_close_date"
          value={lead?.expected_close_date || ''}
          displayValue={lead?.expected_close_date ? formatDate(lead.expected_close_date) : null}
          type="date" />
      )}

      {/* Deadline thẻ (kanban_deadline_at) — ẩn khi deal đã Thắng / chưa có SĐT */}
      {!lead?.stage?.is_won
        && !lead?.stage?.counts_as_completed_revenue
        && !crmLeadMissingPhone(lead)
        && !lead?.deadline_disabled_at && (
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 my-1.5">
        <div className="flex items-start gap-2">
          <span className="text-sm mt-0.5">⏰</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-rose-500 uppercase tracking-wider font-medium mb-0.5">Deadline thẻ</p>
            {lead?.kanban_deadline_at ? (() => {
              const ts = new Date(lead.kanban_deadline_at).getTime();
              const remain = ts - Date.now();
              const overdue = remain < 0;
              const abs = Math.abs(remain);
              const days = Math.floor(abs / 86400000);
              const hours = Math.floor((abs % 86400000) / 3600000);
              const label = days > 0 ? `${days} ngày ${hours} giờ` : `${hours} giờ`;
              return (
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {new Date(lead.kanban_deadline_at).toLocaleString('vi-VN')}
                  </p>
                  <p className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-emerald-600'}`}>
                    {overdue ? `Đã quá hạn ${label}` : `Còn ${label}`}
                  </p>
                  {lead?.kanban_deadline_reason && (
                    <p className="text-[11px] text-slate-500 mt-0.5 italic">Lý do: {lead.kanban_deadline_reason}</p>
                  )}
                </div>
              );
            })() : (
              <p className="text-sm text-gray-400 italic">Chưa đặt deadline</p>
            )}
          </div>
          <button
            onClick={() => setDeadlineModalOpen(true)}
            className="shrink-0 h-7 px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
          >
            {lead?.kanban_deadline_at ? 'Sửa' : 'Đặt'}
          </button>
        </div>
        <button
          onClick={toggleDeadlineHistory}
          className="mt-1.5 text-[11px] font-medium text-rose-600 hover:text-rose-800 hover:underline"
        >
          {deadlineHistoryOpen ? '▾ Ẩn lịch sử deadline' : '▸ Xem lịch sử deadline'}
        </button>
        {deadlineHistoryOpen && (
          <div className="mt-2 space-y-1.5 border-t border-rose-100 pt-2">
            {deadlineHistoryLoading ? (
              <p className="text-[11px] text-slate-400">Đang tải…</p>
            ) : deadlineHistory.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">Chưa có thay đổi nào.</p>
            ) : (
              deadlineHistory.map((h) => (
                <div key={h.id} className="rounded-md bg-white border border-slate-200 px-2 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">
                      {h.new_deadline_at ? new Date(h.new_deadline_at).toLocaleString('vi-VN') : '— Xoá deadline —'}
                    </span>
                    <span className="text-slate-400">{new Date(h.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                  {h.old_deadline_at && (
                    <p className="text-slate-400 line-through">{new Date(h.old_deadline_at).toLocaleString('vi-VN')}</p>
                  )}
                  <p className="text-slate-600">
                    {h.changer?.full_name || 'Hệ thống'}
                    {h.source === 'stage_move'
                      ? ' · khi chuyển cột'
                      : h.source === 'disable_all'
                        ? ' · tắt tất cả deadline'
                        : ' · sửa thủ công'}
                    {h.stage?.name ? ` · ${h.stage.name}` : ''}
                  </p>
                  {h.reason && <p className="text-slate-500 italic">Lý do: {h.reason}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      )}

      {!lead?.stage?.is_won && !lead?.stage?.counts_as_completed_revenue && (
        <CrmLeadDeadlineOverview lead={lead} onChanged={onUpdate} />
      )}

      {!lead?.stage?.is_won && !lead?.stage?.counts_as_completed_revenue && (
      <CrmDeadlineModal
        open={deadlineModalOpen}
        title={lead?.kanban_deadline_at ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ'}
        subtitle={lead?.kanban_deadline_at ? 'Bắt buộc nhập lý do khi thay đổi deadline.' : 'Mọi thay đổi đều được ghi vào lịch sử.'}
        initialDeadline={lead?.kanban_deadline_at || null}
        currentDeadline={lead?.kanban_deadline_at || null}
        requireReason={!!lead?.kanban_deadline_at}
        allowClear={!!lead?.kanban_deadline_at}
        submitting={deadlineBusy}
        onClose={() => { if (!deadlineBusy) setDeadlineModalOpen(false); }}
        onConfirm={saveKanbanDeadline}
      />
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

      {lead?.type === 'lead' && lead?.revert_to_lead_reason && (
        <div className="flex items-start gap-2 py-1.5 px-1">
          <span className="text-sm">↩️</span>
          <div>
            <span className="text-xs text-gray-500">Lý do trả về Lead</span>
            <p className="text-sm text-amber-700">{lead.revert_to_lead_reason}</p>
          </div>
        </div>
      )}

      <div>
        <LeadInfoEditableRow {...editableRowProps} icon="📊" label="Xác suất" field="probability"
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

      <LeadInfoEditableRow {...editableRowProps} icon="🔗" label="Nguồn" field="source_id"
        value={lead?.source_id || ''}
        displayValue={lead?.source ? `${lead.source.icon} ${lead.source.name}` : null}
        type="select"
        options={sources.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` }))} />

      <LeadInfoEditableRow {...editableRowProps} icon="🤝" label="Người giới thiệu" field="referrer_name"
        value={lead?.referrer_name || ''}
        displayValue={lead?.referrer_name || null}
        type="select"
        options={[
          ...referrerOptions,
          ...(lead?.referrer_name && !referrerOptions.some((o) => o.value === lead.referrer_name)
            ? [{ value: lead.referrer_name, label: lead.referrer_name }]
            : []),
        ]} />

      <LeadInfoEditableRow {...editableRowProps} icon="🏷️" label="Loại" field="lead_type_id"
        value={lead?.lead_type_id || ''}
        displayValue={
          lead?.lead_type_id
            ? (leadTypes.find(t => t.id === lead.lead_type_id)?.name
              || <span className="text-sm text-amber-800" title="Có lead_type_id trên deal nhưng không khớp danh mục công ty này (sau chuyển cột / công ty SX / tắt loại).">Đã gán — ngoài danh mục công ty</span>)
            : (leadTypes.length === 0
              ? <span className="text-sm text-amber-600">Chưa cấu hình phân loại (vào Pipeline Settings)</span>
              : null)
        }
        type="select"
        options={leadTypes
          .filter((t) => t.applies_to === 'both' || t.applies_to === (lead?.type === 'deal' ? 'deal' : 'lead'))
          .map((t) => ({ value: t.id, label: t.name }))} />

      {/* Công ty */}
      <LeadInfoEditableRow {...editableRowProps} icon="🏢" label="Công ty" field="company_id"
        value={lead?.company_id || ''}
        displayValue={lead?.company_id ? companies.find(c => c.id === lead.company_id)?.name || null : null}
        type="select"
        options={companies.map(c => ({ value: c.id, label: c.name }))} />

      {lead?.company_id ? (
        <LeadInfoEditableRow {...editableRowProps}
          icon="📍"
          label="Khu vực"
          field="region_id"
          value={lead?.region_id || ''}
          displayValue={
            lead?.region_id
              ? (companyRegions.find((r) => String(r.id) === String(lead.region_id))?.name
                || lead?.crm_region?.name
                || '—')
              : null
          }
          type="select"
          options={selectableRegions.map((r) => ({
            value: String(r.id),
            label: `${r.name}${r.code ? ` (${r.code})` : ''}${r.division?.short_name || r.division?.name ? ` — ${r.division?.short_name || r.division?.name}` : ''}`,
          }))}
        />
      ) : (
        <div className="group">
          <div className="flex items-start gap-2 py-2 px-1 rounded-lg -mx-1">
            <span className="text-sm mt-0.5 shrink-0">📍</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Khu vực</p>
              <p className="text-xs text-amber-600 italic">Chọn công ty trước để gán khu vực</p>
            </div>
          </div>
        </div>
      )}

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
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {lead?.assignee?.full_name || lead?.lead_owner?.full_name || 'Chưa gán'}
                </p>
                {typeof onOpenTransferAssignee === 'function' ? (
                  <button
                    type="button"
                    onClick={onOpenTransferAssignee}
                    className="w-full h-8 px-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    Chuyển người phụ trách
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <LeadInfoEditableRow {...editableRowProps} icon="📅" label="Dự kiến chốt" field="expected_close_date"
        value={lead?.expected_close_date || ''}
        displayValue={lead?.expected_close_date ? formatDate(lead.expected_close_date) : null}
        type="date" />

      <LeadInfoEditableRow {...editableRowProps} icon="🔔" label="Theo dõi tiếp" field="next_follow_up"
        value={lead?.next_follow_up || ''}
        displayValue={lead?.next_follow_up ? formatDate(lead.next_follow_up) : null}
        type="date" />

      <LeadInfoEditableRow {...editableRowProps} icon="📝" label="Mô tả" field="description"
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
              <label className="block text-[10px] font-semibold text-amber-900">
                Công ty Sản xuất (module xưởng) <span className="text-red-600">*</span>
                <select
                  value={sxHandoverForm.production_company_id}
                  onChange={(e) => { setSxHandoverForm((f) => ({ ...f, production_company_id: e.target.value })); setSxHandoverNotice(''); }}
                  className="mt-0.5 w-full h-9 px-2 border border-amber-200 rounded-lg text-sm bg-white"
                >
                  <option value="">— Chọn công ty —</option>
                  {productionCompaniesSx.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </label>
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
                  if (!sxHandoverForm.production_company_id) {
                    setSxHandoverNotice('Vui lòng chọn công ty Sản xuất (module xưởng).');
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
                      production_company_id: sxHandoverForm.production_company_id,
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
          {/* Công ty SX — nhiều xưởng, sửa / thêm */}
          <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2.5 my-0.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                🏭 Công ty SX
                {sxProjectsList.length > 1 ? (
                  <span className="ml-1 normal-case font-semibold text-orange-700">
                    ({sxProjectsList.length} xưởng)
                  </span>
                ) : null}
              </p>
            </div>
            <ul className="space-y-1.5">
              {sxProjectsList.map((pp) => {
                const showPrimaryBadge = sxProjectsList.length <= 1;
                const coName = pp.company_name
                  || (productionCompaniesSx || []).find((c) => String(c.id) === String(pp.company_id))?.short_name
                  || (productionCompaniesSx || []).find((c) => String(c.id) === String(pp.company_id))?.name
                  || '—';
                const typeName = pp.workshop_type_name || '—';
                return (
                  <li
                    key={pp.project_id}
                    className="rounded-lg border border-orange-100 bg-white/80 px-2.5 py-2 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {coName}
                          {showPrimaryBadge && pp.is_primary ? (
                            <span className="ml-1 text-[10px] font-semibold text-teal-700">(chính)</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          Phân loại: {typeName}
                          {pp.code ? ` · ${pp.code}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pp.project_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/sx/projects/${pp.project_id}`)}
                          className="h-7 px-2 rounded-md text-[11px] font-semibold border border-teal-200 text-teal-700 hover:bg-teal-50 cursor-pointer"
                        >
                          Mở SX
                        </button>
                      )}
                      {isAdminLike(currentUser) && (
                        <button
                          type="button"
                          onClick={() => openSxAssignModal(pp)}
                          className="h-7 px-2 rounded-md text-[11px] font-semibold bg-orange-600 text-white hover:bg-orange-700 cursor-pointer"
                        >
                          Sửa / chuyển
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {sxAssignNotice && !sxAssignOpen && !sxAddOpen && (
              <p className="text-[11px] text-emerald-700">{sxAssignNotice}</p>
            )}
            {isAdminLike(currentUser) && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => openSxAssignModal()}
                    className="h-9 px-3 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 cursor-pointer"
                  >
                    Chuyển công ty SX
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSxAddErr(''); setSxAddTargets([]); setSxAddOpen(true); }}
                    className="h-9 px-3 rounded-lg text-xs font-semibold border border-orange-300 text-orange-800 bg-white hover:bg-orange-50 cursor-pointer"
                  >
                    + Thêm công ty SX
                  </button>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
                  <p className="font-semibold text-amber-900 mb-1">Hướng dẫn chọn xưởng</p>
                  {sxHintFromCrmType ? (
                    <p className="mb-1.5 text-amber-950">{sxHintFromCrmType}</p>
                  ) : null}
                  <p className="mb-1.5 text-amber-900/90">
                    Có thể SX ở nhiều công ty (vd. cửa Phúc Đạt + tủ HCB). Bấm «+ Thêm công ty SX» để tạo thẻ Kanban mới.
                  </p>
                  <SxPickGuideList company={lead?.company} className="space-y-0.5 list-disc pl-3.5" />
                </div>
              </div>
            )}
          </div>

          {sxAddOpen && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
              onClick={() => { if (!sxAddBusy) { setSxAddOpen(false); setSxAddErr(''); } }}
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Thêm công ty SX</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Tạo thêm dự án xưởng cho deal (không ghi đè dự án chính).
                    </p>
                  </div>
                  <button type="button" disabled={sxAddBusy} onClick={() => { setSxAddOpen(false); setSxAddErr(''); }} className="p-1 cursor-pointer">
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
                <SxMultiTargetPicker
                  key="leadinfo-add-sx"
                  companies={sxCompaniesForSelect}
                  leadTypeRow={sxLeadTypeRow}
                  kind={sxLeadKind}
                  accent="orange"
                  disabled={sxAddBusy}
                  onChange={(rows) => { setSxAddTargets(rows); setSxAddErr(''); }}
                />
                {sxAddErr && <p className="text-xs text-red-600">{sxAddErr}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={sxAddBusy}
                    onClick={() => { setSxAddOpen(false); setSxAddErr(''); }}
                    className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={sxAddBusy || !!validateSxTargets(sxAddTargets)}
                    onClick={() => submitSxAddProjects()}
                    className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                  >
                    {sxAddBusy ? 'Đang tạo…' : 'Thêm dự án'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {sxAssignOpen && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
              onClick={closeSxAssignModal}
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Sửa / chuyển công ty SX</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {sxAssignProjectId
                        ? 'Đang sửa một dự án SX của deal. Chọn công ty + phân loại, tích xác nhận, rồi «Xác nhận chuyển» (đếm 5 giây).'
                        : 'Chọn công ty + phân loại, tích xác nhận, rồi «Xác nhận chuyển» (đếm 5 giây).'}
                    </p>
                  </div>
                  <button type="button" onClick={closeSxAssignModal} disabled={sxAssignBusy} className="p-1 cursor-pointer disabled:opacity-40">
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-950">
                  <p className="font-semibold text-amber-900 mb-1">Hướng dẫn chọn xưởng</p>
                  {sxHintFromCrmType ? (
                    <p className="mb-1.5">{sxHintFromCrmType}</p>
                  ) : (
                    <p className="mb-1.5 text-amber-800/90">{sxPickGuideFallbackText(lead?.company)}</p>
                  )}
                  <SxPickGuideList company={lead?.company} />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600">
                    Công ty sản xuất *
                    {(sxLeadKind || sxDbPref.companyIds?.length) ? (
                      <span className="ml-1 font-normal text-gray-500">
                        (<span className="text-red-600 font-bold">★</span> = gợi ý theo loại CRM)
                      </span>
                    ) : null}
                  </label>
                  <SxCompanyPickList
                    companies={sxCompaniesForSelect}
                    value={sxAssignCompanyId}
                    leadTypeRow={sxLeadTypeRow}
                    kind={sxLeadKind}
                    accent="orange"
                    disabled={sxAssignBusy || sxConfirmWait > 0}
                    onChange={(id) => onSxCompanyChange(id)}
                  />
                </div>

                <div className={sxNeedRepickType ? 'rounded-xl ring-2 ring-amber-400/80 p-2 bg-amber-50/70' : ''}>
                  <label className={`text-xs font-medium ${sxNeedRepickType ? 'text-amber-800' : 'text-gray-600'}`}>
                    Phân loại * {sxNeedRepickType ? '(chọn lại)' : ''}
                    {sxLeadKind || sxDbPref.workshopTypeId ? (
                      <span className="ml-1 font-normal text-gray-500">
                        (<span className="text-red-600 font-bold">★</span> = gợi ý)
                      </span>
                    ) : null}
                  </label>
                  <select
                    value={sxAssignTypeId}
                    onChange={(e) => {
                      if (sxConfirmWait > 0) return;
                      setSxAssignTypeId(e.target.value);
                      setSxAssignNotice('');
                      setSxAckChecked(false);
                      clearSxConfirmTimer();
                    }}
                    disabled={sxAssignBusy || sxConfirmWait > 0 || !sxAssignCompanyId || sxAssignTypesLoading}
                    className="mt-1 w-full h-10 px-3 border rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">
                      {!sxAssignCompanyId
                        ? '— Chọn công ty trước —'
                        : sxAssignTypesLoading
                          ? 'Đang tải…'
                          : sxTypesForSelect.length === 0
                            ? '— Chưa có phân loại —'
                            : sxNeedRepickType
                              ? '— Chọn lại phân loại —'
                              : '— Chọn phân loại —'}
                    </option>
                    {sxTypesForSelect.map((t) => (
                      <option key={t.id} value={t.id}>
                        {workshopTypePreferredForLeadType(t.id, sxLeadTypeRow, sxAssignCompanyId)
                          || workshopTypeMatchesSxKind(t.name, sxLeadKind)
                          ? `★ ${t.name}`
                          : t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {sxAssignNotice && (
                  <p className={`text-xs ${
                    sxAssignNotice.includes('Đã đổi') || sxAssignNotice.includes('Gợi ý')
                      ? 'text-amber-800'
                      : 'text-red-600'
                  }`}>
                    {sxAssignNotice}
                  </p>
                )}

                <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer ${
                  sxAckChecked ? 'border-orange-300 bg-orange-50/80' : 'border-gray-200 bg-gray-50/80'
                } ${sxConfirmWait > 0 || sxAssignBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    checked={sxAckChecked}
                    disabled={sxAssignBusy || sxConfirmWait > 0}
                    onChange={(e) => setSxAckChecked(e.target.checked)}
                  />
                  <span className="text-[12px] leading-snug text-gray-800">
                    Đã kiểm tra và chọn đúng công ty sản xuất (và phân loại) trước khi chuyển.
                  </span>
                </label>

                <p className="text-[11px] text-gray-500 leading-snug">
                  Sau khi chuyển: thay thành viên SX mặc định và tạo lại nhiệm vụ mẫu (tiến độ NV mẫu cũ sẽ mất).
                </p>

                {sxConfirmWait > 0 && (
                  <div className="rounded-xl border-2 border-sky-400 bg-sky-50 px-3 py-3 text-sm text-sky-950 flex items-center justify-between gap-2 shadow-sm">
                    <span>
                      Đang chuyển sau <strong className="text-lg tabular-nums text-sky-700">{sxConfirmWait}s</strong>…
                    </span>
                    <button
                      type="button"
                      disabled={sxAssignBusy}
                      onClick={cancelSxPendingTransfer}
                      className="shrink-0 h-9 px-3 rounded-lg text-sm font-bold border border-sky-400 bg-white text-sky-900 hover:bg-sky-100 cursor-pointer disabled:opacity-50"
                    >
                      Hủy
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={sxAssignBusy}
                    onClick={sxConfirmWait > 0 ? cancelSxPendingTransfer : closeSxAssignModal}
                    className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    {sxConfirmWait > 0 ? 'Hủy chuyển' : 'Đóng'}
                  </button>
                  <button
                    type="button"
                    disabled={!sxCanStartTransfer}
                    onClick={requestSxTransfer}
                    className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sxAssignBusy
                      ? 'Đang chuyển…'
                      : sxConfirmWait > 0
                        ? `Chuyển sau ${sxConfirmWait}s`
                        : !sxAssignDirty
                          ? 'Chưa thay đổi'
                          : sxNeedRepickType || !sxAssignTypeId
                            ? 'Chọn phân loại'
                            : !sxAckChecked
                              ? 'Tích xác nhận đã kiểm tra'
                              : 'Xác nhận chuyển'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                    {(sx.company?.short_name || sx.company?.name) && (
                      <span className="text-gray-500 normal-case ml-1 font-medium">
                        · {sx.company.short_name || sx.company.name}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: sx.color || '#0c4a6e' }}>
                    {label}
                  </p>
                </div>
              </div>
            );
          })()}
          {/* Trạng thái Vận chuyển */}
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
                    🔧 Lắp đặt
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
          <VcBookingInfoBlock lead={lead} />
        </div>
      )}
    </div>
  );
}

function VcBookingInfoBlock({ lead }) {
  const p = lead?.linked_project;
  const pickupIso = p?.pickup_at;
  if (!pickupIso) return null;
  const d = new Date(pickupIso);
  const valid = !Number.isNaN(d.getTime());
  const label = valid
    ? d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    })
    : '—';
  return (
    <div className="flex items-start gap-2 py-2 px-3 rounded-lg border bg-sky-50 border-sky-200">
      <span className="text-base mt-0.5 shrink-0">🚚</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-sky-700">
          Đặt vận chuyển
        </p>
        <p className="text-sm font-semibold text-sky-900">Đi lấy: {label}</p>
        {p?.pickup_notes && (
          <p className="text-[11px] text-sky-700/90 mt-1 leading-snug break-words">Ghi chú: {p.pickup_notes}</p>
        )}
      </div>
    </div>
  );
}

// ── Form tạo khách hàng mới khi lead chưa có customer ──
function CustomerCreateForm({ leadId, lead, onCreated }) {
  const zaloLead = isZaloInboxLead(lead);
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', address: '', company: '', tax_code: '',
  });
  const [saving, setSaving] = useState(false);

  const fields = [
    { key: 'full_name', label: '👤 Họ tên', required: true, placeholder: 'Nguyễn Văn A' },
    { key: 'phone', label: '📞 Số điện thoại', required: !zaloLead, placeholder: zaloLead ? 'Có thể bổ sung sau (Zalo)' : '0912 345 678', type: 'tel' },
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
  const [regions, setRegions] = useState([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(lead?.region_id ? String(lead.region_id) : '');

  const zaloLead = isZaloInboxLead(lead);
  const customerOk = customerReadyForDealConvert(customer, lead);
  const canConvert = customerOk && !!selectedRegion;

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

  // Load khu vực CRM khi chọn công ty
  useEffect(() => {
    if (!selectedCompany) {
      setRegions([]);
      return undefined;
    }
    let cancel = false;
    setRegionsLoading(true);
    api
      .get('/crm/company-regions', { params: { company_id: selectedCompany, for_module: 'crm' } })
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancel) setRegions([]);
      })
      .finally(() => {
        if (!cancel) setRegionsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [selectedCompany]);

  // Bỏ chọn region nếu không thuộc danh mục theo công ty hiện tại
  useEffect(() => {
    if (!selectedRegion) return;
    if (regions.length === 0) {
      // Đang tải hoặc công ty chưa có khu vực CRM — không giữ region SX cũ
      if (!regionsLoading) setSelectedRegion('');
      return;
    }
    if (!regions.some((r) => String(r.id) === String(selectedRegion))) setSelectedRegion('');
  }, [regions, regionsLoading, selectedRegion]);

  const handleConvert = async () => {
    if (!selectedRegion) {
      alert('Vui lòng chọn khu vực trước khi chuyển sang Deal');
      return;
    }
    setConverting(true);
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/convert-to-deal`, {
        ...(selectedSales ? { assigned_to: selectedSales } : {}),
        company_id: selectedCompany || undefined,
        region_id: selectedRegion,
      });
      alert(`✅ ${data.message}`);
      onSuccess(data?.lead?.id || data?.deal?.id || data?.id || leadId);
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
            <div className={`text-sm flex items-center gap-2 ${customerOk ? 'text-emerald-600' : 'text-red-600'}`}>
              {customerOk ? '✅' : '❌'} Khách hàng: {customer?.full_name || '—'}
              {customer?.phone
                ? `, ${customer.phone}`
                : zaloLead
                  ? ' (Zalo — không bắt buộc SĐT)'
                  : ', Chưa có SĐT'}
            </div>
            <div className={`text-sm flex items-center gap-2 ${selectedRegion ? 'text-emerald-600' : 'text-red-600'}`}>
              {selectedRegion ? '✅' : '❌'} Khu vực: {regions.find((r) => String(r.id) === String(selectedRegion))?.name || 'Chưa chọn'}
            </div>
          </div>

          {/* Chọn Công ty */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">🏢 Công ty thực hiện</label>
            <select value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedSales(''); setSelectedRegion(''); }}
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

          {/* Chọn Khu vực — bắt buộc */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">
              📍 Khu vực <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedSales('');
              }}
              disabled={!selectedCompany || regionsLoading || regions.length === 0}
              className="w-full h-10 px-3 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {!selectedCompany
                  ? '-- Chọn công ty trước --'
                  : regionsLoading
                    ? 'Đang tải khu vực…'
                    : regions.length === 0
                      ? '-- Công ty chưa có khu vực --'
                      : '-- Chọn khu vực --'}
              </option>
              {regions.map((reg) => (
                <option key={reg.id} value={reg.id}>{reg.name}</option>
              ))}
            </select>
            {selectedCompany && !regionsLoading && regions.length === 0 && (
              <p className="text-[10px] text-amber-500 mt-0.5">⚠️ Công ty chưa có khu vực — vào CRM/Khu vực để thêm trước</p>
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
              regionId={selectedRegion}
              requireRegion
              value={selectedSales}
              onChange={(userId) => setSelectedSales(userId || '')}
              placeholder="Chọn nhân viên phụ trách..."
              size="md"
            />
            {!selectedCompany ? (
              <p className="text-[10px] text-amber-500 mt-0.5">⚠️ Chọn công ty trước để lọc nhân viên</p>
            ) : !selectedRegion ? (
              <p className="text-[10px] text-amber-500 mt-0.5">⚠️ Chọn khu vực trước để lọc nhân viên thuộc khu vực</p>
            ) : null}
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

function RevertToLeadModal({ leadId, lead, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [newOwner, setNewOwner] = useState(lead?.assigned_to || lead?.lead_owner_id || '');
  const [reason, setReason] = useState('');
  const [unlinkProject, setUnlinkProject] = useState(false);
  const [error, setError] = useState('');

  const hasProject = !!lead?.project_id;
  const canSubmit =
    !!newOwner && !!reason.trim() && !submitting && (!hasProject || unlinkProject);

  const handleSubmit = async () => {
    if (!newOwner) {
      setError('Vui lòng chọn người phụ trách Lead mới.');
      return;
    }
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do trả Deal về Lead.');
      return;
    }
    if (hasProject && !unlinkProject) {
      setError('Deal đang có dự án SX — cần tích xác nhận gỡ liên kết dự án.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/convert-to-lead`, {
        assigned_to: newOwner,
        reason: reason.trim(),
        ...(hasProject ? { unlink_project: true } : {}),
      });
      if (data?.message) {
        // eslint-disable-next-line no-alert
        alert(`✅ ${data.message}`);
      }
      onSuccess?.(data?.lead?.id || leadId);
    } catch (e) {
      setError(e.response?.data?.error || 'Có lỗi khi trả deal về Lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            Trả Deal về Lead
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
            Deal <strong>{lead?.code || ''}</strong> sẽ được chuyển về trạng thái <strong>Lead</strong> và đặt lại
            về cột nhận Lead trả về của pipeline. Mọi dữ liệu (báo giá, tài liệu, lịch sử) vẫn được giữ nguyên.
          </div>

          {hasProject && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-orange-900 font-medium">
                Deal này đã có dự án SX. Trả về Lead sẽ <strong>gỡ liên kết</strong> dự án khỏi deal
                (không xóa dự án trên module Xưởng/SX). Chỉ admin công ty/khu vực mới thực hiện được.
              </p>
              <label className="flex items-start gap-2 text-sm text-orange-950 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-orange-400"
                  checked={unlinkProject}
                  onChange={(e) => setUnlinkProject(e.target.checked)}
                />
                <span>Tôi xác nhận gỡ liên kết dự án SX khỏi deal này</span>
              </label>
            </div>
          )}

          {(lead?.lead_owner || lead?.assignee) && (
            <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
              <p className="text-xs font-bold text-purple-700 mb-1">👤 Người phụ trách deal hiện tại</p>
              <p className="text-sm text-purple-900">
                {lead?.assignee?.full_name || lead?.lead_owner?.full_name || '—'}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">
              👤 Người phụ trách Lead mới <span className="text-red-500">*</span>
            </label>
            <EmployeePicker
              companyId={lead?.company_id || ''}
              regionId={lead?.region_id || ''}
              requireRegion
              value={newOwner}
              onChange={(uid) => setNewOwner(uid || '')}
              placeholder="Chọn nhân viên phụ trách Lead..."
              size="md"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {!lead?.region_id
                ? 'Deal chưa có khu vực — gán khu vực trước khi chọn người phụ trách.'
                : 'Lead sau khi trả về sẽ thuộc người này (cùng công ty + khu vực).'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">
              📝 Lý do trả về Lead <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="VD: Khách chưa sẵn sàng, cần nuôi tiếp ở Lead…"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[10px] text-gray-400 mt-1 text-right">{reason.trim().length}/500</p>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-10 border rounded-lg font-medium cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Đang xử lý...' : '↩️ Trả về Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}


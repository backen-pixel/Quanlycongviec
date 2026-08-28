import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPlatformAdmin, isSystemAdmin } from '../lib/adminRole';
import { alertIncomingNotification, cancelNotificationSpeech } from '../lib/notificationAlert';
import { setNotificationPrefsCache, getNotificationPrefsCache, isNotificationTypeEnabled } from '../lib/notificationPrefsCache';
import { isExpiryDeadlineNotificationType } from '../lib/notificationOperationalFilter';
import { Bell, Check, CheckCheck, Clock, MessageSquare, CheckSquare, FolderKanban, AlertTriangle, X, ThumbsUp, ThumbsDown, Paperclip, FileText, Shield, ShieldCheck, ShieldAlert, XCircle, RotateCcw, Settings, Users, Factory, Truck, Calendar, CalendarClock, CheckCircle2, Sparkles, ClipboardList, BellOff, Filter } from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';
import NotificationToast from './NotificationToast';
import NotificationSettings from './NotificationSettings';
import { AI_DEADLINE_DIGEST_EVENT } from '../lib/aiDeadlineDigestEvent';
import { dispatchBadgeRefresh } from '../shared/lib/badgeEvents';
import { useMessengerDock } from '../context/MessengerDockContext';
import { markWorkshopPipelineCardFocus } from '../lib/workshopPipelineStorage';
import {
  resolveActiveModule,
  sidebarModuleToNotificationFilter,
} from '../lib/sidebarModuleContext';

const ICON_MAP = {
  task_assigned: CheckSquare,
  task_complete_reminder: Bell,
  task_updated: CheckSquare,
  task_overdue: AlertTriangle,
  task_completed: CheckSquare,
  comment_added: MessageSquare,
  project_stage_changed: FolderKanban,
  project_assigned: FolderKanban,
  stage_changed: FolderKanban,
  approval_request: Shield,
  approval_approved: ShieldCheck,
  approval_rejected: XCircle,
  approval_auto: ShieldCheck,
  deadline_reminder: Clock,
  deadline_warning: Clock,
  deadline_overdue: AlertTriangle,
  production_task_deadline_warning: Clock,
  production_task_deadline_overdue: AlertTriangle,
  logistics_task_deadline_warning: Clock,
  logistics_task_deadline_overdue: AlertTriangle,
  project_pipeline_deadline_warning: Clock,
  project_pipeline_deadline_overdue: AlertTriangle,
  checklist_completed: CheckSquare,
  lead_assigned: CheckSquare,
  lead_created: FolderKanban,
  lead_converted: FolderKanban,
  lead_stage_changed: FolderKanban,
  lead_member_added: Users,
  lead_chat: MessageSquare,
  lead_member: CheckSquare,
  deal_assigned: CheckSquare,
  deal_created: FolderKanban,
  deal_won: FolderKanban,
  quotation_created: FileText,
  quotation_updated: FileText,
  order_created: FileText,
  order_confirmed: FileText,
  order_updated: FileText,
  invoice_created: FileText,
  invoice_overdue: AlertTriangle,
  payment_received: CheckSquare,
  crm_task_assigned: CheckSquare,
  crm_task_completed: CheckSquare,
  crm_assignment_assigned: CheckSquare,
  crm_assignment_comment: MessageSquare,
  crm_assignment_due_soon: Clock,
  crm_assignment_overdue: AlertTriangle,
  document_uploaded: Paperclip,
  project_created: FolderKanban,
  workshop_new_deal: Factory,
  vc_plan_ready: Truck,
  vc_handover_request: Truck,
  sx_schedule_changed: CalendarClock,
  item_deleted: AlertTriangle,
  system: Bell,
  crm_deadline_1h: Clock,
  crm_deadline_warning: Clock,
  crm_deadline_overdue: AlertTriangle,
  crm_deadline_set: Calendar,
  lead_stage_sla_reminder: Clock,
  cskh_followup_reminder: CalendarClock,
  event_created: Calendar,
  event_completed: CheckCircle2,
  ai_crm_deadline_digest: Sparkles,
};

/** Khớp backend `dashboard.js` — tin nhắn CRM/Messenger + bình luận lead/deal */
const CHAT_NOTIFICATION_TYPES = ['lead_chat', 'messenger_chat'];

function isLeadCommentMentionNotification(n) {
  if (!n || n.type !== 'comment_added') return false;
  const et = String(n.entity_type || '');
  if (!['lead', 'crm_lead', 'crm_deal'].includes(et)) return false;
  return true;
}

function isChatChannelNotification(n) {
  return CHAT_NOTIFICATION_TYPES.includes(n?.type) || isLeadCommentMentionNotification(n);
}
const EVENT_NOTIFICATION_TYPES = ['event_created', 'event_completed'];
const ASSIGNMENT_NOTIFICATION_TYPES = [
  'crm_assignment_assigned',
  'crm_assignment_comment',
  'crm_assignment_due_soon',
  'crm_assignment_overdue',
  'crm_task_assigned',
];
const DEAL_ACTIVITY_NOTIFICATION_TYPES = ['deal_assigned', 'deal_created', 'deal_won', 'workshop_new_deal', 'crm_deal'];

function isAssignmentNotification(n) {
  if (!n) return false;
  if (n.entity_type === 'crm_assignment') return true;
  return ASSIGNMENT_NOTIFICATION_TYPES.includes(String(n?.type || ''));
}

function isDealActivityNotification(n) {
  if (!n) return false;
  if (isLeadCommentMentionNotification(n)) return false;
  const type = String(n?.type || '');
  if (DEAL_ACTIVITY_NOTIFICATION_TYPES.includes(type)) return true;
  return String(n?.entity_type || '') === 'crm_deal';
}

const COLOR_MAP = {
  task_assigned: 'bg-blue-100 text-blue-600',
  task_complete_reminder: 'bg-amber-100 text-amber-700',
  task_updated: 'bg-emerald-100 text-emerald-600',
  task_overdue: 'bg-red-100 text-red-600',
  task_completed: 'bg-emerald-100 text-emerald-600',
  comment_added: 'bg-purple-100 text-purple-600',
  project_stage_changed: 'bg-amber-100 text-amber-600',
  project_assigned: 'bg-blue-100 text-blue-600',
  stage_changed: 'bg-amber-100 text-amber-600',
  approval_request: 'bg-orange-100 text-orange-600',
  approval_approved: 'bg-emerald-100 text-emerald-600',
  approval_rejected: 'bg-red-100 text-red-600',
  approval_auto: 'bg-emerald-100 text-emerald-600',
  deadline_reminder: 'bg-orange-100 text-orange-600',
  deadline_warning: 'bg-amber-100 text-amber-600',
  deadline_overdue: 'bg-red-100 text-red-600',
  production_task_deadline_warning: 'bg-amber-100 text-amber-600',
  production_task_deadline_overdue: 'bg-red-100 text-red-600',
  logistics_task_deadline_warning: 'bg-amber-100 text-amber-600',
  logistics_task_deadline_overdue: 'bg-red-100 text-red-600',
  project_pipeline_deadline_warning: 'bg-amber-100 text-amber-600',
  project_pipeline_deadline_overdue: 'bg-red-100 text-red-600',
  checklist_completed: 'bg-lime-100 text-lime-700',
  lead_assigned: 'bg-cyan-100 text-cyan-600',
  lead_member_added: 'bg-indigo-100 text-indigo-600',
  lead_chat: 'bg-purple-100 text-purple-600',
  lead_member: 'bg-cyan-100 text-cyan-600',
  deal_won: 'bg-emerald-100 text-emerald-600',
  order_confirmed: 'bg-orange-100 text-orange-600',
  invoice_overdue: 'bg-red-100 text-red-600',
  workshop_new_deal: 'bg-sky-100 text-sky-700',
  vc_plan_ready: 'bg-amber-100 text-amber-700',
  vc_handover_request: 'bg-red-100 text-red-700',
  sx_schedule_changed: 'bg-indigo-100 text-indigo-700',
  system: 'bg-gray-100 text-gray-600',
  crm_deadline_1h: 'bg-amber-100 text-amber-700',
  crm_deadline_warning: 'bg-amber-100 text-amber-700',
  crm_deadline_overdue: 'bg-red-100 text-red-600',
  crm_deadline_set: 'bg-blue-100 text-blue-600',
  lead_stage_sla_reminder: 'bg-amber-100 text-amber-800',
  cskh_followup_reminder: 'bg-emerald-100 text-emerald-700',
  event_created: 'bg-violet-100 text-violet-600',
  event_completed: 'bg-emerald-100 text-emerald-600',
  ai_crm_deadline_digest: 'bg-fuchsia-100 text-fuchsia-700',
  crm_assignment_assigned: 'bg-indigo-100 text-indigo-700',
  crm_assignment_comment: 'bg-purple-100 text-purple-600',
  crm_assignment_due_soon: 'bg-amber-100 text-amber-700',
  crm_assignment_overdue: 'bg-red-100 text-red-600',
  crm_task_assigned: 'bg-indigo-100 text-indigo-700',
};

const MODULE_FILTER_OPTIONS = [
  { id: 'all', label: 'Tất cả phân loại' },
  { id: 'crm', label: 'CRM / Lead' },
  { id: 'production', label: 'Sản xuất' },
  { id: 'logistics', label: 'Lắp đặt' },
  { id: 'project', label: 'Dự án' },
];

const LS_NOTIF_FILTERS = 'qlcv_notification_filters_v1';

function readStoredNotifFilters() {
  try {
    const raw = localStorage.getItem(LS_NOTIF_FILTERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredNotifFilters(payload) {
  try {
    localStorage.setItem(LS_NOTIF_FILTERS, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function extractNotificationProjectOption(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const id = meta.project_id || (String(n?.entity_type || '') === 'project' ? n.entity_id : null);
  if (id == null || String(id).trim() === '') return null;
  const code = String(meta.project_code || '').trim();
  const name = String(meta.project_name || '').trim();
  const label = code && name && code !== name
    ? `${code} — ${name}`
    : (code || name || String(id).slice(0, 8));
  return { id: String(id), label };
}

function notificationMatchesProjectFilter(n, projectId) {
  if (!projectId) return true;
  const pid = String(projectId);
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (meta.project_id != null && String(meta.project_id) === pid) return true;
  if (String(n?.entity_type || '') === 'project' && n?.entity_id != null && String(n.entity_id) === pid) {
    return true;
  }
  return false;
}

function resolveAssignmentEntityId(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : null;
  if (meta?.assignment_id != null && String(meta.assignment_id).trim() !== '') {
    return String(meta.assignment_id).trim();
  }
  if (n?.entity_id != null && String(n.entity_id).trim() !== '') {
    return String(n.entity_id).trim();
  }
  return null;
}

function navigateCrmAssignment(navigate, nOrEntityId) {
  const id = typeof nOrEntityId === 'object' && nOrEntityId !== null
    ? resolveAssignmentEntityId(nOrEntityId)
    : (nOrEntityId != null ? String(nOrEntityId) : null);
  const meta = typeof nOrEntityId === 'object' && nOrEntityId !== null ? nOrEntityId.metadata : null;
  const navPath = meta?.nav_path || (meta?.module_key === 'production' ? '/sx/assignments' : '/crm/assignments');
  const moduleContext = meta?.module_key === 'production' ? 'production' : 'crm';
  navigate(id ? `${navPath}?open=${id}` : navPath, { state: { moduleContext } });
}

function notificationMatchesSidebarModule(n, moduleFilter) {
  const m = String(moduleFilter || 'all').toLowerCase();
  if (!m || m === 'all') return true;
  if (isChatChannelNotification(n)) return true;
  if (String(n?.type || '') === 'workshop_new_deal' && (m === 'production' || m === 'logistics')) return true;
  return inferNotificationModuleKey(n) === m;
}

function inferNotificationModuleKey(n) {
  if (isLeadCommentMentionNotification(n)) {
    const emk = n?.metadata?.ecosystem_module_key || n?.metadata?.module_key;
    if (emk === 'production') return 'production';
    if (emk === 'logistics') return 'logistics';
    return 'crm';
  }
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  let mk = String(meta.module_key || meta.ecosystem_module_key || meta.module || meta.event_module || '').trim();
  if (mk === 'projects') mk = 'project';
  if (mk === 'sx') mk = 'production';
  if (mk === 'vc') mk = 'logistics';
  if (mk === 'crm' || mk === 'production' || mk === 'logistics' || mk === 'project') return mk;
  if (isAssignmentNotification(n)) return 'crm';
  const ty = String(n?.type || '');
  if (ty === 'lead_stage_sla_reminder' || ty === 'cskh_followup_reminder') return 'crm';
  if (ty.startsWith('crm_deadline') || ty === 'invoice_overdue' || ty === 'deadline_reminder') return 'crm';
  if (ty.includes('production_task_deadline') || ty === 'workshop_new_deal') return 'production';
  if (ty.includes('logistics_task_deadline')) return 'logistics';
  if (ty.includes('project_pipeline_deadline') || ty === 'deadline_warning' || ty === 'deadline_overdue') return 'project';
  if (ty === 'event_created' || ty === 'event_completed') {
    return mk || 'crm';
  }
  const et = String(n?.entity_type || '');
  if (et === 'crm_deal' || et === 'crm_lead' || et === 'lead' || et === 'event') return 'crm';
  return mk || '';
}

function eventsPathForNotification(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const mod = String(meta.module || meta.event_module || meta.module_key || '').toLowerCase();
  if (mod === 'production') return '/sx/events';
  if (mod === 'logistics') return '/vc/events';
  const inferred = inferNotificationModuleKey(n);
  if (inferred === 'production') return '/sx/events';
  if (inferred === 'logistics') return '/vc/events';
  if (String(n?.type || '').includes('vc_handover') || String(n?.type || '') === 'event_created') {
    // Bàn giao VC / sự kiện lấy hàng → ưu tiên module VC
    if (meta.lead_id || n?.entity_type === 'event') return '/vc/events';
  }
  return '/crm/events';
}

/** Bình luận deal — mở tab Bình luận ở SX nếu deal gắn dự án xưởng. */
function navigateLeadCommentMention(navigate, n, setOpen) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const navTab = meta.nav_tab || 'comments';
  const pid = meta.project_id;
  const isProd = meta.ecosystem_module_key === 'production' || meta.module_key === 'production';
  if (pid && isProd) {
    navigate(`/sx/projects/${pid}?tab=${navTab}`);
  } else if (n?.entity_id) {
    navigate(`/crm/leads/${n.entity_id}?tab=${navTab}`);
  }
  setOpen?.(false);
}

/**
 * Thông báo gắn project — ưu tiên module xưởng/VC khi metadata có ecosystem_module_key.
 * Tránh mở /projects/:id (ProjectDetail quản lý chung) khi đây là deal chờ tiếp nhận SX.
 */
function navigateProjectNotification(navigate, n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const pid = meta.project_id || (n?.entity_type === 'project' ? n.entity_id : null);
  if (!pid) return false;
  const emk = String(meta.ecosystem_module_key || meta.module_key || '').trim();
  const navTab = meta.nav_tab ? String(meta.nav_tab).trim() : '';
  const isIntake =
    n?.type === 'workshop_new_deal'
    || meta.intake === true
    || navTab === 'kanban';

  if (emk === 'production' || n?.type === 'workshop_new_deal') {
    // Deal chờ tiếp nhận → Kanban SX + highlight đúng thẻ (không vào /projects quản lý).
    if (isIntake) {
      markWorkshopPipelineCardFocus(pid, 'sx');
      navigate(`/sx/dashboard?open=${encodeURIComponent(String(pid))}`);
      return true;
    }
    if (navTab) {
      navigate(`/sx/projects/${pid}?tab=${navTab}`);
    } else {
      navigate(`/sx/projects/${pid}`);
    }
    return true;
  }
  if (emk === 'logistics') {
    if (navTab && navTab !== 'kanban') {
      navigate(`/vc/projects/${pid}?tab=${navTab}`);
    } else if (navTab === 'kanban' || meta.intake === true) {
      markWorkshopPipelineCardFocus(pid, 'vc');
      navigate(`/vc/dashboard?open=${encodeURIComponent(String(pid))}`);
    } else {
      navigate(`/vc/projects/${pid}`);
    }
    return true;
  }
  navigate(navTab ? `/projects/${pid}?tab=${navTab}` : `/projects/${pid}`);
  return true;
}

function moduleChipLabel(key) {
  const k = String(key || '');
  if (k === 'crm') return 'CRM';
  if (k === 'production') return 'SX';
  if (k === 'logistics') return 'VC';
  if (k === 'project') return 'DA';
  return k || '—';
}

/**
 * Lấy tên người gửi từ thông báo messenger/lead chat.
 * - Ưu tiên `metadata.sender_name`
 * - Fallback: parse từ `message` theo format "{sender}: {preview}"
 * - Fallback: lấy phần trước "—" trong title (dạng "Messenger · Trò chuyện: A — B")
 */
function extractChatSenderName(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const fromMeta = String(meta.sender_name || meta.sender || '').trim();
  if (fromMeta) return fromMeta;
  const msg = String(n?.message || '').trim();
  if (msg) {
    const colonIdx = msg.indexOf(':');
    if (colonIdx > 0 && colonIdx < 60) {
      const cand = msg.slice(0, colonIdx).trim();
      if (cand) return cand;
    }
  }
  const title = String(n?.title || '');
  const dashIdx = title.indexOf('—');
  if (dashIdx > 0) {
    const left = title.slice(0, dashIdx).replace(/^.*Trò chuyện:\s*/i, '').trim();
    if (left) return left;
  }
  return 'Tin nhắn';
}

function resolveCommentLeadId(n) {
  if (!n) return null;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (meta.lead_id) return String(meta.lead_id);
  if (['lead', 'crm_lead', 'crm_deal'].includes(String(n.entity_type || '')) && n.entity_id) {
    return String(n.entity_id);
  }
  return null;
}

function resolveMessengerGroupId(n) {
  if (!n || n.type !== 'messenger_chat') return null;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (meta.group_id || meta.bubble_key) return String(meta.group_id || meta.bubble_key);
  if (n.entity_type === 'messenger_group' && n.entity_id) return String(n.entity_id);
  return null;
}

/** Mục tiêu mute từ 1 dòng thông báo: bình luận deal hoặc Messenger. */
function resolveMuteTarget(n) {
  if (!n) return null;
  if (isLeadCommentMentionNotification(n)) {
    const entityId = resolveCommentLeadId(n);
    if (!entityId) return null;
    return {
      scope: 'comment_added',
      entityId,
      key: `comment_added:${entityId}`,
      title: 'Tắt TB bình luận deal',
      buttonTitle: 'Tắt thông báo bình luận deal này',
    };
  }
  if (n.type === 'messenger_chat') {
    const entityId = resolveMessengerGroupId(n);
    if (!entityId) return null;
    return {
      scope: 'messenger_chat',
      entityId,
      key: `messenger_chat:${entityId}`,
      title: 'Tắt TB Messenger',
      buttonTitle: 'Tắt thông báo Messenger cuộc trò chuyện này',
    };
  }
  return null;
}

const COMMENT_MUTE_OPTIONS = [
  { value: '1h', label: '1 giờ' },
  { value: '2h', label: '2 giờ' },
  { value: '3h', label: '3 giờ' },
  { value: '8h', label: '8 giờ' },
  { value: 'indefinite', label: 'Đến khi mở lại' },
];

export default function NotificationCenter({ socket }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { openMessengerGroupChat, openLeadChat } = useMessengerDock();
  const canBrowseAllModules = isSystemAdmin(user) || isPlatformAdmin(user);
  const activeSidebarModule = useMemo(
    () => resolveActiveModule(location.pathname, location.state?.moduleContext, searchParams),
    [location.pathname, location.state?.moduleContext, searchParams],
  );
  const sidebarNotifModule = useMemo(
    () => sidebarModuleToNotificationFilter(activeSidebarModule),
    [activeSidebarModule],
  );
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadDeadlines, setUnreadDeadlines] = useState(0);
  const [unreadEvents, setUnreadEvents] = useState(0);
  const [unreadAssignments, setUnreadAssignments] = useState(0);
  const [cskhNotifs, setCskhNotifs] = useState([]);
  const [cskhCount, setCskhCount] = useState(0);
  const [cskhLoading, setCskhLoading] = useState(false);
  const [cskhDismissingAll, setCskhDismissingAll] = useState(false);
  const [dismissingKeys, setDismissingKeys] = useState(new Set());
  const bellBadgeCount = useMemo(
    () => unreadActivity + unreadChat + unreadDeadlines + unreadEvents + unreadAssignments + cskhCount,
    [unreadActivity, unreadChat, unreadDeadlines, unreadEvents, unreadAssignments, cskhCount],
  );
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('activity');
  /** Mặc định chỉ hiện chưa đọc; 'read' = xem thông báo đã đọc */
  const [listMode, setListMode] = useState('unread');
  const listModeRef = useRef(listMode);
  useEffect(() => { listModeRef.current = listMode; }, [listMode]);
  const [activityDate, setActivityDate] = useState('');
  /** Phân loại module: all | crm | production | logistics | project — khóa theo sidebar (Admin hệ thống được xem «Tất cả»). */
  const [moduleFilter, setModuleFilter] = useState(() => {
    const fromSidebar = sidebarModuleToNotificationFilter(
      resolveActiveModule(
        typeof window !== 'undefined' ? window.location.pathname : '/',
        null,
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null,
      ),
    );
    if (fromSidebar) return fromSidebar;
    const s = readStoredNotifFilters();
    const v = s?.moduleFilter;
    return MODULE_FILTER_OPTIONS.some((o) => o.id === v) ? v : 'all';
  });

  useEffect(() => {
    if (sidebarNotifModule) {
      setModuleFilter(sidebarNotifModule);
      return;
    }
    if (!canBrowseAllModules) setModuleFilter('all');
  }, [sidebarNotifModule, canBrowseAllModules]);

  const cskhTabAllowed = !moduleFilter || moduleFilter === 'all' || moduleFilter === 'crm';
  useEffect(() => {
    if (!cskhTabAllowed && tab === 'cskh') setTab('activity');
  }, [cskhTabAllowed, tab]);

  /** Panel bộ lọc gộp (giống CRM) */
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  /** Lọc phạm vi dự án */
  const [filterCompanyId, setFilterCompanyId] = useState(() => String(readStoredNotifFilters()?.filterCompanyId || ''));
  const [filterRegionId, setFilterRegionId] = useState(() => String(readStoredNotifFilters()?.filterRegionId || ''));
  const [filterWorkTypeId, setFilterWorkTypeId] = useState(() => String(readStoredNotifFilters()?.filterWorkTypeId || ''));
  const [projectNameQ, setProjectNameQ] = useState(() => String(readStoredNotifFilters()?.projectNameQ || ''));
  const [projectNameDebounced, setProjectNameDebounced] = useState(() => String(readStoredNotifFilters()?.projectNameQ || '').trim());
  const [projectFilter, setProjectFilter] = useState(() => String(readStoredNotifFilters()?.projectFilter || ''));
  const [projectOptions, setProjectOptions] = useState([]);
  const [filterCompanies, setFilterCompanies] = useState([]);
  const [filterRegions, setFilterRegions] = useState([]);
  const [filterWorkTypes, setFilterWorkTypes] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  /** key = `${scope}:${entityId}` → mute row */
  const [commentMutes, setCommentMutes] = useState(() => new Map());
  const commentMutesRef = useRef(commentMutes);
  useEffect(() => { commentMutesRef.current = commentMutes; }, [commentMutes]);
  /** id thông báo đang mở menu mute (tránh hiện menu trùng trên nhiều dòng cùng nhóm) */
  const [muteMenuNotifId, setMuteMenuNotifId] = useState(null);
  const [muteBusy, setMuteBusy] = useState(false);
  const [toastStack, setToastStack] = useState([]);
  const toastKeyRef = useRef(0);
  const MAX_TOAST_STACK = 8;

  const pushToast = useCallback((notif) => {
    if (!notif) return;
    const key = `toast-${++toastKeyRef.current}`;
    setToastStack((prev) => [...prev, { key, notification: notif }].slice(-MAX_TOAST_STACK));
  }, []);

  const dismissToast = useCallback((key) => {
    setToastStack((prev) => prev.filter((t) => t.key !== key));
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const listScrollRef = useRef(null);
  const loadCountRef = useRef(null);

  useEffect(() => {
    if (user) return undefined;
    cancelNotificationSpeech();
    setNotifications([]);
    setToastStack([]);
    setUnreadActivity(0);
    setUnreadChat(0);
    setUnreadDeadlines(0);
    setUnreadEvents(0);
    setUnreadAssignments(0);
    setOpen(false);
    return undefined;
  }, [user]);

  useEffect(() => {
    const onCleared = () => {
      cancelNotificationSpeech();
      setNotifications([]);
      setToastStack([]);
      setUnreadActivity(0);
      setUnreadChat(0);
      setUnreadDeadlines(0);
      setUnreadEvents(0);
      setUnreadAssignments(0);
    };
    window.addEventListener('auth:session-cleared', onCleared);
    return () => window.removeEventListener('auth:session-cleared', onCleared);
  }, []);

  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const PANEL_WIDTH = 480;

  const updatePanelPosition = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const sidebar = anchor.closest('aside');
    const sidebarRect = sidebar?.getBoundingClientRect();

    // Sidebar: đặt panel ngay bên phải sidebar (không dính sát nút chuông bên trái).
    // TopNavBar / không có aside: đặt bên phải anchor.
    let left = sidebarRect ? sidebarRect.right + 8 : rect.right + 8;
    let top = rect.top;

    const margin = 12;
    const maxH = Math.min(520, window.innerHeight - margin * 2);

    // Tràn phải viewport → căn panel sát mép phải màn hình (không flip sang trái anchor).
    if (left + PANEL_WIDTH > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - PANEL_WIDTH - margin);
    }
    if (top + maxH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - maxH - margin);
    }
    if (top < margin) top = margin;

    setPanelPos({ top, left });
  }, []);

  const loadCskhNotifs = async () => {
    setCskhLoading(true);
    try {
      const { data } = await api.get('/crm/followup-care/notifications');
      const list = data?.notifications || [];
      setCskhNotifs(list);
      setCskhCount(list.length);
    } catch {
      setCskhNotifs([]);
      setCskhCount(0);
    }
    setCskhLoading(false);
  };

  const dismissCskh = async (notif) => {
    const key = `${notif.pipeline_id}|${notif.stage_id}|${notif.company_id || ''}|${notif.time_bucket}`;
    setDismissingKeys((prev) => new Set(prev).add(key));
    try {
      await api.post('/crm/followup-care/dismiss', {
        pipeline_id: notif.pipeline_id,
        stage_id: notif.stage_id,
        company_id: notif.company_id || null,
        time_bucket: notif.time_bucket,
      });
      setCskhNotifs((prev) => prev.filter((n) =>
        !(n.pipeline_id === notif.pipeline_id && n.stage_id === notif.stage_id && n.company_id === notif.company_id && n.time_bucket === notif.time_bucket)
      ));
      setCskhCount((c) => Math.max(0, c - 1));
    } catch { }
    setDismissingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const undoCskhDismissals = async () => {
    try {
      const { data } = await api.post('/crm/followup-care/dismiss/undo');
      await loadCskhNotifs();
      const restored = data?.restored || 0;
      if (restored > 0) console.log(`[CSKH] Khôi phục ${restored} thông báo`);
    } catch (e) {
      console.error('Undo CSKH dismissals failed:', e);
    }
  };

  const dismissAllCskh = async () => {
    if (!cskhNotifs.length || cskhDismissingAll) return;
    setCskhDismissingAll(true);
    try {
      await api.post('/crm/followup-care/dismiss-all', {
        items: cskhNotifs.map((n) => ({
          pipeline_id: n.pipeline_id,
          stage_id: n.stage_id,
          company_id: n.company_id || null,
          time_bucket: n.time_bucket,
        })),
      });
      setCskhNotifs([]);
      setCskhCount(0);
    } catch (e) {
      console.error('Dismiss all CSKH failed:', e);
    }
    setCskhDismissingAll(false);
  };

  const navigateToCskh = (notif) => {
    const params = new URLSearchParams();
    if (notif.pipeline_id) params.set('pipeline_id', notif.pipeline_id);
    if (notif.stage_id) params.set('stage_id', notif.stage_id);
    if (notif.company_id) params.set('company_id', notif.company_id);
    if (notif.time_bucket) params.set('time', notif.time_bucket);
    if (notif.pipeline_type) params.set('type', notif.pipeline_type);
    navigate(`/crm/follow-up-care?${params.toString()}`);
    setOpen(false);
  };

  const mergeProjectOptions = useCallback((incoming) => {
    if (!Array.isArray(incoming)) return;
    setProjectOptions((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const p of incoming) {
        if (!p?.id) continue;
        map.set(String(p.id), {
          id: String(p.id),
          label: p.label || p.code || p.name || String(p.id).slice(0, 8),
          company_id: p.company_id || null,
          workshop_type_id: p.workshop_type_id || null,
          code: p.code || null,
          name: p.name || null,
        });
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    });
  }, []);

  const buildScopeParams = useCallback(() => {
    const params = {};
    if (filterCompanyId) params.company_id = filterCompanyId;
    if (filterRegionId) params.region_id = filterRegionId;
    if (filterWorkTypeId) params.workshop_type_id = filterWorkTypeId;
    if (projectNameDebounced) params.project_q = projectNameDebounced;
    if (projectFilter) params.project_id = projectFilter;
    return params;
  }, [filterCompanyId, filterRegionId, filterWorkTypeId, projectNameDebounced, projectFilter]);

  const resetProjectScopeFilters = useCallback(() => {
    setModuleFilter('all');
    setFilterCompanyId('');
    setFilterRegionId('');
    setFilterWorkTypeId('');
    setProjectNameQ('');
    setProjectNameDebounced('');
    setProjectFilter('');
    setProjectOptions([]);
    setFilterRegions([]);
    setFilterWorkTypes([]);
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (moduleFilter && moduleFilter !== 'all') n += 1;
    if (filterCompanyId) n += 1;
    if (filterRegionId) n += 1;
    if (filterWorkTypeId) n += 1;
    if (projectNameQ.trim()) n += 1;
    if (projectFilter) n += 1;
    return n;
  }, [moduleFilter, filterCompanyId, filterRegionId, filterWorkTypeId, projectNameQ, projectFilter]);

  const filteredProjectList = useMemo(() => {
    const q = projectNameQ.trim().toLowerCase();
    const list = Array.isArray(projectOptions) ? projectOptions : [];
    if (!q) return list.slice(0, 40);
    return list.filter((p) => {
      const hay = `${p.label || ''} ${p.code || ''} ${p.name || ''}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 40);
  }, [projectOptions, projectNameQ]);

  useEffect(() => {
    writeStoredNotifFilters({
      moduleFilter,
      filterCompanyId,
      filterRegionId,
      filterWorkTypeId,
      projectNameQ,
      projectFilter,
    });
  }, [moduleFilter, filterCompanyId, filterRegionId, filterWorkTypeId, projectNameQ, projectFilter]);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'cskh') {
        await loadCskhNotifs();
        setLoading(false);
        return;
      }
      const scope = buildScopeParams();
      if (tab === 'deadlines') {
        const params = { module: moduleFilter, limit: 80, ...scope };
        params.unread = listMode === 'read' ? 'false' : 'true';
        const { data } = await api.get('/dashboard/notifications/deadlines', { params });
        setNotifications(data.notifications || []);
        mergeProjectOptions(data.project_options);
      } else {
        const channel = tab === 'events' ? 'events'
          : tab === 'messages' ? 'messages'
            : tab === 'assignments' ? 'assignments'
              : 'activity';
        const params = { channel, limit: 80, module: moduleFilter, ...scope };
        params.unread = listMode === 'read' ? 'false' : 'true';
        if (tab === 'activity' && activityDate) {
          params.from_date = activityDate;
          params.to_date = activityDate;
        }
        const { data } = await api.get('/dashboard/notifications', { params });
        setNotifications(data.notifications || []);
        mergeProjectOptions(data.project_options);
      }
    } catch { }
    setLoading(false);
  };

  const loadCount = async ({ includeCskh = true } = {}) => {
    try {
      const params = {};
      if (moduleFilter && moduleFilter !== 'all') params.module = moduleFilter;
      const { data } = await api.get('/dashboard', { params });
      const a = data.stats?.unread_activity ?? 0;
      const c = data.stats?.unread_chat ?? 0;
      const d = data.stats?.unread_deadlines ?? 0;
      const ev = data.stats?.unread_events ?? 0;
      const asn = data.stats?.unread_assignments ?? 0;
      setUnreadActivity(a);
      setUnreadChat(c);
      setUnreadDeadlines(d);
      setUnreadEvents(ev);
      setUnreadAssignments(asn);
    } catch { }
    const showCskh = !moduleFilter || moduleFilter === 'all' || moduleFilter === 'crm';
    if (!includeCskh || !showCskh) {
      if (!showCskh) {
        setCskhCount(0);
        setCskhNotifs([]);
      }
      return;
    }
    try {
      const { data: cskhData } = await api.get('/crm/followup-care/notifications');
      const cnt = cskhData?.total ?? 0;
      setCskhCount(cnt);
    } catch { }
  };
  loadCountRef.current = loadCount;

  useEffect(() => {
    // Dashboard badge trước; CSKH (query nặng) trì hoãn để ưu tiên load trang hiện tại.
    loadCount({ includeCskh: false });
    const cskhDelay = setTimeout(() => { loadCount({ includeCskh: true }); }, 3000);
    const tick = () => { if (!document.hidden) loadCount({ includeCskh: true }); };
    const interval = setInterval(tick, 120_000);
    document.addEventListener('visibilitychange', tick);
    const onAssignBadge = () => loadCount({ includeCskh: false });
    window.addEventListener('badge:refresh:assignments', onAssignBadge);
    return () => {
      clearTimeout(cskhDelay);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('badge:refresh:assignments', onAssignBadge);
    };
  }, [moduleFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/push/preferences');
        if (!cancelled && data) setNotificationPrefsCache(data);
      } catch {
        if (!cancelled) {
          setNotificationPrefsCache({
            browser_push: true,
            sound: true,
            task_assigned: true,
            task_completed: true,
            deadline_warning: true,
            comment_added: true,
            comment_show_on_screen: true,
            stage_changed: true,
            deal_won: true,
            approval_request: true,
            checklist_completed: true,
            lead_assigned: true,
            order_confirmed: true,
            invoice_overdue: true,
            lead_new: true,
            deal_new: true,
            production_deadlines: true,
            crm_lead_deadlines: true,
            logistics_deadlines: true,
            project_notifications: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!socket || !user) return;
    const handler = (notif) => {
      if (!localStorage.getItem('token')) return;
      if (!isNotificationTypeEnabled(notif?.type, notif?.entity_type, notif?.metadata)) return;

      cancelNotificationSpeech();

      const isExp = isExpiryDeadlineNotificationType(notif?.type);
      const isChat = isChatChannelNotification(notif);
      const isEvent = EVENT_NOTIFICATION_TYPES.includes(notif?.type);
      const isAssign = isAssignmentNotification(notif);
      const canShowLive = listModeRef.current === 'unread';
      // Live: chỉ áp module + project_id; company/region/type/name cần resolve BE → không prepend khi đang lọc scope
      const liveOk = notificationMatchesSidebarModule(notif, moduleFilter)
        && notificationMatchesProjectFilter(notif, projectFilter)
        && !filterCompanyId && !filterRegionId && !filterWorkTypeId && !projectNameDebounced;
      const opt = extractNotificationProjectOption(notif);
      if (opt) mergeProjectOptions([opt]);
      if (isExp) {
        setUnreadDeadlines((c) => c + 1);
        if (canShowLive && liveOk) setNotifications((prev) => (tab === 'deadlines' ? [notif, ...prev] : prev));
      } else if (isChat) {
        setUnreadChat((c) => c + 1);
        if (canShowLive && liveOk) setNotifications((prev) => (tab === 'messages' ? [notif, ...prev] : prev));
      } else if (isEvent) {
        setUnreadEvents((c) => c + 1);
        if (canShowLive && liveOk) setNotifications((prev) => (tab === 'events' ? [notif, ...prev] : prev));
      } else if (isAssign) {
        setUnreadAssignments((c) => c + 1);
        if (canShowLive && liveOk) setNotifications((prev) => (tab === 'assignments' ? [notif, ...prev] : prev));
      } else if (isDealActivityNotification(notif)) {
        setUnreadActivity((c) => c + 1);
        if (canShowLive && liveOk) setNotifications((prev) => (tab === 'activity' ? [notif, ...prev] : prev));
      }

      // Đã tắt chuông cho deal/Messenger này → vẫn cập nhật danh sách, không toast/âm thanh ngoài màn hình
      const muteTarget = resolveMuteTarget(notif);
      const isExternallyMuted = muteTarget && commentMutesRef.current.has(muteTarget.key);
      if (!isExternallyMuted) {
        pushToast(notif);
        const p = getNotificationPrefsCache();
        if (p.sound !== false) {
          void alertIncomingNotification({ type: notif.type, entityType: notif.entity_type });
        }
      }

      if (notif?.type === 'ai_crm_deadline_digest') {
        try {
          window.dispatchEvent(new CustomEvent(AI_DEADLINE_DIGEST_EVENT, { detail: notif }));
        } catch {
          /* ignore */
        }
      }

      if (isAssign) dispatchBadgeRefresh('assignments');
      if (isEvent) dispatchBadgeRefresh('events');
      if (isChat) dispatchBadgeRefresh('social');
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket, tab, user, pushToast, moduleFilter, projectFilter, filterCompanyId, filterRegionId, filterWorkTypeId, projectNameDebounced, mergeProjectOptions]);

  useEffect(() => {
    const t = setTimeout(() => setProjectNameDebounced(projectNameQ.trim()), 350);
    return () => clearTimeout(t);
  }, [projectNameQ]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.get('/companies').then((r) => {
      if (cancelled) return;
      const list = r.data?.companies || r.data || [];
      setFilterCompanies(Array.isArray(list) ? list : []);
    }).catch(() => { if (!cancelled) setFilterCompanies([]); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!filterCompanyId) {
      setFilterRegions([]);
      setFilterWorkTypes([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/company-regions', { params: { company_id: filterCompanyId, for_module: 'crm' } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : (r.data?.regions || []);
        setFilterRegions(list);
      })
      .catch(() => { if (!cancelled) setFilterRegions([]); });
    api.get('/workshop/project-types', { params: { company_id: filterCompanyId } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : (r.data?.types || []);
        setFilterWorkTypes(list);
      })
      .catch(() => { if (!cancelled) setFilterWorkTypes([]); });
    return () => { cancelled = true; };
  }, [filterCompanyId]);

  useEffect(() => {
    if (open) {
      load();
      loadCommentMutes();
    }
  }, [open, tab, moduleFilter, projectFilter, filterCompanyId, filterRegionId, filterWorkTypeId, projectNameDebounced, listMode, activityDate]);

  // Đổi tab / đóng panel → thoát chế độ chọn nhiều + đóng menu mute
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setMuteMenuNotifId(null);
  }, [tab, open]);

  useEffect(() => {
    if (!open) return undefined;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    const sidebar = rootRef.current?.closest('aside');
    let ro;
    if (sidebar && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updatePanelPosition());
      ro.observe(sidebar);
    }
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
      ro?.disconnect();
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      // Panel cài đặt render qua portal — không nằm trong panelRef
      if (e.target.closest?.('[data-notification-settings-panel]')) return;
      if (e.target.closest?.('[data-notification-settings-backdrop]')) return;
      if (settingsOpen) setSettingsOpen(false);
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, settingsOpen]);

  const markAllRead = async () => {
    const channel = tab === 'deadlines' ? 'deadlines'
      : tab === 'events' ? 'events'
        : tab === 'messages' ? 'messages'
          : tab === 'assignments' ? 'assignments'
            : 'activity';
    try {
      await api.put('/dashboard/notifications/read-all', {}, { params: { channel } });
      // Zero badge tab hiện tại ngay — tránh badge kẹt vì cache / loadCount chậm
      if (channel === 'deadlines') setUnreadDeadlines(0);
      else if (channel === 'events') setUnreadEvents(0);
      else if (channel === 'messages') setUnreadChat(0);
      else if (channel === 'assignments') setUnreadAssignments(0);
      else setUnreadActivity(0);
      if (listModeRef.current === 'unread') {
        setNotifications([]);
      } else {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
      await loadCount({ includeCskh: false });
    } catch (e) {
      console.error('Mark all notifications read failed:', e);
    }
  };

  const markRead = async (id) => {
    if (!id) return;
    try {
      await api.put(`/dashboard/notifications/${id}/read`);
      setNotifications((prev) => (
        listModeRef.current === 'unread'
          ? prev.filter((n) => n.id !== id)
          : prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      ));
      await loadCount();
    } catch { /* giữ nguyên danh sách nếu API lỗi */ }
  };

  /** Bỏ qua 1 thông báo — ẩn vĩnh viễn khỏi danh sách + badge */
  const dismissOne = async (id) => {
    try {
      await api.put(`/dashboard/notifications/${id}/dismiss`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadCount({ includeCskh: false });
    } catch { }
  };

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUnread = () => {
    setSelectedIds(new Set(notifications.filter(n => !n.is_read).map(n => n.id)));
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await api.put('/dashboard/notifications/bulk-read', { ids });
      setNotifications((prev) => (
        listModeRef.current === 'unread'
          ? prev.filter((n) => !selectedIds.has(n.id))
          : prev.map((n) => (selectedIds.has(n.id) ? { ...n, is_read: true } : n))
      ));
      setSelectedIds(new Set());
      await loadCount({ includeCskh: false });
    } catch { }
    setBulkBusy(false);
  };

  const bulkDismiss = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await api.put('/dashboard/notifications/bulk-dismiss', { ids });
      setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
      setSelectedIds(new Set());
      await loadCount({ includeCskh: false });
    } catch { }
    setBulkBusy(false);
  };

  const loadCommentMutes = async () => {
    try {
      const { data } = await api.get('/dashboard/notifications/comment-mutes');
      const map = new Map();
      (data?.mutes || []).forEach((m) => {
        if (m?.entity_id && m?.mute_scope) {
          map.set(`${m.mute_scope}:${m.entity_id}`, m);
        }
      });
      setCommentMutes(map);
    } catch {
      setCommentMutes(new Map());
    }
  };

  const muteByTarget = async (target, duration) => {
    if (!target?.entityId || !target?.scope || muteBusy) return;
    setMuteBusy(true);
    try {
      const body = { duration, scope: target.scope };
      if (target.scope === 'messenger_chat') body.group_id = target.entityId;
      else body.lead_id = target.entityId;
      const { data } = await api.put('/dashboard/notifications/comment-mute', body);
      if (data?.mute) {
        setCommentMutes((prev) => {
          const next = new Map(prev);
          next.set(target.key, data.mute);
          return next;
        });
      }
      // Giữ tin trong danh sách — chỉ tắt toast/push ngoài màn hình
      setMuteMenuNotifId(null);
    } catch (e) {
      console.error('Mute notification target failed:', e);
    }
    setMuteBusy(false);
  };

  const unmuteByTarget = async (target) => {
    if (!target?.entityId || !target?.scope || muteBusy) return;
    setMuteBusy(true);
    try {
      await api.delete(`/dashboard/notifications/comment-mute/${target.entityId}`, {
        params: { scope: target.scope },
      });
      setCommentMutes((prev) => {
        const next = new Map(prev);
        next.delete(target.key);
        return next;
      });
      setMuteMenuNotifId(null);
    } catch (e) {
      console.error('Unmute notification target failed:', e);
    }
    setMuteBusy(false);
  };

  const [approvalForm, setApprovalForm] = useState(null); // { notifId, action, reason }

  // Handle approval action
  const handleApproval = async (notifId, action, reason) => {
    const notif = notifications.find(n => n.id === notifId);
    const meta = notif?.metadata;
    if (!meta?.project_id) return;
    if (!reason?.trim()) { alert('Vui lòng nhập lý do!'); return; }
    try {
      await api.post(`/projects/${meta.project_id}/approve-advance`, {
        notification_id: notifId,
        action,
        reject_reason: reason.trim(),
      });
      setNotifications(prev => prev.map(n =>
        n.id === notifId ? { ...n, is_read: true, metadata: { ...n.metadata, status: action === 'approve' ? 'approved' : 'rejected' } } : n
      ));
      await loadCount();
      setApprovalForm(null);
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      {/* Toast — portal ra body để fixed không bị sidebar backdropFilter ảnh hưởng */}
      {toastStack.length > 0 && createPortal(
        <NotificationToast
          toasts={toastStack}
          onDismiss={dismissToast}
          onNavigate={(notif) => {
            if (isLeadCommentMentionNotification(notif) && notif.entity_id) {
              navigateLeadCommentMention(navigate, notif, setOpen);
              return;
            }
            // workshop_new_deal: luôn ưu tiên Kanban SX (bỏ qua nav_url cũ trỏ /projects hoặc /sx/projects).
            if (
              notif.type === 'workshop_new_deal'
              || notif.metadata?.intake === true
              || (
                (notif.metadata?.ecosystem_module_key === 'production' || notif.metadata?.module_key === 'production')
                && notif.metadata?.nav_tab === 'kanban'
              )
            ) {
              if (navigateProjectNotification(navigate, notif)) {
                setOpen(false);
                return;
              }
            }
            if (notif.metadata?.nav_url) {
              navigate(notif.metadata.nav_url);
              setOpen(false);
              return;
            }
            if (navigateProjectNotification(navigate, notif)) {
              setOpen(false);
              return;
            }
            if (notif.entity_type === 'crm_lead' || notif.entity_type === 'crm_deal' || notif.entity_type === 'lead') {
              const chatTab = notif.metadata?.nav_tab;
              navigate(chatTab ? `/crm/leads/${notif.entity_id}?tab=${chatTab}` : `/crm/leads/${notif.entity_id}`);
            } else if (notif.entity_type === 'quotation') {
              navigate(`/crm/quotations/${notif.entity_id}`);
            } else if (notif.entity_type === 'order') {
              navigate(`/crm/orders/${notif.entity_id}`);
            } else if (notif.entity_type === 'invoice') {
              navigate(`/crm/invoices/${notif.entity_id}`);
            } else if (notif.entity_type === 'crm_task') {
              const aid = notif.metadata?.open || notif.metadata?.assignment_id;
              if (aid) navigateCrmAssignment(navigate, aid);
              else {
                const lid = notif.metadata?.lead_id;
                navigate(lid ? `/crm/leads/${lid}?tab=tasks` : '/crm/tasks');
              }
            } else if (isAssignmentNotification(notif)) {
              navigateCrmAssignment(navigate, notif);
            } else if (notif.entity_type === 'event') {
              navigate(eventsPathForNotification(notif));
            } else if (notif.entity_type === 'release_note') {
              navigate(`/updates`);
            } else if ((notif.entity_type === 'cskh_followup' || notif.type === 'ai_crm_deadline_digest') && notif.metadata?.nav_url) {
              navigate(notif.metadata.nav_url);
            }
            setOpen(false);
          }}
        />,
        document.body
      )}

      {/* Settings side panel — docked to the right of Notification Center */}
      <NotificationSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        anchorPanel={open ? { top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH } : null}
      />

      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-lg hover:bg-[var(--color-sidebar-hover)] flex items-center justify-center text-[var(--color-sidebar-text)] hover:text-white transition-colors cursor-pointer"
      >
        <Bell className="h-[18px] w-[18px]" />
        {bellBadgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse-dot">
            {bellBadgeCount > 99 ? '99+' : bellBadgeCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] border border-gray-200 z-[200] animate-fade-in overflow-hidden"
          style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
        >
          {/* HEADER GRADIENT */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-3">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute -top-6 -right-8 w-32 h-32 bg-blue-400 rounded-full blur-3xl" />
              <div className="absolute -bottom-8 -left-6 w-28 h-28 bg-purple-400 rounded-full blur-3xl" />
            </div>
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-md shrink-0">
                  <Bell className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-tight" style={{ color: '#ffffff' }}>Trung tâm thông báo</h3>
                  <p className="text-[11px] text-blue-100/90 mt-0.5">
                    {bellBadgeCount > 0 ? `${bellBadgeCount} thông báo mới` : 'Không có thông báo mới'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(tab === 'cskh' ? cskhCount
                  : tab === 'activity' ? unreadActivity
                    : tab === 'events' ? unreadEvents
                      : tab === 'messages' ? unreadChat
                        : tab === 'assignments' ? unreadAssignments
                          : unreadDeadlines) > 0 && (
                  <button
                    onClick={tab === 'cskh' ? dismissAllCskh : markAllRead}
                    disabled={tab === 'cskh' && cskhDismissingAll}
                    className="text-[11px] text-white font-semibold cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-md border border-white/20 hover:bg-white/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    title={tab === 'cskh' ? 'Tích đã xem tất cả thông báo CSKH' : 'Đánh dấu đã đọc tất cả'}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> {tab === 'cskh' ? 'Đã xem tất cả' : 'Đọc hết'}
                  </button>
                )}
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 cursor-pointer hover:text-white transition-colors"
                  title="Cài đặt thông báo"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 cursor-pointer hover:text-white transition-colors"
                  title="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="flex gap-1 px-2 py-2 border-b border-gray-100 overflow-x-auto bg-gradient-to-b from-gray-50/60 to-white">
            {[
              { id: 'activity', label: 'Hoạt động', count: unreadActivity, icon: Sparkles, color: 'blue' },
              { id: 'assignments', label: 'Giao việc', count: unreadAssignments, icon: ClipboardList, color: 'indigo' },
              { id: 'events', label: 'Sự kiện', count: unreadEvents, icon: Calendar, color: 'violet' },
              { id: 'messages', label: 'Tin nhắn', count: unreadChat, icon: MessageSquare, color: 'sky' },
              { id: 'deadlines', label: 'Nhắc hạn', count: unreadDeadlines, icon: Clock, color: 'amber' },
              ...(cskhTabAllowed
                ? [{ id: 'cskh', label: 'CSKH', count: cskhCount, icon: CalendarClock, color: 'emerald' }]
                : []),
            ].map((t) => {
              const TabIcon = t.icon;
              const active = tab === t.id;
              const activeColorMap = {
                blue: 'bg-blue-600 text-white shadow-md shadow-blue-500/30',
                indigo: 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30',
                violet: 'bg-violet-600 text-white shadow-md shadow-violet-500/30',
                sky: 'bg-sky-600 text-white shadow-md shadow-sky-500/30',
                amber: 'bg-amber-600 text-white shadow-md shadow-amber-500/30',
                emerald: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30',
              };
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-all ${
                    active ? activeColorMap[t.color] : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={!active ? { color: '#000000' } : undefined}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count > 0 && (
                    <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold ${
                      active ? 'bg-white/30 text-white' : 'bg-red-500 text-white'
                    } ${t.id === 'assignments' ? 'animate-pulse-dot' : ''}`}>
                      {t.count > 99 ? '99+' : t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {(tab === 'activity' || tab === 'events' || tab === 'messages' || tab === 'assignments' || tab === 'deadlines') && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 bg-gray-50/50">
              {tab === 'activity' && (
                <>
                  <label className="flex items-center gap-1 text-[11px] text-gray-600">
                    <Calendar className="h-3.5 w-3.5" />
                    <input
                      type="date"
                      value={activityDate}
                      onChange={(e) => setActivityDate(e.target.value)}
                      className="h-7 px-2 rounded border border-gray-200 bg-white text-[11px]"
                    />
                  </label>
                  {activityDate && (
                    <button
                      type="button"
                      onClick={() => setActivityDate('')}
                      className="h-7 px-2 rounded border border-gray-200 bg-white text-[11px] text-gray-600 hover:bg-gray-50"
                    >
                      Tất cả ngày
                    </button>
                  )}
                </>
              )}
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setListMode('unread')}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                    listMode === 'unread'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Chưa đọc
                </button>
                <button
                  type="button"
                  onClick={() => setListMode('read')}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                    listMode === 'read'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Xem các thông báo đã đọc"
                >
                  Đã đọc
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterPanel((v) => !v)}
                aria-expanded={showFilterPanel}
                className={`relative inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold cursor-pointer transition-colors border ${
                  showFilterPanel || activeFilterCount > 0
                    ? 'bg-violet-100 text-violet-800 border-violet-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title={showFilterPanel ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                aria-label="Bộ lọc"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Bộ lọc</span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }}
                className={`ml-auto inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                  selectMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
                title={selectMode ? 'Thoát chế độ chọn' : 'Tích chọn nhiều thông báo'}
              >
                <CheckSquare className="h-3 w-3" />
                {selectMode ? 'Xong' : 'Chọn'}
              </button>
            </div>
          )}

          {showFilterPanel && (tab === 'activity' || tab === 'events' || tab === 'messages' || tab === 'assignments' || tab === 'deadlines') && (
            <div className="flex flex-col gap-1.5 px-2 py-2 border-b border-violet-100 bg-violet-50/40">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                <p className="text-[11px] font-bold text-violet-950 flex-1">Bộ lọc thông báo</p>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetProjectScopeFilters}
                    className="h-6 px-2 rounded border border-violet-200 bg-white text-[10px] font-medium text-violet-700 hover:bg-violet-50 cursor-pointer"
                  >
                    Xóa lọc
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilterPanel(false)}
                  className="h-6 w-6 rounded text-violet-500 hover:text-violet-800 hover:bg-violet-100 cursor-pointer flex items-center justify-center"
                  title="Thu gọn"
                  aria-label="Thu gọn bộ lọc"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-0.5">Phân loại</span>
                {(canBrowseAllModules
                  ? MODULE_FILTER_OPTIONS
                  : MODULE_FILTER_OPTIONS.filter((opt) => opt.id === moduleFilter || (moduleFilter === 'all' && opt.id === 'all'))
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!canBrowseAllModules && sidebarNotifModule && opt.id !== sidebarNotifModule) return;
                      setModuleFilter(opt.id);
                    }}
                    disabled={!canBrowseAllModules && !!sidebarNotifModule && opt.id !== moduleFilter}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer disabled:cursor-default disabled:opacity-90 ${
                      moduleFilter === opt.id ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                    title={
                      !canBrowseAllModules && sidebarNotifModule
                        ? 'Chỉ hiện thông báo của module đang mở'
                        : undefined
                    }
                  >
                    {opt.label}
                  </button>
                ))}
                {!canBrowseAllModules && sidebarNotifModule && (
                  <span className="text-[10px] text-gray-500 ml-1">theo module đang mở</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-semibold text-gray-500">Công ty</span>
                  <select
                    value={filterCompanyId}
                    onChange={(e) => {
                      setFilterCompanyId(e.target.value);
                      setFilterRegionId('');
                      setFilterWorkTypeId('');
                      setProjectFilter('');
                    }}
                    className="h-7 w-full px-1.5 rounded border border-gray-200 bg-white text-[11px] text-gray-700"
                  >
                    <option value="">Tất cả công ty</option>
                    {filterCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.short_name || c.name || c.id}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-semibold text-gray-500">Khu vực</span>
                  <select
                    value={filterRegionId}
                    onChange={(e) => {
                      setFilterRegionId(e.target.value);
                      setProjectFilter('');
                    }}
                    disabled={!filterCompanyId}
                    className="h-7 w-full px-1.5 rounded border border-gray-200 bg-white text-[11px] text-gray-700 disabled:opacity-50"
                  >
                    <option value="">{filterCompanyId ? 'Tất cả khu vực' : 'Chọn công ty trước'}</option>
                    {filterRegions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name || r.code || r.id}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-semibold text-gray-500">Loại dự án</span>
                  <select
                    value={filterWorkTypeId}
                    onChange={(e) => {
                      setFilterWorkTypeId(e.target.value);
                      setProjectFilter('');
                    }}
                    disabled={!filterCompanyId}
                    className="h-7 w-full px-1.5 rounded border border-gray-200 bg-white text-[11px] text-gray-700 disabled:opacity-50"
                  >
                    <option value="">{filterCompanyId ? 'Tất cả loại' : 'Chọn công ty trước'}</option>
                    {filterWorkTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name || t.id}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] font-semibold text-gray-500">Tên / mã dự án</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="search"
                    value={projectNameQ}
                    onChange={(e) => {
                      setProjectNameQ(e.target.value);
                      setProjectFilter('');
                    }}
                    placeholder="Gõ để lọc danh sách — VD: TB-2026 hoặc chị Hà"
                    className="h-7 min-w-0 flex-1 px-1.5 rounded border border-gray-200 bg-white text-[11px] text-gray-700 placeholder:text-gray-400"
                  />
                  {(projectNameQ || projectFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setProjectNameQ('');
                        setProjectNameDebounced('');
                        setProjectFilter('');
                      }}
                      className="h-7 px-2 rounded border border-gray-200 bg-white text-[10px] text-gray-600 hover:bg-gray-50 shrink-0 cursor-pointer"
                      title="Xóa tìm dự án"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                <div className="max-h-28 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-50 [scrollbar-width:thin]">
                  {filteredProjectList.length === 0 ? (
                    <p className="px-2 py-2 text-[10px] text-gray-400">
                      {projectOptions.length === 0
                        ? 'Chưa có dự án trong thông báo đang tải — mở chuông / đổi tab để nạp danh sách.'
                        : 'Không khớp tên/mã đã gõ.'}
                    </p>
                  ) : (
                    filteredProjectList.map((p) => {
                      const active = projectFilter === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setProjectFilter(p.id);
                            setProjectNameQ(p.code || p.label || '');
                            setProjectNameDebounced((p.code || p.label || '').trim());
                          }}
                          className={`w-full text-left px-2 py-1.5 text-[11px] cursor-pointer truncate ${
                            active
                              ? 'bg-violet-100 text-violet-900 font-semibold'
                              : 'text-gray-700 hover:bg-violet-50'
                          }`}
                          title={p.label}
                        >
                          {p.label}
                        </button>
                      );
                    })
                  )}
                </div>
                {projectFilter && (
                  <p className="text-[10px] text-violet-700">
                    Đang lọc đúng 1 dự án · {projectOptions.find((x) => x.id === projectFilter)?.label || projectFilter.slice(0, 8)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Thanh hành động hàng loạt khi đang ở chế độ chọn */}
          {selectMode && tab !== 'cskh' && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-blue-100 bg-blue-50/70">
              <p className="text-[11px] font-semibold text-blue-800 shrink-0">Đã chọn {selectedIds.size}</p>
              <button
                type="button"
                onClick={selectAllUnread}
                className="text-[11px] px-2 py-1 rounded-md bg-white text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                title="Tích chọn toàn bộ tin chưa đọc trong danh sách"
              >
                Chọn tin chưa đọc
              </button>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={bulkMarkRead}
                  disabled={!selectedIds.size || bulkBusy}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Đánh dấu đã đọc các tin đã chọn"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Đã đọc
                </button>
                <button
                  type="button"
                  onClick={bulkDismiss}
                  disabled={!selectedIds.size || bulkBusy}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Bỏ qua (ẩn) các tin đã chọn"
                >
                  <X className="h-3.5 w-3.5" /> Bỏ qua
                </button>
              </div>
            </div>
          )}

          <div ref={listScrollRef} className="max-h-[440px] overflow-y-auto bg-gradient-to-b from-white to-slate-50/40">
            {tab === 'cskh' ? (
              cskhLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <svg className="animate-spin h-6 w-6 text-emerald-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  <p className="text-xs" style={{ color: '#000000' }}>Đang tải...</p>
                </div>
              ) : cskhNotifs.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-50 border border-emerald-200 flex items-center justify-center mb-3 shadow-sm">
                    <CalendarClock className="h-7 w-7 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: '#000000' }}>Không có lead nào cần nhắc CSKH</p>
                  <p className="text-xs text-gray-400 mt-1">Đã tích sẽ ẩn đến hết ngày — sang ngày mới sẽ hiện lại các lead chưa chăm</p>
                  <button
                    type="button"
                    onClick={undoCskhDismissals}
                    className="mt-3 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                    title="Khôi phục các thông báo lỡ tích nhầm"
                  >
                    Hoàn tác (lỡ tích nhầm)
                  </button>
                </div>
              ) : (
                <>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-emerald-100 bg-emerald-50/50">
                  <p className="text-[11px] text-emerald-800">
                    {cskhNotifs.length} nhóm lead cần chăm · ẩn đến hết ngày
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={dismissAllCskh}
                      disabled={cskhDismissingAll}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                      title="Tích đã xem tất cả"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {cskhDismissingAll ? 'Đang xử lý...' : 'Đã xem tất cả'}
                    </button>
                    <button
                      type="button"
                      onClick={undoCskhDismissals}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                      title="Khôi phục các thông báo lỡ tích nhầm"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Hoàn tác
                    </button>
                  </div>
                </div>
                {cskhNotifs.map((n) => {
                  const key = `${n.pipeline_id}|${n.stage_id}|${n.company_id || ''}|${n.time_bucket}`;
                  const isDismissing = dismissingKeys.has(key);
                  return (
                    <div
                      key={key}
                      className="relative px-4 py-3 hover:bg-emerald-50/60 cursor-pointer border-b border-gray-50 transition-colors bg-gradient-to-r from-emerald-50/40 to-transparent"
                    >
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-500" />
                      <div className="flex gap-3 items-start">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base font-bold shadow-sm ring-1 ring-white/60"
                          style={{ backgroundColor: `${n.stage_color || '#10B981'}20`, color: n.stage_color || '#10B981' }}
                        >
                          {n.stage_icon || <CalendarClock className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0" onClick={() => navigateToCskh(n)}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-bold leading-snug" style={{ color: '#000000' }}>
                              {n.lead_count} lead cần chăm lại
                            </p>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-700 shrink-0">
                              CSKH
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            {n.stage_icon ? `${n.stage_icon} ` : ''}<span className="font-semibold">{n.stage_name}</span>
                            {' · '}{n.pipeline_name}
                            {n.company_name ? ` · ${n.company_name}` : ''}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Tuổi lead: {n.time_label}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); dismissCskh(n); }}
                          disabled={isDismissing}
                          className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                            isDismissing
                              ? 'bg-gray-100 text-gray-300'
                              : 'hover:bg-emerald-100 text-gray-400 hover:text-emerald-600'
                          }`}
                          title="Đã tương tác — ẩn 1 tháng"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                </>
              )
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                <p className="text-xs" style={{ color: '#000000' }}>Đang tải...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 px-6">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-50 border border-blue-200 flex items-center justify-center mb-3 shadow-sm">
                  <Bell className="h-7 w-7 text-blue-400" />
                </div>
                <p className="text-sm font-semibold" style={{ color: '#000000' }}>
                  {listMode === 'read'
                    ? (tab === 'messages' ? 'Chưa có tin nhắn đã đọc'
                      : tab === 'events' ? 'Chưa có sự kiện đã đọc'
                        : tab === 'assignments' ? 'Chưa có giao việc đã đọc'
                          : tab === 'deadlines' ? 'Chưa có nhắc hạn đã đọc'
                            : 'Chưa có thông báo đã đọc')
                    : (tab === 'messages' ? 'Không có tin nhắn chưa đọc'
                      : tab === 'events' ? 'Không có sự kiện chưa đọc'
                        : tab === 'assignments' ? 'Không có giao việc chưa đọc'
                          : tab === 'deadlines' ? 'Không có nhắc hạn chưa đọc'
                            : 'Không có thông báo chưa đọc')}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {listMode === 'read'
                    ? 'Các thông báo bạn đã xem sẽ hiện ở đây.'
                    : 'Bạn đã xem hết — bấm «Đã đọc» để xem lại lịch sử.'}
                </p>
              </div>
            ) : (
              notifications.map(n => {
                const isApproval = n.metadata?.type === 'approval_request';
                const isAssignNotif = isAssignmentNotification(n);
                const Icon = isApproval ? FolderKanban : (isAssignNotif ? ClipboardList : (ICON_MAP[n.type] || Bell));
                const color = isApproval
                  ? 'bg-orange-100 text-orange-600'
                  : (isAssignNotif ? 'bg-indigo-100 text-indigo-700' : (COLOR_MAP[n.type] || 'bg-gray-100 text-gray-600'));
                const approvalStatus = n.metadata?.status; // pending | approved | rejected

                return (
                  <div
                    key={n.id}
                    data-notif-id={n.id}
                    data-notif-unread={n.is_read ? '0' : '1'}
                    data-notif-approval={isApproval ? '1' : '0'}
                    onClick={() => {
                      if (selectMode) { toggleSelected(n.id); return; }
                      if (!n.is_read && !isApproval) markRead(n.id);
                      // Tin nhắn messenger (nhóm/1-1) → mở Dock với tên người gửi
                      if (n.type === 'messenger_chat' && n.entity_type === 'messenger_group' && n.entity_id) {
                        const senderName = extractChatSenderName(n);
                        openMessengerGroupChat({
                          id: n.entity_id,
                          name: senderName,
                          title: senderName,
                          is_direct: !!n.metadata?.is_direct,
                          peer_id: n.metadata?.peer_id || n.metadata?.sender_id || null,
                        });
                        setOpen(false);
                        return;
                      }
                      // Bình luận lead/deal → tab Bình luận (SX nếu có project_id)
                      if (isLeadCommentMentionNotification(n) && n.entity_id) {
                        navigateLeadCommentMention(navigate, n, setOpen);
                        return;
                      }
                      // Chat trên Lead/Deal → mở Lead chat dock
                      if (n.type === 'lead_chat' && n.entity_id) {
                        const senderName = extractChatSenderName(n);
                        openLeadChat({
                          id: n.entity_id,
                          title: n.metadata?.lead_title || senderName || 'Lead',
                          code: n.metadata?.lead_code || '',
                          type: n.metadata?.lead_type || 'lead',
                        });
                        setOpen(false);
                        return;
                      }
                    if (
                      n.type === 'workshop_new_deal'
                      || n.metadata?.intake === true
                      || (
                        (n.metadata?.ecosystem_module_key === 'production' || n.metadata?.module_key === 'production')
                        && n.metadata?.nav_tab === 'kanban'
                      )
                    ) {
                      if (navigateProjectNotification(navigate, n)) {
                        setOpen(false);
                        return;
                      }
                    }
                    if (n.type === 'daily_report' && n.metadata?.file_url) {
                      window.open(n.metadata.file_url, '_blank', 'noopener,noreferrer');
                      if (n.metadata.nav_url) navigate(n.metadata.nav_url);
                      setOpen(false);
                      return;
                    }
                    if (n.metadata?.nav_url) {
                      navigate(n.metadata.nav_url);
                      setOpen(false);
                      return;
                    }
                    // Smart navigation based on entity type
                    if (navigateProjectNotification(navigate, n)) {
                      setOpen(false);
                      return;
                    }
                      if (isAssignmentNotification(n)) {
                        navigateCrmAssignment(navigate, n);
                      } else if (n.entity_type === 'task' && n.entity_id) {
                        navigate(`/tasks?task=${n.entity_id}`);
                      } else if (n.entity_type === 'crm_lead' || n.entity_type === 'crm_deal' || n.entity_type === 'lead') {
                        const chatTab = n.metadata?.nav_tab;
                        navigate(chatTab ? `/crm/leads/${n.entity_id}?tab=${chatTab}` : `/crm/leads/${n.entity_id}`);
                      } else if (n.entity_type === 'quotation') {
                        navigate(`/crm/quotations/${n.entity_id}`);
                      } else if (n.entity_type === 'order') {
                        navigate(`/crm/orders/${n.entity_id}`);
                      } else if (n.entity_type === 'invoice') {
                        navigate(`/crm/invoices/${n.entity_id}`);
                      } else if (n.entity_type === 'crm_task') {
                        const aid = n.metadata?.open || n.metadata?.assignment_id;
                        if (aid) navigateCrmAssignment(navigate, aid);
                        else {
                          const lid = n.metadata?.lead_id;
                          navigate(lid ? `/crm/leads/${lid}?tab=tasks` : '/crm/tasks');
                        }
                      } else if (n.entity_type === 'event') {
                        navigate(eventsPathForNotification(n));
                      } else if (n.entity_type === 'release_note') {
                        navigate(`/updates`);
                      } else if ((n.entity_type === 'cskh_followup' || n.type === 'ai_crm_deadline_digest') && n.metadata?.nav_url) {
                        navigate(n.metadata.nav_url);
                      }
                      setOpen(false);
                    }}
                    className={`group relative px-4 py-3 hover:bg-emerald-50/40 cursor-pointer border-b border-gray-50 transition-colors ${
                      selectMode && selectedIds.has(n.id) ? 'bg-blue-100/60' : !n.is_read ? 'bg-gradient-to-r from-emerald-50/70 to-transparent' : ''
                    }`}
                  >
                    {!n.is_read && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-green-600" />
                    )}
                    <div className="flex gap-3">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(n.id)}
                          onChange={() => toggleSelected(n.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 rounded border-gray-300 shrink-0 cursor-pointer"
                        />
                      )}
                      <div className={`relative w-10 h-10 rounded-xl ${isApproval ? 'bg-orange-100 text-orange-600' : color} flex items-center justify-center shrink-0 shadow-sm ring-1 ring-white/60`}>
                        <Icon className="h-5 w-5" />
                        {!n.is_read && (
                          <span
                            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-[0_0_6px_rgba(16,185,129,0.55)]"
                            title="Chưa đọc"
                            aria-label="Chưa đọc"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-snug ${!n.is_read ? 'font-bold' : 'font-medium'}`} style={{ color: '#000000' }}>
                            {n.title}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            {moduleFilter === 'all' && inferNotificationModuleKey(n) && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                                {moduleChipLabel(inferNotificationModuleKey(n))}
                              </span>
                            )}
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1.5 animate-pulse" title="Chưa đọc" />
                            )}
                            {!selectMode && (() => {
                              const muteTarget = resolveMuteTarget(n);
                              if (!muteTarget) return null;
                              const isMuted = commentMutes.has(muteTarget.key);
                              const menuOpen = muteMenuNotifId === n.id;
                              return (
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMuteMenuNotifId((cur) => (cur === n.id ? null : n.id));
                                  }}
                                  className={`w-6 h-6 rounded-md flex items-center justify-center cursor-pointer ${
                                    isMuted
                                      ? 'text-red-600 bg-red-50'
                                      : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                                  }`}
                                  title={muteTarget.buttonTitle}
                                >
                                  {isMuted ? (
                                    <BellOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Bell className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                {menuOpen && (
                                  <div className="absolute right-0 top-7 z-30 w-48 rounded-xl border border-gray-200 bg-white shadow-xl py-1.5 animate-fade-in">
                                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                      {muteTarget.title}
                                    </p>
                                    {isMuted ? (
                                      <button
                                        type="button"
                                        disabled={muteBusy}
                                        onClick={() => unmuteByTarget(muteTarget)}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
                                      >
                                        Mở lại thông báo
                                      </button>
                                    ) : (
                                      COMMENT_MUTE_OPTIONS.map((opt) => (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          disabled={muteBusy}
                                          onClick={() => muteByTarget(muteTarget, opt.value)}
                                          className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-red-50 hover:text-red-700 cursor-pointer disabled:opacity-50"
                                        >
                                          {opt.label}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                            {!selectMode && !n.is_read && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                                className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer shrink-0"
                                title="Đánh dấu đã xem"
                              >
                                <Check className="h-3 w-3" />
                                Đã xem
                              </button>
                            )}
                            {!selectMode && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); dismissOne(n.id); }}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Bỏ qua thông báo này"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2 whitespace-pre-line leading-relaxed">{n.message}</p>

                        {/* Approval: show notes + files */}
                        {isApproval && n.metadata?.notes && (
                          <div className="mt-1.5 bg-amber-50 border border-amber-100 rounded-lg p-2">
                            <p className="text-xs text-amber-800">📝 {n.metadata.notes}</p>
                          </div>
                        )}
                        {isApproval && n.metadata?.attachments?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {n.metadata.attachments.map((f, fi) => {
                              const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                              return isImg ? (
                                <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                                  <img src={f.file_url} alt={f.file_name} className="h-12 w-12 rounded border object-cover" />
                                </a>
                              ) : (
                                <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                  <Paperclip className="h-2.5 w-2.5" />{f.file_name || 'file'}
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Approval action buttons */}
                        {isApproval && approvalStatus === 'pending' && approvalForm?.notifId !== n.id && (
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={(e) => { e.stopPropagation(); setApprovalForm({ notifId: n.id, action: 'approve', reason: '' }); }}
                              className="h-7 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-emerald-700">
                              <ThumbsUp className="h-3 w-3" /> Duyệt
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setApprovalForm({ notifId: n.id, action: 'reject', reason: '' }); }}
                              className="h-7 px-3 bg-red-100 text-red-600 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-red-200">
                              <ThumbsDown className="h-3 w-3" /> Từ chối
                            </button>
                          </div>
                        )}
                        {/* Inline reason form */}
                        {isApproval && approvalForm?.notifId === n.id && (
                          <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                            <p className="text-[10px] font-semibold text-gray-700">
                              {approvalForm.action === 'approve' ? '✅ Lý do duyệt:' : '❌ Lý do từ chối:'}
                            </p>
                            <textarea
                              value={approvalForm.reason}
                              onChange={e => setApprovalForm(f => ({ ...f, reason: e.target.value }))}
                              className="w-full h-14 px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-300"
                              placeholder={approvalForm.action === 'approve' ? 'Lý do duyệt (bắt buộc)...' : 'Lý do từ chối (bắt buộc)...'}
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <button onClick={() => handleApproval(n.id, approvalForm.action, approvalForm.reason)}
                                className={`h-6 px-2.5 text-white rounded text-[10px] font-medium cursor-pointer ${approvalForm.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'}`}>
                                {approvalForm.action === 'approve' ? '✅ Xác nhận duyệt' : '❌ Xác nhận từ chối'}
                              </button>
                              <button onClick={() => setApprovalForm(null)}
                                className="h-6 px-2 text-gray-500 bg-gray-100 rounded text-[10px] cursor-pointer">Hủy</button>
                            </div>
                          </div>
                        )}
                        {isApproval && approvalStatus === 'approved' && (
                          <p className="text-[10px] text-emerald-600 font-medium mt-1">✅ Đã duyệt</p>
                        )}
                        {isApproval && approvalStatus === 'rejected' && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">❌ Đã từ chối</p>
                        )}

                        <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

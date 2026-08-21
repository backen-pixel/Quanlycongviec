import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { rememberCompanyDeadlineClock, companyDeadlineIsoFromYmd } from '../lib/companyDeadlineClock';
import { vnNowParts, addCalendarDaysYmd, nextSxWorkingYmd, addSxWorkingDaysYmd } from '../lib/sxWorkshopSchedule';
import { memberModulesFromUser } from '../lib/memberModuleCounts';
import { compressImage } from '../lib/compressImage';
import { publicFileUrl } from '../lib/publicFileUrl';
import { AttachmentFileIcon, inferAttachmentDocType, TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';
import { mergeUploadProgressState, uploadSingleFileWithProgress } from '../lib/uploadProgressEta';
import UploadProgressBubble from './UploadProgressBubble';
import UploadFileLightbox, {
  collectUploadLightboxItems,
  findUploadLightboxIndex,
} from './UploadFileLightbox';
import { useFilePreview } from '../context/FilePreviewContext';
import {
  ClipboardList, Plus, Calendar, CheckCircle2, Circle, Clock, X, Pencil, Trash2, Save,
  LayoutGrid, Target, Factory, Truck, ExternalLink, MessageSquare, Paperclip, FileUp, ImagePlus,
} from 'lucide-react';
import SharedWorkspaceAssignHelp from './SharedWorkspaceAssignHelp';

const NOTE_DOC_TYPES = new Set(['task_inline_note', 'task_note', 'checklist_inline_note']);

function filterFileAttachments(atts) {
  return (atts || []).filter((a) => a?.file_url && !NOTE_DOC_TYPES.has(a.doc_type));
}

function isImageAtt(att) {
  if (!att?.file_url) return false;
  if (att.doc_type === 'image') return true;
  return !!(att.mime_type && String(att.mime_type).startsWith('image/'));
}

function isVideoAtt(att) {
  if (!att?.file_url) return false;
  if (att.doc_type === 'video') return true;
  return !!(att.mime_type && String(att.mime_type).startsWith('video/'));
}

const ASSIGN_PRIORITIES = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'TB' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Gấp' },
];

const ASSIGN_STATUSES = [
  { value: 'pending', label: 'Chờ' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'completed', label: 'Xong' },
  { value: 'cancelled', label: 'Hủy' },
];

const ASSIGN_STATUS_ICON = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: X,
};

/** Active colors giống AppModuleDashboard TAB_ACTIVE_COLORS */
const MODULE_TAB_ACTIVE = [
  'bg-white text-slate-800 shadow-sm',
  'bg-white text-blue-700 shadow-sm',
  'bg-white text-emerald-700 shadow-sm',
  'bg-white text-cyan-700 shadow-sm',
];

const MODULE_TABS = [
  { id: 'all', label: 'Tất cả', icon: LayoutGrid, emoji: '📋' },
  { id: 'crm', label: 'CRM', icon: Target, emoji: '🎯' },
  { id: 'production', label: 'SX', icon: Factory, emoji: '🏭' },
  { id: 'logistics', label: 'LD', icon: Truck, emoji: '🚚' },
];

const TASK_SOURCE_OPTIONS = [
  { value: 'customer_request', label: 'Phát sinh từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi từ nhân viên' },
];

const ERROR_MODULE_OPTIONS = [
  { value: 'crm', label: 'CRM' },
  { value: 'production', label: 'Xưởng (SX)' },
  { value: 'logistics', label: 'Lắp đặt (LD)' },
];

const PHAT_SINH_KIND_OPTIONS = [
  { value: '', label: '— Không chọn SLA kính —' },
  { value: 'tempered_glass', label: 'Kính cường lực (3 ngày LV)' },
  { value: 'glass_unpainted', label: 'Kính không sơn (trong ngày / trưa → hôm sau)' },
  { value: 'glass_painted', label: 'Kính có sơn (trong ngày)' },
];

function phatSinhKindLabel(kind) {
  if (kind === 'tempered_glass') return 'Kính CL';
  if (kind === 'glass_unpainted') return 'Kính không sơn';
  if (kind === 'glass_painted') return 'Kính có sơn';
  return null;
}

function clockMinutes(clock) {
  return (Number(clock?.hour) || 0) * 60 + (Number(clock?.minute) || 0);
}

function suggestPhatSinhDeadlineIso(kind, cfg = {}, companyId = null) {
  const deadlineClock = cfg.deadline_clock || { hour: 17, minute: 30 };
  const cutoffClock = cfg.cutoff_clock || { hour: 12, minute: 0 };
  if (companyId) rememberCompanyDeadlineClock(companyId, deadlineClock);
  const parts = vnNowParts();
  const nowMin = parts.hour * 60 + (parts.minute || 0);
  let ymd = parts.ymd;
  if (kind === 'tempered_glass') {
    const days = Number(cfg.tempered_glass_days) > 0 ? Number(cfg.tempered_glass_days) : 3;
    ymd = addSxWorkingDaysYmd(ymd, days);
  } else if (kind === 'glass_unpainted') {
    if (nowMin >= clockMinutes(cutoffClock)) ymd = addCalendarDaysYmd(ymd, 1);
    ymd = nextSxWorkingYmd(ymd);
  } else if (kind === 'glass_painted') {
    if (nowMin >= clockMinutes(deadlineClock)) ymd = addCalendarDaysYmd(ymd, 1);
    ymd = nextSxWorkingYmd(ymd);
  } else {
    return null;
  }
  return companyDeadlineIsoFromYmd(ymd, companyId || deadlineClock);
}

function toLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function memberBelongsToModule(member, moduleId) {
  if (!moduleId || moduleId === 'all') return true;
  return memberModulesFromUser(member?.user || member).includes(moduleId);
}

/** Công ty áp dụng khi lọc NV theo khối phân công. */
function companyIdForAssignModule(moduleId, { companyId, sxCompanyId, vcCompanyId, executorCompanyId }) {
  if (moduleId === 'production') return executorCompanyId || sxCompanyId || companyId || null;
  if (moduleId === 'logistics') return vcCompanyId || companyId || null;
  if (moduleId === 'crm') return companyId || null;
  return companyId || null;
}

/**
 * Lọc NV theo công ty khối.
 * - user.company_id null (admin hệ thống) luôn được giữ nếu đã là thành viên deal.
 * - Khi chưa biết company scope thì không lọc theo cty.
 */
function memberBelongsToCompany(member, scopeCompanyId) {
  if (!scopeCompanyId) return true;
  const uidCompany = member?.user?.company_id ?? member?.company_id ?? null;
  if (!uidCompany) return true;
  return String(uidCompany) === String(scopeCompanyId);
}

function memberMatchesAssignPool(member, moduleId, companyScope) {
  if (!moduleId || moduleId === 'all') return true;
  const cid = companyIdForAssignModule(moduleId, companyScope);
  if (!memberBelongsToCompany(member, cid)) return false;
  if (memberBelongsToModule(member, moduleId)) return true;
  // Admin/staff cùng công ty khối SX/VC thường có role CRM — vẫn cho giao việc khối đó.
  if ((moduleId === 'logistics' || moduleId === 'production') && cid) {
    const uidCompany = member?.user?.company_id ?? member?.company_id ?? null;
    return !!(uidCompany && String(uidCompany) === String(cid));
  }
  return false;
}

/** Ưu tiên assignment_module; fallback theo module của người được giao. */
function assignmentBelongsToModule(assignment, moduleId, memberByUserId) {
  if (!moduleId || moduleId === 'all') return true;
  const stored = String(assignment?.assignment_module || '').toLowerCase();
  if (stored === 'crm' || stored === 'production' || stored === 'logistics') {
    return stored === moduleId;
  }
  const people = assignment?.assignees?.length
    ? assignment.assignees
    : (assignment?.assignee ? [assignment.assignee] : []);
  if (!people.length) return false;
  return people.some((u) => {
    const mem = memberByUserId.get(String(u.id));
    const src = mem?.user || mem || u;
    return memberModulesFromUser(src).includes(moduleId);
  });
}

function assignmentModuleLabel(mod) {
  if (mod === 'production') return 'SX';
  if (mod === 'logistics') return 'LD';
  return 'CRM';
}

/** Trang Giao việc đúng khối của phân công. */
function assignmentBoardHref(assignment, fallbackModule = 'crm') {
  const mod = String(assignment?.assignment_module || fallbackModule || '').toLowerCase();
  const base = mod === 'production'
    ? '/sx/assignments'
    : mod === 'logistics'
      ? '/vc/assignments'
      : '/crm/assignments';
  return assignment?.id ? `${base}?open=${assignment.id}` : base;
}

function assignmentBoardTitle(assignment, fallbackModule = 'crm') {
  const mod = String(assignment?.assignment_module || fallbackModule || '').toLowerCase();
  if (mod === 'production') return 'Đi tới Giao việc Sản xuất';
  if (mod === 'logistics') return 'Đi tới Giao việc Lắp đặt';
  return 'Đi tới Giao việc CRM';
}

function assignmentsBoardHome(moduleId) {
  if (moduleId === 'production') return '/sx/assignments';
  if (moduleId === 'logistics') return '/vc/assignments';
  return '/crm/assignments';
}

function taskSourceLabel(type) {
  if (type === 'employee_error') return 'Lỗi NV';
  if (type === 'customer_request') return 'Từ KH';
  return null;
}

function errorModuleLabel(mod) {
  if (mod === 'production') return 'Xưởng';
  if (mod === 'logistics') return 'Lắp đặt';
  if (mod === 'crm') return 'CRM';
  return null;
}

/**
 * CRUD phân công (crm_assignments) cho thành viên tham gia lead/deal.
 * Phân loại theo module CRM / SX / VC + lọc theo công ty khối.
 */
export default function LeadMemberAssignmentsPanel({
  leadId,
  defaultModule = 'all',
  companyId: companyIdProp = null,
  sxCompanyId = null,
  vcCompanyId = null,
  linkedProjectId = null,
  refreshKey = null,
}) {
  const initialModule = ['crm', 'production', 'logistics'].includes(defaultModule)
    ? defaultModule
    : 'all';
  const [members, setMembers] = useState([]);
  const [leadCompanyId, setLeadCompanyId] = useState(companyIdProp || null);
  const [assignments, setAssignments] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAssignHelp, setShowAssignHelp] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [moduleTab, setModuleTab] = useState(initialModule);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('pending');
  const [columnId, setColumnId] = useState('');
  const [memberIds, setMemberIds] = useState(() => new Set());
  const [taskSourceType, setTaskSourceType] = useState('customer_request');
  const [employeeErrorModule, setEmployeeErrorModule] = useState('crm');
  const [phatSinhKind, setPhatSinhKind] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [executorCompanyId, setExecutorCompanyId] = useState('');
  const [participantCompanies, setParticipantCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  /** Khối gắn phân công (CRM/SX/VC) — chọn trên form, không chỉ theo tab. */
  const [assignModule, setAssignModule] = useState(
    ['crm', 'production', 'logistics'].includes(initialModule) ? initialModule : 'crm',
  );
  const [expandedNotesId, setExpandedNotesId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [savingNoteId, setSavingNoteId] = useState(null);
  const [taskAttachments, setTaskAttachments] = useState({});
  const [uploadingAssignId, setUploadingAssignId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  /** Ảnh minh họa đính kèm khi tạo/sửa phân công — upload sau khi có crm_task_id */
  const [pendingImages, setPendingImages] = useState([]);
  const [formUploadBusy, setFormUploadBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { items, index }
  const pendingImagesInputRef = useRef(null);
  const prevAssignRefreshKeyRef = useRef(refreshKey);
  const filePreview = useFilePreview();

  const companyId = companyIdProp || leadCompanyId || null;
  const companyScope = useMemo(
    () => ({ companyId, sxCompanyId, vcCompanyId, executorCompanyId: executorCompanyId || null }),
    [companyId, sxCompanyId, vcCompanyId, executorCompanyId],
  );

  const memberByUserId = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      if (m?.user_id) map.set(String(m.user_id), m);
    }
    return map;
  }, [members]);

  const memberCounts = useMemo(() => {
    const base = { crm: 0, production: 0, logistics: 0 };
    const seen = { crm: new Set(), production: new Set(), logistics: new Set() };
    for (const m of members || []) {
      const uid = String(m?.user_id || m?.user?.id || '').trim();
      if (!uid) continue;
      for (const mod of ['crm', 'production', 'logistics']) {
        if (!memberMatchesAssignPool(m, mod, companyScope)) continue;
        if (seen[mod].has(uid)) continue;
        seen[mod].add(uid);
        base[mod] += 1;
      }
    }
    return {
      ...base,
      total: new Set(
        (members || [])
          .map((m) => String(m?.user_id || m?.user?.id || '').trim())
          .filter(Boolean),
      ).size,
    };
  }, [members, companyScope]);

  /** Danh sách NV theo tab (module + công ty khối). Tab «Tất cả» = mọi thành viên deal. */
  const filteredMembers = useMemo(
    () => members.filter((m) => memberMatchesAssignPool(m, moduleTab, companyScope)),
    [members, moduleTab, companyScope],
  );

  /** Khối gắn phân công — ưu tiên chọn trên form; tab chỉ gợi ý mặc định. */
  const formModule = ['crm', 'production', 'logistics'].includes(assignModule)
    ? assignModule
    : (moduleTab === 'all' ? 'crm' : moduleTab);
  /** Form giao việc: lọc NV theo khối đã chọn (+ công ty khối nếu có). */
  const formMembers = useMemo(
    () => (members || []).filter((m) => m?.user_id && memberMatchesAssignPool(m, formModule, companyScope)),
    [members, formModule, companyScope],
  );

  const formCompanyId = companyIdForAssignModule(formModule, companyScope);

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => assignmentBelongsToModule(a, moduleTab, memberByUserId)),
    [assignments, moduleTab, memberByUserId],
  );

  const assignmentCounts = useMemo(() => {
    const counts = { all: assignments.length, crm: 0, production: 0, logistics: 0 };
    for (const a of assignments) {
      for (const mod of ['crm', 'production', 'logistics']) {
        if (assignmentBelongsToModule(a, mod, memberByUserId)) counts[mod] += 1;
      }
    }
    return counts;
  }, [assignments, memberByUserId]);

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((p) => {
        if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      return [];
    });
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setDesc('');
    setDeadline('');
    setPriority('medium');
    setStatus('pending');
    setColumnId(columns[0] ? String(columns[0].id) : '');
    setMemberIds(new Set());
    setTaskSourceType('customer_request');
    setEmployeeErrorModule('crm');
    setPhatSinhKind('');
    setDepartmentId('');
    setExecutorCompanyId('');
    setAssignModule(moduleTab === 'all' ? 'crm' : moduleTab);
    setEditingId(null);
    setShowForm(false);
    clearPendingImages();
    setFormUploadBusy(false);
  }, [columns, moduleTab, clearPendingImages]);

  const addPendingImages = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith('image/')).slice(0, 20);
    if (!files.length) return;
    setPendingImages((prev) => {
      const room = Math.max(0, 20 - prev.length);
      const next = files.slice(0, room).map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  };

  const removePendingImage = (key) => {
    setPendingImages((prev) => {
      const hit = prev.find((p) => p.key === key);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const uploadImagesToTask = async (taskId, images) => {
    if (!taskId || !images?.length) return;
    const compressed = await Promise.all(images.map((p) => compressImage(p.file)));
    const formData = new FormData();
    compressed.forEach((f) => formData.append('files', f));
    const { data: uploadRes } = await api.post('/upload', formData);
    const ok = uploadRes.uploaded || uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes]);
    const allUploaded = Array.isArray(ok) ? ok : [ok];
    const successUploads = allUploaded.filter((up) => up?.file_url && !String(up.file_url).startsWith('data:'));
    if (!successUploads.length) throw new Error('Upload ảnh không thành công');
    const seenUrls = new Set();
    const items = [];
    for (const up of successUploads) {
      const url = String(up.file_url);
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      items.push({
        name: (up.original_name || up.file_name || 'Ảnh minh họa').replace(/\.[^.]+$/, ''),
        doc_type: inferAttachmentDocType(up) || 'image',
        file_url: up.file_url,
        file_name: up.file_name,
        file_size: up.file_size,
        mime_type: up.mime_type,
      });
    }
    await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, { items });
  };
  const loadMembers = useCallback(async () => {
    if (!leadId) return;
    try {
      const r = await api.get(`/crm/leads/${leadId}/members`);
      const list = Array.isArray(r.data) ? r.data : (r.data?.members || []);
      setMembers(list);
    } catch {
      setMembers([]);
    }
  }, [leadId]);

  const loadLeadCompany = useCallback(async () => {
    if (!leadId || companyIdProp) {
      if (companyIdProp) setLeadCompanyId(companyIdProp);
      return;
    }
    try {
      const { data } = await api.get(`/crm/leads/${leadId}`);
      setLeadCompanyId(data?.company_id || null);
    } catch {
      setLeadCompanyId(null);
    }
  }, [leadId, companyIdProp]);

  useEffect(() => {
    let cancelled = false;
    const fallback = [];
    const seen = new Set();
    const push = (id, label, role) => {
      if (!id || seen.has(String(id))) return;
      seen.add(String(id));
      fallback.push({ id: String(id), label: label || String(id), roles: role ? [role] : [] });
    };
    if (sxCompanyId) push(sxCompanyId, 'Xưởng hiện tại', 'sx');
    if (companyId) push(companyId, 'CRM', 'crm');
    if (vcCompanyId) push(vcCompanyId, 'VC/LĐ', 'vc');

    if (!linkedProjectId) {
      setParticipantCompanies(fallback);
      return undefined;
    }
    api.get(`/production/projects/${linkedProjectId}/participant-companies`)
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data?.companies) ? r.data.companies : [];
        setParticipantCompanies(list.length ? list : fallback);
      })
      .catch(() => {
        if (!cancelled) setParticipantCompanies(fallback);
      });
    return () => { cancelled = true; };
  }, [linkedProjectId, companyId, sxCompanyId, vcCompanyId]);

  const sxParticipantCompanies = useMemo(
    () => (participantCompanies || []).filter((c) => (c.roles || []).includes('sx') || (c.roles || []).includes('placed')),
    [participantCompanies],
  );

  const deptCompanyId = executorCompanyId || sxCompanyId || companyId;

  useEffect(() => {
    if (!deptCompanyId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/departments', { params: { company_id: deptCompanyId } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.departments || r.data || [];
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setDepartments([]); });
    return () => { cancelled = true; };
  }, [deptCompanyId]);

  useEffect(() => {
    if (!phatSinhKind || editingId) return;
    const slaCompany = executorCompanyId || sxCompanyId || companyId;
    if (!slaCompany) return;
    let cancelled = false;
    api.get('/production/schedule-config', { params: { company_id: slaCompany } })
      .then((r) => {
        if (cancelled) return;
        const cfg = r.data || {};
        const clock = cfg.deadline_clock || { hour: 17, minute: 30 };
        rememberCompanyDeadlineClock(slaCompany, clock);
        const iso = suggestPhatSinhDeadlineIso(phatSinhKind, cfg, slaCompany);
        if (iso) setDeadline(toLocalInput(iso));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [phatSinhKind, executorCompanyId, sxCompanyId, companyId, editingId]);

  const loadAssignments = useCallback(async () => {
    if (!leadId) return;
    try {
      const { data } = await api.get(`/crm/leads/${leadId}/assignments`);
      setAssignments(data?.assignments || []);
    } catch {
      setAssignments([]);
    }
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadMembers(),
      loadLeadCompany(),
      loadAssignments(),
      api.get('/crm/assignments/columns').then((r) => {
        const cols = r.data?.columns || [];
        if (!cancelled) {
          setColumns(cols);
          if (cols.length) setColumnId((prev) => prev || String(cols[0].id));
        }
      }).catch(() => {
        if (!cancelled) setColumns([]);
      }),
    ]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [leadId, loadMembers, loadAssignments, loadLeadCompany]);

  useEffect(() => {
    if (!leadId || refreshKey == null) return;
    if (prevAssignRefreshKeyRef.current === refreshKey) return;
    prevAssignRefreshKeyRef.current = refreshKey;
    void loadMembers();
    void loadAssignments();
  }, [refreshKey, leadId, loadMembers, loadAssignments]);

  useEffect(() => {
    if (companyIdProp) setLeadCompanyId(companyIdProp);
  }, [companyIdProp]);

  useEffect(() => {
    if (['crm', 'production', 'logistics'].includes(defaultModule)) {
      setModuleTab(defaultModule);
    }
  }, [defaultModule, leadId]);

  /** Khi đổi danh sách thành viên deal — bỏ chọn NV đã rời deal. */
  useEffect(() => {
    if (!showForm || editingId) return;
    setMemberIds((prev) => {
      const allowed = new Set(formMembers.map((m) => String(m.user_id)));
      const next = new Set([...prev].filter((id) => allowed.has(String(id))));
      return next.size === prev.size ? prev : next;
    });
  }, [formMembers, showForm, editingId]);

  const toggleMember = (userId) => {
    const sid = String(userId);
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const allFormMembersSelected = formMembers.length > 0
    && formMembers.every((m) => memberIds.has(String(m.user_id)));

  const selectAllFilteredMembers = () => {
    if (allFormMembersSelected) {
      setMemberIds(new Set());
      return;
    }
    setMemberIds(new Set(formMembers.map((m) => String(m.user_id)).filter(Boolean)));
  };

  const openCreate = () => {
    resetForm();
    setAssignModule(moduleTab === 'all' ? 'crm' : moduleTab);
    setExecutorCompanyId(sxCompanyId ? String(sxCompanyId) : '');
    setShowForm(true);
  };

  const openEdit = (a) => {
    const mod = String(a.assignment_module || '').toLowerCase();
    if (mod === 'crm' || mod === 'production' || mod === 'logistics') {
      setModuleTab(mod);
      setAssignModule(mod);
    } else {
      setAssignModule(moduleTab === 'all' ? 'crm' : moduleTab);
    }
    setEditingId(a.id);
    setShowForm(true);
    setTitle(a.title || '');
    setDesc(a.description || '');
    setDeadline(toLocalInput(a.deadline));
    setPriority(a.priority || 'medium');
    setStatus(a.status || 'pending');
    setColumnId(a.column_id ? String(a.column_id) : (columns[0] ? String(columns[0].id) : ''));
    const src = String(a.task_source_type || '').toLowerCase();
    setTaskSourceType(src === 'employee_error' ? 'employee_error' : 'customer_request');
    const errMod = String(a.employee_error_module || '').toLowerCase();
    setEmployeeErrorModule(
      errMod === 'production' || errMod === 'logistics' || errMod === 'crm' ? errMod : 'crm',
    );
    setPhatSinhKind(String(a.phat_sinh_kind || ''));
    setDepartmentId(a.department_id ? String(a.department_id) : '');
    setExecutorCompanyId(a.executor_company_id ? String(a.executor_company_id) : '');
    const ids = (a.assignees?.length
      ? a.assignees.map((u) => u.id)
      : (a.assignee_id ? [a.assignee_id] : [])
    ).map(String).filter(Boolean);
    setMemberIds(new Set(ids));
  };

  const submit = async () => {
    if (!title.trim()) return alert('Nhập tiêu đề nhiệm vụ');
    if (!memberIds.size) return alert('Chọn ít nhất một thành viên');
    if (!taskSourceType) return alert('Chọn loại nhiệm vụ');
    if (!['crm', 'production', 'logistics'].includes(String(assignModule || ''))) {
      return alert('Chọn khối phân công: CRM / Xưởng / Lắp đặt (LD)');
    }
    if (taskSourceType === 'employee_error' && !employeeErrorModule) {
      return alert('Chọn khối phát sinh lỗi: CRM / Xưởng / Lắp đặt (LD)');
    }
    if (formModule === 'production' && sxParticipantCompanies.length > 0 && !executorCompanyId) {
      return alert('Chọn xưởng nhận (công ty đã thuộc dự án)');
    }
    const invalid = [...memberIds].filter((id) => {
      const m = memberByUserId.get(String(id));
      return !m || !memberMatchesAssignPool(m, formModule, companyScope);
    });
    if (invalid.length) {
      return alert(
        `Chỉ giao cho thành viên khối ${assignmentModuleLabel(formModule)}`
        + (formCompanyId ? ' thuộc đúng công ty' : ''),
      );
    }
    const sourcePayload = {
      task_source_type: taskSourceType,
      employee_error_module: taskSourceType === 'employee_error' ? employeeErrorModule : null,
      phat_sinh_kind: phatSinhKind || null,
      department_id: departmentId || null,
      executor_company_id: formModule === 'production' && executorCompanyId
        ? executorCompanyId
        : undefined,
    };
    setSaving(true);
    try {
      let linkedTaskId = null;
      if (editingId) {
        const existing = assignments.find((a) => String(a.id) === String(editingId));
        linkedTaskId = existing?.crm_task_id || null;
        await api.put(`/crm/assignments/${editingId}`, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          status,
          column_id: columnId || null,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          ...sourcePayload,
        });
      } else {
        const { data } = await api.post(`/crm/leads/${leadId}/assignments`, {
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          column_id: columnId || null,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          assignee_ids: [...memberIds],
          assignment_module: formModule,
          company_id: formCompanyId || undefined,
          ...sourcePayload,
        });
        linkedTaskId = data?.task?.id || data?.assignment?.crm_task_id || null;
      }
      if (pendingImages.length) {
        if (!linkedTaskId) {
          throw new Error('Đã lưu phân công nhưng chưa có nhiệm vụ để đính ảnh — mở phân công và Upload file.');
        }
        setFormUploadBusy(true);
        await uploadImagesToTask(linkedTaskId, pendingImages);
      }
      resetForm();
      await loadAssignments();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu phân công');
    } finally {
      setFormUploadBusy(false);
      setSaving(false);
    }
  };

  const updateStatus = async (id, nextStatus) => {
    const prev = assignments;
    setAssignments((list) => list.map((a) => (a.id === id ? { ...a, status: nextStatus } : a)));
    try {
      await api.put(`/crm/assignments/${id}`, { status: nextStatus });
    } catch (e) {
      setAssignments(prev);
      alert(e.response?.data?.error || 'Lỗi cập nhật trạng thái');
    }
  };

  /** Giống nhiệm vụ Công việc: Chờ → Đang làm → Xong → Chờ */
  const cycleStatus = (a) => {
    const next = a.status === 'completed'
      ? 'pending'
      : a.status === 'pending'
        ? 'in_progress'
        : 'completed';
    return updateStatus(a.id, next);
  };

  const loadTaskAttachments = async (a) => {
    if (!a?.crm_task_id || !leadId) return;
    try {
      const { data } = await api.get(`/crm/leads/${leadId}/tasks/${a.crm_task_id}/attachments`);
      setTaskAttachments((p) => ({ ...p, [a.id]: Array.isArray(data) ? data : (data?.attachments || []) }));
    } catch {
      setTaskAttachments((p) => ({ ...p, [a.id]: [] }));
    }
  };

  const openAttachmentPreview = (atts, att) => {
    if (!att?.file_url) return;
    if (isImageAtt(att)) {
      const items = collectUploadLightboxItems(atts);
      const idx = findUploadLightboxIndex(items, att.file_url);
      if (items.length && idx >= 0) {
        setLightbox({ items, index: idx });
        return;
      }
      const one = collectUploadLightboxItems([att]);
      if (one.length) setLightbox({ items: one, index: 0 });
      return;
    }
    if (filePreview?.openFilePreview) {
      filePreview.openFilePreview({
        url: att.file_url,
        fileName: att.file_name || att.name,
        mimeType: att.mime_type,
        title: att.name || att.file_name || 'Xem file',
      });
    }
  };

  /** Prefetch đính kèm cho danh sách phân công (hiện luôn trên thẻ, không cần mở panel). */
  useEffect(() => {
    if (!leadId || !assignments.length) return;
    let cancelled = false;
    const rows = assignments.filter((a) => a?.crm_task_id);
    if (!rows.length) return undefined;
    (async () => {
      await Promise.all(rows.map(async (a) => {
        if (cancelled) return;
        try {
          const { data } = await api.get(`/crm/leads/${leadId}/tasks/${a.crm_task_id}/attachments`);
          if (cancelled) return;
          setTaskAttachments((p) => ({
            ...p,
            [a.id]: Array.isArray(data) ? data : (data?.attachments || []),
          }));
        } catch {
          if (!cancelled) {
            setTaskAttachments((p) => ({ ...p, [a.id]: [] }));
          }
        }
      }));
    })();
    return () => { cancelled = true; };
  }, [leadId, assignments]);

  const toggleNotes = (a) => {
    if (expandedNotesId === a.id) {
      setExpandedNotesId(null);
      return;
    }
    setExpandedNotesId(a.id);
    setNoteDrafts((p) => ({
      ...p,
      [a.id]: a.crm_task?.notes ?? p[a.id] ?? '',
    }));
    void loadTaskAttachments(a);
  };

  const saveNotes = async (a) => {
    if (!a.crm_task_id) {
      alert('Phân công chưa liên kết nhiệm vụ — không lưu được ghi chú đồng bộ.');
      return;
    }
    const notes = noteDrafts[a.id] ?? a.crm_task?.notes ?? '';
    setSavingNoteId(a.id);
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${a.crm_task_id}/notes`, { notes });
      setAssignments((list) => list.map((row) => (
        row.id === a.id
          ? { ...row, crm_task: { ...(row.crm_task || { id: a.crm_task_id }), notes } }
          : row
      )));
      setSavingNoteId(`saved-${a.id}`);
      setTimeout(() => setSavingNoteId((cur) => (cur === `saved-${a.id}` ? null : cur)), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
      setSavingNoteId(null);
    }
  };

  const uploadTaskFile = (a) => {
    if (!a?.crm_task_id) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = TASK_ATTACHMENT_FILE_ACCEPT;
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 50);
      if (!rawFiles.length) return;
      const assignId = a.id;
      const taskId = a.crm_task_id;
      setUploadingAssignId(assignId);
      try {
        const imageFiles = rawFiles.filter((f) => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter((f) => !f.type.startsWith('image/'));
        const allUploaded = [];

        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
          const formData = new FormData();
          compressed.forEach((f) => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData);
          const ok = uploadRes.uploaded || uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes]);
          allUploaded.push(...(Array.isArray(ok) ? ok : [ok]));
        }

        for (const file of otherFiles) {
          setUploadProgress((p) => ({ ...p, [assignId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024;
          const result = await uploadSingleFileWithProgress({
            file,
            endpoint: isLarge ? '/upload/stream' : '/upload/single',
            baseURL: api.defaults.baseURL,
            token: localStorage.getItem('token'),
            onProgress: (stats) => {
              setUploadProgress((p) => ({
                ...p,
                [assignId]: mergeUploadProgressState({
                  percent: 0,
                  name: file.name,
                  size: file.size,
                }, stats),
              }));
            },
          });
          allUploaded.push(result);
        }

        setUploadProgress((p) => {
          const n = { ...p };
          delete n[assignId];
          return n;
        });

        const successUploads = allUploaded.filter((up) => up?.file_url && !String(up.file_url).startsWith('data:'));
        if (!successUploads.length) throw new Error('Upload không trả về file');

        const seenUrls = new Set();
        const items = [];
        for (const up of successUploads) {
          const url = String(up.file_url);
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          items.push({
            name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
            doc_type: inferAttachmentDocType(up),
            file_url: up.file_url,
            file_name: up.file_name,
            file_size: up.file_size,
            mime_type: up.mime_type,
          });
        }
        await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, { items });
        await loadTaskAttachments(a);
      } catch (err) {
        setUploadProgress((p) => {
          const n = { ...p };
          delete n[assignId];
          return n;
        });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingAssignId(null);
    };
    input.click();
  };

  const deleteTaskAttachment = async (a, attachmentId) => {
    if (!a?.crm_task_id || !confirm('Xóa file đính kèm này?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/tasks/${a.crm_task_id}/attachments/${attachmentId}`);
      setTaskAttachments((p) => ({
        ...p,
        [a.id]: (p[a.id] || []).filter((att) => att.id !== attachmentId),
      }));
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa file');
    }
  };

  const remove = async (id) => {
    if (!confirm('Xóa phân công này?')) return;
    try {
      await api.delete(`/crm/assignments/${id}`);
      if (editingId === id) resetForm();
      if (expandedNotesId === id) setExpandedNotesId(null);
      setTaskAttachments((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      await loadAssignments();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa phân công');
    }
  };

  if (!leadId) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        Cần deal CRM để phân công cho thành viên.
      </p>
    );
  }

  const createDisabled = !members.length;

  const activeModuleMeta = MODULE_TABS.find((t) => t.id === moduleTab) || MODULE_TABS[0];
  const scopeHint = ` · khối ${assignmentModuleLabel(formModule)}`;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      {/* Header giống AppModuleLayout */}
      <header className="shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm px-3 sm:px-4 py-1.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-8 w-8 rounded-lg flex items-center justify-center text-base shrink-0 ring-1 ring-black/5 bg-violet-50 text-violet-700">
            {activeModuleMeta.emoji || '📋'}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate leading-tight">
              Phân công thành viên
            </h2>
            <p className="text-[10px] text-slate-400 leading-tight">
              {filteredAssignments.length} việc
              {moduleTab !== 'all' ? ` · ${assignmentModuleLabel(moduleTab)}` : ''}
              {' · '}
              {moduleTab === 'all' ? memberCounts.total : (memberCounts[moduleTab] || 0)} NV
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-1 ml-auto flex-wrap">
          <SharedWorkspaceAssignHelp
            open={showAssignHelp}
            onOpenChange={setShowAssignHelp}
          />
          <Link
            to={assignmentsBoardHome(moduleTab === 'all' ? 'crm' : moduleTab)}
            className="h-8 px-2 rounded-md text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1"
            title={assignmentBoardTitle(null, moduleTab === 'all' ? 'crm' : moduleTab)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Giao việc</span>
          </Link>
          <button
            type="button"
            disabled={createDisabled}
            onClick={openCreate}
            title={createDisabled
              ? 'Chưa có thành viên tham gia deal — thêm ở tab Thành viên'
              : undefined}
            className="h-8 px-2.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 bg-violet-600 text-white hover:bg-violet-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Thêm
            {moduleTab !== 'all' && (
              <span className="opacity-90">· {assignmentModuleLabel(formModule)}</span>
            )}
          </button>
        </nav>
        {createDisabled && (
          <p className="w-full text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            Nút Thêm đang khóa: chưa có thành viên tham gia deal. Thêm NV ở tab Thành viên rồi tải lại.
          </p>
        )}
      </header>

      {/* Hàng tab phân loại — giống AppModuleDashboard */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap px-2.5 py-1.5 sm:px-3 bg-slate-50/50 border-b border-slate-200/60">
        <div className="inline-flex gap-px p-0.5 bg-slate-200/60 border border-slate-300/50 rounded-lg shrink-0 max-w-full overflow-x-auto">
          {MODULE_TABS.map((tab, idx) => {
            const assignN = assignmentCounts[tab.id] || 0;
            const memberN = tab.id === 'all' ? memberCounts.total : (memberCounts[tab.id] || 0);
            const active = moduleTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setModuleTab(tab.id);
                  if (showForm && !editingId) resetForm();
                }}
                title={
                  tab.id === 'logistics'
                    ? `Lắp đặt (LD) — Thành viên: ${memberN} · Phân công: ${assignN}`
                    : `Thành viên: ${memberN} · Phân công: ${assignN}`
                }
                className={`rounded-md font-semibold transition-colors flex items-center gap-1 px-2 py-1 text-[11px] whitespace-nowrap cursor-pointer ${
                  active
                    ? MODULE_TAB_ACTIVE[idx % MODULE_TAB_ACTIVE.length]
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="text-[12px] leading-none">{tab.emoji}</span>
                <Icon className="h-3 w-3 opacity-70 hidden sm:inline" />
                {tab.label}
                <span className={`tabular-nums ${active ? 'opacity-80' : 'text-slate-400'}`}>{assignN}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 space-y-3">
      {!members.length && !loading && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Chưa có thành viên trên deal. Thêm ở tab Thành viên trước khi giao việc.
        </p>
      )}

      {members.length > 0 && moduleTab !== 'all' && !filteredMembers.length && !loading && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Chưa có thành viên khối {assignmentModuleLabel(moduleTab)}
          {companyIdForAssignModule(moduleTab, companyScope) ? ' thuộc công ty của khối này' : ''} trên deal.
        </p>
      )}

      {showForm && (
        <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-3 space-y-2 shadow-sm">
          <p className="text-xs font-semibold text-violet-800">
            {editingId ? 'Sửa phân công' : `Tạo phân công · ${assignmentModuleLabel(formModule)}`}
            {scopeHint && <span className="font-medium text-violet-600">{scopeHint}</span>}
          </p>
          <p className="text-[10px] text-violet-700/80">
            Giao việc sẽ tự tạo nhiệm vụ và gán cho người được chọn (đồng bộ Giao việc ↔ Công việc).
            Đổi «Khối phân công» để lọc danh sách nhân viên khối đó.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề nhiệm vụ *"
            className="w-full h-8 px-2 border border-gray-200 rounded-lg text-sm"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Mô tả (tùy chọn)"
            rows={2}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm resize-y"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Loại nhiệm vụ *
              </label>
              <select
                value={taskSourceType}
                onChange={(e) => setTaskSourceType(e.target.value)}
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white"
              >
                {TASK_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Khối phân công *
              </label>
              <select
                value={assignModule}
                onChange={(e) => setAssignModule(e.target.value)}
                className="w-full h-8 px-2 border border-violet-200 rounded-lg text-xs bg-white"
              >
                {ERROR_MODULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {taskSourceType === 'employee_error' && (
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Khối phát sinh lỗi *
                </label>
                <select
                  value={employeeErrorModule}
                  onChange={(e) => setEmployeeErrorModule(e.target.value)}
                  className="w-full h-8 px-2 border border-amber-200 rounded-lg text-xs bg-amber-50/60"
                >
                  {ERROR_MODULE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-[9px] text-amber-700 mt-0.5">
                  Có thể khác khối phân công ({assignmentModuleLabel(formModule)})
                </p>
              </div>
            )}
            {formModule === 'production' && sxParticipantCompanies.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Xưởng nhận *
                </label>
                <select
                  value={executorCompanyId}
                  onChange={(e) => {
                    setExecutorCompanyId(e.target.value);
                    setMemberIds(new Set());
                  }}
                  className="w-full h-8 px-2 border border-teal-200 rounded-lg text-xs bg-white"
                >
                  <option value="">— Chọn xưởng thuộc dự án —</option>
                  {sxParticipantCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.label || c.short_name || c.name}</option>
                  ))}
                </select>
                <p className="text-[9px] text-teal-700 mt-0.5">
                  Chỉ các công ty đã gắn dự án này (không tạo xưởng mới).
                </p>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Bộ phận
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white"
              >
                <option value="">— Không chọn —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Deadline phát sinh (kính)
              </label>
              <select
                value={phatSinhKind}
                onChange={(e) => setPhatSinhKind(e.target.value)}
                className="w-full h-8 px-2 border border-cyan-200 rounded-lg text-xs bg-white"
              >
                {PHAT_SINH_KIND_OPTIONS.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[9px] text-cyan-700 mt-0.5">
                Tự điền hạn (có thể sửa). Kính CL: 3 ngày LV · không sơn: trước 12h trong ngày.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white"
            >
              {ASSIGN_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {editingId && (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white"
              >
                {ASSIGN_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-8 px-2 border border-gray-200 rounded-lg text-xs"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-slate-600">
              Giao cho thành viên khối {assignmentModuleLabel(formModule)} ({formMembers.length})
              {formCompanyId ? ' · đúng công ty khối' : ''}
            </span>
            <button
              type="button"
              onClick={selectAllFilteredMembers}
              className="text-[10px] text-violet-700 hover:underline cursor-pointer"
            >
              {allFormMembersSelected
                ? `Bỏ chọn tất cả (${formMembers.length})`
                : `Chọn tất cả (${formMembers.length})`}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded border border-gray-100 divide-y">
            {formMembers.map((m) => {
              const checked = memberIds.has(String(m.user_id));
              const mods = memberModulesFromUser(m.user || m);
              return (
                <label
                  key={m.user_id}
                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs ${checked ? 'bg-violet-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(m.user_id)}
                    className="rounded border-violet-300 text-violet-600"
                  />
                  <span className="truncate flex-1">{m.user?.full_name || m.user_id}</span>
                  <span className="inline-flex gap-0.5 shrink-0">
                    {mods.map((mod) => (
                      <span
                        key={mod}
                        className={`text-[9px] px-1 rounded font-semibold ${
                          mod === 'production' ? 'bg-teal-100 text-teal-700'
                            : mod === 'logistics' ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {assignmentModuleLabel(mod)}
                      </span>
                    ))}
                  </span>
                </label>
              );
            })}
            {!formMembers.length && (
              <p className="text-[11px] text-gray-400 text-center py-3">
                Không có NV khối {assignmentModuleLabel(formModule)}
                {formCompanyId ? ' đúng công ty' : ''} trên deal
              </p>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-violet-300 bg-white/70 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-violet-800 inline-flex items-center gap-1">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Ảnh minh họa công việc
                </p>
                <p className="text-[10px] text-violet-600/80 mt-0.5">
                  Thêm hình để người nhận biết việc cần làm (tối đa 20 ảnh).
                </p>
              </div>
              <button
                type="button"
                onClick={() => pendingImagesInputRef.current?.click()}
                className="h-8 px-2.5 text-[11px] font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 cursor-pointer inline-flex items-center gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm ảnh
              </button>
              <input
                ref={pendingImagesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPendingImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {pendingImages.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {pendingImages.map((img) => (
                  <div key={img.key} className="relative group aspect-square rounded-lg overflow-hidden border border-violet-100 bg-slate-50">
                    <img
                      src={img.previewUrl}
                      alt={img.file?.name || 'preview'}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      title="Xóa ảnh"
                      onClick={() => removePendingImage(img.key)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white inline-flex items-center justify-center opacity-90 hover:bg-red-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pendingImagesInputRef.current?.click()}
                className="w-full py-4 text-[11px] text-violet-600/80 hover:text-violet-800 hover:bg-violet-50/80 rounded-lg cursor-pointer"
              >
                Chưa có ảnh — bấm để chọn hình từ máy
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={resetForm}
              className="h-8 px-3 text-xs text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saving || formUploadBusy}
              onClick={submit}
              className="h-8 px-4 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
            >
              <Save size={12} />
              {formUploadBusy
                ? 'Đang tải ảnh…'
                : saving
                  ? 'Đang lưu…'
                  : (editingId ? 'Lưu' : `Giao cho ${memberIds.size || 0} NV`)}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-4">Đang tải…</p>
      ) : filteredAssignments.length === 0 ? (
        <p className="text-[11px] text-violet-700/70 text-center py-4 border border-dashed border-violet-100 rounded-xl leading-relaxed px-3">
          {moduleTab === 'all'
            ? 'Chưa có phân công cho thành viên deal này. Bấm «Thêm» để giao việc từ Không gian chung.'
            : (
              <>
                Chưa có phân công khối <strong>{assignmentModuleLabel(moduleTab)}</strong>
                {' '}(chưa có bản ghi Giao việc gắn module này trên deal).
                <br />
                Bấm <strong>Thêm · {assignmentModuleLabel(moduleTab)}</strong> để tạo — hoặc chuyển tab CRM/SX/Tất cả nếu việc đã giao ở khối khác.
              </>
            )}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filteredAssignments.map((a) => {
            const StIcon = ASSIGN_STATUS_ICON[a.status] || Circle;
            const col = columns.find((c) => String(c.id) === String(a.column_id));
            const assigneeNames = (a.assignees?.length
              ? a.assignees
              : (a.assignee ? [a.assignee] : [])
            ).map((u) => u.full_name).filter(Boolean).join(', ');
            const mod = String(a.assignment_module || '').toLowerCase();
            const srcType = String(a.task_source_type || '').toLowerCase();
            const srcLabel = taskSourceLabel(srcType);
            const errLabel = srcType === 'employee_error'
              ? errorModuleLabel(a.employee_error_module)
              : null;
            const cardAtts = filterFileAttachments(taskAttachments[a.id]);
            const cardImages = cardAtts.filter((att) => isImageAtt(att));
            const cardFiles = cardAtts.filter((att) => !isImageAtt(att));
            return (
              <div
                key={a.id}
                className="bg-white border border-violet-100 rounded-lg hover:border-violet-200 transition overflow-hidden"
              >
                <div className="flex items-start gap-2 p-2.5">
                <button
                  type="button"
                  onClick={() => cycleStatus(a)}
                  className="shrink-0 mt-0.5 cursor-pointer rounded-full p-0.5 hover:bg-violet-50"
                  title={
                    a.status === 'completed'
                      ? 'Đánh dấu chờ lại'
                      : a.status === 'pending'
                        ? 'Chuyển sang đang làm'
                        : 'Đánh dấu hoàn thành'
                  }
                >
                  <StIcon className={`h-4 w-4 ${
                    a.status === 'completed' ? 'text-emerald-500'
                      : a.status === 'in_progress' ? 'text-blue-500'
                        : 'text-gray-300'
                  }`} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <p className={`text-sm font-medium truncate ${a.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {a.title}
                    </p>
                    {(mod === 'crm' || mod === 'production' || mod === 'logistics') && (
                      <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        mod === 'production' ? 'bg-teal-100 text-teal-700'
                          : mod === 'logistics' ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}>
                        {assignmentModuleLabel(mod)}
                      </span>
                    )}
                    {srcLabel && (
                      <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        srcType === 'employee_error'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-sky-100 text-sky-700'
                      }`}>
                        {srcLabel}
                        {errLabel ? ` · ${errLabel}` : ''}
                      </span>
                    )}
                    {phatSinhKindLabel(a.phat_sinh_kind) && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-cyan-100 text-cyan-800">
                        {phatSinhKindLabel(a.phat_sinh_kind)}
                      </span>
                    )}
                    {a.executor_company_id && String(a.executor_company_id) !== String(companyId || '') && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-teal-100 text-teal-800">
                        → {a.executor_company?.short_name || a.executor_company?.name || 'Xưởng khác'}
                      </span>
                    )}
                    {a.crm_task_id && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-violet-100 text-violet-700">
                        Có CV
                      </span>
                    )}
                    {cardAtts.length > 0 && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-700 inline-flex items-center gap-0.5">
                        <Paperclip className="h-2.5 w-2.5" />
                        {cardAtts.length} file
                      </span>
                    )}
                    {!!(a.crm_task?.notes || '').trim() && expandedNotesId !== a.id && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium text-amber-700 bg-amber-50 flex items-center gap-0.5">
                        <MessageSquare className="h-2.5 w-2.5" />Có ghi chú
                      </span>
                    )}
                  </div>
                  {!!(a.crm_task?.notes || '').trim() && expandedNotesId !== a.id && (
                    <p className="text-[11px] text-amber-700/90 mt-0.5 line-clamp-1 italic">
                      💬 {String(a.crm_task.notes).slice(0, 80)}{String(a.crm_task.notes).length > 80 ? '…' : ''}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    {col && <span style={{ color: col.color }}>{col.name}</span>}
                    {assigneeNames && <span>👤 {assigneeNames}</span>}
                    {a.deadline && (
                      <span className="inline-flex items-center gap-0.5">
                        <Calendar size={10} />{formatDate(a.deadline)}
                      </span>
                    )}
                  </div>

                  {cardAtts.length > 0 && expandedNotesId !== a.id && (
                    <div className="mt-2 space-y-1.5">
                      {cardImages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {cardImages.slice(0, 6).map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              className="block h-14 w-14 rounded-md overflow-hidden border border-violet-100 bg-slate-50 hover:ring-2 hover:ring-violet-300 cursor-pointer p-0"
                              title={`${att.file_name || att.name || 'Ảnh'} — bấm phóng to`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAttachmentPreview(cardAtts, att);
                              }}
                            >
                              <img
                                src={publicFileUrl(att.file_url)}
                                alt={att.file_name || ''}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                          {cardImages.length > 6 && (
                            <button
                              type="button"
                              onClick={() => toggleNotes(a)}
                              className="h-14 w-14 rounded-md border border-dashed border-violet-200 text-[10px] text-violet-700 font-semibold hover:bg-violet-50 cursor-pointer"
                            >
                              +{cardImages.length - 6}
                            </button>
                          )}
                        </div>
                      )}
                      {cardFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cardFiles.slice(0, 4).map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              title="Xem trên trang"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAttachmentPreview(cardAtts, att);
                              }}
                              className="inline-flex items-center gap-1 max-w-[11rem] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 hover:border-violet-300 hover:text-violet-800 cursor-pointer"
                            >
                              <AttachmentFileIcon att={att} className="h-3 w-3 shrink-0" />
                              <span className="truncate">{att.name || att.file_name || 'File'}</span>
                            </button>
                          ))}
                          {cardFiles.length > 4 && (
                            <button
                              type="button"
                              onClick={() => toggleNotes(a)}
                              className="text-[10px] text-violet-700 font-semibold px-1.5 py-0.5 cursor-pointer hover:underline"
                            >
                              +{cardFiles.length - 4} file
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleNotes(a)}
                    className={`p-1.5 rounded-lg cursor-pointer ${
                      expandedNotesId === a.id
                        ? 'text-blue-600 bg-blue-50'
                        : a.crm_task_id
                          ? 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                          : 'text-gray-300 cursor-not-allowed'
                    }`}
                    title={a.crm_task_id ? 'Ghi chú & file' : 'Chưa liên kết nhiệm vụ'}
                    disabled={!a.crm_task_id}
                  >
                    <Paperclip size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg cursor-pointer"
                    title="Sửa"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    title="Xóa"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Link
                    to={assignmentBoardHref(a)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title={assignmentBoardTitle(a)}
                  >
                    <ExternalLink size={14} />
                  </Link>
                </div>
                </div>

                {expandedNotesId === a.id && a.crm_task_id && (() => {
                  const atts = filterFileAttachments(taskAttachments[a.id]);
                  const prog = uploadProgress[a.id];
                  return (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-2.5 pt-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">
                          📝 Ghi chú &amp; Đính kèm ({atts.length})
                        </label>
                        <div className="flex items-center gap-1">
                          {uploadingAssignId === a.id ? (
                            <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                              <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                              {prog ? `${prog.name} — ${prog.percent || 0}%` : 'Đang nén ảnh...'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => uploadTaskFile(a)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50"
                            >
                              <FileUp className="h-3 w-3" /> Upload file
                            </button>
                          )}
                        </div>
                      </div>

                      <textarea
                        value={noteDrafts[a.id] ?? a.crm_task?.notes ?? ''}
                        onChange={(e) => setNoteDrafts((p) => ({ ...p, [a.id]: e.target.value }))}
                        placeholder="Nhập ghi chú cho nhiệm vụ này..."
                        rows={2}
                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none mb-1.5"
                      />
                      <div className="flex justify-end mb-2">
                        <button
                          type="button"
                          onClick={() => saveNotes(a)}
                          disabled={savingNoteId === a.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                            savingNoteId === `saved-${a.id}`
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <Save className="h-2.5 w-2.5" />
                          {savingNoteId === a.id
                            ? 'Đang lưu...'
                            : savingNoteId === `saved-${a.id}`
                              ? '✓ Đã lưu'
                              : 'Lưu ghi chú'}
                        </button>
                      </div>

                      {prog && (
                        <UploadProgressBubble
                          variant="inline"
                          fileName={prog.name}
                          fileSize={prog.size}
                          percent={prog.percent}
                          bytesPerSec={prog.bytesPerSec}
                          remainingSec={prog.remainingSec}
                        />
                      )}

                      {atts.length > 0 ? (
                        <div className="space-y-1.5">
                          {atts.map((att) => {
                            const img = isImageAtt(att);
                            const video = isVideoAtt(att);
                            return (
                              <div key={att.id} className="py-1.5 px-2 rounded bg-white border">
                                <div className="flex items-start gap-2">
                                  <AttachmentFileIcon att={att} className="h-4 w-4 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">{att.name || att.file_name}</p>
                                    {att.file_url && !img && (
                                      <button
                                        type="button"
                                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                        onClick={() => openAttachmentPreview(atts, att)}
                                      >
                                        {att.file_name || 'Xem file'}
                                      </button>
                                    )}
                                    {att.creator?.full_name && (
                                      <span className="text-[9px] text-gray-400 ml-1">{att.creator.full_name}</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteTaskAttachment(a, att.id)}
                                    className="text-[10px] font-medium text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer shrink-0"
                                  >
                                    Xóa
                                  </button>
                                </div>
                                {att.file_url && img && (
                                  <button
                                    type="button"
                                    className="block mt-1.5 ml-5 p-0 cursor-pointer text-left"
                                    title="Phóng to ảnh"
                                    onClick={() => openAttachmentPreview(atts, att)}
                                  >
                                    <img
                                      src={publicFileUrl(att.file_url)}
                                      alt={att.file_name || ''}
                                      className="max-h-80 max-w-full rounded-lg border border-gray-200 object-contain hover:ring-2 hover:ring-violet-300"
                                    />
                                  </button>
                                )}
                                {att.file_url && video && (
                                  <div className="mt-1.5 ml-5">
                                    <video
                                      src={publicFileUrl(att.file_url)}
                                      controls
                                      preload="metadata"
                                      className="max-h-[26rem] max-w-full rounded-lg border border-gray-200 bg-black"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">Chưa có đính kèm</p>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {lightbox?.items?.length > 0 && (
        <UploadFileLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

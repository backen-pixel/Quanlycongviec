import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { fetchPipelineStagesById, filterSxPipelineStagesForWorkshopType, sortAndDedupePipelineStages } from '../lib/crmPipelineStages';
import { formatDateTime, formatVND } from '../lib/utils';
import { isoToDatetimeLocalValue, datetimeLocalValueToIso } from '../lib/datetimeLocal';
import {
  Plus, CheckCircle2, Circle, Clock, User, Eye, Trash2, ChevronDown, ChevronRight,
  Calendar, List, Users, Target, AlertTriangle, X, Save, ListChecks, ClipboardList,
  Paperclip, FileUp, MessageSquare, FileText, Image as ImageIcon, Share2, Lock, Film,
  FileSpreadsheet, Edit3, UserPlus, GripVertical, Globe,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ExcelQuotationImport from './ExcelQuotationImport';
import CrmArtifactShareModal from './CrmArtifactShareModal';
import { shareModuleLabels } from '../lib/documentShareScope';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import UploadFileLightbox, {
  collectUploadLightboxItems,
  findUploadLightboxIndex,
  isUploadImageFile,
} from './UploadFileLightbox';
import { formatEvidenceTypesList, formatEvidenceTypesShort, checklistItemRequiresEvidence } from '../lib/evidenceFileTypes';
import TaskQuickVerdictBar from './TaskQuickVerdictBar';
import EmployeePicker from './EmployeePicker';

// Checklist con của nhiệm vụ — chuẩn hoá về { id, title, description, done } (hỗ trợ dữ liệu cũ dạng chuỗi).
let _ckSeq = 0;
const genChecklistId = () => `ck_${Date.now().toString(36)}_${(_ckSeq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const normalizeChecklist = (arr) => (Array.isArray(arr) ? arr : []).map((c, i) => (
  typeof c === 'string'
    ? { id: `ckidx_${i}_${c.slice(0, 8)}`, title: c, description: '', notes: '', done: false, priority: 'medium', assignee_id: null, executor_company_id: null, completion_requires_file_or_note: false, required_evidence_file_types: [] }
    : {
        id: c?.id || `ckidx_${i}`,
        title: c?.title || c?.label || '',
        description: c?.description || '',
        notes: c?.notes || '',
        done: !!(c?.done ?? c?.is_completed),
        priority: c?.priority || 'medium',
        assignee_id: c?.assignee_id || c?.default_assignee_id || null,
        executor_company_id: c?.executor_company_id || null,
        completion_requires_file_or_note: !!c?.completion_requires_file_or_note,
        required_evidence_file_types: Array.isArray(c?.required_evidence_file_types) ? c.required_evidence_file_types : [],
      }
));
const ckStateKey = (taskId, ckId) => `${taskId}:${ckId}`;

/** Bọc hàng nhiệm vụ — kéo thả sắp xếp thứ tự (không gộp checklist). */
function SortableTaskWrapper({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging, isOver })}
    </div>
  );
}

const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
];
const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];
const SX_ORDER_STAGES = [
  { slug: 'sx_tiep_nhan', label: 'Tiếp nhận', icon: '1️⃣', color: '#2563EB' },
  { slug: 'sx_thiet_ke_ke_hoach', label: 'Thiết kế và lên kế hoạch', icon: '2️⃣', color: '#7C3AED' },
  { slug: 'sx_kiem_tra_cheo', label: 'Kiểm tra chéo', icon: '3️⃣', color: '#0EA5E9' },
  { slug: 'sx_vat_tu', label: 'Vật tư', icon: '4️⃣', color: '#D97706' },
  { slug: 'sx_san_xuat_thung', label: 'Sản xuất thùng', icon: '5️⃣', color: '#059669' },
  { slug: 'sx_san_xuat_alu', label: 'Sản xuất alu', icon: '6️⃣', color: '#0891B2' },
  { slug: 'sx_hoan_thien', label: 'Hoàn thiện', icon: '7️⃣', color: '#16A34A' },
  { slug: 'sx_dong_goi', label: 'Đóng gói', icon: '8️⃣', color: '#EA580C' },
  { slug: 'sx_giao_hang', label: 'Giao hàng', icon: '9️⃣', color: '#DC2626' },
];
const ALL_STAGES = [...LEAD_STAGES, ...DEAL_STAGES];

function normalizeSxStageText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function legacySxSlugFromStageName(nameRaw) {
  const t = normalizeSxStageText(nameRaw);
  if (!t) return null;
  if (t.includes('tiep nhan')) return 'sx_tiep_nhan';
  if (t.includes('thiet ke') || t.includes('len ke hoach')) return 'sx_thiet_ke_ke_hoach';
  if (t.includes('kiem tra cheo')) return 'sx_kiem_tra_cheo';
  if (t.includes('vat tu')) return 'sx_vat_tu';
  if (t.includes('san xuat thung')) return 'sx_san_xuat_thung';
  if (t.includes('san xuat alu')) return 'sx_san_xuat_alu';
  if (t.includes('hoan thien')) return 'sx_hoan_thien';
  if (t.includes('dong goi')) return 'sx_dong_goi';
  if (t.includes('giao hang')) return 'sx_giao_hang';
  return null;
}

function sxSlugForPipelineStage(stage) {
  if (!stage) return null;
  const bucket = String(stage.bucket_slug || '').trim();
  if (bucket) return `sx_${bucket}`;
  const legacy = legacySxSlugFromStageName(stage.name);
  if (legacy) return legacy;
  // Khớp slug sinh từ backend (projectOrderFulfillment / sxPipelineStageSlug)
  if (stage.id) return `sx_pl_${String(stage.id).slice(0, 8)}`;
  return null;
}

function buildLegacySxSlugToStageId(stages) {
  const map = new Map();
  for (const s of stages || []) {
    if (!s?.id) continue;
    const slug = sxSlugForPipelineStage(s);
    if (slug && !map.has(slug)) map.set(slug, s.id);
  }
  return map;
}

/** Gom task SX vào cột production_pipeline_stages.id (ưu tiên) — khớp pipeline đã setup. */
function resolveSxTaskProductionStageId(task, sxStages) {
  const stages = sxStages || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task?.production_pipeline_stage_id;
  // Đã gắn cột pipeline: không fallback slug sang phân loại khác (vd. đầu vào → data đầu ra).
  if (pid) return validIds.has(String(pid)) ? pid : null;

  const legacyMap = buildLegacySxSlugToStageId(stages);
  const slug = String(task?.stage_slug || '').trim();
  if (slug && legacyMap.has(slug)) return legacyMap.get(slug);
  // sx_pl_<8 ký tự đầu UUID> — slug do backend gán khi gen nhiệm vụ SX
  if (slug.startsWith('sx_pl_')) {
    const prefix = slug.slice(6);
    const hit = stages.find((s) => s?.id && String(s.id).startsWith(prefix));
    if (hit && validIds.has(String(hit.id))) return hit.id;
  }
  return null;
}

function sxTaskBelongsToPipeline(task, sxStages) {
  if (!task) return false;
  const isSx = String(task?.stage_slug || '').startsWith('sx_') || !!task?.production_pipeline_stage_id;
  if (!isSx) return false;
  return resolveSxTaskProductionStageId(task, sxStages) != null;
}

function isSxProductionTask(task) {
  if (!task) return false;
  return String(task?.stage_slug || '').startsWith('sx_') || !!task?.production_pipeline_stage_id;
}

const SX_ASSIGNMENTS_PATH = '/sx/assignments';

function assignmentNavForTask(task, isProductionScope = false, forceProduction = null) {
  const isProduction = forceProduction != null
    ? !!forceProduction
    : (
      isProductionScope
      || isSxProductionTask(task)
      || String(task?.crm_assignment_module || '').toLowerCase() === 'production'
    );
  const base = isProduction ? SX_ASSIGNMENTS_PATH : '/crm/assignments';
  return {
    isProduction,
    base,
    label: isProduction ? 'Giao việc Sản xuất' : 'Giao việc CRM',
    title: isProduction ? 'Mở trên trang Giao việc Sản xuất' : 'Mở trên trang Giao việc CRM',
    openUrl: (id) => `${base}?open=${id}`,
  };
}

/** Bộ mẫu thuộc pipeline + loại lead/deal đang xem. */
function filterTemplatesForPipeline(templates, pipelineStages, leadType) {
  const stageIds = new Set((pipelineStages || []).map((s) => String(s.id)));
  return (templates || []).filter((t) => {
    if (!t.pipeline_stage_id || !stageIds.has(String(t.pipeline_stage_id))) return false;
    const pt = String(t.pipeline_type || t.pipeline_stage?.pipeline_type || '').toLowerCase();
    if (!pt || pt === 'both') return true;
    const entity = leadType === 'deal' ? 'deal' : 'lead';
    return pt === entity;
  });
}

function templateItemTitleSet(tpl) {
  return new Set(
    (tpl?.items || [])
      .map((i) => String(i.title || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Suy ra bộ mẫu nguồn của task (theo pipeline_stage + tiêu đề). */
function inferTaskTemplate(task, stageTemplates) {
  const title = String(task?.title || '').trim().toLowerCase();
  if (!title || !stageTemplates?.length) return null;
  let best = null;
  let bestScore = 0;
  for (const tpl of stageTemplates) {
    const titles = templateItemTitleSet(tpl);
    if (!titles.has(title)) continue;
    const score = titles.size;
    if (score > bestScore) {
      best = tpl;
      bestScore = score;
    }
  }
  return best;
}

/** Gom task vào giai đoạn pipeline thật — không dùng bucket "Khác". */
function resolveTaskPipelineStageId(task, pipelineStages, leadCurrentStageId) {
  const stages = pipelineStages || [];
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task.pipeline_stage_id ? String(task.pipeline_stage_id) : null;
  if (pid && validIds.has(pid)) return task.pipeline_stage_id;

  const slug = String(task.stage_slug || '').trim().toLowerCase();
  if (slug && stages.length) {
    const byCanonical = stages.find(
      (s) => String(s.canonical_slug || '').toLowerCase() === slug,
    );
    if (byCanonical) return byCanonical.id;
    const bare = slug.replace(/^deal_/, '');
    const byBare = stages.find(
      (s) => String(s.canonical_slug || '').toLowerCase() === bare,
    );
    if (byBare) return byBare.id;
  }

  if (leadCurrentStageId && validIds.has(String(leadCurrentStageId))) {
    return leadCurrentStageId;
  }
  return stages[0]?.id || null;
}

const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: CheckCircle2 };

const LEAD_MEMBER_ROLES = [
  { value: 'responsible', label: 'Chịu trách nhiệm' },
  { value: 'member', label: 'Tham gia' },
  { value: 'supervisor', label: 'Giám sát' },
  { value: 'viewer', label: 'Xem' },
];
const LEAD_MEMBER_ROLE_LABEL = Object.fromEntries(LEAD_MEMBER_ROLES.map((r) => [r.value, r.label]));

function taskAssigneeList(task) {
  if (task?.assignees?.length) return task.assignees;
  return task?.assignee ? [task.assignee] : [];
}

function AssigneePickerBlock({
  count,
  pickList,
  selectedIds,
  onToggle,
  onSelectAll,
  /** inline = trong form sửa NV; modal = hộp gán riêng (rộng hơn) */
  layout = 'inline',
  showRolePicker = false,
  roleById = {},
  onRoleChange,
  defaultNewRole = 'member',
  onDefaultNewRoleChange,
}) {
  const [search, setSearch] = useState('');
  const isModal = layout === 'modal';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = pickList || [];
    if (!q) return list;
    return list.filter((u) => {
      const name = String(u.full_name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [pickList, search]);

  const memberRows = filtered.filter((u) => u.isLeadMember);
  const otherRows = filtered.filter((u) => !u.isLeadMember);
  const hasMembers = (pickList || []).some((u) => u.isLeadMember);

  const selectedNames = (pickList || [])
    .filter((u) => selectedIds.has(String(u.id)))
    .map((u) => u.full_name)
    .filter(Boolean);

  const rowTextClass = isModal ? 'text-sm' : 'text-xs';
  const rowPadClass = isModal ? 'px-3 py-3' : 'px-2.5 py-2.5';

  const renderRow = (u) => {
    const checked = selectedIds.has(String(u.id));
    const sid = String(u.id);
    const isNewMember = !u.isLeadMember;
    return (
      <div
        key={u.id}
        className={`flex flex-col ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
      >
        <label className={`flex items-center gap-2.5 ${rowPadClass} cursor-pointer ${rowTextClass}`}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(u.id)}
            className={`rounded border-indigo-300 text-indigo-600 ${isModal ? 'h-4 w-4' : ''}`}
          />
          <span className="truncate font-medium text-gray-800 flex-1 min-w-0">{u.full_name}</span>
          {u.isLeadMember ? (
            <span className={`shrink-0 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full ${isModal ? 'text-[10px]' : 'text-[9px]'}`}>
              {LEAD_MEMBER_ROLE_LABEL[u.memberRole] || 'Thành viên'}
            </span>
          ) : (
            <span className={`shrink-0 font-semibold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full ${isModal ? 'text-[10px]' : 'text-[9px]'}`}>
              + Mới
            </span>
          )}
        </label>
        {showRolePicker && checked && isNewMember && (
          <div className={`${isModal ? 'px-3 pb-3 pl-10' : 'px-2.5 pb-2.5 pl-8'}`}>
            <label className={`flex items-center gap-2 ${isModal ? 'text-xs' : 'text-[10px]'} text-slate-600`}>
              <span className="shrink-0 font-medium">Vai trò:</span>
              <select
                value={roleById[sid] || defaultNewRole}
                onChange={(e) => onRoleChange?.(u.id, e.target.value)}
                className={`flex-1 min-w-0 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300 ${isModal ? 'text-xs' : 'text-[10px]'}`}
                onClick={(e) => e.stopPropagation()}
              >
                {LEAD_MEMBER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`border border-indigo-200 bg-indigo-50/60 rounded-xl space-y-3 ${isModal ? 'p-4' : 'p-3'}`}>
      <div className="flex items-center justify-between gap-2">
        <label className={`font-semibold text-indigo-900 uppercase flex items-center gap-1.5 ${isModal ? 'text-xs' : 'text-[11px]'}`}>
          <UserPlus className={isModal ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> Gán nhân viên ({count})
        </label>
        <button
          type="button"
          onClick={onSelectAll}
          className={`rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 cursor-pointer ${isModal ? 'h-8 px-3 text-xs' : 'h-7 px-2.5 text-[10px]'}`}
        >
          Chọn tất cả
        </button>
      </div>
      {selectedNames.length > 0 && (
        <p className={`text-indigo-800 bg-white/70 rounded-lg px-2.5 py-2 border border-indigo-100 ${isModal ? 'text-xs' : 'text-[10px]'}`}>
          Đã chọn: {selectedNames.join(', ')}
        </p>
      )}
      <p className={isModal ? 'text-xs text-slate-600' : 'text-[10px] text-slate-600'}>
        {hasMembers
          ? 'Chọn thành viên hiện có hoặc NV mới — NV mới sẽ được thêm vào nhóm khi gán.'
          : 'Chọn nhân viên — sẽ tự thêm vào nhóm lead/deal và gán nhiệm vụ cùng lúc.'}
      </p>
      {showRolePicker && (
        <label className={`flex items-center gap-2 ${isModal ? 'text-xs' : 'text-[10px]'} text-slate-700`}>
          <span className="font-semibold shrink-0">Vai trò mặc định (NV mới):</span>
          <select
            value={defaultNewRole}
            onChange={(e) => onDefaultNewRoleChange?.(e.target.value)}
            className={`flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300 ${isModal ? 'text-xs' : 'text-[10px]'}`}
          >
            {LEAD_MEMBER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      )}
      {(isModal || (pickList?.length || 0) > 8) && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc email..."
          className={`w-full rounded-lg border border-indigo-100 bg-white outline-none focus:ring-2 focus:ring-indigo-300 ${isModal ? 'h-10 px-3 text-sm' : 'h-8 px-2.5 text-xs'}`}
        />
      )}
      <div className={`overflow-y-auto rounded-lg border border-indigo-100 bg-white ${isModal ? 'min-h-[200px] max-h-[min(340px,45vh)]' : 'max-h-52'}`}>
        {!filtered.length ? (
          <p className="text-[10px] text-gray-400 p-3 text-center">
            {search.trim() ? 'Không tìm thấy nhân viên phù hợp' : 'Chưa có nhân viên để gán'}
          </p>
        ) : (
          <>
            {memberRows.length > 0 && (
              <div>
                {hasMembers && otherRows.length > 0 && (
                  <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50/80 px-2.5 py-1 border-b border-emerald-100">
                    Thành viên lead/deal
                  </p>
                )}
                <div className="divide-y divide-gray-100">{memberRows.map(renderRow)}</div>
              </div>
            )}
            {otherRows.length > 0 && (
              <div>
                {hasMembers && (
                  <p className="text-[9px] font-bold uppercase tracking-wide text-sky-700 bg-sky-50/80 px-2.5 py-1 border-b border-sky-100">
                    Nhân viên khác (tự thêm vào nhóm)
                  </p>
                )}
                <div className="divide-y divide-gray-100">{otherRows.map(renderRow)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CRMTasksTab({
  leadId,
  leadType = 'lead',
  users = [],
  taskScope = 'all',
  /** own = chỉ NV công ty user; shared = chỉ nhiệm vụ giao chéo công ty */
  taskCompanyScope = 'own',
  onArtifactsSynced = null,
  onTaskSummaryChange = null,
  refreshKey = null,
  /** Công ty xưởng đã gắn với deal (sx_template_company_id) — gửi khi Gen bộ nhiệm vụ SX */
  sxTemplateCompanyId = null,
  /** Dự án gắn deal — ưu tiên hơn đọc từ GET /crm/leads/:id (đồng bộ ngày đặt/giao) */
  linkedProjectId: linkedProjectIdProp = null,
  /** Cột pipeline SX từ ProductionDetail (sxKanbanStages) — khớp stepper, tránh fallback 9 cột cứng */
  embeddedSxKanbanStages = null,
  embeddedWorkshopTypeId = null,
  /** Mở & cuộn tới nhiệm vụ từ liên kết Giao việc (?crm_task=) */
  focusTaskId = null,
}) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [tasks, setTasks] = useState([]);
  const isSxStageSlug = useMemo(() => (slug) => String(slug || '').startsWith('sx_'), []);
  const hasSxTasks = useMemo(() => tasks.some((t) => isSxStageSlug(t.stage_slug)), [tasks, isSxStageSlug]);
  const hasCrmDealTasks = useMemo(
    () => tasks.some((t) => !!t.stage_slug && !isSxStageSlug(t.stage_slug)),
    [tasks, isSxStageSlug],
  );

  /**
   * Deal có thể có 2 nhóm:
   * - CRM tasks: deal_* (bộ nhiệm vụ CRM)
   * - SX tasks: sx_* (bộ nhiệm vụ sản xuất)
   * UI cho phép chọn hiển thị nhóm nào (mặc định CRM).
   */
  const [dealTaskView, setDealTaskView] = useState(() => {
    try {
      const s = localStorage.getItem(`crm_deal_task_view:${leadId}`);
      return s === 'sx' ? 'sx' : 'crm';
    } catch {
      return 'crm';
    }
  });
  useEffect(() => {
    if (leadType !== 'deal') return;
    // Nếu điều hướng giữa nhiều deal trong cùng component instance, sync lại state theo leadId.
    try {
      const s = localStorage.getItem(`crm_deal_task_view:${leadId}`);
      setDealTaskView(s === 'sx' ? 'sx' : 'crm');
    } catch {
      setDealTaskView('crm');
    }
  }, [leadId, leadType]);
  useEffect(() => {
    if (leadType !== 'deal') return;
    try {
      localStorage.setItem(`crm_deal_task_view:${leadId}`, dealTaskView);
    } catch { /* ignore */ }
  }, [leadId, dealTaskView, leadType]);

  const isProductionScope = taskScope === 'production';
  const showSxTasksInUi = leadType === 'deal' && (isProductionScope || (hasSxTasks && dealTaskView === 'sx'));
  const showCrmTemplatesUi = !showSxTasksInUi && !isProductionScope;

  const [pipelineStages, setPipelineStages] = useState([]);
  const [sxPipelineStages, setSxPipelineStages] = useState([]);
  const [leadPipelineId, setLeadPipelineId] = useState(null);
  const [leadCurrentStageId, setLeadCurrentStageId] = useState(null);
  const [leadCompanyId, setLeadCompanyId] = useState(null);
  const [projectWorkshopTypeId, setProjectWorkshopTypeId] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  const companyLabelById = useCallback((id) => {
    if (!id) return '';
    const c = companies.find((x) => String(x.id) === String(id));
    return c?.short_name || c?.name || 'Công ty';
  }, [companies]);

  const isDelegatedSxTask = useCallback((task) => {
    const ownerId = sxTemplateCompanyId || leadCompanyId || null;
    const exec = task?.executor_company_id;
    if (exec) {
      if (!ownerId) return true;
      if (String(exec) !== String(ownerId)) return true;
    }
    const list = Array.isArray(task?.checklist) ? task.checklist : [];
    return list.some((ck) => {
      if (!ck || typeof ck !== 'object') return false;
      const ckExec = ck.executor_company_id || null;
      if (!ckExec) return false;
      if (!ownerId) return true;
      return String(ckExec) !== String(ownerId);
    });
  }, [leadCompanyId, sxTemplateCompanyId]);

  const ownerCompanyId = sxTemplateCompanyId || leadCompanyId || null;
  const isSharedWorkspace = taskCompanyScope === 'shared';

  const normalizeExecutorForSave = useCallback((execId) => {
    const v = execId ? String(execId) : null;
    if (!v) return null;
    if (leadCompanyId && String(v) === String(leadCompanyId)) return null;
    return v;
  }, [leadCompanyId]);

  const uiTasks = useMemo(() => {
    let list = tasks;
    if (leadType === 'deal') {
      if (showSxTasksInUi) {
        list = tasks.filter((t) => isSxStageSlug(t.stage_slug) || t.production_pipeline_stage_id);
        // Chỉ hiển thị nhiệm vụ thuộc pipeline phân loại hiện tại (vd. Data đầu ra — không lẫn Đầu vào).
        if (projectWorkshopTypeId && sxPipelineStages.length > 0) {
          list = list.filter((t) => sxTaskBelongsToPipeline(t, sxPipelineStages));
        }
      } else {
        list = tasks.filter((t) => !isSxStageSlug(t.stage_slug) && !t.production_pipeline_stage_id);
      }
    }
    if (taskCompanyScope === 'shared') {
      list = list.filter((t) => isDelegatedSxTask(t));
    }
    return list;
  }, [leadType, tasks, showSxTasksInUi, isSxStageSlug, projectWorkshopTypeId, sxPipelineStages, taskCompanyScope, isDelegatedSxTask]);

  const isTaskLevelCrossCompany = useCallback((task) => {
    const ownerId = ownerCompanyId;
    const exec = task?.executor_company_id;
    if (!exec) return false;
    if (!ownerId) return true;
    return String(exec) !== String(ownerId);
  }, [ownerCompanyId]);

  const isChecklistOnlyInShared = useCallback((task) => {
    if (task?.shared_view === 'checklist_only') return true;
    if (!isSharedWorkspace) return false;
    if (isTaskLevelCrossCompany(task)) return false;
    return normalizeChecklist(task?.checklist).some((ck) => {
      const ckExec = ck.executor_company_id || null;
      if (!ckExec) return false;
      if (!ownerCompanyId) return true;
      return String(ckExec) !== String(ownerCompanyId);
    });
  }, [isSharedWorkspace, isTaskLevelCrossCompany, ownerCompanyId]);

  const sharedWorkspaceGroups = useMemo(() => {
    if (!isSharedWorkspace) return null;
    const groups = new Map();
    const ensureGroup = (execId) => {
      const key = String(execId);
      if (!groups.has(key)) {
        groups.set(key, {
          execId: key,
          label: companyLabelById(key) || 'Công ty đối tác',
          fullTasks: [],
          checklistEntries: [],
        });
      }
      return groups.get(key);
    };
    for (const t of uiTasks) {
      if (isChecklistOnlyInShared(t)) {
        for (const ck of normalizeChecklist(t.checklist)) {
          const execId = ck.executor_company_id;
          if (!execId) continue;
          if (ownerCompanyId && String(execId) === String(ownerCompanyId)) continue;
          ensureGroup(execId).checklistEntries.push({ task: t, ck });
        }
      } else if (t.executor_company_id) {
        ensureGroup(t.executor_company_id).fullTasks.push(t);
      }
    }
    return [...groups.values()]
      .map((g) => {
        const total = g.fullTasks.length + g.checklistEntries.length;
        const completed = g.fullTasks.filter((x) => x.status === 'completed').length
          + g.checklistEntries.filter(({ ck }) => ck.done).length;
        return { ...g, total, completed };
      })
      .filter((g) => g.total > 0)
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [isSharedWorkspace, uiTasks, companyLabelById, isChecklistOnlyInShared, ownerCompanyId]);

  const sharedWorkspaceStats = useMemo(() => {
    if (!isSharedWorkspace || !sharedWorkspaceGroups) {
      return { total: uiTasks.length, completed: uiTasks.filter((t) => t.status === 'completed').length };
    }
    return sharedWorkspaceGroups.reduce(
      (acc, g) => ({ total: acc.total + g.total, completed: acc.completed + g.completed }),
      { total: 0, completed: 0 },
    );
  }, [isSharedWorkspace, sharedWorkspaceGroups, uiTasks]);

  useEffect(() => {
    if (!onTaskSummaryChange) return;
    const total = isSharedWorkspace ? sharedWorkspaceStats.total : uiTasks.length;
    const completed = isSharedWorkspace ? sharedWorkspaceStats.completed : uiTasks.filter((t) => t.status === 'completed').length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    onTaskSummaryChange({ total, completed, percent });
  }, [uiTasks, onTaskSummaryChange, isSharedWorkspace, sharedWorkspaceStats]);

  /** Lead/deal cũ: task không gắn pipeline hoặc gắn stage pipeline không còn hợp lệ */
  const isLegacyCrmTaskSet = useMemo(() => {
    const crm = tasks.filter((t) => !isSxStageSlug(t.stage_slug));
    if (!crm.length) return false;
    const validIds = new Set(pipelineStages.map((s) => String(s.id)));
    return crm.some((t) => {
      if (!t.pipeline_stage_id) return true;
      if (pipelineStages.length && !validIds.has(String(t.pipeline_stage_id))) return true;
      return false;
    });
  }, [tasks, isSxStageSlug, pipelineStages]);

  const isSxOrderTaskFlow = useMemo(() => {
    if (leadType !== 'deal') return false;
    return showSxTasksInUi;
  }, [leadType, showSxTasksInUi]);

  // ── Stages thật của lead/deal theo pipeline_id ──
  const isPipelineMode = pipelineStages.length > 0 && !isSxOrderTaskFlow;
  /** UI pipeline mới — chỉ lead/deal mới (không có task legacy) */
  const usePipelineTaskUi = isPipelineMode && !isLegacyCrmTaskSet;

  /** Map pipeline_stages → cấu trúc {slug, label, icon, color} để tận dụng lại UI cũ.
   *  Khi pipeline mode: dùng stage.id làm "slug" (key) để groupBy + xử lý add/save.
   */
  const pipelineStagesAsUiStages = useMemo(() => pipelineStages.map((s, i) => ({
    slug: s.id,                          // dùng UUID làm key
    label: s.name || 'Giai đoạn',
    icon: s.icon || '📌',
    color: s.color || '#3B82F6',
    isPipelineStage: true,
    pipelineStageId: s.id,
    order_index: s.order_index ?? i,
  })), [pipelineStages]);

  const sxPipelineStagesAsUiStages = useMemo(() => sortAndDedupePipelineStages(sxPipelineStages || [])
    .map((s, i) => ({
      slug: s.id,
      label: s.name || 'Giai đoạn',
      icon: s.icon || '📋',
      color: s.color || '#059669',
      isSxPipelineStage: true,
      order_index: s.order_index ?? i,
    })), [sxPipelineStages]);

  const useSxPipelineTaskUi = isSxOrderTaskFlow && sxPipelineStagesAsUiStages.length > 0;

  const STAGES = useMemo(() => {
    if (useSxPipelineTaskUi) return sxPipelineStagesAsUiStages;
    // Tab SX: luôn dùng pipeline thật — không fallback 9 cột cứng (1️⃣ Tiếp nhận / Thiết kế và lên kế hoạch…).
    if (isProductionScope && isSxOrderTaskFlow) return sxPipelineStagesAsUiStages;
    if (isSxOrderTaskFlow && projectWorkshopTypeId) return sxPipelineStagesAsUiStages;
    if (isSxOrderTaskFlow) return SX_ORDER_STAGES;
    if (usePipelineTaskUi) return pipelineStagesAsUiStages;
    if (isLegacyCrmTaskSet && pipelineStages.length) return pipelineStagesAsUiStages;
    return leadType === 'deal' ? DEAL_STAGES : LEAD_STAGES;
  }, [useSxPipelineTaskUi, sxPipelineStagesAsUiStages, isProductionScope, isSxOrderTaskFlow, projectWorkshopTypeId, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages.length, pipelineStagesAsUiStages, leadType]);
  const STAGE_OPTIONS = useMemo(() => {
    if (usePipelineTaskUi) return [...pipelineStagesAsUiStages, ...SX_ORDER_STAGES];
    return leadType === 'deal' ? [...DEAL_STAGES, ...SX_ORDER_STAGES] : LEAD_STAGES;
  }, [leadType, usePipelineTaskUi, pipelineStagesAsUiStages]);

  const [templates, setTemplates] = useState([]);

  const pipelineTemplates = useMemo(() => {
    if (!usePipelineTaskUi && !(isLegacyCrmTaskSet && pipelineStages.length)) {
      return (templates || []).filter((t) => {
        if (t.pipeline_stage_id) return false;
        const isDeal = t.stage_slug?.startsWith('deal_');
        return leadType === 'deal' ? isDeal : !isDeal;
      });
    }
    return filterTemplatesForPipeline(templates, pipelineStages, leadType);
  }, [templates, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages, leadType]);

  const defaultPipelineTemplates = useMemo(
    () => pipelineTemplates.filter((t) => t.is_default),
    [pipelineTemplates],
  );

  const templatePanelStages = useMemo(() => {
    if (usePipelineTaskUi || (isLegacyCrmTaskSet && pipelineStages.length)) return STAGES;
    return leadType === 'deal' ? DEAL_STAGES : LEAD_STAGES;
  }, [usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages.length, STAGES, leadType]);

  const [loading, setLoading] = useState(true);
  const [ensuringMissing, setEnsuringMissing] = useState(false);
  const [ensuringMissingSx, setEnsuringMissingSx] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // list, deadline, planner, calendar
  const [expandedStages, setExpandedStages] = useState({});
  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [showAdd, setShowAdd] = useState(null); // stage_slug
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editAssigneeIds, setEditAssigneeIds] = useState(new Set());
  const [assigneeRoleById, setAssigneeRoleById] = useState({});
  const [defaultNewMemberRole, setDefaultNewMemberRole] = useState('member');
  const [leadMembersForAssign, setLeadMembersForAssign] = useState([]);
  const [assigningTask, setAssigningTask] = useState(null);
  const [assignPopoverStyle, setAssignPopoverStyle] = useState({});
  const assignPopoverRef = useRef(null);
  const assignAnchorElRef = useRef(null);
  const [editPopoverStyle, setEditPopoverStyle] = useState({});
  const editPopoverRef = useRef(null);
  const editAnchorElRef = useRef(null);
  const [newChecklistText, setNewChecklistText] = useState({});
  const [lastAssignmentLink, setLastAssignmentLink] = useState(null);
  const [shareModal, setShareModal] = useState(null);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState(linkedProjectIdProp || null);
  const [linkedProjectLabel, setLinkedProjectLabel] = useState('');
  const [projectDates, setProjectDates] = useState({ order_date: '', delivery_date: '' });
  const [dateChecklist, setDateChecklist] = useState({ order_date: false, delivery_date: false });
  const [dateSavingKey, setDateSavingKey] = useState('');
  /** Task có thể thuộc deal con (fulfillment) khi deal gốc dùng đơn — API đính kèm/ghi chú cần đúng lead_id */
  const apiLeadIdForTaskId = (taskId) => {
    const t = tasks.find((x) => x.id === taskId);
    return (t?.lead_id && String(t.lead_id)) || leadId;
  };

  const notifyArtifactsSynced = (optTaskId) => {
    try {
      const lid = optTaskId ? apiLeadIdForTaskId(optTaskId) : leadId;
      onArtifactsSynced?.({ artifactLeadId: lid });
    } catch (_) { /* ignore */ }
  };

  const prevLeadIdForTasksRef = useRef(null);
  const loadTasksSeqRef = useRef(0);

  useEffect(() => {
    if (linkedProjectIdProp) setLinkedProjectId(linkedProjectIdProp);
  }, [linkedProjectIdProp]);

  useEffect(() => {
    if (embeddedWorkshopTypeId) setProjectWorkshopTypeId(String(embeddedWorkshopTypeId));
  }, [embeddedWorkshopTypeId]);

  useEffect(() => {
    if (!Array.isArray(embeddedSxKanbanStages) || !embeddedSxKanbanStages.length) return;
    const wkt = embeddedWorkshopTypeId ? String(embeddedWorkshopTypeId) : null;
    let stages = embeddedSxKanbanStages;
    if (wkt) stages = filterSxPipelineStagesForWorkshopType(stages, wkt);
    setSxPipelineStages(sortAndDedupePipelineStages(stages));
  }, [embeddedSxKanbanStages, embeddedWorkshopTypeId]);

  const applyProjectDateFields = (p) => {
    if (!p) return;
    const orderDate = p.order_date ? String(p.order_date).substring(0, 10) : '';
    const deliveryDate = (p.delivery_date || p.production_deadline)
      ? String(p.delivery_date || p.production_deadline).substring(0, 10)
      : '';
    setProjectDates({ order_date: orderDate, delivery_date: deliveryDate });
    setDateChecklist({ order_date: !!orderDate, delivery_date: !!deliveryDate });
    const label = [p.code, p.name || p.title].filter(Boolean).join(' — ');
    if (label) setLinkedProjectLabel(label);
    const wkt = p.workshop_type_id || p.workshop_type?.id || null;
    if (wkt) setProjectWorkshopTypeId(String(wkt));
  };

  const applySxKanbanStagesFromProject = (stages, wkt) => {
    if (!Array.isArray(stages) || !stages.length) return;
    let rows = stages;
    if (wkt) rows = filterSxPipelineStagesForWorkshopType(rows, wkt);
    setSxPipelineStages(sortAndDedupePipelineStages(rows));
  };

  const loadLinkedProjectDates = async (projectId, linkedProjectFallback = null) => {
    if (!projectId) {
      setLinkedProjectId(null);
      setLinkedProjectLabel('');
      setProjectDates({ order_date: '', delivery_date: '' });
      setDateChecklist({ order_date: false, delivery_date: false });
      setProjectWorkshopTypeId(null);
      return { workshopTypeId: null, sxKanbanStages: null };
    }
    setLinkedProjectId(projectId);
    const projectEndpoints = isProductionScope
      ? [`/production/projects/${projectId}`, `/projects/${projectId}`]
      : [`/projects/${projectId}`, `/production/projects/${projectId}`];
    for (const path of projectEndpoints) {
      try {
        const { data } = await api.get(path, { headers: { 'x-no-cache': '1' } });
        const p = data?.project || data;
        if (p?.id) {
          applyProjectDateFields(p);
          const wkt = p.workshop_type_id || p.workshop_type?.id || null;
          const kanban = Array.isArray(p.sxKanbanStages) && p.sxKanbanStages.length
            ? p.sxKanbanStages
            : null;
          if (kanban) applySxKanbanStagesFromProject(kanban, wkt);
          return { workshopTypeId: wkt, sxKanbanStages: kanban };
        }
      } catch (_) { /* thử endpoint kế */ }
    }
    if (linkedProjectFallback) {
      applyProjectDateFields(linkedProjectFallback);
      const wkt = linkedProjectFallback.workshop_type_id || linkedProjectFallback.workshop_type?.id || null;
      return { workshopTypeId: wkt, sxKanbanStages: null };
    }
    return { workshopTypeId: null, sxKanbanStages: null };
  };

  const loadTasks = async (opts = {}) => {
    const silent = !!opts.silent;
    const fetchScope = taskCompanyScope;
    const fetchId = ++loadTasksSeqRef.current;
    if (!silent) setLoading(true);
    try {
      const leadRes = await api.get(`/crm/leads/${leadId}`).catch(() => ({ data: null }));
      const linkedProject = leadRes?.data?.linked_project || null;
      const projectId = linkedProjectIdProp || leadRes?.data?.project_id || linkedProject?.id || null;
      let sxWkt = embeddedWorkshopTypeId
        || linkedProject?.workshop_type_id
        || linkedProject?.workshop_type?.id
        || null;
      const projCtx = await loadLinkedProjectDates(projectId, linkedProject);
      if (projCtx.workshopTypeId) sxWkt = projCtx.workshopTypeId;
      if (sxWkt) setProjectWorkshopTypeId(String(sxWkt));

      const taskParams = {
        task_scope: taskScope,
        task_company_scope: taskCompanyScope,
        ...(sxWkt ? { workshop_type_id: sxWkt } : {}),
        ...((sxTemplateCompanyId || leadRes?.data?.company_id)
          ? { owner_company_id: sxTemplateCompanyId || leadRes?.data?.company_id }
          : {}),
      };
      const tasksRes = await api.get(`/crm/leads/${leadId}/tasks`, { params: taskParams });

      // Lấy pipeline_id của lead → load pipeline_stages thật
      // Một số task đã được auto-gen với pipeline_stage_id thuộc pipeline khác (deal cũ
      // nhảy giữa pipeline) → suy ra pipeline_id từ task đầu tiên có pipeline_stage_id.
      setLeadCurrentStageId(leadRes?.data?.stage_id || null);
      setLeadCompanyId(leadRes?.data?.company_id || null);
      let pid = leadRes?.data?.pipeline_id || null;
      if (!pid) {
        const firstTaskWithStage = (tasksRes.data || []).find((t) => t.pipeline_stage_id);
        if (firstTaskWithStage?.pipeline_stage_id) {
          try {
            const r = await api.get('/crm/pipeline-stages', {
              params: { ensure_stage_id: firstTaskWithStage.pipeline_stage_id, all: 'true' },
            });
            const st = (r.data || []).find((x) => String(x.id) === String(firstTaskWithStage.pipeline_stage_id));
            if (st?.pipeline_id) pid = st.pipeline_id;
          } catch { /* ignore */ }
        }
      }
      setLeadPipelineId(pid);

      let stagesForLead = [];
      if (pid) {
        try {
          const { stages } = await fetchPipelineStagesById(pid);
          stagesForLead = stages.filter((s) => {
            if (!s.pipeline_type) return true;
            if (s.pipeline_type === 'both') return true;
            return s.pipeline_type === (leadType === 'deal' ? 'deal' : 'lead');
          });
          setPipelineStages(stagesForLead);
        } catch {
          setPipelineStages([]);
        }
      } else {
        setPipelineStages([]);
      }

      const sxCompanyId = sxTemplateCompanyId
        || leadRes?.data?.sx_template_company_id
        || leadRes?.data?.company_id
        || null;
      const hasEmbeddedStages = (
        (Array.isArray(embeddedSxKanbanStages) && embeddedSxKanbanStages.length > 0)
        || (Array.isArray(projCtx.sxKanbanStages) && projCtx.sxKanbanStages.length > 0)
      );
      if (!hasEmbeddedStages && sxCompanyId) {
        try {
          const sxParams = { company_id: sxCompanyId };
          if (sxWkt) sxParams.workshop_type_id = sxWkt;
          const { data: sxStages } = await api.get('/production/pipeline-stages', {
            params: sxParams,
            headers: { 'x-no-cache': '1' },
          });
          let raw = Array.isArray(sxStages) ? sxStages : [];
          if (sxWkt) raw = filterSxPipelineStagesForWorkshopType(raw, sxWkt);
          setSxPipelineStages(sortAndDedupePipelineStages(raw));
        } catch {
          if (!embeddedSxKanbanStages?.length) setSxPipelineStages([]);
        }
      } else if (!hasEmbeddedStages) {
        setSxPipelineStages([]);
      }

      if (!isProductionScope) {
        const tplParams = pid ? { pipeline_id: pid, scope: 'pipeline' } : {};
        try {
          const tplRes = await api.get('/crm/task-templates', { params: tplParams });
          setTemplates(tplRes.data || []);
        } catch {
          setTemplates([]);
        }
      } else {
        setTemplates([]);
      }

      const displayTasks = (tasksRes.data || []).map((t) => (
        fetchScope === 'shared' ? t : { ...t, shared_view: undefined }
      ));
      if (fetchId !== loadTasksSeqRef.current || fetchScope !== taskCompanyScope) return;
      setTasks(displayTasks);

      // Auto-expand stages that have tasks
      const stagesExp = {};
      displayTasks.forEach((t) => {
        const k = t.production_pipeline_stage_id || t.pipeline_stage_id || t.stage_slug;
        if (k) stagesExp[k] = true;
      });
      setExpandedStages(stagesExp);
    } catch (e) { console.error(e); }
    finally {
      if (fetchId === loadTasksSeqRef.current && fetchScope === taskCompanyScope) {
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    const first = prevLeadIdForTasksRef.current === null;
    const leadSwitched = !first && prevLeadIdForTasksRef.current !== leadId;
    prevLeadIdForTasksRef.current = leadId;
    const silent = !first && !leadSwitched && refreshKey > 0;
    loadTasks({ silent });
  }, [leadId, taskScope, taskCompanyScope, isProductionScope, refreshKey, sxTemplateCompanyId]);

  /** Realtime: web ↔ mobile — refetch khi nhiệm vụ CRM thay đổi qua socket */
  const loadTasksRef = useRef(loadTasks);
  loadTasksRef.current = loadTasks;
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket || !leadId) return undefined;
    let timer = null;
    const onTaskChanged = (payload) => {
      if (String(payload?.lead_id) !== String(leadId)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadTasksRef.current?.({ silent: true }), 650);
    };
    socket.on('crm:task_changed', onTaskChanged);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('crm:task_changed', onTaskChanged);
    };
  }, [leadId]);

  const addTask = async (stageKey) => {
    if (!newTask.title.trim()) return;
    try {
      // Pipeline mode: stageKey = pipeline_stage_id (UUID).
      // Non-pipeline: stageKey = stage_slug (string).
      const stageMeta = usePipelineTaskUi ? STAGES.find((s) => s.slug === stageKey) : null;
      const payload = {
        ...newTask,
        deadline: newTask.deadline ? datetimeLocalValueToIso(newTask.deadline) : null,
        ...(usePipelineTaskUi
          ? {
              pipeline_stage_id: stageKey,
              stage_slug: stageMeta?.label || null, // gửi tên stage để hiển thị (không bắt buộc)
              order_index: tasks.filter((t) => t.pipeline_stage_id === stageKey).length,
            }
          : {
              stage_slug: stageKey,
              order_index: tasks.filter((t) => t.stage_slug === stageKey).length,
            }),
      };
      const { data } = await api.post(`/crm/leads/${leadId}/tasks`, payload);
      setNewTask({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
      setShowAdd(null);
      if (data?.id) {
        setTasks((prev) => [...prev, data]);
        const expKey = data.pipeline_stage_id || data.stage_slug;
        if (expKey) setExpandedStages((s) => ({ ...s, [expKey]: true }));
      } else loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks/from-template`, { template_id: templateId });
      alert(`Đã tạo ${data.count} công việc từ bộ mẫu`);
      const created = data.tasks || [];
      if (created.length) {
        setTasks((prev) => [...prev, ...created]);
        const stages = {};
        created.forEach((t) => {
          const k = t.pipeline_stage_id || t.stage_slug;
          if (k) stages[k] = true;
        });
        setExpandedStages((s) => ({ ...s, ...stages }));
      } else loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  /** Quét & bổ sung nhiệm vụ CRM thiếu theo bộ mẫu pipeline (không xóa task cũ). */
  const ensureMissingPipelineTasks = async () => {
    if (ensuringMissing) return;

    setEnsuringMissing(true);
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks/ensure-missing`, { all_stages: true });
      if ((data.created || 0) > 0) {
        alert(`Đã bổ sung ${data.created} nhiệm vụ CRM thiếu theo bộ mẫu ${data.entity_type === 'deal' ? 'Deal' : 'Lead'}.`);
      } else if (data.error) {
        alert(data.error);
      } else {
        alert(
          `Đã quét pipeline ${data.entity_type === 'deal' ? 'Deal' : 'Lead'}`
          + `${data.company_id ? ' (đúng công ty lead/deal)' : ''}`
          + ' — không thiếu nhiệm vụ nào (hoặc cột chưa có bộ mẫu mặc định).',
        );
      }
      await loadTasks();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi quét nhiệm vụ thiếu');
    } finally {
      setEnsuringMissing(false);
    }
  };

  /** Quét & bổ sung nhiệm vụ SX (sx_*) thiếu theo bộ mẫu xưởng (không xóa task cũ). */
  const ensureMissingSxTasks = async () => {
    if (ensuringMissingSx || leadType !== 'deal') return;

    setEnsuringMissingSx(true);
    try {
      const payload = { all_stages: true };
      const prodCo = sxTemplateCompanyId || ownerCompanyId || null;
      if (prodCo) payload.production_company_id = prodCo;
      const { data } = await api.post(`/crm/leads/${encodeURIComponent(leadId)}/tasks/ensure-missing-sx`, payload);
      const stageCreated = (data.stages || [])
        .filter((s) => s.scope === 'pipeline_column' && (s.created || 0) > 0)
        .reduce((n, s) => n + (s.created || 0), 0);
      if ((data.created || 0) > 0) {
        const detail = stageCreated > 0 && stageCreated !== data.created
          ? ` (${data.created - stageCreated} từ bộ mặc định, ${stageCreated} từ cột pipeline)`
          : '';
        alert(`Đã bổ sung ${data.created} nhiệm vụ Sản xuất thiếu theo bộ mẫu xưởng${detail}.`);
      } else if ((data.backfill_updated || 0) > 0) {
        alert(`Đã gắn lại ${data.backfill_updated} nhiệm vụ SX vào cột pipeline (task cũ bị ẩn do chưa gắn cột).`);
      } else if (data.error) {
        alert(data.error);
      } else if (data.reason === 'no_default_bundle_for_workshop_type' || data.reason === 'no_default_bundle') {
        alert(
          'Chưa có bộ mẫu Sản xuất cho phân loại này.\n\n'
          + 'Vào SX → Bộ mẫu nhiệm vụ: chọn Công ty + Phân loại → tạo/bật bộ mẫu (hoặc «Đặt bộ mặc định deal SX»).',
        );
      } else {
        const colHints = (data.stages || [])
          .filter((s) => s.scope === 'pipeline_column' && s.reason === 'no_templates_for_stage')
          .length;
        alert(
          colHints > 0
            ? `Đã quét ${colHints} cột pipeline — không thiếu nhiệm vụ (hoặc cột chưa gắn bộ mẫu).`
            : 'Đã quét — không thiếu nhiệm vụ Sản xuất nào (hoặc cột chưa có bộ mẫu).',
        );
      }
      await loadTasks();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi quét nhiệm vụ SX thiếu');
    } finally {
      setEnsuringMissingSx(false);
    }
  };

  const needsPartialChecklistSave = useCallback((task) => (
    isSharedWorkspace && (task?.shared_view === 'checklist_only' || isChecklistOnlyInShared(task))
  ), [isSharedWorkspace, isChecklistOnlyInShared]);

  const mergeChecklistIntoTaskState = (task, serverTask, sentUpdates) => {
    if (!isSharedWorkspace || !sentUpdates?.checklist_partial || !serverTask?.checklist) {
      return { ...task, ...serverTask };
    }
    const local = normalizeChecklist(task.checklist);
    const remote = normalizeChecklist(serverTask.checklist);
    const nextChecklist = local.map((c) => {
      const u = remote.find((r) => String(r.id) === String(c.id));
      return u ? { ...c, ...u } : c;
    });
    const {
      checklist: _c,
      title: _t,
      description: _d,
      notes: _n,
      shared_view: _s,
      ...safe
    } = serverTask;
    return {
      ...task,
      ...safe,
      checklist: nextChecklist,
      shared_view: task.shared_view,
      title: task.title ?? serverTask.title,
      description: task.description ?? serverTask.description,
      notes: task.notes ?? serverTask.notes,
    };
  };

  const updateTask = async (taskId, updates) => {
    const prevTasks = tasks;
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const { data } = await api.put(`/crm/leads/${lid}/tasks/${taskId}`, updates);
      setTasks((p) => p.map((t) => (t.id === taskId ? mergeChecklistIntoTaskState(t, data, updates) : t)));
    } catch (e) {
      setTasks(prevTasks);
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const saveTaskChecklist = async (task, nextFullList, changedId = null) => {
    if (needsPartialChecklistSave(task)) {
      const changed = changedId
        ? nextFullList.find((c) => c.id === changedId)
        : nextFullList[nextFullList.length - 1];
      if (!changed) return;
      await updateTask(task.id, { checklist: [changed], checklist_partial: true });
      return;
    }
    await updateTask(task.id, { checklist: nextFullList });
  };

  // ─── Checklist con của nhiệm vụ (lưu JSONB crm_tasks.checklist) ───
  const addChecklistItem = (task, title) => {
    const t = (title || '').trim();
    if (!t) return;
    const list = [...normalizeChecklist(task.checklist), {
      id: genChecklistId(),
      title: t,
      description: '',
      notes: '',
      done: false,
      priority: 'medium',
      assignee_id: null,
    }];
    updateTask(task.id, { checklist: list });
  };
  const toggleChecklistItem = async (task, ckId) => {
    const ck = normalizeChecklist(task.checklist).find((c) => c.id === ckId);
    if (!ck) return;
    const markingDone = !ck.done;
    if (markingDone && checklistItemRequiresEvidence(ck)) {
      if (!taskAttachments[task.id]) await loadAttachments(task);
      setExpandedChecklistKey(ckStateKey(task.id, ckId));
      if (expandedTask !== task.id) {
        setExpandedTask(task.id);
        setTaskNoteText((prev) => ({ ...prev, [task.id]: task.notes || '' }));
      }
    }
    const list = normalizeChecklist(task.checklist).map((c) => (c.id === ckId ? { ...c, done: !c.done } : c));
    await saveTaskChecklist(task, list, ckId);
  };
  const editChecklistItem = (task, ckId, patch) => {
    const list = normalizeChecklist(task.checklist).map((c) => (c.id === ckId ? { ...c, ...patch } : c));
    saveTaskChecklist(task, list, ckId);
  };

  const resolveChecklistAssignCompanyId = (task, ck) => (
    ck?.executor_company_id
    || task?.executor_company_id
    || sxTemplateCompanyId
    || leadCompanyId
    || null
  );

  const assignChecklistExecutorCompany = async (task, ckId, companyId) => {
    const cid = normalizeExecutorForSave(companyId);
    const list = normalizeChecklist(task.checklist).map((c) => (
      c.id === ckId ? { ...c, executor_company_id: cid } : c
    ));
    await saveTaskChecklist(task, list, ckId);
  };

  const assignChecklistItem = async (task, ckId, assigneeId) => {
    const uid = assigneeId ? String(assigneeId) : null;
    if (uid) {
      try {
        await ensureLeadMembersBeforeAssign(apiLeadIdForTaskId(task.id), [uid]);
      } catch {
        /* vẫn lưu gán trên checklist */
      }
    }
    const list = normalizeChecklist(task.checklist).map((c) => (
      c.id === ckId ? { ...c, assignee_id: uid } : c
    ));
    await saveTaskChecklist(task, list, ckId);
  };
  const removeChecklistItem = (task, ckId) => {
    const list = normalizeChecklist(task.checklist).filter((c) => c.id !== ckId);
    updateTask(task.id, { checklist: list });
  };

  const restoreChecklistFromTemplate = async (task) => {
    if (!window.confirm(
      'Khôi phục checklist từ bộ mẫu xưởng?\nGiữ trạng thái hoàn thành / ghi chú các mục trùng tên.',
    )) return;
    try {
      const owner = sxTemplateCompanyId || leadCompanyId || null;
      const { data } = await api.post(
        `/crm/leads/${apiLeadIdForTaskId(task.id)}/tasks/${task.id}/restore-checklist`,
        {},
        { params: owner ? { owner_company_id: owner } : {} },
      );
      const restored = data?.task;
      if (restored) {
        setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, ...restored } : t)));
      } else {
        await loadTasks({ silent: true });
      }
      alert(`Đã khôi phục ${data?.restored_count || 0} mục checklist`);
    } catch (e) {
      alert(e.response?.data?.error || 'Không khôi phục được checklist');
    }
  };

  const taskDnDSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const taskDnDIds = useMemo(() => uiTasks.map((t) => t.id), [uiTasks]);

  const toReminderIso = (dateOnly) => {
    if (!dateOnly) return null;
    const ts = new Date(`${dateOnly}T09:00:00`);
    return Number.isNaN(ts.getTime()) ? null : ts.toISOString();
  };

  const saveProjectDateFromChecklist = async (fieldKey) => {
    if (!linkedProjectId) {
      alert('Deal chưa gắn dự án để lưu ngày đặt/giao.');
      return;
    }
    setDateSavingKey(fieldKey);
    try {
      const checked = !!dateChecklist[fieldKey];
      const dateValue = checked ? (projectDates[fieldKey] || null) : null;
      const patch = { [fieldKey]: dateValue };
      if (fieldKey === 'delivery_date') patch.production_deadline = dateValue;
      await api.put(`/projects/${linkedProjectId}`, patch);

      // Đồng bộ nhắc việc vào nhóm nhiệm vụ giao hàng (sx_giao_hang).
      if (fieldKey === 'delivery_date') {
        const reminderDeadline = toReminderIso(dateValue);
        const deliveryTasks = tasks.filter((t) => t.stage_slug === 'sx_giao_hang' && t.status !== 'completed');
        await Promise.all(
          deliveryTasks.map((t) => api.put(`/crm/leads/${apiLeadIdForTaskId(t.id)}/tasks/${t.id}`, { deadline: reminderDeadline })),
        );
      }

      try {
        onArtifactsSynced?.({ artifactLeadId: leadId, projectDatesUpdated: true, projectId: linkedProjectId });
      } catch (_) { /* ignore */ }
      await loadLinkedProjectDates(linkedProjectId);
      await loadTasks({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu ngày đặt/giao');
    } finally {
      setDateSavingKey('');
    }
  };

  const toggleStatus = (task) => {
    const next = task.status === 'completed' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'completed';
    updateTask(task.id, { status: next });
  };

  const completeTasksBulk = async (taskList, confirmMessage) => {
    const toComplete = taskList.filter((t) => t.status !== 'completed');
    if (!toComplete.length) return;
    if (!window.confirm(confirmMessage)) return;
    const prevTasks = tasks;
    const ids = new Set(toComplete.map((t) => t.id));
    setBulkCompleting(true);
    setTasks((p) => p.map((t) => (ids.has(t.id) ? { ...t, status: 'completed' } : t)));
    try {
      await Promise.all(
        toComplete.map((t) => {
          const lid = apiLeadIdForTaskId(t.id);
          return api.put(`/crm/leads/${lid}/tasks/${t.id}`, { status: 'completed' });
        }),
      );
    } catch (e) {
      setTasks(prevTasks);
      alert(e.response?.data?.error || 'Lỗi khi đánh dấu hoàn thành hàng loạt');
    } finally {
      setBulkCompleting(false);
      try {
        await loadTasks({ silent: true });
      } catch (_) { /* ignore */ }
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa công việc này?')) return;
    const prevTasks = tasks;
    setTasks((p) => p.filter((t) => t.id !== taskId));
    try {
      await api.delete(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}`);
    } catch (e) {
      setTasks(prevTasks);
      alert('Lỗi');
    }
  };

  const assignPickList = useMemo(() => {
    const memberIdSet = new Set(
      leadMembersForAssign.map((m) => String(m.user_id)).filter(Boolean),
    );
    const memberUsers = leadMembersForAssign
      .map((m) => m.user)
      .filter((u) => u?.id)
      .map((u) => ({
        ...u,
        isLeadMember: true,
        memberRole: leadMembersForAssign.find((m) => String(m.user_id) === String(u.id))?.role || 'member',
      }));
    const extraUsers = (users || [])
      .filter((u) => u?.id && !memberIdSet.has(String(u.id)))
      .map((u) => ({ ...u, isLeadMember: false }));
    return [...memberUsers, ...extraUsers];
  }, [leadMembersForAssign, users]);

  const ensureLeadMembersBeforeAssign = async (lid, assigneeIds, roleMap = {}, fallbackRole = 'member') => {
    const existing = new Set(leadMembersForAssign.map((m) => String(m.user_id)));
    const toAdd = [...assigneeIds].map(String).filter((id) => id && !existing.has(id));
    if (!toAdd.length) return;
    const { data } = await api.post(`/crm/leads/${lid}/members`, {
      members: toAdd.map((user_id) => ({
        user_id,
        role: roleMap[String(user_id)] || fallbackRole || 'member',
      })),
    });
    const addedRows = Array.isArray(data) ? data : data ? [data] : [];
    if (addedRows.length) {
      setLeadMembersForAssign((prev) => {
        const seen = new Set(prev.map((m) => String(m.user_id)));
        const merged = [...prev];
        for (const row of addedRows) {
          const uid = row?.user_id || row?.user?.id;
          if (uid && !seen.has(String(uid))) {
            seen.add(String(uid));
            merged.push(row);
          }
        }
        return merged;
      });
    }
  };

  const loadLeadMembersForAssign = async (task) => {
    try {
      const r = await api.get(`/crm/leads/${apiLeadIdForTaskId(task.id)}/members`);
      setLeadMembersForAssign(r.data || []);
    } catch {
      setLeadMembersForAssign([]);
    }
  };

  const primeAssigneeSelection = (task) => {
    const ids = taskAssigneeList(task).map((u) => String(u.id));
    setEditAssigneeIds(new Set(ids));
  };

  const closeAssignPopover = () => {
    setAssigningTask(null);
    assignAnchorElRef.current = null;
    setAssignPopoverStyle({});
    setAssigneeRoleById({});
    setDefaultNewMemberRole('member');
  };

  const updateAssignPopoverPosition = useCallback(() => {
    const rect = assignAnchorElRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    const pad = 8;
    const gap = 6;
    const popoverWidth = Math.min(560, window.innerWidth - pad * 2);
    let maxHeight = Math.min(520, window.innerHeight - pad * 2);

    let left = rect.right - popoverWidth;
    if (left < pad) left = Math.max(pad, rect.left);
    left = Math.min(left, window.innerWidth - popoverWidth - pad);

    let top = rect.bottom + gap;
    if (top + maxHeight > window.innerHeight - pad) {
      const aboveTop = rect.top - gap - maxHeight;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        top = pad;
        maxHeight = window.innerHeight - pad * 2;
      }
    }

    setAssignPopoverStyle({
      position: 'fixed',
      top,
      left,
      width: popoverWidth,
      maxHeight,
      zIndex: 10050,
    });
  }, []);

  useLayoutEffect(() => {
    if (!assigningTask) return;
    updateAssignPopoverPosition();
  }, [assigningTask, assignPickList.length, updateAssignPopoverPosition]);

  useEffect(() => {
    if (!assigningTask) return;
    const onReflow = () => updateAssignPopoverPosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [assigningTask, updateAssignPopoverPosition]);

  const openAssignModal = async (task, anchorEl) => {
    assignAnchorElRef.current = anchorEl || null;
    setAssigneeRoleById({});
    setDefaultNewMemberRole('member');
    setAssigningTask(task);
    primeAssigneeSelection(task);
    await loadLeadMembersForAssign(task);
    requestAnimationFrame(() => updateAssignPopoverPosition());
  };

  const updateEditPopoverPosition = useCallback(() => {
    const rect = editAnchorElRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    const pad = 8;
    const gap = 6;
    const popoverWidth = Math.min(760, window.innerWidth - pad * 2);
    let maxHeight = Math.min(640, window.innerHeight - pad * 2);

    let left = rect.right - popoverWidth;
    if (left < pad) left = Math.max(pad, rect.left);
    left = Math.min(left, window.innerWidth - popoverWidth - pad);

    let top = rect.bottom + gap;
    if (top + maxHeight > window.innerHeight - pad) {
      const aboveTop = rect.top - gap - maxHeight;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        top = pad;
        maxHeight = window.innerHeight - pad * 2;
      }
    }

    setEditPopoverStyle({
      position: 'fixed',
      top,
      left,
      width: popoverWidth,
      maxHeight,
      zIndex: 10050,
    });
  }, []);

  useLayoutEffect(() => {
    if (!editingTask) return;
    updateEditPopoverPosition();
  }, [editingTask, assignPickList.length, updateEditPopoverPosition]);

  useEffect(() => {
    if (!editingTask) return;
    const onReflow = () => updateEditPopoverPosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [editingTask, updateEditPopoverPosition]);

  const closeEditModal = () => {
    setEditingTask(null);
    editAnchorElRef.current = null;
    setEditPopoverStyle({});
  };

  const openEditModal = async (task, anchorEl) => {
    editAnchorElRef.current = anchorEl || null;
    setEditingTask(task);
    setAssigneeRoleById({});
    setDefaultNewMemberRole('member');
    primeAssigneeSelection(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      deadline: task.deadline ? isoToDatetimeLocalValue(task.deadline) : '',
      supervisor_id: task.supervisor_id || '',
      stage_slug: task.stage_slug || '',
      show_excel_quotation_upload: !!task.show_excel_quotation_upload,
      requires_quick_verdict: !!task.requires_quick_verdict,
      executor_company_id: task.executor_company_id || '',
    });
    requestAnimationFrame(() => updateEditPopoverPosition());
    await loadLeadMembersForAssign(task);
  };

  const toggleEditAssignee = (userId) => {
    const sid = String(userId);
    const pick = assignPickList.find((u) => String(u.id) === sid);
    const wasSelected = editAssigneeIds.has(sid);
    setEditAssigneeIds((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(sid);
      else next.add(sid);
      return next;
    });
    if (wasSelected) {
      setAssigneeRoleById((roles) => {
        const copy = { ...roles };
        delete copy[sid];
        return copy;
      });
    } else if (pick && !pick.isLeadMember) {
      setAssigneeRoleById((roles) => ({ ...roles, [sid]: defaultNewMemberRole }));
    }
  };

  const setAssigneeRole = (userId, role) => {
    setAssigneeRoleById((prev) => ({ ...prev, [String(userId)]: role }));
  };

  const selectAllEditAssignees = () => {
    const allIds = assignPickList.map((u) => String(u.id));
    setEditAssigneeIds(new Set(allIds));
    setAssigneeRoleById((prev) => {
      const next = { ...prev };
      for (const u of assignPickList) {
        if (!u.isLeadMember) next[String(u.id)] = next[String(u.id)] || defaultNewMemberRole;
      }
      return next;
    });
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) return alert('Nhập tên nhiệm vụ');
    const taskId = editingTask.id;
    try {
      const lid = apiLeadIdForTaskId(taskId);
      await ensureLeadMembersBeforeAssign(lid, editAssigneeIds, assigneeRoleById, defaultNewMemberRole);
      const payload = {
        title: editForm.title,
        description: editForm.description,
        priority: editForm.priority,
        deadline: editForm.deadline ? datetimeLocalValueToIso(editForm.deadline) : null,
        assignee_ids: [...editAssigneeIds],
        supervisor_id: editForm.supervisor_id || null,
        stage_slug: editForm.stage_slug,
        show_excel_quotation_upload: !!editForm.show_excel_quotation_upload,
        requires_quick_verdict: !!editForm.requires_quick_verdict,
      };
      if (showSxTasksInUi || isProductionScope) {
        payload.executor_company_id = normalizeExecutorForSave(editForm.executor_company_id);
      }
      await api.put(`/crm/leads/${lid}/tasks/${taskId}`, payload);
      setEditingTask(null);
      await loadTasks({ silent: true });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
  };

  const saveAssign = async () => {
    if (!assigningTask) return;
    if (!editAssigneeIds.size) return alert('Chọn ít nhất một nhân viên');
    const taskId = assigningTask.id;
    try {
      const lid = apiLeadIdForTaskId(taskId);
      await ensureLeadMembersBeforeAssign(lid, editAssigneeIds, assigneeRoleById, defaultNewMemberRole);
      const { data } = await api.put(`/crm/leads/${lid}/tasks/${taskId}`, {
        assignee_ids: [...editAssigneeIds],
      });
      closeAssignPopover();
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
      if (data?.crm_assignment_id) {
        setLastAssignmentLink({
          taskId,
          assignmentId: data.crm_assignment_id,
          title: data.title || assigningTask.title,
          isProduction: isProductionScope || showSxTasksInUi || isSxProductionTask(assigningTask),
        });
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gán nhân viên');
    }
  };

  const openShareModal = (taskId, attachmentId = null) => {
    const task = tasks.find((t) => t.id === taskId);
    const att = attachmentId
      ? (taskAttachments[taskId] || []).find((a) => a.id === attachmentId)
      : null;
    const target = att || task;
    if (target?.shared_to_project) {
      setShareModal({
        taskId,
        attachmentId,
        title: attachmentId ? `Chia sẻ file: ${att?.name || 'Đính kèm'}` : `Chia sẻ ghi chú: ${task?.title || 'Nhiệm vụ'}`,
        shared: true,
        modules: target.allowed_share_modules,
      });
      return;
    }
    setShareModal({
      taskId,
      attachmentId,
      title: attachmentId ? `Chia sẻ file sang khối khác` : `Chia sẻ ghi chú nhiệm vụ`,
      shared: false,
      modules: null,
    });
  };

  const turnOffShare = async (taskId, attachmentId = null) => {
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const url = attachmentId
        ? `/crm/leads/${lid}/tasks/${taskId}/attachments/${attachmentId}/toggle-share`
        : `/crm/leads/${lid}/tasks/${taskId}/toggle-share`;
      const { data } = await api.put(url, { shared_to_project: false });
      if (attachmentId) {
        setTaskAttachments((p) => ({
          ...p,
          [taskId]: (p[taskId] || []).map((a) => (a.id === attachmentId ? { ...a, ...data } : a)),
        }));
      } else {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
      }
      notifyArtifactsSynced(taskId);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tắt chia sẻ');
    }
  };

  const handleShareClick = (taskId, attachmentId = null) => {
    const task = tasks.find((t) => t.id === taskId);
    const att = attachmentId ? (taskAttachments[taskId] || []).find((a) => a.id === attachmentId) : null;
    const shared = attachmentId ? att?.shared_to_project : task?.shared_to_project;
    if (shared) turnOffShare(taskId, attachmentId);
    else openShareModal(taskId, attachmentId);
  };

  const onShareModalSaved = (data) => {
    if (!shareModal) return;
    const { taskId, attachmentId } = shareModal;
    if (attachmentId) {
      setTaskAttachments((p) => ({
        ...p,
        [taskId]: (p[taskId] || []).map((a) => (a.id === attachmentId ? { ...a, ...data } : a)),
      }));
    } else {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
    }
    notifyArtifactsSynced(taskId);
    setShareModal(null);
  };

  // Stats
  const stats = useMemo(() => {
    const total = uiTasks.length;
    const completed = uiTasks.filter(t => t.status === 'completed').length;
    const overdue = uiTasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    const inProgress = uiTasks.filter(t => t.status === 'in_progress').length;
    return { total, completed, overdue, inProgress, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [uiTasks]);

  // Group tasks by stage (không dùng bucket "Khác")
  const tasksByStage = useMemo(() => {
    const map = {};
    STAGES.forEach((s) => { map[s.slug] = []; });
    const usePipelineKeys = usePipelineTaskUi || (isLegacyCrmTaskSet && pipelineStages.length > 0);

    if (useSxPipelineTaskUi || (isSxOrderTaskFlow && sxPipelineStages.length > 0)) {
      uiTasks.forEach((t) => {
        const key = resolveSxTaskProductionStageId(t, sxPipelineStages);
        if (key && map[key] !== undefined) map[key].push(t);
        else if (key) {
          map[key] = [t];
        }
      });
    } else if (usePipelineKeys) {
      uiTasks.forEach((t) => {
        const key = resolveTaskPipelineStageId(t, pipelineStages, leadCurrentStageId);
        if (key && map[key] !== undefined) map[key].push(t);
      });
    } else {
      uiTasks.forEach((t) => {
        const fallbackSlug = leadType === 'deal' ? (DEAL_STAGES[0]?.slug || 'deal_new') : (LEAD_STAGES[0]?.slug || 'consulting');
        const key = t.stage_slug || fallbackSlug;
        if (!map[key]) map[key] = [];
        map[key].push(t);
      });
    }
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    });
    return map;
  }, [uiTasks, STAGES, useSxPipelineTaskUi, isSxOrderTaskFlow, sxPipelineStages, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages, leadCurrentStageId, leadType]);

  /** Khóa giai đoạn — dùng khi sắp xếp kéo thả trong tab Công việc deal. */
  const getTaskStageKey = useCallback((task) => {
    if (!task) return null;
    if (useSxPipelineTaskUi || (isSxOrderTaskFlow && sxPipelineStages.length > 0)) {
      return resolveSxTaskProductionStageId(task, sxPipelineStages);
    }
    const usePipelineKeys = usePipelineTaskUi || (isLegacyCrmTaskSet && pipelineStages.length > 0);
    if (usePipelineKeys) {
      return resolveTaskPipelineStageId(task, pipelineStages, leadCurrentStageId);
    }
    const fallbackSlug = leadType === 'deal' ? (DEAL_STAGES[0]?.slug || 'deal_new') : (LEAD_STAGES[0]?.slug || 'consulting');
    return task.stage_slug || fallbackSlug;
  }, [useSxPipelineTaskUi, isSxOrderTaskFlow, sxPipelineStages, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages, leadCurrentStageId, leadType]);

  /** Kéo thả chỉ sắp xếp trong cùng giai đoạn — không gộp nhiệm vụ (gộp checklist chỉ ở bộ mẫu SX). */
  const handleTaskDragEnd = useCallback(async (event) => {
    if (viewMode !== 'list') return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('ck|') || overId.startsWith('ck|')) return;

    const sourceTask = tasks.find((t) => String(t.id) === activeId);
    const targetTask = tasks.find((t) => String(t.id) === overId);
    if (!sourceTask || !targetTask) return;

    const srcStage = getTaskStageKey(sourceTask);
    const dstStage = getTaskStageKey(targetTask);
    if (!srcStage || srcStage !== dstStage) return;

    const stageTasks = [...(tasksByStage[srcStage] || [])]
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    const oldIdx = stageTasks.findIndex((t) => String(t.id) === activeId);
    const newIdx = stageTasks.findIndex((t) => String(t.id) === overId);
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

    const reordered = [...stageTasks];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    const orderMap = new Map(reordered.map((t, i) => [t.id, i]));
    const prevTasks = tasks;
    setTasks((prev) => prev.map((t) => (
      orderMap.has(t.id) ? { ...t, order_index: orderMap.get(t.id) } : t
    )));

    try {
      await Promise.all(reordered.map((t, i) =>
        api.put(`/crm/leads/${apiLeadIdForTaskId(t.id)}/tasks/${t.id}`, { order_index: i }),
      ));
    } catch (e) {
      setTasks(prevTasks);
      alert(e.response?.data?.error || 'Lỗi sắp xếp nhiệm vụ');
    }
  }, [viewMode, tasks, tasksByStage, getTaskStageKey, apiLeadIdForTaskId]);

  const listStagesToRender = useMemo(() => {
    if (
      useSxPipelineTaskUi
      || (isProductionScope && isSxOrderTaskFlow)
      || (isSxOrderTaskFlow && sxPipelineStages.length > 0)
      || usePipelineTaskUi
      || (isLegacyCrmTaskSet && pipelineStages.length)
    ) {
      return STAGES;
    }
    const withTasks = STAGES.filter((s) => (tasksByStage[s.slug]?.length || 0) > 0);
    const known = new Set(STAGES.map((s) => s.slug));
    const extras = Object.keys(tasksByStage)
      .filter((k) => k && !known.has(k) && tasksByStage[k]?.length)
      .map((k) => ALL_STAGES.find((s) => s.slug === k) || {
        slug: k,
        label: k,
        icon: '📌',
        color: '#6B7280',
      });
    return [...withTasks, ...extras];
  }, [STAGES, tasksByStage, useSxPipelineTaskUi, isProductionScope, isSxOrderTaskFlow, sxPipelineStages.length, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages.length]);

  const stageTemplatesMap = useMemo(() => {
    const map = {};
    STAGES.forEach((s) => {
      const key = s.slug;
      map[key] = pipelineTemplates.filter((t) => (
        usePipelineTaskUi || (isLegacyCrmTaskSet && pipelineStages.length)
          ? String(t.pipeline_stage_id) === String(key)
          : t.stage_slug === key
      ));
    });
    return map;
  }, [STAGES, pipelineTemplates, usePipelineTaskUi, isLegacyCrmTaskSet, pipelineStages.length]);

  const groupStageTasksByBundle = useCallback((stageKey, stageTasks) => {
    const stageTpls = stageTemplatesMap[stageKey] || [];
    if (!stageTpls.length) {
      return [{ key: 'ungrouped', label: null, tasks: stageTasks, tpl: null }];
    }
    const groups = new Map();
    const orphans = [];
    stageTasks.forEach((task) => {
      const tpl = inferTaskTemplate(task, stageTpls);
      if (!tpl) {
        orphans.push(task);
        return;
      }
      const gk = tpl.id;
      if (!groups.has(gk)) {
        groups.set(gk, { key: gk, label: tpl.name, tasks: [], tpl, isDefault: !!tpl.is_default });
      }
      groups.get(gk).tasks.push(task);
    });
    const ordered = stageTpls
      .filter((tpl) => groups.has(tpl.id))
      .map((tpl) => groups.get(tpl.id));
    if (orphans.length) {
      ordered.push({ key: 'orphan', label: 'Nhiệm vụ khác', tasks: orphans, tpl: null, isDefault: false });
    }
    if (!ordered.length && stageTasks.length) {
      return [{ key: 'ungrouped', label: null, tasks: stageTasks, tpl: null }];
    }
    return ordered;
  }, [stageTemplatesMap]);

  // Deadline view groups
  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    uiTasks.filter(t => t.status !== 'completed').forEach(t => {
      if (!t.deadline) { groups.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [uiTasks]);

  // Planner view - group by assignee
  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    uiTasks.filter(t => t.status !== 'completed').forEach(t => {
      const list = taskAssigneeList(t);
      if (list.length) {
        list.forEach((u) => {
          if (!map[u.id]) map[u.id] = { user: u, tasks: [] };
          map[u.id].tasks.push(t);
        });
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [uiTasks]);

  // Calendar view
  const calendarTasks = useMemo(() => {
    const map = {};
    uiTasks.forEach(t => {
      if (!t.deadline) return;
      const key = isoToDatetimeLocalValue(t.deadline).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [uiTasks]);

  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const calDays = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay() || 7;
    const days = [];
    for (let i = 1 - startDay; i <= 42 - startDay; i++) {
      const d = new Date(calMonth.y, calMonth.m, i + 1);
      days.push(d);
    }
    return days.slice(0, 35);
  }, [calMonth]);

  const [expandedTask, setExpandedTask] = useState(null);
  const [focusHighlightId, setFocusHighlightId] = useState(null);
  const focusAppliedRef = useRef(null);

  useEffect(() => {
    focusAppliedRef.current = null;
    setFocusHighlightId(null);
  }, [leadId, focusTaskId]);

  useEffect(() => {
    const fid = focusTaskId ? String(focusTaskId) : '';
    if (!fid || loading) return;
    const task = uiTasks.find((t) => String(t.id) === fid);
    if (!task) return;
    if (focusAppliedRef.current === fid) return;
    focusAppliedRef.current = fid;
    if (leadType === 'deal' && isSxProductionTask(task) && !isProductionScope) {
      setDealTaskView('sx');
    }
    setExpandedTask(task.id);
    setFocusHighlightId(fid);
    const scrollT = window.setTimeout(() => {
      document.getElementById(`crm-task-row-${fid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clearT = window.setTimeout(() => setFocusHighlightId(null), 5000);
    return () => {
      window.clearTimeout(scrollT);
      window.clearTimeout(clearT);
    };
  }, [focusTaskId, uiTasks, loading, leadType, isProductionScope]);
  const [expandedChecklistKey, setExpandedChecklistKey] = useState(null);
  const [editingChecklistKey, setEditingChecklistKey] = useState(null);
  const [checklistEditForm, setChecklistEditForm] = useState({
    title: '', description: '', priority: 'medium', assignee_id: '', executor_company_id: '',
  });
  const [checklistNoteText, setChecklistNoteText] = useState({});
  const [savingChecklistNote, setSavingChecklistNote] = useState(null);
  const [uploadingChecklistKey, setUploadingChecklistKey] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null); // taskId currently editing deadline
  const [taskAttachments, setTaskAttachments] = useState({});
  const [taskNoteText, setTaskNoteText] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [uploadingTask, setUploadingTask] = useState(null); // taskId đang upload
  const [addingAttNote, setAddingAttNote] = useState(null);
  const [attNoteText, setAttNoteText] = useState('');
  const [attNoteName, setAttNoteName] = useState('');
  const [uploadProgress, setUploadProgress] = useState({}); // { taskId: { percent, name } }
  const [excelImportTaskId, setExcelImportTaskId] = useState(null); // taskId đang mở Excel import modal
  const [importingExcel, setImportingExcel] = useState(null); // taskId đang import
  const [importToast, setImportToast] = useState(null); // { message, type }
  const [attLightboxIndex, setAttLightboxIndex] = useState(null);
  const [attLightboxItems, setAttLightboxItems] = useState([]);

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  const loadAttachments = async (task) => {
    const taskId = task.id;
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const { data } = await api.get(`/crm/leads/${lid}/tasks/${taskId}/attachments`);
      setTaskAttachments(p => ({ ...p, [taskId]: data || [] }));
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (task) => {
    const taskId = task.id;
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
      setTaskNoteText((p) => ({ ...p, [taskId]: task.notes || '' }));
      loadAttachments(task);
    }
  };

  const saveTaskNotes = async (taskId) => {
    setSavingNote(taskId);
    try {
      await api.put(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/notes`, { notes: taskNoteText[taskId] || '' });
      // Update local tasks state
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: taskNoteText[taskId] } : t));
      notifyArtifactsSynced(taskId);
      setSavingNote('saved-' + taskId);
      setTimeout(() => setSavingNote(null), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
      setSavingNote(null);
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

  const uploadTaskFile = (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploadingTask(taskId);

      try {
        // Chia thành ảnh và video/file
        const imageFiles = rawFiles.filter(f => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter(f => !f.type.startsWith('image/'));

        const allUploaded = [];

        // Upload ảnh: nén + batch
        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map(f => compressImage(f)));
          const formData = new FormData();
          compressed.forEach(f => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }

        // Upload video/file: từng file riêng với progress + stream endpoint
        for (const file of otherFiles) {
          setUploadProgress(p => ({ ...p, [taskId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024; // >10MB dùng stream
          const endpoint = isLarge ? '/upload/stream' : '/upload/single';
          const result = await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${api.defaults.baseURL}${endpoint}`);
            xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setUploadProgress(p => ({ ...p, [taskId]: { percent: pct, name: file.name } }));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error(`Upload lỗi: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Lỗi mạng'));
            xhr.send(formData);
          });
          allUploaded.push(result);
        }

        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });

        if (!allUploaded.length) throw new Error('Upload không trả về file');

        // Tạo attachments
        const items = allUploaded.map(up => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image' : (up.mime_type || '').startsWith('video/') ? 'video' : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/bulk`, { items });
        loadAttachments({ id: taskId });
        loadTasks(); // Refresh counts
        notifyArtifactsSynced(taskId);
      } catch (err) {
        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingTask(null);
    };
    input.click();
  };

  const addAttachmentNote = async (taskId) => {
    if (!attNoteText.trim()) return alert('Nhập nội dung ghi chú');
    try {
      await api.post(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments`, {
        name: attNoteName.trim() || 'Ghi chú',
        doc_type: 'task_note',
        notes: attNoteText,
      });
      setAddingAttNote(null);
      setAttNoteText('');
      setAttNoteName('');
      loadAttachments({ id: taskId });
      notifyArtifactsSynced(taskId);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi thêm ghi chú'); }
  };

  const deleteAttachment = async (taskId, attId) => {
    if (!confirm('Xóa đính kèm này?')) return;
    try {
      await api.delete(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/${attId}`);
      loadAttachments({ id: taskId });
      notifyArtifactsSynced(taskId);
    } catch (e) { alert('Lỗi'); }
  };

  const filterChecklistAttachments = (atts, ckId) => (
    (atts || []).filter((a) => String(a.checklist_id || '') === String(ckId))
  );
  const filterTaskLevelAttachments = (atts) => (
    (atts || []).filter((a) => !a.checklist_id)
  );

  const toggleExpandChecklist = (task, ck) => {
    const key = ckStateKey(task.id, ck.id);
    if (expandedChecklistKey === key) {
      setExpandedChecklistKey(null);
      return;
    }
    setExpandedChecklistKey(key);
    setEditingChecklistKey(null);
    setChecklistNoteText((p) => ({ ...p, [key]: ck.notes || '' }));
    if (expandedTask !== task.id) {
      setExpandedTask(task.id);
      setTaskNoteText((prev) => ({ ...prev, [task.id]: task.notes || '' }));
      loadAttachments(task);
    } else if (!taskAttachments[task.id]) {
      loadAttachments(task);
    }
  };

  const openEditChecklist = (task, ck) => {
    const key = ckStateKey(task.id, ck.id);
    setEditingChecklistKey(key);
    setExpandedChecklistKey(null);
    setChecklistEditForm({
      title: ck.title || '',
      description: ck.description || '',
      priority: ck.priority || 'medium',
      assignee_id: ck.assignee_id || ck.default_assignee_id || '',
      executor_company_id: ck.executor_company_id || '',
    });
    if (expandedTask !== task.id) setExpandedTask(task.id);
  };

  const saveChecklistEdit = async (task, ckId) => {
    if (!checklistEditForm.title.trim()) {
      alert('Nhập tên mục checklist');
      return;
    }
    await editChecklistItem(task, ckId, {
      title: checklistEditForm.title.trim(),
      description: checklistEditForm.description?.trim() || '',
      priority: checklistEditForm.priority || 'medium',
      assignee_id: checklistEditForm.assignee_id || null,
      executor_company_id: normalizeExecutorForSave(checklistEditForm.executor_company_id),
    });
    setEditingChecklistKey(null);
  };

  const saveChecklistNotes = async (taskId, ckId) => {
    const key = ckStateKey(taskId, ckId);
    setSavingChecklistNote(key);
    try {
      const { data } = await api.put(
        `/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/checklist/${ckId}/notes`,
        { notes: checklistNoteText[key] || '' },
      );
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, checklist: data.checklist } : t)));
      notifyArtifactsSynced(taskId);
      setSavingChecklistNote(`saved-${key}`);
      setTimeout(() => setSavingChecklistNote(null), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
      setSavingChecklistNote(null);
    }
  };

  const uploadChecklistFile = (taskId, ckId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      const upKey = ckStateKey(taskId, ckId);
      setUploadingChecklistKey(upKey);
      try {
        const imageFiles = rawFiles.filter((f) => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter((f) => !f.type.startsWith('image/'));
        const allUploaded = [];
        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
          const formData = new FormData();
          compressed.forEach((f) => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }
        for (const file of otherFiles) {
          const isLarge = file.size > 10 * 1024 * 1024;
          const endpoint = isLarge ? '/upload/stream' : '/upload/single';
          const result = await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${api.defaults.baseURL}${endpoint}`);
            xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
              else reject(new Error(`Upload lỗi: ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Lỗi mạng'));
            xhr.send(formData);
          });
          allUploaded.push(result);
        }
        if (!allUploaded.length) throw new Error('Upload không trả về file');
        const items = allUploaded.map((up) => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image'
            : (up.mime_type || '').startsWith('video/') ? 'video'
            : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/bulk`, {
          items,
          checklist_id: ckId,
        });
        loadAttachments({ id: taskId });
        loadTasks();
        notifyArtifactsSynced(taskId);
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingChecklistKey(null);
    };
    input.click();
  };

  const ATT_ICONS = { image: ImageIcon, video: Film, drawing: FileText, task_note: MessageSquare, other: FileText };

  const isImageAtt = (att) => {
    if (!att?.file_url) return false;
    if (att.doc_type === 'image') return true;
    if (att.mime_type?.startsWith('image/')) return true;
    return isUploadImageFile(att.mime_type, att.file_name || att.file_url);
  };

  const openAttLightbox = (atts, rawPath) => {
    const items = collectUploadLightboxItems(
      (atts || []).filter((a) => a.doc_type !== 'checklist_inline_note'),
    );
    if (!items.length) return;
    const idx = rawPath ? findUploadLightboxIndex(items, rawPath) : 0;
    setAttLightboxItems(items);
    setAttLightboxIndex(Math.max(idx, 0));
  };

  const renderImageThumbnailGrid = (atts, { size = 'md', className = '' } = {}) => {
    const imageAtts = (atts || []).filter(
      (a) => a.doc_type !== 'checklist_inline_note' && isImageAtt(a),
    );
    if (!imageAtts.length) return null;
    const dim = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {imageAtts.map((att) => (
          <button
            key={att.id || att.file_url}
            type="button"
            onClick={(e) => { e.stopPropagation(); openAttLightbox(atts, att.file_url); }}
            className={`${dim} rounded-md border border-gray-200 overflow-hidden shrink-0 cursor-zoom-in hover:ring-2 hover:ring-blue-400 transition-shadow bg-gray-50`}
            title={att.name || att.file_name || 'Xem ảnh'}
          >
            <img
              src={publicFileUrl(att.file_url)}
              alt={att.name || ''}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    );
  };

  const renderChecklistAttachmentList = (taskId, ckAtts) => {
    const fileAtts = ckAtts.filter((a) => !isImageAtt(a));
    if (!ckAtts.some((a) => isImageAtt(a)) && !fileAtts.length) return null;
    return (
      <div className="space-y-1.5 mt-2">
        {renderImageThumbnailGrid(ckAtts, { size: 'md' })}
        {fileAtts.map((att) => {
          const AttIcon = ATT_ICONS[att.doc_type] || FileText;
          const attOpen = att.file_url ? getFileOpenAnchorProps(att.file_url, { fileName: att.file_name }) : null;
          return (
            <div key={att.id} className="py-1.5 px-2 rounded bg-white border group/att">
              <div className="flex items-start gap-2">
                <AttIcon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
                  {att.notes && att.doc_type !== 'checklist_inline_note' && (
                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{att.notes}</p>
                  )}
                  {att.file_url && attOpen && (
                    <a {...attOpen} className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                  )}
                </div>
                <button onClick={() => deleteAttachment(taskId, att.id)}
                  className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer opacity-0 group-hover/att:opacity-100">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };


  const excelQuotationLeadId = excelImportTaskId ? apiLeadIdForTaskId(excelImportTaskId) : leadId;

  // Mục checklist giao chéo — không lộ bộ nhiệm vụ nội bộ
  const renderSharedChecklistEntry = (task, ck) => {
    const ckKey = ckStateKey(task.id, ck.id);
    const allAtts = taskAttachments[task.id] || [];
    const ckAtts = filterChecklistAttachments(allAtts, ck.id);
    const ckFileCount = ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note' && a.doc_type !== 'task_note').length;
    const ckHasNotes = !!(ck.notes?.trim() || ckAtts.some((a) => a.doc_type === 'checklist_inline_note' && a.notes?.trim()));
    const isCkExpanded = expandedChecklistKey === ckKey;
    const isCkEditing = editingChecklistKey === ckKey;
    const ckAssignee = (users || []).find((u) => String(u.id) === String(ck.assignee_id));
    const isMyItem = ck.executor_company_id && user?.company_id
      && String(ck.executor_company_id) === String(user.company_id);

    return (
      <div key={ckKey} className="rounded-lg border border-teal-200 bg-teal-50/20 overflow-hidden">
        <p className="text-[10px] text-teal-700 bg-teal-50 border-b border-teal-100 px-3 py-1.5 flex items-center gap-1">
          <Lock className="h-3 w-3 shrink-0" />
          Mục được giao riêng — không hiển thị bộ nhiệm vụ nội bộ
          {isMyItem && <span className="ml-auto text-teal-800 font-semibold">Giao cho bạn</span>}
        </p>
        <div className={`${isCkExpanded ? 'bg-white' : 'bg-white/80'}`}>
          <div className="flex items-center gap-2 py-2 px-3 group/ck">
            <button type="button" onClick={() => toggleChecklistItem(task, ck.id)} className="shrink-0 cursor-pointer"
              title={ck.done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}>
              {ck.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-gray-300" />}
            </button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpandChecklist(task, ck)}>
              <p className={`text-sm font-medium ${ck.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{ck.title}</p>
              {!isCkExpanded && !isCkEditing && ck.description?.trim() && (
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{ck.description}</p>
              )}
              {!isCkExpanded && ckHasNotes && (
                <p className="text-[11px] text-amber-600 line-clamp-1 mt-0.5 italic">💬 {(ck.notes || '').slice(0, 80)}</p>
              )}
              {!isCkExpanded && renderImageThumbnailGrid(
                ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note' && a.doc_type !== 'task_note'),
                { size: 'sm', className: 'mt-1' },
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {ckFileCount > 0 && (
                  <span className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                    <Paperclip className="h-2.5 w-2.5" />{ckFileCount}
                  </span>
                )}
                {ckHasNotes && (
                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                    <MessageSquare className="h-2.5 w-2.5" />Ghi chú
                  </span>
                )}
                {ckAssignee && (
                  <span className="text-[9px] text-indigo-600 flex items-center gap-0.5">
                    <User className="h-2.5 w-2.5" />{ckAssignee.full_name}
                  </span>
                )}
                {checklistItemRequiresEvidence(ck) && !ck.done && (
                  <span className="text-[9px] text-violet-700 bg-violet-50 px-1 py-0.5 rounded-full max-w-[140px] truncate"
                    title={`Cần nộp: ${formatEvidenceTypesList(ck.required_evidence_file_types)}`}>
                    📎 {formatEvidenceTypesShort(ck.required_evidence_file_types) || 'Minh chứng'}
                  </span>
                )}
              </div>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[ck.priority || 'medium']}`}>
              {PRIORITY_LABELS[ck.priority || 'medium']}
            </span>
            <div className="shrink-0 flex flex-col gap-0.5 border-l border-gray-100 pl-1" onClick={(e) => e.stopPropagation()}>
              <div className="w-[9.5rem]" title="Gán nhân viên">
                <EmployeePicker
                  companyId={resolveChecklistAssignCompanyId(task, ck) || undefined}
                  value={ck.assignee_id || ''}
                  onChange={(userId) => assignChecklistItem(task, ck.id, userId)}
                  placeholder="👤 Chưa gán"
                  size="sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1">
              <button type="button" onClick={() => toggleExpandChecklist(task, ck)}
                className={`p-1 rounded-md cursor-pointer ${isCkExpanded ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                title="Ghi chú & file">
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => openEditChecklist(task, ck)}
                className={`p-1 rounded-md cursor-pointer ${isCkEditing ? 'text-blue-600 bg-blue-50' : 'text-blue-600 hover:bg-blue-50'}`}
                title="Sửa mục">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {isCkEditing && (
            <div className="mx-3 mb-2 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] text-sky-700 font-bold uppercase tracking-wide">✏️ Sửa mục checklist</p>
              <input
                value={checklistEditForm.title}
                onChange={(e) => setChecklistEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full h-8 px-2 rounded border text-sm outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="Tên mục..."
              />
              <textarea
                value={checklistEditForm.description}
                onChange={(e) => setChecklistEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full px-2 py-1.5 rounded border text-xs outline-none focus:ring-2 focus:ring-sky-400 resize-y min-h-[48px]"
                placeholder="Mô tả / hướng dẫn (tùy chọn)..."
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={checklistEditForm.priority}
                  onChange={(e) => setChecklistEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="h-8 px-2 rounded border text-xs bg-white"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">TB</option>
                  <option value="high">Cao</option>
                  <option value="urgent">Gấp</option>
                </select>
                <div className="min-w-[9.5rem]">
                  <EmployeePicker
                    companyId={resolveChecklistAssignCompanyId(task, ck) || undefined}
                    value={checklistEditForm.assignee_id || ''}
                    onChange={(userId) => setChecklistEditForm((f) => ({ ...f, assignee_id: userId || '' }))}
                    placeholder="👤 Chưa gán"
                    size="sm"
                  />
                </div>
                <span className="flex-1" />
                <button type="button" onClick={() => setEditingChecklistKey(null)}
                  className="h-8 px-3 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                  Hủy
                </button>
                <button type="button" onClick={() => saveChecklistEdit(task, ck.id)}
                  className="h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 cursor-pointer flex items-center gap-1">
                  <Save className="h-3 w-3" /> Lưu
                </button>
              </div>
            </div>
          )}

          {isCkExpanded && !isCkEditing && (
            <div className="px-3 pb-3 border-t border-teal-100 pt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              {ck.description?.trim() && (
                <div className="rounded bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Mô tả</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{ck.description}</p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({ckAtts.length})</label>
                  {uploadingChecklistKey === ckKey ? (
                    <span className="text-[10px] text-orange-600">Đang upload...</span>
                  ) : (
                    <button type="button" onClick={() => uploadChecklistFile(task.id, ck.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                      <FileUp className="h-3 w-3" /> Upload file
                    </button>
                  )}
                </div>
                <textarea
                  value={checklistNoteText[ckKey] ?? ck.notes ?? ''}
                  onChange={(e) => setChecklistNoteText((p) => ({ ...p, [ckKey]: e.target.value }))}
                  placeholder="Nhập ghi chú cho mục checklist..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-400 resize-none mb-1.5"
                />
                <div className="flex justify-end mb-1">
                  <button type="button" onClick={() => saveChecklistNotes(task.id, ck.id)} disabled={savingChecklistNote === ckKey}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                      savingChecklistNote === `saved-${ckKey}` ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}>
                    <Save className="h-2.5 w-2.5" />
                    {savingChecklistNote === ckKey ? 'Đang lưu...' : savingChecklistNote === `saved-${ckKey}` ? '✓ Đã lưu' : 'Lưu ghi chú'}
                  </button>
                </div>
                {renderChecklistAttachmentList(task.id, ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note'))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // TaskRow renders inline — see renderTaskRow below
  const renderTaskRow = (task) => {
    if (isSharedWorkspace && isChecklistOnlyInShared(task)) return null;
    const StatusIcon = STATUS_ICONS[task.status] || Circle;
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
    const isExpanded = expandedTask === task.id;
    const allAtts = taskAttachments[task.id] || [];
    const atts = filterTaskLevelAttachments(allAtts);
    const descText = (task.description || '').trim();
    const hasDesc = !!descText;
    const hasContent = task.notes || descText || atts.length > 0;
    const fileCount = task.file_count || 0;
    const noteCount = task.note_count || 0;
    const hasNotes = !!task.notes;
    const delegated = isDelegatedSxTask(task);
    const executorLabel = delegated ? companyLabelById(task.executor_company_id) : '';
    const isMyExecutorTask = task.executor_company_id && user?.company_id
      && String(task.executor_company_id) === String(user.company_id);
    const showInternalBadge = !delegated && taskCompanyScope !== 'shared' && (showSxTasksInUi || isProductionScope) && isSxStageSlug(task.stage_slug) && leadCompanyId;
    const showEvidenceBadge = (!!task.completion_requires_file_or_note ||
      (Array.isArray(task.required_evidence_file_types) && task.required_evidence_file_types.length > 0) ||
      !!task.completion_requires_customer_note ||
      !!task.completion_requires_customer_contact) &&
      task.status !== 'completed';
    const assignees = taskAssigneeList(task);
    const hasCollapsedMeta = showInternalBadge || showEvidenceBadge || assignees.length > 0;
    return (
      <SortableTaskWrapper key={task.id} id={task.id}>
        {({ dragHandleProps, isOver }) => (
      <div
        id={`crm-task-row-${task.id}`}
        className={`rounded-lg ${
        isExpanded ? 'bg-gray-50 border border-gray-200' : 'hover:bg-gray-50'
      } ${delegated && taskCompanyScope === 'shared' ? 'border border-teal-200 bg-teal-50/25' : ''} ${isOver ? 'ring-2 ring-blue-300 ring-offset-1' : ''} ${String(focusHighlightId) === String(task.id) ? 'ring-2 ring-indigo-500 ring-offset-1 bg-indigo-50/40' : ''}`}>
        {/* Main row */}
        <div className="flex items-center gap-2 py-2 px-3 group">
          {viewMode === 'list' && (
          <button
            type="button"
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing shrink-0 p-0.5 text-gray-300 hover:text-gray-500 rounded"
            title="Kéo để sắp xếp thứ tự trong cùng giai đoạn"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          )}
          <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
            <StatusIcon className={`h-4 w-4 ${task.status === 'completed' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
          </button>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => toggleExpand(task)}
            title="Click hoặc Chi tiết: xem minh chứng, người gán, ghi chú & file"
          >
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <p
                className={`text-sm min-w-0 ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}
                style={task.status === 'completed' ? undefined : { color: '#000000' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openEditModal(task, e.currentTarget);
                }}
              >
                {task.title}
              </p>
              {task.order_label && (
                <span className="shrink-0 text-[10px] font-medium text-amber-900 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                  Đơn: {task.order_label}
                </span>
              )}
              {delegated && (
                <span
                  className="shrink-0 text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                  title={isMyExecutorTask ? 'Nhiệm vụ được giao cho công ty bạn' : `Giao cho ${executorLabel}`}
                >
                  <Globe className="h-2.5 w-2.5" />
                  {isMyExecutorTask ? 'Giao cho bạn' : `Giao ${executorLabel}`}
                </span>
              )}
              {!isExpanded && hasCollapsedMeta && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(task); }}
                  className="shrink-0 text-[10px] font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  Chi tiết
                </button>
              )}
              {isExpanded && showInternalBadge && (
                <span className="shrink-0 text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                  Nội bộ
                </span>
              )}
              {(!!task.requires_quick_verdict && task.status !== 'completed') && (
                <span
                  className="shrink-0 text-[10px] font-medium text-sky-900 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded max-w-[160px] truncate"
                  title={task.quick_verdict === 'sufficient' ? 'Đã chọn: Đủ' : task.quick_verdict === 'insufficient' ? `Chưa: ${task.quick_verdict_reason || ''}` : 'Cần chọn Đủ/Chưa'}
                >
                  {task.quick_verdict === 'sufficient' ? '✓ Đủ' : task.quick_verdict === 'insufficient' ? '✗ Chưa' : '❓ Đủ/Chưa'}
                </span>
              )}
              {isExpanded && showEvidenceBadge && (
                <span
                  className="shrink-0 text-[10px] font-medium text-violet-900 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded max-w-[220px] truncate"
                  title={(() => {
                    const typed = formatEvidenceTypesList(task.required_evidence_file_types);
                    if (task.required_evidence_file_types?.length) return `Cần nộp: ${typed}`;
                    return 'Cần ghi chú hoặc file đính kèm trước khi hoàn thành / chuyển giai đoạn';
                  })()}
                >
                  {(() => {
                    const typed = formatEvidenceTypesShort(task.required_evidence_file_types);
                    const n = !!task.completion_requires_customer_note;
                    const c = !!(task.completion_requires_customer_contact || task.completion_requires_file_or_note || typed);
                    if (typed) return `📎 ${typed}`;
                    if (n && c) return '📝+📎 Minh chứng';
                    if (n) return '📝 Ghi chú KH';
                    return '📎 Minh chứng';
                  })()}
                </span>
              )}
            </div>
            {!isExpanded && hasNotes && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1 italic" title={task.notes}>
                💬 {task.notes.slice(0, 80)}{task.notes.length > 80 ? '...' : ''}
              </p>
            )}
            {!isExpanded && !hasNotes && hasDesc && (
              <p className="text-sm text-slate-600 mt-0.5 line-clamp-2" title={descText}>
                📋 {descText.slice(0, 120)}{descText.length > 120 ? '…' : ''}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className={`text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1.5 py-0.5 rounded ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}
                  title="Click để đổi ngày giờ hẹn">
                  <Calendar className="h-3.5 w-3.5" />{formatDateTime(task.deadline)}
                </span>
              )}
              {!task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className="text-xs font-medium text-gray-400 flex items-center gap-1 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1.5 py-0.5 rounded"
                  title="Chọn ngày giờ hẹn">
                  <Calendar className="h-3.5 w-3.5" />+ Ngày hẹn
                </span>
              )}
              {editingDeadline === task.id && (
                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="datetime-local" autoFocus
                    defaultValue={task.deadline ? isoToDatetimeLocalValue(task.deadline) : ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val) updateTask(task.id, { deadline: datetimeLocalValueToIso(val) });
                    }}
                    onBlur={() => setTimeout(() => setEditingDeadline(null), 300)}
                    className="text-xs px-2 py-1 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[185px]"
                  />
                  {task.deadline && (
                    <button onClick={() => { updateTask(task.id, { deadline: null }); setEditingDeadline(null); }}
                      className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5" title="Xóa ngày hẹn">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
              {isExpanded && assignees.map((u) => (
                <span key={u.id} className="text-[10px] text-blue-600 flex items-center gap-0.5">
                  <User className="h-2.5 w-2.5" />{u.full_name}
                </span>
              ))}
              {task.crm_assignment_id && (() => {
                const asnNav = assignmentNavForTask(task, isProductionScope || showSxTasksInUi);
                return (
                <Link
                  to={asnNav.openUrl(task.crm_assignment_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium"
                  title={asnNav.title}
                >
                  <ClipboardList className="h-2.5 w-2.5" /> {asnNav.label}
                </Link>
                );
              })()}
              {task.supervisor && <span className="text-[10px] text-purple-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{task.supervisor.full_name}</span>}
              {/* File & Note count badges — always visible */}
              {fileCount > 0 && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <Paperclip className="h-2.5 w-2.5" />{fileCount} file
                </span>
              )}
              {noteCount > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <MessageSquare className="h-2.5 w-2.5" />{noteCount} ghi chú
                </span>
              )}
              {(() => {
                const ck = normalizeChecklist(task.checklist);
                if (!ck.length) return null;
                const done = ck.filter((c) => c.done).length;
                const allDone = done === ck.length;
                return (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium ${allDone ? 'text-emerald-700 bg-emerald-50' : 'text-emerald-600 bg-emerald-50'}`}
                    title="Checklist con của nhiệm vụ">
                    <ListChecks className="h-2.5 w-2.5" />{done}/{ck.length}
                  </span>
                );
              })()}
              {hasNotes && !isExpanded && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Có ghi chú
                </span>
              )}
              {hasDesc && !hasNotes && !isExpanded && (
                <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Mô tả mẫu
                </span>
              )}
              {task.shared_to_project && (
                <span className="text-[10px] text-green-600 flex items-center gap-0.5" title={shareModuleLabels(task.allowed_share_modules)}>
                  <Share2 className="h-2.5 w-2.5" />Đang chia sẻ
                </span>
              )}
              {task.blocks_stage_advance && task.status !== 'completed' && task.status !== 'cancelled' && (
                <span
                  className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium border border-amber-200"
                  title="Phải hoàn thành nhiệm vụ này trước khi chuyển giai đoạn (trừ Thắng/Thua)"
                >
                  <Lock className="h-2.5 w-2.5" />Chặn chuyển giai đoạn
                </span>
              )}
              {task.blocks_stage_advance && task.status === 'completed' && (
                <span
                  className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium"
                  title="Đã hoàn thành nhiệm vụ chặn giai đoạn"
                >
                  <Lock className="h-2.5 w-2.5" />Đã mở khóa
                </span>
              )}
              {/* Nút Upload Excel Báo giá — hiện khi:
                  (a) nhiệm vụ bật cờ show_excel_quotation_upload ở bộ mẫu CRM, hoặc
                  (b) legacy: task ở giai đoạn báo giá/hợp đồng trong Deal (kể cả NextGo: quoted). */}
              {(
                !!task.show_excel_quotation_upload
                || (leadType === 'deal' && (task.stage_slug === 'deal_quote_contract' || task.stage_slug === 'quotation' || task.stage_slug === 'quoted'))
              ) && task.status !== 'completed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExcelImportTaskId(task.id); }}
                  className="text-[10px] text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium cursor-pointer border border-emerald-200 transition-colors"
                  title="Upload file Excel để tạo báo giá tự động"
                >
                  <FileSpreadsheet className="h-2.5 w-2.5" />📊 Upload Excel BG
                </button>
              )}
            </div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
          <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1.5 ml-0.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); handleShareClick(task.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); if (task.shared_to_project) openShareModal(task.id); }}
              className={`p-1.5 rounded-md cursor-pointer ${task.shared_to_project ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-100 hover:text-green-600'}`}
              title={task.shared_to_project ? 'Click: tắt chia sẻ · Double-click: đổi khối được xem' : 'Chia sẻ ghi chú sang SX / VC / Công việc dự án'}>
              {task.shared_to_project ? <Share2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(task); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Ghi chú & file">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openAssignModal(task, e.currentTarget); }}
              className={`p-1.5 rounded-md cursor-pointer ${
                taskAssigneeList(task).length
                  ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                  : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
              title="Gán nhân viên (1 hoặc nhiều)"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const lid = apiLeadIdForTaskId(task.id);
                  const { data } = await api.put(`/crm/leads/${lid}/tasks/${task.id}`, {
                    requires_quick_verdict: !task.requires_quick_verdict,
                  });
                  const updated = data?.task || data;
                  if (updated) setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, ...updated } : t)));
                } catch (err) {
                  alert(err.response?.data?.error || 'Không cập nhật được ghi chú nhanh Đủ/Chưa');
                }
              }}
              className={`p-1.5 rounded-md cursor-pointer ${
                task.requires_quick_verdict
                  ? 'text-sky-600 bg-sky-50 hover:bg-sky-100'
                  : 'text-gray-500 hover:text-sky-600 hover:bg-sky-50'
              }`}
              title={task.requires_quick_verdict ? 'Đang bật Đủ/Chưa — bấm để tắt' : 'Bật ghi chú nhanh: Đã đủ / Chưa (+ lý do)'}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); openEditModal(task, e.currentTarget); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Chỉnh sửa nhiệm vụ">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer" title="Xóa nhiệm vụ"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {!!task.requires_quick_verdict && (
          <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
            <TaskQuickVerdictBar
              compact
              task={task}
              leadId={apiLeadIdForTaskId(task.id)}
              onUpdated={(updated) => {
                setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, ...updated } : t)));
              }}
            />
          </div>
        )}

        {/* Expanded: Notes + Attachments (gộp 1 khu vực) */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-3 pt-3">
            {hasDesc && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Mô tả / hướng dẫn (từ mẫu CRM)</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{descText}</p>
              </div>
            )}

            {/* ─── Checklist: parity với nhiệm vụ (toolbar, sửa khi bấm Edit, ghi chú/file riêng) ─── */}
            {(() => {
              const ckItems = normalizeChecklist(task.checklist);
              const ckDone = ckItems.filter((c) => c.done).length;
              const ckPct = ckItems.length ? Math.round((ckDone / ckItems.length) * 100) : 0;
              return (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" /> Checklist
                      {ckItems.length > 0 && <span className="text-emerald-600 normal-case">{ckDone}/{ckItems.length}</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      {!isSharedWorkspace && (showSxTasksInUi || isProductionScope) && ckItems.length > 0 && ckItems.length < 4 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void restoreChecklistFromTemplate(task); }}
                          className="text-[10px] text-amber-700 hover:text-amber-900 underline cursor-pointer"
                          title="Lấy lại checklist đầy đủ từ bộ mẫu xưởng (nếu bị thiếu mục)"
                        >
                          Khôi phục từ mẫu
                        </button>
                      )}
                      <span className="text-[10px] text-emerald-600/80 normal-case">Mục con của nhiệm vụ — sửa từng dòng bằng ✏️</span>
                    </div>
                  </div>
                  {ckItems.length > 0 && (
                    <div className="w-full h-1.5 bg-emerald-100 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${ckPct}%` }} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {ckItems.map((ck) => {
                      const ckKey = ckStateKey(task.id, ck.id);
                      const ckAtts = filterChecklistAttachments(allAtts, ck.id);
                      const ckFileCount = ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note' && a.doc_type !== 'task_note').length;
                      const ckHasNotes = !!(ck.notes?.trim() || ckAtts.some((a) => a.doc_type === 'checklist_inline_note' && a.notes?.trim()));
                      const isCkExpanded = expandedChecklistKey === ckKey;
                      const isCkEditing = editingChecklistKey === ckKey;
                      const ckAssignee = (users || []).find((u) => String(u.id) === String(ck.assignee_id));
                      const ckExecId = ck.executor_company_id || task.executor_company_id || null;
                      const ckDelegated = ckExecId && leadCompanyId && String(ckExecId) !== String(leadCompanyId);
                      return (
                        <div key={ck.id} className={`rounded-md border bg-white ${isCkExpanded ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-2 py-1.5 px-2 group/ck">
                            <button type="button" onClick={() => toggleChecklistItem(task, ck.id)} className="shrink-0 cursor-pointer"
                              title={ck.done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}>
                              {ck.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-gray-300" />}
                            </button>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpandChecklist(task, ck)}>
                              <p className={`text-sm truncate ${ck.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{ck.title}</p>
                              {!isCkExpanded && !isCkEditing && ck.description?.trim() && (
                                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{ck.description}</p>
                              )}
                              {!isCkExpanded && ckHasNotes && (
                                <p className="text-[11px] text-amber-600 line-clamp-1 mt-0.5 italic">💬 {(ck.notes || '').slice(0, 60)}</p>
                              )}
                              {!isCkExpanded && renderImageThumbnailGrid(
                                ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note' && a.doc_type !== 'task_note'),
                                { size: 'sm', className: 'mt-1' },
                              )}
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {ckFileCount > 0 && (
                                  <span className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                    <Paperclip className="h-2.5 w-2.5" />{ckFileCount}
                                  </span>
                                )}
                                {ckHasNotes && (
                                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                    <MessageSquare className="h-2.5 w-2.5" />Ghi chú
                                  </span>
                                )}
                                {ckAssignee ? (
                                  <span className="text-[9px] text-indigo-600 flex items-center gap-0.5">
                                    <User className="h-2.5 w-2.5" />{ckAssignee.full_name}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                    <User className="h-2.5 w-2.5" />Chưa gán
                                  </span>
                                )}
                                {ckDelegated && (
                                  <span className="text-[9px] text-teal-700 bg-teal-50 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                    <Globe className="h-2.5 w-2.5" />{companyLabelById(ckExecId)}
                                  </span>
                                )}
                                {checklistItemRequiresEvidence(ck) && !ck.done && (
                                  <span
                                    className="text-[9px] text-violet-700 bg-violet-50 px-1 py-0.5 rounded-full max-w-[140px] truncate"
                                    title={`Cần nộp: ${formatEvidenceTypesList(ck.required_evidence_file_types)}`}
                                  >
                                    📎 {formatEvidenceTypesShort(ck.required_evidence_file_types) || 'Minh chứng'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[ck.priority || 'medium']}`}>
                              {PRIORITY_LABELS[ck.priority || 'medium']}
                            </span>
                            <div
                              className="shrink-0 flex flex-col gap-0.5 border-l border-gray-100 pl-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="w-[9.5rem]" title="Gán nhân viên cho mục checklist">
                                <EmployeePicker
                                  companyId={resolveChecklistAssignCompanyId(task, ck) || undefined}
                                  value={ck.assignee_id || ''}
                                  onChange={(userId) => assignChecklistItem(task, ck.id, userId)}
                                  placeholder="👤 Chưa gán"
                                  size="sm"
                                />
                              </div>
                              {(showSxTasksInUi || isProductionScope) && companies.length > 0 && (
                                <select
                                  value={ck.executor_company_id || ''}
                                  onChange={(e) => assignChecklistExecutorCompany(task, ck.id, e.target.value)}
                                  className="h-6 w-[9.5rem] px-1 text-[9px] border border-teal-200 rounded bg-white text-teal-800 outline-none focus:ring-1 focus:ring-teal-300"
                                  title="Công ty thực hiện mục checklist"
                                >
                                  <option value="">🏢 Nội bộ</option>
                                  {companies
                                    .filter((c) => !leadCompanyId || String(c.id) !== String(leadCompanyId))
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        🤝 {c.short_name || c.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1">
                              <button type="button" onClick={() => toggleExpandChecklist(task, ck)}
                                className={`p-1 rounded-md cursor-pointer ${isCkExpanded ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                                title="Ghi chú & file checklist">
                                <Paperclip className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => openEditChecklist(task, ck)}
                                className={`p-1 rounded-md cursor-pointer ${isCkEditing ? 'text-blue-600 bg-blue-50' : 'text-blue-600 hover:bg-blue-50'}`}
                                title="Sửa mục checklist">
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => removeChecklistItem(task, ck.id)}
                                className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer" title="Xóa mục">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isCkEditing && (
                            <div className="mx-2 mb-2 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] text-sky-700 font-bold uppercase tracking-wide">✏️ Sửa mục checklist</p>
                              <input
                                value={checklistEditForm.title}
                                onChange={(e) => setChecklistEditForm((f) => ({ ...f, title: e.target.value }))}
                                className="w-full h-8 px-2 rounded border text-sm outline-none focus:ring-2 focus:ring-sky-400"
                                placeholder="Tên mục..."
                              />
                              <textarea
                                value={checklistEditForm.description}
                                onChange={(e) => setChecklistEditForm((f) => ({ ...f, description: e.target.value }))}
                                rows={2}
                                className="w-full px-2 py-1.5 rounded border text-xs outline-none focus:ring-2 focus:ring-sky-400 resize-y min-h-[48px]"
                                placeholder="Mô tả / hướng dẫn (tùy chọn)..."
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={checklistEditForm.priority}
                                  onChange={(e) => setChecklistEditForm((f) => ({ ...f, priority: e.target.value }))}
                                  className="h-8 px-2 rounded border text-xs bg-white"
                                >
                                  <option value="low">Thấp</option>
                                  <option value="medium">TB</option>
                                  <option value="high">Cao</option>
                                  <option value="urgent">Gấp</option>
                                </select>
                                <div className="min-w-[9.5rem]">
                                  <EmployeePicker
                                    companyId={resolveChecklistAssignCompanyId(task, ck) || undefined}
                                    value={checklistEditForm.assignee_id || ''}
                                    onChange={(userId) => setChecklistEditForm((f) => ({ ...f, assignee_id: userId || '' }))}
                                    placeholder="👤 Chưa gán"
                                    size="sm"
                                  />
                                </div>
                                {(showSxTasksInUi || isProductionScope) && (
                                  <select
                                    value={checklistEditForm.executor_company_id || ''}
                                    onChange={(e) => setChecklistEditForm((f) => ({ ...f, executor_company_id: e.target.value }))}
                                    className="h-8 px-2 rounded border border-teal-200 text-xs bg-white min-w-[140px]"
                                  >
                                    <option value="">Cùng công ty chủ</option>
                                    {companies
                                      .filter((c) => !leadCompanyId || String(c.id) !== String(leadCompanyId))
                                      .map((c) => (
                                        <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                                      ))}
                                  </select>
                                )}
                                <span className="flex-1" />
                                <button type="button" onClick={() => setEditingChecklistKey(null)}
                                  className="h-8 px-3 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                                  Hủy
                                </button>
                                <button type="button" onClick={() => saveChecklistEdit(task, ck.id)}
                                  className="h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 cursor-pointer flex items-center gap-1">
                                  <Save className="h-3 w-3" /> Lưu
                                </button>
                              </div>
                            </div>
                          )}

                          {isCkExpanded && !isCkEditing && (
                            <div className="px-2 pb-2 border-t border-emerald-100 pt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                              {ck.description?.trim() && (
                                <div className="rounded bg-slate-50 border border-slate-100 px-2 py-1.5">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Mô tả</p>
                                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{ck.description}</p>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({ckAtts.length})</label>
                                  {uploadingChecklistKey === ckKey ? (
                                    <span className="text-[10px] text-orange-600">Đang upload...</span>
                                  ) : (
                                    <button type="button" onClick={() => uploadChecklistFile(task.id, ck.id)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                                      <FileUp className="h-3 w-3" /> Upload file
                                    </button>
                                  )}
                                </div>
                                <textarea
                                  value={checklistNoteText[ckKey] ?? ck.notes ?? ''}
                                  onChange={(e) => setChecklistNoteText((p) => ({ ...p, [ckKey]: e.target.value }))}
                                  placeholder="Nhập ghi chú cho mục checklist..."
                                  rows={2}
                                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-400 resize-none mb-1.5"
                                />
                                <div className="flex justify-end mb-1">
                                  <button type="button" onClick={() => saveChecklistNotes(task.id, ck.id)} disabled={savingChecklistNote === ckKey}
                                    className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                                      savingChecklistNote === `saved-${ckKey}` ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}>
                                    <Save className="h-2.5 w-2.5" />
                                    {savingChecklistNote === ckKey ? 'Đang lưu...' : savingChecklistNote === `saved-${ckKey}` ? '✓ Đã lưu' : 'Lưu ghi chú'}
                                  </button>
                                </div>
                                {renderChecklistAttachmentList(task.id, ckAtts.filter((a) => a.doc_type !== 'checklist_inline_note'))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {ckItems.length === 0 && (
                      <p className="text-[11px] text-gray-400 italic">Chưa có mục checklist nào.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      value={newChecklistText[task.id] || ''}
                      onChange={(e) => setNewChecklistText((p) => ({ ...p, [task.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addChecklistItem(task, newChecklistText[task.id]);
                          setNewChecklistText((p) => ({ ...p, [task.id]: '' }));
                        }
                      }}
                      placeholder="Thêm mục checklist..."
                      className="flex-1 h-8 px-2 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <button
                      onClick={() => {
                        addChecklistItem(task, newChecklistText[task.id]);
                        setNewChecklistText((p) => ({ ...p, [task.id]: '' }));
                      }}
                      className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-emerald-700 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Ghi chú + Upload gộp chung */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({atts.length})</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleShareClick(task.id)}
                    onDoubleClick={() => { if (task.shared_to_project) openShareModal(task.id); }}
                    className={`text-[10px] flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded ${
                      task.shared_to_project
                        ? 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-300'
                        : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title={task.shared_to_project ? 'Click: tắt · Double-click: đổi khối' : 'Chia sẻ ghi chú sang khối SX / VC / CV'}>
                    {task.shared_to_project ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {task.shared_to_project ? ' Ghi chú đang chia sẻ' : ' Chia sẻ ghi chú'}
                  </button>
                  {uploadingTask === task.id ? (
                    <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                      <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                      {uploadProgress[task.id]
                        ? <span>{uploadProgress[task.id].name} — {uploadProgress[task.id].percent}% {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(0)}MB)` : ''}</span>
                        : 'Đang nén ảnh...'}
                    </span>
                  ) : (
                    <button onClick={() => uploadTaskFile(task.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                      <FileUp className="h-3 w-3" /> Upload file
                    </button>
                  )}
                </div>
              </div>

              {/* Ghi chú (textarea) */}
              <textarea
                value={taskNoteText[task.id] ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setTaskNoteText(p => ({ ...p, [task.id]: val }));
                }}
                placeholder="Nhập ghi chú cho nhiệm vụ này..."
                rows={2}
                className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none mb-1.5"
              />
              <div className="flex justify-end mb-2">
                <button onClick={() => saveTaskNotes(task.id)} disabled={savingNote === task.id}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                    savingNote === 'saved-' + task.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                  <Save className="h-2.5 w-2.5" /> {savingNote === task.id ? 'Đang lưu...' : savingNote === 'saved-' + task.id ? '✓ Đã lưu' : 'Lưu ghi chú'}
                </button>
              </div>

              {/* Upload progress bar */}
              {uploadProgress[task.id] && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                    <span className="truncate max-w-[200px]">📤 {uploadProgress[task.id].name} {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(1)}MB)` : ''}</span>
                    <span className="font-bold">{uploadProgress[task.id].percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress[task.id].percent}%` }} />
                  </div>
                </div>
              )}

              {/* Attachment list */}
              {atts.length > 0 && (
                <div className="space-y-1.5">
                  {renderImageThumbnailGrid(atts, { size: 'md', className: 'mb-1' })}
                  {atts.filter((att) => !isImageAtt(att)).map(att => {
                    const AttIcon = ATT_ICONS[att.doc_type] || FileText;
                    const attOpen = att.file_url ? getFileOpenAnchorProps(att.file_url, { fileName: att.file_name }) : null;
                    return (
                      <div key={att.id} className="py-1.5 px-2 rounded bg-white border group/att">
                        <div className="flex items-start gap-2">
                          <AttIcon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
                              {att.shared_to_project && (
                                <span className="text-[9px] text-green-600 bg-green-50 px-1 py-0.5 rounded shrink-0">🔗 Đã chia sẻ</span>
                              )}
                            </div>
                            {att.notes && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{att.notes}</p>}
                            {att.file_url && attOpen && (
                              <a {...attOpen}
                                className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                            )}
                            <span className="text-[9px] text-gray-400 ml-1">{att.creator?.full_name}</span>
                          </div>
                          <div className="opacity-0 group-hover/att:opacity-100 flex items-center gap-0.5 shrink-0">
                            <button onClick={() => handleShareClick(task.id, att.id)}
                              onDoubleClick={() => { if (att.shared_to_project) openShareModal(task.id, att.id); }}
                              className={`p-0.5 cursor-pointer ${att.shared_to_project ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-green-500'}`}
                              title={att.shared_to_project ? 'Click: tắt · Double-click: đổi khối' : 'Chia sẻ file sang khối SX / VC / CV'}>
                              {att.shared_to_project ? <Share2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                            </button>
                            <button onClick={() => deleteAttachment(task.id, att.id)}
                              className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                        {/* Video preview */}
                        {att.file_url && (att.mime_type?.startsWith('video/') || att.doc_type === 'video') && (
                          <div className="mt-1.5 ml-5">
                            <video src={publicFileUrl(att.file_url)} controls preload="metadata"
                              className="max-h-52 max-w-full rounded-lg border border-gray-200 bg-black" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {atts.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Chưa có đính kèm</p>
              )}
            </div>
          </div>
        )}
      </div>
        )}
      </SortableTaskWrapper>
    );
  };

  const AddTaskForm = ({ stageSlug }) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2">
      <input value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
        placeholder="Tên công việc..." className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500" autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={newTask.priority} onChange={e => setNewTask(p => ({...p, priority: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <input type="datetime-local" value={newTask.deadline} onChange={e => setNewTask(p => ({...p, deadline: e.target.value}))}
          className="px-2 py-1 rounded border text-xs" />
        <select value={newTask.assignee_id} onChange={e => setNewTask(p => ({...p, assignee_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giao cho...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={newTask.supervisor_id} onChange={e => setNewTask(p => ({...p, supervisor_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giám sát...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addTask(stageSlug)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700"><Save className="h-3 w-3 inline mr-1" />Thêm</button>
        <button onClick={() => setShowAdd(null)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200">Hủy</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: Stats + Views + Templates */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{stats.percent}%</div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium" style={{ color: '#000000' }}>{stats.completed}/{stats.total}</span> xong
              {stats.overdue > 0 && <span className="text-red-600 ml-1">• {stats.overdue} quá hạn</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {leadType === 'deal' && hasSxTasks && !isProductionScope && !isSharedWorkspace && (
            <div className="flex items-center gap-1 mr-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setDealTaskView('crm')}
                className={`h-6 px-2 rounded-md text-[10px] font-semibold cursor-pointer ${dealTaskView === 'crm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                title="Hiển thị bộ nhiệm vụ CRM (deal_*)"
              >
                CRM
              </button>
              <button
                type="button"
                onClick={() => setDealTaskView('sx')}
                className={`h-6 px-2 rounded-md text-[10px] font-semibold cursor-pointer ${dealTaskView === 'sx' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                title="Hiển thị bộ nhiệm vụ Sản xuất (sx_*)"
              >
                SX
              </button>
            </div>
          )}
          {leadType === 'deal' && !isSharedWorkspace && (
            <button
              type="button"
              onClick={() => void ensureMissingSxTasks()}
              disabled={ensuringMissingSx}
              className="h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200"
              title="Quét mọi cột pipeline SX và bổ sung nhiệm vụ thiếu theo bộ mẫu xưởng (không xóa task cũ)"
            >
              {ensuringMissingSx
                ? <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                : <span>🏭</span>}
              Bổ sung thiếu SX
            </button>
          )}
          {showCrmTemplatesUi && usePipelineTaskUi && (
            <button
              type="button"
              onClick={() => void ensureMissingPipelineTasks()}
              disabled={ensuringMissing}
              className="h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
              title="Quét mọi cột pipeline CRM và bổ sung nhiệm vụ thiếu theo bộ mẫu (không xóa task cũ)"
            >
              {ensuringMissing
                ? <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                : <span>🔍</span>}
              Bổ sung thiếu CRM
            </button>
          )}
          {showCrmTemplatesUi && pipelineTemplates.length > 0 && (
            <button onClick={() => setShowTemplatePanel(p => !p)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${showTemplatePanel ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'}`}>
              <ClipboardList className="h-3 w-3" /> Gắn mẫu
            </button>
          )}
          {!isSharedWorkspace && (
          <>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {[{ id: 'list', icon: List, label: 'List' }, { id: 'deadline', icon: AlertTriangle, label: 'Deadline' }, { id: 'planner', icon: Users, label: 'Planner' }, { id: 'calendar', icon: Calendar, label: 'Lịch' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              className={`h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <v.icon className="h-3 w-3" />{v.label}
            </button>
          ))}
          </>
          )}
        </div>
      </div>

      {isSharedWorkspace && (
        <div className="rounded-xl border border-teal-300 bg-gradient-to-br from-teal-50 to-white px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-teal-950 flex items-center gap-2">
                <Globe className="h-4 w-4 text-teal-600" /> Không gian làm việc chung
              </p>
              <p className="text-xs text-teal-800 mt-1 max-w-2xl">
                Hiển thị việc giao cho công ty khác
                {ownerCompanyId ? ` (chủ dự án: ${companyLabelById(ownerCompanyId)})` : ''}.
                Nếu chỉ giao một mục checklist thì chỉ thấy mục đó — không lộ bộ nhiệm vụ nội bộ.
                Việc nội bộ xem ở tab <strong>Công việc</strong>.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-teal-900 tabular-nums">{sharedWorkspaceStats.total}</p>
              <p className="text-[10px] text-teal-700 uppercase tracking-wide">mục giao chéo</p>
            </div>
          </div>
          {sharedWorkspaceStats.total === 0 && (
            <p className="text-xs text-teal-700 bg-white/70 border border-teal-200 rounded-lg px-3 py-2">
              Chưa có nhiệm vụ giao cho công ty khác. Mở tab Công việc → sửa nhiệm vụ SX → chọn «Công ty thực hiện» trong bộ mẫu hoặc form sửa.
            </p>
          )}
        </div>
      )}

      {isProductionScope && leadType === 'deal' && !isSharedWorkspace && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-sky-900">📋 Thông tin dự án</p>
            {linkedProjectId && linkedProjectLabel && (
              <span className="text-[10px] text-sky-800 bg-white/80 border border-sky-200 px-2 py-0.5 rounded-full">
                Dự án: {linkedProjectLabel}
              </span>
            )}
          </div>
          {!linkedProjectId && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              Deal chưa gắn dự án — tạo/chọn dự án trước khi lưu ngày đặt/giao.
            </p>
          )}
          {[
            { key: 'order_date', label: 'Ngày đặt hàng', icon: '🛒' },
            { key: 'delivery_date', label: 'Ngày giao hàng', icon: '🚚' },
          ].map((row) => (
            <div key={row.key} className="rounded-lg border border-sky-100 bg-white px-2.5 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!dateChecklist[row.key]}
                  onChange={(e) => setDateChecklist((prev) => ({ ...prev, [row.key]: e.target.checked }))}
                  disabled={!linkedProjectId}
                  className="rounded border-sky-300 text-sky-600 disabled:opacity-40"
                />
                <span>{row.icon} {row.label}</span>
              </label>
              {dateChecklist[row.key] && linkedProjectId && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={projectDates[row.key] || ''}
                    onChange={(e) => setProjectDates((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    className="h-8 px-2 border border-sky-200 rounded-md text-xs outline-none focus:ring-1 focus:ring-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => void saveProjectDateFromChecklist(row.key)}
                    disabled={dateSavingKey === row.key}
                    className="h-8 px-2.5 rounded-md bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700 disabled:opacity-60 cursor-pointer"
                  >
                    {dateSavingKey === row.key ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-sky-700">
            Ngày đặt hàng tự điền khi deal CRM chuyển sang cột Sản xuất (nếu chưa có).
            Lưu thủ công ghi vào dự án. Ngày giao hàng đồng bộ `production_deadline` và nhắc hạn nhiệm vụ `sx_giao_hang`.
          </p>
        </div>
      )}

      {/* Template panel — always available via button */}
      {showTemplatePanel && pipelineTemplates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">📋 Gắn bộ nhiệm vụ mẫu</p>
            <button onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer"><X className="h-3.5 w-3.5 text-amber-600" /></button>
          </div>
          <p className="text-[11px] text-amber-700">
            Chọn bộ mẫu theo giai đoạn pipeline cho {leadType === 'deal' ? 'Deal' : 'Lead'} này.
            {leadPipelineId ? ' Chỉ hiển thị bộ thuộc pipeline của lead/deal.' : ''}
          </p>
          {templatePanelStages.map((stage) => {
            const stageTpls = stageTemplatesMap[stage.slug] || [];
            if (!stageTpls.length) return null;
            const existingCount = (tasksByStage[stage.slug] || []).length;
            return (
              <div key={stage.slug}>
                <p className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: stage.color }}>
                  {stage.icon} {stage.label}
                  {existingCount > 0 && <span className="text-gray-400 font-normal">({existingCount} việc hiện có)</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {stageTpls.map((tpl) => (
                    <button key={tpl.id} onClick={() => { applyTemplate(tpl.id); }}
                      className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm">
                      <ListChecks className="h-3.5 w-3.5" />
                      {tpl.name}
                      <span className="text-[10px] text-amber-500">({tpl.items?.length || 0} việc)</span>
                      {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐ Mặc định</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template quick-apply — only when no tasks exist */}
      {showCrmTemplatesUi && pipelineTemplates.length > 0 && uiTasks.length === 0 && !showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">📋 Chưa có công việc — Áp dụng bộ mẫu mặc định:</p>
          <div className="flex flex-wrap gap-2">
            {(defaultPipelineTemplates.length ? defaultPipelineTemplates : pipelineTemplates)
              .slice(0, 8)
              .map((tpl) => {
                const stage = templatePanelStages.find((s) => (
                  usePipelineTaskUi
                    ? String(s.slug) === String(tpl.pipeline_stage_id)
                    : s.slug === tpl.stage_slug
                ));
                return (
                  <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                    className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                    {stage?.icon || '📋'} {tpl.name} ({tpl.items?.length || 0} việc)
                    {tpl.is_default && ' ⭐'}
                  </button>
                );
              })}
            {pipelineTemplates.length > 8 && (
              <button onClick={() => setShowTemplatePanel(true)} className="px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 cursor-pointer">
                +{pipelineTemplates.length - 8} bộ mẫu khác...
              </button>
            )}
            {pipelineTemplates.length > 0 && pipelineTemplates.length <= 8 && (
              <button onClick={() => setShowTemplatePanel(true)} className="px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 cursor-pointer">
                Xem tất cả bộ mẫu
              </button>
            )}
          </div>
        </div>
      )}

      <DndContext sensors={taskDnDSensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
      <SortableContext items={taskDnDIds} strategy={verticalListSortingStrategy}>

      {/* LIST VIEW — không gian chung: nhóm theo công ty thực hiện */}
      {isSharedWorkspace && (
        <div className="space-y-4">
          {(sharedWorkspaceGroups || []).map((group) => (
            <div key={group.execId} className="border border-teal-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-teal-50/80 border-b border-teal-100">
                <Globe className="h-4 w-4 text-teal-600 shrink-0" />
                <span className="text-sm font-semibold text-teal-950 flex-1 truncate">{group.label}</span>
                <span className="text-[10px] text-teal-700 bg-white border border-teal-200 px-2 py-0.5 rounded-full tabular-nums">
                  {group.completed}/{group.total} xong
                </span>
              </div>
              <div className="divide-y divide-gray-100 px-2 py-2 space-y-2">
                {group.checklistEntries.map(({ task, ck }) => renderSharedChecklistEntry(task, ck))}
                {group.fullTasks.map((t) => renderTaskRow(t))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LIST VIEW — tab Công việc thông thường */}
      {!isSharedWorkspace && viewMode === 'list' && (
        <div className="space-y-3">
          {listStagesToRender.map(stage => {
            const stageTasks = tasksByStage[stage.slug] || [];
            const completed = stageTasks.filter(t => t.status === 'completed').length;
            const expanded = expandedStages[stage.slug] !== false;
            const stageTpls = stageTemplatesMap[stage.slug] || [];
            const defaultTpl = stageTpls.find((t) => t.is_default) || stageTpls[0] || null;
            const taskBundles = groupStageTasksByBundle(stage.slug, stageTasks);
            return (
              <div key={stage.slug} className="border rounded-lg overflow-hidden">
                <div className="flex items-stretch gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setExpandedStages(p => ({ ...p, [stage.slug]: !expanded }))}
                    className="flex flex-1 min-w-0 items-center gap-2 px-1 py-1 rounded-md hover:bg-gray-100 cursor-pointer text-left"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    <span className="text-sm shrink-0">{stage.icon}</span>
                    <span className="text-sm font-semibold truncate" style={{ color: stage.color }}>{stage.label}</span>
                    {defaultTpl && (
                      <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0 truncate max-w-[140px]" title={`Bộ mặc định: ${defaultTpl.name}`}>
                        📋 {defaultTpl.name}{defaultTpl.is_default ? ' ⭐' : ''}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 shrink-0">{completed}/{stageTasks.length}</span>
                    {(() => {
                      const totalFiles = stageTasks.reduce((s, t) => s + (t.file_count || 0), 0);
                      const totalNotes = stageTasks.reduce((s, t) => s + (t.note_count || 0), 0);
                      return (
                        <>
                          {totalFiles > 0 && <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">📎 {totalFiles}</span>}
                          {totalNotes > 0 && <span className="text-[9px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">📝 {totalNotes}</span>}
                        </>
                      );
                    })()}
                    {stageTasks.length > 0 && (
                      <div className="ml-auto w-14 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stageTasks.length ? (completed / stageTasks.length) * 100 : 0}%` }} />
                      </div>
                    )}
                  </button>
                  {stageTasks.length > 0 && stageTasks.some((t) => t.status !== 'completed') && (
                    <button
                      type="button"
                      disabled={bulkCompleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = stageTasks.filter((t) => t.status !== 'completed').length;
                        void completeTasksBulk(stageTasks, `Đánh dấu hoàn thành ${n} nhiệm vụ trong «${stage.label}»?`);
                      }}
                      className="shrink-0 self-center flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1.5 rounded-md disabled:opacity-50 cursor-pointer"
                      title="Hoàn thành nhanh mọi việc chưa xong trong nhóm này"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Xong hết</span>
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="px-2 py-1">
                    {taskBundles.map((bundle) => (
                      <div key={bundle.key} className={bundle.label ? 'mb-2' : ''}>
                        {bundle.label && (
                          <p className="text-[10px] font-semibold text-gray-500 px-2 py-1 flex items-center gap-1.5">
                            <ListChecks className="h-3 w-3 text-amber-600" />
                            {bundle.label}
                            {bundle.isDefault && <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">⭐ Mặc định</span>}
                            <span className="text-gray-400 font-normal">({bundle.tasks.length})</span>
                          </p>
                        )}
                        {bundle.tasks.map((t) => renderTaskRow(t))}
                      </div>
                    ))}
                    {showAdd === stage.slug ? (
                      <AddTaskForm stageSlug={stage.slug} />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 py-1 px-3">
                        <button onClick={() => setShowAdd(stage.slug)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                        {!stageTasks.length && stageTpls.map((tpl) => (
                          <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                            className="text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                            <ListChecks className="h-3 w-3" />
                            {tpl.name} ({tpl.items?.length || 0})
                            {tpl.is_default && ' ⭐'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DEADLINE VIEW */}
      {!isSharedWorkspace && viewMode === 'deadline' && (
        <div className="space-y-3">
          {[
            { key: 'overdue', label: '🔴 Quá hạn', tasks: deadlineGroups.overdue, color: 'border-red-300 bg-red-50' },
            { key: 'today', label: '🟡 Hôm nay', tasks: deadlineGroups.today, color: 'border-amber-300 bg-amber-50' },
            { key: 'thisWeek', label: '🔵 Tuần này', tasks: deadlineGroups.thisWeek, color: 'border-blue-300 bg-blue-50' },
            { key: 'later', label: '⚪ Sau đó', tasks: deadlineGroups.later, color: 'border-gray-200 bg-gray-50' },
            { key: 'noDeadline', label: '⏳ Chưa có hạn', tasks: deadlineGroups.noDeadline, color: 'border-gray-200 bg-gray-50' },
          ].filter(g => g.tasks.length > 0).map(group => (
            <div key={group.key} className={`border rounded-lg ${group.color}`}>
              <div className="px-3 py-2 font-semibold text-xs flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {group.label} <span className="text-gray-400 font-normal">({group.tasks.length})</span>
                </span>
                {group.tasks.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = group.tasks.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(group.tasks, `Đánh dấu hoàn thành ${n} nhiệm vụ trong nhóm ${group.label}?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-white/80 hover:bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa xong trong nhóm này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div className="bg-white rounded-b-lg">
                {group.tasks.map(t => renderTaskRow(t))}
              </div>
            </div>
          ))}
          {uiTasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* PLANNER VIEW */}
      {!isSharedWorkspace && viewMode === 'planner' && (
        <div className="space-y-3">
          {plannerGroups.assignees.map(group => (
            <div key={group.user.id} className="border rounded-lg">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                    {group.user.full_name?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm font-semibold truncate">{group.user.full_name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">({group.tasks.length} việc)</span>
                </div>
                {group.tasks.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = group.tasks.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(group.tasks, `Đánh dấu hoàn thành ${n} nhiệm vụ đang giao cho ${group.user.full_name || 'người này'}?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa xong của người này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div>{group.tasks.map(t => renderTaskRow(t))}</div>
            </div>
          ))}
          {plannerGroups.unassigned.length > 0 && (
            <div className="border rounded-lg border-dashed">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                <span className="text-sm font-semibold text-gray-500">Chưa giao ({plannerGroups.unassigned.length})</span>
                {plannerGroups.unassigned.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = plannerGroups.unassigned.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(plannerGroups.unassigned, `Đánh dấu hoàn thành ${n} nhiệm vụ chưa được giao?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa giao trong nhóm này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div>{plannerGroups.unassigned.map(t => renderTaskRow(t))}</div>
            </div>
          )}
          {uiTasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {!isSharedWorkspace && viewMode === 'calendar' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">◀</button>
            <span className="font-semibold text-sm">Tháng {calMonth.m + 1}/{calMonth.y}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-[10px]">
            {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
              <div key={d} className="bg-gray-50 text-center py-1 font-semibold text-gray-500">{d}</div>
            ))}
            {calDays.map((day, i) => {
              const key = day.toISOString().substring(0, 10);
              const dayTasks = calendarTasks[key] || [];
              const isToday = key === new Date().toISOString().substring(0, 10);
              const isCurrentMonth = day.getMonth() === calMonth.m;
              return (
                <div key={i} className={`bg-white min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="text-[10px] text-gray-500 mb-0.5">{day.getDate()}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-blue-100 text-blue-700'}`}
                      onClick={() => toggleStatus(t)} title={t.title}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div className="text-[8px] text-gray-400">+{dayTasks.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

            {/* Completed tasks (collapsed) */}
      {uiTasks.filter(t => t.status === 'completed').length > 0 && viewMode !== 'list' && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            ✅ Đã hoàn thành ({uiTasks.filter(t => t.status === 'completed').length})
          </summary>
          <div className="mt-2">
            {uiTasks.filter(t => t.status === 'completed').map(t => renderTaskRow(t))}
          </div>
        </details>
      )}

      </SortableContext>
      </DndContext>

      {/* Excel Quotation Import Modal */}
      {excelImportTaskId && (
        <ExcelQuotationImport
          dealId={excelQuotationLeadId}
          leadId={excelQuotationLeadId}
          taskId={excelImportTaskId}
          onImportDone={(data) => {
            setExcelImportTaskId(null);
            loadTasks();
            notifyArtifactsSynced(excelImportTaskId);
            if (data?.draft_only) {
              setImportToast({
                message: 'Đã mở trang tạo báo giá với dữ liệu Excel — chỉnh sửa và bấm Lưu để tạo báo giá & hoàn thành nhiệm vụ.',
                type: 'success',
              });
              setTimeout(() => setImportToast(null), 8000);
              return;
            }
            let msg = `✅ Đã tạo báo giá ${data.code || ''} — ${formatVND(data.total || 0)}. Task đã hoàn thành!`;
            if (data.synced_products?.length) {
              const linked = data.synced_products?.length || 0;

              if (linked > 0) msg += ` 📦 ${linked} sản phẩm đã liên kết với danh mục web.`;
            }
            setImportToast({ message: msg, type: 'success' });
            setTimeout(() => setImportToast(null), 7000);
          }}
          onClose={() => setExcelImportTaskId(null)}
        />
      )}


      {editingTask && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[10049]" onClick={closeEditModal} aria-hidden />
          <div
            ref={editPopoverRef}
            style={editPopoverStyle}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Sửa nhiệm vụ</h3>
              </div>
              <button onClick={closeEditModal} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Tên nhiệm vụ *</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" placeholder="Nhập tên nhiệm vụ..." />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Mô tả</label>
                <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-y min-h-[70px]" placeholder="Mô tả chi tiết..." />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Giai đoạn</label>
                <select value={editForm.stage_slug} onChange={e => setEditForm(f => ({ ...f, stage_slug: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                  <option value="">— Chọn giai đoạn —</option>
                  {STAGE_OPTIONS.map(s => (<option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Hạn hoàn thành</label>
                <input type="datetime-local" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Giám sát</label>
                <select value={editForm.supervisor_id} onChange={e => setEditForm(f => ({ ...f, supervisor_id: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                  <option value="">— Không giám sát —</option>
                  {(users || []).map(u => (<option key={u.id} value={u.id}>{u.full_name}</option>))}
                </select>
              </div>
              {(showSxTasksInUi || isProductionScope) && (
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <Globe className="h-3 w-3 text-teal-600" /> Công ty thực hiện
                  </label>
                  <select
                    value={editForm.executor_company_id || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, executor_company_id: e.target.value }))}
                    className="mt-1 w-full border border-teal-200 rounded-lg px-2 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-300 outline-none"
                  >
                    <option value="">
                      Cùng công ty chủ deal{leadCompanyId ? ` (${companyLabelById(leadCompanyId)})` : ''}
                    </option>
                    {companies
                      .filter((c) => !leadCompanyId || String(c.id) !== String(leadCompanyId))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.short_name ? ` (${c.short_name})` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-teal-700 mt-1">
                    Giao cho công ty khác → họ thấy ở tab Công việc; nhiệm vụ xuất hiện ở tab Không gian chung (hai bên).
                  </p>
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Độ ưu tiên</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {['low','medium','high','urgent'].map(p => (
                    <button key={p} onClick={() => setEditForm(f => ({ ...f, priority: p }))}
                      className={"px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors " + (editForm.priority === p ? PRIORITY_COLORS[p] + ' border-current ring-1 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100')}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <AssigneePickerBlock
                  count={editAssigneeIds.size}
                  pickList={assignPickList}
                  selectedIds={editAssigneeIds}
                  onToggle={toggleEditAssignee}
                  onSelectAll={selectAllEditAssignees}
                  showRolePicker
                  roleById={assigneeRoleById}
                  onRoleChange={setAssigneeRole}
                  defaultNewRole={defaultNewMemberRole}
                  onDefaultNewRoleChange={setDefaultNewMemberRole}
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="flex items-start gap-2 p-2.5 border border-sky-200 bg-sky-50 rounded-lg cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!editForm.requires_quick_verdict}
                    onChange={(e) => setEditForm((f) => ({ ...f, requires_quick_verdict: e.target.checked }))}
                    className="mt-0.5 accent-sky-600"
                  />
                  <span className="flex-1">
                    <span className="text-xs font-semibold text-sky-800 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Ghi chú nhanh Đủ / Chưa
                    </span>
                    <span className="block text-[10px] text-sky-700 mt-0.5">
                      NV phải chọn <b>Đã đủ</b> hoặc <b>Chưa</b> (kèm lý do) trước khi hoàn thành hoặc chuyển giai đoạn.
                    </span>
                  </span>
                </label>
                {isAdmin && (
                  <>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase">Tiện ích (admin)</label>
                    <label className="flex items-start gap-2 p-2.5 border border-emerald-200 bg-emerald-50 rounded-lg cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!editForm.show_excel_quotation_upload}
                        onChange={(e) => setEditForm((f) => ({ ...f, show_excel_quotation_upload: e.target.checked }))}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <span className="flex-1">
                        <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                          <FileSpreadsheet className="h-3 w-3" /> Hiện nút "Upload Excel Báo giá"
                        </span>
                        <span className="block text-[10px] text-emerald-700 mt-0.5">
                          Khi bật, nhiệm vụ sẽ có nút <b>📊 Upload Excel BG</b> ở tab Nhiệm vụ để tải file Excel báo giá và tạo báo giá tự động.
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2 shrink-0">
              <button onClick={closeEditModal} className="h-9 px-4 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer transition-colors">Hủy</button>
              <button onClick={saveEdit} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

      {assigningTask && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[10049]" onClick={closeAssignPopover} aria-hidden />
          <div
            ref={assignPopoverRef}
            style={assignPopoverStyle}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-indigo-50/40">
              <div className="flex items-center gap-2 min-w-0">
                <UserPlus className="h-4 w-4 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">Gán nhân viên</h3>
                  <p className="text-[11px] text-gray-500 line-clamp-1">{assigningTask.title}</p>
                </div>
              </div>
              <button type="button" onClick={closeAssignPopover} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer shrink-0">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              <AssigneePickerBlock
                count={editAssigneeIds.size}
                pickList={assignPickList}
                selectedIds={editAssigneeIds}
                onToggle={toggleEditAssignee}
                onSelectAll={selectAllEditAssignees}
                layout="modal"
                showRolePicker
                roleById={assigneeRoleById}
                onRoleChange={setAssigneeRole}
                defaultNewRole={defaultNewMemberRole}
                onDefaultNewRoleChange={setDefaultNewMemberRole}
              />
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex flex-col gap-2 shrink-0">
              <p className="text-[10px] text-indigo-700">
                NV mới sẽ được thêm vào nhóm với vai trò đã chọn, rồi gán nhiệm vụ.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={closeAssignPopover} className="h-9 px-3 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
                <button type="button" onClick={saveAssign} className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                  <UserPlus className="h-3.5 w-3.5" /> Gán {editAssigneeIds.size || 0} NV
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}

      {lastAssignmentLink && (() => {
        const asnNav = assignmentNavForTask(null, false, lastAssignmentLink.isProduction);
        return (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg bg-indigo-600 text-white text-sm">
          <p className="font-semibold">Đã gán nhân viên</p>
          <p className="text-indigo-100 text-xs mt-0.5 truncate">{lastAssignmentLink.title}</p>
          <div className="flex items-center gap-2 mt-2">
            <Link
              to={asnNav.openUrl(lastAssignmentLink.assignmentId)}
              className="text-xs font-bold bg-white text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
              onClick={() => setLastAssignmentLink(null)}
            >
              Mở {asnNav.label} →
            </Link>
            <button type="button" onClick={() => setLastAssignmentLink(null)} className="text-indigo-200 hover:text-white text-xs cursor-pointer">
              Đóng
            </button>
          </div>
        </div>
        );
      })()}

      {/* Toast notification */}

      {importToast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-in slide-in-from-bottom-4 ${
          importToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <span>{importToast.message}</span>
          <button onClick={() => setImportToast(null)} className="p-0.5 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <CrmArtifactShareModal
        open={!!shareModal}
        leadId={shareModal ? apiLeadIdForTaskId(shareModal.taskId) : leadId}
        taskId={shareModal?.taskId}
        attachmentId={shareModal?.attachmentId}
        title={shareModal?.title}
        initialShared={shareModal?.shared}
        initialModules={shareModal?.modules}
        onClose={() => setShareModal(null)}
        onSaved={onShareModalSaved}
      />

      {attLightboxIndex != null && attLightboxItems.length > 0 && (
        <UploadFileLightbox
          items={attLightboxItems}
          index={attLightboxIndex}
          onIndexChange={setAttLightboxIndex}
          onClose={() => { setAttLightboxIndex(null); setAttLightboxItems([]); }}
        />
      )}
    </div>
  );
}

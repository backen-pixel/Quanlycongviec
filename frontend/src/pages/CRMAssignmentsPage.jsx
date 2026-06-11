import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/utils';
import {
  LayoutGrid, List as ListIcon, Users as UsersIcon, AlertTriangle, Search, Plus,
  Building2, X, CheckCircle2, Circle, Clock, Calendar, User as UserIcon, Trash2,
  Pencil, GripVertical, Flag, MoreVertical, MessageSquare, Send, Paperclip,
  FileText as FileIcon, Download, Upload,
} from 'lucide-react';
import {
  RequirementFilesGallery,
  SubmitFilesCompact,
  StagedAttachmentsSection,
} from '../components/crm/CrmAssignmentFiles';
import {
  loadPersonalColumns,
  savePersonalColumns,
  loadPersonalTaskMap,
  savePersonalTaskMap,
  setTaskPersonalColumn,
  newPersonalColumnId,
} from '../lib/crmAssignmentPersonalColumns';
import {
  buildAssignmentSourceHref,
  assignmentSourceLabel,
  assignmentSourceTooltip,
  assignmentDealCardLabel,
  assignmentSourceFieldLabel,
  isProductionAssignmentsPage,
} from '../lib/assignmentSourceLink';

/**
 * Trang "Giao việc CRM" — độc lập với module Công việc và CRM tasks gắn lead.
 * 4 chế độ xem: Kanban (tự quản lý cột), List, Planner (theo NV), Deadline.
 */

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Thấp',   color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'TB',     color: 'bg-blue-100 text-blue-700' },
  { value: 'high',   label: 'Cao',    color: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Gấp',    color: 'bg-red-100 text-red-700' },
];
const PRIORITY_MAP = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p]));

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Chờ',       icon: Circle,        color: 'text-gray-400' },
  { value: 'in_progress', label: 'Đang làm',  icon: Clock,         color: 'text-blue-500' },
  { value: 'completed',   label: 'Xong',      icon: CheckCircle2,  color: 'text-emerald-500' },
  { value: 'cancelled',   label: 'Huỷ',       icon: X,             color: 'text-gray-400' },
];
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

const COLUMN_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#6B7280', '#0EA5E9'];

const DEFAULT_LS_COMPANY = 'crm_assignments_company_id';
const DEFAULT_LS_VIEW_SCOPE = 'crm_assignments_view_scope';

const AssignmentsPageContext = createContext({
  apiBase: '/crm/assignments',
  assignmentModule: 'crm',
});

function useAssignmentsPageContext() {
  return useContext(AssignmentsPageContext);
}

const DEADLINE_BUCKET_META = [
  { key: 'overdue',    label: '🔴 Quá hạn',     color: '#EF4444' },
  { key: 'today',      label: '🟡 Hôm nay',     color: '#F59E0B' },
  { key: 'thisWeek',   label: '🔵 Tuần này',    color: '#3B82F6' },
  { key: 'later',      label: '⚪ Sau đó',      color: '#94A3B8' },
  { key: 'noDeadline', label: '⏳ Chưa có hạn', color: '#6B7280' },
];

function isAssignmentCreator(task, userId) {
  return String(task?.created_by_id || '') === String(userId || '');
}

function isAssignmentAssignee(task, userId) {
  if (!userId) return false;
  const list = (task?.assignees?.length) ? task.assignees : (task?.assignee ? [task.assignee] : []);
  if (list.some((a) => String(a.id) === String(userId))) return true;
  if (task?.assignee_id && String(task.assignee_id) === String(userId)) return true;
  return false;
}

/** Kéo cột / đổi trạng thái: người tạo hoặc người được giao (chung một cột cho cả nhóm). */
function canMoveAssignment(task, userId) {
  return isAssignmentCreator(task, userId) || isAssignmentAssignee(task, userId);
}

const PIPELINE_STATUS_STAGES = [
  { value: 'pending', label: 'Chưa làm', icon: Circle, activeClass: 'bg-gray-100 border-gray-300 text-gray-700' },
  { value: 'in_progress', label: 'Đang làm', icon: Clock, activeClass: 'bg-blue-100 border-blue-400 text-blue-800' },
  { value: 'completed', label: 'Hoàn thành', icon: CheckCircle2, activeClass: 'bg-emerald-100 border-emerald-400 text-emerald-800' },
];

function AssignmentStatusStages({ status, canEdit, onChange, compact = false }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-1'}`}>
      {PIPELINE_STATUS_STAGES.map((st) => {
        const Icon = st.icon;
        const active = status === st.value;
        return (
          <button
            key={st.value}
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && onChange(st.value)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? st.activeClass + ' ring-1 ring-offset-1' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            } ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
            title={canEdit ? `Đặt: ${st.label}` : st.label}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-50'}`} />
            {st.label}
            {active && <CheckCircle2 className="h-3 w-3 ml-0.5" />}
          </button>
        );
      })}
    </div>
  );
}

function PipelineTaskNotesSection({ item, canEdit, onNotesSaved }) {
  const [text, setText] = useState(item.crm_task?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(item.crm_task?.notes || '');
  }, [item.id, item.crm_task?.notes]);

  if (!item.crm_task_id || !item.lead?.id) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/crm/leads/${item.lead.id}/tasks/${item.crm_task_id}/notes`, { notes: text });
      onNotesSaved?.(text);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
    }
    setSaving(false);
  };

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
      <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4" /> Ghi chú (đồng bộ tab Nhiệm vụ lead/deal)
      </h4>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        rows={3}
        placeholder={canEdit ? 'Nhập ghi chú tiến độ, kết quả làm việc…' : 'Chưa có ghi chú'}
        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white resize-y outline-none focus:ring-2 focus:ring-amber-300"
      />
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="h-8 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu ghi chú'}
          </button>
        </div>
      )}
    </div>
  );
}

function LeadAssignmentLink({ assignment, className = '', variant = 'chip' }) {
  const { assignmentModule } = useAssignmentsPageContext();
  const lead = assignment?.lead;
  if (!lead?.id) return null;
  const href = buildAssignmentSourceHref(assignment, assignmentModule);
  if (!href) return null;
  const isSx = isProductionAssignmentsPage(assignmentModule);
  const label = variant === 'card' ? assignmentDealCardLabel(lead) : assignmentSourceLabel(lead);
  const tooltip = assignmentSourceTooltip(lead, assignmentModule);
  const taskHint = assignment?.crm_task_id
    ? `${tooltip}${isSx ? '' : ''} (focus nhiệm vụ pipeline)`
    : tooltip;
  const isDeal = String(lead.type || '').toLowerCase() === 'deal';
  const icon = isSx ? '🏭' : (isDeal ? '🎯' : '💼');

  if (variant === 'card') {
    return (
      <Link
        to={href}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-1 mt-1 min-w-0 text-[11px] font-medium hover:underline ${
          isSx ? 'text-teal-800 hover:text-teal-950' : 'text-indigo-800 hover:text-indigo-950'
        } ${className}`}
        title={taskHint}
      >
        <span className="shrink-0" aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium max-w-[200px] truncate ${
        isSx
          ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
      } ${className}`}
      title={taskHint}
    >
      {icon} {label}
    </Link>
  );
}

export default function CRMAssignmentsPage({
  apiBase = '/crm/assignments',
  pageTitle = '📋 Giao việc CRM',
  companiesModule = 'crm',
  assignmentModule = 'crm',
  storagePrefix = 'crm_assignments',
  dashboardLink = '/crm/dashboard',
} = {}) {
  const LS_COMPANY = `${storagePrefix}_company_id`;
  const LS_DEPARTMENT = `${storagePrefix}_department_id`;
  const LS_VIEW_SCOPE = `${storagePrefix}_view_scope`;
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = ['admin', 'manager', 'sales_admin'].includes(user?.role);
  const uid = String(user?.id || '');
  const canManageTask = useCallback((t) => isAssignmentCreator(t, uid), [uid]);
  const canMoveTask = useCallback((t) => canMoveAssignment(t, uid), [uid]);

  const [view, setView] = useState('kanban');
  const [columns, setColumns] = useState([]);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    try { return localStorage.getItem(LS_COMPANY) || ''; } catch { return ''; }
  });
  const [filterDepartmentId, setFilterDepartmentId] = useState(() => {
    try { return localStorage.getItem(LS_DEPARTMENT) || ''; } catch { return ''; }
  });

  const [editingItem, setEditingItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [showColumnModal, setShowColumnModal] = useState(null); // null | { id?, name, color, is_done_column }
  const [showPersonalColumnModal, setShowPersonalColumnModal] = useState(null); // null | { view, column? }
  const [viewScope, setViewScope] = useState(() => {
    try { return localStorage.getItem(LS_VIEW_SCOPE) || 'personal'; } catch { return 'personal'; }
  });
  const [showCompletedOpen, setShowCompletedOpen] = useState(false);
  const [personalPlannerCols, setPersonalPlannerCols] = useState([]);
  const [personalDeadlineCols, setPersonalDeadlineCols] = useState([]);
  const [personalPlannerMap, setPersonalPlannerMap] = useState({});
  const [personalDeadlineMap, setPersonalDeadlineMap] = useState({});

  // NV thường: chỉ xem việc giao cho mình
  useEffect(() => {
    if (!uid || isAdmin) return;
    setFilterAssignee(uid);
  }, [isAdmin, uid]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_COMPANY);
    } catch { /* ignore */ }
  }, [filterCompanyId, isAdmin, LS_COMPANY]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterDepartmentId) localStorage.setItem(LS_DEPARTMENT, filterDepartmentId);
      else localStorage.removeItem(LS_DEPARTMENT);
    } catch { /* ignore */ }
  }, [filterDepartmentId, isAdmin, LS_DEPARTMENT]);

  useEffect(() => {
    if (!isAdmin) {
      setDepartments([]);
      if (user?.id) {
        setUsers([{
          id: user.id,
          full_name: user.full_name || user.email || 'Tôi',
          email: user.email,
        }]);
      } else {
        setUsers([]);
      }
      return undefined;
    }
    if (!filterCompanyId) {
      setDepartments([]);
      setUsers([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      api.get('/departments', { params: { company_id: filterCompanyId } }),
      api.get('/users', { params: { company_id: filterCompanyId } }),
    ])
      .then(([dRes, uRes]) => {
        if (cancelled) return;
        const depts = dRes.data?.departments || dRes.data || [];
        setDepartments(Array.isArray(depts) ? depts : []);
        setUsers(uRes.data?.users || uRes.data || []);
      })
      .catch(() => {
        if (!cancelled) {
          setDepartments([]);
          setUsers([]);
        }
      });
    return () => { cancelled = true; };
  }, [isAdmin, filterCompanyId, user?.id, user?.full_name, user?.email]);

  useEffect(() => {
    if (!isAdmin) return;
    setFilterDepartmentId('');
  }, [filterCompanyId, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !filterDepartmentId) return;
    const exists = departments.some((d) => String(d.id) === String(filterDepartmentId));
    if (!exists && departments.length) setFilterDepartmentId('');
  }, [departments, filterDepartmentId, isAdmin]);

  const filteredAssigneeOptions = useMemo(() => {
    if (!isAdmin) {
      return user?.id ? [{
        id: user.id,
        full_name: user.full_name || user.email || 'Tôi',
      }] : [];
    }
    if (filterDepartmentId) {
      return users.filter((u) => String(u.department_id || '') === String(filterDepartmentId));
    }
    return users;
  }, [isAdmin, users, filterDepartmentId, user?.id, user?.full_name, user?.email]);

  useEffect(() => {
    if (!isAdmin || !filterAssignee) return;
    const ok = filteredAssigneeOptions.some((u) => String(u.id) === String(filterAssignee));
    if (!ok) setFilterAssignee('');
  }, [filterDepartmentId, filterCompanyId, filteredAssigneeOptions, filterAssignee, isAdmin]);

  useEffect(() => {
    if (!uid) return;
    setPersonalPlannerCols(loadPersonalColumns(uid, 'planner'));
    setPersonalDeadlineCols(loadPersonalColumns(uid, 'deadline'));
    setPersonalPlannerMap(loadPersonalTaskMap(uid, 'planner'));
    setPersonalDeadlineMap(loadPersonalTaskMap(uid, 'deadline'));
  }, [uid]);

  useEffect(() => {
    try { localStorage.setItem(LS_VIEW_SCOPE, viewScope); } catch { /* ignore */ }
  }, [viewScope]);

  // ─── Load companies (admin) ──
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: companiesModule } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [isAdmin, companiesModule]);

  // ─── Load all data ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (isAdmin && filterCompanyId) params.company_id = filterCompanyId;
      if (isAdmin && filterDepartmentId) params.department_id = filterDepartmentId;
      if (filterAssignee) params.assignee_id = filterAssignee;
      else if (!isAdmin && uid) params.assignee_id = uid;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (search) params.q = search;
      if (assignmentModule) params.assignment_module = assignmentModule;

      const [colRes, itRes] = await Promise.all([
        api.get(`${apiBase}/columns`),
        api.get(apiBase, { params }),
      ]);
      setColumns(colRes.data?.columns || []);
      setItems(itRes.data?.assignments || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [isAdmin, filterCompanyId, filterDepartmentId, filterAssignee, filterStatus, filterPriority, search, apiBase, assignmentModule, uid]);

  useEffect(() => { void load(); }, [load]);

  // Mở chi tiết từ thông báo / liên kết (?open=id)
  const openHandledRef = useRef(null);
  const pendingOpenId = searchParams.get('open');

  useEffect(() => {
    if (!pendingOpenId) openHandledRef.current = null;
  }, [pendingOpenId]);

  useEffect(() => {
    if (!pendingOpenId) return;
    if (openHandledRef.current === pendingOpenId) return;

    let cancelled = false;
    (async () => {
      try {
        let assignment = items.find((t) => String(t.id) === String(pendingOpenId));
        if (!assignment) {
          const { data } = await api.get(`${apiBase}/${pendingOpenId}`);
          assignment = data?.assignment;
        }
        if (cancelled || !assignment) {
          if (!cancelled && !assignment) alert('Không tìm thấy nhiệm vụ này.');
          return;
        }

        openHandledRef.current = pendingOpenId;
        setView('kanban');
        setViewingItem(assignment);
        setItems((prev) => (
          prev.some((t) => String(t.id) === String(assignment.id)) ? prev : [assignment, ...prev]
        ));

        if (isAdmin && assignment.company_id) {
          setFilterCompanyId(String(assignment.company_id));
        }

        const next = new URLSearchParams(searchParams);
        next.delete('open');
        setSearchParams(next, { replace: true });
      } catch (e) {
        if (!cancelled) alert(e.response?.data?.error || e.message || 'Không mở được nhiệm vụ');
      }
    })();

    return () => { cancelled = true; };
  }, [pendingOpenId, items, isAdmin, searchParams, setSearchParams]);

  // ─── Stats ──
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((t) => t.status === 'completed').length;
    const inProgress = items.filter((t) => t.status === 'in_progress').length;
    const overdue = items.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    return { total, completed, inProgress, overdue };
  }, [items]);

  // ─── Group items by column (kanban) ──
  const itemsByColumn = useMemo(() => {
    const map = new Map();
    columns.forEach((c) => map.set(c.id, []));
    map.set('__none__', []);
    items.forEach((t) => {
      const key = t.column_id ? t.column_id : '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    map.forEach((arr) => arr.sort((a, b) => (a.position - b.position) || (a.id - b.id)));
    return map;
  }, [columns, items]);

  const openItems = useMemo(() => {
    let list = items;
    if (!showCompletedOpen) list = list.filter((t) => t.status !== 'completed');
    if (viewScope === 'personal' && uid && (view === 'planner' || view === 'deadline')) {
      list = list.filter((t) => isAssignmentAssignee(t, uid) || isAssignmentCreator(t, uid));
    }
    return list;
  }, [items, showCompletedOpen, viewScope, uid, view]);

  // ─── Planner: group by assignee ──
  const plannerGroups = useMemo(() => {
    const map = new Map();
    const unassigned = [];
    const personalBuckets = new Map();
    personalPlannerCols.forEach((c) => personalBuckets.set(c.id, []));

    openItems.forEach((t) => {
      const pinnedCol = personalPlannerMap[String(t.id)];
      if (pinnedCol && personalBuckets.has(pinnedCol)) {
        personalBuckets.get(pinnedCol).push(t);
        return;
      }
      const list = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
      if (!list.length) { unassigned.push(t); return; }
      list.forEach((u) => {
        if (!map.has(u.id)) map.set(u.id, { user: u, tasks: [] });
        map.get(u.id).tasks.push(t);
      });
    });
    return {
      assignees: [...map.values()],
      unassigned,
      personal: personalPlannerCols.map((c) => ({ column: c, tasks: personalBuckets.get(c.id) || [] })),
    };
  }, [openItems, personalPlannerCols, personalPlannerMap]);

  // ─── Deadline groups ──
  const deadlineGroups = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const g = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    const personalBuckets = new Map();
    personalDeadlineCols.forEach((c) => personalBuckets.set(c.id, []));

    openItems.forEach((t) => {
      const pinnedCol = personalDeadlineMap[String(t.id)];
      if (pinnedCol && personalBuckets.has(pinnedCol)) {
        personalBuckets.get(pinnedCol).push(t);
        return;
      }
      if (!t.deadline) { g.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) g.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) g.today.push(t);
      else if (d < weekEnd) g.thisWeek.push(t);
      else g.later.push(t);
    });
    return {
      ...g,
      personal: personalDeadlineCols.map((c) => ({ column: c, tasks: personalBuckets.get(c.id) || [] })),
    };
  }, [openItems, personalDeadlineCols, personalDeadlineMap]);

  // ─── Mutations ──
  const upsertItem = async (payload, stagedFiles = []) => {
    try {
      let assignmentId = payload.id;
      if (payload.id) {
        await api.put(`${apiBase}/${payload.id}`, payload);
      } else {
        const r = await api.post(apiBase, { ...payload, assignment_module: assignmentModule });
        assignmentId = r.data?.assignment?.id || r.data?.id;
      }
      // Upload file yêu cầu đã chọn ở bước tạo
      if (assignmentId && stagedFiles.length) {
        for (const item of stagedFiles) {
          try {
            if (item?._stagedUrl) {
              await api.post(`${apiBase}/${assignmentId}/files/link`, {
                url: item.url,
                file_name: item.name,
                kind: 'req',
              });
            } else {
              const fd = new FormData();
              fd.append('file', item);
              fd.append('kind', 'req');
              await api.post(`${apiBase}/${assignmentId}/files`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
            }
          } catch (upErr) {
            console.warn('Upload error:', upErr.response?.data?.error || upErr.message);
          }
        }
      }
      setShowItemModal(false); setEditingItem(null);
      void load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu nhiệm vụ'); }
  };
  const removeItem = async (id) => {
    if (!confirm('Xoá nhiệm vụ này?')) return;
    try {
      await api.delete(`${apiBase}/${id}`);
      void load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không xóa được nhiệm vụ');
    }
  };
  const updateItem = async (id, patch) => {
    const task = items.find((t) => String(t.id) === String(id));
    const progressKeys = new Set(['status', 'column_id', 'position']);
    const progressOnly = patch && Object.keys(patch).every((k) => progressKeys.has(k));
    if (progressOnly && task && !canMoveTask(task)) {
      alert('Chỉ người tạo hoặc người được giao mới được cập nhật tiến độ công việc này.');
      return;
    }
    try {
      const { data } = await api.put(`${apiBase}/${id}`, patch);
      const updated = data?.assignment;
      if (updated) {
        setItems((prev) => prev.map((t) => (String(t.id) === String(id) ? { ...t, ...updated } : t)));
        setViewingItem((prev) => (prev && String(prev.id) === String(id) ? { ...prev, ...updated } : prev));
      } else {
        void load();
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không cập nhật được nhiệm vụ');
    }
  };
  const moveItem = async (id, column_id, position) => {
    const task = items.find((t) => String(t.id) === String(id));
    if (task && !canMoveTask(task)) {
      alert('Chỉ người tạo hoặc người được giao mới được di chuyển công việc này.');
      return;
    }
    try {
      const { data } = await api.post(`${apiBase}/${id}/move`, { column_id, position });
      const updated = data?.assignment;
      if (updated) {
        setItems((prev) => prev.map((t) => (String(t.id) === String(id) ? { ...t, ...updated } : t)));
        setViewingItem((prev) => (prev && String(prev.id) === String(id) ? { ...prev, ...updated } : prev));
      } else {
        void load();
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không di chuyển được nhiệm vụ');
    }
  };

  const upsertColumn = async (payload) => {
    try {
      const { company_id: _drop, ...body } = payload;
      if (payload.id) await api.put(`${apiBase}/columns/${payload.id}`, body);
      else await api.post(`${apiBase}/columns`, body);
      setShowColumnModal(null);
      void load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu cột'); }
  };
  const removeColumn = async (id) => {
    if (!confirm('Xoá cột này? Các nhiệm vụ sẽ về cột "Chưa phân loại".')) return;
    try { await api.delete(`${apiBase}/columns/${id}`); void load(); } catch {}
  };

  const upsertPersonalColumn = (payload) => {
    const targetView = payload.view || showPersonalColumnModal?.view || view;
    if (!uid || !targetView) return;
    const setter = targetView === 'planner' ? setPersonalPlannerCols : setPersonalDeadlineCols;
    const current = targetView === 'planner' ? personalPlannerCols : personalDeadlineCols;
    const next = payload.id
      ? current.map((c) => (c.id === payload.id ? { ...c, name: payload.name.trim(), color: payload.color } : c))
      : [...current, { id: newPersonalColumnId(), name: payload.name.trim(), color: payload.color, position: current.length }];
    setter(next);
    savePersonalColumns(uid, targetView, next);
    setShowPersonalColumnModal(null);
  };

  const removePersonalColumn = (targetView, colId) => {
    if (!uid || !confirm('Xoá cột cá nhân này? Việc trong cột sẽ quay về nhóm mặc định.')) return;
    const cols = targetView === 'planner' ? personalPlannerCols : personalDeadlineCols;
    const map = targetView === 'planner' ? personalPlannerMap : personalDeadlineMap;
    const nextCols = cols.filter((c) => c.id !== colId);
    const nextMap = { ...map };
    Object.keys(nextMap).forEach((k) => { if (nextMap[k] === colId) delete nextMap[k]; });
    if (targetView === 'planner') {
      setPersonalPlannerCols(nextCols);
      setPersonalPlannerMap(nextMap);
    } else {
      setPersonalDeadlineCols(nextCols);
      setPersonalDeadlineMap(nextMap);
    }
    savePersonalColumns(uid, targetView, nextCols);
    savePersonalTaskMap(uid, targetView, nextMap);
  };

  const pinTaskToPersonalColumn = (targetView, taskId, colId) => {
    if (!uid) return;
    const nextMap = setTaskPersonalColumn(uid, targetView, taskId, colId);
    if (targetView === 'planner') setPersonalPlannerMap(nextMap);
    else setPersonalDeadlineMap(nextMap);
  };

  // ─── DnD ──
  const [dragId, setDragId] = useState(null);
  const onDragStart = (id) => () => setDragId(id);
  const onDropCol = (colId) => (e) => {
    e.preventDefault();
    if (!dragId) return;
    const list = itemsByColumn.get(colId) || [];
    void moveItem(dragId, colId === '__none__' ? null : colId, list.length);
    setDragId(null);
  };
  const allowDrop = (e) => e.preventDefault();

  const hasFilters = search || filterPriority || filterStatus
    || (isAdmin && (filterCompanyId || filterDepartmentId || filterAssignee));
  const clearFilters = () => {
    setSearch(''); setFilterPriority(''); setFilterStatus('');
    if (isAdmin) {
      setFilterCompanyId('');
      setFilterDepartmentId('');
      setFilterAssignee('');
    } else if (uid) {
      setFilterAssignee(uid);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <AssignmentsPageContext.Provider value={{ apiBase, assignmentModule }}>
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#000000' }}>{pageTitle}</h1>
          <p className="text-sm text-gray-500">
            {stats.total} nhiệm vụ — {stats.completed} hoàn thành — {stats.inProgress} đang làm
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {assignmentModule === 'production'
              ? 'Module riêng — chỉ nhiệm vụ Sản xuất (sx_*). Không lẫn với Giao việc CRM.'
              : 'Module riêng — chỉ nhiệm vụ CRM / deal. Không lẫn với Giao việc Sản xuất.'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Kanban: cột dùng chung. Planner / Deadline: cột cá nhân (chỉ bạn thấy) — bấm <strong>Thêm cột</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {[
              { id: 'kanban',   icon: LayoutGrid,     label: 'Kanban' },
              { id: 'list',     icon: ListIcon,       label: 'List' },
              { id: 'planner',  icon: UsersIcon,      label: 'Planner' },
              { id: 'deadline', icon: AlertTriangle,  label: 'Deadline' },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  view === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />{v.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditingItem(null); setShowItemModal(true); }}
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-4 w-4" />Giao việc
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Tổng',
            value: stats.total,
            icon: ListIcon,
            gradient: 'from-slate-100 via-gray-50 to-white',
            border: 'border-slate-300',
            iconBg: 'bg-slate-200',
            iconColor: 'text-slate-700',
            accent: 'bg-slate-500',
          },
          {
            label: 'Đang làm',
            value: stats.inProgress,
            icon: Clock,
            gradient: 'from-blue-100 via-sky-50 to-white',
            border: 'border-blue-300',
            iconBg: 'bg-blue-200',
            iconColor: 'text-blue-700',
            accent: 'bg-blue-500',
          },
          {
            label: 'Quá hạn',
            value: stats.overdue,
            icon: AlertTriangle,
            gradient: 'from-red-100 via-rose-50 to-white',
            border: 'border-red-300',
            iconBg: 'bg-red-200',
            iconColor: 'text-red-700',
            accent: 'bg-red-500',
          },
          {
            label: 'Hoàn thành',
            value: stats.completed,
            icon: CheckCircle2,
            gradient: 'from-emerald-100 via-green-50 to-white',
            border: 'border-emerald-300',
            iconBg: 'bg-emerald-200',
            iconColor: 'text-emerald-700',
            accent: 'bg-emerald-500',
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className={`relative overflow-hidden bg-gradient-to-br ${kpi.gradient} border ${kpi.border} rounded-2xl p-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 ${kpi.accent}`} />
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl ${kpi.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-3xl font-extrabold leading-none tracking-tight" style={{ color: '#000000' }}>
                    {kpi.value}
                  </p>
                  <p className="text-xs font-semibold mt-1 uppercase tracking-wide" style={{ color: '#000000' }}>
                    {kpi.label}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FILTERS */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhiệm vụ..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm outline-none focus:border-blue-500"
          />
        </div>
        {isAdmin && (
          <>
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
              className="h-9 min-w-[160px] px-3 rounded-lg border text-xs bg-white"
              title="Lọc theo công ty"
            >
              <option value="">Tất cả công ty</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
              ))}
            </select>
            <select
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
              disabled={!filterCompanyId}
              className="h-9 min-w-[160px] px-3 rounded-lg border text-xs bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              title={filterCompanyId ? 'Lọc theo phòng ban' : 'Chọn công ty trước'}
            >
              <option value="">{filterCompanyId ? 'Tất cả phòng ban' : 'Phòng ban'}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </>
        )}
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          disabled={!isAdmin}
          className="h-9 min-w-[160px] max-w-[220px] px-3 rounded-lg border text-xs bg-white disabled:opacity-80"
          title={isAdmin ? 'Lọc theo người nhận' : 'Chỉ hiển thị việc giao cho bạn'}
        >
          {isAdmin ? (
            <>
              <option value="">Tất cả nhân viên</option>
              {filteredAssigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </>
          ) : (
            <option value={uid}>{user?.full_name || 'Việc của tôi'}</option>
          )}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">Trạng thái</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">Ưu tiên</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {!isAdmin && (
          <span className="text-[11px] text-gray-500 px-2 py-1 rounded-lg bg-gray-100">
            Chỉ việc giao cho bạn
          </span>
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="h-9 px-3 text-xs text-red-500 hover:bg-red-50 rounded-lg cursor-pointer flex items-center gap-1">
            <X className="h-3 w-3" />Xóa lọc
          </button>
        )}
      </div>

      {/* VIEWS */}
      {view === 'kanban' && (
        <KanbanView
          columns={columns}
          itemsByColumn={itemsByColumn}
          users={users}
          onAddColumn={() => setShowColumnModal({ name: '', color: COLUMN_COLORS[0], is_done_column: false })}
          onEditColumn={(col) => setShowColumnModal(col)}
          onDeleteColumn={removeColumn}
          onAddCard={(colId) => { setEditingItem({ column_id: colId }); setShowItemModal(true); }}
          onOpenCard={(t) => setViewingItem(t)}
          onEditCard={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDeleteCard={removeItem}
          onUpdateCard={updateItem}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onDragStart={onDragStart}
          onDropCol={onDropCol}
          allowDrop={allowDrop}
        />
      )}

      {view === 'list' && (
        <ListView
          items={items}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
        />
      )}

      {(view === 'planner' || view === 'deadline') && (
        <PersonalViewToolbar
          view={view}
          viewScope={viewScope}
          onViewScopeChange={setViewScope}
          showCompletedOpen={showCompletedOpen}
          onShowCompletedOpenChange={setShowCompletedOpen}
          onAddColumn={() => setShowPersonalColumnModal({ view, column: null })}
        />
      )}

      {view === 'planner' && (
        <PlannerView
          groups={plannerGroups}
          viewScope={viewScope}
          personalColumns={personalPlannerCols}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onEditPersonalColumn={(col) => setShowPersonalColumnModal({ view: 'planner', column: col })}
          onDeletePersonalColumn={(colId) => removePersonalColumn('planner', colId)}
          onDropPersonalColumn={(taskId, colId) => pinTaskToPersonalColumn('planner', taskId, colId)}
        />
      )}

      {view === 'deadline' && (
        <DeadlineView
          groups={deadlineGroups}
          personalColumns={personalDeadlineCols}
          onOpen={(t) => setViewingItem(t)}
          onEdit={(t) => { if (!canManageTask(t)) return; setEditingItem(t); setShowItemModal(true); }}
          onDelete={removeItem}
          onUpdate={updateItem}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          onEditPersonalColumn={(col) => setShowPersonalColumnModal({ view: 'deadline', column: col })}
          onDeletePersonalColumn={(colId) => removePersonalColumn('deadline', colId)}
          onDropPersonalColumn={(taskId, colId) => pinTaskToPersonalColumn('deadline', taskId, colId)}
        />
      )}

      {showItemModal && (
        <ItemModal
          item={editingItem}
          users={users}
          columns={columns}
          companies={companies}
          isAdmin={isAdmin}
          defaultCompanyId={isAdmin ? filterCompanyId : (user?.company_id || '')}
          onClose={() => { setShowItemModal(false); setEditingItem(null); }}
          onSave={upsertItem}
        />
      )}
      {showColumnModal && (
        <ColumnModal
          column={showColumnModal}
          onClose={() => setShowColumnModal(null)}
          onSave={upsertColumn}
        />
      )}
      {showPersonalColumnModal && (
        <PersonalColumnModal
          column={showPersonalColumnModal.column}
          viewLabel={showPersonalColumnModal.view === 'deadline' ? 'Deadline' : 'Planner'}
          onClose={() => setShowPersonalColumnModal(null)}
          onSave={(form) => upsertPersonalColumn({ ...form, view: showPersonalColumnModal.view })}
        />
      )}
      {viewingItem && (
        <DetailModal
          item={viewingItem}
          columns={columns}
          onClose={() => setViewingItem(null)}
          onEdit={(t) => { if (!canManageTask(t)) return; setViewingItem(null); setEditingItem(t); setShowItemModal(true); }}
          onUpdate={updateItem}
          onDelete={(id) => { removeItem(id); setViewingItem(null); }}
        />
      )}
    </div>
    </AssignmentsPageContext.Provider>
  );
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
function KanbanView({
  columns, itemsByColumn, users: _users, onAddColumn, onEditColumn, onDeleteColumn,
  onAddCard, onOpenCard, onEditCard, onDeleteCard, onUpdateCard, onDragStart, onDropCol, allowDrop,
  canManageTask, canMoveTask,
}) {
  const noneList = itemsByColumn.get('__none__') || [];
  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 400 }}>
      {columns.map((col) => {
        const list = itemsByColumn.get(col.id) || [];
        return (
          <div
            key={col.id}
            className="w-72 shrink-0 rounded-xl border border-white/40 flex flex-col shadow-sm backdrop-blur-md"
            style={{ background: 'rgba(255,255,255,0.35)' }}
            onDragOver={allowDrop}
            onDrop={onDropCol(col.id)}
          >
            <div className="px-3 py-2 flex items-center gap-2 border-b border-white/40 rounded-t-xl" style={{ borderTopColor: col.color, borderTopWidth: 3, background: 'rgba(255,255,255,0.45)' }}>
              <GripVertical className="h-3.5 w-3.5 text-gray-300" />
              <span className="text-sm font-semibold flex-1 truncate" style={{ color: col.color }}>
                {col.name} {col.is_done_column ? <CheckCircle2 className="h-3 w-3 inline text-emerald-500" /> : null}
              </span>
              <span className="text-[11px] text-gray-400">{list.length}</span>
              <button onClick={() => onEditColumn(col)} className="text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => onDeleteColumn(col.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[80px]">
              {list.map((t) => (
                <Card key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} onDragStart={onDragStart} onOpen={onOpenCard} onEdit={onEditCard} onDelete={onDeleteCard} onUpdate={onUpdateCard} />
              ))}
              <button
                onClick={() => onAddCard(col.id)}
                className="w-full h-8 rounded-lg text-xs text-gray-500 hover:bg-white hover:text-blue-600 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />Thêm việc
              </button>
            </div>
          </div>
        );
      })}

      {noneList.length > 0 && (
        <div className="w-72 shrink-0 bg-gray-50 rounded-xl border border-dashed" onDragOver={allowDrop} onDrop={onDropCol('__none__')}>
          <div className="px-3 py-2 border-b text-sm font-semibold text-gray-500">
            Chưa phân loại <span className="text-[11px] text-gray-400">{noneList.length}</span>
          </div>
          <div className="p-2 space-y-2">
            {noneList.map((t) => (
              <Card key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} onDragStart={onDragStart} onOpen={onOpenCard} onEdit={onEditCard} onDelete={onDeleteCard} onUpdate={onUpdateCard} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onAddColumn}
        className="w-72 shrink-0 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 text-sm text-gray-500 hover:text-blue-700 flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="h-4 w-4" />Thêm cột
      </button>
    </div>
  );
}

function Card({ task, canManage, canMove, onDragStart, onOpen, onEdit, onDelete, onUpdate }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
  return (
    <div
      draggable={!!canMove}
      onDragStart={canMove ? onDragStart(task.id) : undefined}
      onClick={() => onOpen?.(task)}
      className="bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md cursor-pointer group"
      title={canMove ? 'Click xem chi tiết — kéo để chuyển cột' : 'Click xem chi tiết (chỉ người tạo / người được giao mới kéo được)'}
    >
      <div className="flex items-start gap-1.5">
        {canMove ? (
        <div className="mt-0.5 shrink-0 flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onUpdate(task.id, { status: task.status === 'in_progress' ? 'pending' : 'in_progress' })}
            className={`p-0.5 rounded cursor-pointer ${task.status === 'in_progress' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-500'}`}
            title="Đang làm"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' })}
            className={`p-0.5 rounded cursor-pointer ${task.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-emerald-500'}`}
            title="Hoàn thành"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        </div>
        ) : (
          <span className="mt-0.5 shrink-0" title="Chỉ người tạo / người được giao đổi trạng thái">
            {task.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : task.status === 'in_progress' ? (
              <Clock className="h-4 w-4 text-blue-500" />
            ) : (
              <Circle className="h-4 w-4 text-gray-300" />
            )}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <LeadAssignmentLink assignment={task} variant="card" />
          {task.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pri.color}`}>{pri.label}</span>
            {task.deadline && (
              <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
              </span>
            )}
            <AssigneeStack assignees={task.assignees} fallback={task.assignee} />
          </div>
        </div>
        {canManage && (
          <div className="opacity-0 group-hover:opacity-100 flex flex-col gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3 w-3" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssigneeStack({ assignees, fallback, compact }) {
  const list = (assignees && assignees.length) ? assignees : (fallback ? [fallback] : []);
  if (!list.length) return null;
  if (list.length === 1) {
    return (
      <span className="text-[10px] text-blue-700 flex items-center gap-0.5">
        <UserIcon className="h-2.5 w-2.5" />{list[0].full_name}
      </span>
    );
  }
  const max = 4;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="inline-flex items-center" title={list.map((u) => u.full_name).join(', ')}>
      <span className="flex -space-x-1.5">
        {shown.map((u) => (
          <span
            key={u.id}
            className={`${compact ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]'} rounded-full bg-blue-500 text-white font-bold flex items-center justify-center border border-white`}
          >
            {(u.full_name || '?').charAt(0)}
          </span>
        ))}
        {extra > 0 && (
          <span className={`${compact ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[9px]'} rounded-full bg-gray-500 text-white font-bold flex items-center justify-center border border-white`}>
            +{extra}
          </span>
        )}
      </span>
      <span className="text-[10px] text-blue-700 ml-1">{list.length} NV</span>
    </span>
  );
}

// ─── LIST / PLANNER / DEADLINE — shared row ──────────────────────────────────
function TaskRow({ task, canManage, canMove, onOpen, onEdit, onDelete, onUpdate, columns }) {
  const pri = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
  const col = columns.find((c) => c.id === task.column_id);
  return (
    <div className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 border-b last:border-0">
      {canMove ? (
      <div className="shrink-0 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: task.status === 'in_progress' ? 'pending' : 'in_progress' })}
          className={`p-1 rounded cursor-pointer ${task.status === 'in_progress' ? 'text-blue-600 bg-blue-50' : 'text-gray-300 hover:text-blue-500'}`}
          title="Đang làm"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' })}
          className={`p-1 rounded cursor-pointer ${task.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-300 hover:text-emerald-500'}`}
          title="Hoàn thành"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      </div>
      ) : (
        <span className="shrink-0">
          {task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : task.status === 'in_progress' ? <Clock className="h-4 w-4 text-blue-500" />
            : <Circle className="h-4 w-4 text-gray-300" />}
        </span>
      )}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => (onOpen || onEdit)?.(task)}>
        <p className={`text-sm hover:text-blue-700 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
        <LeadAssignmentLink assignment={task} variant="card" />
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {col && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (col.color || '#999') + '20', color: col.color }}>{col.name}</span>}
          {task.deadline && (
            <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
              <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
            </span>
          )}
          <AssigneeStack assignees={task.assignees} fallback={task.assignee} compact />
          {task.created_by && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5" title="Người giao">
              <Flag className="h-2.5 w-2.5" />{task.created_by.full_name}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pri.color}`}>{pri.label}</span>
      {canManage && (
        <>
          <button onClick={() => onEdit(task)} className="text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(task.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}

function ListView({ items, columns, onOpen, onEdit, onDelete, onUpdate, canManageTask, canMoveTask }) {
  if (!items.length) return <p className="text-center text-sm text-gray-400 py-12">Chưa có nhiệm vụ nào</p>;
  return (
    <div className="bg-white rounded-xl border divide-y">
      {items.map((t) => <TaskRow key={t.id} task={t} canManage={canManageTask(t)} canMove={canMoveTask(t)} columns={columns} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} />)}
    </div>
  );
}

function PersonalViewToolbar({
  view, viewScope, onViewScopeChange, showCompletedOpen, onShowCompletedOpenChange, onAddColumn,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/60">
      <span className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide">
        {view === 'deadline' ? 'Deadline' : 'Planner'} — giao diện cá nhân
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => onViewScopeChange('personal')}
          className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${viewScope === 'personal' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Của tôi
        </button>
        <button
          type="button"
          onClick={() => onViewScopeChange('team')}
          className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${viewScope === 'team' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Toàn team
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showCompletedOpen}
          onChange={(e) => onShowCompletedOpenChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        Hiện việc đã xong
      </label>
      <button
        type="button"
        onClick={onAddColumn}
        className="ml-auto h-8 px-3 rounded-lg border-2 border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-white text-xs text-indigo-700 font-medium flex items-center gap-1.5 cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" />Thêm cột cá nhân
      </button>
    </div>
  );
}

function PersonalColumnBoard({
  column, tasks, onEditColumn, onDeleteColumn, onDropTask, droppable = true, onOpen, onEdit, onDelete, onUpdate,
  columns, canManageTask, canMoveTask, dragId, setDragId,
}) {
  const allowDrop = droppable ? (e) => e.preventDefault() : undefined;
  const onDrop = droppable ? (e) => {
    e.preventDefault();
    if (dragId && onDropTask) {
      onDropTask(dragId, column.id);
      setDragId(null);
    }
  } : undefined;
  const onDragStart = (id) => () => setDragId(id);

  return (
    <div
      className="w-72 shrink-0 rounded-xl border border-white/40 flex flex-col shadow-sm backdrop-blur-md"
      style={{ background: 'rgba(255,255,255,0.35)' }}
      onDragOver={allowDrop}
      onDrop={onDrop}
    >
      <div
        className="px-3 py-2 flex items-center gap-2 border-b border-white/40 rounded-t-xl"
        style={{ borderTopColor: column.color, borderTopWidth: 3, background: 'rgba(255,255,255,0.45)' }}
      >
        <span className="text-sm font-semibold flex-1 truncate" style={{ color: column.color }}>{column.name}</span>
        <span className="text-[11px] text-gray-400">{tasks.length}</span>
        {onEditColumn && (
          <button type="button" onClick={() => onEditColumn(column)} className="text-gray-400 hover:text-blue-600 cursor-pointer">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDeleteColumn && (
          <button type="button" onClick={() => onDeleteColumn(column.id)} className="text-gray-400 hover:text-red-500 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[80px]">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            canManage={canManageTask(t)}
            canMove={canMoveTask(t)}
            onDragStart={onDragStart}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
        {!tasks.length && (
          <p className="text-[10px] text-gray-400 text-center py-4 px-1">Kéo việc vào đây</p>
        )}
      </div>
    </div>
  );
}

function PlannerView({
  groups, viewScope, personalColumns, onOpen, onEdit, onDelete, onUpdate, columns,
  canManageTask, canMoveTask, onEditPersonalColumn, onDeletePersonalColumn, onDropPersonalColumn,
}) {
  const [dragId, setDragId] = useState(null);
  const teamCols = [
    ...groups.assignees.map((g) => ({
      id: `user_${g.user.id}`,
      name: g.user.full_name,
      color: '#3B82F6',
      tasks: g.tasks,
      fixed: true,
    })),
    ...(groups.unassigned.length ? [{
      id: '__unassigned',
      name: 'Chưa giao',
      color: '#94A3B8',
      tasks: groups.unassigned,
      fixed: true,
    }] : []),
  ];
  const personalCols = (groups.personal || []).map((g) => ({
    id: g.column.id,
    name: g.column.name,
    color: g.column.color,
    tasks: g.tasks,
    fixed: false,
  }));
  const allMineTasks = [
    ...groups.assignees.flatMap((g) => g.tasks),
    ...groups.unassigned,
  ];
  const personalDisplayCols = personalCols.length
    ? personalCols
    : [{
      id: '__mine',
      name: 'Việc của tôi',
      color: '#3B82F6',
      tasks: allMineTasks,
      fixed: true,
    }];
  const displayCols = viewScope === 'personal'
    ? personalDisplayCols
    : [...teamCols, ...personalCols];

  if (viewScope === 'team' && !displayCols.length) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-gray-500">Chưa có nhiệm vụ đang mở trong Planner.</p>
        <p className="text-xs text-gray-400">Bật «Hiện việc đã xong», chuyển sang <strong>Của tôi</strong>, hoặc bấm <strong>Thêm cột cá nhân</strong>.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 360 }}>
      {displayCols.map((col) => (
        <PersonalColumnBoard
          key={col.id}
          column={col}
          tasks={col.tasks}
          droppable={!col.fixed || String(col.id).startsWith('pc_')}
          onEditColumn={col.fixed ? null : onEditPersonalColumn}
          onDeleteColumn={col.fixed ? null : onDeletePersonalColumn}
          onDropTask={onDropPersonalColumn}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
          onUpdate={onUpdate}
          columns={columns}
          canManageTask={canManageTask}
          canMoveTask={canMoveTask}
          dragId={dragId}
          setDragId={setDragId}
        />
      ))}
    </div>
  );
}

function DeadlineView({
  groups, personalColumns, onOpen, onEdit, onDelete, onUpdate, columns,
  canManageTask, canMoveTask, onEditPersonalColumn, onDeletePersonalColumn, onDropPersonalColumn,
}) {
  const [dragId, setDragId] = useState(null);
  const bucketCols = DEADLINE_BUCKET_META.map((b) => ({
    id: b.key,
    name: b.label,
    color: b.color,
    tasks: groups[b.key] || [],
    fixed: true,
  }));
  const personalCols = (groups.personal || []).map((g) => ({
    id: g.column.id,
    name: g.column.name,
    color: g.column.color,
    tasks: g.tasks,
    fixed: false,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Nhóm theo hạn</p>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 280 }}>
          {bucketCols.map((col) => (
            <PersonalColumnBoard
              key={col.id}
              column={col}
              tasks={col.tasks}
              droppable={false}
              onEditColumn={null}
              onDeleteColumn={null}
              onDropTask={null}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdate={onUpdate}
              columns={columns}
              canManageTask={canManageTask}
              canMoveTask={canMoveTask}
              dragId={dragId}
              setDragId={setDragId}
            />
          ))}
        </div>
      </div>
      {(personalCols.length > 0 || personalColumns.length > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">Cột cá nhân</p>
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 200 }}>
            {personalCols.map((col) => (
              <PersonalColumnBoard
                key={col.id}
                column={col}
                tasks={col.tasks}
                onEditColumn={onEditPersonalColumn}
                onDeleteColumn={onDeletePersonalColumn}
                onDropTask={onDropPersonalColumn}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
                onUpdate={onUpdate}
                columns={columns}
                canManageTask={canManageTask}
                canMoveTask={canMoveTask}
                dragId={dragId}
                setDragId={setDragId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalColumnModal({ column, viewLabel, onClose, onSave }) {
  const [form, setForm] = useState({
    id: column?.id,
    name: column?.name || '',
    color: column?.color || COLUMN_COLORS[0],
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{form.id ? 'Sửa cột cá nhân' : `Thêm cột ${viewLabel}`}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-gray-500">Cột chỉ hiển thị với bạn — dùng để nhóm việc theo ý (kéo thả nhiệm vụ vào cột).</p>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Tên cột <span className="text-red-500">*</span></label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
            placeholder="VD: Việc khẩn, Chờ duyệt…"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Màu</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLUMN_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((p) => ({ ...p, color: c }))}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-gray-900' : 'border-white'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Huỷ</button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer">Lưu</button>
        </div>
      </form>
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ItemModal({ item, users: _initialUsers, columns, companies, isAdmin, defaultCompanyId, onClose, onSave }) {
  const { apiBase } = useAssignmentsPageContext();
  const initialAssigneeIds = item?.assignees?.length
    ? item.assignees.map((a) => String(a.id))
    : (item?.assignee_id ? [String(item.assignee_id)] : []);

  const [form, setForm] = useState(() => ({
    id: item?.id || undefined,
    title: item?.title || '',
    description: item?.description || '',
    column_id: item?.column_id || (columns[0]?.id ?? ''),
    priority: item?.priority || 'medium',
    status: item?.status || 'pending',
    deadline: item?.deadline ? new Date(item.deadline).toISOString().slice(0, 16) : '',
    company_id: item?.company_id || defaultCompanyId || '',
  }));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const [lookups, setLookups] = useState({ departments: [], regions: [], users: [] });
  const [loadingLk, setLoadingLk] = useState(true);
  const [selRegions, setSelRegions] = useState(new Set());
  const [selDepts, setSelDepts] = useState(new Set());
  const [selUsers, setSelUsers] = useState(new Set(initialAssigneeIds));
  const [userSearch, setUserSearch] = useState('');
  const [stagedFiles, setStagedFiles] = useState([]);

  // Tải lookups mỗi khi đổi công ty
  useEffect(() => {
    let cancel = false;
    setLoadingLk(true);
    const params = {};
    if (form.company_id) params.company_id = form.company_id;
    api.get(`${apiBase}/lookups`, { params })
      .then((r) => {
        if (cancel) return;
        const lk = r.data || { departments: [], regions: [], users: [] };
        setLookups(lk);
      })
      .catch(() => { if (!cancel) setLookups({ departments: [], regions: [], users: [] }); })
      .finally(() => { if (!cancel) setLoadingLk(false); });
    return () => { cancel = true; };
  }, [form.company_id, apiBase]);

  // Lọc danh sách NV theo region/department/search
  const filteredUsers = useMemo(() => {
    const all = lookups.users || [];
    return all.filter((u) => {
      if (selDepts.size && !selDepts.has(String(u.department_id))) return false;
      if (selRegions.size) {
        const uregs = (u.region_ids || []).map(String);
        if (!uregs.some((r) => selRegions.has(r))) return false;
      }
      if (userSearch) {
        const s = userSearch.toLowerCase();
        if (!(u.full_name || '').toLowerCase().includes(s)
          && !(u.email || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [lookups.users, selDepts, selRegions, userSearch]);

  const toggleSet = (set, value) => {
    const next = new Set(set);
    const v = String(value);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const addAllFiltered = () => setSelUsers((p) => {
    const next = new Set(p);
    filteredUsers.forEach((u) => next.add(String(u.id)));
    return next;
  });
  const clearAllSelected = () => setSelUsers(new Set());

  const addUsersOfDept = (deptId) => setSelUsers((p) => {
    const next = new Set(p);
    (lookups.users || []).filter((u) => String(u.department_id) === String(deptId)).forEach((u) => next.add(String(u.id)));
    return next;
  });
  const addUsersOfRegion = (regionId) => setSelUsers((p) => {
    const next = new Set(p);
    (lookups.users || []).filter((u) => (u.region_ids || []).map(String).includes(String(regionId))).forEach((u) => next.add(String(u.id)));
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      assignee_ids: [...selUsers],
      department_ids: [],
      region_ids: [],
      column_id: form.column_id || null,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      company_id: form.company_id || null,
    }, stagedFiles);
  };

  const selectedUserObjects = useMemo(() => {
    const byId = new Map((lookups.users || []).map((u) => [String(u.id), u]));
    return [...selUsers].map((id) => byId.get(id)).filter(Boolean);
  }, [selUsers, lookups.users]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-lg font-bold">{form.id ? 'Sửa nhiệm vụ' : 'Giao việc mới'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* Cơ bản */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 block mb-1">Tiêu đề <span className="text-red-500">*</span></label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
                autoFocus
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 block mb-1">Mô tả</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-blue-500"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="text-xs text-gray-600 block mb-1">Công ty</label>
                <select
                  value={form.company_id}
                  onChange={(e) => { set('company_id', e.target.value); setSelRegions(new Set()); setSelDepts(new Set()); setSelUsers(new Set()); }}
                  className="w-full h-9 px-2 border rounded-lg text-sm"
                >
                  <option value="">-- Tất cả công ty --</option>
                  {(companies || []).map((co) => <option key={co.id} value={co.id}>{co.short_name || co.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Cột Kanban</label>
              <select value={form.column_id || ''} onChange={(e) => set('column_id', e.target.value)} className="w-full h-9 px-2 border rounded-lg text-sm">
                <option value="">-- Chưa phân loại --</option>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Ưu tiên</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className="w-full h-9 px-2 border rounded-lg text-sm">
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Trạng thái</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full h-9 px-2 border rounded-lg text-sm">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 block mb-1">Deadline</label>
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => set('deadline', e.target.value)}
                className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Người được giao */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-800">
                Giao cho ({selUsers.size} nhân viên)
              </label>
              {selUsers.size > 0 && (
                <button type="button" onClick={clearAllSelected} className="text-xs text-red-500 hover:underline cursor-pointer">Bỏ chọn tất cả</button>
              )}
            </div>

            {/* Khu vực */}
            {lookups.regions.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] text-gray-500 mb-1">Khu vực (lọc):</p>
                <div className="flex flex-wrap gap-1.5">
                  {lookups.regions.map((r) => {
                    const active = selRegions.has(String(r.id));
                    return (
                      <span key={r.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setSelRegions((p) => toggleSet(p, r.id))}
                          className={`h-7 px-2.5 rounded-l-full text-xs cursor-pointer ${active ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                        >
                          📍 {r.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => addUsersOfRegion(r.id)}
                          title="Chọn cả khu vực"
                          className="h-7 px-2 rounded-r-full text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 cursor-pointer border-l border-purple-300"
                        >
                          + Cả KV
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phòng ban */}
            {lookups.departments.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] text-gray-500 mb-1">Phòng ban (lọc):</p>
                <div className="flex flex-wrap gap-1.5">
                  {lookups.departments.map((d) => {
                    const active = selDepts.has(String(d.id));
                    return (
                      <span key={d.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => setSelDepts((p) => toggleSet(p, d.id))}
                          className={`h-7 px-2.5 rounded-l-full text-xs cursor-pointer ${active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                          style={active ? {} : { color: d.color || undefined }}
                        >
                          🏢 {d.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => addUsersOfDept(d.id)}
                          title="Chọn cả phòng"
                          className="h-7 px-2 rounded-r-full text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 cursor-pointer border-l border-blue-300"
                        >
                          + Cả phòng
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nhân viên */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Tìm nhân viên..."
                    className="w-full h-8 pl-8 pr-2 border rounded-lg text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={addAllFiltered}
                  className="h-8 px-3 text-xs rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                >
                  + Chọn tất cả ({filteredUsers.length})
                </button>
              </div>

              {/* Chip đã chọn */}
              {selectedUserObjects.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2 p-2 bg-emerald-50 rounded-lg max-h-24 overflow-y-auto">
                  {selectedUserObjects.map((u) => (
                    <span key={u.id} className="inline-flex items-center gap-1 bg-white border border-emerald-300 rounded-full px-2 py-0.5 text-xs">
                      {u.full_name}
                      <button type="button" onClick={() => setSelUsers((p) => toggleSet(p, u.id))} className="text-gray-400 hover:text-red-500 cursor-pointer">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                {loadingLk ? (
                  <p className="text-center text-xs text-gray-400 py-6">Đang tải...</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-6">Không có nhân viên phù hợp</p>
                ) : (
                  filteredUsers.map((u) => {
                    const checked = selUsers.has(String(u.id));
                    const dept = lookups.departments.find((d) => String(d.id) === String(u.department_id));
                    return (
                      <label key={u.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelUsers((p) => toggleSet(p, u.id))}
                          className="cursor-pointer"
                        />
                        <span className="text-sm flex-1">{u.full_name}</span>
                        {dept && <span className="text-[10px] text-gray-500">🏢 {dept.name}</span>}
                        {u.position && <span className="text-[10px] text-gray-400">{u.position}</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {form.id ? (
            <AttachmentsSection
              assignmentId={form.id}
              kind="req"
              title="📋 File yêu cầu công việc"
              hint="File brief / hướng dẫn cho NV thực hiện. Người giao việc tải lên."
              emptyText="Chưa có file yêu cầu nào"
              color="blue"
            />
          ) : (
            <StagedAttachmentsSection files={stagedFiles} onChange={setStagedFiles} />
          )}
          {form.id && <CommentSection assignmentId={form.id} />}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Huỷ</button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer">
            {form.id ? 'Lưu' : `Giao cho ${selUsers.size} NV`}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColumnModal({ column, onClose, onSave }) {
  const [form, setForm] = useState({
    id: column?.id,
    name: column?.name || '',
    color: column?.color || COLUMN_COLORS[0],
    is_done_column: !!column?.is_done_column,
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{form.id ? 'Sửa cột' : 'Thêm cột'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Tên cột <span className="text-red-500">*</span></label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full h-9 px-3 border rounded-lg text-sm outline-none focus:border-blue-500"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Màu</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLUMN_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((p) => ({ ...p, color: c }))}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-gray-900' : 'border-white'}`}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_done_column}
            onChange={(e) => setForm((p) => ({ ...p, is_done_column: e.target.checked }))}
          />
          Cột "Hoàn thành" — kéo việc vào đây tự đánh dấu xong
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Huỷ</button>
          <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer">Lưu</button>
        </div>
      </form>
    </div>
  );
}

// ─── DETAIL MODAL (chỉ XEM khi bấm vào thẻ) ──────────────────────────────────
function DetailModal({ item, columns, onClose, onEdit, onUpdate, onDelete }) {
  const { user } = useAuth();
  const { assignmentModule } = useAssignmentsPageContext();
  const uid = String(user?.id || '');
  const isCreator = String(item.created_by_id || '') === uid;
  const assigneeList = (item.assignees && item.assignees.length) ? item.assignees : (item.assignee ? [item.assignee] : []);
  const isAssignee = assigneeList.some((a) => String(a.id) === uid);
  const canMove = isCreator || isAssignee;

  const [localItem, setLocalItem] = useState(item);
  useEffect(() => { setLocalItem(item); }, [item]);

  const pri = PRIORITY_MAP[localItem.priority] || PRIORITY_MAP.medium;
  const status = STATUS_MAP[localItem.status] || STATUS_MAP.pending;
  const col = columns.find((c) => c.id === localItem.column_id);
  const overdue = localItem.deadline && new Date(localItem.deadline) < new Date() && localItem.status !== 'completed';

  const fmtDt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const setStatus = (nextStatus) => {
    onUpdate(localItem.id, { status: nextStatus });
    setLocalItem((prev) => ({ ...prev, status: nextStatus }));
  };

  const onNotesSaved = (notes) => {
    setLocalItem((prev) => ({
      ...prev,
      crm_task: { ...(prev.crm_task || {}), notes },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="px-5 py-3 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {col && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: (col.color || '#999') + '20', color: col.color }}>{col.name}</span>}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${pri.color}`}>⚑ {pri.label}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 bg-gray-100 ${status.color}`}>
                <status.icon className="h-3 w-3" />{status.label}
              </span>
              {overdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">🚨 Quá hạn</span>}
            </div>
            <h2 className={`text-xl font-bold ${localItem.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{localItem.title}</h2>
            {canMove && (
              <AssignmentStatusStages status={localItem.status} canEdit onChange={setStatus} />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isCreator && (
              <>
                <button onClick={() => onEdit(localItem)} title="Sửa" className="h-8 w-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center cursor-pointer">
                  <Pencil className="h-4 w-4 text-gray-600" />
                </button>
                <button onClick={() => onDelete(localItem.id)} title="Xoá" className="h-8 w-8 rounded-lg border hover:bg-red-50 flex items-center justify-center cursor-pointer">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </>
            )}
            <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-gray-500">Người giao</p>
              <p className="font-medium">{localItem.created_by?.full_name || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Công ty</p>
              <p className="font-medium">{localItem.company?.short_name || localItem.company?.name || '—'}</p>
            </div>
            {localItem.lead && (
              <div className="md:col-span-2">
                <p className="text-[11px] text-gray-500">{assignmentSourceFieldLabel(assignmentModule)}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <LeadAssignmentLink assignment={localItem} />
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] text-gray-500">Tạo lúc</p>
              <p className="font-medium">{fmtDt(localItem.created_at)}</p>
            </div>
            <div>
              <p className={`text-[11px] ${overdue ? 'text-red-500' : 'text-gray-500'}`}>Deadline</p>
              <p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{fmtDt(localItem.deadline)}</p>
            </div>
          </div>

          {localItem.description && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-600 font-semibold mb-1">📋 Mô tả công việc</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{localItem.description}</p>
            </div>
          )}

          <PipelineTaskNotesSection item={localItem} canEdit={canMove} onNotesSaved={onNotesSaved} />

          {/* Assignees */}
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Giao cho ({assigneeList.length} nhân viên)</p>
            <div className="flex flex-wrap gap-1.5">
              {assigneeList.length === 0 ? (
                <span className="text-xs text-gray-400">Chưa giao</span>
              ) : assigneeList.map((u) => (
                <span key={u.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${String(u.id) === uid ? 'bg-blue-100 border-blue-300 text-blue-800 font-semibold' : 'bg-white border-gray-300 text-gray-700'}`}>
                  <span className="h-4 w-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold">{(u.full_name || '?').charAt(0)}</span>
                  {u.full_name}
                  {String(u.id) === uid && <span className="text-[9px]">(Bạn)</span>}
                </span>
              ))}
            </div>
          </div>

          <RequirementFilesGallery assignmentId={localItem.id} canUpload={isCreator} />

          <CommentSection assignmentId={localItem.id} />

          <SubmitFilesCompact assignmentId={localItem.id} canUpload={isAssignee || isCreator} />
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border text-sm cursor-pointer">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ─── ATTACHMENTS (file đính kèm nhiệm vụ) ────────────────────────────────────
// kind: 'req' (yêu cầu, do người giao) hoặc 'sub' (nộp bài, do NV làm)
function AttachmentsSection({ assignmentId, kind = 'req', canUpload = true, title, hint, color = 'blue', emptyText }) {
  const { apiBase } = useAssignmentsPageContext();
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`${apiBase}/${assignmentId}/files`, { params: { kind } });
      setFiles(r.data?.files || []);
    } catch { setFiles([]); }
    setLoading(false);
  }, [assignmentId, kind]);

  useEffect(() => { void load(); }, [load]);

  const onPick = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        await api.post(`${apiBase}/${assignmentId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      void load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi upload file. Nếu mới deploy, chạy migration database/194_crm_assignment_files.sql');
    }
    setUploading(false);
  };

  const remove = async (fileId) => {
    if (!confirm('Xoá file này?')) return;
    try {
      await api.delete(`${apiBase}/${assignmentId}/files/${fileId}`);
      void load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi xóa file');
    }
  };

  const fmtSize = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImg = (f) => (f.mime_type || '').startsWith('image/');
  const isVid = (f) => (f.mime_type || '').startsWith('video/');

  const palette = {
    blue:    { btn: 'bg-blue-600 hover:bg-blue-700',       border: 'border-blue-200',    bg: 'bg-blue-50/40' },
    emerald: { btn: 'bg-emerald-600 hover:bg-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50/40' },
  }[color] || { btn: 'bg-blue-600 hover:bg-blue-700', border: 'border-blue-200', bg: 'bg-blue-50/40' };

  return (
    <div className={`border rounded-xl ${palette.border} p-3 ${palette.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          {title} ({files.length})
        </h4>
        {canUpload && (
          <label className={`h-8 px-3 rounded-lg ${palette.btn} text-white text-xs font-medium flex items-center gap-1 cursor-pointer`}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Đang tải...' : 'Tải lên'}
            <input type="file" multiple onChange={onPick} disabled={uploading} className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.dwg,.dxf" />
          </label>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-500 mb-2">{hint}</p>}

      {loading ? (
        <p className="text-center text-xs text-gray-400 py-3">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-3">{emptyText || 'Chưa có file'}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 p-2 border rounded-lg bg-white hover:bg-gray-50 group">
              {isImg(f) ? (
                <a href={f.file_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={f.file_url} alt={f.file_name} className="h-10 w-10 object-cover rounded" />
                </a>
              ) : isVid(f) ? (
                <div className="h-10 w-10 rounded bg-purple-50 flex items-center justify-center text-lg shrink-0">🎬</div>
              ) : (
                <div className="h-10 w-10 rounded bg-blue-50 flex items-center justify-center shrink-0">
                  <FileIcon className="h-5 w-5 text-blue-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <a href={f.file_url} target="_blank" rel="noreferrer" className="text-sm text-gray-800 hover:text-blue-600 hover:underline truncate block" title={f.file_name}>
                  {f.file_name}
                </a>
                <p className="text-[10px] text-gray-400">
                  {fmtSize(f.file_size)} • {f.uploader?.full_name || ''}
                </p>
              </div>
              <a href={f.file_url} download={f.file_name} className="text-gray-400 hover:text-blue-600 cursor-pointer opacity-0 group-hover:opacity-100">
                <Download className="h-3.5 w-3.5" />
              </a>
              {(String(f.uploaded_by) === String(user?.id)) && (
                <button type="button" onClick={() => remove(f.id)} className="text-gray-400 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COMMENT THREAD (có trả lời) ─────────────────────────────────────────────
function groupAssignmentCommentsByParent(flat) {
  const m = new Map();
  for (const c of flat || []) {
    const pk = c.parent_id != null && c.parent_id !== '' ? String(c.parent_id) : '__root__';
    if (!m.has(pk)) m.set(pk, []);
    m.get(pk).push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return m;
}

function CommentSection({ assignmentId }) {
  const { apiBase } = useAssignmentsPageContext();
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'sales_admin'].includes(user?.role);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`${apiBase}/${assignmentId}/comments`);
      setComments(r.data?.comments || []);
    } catch { setComments([]); }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  const commentsByParent = useMemo(() => groupAssignmentCommentsByParent(comments), [comments]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const v = text.trim();
    if (!v || posting) return;
    setPosting(true);
    try {
      const payload = { content: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      await api.post(`${apiBase}/${assignmentId}/comments`, payload);
      setText('');
      setReplyTo(null);
      void load();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi gửi'); }
    setPosting(false);
  };

  const saveEdit = async (cid) => {
    const v = editText.trim();
    if (!v) return;
    try {
      await api.put(`${apiBase}/${assignmentId}/comments/${cid}`, { content: v });
      setEditingId(null); setEditText('');
      void load();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
  };

  const remove = async (cid) => {
    if (!confirm('Xoá ghi chú này? Các trả lời liên quan cũng sẽ bị xoá.')) return;
    try { await api.delete(`${apiBase}/${assignmentId}/comments/${cid}`); void load(); } catch {}
  };

  const startReply = (c) => {
    setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' });
    setEditingId(null);
    setEditText('');
  };

  const fmt = (dt) => {
    try {
      const d = new Date(dt);
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const canEdit = (c) => String(c.user_id) === String(user?.id) || isAdmin;

  const renderCommentBranch = (parentKey, depth) => {
    const list = commentsByParent.get(parentKey) || [];
    return list.map((c) => (
      <div key={c.id} className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-3 pt-1' : ''}>
        <div className="flex items-start gap-2 group">
          <div className="h-7 w-7 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {(c.user?.full_name || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-800">{c.user?.full_name || 'Đã xóa'}</span>
                <span className="text-[10px] text-gray-400">{fmt(c.created_at)}</span>
                {c.updated_at && c.updated_at !== c.created_at && (
                  <span className="text-[10px] text-gray-400 italic">(đã sửa)</span>
                )}
              </div>
              {editingId === c.id ? (
                <div className="space-y-1">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border rounded text-sm outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => saveEdit(c.id)} className="h-7 px-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-pointer">Lưu</button>
                    <button type="button" onClick={() => { setEditingId(null); setEditText(''); }} className="h-7 px-2.5 rounded border text-xs cursor-pointer">Huỷ</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
              )}
            </div>
            {editingId !== c.id && (
              <div className="flex flex-wrap gap-2 mt-0.5 px-1 text-[11px] opacity-70 group-hover:opacity-100">
                <button type="button" onClick={() => startReply(c)} className="text-blue-600 hover:underline cursor-pointer">Trả lời</button>
                {canEdit(c) && (
                  <>
                    <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.content); setReplyTo(null); }} className="text-blue-600 hover:underline cursor-pointer">Sửa</button>
                    <button type="button" onClick={() => remove(c.id)} className="text-red-500 hover:underline cursor-pointer">Xoá</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {renderCommentBranch(String(c.id), depth + 1)}
      </div>
    ));
  };

  return (
    <div className="border-t pt-3">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
        <MessageSquare className="h-4 w-4" />
        Ghi chú & bình luận ({comments.length})
      </h4>

      <div className="space-y-2 max-h-72 overflow-y-auto mb-2">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-4">Đang tải...</p>
        ) : comments.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-4">Chưa có ghi chú nào</p>
        ) : (
          renderCommentBranch('__root__', 0)
        )}
      </div>

      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800">
          <span>Đang trả lời <strong>{replyTo.name}</strong></span>
          <button type="button" onClick={() => setReplyTo(null)} className="text-blue-600 hover:underline cursor-pointer shrink-0">Huỷ</button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
          }}
          rows={2}
          placeholder={replyTo ? `Trả lời ${replyTo.name}... (Ctrl+Enter để gửi)` : 'Thêm ghi chú/bình luận... (Ctrl+Enter để gửi)'}
          className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:border-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || posting}
          className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" />{replyTo ? 'Trả lời' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}


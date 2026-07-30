import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { memberModulesFromUser } from '../lib/memberModuleCounts';
import {
  ClipboardList, Plus, Calendar, CheckCircle2, Circle, Clock, X, Pencil, Trash2, Save,
  LayoutGrid, Target, Factory, Truck, ExternalLink,
} from 'lucide-react';

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
  { id: 'logistics', label: 'VC', icon: Truck, emoji: '🚚' },
];

const TASK_SOURCE_OPTIONS = [
  { value: 'customer_request', label: 'Phát sinh từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi từ nhân viên' },
];

const ERROR_MODULE_OPTIONS = [
  { value: 'crm', label: 'CRM' },
  { value: 'production', label: 'Xưởng (SX)' },
  { value: 'logistics', label: 'VC / LĐ' },
];

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
function companyIdForAssignModule(moduleId, { companyId, sxCompanyId, vcCompanyId }) {
  if (moduleId === 'production') return sxCompanyId || companyId || null;
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
  if (!memberBelongsToModule(member, moduleId === 'all' ? 'all' : moduleId)) return false;
  if (moduleId === 'all') return true;
  const cid = companyIdForAssignModule(moduleId, companyScope);
  return memberBelongsToCompany(member, cid);
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
  if (mod === 'logistics') return 'VC';
  return 'CRM';
}

function taskSourceLabel(type) {
  if (type === 'employee_error') return 'Lỗi NV';
  if (type === 'customer_request') return 'Từ KH';
  return null;
}

function errorModuleLabel(mod) {
  if (mod === 'production') return 'Xưởng';
  if (mod === 'logistics') return 'VC/LĐ';
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

  const companyId = companyIdProp || leadCompanyId || null;
  const companyScope = useMemo(
    () => ({ companyId, sxCompanyId, vcCompanyId }),
    [companyId, sxCompanyId, vcCompanyId],
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
      total: new Set([...seen.crm, ...seen.production, ...seen.logistics]).size,
    };
  }, [members, companyScope]);

  /** Danh sách NV theo tab (module + công ty khối). Tab «Tất cả» = mọi thành viên deal. */
  const filteredMembers = useMemo(
    () => members.filter((m) => memberMatchesAssignPool(m, moduleTab, companyScope)),
    [members, moduleTab, companyScope],
  );

  /** NV trong form tạo/sửa — luôn theo khối form (kể cả khi tab = Tất cả → CRM). */
  const formModule = moduleTab === 'all' ? 'crm' : moduleTab;
  const formMembers = useMemo(
    () => members.filter((m) => memberMatchesAssignPool(m, formModule, companyScope)),
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
    setEditingId(null);
    setShowForm(false);
  }, [columns]);

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
    if (companyIdProp) setLeadCompanyId(companyIdProp);
  }, [companyIdProp]);

  useEffect(() => {
    if (['crm', 'production', 'logistics'].includes(defaultModule)) {
      setModuleTab(defaultModule);
    }
  }, [defaultModule, leadId]);

  /** Khi đổi tab / scope cty — bỏ chọn NV không còn thuộc pool. */
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

  const selectAllFilteredMembers = () => {
    setMemberIds(new Set(formMembers.map((m) => String(m.user_id)).filter(Boolean)));
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
    const pool = formMembers;
    if (pool.length) {
      setMemberIds(new Set(pool.map((m) => String(m.user_id)).filter(Boolean)));
    }
  };

  const openEdit = (a) => {
    const mod = String(a.assignment_module || '').toLowerCase();
    if (mod === 'crm' || mod === 'production' || mod === 'logistics') {
      setModuleTab(mod);
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
    if (taskSourceType === 'employee_error' && !employeeErrorModule) {
      return alert('Chọn khối phát sinh lỗi: CRM / Xưởng / VC-LĐ');
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
    };
    setSaving(true);
    try {
      if (editingId) {
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
        await api.post(`/crm/leads/${leadId}/assignments`, {
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
      }
      resetForm();
      await loadAssignments();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu phân công');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, nextStatus) => {
    try {
      await api.put(`/crm/assignments/${id}`, { status: nextStatus });
      await loadAssignments();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật trạng thái');
    }
  };

  const remove = async (id) => {
    if (!confirm('Xóa phân công này?')) return;
    try {
      await api.delete(`/crm/assignments/${id}`);
      if (editingId === id) resetForm();
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

  const createDisabled = !formMembers.length;

  const activeModuleMeta = MODULE_TABS.find((t) => t.id === moduleTab) || MODULE_TABS[0];
  const scopeHint = formCompanyId
    ? ` · cùng công ty khối ${assignmentModuleLabel(formModule)}`
    : '';

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
          <Link
            to="/crm/assignments"
            className="h-8 px-2 rounded-md text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Giao việc</span>
          </Link>
          <button
            type="button"
            disabled={createDisabled}
            onClick={openCreate}
            title={createDisabled ? 'Chưa có NV đúng khối + công ty để giao' : undefined}
            className="h-8 px-2.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 bg-violet-600 text-white hover:bg-violet-700 shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Thêm
            {moduleTab !== 'all' && (
              <span className="opacity-90 hidden sm:inline">· {assignmentModuleLabel(formModule)}</span>
            )}
          </button>
        </nav>
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
                title={`Thành viên: ${memberN} · Phân công: ${assignN}`}
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
            {taskSourceType === 'employee_error' && (
              <div>
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
                  Độc lập với khối người nhận ({assignmentModuleLabel(formModule)})
                </p>
              </div>
            )}
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
              Giao cho thành viên · {assignmentModuleLabel(formModule)}
              {formCompanyId ? ' · lọc theo công ty' : ''}
            </span>
            <button
              type="button"
              onClick={selectAllFilteredMembers}
              className="text-[10px] text-violet-700 hover:underline cursor-pointer"
            >
              Chọn tất cả ({formMembers.length})
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto rounded border border-gray-100 divide-y">
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
                {formCompanyId ? ' đúng công ty' : ''}
              </p>
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
              disabled={saving}
              onClick={submit}
              className="h-8 px-4 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
            >
              <Save size={12} />
              {saving ? 'Đang lưu…' : (editingId ? 'Lưu' : `Giao cho ${memberIds.size || 0} NV`)}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-4">Đang tải…</p>
      ) : filteredAssignments.length === 0 ? (
        <p className="text-[11px] text-violet-700/70 text-center py-4 border border-dashed border-violet-100 rounded-xl">
          {moduleTab === 'all'
            ? 'Chưa có phân công cho thành viên deal này'
            : `Chưa có phân công khối ${assignmentModuleLabel(moduleTab)}`}
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
            return (
              <div
                key={a.id}
                className="flex items-start gap-2 p-2.5 bg-white border border-violet-100 rounded-lg hover:border-violet-200 transition"
              >
                <StIcon className={`h-4 w-4 shrink-0 mt-0.5 ${
                  a.status === 'completed' ? 'text-emerald-500'
                    : a.status === 'in_progress' ? 'text-blue-500'
                      : 'text-gray-300'
                }`} />
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
                    {a.crm_task_id && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-violet-100 text-violet-700">
                        Có CV
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    {col && <span style={{ color: col.color }}>{col.name}</span>}
                    {assigneeNames && <span>👤 {assigneeNames}</span>}
                    {a.deadline && (
                      <span className="inline-flex items-center gap-0.5">
                        <Calendar size={10} />{formatDate(a.deadline)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {ASSIGN_STATUSES.filter((s) => s.value !== 'cancelled').map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => updateStatus(a.id, s.value)}
                        className={`h-6 px-1.5 rounded text-[10px] cursor-pointer border ${
                          a.status === s.value
                            ? 'bg-violet-100 border-violet-300 text-violet-800 font-semibold'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
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
                    to={`/crm/assignments?open=${a.id}`}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Mở chi tiết"
                  >
                    <ClipboardList size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

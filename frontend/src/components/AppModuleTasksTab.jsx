import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { formatDateTime, PRIORITY_LABELS, TASK_PRIORITY_COLORS as PRIORITY_COLORS } from '../lib/utils';
import { isoToDatetimeLocalValue, datetimeLocalValueToIso } from '../lib/datetimeLocal';
import {
  CheckCircle2, Circle, Loader2, Plus, Trash2, List, Calendar,
  ChevronDown, ChevronRight, ClipboardList, Target, Paperclip,
  Edit3, UserPlus, User, FileText, ListChecks, X, Save,
} from 'lucide-react';

function normalizeChecklist(arr) {
  return (Array.isArray(arr) ? arr : []).map((c, i) => (
    typeof c === 'string'
      ? { id: `ck_${i}`, title: c, done: false }
      : {
          id: c?.id || `ck_${i}`,
          title: c?.title || c?.label || '',
          done: !!(c?.done ?? c?.is_completed),
          notes: c?.notes || '',
          description: c?.description || '',
        }
  ));
}

function StatusIcon({ status, className }) {
  if (status === 'done' || status === 'completed') {
    return <CheckCircle2 className={className || 'h-4 w-4 text-emerald-500'} />;
  }
  if (status === 'in_progress') {
    return <Circle className={className || 'h-4 w-4 text-blue-500 fill-blue-500/20'} />;
  }
  return <Circle className={className || 'h-4 w-4 text-gray-300'} />;
}

/**
 * Tab Công việc module — chrome + nút hàng nhiệm vụ giống CRMTasksTab.
 */
export default function AppModuleTasksTab({
  moduleKey,
  recordId,
  stages = [],
  currentStageId = null,
  users = [],
  refreshKey = 0,
  onChanged,
}) {
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState('list');
  const [collapsed, setCollapsed] = useState({});
  const [showTpl, setShowTpl] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', description: '', priority: 'medium', assignee_id: '' });
  const [assignTaskId, setAssignTaskId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, tplRes] = await Promise.all([
        api.get(`/app-modules/${moduleKey}/records/${recordId}/tasks`),
        api.get(`/app-modules/${moduleKey}/task-templates`).catch(() => ({ data: { templates: [] } })),
      ]);
      setTasks(tRes.data.tasks || []);
      setTemplates((tplRes.data.templates || []).filter((t) => t.is_active !== false));
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [moduleKey, recordId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const overdueCount = tasks.filter((t) => (
    t.status !== 'done' && t.deadline && new Date(t.deadline).getTime() < Date.now()
  )).length;

  const stageName = (id) => stages.find((s) => String(s.id) === String(id))?.name || 'Khác';

  const grouped = useMemo(() => {
    const byStage = new Map();
    const unstaged = [];
    const tplStageByItem = new Map();
    templates.forEach((tpl) => {
      (tpl.items || tpl.app_module_task_template_items || []).forEach((it) => {
        if (it?.id) tplStageByItem.set(String(it.id), tpl.stage_id || null);
      });
    });
    const sorted = [...tasks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    sorted.forEach((task) => {
      const sid = task.template_item_id
        ? tplStageByItem.get(String(task.template_item_id))
        : null;
      if (sid) {
        const key = String(sid);
        if (!byStage.has(key)) byStage.set(key, []);
        byStage.get(key).push(task);
      } else {
        unstaged.push(task);
      }
    });

    const groups = [];
    const orderedStages = [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    orderedStages.forEach((s) => {
      const list = byStage.get(String(s.id)) || [];
      if (list.length) {
        groups.push({
          id: String(s.id),
          name: s.name,
          icon: s.icon || '📌',
          isCurrent: String(s.id) === String(currentStageId),
          tasks: list,
        });
      }
    });
    byStage.forEach((list, key) => {
      if (groups.some((g) => g.id === key)) return;
      groups.push({ id: key, name: stageName(key), icon: '📌', isCurrent: false, tasks: list });
    });
    if (unstaged.length || !groups.length) {
      groups.push({
        id: '_open',
        name: currentStageId ? `Công việc · ${stageName(currentStageId)}` : 'Công việc',
        icon: '✅',
        isCurrent: true,
        tasks: unstaged.length ? unstaged : (groups.length ? [] : sorted),
      });
    }
    return groups.filter((g) => g.tasks.length > 0);
  }, [tasks, templates, stages, currentStageId]);

  const deadlineSorted = useMemo(() => (
    [...tasks].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    })
  ), [tasks]);

  const patchTask = async (task, patch) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/app-modules/${moduleKey}/tasks/${task.id}`, patch);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...data.task } : t)));
      onChanged?.();
      return data.task;
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const toggleDone = (task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    return patchTask(task, { status: next });
  };

  const removeTask = async (task) => {
    if (!confirm(`Xóa nhiệm vụ «${task.title}»?`)) return;
    setBusy(true);
    try {
      await api.delete(`/app-modules/${moduleKey}/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (expandedId === task.id) setExpandedId(null);
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setBusy(false);
  };

  const ensureMissing = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/records/${recordId}/tasks/ensure-missing`, {
        all_stages: true,
      });
      setMessage(data.created ? `Đã bổ sung ${data.created} nhiệm vụ từ mẫu.` : 'Không còn mục mẫu nào thiếu.');
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setBusy(false);
  };

  const applyTemplate = async (templateId) => {
    setBusy(true);
    setShowTpl(false);
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/records/${recordId}/tasks/from-template`, {
        template_id: templateId,
      });
      setMessage(data.created ? `Đã thêm ${data.created} nhiệm vụ từ mẫu.` : 'Mẫu không có mục mới.');
      await load();
      onChanged?.();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    }
    setBusy(false);
  };

  const addTask = async (e) => {
    e?.preventDefault?.();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const { data } = await api.post(`/app-modules/${moduleKey}/records/${recordId}/tasks`, {
        title: newTitle.trim(),
      });
      setTasks((prev) => [...prev, data.task]);
      setNewTitle('');
      onChanged?.();
    } catch (err) {
      setMessage(err.response?.data?.error || err.message);
    }
    setAdding(false);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setEditDraft({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      assignee_id: task.assignee_id || '',
    });
    setAssignTaskId(null);
  };

  const saveEdit = async () => {
    if (!editingTask || !editDraft.title.trim()) return;
    await patchTask(editingTask, {
      title: editDraft.title.trim(),
      description: editDraft.description || null,
      priority: editDraft.priority || 'medium',
      assignee_id: editDraft.assignee_id || null,
    });
    setEditingTask(null);
  };

  const toggleChecklistItem = async (task, ckId) => {
    const list = normalizeChecklist(task.checklist).map((c) => (
      c.id === ckId ? { ...c, done: !c.done } : c
    ));
    await patchTask(task, { checklist: list });
  };

  const renderTaskRow = (task) => {
    const done = task.status === 'done';
    const isExpanded = expandedId === task.id;
    const checklist = normalizeChecklist(task.checklist);
    const ckDone = checklist.filter((c) => c.done).length;
    const assignee = task.assignee || users.find((u) => String(u.id) === String(task.assignee_id));
    const assigneeName = assignee?.full_name;
    const isOverdue = !done && task.deadline && new Date(task.deadline).getTime() < Date.now();
    const hasDesc = !!(task.description && String(task.description).trim());
    const hasMeta = hasDesc || checklist.length > 0 || !!task.deadline || !!assigneeName;

    return (
      <div
        key={task.id}
        className={`group rounded-xl border transition ${
          done ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-white hover:border-blue-200'
        }`}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => toggleDone(task)}
            className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600 disabled:opacity-50"
            title={done ? 'Đánh dấu chưa xong' : 'Hoàn thành'}
          >
            {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <p
                className={`text-sm min-w-0 ${done ? 'line-through text-gray-400' : ''}`}
                style={done ? undefined : { color: '#000000' }}
                onDoubleClick={() => openEdit(task)}
              >
                {task.title}
              </p>
              {!isExpanded && hasMeta && (
                <button
                  type="button"
                  onClick={() => setExpandedId(task.id)}
                  className="shrink-0 text-[10px] font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  Chi tiết
                </button>
              )}
            </div>

            {!isExpanded && hasDesc && (
              <p className="text-sm text-slate-600 mt-0.5 line-clamp-2" title={task.description}>
                📋 {String(task.description).slice(0, 120)}{String(task.description).length > 120 ? '…' : ''}
              </p>
            )}

            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {task.deadline && editingDeadline !== task.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className={`text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1.5 py-0.5 rounded ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}
                  title="Click để đổi ngày giờ hẹn"
                >
                  <Calendar className="h-3.5 w-3.5" />{formatDateTime(task.deadline)}
                </span>
              )}
              {!task.deadline && editingDeadline !== task.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className="text-xs font-medium text-gray-400 flex items-center gap-1 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1.5 py-0.5 rounded"
                  title="Chọn ngày giờ hẹn"
                >
                  <Calendar className="h-3.5 w-3.5" />+ Ngày hẹn
                </span>
              )}
              {editingDeadline === task.id && (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="datetime-local"
                    autoFocus
                    defaultValue={task.deadline ? isoToDatetimeLocalValue(task.deadline) : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) patchTask(task, { deadline: datetimeLocalValueToIso(val) });
                    }}
                    onBlur={() => setTimeout(() => setEditingDeadline(null), 300)}
                    className="text-xs px-2 py-1 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[185px]"
                  />
                  {task.deadline && (
                    <button
                      type="button"
                      onClick={() => { patchTask(task, { deadline: null }); setEditingDeadline(null); }}
                      className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5"
                      title="Xóa ngày hẹn"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}

              {assigneeName && (
                <span className="text-[10px] text-blue-600 flex items-center gap-0.5">
                  <User className="h-2.5 w-2.5" />{assigneeName}
                </span>
              )}

              {checklist.length > 0 && (
                <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <ListChecks className="h-2.5 w-2.5" />{ckDone}/{checklist.length}
                </span>
              )}

              {hasDesc && !isExpanded && (
                <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Mô tả
                </span>
              )}
            </div>
          </div>

          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
            {PRIORITY_LABELS[task.priority] || task.priority || 'TB'}
          </span>

          {/* Nút chức năng — giống CRM */}
          <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1.5 ml-0.5">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : task.id)}
              className={`p-1.5 rounded-md cursor-pointer ${isExpanded ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
              title="Chi tiết · ghi chú & checklist"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssignTaskId(assignTaskId === task.id ? null : task.id)}
                className={`p-1.5 rounded-md cursor-pointer ${
                  task.assignee_id
                    ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                    : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
                title="Gán nhân viên"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
              {assignTaskId === task.id && (
                <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-xl border border-slate-200 bg-white shadow-xl p-1 max-h-48 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { patchTask(task, { assignee_id: null }); setAssignTaskId(null); }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-50 text-slate-500"
                  >
                    — Bỏ gán —
                  </button>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { patchTask(task, { assignee_id: u.id }); setAssignTaskId(null); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-indigo-50 ${
                        String(u.id) === String(task.assignee_id) ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      {u.full_name || u.email || u.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => openEdit(task)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
              title="Chỉnh sửa nhiệm vụ"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => removeTask(task)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
              title="Xóa nhiệm vụ"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 space-y-3 ml-7 mr-2 mb-2 rounded-b-xl">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Mô tả / ghi chú</p>
              {hasDesc ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
              ) : (
                <p className="text-xs text-slate-400 italic">Chưa có mô tả — bấm sửa để thêm.</p>
              )}
            </div>

            {checklist.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                  <ListChecks className="h-3 w-3" /> Checklist ({ckDone}/{checklist.length})
                </p>
                <ul className="space-y-1">
                  {checklist.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggleChecklistItem(task, c.id)}
                        className="w-full flex items-start gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200"
                      >
                        {c.done
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          : <Circle className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />}
                        <span className={`text-sm ${c.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {c.title || '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => openEdit(task)}
                className="h-7 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Edit3 className="h-3 w-3" /> Sửa
              </button>
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600"
              >
                Thu gọn
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải công việc…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{message}</div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{pct}%</div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium text-black">{doneCount}/{tasks.length}</span> xong
              {overdueCount > 0 && <span className="text-red-600 ml-1">• {overdueCount} quá hạn</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={ensureMissing}
            className="h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
            title="Quét mẫu và bổ sung nhiệm vụ thiếu"
          >
            {busy ? <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" /> : <span>🔍</span>}
            Bổ sung thiếu
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTpl((v) => !v)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${showTpl ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'}`}
            >
              <ClipboardList className="h-3 w-3" /> Gắn mẫu
            </button>
            {showTpl && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-1 max-h-56 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-500">Chưa có mẫu nhiệm vụ.</p>
                ) : (
                  templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl.id)}
                      className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-amber-50"
                    >
                      {tpl.name || 'Mẫu'}
                      {tpl.stage_id && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          Cột: {stageName(tpl.stage_id)}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {[
            { id: 'list', icon: List, label: 'List' },
            { id: 'deadline', icon: Calendar, label: 'Deadline' },
            { id: 'planner', icon: Target, label: 'Planner' },
            { id: 'calendar', icon: Calendar, label: 'Lịch' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id === 'calendar' || v.id === 'deadline' ? 'deadline' : 'list')}
              className={`h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer ${
                (view === 'list' && (v.id === 'list' || v.id === 'planner'))
                || (view === 'deadline' && (v.id === 'deadline' || v.id === 'calendar'))
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <v.icon className="h-3 w-3" />{v.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={addTask} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Thêm nhiệm vụ mới…"
          className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Thêm
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-400 space-y-2">
          <ClipboardList className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">Chưa có công việc</p>
          <p className="text-xs">Bấm «Bổ sung thiếu» hoặc thêm nhiệm vụ thủ công.</p>
        </div>
      ) : view === 'deadline' ? (
        <div className="space-y-2">
          {deadlineSorted.map(renderTaskRow)}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const isCollapsed = !!collapsed[g.id];
            const gDone = g.tasks.filter((t) => t.status === 'done').length;
            const allDone = gDone === g.tasks.length && g.tasks.length > 0;
            return (
              <div key={g.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 text-left"
                >
                  {isCollapsed
                    ? <ChevronRight className="h-4 w-4 text-slate-400" />
                    : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  <span className="text-base">{g.icon}</span>
                  <span className="text-sm font-bold text-slate-800 flex-1 truncate">{g.name}</span>
                  {g.isCurrent && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Hiện tại</span>
                  )}
                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{gDone}/{g.tasks.length}</span>
                  {allDone && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Xong hết</span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="relative p-2.5 space-y-2">
                    <div className="absolute left-[1.35rem] top-3 bottom-3 w-0.5 bg-slate-200" aria-hidden />
                    <div className="relative space-y-2 pl-1">
                      {g.tasks.map(renderTaskRow)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal sửa nhiệm vụ */}
      {editingTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingTask(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 text-blue-700">
                <Edit3 className="h-4 w-4" />
                <span className="text-sm font-semibold">Chỉnh sửa nhiệm vụ</span>
              </div>
              <button type="button" onClick={() => setEditingTask(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                Tiêu đề
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full h-9 px-2.5 border rounded-lg text-sm"
                  autoFocus
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Mô tả / ghi chú
                <textarea
                  value={editDraft.description}
                  onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full px-2.5 py-2 border rounded-lg text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Ưu tiên
                  <select
                    value={editDraft.priority}
                    onChange={(e) => setEditDraft((d) => ({ ...d, priority: e.target.value }))}
                    className="mt-1 w-full h-9 px-2 border rounded-lg text-sm bg-white"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Phụ trách
                  <select
                    value={editDraft.assignee_id}
                    onChange={(e) => setEditDraft((d) => ({ ...d, assignee_id: e.target.value }))}
                    className="mt-1 w-full h-9 px-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="">— Chưa gán —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button type="button" onClick={() => setEditingTask(null)} className="h-9 px-3 rounded-lg border text-sm font-medium text-slate-600">
                Hủy
              </button>
              <button
                type="button"
                disabled={busy || !editDraft.title.trim()}
                onClick={saveEdit}
                className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

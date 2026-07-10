import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import Modal from '../components/Modal';
import {
  Plus, LayoutGrid, List, UserCheck, PenLine, Search,
  Calendar, AlertTriangle, CheckCircle2, Loader2,
  BarChart3, CalendarClock, Timer, MoreHorizontal, ArrowUpDown,
} from 'lucide-react';
import {
  TASK_STATUS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor,
} from '../lib/utils';

const KANBAN_COLUMNS = [
  {
    key: 'pending',
    label: 'ĐANG CHỜ',
    statuses: ['pending', 'todo'],
    accent: 'text-slate-700',
    dot: 'bg-slate-400',
    bar: 'bg-slate-300',
    headerBg: 'bg-slate-50',
  },
  {
    key: 'in_progress',
    label: 'ĐANG LÀM',
    statuses: ['in_progress', 'blocked'],
    accent: 'text-blue-700',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    headerBg: 'bg-blue-50/80',
    showProgress: true,
  },
  {
    key: 'review',
    label: 'CHỜ KIỂM TRA',
    statuses: ['review', 'deferred'],
    accent: 'text-amber-700',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    headerBg: 'bg-amber-50/80',
    showProgress: true,
  },
  {
    key: 'done',
    label: 'ĐÃ HOÀN THÀNH',
    statuses: ['done'],
    accent: 'text-emerald-700',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    headerBg: 'bg-emerald-50/80',
  },
];

const PRIORITY_SHORT = { urgent: 'Gấp', high: 'Cao', medium: 'TB', low: 'Thấp' };

const SORT_OPTIONS = [
  { id: 'due_date', label: 'Hạn chót' },
  { id: 'priority', label: 'Ưu tiên' },
  { id: 'title', label: 'Tên' },
  { id: 'created', label: 'Mới nhất' },
];

function taskProgressPct(task) {
  if (task.status === 'done') return 100;
  if (task.status === 'review' || task.status === 'deferred') return 90;
  if (task.status === 'in_progress' || task.status === 'blocked') {
    const seed = Number(String(task.id).replace(/\D/g, '')) || 1;
    return 30 + (seed % 5) * 10;
  }
  return 0;
}

function isOverdue(task) {
  return task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
}

function isUpcoming(task, days = 7) {
  if (!task.due_date || task.status === 'done') return false;
  const due = new Date(task.due_date);
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return due >= now && due <= limit;
}

function sortTasks(list, sortBy) {
  const prio = { urgent: 0, high: 1, medium: 2, low: 3 };
  return [...list].sort((a, b) => {
    if (sortBy === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (sortBy === 'priority') {
      return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9);
    }
    if (sortBy === 'title') {
      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

function StatCard({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl px-3 py-2.5 shadow-sm min-w-0">
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-slate-500 truncate">{label}</p>
          <p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-[9px] font-medium text-slate-400 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function PersonalTaskCard({ task, column, onOpen, onMove }) {
  const overdue = isOverdue(task);
  const progress = taskProgressPct(task);
  const priorityKey = task.priority || 'medium';
  const showProgress = column.showProgress && progress > 0;

  return (
    <div
      onClick={() => onOpen(task.id)}
      className="bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-sm hover:shadow-md hover:border-violet-200 cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {task.priority && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${PRIORITY_COLORS[priorityKey]}`}>
              {PRIORITY_SHORT[priorityKey] || PRIORITY_LABELS[priorityKey]}
            </span>
          )}
          {overdue && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold inline-flex items-center gap-0.5 border border-red-100">
              <AlertTriangle className="h-2.5 w-2.5" /> Quá hạn
            </span>
          )}
        </div>
        {column.key === 'done' && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
        )}
      </div>

      <h4 className="text-xs font-bold text-slate-900 leading-snug mb-1.5 line-clamp-2">{task.title}</h4>

      {task.creator?.full_name && (
        <p className="text-[10px] text-slate-500 mb-1.5 truncate">
          Giao bởi: <span className="font-medium text-slate-600">{task.creator.full_name}</span>
        </p>
      )}

      {showProgress && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[9px] font-semibold text-slate-500 mb-0.5">
            <span>Tiến độ</span>
            <span className={column.accent}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${column.bar} transition-all`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        {task.due_date ? (
          <span className={`text-[10px] inline-flex items-center gap-1 font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
            <Calendar className="h-3 w-3" />
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">Chưa có hạn</span>
        )}
        {task.assignee && (
          <div
            className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 ring-2 ring-white shadow-sm"
            style={{ backgroundColor: avatarColor(task.assignee.full_name) }}
            title={task.assignee.full_name}
          >
            {getInitials(task.assignee.full_name)}
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 flex-wrap transition-opacity">
        {KANBAN_COLUMNS.filter((c) => c.key !== column.key).slice(0, 2).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(task.id, c.statuses[0]); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 hover:bg-violet-50 hover:text-violet-700 text-slate-500 cursor-pointer border border-slate-100"
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PersonalTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('due_date');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/tasks', { params: { task_type: 'personal' } })
      .then((r) => {
        let data = r.data.tasks || [];
        const uid = user?.userId || user?.id;
        if (filter === 'assigned_to_me') data = data.filter((t) => String(t.assignee_id) === String(uid));
        else if (filter === 'created_by_me') data = data.filter((t) => String(t.created_by_id) === String(uid));
        setTasks(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, user?.userId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        (t.title || '').toLowerCase().includes(q)
        || (t.assignee?.full_name || '').toLowerCase().includes(q)
        || (t.creator?.full_name || '').toLowerCase().includes(q),
      );
    }
    return sortTasks(list, sortBy);
  }, [tasks, search, sortBy]);

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const inProgress = filteredTasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked').length;
    const upcoming = filteredTasks.filter((t) => isUpcoming(t)).length;
    const overdue = filteredTasks.filter((t) => isOverdue(t)).length;
    const done = filteredTasks.filter((t) => t.status === 'done').length;
    const pct = (n) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%');
    return { total, inProgress, upcoming, overdue, done, pct };
  }, [filteredTasks]);

  const columns = useMemo(() => {
    const map = {};
    for (const col of KANBAN_COLUMNS) {
      map[col.key] = filteredTasks.filter((t) => col.statuses.includes(t.status));
    }
    return map;
  }, [filteredTasks]);

  const filterCounts = useMemo(() => {
    const uid = user?.userId || user?.id;
    return {
      all: tasks.length,
      assigned_to_me: tasks.filter((t) => String(t.assignee_id) === String(uid)).length,
      created_by_me: tasks.filter((t) => String(t.created_by_id) === String(uid)).length,
    };
  }, [tasks, user?.userId, user?.id]);

  const moveTask = async (taskId, newStatus) => {
    await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
    load();
  };

  const filterTabs = [
    { id: 'all', label: 'Tất cả', icon: LayoutGrid },
    { id: 'assigned_to_me', label: 'Được giao cho tôi', icon: UserCheck },
    { id: 'created_by_me', label: 'Tôi tạo', icon: PenLine },
  ];

  return (
    <div className="space-y-3.5 min-w-0">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Nhiệm vụ cá nhân</h1>
          <p className="text-xs text-slate-500 mt-0.5">Quản lý và theo dõi tất cả công việc của bạn</p>
        </div>
        <div className="flex flex-1 items-center min-w-0 lg:max-w-xl lg:mx-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm nhiệm vụ..."
              className="w-full h-8 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`h-8 px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                view === 'kanban' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`h-8 px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                view === 'list' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Danh sách</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-violet-700 cursor-pointer shadow-sm shadow-violet-500/25 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tạo nhiệm vụ</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <StatCard icon={BarChart3} label="Tổng nhiệm vụ" value={stats.total} sub="Tất cả" tone="violet" />
        <StatCard icon={Loader2} label="Đang thực hiện" value={stats.inProgress} sub={stats.pct(stats.inProgress)} tone="blue" />
        <StatCard icon={CalendarClock} label="Sắp đến hạn" value={stats.upcoming} sub={stats.pct(stats.upcoming)} tone="orange" />
        <StatCard icon={Timer} label="Quá hạn" value={stats.overdue} sub={stats.pct(stats.overdue)} tone="red" />
        <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={stats.done} sub={stats.pct(stats.done)} tone="emerald" />
      </div>

      {/* Tabs + sort */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">
          {filterTabs.map((f) => {
            const Icon = f.icon;
            const active = filter === f.id;
            const count = filterCounts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`shrink-0 h-9 px-3.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer border transition-all ${
                  active
                    ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{f.label}</span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums ${
                  active ? 'bg-white/25 text-white' : 'bg-white text-slate-600 border border-slate-200/80'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 sm:pl-2 sm:border-l sm:border-slate-100">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-8 pl-2 pr-7 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-violet-400"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>Sắp xếp: {o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      ) : view === 'kanban' ? (
        <div className="bg-white/70 rounded-xl border border-slate-200/70 p-2 shadow-sm min-h-0">
          <div className="flex gap-2.5 overflow-x-auto pb-1 min-h-[220px] [scrollbar-width:thin] items-stretch">
            {KANBAN_COLUMNS.map((col) => {
              const colTasks = columns[col.key] || [];
              return (
                <div
                  key={col.key}
                  className="shrink-0 w-[min(100%,256px)] flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/50 overflow-hidden"
                >
                  <div className={`px-2.5 py-2 border-b border-slate-200/70 flex items-center gap-2 ${col.headerBg}`}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
                    <span className={`text-[11px] font-extrabold tracking-wide truncate flex-1 ${col.accent}`}>
                      {col.label}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-slate-700 border border-slate-200/80 tabular-nums">
                      {colTasks.length}
                    </span>
                    <button type="button" className="h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-white/80 cursor-pointer" title="Tùy chọn cột">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto [scrollbar-width:thin] min-h-[160px] max-h-[calc(100dvh-18rem)]">
                    {colTasks.length === 0 ? (
                      <p className="text-center text-[11px] text-slate-400 py-8">Chưa có nhiệm vụ</p>
                    ) : (
                      colTasks.map((t) => (
                        <PersonalTaskCard
                          key={t.id}
                          task={t}
                          column={col}
                          onOpen={setSelectedTask}
                          onMove={moveTask}
                        />
                      ))
                    )}
                  </div>

                  <div className="shrink-0 px-2 pb-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm nhiệm vụ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Nhiệm vụ', 'Trạng thái', 'Người thực hiện', 'Người giao', 'Ưu tiên', 'Hạn'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTask(t.id)}
                  className="cursor-pointer hover:bg-violet-50/40 transition-colors"
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-900 max-w-[200px] truncate">{t.title}</td>
                  <td className="px-3 py-2.5 text-slate-600">{TASK_STATUS[t.status] || t.status}</td>
                  <td className="px-3 py-2.5 text-slate-600">{t.assignee?.full_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{t.creator?.full_name || '—'}</td>
                  <td className="px-3 py-2.5">
                    {t.priority && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${PRIORITY_COLORS[t.priority]}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 ${isOverdue(t) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                    {formatDate(t.due_date) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400">Chưa có nhiệm vụ cá nhân</div>
          )}
        </div>
      )}

      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={load} />
      <PersonalTaskCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}

function PersonalTaskCreateModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) {
      api.get('/users').then((r) => setUsers(r.data.users || []));
      setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '' });
    }
  }, [open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post('/tasks', {
        ...form,
        task_type: 'personal',
        project_id: null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
      });
      onCreated?.();
      onClose();
    } catch { /* ignore */ }
    setLoading(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Tạo nhiệm vụ cá nhân" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
          <input value={form.title || ''} onChange={(e) => set('title', e.target.value)} required className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mô tả</label>
          <textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)} className="input min-h-[60px]" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Giao cho</label>
            <select value={form.assignee_id || ''} onChange={(e) => set('assignee_id', e.target.value)} className="input">
              <option value="">— Tự làm —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={(e) => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option>
              <option value="medium">TB</option>
              <option value="high">Cao</option>
              <option value="urgent">Gấp</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hạn chót</label>
            <input type="date" value={form.due_date || ''} onChange={(e) => set('due_date', e.target.value)} className="input" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-violet-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-violet-700">
            {loading ? 'Tạo...' : 'Tạo nhiệm vụ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

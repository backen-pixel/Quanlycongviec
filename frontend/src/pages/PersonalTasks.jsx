import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import Modal from '../components/Modal';
import { Plus, Columns, List, UserCheck, FolderKanban, Clock, AlertTriangle, Layers } from 'lucide-react';
import { TASK_STATUS, TASK_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor } from '../lib/utils';

const STATUS_THEME = {
  pending:     { bar: 'from-gray-400 to-slate-500',    headerBg: 'from-gray-100 to-gray-50',       bodyBg: 'bg-gray-50/50',       footerBg: 'from-gray-50 to-white',         border: 'border-gray-300',    chipBg: 'bg-gray-200',     chipText: 'text-gray-800',    addHover: 'hover:bg-gray-100 hover:text-gray-800' },
  todo:        { bar: 'from-slate-400 to-slate-600',   headerBg: 'from-slate-100 to-slate-50',     bodyBg: 'bg-slate-50/50',      footerBg: 'from-slate-50 to-white',        border: 'border-slate-300',   chipBg: 'bg-slate-200',    chipText: 'text-slate-800',   addHover: 'hover:bg-slate-100 hover:text-slate-800' },
  in_progress: { bar: 'from-blue-500 to-sky-500',      headerBg: 'from-blue-100 to-sky-50',        bodyBg: 'bg-blue-50/50',       footerBg: 'from-blue-50 to-white',         border: 'border-blue-300',    chipBg: 'bg-blue-200',     chipText: 'text-blue-800',    addHover: 'hover:bg-blue-100 hover:text-blue-800' },
  review:      { bar: 'from-amber-500 to-orange-500',  headerBg: 'from-amber-100 to-yellow-50',    bodyBg: 'bg-amber-50/50',      footerBg: 'from-amber-50 to-white',        border: 'border-amber-300',   chipBg: 'bg-amber-200',    chipText: 'text-amber-800',   addHover: 'hover:bg-amber-100 hover:text-amber-800' },
  done:        { bar: 'from-emerald-500 to-green-500', headerBg: 'from-emerald-100 to-green-50',   bodyBg: 'bg-emerald-50/50',    footerBg: 'from-emerald-50 to-white',      border: 'border-emerald-300', chipBg: 'bg-emerald-200',  chipText: 'text-emerald-800', addHover: 'hover:bg-emerald-100 hover:text-emerald-800' },
  blocked:     { bar: 'from-red-500 to-rose-500',      headerBg: 'from-red-100 to-rose-50',        bodyBg: 'bg-red-50/50',        footerBg: 'from-red-50 to-white',          border: 'border-red-300',     chipBg: 'bg-red-200',      chipText: 'text-red-800',     addHover: 'hover:bg-red-100 hover:text-red-800' },
  deferred:    { bar: 'from-purple-400 to-violet-500', headerBg: 'from-purple-100 to-violet-50',   bodyBg: 'bg-purple-50/50',     footerBg: 'from-purple-50 to-white',       border: 'border-purple-300',  chipBg: 'bg-purple-200',   chipText: 'text-purple-800',  addHover: 'hover:bg-purple-100 hover:text-purple-800' },
};

export default function PersonalTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    api.get('/tasks', { params: { task_type: 'personal' } })
      .then(r => {
        let data = r.data.tasks || [];
        if (filter === 'assigned_to_me') data = data.filter(t => t.assignee_id === user?.userId);
        else if (filter === 'created_by_me') data = data.filter(t => t.created_by_id === user?.userId);
        setTasks(data);
      }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const moveTask = async (taskId, newStatus) => {
    await api.patch(`/tasks/${taskId}/status`, { status: newStatus }); load();
  };

  const columns = {};
  Object.keys(TASK_STATUS).forEach(k => { columns[k] = tasks.filter(t => t.status === k); });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#000000' }}>Nhiệm vụ cá nhân</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('kanban')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'kanban' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
              <Columns className="h-3.5 w-3.5" /> Kanban
            </button>
            <button onClick={() => setView('list')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'list' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
              <List className="h-3.5 w-3.5" /> Danh sách
            </button>
          </div>
          <button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer shadow-md hover:shadow-lg transition-shadow">
            <Plus className="h-4 w-4" /> Tạo NV
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'Tất cả', icon: FolderKanban },
          { id: 'assigned_to_me', label: 'Được giao cho tôi', icon: UserCheck },
          { id: 'created_by_me', label: 'Tôi tạo', icon: UserCheck },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`h-8 px-3 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 ${filter === f.id ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600'}`}>
            <f.icon className="h-3.5 w-3.5" /> {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>
      ) : view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(TASK_STATUS).map(([key, label]) => {
            const colTasks = columns[key] || [];
            const theme = STATUS_THEME[key] || STATUS_THEME.pending;
            const overdueCount = colTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && key !== 'done').length;
            return (
              <div
                key={key}
                className={`shrink-0 w-72 rounded-2xl border-2 ${theme.border} bg-white shadow-md hover:shadow-xl transition-all overflow-hidden flex flex-col`}
              >
                {/* ===== PHẦN 1: HEADER ===== */}
                <div className={`relative bg-gradient-to-r ${theme.headerBg} px-4 pt-4 pb-3 border-b-2 ${theme.border}`}>
                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${theme.bar}`} />
                  <div className="flex items-center gap-2.5 mt-1">
                    <span className="relative flex h-3.5 w-3.5 shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${TASK_COLORS[key]} opacity-50`} />
                      <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${TASK_COLORS[key]} shadow-md ring-2 ring-white`} />
                    </span>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider flex-1 truncate" style={{ color: '#000000' }}>
                      {label}
                    </h3>
                    <span className={`inline-flex items-center justify-center min-w-[30px] h-7 px-2.5 text-sm font-extrabold ${theme.chipBg} ${theme.chipText} rounded-full shadow-md border-2 border-white`}>
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* ===== PHẦN 2: BODY (cards) ===== */}
                <div
                  className={`space-y-2 min-h-[140px] p-2.5 flex-1 overflow-y-auto ${theme.bodyBg}`}
                  style={{ maxHeight: '600px' }}
                >
                  {colTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                      <div className="h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-2 shadow-sm">
                        <Layers className="h-5 w-5 text-gray-300" />
                      </div>
                      <p className="text-xs font-medium" style={{ color: '#000000' }}>Chưa có nhiệm vụ</p>
                    </div>
                  ) : (
                    colTasks.map(t => {
                      const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                      return (
                        <div key={t.id} onClick={() => setSelectedTask(t.id)}
                          className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer group transition-all">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {t.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>}
                            {isOverdue && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold inline-flex items-center gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" /> Quá hạn
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold mb-2 leading-snug" style={{ color: '#000000' }}>{t.title}</h4>
                          {t.assignee && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                style={{ backgroundColor: avatarColor(t.assignee.full_name) }}>
                                {getInitials(t.assignee.full_name)}
                              </div>
                              <span className="text-[10px] text-gray-500">{t.assignee.full_name}</span>
                            </div>
                          )}
                          {t.creator && t.creator.id !== t.assignee?.id && (
                            <p className="text-[10px] text-gray-400 mb-1">Giao bởi: {t.creator.full_name}</p>
                          )}
                          <div className="flex items-center justify-between">
                            {t.due_date ? (
                              <span className={`text-[11px] flex items-center gap-1 font-medium ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                                <Clock className="h-3 w-3" />{formatDate(t.due_date)}
                              </span>
                            ) : <span />}
                          </div>
                          <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 flex-wrap transition-opacity">
                            {Object.keys(TASK_STATUS).filter(s => s !== t.status).slice(0, 3).map(s => (
                              <button key={s} onClick={(e) => { e.stopPropagation(); moveTask(t.id, s); }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-500 cursor-pointer">→ {TASK_STATUS[s]}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ===== PHẦN 3: FOOTER ===== */}
                <div className={`bg-gradient-to-r ${theme.footerBg} border-t-2 ${theme.border} px-3 py-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: '#000000' }}>
                      {overdueCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          {overdueCount} quá hạn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <Layers className="h-3 w-3" />
                          {colTasks.length} nhiệm vụ
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md text-gray-500 ${theme.addHover} cursor-pointer transition-colors`}
                    >
                      <Plus className="h-3 w-3" /> Thêm
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nhiệm vụ</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Người thực hiện</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Người giao</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ưu tiên</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hạn</th>
            </tr></thead>
            <tbody className="divide-y">{tasks.map(t => (
              <tr key={t.id} onClick={() => setSelectedTask(t.id)} className="cursor-pointer transition-colors hover:bg-slate-200/70">
                <td className="px-4 py-3 font-medium" style={{ color: '#000000' }}>{t.title}</td>
                <td className="px-4 py-3"><span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${TASK_COLORS[t.status]}`} /><span className="text-xs">{TASK_STATUS[t.status]}</span></span></td>
                <td className="px-4 py-3 text-xs text-gray-600">{t.assignee?.full_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{t.creator?.full_name || '—'}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span></td>
                <td className={`px-4 py-3 text-xs ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500' : 'text-gray-500'}`}>{formatDate(t.due_date) || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {tasks.length === 0 && <div className="text-center py-12 text-sm text-gray-400">Chưa có nhiệm vụ cá nhân</div>}
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
      api.get('/users').then(r => setUsers(r.data.users || []));
      setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '' });
    }
  }, [open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); if (!form.title.trim()) return; setLoading(true);
    try {
      await api.post('/tasks', {
        ...form, task_type: 'personal', project_id: null,
        assignee_id: form.assignee_id || null, due_date: form.due_date || null,
      });
      onCreated?.(); onClose();
    } catch { }
    setLoading(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Tạo nhiệm vụ cá nhân" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Tiêu đề *</label><input value={form.title || ''} onChange={e => set('title', e.target.value)} required className="input" /></div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label><textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[60px]" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Giao cho</label>
            <select value={form.assignee_id || ''} onChange={e => set('assignee_id', e.target.value)} className="input">
              <option value="">— Tự làm —</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Ưu tiên</label>
            <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Hạn chót</label><input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} className="input" /></div>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Tạo...' : 'Tạo NV'}</button></div>
      </form>
    </Modal>
  );
}

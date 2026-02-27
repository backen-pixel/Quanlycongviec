import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import Modal from '../components/Modal';
import { Plus, Search, Columns, List, UserCheck, FolderKanban, Clock, AlertTriangle } from 'lucide-react';
import { TASK_STATUS, TASK_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor } from '../lib/utils';

export default function PersonalTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('all'); // all | assigned_to_me | created_by_me

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
          <h1 className="text-2xl font-bold text-gray-900">Nhiệm vụ cá nhân</h1>
          <p className="text-sm text-gray-500 mt-0.5">Nhiệm vụ không thuộc dự án — do admin/quản lý giao hoặc tự tạo</p>
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
          <button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
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
            return (
              <div key={key} className="shrink-0 w-72">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${TASK_COLORS[key]}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
                  <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px] p-2 rounded-xl bg-gray-100/60">
                  {colTasks.map(t => (
                    <div key={t.id} onClick={() => setSelectedTask(t.id)}
                      className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md cursor-pointer group">
                      <div className="flex items-center gap-1.5 mb-1">
                        {t.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>}
                      </div>
                      <h4 className="text-sm font-medium text-gray-800 mb-2">{t.title}</h4>
                      <div className="flex items-center justify-between">
                        {t.due_date && <span className={`text-[11px] flex items-center gap-1 ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock className="h-3 w-3" />{formatDate(t.due_date)}</span>}
                        {t.assignee && <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: avatarColor(t.assignee.full_name) }} title={t.assignee.full_name}>{getInitials(t.assignee.full_name)}</div>}
                      </div>
                      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 flex-wrap">
                        {Object.keys(TASK_STATUS).filter(s => s !== t.status).slice(0, 3).map(s => (
                          <button key={s} onClick={(e) => { e.stopPropagation(); moveTask(t.id, s); }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-500 cursor-pointer">→ {TASK_STATUS[s]}</button>
                        ))}
                      </div>
                    </div>
                  ))}
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
              <tr key={t.id} onClick={() => setSelectedTask(t.id)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
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

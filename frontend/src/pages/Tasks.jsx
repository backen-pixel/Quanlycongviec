import { useState, useEffect } from 'react';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import { Plus, Clock, List, Columns, Search, CheckSquare } from 'lucide-react';
import {
  TASK_STATUS, TASK_COLORS, PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, getInitials, avatarColor
} from '../lib/utils';

export default function Tasks() {
  const [columns, setColumns] = useState({});
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState('');

  const load = () => {
    setLoading(true);
    const params = { group_by: 'status' };
    if (search) params.search = search;
    if (filterProject) params.project_id = filterProject;

    api.get('/tasks', { params })
      .then(r => {
        setColumns(r.data.columns || {});
        setTotal(r.data.total || 0);
        // Flatten for list view
        const flat = Object.values(r.data.columns || {}).flat();
        setAllTasks(flat);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/projects', { params: { limit: 100 } }).then(r => setProjects(r.data.projects || []));
  }, []);

  useEffect(load, [filterProject]);

  const moveTask = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      load();
    } catch { }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kanban Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} công việc</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('kanban')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <Columns className="h-3.5 w-3.5" /> Kanban
            </button>
            <button onClick={() => setView('list')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <List className="h-3.5 w-3.5" /> Danh sách
            </button>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="h-9 px-4 bg-[var(--color-primary-600)] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--color-primary-700)] transition-colors cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Tìm task..." className="w-full h-9 pl-10 pr-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Tất cả dự án</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </div>

      {/* Kanban view */}
      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(TASK_STATUS).map(([key, label]) => {
            const tasks = columns[key] || [];
            return (
              <div key={key} className="shrink-0 w-72">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${TASK_COLORS[key]}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
                  <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{tasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-gray-100/60">
                  {tasks.map(t => (
                    <div key={t.id} onClick={() => setSelectedTask(t.id)}
                      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        {t.projects && <span className="text-[10px] text-gray-400 font-medium">{t.projects.code}</span>}
                        {t.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>}
                      </div>
                      <h4 className="text-sm font-medium text-gray-800 mb-2">{t.title}</h4>
                      <div className="flex items-center justify-between">
                        {t.due_date ? (
                          <span className={`text-[11px] flex items-center gap-1 ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            <Clock className="h-3 w-3" />{formatDate(t.due_date)}
                          </span>
                        ) : <span />}
                        {t.assignee && (
                          <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: avatarColor(t.assignee.full_name) }} title={t.assignee.full_name}>
                            {getInitials(t.assignee.full_name)}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                        {Object.keys(TASK_STATUS).filter(s => s !== t.status).map(s => (
                          <button key={s} onClick={(e) => { e.stopPropagation(); moveTask(t.id, s); }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-500 cursor-pointer">
                            → {TASK_STATUS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setShowCreate(true)}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm transition-colors cursor-pointer">
                    <Plus className="h-4 w-4" /> Thêm
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Dự án</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Người thực hiện</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ưu tiên</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hạn chót</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allTasks.map(t => (
                <tr key={t.id} onClick={() => setSelectedTask(t.id)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
                  <td className="px-4 py-3 text-xs text-blue-600 font-medium">{t.projects?.code}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${TASK_COLORS[t.status]}`} />
                      <span className="text-xs">{TASK_STATUS[t.status]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{t.assignee?.full_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                    {formatDate(t.due_date) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allTasks.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có công việc</p>
            </div>
          )}
        </div>
      )}

      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={load} />
      <TaskCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load}
        projectId={filterProject || projects[0]?.id} />
    </div>
  );
}

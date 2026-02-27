import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import {
  STATUS_LABELS, STATUS_COLORS, TASK_STATUS, TASK_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS, formatVND, formatDate,
  getInitials, avatarColor
} from '../lib/utils';
import {
  Plus, FolderKanban, Clock, List, Columns, Phone,
  AlertTriangle, CheckSquare
} from 'lucide-react';

const STAGE_STATUS_MAP = {
  consulting: 'consulting', design: 'designing', quotation: 'quoting',
  contract: 'contract_signed', production: 'producing', shipping: 'shipping',
  installation: 'installing', 'customer-care': 'warranty',
};
const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

export default function StageView() {
  const { slug } = useParams();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stageInfo, setStageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createForProject, setCreateForProject] = useState(null);

  const status = STAGE_STATUS_MAP[slug] || slug;

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, stageRes] = await Promise.all([
        api.get('/projects', { params: { stage_slug: slug } }),
        api.get('/users/stages'),
      ]);
      const projs = projRes.data.projects || [];
      setProjects(projs);

      const stage = stageRes.data.stages?.find(s => s.slug === slug);
      setStageInfo(stage);

      // Load tasks for all projects in this stage, filtered by stage
      if (projs.length && stage) {
        const taskPromises = projs.map(p =>
          api.get('/tasks', { params: { project_id: p.id } }).then(r => r.data.tasks || [])
        );
        const allTasks = (await Promise.all(taskPromises)).flat();
        // Filter tasks belonging to this stage
        const stageTasks = allTasks.filter(t => t.stage?.id === stage.id || (!t.stage && true));
        setTasks(stageTasks);
      } else {
        setTasks([]);
      }
    } catch { }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [slug]);

  const moveTask = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      loadData();
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

  const stageName = STAGE_NAMES[slug] || STATUS_LABELS[status] || slug;
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }} />
            <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length} dự án · {totalTasks} công việc · {doneTasks} hoàn thành
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('kanban')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <Columns className="h-3.5 w-3.5" /> Kanban
            </button>
            <button onClick={() => setView('list')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <List className="h-3.5 w-3.5" /> Danh sách
            </button>
          </div>
        </div>
      </div>

      {/* Projects in this stage */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map(p => {
          const pTasks = tasks.filter(t => t.project_id === p.id);
          const pDone = pTasks.filter(t => t.status === 'done').length;
          return (
            <Link to={`/projects/${p.id}`} key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-blue-600">{p.code}</span>
                {p.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[p.priority]}`}>{PRIORITY_LABELS[p.priority]}</span>}
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{p.name}</h3>
              <p className="text-xs text-gray-500">{p.customers?.full_name} {p.customers?.phone && `· ${p.customers.phone}`}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold">{formatVND(p.estimated_value)}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pTasks.length ? (pDone/pTasks.length)*100 : 0}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400">{pDone}/{pTasks.length}</span>
                </div>
              </div>
              <button onClick={(e) => { e.preventDefault(); setCreateForProject(p); setShowCreateTask(true); }}
                className="mt-2 w-full flex items-center justify-center gap-1 h-7 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 cursor-pointer">
                <Plus className="h-3 w-3" /> Thêm task
              </button>
            </Link>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Không có dự án ở giai đoạn {stageName}</p>
        </div>
      )}

      {/* Task Kanban / List */}
      {tasks.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Công việc giai đoạn {stageName}</h2>

          {view === 'kanban' ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Object.entries(TASK_STATUS).map(([key, label]) => {
                const colTasks = tasks.filter(t => t.status === key);
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
                          className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {t.projects && <span className="text-[10px] text-gray-400">{t.projects.code}</span>}
                            {t.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>}
                          </div>
                          <h4 className="text-sm font-medium text-gray-800 mb-2">{t.title}</h4>
                          <div className="flex items-center justify-between">
                            {t.due_date && (
                              <span className={`text-[11px] flex items-center gap-1 ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                                <Clock className="h-3 w-3" />{formatDate(t.due_date)}
                              </span>
                            )}
                            {t.assignee && (
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: avatarColor(t.assignee.full_name) }} title={t.assignee.full_name}>
                                {getInitials(t.assignee.full_name)}
                              </div>
                            )}
                          </div>
                          {/* Quick move */}
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
                  {tasks.map(t => (
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
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={loadData} />
      <TaskCreateModal
        open={showCreateTask}
        onClose={() => { setShowCreateTask(false); setCreateForProject(null); }}
        onCreated={loadData}
        projectId={createForProject?.id}
        stageId={stageInfo?.id}
      />
    </div>
  );
}

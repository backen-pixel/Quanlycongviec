import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import {
  TASK_STATUS, TASK_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
  formatVND, formatDate, getInitials, avatarColor, ROLE_LABELS,
} from '../lib/utils';
import {
  Plus, FolderKanban, Clock, List, Columns, CheckSquare, GripVertical,
  AlertTriangle, ArrowRight
} from 'lucide-react';

import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

// ═══ KANBAN COLUMN ═══
function KanbanColumn({ id, label, color, tasks, onTaskClick }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`shrink-0 w-72 transition-all ${isOver ? 'scale-[1.01]' : ''}`}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className={`space-y-2 min-h-[120px] p-2 rounded-xl transition-colors ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-100/60'}`}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(t => (
            <SortableTaskCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
            Kéo thẻ vào đây
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ SORTABLE TASK CARD ═══
function SortableTaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className={`bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group ${isDragging ? 'ring-2 ring-blue-400' : ''}`}>
      {/* Drag handle */}
      <div className="flex items-start gap-2">
        <div {...listeners} className="mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {task.projects && <span className="text-[10px] text-blue-600 font-medium">{task.projects.code}</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
          </div>
          <h4 className="text-sm font-medium text-gray-800 mb-2">{task.title}</h4>
          <div className="flex items-center justify-between">
            {task.due_date ? (
              <span className={`text-[11px] flex items-center gap-1 ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                <Clock className="h-3 w-3" />{formatDate(task.due_date)}
                {new Date(task.due_date) < new Date() && task.status !== 'done' && <AlertTriangle className="h-3 w-3" />}
              </span>
            ) : <span />}
            {task.assignee && (
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: avatarColor(task.assignee.full_name) }} title={task.assignee.full_name}>
                {getInitials(task.assignee.full_name)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ DRAG OVERLAY CARD ═══
function TaskOverlayCard({ task }) {
  if (!task) return null;
  return (
    <div className="bg-white rounded-lg border-2 border-blue-400 p-3 shadow-lg w-72 opacity-90">
      <div className="flex items-center gap-1.5 mb-1">
        {task.projects && <span className="text-[10px] text-blue-600 font-medium">{task.projects.code}</span>}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
      </div>
      <h4 className="text-sm font-medium text-gray-800">{task.title}</h4>
      {task.assignee && <p className="text-[11px] text-gray-400 mt-1">{task.assignee.full_name}</p>}
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function StageView() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stageInfo, setStageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createForProject, setCreateForProject] = useState(null);
  const [activeTask, setActiveTask] = useState(null); // for drag overlay

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const loadData = useCallback(async () => {
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

      // Load tasks for this stage directly using stage_id filter
      if (stage) {
        const { data } = await api.get('/tasks', { params: { stage_id: stage.id } });
        // Only tasks belonging to projects in this stage (current stage matches)
        const projectIds = new Set(projs.map(p => p.id));
        const stageTasks = (data.tasks || []).filter(t => projectIds.has(t.project_id));
        setTasks(stageTasks);
      } else {
        setTasks([]);
      }
    } catch { }
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadData(); }, [loadData]);

  const moveTask = async (taskId, newStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
    } catch {
      loadData(); // revert on error
    }
  };

  // ── DnD handlers ──
  const handleDragStart = (event) => {
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Determine target status
    let targetStatus = over.id;
    // If dropped on another task, find that task's status
    if (!TASK_STATUS[targetStatus]) {
      const overTask = tasks.find(t => t.id === over.id);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus && TASK_STATUS[targetStatus] && targetStatus !== task.status) {
      moveTask(taskId, targetStatus);
    }
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

  const stageName = STAGE_NAMES[slug] || slug;
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;

  // Kanban columns (only show columns that have tasks + some empty ones)
  const kanbanStatuses = ['pending', 'todo', 'in_progress', 'review', 'done', 'blocked'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }} />
            <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
            {user && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{ROLE_LABELS[user.role] || user.role}</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length} dự án · {totalTasks} công việc · {doneTasks} hoàn thành
            {overdueTasks > 0 && <span className="text-red-500 ml-2">· {overdueTasks} quá hạn</span>}
          </p>
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
        </div>
      </div>

      {/* Projects cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
              <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">{p.name}</h3>
              <p className="text-xs text-gray-500 truncate">{p.customers?.full_name} {p.customers?.phone && `· ${p.customers.phone}`}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold">{formatVND(p.estimated_value)}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pTasks.length ? (pDone/pTasks.length)*100 : 0}%` }} />
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

      {/* ═══ TASK VIEW ═══ */}
      {tasks.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckSquare className="h-5 w-5" /> Công việc giai đoạn {stageName}
            <span className="text-sm font-normal text-gray-400">— kéo thả để chuyển trạng thái</span>
          </h2>

          {view === 'kanban' ? (
            <DndContext sensors={sensors} collisionDetection={closestCorners}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {kanbanStatuses.map(key => (
                  <KanbanColumn
                    key={key}
                    id={key}
                    label={TASK_STATUS[key]}
                    color={TASK_COLORS[key]}
                    tasks={tasks.filter(t => t.status === key)}
                    onTaskClick={(id) => setSelectedTask(id)}
                  />
                ))}
              </div>
              <DragOverlay>
                <TaskOverlayCard task={activeTask} />
              </DragOverlay>
            </DndContext>
          ) : (
            /* ═══ LIST VIEW ═══ */
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tasks.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 cursor-pointer" onClick={() => setSelectedTask(t.id)}>{t.title}</td>
                      <td className="px-4 py-3 text-xs text-blue-600 font-medium">{t.projects?.code}</td>
                      <td className="px-4 py-3">
                        <select value={t.status} onChange={(e) => moveTask(t.id, e.target.value)}
                          className="text-xs border rounded-lg px-2 py-1 cursor-pointer">
                          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                              style={{ backgroundColor: avatarColor(t.assignee.full_name) }}>
                              {getInitials(t.assignee.full_name)}
                            </div>
                            <span className="text-xs text-gray-600">{t.assignee.full_name}</span>
                          </div>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>
                      </td>
                      <td className={`px-4 py-3 text-xs ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        {formatDate(t.due_date) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedTask(t.id)} className="text-xs text-blue-600 hover:underline cursor-pointer">Chi tiết</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tasks.length === 0 && projects.length > 0 && (
        <div className="text-center py-10 bg-white rounded-xl border">
          <CheckSquare className="h-10 w-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400 mb-1">Chưa có công việc ở giai đoạn này</p>
          <p className="text-xs text-gray-400">Tạo task cho các dự án phía trên hoặc chuyển giai đoạn để tự động tạo</p>
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

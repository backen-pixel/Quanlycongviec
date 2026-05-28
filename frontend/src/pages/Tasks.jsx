import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import { Plus, Clock, List, Columns, Search, CheckSquare, GripVertical } from 'lucide-react';
import {
  TASK_STATUS, TASK_COLORS, PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, getInitials, avatarColor
} from '../lib/utils';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ═══ Sortable Task Card ═══
function SortableTaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard task={task} onClick={onClick} dragListeners={listeners} />
    </div>
  );
}

// ═══ Task Card — with project name, stage, assignee ═══
function TaskCard({ task: t, onClick, dragListeners }) {
  return (
    <div onClick={() => onClick(t.id)}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
      {/* Top row: drag handle + project code + stage */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {dragListeners && (
          <span {...dragListeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 -ml-1">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        {t.projects && <span className="text-[10px] font-bold text-blue-600">{t.projects.code}</span>}
        {t.stage && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: t.stage.color }}>
            {t.stage.name}
          </span>
        )}
        {t.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium mb-1" style={{ color: '#000000' }}>{t.title}</h4>

      {/* Project name */}
      {t.projects?.name && (
        <p className="text-[10px] text-gray-400 mb-1.5 truncate">📁 {t.projects.name}</p>
      )}

      {/* Bottom: due date + assignee */}
      <div className="flex items-center justify-between">
        {t.due_date ? (
          <span className={`text-[11px] flex items-center gap-1 ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
            <Clock className="h-3 w-3" />{formatDate(t.due_date)}
          </span>
        ) : <span />}
        {t.assignee && (
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: avatarColor(t.assignee.full_name) }} title={t.assignee.full_name}>
              {getInitials(t.assignee.full_name)}
            </div>
            <span className="text-[10px] text-gray-500 hidden sm:inline">{t.assignee.full_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Droppable Column ═══
function DroppableColumn({ status, label, tasks, onTaskClick, onAdd }) {
  const taskIds = tasks.map(t => t.id);
  return (
    <div className="shrink-0 w-80 flex flex-col" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-white/70 backdrop-blur-sm border border-white/40 shadow-sm">
        <div className={`w-2.5 h-2.5 rounded-full ${TASK_COLORS[status]}`} />
        <h3 className="text-sm font-bold" style={{ color: '#0f172a' }}>{label}</h3>
        <span className="ml-auto text-[11px] bg-slate-900/90 text-white px-2 py-0.5 rounded-full font-bold tabular-nums shadow-sm">{tasks.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          className="flex-1 min-h-[200px] p-2 rounded-xl bg-gray-100/60 flex flex-col gap-2 overflow-hidden"
          data-status={status}
        >
          {/* Vùng cuộn dọc cho các task */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]">
            {tasks.map(t => (
              <SortableTaskCard key={t.id} task={t} onClick={onTaskClick} />
            ))}
          </div>
          {/* Nút Thêm cố định ở đáy cột — không cuộn theo */}
          <button onClick={onAdd}
            style={{ color: '#000000' }}
            className="shrink-0 w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-300 bg-white/40 hover:bg-white/70 hover:border-blue-400 text-sm transition-colors cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm
          </button>
        </div>
      </SortableContext>
    </div>
  );
}

export default function Tasks() {
  const [columns, setColumns] = useState({});
  const [allTasks, setAllTasks] = useState([]);
  // firstLoading: chỉ true ở lần fetch đầu tiên (hiện spinner full-screen).
  // refreshing: true cho các lần fetch tiếp theo (debounce search/filter) — không che bảng,
  //             tránh nháy màn hình mỗi lần gõ tìm task.
  const [firstLoading, setFirstLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const isFirstLoadRef = useRef(true);
  const reqIdRef = useRef(0);

  const load = useCallback(() => {
    if (isFirstLoadRef.current) setFirstLoading(true);
    else setRefreshing(true);

    const myReq = ++reqIdRef.current;
    const params = { group_by: 'status' };
    if (search) params.search = search;
    if (filterProject) params.project_id = filterProject;

    api.get('/tasks', { params })
      .then(r => {
        // Bỏ qua phản hồi cũ nếu user đã gõ thêm — chống race condition khi typing nhanh
        if (myReq !== reqIdRef.current) return;
        setColumns(r.data.columns || {});
        setTotal(r.data.total || 0);
        setAllTasks(Object.values(r.data.columns || {}).flat());
      })
      .catch(() => {})
      .finally(() => {
        if (myReq !== reqIdRef.current) return;
        isFirstLoadRef.current = false;
        setFirstLoading(false);
        setRefreshing(false);
      });
  }, [search, filterProject]);

  useEffect(() => {
    load();
    api.get('/projects', { params: { limit: 100 } }).then(r => setProjects(r.data.projects || []));
  }, []);

  useEffect(load, [filterProject]);

  // ── Debounce search: gõ tới đâu lọc tới đó (300ms idle) ────────────────────
  const searchDebounceRef = useRef(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => load(), 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  // Client-side filter để hiển thị tức thì trong khi chờ API trả về (List view)
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTasks;
    return allTasks.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const proj = `${t.projects?.code || ''} ${t.projects?.name || ''}`.toLowerCase();
      const assignee = (t.assignee?.full_name || '').toLowerCase();
      const stage = (t.stage?.name || '').toLowerCase();
      return title.includes(q) || proj.includes(q) || assignee.includes(q) || stage.includes(q);
    });
  }, [allTasks, search]);

  // DnD handlers
  const findColumn = (taskId) => {
    for (const [status, tasks] of Object.entries(columns)) {
      if (tasks.find(t => t.id === taskId)) return status;
    }
    return null;
  };

  const handleDragStart = (event) => {
    const task = allTasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeStatus = findColumn(active.id);
    // Check if over a column directly or a task in a column
    let overStatus = findColumn(over.id);
    if (!overStatus) {
      // over.id might be a status key (column container)
      overStatus = over.id;
    }

    if (activeStatus && overStatus && activeStatus !== overStatus && columns[overStatus]) {
      setColumns(prev => {
        const updated = { ...prev };
        const task = updated[activeStatus].find(t => t.id === active.id);
        if (!task) return prev;
        updated[activeStatus] = updated[activeStatus].filter(t => t.id !== active.id);
        updated[overStatus] = [...updated[overStatus], { ...task, status: overStatus }];
        return updated;
      });
    }
  };

  const handleDragEnd = async (event) => {
    const { active } = event;
    setActiveTask(null);
    if (!active) return;

    const newStatus = findColumn(active.id);
    const task = allTasks.find(t => t.id === active.id);
    if (!task || !newStatus || task.status === newStatus) return;

    try {
      await api.patch(`/tasks/${active.id}/status`, { status: newStatus });
      load();
    } catch {
      load(); // revert on error
    }
  };

  if (firstLoading) {
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
            <button onClick={() => setView('kanban')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${view === 'kanban' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`}>
              <Columns className="h-3.5 w-3.5" /> Kanban
            </button>
            <button onClick={() => setView('list')} className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${view === 'list' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'}`}>
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
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm task theo tên, dự án, người thực hiện…"
            autoFocus
            className="w-full h-9 pl-10 pr-8 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {refreshing && (
            <svg className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer"
              title="Xoá tìm kiếm"
            >
              ×
            </button>
          )}
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">Tất cả dự án</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </div>

      {/* Kanban view with DnD */}
      {view === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Object.entries(TASK_STATUS).map(([key, label]) => (
              <DroppableColumn key={key} status={key} label={label}
                tasks={columns[key] || []}
                onTaskClick={setSelectedTask}
                onAdd={() => setShowCreate(true)} />
            ))}
          </div>
          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} onClick={() => {}} />}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List view — sticky header + scroll dọc tối đa 8 dòng */
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(48px * 8 + 41px)' }}>
            <table className="w-full text-sm" style={{ tableLayout: 'auto', minWidth: 720 }}>
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Dự án</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Giai đoạn</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Người thực hiện</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Ưu tiên</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Hạn chót</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredList.map(t => (
                <tr key={t.id} onClick={() => setSelectedTask(t.id)} className="cursor-pointer transition-colors hover:bg-slate-200/70">
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: '#000000' }}>{t.title}</p>
                    {t.projects?.name && <p className="text-[10px] text-gray-400 mt-0.5">{t.projects.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-blue-600 font-bold whitespace-nowrap">{t.projects?.code || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t.stage ? (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full text-white font-medium whitespace-nowrap" style={{ backgroundColor: t.stage.color }}>
                        {t.stage.name}
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${TASK_COLORS[t.status]}`} />
                      <span className="text-xs">{TASK_STATUS[t.status]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {t.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                          style={{ backgroundColor: avatarColor(t.assignee.full_name) }}>
                          {getInitials(t.assignee.full_name)}
                        </div>
                        <span className="text-xs text-gray-600">{t.assignee.full_name}</span>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                    {formatDate(t.due_date) || '—'}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
            {filteredList.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {search ? `Không tìm thấy task nào khớp "${search}"` : 'Chưa có công việc'}
                </p>
              </div>
            )}
          </div>
          {/* Footer hiển thị số dòng — giúp user biết bảng còn dữ liệu cuộn dưới */}
          {filteredList.length > 8 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/70 text-[11px] text-gray-500 flex items-center justify-between">
              <span>Hiển thị {Math.min(8, filteredList.length)} / {filteredList.length} task — cuộn để xem thêm</span>
              {search && (
                <span className="text-blue-600 font-medium">Đang lọc theo: "{search}"</span>
              )}
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

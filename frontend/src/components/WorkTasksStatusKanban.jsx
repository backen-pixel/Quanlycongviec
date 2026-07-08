import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Calendar, Plus } from 'lucide-react';
import { formatDate, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';
import {
  groupTasksByKanbanStatus,
  groupTasksByDeal,
  normalizeKanbanStatus,
  resolveStatusForApi,
  visibleKanbanStatusColumns,
  isTaskDone,
} from '../lib/workTasksDashboardUtils';

function KanbanTaskCard({ task, isOverlay = false, isDragging = false }) {
  const overdue = task.deadline && new Date(task.deadline) < new Date() && !isTaskDone(task.status);

  return (
    <div
      className={`bg-white rounded-lg border shadow-sm transition-all select-none touch-none ${
        isDragging ? 'border-blue-400 shadow-lg ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
      } ${isOverlay ? 'p-2.5' : 'p-2.5 cursor-grab active:cursor-grabbing'}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 shrink-0 mt-0.5 text-gray-300" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${isTaskDone(task.status) ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          {(task.lead_title || task.project_code) && (
            <p className="text-[10px] text-indigo-700 truncate mt-0.5">
              {task.lead_title || task.project_code}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {task.task_kind && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{task.task_kind}</span>
            )}
            {task.deadline && (
              <span className={`text-[10px] inline-flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
              </span>
            )}
            {task.priority && (
              <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                {PRIORITY_LABELS[task.priority] || task.priority}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableKanbanCard({ task, onTaskClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.unified_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onTaskClick?.(task);
      }}
      title="Kéo để đổi trạng thái · Nhấp đúp để sửa"
    >
      <KanbanTaskCard task={task} isDragging={isDragging} />
    </div>
  );
}

function DealGroup({ group, onTaskClick }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white/50 overflow-hidden">
      <div className="px-2 py-1.5 bg-white/90 border-b border-black/5">
        <p className="text-[11px] font-bold text-indigo-900 truncate" title={group.label}>
          {group.leadId ? '💼' : '📁'} {group.label}
        </p>
        {group.projectCode && group.leadId && (
          <p className="text-[10px] text-gray-500 truncate">{group.projectCode}</p>
        )}
      </div>
      <div className="p-1.5 space-y-1.5">
        {group.tasks.map((t) => (
          <SortableKanbanCard key={t.unified_id} task={t} onTaskClick={onTaskClick} />
        ))}
      </div>
    </div>
  );
}

function StatusColumn({ column, tasks, onTaskClick, onAddTask }) {
  const dealGroups = useMemo(() => groupTasksByDeal(tasks), [tasks]);
  const taskIds = tasks.map((t) => t.unified_id);
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className={`shrink-0 w-[min(100vw-2rem,320px)] flex flex-col rounded-xl border ${column.border} ${column.bg}`}>
      <div className="px-3 py-2.5 border-b border-black/5 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
        <span className="text-sm font-bold text-gray-800">{column.label}</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 text-gray-700 tabular-nums">
          {tasks.length}
        </span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 flex flex-col min-h-[240px] max-h-[calc(100vh-340px)] transition-colors ${
            isOver ? 'bg-blue-50/60 ring-2 ring-inset ring-blue-300/50' : ''
          }`}
          data-status={column.key}
        >
          <div className="flex-1 p-2 space-y-2 overflow-y-auto [scrollbar-width:thin]">
            {dealGroups.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-8">Kéo thả nhiệm vụ vào đây</p>
            ) : dealGroups.map((group) => (
              <DealGroup key={group.key} group={group} onTaskClick={onTaskClick} />
            ))}
          </div>
          <div className="shrink-0 p-2 pt-0">
            <button
              type="button"
              onClick={() => onAddTask?.(column.key)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-gray-300 bg-white/60 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm việc
            </button>
          </div>
        </div>
      </SortableContext>
    </div>
  );
}

export default function WorkTasksStatusKanban({
  tasks,
  openOnly = true,
  onPatchStatus,
  onTaskClick,
  onAddTask,
}) {
  const columnsDef = useMemo(() => visibleKanbanStatusColumns(openOnly), [openOnly]);
  const [columns, setColumns] = useState(() => groupTasksByKanbanStatus(tasks, { openOnly }));
  const [activeTask, setActiveTask] = useState(null);

  const tasksKey = useMemo(
    () => (tasks || []).map((t) => `${t.unified_id}:${t.status}:${t.title}`).join('|'),
    [tasks],
  );

  useEffect(() => {
    setColumns(groupTasksByKanbanStatus(tasks, { openOnly }));
  }, [tasksKey, openOnly, tasks]);

  const allTasks = useMemo(() => Object.values(columns).flat(), [columns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const findColumnKey = useCallback((taskId) => {
    for (const col of columnsDef) {
      if ((columns[col.key] || []).some((t) => t.unified_id === taskId)) return col.key;
    }
    return null;
  }, [columns, columnsDef]);

  const handleDragStart = (e) => {
    const task = allTasks.find((t) => t.unified_id === e.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeKey = findColumnKey(active.id);
    let overKey = findColumnKey(over.id);
    if (!overKey && columnsDef.some((c) => c.key === over.id)) overKey = over.id;

    if (!activeKey || !overKey || activeKey === overKey) return;

    setColumns((prev) => {
      const next = { ...prev };
      const task = next[activeKey]?.find((t) => t.unified_id === active.id);
      if (!task) return prev;
      next[activeKey] = next[activeKey].filter((t) => t.unified_id !== active.id);
      next[overKey] = [...(next[overKey] || []), { ...task, status: resolveStatusForApi(task, overKey) }];
      return next;
    });
  };

  const handleDragEnd = async (event) => {
    const { active } = event;
    const task = tasks.find((t) => t.unified_id === active.id)
      || allTasks.find((t) => t.unified_id === active.id);
    const newKey = findColumnKey(active.id);
    setActiveTask(null);

    if (!task || !newKey) return;
    if (normalizeKanbanStatus(task.status) === newKey) return;

    try {
      await onPatchStatus?.(task, newKey);
    } catch {
      setColumns(groupTasksByKanbanStatus(tasks, { openOnly }));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 min-h-[420px] [scrollbar-width:thin]">
        {columnsDef.map((col) => (
          <StatusColumn
            key={col.key}
            column={col}
            tasks={columns[col.key] || []}
            onTaskClick={onTaskClick}
            onAddTask={onAddTask}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[280px] rotate-1 opacity-95 pointer-events-none">
            <KanbanTaskCard task={activeTask} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

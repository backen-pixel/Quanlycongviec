import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Calendar, Plus, Pencil, Trash2, Columns3, ChevronRight, MessageSquare, Paperclip, FolderKanban } from 'lucide-react';
import { formatDate, PRIORITY_LABELS, getInitials, avatarColor } from '../lib/utils';
import { publicFileUrl } from '../lib/publicFileUrl';
import {
  groupTasksByKanbanColumns,
  groupTasksByDeadlineColumns,
  groupTasksByDeal,
  resolveStatusForApi,
  resolveTaskColumnKey,
  isTaskDone,
  readKanbanColumnPins,
  setKanbanColumnPin,
  pruneKanbanColumnPins,
  getTasksForDealKey,
  isDealSortableId,
  dealSortableId,
  resolveDealColumnKey,
} from '../lib/workTasksDashboardUtils';

const MODULE_KIND_STYLES = {
  'CRM-Deal': { iconBg: 'bg-emerald-100 text-emerald-600', label: 'CRM Deal' },
  'CRM-Lead': { iconBg: 'bg-teal-100 text-teal-600', label: 'CRM Lead' },
  SX: { iconBg: 'bg-orange-100 text-orange-600', label: 'Sản xuất' },
  VC: { iconBg: 'bg-violet-100 text-violet-600', label: 'Lắp đặt' },
  'Giao việc': { iconBg: 'bg-blue-100 text-blue-600', label: 'Giao việc' },
  'Cá nhân': { iconBg: 'bg-slate-100 text-slate-600', label: 'Cá nhân' },
  'Dự án': { iconBg: 'bg-sky-100 text-sky-600', label: 'Dự án' },
};

const PRIORITY_PILL = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

const PRIORITY_FULL = {
  urgent: 'Ưu tiên cao',
  high: 'Ưu tiên cao',
  medium: 'Ưu tiên TB',
  low: 'Ưu tiên thấp',
};

function resolveAssignee(task, assigneeMap) {
  if (!task?.assignee_id || !assigneeMap) return null;
  return assigneeMap.get(String(task.assignee_id)) || null;
}

function resolveDropColumnKey(overId, columnDefs, columnMap) {
  if (!overId) return null;
  const overStr = String(overId);
  if (columnDefs.some((c) => c.key === overStr)) return overStr;
  if (isDealSortableId(overStr)) {
    const dealKey = overStr.slice(5);
    for (const col of columnDefs) {
      const groups = groupTasksByDeal(columnMap[col.key] || []);
      if (groups.some((g) => g.key === dealKey)) return col.key;
    }
    return null;
  }
  for (const col of columnDefs) {
    if ((columnMap[col.key] || []).some((t) => t.unified_id === overId)) return col.key;
  }
  return null;
}

function KanbanTaskCard({ task, isOverlay = false, isDragging = false, readOnly = false, onTaskExtrasClick, assigneeMap }) {
  const overdue = task.deadline && new Date(task.deadline) < new Date() && !isTaskDone(task.status);
  const showExtras = !!onTaskExtrasClick && !isOverlay;
  const fileCount = task.file_count || 0;
  const noteCount = task.note_count || 0;
  const hasNotes = !!(task.notes && String(task.notes).trim());
  const kindStyle = MODULE_KIND_STYLES[task.task_kind] || { iconBg: 'bg-violet-100 text-violet-600', label: task.task_kind || 'Công việc' };
  const assignee = resolveAssignee(task, assigneeMap);
  const priorityKey = String(task.priority || '').toLowerCase();
  const priorityPill = PRIORITY_PILL[priorityKey] || 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <div
      className={`bg-white rounded-xl border transition-all select-none ${
        readOnly ? 'cursor-pointer' : 'touch-none'
      } ${
        isDragging
          ? 'border-violet-400 shadow-xl ring-2 ring-violet-200/80 scale-[1.02]'
          : 'border-slate-200/90 shadow-sm hover:border-violet-300 hover:shadow-md hover:-translate-y-0.5'
      } ${isOverlay ? 'p-2.5' : readOnly ? 'p-2.5' : 'p-2.5 cursor-grab active:cursor-grabbing'}`}
    >
      <div className="flex items-start gap-2">
        {!readOnly && !isOverlay && (
          <GripVertical className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-300 opacity-0 group-hover/card:opacity-100" aria-hidden />
        )}
        <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${kindStyle.iconBg}`}>
          <FolderKanban className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold leading-snug ${isTaskDone(task.status) ? 'line-through text-slate-400' : 'text-slate-900'}`}>
            {task.title}
          </p>
          {(task.lead_title || task.project_code || task.project_name) && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {task.lead_title || task.project_name || task.project_code}
            </p>
          )}
          {hasNotes && (
            <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic" title={task.notes}>
              {String(task.notes).slice(0, 72)}{String(task.notes).length > 72 ? '…' : ''}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {assignee && (
              <span className="inline-flex items-center gap-1" title={assignee.full_name || assignee.fullName}>
                {assignee.avatar ? (
                  <img
                    src={publicFileUrl(assignee.avatar)}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover ring-1 ring-white shadow-sm"
                  />
                ) : (
                  <span
                    className="h-5 w-5 rounded-full text-[8px] font-bold text-white flex items-center justify-center ring-1 ring-white shadow-sm"
                    style={{ backgroundColor: avatarColor(assignee.full_name || assignee.fullName || 'U') }}
                  >
                    {getInitials(assignee.full_name || assignee.fullName || 'U')}
                  </span>
                )}
              </span>
            )}
            {task.deadline && (
              <span className={`text-[10px] inline-flex items-center gap-1 font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                <Calendar className="h-3 w-3" />
                {formatDate(task.deadline)}
              </span>
            )}
            {task.priority && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${priorityPill}`}>
                {PRIORITY_FULL[priorityKey] || PRIORITY_LABELS[task.priority] || task.priority}
              </span>
            )}
            {fileCount > 0 && (
              <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5">
                <Paperclip className="h-3 w-3" />{fileCount}
              </span>
            )}
            {noteCount > 0 && (
              <span className="text-[10px] text-amber-700 inline-flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />{noteCount}
              </span>
            )}
          </div>
          {showExtras && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTaskExtrasClick(task);
              }}
              className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 cursor-pointer"
              title="Ghi chú & file đính kèm"
            >
              <MessageSquare className="h-3 w-3" />
              Ghi chú &amp; file
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableKanbanCard({ task, onTaskClick, onTaskExtrasClick, assigneeMap }) {
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
      className="group/card"
      {...attributes}
      {...listeners}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onTaskClick?.(task);
      }}
      title="Kéo để đổi trạng thái · Nhấp đúp để sửa"
    >
      <KanbanTaskCard task={task} isDragging={isDragging} onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
    </div>
  );
}

function StaticKanbanCard({ task, onTaskClick, onTaskExtrasClick, assigneeMap }) {
  return (
    <div
      className="group/card"
      onDoubleClick={() => onTaskClick?.(task)}
      title="Nhấp đúp để sửa"
    >
      <KanbanTaskCard task={task} readOnly onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
    </div>
  );
}

function SortableDealGroup({ group, expanded, onToggle, onTaskClick, onTaskExtrasClick, readOnly = false, assigneeMap }) {
  const sortId = dealSortableId(group.key);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });
  const count = group.tasks.length;
  const doneCount = group.tasks.filter((t) => isTaskDone(t.status)).length;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-black/5 bg-white/50 overflow-hidden">
      <div className="flex items-stretch bg-white/90 border-b border-black/5">
        {!readOnly && (
          <button
            type="button"
            className="shrink-0 px-1.5 flex items-center text-gray-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
            title="Kéo cả deal để đổi trạng thái mọi nhiệm vụ"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggle?.(group.key)}
          className="flex-1 min-w-0 px-2 py-1.5 text-left cursor-pointer hover:bg-indigo-50/70 transition-colors flex items-center gap-1.5 group/deal"
          aria-expanded={expanded}
          title={expanded ? 'Thu gọn deal' : 'Mở xem nhiệm vụ trong deal'}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-indigo-600 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            }`}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-indigo-900 truncate" title={group.label}>
              {group.leadId ? '💼' : '📁'} {group.label}
            </p>
            {group.projectCode && group.leadId && (
              <p className="text-[10px] text-gray-500 truncate">{group.projectCode}</p>
            )}
          </div>
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 tabular-nums">
            {count}{doneCount > 0 && doneCount < count ? ` · ${doneCount}✓` : ''}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="p-1.5 space-y-1.5">
          {group.tasks.map((t) => (
            readOnly
              ? <StaticKanbanCard key={t.unified_id} task={t} onTaskClick={onTaskClick} onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
              : <SortableKanbanCard key={t.unified_id} task={t} onTaskClick={onTaskClick} onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
          ))}
        </div>
      )}
    </div>
  );
}

function DealGroup({ group, expanded, onToggle, onTaskClick, onTaskExtrasClick, readOnly = false, assigneeMap }) {
  if (!readOnly && group.key !== '__other__') {
    return (
      <SortableDealGroup
        group={group}
        expanded={expanded}
        onToggle={onToggle}
        onTaskClick={onTaskClick}
        onTaskExtrasClick={onTaskExtrasClick}
        readOnly={readOnly}
        assigneeMap={assigneeMap}
      />
    );
  }
  const count = group.tasks.length;

  return (
    <div className="rounded-lg border border-black/5 bg-white/50 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle?.(group.key)}
        className="w-full px-2 py-1.5 bg-white/90 border-b border-black/5 text-left cursor-pointer hover:bg-indigo-50/70 transition-colors flex items-center gap-1.5 group/deal"
        aria-expanded={expanded}
        title={expanded ? 'Thu gọn deal' : 'Mở xem nhiệm vụ trong deal'}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-indigo-600 transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-indigo-900 truncate" title={group.label}>
            {group.leadId ? '💼' : '📁'} {group.label}
          </p>
          {group.projectCode && group.leadId && (
            <p className="text-[10px] text-gray-500 truncate">{group.projectCode}</p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 tabular-nums">
          {count}
        </span>
      </button>
      {expanded && (
        <div className="p-1.5 space-y-1.5">
          {group.tasks.map((t) => (
            readOnly
              ? <StaticKanbanCard key={t.unified_id} task={t} onTaskClick={onTaskClick} onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
              : <SortableKanbanCard key={t.unified_id} task={t} onTaskClick={onTaskClick} onTaskExtrasClick={onTaskExtrasClick} assigneeMap={assigneeMap} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusColumn({
  column, tasks, onTaskClick, onTaskExtrasClick, onAddTask, onEditColumn, onDeleteColumn,
  readOnly = false, showAddTask = true, allowColumnEdit = true,
  expandedDeals, onToggleDeal, assigneeMap,
}) {
  const dealGroups = useMemo(() => groupTasksByDeal(tasks), [tasks]);
  const sortableIds = useMemo(() => {
    const ids = tasks.map((t) => t.unified_id);
    if (!readOnly) {
      for (const g of dealGroups) {
        if (g.key !== '__other__') ids.push(dealSortableId(g.key));
      }
    }
    return ids;
  }, [tasks, dealGroups, readOnly]);
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: readOnly });

  const body = (
    <>
      <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto [scrollbar-width:thin]">
        {dealGroups.length === 0 ? (
          <p className="text-center text-[11px] text-gray-400 py-6">
            {readOnly ? 'Không có nhiệm vụ' : 'Kéo thả nhiệm vụ vào đây'}
          </p>
        ) : dealGroups.map((group) => (
          <DealGroup
            key={group.key}
            group={group}
            expanded={expandedDeals?.has(group.key)}
            onToggle={onToggleDeal}
            onTaskClick={onTaskClick}
            onTaskExtrasClick={onTaskExtrasClick}
            readOnly={readOnly}
            assigneeMap={assigneeMap}
          />
        ))}
      </div>
      {showAddTask && !readOnly && (
        <div className="shrink-0 px-2 pb-2 pt-0.5">
          <button
            type="button"
            onClick={() => onAddTask?.(column)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg cursor-pointer transition-colors"
            title="Thêm công việc"
            aria-label="Thêm công việc"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm công việc
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="shrink-0 w-[min(100%,268px)] flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/60 shadow-sm overflow-hidden">
      <div className="px-2.5 py-2 border-b border-slate-200/70 flex items-center gap-1.5 group/col bg-white/80">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${column.dot}`} />
        <span className="text-xs font-bold text-slate-800 truncate flex-1 min-w-0" title={column.label}>
          {column.label}
        </span>
        {allowColumnEdit && !readOnly && (
          <button
            type="button"
            onClick={() => onEditColumn?.(column)}
            className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-violet-700 hover:bg-violet-50 opacity-0 group-hover/col:opacity-100 transition-opacity cursor-pointer"
            title="Sửa cột"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        {allowColumnEdit && !readOnly && onDeleteColumn && (
          <button
            type="button"
            onClick={() => onDeleteColumn(column)}
            className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/col:opacity-100 transition-opacity cursor-pointer"
            title="Xóa cột"
            aria-label="Xóa cột"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 tabular-nums">
          {tasks.length}
        </span>
      </div>
      {readOnly ? (
        <div className="flex-1 flex flex-col min-h-[180px] max-h-[calc(100dvh-15.5rem)]">
          {body}
        </div>
      ) : (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`flex-1 flex flex-col min-h-[180px] max-h-[calc(100dvh-15.5rem)] transition-colors ${
              isOver ? 'bg-violet-50/70 ring-1 ring-inset ring-violet-300/60' : ''
            }`}
            data-status={column.key}
          >
            {body}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

function AddColumnCard({ onClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: '__add_column__' });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`shrink-0 w-[min(100%,188px)] min-h-[180px] self-stretch rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
        isOver
          ? 'border-violet-500 bg-violet-100/80 scale-[1.01]'
          : 'border-violet-300 bg-violet-50/50 hover:bg-violet-50 hover:border-violet-500 hover:shadow-md'
      }`}
    >
      <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center">
        <Columns3 className="h-4 w-4 text-violet-600" />
      </div>
      <span className="text-xs font-bold text-violet-800">Thêm cột</span>
    </button>
  );
}

function KanbanBoard({
  columnDefs,
  columns,
  readOnly,
  showAddColumn,
  showAddTask,
  allowColumnEdit,
  expandedDeals,
  onToggleDeal,
  onTaskClick,
  onTaskExtrasClick,
  onAddTask,
  onAddColumn,
  onEditColumn,
  onDeleteColumn,
  assigneeMap,
}) {
  return (
      <div className="flex gap-2.5 overflow-x-auto pb-1 min-h-[220px] [scrollbar-width:thin] items-stretch scroll-smooth">
      {columnDefs.map((col) => (
        <StatusColumn
          key={col.key}
          column={col}
          tasks={columns[col.key] || []}
          onTaskClick={onTaskClick}
          onTaskExtrasClick={onTaskExtrasClick}
          onAddTask={onAddTask}
          onEditColumn={onEditColumn}
          onDeleteColumn={onDeleteColumn}
          readOnly={readOnly}
          showAddTask={showAddTask}
          allowColumnEdit={allowColumnEdit}
          expandedDeals={expandedDeals}
          onToggleDeal={onToggleDeal}
          assigneeMap={assigneeMap}
        />
      ))}
      {showAddColumn && !readOnly && <AddColumnCard onClick={onAddColumn} />}
    </div>
  );
}

export default function WorkTasksStatusKanban({
  tasks,
  openOnly = true,
  columnDefs,
  groupMode = 'status',
  readOnly = false,
  showAddColumn = true,
  showAddTask = true,
  allowColumnEdit = true,
  onPatchStatus,
  onPatchDealStatus,
  onTaskClick,
  onTaskExtrasClick,
  onAddTask,
  onAddColumn,
  onEditColumn,
  onDeleteColumn,
  assigneeMap,
}) {
  const [columns, setColumns] = useState(() => {
    const fn = groupMode === 'deadline' ? groupTasksByDeadlineColumns : groupTasksByKanbanColumns;
    return fn(tasks, columnDefs, { openOnly, columnPins: readKanbanColumnPins() });
  });
  const [activeTask, setActiveTask] = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [expandedDeals, setExpandedDeals] = useState(() => new Set());
  const [columnPins, setColumnPins] = useState(() => readKanbanColumnPins());
  const dropTargetColRef = useRef(null);

  const regroupColumns = useCallback((pinMap = columnPins) => {
    const fn = groupMode === 'deadline' ? groupTasksByDeadlineColumns : groupTasksByKanbanColumns;
    return fn(tasks, columnDefs, { openOnly, columnPins: pinMap });
  }, [groupMode, tasks, columnDefs, openOnly, columnPins]);

  const toggleDeal = useCallback((dealKey) => {
    setExpandedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(dealKey)) next.delete(dealKey);
      else next.add(dealKey);
      return next;
    });
  }, []);

  const tasksKey = useMemo(
    () => (tasks || []).map((t) => `${t.unified_id}:${t.status}:${t.deadline}:${t.title}`).join('|'),
    [tasks],
  );

  const columnsDefKey = useMemo(
    () => columnDefs.map((c) => `${c.key}:${c.label}:${c.statusKey}`).join('|'),
    [columnDefs],
  );

  useEffect(() => {
    const pruned = pruneKanbanColumnPins(readKanbanColumnPins(), tasks, columnDefs);
    setColumnPins(pruned);
    const fn = groupMode === 'deadline' ? groupTasksByDeadlineColumns : groupTasksByKanbanColumns;
    setColumns(fn(tasks, columnDefs, { openOnly, columnPins: pruned }));
  }, [tasksKey, columnsDefKey, openOnly, tasks, columnDefs, groupMode]);

  const allTasks = useMemo(() => Object.values(columns).flat(), [columns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const findColumnKeyInMap = useCallback((itemId, columnMap) => {
    const idStr = String(itemId);
    if (isDealSortableId(idStr)) {
      const dealKey = idStr.slice(5);
      for (const col of columnDefs) {
        const groups = groupTasksByDeal(columnMap[col.key] || []);
        if (groups.some((g) => g.key === dealKey)) return col.key;
      }
      return null;
    }
    for (const col of columnDefs) {
      if ((columnMap[col.key] || []).some((t) => t.unified_id === itemId)) return col.key;
    }
    return null;
  }, [columnDefs]);

  const getColumnDef = useCallback((key) => columnDefs.find((c) => c.key === key), [columnDefs]);

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    setColumns((prev) => {
      const activeKey = findColumnKeyInMap(active.id, prev);
      let overKey = findColumnKeyInMap(over.id, prev);
      if (!overKey && columnDefs.some((c) => c.key === over.id)) overKey = over.id;

      if (!activeKey || !overKey || activeKey === overKey) return prev;

      dropTargetColRef.current = overKey;
      const targetCol = getColumnDef(overKey);
      const next = { ...prev };
      const activeStr = String(active.id);

      if (isDealSortableId(activeStr)) {
        const dealKey = activeStr.slice(5);
        const dealTasks = getTasksForDealKey(dealKey, next[activeKey] || []);
        if (!dealTasks.length) return prev;
        const ids = new Set(dealTasks.map((t) => t.unified_id));
        next[activeKey] = (next[activeKey] || []).filter((t) => !ids.has(t.unified_id));
        const moved = dealTasks.map((t) => ({
          ...t,
          status: resolveStatusForApi(t, targetCol?.statusKey || overKey),
        }));
        next[overKey] = [...(next[overKey] || []), ...moved];
        return next;
      }

      const task = next[activeKey]?.find((t) => t.unified_id === active.id);
      if (!task) return prev;
      next[activeKey] = next[activeKey].filter((t) => t.unified_id !== active.id);
      next[overKey] = [...(next[overKey] || []), {
        ...task,
        status: resolveStatusForApi(task, targetCol?.statusKey || overKey),
      }];
      return next;
    });
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveTask(null);
    setActiveDeal(null);

    const overKey = dropTargetColRef.current
      || (over ? resolveDropColumnKey(over.id, columnDefs, columns) : null);
    dropTargetColRef.current = null;

    const activeStr = String(active.id);

    if (isDealSortableId(activeStr)) {
      const dealKey = activeStr.slice(5);
      const dealTasks = getTasksForDealKey(dealKey, tasks);
      if (!dealTasks.length || !overKey) {
        setColumns(regroupColumns());
        return;
      }
      const prevKey = resolveDealColumnKey(dealTasks, columnDefs, columnPins);
      if (prevKey === overKey) return;

      try {
        if (onPatchDealStatus) {
          await onPatchDealStatus(dealTasks, overKey);
        } else {
          for (const t of dealTasks) {
            await onPatchStatus?.(t, overKey);
          }
        }
        let nextPins = columnPins;
        for (const t of dealTasks) {
          nextPins = setKanbanColumnPin(nextPins, t.unified_id, overKey);
        }
        setColumnPins(nextPins);
        setColumns(regroupColumns(nextPins));
      } catch (err) {
        setColumns(regroupColumns());
        alert(err?.message || 'Không chuyển deal được — thử lại sau');
      }
      return;
    }

    const task = tasks.find((t) => t.unified_id === active.id)
      || allTasks.find((t) => t.unified_id === active.id);

    if (!task || !overKey) {
      setColumns(regroupColumns());
      return;
    }

    const prevKey = resolveTaskColumnKey(task, columnDefs, columnPins);
    if (prevKey === overKey) return;

    try {
      await onPatchStatus?.(task, overKey);
      const nextPins = setKanbanColumnPin(columnPins, task.unified_id, overKey);
      setColumnPins(nextPins);
      setColumns(regroupColumns(nextPins));
    } catch (err) {
      setColumns(regroupColumns());
      alert(err?.message || 'Không chuyển cột được — thử lại sau');
    }
  };

  const board = (
    <KanbanBoard
      columnDefs={columnDefs}
      columns={columns}
      readOnly={readOnly}
      showAddColumn={showAddColumn}
      showAddTask={showAddTask}
      allowColumnEdit={allowColumnEdit}
      expandedDeals={expandedDeals}
      onToggleDeal={toggleDeal}
      onTaskClick={onTaskClick}
      onTaskExtrasClick={onTaskExtrasClick}
      onAddTask={onAddTask}
      onAddColumn={onAddColumn}
      onEditColumn={onEditColumn}
      onDeleteColumn={onDeleteColumn}
      assigneeMap={assigneeMap}
    />
  );

  if (readOnly) return board;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => {
        const idStr = String(e.active.id);
        if (isDealSortableId(idStr)) {
          const dealKey = idStr.slice(5);
          const dealTasks = getTasksForDealKey(dealKey, allTasks);
          const sample = dealTasks[0];
          setActiveDeal({
            key: dealKey,
            label: sample?.lead_title || sample?.project_code || 'Deal',
            count: dealTasks.length,
          });
          setActiveTask(null);
          return;
        }
        const task = allTasks.find((t) => t.unified_id === e.active.id);
        setActiveTask(task || null);
        setActiveDeal(null);
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveTask(null);
        setActiveDeal(null);
        dropTargetColRef.current = null;
        setColumns(regroupColumns());
      }}
    >
      {board}
      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <div className="w-[280px] rotate-1 opacity-95 pointer-events-none rounded-lg border-2 border-indigo-400 bg-indigo-50 shadow-lg px-3 py-2.5">
            <p className="text-sm font-bold text-indigo-900 truncate">💼 {activeDeal.label}</p>
            <p className="text-[10px] text-indigo-700 mt-0.5">Kéo cả deal · {activeDeal.count} nhiệm vụ</p>
          </div>
        ) : activeTask ? (
          <div className="w-[280px] rotate-1 opacity-95 pointer-events-none">
            <KanbanTaskCard task={activeTask} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

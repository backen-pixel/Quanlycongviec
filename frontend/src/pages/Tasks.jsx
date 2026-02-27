import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Clock, CheckSquare } from 'lucide-react';
import { TASK_STATUS, TASK_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatDate, getInitials, avatarColor } from '../lib/utils';

function TaskCard({ task, onMove }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
      {/* Project code + priority */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {task.projects && (
          <span className="text-[10px] text-gray-400 font-medium">{task.projects.code}</span>
        )}
        {task.priority && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] || ''}`}>
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-800 mb-2 leading-snug">{task.title}</h4>

      {/* Footer: date + assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          {task.due_date && (
            <span className={`flex items-center gap-1 ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : ''}`}>
              <Clock className="h-3 w-3" />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
        {task.assignee && (
          <div
            className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: avatarColor(task.assignee.full_name) }}
            title={task.assignee.full_name}
          >
            {getInitials(task.assignee.full_name)}
          </div>
        )}
      </div>

      {/* Quick move buttons on hover */}
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
        {Object.keys(TASK_STATUS)
          .filter(s => s !== task.status)
          .map(s => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); onMove(task.id, s); }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-500 transition-colors cursor-pointer"
            >
              → {TASK_STATUS[s]}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function Tasks() {
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = () => {
    setLoading(true);
    api.get('/tasks', { params: { group_by: 'status' } })
      .then(r => {
        setColumns(r.data.columns || {});
        setTotal(r.data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const moveTask = async (taskId, newStatus) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      load();
    } catch {}
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
        <button className="h-9 px-4 bg-[var(--color-primary-600)] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--color-primary-700)] transition-colors cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm task
        </button>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Object.entries(TASK_STATUS).map(([key, label]) => {
          const tasks = columns[key] || [];
          return (
            <div key={key} className="shrink-0 w-72">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={`w-2.5 h-2.5 rounded-full ${TASK_COLORS[key]}`} />
                <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
                <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                  {tasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-gray-100/60">
                {tasks.map(t => (
                  <TaskCard key={t.id} task={t} onMove={moveTask} />
                ))}
                <button className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm transition-colors cursor-pointer">
                  <Plus className="h-4 w-4" /> Thêm
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

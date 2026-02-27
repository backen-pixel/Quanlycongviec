import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, GripVertical, Clock, Filter } from 'lucide-react';
import { TASK_STATUS, TASK_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatDate } from '../lib/utils';

function TaskCard({ task, onMove }) {
  return (
    <div className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {task.projects && <span className="text-[10px] text-gray-400">{task.projects.code}</span>}
        {task.priority && <span className={`text-[10px] px-1.5 py-0 rounded-full ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>}
      </div>
      <h4 className="text-sm font-medium text-gray-800 mb-2">{task.title}</h4>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          {task.due_date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(task.due_date)}</span>}
        </div>
        {task.assignee && (
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold" title={task.assignee.full_name}>
            {task.assignee.full_name?.[0]}
          </div>
        )}
      </div>
      {/* Quick status change */}
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {Object.keys(TASK_STATUS).filter(s => s !== task.status).map(s => (
          <button key={s} onClick={(e) => { e.stopPropagation(); onMove(task.id, s); }} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600">
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
    api.get('/tasks', { params: { group_by: 'status' } }).then(r => { setColumns(r.data.columns || {}); setTotal(r.data.total || 0); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const moveTask = async (taskId, newStatus) => {
    await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Kanban Board</h1><p className="text-gray-500 text-sm">{total} công việc</p></div>
        <button className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700"><Plus className="h-4 w-4" /> Thêm Task</button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {Object.entries(TASK_STATUS).map(([key, label]) => (
          <div key={key} className="shrink-0 w-72">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className={`w-3 h-3 rounded-full ${TASK_COLORS[key]}`} />
              <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded-full">{columns[key]?.length || 0}</span>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-gray-50/80">
              {(columns[key] || []).map(t => <TaskCard key={t.id} task={t} onMove={moveTask} />)}
              <button className="w-full flex items-center justify-center gap-2 p-2 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm">
                <Plus className="h-4 w-4" /> Thêm
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

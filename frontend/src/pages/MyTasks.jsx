import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import {
  CheckSquare, Clock, AlertTriangle, Calendar, Filter, User,
  ChevronDown, Inbox, PlayCircle, Eye, CheckCircle
} from 'lucide-react';
import {
  TASK_STATUS, TASK_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
  formatDate, getInitials, avatarColor
} from '../lib/utils';

export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState({ assigned: [], created: [], observed: [] });
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('assigned');
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'all' | 'done'

  const loadData = async () => {
    setLoading(true);
    try {
      // Tasks giao cho tôi
      const { data: myRes } = await api.get('/tasks/my');
      // Tất cả tasks tôi tạo
      const { data: allRes } = await api.get('/tasks', { params: {} });
      const allTasks = allRes.tasks || [];
      const createdByMe = allTasks.filter(t => t.creator?.id === user?.id);

      // Overdue
      const { data: overdueRes } = await api.get('/tasks/overdue');

      setTasks({
        assigned: myRes.tasks || [],
        created: createdByMe,
        observed: [], // TODO: load from participants
      });
      setOverdue(overdueRes.tasks || []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const updateStatus = async (taskId, status) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      loadData();
    } catch { }
  };

  const currentList = tasks[activeTab] || [];
  const filteredList = filterStatus === 'all' ? currentList
    : filterStatus === 'done' ? currentList.filter(t => t.status === 'done')
    : currentList.filter(t => t.status !== 'done');

  // Stats
  const totalAssigned = tasks.assigned.length;
  const totalCreated = tasks.created.length;
  const totalOverdue = overdue.length;
  const inProgress = tasks.assigned.filter(t => t.status === 'in_progress').length;

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
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Việc của tôi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý công việc cá nhân</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Được giao" value={totalAssigned} icon={Inbox} color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="Đang làm" value={inProgress} icon={PlayCircle} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="Tôi giao" value={totalCreated} icon={User} color="text-purple-600" bg="bg-purple-50" />
        <StatCard label="Quá hạn" value={totalOverdue} icon={AlertTriangle} color="text-red-600" bg="bg-red-50" />
      </div>

      {/* Overdue alert */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">⚠️ {totalOverdue} task quá hạn</h3>
          </div>
          <div className="space-y-1">
            {overdue.slice(0, 5).map(t => (
              <div key={t.id} onClick={() => setSelectedTask(t.id)}
                className="flex items-center gap-2 py-1 cursor-pointer hover:bg-red-100 rounded px-2 -mx-2">
                <span className="text-xs text-red-700 font-medium flex-1">{t.title}</span>
                <span className="text-[10px] text-red-500">{t.projects?.code} · hạn {formatDate(t.due_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[
            { id: 'assigned', label: 'Được giao', icon: Inbox, count: totalAssigned },
            { id: 'created', label: 'Tôi giao', icon: User, count: totalCreated },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                activeTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
              {t.count > 0 && <span className="text-[10px] bg-gray-200 px-1.5 rounded-full">{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {['active', 'done', 'all'].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${filterStatus === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {f === 'active' ? 'Đang làm' : f === 'done' ? 'Đã xong' : 'Tất cả'}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredList.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">
              {filterStatus === 'active' ? 'Không có task đang xử lý' : 'Không có task nào'}
            </p>
          </div>
        ) : (
          filteredList.map(t => {
            const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
            return (
              <div key={t.id} onClick={() => setSelectedTask(t.id)}
                className={`bg-white rounded-xl border p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer animate-fade-in ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  {/* Quick status toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (t.status === 'pending') updateStatus(t.id, 'in_progress');
                      else if (t.status === 'in_progress') updateStatus(t.id, 'review');
                      else if (t.status === 'review') updateStatus(t.id, 'done');
                    }}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                      t.status === 'done'
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : t.status === 'in_progress'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                    title={t.status === 'done' ? 'Hoàn thành' : 'Chuyển trạng thái tiếp'}
                  >
                    {t.status === 'done' && <CheckSquare className="h-3 w-3" />}
                    {t.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.title}
                      </span>
                      {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {t.projects && <span className="text-blue-600 font-medium">{t.projects.code}</span>}
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${TASK_COLORS[t.status]}`} />
                        {TASK_STATUS[t.status]}
                      </span>
                      {t.stage && <span>{t.stage.name}</span>}
                      {activeTab === 'created' && t.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{t.assignee.full_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority]}`}>
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                    {t.due_date && (
                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        <Calendar className="h-3 w-3" />{formatDate(t.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={loadData} />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

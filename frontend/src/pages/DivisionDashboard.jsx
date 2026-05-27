import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { ArrowLeft, Users, FolderOpen, CheckCircle, TrendingUp, AlertTriangle, Clock, Filter, ListChecks } from 'lucide-react';

export default function DivisionDashboard() {
  const { divisionId } = useParams();
  const [division, setDivision] = useState(null);
  const [divisions, setDivisions] = useState([]); // All divisions for quick nav
  const [kpis, setKpis] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');

  useEffect(() => {
    loadDivisionDashboard();
    loadAllDivisions();
  }, [divisionId]);

  const loadAllDivisions = async () => {
    try {
      const { data } = await api.get('/divisions');
      setDivisions(data.divisions || []);
    } catch (err) {
      console.error('Failed to load divisions list:', err);
    }
  };

  const loadDivisionDashboard = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/divisions/${divisionId}/dashboard`);
      setDivision(data.division);
      setKpis(data.kpis);
      setProjects(data.projects);
      setTasks(data.tasks);
      setMembers(data.members);
      setAlerts(data.alerts);
    } catch (err) {
      console.error('Failed to load division dashboard:', err);
    }
    setLoading(false);
  };

  if (loading || !division) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải dashboard...</p>
        </div>
      </div>
    );
  }

  const filteredProjects = projects.filter(p => {
    if (projectFilter === 'all') return true;
    if (projectFilter === 'active') return p.status !== 'completed';
    if (projectFilter === 'completed') return p.status === 'completed';
    return true;
  });

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <Link 
          to="/divisions" 
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách khối
        </Link>
        
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{division.icon || '🏢'}</span>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{division.name}</h1>
              {division.description && (
                <p className="text-gray-600 mt-1">{division.description}</p>
              )}
            </div>
          </div>

          {/* Quick Navigation Slider */}
          {divisions.length > 1 && (
            <QuickDivisionNav 
              divisions={divisions} 
              currentDivisionId={divisionId} 
            />
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KPICard
              title="Dự Án"
              value={kpis.projects.total}
              subtitle={`${kpis.projects.active} đang làm, ${kpis.projects.completed} hoàn thành`}
              icon={<FolderOpen className="h-6 w-6" />}
              color="blue"
            />
            <KPICard
              title="Công Việc"
              value={`${kpis.tasks.completion_rate}%`}
              subtitle={`${kpis.tasks.completed}/${kpis.tasks.total} tasks hoàn thành`}
              icon={<CheckCircle className="h-6 w-6" />}
              color="emerald"
            />
            <KPICard
              title="Nhân Sự"
              value={kpis.members.total}
              subtitle="thành viên trong khối"
              icon={<Users className="h-6 w-6" />}
              color="purple"
            />
            <KPICard
              title="Tiến Độ"
              value={`${kpis.progress}%`}
              subtitle="tỉ lệ hoàn thành chung"
              icon={<TrendingUp className="h-6 w-6" />}
              color="amber"
            />
          </div>

          {/* Quick Action: View All Projects & Tasks */}
          <Link
            to={`/divisions/${divisionId}/projects`}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-3 px-6 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            <ListChecks className="h-5 w-5" />
            Xem tất cả Dự án & Nhiệm vụ theo Khối
          </Link>
        </div>
      )}

      {/* Project List */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600" />
            Dự Án Của {division.name}
          </h2>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả ({projects.length})</option>
              <option value="active">Đang làm ({kpis?.projects.active || 0})</option>
              <option value="completed">Hoàn thành ({kpis?.projects.completed || 0})</option>
            </select>
          </div>
        </div>

        {filteredProjects.length > 0 ? (
          <div className="space-y-3">
            {filteredProjects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Chưa có dự án nào trong khối này</p>
          </div>
        )}
      </div>

      {/* Bottom Row: Kanban + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TaskKanban tasks={tasks} />
        </div>
        <div>
          <AlertsWidget alerts={alerts} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Quick Division Navigation Component
// ═══════════════════════════════════════════════════════════════════════════
function QuickDivisionNav({ divisions, currentDivisionId }) {
  const navigate = useNavigate();
  
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 min-w-[300px]">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Chuyển khối nhanh
      </div>
      <div className="space-y-2">
        {divisions.map(div => {
          const isCurrent = div.id === currentDivisionId;
          return (
            <button
              key={div.id}
              onClick={() => navigate(`/divisions/${div.id}`)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                isCurrent
                  ? 'bg-blue-50 border-2 border-blue-400 text-blue-700'
                  : 'border-2 border-transparent hover:bg-gray-50 hover:border-gray-200'
              }`}
            >
              <span className="text-2xl">{div.icon || '🏢'}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${isCurrent ? 'text-blue-900' : 'text-gray-900'}`}>
                  {div.name}
                </div>
                {div.stats && (
                  <div className="text-xs text-gray-500 flex gap-2">
                    <span>{div.stats.projects} dự án</span>
                    {div.stats.alerts > 0 && (
                      <span className="text-red-600 font-medium">
                        ⚠️ {div.stats.alerts}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isCurrent && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card Component
// ═══════════════════════════════════════════════════════════════════════════
function KPICard({ title, value, subtitle, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
  };

  return (
    <div className={`${colorClasses[color]} border-2 rounded-xl p-6`}>
      <div className="flex items-start justify-between mb-3">
        <div className="opacity-80">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">{title}</span>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-xs opacity-75">{subtitle}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Project Card Component
// ═══════════════════════════════════════════════════════════════════════════
function ProjectCard({ project }) {
  const progress = project.tasks_total > 0 
    ? Math.round((project.tasks_completed / project.tasks_total) * 100) 
    : 0;

  const isOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status !== 'completed';

  return (
    <Link
      to={`/projects/${project.id}`}
      className="block border rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {project.name}
            </h3>
            {isOverdue && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
                Quá hạn
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="font-mono">{project.code}</span>
            {project.customers && (
              <span>👤 {project.customers.full_name}</span>
            )}
          </div>
        </div>
        {project.current_stage && (
          <span
            className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              backgroundColor: project.current_stage.color + '20',
              color: project.current_stage.color,
            }}
          >
            {project.current_stage.name}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>Tiến độ</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3.5 w-3.5" />
          {project.tasks_completed || 0}/{project.tasks_total || 0} tasks
        </span>
        {project.due_date && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
            <Clock className="h-3.5 w-3.5" />
            {new Date(project.due_date).toLocaleDateString('vi-VN')}
          </span>
        )}
        {project.assignee && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {project.assignee.full_name}
          </span>
        )}
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Task Kanban Component
// ═══════════════════════════════════════════════════════════════════════════
function TaskKanban({ tasks }) {
  const columns = {
    pending: tasks.filter(t => t.status === 'pending'),
    active: tasks.filter(t => ['in_progress', 'review'].includes(t.status)),
    done: tasks.filter(t => t.status === 'done'),
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-emerald-600" />
        Công Việc (Kanban)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KanbanColumn 
          title="📋 Todo" 
          count={columns.pending.length} 
          tasks={columns.pending.slice(0, 8)} 
          color="gray" 
        />
        <KanbanColumn 
          title="🔵 Doing" 
          count={columns.active.length} 
          tasks={columns.active.slice(0, 8)} 
          color="blue" 
        />
        <KanbanColumn 
          title="✅ Done" 
          count={columns.done.length} 
          tasks={columns.done.slice(0, 8)} 
          color="emerald" 
        />
      </div>
    </div>
  );
}

function KanbanColumn({ title, count, tasks, color }) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colorClasses[color]}`}>
          {count}
        </span>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {tasks.map(task => (
          <div key={task.id} className="bg-white rounded-lg p-3 text-sm border hover:shadow-sm transition-shadow">
            <p className="font-medium text-gray-900 mb-1 line-clamp-2">{task.title}</p>
            <div className="flex items-center justify-between text-xs text-gray-500">
              {task.assignee && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {task.assignee.full_name}
                </span>
              )}
              {task.project && (
                <span className="font-mono text-xs">{task.project.code}</span>
              )}
            </div>
          </div>
        ))}
        {count > 8 && (
          <p className="text-xs text-gray-500 text-center pt-2">+{count - 8} công việc nữa</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Widget Component
// ═══════════════════════════════════════════════════════════════════════════
function AlertsWidget({ alerts }) {
  if (!alerts) return null;

  const alertItems = [
    { label: 'Dự án quá hạn', value: alerts.overdue_projects, color: 'red', icon: '🔴' },
    { label: 'Tasks quá hạn', value: alerts.overdue_tasks, color: 'orange', icon: '🟠' },
    { label: 'Tasks chưa giao', value: alerts.unassigned_tasks, color: 'yellow', icon: '🟡' },
    { label: 'Tasks bị block', value: alerts.blocked_tasks, color: 'gray', icon: '⚫' },
  ];

  const totalAlerts = alertItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        Cảnh Báo
      </h2>
      
      {totalAlerts > 0 ? (
        <div className="space-y-3">
          {alertItems.map((item, idx) => (
            item.value > 0 && (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                </div>
                <span className={`text-lg font-bold text-${item.color}-600`}>
                  {item.value}
                </span>
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-50" />
          <p className="font-medium">Mọi thứ đều ổn!</p>
          <p className="text-sm">Không có cảnh báo nào</p>
        </div>
      )}
    </div>
  );
}

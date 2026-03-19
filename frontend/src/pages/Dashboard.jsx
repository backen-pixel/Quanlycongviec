import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { 
  FolderKanban, CheckSquare, AlertTriangle, TrendingUp, ArrowRight, 
  Clock, Calendar, ChevronRight, User, Flag, AlertCircle, Building2
} from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, formatVND, formatDate, getInitials, avatarColor, PRIORITY_COLORS, PRIORITY_LABELS } from '../lib/utils';

function StatCard({ title, value, icon: Icon, color, bgColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value ?? 0}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function PipelineBar({ pipeline }) {
  if (!pipeline?.length) return null;
  const maxCount = Math.max(...pipeline.map(s => s.count), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Quy trình sản xuất
        </h2>
      </div>
      <div className="space-y-3">
        {pipeline.map(stage => (
          <div key={stage.id} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-20 shrink-0 truncate">{stage.name}</span>
            <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                style={{
                  width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 8 : 0)}%`,
                  backgroundColor: stage.color || '#3b82f6',
                }}
              >
                {stage.count > 0 && (
                  <span className="text-[11px] font-bold text-white">{stage.count}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentProjects({ projects }) {
  if (!projects?.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Dự án gần đây</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {projects.map(p => (
          <Link to={`/projects/${p.id}`} key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-blue-600">{p.code}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </div>
              <p className="text-sm text-gray-700 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{p.customers?.full_name}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-sm font-semibold text-gray-900">{formatVND(p.estimated_value)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MyTasksToday({ tasks, loading }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Categorize tasks
  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < today);
  const dueToday = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < tomorrow);
  const highPriority = tasks.filter(t => t.status !== 'done' && t.priority === 'high');
  const inProgress = tasks.filter(t => t.status === 'in_progress');

  const renderTaskList = (taskList, title, IconComponent, color, emptyMsg) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      );
    }

    return (
      <div className="mb-6 last:mb-0">
        <div className="flex items-center gap-2 mb-3">
          <IconComponent className={`h-4 w-4 ${color}`} />
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <span className="text-xs font-medium text-gray-400">({taskList.length})</span>
        </div>
        {taskList.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-lg">{emptyMsg}</p>
        ) : (
          <div className="space-y-2">
            {taskList.map(task => (
              <Link to={`/projects/${task.project_id}`} key={task.id}
                className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {task.priority && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority]}`}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      )}
                      {task.stage && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: task.stage.color + '20', color: task.stage.color }}>
                          {task.stage.name}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-blue-600">{task.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {task.project && (
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3 w-3" />
                          {task.project.code}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${new Date(task.due_date) < now && task.status !== 'done' ? 'text-red-600 font-medium' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-blue-600" />
          Công việc của tôi
        </h2>
        <Link to="/tasks" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
          Xem tất cả <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {renderTaskList(overdue, 'Quá hạn', AlertCircle, 'text-red-600', 'Không có task quá hạn! 🎉')}
      {renderTaskList(dueToday, 'Hạn hôm nay', Clock, 'text-orange-600', 'Không có task hạn hôm nay')}
      {renderTaskList(highPriority, 'Ưu tiên cao', Flag, 'text-purple-600', 'Không có task ưu tiên cao')}
      {renderTaskList(inProgress, 'Đang làm', PlayCircle, 'text-blue-600', 'Chưa bắt đầu task nào')}
    </div>
  );
}

function PlayCircle(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  );
}

function DivisionContent({ divisionId, divisions }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');

  const division = divisions.find(d => d.id === divisionId);

  useEffect(() => {
    // Reset company filter when switching division
    setSelectedCompany('');
  }, [divisionId]);

  useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    const params = {};
    if (selectedCompany) params.company_id = selectedCompany;
    api.get(`/divisions/${divisionId}/dashboard`, { params })
      .then(r => {
        setData(r.data);
        // Only update companies list on first load (no filter) to keep full list
        if (!selectedCompany && r.data.companies) {
          setCompanies(r.data.companies);
        }
      })
      .catch(err => {
        console.error('Failed to load division data:', err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [divisionId, selectedCompany]);

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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">Không thể tải dữ liệu khối</p>
      </div>
    );
  }

  const { stats, projects, tasks, activities } = data;

  return (
    <div className="space-y-6">
      {/* Division Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg animate-fade-in">
        <div className="flex items-center gap-4">
          <span className="text-5xl">{division?.icon || '🏢'}</span>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{division?.name || 'Khối'}</h2>
            <p className="text-blue-100 text-sm mt-1">{division?.description || 'Tổng quan hoạt động'}</p>
          </div>
        </div>
      </div>

      {/* Company Filter */}
      {companies.length > 0 && (
        <div className="flex items-center gap-3 animate-fade-in">
          <Building2 className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Công ty:</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCompany('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                !selectedCompany
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
              }`}
            >
              Tất cả
            </button>
            {companies.map(company => (
              <button
                key={company.id}
                onClick={() => setSelectedCompany(company.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedCompany === company.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                }`}
              >
                {company.icon && <span>{company.icon}</span>}
                {company.short_name || company.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tổng dự án" value={stats?.projects || 0} icon={FolderKanban} color="text-indigo-600" bgColor="bg-indigo-50" />
        <StatCard title="Đang hoạt động" value={stats?.active || 0} icon={TrendingUp} color="text-blue-600" bgColor="bg-blue-50" />
        <StatCard title="Công việc" value={stats?.tasks || 0} icon={CheckSquare} color="text-emerald-600" bgColor="bg-emerald-50" />
        <StatCard title="Quá hạn" value={stats?.overdue || 0} icon={AlertTriangle} color="text-red-600" bgColor="bg-red-50" />
      </div>

      {/* Projects List */}
      {projects && projects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Dự án trong khối
              {selectedCompany && companies.find(c => c.id === selectedCompany) && (
                <span className="text-gray-400 font-normal"> — {companies.find(c => c.id === selectedCompany)?.name}</span>
              )}
            </h2>
            <span className="text-xs text-gray-400">{projects.length} dự án</span>
          </div>
          <div className="divide-y divide-gray-100">
            {projects.slice(0, 10).map(p => (
              <Link to={`/projects/${p.id}`} key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                    {p.company && !selectedCompany && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">
                        {p.company.icon && <span className="mr-0.5">{p.company.icon}</span>}
                        {p.company.short_name || p.company.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 truncate">{p.name}</p>
                  {p.customer_name && <p className="text-xs text-gray-400">{p.customer_name}</p>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold text-gray-900">{formatVND(p.estimated_value)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!projects || projects.length === 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center animate-fade-in">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chưa có dự án nào trong khối này</p>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [divisions, setDivisions] = useState([]);
  const [data, setData] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [divisionsLoading, setDivisionsLoading] = useState(true);

  const selectedDivision = searchParams.get('khoi');

  useEffect(() => {
    // Load divisions
    api.get('/divisions')
      .then(r => setDivisions(r.data.divisions || []))
      .catch(() => {})
      .finally(() => setDivisionsLoading(false));

    // Only load overall dashboard if no division selected
    if (!selectedDivision) {
      api.get('/dashboard')
        .then(r => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    // Load my tasks (always show)
    if (user?.id) {
      api.get('/tasks', { params: { assignee_id: user.id } })
        .then(r => setMyTasks(r.data.tasks || []))
        .catch(() => {})
        .finally(() => setTasksLoading(false));
    }
  }, [user?.id, selectedDivision]);

  const handleTabChange = (divisionId) => {
    if (divisionId) {
      setSearchParams({ khoi: divisionId });
    } else {
      setSearchParams({});
    }
  };

  if (loading || divisionsLoading) {
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
    <div className="space-y-6 max-w-7xl">
      {/* Page header with Tabs */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h1>
        
        {/* Division Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => handleTabChange(null)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              !selectedDivision
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            🏠 Tổng quan
          </button>
          {divisions.map(division => (
            <button
              key={division.id}
              onClick={() => handleTabChange(division.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedDivision === division.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <span>{division.icon || '🏢'}</span>
              <span>{division.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {selectedDivision ? (
        <DivisionContent divisionId={selectedDivision} divisions={divisions} />
      ) : (
        <>
          {/* Overall Dashboard Stats */}
          {data && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Tổng dự án" value={data.stats?.totalProjects} icon={FolderKanban} color="text-indigo-600" bgColor="bg-indigo-50" />
                <StatCard title="Đang hoạt động" value={data.stats?.activeProjects} icon={TrendingUp} color="text-blue-600" bgColor="bg-blue-50" />
                <StatCard title="Task đang làm" value={data.taskCounts?.in_progress} icon={CheckSquare} color="text-emerald-600" bgColor="bg-emerald-50" />
                <StatCard title="Quá hạn" value={data.stats?.overdueCount} icon={AlertTriangle} color="text-red-600" bgColor="bg-red-50" />
              </div>

              {/* My Tasks Today */}
              <MyTasksToday tasks={myTasks} loading={tasksLoading} />

              {/* Pipeline + Recent */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PipelineBar pipeline={data.pipeline} />
                <RecentProjects projects={data.recentProjects} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

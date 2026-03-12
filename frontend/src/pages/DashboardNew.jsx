import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  FolderKanban, CheckSquare, Users, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, Clock, Eye, ArrowRight, Award, MapPin, Activity, Bell,
  ChevronDown, ChevronRight, Building2, Package, UserCheck
} from 'lucide-react';
import { formatVND, getInitials, avatarColor, STATUS_LABELS, STATUS_COLORS } from '../lib/utils';

export default function DashboardNew() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [divisions, setDivisions] = useState([]);
  const [overview, setOverview] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [activities, setActivities] = useState([]);
  const [divisionData, setDivisionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [divLoading, setDivLoading] = useState(false);

  const selectedDiv = searchParams.get('khoi');

  // Load divisions list (always)
  useEffect(() => {
    api.get('/dashboard/divisions')
      .then(r => setDivisions(r.data.divisions || []))
      .catch(() => {});
  }, []);

  // Load overall dashboard OR division dashboard
  useEffect(() => {
    if (selectedDiv) {
      loadDivisionDashboard(selectedDiv);
    } else {
      loadMainDashboard();
    }
  }, [selectedDiv]);

  const loadMainDashboard = async () => {
    setLoading(true);
    setDivisionData(null);
    try {
      const [overviewRes, workloadRes, alertsRes, activityRes] = await Promise.race([
        Promise.all([
          api.get('/dashboard/overview'),
          api.get('/dashboard/workload'),
          api.get('/dashboard/alerts'),
          api.get('/dashboard/activity?limit=10'),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000)),
      ]);
      setOverview(overviewRes.data);
      setWorkload(workloadRes.data.divisions || []);
      setAlerts(alertsRes.data);
      setActivities(activityRes.data.activities || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      if (!overview) {
        setOverview({
          projects: { total: 0, active: 0, completed: 0, new_7d: 0, overdue: 0 },
          tasks: { total: 0, completed: 0, completion_rate: 0, overdue: 0, blocked: 0 },
          customers: { total: 0, new_7d: 0, vip: 0, return_rate: 0 },
          revenue: { total: 0, growth_pct: 0, avg_project_value: 0, this_month: 0, last_month: 0 }
        });
      }
      setWorkload([]);
      setAlerts({ overdue_projects: 0, overdue_tasks: 0, pending_approvals: 0, unassigned_high_priority: 0, resource_overload: 0 });
      setActivities([]);
    }
    setLoading(false);
  };

  const loadDivisionDashboard = async (divId) => {
    setDivLoading(true);
    try {
      const { data } = await api.get(`/dashboard/division/${divId}`);
      setDivisionData(data);
    } catch (err) {
      console.error('Failed to load division dashboard:', err);
      setDivisionData(null);
    }
    setDivLoading(false);
  };

  const handleTabChange = (divId) => {
    if (divId) {
      setSearchParams({ khoi: divId });
    } else {
      setSearchParams({});
    }
  };

  const isLoading = selectedDiv ? divLoading : loading;

  if (isLoading && !overview && !divisionData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">📊 Dashboard</h1>

        {/* ══════ DIVISION TABS ══════ */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => handleTabChange(null)}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all duration-200 ${
              !selectedDiv
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm'
            }`}
          >
            🏠 Tổng quan
          </button>
          {divisions.map(div => (
            <button
              key={div.id}
              onClick={() => handleTabChange(div.id)}
              className={`px-5 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
                selectedDiv === div.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm'
              }`}
            >
              <span>{div.icon}</span>
              <span>{div.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════ CONTENT ══════ */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      ) : selectedDiv && divisionData ? (
        <DivisionDashboardContent data={divisionData} />
      ) : overview ? (
        <MainDashboardContent
          overview={overview}
          workload={workload}
          alerts={alerts}
          activities={activities}
          onRefresh={loadMainDashboard}
        />
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD (Tổng quan) — giữ nguyên layout cũ
// ═══════════════════════════════════════════════════════════════════════════
function MainDashboardContent({ overview, workload, alerts, activities, onRefresh }) {
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Dự Án" value={overview.projects.total}
          subtitle={`${overview.projects.active} đang làm`}
          trend={overview.projects.new_7d} trendLabel="mới (7 ngày)"
          icon={FolderKanban} color="bg-blue-600" bgColor="bg-blue-50"
        />
        <KPICard
          title="Công Việc" value={`${overview.tasks.completion_rate}%`}
          subtitle={`${overview.tasks.completed}/${overview.tasks.total}`}
          trend={overview.tasks.overdue} trendLabel="quá hạn" trendNegative
          icon={CheckSquare} color="bg-emerald-600" bgColor="bg-emerald-50"
        />
        <KPICard
          title="Khách Hàng" value={overview.customers.total}
          subtitle={`${overview.customers.vip} VIP`}
          trend={overview.customers.new_7d} trendLabel="mới (7 ngày)"
          icon={Users} color="bg-purple-600" bgColor="bg-purple-50"
        />
        <KPICard
          title="Doanh Thu" value={formatVND(overview.revenue.total)}
          subtitle={`TB: ${formatVND(overview.revenue.avg_project_value)}`}
          trend={overview.revenue.growth_pct} trendLabel="% tăng trưởng"
          icon={DollarSign} color="bg-amber-600" bgColor="bg-amber-50"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <WorkloadWidget workload={workload} />
        </div>
        <div>
          <AlertsWidget alerts={alerts} />
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed activities={activities} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DIVISION DASHBOARD — Nội dung cho 1 Khối
// ═══════════════════════════════════════════════════════════════════════════
function DivisionDashboardContent({ data }) {
  const { division, stats, pipeline, companies, projects } = data;

  const defaultIcons = {
    'Khối Kinh Doanh': '💼',
    'Khối Sản Xuất': '🏭',
    'Khối Vận Chuyển': '🚚',
    'Khối Lắp Đặt': '🔧',
  };
  const icon = division.icon || defaultIcons[division.name] || '🏢';

  return (
    <div className="space-y-6">
      {/* Division Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <span className="text-5xl">{icon}</span>
          <div>
            <h2 className="text-2xl font-bold">{division.name}</h2>
            <p className="text-blue-200 text-sm mt-1">{division.description || 'Tổng quan hoạt động khối'}</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Dự Án" value={stats.projects}
          subtitle={`${stats.active} đang làm`}
          icon={FolderKanban} color="bg-blue-600" bgColor="bg-blue-50"
        />
        <KPICard
          title="Công Việc" value={stats.tasks}
          subtitle={`${stats.completion_rate}% hoàn thành`}
          trend={stats.overdue_tasks} trendLabel="quá hạn" trendNegative
          icon={CheckSquare} color="bg-emerald-600" bgColor="bg-emerald-50"
        />
        <KPICard
          title="Nhân Sự" value={stats.members}
          subtitle={`${stats.companies} công ty`}
          icon={Users} color="bg-purple-600" bgColor="bg-purple-50"
        />
        <KPICard
          title="Cảnh Báo" value={stats.overdue_projects + stats.overdue_tasks}
          subtitle={`${stats.overdue_projects} DA · ${stats.overdue_tasks} CV quá hạn`}
          icon={AlertTriangle} color="bg-red-600" bgColor="bg-red-50"
        />
      </div>

      {/* Pipeline + Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline by stage */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-5">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Phân Bổ Dự Án Theo Giai Đoạn
          </h3>
          {pipeline.length > 0 ? (
            <div className="space-y-4">
              {pipeline.map((stage, idx) => {
                const maxCount = Math.max(...pipeline.map(s => s.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={idx} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <span>{stage.icon}</span>
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                        {stage.name}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{stage.count} dự án</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, stage.count > 0 ? 5 : 0)}%`,
                          backgroundColor: stage.color || '#3b82f6',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chưa có dự án</p>
            </div>
          )}
        </div>

        {/* Companies in this division */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-5">
            <Building2 className="h-5 w-5 text-purple-600" />
            Công Ty Trong Khối
          </h3>
          {companies.length > 0 ? (
            <div className="space-y-3">
              {companies.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-2xl">{c.icon || '🏭'}</span>
                  <span className="text-sm font-medium text-gray-900">{c.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chưa có công ty</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-blue-600" />
            Dự Án Gần Đây
          </h3>
        </div>
        {projects.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {projects.map(p => (
              <Link to={`/projects/${p.id}`} key={p.id}
                className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                    {p.stage && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: (p.stage.color || '#94a3b8') + '20', color: p.stage.color || '#94a3b8' }}>
                        {p.stage.icon} {p.stage.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">{p.name}</p>
                  {p.customer_name && <p className="text-xs text-gray-400 mt-0.5">{p.customer_name}</p>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold text-gray-900">{formatVND(p.estimated_value)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <FolderKanban className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có dự án nào trong khối này</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card Component
// ═══════════════════════════════════════════════════════════════════════════
function KPICard({ title, value, subtitle, trend, trendLabel, trendNegative, icon: Icon, color, bgColor }) {
  const trendPositive = !trendNegative && trend > 0;
  const trendColor = trendNegative
    ? trend > 0 ? 'text-red-600' : 'text-emerald-600'
    : trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`h-6 w-6 ${color.replace('bg-', 'text-')}`} />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        </div>
      </div>
      <div>
        <h3 className="text-3xl font-bold text-gray-900 mb-1">{value}</h3>
        <p className="text-sm text-gray-600 mb-2">{subtitle}</p>
        {trend !== undefined && trend !== null && trendLabel && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            {trendPositive ? <TrendingUp className="h-3.5 w-3.5" /> : trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
            <span>{trend > 0 ? '+' : ''}{trend} {trendLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Workload Widget
// ═══════════════════════════════════════════════════════════════════════════
function WorkloadWidget({ workload }) {
  const maxCount = Math.max(...workload.map(d => d.project_count), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          Phân Bổ Dự Án Theo Giai Đoạn
        </h2>
        <Link to="/projects" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Xem tất cả <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-4">
        {workload.map(stage => {
          const percentage = maxCount > 0 ? (stage.project_count / maxCount) * 100 : 0;
          return (
            <div key={stage.id} className="group">
              <div className="hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    {stage.icon && <span className="text-base">{stage.icon}</span>}
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    {stage.name}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{stage.project_count} dự án</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
                    style={{
                      width: `${Math.max(percentage, stage.project_count > 0 ? 5 : 0)}%`,
                      backgroundColor: stage.color || '#3b82f6',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {workload.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có dữ liệu</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Widget
// ═══════════════════════════════════════════════════════════════════════════
function AlertsWidget({ alerts }) {
  const alertItems = [
    { label: 'Dự án quá hạn', value: alerts.overdue_projects, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Tasks quá hạn', value: alerts.overdue_tasks, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Phê duyệt chờ', value: alerts.pending_approvals, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Task ưu tiên cao chưa giao', value: alerts.unassigned_high_priority, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Nhân viên quá tải', value: alerts.resource_overload, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];
  const totalAlerts = Object.values(alerts).reduce((sum, val) => sum + val, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          Cảnh Báo
        </h2>
        {totalAlerts > 0 && (
          <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">{totalAlerts}</span>
        )}
      </div>
      <div className="space-y-3">
        {alertItems.map((item, idx) => (
          <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${item.bg}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
            </div>
            <span className={`text-lg font-bold ${item.color}`}>{item.value}</span>
          </div>
        ))}
        {totalAlerts === 0 && (
          <div className="text-center py-8 text-gray-400">
            <CheckSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Không có cảnh báo</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Activity Feed
// ═══════════════════════════════════════════════════════════════════════════
function ActivityFeed({ activities }) {
  const formatTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  };

  const getActivityColor = (action) => {
    if (action === 'create') return 'bg-green-100 text-green-700';
    if (action === 'update') return 'bg-blue-100 text-blue-700';
    if (action === 'delete') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-600" />
          Hoạt Động Gần Đây
        </h2>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: avatarColor(activity.user?.full_name) }}
            >
              {getInitials(activity.user?.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">
                <span className="font-semibold">{activity.user?.full_name}</span> {activity.description}
              </p>
              <p className="text-xs text-gray-500 mt-1">{formatTime(activity.created_at)}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${getActivityColor(activity.action)}`}>
              {activity.action}
            </span>
          </div>
        ))}
        {activities.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có hoạt động</p>
          </div>
        )}
      </div>
    </div>
  );
}

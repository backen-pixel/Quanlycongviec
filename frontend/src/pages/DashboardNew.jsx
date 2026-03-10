import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  FolderKanban, CheckSquare, Users, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, Clock, Eye, ArrowRight, Award, MapPin, Activity, Bell, ChevronDown, ChevronRight
} from 'lucide-react';
import { formatVND, getInitials, avatarColor } from '../lib/utils';

export default function DashboardNew() {
  const [overview, setOverview] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [timeline, setTimeline] = useState({ projects: [], revenue: [] });
  const [team, setTeam] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [customers, setCustomers] = useState({ top_customers: [], geo_distribution: {} });
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    loadDashboard();
  }, [period]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Load critical data only (fast endpoints)
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
      console.log('Workload data:', workloadRes.data.divisions); // DEBUG
      setAlerts(alertsRes.data);
      setActivities(activityRes.data.activities || []);
      
      // Set empty data for removed widgets
      setTimeline({ projects: [], revenue: [] });
      setTeam([]);
      setCustomers({ top_customers: [], geo_distribution: {} });
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      // Set default empty data on error
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
      setTimeline({ projects: [], revenue: [] });
      setTeam([]);
      setCustomers({ top_customers: [], geo_distribution: {} });
    }
    setLoading(false);
  };

  if (loading || !overview) {
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
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📊 Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Tổng quan hệ thống quản lý TuBep Pro</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 px-4 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
            </select>
            <button
              onClick={loadDashboard}
              className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              🔄 Làm mới
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Dự Án"
          value={overview.projects.total}
          subtitle={`${overview.projects.active} đang làm`}
          trend={overview.projects.new_7d}
          trendLabel="mới (7 ngày)"
          icon={FolderKanban}
          color="bg-blue-600"
          bgColor="bg-blue-50"
        />
        <KPICard
          title="Công Việc"
          value={`${overview.tasks.completion_rate}%`}
          subtitle={`${overview.tasks.completed}/${overview.tasks.total}`}
          trend={overview.tasks.overdue}
          trendLabel="quá hạn"
          trendNegative
          icon={CheckSquare}
          color="bg-emerald-600"
          bgColor="bg-emerald-50"
        />
        <KPICard
          title="Khách Hàng"
          value={overview.customers.total}
          subtitle={`${overview.customers.vip} VIP`}
          trend={overview.customers.new_7d}
          trendLabel="mới (7 ngày)"
          icon={Users}
          color="bg-purple-600"
          bgColor="bg-purple-50"
        />
        <KPICard
          title="Doanh Thu"
          value={formatVND(overview.revenue.total)}
          subtitle={`TB: ${formatVND(overview.revenue.avg_project_value)}`}
          trend={overview.revenue.growth_pct}
          trendLabel="% tăng trưởng"
          icon={DollarSign}
          color="bg-amber-600"
          bgColor="bg-amber-50"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Workload by Division */}
        <div className="lg:col-span-2">
          <WorkloadWidget workload={workload} />
        </div>

        {/* Alerts */}
        <div>
          <AlertsWidget alerts={alerts} />
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed activities={activities} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card Component
// ═══════════════════════════════════════════════════════════════════════════
function KPICard({ title, value, subtitle, trend, trendLabel, trendNegative, icon: Icon, color, bgColor }) {
  const trendPositive = !trendNegative && trend > 0;
  const trendColor = trendNegative
    ? trend > 0
      ? 'text-red-600'
      : 'text-emerald-600'
    : trend > 0
    ? 'text-emerald-600'
    : trend < 0
    ? 'text-red-600'
    : 'text-gray-500';

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
        {trend !== undefined && trend !== null && (
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
// Workload Widget - Phân bổ công việc theo Giai đoạn
// ═══════════════════════════════════════════════════════════════════════════
function WorkloadWidget({ workload }) {
  const maxCount = Math.max(...workload.map(d => d.task_count), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          Phân Bổ Công Việc Theo Giai Đoạn
        </h2>
        <Link to="/tasks" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Xem tất cả <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-4">
        {workload.map(stage => {
          const percentage = maxCount > 0 ? (stage.task_count / maxCount) * 100 : 0;
          
          return (
            <div key={stage.id} className="group">
              {/* Stage bar */}
              <div className="hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    {stage.icon && <span className="text-base">{stage.icon}</span>}
                    <span 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                    {stage.project_count > 0 && (
                      <span className="text-xs text-gray-500">({stage.project_count} dự án)</span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{stage.task_count} việc</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
                    style={{
                      width: `${Math.max(percentage, stage.task_count > 0 ? 5 : 0)}%`,
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
          <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${item.bg} group hover:shadow-sm transition-shadow`}>
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
// Team Widget
// ═══════════════════════════════════════════════════════════════════════════
function TeamWidget({ team, period }) {
  const periodLabel = period === '7d' ? '7 ngày' : '30 ngày';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-600" />
          Top Performers ({periodLabel})
        </h2>
      </div>
      <div className="space-y-3">
        {team.slice(0, 5).map((user, idx) => (
          <div key={user.user_id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="text-lg font-bold text-gray-400">{idx + 1}</div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: avatarColor(user.name) }}
            >
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500">{user.tasks_completed} tasks · {user.projects_owned} projects</p>
            </div>
            {idx < 3 && (
              <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
            )}
          </div>
        ))}
        {team.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có dữ liệu</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Customers Widget
// ═══════════════════════════════════════════════════════════════════════════
function CustomersWidget({ customers }) {
  const topCustomers = customers.top_customers.slice(0, 5);
  const geo = customers.geo_distribution;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-600" />
          Khách Hàng VIP
        </h2>
      </div>
      <div className="space-y-3 mb-6">
        {topCustomers.map((cust, idx) => (
          <div key={cust.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="text-sm font-bold text-gray-400">{idx + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{cust.name}</p>
              <p className="text-xs text-gray-500">{cust.projects_count} dự án · {formatVND(cust.total_value)}</p>
            </div>
          </div>
        ))}
      </div>
      {Object.keys(geo).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Phân Bố Địa Lý
          </h3>
          <div className="space-y-2">
            {Object.entries(geo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([city, count]) => (
              <div key={city} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{city}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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

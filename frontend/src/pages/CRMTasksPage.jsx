import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import {
  List, Calendar, Users, AlertTriangle, Search, CheckCircle2, Circle, Clock,
  User, Eye, Target, X, Building2,
} from 'lucide-react';

const LS_CRM_TASKS_COMPANY = 'crm_tasks_overview_company_id';

const ALL_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
  { slug: 'design', label: 'Thiết kế', icon: '🎨', color: '#8B5CF6' },
  { slug: 'quotation', label: 'Báo giá', icon: '💰', color: '#F59E0B' },
  { slug: 'contract', label: 'Hợp đồng', icon: '📝', color: '#10B981' },
];
const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: CheckCircle2 };

export default function CRMTasksPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    try {
      return typeof window !== 'undefined' ? localStorage.getItem(LS_CRM_TASKS_COMPANY) || '' : '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    if (!isAdmin) setFilterAssignee((prev) => prev || String(user.id));
  }, [user?.id, user?.role, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } }).then((r) => {
      const list = r.data?.companies || r.data || [];
      setCompanies(Array.isArray(list) ? list : []);
    }).catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_CRM_TASKS_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_CRM_TASKS_COMPANY);
    } catch {
      /* ignore */
    }
  }, [isAdmin, filterCompanyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (isAdmin && filterCompanyId) params.company_id = filterCompanyId;
      if (filterStatus) params.status = filterStatus;
      if (filterAssignee) params.assignee_id = filterAssignee;
      if (filterStage) params.stage_slug = filterStage;
      if (filterType) params.type = filterType;

      const [tasksRes, usersRes] = await Promise.all([
        api.get('/crm/tasks/overview', { params }),
        api.get('/users').then((r) => r.data?.users || []),
      ]);
      setTasks(tasksRes.data || []);
      setUsers(usersRes);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [isAdmin, filterCompanyId, filterStatus, filterAssignee, filterStage, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async (task) => {
    const next = task.status === 'completed' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'completed';
    try { await api.put(`/crm/leads/${task.lead_id}/tasks/${task.id}`, { status: next }); load(); } catch {}
  };

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !(t.title || '').toLowerCase().includes(s)
          && !(t.lead?.title || '').toLowerCase().includes(s)
          && !(t.lead?.code || '').toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [tasks, search]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    return { total, completed, overdue, inProgress, pending: total - completed - inProgress };
  }, [tasks]);

  // Planner groups
  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    filtered.filter(t => t.status !== 'completed').forEach(t => {
      if (t.assignee_id && t.assignee) {
        if (!map[t.assignee_id]) map[t.assignee_id] = { user: t.assignee, tasks: [] };
        map[t.assignee_id].tasks.push(t);
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [filtered]);

  // Deadline groups
  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    filtered.filter(t => t.status !== 'completed').forEach(t => {
      if (!t.deadline) { groups.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [filtered]);

  const hasFilters = filterStatus || filterAssignee || filterStage || filterType || search || (isAdmin && filterCompanyId);
  const clearFilters = () => {
    setFilterStatus('');
    setFilterStage('');
    setFilterType('');
    setSearch('');
    if (isAdmin) {
      setFilterAssignee('');
      setFilterCompanyId('');
    } else {
      setFilterAssignee(user?.id ? String(user.id) : '');
    }
  };

  const TaskCard = ({ task }) => {
    const StatusIcon = STATUS_ICONS[task.status] || Circle;
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
    const stage = ALL_STAGES.find(s => s.slug === task.stage_slug);
    return (
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 border-b last:border-0">
        <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
          <StatusIcon className={`h-4 w-4 ${task.status === 'completed' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'font-medium'}`}
            style={task.status === 'completed' ? undefined : { color: '#000000' }}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.lead && (
              <Link to={`/crm/leads/${task.lead_id}`} className="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5">
                <Target className="h-2.5 w-2.5" />{task.lead.code} {task.lead.title}
              </Link>
            )}
            {stage && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{backgroundColor: stage.color + '20', color: stage.color}}>{stage.icon} {stage.label}</span>}
            {task.deadline && <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}><Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}</span>}
            {task.assignee && <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>}
            {task.supervisor && <span className="text-[10px] text-purple-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{task.supervisor.full_name}</span>}
          </div>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#000000' }}>✅ Công việc CRM</h1>
          <p className="text-sm text-gray-500">{stats.total} công việc — {stats.completed} hoàn thành</p>
          {!isAdmin && (
            <p className="text-xs text-blue-700 mt-1 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              Chỉ lead/deal thuộc công ty của bạn; mặc định việc được giao cho bạn
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="h-8 min-w-[180px] px-2 rounded-lg border text-xs bg-white"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((co) => (
                  <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
                ))}
              </select>
            </div>
          )}
        <div className="flex items-center gap-1">
          {[{ id: 'list', icon: List, label: 'List' }, { id: 'deadline', icon: AlertTriangle, label: 'Deadline' }, { id: 'planner', icon: Users, label: 'Planner' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <v.icon className="h-3.5 w-3.5" />{v.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Tổng',
            value: stats.total,
            icon: List,
            gradient: 'from-slate-100 via-gray-50 to-white',
            border: 'border-slate-300',
            iconBg: 'bg-slate-200',
            iconColor: 'text-slate-700',
            accent: 'bg-slate-500',
          },
          {
            label: 'Đang làm',
            value: stats.inProgress,
            icon: Clock,
            gradient: 'from-blue-100 via-sky-50 to-white',
            border: 'border-blue-300',
            iconBg: 'bg-blue-200',
            iconColor: 'text-blue-700',
            accent: 'bg-blue-500',
          },
          {
            label: 'Quá hạn',
            value: stats.overdue,
            icon: AlertTriangle,
            gradient: 'from-red-100 via-rose-50 to-white',
            border: 'border-red-300',
            iconBg: 'bg-red-200',
            iconColor: 'text-red-700',
            accent: 'bg-red-500',
          },
          {
            label: 'Hoàn thành',
            value: stats.completed,
            icon: CheckCircle2,
            gradient: 'from-emerald-100 via-green-50 to-white',
            border: 'border-emerald-300',
            iconBg: 'bg-emerald-200',
            iconColor: 'text-emerald-700',
            accent: 'bg-emerald-500',
          },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className={`relative overflow-hidden bg-gradient-to-br ${kpi.gradient} border ${kpi.border} rounded-2xl p-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 ${kpi.accent}`} />
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl ${kpi.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-3xl font-extrabold leading-none tracking-tight" style={{ color: '#000000' }}>
                    {kpi.value}
                  </p>
                  <p className="text-xs font-semibold mt-1 uppercase tracking-wide" style={{ color: '#000000' }}>
                    {kpi.label}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm công việc, lead, deal..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm outline-none focus:border-blue-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">Trạng thái</option>
          <option value="pending">Chờ</option><option value="in_progress">Đang làm</option><option value="completed">Xong</option>
        </select>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">Giai đoạn</option>
          {ALL_STAGES.map(s => <option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">{isAdmin ? 'Người thực hiện (tất cả)' : 'Tất cả NV (trong công ty)'}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
          <option value="">Lead/Deal</option>
          <option value="lead">💼 Lead</option><option value="deal">🎯 Deal</option>
        </select>
        {hasFilters && <button onClick={clearFilters} className="h-9 px-3 text-xs text-red-500 hover:bg-red-50 rounded-lg cursor-pointer flex items-center gap-1"><X className="h-3 w-3" />Xóa lọc</button>}
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div
          className="bg-white rounded-xl border divide-y overflow-y-auto"
          style={{ maxHeight: '640px' }}
        >
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc</p>
          ) : filtered.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}

      {/* DEADLINE VIEW */}
      {viewMode === 'deadline' && (
        <div className="space-y-3">
          {[
            { key: 'overdue', label: '🔴 Quá hạn', tasks: deadlineGroups.overdue, color: 'border-red-300 bg-red-50' },
            { key: 'today', label: '🟡 Hôm nay', tasks: deadlineGroups.today, color: 'border-amber-300 bg-amber-50' },
            { key: 'thisWeek', label: '🔵 Tuần này', tasks: deadlineGroups.thisWeek, color: 'border-blue-300 bg-blue-50' },
            { key: 'later', label: '⚪ Sau đó', tasks: deadlineGroups.later, color: 'border-gray-200 bg-gray-50' },
            { key: 'noDeadline', label: '⏳ Chưa có hạn', tasks: deadlineGroups.noDeadline, color: 'border-gray-200 bg-gray-50' },
          ].filter(g => g.tasks.length > 0).map(group => (
            <div key={group.key} className={`border rounded-xl ${group.color}`}>
              <div className="px-4 py-2 font-semibold text-sm flex items-center justify-between">
                <span>{group.label} <span className="text-gray-400 font-normal">({group.tasks.length})</span></span>
                {group.tasks.length > 10 && (
                  <span className="text-[10px] font-normal text-gray-500">Cuộn để xem thêm</span>
                )}
              </div>
              <div
                className="bg-white rounded-b-xl overflow-y-auto"
                style={{ maxHeight: '640px' }}
              >
                {group.tasks.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PLANNER VIEW */}
      {viewMode === 'planner' && (
        <div className="space-y-3">
          {plannerGroups.assignees.map(group => (
            <div key={group.user.id} className="border rounded-xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-t-xl">
                <div className="h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">{group.user.full_name?.charAt(0)}</div>
                <span className="text-sm font-semibold">{group.user.full_name}</span>
                <span className="text-xs text-gray-400">({group.tasks.length} việc)</span>
              </div>
              <div
                className="bg-white rounded-b-xl overflow-y-auto"
                style={{ maxHeight: '640px' }}
              >
                {group.tasks.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          ))}
          {plannerGroups.unassigned.length > 0 && (
            <div className="border rounded-xl border-dashed">
              <div className="px-4 py-3 bg-gray-50 rounded-t-xl text-sm font-semibold text-gray-500">Chưa giao ({plannerGroups.unassigned.length})</div>
              <div
                className="bg-white rounded-b-xl overflow-y-auto"
                style={{ maxHeight: '640px' }}
              >
                {plannerGroups.unassigned.map(t => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

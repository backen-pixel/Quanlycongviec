import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  FolderKanban, CheckSquare, Users, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, Clock, ArrowRight, Activity, Bell, Building2,
  ChevronDown, ChevronRight, Filter, Calendar, Search, X, User
} from 'lucide-react';
import { formatVND, getInitials, avatarColor, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate } from '../lib/utils';
import { TourButton } from '../components/WebTour';
import { dashboardTour } from '../lib/tourSteps';

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
  const [divDateFrom, setDivDateFrom] = useState('');
  const [divDateTo, setDivDateTo] = useState('');
  const [divCompanyId, setDivCompanyId] = useState('');

  const selectedDiv = searchParams.get('khoi');

  useEffect(() => {
    api.get('/dashboard/divisions').then(r => setDivisions(r.data.divisions || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedDiv) loadDivisionDashboard(selectedDiv);
    else loadMainDashboard();
  }, [selectedDiv]);

  const loadMainDashboard = async () => {
    setLoading(true); setDivisionData(null);
    try {
      const [o, w, a, act] = await Promise.race([
        Promise.all([api.get('/dashboard/overview'), api.get('/dashboard/workload'), api.get('/dashboard/alerts'), api.get('/dashboard/activity?limit=10')]),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 10000)),
      ]);
      setOverview(o.data); setWorkload(w.data.divisions || []); setAlerts(a.data); setActivities(act.data.activities || []);
    } catch {
      if (!overview) setOverview({ projects:{total:0,active:0,completed:0,new_7d:0,overdue:0}, tasks:{total:0,completed:0,completion_rate:0,overdue:0,blocked:0}, customers:{total:0,new_7d:0,vip:0,return_rate:0}, revenue:{total:0,growth_pct:0,avg_project_value:0,this_month:0,last_month:0} });
      setWorkload([]); setAlerts({overdue_projects:0,overdue_tasks:0,pending_approvals:0,unassigned_high_priority:0,resource_overload:0}); setActivities([]);
    }
    setLoading(false);
  };

  const loadDivisionDashboard = async (divId, from, to, companyId) => {
    setDivLoading(true);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (companyId) params.company_id = companyId;
      const { data } = await api.get(`/dashboard/division/${divId}`, { params });
      setDivisionData(data);
    } catch { setDivisionData(null); }
    setDivLoading(false);
  };

  const handleTabChange = (divId) => {
    divId ? setSearchParams({ khoi: divId }) : setSearchParams({});
    setDivDateFrom(''); setDivDateTo(''); setDivCompanyId('');
  };

  const handleDivDateFilter = () => { if (selectedDiv) loadDivisionDashboard(selectedDiv, divDateFrom, divDateTo, divCompanyId); };
  const clearDivDateFilter = () => { setDivDateFrom(''); setDivDateTo(''); if (selectedDiv) loadDivisionDashboard(selectedDiv, '', '', divCompanyId); };
  const handleCompanyFilter = (companyId) => {
    setDivCompanyId(companyId);
    if (selectedDiv) loadDivisionDashboard(selectedDiv, divDateFrom, divDateTo, companyId);
  };

  const isLoading = selectedDiv ? divLoading : loading;
  if (isLoading && !overview && !divisionData) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center"><div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div><p className="text-gray-500">Đang tải...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">📊 Dashboard</h1>
          <TourButton steps={dashboardTour} />
        </div>
        <div data-tour="division-tabs" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => handleTabChange(null)} className={`px-5 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${!selectedDiv ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>🏠 Tổng quan</button>
          {divisions.map(d => (
            <button key={d.id} onClick={() => handleTabChange(d.id)} className={`px-5 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${selectedDiv === d.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>
              <span>{d.icon}</span><span>{d.name}</span>
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
      : selectedDiv && divisionData ? <DivisionDashboardContent data={divisionData} dateFrom={divDateFrom} dateTo={divDateTo} setDateFrom={setDivDateFrom} setDateTo={setDivDateTo} onFilter={handleDivDateFilter} onClear={clearDivDateFilter} selectedCompany={divCompanyId} onCompanyChange={handleCompanyFilter} />
      : overview ? <MainDashboardContent overview={overview} workload={workload} alerts={alerts} activities={activities} /> : null}
    </div>
  );
}

function MainDashboardContent({ overview, workload, alerts, activities }) {
  return (<>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <KPICard title="Dự Án" value={overview.projects.total} subtitle={`${overview.projects.active} đang làm`} trend={overview.projects.new_7d} trendLabel="mới (7 ngày)" icon={FolderKanban} color="bg-blue-600" bgColor="bg-blue-50" />
      <KPICard title="Công Việc" value={`${overview.tasks.completion_rate}%`} subtitle={`${overview.tasks.completed}/${overview.tasks.total}`} trend={overview.tasks.overdue} trendLabel="quá hạn" trendNegative icon={CheckSquare} color="bg-emerald-600" bgColor="bg-emerald-50" />
      <KPICard title="Khách Hàng" value={overview.customers.total} subtitle={`${overview.customers.vip} VIP`} trend={overview.customers.new_7d} trendLabel="mới (7 ngày)" icon={Users} color="bg-purple-600" bgColor="bg-purple-50" />
      <KPICard title="Doanh Thu" value={formatVND(overview.revenue.total)} subtitle={`TB: ${formatVND(overview.revenue.avg_project_value)}`} trend={overview.revenue.growth_pct} trendLabel="% tăng trưởng" icon={DollarSign} color="bg-amber-600" bgColor="bg-amber-50" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <div className="lg:col-span-2"><WorkloadWidget workload={workload} /></div>
      <div><AlertsWidget alerts={alerts} /></div>
    </div>
    <ActivityFeed activities={activities} />
  </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// DIVISION DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function DivisionDashboardContent({ data, dateFrom, dateTo, setDateFrom, setDateTo, onFilter, onClear, selectedCompany, onCompanyChange }) {
  const { division, stats, upcoming, active, completed, companies_detail, companies_list, task_detail } = data;
  const [taskFilter, setTaskFilter] = useState({ search: '', assignee: 'all', stage: 'all', status: 'all' });
  const [expandedStage, setExpandedStage] = useState(null);

  const icons = { 'Khối Kinh Doanh': '💼', 'Khối Sản Xuất': '🏭', 'Khối Vận Chuyển': '🚚', 'Khối Lắp Đặt': '🔧' };
  const icon = division.icon || icons[division.name] || '🏢';

  const allAssignees = useMemo(() => {
    const m = {};
    (task_detail || []).forEach(td => td.tasks?.forEach(t => { if (t.assignee_id && t.assignee_name) m[t.assignee_id] = t.assignee_name; }));
    return Object.entries(m).map(([id, name]) => ({ id, name }));
  }, [task_detail]);

  const filteredTaskDetail = useMemo(() => {
    if (!task_detail) return [];
    return task_detail.map(td => {
      if (taskFilter.stage !== 'all' && td.stage !== taskFilter.stage) return null;
      let tasks = td.tasks || [];
      if (taskFilter.search) { const s = taskFilter.search.toLowerCase(); tasks = tasks.filter(t => t.title?.toLowerCase().includes(s) || t.project_code?.toLowerCase().includes(s) || t.project_name?.toLowerCase().includes(s)); }
      if (taskFilter.assignee !== 'all') tasks = tasks.filter(t => t.assignee_id === taskFilter.assignee);
      if (taskFilter.status !== 'all') {
        const now = new Date();
        if (taskFilter.status === 'pending') tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'in_progress');
        else if (taskFilter.status === 'in_progress') tasks = tasks.filter(t => t.status === 'in_progress');
        else if (taskFilter.status === 'done') tasks = tasks.filter(t => t.status === 'done');
        else if (taskFilter.status === 'overdue') tasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now);
      }
      if (tasks.length === 0 && (taskFilter.search || taskFilter.assignee !== 'all' || taskFilter.status !== 'all')) return null;
      return { ...td, tasks, total: tasks.length, done: tasks.filter(t => t.status === 'done').length, overdue: tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length, completion_rate: tasks.length > 0 ? Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0 };
    }).filter(Boolean);
  }, [task_detail, taskFilter]);

  return (
    <div className="space-y-6">
      {/* Header + Date */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{icon}</span>
            <div><h2 className="text-2xl font-bold">{division.name}</h2><p className="text-blue-200 text-sm mt-1">{division.description || 'Tổng quan hoạt động khối'}</p></div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-xl p-2">
            <Calendar className="h-4 w-4 text-blue-200" />
            <select value={dateFrom === '' && dateTo === '' ? 'custom' : ''} onChange={e => {
              const v = e.target.value;
              if (v === 'custom') { setDateFrom(''); setDateTo(''); return; }
              const now = new Date(); const fmt = d => d.toISOString().split('T')[0];
              if (v === '7d') { const from = new Date(now); from.setDate(from.getDate() - 7); setDateFrom(fmt(from)); setDateTo(fmt(now)); onFilter(); }
              else if (v === '30d') { const from = new Date(now); from.setDate(from.getDate() - 30); setDateFrom(fmt(from)); setDateTo(fmt(now)); onFilter(); }
            }} className="h-8 px-2 bg-white/20 border border-white/30 rounded-lg text-xs text-white font-medium [&>option]:text-gray-900 [&>option]:bg-white"
            style={{ colorScheme: 'dark' }}>
              <option value="custom">Tùy chỉnh</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 px-2 bg-white/20 border border-white/30 rounded-lg text-sm text-white [color-scheme:dark]" />
            <span className="text-blue-200 text-xs">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 px-2 bg-white/20 border border-white/30 rounded-lg text-sm text-white [color-scheme:dark]" />
            <button onClick={onFilter} className="h-8 px-3 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium">Lọc</button>
            {(dateFrom || dateTo) && <button onClick={onClear} className="h-8 px-2 bg-red-500/30 hover:bg-red-500/50 rounded-lg text-xs"><X className="h-3 w-3" /></button>}
          </div>
        </div>
      </div>

      {/* Company Filter */}
      {(companies_list || []).length > 0 && (
        <div data-tour="company-filter" className="flex items-center gap-3 flex-wrap">
          <Building2 className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Công ty:</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button onClick={() => onCompanyChange('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                !selectedCompany ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
              }`}>Tất cả</button>
            {(companies_list || []).map(c => (
              <button key={c.id} onClick={() => onCompanyChange(c.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  selectedCompany === c.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                }`}>{c.short_name || c.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div data-tour="kpi-cards" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Sắp Tới" value={stats.upcoming} subtitle="dự án chờ đến khối" icon={Clock} color="bg-amber-600" bgColor="bg-amber-50" />
        <KPICard title="Đang Thực Hiện" value={stats.active} subtitle={`${stats.total_tasks} nhiệm vụ`} icon={FolderKanban} color="bg-blue-600" bgColor="bg-blue-50" />
        <KPICard title="Đã Hoàn Thành" value={stats.completed} subtitle="đã qua khối" icon={CheckSquare} color="bg-emerald-600" bgColor="bg-emerald-50" />
        <KPICard title="Trễ Hạn" value={stats.overdue || 0} subtitle={`${stats.overdue_tasks} NV quá hạn`} trendNegative icon={AlertTriangle} color="bg-red-600" bgColor="bg-red-50" />
      </div>

      {/* CRM Revenue per Khối */}
      {data?.crm && (data.crm.total_orders > 0 || data.crm.total_paid > 0) && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" />Doanh thu Khối</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-lg p-3"><p className="text-[10px] text-blue-600 uppercase font-medium">Tổng ĐH</p><p className="text-lg font-bold text-blue-700">{formatVND(data.crm.total_orders)}</p></div>
            <div className="bg-purple-50 rounded-lg p-3"><p className="text-[10px] text-purple-600 uppercase font-medium">Đã xuất HĐ</p><p className="text-lg font-bold text-purple-700">{formatVND(data.crm.total_invoiced)}</p></div>
            <div className="bg-emerald-50 rounded-lg p-3"><p className="text-[10px] text-emerald-600 uppercase font-medium">Đã thu</p><p className="text-lg font-bold text-emerald-700">{formatVND(data.crm.total_paid)}</p></div>
            <div className={`rounded-lg p-3 ${data.crm.total_debt > 0 ? 'bg-red-50' : 'bg-gray-50'}`}><p className={`text-[10px] uppercase font-medium ${data.crm.total_debt > 0 ? 'text-red-600' : 'text-gray-500'}`}>Công nợ</p><p className={`text-lg font-bold ${data.crm.total_debt > 0 ? 'text-red-700' : 'text-gray-400'}`}>{formatVND(data.crm.total_debt)}</p></div>
          </div>
        </div>
      )}

      {/* Task Detail */}
      {task_detail?.length > 0 && (
        <div data-tour="task-detail" className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-5"><CheckSquare className="h-5 w-5 text-blue-600" />Chi Tiết Nhiệm Vụ Theo Quy Trình</h3>
          <div className="flex items-center gap-2 flex-wrap mb-5 bg-gray-50 rounded-xl p-3">
            <div className="relative flex-1 min-w-[150px] max-w-[250px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input value={taskFilter.search} onChange={e => setTaskFilter(f => ({ ...f, search: e.target.value }))} placeholder="Tìm NV / dự án..." className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-xs bg-white" />
            </div>
            <select value={taskFilter.stage} onChange={e => setTaskFilter(f => ({ ...f, stage: e.target.value }))} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white">
              <option value="all">Tất cả quy trình</option>
              {(task_detail || []).map(td => <option key={td.stage} value={td.stage}>{td.stage}</option>)}
            </select>
            <select value={taskFilter.assignee} onChange={e => setTaskFilter(f => ({ ...f, assignee: e.target.value }))} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white">
              <option value="all">Tất cả nhân viên</option>
              {allAssignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={taskFilter.status} onChange={e => setTaskFilter(f => ({ ...f, status: e.target.value }))} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white">
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">○ Chưa làm</option>
              <option value="in_progress">▶ Đang làm</option>
              <option value="done">✓ Đã xong</option>
              <option value="overdue">⚠ Quá hạn</option>
            </select>
            {(taskFilter.search || taskFilter.stage !== 'all' || taskFilter.assignee !== 'all' || taskFilter.status !== 'all') && (
              <button onClick={() => setTaskFilter({ search: '', assignee: 'all', stage: 'all', status: 'all' })} className="h-8 px-2 text-red-500 hover:bg-red-50 rounded-lg text-xs flex items-center gap-1"><X className="h-3 w-3" /> Xóa lọc</button>
            )}
          </div>
          <div className="space-y-3">
            {filteredTaskDetail.map(td => (
              <div key={td.stage} className="border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setExpandedStage(expandedStage === td.stage ? null : td.stage)} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    {expandedStage === td.stage ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-bold text-gray-900">{td.stage}</span>
                    <span className="text-xs text-gray-500">{td.total} nhiệm vụ</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{td.done} xong</span>
                    {td.overdue > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{td.overdue} trễ</span>}
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${td.completion_rate}%` }} /></div>
                    <span className="text-xs font-medium text-gray-600">{td.completion_rate}%</span>
                  </div>
                </button>
                {expandedStage === td.stage && (
                  <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                    {(() => {
                      // Group tasks by project
                      const byProject = {};
                      td.tasks.forEach(t => {
                        const key = t.project_id;
                        if (!byProject[key]) byProject[key] = { code: t.project_code, name: t.project_name, id: t.project_id, tasks: [] };
                        byProject[key].tasks.push(t);
                      });
                      const projects = Object.values(byProject);
                      return projects.map(proj => {
                        const done = proj.tasks.filter(t => t.status === 'done').length;
                        const total = proj.tasks.length;
                        const overdue = proj.tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return (
                          <Link to={`/projects/${proj.id}`} key={proj.id} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-400 transition-all group">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{proj.code}</span>
                                <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600">{proj.name}</h4>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-emerald-600 font-bold">{done}/{total}</span>
                                {overdue > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">{overdue} trễ</span>}
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="flex items-center gap-2 mb-3">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-gray-500 w-8 text-right">{pct}%</span>
                            </div>
                            {/* Task list compact */}
                            <div className="space-y-1">
                              {proj.tasks.map(t => {
                                const isDone = t.status === 'done';
                                const isOverdue = !isDone && t.due_date && new Date(t.due_date) < new Date();
                                return (
                                  <div key={t.id} className={`flex items-center gap-2 py-1 px-2 rounded text-xs ${isDone ? 'text-gray-400' : isOverdue ? 'text-red-700 bg-red-50' : 'text-gray-700'}`}>
                                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500 border-emerald-500' : isOverdue ? 'border-red-400' : 'border-gray-300'}`}>
                                      {isDone && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    </span>
                                    <span className={`flex-1 truncate ${isDone ? 'line-through' : ''}`}>{t.title}</span>
                                    {t.assignee_name && <span className="text-gray-400 shrink-0">{t.assignee_name}</span>}
                                    {t.due_date && <span className={`shrink-0 ${isOverdue ? 'text-red-600 font-bold' : isDone ? 'text-emerald-500' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </Link>
                        );
                      });
                    })()}
                    {td.tasks.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Không có nhiệm vụ</p>}
                  </div>
                )}
              </div>
            ))}
            {filteredTaskDetail.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không có nhiệm vụ</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectColumn({ title, projects, color }) {
  const cls = { amber: 'border-amber-300 bg-amber-50', blue: 'border-blue-300 bg-blue-50', emerald: 'border-emerald-300 bg-emerald-50' };
  const hdr = { amber: 'bg-amber-100', blue: 'bg-blue-100', emerald: 'bg-emerald-100' };
  return (
    <div className={`rounded-xl border-2 ${cls[color]} overflow-hidden`}>
      <div className={`${hdr[color]} px-4 py-3 flex items-center justify-between`}><h4 className="text-sm font-bold text-gray-900">{title}</h4><span className="text-xs font-bold text-gray-600">{projects.length}</span></div>
      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {projects.map(p => (
          <Link to={`/projects/${p.id}`} key={p.id} className="block bg-white rounded-lg p-3 border border-gray-200 hover:shadow-sm hover:border-blue-300 transition-all">
            <div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold text-blue-600">{p.code}</span>{p.stage && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (p.stage.color || '#94a3b8') + '20', color: p.stage.color }}>{p.stage.icon} {p.stage.name}</span>}</div>
            <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
            {p.customer_name && <p className="text-xs text-gray-400 mt-0.5">{p.customer_name}</p>}
            {p.estimated_value > 0 && <p className="text-xs font-bold text-green-600 mt-1">{formatVND(p.estimated_value)}</p>}
          </Link>
        ))}
        {projects.length === 0 && <p className="text-center text-xs text-gray-400 py-6">Trống</p>}
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle, trend, trendLabel, trendNegative, icon: Icon, color, bgColor }) {
  const tc = trendNegative ? (trend > 0 ? 'text-red-600' : 'text-emerald-600') : (trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-gray-500');
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}><Icon className={`h-6 w-6 ${color.replace('bg-', 'text-')}`} /></div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <h3 className="text-3xl font-bold text-gray-900 mb-1">{value}</h3>
      <p className="text-sm text-gray-600 mb-2">{subtitle}</p>
      {trend !== undefined && trend !== null && trendLabel && (
        <div className={`flex items-center gap-1 text-xs font-medium ${tc}`}>
          {!trendNegative && trend > 0 && <TrendingUp className="h-3.5 w-3.5" />}
          {trend < 0 && <TrendingDown className="h-3.5 w-3.5" />}
          <span>{trend > 0 ? '+' : ''}{trend} {trendLabel}</span>
        </div>
      )}
    </div>
  );
}

function WorkloadWidget({ workload }) {
  const mx = Math.max(...workload.map(d => d.project_count), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600" />Phân Bổ Dự Án Theo Giai Đoạn</h2><Link to="/projects" className="text-xs text-blue-600 hover:underline flex items-center gap-1">Xem tất cả <ArrowRight className="h-3 w-3" /></Link></div>
      <div className="space-y-4">
        {workload.map(s => (<div key={s.id} className="group"><div className="hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors"><div className="flex items-center justify-between mb-1.5"><span className="text-sm font-medium text-gray-700 flex items-center gap-2">{s.icon && <span>{s.icon}</span>}<span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span><span className="text-sm font-bold text-gray-900">{s.project_count} dự án</span></div><div className="h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max((s.project_count/mx)*100, s.project_count > 0 ? 5 : 0)}%`, backgroundColor: s.color || '#3b82f6' }} /></div></div></div>))}
        {workload.length === 0 && <div className="text-center py-8 text-gray-400"><TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">Chưa có dữ liệu</p></div>}
      </div>
    </div>
  );
}

function AlertsWidget({ alerts }) {
  const items = [
    { label: 'Dự án quá hạn', value: alerts.overdue_projects, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Tasks quá hạn', value: alerts.overdue_tasks, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Phê duyệt chờ', value: alerts.pending_approvals, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Task ưu tiên cao chưa giao', value: alerts.unassigned_high_priority, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Nhân viên quá tải', value: alerts.resource_overload, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];
  const total = Object.values(alerts).reduce((s, v) => s + v, 0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Bell className="h-5 w-5 text-amber-600" />Cảnh Báo</h2>{total > 0 && <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">{total}</span>}</div>
      <div className="space-y-3">
        {items.map((it, i) => (<div key={i} className={`flex items-center justify-between p-3 rounded-lg ${it.bg}`}><div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${it.color}`} /><span className="text-sm font-medium text-gray-700">{it.label}</span></div><span className={`text-lg font-bold ${it.color}`}>{it.value}</span></div>))}
        {total === 0 && <div className="text-center py-8 text-gray-400"><CheckSquare className="h-12 w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">Không có cảnh báo</p></div>}
      </div>
    </div>
  );
}

function ActivityFeed({ activities }) {
  const fmtTime = (d) => { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 1) return 'Vừa xong'; if (m < 60) return `${m} phút trước`; const h = Math.floor(m/60); if (h < 24) return `${h} giờ trước`; return `${Math.floor(h/24)} ngày trước`; };
  const actColor = (a) => a === 'create' ? 'bg-green-100 text-green-700' : a === 'update' ? 'bg-blue-100 text-blue-700' : a === 'delete' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-6"><Activity className="h-5 w-5 text-indigo-600" />Hoạt Động Gần Đây</h2>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {activities.map(a => (
          <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: avatarColor(a.user?.full_name) }}>{getInitials(a.user?.full_name)}</div>
            <div className="flex-1 min-w-0"><p className="text-sm text-gray-900"><span className="font-semibold">{a.user?.full_name}</span> {a.description}</p><p className="text-xs text-gray-500 mt-1">{fmtTime(a.created_at)}</p></div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${actColor(a.action)}`}>{a.action}</span>
          </div>
        ))}
        {activities.length === 0 && <div className="text-center py-8 text-gray-400"><Activity className="h-12 w-12 mx-auto mb-2 opacity-50" /><p className="text-sm">Chưa có hoạt động</p></div>}
      </div>
    </div>
  );
}
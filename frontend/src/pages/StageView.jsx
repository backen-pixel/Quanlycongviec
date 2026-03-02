import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import Modal from '../components/Modal';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import {
  PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor, ROLE_LABELS, ROLE_STAGE_MAP,
} from '../lib/utils';
import {
  Plus, FolderKanban, CheckSquare, Lock,
  Clock, AlertTriangle, RefreshCw, Calendar, Building2,
  ArrowRightCircle, Send, Paperclip, MessageSquare, Eye, EyeOff, Save
} from 'lucide-react';

const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

const NEXT_STATUS = { consulting:'designing', design:'quoting', quotation:'contract_signed', contract:'producing', production:'shipping', shipping:'installing', installation:'warranty' };
const NEXT_SLUG = { consulting:'design', design:'quotation', quotation:'contract', contract:'production', production:'shipping', shipping:'installation', installation:'customer-care' };
// slug → project status khi đang ở giai đoạn đó
const SLUG_TO_STATUS = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };

const QT = [{id:'all',label:'Tất cả'},{id:'today',label:'Hôm nay'},{id:'week',label:'Tuần này'},{id:'month',label:'Tháng này'},{id:'custom',label:'Tùy chọn'}];
function fmtD(d){return d.toISOString().slice(0,10)}
function defRange(){const n=new Date();return{from:fmtD(new Date(n.getFullYear(),n.getMonth(),1)),to:fmtD(new Date(n.getFullYear(),n.getMonth()+1,0))}}

export default function StageView() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stageInfo, setStageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filterProject, setFilterProject] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [quickTime, setQuickTime] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [advProj, setAdvProj] = useState(null);
  const [advNotes, setAdvNotes] = useState('');
  const [advFiles, setAdvFiles] = useState([]);
  const [advMode, setAdvMode] = useState('advance');
  const [advLoading, setAdvLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState({}); // { projectId: true }

  useEffect(() => {
    const n = new Date();
    if (quickTime === 'all') { setDateFrom(''); setDateTo(''); }
    else if (quickTime === 'today') { const d = fmtD(n); setDateFrom(d); setDateTo(d); }
    else if (quickTime === 'week') { const s = new Date(n); s.setDate(n.getDate()-n.getDay()); setDateFrom(fmtD(s)); setDateTo(fmtD(n)); }
    else if (quickTime === 'month') { setDateFrom(defRange().from); setDateTo(defRange().to); }
  }, [quickTime]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stageRes, projRes] = await Promise.all([
        api.get('/users/stages').catch(() => ({ data: { stages: [] } })),
        api.get('/projects', { params: { limit: 200 } }).catch(() => ({ data: { projects: [] } })),
      ]);

      const stage = stageRes.data.stages?.find(s => s.slug === slug) || null;
      setStageInfo(stage || { slug, name: STAGE_NAMES[slug], color: '#3b82f6' });

      if (!stage?.id) { setProjects([]); setTasks([]); setLoading(false); return; }

      const { data: taskData } = await api.get('/tasks', { params: { stage_id: stage.id } })
        .catch(() => ({ data: { tasks: [] } }));
      let stageTasks = taskData.tasks || [];

      // Load checklists for each task (parallel)
      const withChecklists = await Promise.all(stageTasks.map(async (t) => {
        try {
          const { data } = await api.get(`/tasks/${t.id}`);
          return { ...t, checklists: data.task?.checklists || [], assignee: data.task?.assignee || t.assignee };
        } catch { return { ...t, checklists: [] }; }
      }));
      stageTasks = withChecklists;

      const allProjs = projRes.data.projects || [];
      const projectIdsWithTasks = new Set(stageTasks.map(t => t.project_id));
      setProjects(allProjs.filter(p => projectIdsWithTasks.has(p.id)));
      setTasks(stageTasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));

      // Check for pending approval requests for visible projects
      try {
        const projIds = Array.from(projectIdsWithTasks);
        const pendingMap = {};
        if (projIds.length > 0) {
          const { data: approvals } = await api.get('/projects/pending-approvals', { params: { project_ids: projIds.join(',') } }).catch(() => ({ data: { approvals: {} } }));
          Object.assign(pendingMap, approvals.approvals || {});
        }
        setPendingApprovals(pendingMap);
      } catch { setPendingApprovals({}); }
    } catch (e) {
      console.error('StageView loadData error:', e);
      setError('Không thể tải dữ liệu.');
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadData(); }, [loadData]);

  const doAdvance = async () => {
    if (!advProj) return;
    setAdvLoading(true);
    try {
      const ns = NEXT_SLUG[slug], nst = NEXT_STATUS[slug];
      if (advMode === 'advance' && ns && nst) {
        await api.put(`/projects/${advProj.id}/stage`, { stage_slug: ns, new_status: nst, notes: advNotes || null, attachments: advFiles });
      } else if (advMode === 'review' && ns && nst) {
        await api.post(`/projects/${advProj.id}/request-approval`, {
          next_stage_slug: ns, next_status: nst, notes: advNotes || null, attachments: advFiles,
        });
        alert('✅ Đã gửi yêu cầu duyệt!');
      }
      setAdvProj(null); setAdvNotes(''); setAdvFiles([]);
      loadData();
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.error || e.message)); }
    setAdvLoading(false);
  };

  // Collect all checklist notes + files for a project at current stage
  const collectChecklistSummary = (projectId) => {
    const projTasks = (tasksByProject || {})[projectId] || [];
    let allNotes = [];
    let allFiles = [];
    projTasks.forEach(t => {
      const cls = t.checklists || [];
      cls.forEach(cl => {
        if (cl.notes) allNotes.push(`[${t.title.replace(/\s*—\s*.+$/, '')}] ${cl.title}: ${cl.notes}`);
        if (cl.attachments?.length) allFiles.push(...cl.attachments);
      });
    });
    return { notes: allNotes.join('\n'), files: allFiles };
  };

  const openAdvanceModal = (proj, mode) => {
    const summary = collectChecklistSummary(proj.id);
    setAdvProj(proj);
    setAdvMode(mode);
    setAdvNotes(summary.notes);
    setAdvFiles([...summary.files]);
  };

  const startTask = async (taskId) => { try { await api.patch(`/tasks/${taskId}/status`, { status: 'in_progress' }); loadData(); } catch {} };
  const markTaskDone = async (taskId) => { try { await api.patch(`/tasks/${taskId}/status`, { status: 'done' }); loadData(); } catch {} };
  const toggleCheckItem = async (taskId, clId, isCompleted) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, is_completed: !isCompleted } : cl) };
    }));
    try { await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted }); } catch { loadData(); }
  };
  const saveChecklistNote = async (taskId, clId, notes, attachments) => {
    try {
      await api.patch(`/tasks/${taskId}/checklists/${clId}`, { notes, attachments });
      // Update local state
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, notes, attachments } : cl) };
      }));
    } catch { loadData(); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-2">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
        <span className="text-sm text-gray-400">Đang tải {STAGE_NAMES[slug]}...</span>
      </div>
    </div>
  );

  const stageName = STAGE_NAMES[slug] || slug;
  const allowedSlugs = ROLE_STAGE_MAP[user?.role] || [];
  const isAdmin = ['admin', 'manager'].includes(user?.role);
  const canInteract = isAdmin || allowedSlugs.includes(slug);
  const nextStageName = STAGE_NAMES[NEXT_SLUG[slug]];

  // ═══ FILTERS ═══
  let filteredProjects = [...projects];
  if (filterCompany !== 'all') filteredProjects = filteredProjects.filter(p => p.company_id === filterCompany);
  if (filterProject !== 'all') filteredProjects = filteredProjects.filter(p => p.id === filterProject);
  if (dateFrom || dateTo) {
    filteredProjects = filteredProjects.filter(p => {
      const d = p.created_at ? new Date(p.created_at) : null;
      if (!d) return false;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const t = new Date(dateTo); t.setHours(23,59,59,999); if (d > t) return false; }
      return true;
    });
  }
  const filtProjIds = new Set(filteredProjects.map(p => p.id));

  let filteredTasks = tasks.filter(t => filtProjIds.has(t.project_id));
  if (filterEmployee !== 'all') filteredTasks = filteredTasks.filter(t => t.assignee_id === filterEmployee);

  // ═══ BUILD KANBAN: Columns = unique tasks by order_index, Cards = projects ═══
  // Group tasks by project
  const tasksByProject = {};
  filteredTasks.forEach(t => {
    if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
    tasksByProject[t.project_id].push(t);
  });

  // Determine column definitions from task order_index
  const colMap = {};
  filteredTasks.forEach(t => {
    const idx = t.order_index ?? 0;
    if (!colMap[idx]) colMap[idx] = { titles: [], tasks: [] };
    colMap[idx].tasks.push(t);
    // Strip " — LineLabel" suffix to get base title
    const base = t.title.replace(/\s*—\s*.+$/, '');
    colMap[idx].titles.push(base);
  });

  const columns = Object.keys(colMap).sort((a, b) => +a - +b).map(idx => {
    const g = colMap[idx];
    const titleCounts = {};
    g.titles.forEach(t => titleCounts[t] = (titleCounts[t] || 0) + 1);
    const baseTitle = Object.entries(titleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || `NV ${+idx + 1}`;
    return { orderIndex: +idx, title: baseTitle, tasks: g.tasks };
  });

  // For each project, find current task = first non-done task (by order_index)
  const projectCurrentTask = {};
  Object.entries(tasksByProject).forEach(([projId, projTasks]) => {
    projTasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const current = projTasks.find(t => t.status !== 'done');
    projectCurrentTask[projId] = current || projTasks[projTasks.length - 1];
  });

  // Map project cards to columns
  const columnCards = {};
  columns.forEach(col => { columnCards[col.orderIndex] = []; });
  Object.entries(projectCurrentTask).forEach(([projId, task]) => {
    if (!task) return;
    const idx = task.order_index ?? 0;
    if (columnCards[idx]) columnCards[idx].push({ projectId: projId, task });
  });

  // All-done check per project
  const projectsAllDone = {};
  Object.entries(tasksByProject).forEach(([projId, pts]) => {
    projectsAllDone[projId] = pts.length > 0 && pts.every(t => t.status === 'done');
  });

  const totalTasks = filteredTasks.length;
  const doneTasks = filteredTasks.filter(t => t.status === 'done').length;

  // Filter options
  const projCompanies = [];
  const seenC = new Set();
  projects.forEach(p => { if (p.company_id && p.company && !seenC.has(p.company_id)) { seenC.add(p.company_id); projCompanies.push({ id: p.company_id, name: p.company.short_name || p.company.name }); } });
  const projEmployees = [];
  const seenE = new Set();
  tasks.forEach(t => { if (t.assignee?.id && !seenE.has(t.assignee.id)) { seenE.add(t.assignee.id); projEmployees.push({ id: t.assignee.id, name: t.assignee.full_name }); } });

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={loadData} className="h-8 px-3 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 cursor-pointer flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> Thử lại</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }} />
            <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
            {user && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{ROLE_LABELS[user.role] || user.role}</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{filteredProjects.length} dự án · {totalTasks} nhiệm vụ ({doneTasks} xong)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400"><RefreshCw className="h-4 w-4" /></button>
          {canInteract && <button onClick={() => setShowCreateTask(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm NV</button>}
        </div>
      </div>

      {!canInteract && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-500" />
          <p className="text-sm text-amber-700">Chỉ xem — bạn không có quyền thao tác ở giai đoạn <strong>{stageName}</strong></p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400 self-center ml-2" />
            {QT.map(t => <button key={t.id} onClick={() => setQuickTime(t.id)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${quickTime === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{t.label}</button>)}
          </div>
          {quickTime === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white" />
              <span className="text-xs text-gray-400">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {projCompanies.length > 0 && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setFilterProject('all'); }} className="h-7 px-2 border rounded text-xs bg-white">
                <option value="all">Tất cả CTy</option>
                {projCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white font-medium">
            <option value="all">Tất cả DA</option>
            {projects.filter(p => filterCompany === 'all' || p.company_id === filterCompany).map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          {projEmployees.length > 1 && (
            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white">
              <option value="all">Tất cả NV</option>
              {projEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Advance banners — only show for projects currently AT this stage and all tasks done */}
      {nextStageName && filteredProjects
        .filter(p => projectsAllDone[p.id] && p.status === SLUG_TO_STATUS[slug])
        .map(p => {
          const isPending = pendingApprovals[p.id];
          return (
            <div key={p.id} className={`${isPending ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 flex items-center gap-3 flex-wrap`}>
              <CheckSquare className={`h-5 w-5 ${isPending ? 'text-amber-600' : 'text-emerald-600'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isPending ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {isPending ? `⏳ ${p.code} — ${p.name}: Đang chờ duyệt` : `✅ ${p.code} — ${p.name}: Hoàn thành!`}
                </p>
                <p className={`text-xs ${isPending ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {isPending ? 'Yêu cầu duyệt đã được gửi, đang chờ phê duyệt.' : `Tất cả NV ở ${stageName} đã xong.`}
                </p>
              </div>
              {!isPending && (
                <>
                  <button onClick={() => openAdvanceModal(p, 'advance')}
                    className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-emerald-700">
                    <ArrowRightCircle className="h-3.5 w-3.5" /> Chuyển → {nextStageName}
                  </button>
                  <button onClick={() => openAdvanceModal(p, 'review')}
                    className="h-8 px-3 bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-600">
                    <Send className="h-3.5 w-3.5" /> Chờ duyệt
                  </button>
                </>
              )}
            </div>
          );
        })}

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Tiến độ giai đoạn</span>
            <span className="text-sm font-bold text-gray-900">{Math.round((doneTasks / totalTasks) * 100)}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{doneTasks}/{totalTasks} nhiệm vụ hoàn thành</p>
        </div>
      )}

      {/* ═══ KANBAN: Columns = Nhiệm vụ, Cards = Dự án ═══ */}
      {columns.length > 0 ? (
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4" style={{ minHeight: '300px' }}>
          {columns.map(col => {
            const cards = columnCards[col.orderIndex] || [];
            const colDone = col.tasks.filter(t => t.status === 'done').length;
            return (
              <div key={col.orderIndex} className="shrink-0 w-72 sm:w-80 flex flex-col">
                {/* Column header */}
                <div className="rounded-t-xl p-3 border border-b-0 bg-white border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-white w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }}>{col.orderIndex + 1}</span>
                      <h3 className="text-sm font-bold text-gray-900">{col.title}</h3>
                    </div>
                    <span className="text-[10px] font-medium text-gray-400">{cards.length} DA</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${col.tasks.length > 0 ? (colDone / col.tasks.length) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 rounded-b-xl border p-2 space-y-2 min-h-[100px] bg-gray-50/50 border-gray-200 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                  {cards.length > 0 ? cards.map(({ projectId, task }) => {
                    const proj = projects.find(p => p.id === projectId);
                    if (!proj) return null;
                    const isDone = task.status === 'done';
                    const isActive = task.status === 'in_progress';
                    const projTasks = tasksByProject[projectId] || [];
                    const pDone = projTasks.filter(t => t.status === 'done').length;
                    const pTotal = projTasks.length;
                    const checklists = task.checklists || [];
                    const clDone = checklists.filter(c => c.is_completed).length;
                    const clTotal = checklists.length;
                    const allClDone = clTotal > 0 && clDone === clTotal;

                    return (
                      <div key={projectId} className={`bg-white rounded-lg border p-3 transition-all ${isDone ? 'border-emerald-200 bg-emerald-50/50' : isActive ? 'border-blue-200' : 'border-gray-200'}`}>
                        {/* Project header */}
                        <Link to={`/projects/${proj.id}`} className="block hover:opacity-80">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-blue-600">{proj.code}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900 leading-tight truncate">{proj.name}</h4>
                              {proj.customers?.full_name && <p className="text-[10px] text-gray-500 mt-0.5">👤 {proj.customers.full_name}</p>}
                              {proj.company && <p className="text-[10px] text-indigo-500">🏢 {proj.company.short_name || proj.company.name}</p>}
                            </div>
                            {isDone && <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0" />}
                          </div>
                        </Link>

                        {/* Assignee + progress */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-1">
                            {task.assignee && (
                              <>
                                <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>{getInitials(task.assignee.full_name)}</div>
                                <span className="text-[10px] text-gray-500 max-w-[80px] truncate">{task.assignee.full_name}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400">{pDone}/{pTotal} NV</span>
                            {clTotal > 0 && <span className={`text-[10px] font-medium ${allClDone ? 'text-emerald-600' : 'text-gray-400'}`}>✓ {clDone}/{clTotal}</span>}
                          </div>
                        </div>

                        {/* Checklist items — interactive with notes/files */}
                        {clTotal > 0 && (
                          <div className="mt-2 space-y-1">
                            {clTotal > 0 && <div className="w-full h-1 bg-gray-100 rounded-full mb-1"><div className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${(clDone/clTotal)*100}%` }} /></div>}
                            {checklists.map(cl => (
                              <ChecklistCard key={cl.id} cl={cl} taskId={task.id} canInteract={canInteract}
                                onToggle={() => canInteract && toggleCheckItem(task.id, cl.id, cl.is_completed)}
                                onSaveNote={(notes, files) => saveChecklistNote(task.id, cl.id, notes, files)} />
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        {canInteract && !isDone && (
                          <div className="flex gap-1 mt-2">
                            {task.status === 'pending' && <button onClick={e => { e.preventDefault(); startTask(task.id); }} className="flex-1 h-6 bg-blue-50 text-blue-600 rounded text-[10px] font-medium hover:bg-blue-100 cursor-pointer">▶ Bắt đầu</button>}
                            {isActive && allClDone && <button onClick={e => { e.preventDefault(); markTaskDone(task.id); }} className="flex-1 h-6 bg-emerald-50 text-emerald-600 rounded text-[10px] font-medium hover:bg-emerald-100 cursor-pointer animate-pulse">✓ Hoàn thành</button>}
                            <button onClick={e => { e.preventDefault(); setSelectedTask(task.id); }} className="flex-1 h-6 text-gray-400 bg-white border rounded text-[10px] hover:text-blue-600 cursor-pointer">Chi tiết</button>
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="flex items-center justify-center h-20 text-xs text-gray-400">Không có dự án</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 mb-2">Chưa có nhiệm vụ ở giai đoạn <strong>{stageName}</strong></p>
          <button onClick={() => setShowCreateTask(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Tạo nhiệm vụ</button>
        </div>
      ) : (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Không có dự án ở giai đoạn <strong>{stageName}</strong></p>
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={loadData} />
      <TaskCreateModal open={showCreateTask} onClose={() => setShowCreateTask(false)} onCreated={loadData} stageId={stageInfo?.id} projectId={filterProject !== 'all' ? filterProject : projects[0]?.id} />

      {/* Advance / Review Modal */}
      <Modal open={!!advProj} onClose={() => setAdvProj(null)}
        title={advMode === 'advance' ? `Chuyển: ${advProj?.code} → ${nextStageName}` : `Chờ duyệt: ${advProj?.code}`} size="lg">
        <div className="space-y-4">
          <div className={`${advMode === 'advance' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-4`}>
            <p className={`text-sm ${advMode === 'advance' ? 'text-emerald-800' : 'text-amber-800'}`}>
              {advMode === 'advance'
                ? `✅ Chuyển "${advProj?.name}" → "${nextStageName}". Hệ thống sẽ tự tạo NV mới.`
                : `🔍 Gửi yêu cầu duyệt cho người chịu trách nhiệm chính / quản lý DA.`}
            </p>
          </div>

          {/* Tổng hợp từ checklist */}
          {(advNotes || advFiles.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">📋 Tổng hợp từ checklist</h4>
              {advNotes && (
                <div className="bg-white rounded-lg p-3 border border-blue-100 mb-2 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{advNotes}</pre>
                </div>
              )}
              {advFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {advFiles.map((f, fi) => {
                    const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                    return isImg ? (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                        <img src={f.file_url} alt={f.file_name} className="h-14 w-14 rounded border object-cover hover:opacity-80" />
                      </a>
                    ) : (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-blue-600 bg-white rounded px-2 py-1 border hover:bg-blue-50">
                        <Paperclip className="h-3 w-3" />{f.file_name || 'file'}
                      </a>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-blue-500 mt-2">Ghi chú + file từ checklist được tổng hợp tự động. Bạn có thể chỉnh sửa bên dưới.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Ghi chú {advNotes ? '(đã tổng hợp, có thể sửa)' : ''}</label>
            <textarea value={advNotes} onChange={e => setAdvNotes(e.target.value)}
              className="w-full h-24 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={advMode === 'review' ? 'Ghi chú gửi kèm yêu cầu duyệt...' : 'Ghi chú chuyển giao...'} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Đính kèm thêm file</label>
            <FileUploadButton onFilesUploaded={f => setAdvFiles(prev => [...prev, ...f])} />
            <FilePreview files={advFiles} onRemove={i => setAdvFiles(f => f.filter((_, j) => j !== i))} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdvProj(null)} className="h-9 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
            <button onClick={doAdvance} disabled={advLoading}
              className={`h-9 px-4 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${advMode === 'advance' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
              {advLoading ? 'Đang xử lý...' : advMode === 'advance' ? <><ArrowRightCircle className="h-3.5 w-3.5" /> Chuyển GĐ</> : <><Send className="h-3.5 w-3.5" /> Gửi yêu cầu duyệt</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══ Checklist Card — inline notes + file upload ═══
function ChecklistCard({ cl, taskId, canInteract, onToggle, onSaveNote }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteFiles, setNoteFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const hasNotes = !!cl.notes;
  const hasFiles = cl.attachments?.length > 0;
  const hasExtra = hasNotes || hasFiles;

  const startEdit = (e) => {
    e.stopPropagation();
    setNoteText(cl.notes || '');
    setNoteFiles(cl.attachments || []);
    setEditing(true);
    setExpanded(true);
  };

  const save = async () => {
    setSaving(true);
    await onSaveNote(noteText, noteFiles);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="group">
      <div className="flex items-start gap-1.5">
        <button onClick={onToggle} disabled={!canInteract}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
            cl.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : canInteract ? 'border-gray-300 hover:border-blue-400 cursor-pointer' : 'border-gray-200'
          }`}>
          {cl.is_completed && <CheckSquare className="h-2.5 w-2.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-[11px] leading-tight flex-1 ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{cl.title}</span>
            <div className="flex items-center gap-0.5 shrink-0">
              {hasFiles && <Paperclip className="h-2.5 w-2.5 text-blue-400" />}
              {hasNotes && <MessageSquare className="h-2.5 w-2.5 text-amber-400" />}
              {hasExtra && !editing && (
                <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5">
                  {expanded ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                </button>
              )}
              {canInteract && !editing && (
                <button onClick={startEdit} className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100">
                  <MessageSquare className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* View notes + files */}
          {expanded && hasExtra && !editing && (
            <div className="mt-1 space-y-1">
              {hasNotes && <p className="text-[10px] text-gray-600 bg-amber-50 rounded px-2 py-1 border border-amber-100">{cl.notes}</p>}
              {hasFiles && (
                <div className="flex flex-wrap gap-1">
                  {cl.attachments.map((f, fi) => {
                    const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                    return isImg ? (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                        <img src={f.file_url} alt={f.file_name} className="h-10 w-10 rounded border object-cover hover:opacity-80" />
                      </a>
                    ) : (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[9px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 hover:bg-blue-100">
                        <Paperclip className="h-2 w-2" />{f.file_name || 'file'}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <div className="mt-1 space-y-1.5 bg-blue-50/50 rounded p-2 border border-blue-100" onClick={e => e.stopPropagation()}>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                className="w-full h-12 px-2 py-1 border rounded text-[11px] outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="Ghi chú..." autoFocus />
              <FilePreview files={noteFiles} onRemove={i => setNoteFiles(f => f.filter((_, j) => j !== i))} small />
              <div className="flex items-center gap-1.5 flex-wrap">
                <FileUploadButton compact onFilesUploaded={files => setNoteFiles(prev => [...prev, ...files])} />
                <button onClick={save} disabled={saving}
                  className="h-5 px-2 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-0.5">
                  <Save className="h-2.5 w-2.5" />{saving ? '...' : 'Lưu'}
                </button>
                <button onClick={() => setEditing(false)} className="h-5 px-1.5 text-gray-500 bg-gray-100 rounded text-[10px] cursor-pointer">Hủy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

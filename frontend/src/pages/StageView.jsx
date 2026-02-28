import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import {
  PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor, ROLE_LABELS,
} from '../lib/utils';
import {
  Plus, FolderKanban, CheckSquare, Lock, Filter, ChevronDown, X,
  Clock, AlertTriangle, MessageSquare, RefreshCw
} from 'lucide-react';

const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

const STAGE_STATUS_MAP = {
  consulting: 'consulting', design: 'designing', quotation: 'quoting',
  contract: 'contract_signed', production: 'producing', shipping: 'shipping',
  installation: 'installing', 'customer-care': 'warranty',
};

const STAGE_ORDER = ['consulting', 'design', 'quotation', 'contract', 'production', 'shipping', 'installation', 'customer-care'];

function getStageIndex(slug) {
  return STAGE_ORDER.indexOf(slug);
}

// Given project status, which stage slug is it on?
function projectCurrentStageSlug(projectStatus) {
  const reverseMap = {
    consulting: 'consulting', designing: 'design', quoting: 'quotation',
    contract_signed: 'contract', producing: 'production', shipping: 'shipping',
    installing: 'installation', warranty: 'customer-care', completed: 'customer-care',
  };
  return reverseMap[projectStatus] || 'consulting';
}

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
  const [showFilter, setShowFilter] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Get stages + all projects in parallel
      const [stageRes, projRes] = await Promise.all([
        api.get('/users/stages').catch(() => ({ data: { stages: [] } })),
        api.get('/projects', { params: { limit: 200 } }).catch(() => ({ data: { projects: [] } })),
      ]);

      const stage = stageRes.data.stages?.find(s => s.slug === slug) || null;
      setStageInfo(stage || { slug, name: STAGE_NAMES[slug], color: '#3b82f6' });
      const allProjs = projRes.data.projects || [];

      if (!allProjs.length || !stage?.id) {
        setProjects(allProjs);
        setTasks([]);
        setLoading(false);
        return;
      }

      // Step 2: Load tasks for this stage — ONE batch call with stage_id only
      const { data: taskData } = await api.get('/tasks', { params: { stage_id: stage.id } })
        .catch(() => ({ data: { tasks: [] } }));
      let stageTasks = taskData.tasks || [];

      // Build project lookup
      const projMap = {};
      allProjs.forEach(p => { projMap[p.id] = p; });

      // Only keep projects that have tasks in this stage
      const projectIdsWithTasks = new Set(stageTasks.map(t => t.project_id));
      const relevantProjs = allProjs.filter(p => projectIdsWithTasks.has(p.id));
      setProjects(relevantProjs);

      // Step 3: Load checklists for each task — parallel batch
      const withChecklists = await Promise.all(stageTasks.map(async (t) => {
        try {
          const { data } = await api.get(`/tasks/${t.id}`);
          return {
            ...t,
            checklists: data.task?.checklists || [],
            comments: data.task?.comments || [],
            assignee: data.task?.assignee || t.assignee,
          };
        } catch {
          return { ...t, checklists: [], comments: [] };
        }
      }));

      setTasks(withChecklists);
    } catch (e) {
      console.error('StageView loadData error:', e);
      setError('Không thể tải dữ liệu. Vui lòng thử lại.');
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadData(); }, [loadData]);

  // Toggle checklist item
  const toggleCheckItem = async (taskId, clId, isCompleted) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        checklists: t.checklists.map(cl =>
          cl.id === clId ? { ...cl, is_completed: !isCompleted } : cl
        ),
      };
    }));
    try {
      await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted });
    } catch { loadData(); }
  };

  // Mark entire task as done
  const markTaskDone = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'done' });
    } catch { loadData(); }
  };

  // Mark task in progress
  const startTask = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'in_progress' } : t));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'in_progress' });
    } catch { loadData(); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <span className="text-sm text-gray-400">Đang tải {STAGE_NAMES[slug]}...</span>
        </div>
      </div>
    );
  }

  const stageName = STAGE_NAMES[slug] || slug;

  // Filter tasks by project
  const filteredTasks = filterProject === 'all'
    ? tasks
    : tasks.filter(t => t.project_id === filterProject);

  // Sort tasks by order_index
  const sortedTasks = [...filteredTasks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  // Stats
  const totalTasks = sortedTasks.length;
  const doneTasks = sortedTasks.filter(t => t.status === 'done').length;
  const totalChecks = sortedTasks.reduce((s, t) => s + (t.checklists?.length || 0), 0);
  const doneChecks = sortedTasks.reduce((s, t) => s + (t.checklists?.filter(c => c.is_completed)?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={loadData} className="h-8 px-3 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 cursor-pointer flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </button>
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
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length} dự án · {totalTasks} nhiệm vụ ({doneTasks} xong) · {doneChecks}/{totalChecks} checklist
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button onClick={loadData} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Project filter */}
          {projects.length > 1 && (
            <div className="relative">
              <button onClick={() => setShowFilter(!showFilter)}
                className="h-9 px-3 bg-white border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 cursor-pointer">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700 max-w-[200px] truncate">
                  {filterProject === 'all' ? 'Tất cả dự án' : projects.find(p => p.id === filterProject)?.code || 'Lọc'}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
              {showFilter && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFilter(false)} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-lg border z-50 py-1 max-h-60 overflow-y-auto">
                    <button onClick={() => { setFilterProject('all'); setShowFilter(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer ${filterProject === 'all' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}>
                      Tất cả dự án ({projects.length})
                    </button>
                    {projects.map(p => (
                      <button key={p.id} onClick={() => { setFilterProject(p.id); setShowFilter(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer ${filterProject === p.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}>
                        <span className="font-medium text-blue-600">{p.code}</span>
                        <span className="ml-2 text-gray-700">{p.name}</span>
                        {p.customers?.full_name && <span className="ml-2 text-xs text-gray-400">({p.customers.full_name})</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button onClick={() => setShowCreateTask(true)}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm NV
          </button>
        </div>
      </div>

      {/* Filter active badge */}
      {filterProject !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium flex items-center gap-1">
            <Filter className="h-3 w-3" />
            {projects.find(p => p.id === filterProject)?.code} — {projects.find(p => p.id === filterProject)?.name}
            <button onClick={() => setFilterProject('all')} className="ml-1 hover:text-blue-900 cursor-pointer"><X className="h-3 w-3" /></button>
          </span>
        </div>
      )}

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Tiến độ giai đoạn</span>
            <span className="text-sm font-bold text-gray-900">{totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>{doneTasks}/{totalTasks} nhiệm vụ hoàn thành</span>
            <span>{doneChecks}/{totalChecks} checklist items</span>
          </div>
        </div>
      )}

      {/* ═══ KANBAN: Columns = Tasks, Cards = Checklists ═══ */}
      {sortedTasks.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: '300px' }}>
          {sortedTasks.map((task, taskIdx) => {
            const checksDone = task.checklists?.filter(c => c.is_completed)?.length || 0;
            const checksTotal = task.checklists?.length || 0;
            const allChecksDone = checksTotal > 0 && checksDone === checksTotal;
            const isTaskDone = task.status === 'done';

            // Check if this stage is reachable for the task's project
            const proj = projects.find(p => p.id === task.project_id);
            const projCurrentSlug = proj ? projectCurrentStageSlug(proj.status) : slug;
            const projStageIdx = getStageIndex(projCurrentSlug);
            const thisStageIdx = getStageIndex(slug);
            const isFutureStage = thisStageIdx > projStageIdx; // Project hasn't reached this stage yet

            // Sequential unlock within stage: previous task must be done
            // But only apply if stage is reachable
            const prevAllDone = sortedTasks
              .filter(t => t.project_id === task.project_id) // only same project
              .filter((_, i, arr) => {
                const idx = arr.findIndex(a => a.id === task.id);
                return i < idx;
              })
              .every(t => t.status === 'done');
            const taskIdxInProject = sortedTasks.filter(t => t.project_id === task.project_id).findIndex(t => t.id === task.id);
            const isSequenceLocked = taskIdxInProject > 0 && !prevAllDone;
            
            const isLocked = isFutureStage || isSequenceLocked;
            const isActive = !isLocked && !isTaskDone;
            const lockReason = isFutureStage 
              ? `Dự án ${proj?.code || ''} chưa tới quy trình ${STAGE_NAMES[slug]}`
              : isSequenceLocked ? `Hoàn thành NV #${taskIdxInProject} trước` : '';

            return (
              <div key={task.id} className={`shrink-0 w-80 flex flex-col ${isLocked ? 'opacity-50' : ''}`}>
                {/* Column header = Task */}
                <div className={`rounded-t-xl p-3 border border-b-0 ${
                  isTaskDone ? 'bg-emerald-50 border-emerald-200'
                  : isActive ? 'bg-white border-gray-200'
                  : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {/* Task done checkbox */}
                    <button
                      onClick={() => !isLocked && !isTaskDone && allChecksDone && markTaskDone(task.id)}
                      disabled={isLocked || isTaskDone || !allChecksDone}
                      title={isTaskDone ? 'Đã hoàn thành' : allChecksDone ? 'Bấm để hoàn thành nhiệm vụ' : 'Hoàn thành tất cả checklist trước'}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        isTaskDone ? 'bg-emerald-500 border-emerald-500 text-white'
                        : allChecksDone ? 'border-emerald-400 hover:bg-emerald-50 cursor-pointer animate-pulse'
                        : isLocked ? 'border-gray-200 cursor-not-allowed' : 'border-gray-300 cursor-not-allowed'
                      }`}>
                      {isTaskDone && <CheckSquare className="h-3.5 w-3.5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-400">#{taskIdx + 1}</span>
                        {proj && <Link to={`/projects/${proj.id}`} className="text-[10px] text-blue-600 font-medium hover:underline">{proj.code} — {proj.name}</Link>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                      </div>
                      <h3 className={`text-sm font-semibold leading-tight ${isTaskDone ? 'text-emerald-700 line-through' : 'text-gray-900'}`}>
                        {task.title}
                      </h3>
                      {proj?.customers?.full_name && (
                        <p className="text-[10px] text-gray-400 mt-0.5">👤 KH: {proj.customers.full_name}</p>
                      )}
                      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                    </div>

                    {isLocked && <Lock className="h-4 w-4 text-gray-400 shrink-0 mt-1" />}
                    {isFutureStage && (
                      <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded shrink-0">Chờ</span>
                    )}
                  </div>

                  {/* Task meta */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {task.assignee && (
                      <div className="flex items-center gap-1">
                        <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                          style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>
                          {getInitials(task.assignee.full_name)}
                        </div>
                        <span className="text-[10px] text-gray-500">{task.assignee.full_name}</span>
                      </div>
                    )}
                    {task.due_date && (
                      <span className={`text-[10px] flex items-center gap-0.5 ${
                        new Date(task.due_date) < new Date() && !isTaskDone ? 'text-red-500 font-medium' : 'text-gray-400'
                      }`}>
                        <Clock className="h-3 w-3" />{formatDate(task.due_date)}
                      </span>
                    )}
                    {task.comments?.length > 0 && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />{task.comments.length}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium ${allChecksDone && checksTotal > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      ✓ {checksDone}/{checksTotal}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {checksTotal > 0 && (
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${isTaskDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${(checksDone / checksTotal) * 100}%` }} />
                    </div>
                  )}
                </div>

                {/* Checklist cards */}
                <div className={`flex-1 rounded-b-xl border p-2 space-y-1.5 min-h-[100px] ${
                  isTaskDone ? 'bg-emerald-50/50 border-emerald-200'
                  : isLocked ? 'bg-gray-50 border-gray-200'
                  : 'bg-gray-50/50 border-gray-200'
                }`}>
                  {task.checklists?.length > 0 ? (
                    task.checklists.map((cl, clIdx) => (
                      <div key={cl.id}
                        className={`flex items-start gap-2 bg-white rounded-lg border p-2.5 transition-all ${
                          cl.is_completed ? 'border-emerald-200 bg-emerald-50/50'
                          : isLocked ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:shadow-sm hover:border-gray-300'
                        }`}>
                        <button
                          onClick={() => !isLocked && toggleCheckItem(task.id, cl.id, cl.is_completed)}
                          disabled={isLocked}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            cl.is_completed
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isLocked ? 'border-gray-200 cursor-not-allowed' : 'border-gray-300 hover:border-blue-400 cursor-pointer'
                          }`}>
                          {cl.is_completed && <CheckSquare className="h-3 w-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm leading-tight ${cl.is_completed ? 'line-through text-gray-400' : isLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                            {cl.title}
                          </span>
                          {cl.completed_at && (
                            <p className="text-[10px] text-emerald-500 mt-0.5">✓ {formatDate(cl.completed_at)}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-300 font-mono shrink-0">{clIdx + 1}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-16 text-xs text-gray-400">
                      {isLocked ? 'Chưa có checklist' : 'Chưa có checklist — thêm bên dưới'}
                    </div>
                  )}

                  {/* Lock reason banner */}
                  {isLocked && (
                    <div className="flex items-center gap-1.5 mt-1 px-2 py-1.5 bg-gray-100 rounded-lg">
                      <Lock className="h-3 w-3 text-gray-400 shrink-0" />
                      <p className="text-[10px] text-gray-400">{lockReason || 'Chưa mở khóa'}</p>
                    </div>
                  )}

                  {/* Quick add checklist */}
                  {!isLocked && !isTaskDone && (
                    <QuickAddChecklist taskId={task.id} onAdded={loadData} />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1 mt-1">
                  {!isLocked && !isTaskDone && task.status === 'pending' && (
                    <button onClick={() => startTask(task.id)}
                      className="flex-1 h-8 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 cursor-pointer flex items-center justify-center gap-1">
                      ▶ Bắt đầu
                    </button>
                  )}
                  {!isLocked && !isTaskDone && allChecksDone && checksTotal > 0 && (
                    <button onClick={() => markTaskDone(task.id)}
                      className="flex-1 h-8 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 cursor-pointer flex items-center justify-center gap-1 animate-pulse">
                      ✓ Hoàn thành
                    </button>
                  )}
                  <button onClick={() => setSelectedTask(task.id)}
                    className="flex-1 h-8 text-gray-400 bg-white border rounded-lg text-xs hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 cursor-pointer flex items-center justify-center gap-1">
                    Chi tiết →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : projects.length > 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 mb-2">Chưa có nhiệm vụ ở giai đoạn <strong>{stageName}</strong></p>
          <p className="text-xs text-gray-400 mb-4">Tạo task mới hoặc chuyển giai đoạn từ trang dự án để tự động tạo nhiệm vụ</p>
          <button onClick={() => setShowCreateTask(true)}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> Tạo nhiệm vụ đầu tiên
          </button>
        </div>
      ) : (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 mb-1">Không có dự án ở giai đoạn <strong>{stageName}</strong></p>
          <p className="text-xs text-gray-400">Tạo dự án mới từ trang "Dự án" — dự án sẽ bắt đầu ở giai đoạn Tư vấn</p>
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask}
        onClose={() => setSelectedTask(null)} onUpdated={loadData} />
      <TaskCreateModal open={showCreateTask}
        onClose={() => setShowCreateTask(false)} onCreated={loadData}
        stageId={stageInfo?.id}
        projectId={filterProject !== 'all' ? filterProject : projects[0]?.id} />
    </div>
  );
}

// ═══ Quick Add Checklist ═══
function QuickAddChecklist({ taskId, onAdded }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setAdding(true);
    try {
      await api.post(`/tasks/${taskId}/checklists`, { title: text.trim() });
      setText('');
      onAdded?.();
    } catch { }
    setAdding(false);
  };

  return (
    <div className="flex gap-1 mt-1">
      <input value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()}
        placeholder="+ Thêm checklist..."
        className="flex-1 h-7 px-2 bg-white border border-dashed border-gray-300 rounded text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
      {text && (
        <button onClick={add} disabled={adding}
          className="h-7 px-2 bg-blue-600 text-white rounded text-xs cursor-pointer hover:bg-blue-700 disabled:opacity-50">
          {adding ? '...' : '+'}
        </button>
      )}
    </div>
  );
}

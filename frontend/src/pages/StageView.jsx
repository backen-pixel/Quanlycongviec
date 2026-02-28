import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import { PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor, ROLE_LABELS } from '../lib/utils';
import { Plus, FolderKanban, CheckSquare, Lock, Filter, ChevronDown, X, Clock, AlertTriangle, MessageSquare, RefreshCw, Calendar, Edit3, Check, Layers } from 'lucide-react';

const STAGE_NAMES = { consulting:'Tư vấn', design:'Thiết kế', quotation:'Báo giá', contract:'Hợp đồng', production:'Sản xuất', shipping:'Vận chuyển', installation:'Lắp đặt', 'customer-care':'Chăm sóc KH' };
const STAGE_ORDER = ['consulting','design','quotation','contract','production','shipping','installation','customer-care'];
const TIME_FILTERS = [{ id:'all', label:'Tất cả' },{ id:'today', label:'Hôm nay' },{ id:'week', label:'Tuần này' },{ id:'month', label:'Tháng này' },{ id:'quarter', label:'Quý này' }];

function getStageIndex(s) { return STAGE_ORDER.indexOf(s); }
function projectCurrentStageSlug(st) {
  const m = { consulting:'consulting', designing:'design', quoting:'quotation', contract_signed:'contract', producing:'production', shipping:'shipping', installing:'installation', warranty:'customer-care', completed:'customer-care' };
  return m[st] || 'consulting';
}
function filterByTime(items, tf, field='created_at') {
  if (tf === 'all') return items;
  const now = new Date(), start = new Date();
  if (tf === 'today') start.setHours(0,0,0,0);
  else if (tf === 'week') { start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0); }
  else if (tf === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
  else if (tf === 'quarter') { start.setMonth(Math.floor(now.getMonth()/3)*3,1); start.setHours(0,0,0,0); }
  return items.filter(i => { const d = i[field] ? new Date(i[field]) : null; return d && d >= start; });
}

export default function StageView() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workflowLines, setWorkflowLines] = useState([]);
  const [stageInfo, setStageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [filterProject, setFilterProject] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [editingLineName, setEditingLineName] = useState(null);
  const [editName, setEditName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [stageRes, projRes] = await Promise.all([
        api.get('/users/stages').catch(() => ({ data: { stages: [] } })),
        api.get('/projects', { params: { limit: 200 } }).catch(() => ({ data: { projects: [] } })),
      ]);
      const stage = stageRes.data.stages?.find(s => s.slug === slug) || null;
      setStageInfo(stage || { slug, name: STAGE_NAMES[slug], color: '#3b82f6' });
      const allProjs = projRes.data.projects || [];
      if (!allProjs.length || !stage?.id) { setProjects(allProjs); setTasks([]); setWorkflowLines([]); setLoading(false); return; }

      const { data: taskData } = await api.get('/tasks', { params: { stage_id: stage.id } }).catch(() => ({ data: { tasks: [] } }));
      let stageTasks = taskData.tasks || [];
      const projectIdsWithTasks = new Set(stageTasks.map(t => t.project_id));
      const relevantProjs = allProjs.filter(p => projectIdsWithTasks.has(p.id));
      setProjects(relevantProjs);

      // Load workflow lines
      let allLines = [];
      for (const p of relevantProjs) {
        try {
          const { data: ld } = await api.get(`/projects/${p.id}/workflow-lines`);
          const sl = (ld.lines || []).filter(l => l.stage_slug === slug);
          sl.forEach(l => { l._pc = p.code; l._pn = p.name; l._pid = p.id; });
          allLines.push(...sl);
        } catch { }
      }
      setWorkflowLines(allLines);

      const withCl = await Promise.all(stageTasks.map(async t => {
        try { const { data } = await api.get(`/tasks/${t.id}`); return { ...t, checklists: data.task?.checklists||[], comments: data.task?.comments||[], assignee: data.task?.assignee||t.assignee }; }
        catch { return { ...t, checklists: [], comments: [] }; }
      }));
      setTasks(withCl);
    } catch (e) { console.error(e); setError('Không thể tải dữ liệu.'); }
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleCheck = async (tid, cid, done) => {
    setTasks(p => p.map(t => t.id !== tid ? t : { ...t, checklists: t.checklists.map(c => c.id === cid ? { ...c, is_completed: !done } : c) }));
    try { await api.patch(`/tasks/${tid}/checklists/${cid}`, { is_completed: !done }); } catch { loadData(); }
  };
  const markDone = async id => { setTasks(p => p.map(t => t.id===id?{...t,status:'done'}:t)); try { await api.patch(`/tasks/${id}/status`,{status:'done'}); } catch { loadData(); } };
  const startT = async id => { setTasks(p => p.map(t => t.id===id?{...t,status:'in_progress'}:t)); try { await api.patch(`/tasks/${id}/status`,{status:'in_progress'}); } catch { loadData(); } };

  const saveLineName = async (line) => {
    if (!editName.trim()) { setEditingLineName(null); return; }
    try { await api.put(`/projects/${line._pid}/workflow-lines/${line.id}`, { label: editName.trim() }); setWorkflowLines(p => p.map(l => l.id===line.id?{...l,label:editName.trim()}:l)); } catch {}
    setEditingLineName(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;

  const stageName = STAGE_NAMES[slug] || slug;
  let ft = filterProject === 'all' ? tasks : tasks.filter(t => t.project_id === filterProject);
  ft = filterByTime(ft, filterTime);
  const sorted = [...ft].sort((a,b) => (a.order_index||0)-(b.order_index||0));
  const total = sorted.length, done = sorted.filter(t=>t.status==='done').length;
  const tCl = sorted.reduce((s,t)=>s+(t.checklists?.length||0),0), dCl = sorted.reduce((s,t)=>s+(t.checklists?.filter(c=>c.is_completed)?.length||0),0);
  const hasLines = workflowLines.length > 0;
  const visibleLines = filterLine === 'all' ? workflowLines : workflowLines.filter(l=>l.id===filterLine);
  const getLineTasks = line => sorted.filter(t => t.workflow_line_id ? t.workflow_line_id===line.id : t.project_id===line._pid);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-red-500" /><p className="text-sm text-red-700 flex-1">{error}</p><button onClick={loadData} className="h-8 px-3 bg-red-100 text-red-700 rounded-lg text-xs cursor-pointer"><RefreshCw className="h-3.5 w-3.5 inline mr-1" />Thử lại</button></div>}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{backgroundColor:stageInfo?.color||'#3b82f6'}} />
            <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} DA · {total} NV ({done} xong) · {dCl}/{tCl} CL{hasLines?` · ${workflowLines.length} bộ phận`:''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={()=>setShowCreateTask(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm NV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400 self-center ml-2" />
          {TIME_FILTERS.map(tf=><button key={tf.id} onClick={()=>setFilterTime(tf.id)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${filterTime===tf.id?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>{tf.label}</button>)}
        </div>
        {projects.length > 1 && <select value={filterProject} onChange={e=>setFilterProject(e.target.value)} className="h-8 px-2 border rounded-lg text-xs bg-white"><option value="all">Tất cả DA ({projects.length})</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>}
        {hasLines && (
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <Layers className="h-3.5 w-3.5 text-gray-400 self-center ml-2" />
            <button onClick={()=>setFilterLine('all')} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${filterLine==='all'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>Tất cả ({workflowLines.length})</button>
            {workflowLines.map(l=><button key={l.id} onClick={()=>setFilterLine(filterLine===l.id?'all':l.id)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer max-w-[130px] truncate ${filterLine===l.id?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>{l.label}</button>)}
          </div>
        )}
      </div>

      {/* Progress */}
      {total > 0 && <div className="bg-white rounded-xl border p-3"><div className="flex justify-between text-xs mb-1"><span className="font-medium text-gray-700">Tiến độ</span><span className="font-bold">{Math.round((done/total)*100)}%</span></div><div className="w-full h-2 bg-gray-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${(done/total)*100}%`}} /></div></div>}

      {/* Kanban boards */}
      {!hasLines ? (
        <KanbanBoard tasks={sorted} projects={projects} slug={slug} onToggleCheck={toggleCheck} onMarkDone={markDone} onStartTask={startT} onSelectTask={setSelectedTask} onAdd={()=>setShowCreateTask(true)} loadData={loadData} />
      ) : (
        <div className="space-y-6">
          {visibleLines.map(line => {
            const lt = getLineTasks(line);
            return (
              <div key={line.id} className="space-y-2">
                <div className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3">
                  <div className="w-2 h-8 rounded-full" style={{backgroundColor:stageInfo?.color||'#3b82f6'}} />
                  <div className="flex-1 min-w-0">
                    {editingLineName===line.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveLineName(line);if(e.key==='Escape')setEditingLineName(null);}} className="h-8 px-2 border rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400" autoFocus />
                        <button onClick={()=>saveLineName(line)} className="w-7 h-7 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center cursor-pointer"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={()=>setEditingLineName(null)} className="w-7 h-7 rounded bg-gray-100 text-gray-500 flex items-center justify-center cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900">{line.label}</h2>
                        <button onClick={()=>{setEditingLineName(line.id);setEditName(line.label);}} className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer" title="Đổi tên"><Edit3 className="h-3 w-3" /></button>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="text-blue-600 font-medium">{line._pc}</span>
                      {line.assignee && <span className="flex items-center gap-1"><span className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{backgroundColor:avatarColor(line.assignee.full_name)}}>{getInitials(line.assignee.full_name)}</span>{line.assignee.full_name}</span>}
                      {line.description && <span className="text-gray-400">{line.description}</span>}
                      <span>{lt.length} NV · {lt.filter(t=>t.status==='done').length} xong</span>
                    </div>
                  </div>
                </div>
                <KanbanBoard tasks={lt} projects={projects} slug={slug} onToggleCheck={toggleCheck} onMarkDone={markDone} onStartTask={startT} onSelectTask={setSelectedTask} onAdd={()=>setShowCreateTask(true)} loadData={loadData} compact />
              </div>
            );
          })}
        </div>
      )}

      {sorted.length===0 && projects.length>0 && <div className="text-center py-16 bg-white rounded-xl border"><CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500 mb-2">Chưa có NV ở <strong>{stageName}</strong></p><button onClick={()=>setShowCreateTask(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer"><Plus className="h-4 w-4 inline mr-1" />Tạo NV</button></div>}
      {sorted.length===0 && projects.length===0 && <div className="text-center py-16"><FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">Không có DA ở <strong>{stageName}</strong></p></div>}

      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={()=>setSelectedTask(null)} onUpdated={loadData} />
      <TaskCreateModal open={showCreateTask} onClose={()=>setShowCreateTask(false)} onCreated={loadData} stageId={stageInfo?.id} projectId={filterProject!=='all'?filterProject:projects[0]?.id} />
    </div>
  );
}

// ═══ KANBAN BOARD ═══
function KanbanBoard({ tasks, projects, slug, onToggleCheck, onMarkDone, onStartTask, onSelectTask, onAdd, loadData, compact }) {
  const sorted = [...tasks].sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  if (!sorted.length) return null;
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{minHeight:compact?'180px':'280px'}}>
      {sorted.map((task,idx) => <TaskColumn key={task.id} task={task} idx={idx} tasks={sorted} projects={projects} slug={slug} onToggleCheck={onToggleCheck} onMarkDone={onMarkDone} onStartTask={onStartTask} onSelectTask={onSelectTask} loadData={loadData} compact={compact} />)}
      <div className="shrink-0 w-60 flex items-start pt-8">
        <button onClick={onAdd} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm cursor-pointer"><Plus className="h-4 w-4" />Thêm NV</button>
      </div>
    </div>
  );
}

// ═══ TASK COLUMN (Column=Task, Cards=Checklists) ═══
function TaskColumn({ task, idx, tasks, projects, slug, onToggleCheck, onMarkDone, onStartTask, onSelectTask, loadData, compact }) {
  const ckD = task.checklists?.filter(c=>c.is_completed)?.length||0;
  const ckT = task.checklists?.length||0;
  const allDone = ckT>0 && ckD===ckT;
  const isDone = task.status==='done';
  const proj = projects.find(p=>p.id===task.project_id);
  const pSlug = proj ? projectCurrentStageSlug(proj.status) : slug;
  const isFuture = getStageIndex(slug) > getStageIndex(pSlug);
  const sameProjTasks = tasks.filter(t=>t.project_id===task.project_id);
  const tIdx = sameProjTasks.findIndex(t=>t.id===task.id);
  const seqLocked = tIdx>0 && !sameProjTasks.filter((_,i)=>i<tIdx).every(t=>t.status==='done');
  const locked = isFuture || seqLocked;
  const active = !locked && !isDone;

  return (
    <div className={`shrink-0 ${compact?'w-72':'w-80'} flex flex-col ${locked?'opacity-50':''}`}>
      <div className={`rounded-t-xl p-3 border border-b-0 ${isDone?'bg-emerald-50 border-emerald-200':active?'bg-white border-gray-200':'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-2">
          <button onClick={()=>!locked&&!isDone&&allDone&&onMarkDone(task.id)} disabled={locked||isDone||!allDone}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${isDone?'bg-emerald-500 border-emerald-500 text-white':allDone?'border-emerald-400 hover:bg-emerald-50 cursor-pointer animate-pulse':locked?'border-gray-200 cursor-not-allowed':'border-gray-300 cursor-not-allowed'}`}>
            {isDone && <CheckSquare className="h-3.5 w-3.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400">#{idx+1}</span>
              {proj && <Link to={`/projects/${proj.id}`} className="text-[10px] text-blue-600 font-medium hover:underline">{proj.code}{!compact?` — ${proj.name}`:''}</Link>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
            </div>
            <h3 className={`text-sm font-semibold leading-tight ${isDone?'text-emerald-700 line-through':'text-gray-900'}`}>{task.title}</h3>
          </div>
          {locked && <Lock className="h-4 w-4 text-gray-400 shrink-0 mt-1" />}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {task.assignee && <div className="flex items-center gap-1"><div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{backgroundColor:avatarColor(task.assignee.full_name)}}>{getInitials(task.assignee.full_name)}</div><span className="text-[10px] text-gray-500">{task.assignee.full_name}</span></div>}
          {task.due_date && <span className={`text-[10px] flex items-center gap-0.5 ${new Date(task.due_date)<new Date()&&!isDone?'text-red-500':'text-gray-400'}`}><Clock className="h-3 w-3" />{formatDate(task.due_date)}</span>}
          <span className={`text-[10px] font-medium ${allDone&&ckT>0?'text-emerald-600':'text-gray-400'}`}>✓ {ckD}/{ckT}</span>
        </div>
        {ckT>0 && <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2"><div className={`h-full rounded-full transition-all ${isDone?'bg-emerald-500':'bg-blue-500'}`} style={{width:`${(ckD/ckT)*100}%`}} /></div>}
      </div>

      {/* Checklists */}
      <div className={`flex-1 rounded-b-xl border p-2 space-y-1.5 min-h-[60px] ${isDone?'bg-emerald-50/50 border-emerald-200':locked?'bg-gray-50 border-gray-200':'bg-gray-50/50 border-gray-200'}`}>
        {task.checklists?.map((cl,ci) => (
          <div key={cl.id} className={`flex items-start gap-2 bg-white rounded-lg border p-2 ${cl.is_completed?'border-emerald-200 bg-emerald-50/50':locked?'border-gray-200 opacity-60':'border-gray-200 hover:shadow-sm'}`}>
            <button onClick={()=>!locked&&onToggleCheck(task.id,cl.id,cl.is_completed)} disabled={locked}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${cl.is_completed?'bg-emerald-500 border-emerald-500 text-white':locked?'border-gray-200 cursor-not-allowed':'border-gray-300 hover:border-blue-400 cursor-pointer'}`}>
              {cl.is_completed && <CheckSquare className="h-3 w-3" />}
            </button>
            <span className={`text-sm ${cl.is_completed?'line-through text-gray-400':locked?'text-gray-400':'text-gray-700'}`}>{cl.title}</span>
          </div>
        ))}
        {!task.checklists?.length && <div className="flex items-center justify-center h-12 text-xs text-gray-400">Chưa có checklist</div>}
        {!locked && !isDone && <QuickAdd taskId={task.id} onAdded={loadData} />}
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-1">
        {!locked && !isDone && task.status==='pending' && <button onClick={()=>onStartTask(task.id)} className="flex-1 h-7 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 cursor-pointer">▶ Bắt đầu</button>}
        {!locked && !isDone && allDone && ckT>0 && <button onClick={()=>onMarkDone(task.id)} className="flex-1 h-7 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 cursor-pointer animate-pulse">✓ Xong</button>}
        <button onClick={()=>onSelectTask(task.id)} className="flex-1 h-7 text-gray-400 bg-white border rounded-lg text-xs hover:text-blue-600 cursor-pointer">Chi tiết →</button>
      </div>
    </div>
  );
}

function QuickAdd({ taskId, onAdded }) {
  const [t, setT] = useState('');
  const [a, setA] = useState(false);
  const add = async () => { if(!t.trim())return; setA(true); try{await api.post(`/tasks/${taskId}/checklists`,{title:t.trim()});setT('');onAdded?.();}catch{} setA(false); };
  return <div className="flex gap-1 mt-1"><input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="+ Thêm CL..." className="flex-1 h-7 px-2 bg-white border border-dashed rounded text-xs outline-none focus:border-blue-400" />{t&&<button onClick={add} disabled={a} className="h-7 px-2 bg-blue-600 text-white rounded text-xs cursor-pointer">{a?'...':'+'}</button>}</div>;
}

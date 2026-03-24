import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Plus, CheckCircle2, Circle, Clock, User, Eye, Trash2, ChevronDown, ChevronRight,
  Calendar, List, Users, Target, AlertTriangle, X, Save, ListChecks, ClipboardList
} from 'lucide-react';

const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
];
const DEAL_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
  { slug: 'design', label: 'Thiết kế', icon: '🎨', color: '#8B5CF6' },
  { slug: 'quotation', label: 'Báo giá', icon: '💰', color: '#F59E0B' },
  { slug: 'contract', label: 'Hợp đồng', icon: '📝', color: '#10B981' },
];
const ALL_STAGES = DEAL_STAGES;
const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: CheckCircle2 };

export default function CRMTasksTab({ leadId, leadType = 'lead', users = [] }) {
  const STAGES = leadType === 'deal' ? DEAL_STAGES : LEAD_STAGES;
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // list, deadline, planner, calendar
  const [expandedStages, setExpandedStages] = useState({});
  const [showAdd, setShowAdd] = useState(null); // stage_slug
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const [tasksRes, tplRes] = await Promise.all([
        api.get(`/crm/leads/${leadId}/tasks`),
        api.get('/crm/task-templates'),
      ]);
      setTasks(tasksRes.data || []);
      setTemplates(tplRes.data || []);
      // Auto-expand stages that have tasks
      const stages = {};
      (tasksRes.data || []).forEach(t => { if (t.stage_slug) stages[t.stage_slug] = true; });
      setExpandedStages(stages);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadTasks(); }, [leadId]);

  const addTask = async (stageSlug) => {
    if (!newTask.title.trim()) return;
    try {
      await api.post(`/crm/leads/${leadId}/tasks`, { ...newTask, stage_slug: stageSlug, order_index: tasks.filter(t => t.stage_slug === stageSlug).length });
      setNewTask({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
      setShowAdd(null);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks/from-template`, { template_id: templateId });
      alert(`Đã tạo ${data.count} công việc từ bộ mẫu`);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateTask = async (taskId, updates) => {
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${taskId}`, updates);
      loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleStatus = (task) => {
    const next = task.status === 'completed' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'completed';
    updateTask(task.id, { status: next });
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa công việc này?')) return;
    try { await api.delete(`/crm/leads/${leadId}/tasks/${taskId}`); loadTasks(); } catch (e) { alert('Lỗi'); }
  };

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    return { total, completed, overdue, inProgress, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [tasks]);

  // Group tasks by stage
  const tasksByStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s.slug] = []; });
    tasks.forEach(t => { const key = t.stage_slug || 'other'; if (!map[key]) map[key] = []; map[key].push(t); });
    return map;
  }, [tasks]);

  // Deadline view groups
  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    tasks.filter(t => t.status !== 'completed').forEach(t => {
      if (!t.deadline) { groups.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [tasks]);

  // Planner view - group by assignee
  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    tasks.filter(t => t.status !== 'completed').forEach(t => {
      if (t.assignee_id && t.assignee) {
        if (!map[t.assignee_id]) map[t.assignee_id] = { user: t.assignee, tasks: [] };
        map[t.assignee_id].tasks.push(t);
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [tasks]);

  // Calendar view
  const calendarTasks = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (!t.deadline) return;
      const key = t.deadline.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const calDays = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay() || 7;
    const days = [];
    for (let i = 1 - startDay; i <= 42 - startDay; i++) {
      const d = new Date(calMonth.y, calMonth.m, i + 1);
      days.push(d);
    }
    return days.slice(0, 35);
  }, [calMonth]);

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  const TaskRow = ({ task }) => {
    const StatusIcon = STATUS_ICONS[task.status] || Circle;
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
    return (
      <div className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group ${task.status === 'completed' ? 'opacity-50' : ''}`}>
        <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
          <StatusIcon className={`h-4 w-4 ${task.status === 'completed' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.deadline && <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}><Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}</span>}
            {task.assignee && <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>}
            {task.supervisor && <span className="text-[10px] text-purple-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{task.supervisor.full_name}</span>}
          </div>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
          <button onClick={() => deleteTask(task.id)} className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    );
  };

  const AddTaskForm = ({ stageSlug }) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2">
      <input value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
        placeholder="Tên công việc..." className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500" autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={newTask.priority} onChange={e => setNewTask(p => ({...p, priority: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({...p, deadline: e.target.value}))}
          className="px-2 py-1 rounded border text-xs" />
        <select value={newTask.assignee_id} onChange={e => setNewTask(p => ({...p, assignee_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giao cho...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={newTask.supervisor_id} onChange={e => setNewTask(p => ({...p, supervisor_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giám sát...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addTask(stageSlug)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700"><Save className="h-3 w-3 inline mr-1" />Thêm</button>
        <button onClick={() => setShowAdd(null)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200">Hủy</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: Stats + Views + Templates */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{stats.percent}%</div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium text-gray-900">{stats.completed}/{stats.total}</span> xong
              {stats.overdue > 0 && <span className="text-red-600 ml-1">• {stats.overdue} quá hạn</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {templates.length > 0 && (
            <button onClick={() => setShowTemplatePanel(p => !p)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${showTemplatePanel ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'}`}>
              <ClipboardList className="h-3 w-3" /> Gắn mẫu
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {[{ id: 'list', icon: List, label: 'List' }, { id: 'deadline', icon: AlertTriangle, label: 'Deadline' }, { id: 'planner', icon: Users, label: 'Planner' }, { id: 'calendar', icon: Calendar, label: 'Lịch' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              className={`h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <v.icon className="h-3 w-3" />{v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template panel — always available via button */}
      {showTemplatePanel && templates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">📋 Gắn bộ nhiệm vụ mẫu</p>
            <button onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer"><X className="h-3.5 w-3.5 text-amber-600" /></button>
          </div>
          <p className="text-[11px] text-amber-700">Chọn bộ mẫu để tạo nhiệm vụ tự động cho {leadType === 'deal' ? 'Deal' : 'Lead'} này. Có thể gắn nhiều bộ mẫu.</p>
          {ALL_STAGES.map(stage => {
            const stageTpls = templates.filter(t => t.stage_slug === stage.slug);
            if (!stageTpls.length) return null;
            const existingCount = tasks.filter(t => t.stage_slug === stage.slug).length;
            return (
              <div key={stage.slug}>
                <p className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: stage.color }}>
                  {stage.icon} {stage.label}
                  {existingCount > 0 && <span className="text-gray-400 font-normal">({existingCount} việc hiện có)</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {stageTpls.map(tpl => (
                    <button key={tpl.id} onClick={() => { applyTemplate(tpl.id); }}
                      className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm">
                      <ListChecks className="h-3.5 w-3.5" />
                      {tpl.name}
                      <span className="text-[10px] text-amber-500">({tpl.items?.length || 0} việc)</span>
                      {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template quick-apply — only when no tasks exist */}
      {templates.length > 0 && tasks.length === 0 && !showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">📋 Chưa có công việc — Áp dụng bộ mẫu nhanh:</p>
          <div className="flex flex-wrap gap-2">
            {templates.filter(t => t.is_default).concat(templates.filter(t => !t.is_default)).slice(0, 5).map(tpl => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                {ALL_STAGES.find(s => s.slug === tpl.stage_slug)?.icon || '📋'} {tpl.name} ({tpl.items?.length || 0} việc)
                {tpl.is_default && ' ⭐'}
              </button>
            ))}
            {templates.length > 5 && (
              <button onClick={() => setShowTemplatePanel(true)} className="px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 cursor-pointer">
                +{templates.length - 5} bộ mẫu khác...
              </button>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {STAGES.map(stage => {
            const stageTasks = tasksByStage[stage.slug] || [];
            const completed = stageTasks.filter(t => t.status === 'completed').length;
            const expanded = expandedStages[stage.slug] !== false;
            const tpl = templates.find(t => t.stage_slug === stage.slug);
            return (
              <div key={stage.slug} className="border rounded-lg overflow-hidden">
                <button onClick={() => setExpandedStages(p => ({...p, [stage.slug]: !expanded}))}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="text-sm">{stage.icon}</span>
                  <span className="text-sm font-semibold" style={{color: stage.color}}>{stage.label}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{completed}/{stageTasks.length}</span>
                  {stageTasks.length > 0 && (
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{width: `${stageTasks.length ? completed/stageTasks.length*100 : 0}%`}} />
                    </div>
                  )}
                </button>
                {expanded && (
                  <div className="px-2 py-1">
                    {stageTasks.map(t => <TaskRow key={t.id} task={t} />)}
                    {showAdd === stage.slug ? (
                      <AddTaskForm stageSlug={stage.slug} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 px-3">
                        <button onClick={() => setShowAdd(stage.slug)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                        {tpl && !stageTasks.length && (
                          <button onClick={() => applyTemplate(tpl.id)}
                            className="text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                            <ListChecks className="h-3 w-3" /> Áp dụng mẫu ({tpl.items?.length || 0})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
            <div key={group.key} className={`border rounded-lg ${group.color}`}>
              <div className="px-3 py-2 font-semibold text-xs flex items-center gap-2">
                {group.label} <span className="text-gray-400 font-normal">({group.tasks.length})</span>
              </div>
              <div className="bg-white rounded-b-lg">
                {group.tasks.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          ))}
          {tasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* PLANNER VIEW */}
      {viewMode === 'planner' && (
        <div className="space-y-3">
          {plannerGroups.assignees.map(group => (
            <div key={group.user.id} className="border rounded-lg">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold">
                  {group.user.full_name?.charAt(0) || '?'}
                </div>
                <span className="text-sm font-semibold">{group.user.full_name}</span>
                <span className="text-[10px] text-gray-400">({group.tasks.length} việc)</span>
              </div>
              <div>{group.tasks.map(t => <TaskRow key={t.id} task={t} />)}</div>
            </div>
          ))}
          {plannerGroups.unassigned.length > 0 && (
            <div className="border rounded-lg border-dashed">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-500">Chưa giao ({plannerGroups.unassigned.length})</div>
              <div>{plannerGroups.unassigned.map(t => <TaskRow key={t.id} task={t} />)}</div>
            </div>
          )}
          {tasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">◀</button>
            <span className="font-semibold text-sm">Tháng {calMonth.m + 1}/{calMonth.y}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-[10px]">
            {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
              <div key={d} className="bg-gray-50 text-center py-1 font-semibold text-gray-500">{d}</div>
            ))}
            {calDays.map((day, i) => {
              const key = day.toISOString().substring(0, 10);
              const dayTasks = calendarTasks[key] || [];
              const isToday = key === new Date().toISOString().substring(0, 10);
              const isCurrentMonth = day.getMonth() === calMonth.m;
              return (
                <div key={i} className={`bg-white min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="text-[10px] text-gray-500 mb-0.5">{day.getDate()}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-blue-100 text-blue-700'}`}
                      onClick={() => toggleStatus(t)} title={t.title}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div className="text-[8px] text-gray-400">+{dayTasks.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed tasks (collapsed) */}
      {tasks.filter(t => t.status === 'completed').length > 0 && viewMode !== 'list' && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            ✅ Đã hoàn thành ({tasks.filter(t => t.status === 'completed').length})
          </summary>
          <div className="mt-2 opacity-50">
            {tasks.filter(t => t.status === 'completed').map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        </details>
      )}
    </div>
  );
}

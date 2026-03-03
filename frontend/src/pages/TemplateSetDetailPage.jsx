import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import UserSelect from '../components/UserSelect';
import {
  ArrowLeft, Plus, Save, Trash2, Edit, GripVertical, ChevronDown, ChevronRight,
  FileText, CheckSquare, Users, User, Building, ClipboardList, Copy, Star, Clock
} from 'lucide-react';

const PRIORITIES = [
  { value: 'low', label: 'Thấp', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'TB', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'Cao', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Gấp', color: 'bg-red-100 text-red-600' },
];

export default function TemplateSetDetailPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [stages, setStages] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: setData } = await api.get(`/company-templates/template-sets/${setId}`);
        setSet(setData.set);

        const { data: tasksData } = await api.get(`/company-templates/template-sets/${setId}/tasks`);
        setTasks(tasksData.tasks || []);

        const companyId = setData.set?.unit?.company_id;
        let stagesUrl = '/stages';
        if (companyId) stagesUrl += `?company_id=${companyId}`;
        const { data: stagesData } = await api.get(stagesUrl);
        let stagesList = stagesData.stages || [];
        if (stagesList.length === 0 && companyId) {
          const { data: defaultStages } = await api.get('/stages');
          stagesList = defaultStages.stages || [];
        }
        setStages(stagesList);

        // Load users for assignee selection
        const { data: usersData } = await api.get('/users');
        setAllUsers(usersData.users || []);
      } catch {}
      setLoading(false);
    })();
  }, [setId]);

  const reload = async () => {
    const { data: tasksData } = await api.get(`/company-templates/template-sets/${setId}/tasks`);
    setTasks(tasksData.tasks || []);
  };

  const addTask = async (data) => {
    try {
      await api.post(`/company-templates/template-sets/${setId}/tasks`, data);
      await reload();
      setShowAddTask(false);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateTask = async (taskId, data) => {
    try {
      await api.put(`/company-templates/template-tasks/${taskId}`, data);
      await reload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa nhiệm vụ mẫu này?')) return;
    try {
      await api.delete(`/company-templates/template-tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch {}
  };

  const addChecklist = async (taskId, title) => {
    try {
      await api.post(`/company-templates/template-tasks/${taskId}/checklists`, { title, order_index: 0 });
      await reload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteChecklist = async (checkId) => {
    try {
      await api.delete(`/company-templates/template-checklists/${checkId}`);
      await reload();
    } catch {}
  };

  const tasksByStage = {};
  tasks.forEach(t => {
    const sid = t.stage_id;
    if (!tasksByStage[sid]) tasksByStage[sid] = [];
    tasksByStage[sid].push(t);
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-lg border flex items-center justify-center hover:bg-gray-50 cursor-pointer"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            {set?.name || 'Dự Án Mẫu'}
          </h1>
          <p className="text-xs text-gray-500">
            {tasks.length} nhiệm vụ · {stages.length} quy trình
            {set?.project_type && <span> · Loại: {set.project_type}</span>}
          </p>
        </div>
        <button onClick={() => setShowAddTask(true)} className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm nhiệm vụ</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-indigo-600">{tasks.length}</p><p className="text-[10px] text-gray-500">Nhiệm vụ</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-green-600">{tasks.reduce((s, t) => s + (t.checklists?.length || 0), 0)}</p><p className="text-[10px] text-gray-500">Checklist</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-blue-600">{Object.keys(tasksByStage).length}</p><p className="text-[10px] text-gray-500">Quy trình</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-amber-600">{tasks.filter(t => t.default_assignee_id).length}</p><p className="text-[10px] text-gray-500">Đã gán NV</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-2xl font-bold text-orange-600">{tasks.filter(t => t.deadline_days > 0 || t.deadline_hours > 0).length}</p><p className="text-[10px] text-gray-500">Có deadline</p></div>
      </div>

      {showAddTask && <AddTaskForm stages={stages} users={allUsers} onAdd={addTask} onCancel={() => setShowAddTask(false)} />}

      {stages.filter(s => s.is_active !== false).map((stage, stageIdx) => {
        const stageTasks = tasksByStage[stage.id];
        if (!stageTasks) return null;
        return (
          <StageSection key={stage.id} stage={stage} stageNumber={stageIdx + 1} tasks={stageTasks}
            users={allUsers}
            onUpdateTask={updateTask} onDeleteTask={deleteTask}
            onAddChecklist={addChecklist} onDeleteChecklist={deleteChecklist} />
        );
      })}

      {tasks.length === 0 && !showAddTask && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Chưa có nhiệm vụ mẫu nào</p>
          <p className="text-xs text-gray-400 mt-1">Bấm "Thêm nhiệm vụ" để bắt đầu xây dựng dự án mẫu</p>
        </div>
      )}
    </div>
  );
}

/* ═══ ADD TASK FORM ═══ */
function AddTaskForm({ stages, users, onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [stageId, setStageId] = useState(stages[0]?.id || '');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState('medium');
  const [hours, setHours] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadlineDays, setDeadlineDays] = useState('');
  const [deadlineHours, setDeadlineHours] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return alert('Nhập tiêu đề');
    if (!stageId) return alert('Chọn quy trình');
    setSaving(true);
    await onAdd({
      title: title.trim(), stage_id: stageId, description: desc || null, priority,
      estimated_hours: hours ? parseFloat(hours) : null,
      default_assignee_id: assigneeId || null,
      deadline_days: deadlineDays ? parseInt(deadlineDays) : 0,
      deadline_hours: deadlineHours ? parseInt(deadlineHours) : 0,
    });
    setSaving(false);
  };

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-3">
      <h3 className="text-sm font-bold text-indigo-900">Thêm nhiệm vụ mẫu</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tiêu đề *</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Khảo sát hiện trạng" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Quy trình *</label>
          <select value={stageId} onChange={e => setStageId(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
            {stages.filter(s => s.is_active !== false).map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.icon && s.icon.charCodeAt(0) > 127 ? s.icon : '📋'} {s.name}</option>)}
          </select>
        </div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Người chịu trách nhiệm</label>
          <UserSelect value={assigneeId} onChange={setAssigneeId} users={users} className="w-full" placeholder="-- Chọn NV --" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Ưu tiên</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="w-20"><label className="text-[11px] font-medium text-gray-600 block mb-1">Giờ</label><input type="number" value={hours} onChange={e => setHours(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="0" /></div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">⏰ Deadline (từ khi bắt đầu giai đoạn)</label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={deadlineDays} onChange={e => setDeadlineDays(e.target.value)} className="w-16 h-9 px-2 border rounded-lg text-sm text-center" placeholder="0" />
            <span className="text-xs text-gray-500">ngày</span>
            <input type="number" min="0" value={deadlineHours} onChange={e => setDeadlineHours(e.target.value)} className="w-16 h-9 px-2 border rounded-lg text-sm text-center" placeholder="0" />
            <span className="text-xs text-gray-500">giờ</span>
          </div>
        </div>
        <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label><textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full min-h-[50px] px-3 py-2 border rounded-lg text-sm resize-none" /></div>
      </div>
      <div className="flex justify-end gap-2"><button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button><button onClick={save} disabled={saving} className="h-8 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : 'Thêm'}</button></div>
    </div>
  );
}

/* ═══ STAGE SECTION ═══ */
function StageSection({ stage, stageNumber, tasks, users, onUpdateTask, onDeleteTask, onAddChecklist, onDeleteChecklist }) {
  const [open, setOpen] = useState(true);
  const icon = stage.icon && stage.icon.charCodeAt(0) > 127 ? stage.icon : '📋';

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: stage.color || '#6b7280' }}>
          {stageNumber}
        </div>
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 text-left">
          <h3 className="text-sm font-bold text-gray-900">{stage.name}</h3>
          <p className="text-[10px] text-gray-400">{tasks.length} nhiệm vụ</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t divide-y">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} users={users}
              onUpdate={onUpdateTask} onDelete={onDeleteTask}
              onAddChecklist={onAddChecklist} onDeleteChecklist={onDeleteChecklist} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ TASK CARD ═══ */
function TaskCard({ task, users, onUpdate, onDelete, onAddChecklist, onDeleteChecklist }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [hours, setHours] = useState(task.estimated_hours || '');
  const [assigneeId, setAssigneeId] = useState(task.default_assignee_id || '');
  const [deadlineDays, setDeadlineDays] = useState(task.deadline_days || 0);
  const [deadlineHours, setDeadlineHours] = useState(task.deadline_hours || 0);
  const [newCheck, setNewCheck] = useState('');
  const [saving, setSaving] = useState(false);

  const pri = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];

  const saveEdit = async () => {
    setSaving(true);
    await onUpdate(task.id, {
      title, description: desc || null, priority,
      estimated_hours: hours ? parseFloat(hours) : null,
      default_assignee_id: assigneeId || null,
      deadline_days: parseInt(deadlineDays) || 0,
      deadline_hours: parseInt(deadlineHours) || 0,
    });
    setEditing(false);
    setSaving(false);
  };

  const handleAddCheck = async () => {
    if (!newCheck.trim()) return;
    await onAddChecklist(task.id, newCheck.trim());
    setNewCheck('');
  };

  const hasDeadline = (task.deadline_days > 0 || task.deadline_hours > 0);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
        <button onClick={() => setExpanded(!expanded)} className="cursor-pointer shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        </button>

        {editing ? (
          <input value={title} onChange={e => setTitle(e.target.value)} className="flex-1 h-7 px-2 border rounded text-sm" autoFocus />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-900 truncate cursor-pointer" onClick={() => setExpanded(!expanded)}>{task.title}</span>
        )}

        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pri.color}`}>{pri.label}</span>
        {task.estimated_hours && <span className="text-[9px] text-gray-400">{task.estimated_hours}h</span>}
        {hasDeadline && (
          <span className="text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {task.deadline_days > 0 && `${task.deadline_days}d`}{task.deadline_hours > 0 && `${task.deadline_hours}h`}
          </span>
        )}
        {task.checklists?.length > 0 && <span className="text-[9px] text-gray-400 flex items-center gap-0.5"><CheckSquare className="h-2.5 w-2.5" />{task.checklists.length}</span>}

        {task.default_department && <span className="text-[8px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Building className="h-2 w-2" />{task.default_department.short_name || task.default_department.name}</span>}
        {task.default_assignee && <span className="text-[8px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><User className="h-2 w-2" />{task.default_assignee.full_name?.split(' ').pop()}</span>}

        <div className="flex gap-0.5 shrink-0">
          <button onClick={() => { if (editing) saveEdit(); else setEditing(true); }} className="h-6 w-6 rounded flex items-center justify-center text-blue-500 hover:bg-blue-50 cursor-pointer">{editing ? <Save className="h-3 w-3" /> : <Edit className="h-3 w-3" />}</button>
          <button onClick={() => onDelete(task.id)} className="h-6 w-6 rounded flex items-center justify-center text-red-400 hover:bg-red-50 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>

      {expanded && (
        <div className="ml-9 mt-2 space-y-2">
          {editing && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
              <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full min-h-[40px] px-2 py-1 border rounded text-xs resize-none" placeholder="Mô tả..." />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Ưu tiên</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full h-7 px-2 border rounded text-xs">
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Ước lượng (giờ)</label>
                  <input type="number" value={hours} onChange={e => setHours(e.target.value)} className="w-full h-7 px-2 border rounded text-xs" placeholder="0" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Người chịu trách nhiệm</label>
                  <UserSelect value={assigneeId} onChange={setAssigneeId} users={users || []} className="w-full" placeholder="-- Chọn --" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">⏰ Deadline (từ khi bắt đầu giai đoạn)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={deadlineDays} onChange={e => setDeadlineDays(e.target.value)} className="w-14 h-7 px-2 border rounded text-xs text-center" />
                  <span className="text-[10px] text-gray-500">ngày</span>
                  <input type="number" min="0" value={deadlineHours} onChange={e => setDeadlineHours(e.target.value)} className="w-14 h-7 px-2 border rounded text-xs text-center" />
                  <span className="text-[10px] text-gray-500">giờ</span>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={saveEdit} disabled={saving} className="h-7 px-3 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : 'Lưu'}</button>
              </div>
            </div>
          )}

          {task.description && !editing && <p className="text-xs text-gray-500">{task.description}</p>}

          {/* Deadline info when not editing */}
          {!editing && hasDeadline && (
            <div className="flex items-center gap-1.5 text-[10px] text-orange-600">
              <Clock className="h-3 w-3" />
              <span>Deadline: {task.deadline_days > 0 && `${task.deadline_days} ngày`} {task.deadline_hours > 0 && `${task.deadline_hours} giờ`} sau khi bắt đầu giai đoạn</span>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase">Checklist ({task.checklists?.length || 0})</p>
            {(task.checklists || []).map(c => (
              <div key={c.id} className="flex items-center gap-2 py-1">
                <CheckSquare className="h-3 w-3 text-gray-300 shrink-0" />
                <span className="text-xs text-gray-700 flex-1">{c.title}</span>
                {c.default_assignee_id && (
                  <span className="text-[8px] bg-blue-50 text-blue-600 px-1 rounded flex items-center gap-0.5">
                    <User className="h-2 w-2" />
                    {(users || []).find(u => u.id === c.default_assignee_id)?.full_name?.split(' ').pop() || 'NV'}
                  </span>
                )}
                {c.require_file && <span className="text-[8px] bg-blue-50 text-blue-500 px-1 rounded">📎 File</span>}
                {c.require_note && <span className="text-[8px] bg-green-50 text-green-500 px-1 rounded">📝 Note</span>}
                <button onClick={() => onDeleteChecklist(c.id)} className="text-red-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Plus className="h-3 w-3 text-gray-300 shrink-0" />
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCheck()}
                className="flex-1 h-6 px-2 border border-dashed rounded text-xs text-gray-500" placeholder="Thêm checklist..." />
              {newCheck && <button onClick={handleAddCheck} className="h-6 px-2 bg-gray-100 rounded text-[10px] cursor-pointer">+</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

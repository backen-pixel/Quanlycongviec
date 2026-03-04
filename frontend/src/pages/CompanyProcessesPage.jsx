import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  Layers, Plus, Edit, Save, Trash2, ChevronDown, ChevronRight, CheckSquare,
  User, Clock, FileText, StickyNote, Copy, Building2, Zap, GripVertical
} from 'lucide-react';

const ICONS = ['📋','🔍','🎨','💰','📝','🏭','🚛','🔧','❤️','📦','⚙️','✅','📊','🏗️'];

export default function CompanyProcessesPage() {
  const [searchParams] = useSearchParams();
  const preselectedUnit = searchParams.get('unit') || '';
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(preselectedUnit);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [companyEmployees, setCompanyEmployees] = useState([]);

  const loadUnits = useCallback(async () => {
    try {
      const { data } = await api.get('/ecosystem/units');
      const all = data.units || [];
      // Companies = depth 2
      const companies = all.filter(u => u.level?.depth === 2);
      setUnits(companies);
      if (!selectedUnit && companies.length > 0) setSelectedUnit(companies[0].id);
    } catch {}
  }, []);

  // Load nhân viên của công ty
  const loadCompanyEmployees = useCallback(async (companyId) => {
    if (!companyId) { setCompanyEmployees([]); return; }
    try {
      const { data } = await api.get(`/users?company_id=${companyId}`);
      setCompanyEmployees(data.users || []);
    } catch { setCompanyEmployees([]); }
  }, []);

  const loadProcesses = useCallback(async () => {
    if (!selectedUnit) { setProcesses([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/company-processes/unit/${selectedUnit}`);
      setProcesses(data.processes || []);
    } catch {}
    setLoading(false);
  }, [selectedUnit]);

  useEffect(() => { loadUnits(); }, [loadUnits]);
  useEffect(() => { loadProcesses(); }, [loadProcesses]);
  useEffect(() => { loadCompanyEmployees(selectedUnit); }, [selectedUnit, loadCompanyEmployees]);

  const generateSuggestions = async () => {
    if (!selectedUnit) return;
    try {
      const { data } = await api.post(`/company-processes/generate-suggestions/${selectedUnit}`);
      alert(`✅ Đã tạo ${data.count} quy trình gợi ý`);
      loadProcesses();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteProcess = async (id) => {
    if (!confirm('Vô hiệu hóa quy trình này?')) return;
    try { await api.delete(`/company-processes/${id}`); loadProcesses(); } catch {}
  };

  const selectedCompany = units.find(u => u.id === selectedUnit);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-600" /> Quy Trình Nội Bộ Công Ty
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Mỗi Công ty tự quy định quy trình → nhiệm vụ → checklist</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[200px]">
            <option value="">— Chọn Công ty —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.level?.icon} {u.parent?.name ? u.parent.name + ' · ' : ''}{u.name}</option>)}
          </select>
        </div>
      </div>

      {selectedUnit && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowCreate(true)}
            className="h-8 px-3 bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-purple-700 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Thêm quy trình
          </button>
          {processes.length === 0 && (
            <button onClick={generateSuggestions}
              className="h-8 px-3 bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-indigo-700 cursor-pointer">
              <Zap className="h-3.5 w-3.5" /> Tạo QT gợi ý từ hệ thống
            </button>
          )}
        </div>
      )}

      {showCreate && <ProcessForm unitId={selectedUnit} onSaved={() => { loadProcesses(); setShowCreate(false); }} onCancel={() => setShowCreate(false)} />}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-purple-200 border-t-purple-600 rounded-full" /></div>
      ) : (
        <div className="space-y-2">
          {processes.map((p, i) => (
            <ProcessRow key={p.id} process={p} index={i}
              expanded={expandedId === p.id}
              editing={editId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onEdit={() => setEditId(p.id)}
              onEditDone={() => { setEditId(null); loadProcesses(); }}
              onDelete={() => deleteProcess(p.id)}
              companyEmployees={companyEmployees} />
          ))}
        </div>
      )}

      {!loading && processes.length === 0 && selectedUnit && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <Layers className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Công ty chưa có quy trình nội bộ</p>
          <p className="text-xs text-gray-400 mt-1">Bấm "Tạo QT gợi ý" để tạo nhanh từ quy trình gốc</p>
        </div>
      )}
    </div>
  );
}

function ProcessRow({ process, index, expanded, editing, onToggle, onEdit, onEditDone, onDelete, companyEmployees }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const loadTasks = async () => {
    try {
      const { data } = await api.get(`/company-processes/${process.id}/tasks`);
      setTasks(data.tasks || []);
      setLoaded(true);
    } catch {}
  };

  const handleToggle = () => { if (!expanded && !loaded) loadTasks(); onToggle(); };

  const addTask = async (title, priority, deadlineDays, deadlineHours, assigneeId) => {
    try {
      await api.post(`/company-processes/${process.id}/tasks`, { title, priority, deadline_days: deadlineDays, deadline_hours: deadlineHours, assignee_id: assigneeId || null });
      loadTasks();
      setShowAddTask(false);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    try { await api.delete(`/company-processes/tasks/${taskId}`); loadTasks(); } catch {}
  };

  if (editing) return <ProcessForm process={process} unitId={process.company_unit_id} onSaved={onEditDone} onCancel={onEditDone} />;

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderLeft: `4px solid ${process.color || '#8B5CF6'}` }}>
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={handleToggle}>
        <span className="text-lg">{process.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{process.name}</h3>
          {process.description && <p className="text-[10px] text-gray-400 truncate">{process.description}</p>}
        </div>
        <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">{process.task_count || 0} NV</span>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer"><Edit className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="border-t bg-gray-50/50 p-3 space-y-2">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} processId={process.id} onReload={loadTasks} onDelete={() => deleteTask(t.id)} />
          ))}

          {showAddTask ? (
            <InlineAddTask onAdd={addTask} onCancel={() => setShowAddTask(false)} companyEmployees={companyEmployees} />
          ) : (
            <button onClick={() => setShowAddTask(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-[10px] text-gray-500 flex items-center justify-center gap-1 hover:border-purple-400 hover:text-purple-600 cursor-pointer">
              <Plus className="h-3 w-3" /> Thêm nhiệm vụ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, processId, onReload, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddCheck, setShowAddCheck] = useState(false);

  const addChecklist = async (title, requireFile, requireNote) => {
    try {
      await api.post(`/company-processes/tasks/${task.id}/checklists`, { title, require_file: requireFile, require_note: requireNote });
      onReload();
      setShowAddCheck(false);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteChecklist = async (id) => {
    try { await api.delete(`/company-processes/checklists/${id}`); onReload(); } catch {}
  };

  return (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CheckSquare className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <span className="flex-1 text-xs font-medium text-gray-800">{task.title}</span>
        {task.default_assignee && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded"><User className="h-2 w-2 inline" /> {task.default_assignee.full_name?.split(' ').pop()}</span>}
        {(task.deadline_days > 0 || task.deadline_hours > 0) && <span className="text-[9px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded"><Clock className="h-2 w-2 inline" /> {task.deadline_days > 0 ? `${task.deadline_days}d` : ''}{task.deadline_hours > 0 ? `${task.deadline_hours}h` : ''}</span>}
        <span className="text-[9px] text-gray-400">{task.checklists?.length || 0} CL</span>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-5 h-5 rounded hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
        {expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
      </div>

      {expanded && (
        <div className="border-t bg-purple-50/20 p-2 space-y-1">
          {(task.checklists || []).map(c => (
            <div key={c.id} className="flex items-center gap-1.5 py-1 px-2 bg-white rounded text-[10px] group">
              <span className="w-2 h-2 rounded-full bg-purple-300 shrink-0" />
              <span className="flex-1 text-gray-700">{c.title}</span>
              {c.require_file && <FileText className="h-2.5 w-2.5 text-blue-400" title="Yêu cầu file" />}
              {c.require_note && <StickyNote className="h-2.5 w-2.5 text-amber-400" title="Yêu cầu ghi chú" />}
              <button onClick={() => deleteChecklist(c.id)} className="opacity-0 group-hover:opacity-100 text-red-400 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
            </div>
          ))}

          {showAddCheck ? (
            <InlineAddChecklist onAdd={addChecklist} onCancel={() => setShowAddCheck(false)} />
          ) : (
            <button onClick={() => setShowAddCheck(true)}
              className="w-full py-1 border border-dashed border-gray-300 rounded text-[9px] text-gray-400 flex items-center justify-center gap-1 hover:border-purple-300 hover:text-purple-500 cursor-pointer">
              <Plus className="h-2.5 w-2.5" /> Thêm checklist
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InlineAddTask({ onAdd, onCancel, companyEmployees = [] }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState(''); // NEW
  const [dd, setDd] = useState('');
  const [dh, setDh] = useState('');
  return (
    <div className="bg-white rounded-lg border p-2 space-y-1.5">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên nhiệm vụ..." className="w-full h-7 px-2 border rounded text-[11px]" autoFocus onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onAdd(title.trim(), priority, parseInt(dd)||0, parseInt(dh)||0, assigneeId); if (e.key === 'Escape') onCancel(); }} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <select value={priority} onChange={e => setPriority(e.target.value)} className="h-6 px-1 border rounded text-[10px]">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="h-6 px-1 border rounded text-[10px]">
          <option value="">-- Nhân viên --</option>
          {companyEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
        </select>
        <span className="text-[9px] text-gray-400">⏰</span>
        <input type="number" min="0" value={dd} onChange={e => setDd(e.target.value)} placeholder="0" className="w-10 h-6 px-1 border rounded text-[10px] text-center" /><span className="text-[9px] text-gray-400">ngày</span>
        <input type="number" min="0" value={dh} onChange={e => setDh(e.target.value)} placeholder="0" className="w-10 h-6 px-1 border rounded text-[10px] text-center" /><span className="text-[9px] text-gray-400">giờ</span>
        <div className="flex-1" />
        <button onClick={onCancel} className="h-6 px-2 text-[10px] text-gray-500 cursor-pointer">Hủy</button>
        <button onClick={() => title.trim() && onAdd(title.trim(), priority, parseInt(dd)||0, parseInt(dh)||0, assigneeId)} disabled={!title.trim()}
          className="h-6 px-2 bg-purple-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50">+ Thêm</button>
      </div>
    </div>
  );
}

function InlineAddChecklist({ onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [rf, setRf] = useState(false);
  const [rn, setRn] = useState(false);
  return (
    <div className="bg-white rounded border p-1.5 flex items-center gap-1.5">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên checklist..." className="flex-1 h-6 px-2 border rounded text-[10px]" autoFocus onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onAdd(title.trim(), rf, rn); if (e.key === 'Escape') onCancel(); }} />
      <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={rf} onChange={e => setRf(e.target.checked)} className="accent-blue-600 w-3 h-3" /><FileText className="h-2.5 w-2.5" /></label>
      <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={rn} onChange={e => setRn(e.target.checked)} className="accent-amber-600 w-3 h-3" /><StickyNote className="h-2.5 w-2.5" /></label>
      <button onClick={onCancel} className="text-[9px] text-gray-400 cursor-pointer">✕</button>
      <button onClick={() => title.trim() && onAdd(title.trim(), rf, rn)} disabled={!title.trim()}
        className="h-5 px-1.5 bg-purple-600 text-white rounded text-[9px] cursor-pointer disabled:opacity-50">+</button>
    </div>
  );
}

function ProcessForm({ process, unitId, onSaved, onCancel }) {
  const [name, setName] = useState(process?.name || '');
  const [desc, setDesc] = useState(process?.description || '');
  const [color, setColor] = useState(process?.color || '#8B5CF6');
  const [icon, setIcon] = useState(process?.icon || '📋');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên');
    setSaving(true);
    try {
      if (process?.id) { await api.put(`/company-processes/${process.id}`, { name, description: desc, color, icon }); }
      else { await api.post(`/company-processes/unit/${unitId}`, { name, description: desc, color, icon }); }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 space-y-3">
      <h3 className="text-sm font-bold text-purple-900">{process ? '✏️ Sửa' : '➕ Thêm quy trình'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-9 border rounded-lg cursor-pointer" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">{ICONS.map(i => <button key={i} type="button" onClick={() => setIcon(i)} className={`w-7 h-7 rounded text-sm cursor-pointer ${icon === i ? 'bg-purple-200 ring-2 ring-purple-400' : 'bg-white border hover:bg-gray-50'}`}>{i}</button>)}</div></div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button>
        <button onClick={save} disabled={saving} className="h-8 px-4 bg-purple-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : <><Save className="h-3.5 w-3.5 inline mr-1" />Lưu</>}</button>
      </div>
    </div>
  );
}

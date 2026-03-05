import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Loader, Search, ChevronDown, ChevronUp, CheckSquare } from 'lucide-react';
import api from '../lib/api';

/**
 * FlowProcessTaskEditor
 * Display & manage tasks+checklists from processes in flow editor
 * CRUD with user assignment (filter: division → company → users)
 */
export default function FlowProcessTaskEditor({ 
  companyUnitId, 
  divisionUnitId,
  processes = [],
}) {
  const [expandedProcess, setExpandedProcess] = useState(null);
  const [processTasksMap, setProcessTasksMap] = useState({}); // processId → tasks[]
  const [loadingMap, setLoadingMap] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Load employees when company changes
  useEffect(() => {
    if (companyUnitId) loadEmployees(companyUnitId);
  }, [companyUnitId]);

  const loadEmployees = async (unitId) => {
    setLoadingEmployees(true);
    try {
      const { data } = await api.get(`/ecosystem/company-users/${unitId}`);
      setEmployees(data.users || []);
    } catch (e) {
      console.error('Load employees error:', e);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const loadProcessTasks = async (processId) => {
    if (processTasksMap[processId]) return; // cached
    setLoadingMap(m => ({ ...m, [processId]: true }));
    try {
      const { data } = await api.get(`/company-processes/${processId}/tasks`);
      setProcessTasksMap(m => ({ ...m, [processId]: data.tasks || [] }));
    } catch (e) {
      console.error('Load process tasks error:', e);
      setProcessTasksMap(m => ({ ...m, [processId]: [] }));
    } finally {
      setLoadingMap(m => ({ ...m, [processId]: false }));
    }
  };

  const toggleProcess = async (processId) => {
    const isExpanding = expandedProcess !== processId;
    setExpandedProcess(isExpanding ? processId : null);
    if (isExpanding) {
      await loadProcessTasks(processId);
    }
  };

  const refreshProcessTasks = async (processId) => {
    setProcessTasksMap(m => { const n = { ...m }; delete n[processId]; return n; });
    await loadProcessTasks(processId);
  };

  const handleSaveTask = async (taskData) => {
    try {
      if (taskData.id) {
        await api.put(`/company-processes/tasks/${taskData.id}`, {
          title: taskData.title,
          description: taskData.description || null,
          default_assignee_id: taskData.assignee_id || null,
          order_index: taskData.order_index || 0,
        });
      } else {
        await api.post(`/company-processes/${taskData.processId}/tasks`, {
          title: taskData.title,
          description: taskData.description || null,
          default_assignee_id: taskData.assignee_id || null,
          order_index: taskData.order_index || 0,
        });
      }
      await refreshProcessTasks(taskData.processId);
      setEditingTask(null);
    } catch (e) {
      alert('Lỗi lưu task: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteTask = async (taskId, processId) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    try {
      await api.delete(`/company-processes/tasks/${taskId}`);
      await refreshProcessTasks(processId);
    } catch (e) {
      alert('Lỗi xóa: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleSaveChecklist = async (checkData, taskId, processId) => {
    try {
      if (checkData.id) {
        await api.put(`/company-processes/checklists/${checkData.id}`, {
          title: checkData.title,
          order_index: checkData.order_index || 0,
        });
      } else {
        await api.post(`/company-processes/tasks/${taskId}/checklists`, {
          title: checkData.title,
          order_index: checkData.order_index || 0,
        });
      }
      await refreshProcessTasks(processId);
    } catch (e) {
      alert('Lỗi lưu checklist: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteChecklist = async (checkId, processId) => {
    if (!confirm('Xóa checklist này?')) return;
    try {
      await api.delete(`/company-processes/checklists/${checkId}`);
      await refreshProcessTasks(processId);
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  };

  if (!processes.length) return null;

  return (
    <div className="space-y-2 mt-2">
      {processes.map((proc) => {
        const tasks = processTasksMap[proc.id] || [];
        const isExpanded = expandedProcess === proc.id;
        const isLoading = loadingMap[proc.id];

        return (
          <div key={proc.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden text-xs">
            {/* Process Header */}
            <button
              onClick={() => toggleProcess(proc.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
              <span className="font-semibold text-gray-900 flex-1 text-left">{proc.icon || '📋'} {proc.name}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                {isExpanded ? tasks.length : (proc.task_count || 0)} nhiệm vụ
              </span>
              {/* Add task button */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTask({
                    processId: proc.id,
                    title: '', description: '', assignee_id: null,
                    order_index: tasks.length, isNew: true,
                  });
                  if (!isExpanded) toggleProcess(proc.id);
                }}
                className="ml-1 p-1 text-blue-600 hover:bg-blue-100 rounded cursor-pointer"
                title="Thêm nhiệm vụ"
              >
                <Plus className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* Tasks list */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-gray-500">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Đang tải...</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    Chưa có nhiệm vụ. Bấm [+] để thêm.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {tasks.map((task, idx) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        idx={idx}
                        processId={proc.id}
                        employees={employees}
                        onEdit={() => setEditingTask({ ...task, processId: proc.id, assignee_id: task.default_assignee_id, isNew: false })}
                        onDelete={() => handleDeleteTask(task.id, proc.id)}
                        onSaveChecklist={(check) => handleSaveChecklist(check, task.id, proc.id)}
                        onDeleteChecklist={(checkId) => handleDeleteChecklist(checkId, proc.id)}
                        loadingEmployees={loadingEmployees}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          employees={employees}
          loadingEmployees={loadingEmployees}
          onSave={handleSaveTask}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ─── TaskRow ───
function TaskRow({ task, idx, processId, employees, onEdit, onDelete, onSaveChecklist, onDeleteChecklist }) {
  const [expanded, setExpanded] = useState(false);
  const [addingCheck, setAddingCheck] = useState(false);
  const [newCheckTitle, setNewCheckTitle] = useState('');
  const checklists = task.checklists || [];

  const saveNewCheck = async () => {
    if (!newCheckTitle.trim()) return;
    await onSaveChecklist({ title: newCheckTitle.trim(), order_index: checklists.length });
    setNewCheckTitle('');
    setAddingCheck(false);
  };

  const assignee = employees.find(e => e.id === task.default_assignee_id);

  return (
    <div className="px-3 py-2 bg-white hover:bg-gray-50 transition-colors">
      {/* Task row: # | name | assignee | actions */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-gray-400 w-5 text-center shrink-0">{idx + 1}</span>
        <span className="flex-1 font-semibold text-gray-900 text-sm leading-snug">{task.title}</span>
        {assignee && (
          <span className="text-[10px] text-blue-600 font-medium shrink-0">👤 {assignee.full_name}</span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Sửa">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Xóa">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Checklists */}
      <div className="ml-7 mt-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <CheckSquare className="w-3 h-3" />
          <span>Checklist ({checklists.length})</span>
        </button>

        {expanded && (
          <div className="mt-1.5 space-y-1">
            {checklists.map((check, ci) => (
              <div key={check.id} className="flex items-center gap-2 py-1 px-2 bg-purple-50 rounded border border-purple-100">
                <span className="text-[10px] font-bold text-purple-400 w-4 text-center">{ci + 1}</span>
                <span className="flex-1 text-xs text-gray-800">{check.title}</span>
                <button
                  onClick={() => onDeleteChecklist(check.id)}
                  className="p-0.5 text-gray-400 hover:text-red-500 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add checklist */}
            {addingCheck ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCheckTitle}
                  onChange={e => setNewCheckTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveNewCheck(); if (e.key === 'Escape') { setAddingCheck(false); setNewCheckTitle(''); } }}
                  autoFocus
                  placeholder="Nhập checklist..."
                  className="flex-1 px-2 py-1 border border-purple-300 rounded text-xs focus:ring-1 focus:ring-purple-400"
                />
                <button onClick={saveNewCheck} className="p-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700">✓</button>
                <button onClick={() => { setAddingCheck(false); setNewCheckTitle(''); }} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCheck(true)}
                className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-700 pl-1"
              >
                <Plus className="w-3 h-3" /> Thêm checklist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TaskEditModal ───
function TaskEditModal({ task, employees, loadingEmployees, onSave, onCancel }) {
  const [form, setForm] = useState(task);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = employees.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.title?.trim()) { alert('Nhập tên nhiệm vụ'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{task.isNew ? '➕ Thêm Nhiệm Vụ' : '✏️ Sửa Nhiệm Vụ'}</h3>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tên nhiệm vụ *</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ví dụ: Gặp khách hàng tư vấn"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Mô tả</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Assignee selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">👤 Gán cho</label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm nhân viên..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {loadingEmployees ? (
              <div className="flex justify-center py-3"><Loader className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-44 overflow-y-auto">
                {/* No assignee option */}
                <label className={`flex items-center gap-2.5 px-3 py-2 border-b cursor-pointer hover:bg-gray-50 ${!form.assignee_id ? 'bg-gray-50' : ''}`}>
                  <input type="radio" name="assignee" checked={!form.assignee_id}
                    onChange={() => setForm({ ...form, assignee_id: null })} className="w-3.5 h-3.5" />
                  <span className="text-xs text-gray-500 italic">Không gán cụ thể</span>
                </label>

                {filtered.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-400 text-center">Không tìm thấy nhân viên</div>
                ) : filtered.map(emp => (
                  <label
                    key={emp.id}
                    className={`flex items-start gap-2.5 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 ${form.assignee_id === emp.id ? 'bg-blue-50' : ''}`}
                  >
                    <input type="radio" name="assignee" checked={form.assignee_id === emp.id}
                      onChange={() => setForm({ ...form, assignee_id: emp.id })} className="w-3.5 h-3.5 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{emp.full_name}</div>
                      <div className="text-xs text-gray-500">{emp.department?.name || emp.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {form.assignee_id && (
              <div className="mt-2 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded">
                ✓ {employees.find(e => e.id === form.assignee_id)?.full_name}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t px-5 py-3 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Hủy</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Đang lưu...' : '💾 Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Loader, Search, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

/**
 * FlowProcessTaskEditor
 * Display & manage tasks from processes/templates in flow editor
 * Allows CRUD with user assignment per flow
 */
export default function FlowProcessTaskEditor({ 
  companyUnitId, 
  divisionUnitId,
  processes = [],
  onTasksUpdate 
}) {
  const [expandedProcess, setExpandedProcess] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Load employees by company_unit_id
  useEffect(() => {
    if (companyUnitId) {
      loadEmployees();
    }
  }, [companyUnitId]);

  const loadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const { data } = await api.get(`/ecosystem/company-users/${companyUnitId}`);
      setEmployees(data.users || []);
    } catch (error) {
      console.error('Load employees error:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleEditTask = (task, processId) => {
    setEditingTask({
      ...task,
      processId,
      isNew: !task.id
    });
  };

  const handleSaveTask = async (taskData) => {
    try {
      if (taskData.id) {
        // Update existing
        await api.put(`/company-processes/tasks/${taskData.id}`, {
          title: taskData.title,
          description: taskData.description,
          assignee_id: taskData.assignee_id,
          order_index: taskData.order_index,
        });
      } else {
        // Create new
        await api.post(`/company-processes/${taskData.processId}/tasks`, {
          title: taskData.title,
          description: taskData.description,
          assignee_id: taskData.assignee_id,
          order_index: taskData.order_index,
        });
      }
      
      // Reload
      if (onTasksUpdate) onTasksUpdate();
      setEditingTask(null);
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Xóa task này?')) return;
    try {
      await api.delete(`/company-processes/tasks/${taskId}`);
      if (onTasksUpdate) onTasksUpdate();
    } catch (error) {
      alert('Lỗi: ' + error.message);
    }
  };

  if (!processes.length) {
    return (
      <div className="text-center py-6 text-gray-500">
        <p className="text-sm">Chọn quy trình để xem/quản lý nhiệm vụ</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {processes.map((proc) => (
        <div key={proc.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Process Header */}
          <button
            onClick={() => setExpandedProcess(expandedProcess === proc.id ? null : proc.id)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {expandedProcess === proc.id ? (
                <ChevronUp className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              )}
              <span className="font-semibold text-gray-900">{proc.icon} {proc.name}</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                {proc.task_count || 0} tasks
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditTask({ 
                  title: '',
                  description: '',
                  assignee_id: null,
                  order_index: (proc.tasks || []).length
                }, proc.id);
              }}
              className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
              title="Thêm task"
            >
              <Plus className="w-4 h-4" />
            </button>
          </button>

          {/* Tasks List */}
          {expandedProcess === proc.id && (
            <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-2 max-h-96 overflow-y-auto">
              {proc.tasks && proc.tasks.length > 0 ? (
                proc.tasks.map((task, idx) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg p-3 flex items-start gap-3 hover:shadow-md transition-shadow border border-gray-100"
                  >
                    {/* Task Number */}
                    <div className="text-xs font-bold text-gray-400 w-6 text-center pt-1 shrink-0">
                      {idx + 1}
                    </div>

                    {/* Task Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 break-words text-sm">
                        {task.title}
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                      )}
                      {task.assignee && (
                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          👤 {task.assignee.full_name}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditTask(task, proc.id)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
                        title="Sửa"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 py-3">Chưa có task. Bấm + để thêm.</p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          employees={employees}
          onSave={handleSaveTask}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// Task Edit Modal
function TaskEditModal({ task, employees, onSave, onCancel }) {
  const [form, setForm] = useState(task);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredEmployees = employees.filter(emp =>
    emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.title?.trim()) {
      alert('Tên task là bắt buộc');
      return;
    }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {task.isNew ? '➕ Tạo Task' : '✏️ Sửa Task'}
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên task *
            </label>
            <input
              type="text"
              value={form.title || ''}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ví dụ: Gập khách hàng"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              👤 Gán cho
            </label>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Employee List */}
            <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">
                  Không tìm thấy nhân viên
                </div>
              ) : (
                filteredEmployees.map(emp => (
                  <label
                    key={emp.id}
                    className={`flex items-start gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                      form.assignee_id === emp.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignee"
                      checked={form.assignee_id === emp.id}
                      onChange={() => setForm({ ...form, assignee_id: emp.id })}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{emp.full_name}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {emp.department?.name && `${emp.department.name} • `}
                        {emp.company?.name}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {form.assignee_id && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                ✓ Đã chọn: {employees.find(e => e.id === form.assignee_id)?.full_name}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : '💾'}
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

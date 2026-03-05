import { useState } from 'react';
import { X, Plus, Trash2, Check, Search } from 'lucide-react';

export default function TaskEditModal({ task, employees, onSave, onCancel }) {
  const [form, setForm] = useState(task);
  const [assignMode, setAssignMode] = useState(
    task.assigned_user_id ? 'specific' : 'auto'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter employees by search
  const filteredEmployees = employees.filter(emp =>
    emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    // Validation
    if (!form.title?.trim()) {
      alert('Vui lòng nhập tên task');
      return;
    }

    if (assignMode === 'auto' && !form.assignee_field) {
      alert('Vui lòng chọn vai trò');
      return;
    }

    if (assignMode === 'specific' && !form.assigned_user_id) {
      alert('Vui lòng chọn nhân viên');
      return;
    }

    setSaving(true);
    try {
      // Prepare data
      const dataToSave = {
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || null,
      };

      // Clear opposite assignment field
      if (assignMode === 'auto') {
        dataToSave.assigned_user_id = null;
        dataToSave.assigned_company_unit_id = null;
      } else {
        dataToSave.assignee_field = null;
      }

      await onSave(dataToSave);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const addChecklist = () => {
    setForm({
      ...form,
      checklists: [
        ...(form.checklists || []),
        {
          label: '',
          is_required: false,
          order_index: (form.checklists || []).length,
          assigned_user_id: form.assigned_user_id, // Inherit from task
        },
      ],
    });
  };

  const updateChecklist = (index, updates) => {
    const newChecklists = [...(form.checklists || [])];
    newChecklists[index] = { ...newChecklists[index], ...updates };
    setForm({ ...form, checklists: newChecklists });
  };

  const deleteChecklist = (index) => {
    setForm({
      ...form,
      checklists: (form.checklists || []).filter((_, i) => i !== index),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">
            {task.id ? 'Sửa Task' : 'Tạo Task Mới'}
          </h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Task Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên task <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title || ''}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Ví dụ: Khảo sát nhu cầu khách hàng"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mô tả
              </label>
              <textarea
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Mô tả chi tiết nhiệm vụ..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thời gian ước tính
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={form.estimated_days || 1}
                  onChange={e => setForm({ ...form, estimated_days: parseInt(e.target.value) || 1 })}
                  className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">ngày</span>
              </div>
            </div>
          </div>

          {/* Assignment Section */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              👤 Người thực hiện <span className="text-red-500">*</span>
            </label>

            {/* Assignment mode toggle */}
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="assignMode"
                  checked={assignMode === 'auto'}
                  onChange={() => setAssignMode('auto')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Tự động (theo vai trò)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="assignMode"
                  checked={assignMode === 'specific'}
                  onChange={() => setAssignMode('specific')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Chọn nhân viên cụ thể
                </span>
              </label>
            </div>

            {/* Auto assignment */}
            {assignMode === 'auto' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vai trò
                </label>
                <select
                  value={form.assignee_field || 'sales_person'}
                  onChange={e => setForm({ ...form, assignee_field: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sales_person">Sales / Tư vấn</option>
                  <option value="designer">Designer / Thiết kế</option>
                  <option value="production_manager">Quản lý sản xuất</option>
                  <option value="installer">Thợ lắp đặt</option>
                  <option value="project_manager">Quản lý dự án</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Dự án sẽ tự động gán cho người có vai trò này
                </p>
              </div>
            )}

            {/* Specific user assignment */}
            {assignMode === 'specific' && (
              <div>
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm nhân viên..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Employee list */}
                <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                  {filteredEmployees.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      Không tìm thấy nhân viên
                    </div>
                  ) : (
                    filteredEmployees.map(emp => (
                      <label
                        key={emp.id}
                        className={`
                          flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors
                          ${form.assigned_user_id === emp.id ? 'bg-blue-50 border-blue-200' : ''}
                        `}
                      >
                        <input
                          type="radio"
                          name="assigned_user"
                          checked={form.assigned_user_id === emp.id}
                          onChange={() => setForm({ 
                            ...form, 
                            assigned_user_id: emp.id,
                          })}
                          className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{emp.full_name}</div>
                          <div className="text-xs text-gray-600 space-y-0.5 mt-1">
                            <div>📧 {emp.email}</div>
                            {emp.phone && <div>📞 {emp.phone}</div>}
                            <div>
                              🏢 {emp.company?.name || 'N/A'} · {emp.company?.division?.name || 'N/A'}
                            </div>
                            {emp.department && <div>👔 {emp.department.name}</div>}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                {form.assigned_user_id && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    ✓ Đã chọn: {employees.find(e => e.id === form.assigned_user_id)?.full_name}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Checklists Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-gray-700">
                ✅ Checklist
              </label>
              <button
                onClick={addChecklist}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
              >
                <Plus className="w-4 h-4" />
                Thêm checklist
              </button>
            </div>

            {(!form.checklists || form.checklists.length === 0) ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-sm text-gray-500">
                  Chưa có checklist. Bấm "Thêm checklist" để tạo.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {form.checklists.map((checklist, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Check className="w-4 h-4 text-gray-400 mt-2" />
                    
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={checklist.label || ''}
                        onChange={e => updateChecklist(idx, { label: e.target.value })}
                        placeholder="Nội dung checklist..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checklist.is_required || false}
                            onChange={e => updateChecklist(idx, { is_required: e.target.checked })}
                            className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
                          />
                          Bắt buộc
                        </label>
                        
                        <select
                          value={checklist.assigned_user_id || 'same'}
                          onChange={e => updateChecklist(idx, { 
                            assigned_user_id: e.target.value === 'same' ? null : e.target.value 
                          })}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="same">Cùng người với task</option>
                          <option value="">Không gán cụ thể</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteChecklist(idx)}
                      className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>💾 Lưu</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

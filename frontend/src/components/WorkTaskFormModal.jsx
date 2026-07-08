import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { PRIORITY_LABELS } from '../lib/utils';
import {
  resolveStatusForApi,
  KANBAN_STATUS_KEY_OPTIONS,
} from '../lib/workTasksDashboardUtils';

const SOURCE_OPTIONS = [
  { value: 'crm_task', label: 'Nhiệm vụ CRM (Lead/Deal)' },
  { value: 'crm_assignment', label: 'Giao việc CRM' },
  { value: 'task', label: 'Công việc / Cá nhân' },
];

export default function WorkTaskFormModal({
  open,
  mode = 'edit',
  task = null,
  defaultStatus = 'pending',
  statusOptions = null,
  defaultLeadId = '',
  defaultAssigneeId = '',
  defaultCompanyId = '',
  leadOptions = [],
  users = [],
  onClose,
  onSave,
  onDelete,
  saving = false,
  deleting = false,
}) {
  const [source, setSource] = useState('crm_task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kanbanStatus, setKanbanStatus] = useState(defaultStatus);
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [leadId, setLeadId] = useState('');

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && task) {
      setSource(task.source || 'task');
      setTitle(task.title || '');
      setDescription(task.description || '');
      setKanbanStatus(() => {
        const st = String(task.status || 'pending').toLowerCase();
        if (st === 'completed') return 'done';
        return st;
      });
      setPriority(task.priority || 'medium');
      setDeadline(task.deadline ? String(task.deadline).slice(0, 10) : '');
      setAssigneeId(task.assignee_id ? String(task.assignee_id) : '');
      setLeadId(task.lead_id ? String(task.lead_id) : '');
    } else {
      setSource(defaultLeadId ? 'crm_task' : 'crm_assignment');
      setTitle('');
      setDescription('');
      setKanbanStatus(defaultStatus || 'pending');
      setPriority('medium');
      setDeadline('');
      setAssigneeId(defaultAssigneeId || '');
      setLeadId(defaultLeadId || '');
    }
  }, [open, mode, task, defaultStatus, defaultLeadId, defaultAssigneeId]);

  if (!open) return null;

  const isEdit = mode === 'edit' && task;
  const statusSelectOptions = (statusOptions?.length
    ? [...new Map(statusOptions.map((c) => [c.statusKey, { value: c.statusKey, label: c.label }])).values()]
    : KANBAN_STATUS_KEY_OPTIONS.map((o) => ({ value: o.value, label: o.label.split(' (')[0] }))
  );
  const statusApi = isEdit
    ? resolveStatusForApi(task, kanbanStatus)
    : resolveStatusForApi({ source: source === 'task' ? 'task' : source }, kanbanStatus);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status: statusApi,
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      assignee_id: assigneeId || null,
    };
    if (isEdit) {
      onSave?.({ mode: 'edit', task, payload: { ...payload, lead_id: task.lead_id || leadId || undefined } });
    } else {
      onSave?.({
        mode: 'create',
        payload: {
          source,
          lead_id: source === 'crm_task' ? (leadId || defaultLeadId) : undefined,
          company_id: defaultCompanyId || undefined,
          ...payload,
          due_date: payload.deadline,
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="work-task-form-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="work-task-form-title" className="text-base font-bold text-gray-900">
            {isEdit ? 'Sửa nhiệm vụ' : 'Thêm nhiệm vụ'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Loại nhiệm vụ</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && source === 'crm_task' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Lead / Deal</label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                required
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">— Chọn lead/deal —</option>
                {leadOptions.map((ld) => (
                  <option key={ld.id} value={ld.id}>
                    {ld.type === 'deal' ? '💼' : '📋'} {ld.code ? `${ld.code} — ` : ''}{ld.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400"
              placeholder="Tên nhiệm vụ…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 resize-y"
              placeholder="Ghi chú thêm…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái</label>
              <select
                value={kanbanStatus}
                onChange={(e) => setKanbanStatus(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              >
                {statusSelectOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ưu tiên</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Người thực hiện</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">— Chưa gán —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(task)}
                disabled={deleting || saving}
                className="h-9 px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? 'Đang xóa…' : 'Xóa'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || !title.trim() || (!isEdit && source === 'crm_task' && !leadId && !defaultLeadId)}
                className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Tạo'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

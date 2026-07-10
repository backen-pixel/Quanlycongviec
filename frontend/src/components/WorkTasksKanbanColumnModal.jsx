import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import {
  KANBAN_STATUS_KEY_OPTIONS,
  KANBAN_COLUMN_COLOR_PRESETS,
} from '../lib/workTasksDashboardUtils';

export default function WorkTasksKanbanColumnModal({
  open,
  mode = 'create',
  column = null,
  existingColumns = [],
  onClose,
  onSave,
  onDelete,
}) {
  const [label, setLabel] = useState('');
  const [statusKey, setStatusKey] = useState('pending');
  const [colorId, setColorId] = useState('blue');

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && column) {
      setLabel(column.label || '');
      setStatusKey(column.statusKey || 'pending');
      setColorId(column.colorId || 'blue');
    } else {
      setLabel('');
      setStatusKey('pending');
      setColorId('blue');
    }
  }, [open, mode, column]);

  if (!open) return null;

  const isEdit = mode === 'edit' && column;
  const duplicateStatus = existingColumns.some(
    (c) => c.statusKey === statusKey && c.key !== column?.key,
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    onSave?.({ label: label.trim(), statusKey, colorId });
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="kanban-column-form-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="kanban-column-form-title" className="text-base font-bold text-gray-900">
            {isEdit ? 'Sửa cột Kanban' : 'Thêm cột Kanban'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên cột *</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              autoFocus
              className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-violet-400"
              placeholder="VD: Chờ duyệt, Review…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái khi kéo thả vào cột</label>
            <select
              value={statusKey}
              onChange={(e) => setStatusKey(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm"
            >
              {KANBAN_STATUS_KEY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {duplicateStatus && (
              <p className="mt-1 text-[10px] text-amber-600">Đã có cột khác dùng trạng thái này — nhiệm vụ sẽ ưu tiên cột khớp chính xác.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Màu cột</label>
            <div className="flex flex-wrap gap-2">
              {KANBAN_COLUMN_COLOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setColorId(p.id)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                    colorId === p.id ? 'border-violet-500 ring-2 ring-violet-200 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(column)}
                className="h-9 px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa cột
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={!label.trim()}
                className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 cursor-pointer disabled:opacity-50"
              >
                {isEdit ? 'Lưu cột' : 'Thêm cột'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

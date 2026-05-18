import { useState, useEffect } from 'react';
import api from '../lib/api';
import { parseShareModules, cleanShareModulesForApi } from '../lib/documentShareScope';
import DocumentShareModulePicker from './DocumentShareModulePicker';

/**
 * Bật/tắt chia sẻ nhiệm vụ CRM hoặc đính kèm sang SX / VC / Công việc dự án.
 */
export default function CrmArtifactShareModal({
  open,
  leadId,
  taskId,
  attachmentId = null,
  title = 'Chia sẻ sang khối khác',
  initialShared = false,
  initialModules = null,
  onClose,
  onSaved,
}) {
  const [shared, setShared] = useState(!!initialShared);
  const [modules, setModules] = useState(() => parseShareModules(initialModules) || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShared(!!initialShared);
    setModules(parseShareModules(initialModules) || []);
  }, [open, initialShared, initialModules]);

  if (!open || !leadId || !taskId) return null;

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        shared_to_project: shared,
        allowed_share_modules: shared ? cleanShareModulesForApi(modules) : null,
      };
      const url = attachmentId
        ? `/crm/leads/${leadId}/tasks/${taskId}/attachments/${attachmentId}/toggle-share`
        : `/crm/leads/${leadId}/tasks/${taskId}/toggle-share`;
      const { data } = await api.put(url, body);
      onSaved?.(data);
      onClose?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu chia sẻ');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose?.()}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">
          Team CRM luôn xem đủ tại đây. Chỉ khối được chọn mới thấy trên Sản xuất, Vận chuyển & LĐ hoặc Công việc dự án.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Bật chia sẻ
        </label>
        {shared && (
          <DocumentShareModulePicker value={modules} onChange={setModules} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60" onClick={save} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

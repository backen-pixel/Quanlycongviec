import { useState, useEffect } from 'react';
import { Clock, X, AlertTriangle } from 'lucide-react';

/** Đổi Date/ISO → chuỗi cho <input type="datetime-local"> theo giờ local. */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Modal chọn/sửa deadline cho thẻ CRM.
 * - mandatory: bắt buộc chọn deadline mới (không có nút bỏ qua) — dùng khi kéo sang cột yêu cầu deadline.
 * - requireReason: bắt buộc nhập lý do — dùng khi SỬA deadline (đã có deadline cũ).
 * - allowClear: cho phép xóa deadline (đặt rỗng).
 */
export default function CrmDeadlineModal({
  open,
  title = 'Đặt deadline',
  subtitle = '',
  stageName = '',
  initialDeadline = null,
  currentDeadline = null,
  mandatory = false,
  requireReason = false,
  allowClear = false,
  submitting = false,
  onClose,
  onConfirm,
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(toLocalInput(initialDeadline));
      setReason('');
      setError('');
    }
  }, [open, initialDeadline]);

  if (!open) return null;

  const submit = () => {
    const hasValue = value && value.trim() !== '';
    if (!hasValue && !allowClear) {
      setError('Vui lòng chọn ngày giờ deadline.');
      return;
    }
    if (!hasValue && mandatory) {
      setError('Cột này bắt buộc đặt deadline.');
      return;
    }
    if (requireReason && !reason.trim()) {
      setError('Vui lòng nhập lý do thay đổi deadline.');
      return;
    }
    let deadlineIso = null;
    if (hasValue) {
      const ts = new Date(value).getTime();
      if (Number.isNaN(ts)) {
        setError('Deadline không hợp lệ.');
        return;
      }
      deadlineIso = new Date(ts).toISOString();
    }
    onConfirm?.({ deadlineIso, reason: reason.trim() });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-rose-700">
            <Clock className="h-5 w-5" />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="text-slate-400 hover:text-slate-600"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {(subtitle || stageName) && (
            <p className="text-xs text-slate-500">
              {stageName && (
                <>Chuyển sang cột <span className="font-semibold text-slate-700">{stageName}</span>. </>
              )}
              {subtitle}
            </p>
          )}

          {currentDeadline && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
              Deadline hiện tại: <span className="font-semibold">{new Date(currentDeadline).toLocaleString('vi-VN')}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Deadline {mandatory && <span className="text-rose-500">*</span>}
            </label>
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-300 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Lý do {requireReason && <span className="text-rose-500">*</span>}
              {!requireReason && <span className="text-slate-400"> (tuỳ chọn)</span>}
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(''); }}
              placeholder="VD: Khách hẹn ký hợp đồng cuối tuần…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-300 outline-none resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {mandatory ? 'Huỷ chuyển cột' : 'Huỷ'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? 'Đang lưu…' : 'Lưu deadline'}
          </button>
        </div>
      </div>
    </div>
  );
}

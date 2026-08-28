import { useState, useEffect } from 'react';
import { Clock, X, AlertTriangle } from 'lucide-react';
import { formatDate } from '../lib/utils';
import api from '../lib/api';
import {
  companyDeadlineIsoFromYmd,
  hucabiDeadlineHint,
  rememberCompanyDeadlineClock,
} from '../lib/companyDeadlineClock';

/** Đổi Date/ISO → chuỗi cho <input type="date"> theo ngày local. */
function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ngày từ input date → ISO mốc hết hạn trong ngày (HCB = 17:30 VN, mặc định cuối ngày). */
function dateInputToIso(dateStr, companyOrId) {
  if (!dateStr?.trim()) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const ymd = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return companyDeadlineIsoFromYmd(ymd, companyOrId)
    || new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * Modal chọn/sửa deadline cho thẻ CRM / xưởng — chỉ chọn ngày.
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
  companyId = null,
  onClose,
  onConfirm,
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [timeHint, setTimeHint] = useState('');

  useEffect(() => {
    if (open) {
      setValue(toDateInput(initialDeadline));
      setReason('');
      setError('');
    }
  }, [open, initialDeadline]);

  useEffect(() => {
    if (!open || !companyId) {
      setTimeHint(hucabiDeadlineHint(companyId));
      return;
    }
    let cancelled = false;
    api.get('/production/schedule-config', { params: { company_id: companyId } })
      .then((r) => {
        if (cancelled) return;
        const clock = r.data?.deadline_clock;
        if (clock) rememberCompanyDeadlineClock(companyId, clock);
        setTimeHint(hucabiDeadlineHint(companyId));
      })
      .catch(() => {
        if (!cancelled) setTimeHint(hucabiDeadlineHint(companyId));
      });
    return () => { cancelled = true; };
  }, [open, companyId]);

  if (!open) return null;

  const submit = () => {
    const hasValue = value && value.trim() !== '';
    if (!hasValue && !allowClear) {
      setError('Vui lòng chọn ngày deadline.');
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
    const deadlineIso = hasValue ? dateInputToIso(value, companyId) : null;
    if (hasValue && !deadlineIso) {
      setError('Ngày deadline không hợp lệ.');
      return;
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
              Deadline hiện tại: <span className="font-semibold">{formatDate(currentDeadline)}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Ngày deadline {mandatory && <span className="text-rose-500">*</span>}
            </label>
            <input
              type="date"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-300 outline-none"
            />
            {timeHint && (
              <p className="mt-1 text-[11px] text-slate-500">{timeHint}</p>
            )}
            {(() => {
              const iso = value ? dateInputToIso(value, companyId) : null;
              if (!iso) return null;
              const ts = new Date(iso).getTime();
              if (!Number.isFinite(ts) || ts >= Date.now()) return null;
              return (
                <p className="mt-1 text-[11px] font-medium text-rose-600">
                  Ngày này đã qua giờ hết hạn trong ngày — thẻ vẫn hiện Quá hạn. Hãy chọn ngày sau.
                </p>
              );
            })()}
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

import { useEffect, useState } from 'react';
import { UserCircle, X } from 'lucide-react';
import EmployeePicker from './EmployeePicker';
import { resolveCrmAssigneeLabel } from '../lib/crmStageAssigneeConfirm';

/**
 * Xác nhận chuyển / giữ người phụ trách khi kéo lead-deal vào cột pipeline đã cấu hình.
 */
export default function CrmStageAssigneeModal({
  open,
  onClose,
  card,
  targetStage,
  entityLabel = 'lead/deal',
  employeeList = [],
  onConfirmTransfer,
  onKeepCurrent,
  submitting = false,
}) {
  const defaultId = targetStage?.default_assignee_user_id || '';
  const [pickedUserId, setPickedUserId] = useState(defaultId);

  useEffect(() => {
    if (open && defaultId) {
      setPickedUserId(defaultId);
    }
  }, [open, defaultId]);

  if (!open || !targetStage) return null;

  const stageName = targetStage.name || 'cột mới';
  const currentId = card?.assigned_to || card?.lead_owner_id || null;
  const currentName = resolveCrmAssigneeLabel(card, currentId, employeeList);
  const pickedName = resolveCrmAssigneeLabel(null, pickedUserId, employeeList);
  const companyId = card?.company_id ? String(card.company_id) : '';

  const handleTransfer = () => {
    if (!pickedUserId) return;
    if (String(pickedUserId) === String(currentId || '')) {
      onKeepCurrent?.();
      return;
    }
    onConfirmTransfer?.(pickedUserId);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-indigo-600" />
            Chuyển người phụ trách?
          </h3>
          <button type="button" onClick={onClose} disabled={submitting} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-xs text-gray-600 leading-relaxed">
            Cột <strong className="text-gray-900">«{stageName}»</strong> đã cấu hình tự chuyển người phụ trách khi {entityLabel} vào cột này.
            Chọn nhân viên phụ trách mới hoặc giữ người đang phụ trách.
          </p>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 shrink-0">Hiện tại</span>
              <span className="font-semibold text-gray-900 text-right">{currentName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 shrink-0">Theo cấu hình cột</span>
              <span className="font-semibold text-indigo-800 text-right">
                {resolveCrmAssigneeLabel(null, defaultId, employeeList)}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Người phụ trách mới</label>
            <EmployeePicker
              companyId={companyId}
              value={pickedUserId || ''}
              onChange={setPickedUserId}
              placeholder="Chọn nhân viên phụ trách"
              displayFullName
              disabled={submitting || !companyId}
              className="w-full"
            />
            {!companyId && (
              <p className="text-[11px] text-amber-700">Không xác định được công ty — không thể chọn nhân viên.</p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy chuyển cột
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => onKeepCurrent?.()}
              className="px-4 py-2 text-sm font-semibold border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý…' : 'Giữ người phụ trách hiện tại'}
            </button>
            <button
              type="button"
              disabled={submitting || !pickedUserId}
              onClick={handleTransfer}
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý…' : `Chuyển sang ${pickedName}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

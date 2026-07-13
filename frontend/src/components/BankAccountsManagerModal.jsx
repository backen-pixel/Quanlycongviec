import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X } from 'lucide-react';
import BankAccountsManager from './BankAccountsManager';

/** Popup quản lý tài khoản NH — mở nhanh từ chi tiết deal, không rời trang. */
export default function BankAccountsManagerModal({ onClose, onChanged, initialRegionId, initialRegionName }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const modal = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10050] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-accounts-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h2 id="bank-accounts-modal-title" className="text-lg font-bold text-gray-900">Quản lý tài khoản ngân hàng</h2>
              <p className="text-xs text-gray-500">Thêm / sửa STK dùng cho các giai đoạn thanh toán chuyển khoản</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <BankAccountsManager
            onChanged={onChanged}
            initialRegionId={initialRegionId}
            initialRegionName={initialRegionName}
          />
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold cursor-pointer transition"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

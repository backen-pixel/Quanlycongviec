import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

/**
 * SaveToast — dùng khi lưu form (báo giá, đơn hàng, hóa đơn...)
 *
 * Props:
 *   status  — 'idle' | 'loading' | 'success' | 'error'
 *   message — text hiển thị (optional, có mặc định)
 *   onDone  — callback khi ẩn xong (optional)
 */
export default function SaveToast({ status, message, onDone }) {
  const [visible, setVisible] = useState(false);

  // Hiện toast khi success/error, tự ẩn sau 2.5s
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onDone?.(), 300);
      }, 2500);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [status]);

  const defaultMsg = {
    loading: 'Đang lưu...',
    success: 'Lưu thành công!',
    error: 'Có lỗi xảy ra',
  };

  const msg = message || defaultMsg[status] || '';

  return (
    <>
      {/* ── Overlay loading ── */}
      {status === 'loading' && (
        <div className="fixed inset-0 z-[9998] bg-black/30 flex items-center justify-center backdrop-blur-[1px]">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 min-w-[180px]">
            <Loader2 className="h-9 w-9 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">{msg}</p>
          </div>
        </div>
      )}

      {/* ── Toast success / error ── */}
      {(status === 'success' || status === 'error') && (
        <div
          style={{
            transform: visible ? 'translateY(0)' : 'translateY(-110%)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(.22,1,.36,1), opacity 0.3s ease',
          }}
          className={`fixed top-5 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium
            ${status === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
            }`}
        >
          {status === 'success'
            ? <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            : <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          }
          {msg}
        </div>
      )}
    </>
  );
}

import { X } from 'lucide-react';

export default function ModuleAccessDeniedModal({ moduleName, onClose }) {
  if (!moduleName) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] cursor-pointer border-0"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-access-denied-title"
        className="relative w-full max-w-[360px] rounded-2xl bg-white px-6 pt-6 pb-5 text-center shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        <img
          src="/images/module-access-denied.png"
          alt=""
          className="mx-auto h-[108px] w-auto object-contain"
          draggable={false}
        />

        <p id="module-access-denied-title" className="mt-4 text-sm leading-relaxed text-slate-800">
          Bạn không có quyền truy cập ứng dụng{' '}
          <strong className="font-bold text-slate-900">{moduleName}</strong>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Vui lòng liên hệ quản trị hệ thống để được phân quyền sử dụng
        </p>
      </div>
    </div>
  );
}

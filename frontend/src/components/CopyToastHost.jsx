import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

/** Toast nhẹ khi sao chép thành công — mount một lần trong App. */
export default function CopyToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const onCopy = (e) => {
      setToast({
        message: e.detail?.message || 'Đã sao chép',
        key: Date.now(),
      });
    };
    window.addEventListener('app:copy-toast', onCopy);
    return () => window.removeEventListener('app:copy-toast', onCopy);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="fixed top-5 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border border-emerald-200/90 bg-emerald-50 text-emerald-800 text-sm font-medium pointer-events-none transition-all duration-200"
      role="status"
      aria-live="polite"
    >
      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
      {toast.message}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import {
  startAppVersionWatcher,
  onNewAppVersion,
  forceReload,
} from '../lib/appVersionWatcher';

/**
 * Banner thông báo có phiên bản mới — luôn render trên cùng các trang đã đăng nhập.
 * Khi user bấm "Cập nhật ngay" → xoá Service Worker / Cache Storage → reload bypass cache.
 */
export default function AppVersionBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    startAppVersionWatcher();
    const off = onNewAppVersion(() => setHasUpdate(true));
    return () => { off(); };
  }, []);

  if (!hasUpdate || dismissed) return null;

  const handleUpdate = () => {
    forceReload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-2xl p-4 border border-blue-500/40">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Có phiên bản mới</p>
            <p className="text-xs text-white/85 mt-0.5">
              Bấm cập nhật để xoá cache trình duyệt và tải bản mới nhất.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleUpdate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Cập nhật ngay
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 text-xs text-white/80 hover:text-white cursor-pointer"
              >
                Để sau
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 hover:bg-white/10 rounded cursor-pointer"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import {
  startAppVersionWatcher,
  onNewAppVersion,
  forceReload,
} from '../lib/appVersionWatcher';

const AUTO_RELOAD_SEC = 10;

/**
 * Banner thông báo có phiên bản mới — luôn render trên cùng các trang đã đăng nhập.
 * Tự cập nhật sau 10s, hoặc bấm «Chạy liền» để xoá cache / reload ngay.
 */
export default function AppVersionBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RELOAD_SEC);
  const [reloading, setReloading] = useState(false);
  const timerRef = useRef(null);

  const clearCountdown = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleUpdate = useCallback(() => {
    clearCountdown();
    setReloading(true);
    forceReload();
  }, [clearCountdown]);

  const handleDismiss = useCallback(() => {
    clearCountdown();
    setDismissed(true);
  }, [clearCountdown]);

  useEffect(() => {
    startAppVersionWatcher();
    const off = onNewAppVersion(() => setHasUpdate(true));
    return () => { off(); };
  }, []);

  useEffect(() => {
    if (!hasUpdate || dismissed) return undefined;
    setSecondsLeft(AUTO_RELOAD_SEC);
    clearCountdown();
    let left = AUTO_RELOAD_SEC;
    timerRef.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearCountdown();
        setSecondsLeft(0);
        setReloading(true);
        forceReload();
        return;
      }
      setSecondsLeft(left);
    }, 1000);
    return () => clearCountdown();
  }, [hasUpdate, dismissed, clearCountdown]);

  if (!hasUpdate || dismissed) return null;

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
              {reloading
                ? 'Đang xoá cache và tải bản mới…'
                : `Tự cập nhật sau ${secondsLeft}s — xoá cache trình duyệt và tải bản mới nhất.`}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={handleUpdate}
                disabled={reloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 cursor-pointer transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reloading ? 'animate-spin' : ''}`} />
                {reloading ? 'Đang cập nhật…' : 'Chạy liền'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={reloading}
                className="px-3 py-1.5 text-xs text-white/80 hover:text-white cursor-pointer disabled:opacity-50"
              >
                Để sau
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={reloading}
            className="shrink-0 p-1 hover:bg-white/10 rounded cursor-pointer disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!reloading && (
          <div className="mt-3 h-1 rounded-full bg-white/20 overflow-hidden" aria-hidden>
            <div
              className="h-full bg-white/90 transition-[width] duration-1000 ease-linear"
              style={{ width: `${((AUTO_RELOAD_SEC - secondsLeft) / AUTO_RELOAD_SEC) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

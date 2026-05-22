import { useCallback, useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import {
  getGeolocationPermissionState,
  requestBrowserGeolocation,
  sendDevicePing,
} from '../lib/deviceHeartbeat';

const ASKED_KEY = 'crm_geo_permission_asked_v1';
const ASKED_TTL_MS = 24 * 60 * 60 * 1000;

function shouldShowBanner() {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    if (!raw) return true;
    const at = Number(JSON.parse(raw)?.at);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > ASKED_TTL_MS;
  } catch {
    return true;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export default function GeoConsentBanner({ enabled }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!enabled || !shouldShowBanner()) {
      setVisible(false);
      return;
    }
    const state = await getGeolocationPermissionState();
    if (state === 'granted' || state === 'denied') {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [enabled]);

  useEffect(() => {
    void check();
  }, [check]);

  const dismiss = () => {
    markAsked();
    setVisible(false);
  };

  const allow = async () => {
    setBusy(true);
    markAsked();
    try {
      await requestBrowserGeolocation();
      await sendDevicePing({ isLogin: true, forceGeo: true });
    } catch {
      /* user từ chối hoặc lỗi — không chặn app */
    }
    setVisible(false);
    setBusy(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-lg rounded-xl border border-sky-200 bg-white p-4 shadow-lg sm:left-auto sm:right-6"
    >
      <div className="flex items-start gap-3">
        <MapPin className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Cho phép định vị</p>
          <p className="text-xs text-slate-600 mt-1">
            Công ty dùng vị trí khi bạn đăng nhập để quản lý nhân sự trên bản đồ. Bạn có thể từ chối — app vẫn dùng bình thường.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void allow()}
              className="h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
            >
              {busy ? 'Đang xử lý…' : 'Cho phép'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Để sau
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-slate-400 hover:text-slate-600"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

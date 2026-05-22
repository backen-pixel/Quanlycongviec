import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import api from '../lib/api';
import {
  getGeolocationPermissionState,
  sendDevicePing,
} from '../lib/deviceHeartbeat';

const PERM_LABELS = {
  granted: { text: 'Đã cho phép', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  denied: { text: 'Đã từ chối', className: 'text-amber-800 bg-amber-50 border-amber-200' },
  prompt: { text: 'Chưa hỏi / cần cho phép', className: 'text-sky-800 bg-sky-50 border-sky-200' },
  unknown: { text: 'Không xác định', className: 'text-slate-600 bg-slate-50 border-slate-200' },
};

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return '—';
  }
}

export default function LocationSettingsPage() {
  const [perm, setPerm] = useState('unknown');
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getGeolocationPermissionState();
      setPerm(p);
      const { data } = await api.get('/users/me/location');
      setLocation(data?.location || null);
    } catch {
      setLocation(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateNow = async () => {
    setUpdating(true);
    setMessage('');
    try {
      try { window.localStorage.removeItem('crm_geo_cache_v1'); } catch { /* ignore */ }
      await sendDevicePing({ isLogin: true, forceGeo: true });
      const p = await getGeolocationPermissionState();
      setPerm(p);
      const { data } = await api.get('/users/me/location');
      setLocation(data?.location || null);
      setMessage(data?.location ? 'Đã cập nhật vị trí.' : 'Chưa ghi nhận được vị trí — kiểm tra quyền định vị trình duyệt.');
    } catch (e) {
      setMessage(e?.message || 'Không cập nhật được vị trí');
    }
    setUpdating(false);
  };

  const resetLocation = async () => {
    if (!window.confirm('Xóa vị trí hiện tại đã ghi nhận? Lần ping kế tiếp sẽ ghi vị trí mới.')) return;
    setUpdating(true);
    setMessage('');
    try {
      try { window.localStorage.removeItem('crm_geo_cache_v1'); } catch { /* ignore */ }
      await api.delete('/users/me/location');
      setLocation(null);
      setMessage('Đã xóa vị trí cũ. Nhấn «Cập nhật ngay» để ghi vị trí mới.');
    } catch (e) {
      setMessage(e?.response?.data?.error || e?.message || 'Không xóa được vị trí');
    }
    setUpdating(false);
  };

  const permMeta = PERM_LABELS[perm] || PERM_LABELS.unknown;
  const mapHref =
    location?.lat != null && location?.lng != null
      ? `https://www.google.com/maps?q=${location.lat},${location.lng}`
      : null;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-sky-600" /> Vị trí làm việc
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Hệ thống tự ghi nhận vị trí khi bạn đăng nhập (web/mobile) để quản lý trên bản đồ. Không lưu lịch sử di chuyển.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quyền định vị</p>
          <span className={`inline-flex mt-1 px-2 py-1 rounded-lg border text-xs font-semibold ${permMeta.className}`}>
            {permMeta.text}
          </span>
          {perm === 'denied' && (
            <p className="text-xs text-amber-800 mt-2">
              Bạn đã từ chối. Mở cài đặt trình duyệt → Quyền riêng tư → Vị trí → cho phép cho site này, rồi nhấn «Cập nhật ngay».
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vị trí đã ghi nhận</p>
            {location ? (
              <div className="mt-2 text-sm text-gray-800 space-y-1">
                <p>{location.address || `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`}</p>
                <p className="text-xs text-gray-500">
                  Cập nhật: {formatTime(location.captured_at || location.updated_at)}
                  {location.source ? ` · ${location.source}` : ''}
                </p>
                {mapHref && (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline mt-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Mở Google Maps
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Chưa có vị trí trên hệ thống.</p>
            )}
          </div>
        )}

        {message && <p className="text-sm text-gray-700">{message}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={updating || loading}
            onClick={() => void updateNow()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
            Cập nhật ngay
          </button>
          <button
            type="button"
            disabled={updating || loading || !location}
            onClick={() => void resetLocation()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-rose-200 bg-white text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            title="Xóa vị trí đã ghi nhận khi nó sai. Lần ping kế tiếp sẽ ghi vị trí mới."
          >
            <Trash2 className="h-4 w-4" />
            Xóa vị trí cũ
          </button>
        </div>
        <p className="text-[11px] text-gray-500 -mt-1">
          Vị trí sai thường do trình duyệt dùng IP/Wi-Fi để định vị (đặc biệt nếu đang bật VPN). Tắt VPN, cho phép GPS chính xác, rồi bấm «Xóa vị trí cũ» → «Cập nhật ngay».
        </p>
      </div>
    </div>
  );
}

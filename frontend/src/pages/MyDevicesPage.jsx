import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, Monitor, Laptop, LogOut, RefreshCw, ShieldCheck, QrCode } from 'lucide-react';
import api from '../lib/api';
import { getOrCreateDeviceId } from '../lib/deviceHeartbeat';

const ONLINE_WINDOW_MS = 90 * 1000;

function platformIcon(platform) {
  if (platform === 'android' || platform === 'ios') return Smartphone;
  if (platform === 'desktop') return Laptop;
  return Monitor;
}

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 60_000) return 'vừa xong';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleString('vi-VN');
}

export default function MyDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const currentDeviceId = getOrCreateDeviceId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/devices/me');
      setDevices(Array.isArray(data?.devices) ? data.devices : []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 503) {
        setError('Chưa chạy migration database/205_user_devices.sql trên Supabase.');
      } else {
        setError(err?.response?.data?.error || 'Không tải được danh sách thiết bị');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const revoke = async (device) => {
    if (!device?.id) return;
    if (!window.confirm(`Đăng xuất "${device.device_name || device.platform}" khỏi tài khoản?`)) return;
    setRevoking(device.id);
    try {
      await api.delete(`/devices/${device.id}`);
      setDevices((list) => list.filter((d) => d.id !== device.id));
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Không gỡ được thiết bị');
    } finally {
      setRevoking(null);
    }
  };

  const onlineCount = devices.filter((d) => {
    if (!d.last_ping_at) return false;
    return Date.now() - new Date(d.last_ping_at).getTime() < ONLINE_WINDOW_MS;
  }).length;

  const sendTestPush = async (kind) => {
    try {
      await api.post('/devices/test-push', { kind });
      window.alert(
        'Đã gửi push thử. Trên điện thoại đã đăng nhập, khóa màn hình hoặc đặt app ở nền để thấy push tới.',
      );
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Không gửi được push thử');
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          Thiết bị đang đăng nhập
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Tài khoản bạn đang hoạt động trên {onlineCount} thiết bị (ping mỗi 60 giây). Có thể đăng xuất từ xa nếu nghi ngờ.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/settings/qr-scan"
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-md"
          >
            <QrCode className="h-3.5 w-3.5" />
            Mã QR đăng nhập app
          </Link>
          <button
            type="button"
            onClick={() => sendTestPush('chat')}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md cursor-pointer"
          >
            Gửi push thử (Chat)
          </button>
          <button
            type="button"
            onClick={() => sendTestPush('deal')}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md cursor-pointer"
          >
            Gửi push thử (Deal mới)
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Thiết bị này: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{currentDeviceId.slice(0, 14)}…</code>
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="space-y-3">
        {devices.length === 0 && !loading && !error ? (
          <div className="text-sm text-gray-500 italic bg-white border border-gray-200 rounded-xl p-6 text-center">
            Chưa có thiết bị nào ghi nhận.
          </div>
        ) : null}

        {devices.map((d) => {
          const Icon = platformIcon(d.platform);
          const isCurrent = d.device_id === currentDeviceId;
          return (
            <div
              key={d.id}
              className={`bg-white rounded-xl border p-4 flex items-start gap-4 shadow-sm ${
                isCurrent ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200'
              }`}
            >
              <div className={`p-2 rounded-lg ${d.online ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 truncate">
                    {d.device_name || `${d.platform} · ${d.os_name || ''}`}
                  </span>
                  {d.online ? (
                    <span className="text-[11px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Đang online
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      Offline
                    </span>
                  )}
                  {isCurrent ? (
                    <span className="text-[11px] font-bold uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Thiết bị này
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{d.platform}{d.os_version ? ` · ${d.os_version}` : ''}</span>
                  {d.app_version ? <span>App v{d.app_version}</span> : null}
                  {d.ip ? <span>IP: {d.ip}</span> : null}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Hoạt động gần nhất: {relativeTime(d.last_ping_at)} · Đăng nhập: {relativeTime(d.last_login_at)}
                </div>
              </div>
              {!isCurrent ? (
                <button
                  type="button"
                  onClick={() => revoke(d)}
                  disabled={revoking === d.id}
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {revoking === d.id ? 'Đang gỡ…' : 'Đăng xuất'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

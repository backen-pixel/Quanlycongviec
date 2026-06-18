import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';
import api from '../../lib/api';

const POLL_MS = 2000;

function deviceLabel(d) {
  if (!d?.device_name) return 'Thiết bị';
  return d.device_name;
}

/**
 * Web đã đăng nhập — hiển thị QR để app quét (đăng nhập app bằng tài khoản web).
 */
export default function QrLoginInvitePanel({ onError }) {
  const [sessionId, setSessionId] = useState(null);
  const [qrText, setQrText] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [status, setStatus] = useState('loading');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loginDevice, setLoginDevice] = useState(null);

  const createInvite = useCallback(async () => {
    setStatus('loading');
    setLoginDevice(null);
    try {
      const { data } = await api.post('/auth/qr/create-invite', { target: 'app' });
      setSessionId(data.sessionId);
      setQrText(data.qrText);
      setExpiresAt(data.expiresAt);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      onError?.(e?.response?.data?.error || 'Không tạo được mã QR');
    }
  }, [onError]);

  useEffect(() => {
    void createInvite();
  }, [createInvite]);

  useEffect(() => {
    if (!expiresAt || status === 'loading' || status === 'consumed') return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setStatus('expired');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, status]);

  useEffect(() => {
    if (!sessionId || status !== 'ready') return undefined;
    const poll = async () => {
      try {
        const { data } = await api.get(`/auth/qr/${sessionId}/info`);
        if (data.status === 'consumed' && data.consumerDevice) {
          setLoginDevice(data.consumerDevice);
          setStatus('consumed');
        }
      } catch {
        /* giữ poll */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [sessionId, status]);

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm text-slate-600 mb-4 max-w-sm">
        Trên app: màn <strong>Đăng nhập</strong> → tab <strong>QR</strong> → quét mã bên dưới.
      </p>

      <div
        className="relative rounded-2xl p-4 bg-white border shadow-sm"
        style={{ borderColor: '#e3d8c5' }}
      >
        {status === 'loading' && (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}
        {status === 'ready' && qrText && (
          <QRCodeSVG value={qrText} size={200} level="M" includeMargin />
        )}
        {status === 'consumed' && (
          <div className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 text-emerald-600 text-sm px-3">
            <Smartphone className="h-10 w-10" />
            <span className="font-semibold">{deviceLabel(loginDevice)}</span>
            <span>đã đăng nhập</span>
          </div>
        )}
        {status === 'expired' && (
          <div className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
            <span>Mã QR đã hết hạn</span>
          </div>
        )}
      </div>

      {status === 'ready' && (
        <p className="mt-3 text-xs text-slate-500">Chờ app quét… ({secondsLeft}s)</p>
      )}
      {status === 'consumed' && (
        <p className="mt-3 text-sm font-medium text-emerald-600">
          Thiết bị mới đã vào tài khoản. Xem tại Cài đặt → Thiết bị.
        </p>
      )}

      {(status === 'expired' || status === 'error') && (
        <button
          type="button"
          onClick={() => void createInvite()}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition hover:bg-white"
          style={{ borderColor: '#ea5a23', color: '#ea5a23' }}
        >
          <RefreshCw className="h-4 w-4" />
          Tạo mã mới
        </button>
      )}
    </div>
  );
}

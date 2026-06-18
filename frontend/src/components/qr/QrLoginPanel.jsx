import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '../../lib/api';

const POLL_MS = 2000;

/**
 * Hiển thị QR để thiết bị đã đăng nhập quét xác nhận.
 * @param {'web'|'app'} target — thiết bị hiện tại cần đăng nhập
 */
export default function QrLoginPanel({ target = 'web', onSuccess, onError }) {
  const [sessionId, setSessionId] = useState(null);
  const [qrText, setQrText] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [status, setStatus] = useState('loading');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef(null);
  const doneRef = useRef(false);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const createSession = useCallback(async () => {
    clearPoll();
    doneRef.current = false;
    setStatus('loading');
    try {
      const { data } = await api.post('/auth/qr/create', { target });
      setSessionId(data.sessionId);
      setQrText(data.qrText);
      setExpiresAt(data.expiresAt);
      setStatus('pending');
    } catch (e) {
      setStatus('error');
      onError?.(e?.response?.data?.error || 'Không tạo được mã QR');
    }
  }, [target, onError]);

  useEffect(() => {
    void createSession();
    return () => clearPoll();
  }, [createSession]);

  useEffect(() => {
    if (!expiresAt || status !== 'pending') return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setStatus('expired');
        clearPoll();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, status]);

  useEffect(() => {
    if (!sessionId || status !== 'pending') return undefined;
    const poll = async () => {
      if (doneRef.current) return;
      try {
        const { data } = await api.get(`/auth/qr/${sessionId}/status`);
        if (data.status === 'confirmed' && data.token) {
          doneRef.current = true;
          clearPoll();
          setStatus('confirmed');
          onSuccess?.({
            token: data.token,
            user: data.user,
            session_id: data.session_id,
          });
        } else if (data.status === 'expired') {
          setStatus('expired');
          clearPoll();
        }
      } catch {
        /* giữ poll */
      }
    };
    void poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearPoll();
  }, [sessionId, status, onSuccess]);

  const hint = target === 'web'
    ? 'Mở app CRM Mobile (đã đăng nhập) → Menu → Quét QR web'
    : 'Trên web đã đăng nhập: Cài đặt → Thiết bị → Quét QR app';

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm text-slate-600 mb-4 max-w-xs">{hint}</p>

      <div
        className="relative rounded-2xl p-4 bg-white border shadow-sm"
        style={{ borderColor: '#e3d8c5' }}
      >
        {status === 'loading' && (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}
        {status !== 'loading' && qrText && status !== 'expired' && (
          <QRCodeSVG value={qrText} size={200} level="M" includeMargin />
        )}
        {status === 'expired' && (
          <div className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
            <span>Mã QR đã hết hạn</span>
          </div>
        )}
      </div>

      {status === 'pending' && (
        <p className="mt-3 text-xs text-slate-500">
          Chờ xác nhận… ({secondsLeft}s)
        </p>
      )}
      {status === 'confirmed' && (
        <p className="mt-3 text-sm font-medium" style={{ color: '#16a34a' }}>
          Đăng nhập thành công!
        </p>
      )}

      {(status === 'expired' || status === 'error') && (
        <button
          type="button"
          onClick={() => void createSession()}
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../lib/api';

const SCANNER_ID = 'qr-login-scanner';

function parseQrPayload(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(String(raw).trim());
    if (obj?.t !== 'crm-qr-login' || !obj?.id) return null;
    return obj;
  } catch {
    return null;
  }
}

export default function QrScanPage() {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const busyRef = useRef(false);
  const [phase, setPhase] = useState('scanning');
  const [message, setMessage] = useState('');
  const [targetLabel, setTargetLabel] = useState('');

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      await s.stop();
    } catch { /* noop */ }
    try {
      s.clear();
    } catch { /* noop */ }
  }, []);

  const confirmQr = useCallback(async (qrText) => {
    if (busyRef.current) return;
    const parsed = parseQrPayload(qrText);
    if (!parsed) {
      setMessage('Mã QR không hợp lệ. Quét mã đăng nhập CRM.');
      return;
    }
    busyRef.current = true;
    setPhase('confirming');
    setTargetLabel(parsed.target === 'app' ? 'ứng dụng mobile' : 'trình duyệt web');
    await stopScanner();
    try {
      await api.post('/auth/qr/confirm', { sessionId: parsed.id, qrText });
      setPhase('done');
      setMessage(`Đã xác nhận đăng nhập ${parsed.target === 'app' ? 'app' : 'web'}.`);
    } catch (e) {
      busyRef.current = false;
      setPhase('error');
      setMessage(e?.response?.data?.error || 'Không xác nhận được mã QR');
    }
  }, [stopScanner]);

  useEffect(() => {
    let cancelled = false;
    const html5 = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = html5;

    (async () => {
      try {
        await html5.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            if (cancelled || busyRef.current) return;
            void confirmQr(decoded);
          },
          () => {},
        );
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          setMessage('Không mở được camera. Cho phép quyền camera trên trình duyệt.');
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [confirmQr, stopScanner]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5ede2' }}>
      <header className="flex items-center gap-3 px-4 py-4 border-b bg-white/80 backdrop-blur"
              style={{ borderColor: '#e3d8c5' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#0d1726' }}>Quét QR đăng nhập</h1>
          <p className="text-xs text-slate-500">Xác nhận đăng nhập thiết bị khác bằng tài khoản của bạn</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {phase === 'scanning' && (
          <>
            <div id={SCANNER_ID} className="w-full max-w-md rounded-2xl overflow-hidden border bg-black"
                 style={{ borderColor: '#e3d8c5', minHeight: 320 }} />
            <p className="mt-4 text-sm text-slate-600 text-center max-w-sm">
              Hướng camera vào mã QR trên màn hình đăng nhập app hoặc web.
            </p>
          </>
        )}

        {phase === 'confirming' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#ea5a23' }} />
            <p className="text-slate-700">Đang xác nhận đăng nhập {targetLabel}…</p>
          </div>
        )}

        {(phase === 'done' || phase === 'error') && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            {phase === 'done' ? (
              <CheckCircle2 className="h-14 w-14" style={{ color: '#16a34a' }} />
            ) : null}
            <p className="text-slate-700">{message}</p>
            <div className="flex gap-3">
              {phase === 'error' && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-xl text-sm font-medium border"
                  style={{ borderColor: '#ea5a23', color: '#ea5a23' }}
                >
                  Thử lại
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/settings/devices')}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #f17a3a, #ea5a23)' }}
              >
                Về thiết bị
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

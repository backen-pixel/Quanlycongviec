import { useState, useEffect, useRef } from 'react';
import { ArrowRightLeft, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

const SUCCESS_PAUSE_MS = 2500;

function StepRow({ step }) {
  if (!step) return null;
  return (
    <div className="flex items-start gap-2 text-sm py-1.5">
      {step.ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      )}
      <div>
        <div className="font-medium text-slate-800">{step.label}</div>
        {step.detail?.error && (
          <div className="text-xs text-red-600">{step.detail.error}</div>
        )}
        {step.id === 'drift_before' && step.detail?.rows && !step.ok && (
          <div className="text-xs text-slate-500 mt-0.5">Có chênh lệch — sẽ sync log rồi kiểm tra lại</div>
        )}
        {step.id === 'drift_after' && step.detail?.rows && !step.ok && (
          <div className="text-xs text-red-600 mt-0.5">Vẫn lệch sau sync — cần «Chạy đồng bộ ngay»</div>
        )}
        {step.id === 'sync' && step.detail?.remaining > 0 && (
          <div className="text-xs text-amber-700">Queue còn {step.detail.remaining} job</div>
        )}
        {step.id === 'verify_final' && step.ok && (
          <div className="text-xs text-emerald-700 mt-0.5">Drift + log queue đều OK</div>
        )}
      </div>
    </div>
  );
}

export default function SupabaseSwitchPanel({ activeTarget, onSwitched }) {
  const [phase, setPhase] = useState('idle');
  const [target, setTarget] = useState(null);
  const [steps, setSteps] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [prepareToken, setPrepareToken] = useState(null);
  const [switchToken, setSwitchToken] = useState(null);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const tickRef = useRef(null);
  const pauseRef = useRef(null);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (pauseRef.current) clearTimeout(pauseRef.current);
  }, []);

  const nextTarget = activeTarget === 'backup' ? 'primary' : 'backup';
  const nextLabel = nextTarget === 'primary' ? 'Primary (Chính)' : 'Backup (Dự phòng)';
  const currentLabel = activeTarget === 'backup' ? 'Backup (Dự phòng)' : 'Primary (Chính)';

  const beginCountdown = async (token) => {
    try {
      const { data } = await api.post('/production/backup-sync/switch/start-countdown', {
        prepare_token: token,
      });
      setSwitchToken(data.token);
      setCountdown(data.countdown_sec || 15);
      setPhase('countdown');

      const switchAt = new Date(data.switch_at).getTime();
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        const rem = Math.max(0, Math.ceil((switchAt - Date.now()) / 1000));
        setCountdown(rem);
        if (rem <= 0) {
          clearInterval(tickRef.current);
          tickRef.current = null;
          setPhase('done');
          onSwitched?.();
        }
      }, 250);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase('idle');
    }
  };

  const startPrepare = async () => {
    if (!window.confirm(`Chuẩn bị chuyển từ ${currentLabel} sang ${nextLabel}?\n\nHệ thống kiểm tra và đồng bộ 100% trước — chỉ khi OK mới đếm ngược 15 giây.`)) {
      return;
    }
    setError('');
    setIssues([]);
    setPhase('preparing');
    setTarget(nextTarget);
    try {
      const { data } = await api.post('/production/backup-sync/switch/prepare', { target: nextTarget });
      setSteps(data?.steps || []);

      if (!data?.ok || !data?.sync_verified_100) {
        setIssues(data?.issues || []);
        setError(data?.error || 'Chưa đồng bộ 100% — không thể chuyển');
        setPhase('idle');
        return;
      }

      setPrepareToken(data.prepare_token);
      setPhase('verified');

      pauseRef.current = setTimeout(() => {
        void beginCountdown(data.prepare_token);
      }, SUCCESS_PAUSE_MS);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSteps(e.response?.data?.steps || []);
      setIssues(e.response?.data?.issues || []);
      setPhase('idle');
    }
  };

  const cancelSwitch = async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (pauseRef.current) {
      clearTimeout(pauseRef.current);
      pauseRef.current = null;
    }
    try {
      await api.post('/production/backup-sync/switch/cancel', { token: switchToken });
    } catch { /* ignore */ }
    setPhase('idle');
    setPrepareToken(null);
    setSwitchToken(null);
    setSteps([]);
    setCountdown(0);
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-700" />
            Chuyển đổi database
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Đang dùng: <strong>{currentLabel}</strong>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm tra → sync log → xác nhận 100% → thông báo → đếm ngược 15s → chuyển
          </p>
        </div>
        {phase === 'idle' && (
          <button
            type="button"
            onClick={startPrepare}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Chuyển sang {nextLabel}
          </button>
        )}
        {(phase === 'preparing' || phase === 'verified' || phase === 'countdown') && (
          <button
            type="button"
            onClick={cancelSwitch}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
          >
            <X className="w-4 h-4" />
            Hủy
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {issues.length > 0 && phase === 'idle' && (
        <ul className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1">
          {issues.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      )}

      {phase === 'preparing' && (
        <div className="flex items-center gap-2 text-indigo-800 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Đang kiểm tra drift và đồng bộ log…
        </div>
      )}

      {steps.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      )}

      {phase === 'verified' && (
        <div className="text-center py-5 bg-emerald-50 rounded-lg border-2 border-emerald-400">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
          <div className="text-lg font-bold text-emerald-900">Đã đồng bộ dữ liệu thành công 100%</div>
          <p className="text-sm text-emerald-800 mt-2">Bắt đầu đếm ngược 15 giây cho toàn hệ thống…</p>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="text-center py-4 bg-white rounded-lg border-2 border-indigo-300">
          <div className="text-xs text-emerald-600 font-medium mb-1">✓ Đồng bộ 100%</div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Đếm ngược chuyển đổi</div>
          <div className="text-5xl font-bold text-indigo-700 tabular-nums">{countdown}</div>
          <p className="text-sm text-slate-600 mt-2">
            Toàn bộ user thấy banner cảnh báo · chuyển sang {nextLabel}
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
          <CheckCircle2 className="w-5 h-5" />
          Đã chuyển sang {target === 'primary' ? 'Primary' : 'Backup'} — làm mới trang giám sát.
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRightLeft, Loader2, X, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { countdownStateFromPayload } from '../lib/supabaseSwitchCountdown';
import { startSupabaseSync } from '../lib/supabaseSyncStore';
import { formatSwitchRoute, formatTargetLabel } from '../lib/supabaseSwitchLabels';

const PREPARE_TIMEOUT_MS = 30 * 60 * 1000;
const QUICK_COUNTDOWN_SEC = 5;

function StepRow({ step }) {
  if (!step) return null;
  const running = step.detail?.running && !step.ok;
  return (
    <div className="flex items-start gap-2 text-sm py-1.5">
      {running ? (
        <Loader2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-spin" />
      ) : step.ok ? (
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
          <div className="text-xs text-slate-500 mt-0.5">DB lệch — sẽ tự đồng bộ DB và/hoặc bucket</div>
        )}
        {(step.id === 'storage_before' || step.id === 'storage_after' || step.id === 'storage_after_full') && step.detail?.rows && !step.ok && (
          <div className="text-xs text-slate-500 mt-0.5">
            {step.detail.rows.filter((r) => !r.ok).map((r) => (
              <span key={r.bucket} className="block">{r.bucket}: thiếu {r.missing_on_dest}/{r.source_count} file</span>
            ))}
          </div>
        )}
        {step.id === 'full_sync' && running && (
          <div className="text-xs text-indigo-700 mt-0.5">Đang chạy — xem log bên dưới / bong bóng góc màn hình</div>
        )}
        {step.id === 'full_sync' && step.detail?.completed && (
          <div className="text-xs text-emerald-700 mt-0.5">Hoàn tất đồng bộ lớn</div>
        )}
        {step.id === 'sync' && step.detail?.remaining > 0 && (
          <div className="text-xs text-amber-700">Queue còn {step.detail.remaining} job</div>
        )}
        {step.id === 'verify_final' && step.ok && (
          <div className="text-xs text-emerald-700 mt-0.5">DB + bucket Storage + log queue đều OK</div>
        )}
      </div>
    </div>
  );
}

export default function SupabaseSwitchPanel({ activeTarget, onSwitched }) {
  const [phase, setPhase] = useState('idle');
  const [target, setTarget] = useState(null);
  const [steps, setSteps] = useState([]);
  const [syncLog, setSyncLog] = useState([]);
  const [fullSyncMessage, setFullSyncMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [prepareToken, setPrepareToken] = useState(null);
  const [switchToken, setSwitchToken] = useState(null);
  const [quickSwitch, setQuickSwitch] = useState(false);
  const [postSyncRunning, setPostSyncRunning] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const tickRef = useRef(null);
  const logEndRef = useRef(null);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startCountdownTick = useCallback((switchAt, token) => {
    if (token) setSwitchToken(token);
    clearTick();
    const tick = () => {
      const rem = Math.max(0, Math.ceil((switchAt - Date.now()) / 1000));
      setCountdown(rem);
      if (rem <= 0) {
        clearTick();
        setPhase('done');
        onSwitched?.();
      }
    };
    tick();
    tickRef.current = setInterval(tick, 250);
  }, [clearTick, onSwitched]);

  const enterCountdownPhase = useCallback((payload, isQuick = false) => {
    const state = countdownStateFromPayload(payload);
    if (!state) return;
    setTarget(payload.target);
    setQuickSwitch(isQuick || payload.quick_switch || payload.sync_after === true);
    setPhase('countdown');
    setCountdown(state.remaining);
    startCountdownTick(state.switchAt, payload.token);
  }, [startCountdownTick]);

  useEffect(() => () => clearTick(), [clearTick]);

  useEffect(() => {
    if (phase === 'preparing' || phase === 'full_sync') {
      setPhase((p) => (p === 'preparing' ? 'full_sync' : p));
    }
  }, [syncLog.length]);

  useEffect(() => {
    if (phase !== 'full_sync') return undefined;
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [syncLog, phase]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!socket) return undefined;

    const onStart = (payload) => {
      if (payload?.post_sync) {
        setPostSyncRunning(true);
        startSupabaseSync({
          type: 'switch',
          title: 'Đồng bộ sau chuyển database',
          message: payload?.message || 'Đang đồng bộ nền…',
          direction: payload?.direction,
          from: payload?.from,
          target: payload?.target,
          phase: 'full_sync',
          at: payload?.at,
        });
        return;
      }
      setPhase('full_sync');
      setTarget(payload?.target || null);
      setFullSyncMessage(payload?.message || 'Đang đồng bộ dữ liệu…');
      setSyncLog([]);
    };

    const onProgress = (payload) => {
      if (!payload?.line) return;
      if (payload?.post_sync) {
        setPostSyncRunning(true);
        return;
      }
      setPhase('full_sync');
      setSyncLog((prev) => [
        ...prev.slice(-99),
        { at: payload.at || new Date().toISOString(), line: payload.line },
      ]);
    };

    const onDone = (payload) => {
      if (payload?.post_sync) {
        setPostSyncRunning(false);
        return;
      }
      setFullSyncMessage('Đang kiểm tra lại sau đồng bộ…');
    };

    const onCountdown = (payload) => {
      enterCountdownPhase(payload, payload?.quick_switch || payload?.sync_after);
    };

    const onSyncReady = () => {
      setPhase((p) => (p === 'full_sync' || p === 'preparing' ? 'verified' : p));
    };

    socket.on('supabase:switch-full-sync-start', onStart);
    socket.on('supabase:switch-full-sync-progress', onProgress);
    socket.on('supabase:switch-full-sync-done', onDone);
    socket.on('supabase:switch-countdown', onCountdown);
    socket.on('supabase:switch-sync-ready', onSyncReady);
    socket.on('supabase:switch-done', (payload) => {
      clearTick();
      setPhase('done');
      if (payload?.sync_after) setPostSyncRunning(true);
      onSwitched?.();
    });
    socket.on('supabase:switch-cancelled', () => {
      clearTick();
      setPhase('idle');
      setQuickSwitch(false);
      setPostSyncRunning(false);
    });

    return () => {
      socket.off('supabase:switch-full-sync-start', onStart);
      socket.off('supabase:switch-full-sync-progress', onProgress);
      socket.off('supabase:switch-full-sync-done', onDone);
      socket.off('supabase:switch-countdown', onCountdown);
      socket.off('supabase:switch-sync-ready', onSyncReady);
    };
  }, [enterCountdownPhase, clearTick, onSwitched]);

  const nextTarget = activeTarget === 'backup' ? 'primary' : 'backup';
  const switchRoute = formatSwitchRoute(activeTarget, nextTarget);

  const beginCountdown = async (token) => {
    const pt = token || prepareToken;
    if (!pt) {
      setError('Thiếu token chuẩn bị — kiểm tra lại từ đầu');
      return;
    }
    setError('');
    try {
      const { data } = await api.post('/production/backup-sync/switch/start-countdown', {
        prepare_token: pt,
      });
      enterCountdownPhase(data, false);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase('verified');
    }
  };

  const startQuickSwitch = async (toTarget) => {
    const route = formatSwitchRoute(activeTarget, toTarget);
    if (!window.confirm(
      `Chuyển ${route} sau ${QUICK_COUNTDOWN_SEC} giây?\n\n`
      + 'Không đồng bộ trước — hệ thống replay log thay đổi (DB + Storage) sang DB đích sau khi chuyển.',
    )) {
      return;
    }
    setError('');
    setIssues([]);
    setQuickSwitch(true);
    setTarget(toTarget);
    setPhase('countdown');
    try {
      const { data } = await api.post('/production/backup-sync/switch/quick', {
        target: toTarget,
      });
      enterCountdownPhase(data, true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase('idle');
      setQuickSwitch(false);
    }
  };

  const startPrepare = async () => {
    if (!window.confirm(`Kiểm tra và đồng bộ trước khi ${switchRoute}?\n\nHệ thống kiểm tra drift, tự chạy đồng bộ nếu cần, xác nhận 100%. Sau đó bạn bấm nút chuyển database.`)) {
      return;
    }
    setError('');
    setIssues([]);
    setSyncLog([]);
    setFullSyncMessage('');
    setQuickSwitch(false);
    setPhase('preparing');
    setTarget(nextTarget);
    startSupabaseSync({
      type: 'switch',
      title: 'Chuẩn bị chuyển database',
      message: `Đang kiểm tra trước khi ${switchRoute}…`,
      direction: switchRoute,
      from: activeTarget,
      target: nextTarget,
      phase: 'health',
    });
    try {
      const { data } = await api.post(
        '/production/backup-sync/switch/prepare',
        { target: nextTarget },
        { timeout: PREPARE_TIMEOUT_MS },
      );
      setSteps(data?.steps || []);

      if (!data?.ok || !data?.sync_verified_100) {
        setIssues(data?.issues || []);
        setError(data?.error || 'Chưa đồng bộ 100% — không thể chuyển');
        setPhase('idle');
        return;
      }

      setPrepareToken(data.prepare_token);
      setTarget(data.target || nextTarget);
      setPhase('verified');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSteps(e.response?.data?.steps || []);
      setIssues(e.response?.data?.issues || []);
      setPhase('idle');
    }
  };

  const cancelSwitch = async () => {
    clearTick();
    try {
      if (switchToken) {
        await api.post('/production/backup-sync/switch/cancel', { token: switchToken });
      }
    } catch { /* ignore */ }
    setPhase('idle');
    setPrepareToken(null);
    setSwitchToken(null);
    setSteps([]);
    setSyncLog([]);
    setFullSyncMessage('');
    setCountdown(0);
    setQuickSwitch(false);
    setPostSyncRunning(false);
    setError('');
  };

  const verifiedRoute = formatSwitchRoute(activeTarget, target || nextTarget);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-700" />
            Chuyển đổi database
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Đang dùng: <strong>{formatTargetLabel(activeTarget)}</strong>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Chuyển nhanh {QUICK_COUNTDOWN_SEC}s — replay log thay đổi sau khi chuyển
          </p>
        </div>
        {(phase === 'preparing' || phase === 'full_sync' || phase === 'countdown') && (
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

      {phase === 'idle' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={activeTarget === 'backup'}
            onClick={() => void startQuickSwitch('backup')}
            className="flex flex-col items-start gap-1 p-4 rounded-lg border-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-indigo-300 bg-white hover:bg-indigo-50 hover:border-indigo-500"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-indigo-800">
              <Zap className="w-4 h-4" />
              Chính → Dự phòng
            </span>
            <span className="text-xs text-slate-600">
              Đếm ngược {QUICK_COUNTDOWN_SEC}s · replay log DB + file sau khi chuyển
            </span>
          </button>
          <button
            type="button"
            disabled={activeTarget === 'primary'}
            onClick={() => void startQuickSwitch('primary')}
            className="flex flex-col items-start gap-1 p-4 rounded-lg border-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-indigo-300 bg-white hover:bg-indigo-50 hover:border-indigo-500"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-indigo-800">
              <Zap className="w-4 h-4" />
              Dự phòng → Chính
            </span>
            <span className="text-xs text-slate-600">
              Đếm ngược {QUICK_COUNTDOWN_SEC}s · replay log DB + file sau khi chuyển
            </span>
          </button>
        </div>
      )}

      {phase === 'idle' && (
        <details
          className="rounded-lg border border-slate-200 bg-white"
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced(e.target.open)}
        >
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800">
            Kiểm tra &amp; đồng bộ trước khi chuyển (tùy chọn, an toàn hơn)
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-3">
              Drift check + đồng bộ incremental trước, xác nhận 100%, rồi mới đếm ngược chuyển.
            </p>
            <button
              type="button"
              onClick={startPrepare}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
            >
              <CheckCircle2 className="w-4 h-4" />
              Kiểm tra trước khi chuyển
            </button>
          </div>
        </details>
      )}

      {(phase === 'preparing' || phase === 'full_sync') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-800 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            {phase === 'preparing' && !syncLog.length
              ? 'Đang kiểm tra drift và đồng bộ log…'
              : (fullSyncMessage || 'Đang đồng bộ dữ liệu…')}
          </div>
          {(phase === 'full_sync' || syncLog.length > 0) && (
            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {syncLog.length === 0 ? (
                <div className="text-slate-400">Chờ log từ server…</div>
              ) : (
                syncLog.map((entry, i) => (
                  <div key={`${entry.at}-${i}`} className="whitespace-pre-wrap break-all">
                    {entry.line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}
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
        <div className="text-center py-5 bg-emerald-50 rounded-lg border-2 border-emerald-400 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <div>
            <div className="text-lg font-bold text-emerald-900">Đã kiểm tra — đồng bộ 100%</div>
            <p className="text-sm text-emerald-800 mt-2">
              Sẵn sàng chuyển <strong>{verifiedRoute}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void beginCountdown()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-800 shadow-sm"
            >
              <ArrowRightLeft className="w-5 h-5" />
              Chuyển database ({verifiedRoute})
            </button>
            <button
              type="button"
              onClick={cancelSwitch}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="text-center py-4 bg-white rounded-lg border-2 border-indigo-300">
          {!quickSwitch && (
            <div className="text-xs text-emerald-600 font-medium mb-1">✓ Đồng bộ 100%</div>
          )}
          {quickSwitch && (
            <div className="text-xs text-amber-700 font-medium mb-1">Chuyển nhanh — replay log sau khi chuyển</div>
          )}
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Đếm ngược chuyển đổi</div>
          <div className="text-5xl font-bold text-indigo-700 tabular-nums">{countdown}</div>
          <p className="text-sm text-slate-600 mt-2">
            Banner trên cùng: <strong>{formatSwitchRoute(activeTarget, target || nextTarget)}</strong>
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Đã chuyển sang {formatTargetLabel(target)} — làm mới trang giám sát.
          </div>
          {postSyncRunning && (
            <div className="flex items-center gap-2 text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang replay log thay đổi — xem bong bóng góc màn hình.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

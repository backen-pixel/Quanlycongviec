import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Database } from 'lucide-react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import {
  countdownStateFromPayload,
  countdownStateFromPending,
  formatTargetLabel,
} from '../lib/supabaseSwitchCountdown';
import { formatCountdownMessage } from '../lib/supabaseSwitchLabels';

/**
 * Banner toàn app — đếm ngược chuyển Supabase (mọi user đăng nhập).
 */
export default function SupabaseSwitchCountdownBanner() {
  const [countdown, setCountdown] = useState(null);
  const [syncReady, setSyncReady] = useState(null);

  const clear = useCallback(() => {
    setCountdown(null);
    setSyncReady(null);
  }, []);

  const applyCountdown = useCallback((payload) => {
    const next = countdownStateFromPayload(payload);
    if (next) setCountdown(next);
  }, []);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!socket) return undefined;

    const onSyncReady = (payload) => {
      setSyncReady({
        message: payload?.message || 'Đã đồng bộ dữ liệu thành công 100%',
        target: payload?.target,
        at: Date.now(),
      });
      setTimeout(() => setSyncReady(null), 4000);
    };

    const onCountdown = (payload) => {
      setSyncReady(null);
      applyCountdown(payload);
    };

    const onDone = () => {
      setCountdown((c) => (c ? { ...c, done: true, remaining: 0 } : null));
      setTimeout(clear, 5000);
    };

    const onCancel = () => clear();

    socket.on('supabase:switch-sync-ready', onSyncReady);
    socket.on('supabase:switch-countdown', onCountdown);
    socket.on('supabase:switch-done', onDone);
    socket.on('supabase:switch-cancelled', onCancel);

    return () => {
      socket.off('supabase:switch-sync-ready', onSyncReady);
      socket.off('supabase:switch-countdown', onCountdown);
      socket.off('supabase:switch-done', onDone);
      socket.off('supabase:switch-cancelled', onCancel);
    };
  }, [applyCountdown, clear]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get('/production/backup-sync/switch/public-pending');
        if (cancelled) return;
        const next = countdownStateFromPending(data?.pending);
        if (next && next.remaining > 0) {
          setCountdown((c) => (c?.done ? c : next));
        }
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!countdown || countdown.done) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((countdown.switchAt - Date.now()) / 1000));
      setCountdown((c) => {
        if (!c || c.done) return c;
        if (remaining <= 0) return { ...c, done: true, remaining: 0 };
        return { ...c, remaining };
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [countdown?.switchAt, countdown?.done]);

  if (!countdown && !syncReady) return null;

  const remaining = countdown?.remaining ?? 0;

  if (syncReady && !countdown) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[200] px-4 py-3 shadow-lg flex items-center justify-center gap-3 text-sm font-medium bg-emerald-600 text-white"
        role="status"
      >
        <Database className="w-5 h-5 shrink-0" />
        <span>{syncReady.message}</span>
      </div>
    );
  }

  if (!countdown) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[200] px-4 py-3 shadow-lg flex items-center justify-center gap-3 text-sm font-medium ${
        countdown.done
          ? 'bg-emerald-600 text-white'
          : 'bg-amber-500 text-amber-950'
      }`}
      role="status"
    >
      {countdown.done ? (
        <>
          <Database className="w-5 h-5 shrink-0" />
          <span>Đã chuyển sang {formatTargetLabel(countdown.target)} — trang sẽ dùng database mới.</span>
        </>
      ) : (
        <>
          <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
          <span>
            {countdown.syncVerified && (
              <span className="font-semibold">Đã đồng bộ 100% · </span>
            )}
            {countdown.quickSwitch && !countdown.syncVerified && (
              <span className="font-semibold">Chuyển nhanh · đồng bộ sau · </span>
            )}
            {countdown.direction && (
              <span className="font-semibold">{countdown.direction} · </span>
            )}
            {countdown.message || formatCountdownMessage(countdown.from, countdown.target, remaining)}
            {' '}
            <strong className="text-lg tabular-nums">{remaining}</strong>s
          </span>
        </>
      )}
    </div>
  );
}

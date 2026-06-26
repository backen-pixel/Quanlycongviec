import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { AlertTriangle, Database } from 'lucide-react';

function labelTarget(t) {
  if (t === 'primary') return 'Primary (Chính)';
  if (t === 'backup') return 'Backup (Dự phòng)';
  return t || '—';
}

/**
 * Banner toàn app khi admin chuẩn bị chuyển Supabase primary ↔ backup.
 */
export default function SupabaseSwitchCountdownBanner() {
  const [countdown, setCountdown] = useState(null);

  const clear = useCallback(() => setCountdown(null), []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const onStart = (payload) => {
      const switchAt = payload?.switch_at ? new Date(payload.switch_at).getTime() : Date.now() + 15000;
      setCountdown({
        from: payload?.from,
        target: payload?.target,
        switchAt,
        message: payload?.message,
      });
    };

    const onDone = () => {
      setCountdown((c) => (c ? { ...c, done: true, remaining: 0 } : null));
      setTimeout(clear, 4000);
    };

    const onCancel = () => clear();

    socket.on('supabase:switch-countdown', onStart);
    socket.on('supabase:switch-done', onDone);
    socket.on('supabase:switch-cancelled', onCancel);

    return () => {
      socket.off('supabase:switch-countdown', onStart);
      socket.off('supabase:switch-done', onDone);
      socket.off('supabase:switch-cancelled', onCancel);
    };
  }, [clear]);

  useEffect(() => {
    if (!countdown || countdown.done) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((countdown.switchAt - Date.now()) / 1000));
      setCountdown((c) => (c ? { ...c, remaining } : null));
      if (remaining <= 0) {
        setCountdown((c) => (c ? { ...c, done: true, remaining: 0 } : null));
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [countdown?.switchAt, countdown?.done]);

  if (!countdown) return null;

  const remaining = countdown.remaining ?? 0;

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
          <span>Đã chuyển sang {labelTarget(countdown.target)} — trang sẽ dùng database mới.</span>
        </>
      ) : (
        <>
          <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
          <span>
            {countdown.message || `Chuyển sang ${labelTarget(countdown.target)} sau ${remaining}s`}
            {' '}
            <strong className="text-lg tabular-nums">{remaining}</strong>s
            {' · '}
            {labelTarget(countdown.from)} → {labelTarget(countdown.target)}
          </span>
        </>
      )}
    </div>
  );
}

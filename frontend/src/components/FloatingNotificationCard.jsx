import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const AUTO_DISMISS_MS = 5000;
const EXIT_MS = 300;
const ACCENT = '#00C853';

/**
 * Toast thông báo tổng — nền trắng sáng, accent xanh lá, progress 5s.
 */
export default function FloatingNotificationCard({
  onDismiss,
  onClick,
  userName,
  contextLabel,
  message,
  avatarSrc,
  avatarFallback,
  online,
  unreadCount = 0,
  iconEmoji,
  autoDismissMs = AUTO_DISMISS_MS,
  className = '',
  style = {},
  showClose = true,
  'aria-label': ariaLabel,
}) {
  const [phase, setPhase] = useState('enter');
  const [paused, setPaused] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const remainingRef = useRef(autoDismissMs);
  const tickStartRef = useRef(Date.now());
  const timerRef = useRef(null);

  const finish = useCallback(() => {
    setPhase('exit');
    window.setTimeout(() => onDismiss?.(), EXIT_MS);
  }, [onDismiss]);

  const armTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    tickStartRef.current = Date.now();
    timerRef.current = setTimeout(finish, remainingRef.current);
  }, [finish]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase('visible'));
    armTimer();
    return () => {
      cancelAnimationFrame(id);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [armTimer]);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarSrc]);

  const pauseTimer = () => {
    if (paused) return;
    setPaused(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - tickStartRef.current));
  };

  const resumeTimer = () => {
    if (!paused) return;
    setPaused(false);
    if (remainingRef.current <= 0) {
      finish();
      return;
    }
    armTimer();
  };

  const handleClose = (e) => {
    e?.stopPropagation?.();
    finish();
  };

  const handleClick = () => {
    if (onClick) {
      finish();
      window.setTimeout(() => onClick(), EXIT_MS);
    }
  };

  const initials = (avatarFallback || userName || '?').trim().slice(0, 2).toUpperCase();
  const showImg = !!(avatarSrc && !imgFailed);
  const previewLine = [contextLabel, message].filter(Boolean).join(' · ') || message || contextLabel || '';

  return (
    <div
      role={onClick ? 'button' : 'status'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel || `${userName || 'Thông báo'}: ${previewLine}`}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); } : undefined}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onTouchStart={pauseTimer}
      onTouchEnd={resumeTimer}
      onTouchCancel={resumeTimer}
      style={{
        ...style,
        ['--toast-progress-ms']: `${autoDismissMs}ms`,
      }}
      className={[
        'toast-crm group relative w-full min-w-[320px] max-w-[380px] min-h-[90px] max-h-[110px] overflow-hidden rounded-[18px] cursor-pointer',
        'border border-slate-200/90 backdrop-blur-[12px]',
        'transition-[transform,box-shadow,opacity] duration-300 ease-out will-change-transform',
        phase === 'enter' ? 'toast-slide-in-right opacity-0' : '',
        phase === 'visible' ? 'toast-slide-in-right toast-slide-in-right-active opacity-100 hover:-translate-y-[3px]' : '',
        phase === 'exit' ? 'toast-slide-out-right opacity-0' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="flex h-full min-h-[90px] items-center gap-3 px-3.5 py-3 pr-3">
        <div className="relative shrink-0">
          {showImg ? (
            <img
              src={avatarSrc}
              alt=""
              className="toast-crm-avatar h-12 w-12 rounded-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div
              className="toast-crm-avatar flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, #00E676 100%)` }}
            >
              {iconEmoji || initials}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 self-center">
          <p className="truncate text-[14px] font-bold leading-tight text-gray-900">
            {userName || 'Thông báo'}
          </p>
          {online === true && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" aria-hidden />
              Online
            </p>
          )}
          {online !== true && contextLabel && !previewLine.includes(contextLabel) && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-sky-700">
              {contextLabel}
            </p>
          )}
          {previewLine ? (
            <p className="mt-1 truncate text-[12px] leading-snug text-gray-600">
              {previewLine}
            </p>
          ) : null}
        </div>

        {unreadCount > 0 && (
          <span
            className="flex h-7 min-w-[28px] shrink-0 items-center justify-center self-start rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {showClose && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-2 top-2 rounded-lg p-1 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100" aria-hidden>
        <div className={`toast-progress-bar toast-crm-progress h-full rounded-full ${paused ? 'toast-progress-paused' : ''}`} />
      </div>
    </div>
  );
}

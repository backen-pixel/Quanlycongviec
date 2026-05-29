import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip hiển thị bên phải sidebar khi hover vào trigger.
 * - Chỉ kích hoạt khi `enabled = true` (sidebar collapsed).
 * - Delay nhẹ trước khi hiện để tránh chớp nháy.
 * - Render qua portal tới <body>, position fixed theo bounding rect.
 *
 * Usage:
 *   <SidebarTooltip label="Dashboard" hint="/dashboard" badge={3} enabled={collapsed}>
 *     <NavLink to="/dashboard">...</NavLink>
 *   </SidebarTooltip>
 */
export default function SidebarTooltip({
  label,
  hint,
  badge = 0,
  enabled = true,
  delay = 120,
  className = '',
  children,
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }, []);

  const show = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, delay);
  }, [enabled, delay, updatePosition]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, updatePosition]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!enabled && visible) setVisible(false);
  }, [enabled, visible]);

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={hide}
    >
      {children}
      {enabled && visible && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] animate-fade-in"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translateY(-50%)',
          }}
        >
          <div className="relative">
            {/* Mũi tên trỏ về sidebar */}
            <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-gradient-to-br from-slate-900 to-indigo-900 border-l border-b border-white/10" />
            {/* Nội dung tooltip */}
            <div className="relative rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 border border-white/15 shadow-[0_8px_30px_rgba(0,0,0,0.45)] px-3.5 py-2 min-w-[140px] max-w-[260px]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-white leading-tight whitespace-nowrap">{label}</span>
                {badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold shadow-sm">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              {hint && (
                <p className="text-[10px] text-blue-200/80 mt-0.5 font-mono truncate">{hint}</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Tự đăng xuất user vào 00:00:05 (giờ VN) mỗi ngày.
 *
 * - Timer: logout đúng nửa đêm khi tab vẫn mở.
 * - Kiểm tra ngay khi mount / tab focus: token cấp trước 00:00 hôm nay → logout (mở app sáng hôm sau).
 *
 * Disable: localStorage.setItem('autoLogoutMidnight', 'off')
 */
import { useEffect, useRef } from 'react';

const VN_TZ = 'Asia/Ho_Chi_Minh';
const SAFETY_OFFSET_MS = 5 * 1000;

function midnightVnTodayMs() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const todayVn = fmt.format(new Date());
  return new Date(`${todayVn}T00:00:00+07:00`).getTime();
}

/** Token JWT có iat trước 00:00 VN hôm nay → phiên "qua đêm". */
function isTokenStaleAcrossMidnight() {
  if (localStorage.getItem('autoLogoutMidnight') === 'off') return false;
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const iatMs = payload?.iat ? payload.iat * 1000 : 0;
    if (!iatMs) return true;
    return iatMs < midnightVnTodayMs();
  } catch {
    return false;
  }
}

function msUntilNextMidnightVn() {
  const next = midnightVnTodayMs() + 24 * 3600 * 1000;
  return Math.max(0, next - Date.now()) + SAFETY_OFFSET_MS;
}

function performMidnightLogout(onLogout) {
  try {
    if (typeof onLogout === 'function') onLogout();
  } catch (_) {}
  try {
    localStorage.setItem('logoutReason', 'midnight');
  } catch (_) {}
  try {
    window.location.replace('/login?reason=midnight');
  } catch (_) {
    window.location.href = '/login?reason=midnight';
  }
}

export function useAutoLogoutAtMidnight(enabled, onLogout) {
  const timerRef = useRef(null);
  const cbRef = useRef(onLogout);
  cbRef.current = onLogout;

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (localStorage.getItem('autoLogoutMidnight') === 'off') return undefined;

    function schedule() {
      if (isTokenStaleAcrossMidnight()) {
        performMidnightLogout(cbRef.current);
        return;
      }
      const delay = msUntilNextMidnightVn();
      timerRef.current = window.setTimeout(() => {
        performMidnightLogout(cbRef.current);
      }, delay);
    }

    schedule();

    function onWake() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      schedule();
    }
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [enabled]);
}

import { useState, useEffect } from 'react';

/**
 * Breakpoint chuyển sidebar sang dạng drawer (trùng `lg:` của Tailwind).
 * Dưới ngưỡng này: sidebar 240px chiếm quá nửa màn hình → phải ẩn thành off-canvas.
 */
export const MOBILE_BREAKPOINT = 1024;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/** Đọc match ngay lần render đầu — tránh nháy layout (desktop hiện rồi mới co lại). */
function readMatch() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * `true` khi viewport < 1024px. Dùng matchMedia (không phải resize listener) để
 * chỉ chạy lại đúng lúc vượt ngưỡng, không phải mỗi pixel kéo chuột.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(readMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    // Safari < 14 chỉ có addListener
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return isMobile;
}

export default useIsMobile;

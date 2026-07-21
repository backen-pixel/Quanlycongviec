import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Đếm ngược trước khi thực thi. Gọi start(onComplete) — hết giây thì gọi onComplete.
 * clear() hủy đếm (không gọi onComplete).
 */
export function useConfirmCountdown(seconds = 5) {
  const [wait, setWait] = useState(0);
  const timerRef = useRef(null);
  const genRef = useRef(0);
  const onCompleteRef = useRef(null);

  const clear = useCallback(() => {
    genRef.current += 1;
    onCompleteRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWait(0);
  }, []);

  const start = useCallback((onComplete) => {
    const gen = ++genRef.current;
    onCompleteRef.current = typeof onComplete === 'function' ? onComplete : null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWait(seconds);
    timerRef.current = setInterval(() => {
      if (gen !== genRef.current) return;
      setWait((n) => {
        if (n <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          const cb = onCompleteRef.current;
          onCompleteRef.current = null;
          if (cb) {
            // Chạy sau khi setState xong để tránh update trong updater
            setTimeout(() => {
              if (gen === genRef.current) cb();
            }, 0);
          }
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }, [seconds]);

  useEffect(() => () => {
    genRef.current += 1;
    onCompleteRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { wait, start, clear, pending: wait > 0 };
}

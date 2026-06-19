import { useEffect, useState } from 'react';

/** Re-render định kỳ để cập nhật nhãn "X phút trước" mà không cần poll presence. */
export function useRelativeTimeTick(intervalMs = 30_000) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

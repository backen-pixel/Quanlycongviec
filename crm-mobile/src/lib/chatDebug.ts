import { useMemo } from 'react';

export type ChatDebugEntry = {
  at: string;
  scope: string;
  message: string;
  data?: unknown;
};

const MAX = 120;
const buf: ChatDebugEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function chatDebugLog(scope: string, message: string, data?: unknown) {
  const e: ChatDebugEntry = { at: new Date().toISOString(), scope, message, data };
  buf.push(e);
  while (buf.length > MAX) buf.shift();
  // In dev, also send to console for easier debugging on emulator.
  // eslint-disable-next-line no-console
  console.log(`[chat][${scope}] ${message}`, data ?? '');
  emit();
}

export function chatDebugSnapshot() {
  return [...buf];
}

export function chatDebugClear() {
  buf.length = 0;
  emit();
}

export function useChatDebugText() {
  return useMemo(() => {
    const rows = chatDebugSnapshot();
    return rows
      .map((r) => {
        let d = '';
        if (r.data !== undefined) {
          try {
            d = JSON.stringify(r.data, null, 2);
          } catch {
            d = String(r.data);
          }
        }
        return `${r.at}  [${r.scope}]  ${r.message}${d ? `\n${d}` : ''}`;
      })
      .join('\n\n');
  }, []);
}

export function chatDebugSubscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}


/**
 * Công cụ chẩn đoán lưu lượng socket — TẮT mặc định.
 *
 * Bật bằng EXPO_PUBLIC_SOCKET_DEBUG=1 khi build, rồi đọc log:
 *   adb logcat | rg "socket-traffic"
 *
 * Mỗi 10 giây in một dòng gộp: tổng số gói engine.io nhận được, và top sự kiện theo
 * số byte. Dùng để tìm sự kiện nào đang đẩy dữ liệu liên tục lúc app đứng yên.
 * Gộp theo chu kỳ thay vì in từng gói để bản thân việc log không làm nhiễu phép đo.
 */
import type { Socket } from 'socket.io-client';

export const SOCKET_DEBUG = process.env.EXPO_PUBLIC_SOCKET_DEBUG === '1';

const REPORT_INTERVAL_MS = 10_000;
const TOP_EVENTS = 8;

type Bucket = { count: number; bytes: number };

const events = new Map<string, Bucket>();
let engineBytes = 0;
let enginePackets = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function byteLength(value: unknown): number {
  try {
    if (typeof value === 'string') return value.length;
    return JSON.stringify(value ?? '').length;
  } catch {
    return 0;
  }
}

export function attachSocketTrafficLogger(socket: Socket): () => void {
  if (!SOCKET_DEBUG) return () => {};

  const onAnyEvent = (event: string, ...args: unknown[]) => {
    const bucket = events.get(event) || { count: 0, bytes: 0 };
    bucket.count += 1;
    bucket.bytes += byteLength(args);
    events.set(event, bucket);
  };
  socket.onAny(onAnyEvent);

  const engine = socket.io?.engine as
    | { on?: (e: string, fn: (p: unknown) => void) => void; off?: (e: string, fn: (p: unknown) => void) => void }
    | undefined;
  const onPacket = (packet: unknown) => {
    enginePackets += 1;
    engineBytes += byteLength((packet as { data?: unknown } | null)?.data);
  };
  engine?.on?.('packet', onPacket);

  if (!timer) {
    timer = setInterval(() => {
      const top = [...events.entries()]
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .slice(0, TOP_EVENTS)
        .map(([name, b]) => `${name} x${b.count}=${b.bytes}B`)
        .join(' | ');
      console.log(
        `[socket-traffic] 10s: engine ${enginePackets} goi / ${engineBytes}B`
        + ` || ${top || 'khong co su kien nao'}`,
      );
      events.clear();
      engineBytes = 0;
      enginePackets = 0;
    }, REPORT_INTERVAL_MS);
  }

  return () => {
    socket.offAny(onAnyEvent);
    engine?.off?.('packet', onPacket);
  };
}

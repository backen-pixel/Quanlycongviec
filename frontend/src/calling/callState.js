/**
 * Domain — state machine cuộc gọi 1-1 (web). Xem docs/CALL_SYSTEM.md (mục 4).
 * States: IDLE | RINGING | CONNECTING | CONNECTED | ENDED | MISSED | REJECTED
 */
export const CALL_TIMEOUT_MS = 30_000;
export const RECONNECT_TIMEOUT_MS = 15_000;

export const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function statusLabel(state, direction) {
  switch (state) {
    case 'RINGING': return direction === 'outgoing' ? 'Đang gọi…' : 'Cuộc gọi đến';
    case 'CONNECTING': return 'Đang kết nối…';
    case 'CONNECTED': return 'Đã kết nối';
    case 'REJECTED': return 'Bị từ chối';
    case 'MISSED': return 'Không trả lời';
    case 'ENDED': return 'Kết thúc';
    default: return '';
  }
}

/** Cuộc gọi đang hoạt động (không phải IDLE/ENDED/MISSED/REJECTED). */
export function isActiveState(state) {
  return state === 'RINGING' || state === 'CONNECTING' || state === 'CONNECTED';
}

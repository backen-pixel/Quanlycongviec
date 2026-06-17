/**
 * Domain layer — định nghĩa state máy trạng thái cuộc gọi 1-1.
 * Xem docs/CALL_SYSTEM.md (mục 4).
 */

/** Trạng thái cuộc gọi (state machine). */
export type CallState =
  | 'IDLE'
  | 'RINGING' // OUTGOING ở caller / INCOMING ở callee
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ENDED'
  | 'MISSED'
  | 'REJECTED';

/** Hướng cuộc gọi đối với thiết bị hiện tại. */
export type CallDirection = 'outgoing' | 'incoming';

export type CallMedia = 'audio' | 'video';

export interface CallPeer {
  id: string;
  name: string;
  avatar?: string | null;
}

/** Một phiên cuộc gọi đang diễn ra trên thiết bị này. */
export interface CallSession {
  callId: string;
  peer: CallPeer;
  direction: CallDirection;
  media: CallMedia;
  state: CallState;
  /** Mốc CONNECTED để tính thời lượng. */
  connectedAt: number | null;
  isMuted: boolean;
  isSpeaker: boolean;
  isCameraOff: boolean;
  /** 'front' | 'back' (chỉ video). */
  cameraFacing: 'front' | 'back';
  error: string | null;
}

export const CALL_TIMEOUT_MS = 30_000; // hết 30s không bắt máy → MISSED
export const RECONNECT_TIMEOUT_MS = 15_000; // ICE failed quá 15s → ENDED

/** ICE server mặc định khi chưa fetch được TURN credentials. */
export const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function isActiveState(s: CallState): boolean {
  return s === 'RINGING' || s === 'CONNECTING' || s === 'CONNECTED';
}

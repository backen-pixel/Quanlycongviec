/**
 * Data layer — client signaling cuộc gọi qua Socket.IO (hợp đồng event hyphen mới).
 * Bọc appSocket (socket dùng chung toàn app). Tự gắn lại listener khi socket đổi
 * (reconnect / login lại). KHÔNG đụng WebRTC/UI.
 *
 * Xem docs/CALL_SYSTEM.md (mục 3).
 */
import type { Socket } from 'socket.io-client';
import { subscribeAppSocket, getAppSocket } from '../lib/appSocket';
import type { CallMedia } from './types';

type Handlers = {
  onIncomingCall?: (p: { callId: string; fromUserId: string; fromName: string; fromAvatar?: string | null; media: CallMedia }) => void;
  onCallAnswered?: (p: { callId: string; byUserId: string }) => void;
  onCallRejected?: (p: { callId: string; reason?: string }) => void;
  onCallEnded?: (p: { callId: string }) => void;
  onIceCandidate?: (p: { callId: string; fromUserId: string; candidate: any }) => void;
  onSdp?: (p: { callId: string; fromUserId: string; description: any }) => void;
  onBusy?: (p: { callId: string }) => void;
  onUnavailable?: (p: { callId: string; reason: string }) => void;
};

const SERVER_EVENTS: Array<[keyof Handlers, string]> = [
  ['onIncomingCall', 'incoming-call'],
  ['onCallAnswered', 'call-answered'],
  ['onCallRejected', 'call-rejected'],
  ['onCallEnded', 'call-ended'],
  ['onIceCandidate', 'ice-candidate'],
  ['onSdp', 'sdp'],
  ['onBusy', 'busy'],
  ['onUnavailable', 'call-unavailable'],
];

export class SignalingClient {
  private handlers: Handlers = {};
  private boundSocket: Socket | null = null;
  private unsubscribe: (() => void) | null = null;

  setHandlers(h: Handlers) {
    this.handlers = h;
  }

  /** Bắt đầu lắng nghe; tự bind lại khi socket thay đổi. */
  connect() {
    this.unsubscribe = subscribeAppSocket((socket) => this.bind(socket));
    const s = getAppSocket();
    if (s) this.bind(s);
  }

  private bind(socket: Socket) {
    if (this.boundSocket === socket) return;
    this.unbind();
    this.boundSocket = socket;
    for (const [key, evt] of SERVER_EVENTS) {
      socket.on(evt, (payload: any) => {
        const fn = this.handlers[key] as ((p: any) => void) | undefined;
        fn?.(payload);
      });
    }
  }

  private unbind() {
    if (!this.boundSocket) return;
    for (const [, evt] of SERVER_EVENTS) this.boundSocket.off(evt);
    this.boundSocket = null;
  }

  // ─── Emit (Client → Server) ───
  callUser(callId: string, toUserId: string, media: CallMedia) {
    getAppSocket()?.emit('call-user', { callId, toUserId, media });
  }
  answerCall(callId: string, toUserId: string) {
    getAppSocket()?.emit('answer-call', { callId, toUserId });
  }
  rejectCall(callId: string, toUserId: string, reason = 'rejected') {
    getAppSocket()?.emit('reject-call', { callId, toUserId, reason });
  }
  endCall(callId: string, toUserId: string) {
    getAppSocket()?.emit('end-call', { callId, toUserId });
  }
  sendSdp(callId: string, toUserId: string, description: any) {
    getAppSocket()?.emit('sdp', { callId, toUserId, description });
  }
  sendIce(callId: string, toUserId: string, candidate: any) {
    getAppSocket()?.emit('ice-candidate', { callId, toUserId, candidate });
  }

  isConnected() {
    return !!getAppSocket()?.connected;
  }

  destroy() {
    this.unbind();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

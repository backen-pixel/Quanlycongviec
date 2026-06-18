/**
 * Presentation/Controller — máy trạng thái cuộc gọi 1-1 + điều phối signaling, WebRTC và
 * lớp native (lock-screen / FCM / foreground service). Đây là "một nguồn sự thật" duy nhất
 * cho trạng thái cuộc gọi trên thiết bị (đảm bảo chỉ một màn hình cuộc gọi).
 *
 * Luồng (xem docs/CALL_SYSTEM.md):
 *  - Caller: startCall → call-user → (call-answered) → tạo offer → nhận answer → ICE → CONNECTED
 *  - Callee: incoming-call → acceptCall → answer-call → nhận offer → trả answer → ICE → CONNECTED
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Platform } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import { subscribeAppSocket } from '../lib/appSocket';
import {
  dismissIncomingCallNotification, showIncomingCallNotification, clearPendingIncomingCall,
  type IncomingCallPayload,
} from '../lib/incomingCallNotifications';
import { markNativeCallAnswered } from '../lib/nativeCallNotification';
import {
  dismissLockScreenCallUi, showNativeOutgoingCall, syncLockScreenCallState,
  subscribeLockScreenCallAccept, subscribeLockScreenCallEnd,
  subscribeLockScreenCallReject, subscribeLockScreenToggleMute,
} from '../lib/lockScreenCall';
import {
  markCallAnswered, releaseIncomingClaim, setCallSession,
  shouldSuppressIncomingRing, tryClaimIncomingCall,
} from '../lib/callSessionGuard';
import { SignalingClient } from './SignalingClient';
import { WebRTCService } from './WebRTCService';
import { getIceServers } from './turnConfig';
import {
  CALL_TIMEOUT_MS, RECONNECT_TIMEOUT_MS, isActiveState,
  type CallMedia, type CallPeer, type CallSession, type CallState,
} from './types';
import { startIncomingCallAlert, stopIncomingCallAlert } from '../lib/callRingtone';

type Ctx = {
  session: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (peer: CallPeer, media?: CallMedia) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  applyIncomingFromPush: (p: IncomingCallPayload) => void;
  handleNativeCallIntent: (p: IncomingCallPayload) => void;
};

const CallCtx = createContext<Ctx | null>(null);

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const rtcRef = useRef<WebRTCService | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOfferRef = useRef<any>(null);
  const offerSentRef = useRef(false);
  const pendingAnswerRef = useRef(false); // callee bấm nghe lúc socket chưa connect

  const updateSession = useCallback((patch: Partial<CallSession> | null) => {
    setSession((prev) => {
      if (patch === null) { sessionRef.current = null; return null; }
      const base = prev || sessionRef.current;
      if (!base) return prev;
      const next = { ...base, ...patch } as CallSession;
      sessionRef.current = next;
      return next;
    });
  }, []);

  const setState = useCallback((state: CallState) => updateSession({ state }), [updateSession]);

  const clearTimers = useCallback(() => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }, []);

  /** Dọn toàn bộ phiên (idempotent) và hiển thị state cuối trong giây lát. */
  const teardown = useCallback((finalState: CallState) => {
    const s = sessionRef.current;
    clearTimers();
    void stopIncomingCallAlert();
    try { rtcRef.current?.close(); } catch { /* noop */ }
    rtcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    lastOfferRef.current = null;
    offerSentRef.current = false;
    pendingAnswerRef.current = false;
    if (s) {
      markCallAnswered(s.callId);
      releaseIncomingClaim(s.callId);
      void dismissIncomingCallNotification(s.callId);
    }
    if (Platform.OS === 'android') dismissLockScreenCallUi();
    void clearPendingIncomingCall();
    setCallSession(null, 'idle');
    updateSession({ state: finalState });
    // Sau 1.2s ẩn màn cuộc gọi.
    setTimeout(() => {
      if (sessionRef.current?.callId === s?.callId) { sessionRef.current = null; setSession(null); }
    }, 1200);
  }, [clearTimers, updateSession]);

  // ─── Tạo WebRTC service + gắn callback signaling ───
  const buildRtc = useCallback(async (media: CallMedia) => {
    const iceServers = await getIceServers();
    const rtc = new WebRTCService({
      onLocalStream: (s) => setLocalStream(s),
      onRemoteStream: (s) => setRemoteStream(s),
      onIceCandidate: (candidate) => {
        const cur = sessionRef.current;
        if (cur) signalingRef.current?.sendIce(cur.callId, cur.peer.id, candidate);
      },
      onConnectionState: (state) => {
        const cur = sessionRef.current;
        if (!cur) return;
        if (state === 'connected' || state === 'completed') {
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          if (cur.state !== 'CONNECTED') {
            updateSession({ state: 'CONNECTED', connectedAt: Date.now() });
            syncLockScreenCallState({
              callId: cur.callId, status: 'active', peerName: cur.peer.name,
              durationMs: 0, isMuted: cur.isMuted,
            });
          }
        } else if (state === 'failed') {
          // Thử ICE restart (chỉ caller tạo offer mới). Quá hạn → kết thúc.
          if (cur.direction === 'outgoing') {
            void (async () => {
              const offer = await rtcRef.current?.restartIce();
              if (offer) { lastOfferRef.current = offer; signalingRef.current?.sendSdp(cur.callId, cur.peer.id, offer); }
            })();
          }
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              signalingRef.current?.endCall(cur.callId, cur.peer.id);
              teardown('ENDED');
            }, RECONNECT_TIMEOUT_MS);
          }
        }
      },
    });
    await rtc.start(iceServers, media);
    rtcRef.current = rtc;
    return rtc;
  }, [teardown, updateSession]);

  // ─── Caller ───
  const startCall = useCallback(async (peer: CallPeer, media: CallMedia = 'audio') => {
    if (sessionRef.current && isActiveState(sessionRef.current.state)) return; // đang có cuộc gọi
    const callId = genCallId();
    const next: CallSession = {
      callId, peer, direction: 'outgoing', media, state: 'RINGING',
      connectedAt: null, isMuted: false, isSpeaker: media === 'video',
      isCameraOff: false, cameraFacing: 'front', error: null,
    };
    sessionRef.current = next; setSession(next);
    setCallSession(callId, 'outgoing');
    offerSentRef.current = false;

    try {
      await buildRtc(media);
    } catch (e: any) {
      updateSession({ error: e?.message || 'Không truy cập được mic/camera' });
      teardown('ENDED');
      return;
    }

    if (Platform.OS === 'android') {
      showNativeOutgoingCall({ callId, peerName: peer.name, fromUserId: peer.id });
      syncLockScreenCallState({ callId, status: 'outgoing', peerName: peer.name, durationMs: 0, isMuted: false });
    }
    signalingRef.current?.callUser(callId, peer.id, media);

    ringTimerRef.current = setTimeout(() => {
      signalingRef.current?.endCall(callId, peer.id);
      teardown('MISSED');
    }, CALL_TIMEOUT_MS);
  }, [buildRtc, teardown, updateSession]);

  // ─── Caller nhận "đã nghe" → tạo & gửi offer ───
  const onCallAnswered = useCallback(async (p: { callId: string }) => {
    const cur = sessionRef.current;
    if (!cur || cur.callId !== p.callId || cur.direction !== 'outgoing') return;
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (cur.state === 'RINGING') setState('CONNECTING');
    const rtc = rtcRef.current;
    if (!rtc) return;
    if (offerSentRef.current && lastOfferRef.current) {
      // Re-emit offer (callee reconnect) — tránh kẹt "đang kết nối".
      signalingRef.current?.sendSdp(cur.callId, cur.peer.id, lastOfferRef.current);
      return;
    }
    try {
      const offer = await rtc.createOffer();
      lastOfferRef.current = offer; offerSentRef.current = true;
      signalingRef.current?.sendSdp(cur.callId, cur.peer.id, offer);
    } catch (e: any) {
      updateSession({ error: e?.message || 'Lỗi tạo offer' });
      signalingRef.current?.endCall(cur.callId, cur.peer.id);
      teardown('ENDED');
    }
  }, [setState, teardown, updateSession]);

  // ─── Incoming (từ socket khi app đang mở) ───
  const presentIncoming = useCallback((p: IncomingCallPayload, media: CallMedia) => {
    if (shouldSuppressIncomingRing(p.callId)) return;
    if (sessionRef.current && isActiveState(sessionRef.current.state)) {
      signalingRef.current?.rejectCall(p.callId, p.fromUserId, 'busy');
      return;
    }
    if (!tryClaimIncomingCall(p.callId)) return;
    const next: CallSession = {
      callId: p.callId,
      peer: { id: p.fromUserId, name: p.fromName || 'Người gọi', avatar: (p as any).fromAvatar || null },
      direction: 'incoming', media, state: 'RINGING', connectedAt: null,
      isMuted: false, isSpeaker: media === 'video', isCameraOff: false,
      cameraFacing: 'front', error: null,
    };
    sessionRef.current = next; setSession(next);
    setCallSession(p.callId, 'incoming');
    void startIncomingCallAlert();
    void showIncomingCallNotification({ ...p, kind: media });
  }, []);

  const onIncomingCall = useCallback((p: any) => {
    presentIncoming(
      { callId: p.callId, fromUserId: p.fromUserId, fromName: p.fromName, kind: p.media,
        ...(p.fromAvatar ? { fromAvatar: p.fromAvatar } as any : {}) } as IncomingCallPayload,
      p.media === 'video' ? 'video' : 'audio',
    );
  }, [presentIncoming]);

  // ─── Callee chấp nhận ───
  const acceptCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.direction !== 'incoming' || cur.state !== 'RINGING') return;
    // Chặn reo lại NGAY khi bấm nghe (trước cả khi build WebRTC / kiểm tra socket).
    markCallAnswered(cur.callId);
    markNativeCallAnswered(cur.callId);
    void stopIncomingCallAlert();
    void dismissIncomingCallNotification(cur.callId);
    setState('CONNECTING');
    setCallSession(cur.callId, 'connecting');
    if (Platform.OS === 'android') {
      syncLockScreenCallState({ callId: cur.callId, status: 'connecting', peerName: cur.peer.name, durationMs: 0, isMuted: false });
    }
    try {
      await buildRtc(cur.media);
    } catch (e: any) {
      updateSession({ error: e?.message || 'Không truy cập được mic/camera' });
      signalingRef.current?.rejectCall(cur.callId, cur.peer.id, 'rejected');
      teardown('ENDED');
      return;
    }
    // Gửi answer-call để caller tạo offer. Nếu socket chưa kết nối (boot từ màn khóa) →
    // hoãn, flush khi socket connect.
    if (signalingRef.current?.isConnected()) {
      signalingRef.current.answerCall(cur.callId, cur.peer.id);
    } else {
      pendingAnswerRef.current = true;
    }
  }, [buildRtc, setState, teardown, updateSession]);

  // ─── SDP / ICE từ peer ───
  const onSdp = useCallback(async (p: { callId: string; description: any }) => {
    const cur = sessionRef.current;
    if (!cur || cur.callId !== p.callId) return;
    const rtc = rtcRef.current;
    if (!rtc) return;
    try {
      const answer = await rtc.applyRemoteDescription(p.description);
      if (answer) signalingRef.current?.sendSdp(cur.callId, cur.peer.id, answer);
    } catch { /* noop */ }
  }, []);

  const onIce = useCallback((p: { callId: string; candidate: any }) => {
    const cur = sessionRef.current;
    if (!cur || cur.callId !== p.callId) return;
    void rtcRef.current?.addRemoteCandidate(p.candidate);
  }, []);

  // ─── Kết thúc / từ chối / bận ───
  const rejectCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    signalingRef.current?.rejectCall(cur.callId, cur.peer.id, 'rejected');
    teardown('REJECTED');
  }, [teardown]);

  const endCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    signalingRef.current?.endCall(cur.callId, cur.peer.id);
    teardown('ENDED');
  }, [teardown]);

  // ─── Media controls ───
  const toggleMute = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    const next = !cur.isMuted;
    rtcRef.current?.setMuted(next);
    updateSession({ isMuted: next });
    if (Platform.OS === 'android') {
      syncLockScreenCallState({ callId: cur.callId, status: cur.state === 'CONNECTED' ? 'active' : 'connecting', peerName: cur.peer.name, durationMs: 0, isMuted: next });
    }
  }, [updateSession]);

  const toggleSpeaker = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    const next = !cur.isSpeaker;
    rtcRef.current?.setSpeaker(next);
    updateSession({ isSpeaker: next });
  }, [updateSession]);

  const toggleCamera = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    const next = !cur.isCameraOff;
    rtcRef.current?.setCameraOff(next);
    updateSession({ isCameraOff: next });
  }, [updateSession]);

  const switchCamera = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    rtcRef.current?.switchCamera();
    updateSession({ cameraFacing: cur.cameraFacing === 'front' ? 'back' : 'front' });
  }, [updateSession]);

  // ─── Đầu vào từ FCM / native intent ───
  const applyIncomingFromPush = useCallback((p: IncomingCallPayload) => {
    presentIncoming(p, p.kind === 'video' ? 'video' : 'audio');
  }, [presentIncoming]);

  const handleNativeCallIntent = useCallback((p: IncomingCallPayload) => {
    presentIncoming(p, p.kind === 'video' ? 'video' : 'audio');
    if (p.callAction === 'accept') {
      // chờ state set xong rồi accept
      setTimeout(() => { void acceptCall(); }, 0);
    } else if (p.callAction === 'reject') {
      setTimeout(() => rejectCall(), 0);
    }
  }, [presentIncoming, acceptCall, rejectCall]);

  // ─── Đăng ký signaling + native bridges (1 lần) ───
  useEffect(() => {
    const sig = new SignalingClient();
    signalingRef.current = sig;
    sig.setHandlers({
      onIncomingCall,
      onCallAnswered,
      onSdp,
      onIceCandidate: onIce,
      onCallRejected: () => teardown('REJECTED'),
      onCallEnded: () => teardown('ENDED'),
      onBusy: () => { updateSession({ error: 'Máy bận' }); teardown('REJECTED'); },
      onUnavailable: (q) => teardown(q.reason === 'timeout' ? 'MISSED' : 'ENDED'),
    });
    sig.connect();

    // Flush answer-call bị hoãn khi socket vừa kết nối lại (boot từ màn khóa).
    const unsubSock = subscribeAppSocket((socket) => {
      const flush = () => {
        const cur = sessionRef.current;
        if (pendingAnswerRef.current && cur && cur.direction === 'incoming') {
          pendingAnswerRef.current = false;
          sig.answerCall(cur.callId, cur.peer.id);
        }
      };
      if (socket.connected) flush();
      socket.on('connect', flush);
    });

    const unsubAccept = subscribeLockScreenCallAccept((cid) => {
      if (sessionRef.current?.callId === cid) void acceptCall();
    });
    const unsubReject = subscribeLockScreenCallReject((cid, fromUserId) => {
      if (sessionRef.current?.callId === cid) { rejectCall(); return; }
      // RN chưa có state (FCM lúc socket offline) → vẫn gửi reject để caller tắt chuông.
      if (cid && fromUserId) signalingRef.current?.rejectCall(cid, fromUserId, 'rejected');
      markCallAnswered(cid);
      markNativeCallAnswered(cid);
      void dismissIncomingCallNotification(cid);
    });
    const unsubEnd = subscribeLockScreenCallEnd((cid) => {
      if (sessionRef.current?.callId === cid) endCall();
    });
    const unsubMute = subscribeLockScreenToggleMute((cid) => {
      if (sessionRef.current?.callId === cid) toggleMute();
    });

    return () => {
      sig.destroy();
      unsubSock();
      unsubAccept(); unsubReject(); unsubEnd(); unsubMute();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(() => ({
    session, localStream, remoteStream,
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleSpeaker, toggleCamera, switchCamera,
    applyIncomingFromPush, handleNativeCallIntent,
  }), [session, localStream, remoteStream, startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleSpeaker, toggleCamera, switchCamera, applyIncomingFromPush, handleNativeCallIntent]);

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

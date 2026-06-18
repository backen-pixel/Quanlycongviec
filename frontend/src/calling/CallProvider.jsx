/**
 * Presentation/Controller — máy trạng thái cuộc gọi 1-1 (web) + điều phối signaling & WebRTC.
 * Một nguồn sự thật cho trạng thái cuộc gọi. Xem docs/CALL_SYSTEM.md.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '../lib/auth';
import { dismissIncomingCallDesktopAlert, showIncomingCallDesktopAlert } from '../lib/incomingCallNotify';
import { playCallRingtone, stopCallRingtone } from '../lib/callRingtonePlayer';
import { WebRTCService } from './webrtcService';
import { getIceServers } from './turnConfig';
import { CALL_TIMEOUT_MS, RECONNECT_TIMEOUT_MS, isActiveState } from './callState';
import { useGroupCall } from './useGroupCall';

const CallCtx = createContext(null);

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CallProvider({ children }) {
  const { socket, user } = useAuth();
  const uid = user?.userId || user?.id || null;

  const [session, setSession] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const socketRef = useRef(socket);
  const rtcRef = useRef(null);
  const sessionRef = useRef(null);
  const ringTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const lastOfferRef = useRef(null);
  const offerSentRef = useRef(false);

  useEffect(() => { socketRef.current = socket; }, [socket]);

  const patch = useCallback((p) => {
    setSession((prev) => {
      if (p === null) { sessionRef.current = null; return null; }
      const base = prev || sessionRef.current;
      if (!base) return prev;
      const next = { ...base, ...p };
      sessionRef.current = next;
      return next;
    });
  }, []);

  const isBusyFn = useCallback(() => {
    const s = sessionRef.current;
    return !!(s && isActiveState(s.state));
  }, []);

  const group = useGroupCall({
    socket,
    uid,
    isBusy: isBusyFn,
    setSession,
    sessionRef,
    patchSession: patch,
  });

  const setState = useCallback((state) => patch({ state }), [patch]);

  const clearTimers = useCallback(() => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }, []);

  const teardown = useCallback((finalState) => {
    const s = sessionRef.current;
    clearTimers();
    if (s?.mode === 'group') group.resetGroup();
    else {
      try { stopCallRingtone(); } catch { /* noop */ }
      try { dismissIncomingCallDesktopAlert(); } catch { /* noop */ }
    }
    try { rtcRef.current?.close(); } catch { /* noop */ }
    rtcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    lastOfferRef.current = null;
    offerSentRef.current = false;
    patch({ state: finalState });
    setTimeout(() => {
      if (sessionRef.current?.callId === s?.callId) { sessionRef.current = null; setSession(null); }
    }, 1200);
  }, [clearTimers, patch, group]);

  const buildRtc = useCallback(async (media) => {
    const iceServers = await getIceServers();
    const rtc = new WebRTCService({
      onLocalStream: (s) => setLocalStream(s),
      onRemoteStream: (s) => setRemoteStream(s),
      onIceCandidate: (candidate) => {
        const cur = sessionRef.current;
        if (cur) socketRef.current?.emit('ice-candidate', { callId: cur.callId, toUserId: cur.peer.id, candidate });
      },
      onConnectionState: (state) => {
        const cur = sessionRef.current;
        if (!cur) return;
        if (state === 'connected' || state === 'completed') {
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          if (cur.state !== 'CONNECTED') { try { stopCallRingtone(); } catch { /* noop */ } patch({ state: 'CONNECTED', connectedAt: Date.now() }); }
        } else if (state === 'failed') {
          if (cur.direction === 'outgoing') {
            (async () => {
              const offer = await rtcRef.current?.restartIce();
              if (offer) { lastOfferRef.current = offer; socketRef.current?.emit('sdp', { callId: cur.callId, toUserId: cur.peer.id, description: offer }); }
            })();
          }
          if (!reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              socketRef.current?.emit('end-call', { callId: cur.callId, toUserId: cur.peer.id });
              teardown('ENDED');
            }, RECONNECT_TIMEOUT_MS);
          }
        }
      },
    });
    await rtc.start(iceServers, media);
    rtcRef.current = rtc;
    return rtc;
  }, [patch, teardown]);

  // ─── Caller ───
  // media: 'audio'|'video' HOẶC object tương thích cũ { video?: boolean }.
  const startCall = useCallback(async (peer, media = 'audio') => {
    if (sessionRef.current && isActiveState(sessionRef.current.state)) return;
    if (!peer?.id) return;
    const mediaKind = typeof media === 'string' ? media : (media?.video ? 'video' : 'audio');
    const callId = genCallId();
    const next = {
      callId, peer, direction: 'outgoing', media: mediaKind, state: 'RINGING',
      connectedAt: null, isMuted: false, isCameraOff: false, error: null,
    };
    sessionRef.current = next; setSession(next);
    offerSentRef.current = false;
    try {
      await buildRtc(mediaKind);
    } catch (e) {
      patch({ error: e?.message || 'Không truy cập được mic/camera' });
      teardown('ENDED');
      return;
    }
    socketRef.current?.emit('call-user', { callId, toUserId: peer.id, media: mediaKind });
    ringTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('end-call', { callId, toUserId: peer.id });
      teardown('MISSED');
    }, CALL_TIMEOUT_MS);
  }, [buildRtc, patch, teardown]);

  // ─── Callee chấp nhận ───
  const acceptCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.mode === 'group') { await group.acceptGroupCall(); return; }
    if (cur.direction !== 'incoming' || cur.state !== 'RINGING') return;
    try { stopCallRingtone(); } catch { /* noop */ }
    try { dismissIncomingCallDesktopAlert(); } catch { /* noop */ }
    setState('CONNECTING');
    try {
      await buildRtc(cur.media);
    } catch (e) {
      patch({ error: e?.message || 'Không truy cập được mic/camera' });
      socketRef.current?.emit('reject-call', { callId: cur.callId, toUserId: cur.peer.id, reason: 'rejected' });
      teardown('ENDED');
      return;
    }
    socketRef.current?.emit('answer-call', { callId: cur.callId, toUserId: cur.peer.id });
  }, [buildRtc, patch, setState, teardown, group]);

  const rejectCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.mode === 'group') { group.rejectGroupCall(); return; }
    socketRef.current?.emit('reject-call', { callId: cur.callId, toUserId: cur.peer.id, reason: 'rejected' });
    teardown('REJECTED');
  }, [teardown, group]);

  const endCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.mode === 'group') { group.endGroupCall(); return; }
    socketRef.current?.emit('end-call', { callId: cur.callId, toUserId: cur.peer.id });
    teardown('ENDED');
  }, [teardown, group]);

  const toggleMute = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    if (cur.mode === 'group') { group.toggleGroupMute(); return; }
    const next = !cur.isMuted; rtcRef.current?.setMuted(next); patch({ isMuted: next });
  }, [patch]);

  const toggleCamera = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    const next = !cur.isCameraOff; rtcRef.current?.setCameraOff(next); patch({ isCameraOff: next });
  }, [patch]);

  const switchCamera = useCallback(() => {
    const cur = sessionRef.current; if (!cur) return;
    const facing = cur.cameraFacing === 'back' ? 'front' : 'back';
    rtcRef.current?.switchCamera(facing); patch({ cameraFacing: facing });
  }, [patch]);

  const dismissIncomingSilently = useCallback((callId) => {
    const cur = sessionRef.current;
    if (!cur || cur.callId !== callId) return;
    if (cur.direction !== 'incoming' || cur.state !== 'RINGING') return;
    clearTimers();
    try { stopCallRingtone(); } catch { /* noop */ }
    try { dismissIncomingCallDesktopAlert(); } catch { /* noop */ }
    sessionRef.current = null;
    setSession(null);
  }, [clearTimers]);

  // ─── Bind signaling từ socket ───
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = (p) => {
      if (sessionRef.current && isActiveState(sessionRef.current.state)) {
        socket.emit('reject-call', { callId: p.callId, toUserId: p.fromUserId, reason: 'busy' });
        return;
      }
      const next = {
        callId: p.callId,
        peer: { id: p.fromUserId, name: p.fromName || 'Người gọi', avatar: p.fromAvatar || null },
        direction: 'incoming', media: p.media === 'video' ? 'video' : 'audio',
        state: 'RINGING', connectedAt: null, isMuted: false, isCameraOff: false, error: null,
      };
      sessionRef.current = next; setSession(next);
      try { void playCallRingtone(); } catch { /* noop */ }
      try { showIncomingCallDesktopAlert({ callId: next.callId, fromName: next.peer.name, kind: next.media }); } catch { /* noop */ }
    };

    const onAnswered = async (p) => {
      const cur = sessionRef.current;
      if (!cur || cur.callId !== p.callId || cur.direction !== 'outgoing') return;
      if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
      if (cur.state === 'RINGING') setState('CONNECTING');
      const rtc = rtcRef.current; if (!rtc) return;
      if (offerSentRef.current && lastOfferRef.current) {
        socket.emit('sdp', { callId: cur.callId, toUserId: cur.peer.id, description: lastOfferRef.current });
        return;
      }
      try {
        const offer = await rtc.createOffer();
        lastOfferRef.current = offer; offerSentRef.current = true;
        socket.emit('sdp', { callId: cur.callId, toUserId: cur.peer.id, description: offer });
      } catch (e) {
        patch({ error: e?.message || 'Lỗi tạo offer' });
        socket.emit('end-call', { callId: cur.callId, toUserId: cur.peer.id });
        teardown('ENDED');
      }
    };

    const onSdp = async (p) => {
      const cur = sessionRef.current;
      if (!cur || cur.callId !== p.callId || !rtcRef.current) return;
      try {
        const answer = await rtcRef.current.applyRemoteDescription(p.description);
        if (answer) socket.emit('sdp', { callId: cur.callId, toUserId: cur.peer.id, description: answer });
      } catch { /* noop */ }
    };

    const onIce = (p) => {
      const cur = sessionRef.current;
      if (!cur || cur.callId !== p.callId) return;
      void rtcRef.current?.addRemoteCandidate(p.candidate);
    };

    const onRejected = () => teardown('REJECTED');
    const onEnded = () => teardown('ENDED');
    const onBusy = () => { patch({ error: 'Máy bận' }); teardown('REJECTED'); };
    const onUnavailable = (q) => teardown(q?.reason === 'timeout' ? 'MISSED' : 'ENDED');

    const onDismiss = (p) => {
      if (p?.callId) dismissIncomingSilently(p.callId);
    };

    socket.on('incoming-call', onIncoming);
    socket.on('call-answered', onAnswered);
    socket.on('sdp', onSdp);
    socket.on('ice-candidate', onIce);
    socket.on('call-rejected', onRejected);
    socket.on('call-ended', onEnded);
    socket.on('busy', onBusy);
    socket.on('call-unavailable', onUnavailable);
    socket.on('incoming-call-dismiss', onDismiss);

    return () => {
      socket.off('incoming-call', onIncoming);
      socket.off('call-answered', onAnswered);
      socket.off('sdp', onSdp);
      socket.off('ice-candidate', onIce);
      socket.off('call-rejected', onRejected);
      socket.off('call-ended', onEnded);
      socket.off('busy', onBusy);
      socket.off('call-unavailable', onUnavailable);
      socket.off('incoming-call-dismiss', onDismiss);
    };
  }, [socket, patch, setState, teardown, dismissIncomingSilently]);

  // ─── Group call (legacy mesh) ───
  useEffect(() => {
    if (!socket) return undefined;
    return group.bindGroupHandlers(socket);
  }, [socket, group.bindGroupHandlers]);

  // ── Tương thích ngược cho UI cũ (MessengerHubPage). ──
  const legacyStatus = useMemo(() => {
    const st = session?.state;
    if (!st || st === 'IDLE' || st === 'ENDED' || st === 'MISSED' || st === 'REJECTED') return 'idle';
    if (st === 'CONNECTING') return 'connecting';
    if (st === 'CONNECTED') return 'active';
    if (session?.joinPending) return 'outgoing';
    return session?.direction === 'incoming' ? 'incoming' : 'outgoing';
  }, [session?.state, session?.direction, session?.joinPending]);

  const value = useMemo(() => ({
    session, localStream, remoteStream, uid,
    groupPeers: group.groupPeers,
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera, switchCamera,
    status: legacyStatus,
    callId: session?.callId || null,
    kind: session?.media || 'audio',
    isMuted: !!session?.isMuted,
    startGroupCall: group.startGroupCall,
    joinGroupCall: group.joinGroupCall,
  }), [session, localStream, remoteStream, uid, group.groupPeers, startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera, switchCamera, legacyStatus, group.startGroupCall, group.joinGroupCall]);

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

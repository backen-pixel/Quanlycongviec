/**
 * CallContext — quản lý cuộc gọi thoại 1-1 qua WebRTC.
 *
 * Trạng thái:
 *   - idle:        không có cuộc gọi
 *   - outgoing:    mình đang gọi đi, chờ peer chấp nhận
 *   - incoming:    có cuộc gọi đến, đang chờ mình bấm chấp nhận/từ chối
 *   - connecting:  đã chấp nhận, đang trao đổi SDP/ICE
 *   - active:      đã kết nối, đang nói chuyện
 *
 * Signaling chạy qua socket.io:
 *   client → server: call:invite | call:accept | call:reject | call:end | call:signal
 *   server → client: call:incoming | call:accepted | call:rejected | call:ended | call:signal
 *
 * STUN miễn phí của Google cho NAT traversal. Trong cùng LAN/Wi-Fi sẽ luôn kết nối thẳng.
 * Khi 2 bên ở 2 mạng khác nhau qua NAT khắt khe có thể cần TURN — chưa cấu hình.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '../lib/auth';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const CALL_TIMEOUT_MS = 60_000;
const CallCtx = createContext(null);

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CallProvider({ children }) {
  const { socket, user } = useAuth();
  const uid = user?.userId || user?.id || null;

  const [status, setStatus] = useState('idle');         // idle | outgoing | incoming | connecting | active
  const [callId, setCallId] = useState(null);
  const [peer, setPeer] = useState(null);               // { id, name, avatar }
  const [kind, setKind] = useState('audio');
  const [isMuted, setIsMuted] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]);              // ICE đến trước khi setRemoteDescription
  const timeoutRef = useRef(null);
  const ringbackAudioRef = useRef(null);                // chuông gọi đi (tone)
  const ringtoneAudioRef = useRef(null);                // chuông cuộc gọi đến

  /** Trả về phần tử <audio> ẩn để phát remote stream — tạo lazy 1 lần. */
  const ensureRemoteAudioEl = useCallback(() => {
    if (remoteAudioRef.current) return remoteAudioRef.current;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.style.display = 'none';
    document.body.appendChild(el);
    remoteAudioRef.current = el;
    return el;
  }, []);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.onicecandidate = null; pcRef.current.ontrack = null; pcRef.current.close(); } catch { /* noop */ }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.srcObject = null; } catch { /* noop */ }
    }
    if (ringbackAudioRef.current) {
      try { ringbackAudioRef.current.pause(); } catch { /* noop */ }
      ringbackAudioRef.current = null;
    }
    if (ringtoneAudioRef.current) {
      try { ringtoneAudioRef.current.pause(); } catch { /* noop */ }
      ringtoneAudioRef.current = null;
    }
    pendingCandidatesRef.current = [];
  }, []);

  const resetState = useCallback(() => {
    cleanup();
    setStatus('idle');
    setCallId(null);
    setPeer(null);
    setKind('audio');
    setIsMuted(false);
    setStartedAt(null);
    setError(null);
  }, [cleanup]);

  /** Phát chuông đơn giản bằng Web Audio (không cần file mp3). */
  const playTone = useCallback((variant) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      gain.connect(ctx.destination);
      let stopped = false;
      const loop = () => {
        if (stopped) return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = variant === 'ringtone' ? 520 : 440;
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        setTimeout(loop, variant === 'ringtone' ? 1100 : 1600);
      };
      loop();
      return {
        pause: () => {
          stopped = true;
          try { ctx.close(); } catch { /* noop */ }
        },
      };
    } catch {
      return null;
    }
  }, []);

  /** Tạo RTCPeerConnection, gắn local stream, đăng ký các sự kiện. */
  const createPeerConnection = useCallback((thisCallId, toUserId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('call:signal', {
          callId: thisCallId,
          toUserId,
          signal: { type: 'candidate', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      const el = ensureRemoteAudioEl();
      el.srcObject = stream;
      el.play?.().catch(() => { /* autoplay có thể bị chặn — user sẽ thấy giao diện gọi, tự bấm nút unmute */ });
      setStatus('active');
      setStartedAt((cur) => cur || Date.now());
      // Tắt chuông khi đã kết nối
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      if (ringtoneAudioRef.current) { ringtoneAudioRef.current.pause(); ringtoneAudioRef.current = null; }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        if (state === 'failed') setError('Mất kết nối với người gọi');
        resetState();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [socket, ensureRemoteAudioEl, resetState]);

  /** Lấy microphone (mặc định audio-only). */
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  /** Mình gọi đi cho `peerUser`. */
  const startCall = useCallback(async (peerUser) => {
    if (!socket || !peerUser?.id) {
      setError('Không thể bắt đầu cuộc gọi');
      return;
    }
    if (status !== 'idle') return; // đang có cuộc khác
    setError(null);
    const newCallId = genCallId();
    setCallId(newCallId);
    setPeer({ id: peerUser.id, name: peerUser.name || 'Người dùng', avatar: peerUser.avatar || null });
    setKind('audio');
    setStatus('outgoing');

    try {
      const stream = await getLocalStream();
      const pc = createPeerConnection(newCallId, peerUser.id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      socket.emit('call:invite', { callId: newCallId, toUserId: peerUser.id, kind: 'audio' });

      // Chuông gọi đi cho người dùng
      ringbackAudioRef.current = playTone('ringback');

      // Timeout 60s không trả lời → tự huỷ
      timeoutRef.current = setTimeout(() => {
        setError('Không có phản hồi');
        socket.emit('call:end', { callId: newCallId, toUserId: peerUser.id });
        resetState();
      }, CALL_TIMEOUT_MS);
    } catch (e) {
      setError(e.message || 'Không truy cập được micro');
      resetState();
    }
  }, [socket, status, getLocalStream, createPeerConnection, playTone, resetState]);

  /** Mình chấp nhận cuộc gọi đến — bắt đầu tạo peer connection và emit accept. */
  const acceptCall = useCallback(async () => {
    if (status !== 'incoming' || !peer?.id || !callId || !socket) return;
    setStatus('connecting');
    try {
      const stream = await getLocalStream();
      const pc = createPeerConnection(callId, peer.id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      socket.emit('call:accept', { callId, toUserId: peer.id });
      // Tắt chuông cuộc gọi đến
      if (ringtoneAudioRef.current) { ringtoneAudioRef.current.pause(); ringtoneAudioRef.current = null; }
    } catch (e) {
      setError(e.message || 'Không truy cập được micro');
      socket.emit('call:reject', { callId, toUserId: peer.id, reason: 'mic_error' });
      resetState();
    }
  }, [status, peer, callId, socket, getLocalStream, createPeerConnection, resetState]);

  const rejectCall = useCallback(() => {
    if (!socket || !callId || !peer?.id) {
      resetState();
      return;
    }
    socket.emit('call:reject', { callId, toUserId: peer.id, reason: 'rejected' });
    resetState();
  }, [socket, callId, peer, resetState]);

  const endCall = useCallback(() => {
    if (socket && callId && peer?.id) {
      socket.emit('call:end', { callId, toUserId: peer.id });
    }
    resetState();
  }, [socket, callId, peer, resetState]);

  const toggleMute = useCallback(() => {
    setIsMuted((cur) => {
      const next = !cur;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
      }
      return next;
    });
  }, []);

  /* ── Lắng nghe các event từ server ── */
  useEffect(() => {
    if (!socket || !uid) return undefined;

    const onIncoming = ({ callId: incomingId, kind: incomingKind, fromUserId, fromName }) => {
      if (!incomingId || !fromUserId) return;
      // Đang trong cuộc khác → tự reject để không làm phiền
      if (status !== 'idle' || pcRef.current) {
        socket.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'busy' });
        return;
      }
      setCallId(incomingId);
      setPeer({ id: fromUserId, name: fromName || 'Người gọi', avatar: null });
      setKind(incomingKind || 'audio');
      setStatus('incoming');
      setError(null);
      ringtoneAudioRef.current = playTone('ringtone');

      // Người gọi đến cũng có timeout 60s
      timeoutRef.current = setTimeout(() => {
        socket.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'no_answer' });
        resetState();
      }, CALL_TIMEOUT_MS);
    };

    const onAccepted = async ({ callId: acceptedId }) => {
      if (acceptedId !== callId || !pcRef.current || !peer?.id) return;
      // Người gọi sau khi nhận accepted → tạo offer
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setStatus('connecting');
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      try {
        const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true });
        await pcRef.current.setLocalDescription(offer);
        socket.emit('call:signal', {
          callId: acceptedId,
          toUserId: peer.id,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      } catch (e) {
        setError(e.message || 'Lỗi tạo offer');
        endCall();
      }
    };

    const onRejected = ({ callId: rejectedId, reason }) => {
      if (rejectedId !== callId) return;
      const map = { busy: 'Người được gọi đang bận', no_answer: 'Không có phản hồi' };
      setError(map[reason] || 'Cuộc gọi bị từ chối');
      resetState();
    };

    const onEnded = ({ callId: endedId }) => {
      if (endedId !== callId) return;
      resetState();
    };

    const onSignal = async ({ callId: sigCallId, signal }) => {
      if (sigCallId !== callId || !pcRef.current || !peer?.id) return;
      try {
        if (signal.type === 'offer') {
          await pcRef.current.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          // Xử lý các candidate đã đến trước
          for (const c of pendingCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(c); } catch { /* noop */ }
          }
          pendingCandidatesRef.current = [];
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('call:signal', {
            callId,
            toUserId: peer.id,
            signal: { type: 'answer', sdp: answer.sdp },
          });
        } else if (signal.type === 'answer') {
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          for (const c of pendingCandidatesRef.current) {
            try { await pcRef.current.addIceCandidate(c); } catch { /* noop */ }
          }
          pendingCandidatesRef.current = [];
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            try { await pcRef.current.addIceCandidate(signal.candidate); } catch { /* noop */ }
          } else {
            pendingCandidatesRef.current.push(signal.candidate);
          }
        }
      } catch (e) {
        setError(e.message || 'Lỗi xử lý tín hiệu');
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:signal', onSignal);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:signal', onSignal);
    };
  }, [socket, uid, status, callId, peer, endCall, resetState, playTone]);

  // Cleanup khi unmount toàn bộ provider
  useEffect(() => () => { cleanup(); }, [cleanup]);

  const value = useMemo(
    () => ({
      status,
      callId,
      peer,
      kind,
      isMuted,
      startedAt,
      error,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
    }),
    [status, callId, peer, kind, isMuted, startedAt, error, startCall, acceptCall, rejectCall, endCall, toggleMute],
  );

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall phải dùng bên trong <CallProvider>');
  return ctx;
}

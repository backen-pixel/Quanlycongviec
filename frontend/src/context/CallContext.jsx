/**
 * CallContext — quản lý cuộc gọi thoại qua WebRTC.
 *
 * Hỗ trợ 2 chế độ:
 *   - 1-1 (mode='direct'): 1 RTCPeerConnection duy nhất giữa 2 user.
 *   - Nhóm (mode='group'): topology MESH — mỗi cặp người 1 RTCPeerConnection.
 *     Thích hợp ≤ 6 người. Trên 6 người cần SFU server (chưa hỗ trợ).
 *
 * Trạng thái:
 *   - idle:        không có cuộc gọi
 *   - outgoing:    mình bắt đầu cuộc gọi đi (direct chờ peer / group chờ ai đó accept)
 *   - incoming:    có cuộc gọi đến, đang chờ mình bấm chấp nhận/từ chối
 *   - connecting:  đã chấp nhận, đang trao đổi SDP/ICE
 *   - active:      đã có ít nhất 1 remote audio stream — đang nói chuyện
 *
 * Signaling chạy qua socket.io. Xem `backend/src/server.js` để biết các event.
 *
 * STUN miễn phí của Google cho NAT traversal. Trong cùng LAN/Wi-Fi sẽ luôn kết nối thẳng.
 * Khi 2 bên ở 2 mạng khác nhau qua NAT khắt khe có thể cần TURN — chưa cấu hình.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '../lib/auth';
import {
  dismissIncomingCallDesktopAlert,
  showIncomingCallDesktopAlert,
} from '../lib/incomingCallNotify';
import { playCallRingtone, stopCallRingtone } from '../lib/callRingtonePlayer';
import { fetchGlobalCallRingtoneConfig } from '../lib/callRingtoneServer';

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

/** Tuỳ chọn createOffer/createAnswer — bật recv video khi cuộc gọi video. */
function buildOfferOptions(isVideo) {
  return isVideo
    ? { offerToReceiveAudio: true, offerToReceiveVideo: true }
    : { offerToReceiveAudio: true };
}

async function flushIceCandidates(pc, pendingCandidates) {
  const list = pendingCandidates.splice(0);
  for (const c of list) {
    try { await pc.addIceCandidate(c); } catch { /* noop */ }
  }
}

/**
 * Xử lý SDP/ICE an toàn — tránh lỗi "Called in wrong state: stable".
 * - answer: chỉ apply khi signalingState === 'have-local-offer'
 * - offer: rollback nếu đang have-local-offer (glare), bỏ qua nếu state không hợp lệ
 */
async function applyPeerSignal(pc, pendingCandidates, signal, replyFn) {
  if (!pc || !signal) return;
  if (signal.type === 'offer') {
    const state = pc.signalingState;
    if (state === 'have-local-offer') {
      try {
        await pc.setLocalDescription({ type: 'rollback' });
      } catch {
        return;
      }
    } else if (state !== 'stable') {
      return;
    }
    await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    await flushIceCandidates(pc, pendingCandidates);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    replyFn?.({ type: 'answer', sdp: answer.sdp });
  } else if (signal.type === 'answer') {
    if (pc.signalingState !== 'have-local-offer') {
      console.warn('[Call] Bỏ qua answer — signalingState=', pc.signalingState);
      return;
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    await flushIceCandidates(pc, pendingCandidates);
  } else if (signal.type === 'candidate' && signal.candidate) {
    if (pc.remoteDescription?.type) {
      try { await pc.addIceCandidate(signal.candidate); } catch { /* noop */ }
    } else {
      pendingCandidates.push(signal.candidate);
    }
  }
}

export function CallProvider({ children }) {
  const { socket, user } = useAuth();
  const uid = user?.userId || user?.id || null;

  /* ── Shared state cho cả direct lẫn group ── */
  const [status, setStatus] = useState('idle');     // idle | outgoing | incoming | connecting | active
  const [mode, setMode] = useState('direct');       // direct | group
  const [callId, setCallId] = useState(null);
  const [kind, setKind] = useState('audio');        // 'audio' | 'video'
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);   // chỉ ý nghĩa khi kind='video'
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [error, setError] = useState(null);
  const [localStream, setLocalStream] = useState(null);   // expose ra UI để render <video> self-preview

  /* ── Direct call ── */
  const [peer, setPeer] = useState(null);           // { id, name, avatar }
  const [directRemoteStream, setDirectRemoteStream] = useState(null);
  const directPcRef = useRef(null);
  const directRemoteAudioRef = useRef(null);
  const directPendingCandidatesRef = useRef([]);

  /* ── Group call ── */
  const [groupInfo, setGroupInfo] = useState(null); // { id, name, hostId }
  /** Map<requesterId, { name, requestedAt }> — yêu cầu join chờ duyệt (chỉ host nhìn thấy). */
  const [pendingJoinRequests, setPendingJoinRequests] = useState({});
  /**
   * Object thay vì Map để React diff dễ. Key = userId.
   * Value: { name, avatar, joined: boolean, hasStream: boolean, muted?: boolean }
   * `joined=false` nghĩa là đang được mời / chờ accept (chỉ host biết trước).
   */
  const [participants, setParticipants] = useState({});
  /** Map<userId, { pc, audioEl, pendingCandidates: [], iceQueue: [], makingOffer: false }> */
  const groupPeersRef = useRef(new Map());

  /* ── Resources ── */
  const localStreamRef = useRef(null);
  /** Lưu camera video track gốc trước khi replace bằng screen-share, để khi dừng share thì revert. */
  const originalCameraTrackRef = useRef(null);
  /** Screen-share stream hiện tại (nếu mình đang share). Dùng để stop khi end call hoặc toggle. */
  const screenStreamRef = useRef(null);
  const timeoutRef = useRef(null);
  const ringbackAudioRef = useRef(null);
  const ringtoneAudioRef = useRef(null);
  const callIdRef = useRef(null);                   // sync ref cho dùng trong handler socket
  const modeRef = useRef('direct');
  const kindRef = useRef('audio');
  const statusRef = useRef('idle');
  const peerRef = useRef(null);
  /** Offer đến trước khi callee kịp tạo PC (acceptCall async). */
  const directPendingOfferRef = useRef(null);
  /** Tránh tạo offer trùng lặp phía caller. */
  const directMakingOfferRef = useRef(false);
  /** Khi user bấm "Tham gia" banner → emit request_join, lưu callId vào đây.
   *  Khi nhận `call:incoming` cho callId này → auto-accept (host đã duyệt). */
  const pendingApproveCallIdRef = useRef(null);

  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { kindRef.current = kind; }, [kind]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { peerRef.current = peer; }, [peer]);

  useEffect(() => {
    if (uid) void fetchGlobalCallRingtoneConfig();
  }, [uid]);

  /* ── Helpers ── */

  /** Tạo element <audio> ẩn để phát remote stream. */
  const createAudioElement = useCallback(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }, []);

  /** Phát chuông đơn giản bằng Web Audio (fallback khi chưa chọn file từ máy). */
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

  /** Chuông cuộc gọi: file tùy chỉnh (IndexedDB) hoặc fallback playTone. */
  const startCallSound = useCallback((variant) => {
    let inner = null;
    let stopped = false;
    const handle = {
      pause: () => {
        stopped = true;
        inner?.pause?.();
        stopCallRingtone();
      },
    };
    void playCallRingtone(variant, playTone).then((ctrl) => {
      if (stopped) {
        ctrl?.pause?.();
        return;
      }
      inner = ctrl;
    });
    return handle;
  }, [playTone]);

  /**
   * Lấy microphone (và camera nếu `opts.video=true`).
   * Nếu đã có stream nhưng yêu cầu video mà chưa có track video → cố mở camera
   * và replaceTrack trên các peer connection (cho phép bật camera trong lúc đang gọi).
   */
  const getLocalStream = useCallback(async (opts = {}) => {
    const wantVideo = !!opts.video;
    const cur = localStreamRef.current;

    if (cur) {
      const hasVideo = cur.getVideoTracks().length > 0;
      if (wantVideo && !hasVideo) {
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          const vTrack = vStream.getVideoTracks()[0];
          if (vTrack) {
            cur.addTrack(vTrack);
            // Push track vào mọi peer connection hiện có
            if (directPcRef.current) {
              try { directPcRef.current.addTrack(vTrack, cur); } catch { /* noop */ }
            }
            for (const { pc } of groupPeersRef.current.values()) {
              try { pc.addTrack(vTrack, cur); } catch { /* noop */ }
            }
            setLocalStream(cur);
            setCameraOn(true);
          }
        } catch (e) {
          console.warn('Không bật được camera:', e);
        }
      }
      return cur;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? { width: 640, height: 480 } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    // Đồng bộ trạng thái muted / cameraOn hiện tại
    setIsMuted((curM) => {
      stream.getAudioTracks().forEach((t) => { t.enabled = !curM; });
      return curM;
    });
    setCameraOn((curC) => {
      stream.getVideoTracks().forEach((t) => { t.enabled = curC; });
      return curC;
    });
    // Safety: nếu có PC đã được tạo trước getUserMedia (race) → bổ sung tracks ngay.
    const tracks = stream.getTracks();
    const addTracksToPc = (pc) => {
      const existingKinds = new Set(pc.getSenders().filter((s) => s.track).map((s) => s.track.kind));
      tracks.forEach((t) => {
        if (!existingKinds.has(t.kind)) {
          try { pc.addTrack(t, stream); } catch { /* noop */ }
        }
      });
    };
    if (directPcRef.current) addTracksToPc(directPcRef.current);
    for (const { pc } of groupPeersRef.current.values()) addTracksToPc(pc);
    return stream;
  }, []);

  /** Đóng + dọn 1 peer-entry trong groupPeersRef. */
  const closeGroupPeer = useCallback((userId) => {
    const entry = groupPeersRef.current.get(userId);
    if (!entry) return;
    try { entry.pc.onicecandidate = null; entry.pc.ontrack = null; entry.pc.close(); } catch { /* noop */ }
    if (entry.audioEl) {
      try { entry.audioEl.srcObject = null; entry.audioEl.remove(); } catch { /* noop */ }
    }
    groupPeersRef.current.delete(userId);
  }, []);

  /** Dọn toàn bộ: peer connections, audio elements, local stream, timer, chuông. */
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Direct
    if (directPcRef.current) {
      try { directPcRef.current.onicecandidate = null; directPcRef.current.ontrack = null; directPcRef.current.close(); } catch { /* noop */ }
      directPcRef.current = null;
    }
    if (directRemoteAudioRef.current) {
      try { directRemoteAudioRef.current.srcObject = null; directRemoteAudioRef.current.remove(); } catch { /* noop */ }
      directRemoteAudioRef.current = null;
    }
    directPendingCandidatesRef.current = [];
    directPendingOfferRef.current = null;
    directMakingOfferRef.current = false;
    // Group
    for (const userId of [...groupPeersRef.current.keys()]) closeGroupPeer(userId);
    // Local mic & camera
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      try { screenStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      screenStreamRef.current = null;
    }
    if (originalCameraTrackRef.current) {
      try { originalCameraTrackRef.current.stop(); } catch { /* noop */ }
      originalCameraTrackRef.current = null;
    }
    setLocalStream(null);
    setDirectRemoteStream(null);
    // Chuông
    if (ringbackAudioRef.current) { try { ringbackAudioRef.current.pause(); } catch { /* noop */ } ringbackAudioRef.current = null; }
    if (ringtoneAudioRef.current) { try { ringtoneAudioRef.current.pause(); } catch { /* noop */ } ringtoneAudioRef.current = null; }
    stopCallRingtone();
  }, [closeGroupPeer]);

  const resetState = useCallback(() => {
    dismissIncomingCallDesktopAlert();
    cleanup();
    setStatus('idle');
    setMode('direct');
    setCallId(null);
    setPeer(null);
    setGroupInfo(null);
    setParticipants({});
    setPendingJoinRequests({});
    setKind('audio');
    setIsMuted(false);
    setCameraOn(true);
    setIsScreenSharing(false);
    setStartedAt(null);
    setError(null);
  }, [cleanup]);

  /* ─── DIRECT call helpers ─── */

  /** Tạo RTCPeerConnection cho cuộc gọi 1-1. */
  const createDirectPeerConnection = useCallback((thisCallId, toUserId) => {
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
      setDirectRemoteStream(stream);
      // Chỉ dùng <audio> ẩn khi không có video track (UI sẽ render <video> nếu có)
      const hasVideo = stream.getVideoTracks().length > 0;
      if (!hasVideo) {
        if (!directRemoteAudioRef.current) directRemoteAudioRef.current = createAudioElement();
        directRemoteAudioRef.current.srcObject = stream;
        directRemoteAudioRef.current.play?.().catch(() => { /* autoplay có thể bị chặn */ });
      } else if (directRemoteAudioRef.current) {
        try { directRemoteAudioRef.current.srcObject = null; } catch { /* noop */ }
      }
      setStatus('active');
      setStartedAt((cur) => cur || Date.now());
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

    directPcRef.current = pc;
    return pc;
  }, [socket, createAudioElement, resetState]);

  /* ─── GROUP call helpers ─── */

  /**
   * Tạo (hoặc lấy) RTCPeerConnection với 1 peer trong group call.
   * @param {string} thisCallId
   * @param {string} peerUserId
   * @returns {{pc: RTCPeerConnection, audioEl: HTMLAudioElement, pendingCandidates: RTCIceCandidateInit[]}}
   */
  const getOrCreateGroupPeer = useCallback((thisCallId, peerUserId) => {
    const existing = groupPeersRef.current.get(peerUserId);
    if (existing) {
      // Safety: nếu PC chưa có tracks gửi đi (race) → bổ sung
      if (localStreamRef.current) {
        const existingKinds = new Set(
          existing.pc.getSenders().filter((s) => s.track).map((s) => s.track.kind),
        );
        for (const t of localStreamRef.current.getTracks()) {
          if (!existingKinds.has(t.kind)) {
            try { existing.pc.addTrack(t, localStreamRef.current); } catch { /* noop */ }
          }
        }
      }
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audioEl = createAudioElement();
    const entry = { pc, audioEl, pendingCandidates: [], makingOffer: false };

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('call:signal', {
          callId: thisCallId,
          toUserId: peerUserId,
          signal: { type: 'candidate', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      const hasVideo = stream.getVideoTracks().length > 0;
      // Audio playback: dùng <audio> ẩn khi không có video; nếu có video thì UI sẽ render <video>
      if (!hasVideo) {
        audioEl.srcObject = stream;
        audioEl.play?.().catch(() => { /* autoplay có thể bị chặn */ });
      } else {
        try { audioEl.srcObject = null; } catch { /* noop */ }
      }
      setStatus('active');
      setStartedAt((cur) => cur || Date.now());
      setParticipants((cur) => {
        if (!cur[peerUserId]) return cur;
        return { ...cur, [peerUserId]: { ...cur[peerUserId], hasStream: true, stream, hasVideo } };
      });
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      if (ringtoneAudioRef.current) { ringtoneAudioRef.current.pause(); ringtoneAudioRef.current = null; }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        closeGroupPeer(peerUserId);
        setParticipants((cur) => {
          if (!cur[peerUserId]) return cur;
          return { ...cur, [peerUserId]: { ...cur[peerUserId], hasStream: false, stream: null, hasVideo: false } };
        });
      }
    };

    // Gắn local stream nếu đã có
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
      } catch { /* noop */ }
    }

    groupPeersRef.current.set(peerUserId, entry);
    return entry;
  }, [socket, createAudioElement, closeGroupPeer]);

  /* ─── PUBLIC: bắt đầu cuộc gọi ─── */

  /**
   * Mình gọi đi 1-1.
   * @param {{id, name, avatar}} peerUser
   * @param {{video?: boolean}} [opts]
   */
  const startCall = useCallback(async (peerUser, opts = {}) => {
    if (!socket || !peerUser?.id) {
      setError('Không thể bắt đầu cuộc gọi');
      return;
    }
    if (status !== 'idle') return;
    const wantVideo = !!opts.video;
    setError(null);
    const newCallId = genCallId();
    // Cập nhật refs đồng bộ ngay — tránh race khi callee reject nhanh trước khi useEffect chạy.
    callIdRef.current = newCallId;
    statusRef.current = 'outgoing';
    modeRef.current = 'direct';
    peerRef.current = { id: peerUser.id, name: peerUser.name || 'Người dùng', avatar: peerUser.avatar || null };
    setCallId(newCallId);
    setMode('direct');
    setPeer({ id: peerUser.id, name: peerUser.name || 'Người dùng', avatar: peerUser.avatar || null });
    setKind(wantVideo ? 'video' : 'audio');
    setCameraOn(wantVideo);
    setStatus('outgoing');

    try {
      const stream = await getLocalStream({ video: wantVideo });
      const pc = createDirectPeerConnection(newCallId, peerUser.id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      socket.emit('call:invite', {
        callId: newCallId,
        toUserId: peerUser.id,
        kind: wantVideo ? 'video' : 'audio',
        groupId: opts.groupId || null,
      });
      ringbackAudioRef.current = startCallSound('ringback');
      timeoutRef.current = setTimeout(() => {
        setError('Không có phản hồi');
        socket.emit('call:end', { callId: newCallId, toUserId: peerUser.id });
        resetState();
      }, CALL_TIMEOUT_MS);
    } catch (e) {
      setError(e.message || (wantVideo ? 'Không truy cập được camera/micro' : 'Không truy cập được micro'));
      resetState();
    }
  }, [socket, status, getLocalStream, createDirectPeerConnection, startCallSound, resetState]);

  /**
   * Bắt đầu cuộc gọi nhóm.
   * @param {{id: string, name: string, members: Array<{id: string, name?: string, avatar?: string}>}} group
   * @param {{video?: boolean}} [opts]
   */
  const startGroupCall = useCallback(async (group, opts = {}) => {
    if (!socket || !group?.id || !uid) {
      setError('Không thể bắt đầu cuộc gọi nhóm');
      return;
    }
    if (status !== 'idle') return;
    const members = Array.isArray(group.members) ? group.members.filter((m) => m && m.id && m.id !== uid) : [];
    if (members.length === 0) {
      setError('Nhóm không có thành viên khác');
      return;
    }

    const wantVideo = !!opts.video;
    setError(null);
    const newCallId = genCallId();
    // Cập nhật refs đồng bộ ngay — tránh race khi thành viên reject nhanh trước khi useEffect chạy.
    callIdRef.current = newCallId;
    statusRef.current = 'outgoing';
    modeRef.current = 'group';
    setCallId(newCallId);
    setMode('group');
    setGroupInfo({ id: group.id, name: group.name || 'Nhóm chat', hostId: uid });
    setKind(wantVideo ? 'video' : 'audio');
    setCameraOn(wantVideo);
    setStatus('outgoing');

    // Khởi tạo participants: bản thân = joined; thành viên khác = invited
    const myName = user?.fullName || user?.full_name || 'Bạn';
    const initial = { [uid]: { name: myName, avatar: user?.avatar || null, joined: true, hasStream: false, isMe: true } };
    members.forEach((m) => {
      initial[m.id] = { name: m.name || 'Thành viên', avatar: m.avatar || null, joined: false, hasStream: false };
    });
    setParticipants(initial);

    try {
      await getLocalStream({ video: wantVideo });
      socket.emit('call:group_start', {
        callId: newCallId,
        groupId: group.id,
        groupName: group.name,
        memberIds: members.map((m) => m.id),
        kind: wantVideo ? 'video' : 'audio',
      });
      ringbackAudioRef.current = startCallSound('ringback');

      // Timeout: nếu sau 60s không ai accept → tự huỷ
      timeoutRef.current = setTimeout(() => {
        const joinedCount = [...groupPeersRef.current.values()].length;
        if (joinedCount === 0) {
          setError('Không có ai phản hồi');
          socket.emit('call:end', { callId: newCallId });
          resetState();
        }
      }, CALL_TIMEOUT_MS);
    } catch (e) {
      setError(e.message || 'Không truy cập được micro');
      socket.emit('call:end', { callId: newCallId });
      resetState();
    }
  }, [socket, uid, user, status, getLocalStream, startCallSound, resetState]);

  /**
   * Yêu cầu tham gia 1 cuộc gọi nhóm đang diễn ra. Host phải duyệt trước khi user vào được.
   * Trạng thái sẽ là `outgoing` (giống "đang chờ phản hồi"), khi host approve → backend gửi
   * `call:incoming` → onIncoming auto-accept (vì đã set `pendingApproveCallIdRef`).
   *
   * @param {{ callId, groupId, groupName, kind, hostId, hostName }} info
   */
  const joinGroupCall = useCallback((info) => {
    if (!socket || !info?.callId || !info?.groupId) {
      setError('Không thể tham gia cuộc gọi');
      return;
    }
    if (status !== 'idle') return;
    const wantVideo = info.kind === 'video';
    setError(null);
    setCallId(info.callId);
    setMode('group');
    setKind(wantVideo ? 'video' : 'audio');
    setCameraOn(wantVideo);
    setGroupInfo({ id: info.groupId, name: info.groupName || 'Nhóm chat', hostId: info.hostId });
    setPeer({ id: info.hostId, name: info.hostName || 'Người gọi', avatar: null });
    setParticipants({}); // chưa join chính thức, chưa biết participants
    setStatus('outgoing'); // sẽ đổi thành 'connecting' khi host approve
    pendingApproveCallIdRef.current = info.callId;
    socket.emit('call:group_request_join', { callId: info.callId });
    // Timeout: nếu host không duyệt trong 60s → tự huỷ
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (pendingApproveCallIdRef.current === info.callId) {
        pendingApproveCallIdRef.current = null;
        try { socket.emit('call:group_cancel_join', { callId: info.callId }); } catch { /* noop */ }
        setError('Chủ phòng không phản hồi yêu cầu tham gia');
        resetState();
      }
    }, CALL_TIMEOUT_MS);
  }, [socket, status, resetState]);

  /** Host approve 1 yêu cầu tham gia. */
  const approveJoinRequest = useCallback((requesterId) => {
    if (!socket || !callId) return;
    socket.emit('call:group_approve_join', { callId, requesterId });
    setPendingJoinRequests((cur) => {
      const next = { ...cur };
      delete next[requesterId];
      return next;
    });
  }, [socket, callId]);

  /** Host từ chối 1 yêu cầu tham gia. */
  const denyJoinRequest = useCallback((requesterId) => {
    if (!socket || !callId) return;
    socket.emit('call:group_deny_join', { callId, requesterId });
    setPendingJoinRequests((cur) => {
      const next = { ...cur };
      delete next[requesterId];
      return next;
    });
  }, [socket, callId]);

  /* ─── PUBLIC: chấp nhận / từ chối / kết thúc ─── */

  const acceptCall = useCallback(async () => {
    if (status !== 'incoming' || !callId || !socket) return;
    dismissIncomingCallDesktopAlert();
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (ringtoneAudioRef.current) { ringtoneAudioRef.current.pause(); ringtoneAudioRef.current = null; }
    setStatus('connecting');

    try {
      const wantVideo = kind === 'video';
      setCameraOn(wantVideo);
      if (mode === 'group') {
        socket.emit('call:group_join', { callId });
        setParticipants((cur) => ({
          ...cur,
          [uid]: { name: user?.fullName || 'Bạn', avatar: user?.avatar || null, joined: true, hasStream: false, isMe: true },
        }));
      } else if (peer?.id) {
        socket.emit('call:accept', { callId, toUserId: peer.id });
      } else {
        return;
      }

      await getLocalStream({ video: wantVideo });
      if (mode === 'group') {
        // group_join đã emit ở trên
      } else {
        // Direct: tạo PC; caller sẽ tạo offer sau call:accepted
        if (!peer?.id) return;
        const stream = localStreamRef.current;
        const pc = createDirectPeerConnection(callId, peer.id);
        if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const pendingOffer = directPendingOfferRef.current;
        if (pendingOffer?.type === 'offer') {
          directPendingOfferRef.current = null;
          await applyPeerSignal(pc, directPendingCandidatesRef.current, pendingOffer, (reply) => {
            socket.emit('call:signal', {
              callId,
              toUserId: peer.id,
              signal: reply,
            });
          });
        }
      }
    } catch (e) {
      setError(e.message || (kind === 'video' ? 'Không truy cập được camera/micro' : 'Không truy cập được micro'));
      if (mode === 'group') {
        socket.emit('call:reject', { callId, reason: 'mic_error' });
      } else if (peer?.id) {
        socket.emit('call:reject', { callId, toUserId: peer.id, reason: 'mic_error' });
      }
      resetState();
    }
  }, [status, callId, socket, mode, kind, peer, uid, user, getLocalStream, createDirectPeerConnection, resetState]);

  const rejectCall = useCallback(() => {
    if (!socket || !callId) {
      resetState();
      return;
    }
    if (mode === 'group') {
      socket.emit('call:reject', { callId, reason: 'rejected' });
    } else if (peer?.id) {
      socket.emit('call:reject', { callId, toUserId: peer.id, reason: 'rejected' });
    }
    resetState();
  }, [socket, callId, mode, peer, resetState]);

  const endCall = useCallback(() => {
    if (socket && callId) {
      if (mode === 'group') {
        socket.emit('call:end', { callId });
      } else if (peer?.id) {
        socket.emit('call:end', { callId, toUserId: peer.id });
      }
    }
    resetState();
  }, [socket, callId, mode, peer, resetState]);

  const toggleMute = useCallback(() => {
    setIsMuted((cur) => {
      const next = !cur;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
      }
      return next;
    });
  }, []);

  /**
   * Bật/tắt camera.
   * - Nếu local stream đã có video track → chỉ enable/disable.
   * - Nếu chưa có (cuộc gọi bắt đầu audio-only) và bật lên → cố mở camera + addTrack
   *   nhưng các peer connection sẽ cần renegotiate (createOffer mới) — chưa tự động làm cho
   *   group call. Cho v1, đề nghị bật camera ngay từ đầu khi gọi.
   */
  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      // Cố mở camera; KHÔNG addTrack vào PC để tránh phải renegotiate.
      // Chỉ hữu ích cho self-preview. Cuộc gọi audio-only thì khuyên bấm "Gọi video" thay vì toggle.
      try {
        await getLocalStream({ video: true });
        setCameraOn(true);
      } catch { /* noop */ }
      return;
    }
    setCameraOn((cur) => {
      const next = !cur;
      tracks.forEach((t) => { t.enabled = next; });
      return next;
    });
  }, [getLocalStream]);

  /**
   * Bắt đầu chia sẻ màn hình. Dùng `getDisplayMedia` rồi `replaceTrack` trên TẤT CẢ
   * peer connection (1-1 + group mesh). Track camera gốc được lưu để revert khi stop.
   *
   * Lưu ý:
   * - Cuộc gọi audio-only chưa có video transceiver → cần addTrack + renegotiate (chưa hỗ trợ v1).
   *   Vì vậy chỉ cho phép share khi `kind === 'video'`.
   * - Cùng lúc CHỈ 1 người trong cuộc có thể là "spotlight" trên UI (hiện theo `participants.{id}.isScreenSharing`),
   *   nhưng technically nhiều người có thể share song song — UI sẽ ưu tiên người share gần nhất.
   */
  const startScreenShare = useCallback(async () => {
    if (kind !== 'video') {
      setError('Chỉ chia sẻ màn hình trong cuộc gọi video');
      return;
    }
    if (isScreenSharing) return;
    if (!localStreamRef.current) {
      setError('Chưa có local stream');
      return;
    }
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch (e) {
      // User cancel hoặc browser không hỗ trợ
      if (e?.name !== 'NotAllowedError') setError(e.message || 'Không thể chia sẻ màn hình');
      return;
    }
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) {
      setError('Không có video track từ màn hình');
      try { displayStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      return;
    }

    // Lưu camera track gốc để revert (nếu chưa có)
    const cameraTrack = localStreamRef.current.getVideoTracks()[0] || null;
    if (cameraTrack && !originalCameraTrackRef.current) {
      originalCameraTrackRef.current = cameraTrack;
    }

    // Replace track trên mọi peer connection
    const replaceOnPc = (pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) return sender.replaceTrack(screenTrack);
      return pc.addTrack(screenTrack, localStreamRef.current);
    };
    try {
      if (directPcRef.current) await replaceOnPc(directPcRef.current);
      for (const { pc } of groupPeersRef.current.values()) await replaceOnPc(pc);
    } catch (e) {
      console.warn('screen-share replaceTrack error', e);
    }

    // Update localStream: remove camera video, add screen track
    if (cameraTrack) {
      try { localStreamRef.current.removeTrack(cameraTrack); } catch { /* noop */ }
    }
    localStreamRef.current.addTrack(screenTrack);
    setLocalStream(localStreamRef.current);
    screenStreamRef.current = displayStream;
    setIsScreenSharing(true);
    setCameraOn(true); // screen track luôn enabled
    if (cameraTrack) cameraTrack.enabled = false; // tạm tắt camera (không stop để revert được)

    // Khi user dừng share từ browser → tự động stopScreenShare
    screenTrack.onended = () => { void stopScreenShare(); }; // eslint-disable-line no-use-before-define

    // Broadcast cho người khác
    if (socket && callId) {
      if (mode === 'group') {
        socket.emit('call:group_screen_share', { callId, sharing: true });
      } else if (peer?.id) {
        socket.emit('call:screen_share', { callId, toUserId: peer.id, sharing: true });
      }
    }
    // Cập nhật participants của chính mình để UI biết
    if (mode === 'group') {
      setParticipants((cur) => ({
        ...cur,
        [uid]: { ...(cur[uid] || {}), isScreenSharing: true },
      }));
    }
  }, [kind, isScreenSharing, socket, callId, mode, peer, uid]);

  /** Dừng chia sẻ màn hình, revert về camera track (nếu có). */
  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharing) return;
    const display = screenStreamRef.current;
    const screenTrack = display?.getVideoTracks()[0];
    const cameraTrack = originalCameraTrackRef.current;

    // Replace lại camera track trên mọi peer connection
    const replaceOnPc = async (pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (!sender) return;
      try {
        if (cameraTrack) await sender.replaceTrack(cameraTrack);
        else await sender.replaceTrack(null);
      } catch (e) {
        console.warn('stopScreenShare replaceTrack error', e);
      }
    };
    if (directPcRef.current) await replaceOnPc(directPcRef.current);
    for (const { pc } of groupPeersRef.current.values()) await replaceOnPc(pc);

    // Stop screen tracks
    if (display) {
      try { display.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    }
    screenStreamRef.current = null;

    // Update localStream
    if (localStreamRef.current) {
      if (screenTrack) {
        try { localStreamRef.current.removeTrack(screenTrack); } catch { /* noop */ }
      }
      if (cameraTrack) {
        cameraTrack.enabled = true;
        if (!localStreamRef.current.getVideoTracks().includes(cameraTrack)) {
          try { localStreamRef.current.addTrack(cameraTrack); } catch { /* noop */ }
        }
      }
    }
    setLocalStream(localStreamRef.current);
    originalCameraTrackRef.current = null;
    setIsScreenSharing(false);

    if (socket && callId) {
      if (mode === 'group') {
        socket.emit('call:group_screen_share', { callId, sharing: false });
      } else if (peer?.id) {
        socket.emit('call:screen_share', { callId, toUserId: peer.id, sharing: false });
      }
    }
    if (mode === 'group') {
      setParticipants((cur) => ({
        ...cur,
        [uid]: { ...(cur[uid] || {}), isScreenSharing: false },
      }));
    }
  }, [isScreenSharing, socket, callId, mode, peer, uid]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) void stopScreenShare();
    else void startScreenShare();
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  /* ─── Lắng nghe các event từ server ─── */
  useEffect(() => {
    if (!socket || !uid) return undefined;

    /** Cuộc gọi đến (1-1 hoặc nhóm) */
    const onIncoming = async ({ callId: incomingId, kind: incomingKind, fromUserId, fromName, isGroup, groupId, groupName }) => {
      if (!incomingId || !fromUserId) return;

      // Trường hợp đặc biệt: user đã chủ động bấm "Tham gia" trên banner → đã set state outgoing.
      // Backend giờ approve → server gửi incoming. Auto-accept không cần hỏi.
      if (isGroup && pendingApproveCallIdRef.current === incomingId && callIdRef.current === incomingId) {
        pendingApproveCallIdRef.current = null;
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        try {
          const wantVideo = (incomingKind || 'audio') === 'video';
          await getLocalStream({ video: wantVideo });
          setStatus('connecting');
          // Khởi tạo participants chỉ với host (sẽ được mở rộng qua `call:group_participants`)
          setParticipants((cur) => ({
            ...cur,
            [uid]: { name: user?.fullName || user?.full_name || 'Bạn', avatar: user?.avatar || null, joined: true, hasStream: false, isMe: true },
            [fromUserId]: { ...(cur[fromUserId] || {}), name: fromName || cur[fromUserId]?.name || 'Người gọi', joined: true, hasStream: false, isHost: true },
          }));
          socket.emit('call:group_join', { callId: incomingId });
        } catch (e) {
          setError(e.message || 'Không truy cập được micro');
          try { socket.emit('call:end', { callId: incomingId }); } catch { /* noop */ }
          resetState();
        }
        return;
      }

      // Đang trong cuộc khác → tự reject; trùng callId đang trả lời thì bỏ qua.
      const curStatus = statusRef.current;
      const curCallId = callIdRef.current;
      if (curStatus !== 'idle' || directPcRef.current || groupPeersRef.current.size > 0) {
        if (
          incomingId === curCallId
          && (curStatus === 'incoming' || curStatus === 'connecting' || curStatus === 'active')
        ) {
          return;
        }
        if (isGroup) socket.emit('call:reject', { callId: incomingId, reason: 'busy' });
        else socket.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'busy' });
        return;
      }
      setCallId(incomingId);
      setKind(incomingKind || 'audio');
      setStatus('incoming');
      setError(null);
      if (isGroup) {
        setMode('group');
        setGroupInfo({ id: groupId, name: groupName || 'Cuộc gọi nhóm', hostId: fromUserId });
        setParticipants({
          [fromUserId]: { name: fromName || 'Người gọi', avatar: null, joined: true, hasStream: false, isHost: true },
        });
        setPeer({ id: fromUserId, name: fromName || 'Người gọi', avatar: null });
      } else {
        setMode('direct');
        setPeer({ id: fromUserId, name: fromName || 'Người gọi', avatar: null });
      }
      ringtoneAudioRef.current = startCallSound('ringtone');
      showIncomingCallDesktopAlert({
        callId: incomingId,
        fromName,
        kind: incomingKind || 'audio',
        isGroup: !!isGroup,
        groupName: groupName || '',
      });
      timeoutRef.current = setTimeout(() => {
        if (isGroup) socket.emit('call:reject', { callId: incomingId, reason: 'no_answer' });
        else socket.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'no_answer' });
        resetState();
      }, CALL_TIMEOUT_MS);
    };

    /** Direct: peer accept → mình tạo offer. */
    const onAccepted = async ({ callId: acceptedId }) => {
      if (acceptedId !== callIdRef.current || modeRef.current !== 'direct' || !directPcRef.current || !peerRef.current?.id) return;
      if (directPcRef.current.signalingState !== 'stable' || directMakingOfferRef.current) return;
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setStatus('connecting');
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      directMakingOfferRef.current = true;
      try {
        const isVideo = kindRef.current === 'video';
        const offer = await directPcRef.current.createOffer(buildOfferOptions(isVideo));
        await directPcRef.current.setLocalDescription(offer);
        socket.emit('call:signal', {
          callId: acceptedId,
          toUserId: peerRef.current.id,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      } catch (e) {
        setError(e.message || 'Lỗi tạo offer');
        endCall();
      } finally {
        directMakingOfferRef.current = false;
      }
    };

    /** Direct: peer từ chối */
    const onRejected = ({ callId: rejectedId, reason }) => {
      if (rejectedId !== callIdRef.current) return;
      const map = { busy: 'Người được gọi đang bận', no_answer: 'Không có phản hồi' };
      setError(map[reason] || 'Cuộc gọi bị từ chối');
      resetState();
    };

    /** Direct: bên kia kết thúc */
    const onEnded = ({ callId: endedId }) => {
      if (endedId !== callIdRef.current) return;
      resetState();
    };

    /**
     * SDP/ICE — relay từ server. Áp dụng cho cả direct và group.
     * Dùng applyPeerSignal để kiểm tra signalingState trước khi setRemoteDescription.
     */
    const onSignal = async ({ callId: sigCallId, fromUserId, signal }) => {
      if (sigCallId !== callIdRef.current || !signal) return;
      try {
        if (modeRef.current === 'group') {
          if (!fromUserId) return;
          const { pc, pendingCandidates } = getOrCreateGroupPeer(sigCallId, fromUserId);
          await applyPeerSignal(pc, pendingCandidates, signal, (reply) => {
            socket.emit('call:signal', {
              callId: sigCallId,
              toUserId: fromUserId,
              signal: reply,
            });
          });
        } else {
          // Direct — offer có thể đến trước khi callee tạo PC
          if (signal.type === 'offer' && !directPcRef.current) {
            directPendingOfferRef.current = signal;
            return;
          }
          if (!directPcRef.current || !peerRef.current?.id) return;
          await applyPeerSignal(
            directPcRef.current,
            directPendingCandidatesRef.current,
            signal,
            (reply) => {
              socket.emit('call:signal', {
                callId: sigCallId,
                toUserId: peerRef.current.id,
                signal: reply,
              });
            },
          );
        }
      } catch (e) {
        console.error('[Call] signal error:', e);
        setError(e.message || 'Lỗi xử lý tín hiệu');
      }
    };

    /** Group: server gửi list participants hiện có khi mình join. */
    const onGroupParticipants = ({ callId: cid, participants: existing }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group') return;
      setStatus('connecting');
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      setParticipants((cur) => {
        const next = { ...cur };
        (existing || []).forEach((p) => {
          next[p.userId] = {
            ...(cur[p.userId] || {}),
            name: p.name || cur[p.userId]?.name || 'Thành viên',
            joined: true,
            hasStream: false,
          };
        });
        return next;
      });
      // Các participants đã có sẽ tự gửi offer tới mình → mình chờ ở `onSignal`
    };

    /**
     * Group: có thành viên mới join. Nếu mình đã ở trong cuộc → mình tạo offer tới họ.
     * (Người mới chỉ nhận, không chủ động → tránh race condition glare).
     */
    const onGroupMemberJoined = async ({ callId: cid, userId: newUid, name }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group' || !newUid || newUid === uid) return;
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setParticipants((cur) => ({
        ...cur,
        [newUid]: {
          ...(cur[newUid] || {}),
          name: name || cur[newUid]?.name || 'Thành viên',
          joined: true,
          hasStream: false,
        },
      }));
      if (ringbackAudioRef.current) { ringbackAudioRef.current.pause(); ringbackAudioRef.current = null; }
      // Tạo PC và gửi offer (chỉ khi PC đang stable — tránh offer trùng)
      try {
        const entry = getOrCreateGroupPeer(cid, newUid);
        const { pc } = entry;
        if (entry.makingOffer || pc.signalingState !== 'stable') return;
        entry.makingOffer = true;
        const isVideo = kindRef.current === 'video';
        const offer = await pc.createOffer(buildOfferOptions(isVideo));
        await pc.setLocalDescription(offer);
        socket.emit('call:signal', {
          callId: cid,
          toUserId: newUid,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      } catch (e) {
        console.error('group offer error', e);
      } finally {
        const entry = groupPeersRef.current.get(newUid);
        if (entry) entry.makingOffer = false;
      }
    };

    /** Group: 1 thành viên rời cuộc. Không tự huỷ khi còn 1 mình — để có thể chờ người khác join thêm. */
    const onGroupMemberLeft = ({ callId: cid, userId: leftUid }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group') return;
      closeGroupPeer(leftUid);
      setParticipants((cur) => {
        const next = { ...cur };
        delete next[leftUid];
        return next;
      });
    };

    /** Group: thành viên từ chối — chỉ thông báo cho host */
    const onGroupMemberRejected = ({ callId: cid, userId: rejUid }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group') return;
      setParticipants((cur) => {
        if (!cur[rejUid] || cur[rejUid].joined) return cur;
        const next = { ...cur };
        delete next[rejUid];
        return next;
      });
    };

    /** Group: host cũ rời → server đã tự chọn host mới. */
    const onHostChanged = ({ callId: cid, newHostId, newHostName }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group' || !newHostId) return;
      setGroupInfo((cur) => (cur ? { ...cur, hostId: newHostId } : cur));
      setParticipants((cur) => {
        const next = { ...cur };
        Object.keys(next).forEach((id) => {
          next[id] = { ...next[id], isHost: String(id) === String(newHostId) };
          if (String(id) === String(newHostId) && newHostName) next[id].name = newHostName;
        });
        return next;
      });
    };

    /** Host nhận yêu cầu join. */
    const onJoinRequest = ({ callId: cid, requesterId, requesterName, requestedAt }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group' || !requesterId) return;
      setPendingJoinRequests((cur) => ({
        ...cur,
        [requesterId]: { name: requesterName || 'Thành viên', requestedAt: requestedAt || Date.now() },
      }));
    };

    /** Host: requester rút yêu cầu */
    const onJoinCancelled = ({ callId: cid, requesterId }) => {
      if (cid !== callIdRef.current || !requesterId) return;
      setPendingJoinRequests((cur) => {
        const next = { ...cur };
        delete next[requesterId];
        return next;
      });
    };

    /** Requester: được host duyệt → backend đã gửi `call:incoming`, onIncoming handle. Đây chỉ là tín hiệu pending. */
    const onJoinPending = () => {
      // setStatus('outgoing') đã set ở joinGroupCall → giữ nguyên, chỉ cập nhật error/text nếu cần
    };

    /** Group: ai đó bật/tắt chia sẻ màn hình → cập nhật flag để UI spotlight. */
    const onGroupScreenShare = ({ callId: cid, userId: shareUid, sharing }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'group' || !shareUid) return;
      setParticipants((cur) => {
        if (!cur[shareUid]) return cur;
        return { ...cur, [shareUid]: { ...cur[shareUid], isScreenSharing: !!sharing } };
      });
    };

    /** 1-1: bên kia bật/tắt chia sẻ màn hình. */
    const onDirectScreenShare = ({ callId: cid, sharing }) => {
      if (cid !== callIdRef.current || modeRef.current !== 'direct') return;
      // Direct: lưu vào participants với key = peer.id để UI dùng chung
      const pid = peerRef.current?.id;
      if (!pid) return;
      setParticipants((cur) => ({
        ...cur,
        [pid]: { ...(cur[pid] || {}), isScreenSharing: !!sharing },
      }));
    };

    /** Requester: bị host từ chối */
    const onJoinDenied = ({ callId: cid, reason }) => {
      if (cid !== pendingApproveCallIdRef.current && cid !== callIdRef.current) return;
      pendingApproveCallIdRef.current = null;
      const map = { denied: 'Chủ phòng đã từ chối yêu cầu' };
      setError(map[reason] || 'Yêu cầu tham gia bị từ chối');
      resetState();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:signal', onSignal);
    socket.on('call:group_participants', onGroupParticipants);
    socket.on('call:group_member_joined', onGroupMemberJoined);
    socket.on('call:group_member_left', onGroupMemberLeft);
    socket.on('call:group_member_rejected', onGroupMemberRejected);
    socket.on('call:group_host_changed', onHostChanged);
    socket.on('call:group_join_request', onJoinRequest);
    socket.on('call:group_join_cancelled', onJoinCancelled);
    socket.on('call:group_join_pending', onJoinPending);
    socket.on('call:group_join_denied', onJoinDenied);
    socket.on('call:group_screen_share', onGroupScreenShare);
    socket.on('call:screen_share', onDirectScreenShare);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:signal', onSignal);
      socket.off('call:group_participants', onGroupParticipants);
      socket.off('call:group_member_joined', onGroupMemberJoined);
      socket.off('call:group_member_left', onGroupMemberLeft);
      socket.off('call:group_member_rejected', onGroupMemberRejected);
      socket.off('call:group_host_changed', onHostChanged);
      socket.off('call:group_join_request', onJoinRequest);
      socket.off('call:group_join_cancelled', onJoinCancelled);
      socket.off('call:group_join_pending', onJoinPending);
      socket.off('call:group_join_denied', onJoinDenied);
      socket.off('call:group_screen_share', onGroupScreenShare);
      socket.off('call:screen_share', onDirectScreenShare);
    };
  }, [socket, uid, user, getOrCreateGroupPeer, closeGroupPeer, getLocalStream, endCall, resetState, startCallSound]);

  // Cleanup khi unmount toàn bộ provider
  useEffect(() => () => { cleanup(); }, [cleanup]);

  const value = useMemo(
    () => ({
      status,
      mode,
      callId,
      peer,
      groupInfo,
      participants,
      kind,
      isMuted,
      cameraOn,
      startedAt,
      error,
      localStream,
      directRemoteStream,
      pendingJoinRequests,
      isHost: mode === 'group' && !!groupInfo && String(groupInfo.hostId) === String(uid),
      isScreenSharing,
      startCall,
      startGroupCall,
      joinGroupCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      toggleScreenShare,
      approveJoinRequest,
      denyJoinRequest,
    }),
    [status, mode, callId, peer, groupInfo, participants, kind, isMuted, cameraOn, isScreenSharing, startedAt, error,
     localStream, directRemoteStream, pendingJoinRequests, uid,
     startCall, startGroupCall, joinGroupCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
     startScreenShare, stopScreenShare, toggleScreenShare,
     approveJoinRequest, denyJoinRequest],
  );

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall phải dùng bên trong <CallProvider>');
  return ctx;
}

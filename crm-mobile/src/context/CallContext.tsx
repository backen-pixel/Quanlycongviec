import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { subscribeAppSocket } from '../lib/appSocket';
import { useAuth } from './AuthContext';
import {
  dismissIncomingCallNotification,
  showIncomingCallNotification,
  storePendingIncomingCall,
  clearPendingIncomingCall,
  type IncomingCallPayload,
} from '../lib/incomingCallNotifications';
import {
  cancelNativeIncomingCallNotification,
  clearNativeIncomingCallClaim,
  markNativeCallAnswered,
  setNativeIncomingCallClaim,
} from '../lib/nativeCallNotification';
import {
  dismissLockScreenCallUi,
  subscribeLockScreenCallEnd,
  subscribeLockScreenToggleMute,
  syncLockScreenCallState,
} from '../lib/lockScreenCall';
import {
  markCallAnswered,
  releaseIncomingClaim,
  setCallSession,
  shouldSuppressIncomingRing,
  tryClaimIncomingCall,
} from '../lib/callSessionGuard';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CALL_TIMEOUT_MS = 60_000;

type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';
type CallMode = 'direct' | 'group';

type PeerInfo = { id: string; name: string; avatar?: string | null };

type GroupCallMember = { id: string; name?: string; avatar?: string | null };

type Ctx = {
  status: CallStatus;
  mode: CallMode;
  peer: PeerInfo | null;
  groupName: string | null;
  error: string | null;
  isMuted: boolean;
  startedAt: number | null;
  startCall: (peer: PeerInfo) => Promise<void>;
  startGroupCall: (group: { id: string; name?: string; members: GroupCallMember[] }) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  applyIncomingFromPush: (payload: IncomingCallPayload) => void;
  handleNativeCallIntent: (payload: IncomingCallPayload) => void;
  nativeAcceptPending: boolean;
};

const CallCtx = createContext<Ctx | null>(null);

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function flushIceCandidates(pc: RTCPeerConnection, pending: RTCIceCandidateInit[]) {
  const list = pending.splice(0);
  for (const c of list) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch {
      /* ignore */
    }
  }
}

async function applyPeerSignal(
  pc: RTCPeerConnection,
  pending: RTCIceCandidateInit[],
  signal: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit },
  reply?: (s: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) => void,
) {
  if (!signal?.type) return;
  if (signal.type === 'offer') {
    const state = pc.signalingState;
    if (state === 'have-local-offer') {
      try {
        await pc.setLocalDescription({ type: 'rollback' } as never);
      } catch {
        return;
      }
    } else if (state !== 'stable') return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp! }));
    await flushIceCandidates(pc, pending);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    reply?.({ type: 'answer', sdp: answer.sdp! });
  } else if (signal.type === 'answer') {
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp! }));
    await flushIceCandidates(pc, pending);
  } else if (signal.type === 'candidate' && signal.candidate) {
    if (pc.remoteDescription?.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        /* ignore */
      }
    } else {
      pending.push(signal.candidate);
    }
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');

  const [status, setStatus] = useState<CallStatus>('idle');
  const [mode, setMode] = useState<CallMode>('direct');
  const [callId, setCallId] = useState<string | null>(null);
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const statusRef = useRef<CallStatus>('idle');
  const callIdRef = useRef<string | null>(null);
  const modeRef = useRef<CallMode>('direct');
  const peerRef = useRef<PeerInfo | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const directPcRef = useRef<RTCPeerConnection | null>(null);
  const directPendingRef = useRef<RTCIceCandidateInit[]>([]);
  const directPendingOfferRef = useRef<{ type: string; sdp?: string } | null>(null);
  const directMakingOfferRef = useRef(false);
  const groupPeersRef = useRef(
    new Map<string, { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] }>(),
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAcceptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNativeAcceptRef = useRef(false);
  const tryRunPendingNativeAcceptRef = useRef<() => void>(() => {});
  const [nativeAcceptPending, setNativeAcceptPending] = useState(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    peerRef.current = peer;
  }, [peer]);

  const resetState = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    if (nativeAcceptTimeoutRef.current) {
      clearTimeout(nativeAcceptTimeoutRef.current);
      nativeAcceptTimeoutRef.current = null;
    }
    directPcRef.current?.close();
    directPcRef.current = null;
    directPendingRef.current = [];
    directPendingOfferRef.current = null;
    directMakingOfferRef.current = false;
    for (const { pc } of groupPeersRef.current.values()) pc.close();
    groupPeersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    void dismissIncomingCallNotification(callIdRef.current);
    dismissLockScreenCallUi();
    releaseIncomingClaim(callIdRef.current);
    clearNativeIncomingCallClaim(callIdRef.current);
    pendingNativeAcceptRef.current = false;
    setNativeAcceptPending(false);
    setCallSession(null, 'idle');
    setStatus('idle');
    setMode('direct');
    setCallId(null);
    setPeer(null);
    setGroupName(null);
    setGroupId(null);
    setMemberIds([]);
    setError(null);
    setIsMuted(false);
    setStartedAt(null);
  }, []);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    return localStreamRef.current;
  }, []);

  const markActive = useCallback(() => {
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    setStatus('active');
    setStartedAt((t) => t || Date.now());
  }, []);

  const createDirectPc = useCallback(
    (thisCallId: string, peerUserId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const rtc = pc as RTCPeerConnection & {
        onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null;
        ontrack: (() => void) | null;
        onconnectionstatechange: (() => void) | null;
      };
      rtc.onicecandidate = (ev) => {
        if (!ev.candidate || !socketRef.current) return;
        socketRef.current.emit('call:signal', {
          callId: thisCallId,
          toUserId: peerUserId,
          signal: { type: 'candidate', candidate: ev.candidate.toJSON() },
        });
      };
      rtc.ontrack = () => {
        markActive();
      };
      rtc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') markActive();
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setError('Mất kết nối');
        }
      };
      directPcRef.current = pc;
      return pc;
    },
    [markActive],
  );

  const getOrCreateGroupPc = useCallback(
    (thisCallId: string, peerUserId: string) => {
      let entry = groupPeersRef.current.get(peerUserId);
      if (entry) return entry;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const pending: RTCIceCandidateInit[] = [];
      const rtc = pc as RTCPeerConnection & {
        onicecandidate: ((ev: { candidate: RTCIceCandidate | null }) => void) | null;
        ontrack: (() => void) | null;
        onconnectionstatechange: (() => void) | null;
      };
      rtc.onicecandidate = (ev) => {
        if (!ev.candidate || !socketRef.current) return;
        socketRef.current.emit('call:signal', {
          callId: thisCallId,
          toUserId: peerUserId,
          signal: { type: 'candidate', candidate: ev.candidate.toJSON() },
        });
      };
      rtc.ontrack = () => markActive();
      rtc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') markActive();
      };
      entry = { pc, pending };
      groupPeersRef.current.set(peerUserId, entry);
      return entry;
    },
    [markActive],
  );

  const startCall = useCallback(
    async (peerUser: PeerInfo) => {
      const socket = socketRef.current;
      if (!socket || !peerUser?.id || statusRef.current !== 'idle') return;
      setError(null);
      const newCallId = genCallId();
      setCallId(newCallId);
      setMode('direct');
      setPeer(peerUser);
      setStatus('outgoing');
      try {
        const stream = await getLocalStream();
        const pc = createDirectPc(newCallId, peerUser.id);
        stream.getTracks().forEach((t) => pc.addTrack(t as never, stream as never));
        socket.emit('call:invite', { callId: newCallId, toUserId: peerUser.id, kind: 'audio' });
        timeoutRef.current = setTimeout(() => {
          setError('Không có phản hồi');
          socket.emit('call:end', { callId: newCallId, toUserId: peerUser.id });
          resetState();
        }, CALL_TIMEOUT_MS);
      } catch (e: unknown) {
        setError((e as Error)?.message || 'Không truy cập được micro');
        resetState();
      }
    },
    [createDirectPc, getLocalStream, resetState],
  );

  const startGroupCall = useCallback(
    async (group: { id: string; name?: string; members: GroupCallMember[] }) => {
      const socket = socketRef.current;
      if (!socket || !group?.id || statusRef.current !== 'idle') return;
      const ids = group.members.map((m) => String(m.id)).filter(Boolean);
      if (!ids.length) {
        setError('Nhóm không có thành viên khác');
        return;
      }
      setError(null);
      const newCallId = genCallId();
      setCallId(newCallId);
      setMode('group');
      setGroupId(String(group.id));
      setGroupName(group.name || 'Cuộc gọi nhóm');
      setMemberIds(ids);
      setPeer({ id: ids[0], name: group.name || 'Nhóm' });
      setStatus('outgoing');
      try {
        await getLocalStream();
        socket.emit('call:group_start', {
          callId: newCallId,
          groupId: group.id,
          groupName: group.name,
          memberIds: ids,
          kind: 'audio',
        });
        timeoutRef.current = setTimeout(() => {
          if (statusRef.current === 'outgoing') {
            setError('Không có ai phản hồi');
            socket.emit('call:end', { callId: newCallId });
            resetState();
          }
        }, CALL_TIMEOUT_MS);
      } catch (e: unknown) {
        setError((e as Error)?.message || 'Không truy cập được micro');
        socket.emit('call:end', { callId: newCallId });
        resetState();
      }
    },
    [getLocalStream, resetState],
  );

  const rejectCall = useCallback(() => {
    const socket = socketRef.current;
    const cid = callIdRef.current;
    void dismissIncomingCallNotification(cid);
    void clearPendingIncomingCall();
    if (socket && cid) {
      if (modeRef.current === 'group') {
        socket.emit('call:reject', { callId: cid, reason: 'rejected' });
      } else if (peerRef.current?.id) {
        socket.emit('call:reject', { callId: cid, toUserId: peerRef.current.id, reason: 'rejected' });
      }
    }
    resetState();
  }, [resetState]);

  const clearNativeAcceptPending = useCallback(() => {
    pendingNativeAcceptRef.current = false;
    setNativeAcceptPending(false);
    if (nativeAcceptTimeoutRef.current) {
      clearTimeout(nativeAcceptTimeoutRef.current);
      nativeAcceptTimeoutRef.current = null;
    }
  }, []);

  const acceptCall = useCallback(async () => {
    const socket = socketRef.current;
    const cid = callIdRef.current;
    if (!socket || !cid || statusRef.current !== 'incoming') return;

    // Chặn reo lại ngay (sync socket / FCM trễ) — trước mọi thao tác async.
    markCallAnswered(cid);
    markNativeCallAnswered(cid);
    setCallSession(cid, 'connecting');
    statusRef.current = 'connecting';

    void dismissIncomingCallNotification(cid);
    void clearPendingIncomingCall();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    clearNativeAcceptPending();

    const isGroup = modeRef.current === 'group';
    const peerId = peerRef.current?.id;
    if (!isGroup && !peerId) {
      resetState();
      return;
    }

    // Báo server ngay (trước getUserMedia) — syncPendingIncomingCalls sẽ không reo lại.
    if (isGroup) {
      socket.emit('call:group_join', { callId: cid });
    } else {
      socket.emit('call:accept', { callId: cid, toUserId: peerId });
    }

    setStatus('connecting');
    if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
    connectingTimeoutRef.current = setTimeout(() => {
      if (statusRef.current === 'connecting') {
        setError('Không kết nối được cuộc gọi');
        resetState();
      }
    }, 45_000);
    try {
      const stream = await getLocalStream();
      if (modeRef.current === 'group') {
        /* group_join đã emit ở trên */
      } else {
        const p = peerRef.current;
        if (!p?.id) {
          resetState();
          return;
        }
        // Giữ PC đã tạo nếu offer tới trước khi getUserMedia xong — tránh thay PC làm hỏng SDP.
        let pc = directPcRef.current;
        if (!pc) pc = createDirectPc(cid, p.id);
        if (pc.getSenders().length === 0) {
          stream.getTracks().forEach((t) => pc!.addTrack(t as never, stream as never));
        }
        const pendingOffer = directPendingOfferRef.current;
        if (pendingOffer?.type === 'offer') {
          directPendingOfferRef.current = null;
          await applyPeerSignal(pc, directPendingRef.current, pendingOffer, (reply) => {
            socket.emit('call:signal', { callId: cid, toUserId: p.id, signal: reply });
          });
        }
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Không truy cập được micro');
      rejectCall();
    }
  }, [clearNativeAcceptPending, createDirectPc, getLocalStream, rejectCall, resetState]);

  const scheduleNativeAcceptPending = useCallback(() => {
    pendingNativeAcceptRef.current = true;
    setNativeAcceptPending(true);
    if (nativeAcceptTimeoutRef.current) clearTimeout(nativeAcceptTimeoutRef.current);
    nativeAcceptTimeoutRef.current = setTimeout(() => {
      if (!pendingNativeAcceptRef.current) return;
      clearNativeAcceptPending();
      if (statusRef.current === 'incoming') resetState();
    }, 20_000);
  }, [clearNativeAcceptPending, resetState]);

  const tryRunPendingNativeAccept = useCallback(async () => {
    if (!pendingNativeAcceptRef.current) return;
    const socket = socketRef.current;
    const cid = callIdRef.current;
    if (!socket?.connected || !cid || statusRef.current !== 'incoming') return;
    clearNativeAcceptPending();
    await acceptCall();
  }, [acceptCall, clearNativeAcceptPending]);

  tryRunPendingNativeAcceptRef.current = () => {
    void tryRunPendingNativeAccept();
  };

  const endCall = useCallback(() => {
    const socket = socketRef.current;
    const cid = callIdRef.current;
    if (socket && cid) {
      if (modeRef.current === 'group') {
        socket.emit('call:end', { callId: cid });
      } else if (peerRef.current?.id) {
        socket.emit('call:end', { callId: cid, toUserId: peerRef.current.id });
      }
    }
    resetState();
  }, [resetState]);

  const toggleMute = useCallback(() => {
    setIsMuted((cur) => {
      const next = !cur;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const applyIncomingCall = useCallback(
    (payload: IncomingCallPayload, opts?: { notify?: boolean }) => {
      const incomingId = payload.callId;
      const fromUserId = payload.fromUserId;
      if (!incomingId || !fromUserId) return;
      if (statusRef.current !== 'idle') return;
      if (!tryClaimIncomingCall(incomingId)) return;

      // Cập nhật ref ngay — tránh race socket + FCM / pending tạo 2 cuộc gọi.
      statusRef.current = 'incoming';
      callIdRef.current = incomingId;
      setCallSession(incomingId, 'incoming');
      setNativeIncomingCallClaim(incomingId);

      if (AppState.currentState === 'active') {
        cancelNativeIncomingCallNotification(incomingId);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setCallId(incomingId);
      setMode(payload.isGroup ? 'group' : 'direct');
      setPeer({ id: String(fromUserId), name: payload.fromName || 'Người gọi' });
      if (payload.isGroup) {
        setGroupId(payload.groupId ? String(payload.groupId) : null);
        setGroupName(payload.groupName || 'Cuộc gọi nhóm');
      }
      setStatus('incoming');
      setError(null);

      const shouldNotify = opts?.notify !== false && AppState.currentState !== 'active';
      if (shouldNotify && !shouldSuppressIncomingRing(incomingId)) {
        void storePendingIncomingCall(payload);
        void showIncomingCallNotification(payload);
      }

      timeoutRef.current = setTimeout(() => {
        const socket = socketRef.current;
        if (payload.isGroup) socket?.emit('call:reject', { callId: incomingId, reason: 'no_answer' });
        else socket?.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'no_answer' });
        void dismissIncomingCallNotification(incomingId);
        resetState();
      }, CALL_TIMEOUT_MS);
    },
    [resetState],
  );

  const applyIncomingFromPush = useCallback(
    (payload: IncomingCallPayload) => {
      applyIncomingCall(payload, { notify: false });
    },
    [applyIncomingCall],
  );

  const handleNativeCallIntent = useCallback(
    (payload: IncomingCallPayload) => {
      if (payload.callAction === 'reject') {
        applyIncomingFromPush(payload);
        rejectCall();
        return;
      }
      applyIncomingFromPush(payload);
      if (payload.callAction === 'accept') {
        scheduleNativeAcceptPending();
        void tryRunPendingNativeAccept();
      }
    },
    [applyIncomingFromPush, rejectCall, scheduleNativeAcceptPending, tryRunPendingNativeAccept],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tryRunPendingNativeAcceptRef.current();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let detachSocket: (() => void) | undefined;
    const unsub = subscribeAppSocket((socket) => {
      detachSocket?.();
      socketRef.current = socket;

      const onIncoming = (payload: {
        callId?: string;
        kind?: string;
        fromUserId?: string;
        fromName?: string;
        isGroup?: boolean;
        groupId?: string;
        groupName?: string;
      }) => {
        const incomingId = payload?.callId;
        const fromUserId = payload?.fromUserId;
        if (!incomingId || !fromUserId) return;
        const curStatus = statusRef.current;
        const curCallId = callIdRef.current;
        if (curStatus !== 'idle') {
          // Sync/FCM gửi lại cùng callId khi đang trả lời — bỏ qua, không reject "busy".
          if (
            incomingId === curCallId
            && (curStatus === 'incoming' || curStatus === 'connecting' || curStatus === 'active')
          ) {
            return;
          }
          if (payload.isGroup) socket.emit('call:reject', { callId: incomingId, reason: 'busy' });
          else socket.emit('call:reject', { callId: incomingId, toUserId: fromUserId, reason: 'busy' });
          return;
        }
        applyIncomingCall({
          callId: incomingId,
          kind: payload.kind,
          fromUserId: String(fromUserId),
          fromName: payload.fromName,
          isGroup: payload.isGroup,
          groupId: payload.groupId,
          groupName: payload.groupName,
        });
      };

      const onAccepted = async ({ callId: acceptedId }: { callId?: string }) => {
        if (acceptedId !== callIdRef.current || modeRef.current !== 'direct' || !peerRef.current?.id) return;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        const pc = directPcRef.current;
        if (!pc || directMakingOfferRef.current) return;
        directMakingOfferRef.current = true;
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          socket.emit('call:signal', {
            callId: acceptedId,
            toUserId: peerRef.current.id,
            signal: { type: 'offer', sdp: offer.sdp },
          });
          setStatus('connecting');
        } catch {
          setError('Không tạo được kết nối');
        } finally {
          directMakingOfferRef.current = false;
        }
      };

      const onSignal = async ({
        callId: sigCallId,
        fromUserId,
        signal,
      }: {
        callId?: string;
        fromUserId?: string;
        signal?: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit };
      }) => {
        if (!sigCallId || sigCallId !== callIdRef.current || !fromUserId || !signal) return;
        const uid = String(fromUserId);
        if (modeRef.current === 'direct') {
          // Offer có thể tới trước khi callee tạo PC (acceptCall đang chờ getUserMedia).
          if (signal.type === 'offer' && !directPcRef.current) {
            directPendingOfferRef.current = { type: 'offer', sdp: signal.sdp };
            return;
          }
          const pc = directPcRef.current;
          if (!pc || !peerRef.current?.id) return;
          await applyPeerSignal(pc, directPendingRef.current, signal, (reply) => {
            socket.emit('call:signal', { callId: sigCallId, toUserId: peerRef.current!.id, signal: reply });
          });
        } else {
          const { pc, pending } = getOrCreateGroupPc(sigCallId, uid);
          const stream = localStreamRef.current;
          if (stream && pc.getSenders().length === 0) {
            stream.getTracks().forEach((t) => pc.addTrack(t as never, stream as never));
          }
          if (signal.type === 'offer') {
            await applyPeerSignal(pc, pending, signal, (reply) => {
              socket.emit('call:signal', { callId: sigCallId, toUserId: uid, signal: reply });
            });
          } else {
            await applyPeerSignal(pc, pending, signal);
          }
        }
      };

      const onEnded = ({ callId: endedId }: { callId?: string }) => {
        if (endedId === callIdRef.current) resetState();
      };

      const onRejected = ({ callId: rejectedId }: { callId?: string }) => {
        if (rejectedId === callIdRef.current) {
          setError('Cuộc gọi bị từ chối');
          resetState();
        }
      };

      const onGroupParticipants = ({
        callId: gid,
        participants,
      }: {
        callId?: string;
        participants?: { userId: string; name?: string }[];
      }) => {
        if (gid !== callIdRef.current || !participants?.length) return;
        for (const p of participants) {
          if (String(p.userId) === myId) continue;
          const { pc } = getOrCreateGroupPc(gid, String(p.userId));
          const stream = localStreamRef.current;
          if (stream && pc.getSenders().length === 0) {
            stream.getTracks().forEach((t) => pc.addTrack(t as never, stream as never));
          }
          if (pc.signalingState === 'stable') {
            void (async () => {
              try {
                const offer = await pc.createOffer({ offerToReceiveAudio: true });
                await pc.setLocalDescription(offer);
                socket.emit('call:signal', {
                  callId: gid,
                  toUserId: p.userId,
                  signal: { type: 'offer', sdp: offer.sdp },
                });
              } catch {
                /* ignore */
              }
            })();
          }
        }
      };

      const onGroupMemberJoined = ({
        callId: gid,
        userId,
      }: {
        callId?: string;
        userId?: string;
      }) => {
        if (gid !== callIdRef.current || !userId || String(userId) === myId) return;
        const { pc } = getOrCreateGroupPc(gid, String(userId));
        const stream = localStreamRef.current;
        if (stream && pc.getSenders().length === 0) {
          stream.getTracks().forEach((t) => pc.addTrack(t as never, stream as never));
        }
        void (async () => {
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            socket.emit('call:signal', {
              callId: gid,
              toUserId: userId,
              signal: { type: 'offer', sdp: offer.sdp },
            });
          } catch {
            /* ignore */
          }
        })();
      };

      socket.on('call:incoming', onIncoming);
      socket.on('call:accepted', onAccepted);
      socket.on('call:signal', onSignal);
      socket.on('call:ended', onEnded);
      socket.on('call:rejected', onRejected);
      socket.on('call:group_participants', onGroupParticipants);
      socket.on('call:group_member_joined', onGroupMemberJoined);

      const onSocketConnect = () => {
        const cid = callIdRef.current;
        const phase = statusRef.current;
        const peerId = peerRef.current?.id;
        if (
          cid
          && peerId
          && modeRef.current === 'direct'
          && (phase === 'connecting' || phase === 'incoming')
        ) {
          markCallAnswered(cid);
          socket.emit('call:accept', { callId: cid, toUserId: peerId });
        }
        tryRunPendingNativeAcceptRef.current();
      };
      socket.on('connect', onSocketConnect);

      detachSocket = () => {
        socket.off('connect', onSocketConnect);
        socket.off('call:incoming', onIncoming);
        socket.off('call:accepted', onAccepted);
        socket.off('call:signal', onSignal);
        socket.off('call:ended', onEnded);
        socket.off('call:rejected', onRejected);
        socket.off('call:group_participants', onGroupParticipants);
        socket.off('call:group_member_joined', onGroupMemberJoined);
      };
    });
    return () => {
      detachSocket?.();
      unsub();
    };
  }, [applyIncomingCall, createDirectPc, getOrCreateGroupPc, myId, resetState]);

  useEffect(() => {
    setCallSession(callId, status);
  }, [callId, status]);

  useEffect(() => {
    if (status === 'idle' || !callId) {
      dismissLockScreenCallUi();
      return;
    }
    const peerName = mode === 'group' ? groupName || 'Nhóm' : peer?.name || '';
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    syncLockScreenCallState({
      callId,
      status,
      peerName,
      durationMs,
      isMuted,
    });
  }, [status, callId, peer, groupName, mode, isMuted, startedAt]);

  useEffect(() => {
    const unsubEnd = subscribeLockScreenCallEnd((id) => {
      if (id === callIdRef.current) endCall();
    });
    const unsubMute = subscribeLockScreenToggleMute((id) => {
      if (id === callIdRef.current) toggleMute();
    });
    return () => {
      unsubEnd();
      unsubMute();
    };
  }, [endCall, toggleMute]);

  const value = useMemo(
    () => ({
      status,
      mode,
      peer,
      groupName,
      error,
      isMuted,
      startedAt,
      startCall,
      startGroupCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      applyIncomingFromPush,
      handleNativeCallIntent,
      nativeAcceptPending,
    }),
    [
      status,
      mode,
      peer,
      groupName,
      error,
      isMuted,
      startedAt,
      startCall,
      startGroupCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      applyIncomingFromPush,
      handleNativeCallIntent,
      nativeAcceptPending,
    ],
  );

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

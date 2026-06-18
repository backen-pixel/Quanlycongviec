/**
 * Mesh cuộc gọi nhóm — legacy call:group_* + call:signal (React Native WebRTC).
 */
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  type MediaStream,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import type { CallMedia, CallSession } from './types';
import { getIceServers } from './turnConfig';
import {
  dismissIncomingCallNotification, showIncomingCallNotification,
} from '../lib/incomingCallNotifications';
import { startIncomingCallAlert, stopIncomingCallAlert } from '../lib/callRingtone';
import { tryClaimIncomingCall, markCallAnswered, setCallSession, releaseIncomingClaim } from '../lib/callSessionGuard';
import { dismissLockScreenCallUi } from '../lib/lockScreenCall';

const GROUP_TIMEOUT_MS = 60_000;

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function flushIce(pc: RTCPeerConnection, pending: RTCIceCandidateInit[]) {
  for (const c of pending.splice(0)) {
    try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
  }
}

async function applySignal(
  pc: RTCPeerConnection,
  pending: RTCIceCandidateInit[],
  signal: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit },
  reply?: (s: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) => void,
) {
  if (!signal?.type) return;
  if (signal.type === 'offer') {
    const st = pc.signalingState;
    if (st === 'have-local-offer') {
      try { await pc.setLocalDescription({ type: 'rollback' } as never); } catch { return; }
    } else if (st !== 'stable') return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp! }));
    await flushIce(pc, pending);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    reply?.({ type: 'answer', sdp: answer.sdp! });
  } else if (signal.type === 'answer') {
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp! }));
    await flushIce(pc, pending);
  } else if (signal.type === 'candidate' && signal.candidate) {
    if (pc.remoteDescription?.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch { /* noop */ }
    } else pending.push(signal.candidate);
  }
}

export type GroupPeerInfo = { userId: string; name: string };

export type GroupJoinRequest = {
  requesterId: string;
  requesterName: string;
  requestedAt?: number;
};

type PeerEntry = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; name: string };

export class LegacyGroupCallManager {
  private socket: Socket | null = null;
  private uid = '';
  private sessionRef: { current: CallSession | null };
  private setSession: (s: CallSession | null) => void;
  private patchSession: (p: Partial<CallSession>) => void;
  private localStreamRef: { current: MediaStream | null };
  private peersRef = new Map<string, PeerEntry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  onPeersChange?: (peers: GroupPeerInfo[]) => void;
  onJoinRequestsChange?: (requests: GroupJoinRequest[]) => void;
  private joinRequests: GroupJoinRequest[] = [];
  private onLocalStream?: (stream: MediaStream | null) => void;

  constructor(opts: {
    sessionRef: { current: CallSession | null };
    setSession: (s: CallSession | null) => void;
    patchSession: (p: Partial<CallSession>) => void;
    localStreamRef: { current: MediaStream | null };
    onLocalStream?: (stream: MediaStream | null) => void;
  }) {
    this.sessionRef = opts.sessionRef;
    this.setSession = opts.setSession;
    this.patchSession = opts.patchSession;
    this.localStreamRef = opts.localStreamRef;
    this.onLocalStream = opts.onLocalStream;
  }

  setSocket(socket: Socket | null, uid: string) {
    this.socket = socket;
    this.uid = uid;
  }

  private isBusy() {
    const s = this.sessionRef.current;
    return !!(s && (s.state === 'RINGING' || s.state === 'CONNECTING' || s.state === 'CONNECTED'));
  }

  private syncPeers() {
    this.onPeersChange?.([...this.peersRef.entries()].map(([userId, e]) => ({
      userId, name: e.name || 'Thành viên',
    })));
  }

  private syncJoinRequests() {
    this.onJoinRequestsChange?.([...this.joinRequests]);
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  reset() {
    this.clearTimer();
    void stopIncomingCallAlert();
    for (const e of this.peersRef.values()) { try { e.pc.close(); } catch { /* noop */ } }
    this.peersRef.clear();
    this.syncPeers();
    this.joinRequests = [];
    this.syncJoinRequests();
    try { this.localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    this.localStreamRef.current = null;
    this.onLocalStream?.(null);
  }

  private async ensureLocal(media: CallMedia) {
    if (this.localStreamRef.current) return this.localStreamRef.current;
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: media === 'video',
    });
    this.localStreamRef.current = stream;
    this.onLocalStream?.(stream);
    return stream;
  }

  private getOrCreatePc(callId: string, peerId: string, name: string, media: CallMedia): PeerEntry {
    let entry = this.peersRef.get(peerId);
    if (entry) return entry;
    const pending: RTCIceCandidateInit[] = [];
    const pc = new RTCPeerConnection({ iceServers: [] });
    void getIceServers().then((ice) => { pc.setConfiguration({ iceServers: ice }); });
    entry = { pc, pending, name };
    this.peersRef.set(peerId, entry);
    this.syncPeers();
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket?.emit('call:signal', {
          callId, toUserId: peerId,
          signal: { type: 'candidate', candidate: e.candidate },
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.patchSession({ state: 'CONNECTED', connectedAt: Date.now() });
      }
    };
    const stream = this.localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t as never, stream as never));
    return entry;
  }

  private async offerTo(callId: string, peerId: string, name: string, media: CallMedia) {
    const { pc } = this.getOrCreatePc(callId, peerId, name, media);
    if (pc.signalingState !== 'stable') return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: media === 'video' });
    await pc.setLocalDescription(offer);
    this.socket?.emit('call:signal', {
      callId, toUserId: peerId,
      signal: { type: 'offer', sdp: offer.sdp },
    });
  }

  async startGroupCall(group: {
    id: string; name?: string;
    members: { id: string; name?: string }[];
  }, media: CallMedia = 'audio') {
    const socket = this.socket;
    if (!socket || this.isBusy() || !group?.id) return;
    const memberIds = group.members.map((m) => String(m.id)).filter(Boolean);
    if (!memberIds.length) return;
    const callId = genCallId();
    const session: CallSession = {
      callId,
      mode: 'group',
      groupId: String(group.id),
      groupName: group.name || 'Cuộc gọi nhóm',
      peer: { id: memberIds[0], name: group.name || 'Nhóm' },
      direction: 'outgoing',
      media,
      state: 'RINGING',
      connectedAt: null,
      isMuted: false,
      isSpeaker: media === 'video',
      isCameraOff: false,
      cameraFacing: 'front',
      error: null,
    };
    this.sessionRef.current = session;
    this.setSession(session);
    setCallSession(callId, 'outgoing');
    if (Platform.OS === 'android') dismissLockScreenCallUi();
    try {
      await this.ensureLocal(media);
      socket.emit('call:group_start', {
        callId,
        groupId: group.id,
        groupName: group.name,
        memberIds,
        kind: media,
      });
      this.timer = setTimeout(() => {
        if (this.sessionRef.current?.callId === callId && this.sessionRef.current.state === 'RINGING') {
          socket.emit('call:end', { callId });
          this.reset();
          this.setSession(null);
        }
      }, GROUP_TIMEOUT_MS);
    } catch (e: any) {
      this.patchSession({ error: e?.message || 'Không truy cập mic' });
      socket.emit('call:end', { callId });
      this.reset();
      this.setSession(null);
    }
  }

  joinGroupCall(info: {
    callId: string; groupId?: string; groupName?: string;
    kind?: string; hostId?: string; hostName?: string;
  }) {
    const socket = this.socket;
    if (!socket || !info?.callId || this.isBusy()) return;
    const media: CallMedia = info.kind === 'video' ? 'video' : 'audio';
    const session: CallSession = {
      callId: info.callId,
      mode: 'group',
      groupId: String(info.groupId || ''),
      groupName: info.groupName || 'Cuộc gọi nhóm',
      peer: { id: info.hostId || '', name: info.hostName || 'Chủ phòng' },
      direction: 'outgoing',
      media,
      state: 'RINGING',
      connectedAt: null,
      isMuted: false,
      isSpeaker: media === 'video',
      isCameraOff: false,
      cameraFacing: 'front',
      error: null,
      joinPending: true,
    };
    this.sessionRef.current = session;
    this.setSession(session);
    socket.emit('call:group_request_join', { callId: info.callId });
  }

  applyIncomingFromPush(payload: {
    callId: string; fromUserId: string; fromName?: string;
    groupId?: string; groupName?: string; kind?: string;
  }) {
    this.presentIncoming(payload);
  }

  private presentIncoming(p: {
    callId: string; fromUserId: string; fromName?: string;
    groupId?: string; groupName?: string; kind?: string;
  }) {
    if (this.isBusy() && this.sessionRef.current?.callId !== p.callId) return;
    if (!tryClaimIncomingCall(p.callId)) return;
    const media: CallMedia = p.kind === 'video' ? 'video' : 'audio';
    const session: CallSession = {
      callId: p.callId,
      mode: 'group',
      groupId: String(p.groupId || ''),
      groupName: p.groupName || 'Cuộc gọi nhóm',
      peer: { id: p.fromUserId, name: p.fromName || 'Người gọi' },
      direction: 'incoming',
      media,
      state: 'RINGING',
      connectedAt: null,
      isMuted: false,
      isSpeaker: media === 'video',
      isCameraOff: false,
      cameraFacing: 'front',
      error: null,
    };
    this.sessionRef.current = session;
    this.setSession(session);
    setCallSession(p.callId, 'incoming');
    if (Platform.OS === 'android') dismissLockScreenCallUi();
    void startIncomingCallAlert();
    void showIncomingCallNotification({
      callId: p.callId,
      fromUserId: p.fromUserId,
      fromName: p.fromName,
      kind: media,
      isGroup: true,
      groupId: p.groupId,
      groupName: p.groupName,
    });
  }

  async acceptGroupCall() {
    const cur = this.sessionRef.current;
    const socket = this.socket;
    if (!cur || cur.mode !== 'group' || cur.state !== 'RINGING' || !socket) return;
    this.clearTimer();
    markCallAnswered(cur.callId);
    void stopIncomingCallAlert();
    void dismissIncomingCallNotification(cur.callId);
    this.patchSession({ state: 'CONNECTING' });
    setCallSession(cur.callId, 'connecting');
    socket.emit('call:group_join', { callId: cur.callId });
    try {
      await this.ensureLocal(cur.media);
    } catch (e: any) {
      this.patchSession({ error: e?.message || 'Không truy cập mic' });
      socket.emit('call:reject', { callId: cur.callId, reason: 'rejected' });
      this.reset();
      this.setSession(null);
    }
  }

  rejectGroupCall() {
    const cur = this.sessionRef.current;
    if (!cur || cur.mode !== 'group') return;
    this.socket?.emit('call:reject', { callId: cur.callId, reason: 'rejected' });
    releaseIncomingClaim(cur.callId);
    this.reset();
    this.patchSession({ state: 'REJECTED' });
    setTimeout(() => { this.setSession(null); }, 1200);
  }

  endGroupCall() {
    const cur = this.sessionRef.current;
    if (!cur || cur.mode !== 'group') return;
    if (cur.joinPending) this.socket?.emit('call:group_cancel_join', { callId: cur.callId });
    else this.socket?.emit('call:end', { callId: cur.callId });
    releaseIncomingClaim(cur.callId);
    this.reset();
    this.setSession(null);
  }

  toggleMute() {
    const cur = this.sessionRef.current;
    if (!cur) return;
    const next = !cur.isMuted;
    this.localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    this.patchSession({ isMuted: next });
  }

  toggleSpeaker() {
    const cur = this.sessionRef.current;
    if (!cur) return;
    this.patchSession({ isSpeaker: !cur.isSpeaker });
  }

  toggleCamera() {
    const cur = this.sessionRef.current;
    if (!cur) return;
    const next = !cur.isCameraOff;
    this.localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    this.patchSession({ isCameraOff: next });
  }

  switchCamera() {
    const cur = this.sessionRef.current;
    if (!cur) return;
    this.patchSession({ cameraFacing: cur.cameraFacing === 'front' ? 'back' : 'front' });
  }

  denyJoin(requesterId: string) {
    const cur = this.sessionRef.current;
    if (!cur || cur.mode !== 'group' || !requesterId) return;
    this.socket?.emit('call:group_deny_join', { callId: cur.callId, requesterId });
    this.joinRequests = this.joinRequests.filter((r) => r.requesterId !== requesterId);
    this.syncJoinRequests();
  }

  approveJoin(requesterId: string) {
    const cur = this.sessionRef.current;
    if (!cur || cur.mode !== 'group' || !requesterId) return;
    this.socket?.emit('call:group_approve_join', { callId: cur.callId, requesterId });
    this.joinRequests = this.joinRequests.filter((r) => r.requesterId !== requesterId);
    this.syncJoinRequests();
  }

  bind(socket: Socket) {
    const onIncoming = (p: any) => {
      if (!p?.isGroup || !p.callId) return;
      this.presentIncoming(p);
    };
    const onParticipants = ({ callId, participants }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId) return;
      for (const p of participants || []) {
        if (String(p.userId) === this.uid) continue;
        void this.offerTo(callId, String(p.userId), p.name || '', cur.media);
      }
    };
    const onJoined = ({ callId, userId, name }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !userId) return;
      if (String(userId) === this.uid) return;
      void this.offerTo(callId, String(userId), name || '', cur.media);
      if (cur.direction === 'outgoing' && cur.state === 'RINGING') {
        this.clearTimer();
        this.patchSession({ state: 'CONNECTING' });
      }
    };
    const onSignal = async ({ callId, fromUserId, signal }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !fromUserId || !signal) return;
      const pid = String(fromUserId);
      const entry = this.getOrCreatePc(callId, pid, '', cur.media);
      await applySignal(entry.pc, entry.pending, signal, (reply) => {
        socket.emit('call:signal', { callId, toUserId: pid, signal: reply });
      });
    };
    const onEnded = ({ callId }: any) => {
      if (this.sessionRef.current?.mode === 'group' && this.sessionRef.current.callId === callId) {
        this.reset();
        this.setSession(null);
      }
    };
    const onDenied = ({ callId }: any) => {
      if (this.sessionRef.current?.callId === callId) {
        this.reset();
        this.patchSession({ state: 'REJECTED', error: 'Chủ phòng từ chối' });
        setTimeout(() => this.setSession(null), 1200);
      }
    };
    const onJoinRequest = ({ callId, requesterId, requesterName, requestedAt }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !requesterId) return;
      if (this.joinRequests.some((r) => r.requesterId === requesterId)) return;
      this.joinRequests = [...this.joinRequests, {
        requesterId,
        requesterName: requesterName || 'Thành viên',
        requestedAt: requestedAt || Date.now(),
      }];
      this.syncJoinRequests();
    };
    const onJoinCancelled = ({ callId, requesterId }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !requesterId) return;
      this.joinRequests = this.joinRequests.filter((r) => r.requesterId !== requesterId);
      this.syncJoinRequests();
    };
    const onHostChanged = ({ callId, newHostId }: any) => {
      const cur = this.sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId) return;
      if (String(newHostId) !== this.uid) {
        this.joinRequests = [];
        this.syncJoinRequests();
      }
    };
    const onJoinPending = ({ callId }: any) => {
      const cur = this.sessionRef.current;
      if (cur?.mode === 'group' && cur.callId === callId && cur.joinPending) {
        this.patchSession({ state: 'RINGING', joinPending: true });
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:group_participants', onParticipants);
    socket.on('call:group_member_joined', onJoined);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    socket.on('call:group_join_denied', onDenied);
    socket.on('call:group_join_request', onJoinRequest);
    socket.on('call:group_join_cancelled', onJoinCancelled);
    socket.on('call:group_host_changed', onHostChanged);
    socket.on('call:group_join_pending', onJoinPending);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:group_participants', onParticipants);
      socket.off('call:group_member_joined', onJoined);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
      socket.off('call:group_join_denied', onDenied);
      socket.off('call:group_join_request', onJoinRequest);
      socket.off('call:group_join_cancelled', onJoinCancelled);
      socket.off('call:group_host_changed', onHostChanged);
      socket.off('call:group_join_pending', onJoinPending);
    };
  }
}

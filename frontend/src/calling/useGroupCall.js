/**
 * Controller — cuộc gọi nhóm mesh (legacy call:group_* + call:signal).
 * Dùng song song với hyphen 1-1 trong CallProvider.
 */
import { useCallback, useRef, useState } from 'react';
import { playCallRingtone, stopCallRingtone } from '../lib/callRingtonePlayer';
import { dismissIncomingCallDesktopAlert, showIncomingCallDesktopAlert } from '../lib/incomingCallNotify';
import {
  applyPeerSignal, acquireLocalVideoTrack, createGroupPeerConnection, getLocalMediaStream,
  replaceVideoOnPeerConnections, sendOfferToPeer, stopLocalVideoTracks,
} from './groupCallMesh';

const GROUP_CALL_TIMEOUT_MS = 60_000;

function genCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function syncPeersState(groupPeersRef, setGroupPeers) {
  const list = [...groupPeersRef.current.entries()].map(([userId, e]) => ({
    userId,
    name: e.name || 'Thành viên',
    stream: e.stream,
  }));
  setGroupPeers(list);
}

export function useGroupCall({ socket, uid, isBusy, setSession, sessionRef, patchSession }) {
  const [groupPeers, setGroupPeers] = useState([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState([]);
  const groupPeersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const ringTimerRef = useRef(null);

  const clearGroupTimers = useCallback(() => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
  }, []);

  const resetGroup = useCallback(() => {
    clearGroupTimers();
    try { stopCallRingtone(); } catch { /* noop */ }
    try { dismissIncomingCallDesktopAlert(); } catch { /* noop */ }
    for (const e of groupPeersRef.current.values()) {
      try { e.pc?.close(); } catch { /* noop */ }
    }
    groupPeersRef.current.clear();
    syncPeersState(groupPeersRef, setGroupPeers);
    setGroupJoinRequests([]);
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    localStreamRef.current = null;
  }, [clearGroupTimers]);

  const markConnected = useCallback(() => {
    patchSession({ state: 'CONNECTED', connectedAt: Date.now() });
  }, [patchSession]);

  const getOrCreateGroupPc = useCallback((callId, peerUserId, name, media) => {
    let entry = groupPeersRef.current.get(peerUserId);
    if (entry) return entry;
    const pending = [];
    const placeholder = { pc: null, pending, name, stream: null };
    groupPeersRef.current.set(peerUserId, placeholder);
    void (async () => {
      const pc = await createGroupPeerConnection(peerUserId, {
        media,
        onRemoteStream: (uid2, stream) => {
          const cur = groupPeersRef.current.get(uid2);
          if (cur) { cur.stream = stream; syncPeersState(groupPeersRef, setGroupPeers); markConnected(); }
        },
        onConnected: markConnected,
      });
      pc._onIce = (signal) => {
        socket?.emit('call:signal', { callId, toUserId: peerUserId, signal });
      };
      placeholder.pc = pc;
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => {
          const sender = pc.addTrack(t, stream);
          if (t.kind === 'video') pc._videoSender = sender;
        });
      }
    })();
    return placeholder;
  }, [socket, markConnected]);

  const ensureLocalStream = useCallback(async (media) => {
    const stream = await getLocalMediaStream(media, localStreamRef.current);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const attachTracksToAllPeers = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const entry of groupPeersRef.current.values()) {
      const { pc } = entry;
      if (pc && pc.getSenders().length === 0) {
        stream.getTracks().forEach((t) => {
          const sender = pc.addTrack(t, stream);
          if (t.kind === 'video') pc._videoSender = sender;
        });
      }
    }
  }, []);

  const startGroupCall = useCallback(async (group, opts = {}) => {
    if (!socket || isBusy() || !group?.id) return;
    const memberIds = (group.members || []).map((m) => String(m.id)).filter(Boolean);
    if (!memberIds.length) return;
    const media = opts.video ? 'video' : 'audio';
    const callId = genCallId();
    const next = {
      mode: 'group',
      callId,
      groupId: String(group.id),
      groupName: group.name || 'Cuộc gọi nhóm',
      peer: { id: memberIds[0], name: group.name || 'Nhóm', avatar: null },
      direction: 'outgoing',
      media,
      state: 'RINGING',
      connectedAt: null,
      isMuted: false,
      isCameraOff: false,
      error: null,
    };
    sessionRef.current = next;
    setSession(next);
    try {
      await ensureLocalStream(media);
      socket.emit('call:group_start', {
        callId,
        groupId: group.id,
        groupName: group.name,
        memberIds,
        kind: media,
      });
      ringTimerRef.current = setTimeout(() => {
        if (sessionRef.current?.callId === callId && sessionRef.current?.state === 'RINGING') {
          socket.emit('call:end', { callId });
          resetGroup();
          patchSession({ state: 'MISSED' });
          setTimeout(() => { if (sessionRef.current?.callId === callId) { sessionRef.current = null; setSession(null); } }, 1200);
        }
      }, GROUP_CALL_TIMEOUT_MS);
    } catch (e) {
      patchSession({ error: e?.message || 'Không truy cập được mic/camera' });
      socket.emit('call:end', { callId });
      resetGroup();
      sessionRef.current = null;
      setSession(null);
    }
  }, [socket, isBusy, setSession, sessionRef, ensureLocalStream, resetGroup, patchSession]);

  const joinGroupCall = useCallback(async (info) => {
    if (!socket || !info?.callId) return;
    const cur = sessionRef.current;
    if (isBusy() && cur?.callId !== info.callId) return;
    if (cur?.callId === info.callId && (cur.state === 'CONNECTING' || cur.state === 'CONNECTED')) return;
    const media = info.kind === 'video' ? 'video' : 'audio';
    const next = {
      mode: 'group',
      callId: info.callId,
      groupId: String(info.groupId || ''),
      groupName: info.groupName || 'Cuộc gọi nhóm',
      peer: { id: info.hostId || '', name: info.hostName || 'Chủ phòng', avatar: null },
      direction: 'outgoing',
      media,
      state: 'CONNECTING',
      connectedAt: null,
      isMuted: false,
      isCameraOff: false,
      error: null,
      joinPending: true,
    };
    sessionRef.current = next;
    setSession(next);
    try {
      await ensureLocalStream(media);
      attachTracksToAllPeers();
      socket.emit('call:group_request_join', { callId: info.callId });
    } catch (e) {
      patchSession({ error: e?.message || 'Không truy cập được mic/camera', state: 'ENDED' });
      resetGroup();
      sessionRef.current = null;
      setSession(null);
    }
  }, [socket, isBusy, setSession, sessionRef, ensureLocalStream, attachTracksToAllPeers, resetGroup, patchSession]);

  const presentGroupIncoming = useCallback((p) => {
    if (isBusy() && sessionRef.current?.callId !== p.callId) return;
    clearGroupTimers();
    const media = p.kind === 'video' ? 'video' : 'audio';
    const next = {
      mode: 'group',
      callId: p.callId,
      groupId: String(p.groupId || ''),
      groupName: p.groupName || 'Cuộc gọi nhóm',
      peer: { id: p.fromUserId, name: p.fromName || 'Người gọi', avatar: null },
      direction: 'incoming',
      media,
      state: 'RINGING',
      connectedAt: null,
      isMuted: false,
      isCameraOff: false,
      error: null,
    };
    sessionRef.current = next;
    setSession(next);
    try { void playCallRingtone(); } catch { /* noop */ }
    try {
      showIncomingCallDesktopAlert({
        callId: p.callId,
        fromName: p.groupName || p.fromName,
        kind: media,
        isGroup: true,
        groupName: p.groupName,
      });
    } catch { /* noop */ }
  }, [isBusy, setSession, sessionRef, clearGroupTimers]);

  const acceptGroupCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.mode !== 'group' || cur.state !== 'RINGING') return;
    clearGroupTimers();
    try { stopCallRingtone(); } catch { /* noop */ }
    try { dismissIncomingCallDesktopAlert(); } catch { /* noop */ }
    patchSession({ state: 'CONNECTING' });
    try {
      await ensureLocalStream(cur.media);
      attachTracksToAllPeers();
      socket?.emit('call:group_join', { callId: cur.callId });
    } catch (e) {
      patchSession({ error: e?.message || 'Không truy cập được mic/camera' });
      socket?.emit('call:reject', { callId: cur.callId, reason: 'rejected' });
      resetGroup();
      patchSession({ state: 'ENDED' });
      setTimeout(() => { sessionRef.current = null; setSession(null); }, 1200);
    }
  }, [socket, sessionRef, clearGroupTimers, patchSession, ensureLocalStream, attachTracksToAllPeers, resetGroup, setSession]);

  const rejectGroupCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || cur.mode !== 'group') return;
    socket?.emit('call:reject', { callId: cur.callId, reason: 'rejected' });
    resetGroup();
    patchSession({ state: 'REJECTED' });
    setTimeout(() => { sessionRef.current = null; setSession(null); }, 1200);
  }, [socket, sessionRef, resetGroup, patchSession, setSession]);

  const endGroupCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || cur.mode !== 'group') return;
    if (cur.joinPending) socket?.emit('call:group_cancel_join', { callId: cur.callId });
    else socket?.emit('call:end', { callId: cur.callId });
    resetGroup();
    patchSession({ state: 'ENDED' });
    setTimeout(() => { sessionRef.current = null; setSession(null); }, 1200);
  }, [socket, sessionRef, resetGroup, patchSession, setSession]);

  const toggleGroupMute = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    const next = !cur.isMuted;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    patchSession({ isMuted: next });
  }, [sessionRef, patchSession]);

  const toggleGroupCamera = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.media !== 'video') return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cur.isCameraOff;
    const peerEntries = [...groupPeersRef.current.values()];
    try {
      if (next) {
        stopLocalVideoTracks(stream);
        await replaceVideoOnPeerConnections(peerEntries, null, stream);
      } else {
        const facing = cur.cameraFacing === 'back' ? 'back' : 'front';
        const track = await acquireLocalVideoTrack(facing);
        stream.addTrack(track);
        await replaceVideoOnPeerConnections(peerEntries, track, stream);
      }
      patchSession({ isCameraOff: next });
    } catch (e) {
      patchSession({ error: e?.message || 'Không truy cập được camera' });
    }
  }, [sessionRef, patchSession]);

  const switchGroupCamera = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.media !== 'video') return;
    const facing = cur.cameraFacing === 'back' ? 'front' : 'back';
    patchSession({ cameraFacing: facing });
    if (cur.isCameraOff) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const peerEntries = [...groupPeersRef.current.values()];
    try {
      stopLocalVideoTracks(stream);
      const track = await acquireLocalVideoTrack(facing);
      stream.addTrack(track);
      await replaceVideoOnPeerConnections(peerEntries, track, stream);
    } catch (e) {
      patchSession({ error: e?.message || 'Không đổi được camera' });
    }
  }, [sessionRef, patchSession]);

  const approveGroupJoin = useCallback((requesterId) => {
    const cur = sessionRef.current;
    if (!cur || cur.mode !== 'group' || !requesterId) return;
    socket?.emit('call:group_approve_join', { callId: cur.callId, requesterId });
    setGroupJoinRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
  }, [socket, sessionRef]);

  const denyGroupJoin = useCallback((requesterId) => {
    const cur = sessionRef.current;
    if (!cur || cur.mode !== 'group' || !requesterId) return;
    socket?.emit('call:group_deny_join', { callId: cur.callId, requesterId });
    setGroupJoinRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
  }, [socket, sessionRef]);

  const bindGroupHandlers = useCallback((sock) => {
    if (!sock) return () => {};

    const onLegacyIncoming = (p) => {
      if (!p?.isGroup || !p.callId) return;
      presentGroupIncoming(p);
    };

    const onGroupParticipants = async ({ callId, participants }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !participants?.length) return;
      patchSession({ state: 'CONNECTING', joinPending: false });
      try {
        await ensureLocalStream(cur.media);
        attachTracksToAllPeers();
      } catch { return; }
      for (const p of participants) {
        if (String(p.userId) === String(uid)) continue;
        const entry = getOrCreateGroupPc(callId, String(p.userId), p.name, cur.media);
        attachTracksToAllPeers();
        const tryOffer = async () => {
          const pc = entry.pc;
          if (!pc || pc.signalingState !== 'stable') return;
          try { await sendOfferToPeer(sock, callId, p.userId, pc); } catch { /* noop */ }
        };
        if (entry.pc) void tryOffer();
        else setTimeout(tryOffer, 300);
      }
    };

    const onGroupMemberJoined = async ({ callId, userId, name }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !userId) return;
      if (String(userId) === String(uid)) return;
      try {
        await ensureLocalStream(cur.media);
        attachTracksToAllPeers();
      } catch { return; }
      const entry = getOrCreateGroupPc(callId, String(userId), name, cur.media);
      attachTracksToAllPeers();
      const tryOffer = async () => {
        const pc = entry.pc;
        if (!pc) return;
        try { await sendOfferToPeer(sock, callId, userId, pc); } catch { /* noop */ }
      };
      if (entry.pc) void tryOffer();
      else setTimeout(tryOffer, 300);
      if (cur.direction === 'outgoing' && cur.state === 'RINGING') {
        clearGroupTimers();
        patchSession({ state: 'CONNECTING' });
      }
    };

    const onSignal = async ({ callId, fromUserId, signal }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !fromUserId || !signal) return;
      const peerId = String(fromUserId);
      const entry = getOrCreateGroupPc(callId, peerId, '', cur.media);
      attachTracksToAllPeers();
      const waitPc = async () => {
        for (let i = 0; i < 20 && !entry.pc; i += 1) {
          await new Promise((r) => setTimeout(r, 50));
        }
        return entry.pc;
      };
      const pc = entry.pc || await waitPc();
      if (!pc) return;
      await applyPeerSignal(pc, entry.pending, signal, (reply) => {
        sock.emit('call:signal', { callId, toUserId: peerId, signal: reply });
      });
    };

    const onEnded = ({ callId }) => {
      if (sessionRef.current?.mode === 'group' && sessionRef.current?.callId === callId) {
        resetGroup();
        sessionRef.current = null;
        setSession(null);
      }
    };

    const onRejected = ({ callId }) => {
      if (sessionRef.current?.mode === 'group' && sessionRef.current?.callId === callId) {
        resetGroup();
        patchSession({ state: 'REJECTED', error: 'Cuộc gọi bị từ chối' });
        setTimeout(() => { sessionRef.current = null; setSession(null); }, 1200);
      }
    };

    const onJoinPending = ({ callId }) => {
      const cur = sessionRef.current;
      if (cur?.mode === 'group' && cur.callId === callId && cur.joinPending) {
        patchSession({ state: 'RINGING', joinPending: true });
      }
    };

    const onJoinDenied = ({ callId }) => {
      const cur = sessionRef.current;
      if (cur?.mode === 'group' && cur.callId === callId) {
        resetGroup();
        patchSession({ state: 'REJECTED', error: 'Chủ phòng từ chối tham gia' });
        setTimeout(() => { sessionRef.current = null; setSession(null); }, 1200);
      }
    };

    const onJoinRequest = ({ callId, requesterId, requesterName, requestedAt }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !requesterId) return;
      setGroupJoinRequests((prev) => {
        if (prev.some((r) => r.requesterId === requesterId)) return prev;
        return [...prev, {
          requesterId,
          requesterName: requesterName || 'Thành viên',
          requestedAt: requestedAt || Date.now(),
        }];
      });
    };

    const onJoinCancelled = ({ callId, requesterId }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId || !requesterId) return;
      setGroupJoinRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
    };

    const onHostChanged = ({ callId, newHostId }) => {
      const cur = sessionRef.current;
      if (!cur || cur.mode !== 'group' || cur.callId !== callId) return;
      if (String(newHostId) !== String(uid)) setGroupJoinRequests([]);
    };

    sock.on('call:incoming', onLegacyIncoming);
    sock.on('call:group_participants', onGroupParticipants);
    sock.on('call:group_member_joined', onGroupMemberJoined);
    sock.on('call:signal', onSignal);
    sock.on('call:ended', onEnded);
    sock.on('call:rejected', onRejected);
    sock.on('call:group_join_pending', onJoinPending);
    sock.on('call:group_join_denied', onJoinDenied);
    sock.on('call:group_join_request', onJoinRequest);
    sock.on('call:group_join_cancelled', onJoinCancelled);
    sock.on('call:group_host_changed', onHostChanged);

    return () => {
      sock.off('call:incoming', onLegacyIncoming);
      sock.off('call:group_participants', onGroupParticipants);
      sock.off('call:group_member_joined', onGroupMemberJoined);
      sock.off('call:signal', onSignal);
      sock.off('call:ended', onEnded);
      sock.off('call:rejected', onRejected);
      sock.off('call:group_join_pending', onJoinPending);
      sock.off('call:group_join_denied', onJoinDenied);
      sock.off('call:group_join_request', onJoinRequest);
      sock.off('call:group_join_cancelled', onJoinCancelled);
      sock.off('call:group_host_changed', onHostChanged);
    };
  }, [
    uid, presentGroupIncoming, getOrCreateGroupPc, attachTracksToAllPeers, ensureLocalStream,
    sessionRef, setSession, resetGroup, patchSession, clearGroupTimers,
  ]);

  return {
    groupPeers,
    groupJoinRequests,
    localStreamRef,
    startGroupCall,
    joinGroupCall,
    acceptGroupCall,
    rejectGroupCall,
    endGroupCall,
    toggleGroupMute,
    toggleGroupCamera,
    switchGroupCamera,
    approveGroupJoin,
    denyGroupJoin,
    bindGroupHandlers,
    resetGroup,
  };
}

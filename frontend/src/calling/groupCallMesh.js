/**
 * Mesh WebRTC helpers — cuộc gọi nhóm (legacy call:signal protocol).
 */
import { getIceServers } from './turnConfig';

export async function flushIceCandidates(pc, pending) {
  const list = pending.splice(0);
  for (const c of list) {
    try { await pc.addIceCandidate(c); } catch { /* noop */ }
  }
}

export async function applyPeerSignal(pc, pending, signal, reply) {
  if (!signal?.type) return;
  if (signal.type === 'offer') {
    const state = pc.signalingState;
    if (state === 'have-local-offer') {
      try { await pc.setLocalDescription({ type: 'rollback' }); } catch { return; }
    } else if (state !== 'stable') return;
    await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    await flushIceCandidates(pc, pending);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    reply?.({ type: 'answer', sdp: answer.sdp });
  } else if (signal.type === 'answer') {
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    await flushIceCandidates(pc, pending);
  } else if (signal.type === 'candidate' && signal.candidate) {
    if (pc.remoteDescription?.type) {
      try { await pc.addIceCandidate(signal.candidate); } catch { /* noop */ }
    } else {
      pending.push(signal.candidate);
    }
  }
}

export async function createGroupPeerConnection(peerUserId, { onRemoteStream, onConnected, media }) {
  const iceServers = await getIceServers();
  const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
  const remoteStream = new MediaStream();
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      pc._onIce?.({ type: 'candidate', candidate: e.candidate });
    }
  };
  pc.ontrack = (e) => {
    e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
    onRemoteStream?.(peerUserId, remoteStream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') onConnected?.();
  };
  pc._media = media;
  return pc;
}

export async function getLocalMediaStream(media, existing) {
  if (existing) return existing;
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: media === 'video' ? { facingMode: 'user', width: 720, height: 1280 } : false,
  });
}

export function cloneAudioOnlyStream(stream) {
  if (!stream) return null;
  return new MediaStream(stream.getAudioTracks());
}

export function cloneStreamWithVideo(stream, videoTrack) {
  if (!stream || !videoTrack) return stream;
  return new MediaStream([...stream.getAudioTracks(), videoTrack]);
}

export function stopLocalVideoTracks(stream) {
  const tracks = [...(stream?.getVideoTracks() || [])];
  for (const track of tracks) {
    try { stream.removeTrack(track); } catch { /* noop */ }
    try { track.stop(); } catch { /* noop */ }
  }
  return cloneAudioOnlyStream(stream);
}

export async function acquireLocalVideoTrack(facing = 'front') {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing === 'back' ? 'environment' : 'user',
      width: 720,
      height: 1280,
    },
  });
  const track = stream.getVideoTracks()[0];
  stream.getTracks().forEach((t) => {
    if (t !== track) try { t.stop(); } catch { /* noop */ }
  });
  if (!track) throw new Error('Không truy cập được camera');
  return track;
}

export function getPeerVideoSender(pc) {
  if (!pc) return null;
  if (pc._videoSender) return pc._videoSender;
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video') || null;
  if (sender) pc._videoSender = sender;
  return sender;
}

export async function replaceVideoOnPeerConnections(peerEntries, track, localStream) {
  for (const entry of peerEntries) {
    const pc = entry?.pc;
    if (!pc) continue;
    const sender = getPeerVideoSender(pc);
    if (sender) {
      await sender.replaceTrack(track);
      pc._videoSender = sender;
    } else if (track && localStream) {
      pc._videoSender = pc.addTrack(track, localStream);
    }
  }
}

export async function sendOfferToPeer(socket, callId, toUserId, pc) {
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: pc._media === 'video',
  });
  await pc.setLocalDescription(offer);
  socket.emit('call:signal', {
    callId,
    toUserId,
    signal: { type: 'offer', sdp: offer.sdp },
  });
}

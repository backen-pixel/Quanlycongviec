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

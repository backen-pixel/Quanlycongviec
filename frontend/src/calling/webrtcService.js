/**
 * Data — bọc RTCPeerConnection (browser). SDP/ICE, ICE restart, điều khiển media.
 * Không biết socket/UI.
 */
export class WebRTCService {
  constructor(cb) {
    this.cb = cb || {};
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.pending = [];
    this.media = 'audio';
  }

  async start(iceServers, media) {
    this.media = media;
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    this.remoteStream = new MediaStream();
    this.pc.onicecandidate = (e) => { if (e.candidate) this.cb.onIceCandidate?.(e.candidate); };
    this.pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => this.remoteStream.addTrack(t));
      this.cb.onRemoteStream?.(this.remoteStream);
    };
    this.pc.oniceconnectionstatechange = () => this.cb.onConnectionState?.(this.pc.iceConnectionState);

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: media === 'video' ? { facingMode: 'user', width: 1280, height: 720 } : false,
    });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    this.cb.onLocalStream?.(this.localStream);
  }

  async createOffer(iceRestart = false) {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.media === 'video',
      iceRestart,
    });
    await this.pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }

  async createAnswer(remoteOffer) {
    await this.pc.setRemoteDescription(remoteOffer);
    await this.flush();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }

  async applyRemoteDescription(desc) {
    if (!this.pc) return null;
    if (desc.type === 'offer') {
      if (this.pc.signalingState === 'have-local-offer') {
        try { await this.pc.setLocalDescription({ type: 'rollback' }); } catch { return null; }
      }
      return this.createAnswer(desc);
    }
    if (desc.type === 'answer') {
      if (this.pc.signalingState !== 'have-local-offer') return null;
      await this.pc.setRemoteDescription(desc);
      await this.flush();
    }
    return null;
  }

  async addRemoteCandidate(candidate) {
    if (!this.pc) return;
    if (this.pc.remoteDescription?.type) {
      try { await this.pc.addIceCandidate(candidate); } catch { /* noop */ }
    } else {
      this.pending.push(candidate);
    }
  }

  async flush() {
    const list = this.pending.splice(0);
    for (const c of list) { try { await this.pc.addIceCandidate(c); } catch { /* noop */ } }
  }

  async restartIce() {
    if (!this.pc) return null;
    try { return await this.createOffer(true); } catch { return null; }
  }

  setMuted(muted) { this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; }); }
  setCameraOff(off) { this.localStream?.getVideoTracks().forEach((t) => { t.enabled = !off; }); }

  /** Đổi camera trước/sau (web: chỉ áp dụng nếu thiết bị có nhiều camera). */
  async switchCamera(facing) {
    if (this.media !== 'video' || !this.pc) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing === 'back' ? 'environment' : 'user' }, audio: false,
      });
      const newTrack = stream.getVideoTracks()[0];
      const sender = this.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender && newTrack) {
        const old = sender.track;
        await sender.replaceTrack(newTrack);
        old?.stop();
        this.localStream.removeTrack(old);
        this.localStream.addTrack(newTrack);
        this.cb.onLocalStream?.(this.localStream);
      }
    } catch { /* noop */ }
  }

  get signalingState() { return this.pc?.signalingState || 'closed'; }
  getLocalStream() { return this.localStream; }
  getRemoteStream() { return this.remoteStream; }

  close() {
    try { this.localStream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { this.pc?.close(); } catch { /* noop */ }
    this.pc = null; this.localStream = null; this.remoteStream = null; this.pending = [];
  }
}

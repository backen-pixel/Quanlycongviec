/**
 * Data layer — bọc RTCPeerConnection (react-native-webrtc).
 * Trách nhiệm: tạo PC với iceServers, lấy local media, tạo/áp dụng SDP, ICE candidate
 * (kèm buffer trước khi có remoteDescription), ICE restart khi mất mạng, và điều khiển
 * media (mute mic, camera, switch camera). KHÔNG biết gì về socket/UI (tách lớp).
 */
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  type MediaStream,
} from 'react-native-webrtc';
import type { CallMedia } from './types';

// react-native-incall-manager là tùy chọn (định tuyến loa/earpiece, proximity).
// Nếu chưa cài → no-op, app vẫn gọi được (audio theo mặc định hệ thống).
let InCallManager: any = null;
try {
  // @ts-ignore — optional native module, có thể chưa cài
  // eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-unresolved
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

type IceServer = { urls: string | string[]; username?: string; credential?: string };

export interface WebRTCCallbacks {
  onLocalStream?: (s: MediaStream) => void;
  onRemoteStream?: (s: MediaStream) => void;
  onIceCandidate?: (candidate: any) => void;
  /** state: 'connected' | 'disconnected' | 'failed' | 'closed' */
  onConnectionState?: (state: string) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: any[] = [];
  private cb: WebRTCCallbacks;
  private media: CallMedia = 'audio';

  constructor(cb: WebRTCCallbacks) {
    this.cb = cb;
  }

  async start(iceServers: IceServer[], media: CallMedia) {
    this.media = media;
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 } as any);
    this.attachPcEvents();
    await this.ensureLocalStream();
    try {
      InCallManager?.start({ media: media === 'video' ? 'video' : 'audio' });
      InCallManager?.setForceSpeakerphoneOn(media === 'video');
    } catch { /* noop */ }
  }

  private attachPcEvents() {
    const pc = this.pc!;
    (pc as any).onicecandidate = (e: any) => {
      if (e?.candidate) this.cb.onIceCandidate?.(e.candidate);
    };
    (pc as any).ontrack = (e: any) => {
      const [stream] = e.streams || [];
      if (stream) {
        this.remoteStream = stream;
        this.cb.onRemoteStream?.(stream);
      }
    };
    (pc as any).oniceconnectionstatechange = () => {
      this.cb.onConnectionState?.(pc.iceConnectionState);
    };
  }

  private async ensureLocalStream() {
    if (this.localStream) return this.localStream;
    const stream = (await mediaDevices.getUserMedia({
      audio: true,
      video: this.media === 'video'
        ? { facingMode: 'user', frameRate: 30, width: 1280, height: 720 }
        : false,
    })) as unknown as MediaStream;
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      this.pc!.addTrack(track, stream);
    }
    this.cb.onLocalStream?.(stream);
    return stream;
  }

  async createOffer(iceRestart = false): Promise<RTCSessionDescription> {
    const pc = this.pc!;
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.media === 'video',
      iceRestart,
    } as any);
    await pc.setLocalDescription(offer);
    return offer as RTCSessionDescription;
  }

  /** Áp dụng offer từ peer → tạo answer. */
  async createAnswer(remoteOffer: any): Promise<RTCSessionDescription> {
    const pc = this.pc!;
    await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
    await this.flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer as RTCSessionDescription;
  }

  /** Áp dụng SDP nhận được (offer→answer hoặc answer). Trả answer nếu cần gửi lại. */
  async applyRemoteDescription(desc: any): Promise<RTCSessionDescription | null> {
    const pc = this.pc!;
    if (!pc) return null;
    if (desc.type === 'offer') {
      // glare: nếu đang có local offer mà nhận offer → rollback (callee là polite).
      if (pc.signalingState === 'have-local-offer') {
        try { await pc.setLocalDescription({ type: 'rollback' } as any); } catch { return null; }
      }
      return this.createAnswer(desc);
    }
    if (desc.type === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return null;
      await pc.setRemoteDescription(new RTCSessionDescription(desc));
      await this.flushCandidates();
    }
    return null;
  }

  async addRemoteCandidate(candidate: any) {
    const pc = this.pc;
    if (!pc) return;
    if (pc.remoteDescription?.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* noop */ }
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  private async flushCandidates() {
    const list = this.pendingCandidates.splice(0);
    for (const c of list) {
      try { await this.pc!.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
    }
  }

  /** ICE restart khi kết nối 'failed'. Caller tạo lại offer(iceRestart=true). */
  async restartIce(): Promise<RTCSessionDescription | null> {
    if (!this.pc) return null;
    try {
      return await this.createOffer(true);
    } catch {
      return null;
    }
  }

  get signalingState() {
    return this.pc?.signalingState || 'closed';
  }

  // ─── Media controls ───
  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  setCameraOff(off: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => { t.enabled = !off; });
  }

  setSpeaker(on: boolean) {
    try { InCallManager?.setForceSpeakerphoneOn(on); } catch { /* noop */ }
  }

  switchCamera() {
    this.localStream?.getVideoTracks().forEach((t) => {
      try { (t as any)._switchCamera?.(); } catch { /* noop */ }
    });
  }

  getLocalStream() { return this.localStream; }
  getRemoteStream() { return this.remoteStream; }

  close() {
    try { InCallManager?.stop(); } catch { /* noop */ }
    try {
      this.localStream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    } catch { /* noop */ }
    try { (this.pc as any)?.close?.(); } catch { /* noop */ }
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.pendingCandidates = [];
  }
}

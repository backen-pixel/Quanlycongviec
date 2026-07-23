import React, { createContext, useContext } from 'react';
import type { CallPeer } from '../calling/types';
import { CALLING_ENABLED } from '../config';

type CallStatus = 'idle' | 'busy';

type Ctx = {
  session: null;
  localStream: null;
  remoteStream: null;
  groupPeers: never[];
  groupJoinRequests: never[];
  startCall: (peer: CallPeer) => Promise<void>;
  startVideoCall: (peer: CallPeer) => Promise<void>;
  startGroupCall: (...args: never[]) => Promise<void>;
  joinGroupCall: (...args: never[]) => void;
  approveGroupJoin: (...args: never[]) => void;
  denyGroupJoin: (...args: never[]) => void;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  applyIncomingFromPush: (...args: never[]) => void;
  handleNativeCallIntent: (...args: never[]) => void;
  dismissIncomingSilently: () => void;
  status: CallStatus;
};

const noopAsync = async () => {};
const noop = () => {};

/**
 * Stub khi CALLING_ENABLED=false.
 * Không import `../calling` / react-native-webrtc — tránh kéo ~11MB native + JS vào APK.
 * Bật lại cuộc gọi: khôi phục CallProvider thật + plugin webrtc + xóa exclusion trong react-native.config.js.
 */
const DISABLED_CALL_CTX: Ctx = {
  session: null,
  localStream: null,
  remoteStream: null,
  groupPeers: [],
  groupJoinRequests: [],
  startCall: noopAsync,
  startVideoCall: noopAsync,
  startGroupCall: noopAsync,
  joinGroupCall: noop,
  approveGroupJoin: noop,
  denyGroupJoin: noop,
  acceptCall: noopAsync,
  rejectCall: noop,
  endCall: noop,
  toggleMute: noop,
  toggleSpeaker: noop,
  toggleCamera: noop,
  switchCamera: noop,
  applyIncomingFromPush: noop,
  handleNativeCallIntent: noop,
  dismissIncomingSilently: noop,
  status: 'idle',
};

const CallCtx = createContext<Ctx | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  if (CALLING_ENABLED) {
    throw new Error(
      'CALLING_ENABLED=true nhưng WebRTC đang bị loại khỏi build. ' +
        'Xóa exclusion trong react-native.config.js, thêm lại plugin @config-plugins/react-native-webrtc, rồi prebuild.',
    );
  }
  return <CallCtx.Provider value={DISABLED_CALL_CTX}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const v = useContext(CallCtx);
  if (!v) throw new Error('useCall phải nằm trong CallProvider');
  return v;
}

import React, { createContext, useContext, useMemo } from 'react';
import {
  CallProvider as BaseCallProvider,
  useCall as useBaseCall,
  type CallPeer,
} from '../calling';
import { isActiveState } from '../calling/types';
import { CALLING_ENABLED } from '../config';

type CallStatus = 'idle' | 'busy';

type Ctx = ReturnType<typeof useBaseCall> & {
  status: CallStatus;
  startCall: (peer: CallPeer) => Promise<void>;
  startVideoCall: (peer: CallPeer) => Promise<void>;
};

const noopAsync = async () => {};
const noop = () => {};

/** Stub khi CALLING_ENABLED=false — không khởi tạo WebRTC / signaling. */
const DISABLED_CALL_CTX = {
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
  status: 'idle' as CallStatus,
} as unknown as Ctx;

const CallCtx = createContext<Ctx | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  if (!CALLING_ENABLED) {
    return <CallCtx.Provider value={DISABLED_CALL_CTX}>{children}</CallCtx.Provider>;
  }
  return (
    <BaseCallProvider>
      <CallBridge>{children}</CallBridge>
    </BaseCallProvider>
  );
}

function CallBridge({ children }: { children: React.ReactNode }) {
  const base = useBaseCall();
  const value = useMemo<Ctx>(() => {
    const busy = base.session != null && isActiveState(base.session.state);
    return {
      ...base,
      status: busy ? 'busy' : 'idle',
      startCall: (peer) => base.startCall(peer, 'audio'),
      startVideoCall: (peer) => base.startCall(peer, 'video'),
    };
  }, [base]);
  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const v = useContext(CallCtx);
  if (!v) throw new Error('useCall phải nằm trong CallProvider');
  return v;
}

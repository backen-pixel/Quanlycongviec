import React, { createContext, useContext, useMemo } from 'react';
import {
  CallProvider as BaseCallProvider,
  useCall as useBaseCall,
  type CallPeer,
} from '../calling';
import { isActiveState } from '../calling/types';

type CallStatus = 'idle' | 'busy';

type Ctx = ReturnType<typeof useBaseCall> & {
  status: CallStatus;
  startCall: (peer: CallPeer) => Promise<void>;
  startVideoCall: (peer: CallPeer) => Promise<void>;
};

const CallCtx = createContext<Ctx | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
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

import React, { createContext, useContext, useMemo } from 'react';
import { Alert } from 'react-native';

type CallStatus = 'idle';

type Ctx = {
  status: CallStatus;
  startCall: (_peer: { id: string; name: string; avatar?: string | null }) => Promise<void>;
  startGroupCall: (_group: {
    id: string;
    name: string;
    members: { id: string; name: string; avatar?: string | null }[];
  }) => Promise<void>;
};

const CallCtx = createContext<Ctx | null>(null);

/** Stub — cuộc gọi WebRTC sẽ bổ sung ở phase sau (giống sx-mobile). */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(
    () => ({
      status: 'idle' as const,
      startCall: async () => {
        Alert.alert('Cuộc gọi', 'Tính năng gọi thoại sẽ được bổ sung trong bản cập nhật tiếp theo.');
      },
      startGroupCall: async () => {
        Alert.alert('Cuộc gọi nhóm', 'Tính năng gọi nhóm sẽ được bổ sung trong bản cập nhật tiếp theo.');
      },
    }),
    [],
  );
  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const v = useContext(CallCtx);
  if (!v) throw new Error('useCall phải nằm trong CallProvider');
  return v;
}

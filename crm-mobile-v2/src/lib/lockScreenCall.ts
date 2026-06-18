import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type LockScreenCallNative = {
  updateCallState?: (
    callId: string,
    status: string,
    peerName: string,
    durationMs: number,
    isMuted: boolean,
  ) => void;
  dismissLockScreenUi?: () => void;
  isLockScreenUiActive?: () => Promise<boolean>;
  showOutgoingCall?: (
    callId: string,
    peerName: string,
    fromUserId: string,
    isGroup: boolean,
    groupName: string,
  ) => void;
};

const Native = NativeModules.LockScreenCall as LockScreenCallNative | undefined;
const emitter = Native ? new NativeEventEmitter(NativeModules.LockScreenCall) : null;

function toNativeCallStatus(status: string): string {
  if (status === 'active') return 'incall';
  return status;
}

export function syncLockScreenCallState(opts: {
  callId: string | null;
  status: string;
  peerName: string;
  durationMs: number;
  isMuted: boolean;
}): void {
  if (Platform.OS !== 'android' || !Native?.updateCallState || !opts.callId) return;
  Native.updateCallState(
    opts.callId,
    toNativeCallStatus(opts.status),
    opts.peerName,
    opts.durationMs,
    opts.isMuted,
  );
}

export function dismissLockScreenCallUi(): void {
  if (Platform.OS !== 'android') return;
  Native?.dismissLockScreenUi?.();
}

export async function isLockScreenCallUiActive(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Native?.isLockScreenUiActive) return false;
  try {
    return !!(await Native.isLockScreenUiActive());
  } catch {
    return false;
  }
}

export function showNativeOutgoingCall(opts: {
  callId: string;
  peerName: string;
  fromUserId: string;
  isGroup?: boolean;
  groupName?: string;
}): void {
  if (Platform.OS !== 'android' || !Native?.showOutgoingCall) return;
  try {
    Native.showOutgoingCall(
      opts.callId,
      opts.peerName,
      opts.fromUserId,
      !!opts.isGroup,
      opts.groupName || '',
    );
  } catch {
    /* ignore */
  }
}

export function subscribeLockScreenCallEnd(handler: (callId: string) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('LockScreenCallEnd', (e: { callId?: string }) => {
    if (e?.callId) handler(String(e.callId));
  });
  return () => sub.remove();
}

export function subscribeLockScreenToggleMute(handler: (callId: string) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('LockScreenCallToggleMute', (e: { callId?: string }) => {
    if (e?.callId) handler(String(e.callId));
  });
  return () => sub.remove();
}

export function subscribeLockScreenCallReject(
  handler: (callId: string, fromUserId?: string) => void,
): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('LockScreenCallReject', (e: { callId?: string; fromUserId?: string }) => {
    if (e?.callId) handler(String(e.callId), e.fromUserId ? String(e.fromUserId) : undefined);
  });
  return () => sub.remove();
}

export function subscribeLockScreenCallAccept(handler: (callId: string) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('LockScreenCallAccept', (e: { callId?: string }) => {
    if (e?.callId) handler(String(e.callId));
  });
  return () => sub.remove();
}

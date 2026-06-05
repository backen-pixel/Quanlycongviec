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
};

const Native = NativeModules.LockScreenCall as LockScreenCallNative | undefined;
const emitter = Native ? new NativeEventEmitter(NativeModules.LockScreenCall) : null;

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
    opts.status,
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

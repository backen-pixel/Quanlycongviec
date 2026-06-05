import { NativeModules, Platform } from 'react-native';
import type { IncomingCallPayload } from './incomingCallNotifications';

type NativeCallModule = {
  postIncomingCallNotification?: (
    callId: string,
    title: string,
    body: string,
    fromUserId: string,
    fromName: string,
    isGroup: boolean,
    groupId: string,
    groupName: string,
  ) => void;
  cancelIncomingCallNotification?: (callId: string) => void;
  markIncomingCallAnswered?: (callId: string) => void;
  setIncomingCallClaim?: (callId: string) => void;
  clearIncomingCallClaim?: (callId: string) => void;
  consumePendingCallIntent?: () => Promise<string | null>;
};

const Native = NativeModules.FloatingBubbleOverlay as NativeCallModule | undefined;

export function isNativeCallNotificationSupported(): boolean {
  return Platform.OS === 'android' && !!Native?.postIncomingCallNotification;
}

export function postNativeIncomingCallNotification(payload: IncomingCallPayload): boolean {
  if (!Native?.postIncomingCallNotification) return false;
  const isGroup = !!payload.isGroup;
  const title = isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi đến';
  const body = isGroup
    ? `${payload.fromName || 'Ai đó'} mời bạn tham gia «${payload.groupName || 'Nhóm'}»`
    : `${payload.fromName || 'Ai đó'} đang gọi bạn`;
  try {
    Native.postIncomingCallNotification(
      payload.callId,
      title,
      body,
      payload.fromUserId,
      payload.fromName || '',
      isGroup,
      payload.groupId || '',
      payload.groupName || '',
    );
    return true;
  } catch {
    return false;
  }
}

export function cancelNativeIncomingCallNotification(callId?: string | null): void {
  if (!callId || !Native?.cancelIncomingCallNotification) return;
  try {
    Native.cancelIncomingCallNotification(callId);
  } catch {
    /* ignore */
  }
}

/** Dừng chuông native ngay khi user bấm Trả lời (trước khi WebRTC kết nối xong). */
export function markNativeCallAnswered(callId?: string | null): void {
  if (!callId || !Native?.markIncomingCallAnswered) return;
  try {
    Native.markIncomingCallAnswered(callId);
  } catch {
    cancelNativeIncomingCallNotification(callId);
  }
}

export function setNativeIncomingCallClaim(callId?: string | null): void {
  if (!callId || !Native?.setIncomingCallClaim) return;
  try {
    Native.setIncomingCallClaim(callId);
  } catch {
    /* ignore */
  }
}

export function clearNativeIncomingCallClaim(callId?: string | null): void {
  if (!Native?.clearIncomingCallClaim) return;
  try {
    Native.clearIncomingCallClaim(callId || '');
  } catch {
    /* ignore */
  }
}

/** Intent mở app từ thông báo cuộc gọi native (Android). */
const STALE_CALL_MS = 90_000;

export async function consumeNativeCallIntent(): Promise<IncomingCallPayload | null> {
  if (Platform.OS !== 'android' || !Native?.consumePendingCallIntent) return null;
  try {
    const raw = await Native.consumePendingCallIntent();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IncomingCallPayload & { callAction?: string; stashedAt?: number };
    if (!parsed?.callId || !parsed?.fromUserId) return null;
    const stashedAt = Number(parsed.stashedAt || 0);
    if (stashedAt > 0 && Date.now() - stashedAt > STALE_CALL_MS) return null;
    const action = parsed.callAction;
    if (action === 'accept' || action === 'reject') {
      parsed.callAction = action;
    }
    return parsed;
  } catch {
    return null;
  }
}

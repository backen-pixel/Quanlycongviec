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

/** Intent mở app từ thông báo cuộc gọi native (Android). */
export async function consumeNativeCallIntent(): Promise<IncomingCallPayload | null> {
  if (Platform.OS !== 'android' || !Native?.consumePendingCallIntent) return null;
  try {
    const raw = await Native.consumePendingCallIntent();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IncomingCallPayload & { callAction?: string };
    if (!parsed?.callId || !parsed?.fromUserId) return null;
    const action = parsed.callAction;
    if (action === 'accept' || action === 'reject') {
      parsed.callAction = action;
    }
    return parsed;
  } catch {
    return null;
  }
}

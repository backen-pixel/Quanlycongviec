import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CRM_NOTIF_CHANNELS } from './notificationChannels';

export type IncomingCallPayload = {
  callId: string;
  kind?: string;
  fromUserId: string;
  fromName?: string;
  isGroup?: boolean;
  groupId?: string;
  groupName?: string;
};

const PENDING_CALL_KEY = 'crm_pending_incoming_call_v1';
const CALL_CATEGORY = 'incoming_call';

let categoriesReady = false;

async function ensureCallCategories() {
  if (categoriesReady) return;
  categoriesReady = true;
  try {
    await Notifications.setNotificationCategoryAsync(CALL_CATEGORY, [
      {
        identifier: 'accept_call',
        buttonTitle: 'Nghe',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'reject_call',
        buttonTitle: 'Từ chối',
        options: { isDestructive: true },
      },
    ]);
  } catch {
    /* ignore */
  }
}

export function parseIncomingCallData(data: unknown): IncomingCallPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'incoming_call') return null;
  const callId = String(d.call_id || d.callId || '');
  const fromUserId = String(d.from_user_id || d.fromUserId || '');
  if (!callId || !fromUserId) return null;
  return {
    callId,
    kind: typeof d.kind === 'string' ? d.kind : 'audio',
    fromUserId,
    fromName: typeof d.from_name === 'string' ? d.from_name : typeof d.fromName === 'string' ? d.fromName : undefined,
    isGroup: d.is_group === true || d.is_group === 'true' || d.isGroup === true,
    groupId: typeof d.group_id === 'string' ? d.group_id : typeof d.groupId === 'string' ? d.groupId : undefined,
    groupName:
      typeof d.group_name === 'string' ? d.group_name : typeof d.groupName === 'string' ? d.groupName : undefined,
  };
}

export async function storePendingIncomingCall(payload: IncomingCallPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CALL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function consumePendingIncomingCall(): Promise<IncomingCallPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CALL_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_CALL_KEY);
    return JSON.parse(raw) as IncomingCallPayload;
  } catch {
    return null;
  }
}

export async function clearPendingIncomingCall(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_CALL_KEY);
  } catch {
    /* ignore */
  }
}

export async function showIncomingCallNotification(payload: IncomingCallPayload): Promise<void> {
  await ensureCallCategories();
  const isGroup = !!payload.isGroup;
  const title = isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi đến';
  const body = isGroup
    ? `${payload.fromName || 'Ai đó'} mời bạn tham gia «${payload.groupName || 'Nhóm'}»`
    : `${payload.fromName || 'Ai đó'} đang gọi bạn`;

  await Notifications.scheduleNotificationAsync({
    identifier: `incoming_call_${payload.callId}`,
    content: {
      title,
      body,
      sound: 'default',
      sticky: true,
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: CALL_CATEGORY,
      data: {
        type: 'incoming_call',
        call_id: payload.callId,
        kind: payload.kind || 'audio',
        from_user_id: payload.fromUserId,
        from_name: payload.fromName || '',
        is_group: payload.isGroup ? 'true' : 'false',
        group_id: payload.groupId || '',
        group_name: payload.groupName || '',
      },
      ...(Platform.OS === 'android'
        ? { channelId: CRM_NOTIF_CHANNELS.call }
        : {}),
    },
    trigger: null,
  });
}

export async function dismissIncomingCallNotification(callId?: string | null): Promise<void> {
  if (!callId) return;
  try {
    await Notifications.dismissNotificationAsync(`incoming_call_${callId}`);
  } catch {
    /* ignore */
  }
}

export async function setupIncomingCallNotificationCategories(): Promise<void> {
  await ensureCallCategories();
}

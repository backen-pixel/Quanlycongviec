import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CRM_NOTIF_CHANNELS } from './notificationChannels';
import {
  cancelNativeIncomingCallNotification,
  postNativeIncomingCallNotification,
} from './nativeCallNotification';

export type IncomingCallPayload = {
  callId: string;
  kind?: string;
  fromUserId: string;
  fromName?: string;
  isGroup?: boolean;
  groupId?: string;
  groupName?: string;
  /** accept — mở app từ native sau khi user bấm Trả lời */
  callAction?: 'accept' | 'reject';
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
  const meta =
    d.metadata && typeof d.metadata === 'object' ? (d.metadata as Record<string, unknown>) : null;
  const type = String(d.type || meta?.type || '');
  if (type !== 'incoming_call') return null;

  const callId = String(d.call_id || d.callId || meta?.call_id || meta?.callId || '');
  const fromUserId = String(d.from_user_id || d.fromUserId || meta?.from_user_id || meta?.fromUserId || '');
  if (!callId || !fromUserId) return null;

  const isGroupRaw = d.is_group ?? d.isGroup ?? meta?.is_group ?? meta?.isGroup;
  const isGroup = isGroupRaw === true || isGroupRaw === 'true';

  return {
    callId,
    kind: typeof d.kind === 'string' ? d.kind : typeof meta?.kind === 'string' ? meta.kind : 'audio',
    fromUserId,
    fromName:
      typeof d.from_name === 'string'
        ? d.from_name
        : typeof d.fromName === 'string'
          ? d.fromName
          : typeof meta?.from_name === 'string'
            ? meta.from_name
            : undefined,
    isGroup,
    groupId:
      typeof d.group_id === 'string'
        ? d.group_id
        : typeof d.groupId === 'string'
          ? d.groupId
          : typeof meta?.group_id === 'string'
            ? meta.group_id
            : undefined,
    groupName:
      typeof d.group_name === 'string'
        ? d.group_name
        : typeof d.groupName === 'string'
          ? d.groupName
          : typeof meta?.group_name === 'string'
            ? meta.group_name
            : undefined,
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
  // Android: native notification đáng tin cậy hơn khi app ở nền / màn hình khóa
  if (postNativeIncomingCallNotification(payload)) return;

  await ensureCallCategories();
  const isGroup = !!payload.isGroup;
  const title = isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi đến';
  const body = isGroup
    ? `${payload.fromName || 'Ai đó'} mời bạn tham gia «${payload.groupName || 'Nhóm'}»`
    : `${payload.fromName || 'Ai đó'} đang gọi bạn`;

  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
  } catch {
    return;
  }

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
  cancelNativeIncomingCallNotification(callId);
  try {
    await Notifications.dismissNotificationAsync(`incoming_call_${callId}`);
  } catch {
    /* ignore */
  }
}

export async function setupIncomingCallNotificationCategories(): Promise<void> {
  await ensureCallCategories();
}

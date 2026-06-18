import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth, currentUserId } from '../context/AuthContext';
import { useMessengerRealtime } from '../context/MessengerRealtimeContext';
import {
  CRMV2_PREFS_CHANGED,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import { syncNativeAuthPrefs } from '../lib/nativeAuthSync';
import { Overlay, showChatBubbleForMessage } from '../lib/floatingBubbleOverlay';
import { buildMessengerNotifFromSocket } from '../lib/messengerNotifFromSocket';
import { navigationRef } from '../navigation/navigationRef';
import type { MessengerNotifPayload } from '../lib/localMessengerNotification';

function notifFromPush(
  data: Record<string, unknown>,
  body: string,
  title: string,
): MessengerNotifPayload | null {
  const type = typeof data.type === 'string' ? data.type : '';
  if (type !== 'messenger_chat') return null;
  const entityId =
    typeof data.entity_id === 'string' || typeof data.entity_id === 'number'
      ? String(data.entity_id)
      : typeof data.group_id === 'string'
        ? data.group_id
        : '';
  if (!entityId) return null;
  const meta =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : data;
  const senderName =
    typeof meta.sender_name === 'string'
      ? meta.sender_name
      : typeof data.sender_name === 'string'
        ? data.sender_name
        : '';
  const groupName =
    typeof meta.group_name === 'string'
      ? meta.group_name
      : typeof data.group_name === 'string'
        ? data.group_name
        : title || 'Tin nhắn';
  return {
    groupId: entityId,
    title: groupName,
    senderName: senderName || groupName,
    message: body || 'Có tin nhắn mới',
    messageId: typeof meta.message_id === 'string' ? meta.message_id : undefined,
    avatarUrl:
      typeof meta.sender_avatar === 'string'
        ? meta.sender_avatar
        : typeof data.sender_avatar === 'string'
          ? data.sender_avatar
          : null,
  };
}

/** Đồng bộ bong bóng chat native + auth prefs cho cuộc gọi khi app tắt. */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const uid = currentUserId(user);
  const { subscribeMessengerChat } = useMessengerRealtime();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const unreadRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadCrmMobilePrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    const sub = DeviceEventEmitter.addListener(CRMV2_PREFS_CHANGED, (p: CrmMobilePrefs) =>
      setPrefs(p),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    syncNativeAuthPrefs({ token, userId: uid });
  }, [token, uid]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const syncOverlay = () => {
      // Chỉ bật bong bóng khi app ra nền — tránh cướp focus lúc đang dùng CRM.
      if (AppState.currentState === 'active') return;
      void (async () => {
        if (!token || !uid || !prefs?.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        if (prefs.floatingChatBubbleOnlyWhenUnread && unreadRef.current <= 0) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        const can = await Overlay.canDrawOverlays?.().catch(() => false);
        if (!can) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        await Overlay.startOverlay?.().catch(() => {});
      })();
    };

    syncOverlay();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') syncOverlay();
    });
    return () => sub.remove();
  }, [token, uid, prefs]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeMessengerChat((row) => {
      const built = buildMessengerNotifFromSocket(row, uid);
      if (!built) return;
      void showChatBubbleForMessage(built, prefs, {
        isActive: AppState.currentState === 'active',
      });
    });
    return unsub;
  }, [subscribeMessengerChat, prefs, uid]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (!data || typeof data !== 'object') return;
      const payload = notifFromPush(
        data as Record<string, unknown>,
        notification.request.content.body || '',
        notification.request.content.title || '',
      );
      if (payload) {
        void showChatBubbleForMessage(payload, prefs, {
          isActive: AppState.currentState === 'active',
        });
      }
    });
    return () => sub.remove();
  }, [prefs]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.consumePendingGroup) return;

    const goChat = (groupId: string) => {
      let tries = 0;
      const nav = () => {
        if (!navigationRef.isReady()) {
          if (tries++ < 50) setTimeout(nav, 80);
          return;
        }
        navigationRef.navigate('ChatDetail', { groupId });
      };
      nav();
    };

    const tryOpen = () => {
      void Overlay.consumePendingGroup?.().then((gid) => {
        if (gid) goChat(gid);
      });
    };

    tryOpen();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tryOpen();
    });
    return () => sub.remove();
  }, []);

  return null;
}

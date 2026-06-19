import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth, currentUserId } from '../context/AuthContext';
import { useTheme } from '../theme';
import { useMessengerRealtime } from '../context/MessengerRealtimeContext';
import {
  CRMV2_PREFS_CHANGED,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import { syncNativeAuthPrefs } from '../lib/nativeAuthSync';
import { Overlay, showChatBubbleForMessage } from '../lib/floatingBubbleOverlay';
import { buildMessengerNotifFromSocket } from '../lib/messengerNotifFromSocket';
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

/** Đồng bộ bong bóng chat native — mở BubbleChat (RN) khi bấm bubble. */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { mode: themeMode } = useTheme();
  const uid = currentUserId(user);
  const { subscribeMessengerChat } = useMessengerRealtime();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const unreadRef = useRef(0);
  const openPanelGroupRef = useRef<string | null>(null);

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
    syncNativeAuthPrefs({ token, userId: uid, themeMode });
  }, [token, uid, themeMode]);

  useEffect(() => {
    const overlay = Overlay;
    if (Platform.OS !== 'android' || !overlay) return;

    const syncOverlay = () => {
      if (AppState.currentState === 'active') return;
      void (async () => {
        if (!token || !uid || !prefs?.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay) {
          await overlay.stopOverlay?.().catch(() => {});
          return;
        }
        if (prefs.floatingChatBubbleOnlyWhenUnread && unreadRef.current <= 0) {
          await overlay.stopOverlay?.().catch(() => {});
          return;
        }
        const can = await overlay.canDrawOverlays?.().catch(() => false);
        if (!can) {
          await overlay.stopOverlay?.().catch(() => {});
          return;
        }
        await overlay.startOverlay?.().catch(() => {});
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

  /** Bubble mở chat RN → đánh dấu nhóm đang xem (tránh badge/peek trùng). */
  useEffect(() => {
    if (Platform.OS !== 'android' || !uid) return;
    const sub = DeviceEventEmitter.addListener(
      'BubblePanelOpened',
      (p: { key?: string } | null) => {
        const groupId = p?.key?.trim();
        openPanelGroupRef.current = groupId || null;
      },
    );
    return () => sub.remove();
  }, [uid]);

  return null;
}

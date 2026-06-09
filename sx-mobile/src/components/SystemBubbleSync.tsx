import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, NativeModules, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { API_ORIGIN } from '../config';
import type { MessengerNotifPayload } from '../lib/localMessengerNotification';
import { resolveMediaUrl } from '../lib/messengerApi';
import { initialsFromName } from '../lib/messengerTheme';
import {
  canDrawOverlays,
  consumePendingBubbleChat,
  pushOverlayIncomingMessage,
  setBubbleBadge,
  startSystemBubbleOverlay,
  stopSystemBubbleOverlay,
} from '../lib/floatingBubbleOverlay';
import { getMessengerActiveGroupId } from '../lib/messengerActiveGroup';
import { navigationRef, openChatFromBubble } from '../navigation/navigationRef';

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      saveApiOrigin?: (origin: string) => void;
      saveAuthToken?: (token: string) => void;
      saveUserId?: (userId: string) => void;
    }
  | undefined;

function bubbleLetterFor(payload: MessengerNotifPayload): string {
  const name = payload.isGroup ? payload.title : (payload.senderName || payload.title);
  return initialsFromName(name || '?');
}

/**
 * Đồng bộ bong bóng native Android khi app nền / đã tắt (FCM wake).
 * Không hiện bong bóng khi app đang mở.
 */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { unreadTotal, threads } = useMessenger();
  const { subscribeMessengerNotif } = useNotifications();
  const overlayReadyRef = useRef(false);
  const threadsRef = useRef(threads);
  const appStateRef = useRef(AppState.currentState);
  const badge = Math.max(0, unreadTotal);
  const badgeRef = useRef(badge);
  threadsRef.current = threads;
  badgeRef.current = badge;

  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return undefined;
    if (API_ORIGIN) Overlay?.saveApiOrigin?.(API_ORIGIN);
    Overlay?.saveAuthToken?.(token);
    const uid = user?.id || user?.userId;
    if (uid) Overlay?.saveUserId?.(String(uid));
  }, [token, user?.id, user?.userId]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return undefined;
    let cancelled = false;

    const syncOverlay = async () => {
      if (cancelled) return;
      const allowed = await canDrawOverlays();
      if (!allowed) {
        overlayReadyRef.current = false;
        await stopSystemBubbleOverlay();
        return;
      }
      const started = await startSystemBubbleOverlay();
      overlayReadyRef.current = started;
    };

    void syncOverlay();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      appStateRef.current = s;
      if (s === 'active' || s === 'background' || s === 'inactive') void syncOverlay();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [token]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Đồng bộ badge tổng tin chưa đọc lên bong bóng native (khi app nền / mở lại).
    if (appStateRef.current !== 'active' || badge > 0) {
      setBubbleBadge(badge);
    }
  }, [badge]);

  const pushToOverlay = (payload: MessengerNotifPayload) => {
    if (getMessengerActiveGroupId() === payload.groupId) return;
    if (appStateRef.current === 'active') return;
    void (async () => {
      if (!(await canDrawOverlays())) return;
      if (!overlayReadyRef.current) {
        overlayReadyRef.current = await startSystemBubbleOverlay();
      }
      const thread = threadsRef.current.find((t) => t.id === payload.groupId);
      const avatarUrl = resolveMediaUrl(payload.avatarUrl || thread?.avatarUrl || null);
      pushOverlayIncomingMessage({
        groupId: payload.groupId,
        title: payload.title || thread?.name || 'Tin nhắn',
        letter: bubbleLetterFor({
          ...payload,
          title: payload.title || thread?.name || 'Chat',
        }),
        senderName: payload.senderName || payload.title,
        message: payload.message,
        avatarUrl,
      });
      setBubbleBadge(badgeRef.current);
    })();
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    return subscribeMessengerNotif(pushToOverlay);
  }, [subscribeMessengerNotif]);

  /** FCM / local notification khi app nền — socket có thể đã ngắt. */
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      if (AppState.currentState === 'active') return;
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (!data || String(data.type || '') !== 'messenger_chat') return;
      const groupId = String(data.entity_id ?? data.group_id ?? '');
      if (!groupId) return;
      const title = String(data.group_name ?? notification.request.content.title ?? 'Tin nhắn');
      const senderName = String(data.sender_name ?? title);
      const message = String(notification.request.content.body ?? data.message ?? '');
      pushToOverlay({
        groupId,
        title,
        senderName,
        message,
        avatarUrl: typeof data.sender_avatar === 'string' ? data.sender_avatar : null,
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const tryOpen = () => {
      void (async () => {
        const pending = await consumePendingBubbleChat();
        if (!pending) return;
        let tries = 0;
        const go = () => {
          if (!navigationRef.isReady()) {
            if (tries++ < 50) setTimeout(go, 80);
            return;
          }
          openChatFromBubble(pending.groupId, pending.title);
        };
        go();
      })();
    };

    tryOpen();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') tryOpen();
    });
    return () => sub.remove();
  }, []);

  return null;
}

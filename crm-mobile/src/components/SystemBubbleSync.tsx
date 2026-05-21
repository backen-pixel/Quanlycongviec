import React, { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { navigationRef } from '../navigation/navigationRef';
import {
  CRM_MOBILE_PREFS_CHANGED,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import { API_ORIGIN, WEB_APP_ORIGIN } from '../config';
import { toBubbleStorageKey, parseBubbleStorageKey } from '../lib/bubbleNativeEvents';
import { markLeadChatRead, markMessengerGroupRead } from '../lib/markChatRead';
import type { AppNotification } from '../types/notifications';

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
      setBadgeCount?: (n: number) => void;
      consumeOpenMessenger?: () => Promise<boolean>;
      saveAuthToken?: (token: string) => void;
      saveWebOrigin?: (origin: string) => void;
      showConvBubble?: (groupId: string, title: string, avatarLetter: string) => void;
      hideConvBubble?: (groupId: string) => void;
      showPeek?: (sender: string, message: string, bubbleKey: string | null) => void;
      noteConv?: (groupId: string, title: string, avatarLetter: string) => void;
      noteConvWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
      pushIncomingMessage?: (
        bubbleKey: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
        senderName: string,
        message: string,
      ) => void;
      consumePendingGroup?: () => Promise<string | null>;
      minimizeApp?: () => void;
      // Phase 3: Android Bubbles API
      areBubblesSupported?: () => Promise<boolean>;
      postBubbleNotification?: (
        bubbleKey: string,
        title: string,
        senderName: string,
        message: string,
        avatarLetter: string,
        autoExpand: boolean,
      ) => void;
      cancelBubbleNotification?: (bubbleKey: string) => void;
      isBubbleExpanded?: (bubbleKey: string) => Promise<boolean>;
      saveUserAvatarUrl?: (url: string) => void;
      showConvBubbleWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
    }
  | undefined;

function absoluteAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const u = raw.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${u.replace(/^\//, '')}` : u;
}

function metaRecord(n: AppNotification): Record<string, unknown> {
  return n.metadata && typeof n.metadata === 'object'
    ? (n.metadata as Record<string, unknown>)
    : {};
}

function displayTitleForChat(n: AppNotification): {
  bubbleKey: string;
  title: string;
  letter: string;
  senderName: string;
  senderLetter: string;
  senderAvatarUrl: string;
} {
  const meta = metaRecord(n);
  const entityId = String(n.entity_id || '');
  const bubbleKey = toBubbleStorageKey(n.type, entityId);
  const senderName =
    typeof meta.sender_name === 'string'
      ? meta.sender_name
      : typeof meta.sender === 'string'
        ? meta.sender
        : 'Tin nhắn mới';
  const senderLetter = senderName.trim()[0]?.toUpperCase() ?? '?';
  const senderAvatarUrl = absoluteAvatarUrl(meta.sender_avatar);

  if (n.type === 'lead_chat') {
    const leadTitle = n.title || 'Lead';
    const display = `🤝 ${leadTitle}`;
    const letter = display.trim()[0]?.toUpperCase() ?? 'L';
    return { bubbleKey, title: display, letter, senderName, senderLetter, senderAvatarUrl };
  }

  const groupName = typeof meta.group_name === 'string' ? meta.group_name : (n.title ?? entityId);
  const letter = String(groupName).trim()[0]?.toUpperCase() ?? '?';
  return { bubbleKey, title: groupName, letter, senderName, senderLetter, senderAvatarUrl };
}

function pushOverlayBubble(
  bubbleKey: string,
  title: string,
  avatarLetter: string,
  senderAvatarUrl: string,
) {
  if (!Overlay) return;
  if (senderAvatarUrl && Overlay.showConvBubbleWithAvatar) {
    Overlay.showConvBubbleWithAvatar(bubbleKey, title, avatarLetter, senderAvatarUrl);
  } else {
    Overlay.showConvBubble?.(bubbleKey, title, avatarLetter);
  }
}

function noteOverlayConv(
  bubbleKey: string,
  title: string,
  avatarLetter: string,
  senderAvatarUrl: string,
) {
  if (!Overlay) return;
  if (senderAvatarUrl && Overlay.noteConvWithAvatar) {
    Overlay.noteConvWithAvatar(bubbleKey, title, avatarLetter, senderAvatarUrl);
  } else {
    Overlay.noteConv?.(bubbleKey, title, avatarLetter);
  }
}

/**
 * Đồng bộ bong bóng native (Android overlay) với prefs + badge + mở chat khi chạm bubble.
 */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { chatUnreadCount, subscribeIncoming, refreshUnread } = useNotifications();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const lastTokenRef = useRef<string | null>(null);

  const badge = Math.max(0, Number(chatUnreadCount) || 0);

  useEffect(() => {
    let cancelled = false;
    void loadCrmMobilePrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    const sub = DeviceEventEmitter.addListener(CRM_MOBILE_PREFS_CHANGED, (p: CrmMobilePrefs) =>
      setPrefs(p),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    if (token && token !== lastTokenRef.current) {
      lastTokenRef.current = token;
      Overlay.saveAuthToken?.(token);
      // Web origin để overlay WebView mở /crm/messenger?openGroup=...
      // Backend của TuBep cũng phục vụ frontend SPA cùng host, nên dùng API_ORIGIN
      // làm fallback khi user chưa set EXPO_PUBLIC_WEB_APP_URL.
      const webOrigin = WEB_APP_ORIGIN || API_ORIGIN;
      if (webOrigin) Overlay.saveWebOrigin?.(webOrigin);
    }
  }, [token, user]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const sync = () => {
      void (async () => {
        if (!token || !user || !prefs) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        const master = prefs.floatingChatBubbleEnabled;
        const sys = prefs.floatingChatBubbleSystemOverlay;
        const onlyUnread = prefs.floatingChatBubbleOnlyWhenUnread;
        if (!master || !sys) {
          await Overlay.stopOverlay?.().catch(() => {});
          return;
        }
        if (onlyUnread && badge === 0) {
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

    sync();
    // Khi app rời foreground (kéo về home / vuốt khỏi Recents), gọi startOverlay lại để
    // re-attach bubble — quan trọng cho trường hợp user đã ẩn bubble (kéo xuống đáy) hoặc
    // service mới được Android restart sau khi swipe app khỏi Recents.
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') sync();
    });
    return () => sub.remove();
  }, [token, user, prefs, badge]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.setBadgeCount) return;
    Overlay.setBadgeCount(badge);
  }, [badge]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    const unsub = subscribeIncoming((n) => {
      if (!isChatNotification(n)) return;
      const { bubbleKey, title, letter, senderName, senderLetter, senderAvatarUrl } =
        displayTitleForChat(n);
      if (!bubbleKey) return;

      const msgContent = n.message ?? '';
      // Avatar bong bóng = người gửi tin (giống Messenger), không phải avatar user đăng nhập.
      const bubbleAvatarLetter = senderLetter || letter;

      const isActive = AppState.currentState === 'active';
      if (isActive) {
        noteOverlayConv(bubbleKey, title, bubbleAvatarLetter, senderAvatarUrl);
        return;
      }

      // Ngoài app — quyết định bubble strategy theo prefs:
      // 1) Ưu tiên Android Bubbles API (Android 11+, user không cấm) nếu prefs bật.
      // 2) Fallback overlay tự vẽ (cần SYSTEM_ALERT_WINDOW).
      void (async () => {
        const preferBubbles =
          prefs?.useAndroidBubblesWhenAvailable === true &&
          Overlay.areBubblesSupported &&
          Overlay.postBubbleNotification;
        if (preferBubbles) {
          try {
            const supported = await Overlay.areBubblesSupported!();
            if (supported) {
              Overlay.postBubbleNotification!(
                bubbleKey,
                title,
                senderName,
                msgContent,
                letter,
                false,
              );
              return;
            }
          } catch {
            /* rơi xuống overlay */
          }
        }
        if (Overlay.pushIncomingMessage) {
          Overlay.pushIncomingMessage(
            bubbleKey,
            title,
            bubbleAvatarLetter,
            senderAvatarUrl,
            senderName,
            msgContent,
          );
        } else {
          pushOverlayBubble(bubbleKey, title, bubbleAvatarLetter, senderAvatarUrl);
          Overlay.showPeek?.(senderName, msgContent, bubbleKey);
        }
      })();
    });
    return unsub;
  }, [subscribeIncoming, prefs]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const navigateFromBubbleKey = async (bubbleKey: string) => {
      const parsed = parseBubbleStorageKey(bubbleKey);
      try {
        if (parsed.kind === 'lead') {
          await markLeadChatRead(parsed.entityId);
          void refreshUnread();
          if (!navigationRef.isReady()) return;
          navigationRef.navigate('Main', {
            screen: 'CrmTab',
            params: {
              screen: 'LeadDetail',
              params: { id: parsed.entityId, openLeadChat: true },
            },
          });
          return;
        }
        await markMessengerGroupRead(parsed.entityId);
        void refreshUnread();
        if (!navigationRef.isReady()) return;
        navigationRef.navigate('BubbleChat', { groupId: parsed.entityId });
      } catch {
        if (!navigationRef.isReady()) return;
        if (parsed.kind === 'lead') {
          navigationRef.navigate('Main', {
            screen: 'CrmTab',
            params: {
              screen: 'LeadDetail',
              params: { id: parsed.entityId, openLeadChat: true },
            },
          });
        } else {
          navigationRef.navigate('BubbleChat', { groupId: parsed.entityId });
        }
      }
    };

    const tryNavigate = () => {
      void (async () => {
        try {
          const pendingKey = await Overlay.consumePendingGroup?.();
          if (pendingKey) {
            let tries = 0;
            const go = () => {
              if (!navigationRef.isReady()) {
                if (tries++ < 50) setTimeout(go, 80);
                return;
              }
              void navigateFromBubbleKey(pendingKey);
            };
            go();
            return;
          }

          const open = await Overlay.consumeOpenMessenger?.();
          if (!open) return;

          let tries = 0;
          const go = () => {
            if (!navigationRef.isReady()) {
              if (tries++ < 50) setTimeout(go, 80);
              return;
            }
            navigationRef.navigate('Main', {
              screen: 'MoreTab',
              params: { screen: 'MessengerGroupList' },
            });
          };
          go();
        } catch {
          /* */
        }
      })();
    };

    tryNavigate();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') tryNavigate();
    });
    return () => sub.remove();
  }, [refreshUnread]);

  return null;
}

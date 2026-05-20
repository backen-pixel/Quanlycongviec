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
import { WEB_APP_ORIGIN } from '../config';
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
      showPeek?: (sender: string, message: string) => void;
      consumePendingGroup?: () => Promise<string | null>;
      minimizeApp?: () => void;
    }
  | undefined;

function displayTitleForChat(n: AppNotification): { bubbleKey: string; title: string; letter: string } {
  const meta = (n.metadata && typeof n.metadata === 'object')
    ? (n.metadata as Record<string, unknown>)
    : {};
  const entityId = String(n.entity_id || '');
  const bubbleKey = toBubbleStorageKey(n.type, entityId);

  if (n.type === 'lead_chat') {
    const leadTitle = n.title || 'Lead';
    const display = `🤝 ${leadTitle}`;
    const letter = display.trim()[0]?.toUpperCase() ?? 'L';
    return { bubbleKey, title: display, letter };
  }

  const groupName = typeof meta.group_name === 'string' ? meta.group_name : (n.title ?? entityId);
  const letter = String(groupName).trim()[0]?.toUpperCase() ?? '?';
  return { bubbleKey, title: groupName, letter };
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
      if (WEB_APP_ORIGIN) Overlay.saveWebOrigin?.(WEB_APP_ORIGIN);
    }
  }, [token]);

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
  }, [token, user, prefs, badge]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.setBadgeCount) return;
    Overlay.setBadgeCount(badge);
  }, [badge]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    const unsub = subscribeIncoming((n) => {
      if (!isChatNotification(n)) return;
      const { bubbleKey, title, letter } = displayTitleForChat(n);
      if (!bubbleKey) return;

      const senderName = typeof (n.metadata as Record<string, unknown>)?.sender_name === 'string'
        ? (n.metadata as Record<string, unknown>).sender_name as string
        : typeof (n.metadata as Record<string, unknown>)?.sender === 'string'
          ? (n.metadata as Record<string, unknown>).sender as string
          : 'Tin nhắn mới';
      const msgContent = n.message ?? '';

      const isActive = AppState.currentState === 'active';
      if (isActive) return;

      Overlay.showConvBubble?.(bubbleKey, title, letter);
      Overlay.showPeek?.(senderName, msgContent);
    });
    return unsub;
  }, [subscribeIncoming]);

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

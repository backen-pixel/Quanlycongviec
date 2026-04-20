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

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
      setBadgeCount?: (n: number) => void;
      consumeOpenMessenger?: () => Promise<boolean>;
      saveAuthToken?: (token: string) => void;
      showConvBubble?: (groupId: string, title: string, avatarLetter: string) => void;
      hideConvBubble?: (groupId: string) => void;
      showPeek?: (sender: string, message: string) => void;
      consumePendingGroup?: () => Promise<string | null>;
      minimizeApp?: () => void;
    }
  | undefined;

/**
 * Đồng bộ bong bóng native (Android overlay) với prefs + badge + mở Messenger khi chạm bubble.
 * Phiên bản mới hỗ trợ:
 * - saveAuthToken khi token thay đổi
 * - showConvBubble + showPeek khi nhận messenger_chat
 * - consumePendingGroup navigation (tap conversation bubble)
 */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { chatUnreadCount, subscribeIncoming } = useNotifications();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const lastTokenRef = useRef<string | null>(null);

  const badge = Math.max(0, Number(chatUnreadCount) || 0);

  // ─── Load prefs ─────────────────────────────────────────────────────────────
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

  // ─── Lưu auth token vào native khi thay đổi ─────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.saveAuthToken) return;
    if (token && token !== lastTokenRef.current) {
      lastTokenRef.current = token;
      Overlay.saveAuthToken(token);
    }
  }, [token]);

  // ─── Start / Stop overlay dựa trên prefs + badge ─────────────────────────────
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

  // ─── Badge count ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay?.setBadgeCount) return;
    Overlay.setBadgeCount(badge);
  }, [badge]);

  // ─── Subscribe incoming notifications: showConvBubble + showPeek ─────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;
    const unsub = subscribeIncoming((n) => {
      if (!isChatNotification(n)) return;
      const meta = (n.metadata && typeof n.metadata === 'object')
        ? (n.metadata as Record<string, unknown>)
        : {};
      const groupId = n.entity_id ?? '';
      if (!groupId) return;
      const groupName = typeof meta.group_name === 'string' ? meta.group_name : (n.title ?? groupId);
      const letter = String(groupName).trim()[0]?.toUpperCase() ?? '?';
      const senderName = typeof meta.sender_name === 'string'
        ? meta.sender_name
        : (typeof meta.sender === 'string' ? meta.sender : 'Tin nhắn mới');
      const msgContent = n.message ?? '';
      Overlay.showConvBubble?.(groupId, groupName, letter);
      Overlay.showPeek?.(senderName, msgContent);
    });
    return unsub;
  }, [subscribeIncoming]);

  // ─── Navigation: consumePendingGroup (tap conv bubble) ────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !Overlay) return;

    const tryNavigate = () => {
      void (async () => {
        try {
          // Ưu tiên consumePendingGroup (tap bubble conversation cụ thể)
          const pendingGroupId = await Overlay.consumePendingGroup?.();
          if (pendingGroupId) {
            let tries = 0;
            const go = () => {
              if (!navigationRef.isReady()) {
                if (tries++ < 50) setTimeout(go, 80);
                return;
              }
              // Dùng BubbleChat (root screen) — không có tab bar, back → minimizeApp
              navigationRef.navigate('BubbleChat', {
                groupId: pendingGroupId,
              });
            };
            go();
            return;
          }

          // Fallback: consumeOpenMessenger (tap bubble tổng không có groupId)
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
  }, []);

  return null;
}

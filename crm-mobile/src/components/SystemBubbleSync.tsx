import React, { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
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
    }
  | undefined;

/**
 * Đồng bộ bong bóng native (Android overlay) với prefs + badge + mở Messenger khi chạm bubble.
 */
export default function SystemBubbleSync() {
  const { token, user } = useAuth();
  const { chatUnreadCount } = useNotifications();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);

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
    if (Platform.OS !== 'android' || !Overlay?.consumeOpenMessenger) return;

    const tryNavigate = () => {
      void (async () => {
        try {
          const open = await Overlay.consumeOpenMessenger?.();
          if (!open) return;
          let tries = 0;
          const go = () => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('Main', {
                screen: 'MoreTab',
                params: { screen: 'MessengerGroupList' },
              });
              return;
            }
            if (tries++ < 50) setTimeout(go, 80);
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

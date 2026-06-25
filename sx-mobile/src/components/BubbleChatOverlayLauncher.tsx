import { useEffect, useRef } from 'react';
import { AppState, DeviceEventEmitter, InteractionManager, Platform } from 'react-native';
import {
  isOnBubbleChatRoute,
  navigationRef,
  resetToBubbleChat,
} from '../navigation/navigationRef';
import { hasPendingBubbleChat, peekPendingBubbleChatSync } from '../lib/bubbleChatPending';
import { Overlay } from '../lib/floatingBubbleOverlay';
import { markMessengerGroupRead } from '../lib/messengerApi';

function openBubbleChat(threadId: string, title: string) {
  if (isOnBubbleChatRoute(threadId)) return;

  const run = () => {
    if (isOnBubbleChatRoute(threadId)) return;
    resetToBubbleChat(threadId, title);
    void markMessengerGroupRead(threadId).catch(() => {});
  };

  if (navigationRef.isReady()) {
    InteractionManager.runAfterInteractions(run);
    return;
  }

  const started = Date.now();
  const timer = setInterval(() => {
    if (navigationRef.isReady()) {
      clearInterval(timer);
      InteractionManager.runAfterInteractions(run);
      return;
    }
    if (Date.now() - started > 15000) clearInterval(timer);
  }, 40);
}

/** Mở BubbleChat khi bấm bong bóng — ưu tiên trước UpdateGate, không flash tab app. */
export default function BubbleChatOverlayLauncher() {
  const openingRef = useRef(false);

  const tryOpen = (groupId?: string, title?: string) => {
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      let threadId = groupId?.trim() || '';
      let chatTitle = title?.trim() || '';
      if (!threadId) {
        const pending = peekPendingBubbleChatSync();
        if (!pending?.threadId) return;
        threadId = pending.threadId;
        chatTitle = pending.title;
      }
      openBubbleChat(threadId, chatTitle || 'Chat');
    } finally {
      setTimeout(() => {
        openingRef.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (hasPendingBubbleChat()) {
      tryOpen();
    }

    const panelSub = DeviceEventEmitter.addListener(
      'BubblePanelOpened',
      (p: { key?: string; title?: string; fullApp?: boolean } | null) => {
        if (!p?.fullApp) return;
        const gid = p?.key?.trim();
        if (!gid) return;
        if (isOnBubbleChatRoute(gid)) return;
        tryOpen(gid, p?.title?.trim() || undefined);
      },
    );

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!hasPendingBubbleChat()) return;
      if (isOnBubbleChatRoute()) return;
      tryOpen();
    });

    return () => {
      panelSub.remove();
      appSub.remove();
    };
  }, []);

  return null;
}

/** Xóa pending sau khi BubbleChat đã hiển thị — giữ flag cho UpdateGate tới lúc này. */
export function consumeBubbleChatPendingAfterMount(): void {
  if (Platform.OS !== 'android') return;
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      void Overlay?.consumePendingChat?.().catch(() => {});
    }, 800);
  });
}

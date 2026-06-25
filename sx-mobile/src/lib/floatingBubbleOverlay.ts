import { Alert, AppState, Linking, NativeModules, Platform } from 'react-native';
import { API_ORIGIN } from '../config';
import { getMessengerActiveGroupId } from './messengerActiveGroup';
import type { MessengerNotifPayload } from './localMessengerNotification';
import type { IncomingCallPayload } from './incomingCallNotifications';
import {
  DEFAULT_SX_MOBILE_PREFS,
  loadSxMobilePrefs,
  type SxMobilePrefs,
} from './sxMobilePrefs';

export const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      openOverlaySettings?: () => void;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
      setBadgeCount?: (n: number) => void;
      showConvBubble?: (groupId: string, title: string, avatarLetter: string) => void;
      showConvBubbleRich?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
        senderName: string,
        preview: string,
      ) => void;
      showConvBubbleWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
      noteConv?: (groupId: string, title: string, avatarLetter: string) => void;
      noteConvWithAvatar?: (
        groupId: string,
        title: string,
        avatarLetter: string,
        avatarUrl: string,
      ) => void;
      showPeek?: (sender: string, message: string, bubbleKey: string | null) => void;
      postChatNotification?: (
        bubbleKey: string,
        title: string,
        sender: string,
        avatar: string | null,
        message: string,
        messageId: string | null,
        messageType: string | null,
      ) => void;
      seedConversationMessages?: (groupId: string, msgsJson: string) => void;
      appendPanelMessage?: (groupId: string, sender: string, message: string) => void;
      consumePendingChat?: () => Promise<{ threadId?: string; title?: string } | null>;
      peekPendingBubbleChat?: () => { threadId?: string; title?: string } | null;
      peekPendingOutboundCall?: () => { groupId?: string; title?: string; media?: string } | null;
      consumePendingOutboundCall?: () => Promise<{ groupId?: string; title?: string; media?: string } | null>;
      minimizeApp?: () => void;
      openChatPanel?: (groupId: string, title: string) => void;
      closeChatPanel?: () => void;
      saveAuthToken?: (token: string) => void;
      saveApiOrigin?: (origin: string) => void;
      saveUserId?: (userId: string) => void;
      saveUiTheme?: (mode: string) => void;
      showCallOverlay?: (
        callId: string,
        fromName: string,
        kind: string,
        isGroup: boolean,
        groupName: string,
      ) => void;
      hideCallOverlay?: (callId: string) => void;
    }
  | undefined;

export function isFloatingBubbleSupported(): boolean {
  return Platform.OS === 'android' && !!Overlay?.startOverlay;
}

export const isBubbleOverlaySupported = isFloatingBubbleSupported;

function absolutizeAvatar(raw?: string | null): string {
  if (!raw?.trim()) return '';
  const u = raw.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = (API_ORIGIN || '').replace(/\/$/, '');
  return base ? `${base}/${u.replace(/^\//, '')}` : u;
}

function pushBubble(
  groupId: string,
  title: string,
  letter: string,
  avatarUrl: string,
  senderName?: string,
  preview?: string,
) {
  if (!Overlay) return;
  const sender = senderName?.trim() || '';
  const body = preview?.trim() || '';
  if (Overlay.showConvBubbleRich) {
    Overlay.showConvBubbleRich(groupId, title, letter, avatarUrl, sender, body);
  } else if (avatarUrl && Overlay.showConvBubbleWithAvatar) {
    Overlay.showConvBubbleWithAvatar(groupId, title, letter, avatarUrl);
  } else {
    Overlay.showConvBubble?.(groupId, title, letter);
  }
  if (avatarUrl && Overlay.noteConvWithAvatar) {
    Overlay.noteConvWithAvatar(groupId, title, letter, avatarUrl);
  } else {
    Overlay.noteConv?.(groupId, title, letter);
  }
}

/** Hiện bong bóng chat nổi + peek khi có tin nhắn mới. */
export async function showChatBubbleForMessage(
  p: MessengerNotifPayload,
  prefs: SxMobilePrefs | null,
  opts?: { isActive?: boolean },
): Promise<void> {
  if (Platform.OS !== 'android' || !Overlay) return;

  const effectivePrefs = prefs ?? await loadSxMobilePrefs();
  if (!effectivePrefs.floatingChatBubbleEnabled || !effectivePrefs.floatingChatBubbleSystemOverlay) {
    return;
  }

  const groupId = p.groupId?.trim();
  if (!groupId) return;

  const isActive = opts?.isActive ?? AppState.currentState === 'active';
  if (isActive && getMessengerActiveGroupId() === groupId) return;

  const title = p.title?.trim() || 'Tin nhắn';
  const sender = p.senderName?.trim() || title;
  const letter = sender[0]?.toUpperCase() || title[0]?.toUpperCase() || '?';
  const avatarUrl = absolutizeAvatar(p.avatarUrl);
  const message = p.message?.trim() || 'Có tin nhắn mới';

  const can = await Overlay.canDrawOverlays?.().catch(() => false);
  if (!can) return;

  await Overlay.startOverlay?.().catch(() => false);
  pushBubble(groupId, title, letter, avatarUrl, sender, message);

  if (isActive) {
    try {
      Overlay.postChatNotification?.(
        groupId,
        title,
        sender,
        avatarUrl || null,
        message,
        p.messageId || null,
        null,
      );
    } catch {
      /* ignore */
    }
  } else {
    try {
      Overlay.showPeek?.(sender, message, groupId);
    } catch {
      /* ignore */
    }
  }
}

export async function canDrawOverlays(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Overlay?.canDrawOverlays) return false;
  return Overlay.canDrawOverlays().catch(() => false);
}

export function openOverlaySettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    if (Overlay?.openOverlaySettings) {
      Overlay.openOverlaySettings();
      return;
    }
  } catch {
    /* fallthrough */
  }
  void Linking.openSettings();
}

export async function ensureOverlayPermissionInteractive(opts?: {
  title?: string;
  message?: string;
}): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (await canDrawOverlays()) return true;
  return await new Promise<boolean>((resolve) => {
    Alert.alert(
      opts?.title ?? 'Cấp quyền bong bóng chat',
      opts?.message ??
        'App cần quyền "Hiển thị trên các ứng dụng khác" để hiện bong bóng chat khi bạn dùng app khác. Mở Cài đặt để bật?',
      [
        { text: 'Để sau', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Mở Cài đặt',
          onPress: () => {
            openOverlaySettings();
            resolve(false);
          },
        },
      ],
    );
  });
}

export async function ensureBubbleOverlayReady(): Promise<boolean> {
  if (!isFloatingBubbleSupported()) return false;
  const prefs = await loadSxMobilePrefs();
  if (!prefs.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay) return false;
  const can = await canDrawOverlays();
  if (!can) return false;
  await Overlay?.startOverlay?.().catch(() => false);
  return true;
}

export async function startSystemBubbleOverlay(): Promise<boolean> {
  if (!isFloatingBubbleSupported() || !Overlay?.startOverlay) return false;
  try {
    return !!(await Overlay.startOverlay());
  } catch {
    return false;
  }
}

export async function stopSystemBubbleOverlay(): Promise<void> {
  if (!isFloatingBubbleSupported()) return;
  try {
    await Overlay?.stopOverlay?.();
  } catch {
    /* ignore */
  }
}

export function setBubbleBadge(n: number): void {
  if (!isFloatingBubbleSupported()) return;
  try {
    Overlay?.setBadgeCount?.(Math.max(0, Math.floor(n)));
  } catch {
    /* ignore */
  }
}

export { DEFAULT_SX_MOBILE_PREFS };

/** Overlay nổi cuộc gọi đến (audio/video) khi app ở nền. */
export function showCallOverlayPeek(payload: IncomingCallPayload): void {
  if (Platform.OS !== 'android' || !Overlay?.showCallOverlay) return;
  try {
    Overlay.showCallOverlay(
      payload.callId,
      payload.fromName || 'Người gọi',
      payload.kind || 'audio',
      !!payload.isGroup,
      payload.groupName || '',
    );
  } catch {
    /* ignore */
  }
}

export function hideCallOverlayPeek(callId?: string | null): void {
  if (!callId || Platform.OS !== 'android' || !Overlay?.hideCallOverlay) return;
  try {
    Overlay.hideCallOverlay(callId);
  } catch {
    /* ignore */
  }
}

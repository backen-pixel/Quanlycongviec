import { AppState, NativeModules, Platform } from 'react-native';
import { API_ORIGIN } from '../config';
import { getMessengerActiveGroupId } from './messengerActiveGroup';
import type { MessengerNotifPayload } from './localMessengerNotification';
import type { CrmMobilePrefs } from './crmMobilePrefs';

export const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      openOverlaySettings?: () => void;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
      setBadgeCount?: (n: number) => void;
      showConvBubble?: (groupId: string, title: string, avatarLetter: string) => void;
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
      consumePendingGroup?: () => Promise<string | null>;
    }
  | undefined;

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
) {
  if (!Overlay) return;
  if (avatarUrl && Overlay.showConvBubbleWithAvatar) {
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
  prefs: CrmMobilePrefs | null,
  opts?: { isActive?: boolean },
): Promise<void> {
  if (Platform.OS !== 'android' || !Overlay) return;
  if (!prefs?.floatingChatBubbleEnabled || !prefs?.floatingChatBubbleSystemOverlay) return;

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

  pushBubble(groupId, title, letter, avatarUrl);

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
  Overlay?.openOverlaySettings?.();
}

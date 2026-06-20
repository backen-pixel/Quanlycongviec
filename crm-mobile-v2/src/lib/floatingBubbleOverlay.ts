import { AppState, NativeModules, Platform } from 'react-native';
import { API_ORIGIN } from '../config';
import { getMessengerActiveGroupId } from './messengerActiveGroup';
import type { MessengerNotifPayload } from './localMessengerNotification';
import type { IncomingCallPayload } from './incomingCallNotifications';
import {
  DEFAULT_CRM_MOBILE_PREFS,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from './crmMobilePrefs';

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
  prefs: CrmMobilePrefs | null,
  opts?: { isActive?: boolean },
): Promise<void> {
  if (Platform.OS !== 'android' || !Overlay) return;

  const effectivePrefs = prefs ?? await loadCrmMobilePrefs();
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
  Overlay?.openOverlaySettings?.();
}

export async function ensureBubbleOverlayReady(): Promise<boolean> {
  if (!isFloatingBubbleSupported()) return false;
  const prefs = await loadCrmMobilePrefs();
  if (!prefs.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay) return false;
  const can = await canDrawOverlays();
  if (!can) return false;
  await Overlay?.startOverlay?.().catch(() => false);
  return true;
}

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

export { DEFAULT_CRM_MOBILE_PREFS };

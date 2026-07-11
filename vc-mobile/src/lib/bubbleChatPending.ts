import { Platform } from 'react-native';
import { Overlay } from './floatingBubbleOverlay';

export type PendingBubbleChat = { threadId: string; title: string };

/** Đọc đồng bộ pending chat từ native (SharedPreferences) — dùng trước khi NavigationContainer mount. */
export function peekPendingBubbleChatSync(): PendingBubbleChat | null {
  if (Platform.OS !== 'android' || !Overlay?.peekPendingBubbleChat) return null;
  try {
    const raw = Overlay.peekPendingBubbleChat();
    const threadId = raw?.threadId?.trim();
    if (!threadId) return null;
    return {
      threadId,
      title: raw?.title?.trim() || 'Chat',
    };
  } catch {
    return null;
  }
}

export function hasPendingBubbleChat(): boolean {
  return peekPendingBubbleChatSync() != null;
}

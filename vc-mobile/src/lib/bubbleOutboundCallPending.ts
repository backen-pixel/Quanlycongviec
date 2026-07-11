import { Platform } from 'react-native';
import { Overlay } from './floatingBubbleOverlay';

export type PendingOutboundCall = {
  groupId: string;
  title: string;
  media: 'audio' | 'video';
};

export function peekPendingOutboundCallSync(): PendingOutboundCall | null {
  if (Platform.OS !== 'android' || !Overlay?.peekPendingOutboundCall) return null;
  try {
    const raw = Overlay.peekPendingOutboundCall();
    const groupId = raw?.groupId?.trim();
    if (!groupId) return null;
    return {
      groupId,
      title: raw?.title?.trim() || 'Chat',
      media: raw?.media === 'video' ? 'video' : 'audio',
    };
  } catch {
    return null;
  }
}

export function hasPendingOutboundCall(): boolean {
  return peekPendingOutboundCallSync() != null;
}

export async function consumePendingOutboundCall(): Promise<PendingOutboundCall | null> {
  if (Platform.OS !== 'android' || !Overlay?.consumePendingOutboundCall) return null;
  try {
    const raw = await Overlay.consumePendingOutboundCall();
    const groupId = raw?.groupId?.trim();
    if (!groupId) return null;
    return {
      groupId,
      title: raw?.title?.trim() || 'Chat',
      media: raw?.media === 'video' ? 'video' : 'audio',
    };
  } catch {
    return null;
  }
}

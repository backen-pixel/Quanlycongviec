import type { MessengerMessage } from '../types/messenger';

export const MESSAGE_CLUSTER_MS = 60_000;

export function isSameSenderCluster(a: MessengerMessage, b: MessengerMessage): boolean {
  if (a.is_system || b.is_system) return false;
  if (a.message_type === 'call' || b.message_type === 'call') return false;
  if (String(a.user_id) !== String(b.user_id)) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) < MESSAGE_CLUSTER_MS;
}

export type MessageClusterMeta = {
  showAvatar: boolean;
  showSenderName: boolean;
  showClusterDivider: boolean;
  clusterTight: boolean;
  showTimeInBubble: boolean;
};

/** listData: newest-first (inverted FlatList). index+1 = older (above on screen). */
export function getMessageClusterMeta(
  item: MessengerMessage,
  listData: MessengerMessage[],
  index: number,
  myUserId: string,
  isGroupChat: boolean,
): MessageClusterMeta {
  const mine = String(item.user_id) === String(myUserId);
  // Tin của mình: không avatar/tên; thời gian vẫn dưới bubble (meta).
  if (mine) {
    return {
      showAvatar: false,
      showSenderName: false,
      showClusterDivider: false,
      clusterTight: false,
      showTimeInBubble: false,
    };
  }

  // Tin đến (1-1 và nhóm): gom cụm + avatar/tên như ảnh Zalo.
  const older = listData[index + 1];
  const newer = listData[index - 1];
  const sameClusterAsOlder = older ? isSameSenderCluster(item, older) : false;
  const sameClusterAsNewer = newer ? isSameSenderCluster(item, newer) : false;
  const isHead = !sameClusterAsOlder;

  return {
    showAvatar: isHead,
    showSenderName: isHead,
    showClusterDivider: isGroupChat && isHead && index < listData.length - 1,
    clusterTight: sameClusterAsNewer,
    // 1-1: giờ trên tin đầu cụm (như ảnh); nhóm: giờ trên tin cuối cụm
    showTimeInBubble: isGroupChat ? !sameClusterAsNewer : isHead,
  };
}

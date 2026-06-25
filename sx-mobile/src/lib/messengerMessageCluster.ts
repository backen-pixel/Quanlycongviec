import type { MessengerMessage } from '../types/messenger';

export const MESSAGE_CLUSTER_MS = 60_000;

export function isSameSenderCluster(a: MessengerMessage, b: MessengerMessage): boolean {
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
  if (!isGroupChat || String(item.user_id) === String(myUserId)) {
    return {
      showAvatar: false,
      showSenderName: false,
      showClusterDivider: false,
      clusterTight: false,
      showTimeInBubble: false,
    };
  }

  const older = listData[index + 1];
  const newer = listData[index - 1];
  const sameClusterAsOlder = older ? isSameSenderCluster(item, older) : false;
  const sameClusterAsNewer = newer ? isSameSenderCluster(item, newer) : false;

  return {
    showAvatar: !sameClusterAsOlder,
    showSenderName: !sameClusterAsOlder,
    showClusterDivider: !sameClusterAsOlder && index < listData.length - 1,
    clusterTight: sameClusterAsNewer,
    showTimeInBubble: !sameClusterAsNewer,
  };
}

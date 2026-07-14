/** Gom cụm tin nhắn kiểu Zalo — đồng bộ logic sx-mobile/messengerMessageCluster. */

export const MESSAGE_CLUSTER_MS = 60_000;

export function isSameSenderCluster(a, b) {
  if (!a || !b) return false;
  if (a.is_system || b.is_system) return false;
  if (a.message_type === 'call' || b.message_type === 'call') return false;
  if (a.message_type === 'system' || b.message_type === 'system') return false;
  if (String(a.user_id) !== String(b.user_id)) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) < MESSAGE_CLUSTER_MS;
}

/**
 * Web list: tin cũ → mới (scroll xuống).
 * older = index-1, newer = index+1.
 */
export function getMessageClusterMeta(item, list, index, myUserId, isGroupChat) {
  const mine = String(item.user_id) === String(myUserId);
  if (mine) {
    const older = list[index - 1];
    const newer = list[index + 1];
    const sameAsOlder = older ? isSameSenderCluster(item, older) : false;
    const sameAsNewer = newer ? isSameSenderCluster(item, newer) : false;
    return {
      showAvatar: false,
      showSenderName: false,
      showClusterDivider: false,
      clusterTight: sameAsOlder || sameAsNewer,
      showTimeMeta: !sameAsNewer,
    };
  }

  const older = list[index - 1];
  const newer = list[index + 1];
  const sameAsOlder = older ? isSameSenderCluster(item, older) : false;
  const sameAsNewer = newer ? isSameSenderCluster(item, newer) : false;
  const isHead = !sameAsOlder;

  return {
    showAvatar: isHead,
    showSenderName: isHead,
    showClusterDivider: !!isGroupChat && isHead && index > 0,
    clusterTight: sameAsNewer,
    showTimeMeta: !sameAsNewer,
  };
}

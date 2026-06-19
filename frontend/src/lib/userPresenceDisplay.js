/** Hiển thị thời gian offline / hoạt động gần nhất (dựa trên last_ping_at từ POST /users/presence). */

export function getUserPresence(presenceByUser, userId) {
  if (!userId || !presenceByUser) return null;
  const key = String(userId);
  return presenceByUser[key] ?? presenceByUser[userId] ?? null;
}

export function isUserOnline(presenceByUser, userId) {
  return !!getUserPresence(presenceByUser, userId)?.online;
}

/** "5 phút trước" — nhãn ngắn cho list / tooltip. */
export function formatLastActiveShort(iso) {
  if (!iso) return 'Chưa có hoạt động';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Chưa có hoạt động';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  if (diff < 86400_000 * 7) return `${Math.floor(diff / 86400_000)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "Hoạt động 5 phút trước" — nhãn đầy đủ cho header chat. */
export function formatLastActiveAgo(iso) {
  if (!iso) return 'Chưa có hoạt động';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Chưa có hoạt động';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Hoạt động vừa xong';
  if (diff < 3600_000) return `Hoạt động ${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `Hoạt động ${Math.floor(diff / 3600_000)} giờ trước`;
  if (diff < 86400_000 * 7) return `Hoạt động ${Math.floor(diff / 86400_000)} ngày trước`;
  return `Hoạt động ${new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}

/** Header cuộc trò chuyện 1-1: online → "Đang hoạt động", offline → thời gian hoạt động. */
export function formatChatHeaderPresenceLabel(presence) {
  if (presence?.online) return 'Đang hoạt động';
  return formatLastActiveAgo(presence?.last_ping_at) || 'Offline';
}

/** Tooltip / title cho chấm trạng thái. */
export function formatPresenceDotTitle(presence) {
  if (presence?.online) return 'Đang hoạt động';
  return formatLastActiveAgo(presence?.last_ping_at) || 'Offline';
}

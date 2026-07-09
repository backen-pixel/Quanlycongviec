/** Tên hiển thị trong Messenger — ưu tiên biệt danh (display_name) từ API. */
export function messengerDisplayName(user, fallback = 'Đồng nghiệp') {
  if (!user) return fallback;
  const nick = user.display_name != null ? String(user.display_name).trim() : '';
  if (nick) return nick;
  return user.full_name || user.email || fallback;
}

export function messengerDisplayNameById(userId, nicknameMap, usersById, fallback = 'Đồng nghiệp') {
  const id = userId != null ? String(userId) : '';
  if (!id) return fallback;
  const nick = nicknameMap?.[id] || nicknameMap?.get?.(id);
  if (nick) return String(nick).trim();
  const u = usersById?.[id] || usersById?.get?.(id);
  return messengerDisplayName(u, fallback);
}

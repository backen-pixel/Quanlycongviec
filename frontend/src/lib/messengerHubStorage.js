/** Khóa localStorage: hội thoại Messenger (Lead + Deal dùng chung crm_leads.id). */
export function messengerThreadKey(userId) {
  return `messenger:threads:${userId || 'anon'}`;
}

export function messengerUnreadKey(userId) {
  return `messenger:unread:${userId || 'anon'}`;
}

/** Tin chưa đọc — nhóm chat nội bộ (không phải CRM). */
export function messengerUnreadGroupKey(userId) {
  return `messenger:unread-groups:${userId || 'anon'}`;
}

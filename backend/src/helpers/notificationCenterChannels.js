/** Phân loại thông báo theo tab NotificationCenter (chuông). */

const CHAT_NOTIFICATION_TYPES = ['lead_chat', 'messenger_chat'];

const LEAD_ENTITY_TYPES = new Set(['lead', 'crm_lead', 'crm_deal']);

/** @mention trong bình luận lead/deal → tab «Tin nhắn». */
function isLeadCommentMentionNotification(n) {
  if (!n || String(n.type || '') !== 'comment_added') return false;
  if (!LEAD_ENTITY_TYPES.has(String(n.entity_type || ''))) return false;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  return meta.mentioned === true;
}

function isChatChannelNotification(n) {
  return CHAT_NOTIFICATION_TYPES.includes(String(n?.type || '')) || isLeadCommentMentionNotification(n);
}

/** Filter PostgREST `.or()` cho tab messages (Supabase). */
const MESSAGES_CHANNEL_OR_FILTER =
  'type.in.(lead_chat,messenger_chat),and(type.eq.comment_added,entity_type.in.(lead,crm_lead,crm_deal),metadata->>mentioned.eq.true)';

/** SQL WHERE fragment cho tab messages (pg pool). */
const MESSAGES_CHANNEL_SQL =
  "(type IN ('lead_chat', 'messenger_chat') OR (type = 'comment_added' AND entity_type IN ('lead', 'crm_lead', 'crm_deal') AND metadata->>'mentioned' = 'true'))";

module.exports = {
  CHAT_NOTIFICATION_TYPES,
  isLeadCommentMentionNotification,
  isChatChannelNotification,
  MESSAGES_CHANNEL_OR_FILTER,
  MESSAGES_CHANNEL_SQL,
};

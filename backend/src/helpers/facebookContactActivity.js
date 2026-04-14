/**
 * Thời điểm "hoạt động" của contact FB: mới nhất giữa tin cuối và lúc tạo hồ sơ.
 * Dùng chung cho quét lead, batch pipeline, API danh bạ (ưu tiên user mới).
 */
function activityTimestampMs(c) {
  const msg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const cre = c.created_at ? new Date(c.created_at).getTime() : 0;
  return Math.max(msg, cre);
}

function sortFacebookContactsNewestFirst(contacts) {
  return [...(contacts || [])].sort((a, b) => activityTimestampMs(b) - activityTimestampMs(a));
}

/** Các field bổ sung cho API/UI: thời điểm hoạt động mới nhất + có phải "mới" (48h). */
function enrichContactActivityFields(c) {
  const ts = activityTimestampMs(c);
  const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const created = c.created_at ? new Date(c.created_at).getTime() : 0;
  const source = lastMsg >= created && lastMsg > 0 ? 'message' : 'created';
  const hotMs = 48 * 60 * 60 * 1000;
  const isHot = ts > 0 && Date.now() - ts < hotMs;
  return {
    fb_last_activity_at: ts ? new Date(ts).toISOString() : null,
    fb_activity_source: source,
    fb_is_recent_activity: isHot,
  };
}

module.exports = {
  activityTimestampMs,
  sortFacebookContactsNewestFirst,
  enrichContactActivityFields,
};

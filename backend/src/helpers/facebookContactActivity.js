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

/** YYYY-MM-DD → đầu/cuối ngày theo giờ VN (UTC+7) */
function vnDateStartIso(yyyyMmDd) {
  const s = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T00:00:00+07:00`;
}

function vnDateEndIso(yyyyMmDd) {
  const s = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T23:59:59.999+07:00`;
}

function vnDateRangeToMsBounds(fromStr, toStr) {
  const fromIso = fromStr ? vnDateStartIso(fromStr) : null;
  const toIso = toStr ? vnDateEndIso(toStr) : null;
  return {
    fromMs: fromIso ? new Date(fromIso).getTime() : null,
    toMs: toIso ? new Date(toIso).getTime() : null,
  };
}

function contactActivityInVnDateRange(c, fromStr, toStr) {
  const { fromMs, toMs } = vnDateRangeToMsBounds(fromStr, toStr);
  const act = activityTimestampMs(c);
  if (!act) return false;
  if (fromMs != null && act < fromMs) return false;
  if (toMs != null && act > toMs) return false;
  return true;
}

function messageCreatedAtInVnDateRange(createdAt, fromStr, toStr) {
  if (!createdAt) return false;
  const { fromMs, toMs } = vnDateRangeToMsBounds(fromStr, toStr);
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  if (fromMs != null && t < fromMs) return false;
  if (toMs != null && t > toMs) return false;
  return true;
}

module.exports = {
  activityTimestampMs,
  sortFacebookContactsNewestFirst,
  enrichContactActivityFields,
  vnDateStartIso,
  vnDateEndIso,
  vnDateRangeToMsBounds,
  contactActivityInVnDateRange,
  messageCreatedAtInVnDateRange,
};

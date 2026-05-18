/** Nhắc làm mới Facebook Page access token sau N ngày từ lần cập nhật cài đặt. */

const FB_PAGE_TOKEN_REMINDER_DAYS = 30;
/** Cảnh báo sớm khi còn ≤ N ngày trước hạn. */
const FB_PAGE_TOKEN_WARN_DAYS_BEFORE = 7;

function computeFacebookPageTokenReminder(anchorIso) {
  const empty = {
    reminder_days: FB_PAGE_TOKEN_REMINDER_DAYS,
    anchor_at: null,
    due_at: null,
    days_elapsed: null,
    days_remaining: null,
    status: 'unknown',
    needs_reminder: false,
  };
  if (!anchorIso) return empty;
  const anchorMs = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchorMs)) return empty;
  const dueMs = anchorMs + FB_PAGE_TOKEN_REMINDER_DAYS * 86400000;
  const now = Date.now();
  const msRemaining = dueMs - now;
  const daysRemaining = Math.ceil(msRemaining / 86400000);
  const daysElapsed = Math.max(0, Math.floor((now - anchorMs) / 86400000));
  const needs_reminder = msRemaining <= 0;
  let status = 'ok';
  if (needs_reminder) status = 'due';
  else if (daysRemaining <= FB_PAGE_TOKEN_WARN_DAYS_BEFORE) status = 'warning';
  return {
    reminder_days: FB_PAGE_TOKEN_REMINDER_DAYS,
    anchor_at: new Date(anchorMs).toISOString(),
    due_at: new Date(dueMs).toISOString(),
    days_elapsed: daysElapsed,
    days_remaining: Math.max(0, daysRemaining),
    status,
    needs_reminder,
  };
}

/** Có nên cập nhật settings_updated_at khi PUT Page? */
function shouldBumpFacebookPageSettingsUpdatedAt(body, patchKeys) {
  if (body?.access_token != null && String(body.access_token).trim()) return true;
  const keys = patchKeys.filter(
    (k) => !['updated_at', 'settings_updated_at', 'is_active', 'auto_create_lead'].includes(k),
  );
  return keys.length > 0;
}

function attachTokenReminderToPage(page) {
  if (!page || typeof page !== 'object') return page;
  const anchor = page.settings_updated_at || page.updated_at || page.created_at || null;
  return {
    ...page,
    token_reminder: computeFacebookPageTokenReminder(anchor),
  };
}

module.exports = {
  FB_PAGE_TOKEN_REMINDER_DAYS,
  FB_PAGE_TOKEN_WARN_DAYS_BEFORE,
  computeFacebookPageTokenReminder,
  shouldBumpFacebookPageSettingsUpdatedAt,
  attachTokenReminderToPage,
};

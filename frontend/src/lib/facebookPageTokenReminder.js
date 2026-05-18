/** Khớp backend/helpers/facebookPageTokenReminder.js */

export const FB_PAGE_TOKEN_REMINDER_DAYS = 30;
export const FB_PAGE_TOKEN_WARN_DAYS_BEFORE = 7;

export function computeFacebookPageTokenReminder(anchorIso) {
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

export function summarizeFacebookTokenReminders(pages) {
  const list = Array.isArray(pages) ? pages : [];
  const due = [];
  const warning = [];
  for (const p of list) {
    const tr = p.token_reminder || computeFacebookPageTokenReminder(
      p.settings_updated_at || p.updated_at || p.created_at,
    );
    if (tr.status === 'due') due.push(p);
    else if (tr.status === 'warning') warning.push(p);
  }
  return {
    due_count: due.length,
    warning_count: warning.length,
    alert_count: due.length + warning.length,
    due_pages: due,
    warning_pages: warning,
  };
}

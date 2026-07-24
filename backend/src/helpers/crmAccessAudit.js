/**
 * Audit cho denial quyền CRM (Part I rule 6: mọi denial phải có reason code + audit evidence).
 *
 * - Ghi structured log (sink mặc định = console.warn) — bằng chứng audit luôn tồn tại, không cần migration.
 * - Dedupe theo (user, lead, task, reason) trong cửa sổ ngắn → chống spam khi client/poller bị 403 lặp.
 * - Non-blocking, fail-safe: không bao giờ ném lỗi ra request.
 * - Có thể inject sink (test / chuyển sang bảng DB sau này) qua setCrmAccessAuditSink.
 */
const DEDUPE_WINDOW_MS = 60_000;
const recent = new Map(); // key -> ts

let sink = (entry) => {
  console.warn(`[crm_access_denied] ${JSON.stringify(entry)}`);
};

function setCrmAccessAuditSink(fn) {
  sink = typeof fn === 'function' ? fn : sink;
}

function resetCrmAccessAuditDedupe() {
  recent.clear();
}

function recordCrmAccessDenial(req, {
  reason = 'access_denied', leadId = null, taskId = null, operation = null, status = null,
} = {}) {
  try {
    const userId = req?.user?.userId || req?.user?.id || null;
    const key = `${userId || 'anon'}:${leadId || '-'}:${taskId || '-'}:${reason}`;
    const now = Date.now();
    const prior = recent.get(key);
    if (prior && now - prior < DEDUPE_WINDOW_MS) return { deduped: true };
    recent.set(key, now);
    if (recent.size > 5000) {
      const first = recent.keys().next().value;
      if (first) recent.delete(first);
    }
    const entry = {
      kind: 'crm_access_denied',
      reason,
      status: status || null,
      operation: operation || null,
      user_id: userId,
      company_id: req?.user?.company_id || null,
      lead_id: leadId,
      task_id: taskId,
      method: req?.method || null,
      path: req?.originalUrl || req?.path || null,
      at: new Date(now).toISOString(),
    };
    sink(entry);
    return { recorded: true, entry };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  recordCrmAccessDenial,
  setCrmAccessAuditSink,
  resetCrmAccessAuditDedupe,
};

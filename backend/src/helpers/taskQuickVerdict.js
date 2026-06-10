/**
 * Ghi chú nhanh Đã đủ / Chưa (+ lý do) trên crm_tasks.
 */

const QUICK_VERDICT_SUFFICIENT = 'sufficient';
const QUICK_VERDICT_INSUFFICIENT = 'insufficient';

function taskRequiresQuickVerdict(prior) {
  return !!prior?.requires_quick_verdict;
}

function quickVerdictIsSufficient(prior) {
  return String(prior?.quick_verdict || '') === QUICK_VERDICT_SUFFICIENT;
}

function quickVerdictIsInsufficient(prior) {
  return String(prior?.quick_verdict || '') === QUICK_VERDICT_INSUFFICIENT;
}

function quickVerdictMeetsRequirement(prior) {
  if (!taskRequiresQuickVerdict(prior)) return true;
  return quickVerdictIsSufficient(prior);
}

function normalizeQuickVerdictPayload(body, userId) {
  if (!body || body.quick_verdict === undefined) return null;
  const raw = body.quick_verdict === null || body.quick_verdict === ''
    ? null
    : String(body.quick_verdict).trim().toLowerCase();
  if (raw !== null && raw !== QUICK_VERDICT_SUFFICIENT && raw !== QUICK_VERDICT_INSUFFICIENT) {
    return { error: 'quick_verdict phải là sufficient (Đã đủ) hoặc insufficient (Chưa)' };
  }
  const reason = body.quick_verdict_reason != null ? String(body.quick_verdict_reason).trim() : '';
  if (raw === QUICK_VERDICT_INSUFFICIENT && !reason) {
    return { error: 'Chọn «Chưa đủ» cần nhập lý do' };
  }
  const patch = {
    quick_verdict: raw,
    quick_verdict_reason: raw === QUICK_VERDICT_INSUFFICIENT ? reason : null,
    quick_verdict_at: raw ? new Date().toISOString() : null,
    quick_verdict_by: raw && userId ? userId : null,
  };
  return { patch };
}

function formatQuickVerdictBlockLabel(prior) {
  if (!taskRequiresQuickVerdict(prior)) return '';
  if (quickVerdictIsSufficient(prior)) return 'Đã đủ';
  if (quickVerdictIsInsufficient(prior)) {
    const r = String(prior?.quick_verdict_reason || '').trim();
    return r ? `Chưa đủ: ${r}` : 'Chưa đủ (thiếu lý do)';
  }
  return 'Chưa chọn Đủ/Chưa';
}

module.exports = {
  QUICK_VERDICT_SUFFICIENT,
  QUICK_VERDICT_INSUFFICIENT,
  taskRequiresQuickVerdict,
  quickVerdictIsSufficient,
  quickVerdictIsInsufficient,
  quickVerdictMeetsRequirement,
  normalizeQuickVerdictPayload,
  formatQuickVerdictBlockLabel,
};

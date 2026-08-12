/**
 * Chuẩn hoá / tổng hợp nhiều đợt cọc (CRM báo giá & deal).
 * Mỗi phần tử: { amount: number|null, received: boolean|null, label: string }
 */

function moneyOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? v : null;
  const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
  if (!onlyDigits) return null;
  const n = parseInt(onlyDigits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function receivedOrNull(v) {
  if (v === true || v === 'true' || v === 'yes') return true;
  if (v === false || v === 'false' || v === 'no') return false;
  return null;
}

function normalizeDepositInstallments(raw) {
  if (!Array.isArray(raw)) return null;
  const rows = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const amount = moneyOrNull(item.amount);
    const received = receivedOrNull(item.received);
    const label = item.label != null ? String(item.label).trim() : '';
    if (amount == null && received == null && !label) continue;
    rows.push({
      amount,
      received,
      label: label || '',
    });
  }
  return rows.length ? rows : null;
}

/**
 * Tổng hợp từ danh sách đợt → các cột legacy (deposit_amount / received / label).
 */
function aggregateDepositFromInstallments(installments) {
  const rows = normalizeDepositInstallments(installments);
  if (!rows) {
    return {
      deposit_installments: null,
      deposit_amount: null,
      deposit_received: null,
      deposit_label: null,
    };
  }

  let sum = 0;
  let anyTrue = false;
  let anyFalse = false;
  let anyUnknown = false;
  const labels = [];

  for (const r of rows) {
    if (r.amount != null && r.amount > 0) sum += r.amount;
    if (r.received === true) anyTrue = true;
    else if (r.received === false) anyFalse = true;
    else anyUnknown = true;
    if (r.label) labels.push(r.label);
  }

  let deposit_received = null;
  if (!anyUnknown && !anyFalse && anyTrue) deposit_received = true;
  else if (anyFalse) deposit_received = false;

  return {
    deposit_installments: rows,
    deposit_amount: sum > 0 ? sum : null,
    deposit_received,
    deposit_label: labels.length ? labels.join('\n') : null,
  };
}

/**
 * Khi chỉ có cột legacy (báo giá/deal cũ) → 1 đợt để form chỉnh sửa.
 */
function installmentsFromLegacyDeposit(doc) {
  if (!doc) return null;
  const fromJson = normalizeDepositInstallments(doc.deposit_installments);
  if (fromJson) return fromJson;
  const amount = moneyOrNull(doc.deposit_amount);
  const received = receivedOrNull(doc.deposit_received);
  const label = doc.deposit_label != null ? String(doc.deposit_label).trim() : '';
  if (amount == null && received == null && !label) return null;
  return [{ amount, received, label }];
}

/**
 * Áp dụng payload cọc vào object quote/lead (ưu tiên installments nếu có).
 */
function applyDepositPayload(target, body) {
  if (!target || !body) return target;
  if ('deposit_installments' in body) {
    const agg = aggregateDepositFromInstallments(body.deposit_installments);
    target.deposit_installments = agg.deposit_installments;
    target.deposit_amount = agg.deposit_amount;
    target.deposit_received = agg.deposit_received;
    target.deposit_label = agg.deposit_label;
    return target;
  }
  if ('deposit_amount' in body) target.deposit_amount = moneyOrNull(body.deposit_amount);
  if ('deposit_received' in body) target.deposit_received = receivedOrNull(body.deposit_received);
  if ('deposit_label' in body) {
    const lbl = body.deposit_label === '' || body.deposit_label == null ? null : String(body.deposit_label).trim() || null;
    target.deposit_label = lbl;
  }
  return target;
}

module.exports = {
  moneyOrNull,
  receivedOrNull,
  normalizeDepositInstallments,
  aggregateDepositFromInstallments,
  installmentsFromLegacyDeposit,
  applyDepositPayload,
};

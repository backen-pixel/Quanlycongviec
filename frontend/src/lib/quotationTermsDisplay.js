/** Fallback khi báo giá cũ chỉ có dòng "Cọc:" trong notes (chưa có cột DB). */
export function parseDepositFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const blocks = notes.split(/\n\n/);
  const block = blocks.find((p) => /^\s*Cọc:/i.test(p));
  if (!block) return null;
  const first = (block.split('\n')[0] || '').trim();
  const afterLabel = first.replace(/^Cọc:\s*/i, '');
  const numChunk = (afterLabel.match(/^([\d.,\s]+)/) || [])[1];
  let amount = null;
  if (numChunk) {
    const n = parseInt(String(numChunk).replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) amount = n;
  }
  const received = /Đã nhận/i.test(first) ? true : /Chưa nhận/i.test(first) ? false : null;
  const label = block.split('\n').slice(1).join('\n').trim() || null;
  if (amount == null && !label) return null;
  return { amount, received, label };
}

export function parseRemainingFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const blocks = notes.split(/\n\n/);
  const block = blocks.find((p) => /^\s*Còn lại:/i.test(p));
  if (!block) return null;
  const first = (block.split('\n')[0] || '').replace(/^\s*Còn lại:\s*/i, '').trim();
  const paren = first.match(/\(([^)]+)\)\s*$/);
  let amount = null;
  if (paren) {
    const n = parseInt(paren[1].replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) amount = n;
  }
  const notePart = first.replace(/\s*\([^)]*\)\s*$/, '').replace(/^—\s*/, '').trim();
  return { amount, note: notePart || null };
}

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

/** Chuẩn hoá mảng đợt cọc từ API / form. */
export function normalizeDepositInstallments(raw) {
  if (!Array.isArray(raw)) return null;
  const rows = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const amount = moneyOrNull(item.amount);
    const received = receivedOrNull(item.received);
    const label = item.label != null ? String(item.label).trim() : '';
    if (amount == null && received == null && !label) continue;
    rows.push({ amount, received, label: label || '' });
  }
  return rows.length ? rows : null;
}

/** Tổng hợp đợt cọc → cột legacy. */
export function aggregateDepositFromInstallments(installments) {
  const rows = normalizeDepositInstallments(installments);
  if (!rows) {
    return {
      deposit_installments: null,
      deposit_amount: null,
      deposit_received: null,
      deposit_label: '',
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
    deposit_label: labels.length ? labels.join('\n') : '',
  };
}

/**
 * Form luôn có ≥1 dòng trống để nhập; nếu DB có installments hoặc legacy cọc → map vào.
 */
export function depositInstallmentsForForm(doc) {
  const empty = () => [{ amount: null, received: null, label: '' }];
  if (!doc) return empty();
  const fromJson = normalizeDepositInstallments(doc.deposit_installments);
  if (fromJson) return fromJson.map((r) => ({ ...r }));
  const amount = moneyOrNull(doc.deposit_amount);
  const received = receivedOrNull(doc.deposit_received);
  const label = doc.deposit_label != null ? String(doc.deposit_label).trim() : '';
  if (amount == null && received == null && !label) return empty();
  return [{ amount, received, label }];
}

/**
 * Cùng logic tóm tắt cọc / còn lại như QuotationForm (dùng cho OrderDetail read-only).
 */
export function getDepositRemainingDisplay(doc) {
  if (!doc) return { depositShow: null, remainingShow: null, installments: null };

  const installments = normalizeDepositInstallments(doc.deposit_installments)
    || (() => {
      const amount = moneyOrNull(doc.deposit_amount);
      const received = receivedOrNull(doc.deposit_received);
      const label = doc.deposit_label?.trim() || '';
      if (amount == null && received == null && !label) return null;
      return [{ amount, received, label }];
    })();

  let depositShow = null;
  if (installments?.length) {
    const agg = aggregateDepositFromInstallments(installments);
    if (agg.deposit_amount > 0 || agg.deposit_label || agg.deposit_received != null) {
      depositShow = {
        amount: agg.deposit_amount,
        received: agg.deposit_received,
        label: agg.deposit_label || null,
        fromNotesOnly: false,
        installments,
      };
    }
  } else {
    const p = parseDepositFromNotes(doc.notes);
    if (p && ((p.amount > 0) || p.label)) {
      depositShow = {
        amount: p.amount,
        received: p.received,
        label: p.label,
        fromNotesOnly: true,
        installments: [{ amount: p.amount, received: p.received, label: p.label || '' }],
      };
    }
  }

  let remainingShow = null;
  if ((doc.remaining_amount != null && doc.remaining_amount > 0) || (doc.remaining_note && doc.remaining_note.trim())) {
    remainingShow = {
      amount: doc.remaining_amount,
      note: doc.remaining_note?.trim() || null,
      fromNotesOnly: false,
    };
  } else {
    const p = parseRemainingFromNotes(doc.notes);
    if (p && (p.amount > 0 || p.note)) remainingShow = { ...p, fromNotesOnly: true };
  }
  return { depositShow, remainingShow, installments: depositShow?.installments || null };
}

/** Gộp snapshot đơn hàng với báo giá gốc (khi đơn tạo trước khi có cột cọc / ghi chú). */
export function mergeOrderWithSourceQuotation(order, sourceQuotation) {
  if (!order) return order;
  if (!sourceQuotation) return order;
  const q = sourceQuotation;
  const str = (a, b) => (a != null && String(a).trim() !== '' ? a : b);
  return {
    ...order,
    notes: str(order.notes, q.notes),
    valid_until: order.valid_until || q.valid_until,
    delivery_terms: str(order.delivery_terms, q.delivery_terms),
    payment_terms: str(order.payment_terms, q.payment_terms),
    description: str(order.description, q.description),
    deposit_amount: order.deposit_amount ?? q.deposit_amount,
    deposit_received: order.deposit_received ?? q.deposit_received,
    deposit_label: str(order.deposit_label, q.deposit_label),
    deposit_installments: order.deposit_installments ?? q.deposit_installments,
    remaining_amount: order.remaining_amount ?? q.remaining_amount,
    remaining_note: str(order.remaining_note, q.remaining_note),
  };
}

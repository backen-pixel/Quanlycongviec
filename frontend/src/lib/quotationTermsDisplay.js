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

/**
 * Cùng logic tóm tắt cọc / còn lại như QuotationForm (dùng cho OrderDetail read-only).
 */
export function getDepositRemainingDisplay(doc) {
  if (!doc) return { depositShow: null, remainingShow: null };
  let depositShow = null;
  if (doc.deposit_amount != null && doc.deposit_amount > 0) {
    depositShow = {
      amount: doc.deposit_amount,
      received: doc.deposit_received,
      label: doc.deposit_label?.trim() || null,
      fromNotesOnly: false,
    };
  } else {
    const p = parseDepositFromNotes(doc.notes);
    if (p && ((p.amount > 0) || p.label)) {
      depositShow = { amount: p.amount, received: p.received, label: p.label, fromNotesOnly: true };
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
  return { depositShow, remainingShow };
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
    remaining_amount: order.remaining_amount ?? q.remaining_amount,
    remaining_note: str(order.remaining_note, q.remaining_note),
  };
}

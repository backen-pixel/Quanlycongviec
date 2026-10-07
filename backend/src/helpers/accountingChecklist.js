const DAY_MS = 24 * 60 * 60 * 1000;

const AGING_BUCKETS = [
  { key: 'd0_30', label: '0–30 ngày', max: 30 },
  { key: 'd31_60', label: '31–60 ngày', max: 60 },
  { key: 'd61_90', label: '61–90 ngày', max: 90 },
  { key: 'd90_plus', label: 'Trên 90 ngày', max: Infinity },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Hồ sơ kế toán của một deal. Mỗi mục: ok (đủ), missing (cần bổ sung), later (chưa tới lúc).
 * Chỉ đọc số liệu đã tính sẵn trên dòng deal, không truy vấn thêm.
 */
function buildAccountingChecklist(row) {
  const items = [];
  const push = (key, label, status, hint) => items.push({ key, label, status, hint: hint || null });

  const hasQuote = Boolean(row.quotation_id);
  push('quotation', 'Có báo giá', hasQuote ? 'ok' : 'missing', hasQuote ? row.quotation_code : 'Deal chưa có báo giá trên CRM');

  const hasQuoteFile = Boolean(row.quotation_file_name)
    || (row.workshop_quote_files || []).some((f) => f.is_sheet);
  push('quotation_file', 'Có file Excel báo giá', hasQuoteFile ? 'ok' : 'missing',
    hasQuoteFile ? (row.quotation_file_name || 'File trên dự án xưởng') : 'Chưa có file báo giá để đối chiếu');

  const hasOrder = Boolean(row.order_id);
  push('order', 'Có đơn hàng', hasOrder ? 'ok' : 'missing', hasOrder ? row.order_code : 'Chưa chốt đơn hàng');

  const dealValue = num(row.estimated_value);
  const orderTotal = num(row.order_total);
  if (hasOrder && dealValue > 0 && orderTotal > 0) {
    const diff = Math.abs(dealValue - orderTotal);
    push('order_matches_deal', 'Giá trị đơn hàng khớp deal CRM', diff < 1 ? 'ok' : 'missing',
      diff < 1 ? null : `Lệch ${Math.round(diff).toLocaleString('vi-VN')}đ`);
  } else {
    push('order_matches_deal', 'Giá trị đơn hàng khớp deal CRM', 'later', 'Cần có đơn hàng và giá trị deal');
  }

  const received = Math.max(num(row.payments_received), num(row.stages_received));
  const deposit = num(row.deposit_amount);
  const depositFlag = row.deposit_received === true || row.quotation_deposit_received === true;
  if (deposit <= 0) {
    push('deposit', 'Cọc được ghi nhận đúng', 'later', 'Deal không có số tiền cọc');
  } else if (received >= deposit && !depositFlag) {
    push('deposit', 'Cọc được ghi nhận đúng', 'missing', 'Đã thu đủ cọc nhưng trạng thái cọc vẫn là chưa nhận');
  } else if (depositFlag || received >= deposit) {
    push('deposit', 'Cọc được ghi nhận đúng', 'ok', null);
  } else {
    push('deposit', 'Cọc được ghi nhận đúng', 'missing', 'Chưa ghi nhận tiền cọc');
  }

  const missingRef = num(row.payments_missing_ref);
  if (num(row.payments_count) === 0) {
    push('payment_proof', 'Khoản thu có mã chứng từ', 'later', 'Chưa có khoản thu nào');
  } else {
    push('payment_proof', 'Khoản thu có mã chứng từ', missingRef === 0 ? 'ok' : 'missing',
      missingRef === 0 ? null : `${missingRef} khoản chuyển khoản chưa có mã giao dịch`);
  }

  const hasInvoice = Boolean(row.invoice_id);
  if (hasInvoice) {
    push('invoice', 'Đã xuất hóa đơn', 'ok', row.invoice_number || row.invoice_code);
  } else if (row.sx_production_done) {
    push('invoice', 'Đã xuất hóa đơn', 'missing', 'Sản xuất xong nhưng chưa xuất hóa đơn');
  } else {
    push('invoice', 'Đã xuất hóa đơn', 'later', 'Xuất khi sản xuất xong');
  }

  if (!row.vc_phase || row.vc_phase === 'none') {
    push('vc_cost', 'Có phí vận chuyển / lắp đặt', 'later', 'Nhập khi đã bàn giao VC/LĐ');
  } else if (row.logistics_cost == null) {
    push('vc_cost', 'Có phí vận chuyển / lắp đặt', 'missing', 'Đã bàn giao VC/LĐ nhưng chưa nhập phí');
  } else {
    push('vc_cost', 'Có phí vận chuyển / lắp đặt', 'ok',
      num(row.logistics_cost) > 0 ? `${Math.round(num(row.logistics_cost)).toLocaleString('vi-VN')}đ` : 'Không phát sinh phí');
  }

  const phatSinhCount = num(row.phat_sinh_count);
  if (phatSinhCount > 0) {
    const missingCost = num(row.phat_sinh_missing_cost);
    push('phat_sinh_cost', 'Phát sinh đã ghi chi phí', missingCost > 0 ? 'missing' : 'ok',
      missingCost > 0
        ? `${missingCost}/${phatSinhCount} việc phát sinh chưa ghi phí`
        : `${phatSinhCount} việc · ${Math.round(num(row.extra_cost_total)).toLocaleString('vi-VN')}đ`);
  }

  const outstanding = num(row.outstanding_amount);
  if (row.sx_production_done || row.vc_done) {
    const doneLabel = row.vc_done ? 'Lắp đặt xong' : 'Sản xuất xong';
    push('collected', 'Thu đủ tiền', outstanding <= 0 ? 'ok' : 'missing',
      outstanding <= 0 ? null : `${doneLabel}, còn ${Math.round(outstanding).toLocaleString('vi-VN')}đ`);
  } else {
    push('collected', 'Thu đủ tiền', outstanding <= 0 ? 'ok' : 'later', outstanding <= 0 ? null : 'Chưa tới hạn thu cuối');
  }

  const missing = items.filter((i) => i.status === 'missing').length;
  const ok = items.filter((i) => i.status === 'ok').length;
  return { items, missing_count: missing, ok_count: ok, total: items.length };
}

/** Mốc tính tuổi nợ: bàn giao SX, rồi ngày đơn hàng, rồi ngày chốt deal. */
function agingBaseDate(row) {
  return row.sx_handover_at || row.order_date || row.actual_close_date || null;
}

function agingDays(row, now = new Date()) {
  const base = agingBaseDate(row);
  if (!base) return null;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

function agingBucketKey(days) {
  if (days == null) return 'unknown';
  const b = AGING_BUCKETS.find((x) => days <= x.max);
  return b ? b.key : 'd90_plus';
}

/** Gom deal còn nợ theo tuổi nợ và theo khách hàng. */
function buildReceivablesReport(rows, now = new Date()) {
  const buckets = Object.fromEntries(
    [...AGING_BUCKETS, { key: 'unknown', label: 'Chưa rõ ngày' }].map((b) => [b.key, { key: b.key, label: b.label, count: 0, amount: 0 }]),
  );
  const byCustomer = new Map();
  const items = [];

  for (const r of rows) {
    const amount = num(r.outstanding_amount);
    if (amount <= 0) continue;
    const days = agingDays(r, now);
    const key = agingBucketKey(days);
    buckets[key].count += 1;
    buckets[key].amount += amount;

    const custKey = r.customer_id || r.customer_phone || r.customer_name || r.id;
    if (!byCustomer.has(custKey)) {
      byCustomer.set(custKey, {
        key: String(custKey),
        customer_name: r.customer_name || 'Chưa rõ khách',
        customer_phone: r.customer_phone || null,
        deal_count: 0,
        amount: 0,
        oldest_days: null,
      });
    }
    const c = byCustomer.get(custKey);
    c.deal_count += 1;
    c.amount += amount;
    if (days != null && (c.oldest_days == null || days > c.oldest_days)) c.oldest_days = days;

    items.push({
      id: r.id,
      code: r.code,
      title: r.title,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      project_code: r.project_code,
      workshop_name: r.workshop_name,
      sx_production_done: r.sx_production_done === true,
      vc_phase: r.vc_phase || 'none',
      vc_phase_label: r.vc_stage_name || r.vc_phase_label || null,
      vc_company_name: r.vc_company_name || null,
      vc_done: r.vc_done === true,
      invoice_id: r.invoice_id || null,
      order_total: r.order_total,
      payments_received: Math.max(num(r.payments_received), num(r.stages_received)),
      outstanding_amount: amount,
      aging_days: days,
      aging_bucket: key,
      aging_base: agingBaseDate(r),
    });
  }

  items.sort((a, b) => (b.aging_days ?? -1) - (a.aging_days ?? -1) || b.outstanding_amount - a.outstanding_amount);
  const customers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount);
  const total = items.reduce((s, i) => s + i.outstanding_amount, 0);
  return {
    total_outstanding: total,
    deal_count: items.length,
    buckets: Object.values(buckets),
    customers,
    items,
  };
}

module.exports = {
  AGING_BUCKETS,
  buildAccountingChecklist,
  agingDays,
  agingBucketKey,
  buildReceivablesReport,
};

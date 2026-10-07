const { supabase } = require('../config/supabase');
const { nextCrmCode } = require('./crmNextCode');

function cleanText(v) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

function isoDate(v) {
  const s = cleanText(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date().toISOString().slice(0, 10);
  return s;
}

/** Số tiền xuất hóa đơn: mặc định phần đơn hàng chưa xuất; không vượt phần còn lại. */
function resolveInvoiceAmount(orderTotal, alreadyInvoiced, requested) {
  const remaining = Math.max(0, (Number(orderTotal) || 0) - (Number(alreadyInvoiced) || 0));
  const req = Number(requested);
  if (!Number.isFinite(req) || req <= 0) return remaining;
  return Math.min(req, remaining);
}

/** Tách tổng (đã gồm VAT) thành tiền trước thuế và tiền thuế. */
function splitVat(total, taxRate) {
  const rate = Math.max(0, Number(taxRate) || 0);
  const t = Number(total) || 0;
  const subtotal = rate > 0 ? Math.round(t / (1 + rate / 100)) : t;
  return { subtotal, tax_amount: t - subtotal, tax_rate: rate };
}

/**
 * Xuất hóa đơn từ đơn hàng của deal. Ghi lead_id để kế toán và CRM cùng thấy.
 * Một đơn hàng được xuất nhiều hóa đơn từng phần cho đến khi đủ tổng đơn.
 */
async function createInvoiceFromOrder({ leadId, orderId, body, userId }) {
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) return { error: 'Không tìm thấy đơn hàng của deal này', status: 404 };

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, total, status')
    .eq('order_id', orderId);
  const alreadyInvoiced = (existing || [])
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  const total = resolveInvoiceAmount(order.total, alreadyInvoiced, body.amount);
  if (total <= 0) return { error: 'Đơn hàng đã xuất hóa đơn đủ', status: 400 };

  const taxRate = body.tax_rate != null && body.tax_rate !== '' ? Number(body.tax_rate) : Number(order.tax_rate ?? 10);
  const vat = splitVat(total, taxRate);
  const isFull = alreadyInvoiced <= 0 && Math.abs(total - (Number(order.total) || 0)) < 1;
  const invoiceDate = isoDate(body.invoice_date);
  const code = await nextCrmCode('HD');

  const row = {
    code,
    lead_id: leadId,
    company_id: order.company_id || null,
    customer_id: order.customer_id,
    customer_name: cleanText(body.customer_name) || order.customer_name,
    customer_phone: order.customer_phone,
    customer_address: cleanText(body.customer_address) || order.customer_address,
    customer_tax_code: cleanText(body.customer_tax_code),
    order_id: order.id,
    quotation_id: order.quotation_id,
    project_id: order.project_id,
    title: order.title,
    invoice_number: cleanText(body.invoice_number),
    invoice_date: invoiceDate,
    due_date: cleanText(body.due_date),
    notes: cleanText(body.notes),
    subtotal: vat.subtotal,
    discount_type: 'amount',
    discount_value: 0,
    discount_amount: 0,
    tax_rate: vat.tax_rate,
    tax_amount: vat.tax_amount,
    total,
    status: cleanText(body.invoice_number) ? 'issued' : 'draft',
    issued_at: cleanText(body.invoice_number) ? new Date(`${invoiceDate}T00:00:00+07:00`).toISOString() : null,
    created_by: userId || null,
  };
  if (isFull) {
    row.subtotal = order.subtotal;
    row.discount_type = order.discount_type;
    row.discount_value = order.discount_value;
    row.discount_amount = order.discount_amount;
    row.tax_amount = order.tax_amount;
    row.tax_rate = order.tax_rate;
  }

  const { data: invoice, error } = await supabase.from('invoices').insert(row).select('*').single();
  if (error) throw error;

  if (isFull) {
    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', order.id).order('item_order');
    if (oItems?.length) {
      const { error: itErr } = await supabase.from('invoice_items').insert(oItems.map((oi) => ({
        invoice_id: invoice.id, product_id: oi.product_id, product_code: oi.product_code, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, discount_amount: oi.discount_amount || 0, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0, tax_amount: oi.tax_amount || oi.vat_amount || 0,
        total: oi.total || oi.amount, group_name: oi.group_name || null, notes: oi.notes,
      })));
      if (itErr) console.warn('[accountingInvoices] copy items:', itErr.message);
    }
  }

  return { invoice, already_invoiced: alreadyInvoiced, order_total: Number(order.total) || 0 };
}

module.exports = {
  resolveInvoiceAmount,
  splitVat,
  createInvoiceFromOrder,
};

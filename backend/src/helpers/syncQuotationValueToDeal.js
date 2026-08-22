/**
 * Đồng bộ tổng tiền báo giá → giá trị deal CRM + dự án + đơn hàng gắn BG.
 * POST báo giá đã làm việc này; PUT trước đây chỉ sync cọc nên kế toán thấy
 * «Giá trị deal» / «Còn phải thu» không đổi sau khi sửa BG.
 */
const { supabase } = require('../config/supabase');
const { mapQuotationItemsToOrderRows } = require('./orderFromQuotation');

function moneyOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isRemainingStageLabel(label) {
  const s = String(label || '');
  if (/cọc/i.test(s)) return false;
  return /còn lại|nghiệm thu|bàn giao|còn phải thu/i.test(s);
}

async function syncRemainingPaymentStage(leadId, newTotal, depositAmount, prevTotal) {
  if (!leadId) return { updated: 0 };
  const { data: stages, error } = await supabase
    .from('crm_payment_stages')
    .select('id, label, planned_amount, received_amount')
    .eq('lead_id', leadId);
  if (error) {
    console.warn('[syncQuotationValue] payment stages:', error.message);
    return { updated: 0 };
  }
  const deposit = Number(depositAmount) || 0;
  const remaining = Math.max(0, Number(newTotal) - deposit);
  const oldRemaining = Number.isFinite(Number(prevTotal))
    ? Math.max(0, Number(prevTotal) - deposit)
    : null;

  let updated = 0;
  const now = new Date().toISOString();
  for (const st of stages || []) {
    if (!isRemainingStageLabel(st.label)) continue;
    const planned = Number(st.planned_amount);
    const looksEmpty = !Number.isFinite(planned) || planned <= 0;
    const looksAuto = oldRemaining != null && Number.isFinite(planned) && Math.abs(planned - oldRemaining) < 1;
    if (!looksEmpty && !looksAuto) continue;
    const { error: uErr } = await supabase.from('crm_payment_stages').update({
      planned_amount: remaining,
      updated_at: now,
    }).eq('id', st.id);
    if (!uErr) updated += 1;
  }
  return { updated };
}

async function syncLinkedOrdersFromQuotation(quote, { replaceItems = false } = {}) {
  if (!quote?.id) return { orders: 0 };
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id')
    .eq('quotation_id', quote.id);
  if (error) {
    console.warn('[syncQuotationValue] list orders:', error.message);
    return { orders: 0 };
  }
  if (!orders?.length) return { orders: 0 };

  const now = new Date().toISOString();
  const moneyPatch = {
    subtotal: quote.subtotal ?? null,
    discount_type: quote.discount_type ?? null,
    discount_value: quote.discount_value ?? null,
    discount_amount: quote.discount_amount ?? null,
    tax_rate: quote.tax_rate ?? null,
    tax_amount: quote.tax_amount ?? null,
    total: quote.total,
    deposit_amount: quote.deposit_amount ?? null,
    deposit_received: quote.deposit_received ?? null,
    deposit_label: quote.deposit_label ?? null,
    deposit_installments: quote.deposit_installments ?? null,
    remaining_amount: quote.remaining_amount ?? null,
    remaining_note: quote.remaining_note ?? null,
    updated_at: now,
  };

  let count = 0;
  for (const order of orders) {
    const { error: uErr } = await supabase.from('orders').update(moneyPatch).eq('id', order.id);
    if (uErr) {
      console.warn('[syncQuotationValue] update order', order.id, uErr.message);
      continue;
    }
    count += 1;
    if (!replaceItems) continue;
    const { data: qItems } = await supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', quote.id)
      .order('item_order');
    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', order.id);
    if (delErr) {
      console.warn('[syncQuotationValue] replace order items', order.id, delErr.message);
      continue;
    }
    const rows = mapQuotationItemsToOrderRows(qItems || [], order.id);
    if (rows.length) {
      const { error: insErr } = await supabase.from('order_items').insert(rows);
      if (insErr) console.warn('[syncQuotationValue] insert order items', order.id, insErr.message);
    }
  }
  return { orders: count };
}

/**
 * @param {object} quote — row báo giá sau khi lưu (cần id, total, lead_id)
 * @param {{ prevTotal?: number|null, replaceOrderItems?: boolean }} [opts]
 */
async function syncQuotationValueToDeal(quote, opts = {}) {
  const leadId = quote?.lead_id || opts.leadId || null;
  const total = moneyOrNull(quote?.total);
  if (!leadId || total == null || total <= 0) {
    return { synced: false, reason: 'no_lead_or_total' };
  }

  const now = new Date().toISOString();
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, project_id, deposit_amount')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) {
    console.warn('[syncQuotationValue] load lead:', leadErr.message);
    return { synced: false, reason: leadErr.message };
  }

  const { error: dealErr } = await supabase.from('crm_leads').update({
    estimated_value: total,
    updated_at: now,
  }).eq('id', leadId);
  if (dealErr) {
    console.warn('[syncQuotationValue] update deal:', dealErr.message);
    return { synced: false, reason: dealErr.message };
  }

  if (lead?.project_id) {
    try {
      const { syncDealValueToProject } = require('./accountingDealDetail');
      await syncDealValueToProject(lead.project_id, total);
    } catch (e) {
      console.warn('[syncQuotationValue] project mirror:', e.message);
    }
  }

  const deposit = moneyOrNull(quote.deposit_amount) ?? (Number(lead?.deposit_amount) || 0);
  let remainingStages = 0;
  try {
    const rem = await syncRemainingPaymentStage(leadId, total, deposit, opts.prevTotal);
    remainingStages = rem.updated || 0;
  } catch (e) {
    console.warn('[syncQuotationValue] remaining stage:', e.message);
  }

  let orders = 0;
  if (opts.syncLinkedOrders !== false && quote?.id) {
    try {
      const o = await syncLinkedOrdersFromQuotation(quote, { replaceItems: !!opts.replaceOrderItems });
      orders = o.orders || 0;
    } catch (e) {
      console.warn('[syncQuotationValue] linked orders:', e.message);
    }
  }

  return {
    synced: true,
    lead_id: leadId,
    value: total,
    remaining_stages: remainingStages,
    orders,
  };
}

module.exports = {
  syncQuotationValueToDeal,
  syncLinkedOrdersFromQuotation,
};

const { Router } = require('express');
const { supabase } = require('../config/supabase');
const config = require('../config');
const {
  isSandboxMode,
  verifyVnpayCallback,
  resolveWebPayment,
  getGatewayStatus,
} = require('../helpers/saasPaymentGateway');
const { getPaymentInstructions, paymentMethodLabel, PAYMENT_STATUS } = require('../helpers/saasPayment');
const { PLAN_LABELS } = require('../helpers/saasPlans');
const { notifyPurchasePaymentResult } = require('../helpers/saasPaymentNotify');

const r = Router();

async function markPurchasePaid(purchaseId, meta = {}) {
  const { data: existing } = await supabase
    .from('saas_purchases')
    .select('id, payment_status, buyer_email')
    .eq('id', purchaseId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('saas_purchases')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      payment_reference: meta.txn_ref || meta.reference || null,
      provision_meta: meta.gateway_payload ? { gateway: meta.gateway_payload } : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .select('id, payment_status, buyer_email, status')
    .single();
  if (error) throw error;

  if (existing?.payment_status !== 'paid') {
    void notifyPurchasePaymentResult(purchaseId, {
      success: true,
      provider: meta.provider || meta.gateway_payload?.provider || 'vnpay',
    });
  }
  return data;
}

async function notifyPaymentFailed(purchaseId, meta = {}) {
  void notifyPurchasePaymentResult(purchaseId, {
    success: false,
    provider: meta.provider || 'vnpay',
    errorMessage: meta.errorMessage || 'Giao dịch bị huỷ hoặc thất bại',
    errorCode: meta.errorCode || '',
  });
}

function formatPrice(n) {
  return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

async function loadCheckoutProduct(purchase) {
  if (purchase.purchase_type === 'plan' && purchase.plan_id) {
    const { data } = await supabase.from('saas_plans').select('title, price_monthly').eq('id', purchase.plan_id).maybeSingle();
    return { title: data?.title || PLAN_LABELS[purchase.plan_id] || purchase.plan_id, price_monthly: data?.price_monthly };
  }
  if (purchase.module_id) {
    const { data } = await supabase.from('saas_modules').select('title, price_monthly').eq('id', purchase.module_id).maybeSingle();
    return { title: data?.title || purchase.module_id, price_monthly: data?.price_monthly };
  }
  return { title: 'Sản phẩm TuBep Pro', price_monthly: purchase.amount };
}

/** Thông tin checkout — hiển thị giao diện thanh toán */
r.get('/checkout/:purchaseId', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const { data: purchase, error } = await supabase
      .from('saas_purchases')
      .select('id, purchase_type, plan_id, module_id, amount, payment_method, payment_status, buyer_email, buyer_name, company_name, status, created_at')
      .eq('id', req.params.purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!purchase) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    if (email && String(purchase.buyer_email || '').toLowerCase() !== email) {
      return res.status(403).json({ error: 'Email không khớp đơn hàng' });
    }

    const product = await loadCheckoutProduct(purchase);
    const webPay = resolveWebPayment({ ...purchase, ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress }, req);

    res.json({
      purchase_id: purchase.id,
      purchase_type: purchase.purchase_type,
      product_title: product.title,
      amount: purchase.amount,
      amount_label: `${formatPrice(purchase.amount)} đ`,
      buyer_name: purchase.buyer_name,
      buyer_email: purchase.buyer_email,
      company_name: purchase.company_name,
      payment_method: purchase.payment_method,
      payment_method_label: paymentMethodLabel(purchase.payment_method),
      payment_status: purchase.payment_status,
      payment_status_label: PAYMENT_STATUS[purchase.payment_status] || purchase.payment_status,
      payment_redirect_url: webPay.redirect_url || null,
      vietqr_url: webPay.vietqr_url || null,
      payment_mode: webPay.mode,
      payment_instructions: getPaymentInstructions(purchase.payment_method),
      payment_gateway: getGatewayStatus(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function frontendReturnUrl(query = {}) {
  const base = `${config.frontendUrl}/modules/payment/return`;
  const filtered = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v != null && String(v).trim() !== '')
  );
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `${base}?${qs}` : base;
}

/** Trang test thanh toán (sandbox) — MoMo / VNPay giả lập */
r.get('/sandbox/:purchaseId', async (req, res) => {
  if (!isSandboxMode()) {
    return res.status(403).send('Sandbox payment tắt — đặt SAAS_PAYMENT_SANDBOX=true');
  }
  const { data: purchase } = await supabase
    .from('saas_purchases')
    .select('id, amount, payment_method, payment_status, buyer_email, plan_id, module_id')
    .eq('id', req.params.purchaseId)
    .maybeSingle();
  if (!purchase) return res.status(404).send('Không tìm thấy đơn');

  const provider = req.query.provider || purchase.payment_method || 'vnpay';
  const amount = Number(purchase.amount || 0).toLocaleString('vi-VN');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sandbox ${provider.toUpperCase()} — TuBep Pro</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:24px;background:#f8fafc}
  .card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:1.25rem;margin:0 0 8px}
  .badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;margin-bottom:16px}
  .amt{font-size:1.5rem;font-weight:700;color:#0d9488;margin:12px 0}
  button{width:100%;padding:14px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px}
  .ok{background:#0d9488;color:#fff}.cancel{background:#e2e8f0;color:#334155}
  p{color:#64748b;font-size:13px;line-height:1.5}
</style></head><body>
<div class="card">
  <span class="badge">MÔI TRƯỜNG TEST</span>
  <h1>Cổng ${provider === 'momo' ? 'MoMo' : 'VNPay'} (giả lập)</h1>
  <p>Đơn: <code>${purchase.id.slice(0, 8)}…</code><br/>Email: ${purchase.buyer_email || '—'}</p>
  <div class="amt">${amount} đ</div>
  <p>Đây là trang test — không trừ tiền thật. Bấm «Thanh toán thành công» để mô phỏng IPN.</p>
  <form method="POST" action="/api/saas/payment/sandbox/${purchase.id}/complete">
    <input type="hidden" name="provider" value="${provider}"/>
    <button type="submit" class="ok">✓ Thanh toán thành công (test)</button>
  </form>
  <a href="${frontendReturnUrl({ success: '0', provider })}" style="text-decoration:none"><button type="button" class="cancel">Huỷ / Quay lại</button></a>
</div></body></html>`);
});

r.post('/sandbox/:purchaseId/complete', async (req, res) => {
  try {
    if (!isSandboxMode()) return res.status(403).json({ error: 'Sandbox tắt' });
    const id = req.params.purchaseId;
    const provider = req.body?.provider || req.query?.provider || 'sandbox';
    await markPurchasePaid(id, {
      txn_ref: `SANDBOX-${provider}-${Date.now()}`,
      gateway_payload: { provider, sandbox: true, at: new Date().toISOString() },
      provider,
    });
    res.redirect(frontendReturnUrl({ success: '1', provider, purchase_id: id }));
  } catch (e) {
    res.redirect(frontendReturnUrl({ success: '0', error: e.message }));
  }
});

/** VNPay redirect sau thanh toán */
r.get('/vnpay/return', async (req, res) => {
  try {
    const verified = verifyVnpayCallback(req.query);
    if (!verified.ok) {
      return res.redirect(frontendReturnUrl({ success: '0', error: verified.error }));
    }
    let purchaseId = req.query.purchase_id;
    let buyerEmail = '';
    if (!purchaseId && verified.txnRef) {
      const { data } = await supabase
        .from('saas_purchases')
        .select('id, buyer_email')
        .eq('payment_reference', verified.txnRef)
        .maybeSingle();
      purchaseId = data?.id;
      buyerEmail = data?.buyer_email || '';
    } else if (purchaseId) {
      const { data } = await supabase
        .from('saas_purchases')
        .select('buyer_email')
        .eq('id', purchaseId)
        .maybeSingle();
      buyerEmail = data?.buyer_email || '';
    }
    if (verified.success && purchaseId) {
      await markPurchasePaid(purchaseId, {
        txn_ref: verified.txnRef,
        gateway_payload: verified.params,
        provider: 'vnpay',
      });
    } else if (purchaseId) {
      void notifyPaymentFailed(purchaseId, {
        provider: 'vnpay',
        errorCode: verified.responseCode || '',
        errorMessage: verified.error || 'Thanh toán không thành công',
      });
    }
    res.redirect(frontendReturnUrl({
      success: verified.success ? '1' : '0',
      provider: 'vnpay',
      purchase_id: purchaseId || '',
      email: buyerEmail || undefined,
      code: verified.responseCode || '',
    }));
  } catch (e) {
    res.redirect(frontendReturnUrl({ success: '0', error: e.message }));
  }
});

/** VNPay IPN (server-to-server) */
r.get('/vnpay/ipn', async (req, res) => {
  try {
    const verified = verifyVnpayCallback(req.query);
    if (!verified.ok) return res.status(400).json({ RspCode: '97', Message: verified.error });
    if (verified.success && verified.txnRef) {
      const { data: row } = await supabase
        .from('saas_purchases')
        .select('id')
        .eq('payment_reference', verified.txnRef)
        .maybeSingle();
      if (row) {
        await markPurchasePaid(row.id, { txn_ref: verified.txnRef, gateway_payload: verified.params });
      }
    }
    res.json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (e) {
    res.status(500).json({ RspCode: '99', Message: e.message });
  }
});

r.get('/status/:purchaseId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('saas_purchases')
      .select('id, payment_status, payment_method, status, amount, paid_at')
      .eq('id', req.params.purchaseId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

module.exports = r;

const config = require('../config');
const { supabase } = require('../config/supabase');
const { paymentMethodLabel } = require('../helpers/saasPayment');
const { PLAN_LABELS } = require('../helpers/saasPlans');
const { sendPaymentResultEmail } = require('./saasEmail');

function formatPrice(n) {
  return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

async function loadPurchaseForEmail(purchaseId) {
  const { data: purchase } = await supabase
    .from('saas_purchases')
    .select('id, purchase_type, plan_id, module_id, amount, payment_method, payment_status, buyer_email, buyer_name, company_name, status')
    .eq('id', purchaseId)
    .maybeSingle();
  if (!purchase) return null;

  let productTitle = 'TuBep Pro';
  if (purchase.purchase_type === 'plan' && purchase.plan_id) {
    const { data: plan } = await supabase.from('saas_plans').select('title').eq('id', purchase.plan_id).maybeSingle();
    productTitle = plan?.title || PLAN_LABELS[purchase.plan_id] || purchase.plan_id;
  } else if (purchase.module_id) {
    const { data: mod } = await supabase.from('saas_modules').select('title').eq('id', purchase.module_id).maybeSingle();
    productTitle = mod?.title || purchase.module_id;
  }

  return { ...purchase, productTitle };
}

async function notifyPurchasePaymentResult(purchaseId, {
  success,
  provider = '',
  errorMessage = '',
  errorCode = '',
} = {}) {
  try {
    const purchase = await loadPurchaseForEmail(purchaseId);
    if (!purchase?.buyer_email) return { ok: false, reason: 'no_purchase' };

    const loginUrl = `${config.frontendUrl}/login?email=${encodeURIComponent(purchase.buyer_email)}`;
    return sendPaymentResultEmail({
      email: purchase.buyer_email,
      fullName: purchase.buyer_name,
      productTitle: purchase.productTitle,
      amount: purchase.amount,
      amountLabel: `${formatPrice(purchase.amount)} đ`,
      paymentMethod: paymentMethodLabel(purchase.payment_method),
      provider,
      success: !!success,
      errorMessage,
      errorCode,
      purchaseId: purchase.id,
      loginUrl,
      accountStatus: purchase.status,
    });
  } catch (e) {
    console.error('[saasPaymentNotify]', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  notifyPurchasePaymentResult,
  loadPurchaseForEmail,
};

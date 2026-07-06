const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/tenantGate');
const { sendPurchaseConfirmationEmail } = require('../helpers/saasEmail');
const config = require('../config');
const { provisionPurchase, PURCHASE_STATUS } = require('../helpers/saasProvision');
const {
  listPaymentMethods,
  validatePaymentMethod,
  getPaymentInstructions,
  paymentMethodLabel,
  PAYMENT_STATUS,
} = require('../helpers/saasPayment');
const { enrichMethodForWeb, getGatewayStatus, resolveWebPayment } = require('../helpers/saasPaymentGateway');
const {
  PLAN_LABELS,
  PLAN_ORDER,
  loadTierFeatures,
  lowestPlanIncludingFeature,
  moduleAddonEligible,
  resolvePlanIdByEmail,
  planRank,
} = require('../helpers/saasPlans');

const publicRouter = Router();
const adminRouter = Router();

adminRouter.use(auth);
adminRouter.use(requirePlatformAdmin);

const storeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu — vui lòng thử lại sau' },
});

function formatPrice(n) {
  return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function mapPlanRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    price: formatPrice(row.price_monthly),
    price_monthly: row.price_monthly,
    max_users: row.max_users,
    max_companies: row.max_companies,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    badge: row.badge,
    color: row.color,
    trial_days: row.trial_days,
    is_purchasable: row.is_purchasable,
    tenant_tier: row.tenant_tier,
  };
}

function mapModuleRow(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    features: Array.isArray(row.features) ? row.features : [],
    price: formatPrice(row.price_monthly),
    price_monthly: row.price_monthly,
    category: row.category,
    color: row.color,
    icon_url: row.icon_url,
    icon_key: row.icon_key,
    badge: row.badge,
    featured: row.featured,
    feature_key: row.feature_key,
    is_addon: row.is_addon !== false,
    min_plan_id: row.min_plan_id,
    ...extras,
  };
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

async function enrichModules(modules, refPlanId) {
  const { byPlan } = await loadTierFeatures();
  const result = [];

  for (const row of modules || []) {
    const includedFromPlan = row.feature_key
      ? await lowestPlanIncludingFeature(row.feature_key)
      : null;
    const includedInRef = row.feature_key && refPlanId
      ? (byPlan[refPlanId] || []).includes(row.feature_key)
      : false;
    const canPurchaseAddon = refPlanId
      ? await moduleAddonEligible(row, refPlanId)
      : !includedFromPlan || planRank(includedFromPlan) > 0;

    result.push(mapModuleRow(row, {
      included_from_plan: includedFromPlan,
      included_from_plan_label: includedFromPlan ? PLAN_LABELS[includedFromPlan] : null,
      included_in_selected_plan: includedInRef,
      is_purchasable: row.is_addon !== false && canPurchaseAddon && row.is_active !== false,
      is_in_plan: !!includedFromPlan,
    }));
  }
  return result;
}

// ─── Public: catalog (gói chính + modun add-on) ────────────
publicRouter.get('/catalog', async (req, res) => {
  try {
    const refPlanId = req.query.plan_id || null;
    const [{ data: plans }, { data: modules }] = await Promise.all([
      supabase.from('saas_plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('saas_modules').select('*').eq('is_active', true).eq('is_addon', true).order('sort_order'),
    ]);

    const { byPlan } = await loadTierFeatures();
    const planFeatures = {};
    PLAN_ORDER.forEach((pid) => {
      planFeatures[pid] = (byPlan[pid] || []).map((fk) => fk);
    });

    res.json({
      plans: (plans || []).map(mapPlanRow),
      modules: await enrichModules(modules, refPlanId),
      plan_features: planFeatures,
      plan_labels: PLAN_LABELS,
      payment_methods_paid: listPaymentMethods({ amount: 1 }).map(enrichMethodForWeb),
      payment_methods_free: listPaymentMethods({ amount: 0 }).map(enrichMethodForWeb),
      payment_bank: getPaymentInstructions('bank_transfer'),
      payment_gateway: getGatewayStatus(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

publicRouter.get('/plans', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('saas_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    res.json((data || []).map(mapPlanRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

publicRouter.get('/modules', async (req, res) => {
  try {
    const refPlanId = req.query.plan_id || null;
    const { data, error } = await supabase
      .from('saas_modules')
      .select('*')
      .eq('is_active', true)
      .eq('is_addon', true)
      .order('sort_order');
    if (error) throw error;
    res.json(await enrichModules(data, refPlanId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

publicRouter.get('/payment-methods', async (req, res) => {
  try {
    const amount = Number(req.query.amount) || 0;
    res.json({
      methods: listPaymentMethods({ amount }).map(enrichMethodForWeb),
      bank: getPaymentInstructions('bank_transfer'),
      gateway: getGatewayStatus(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Public: đăng ký nhận thông báo ─────────────────────────
publicRouter.post('/notify', storeLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true, message: 'Đã đăng ký' });

    const email = String(b.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    const moduleId = b.module_id ? String(b.module_id).trim() : null;
    if (moduleId) {
      const { data: mod } = await supabase.from('saas_modules').select('id').eq('id', moduleId).maybeSingle();
      if (!mod) return res.status(400).json({ error: 'Modun không tồn tại' });
    }

    const { error } = await supabase.from('saas_notify_subscribers').upsert({
      email,
      module_id: moduleId,
      source: b.source || 'landing',
      is_active: true,
    }, { onConflict: 'email,module_id' });
    if (error) throw error;

    res.json({ ok: true, message: 'Đã đăng ký nhận thông báo' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Public: mua gói chính hoặc modun thêm ──────────────────
publicRouter.post('/purchase', storeLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true, message: 'Đã ghi nhận' });

    const email = String(b.email || '').trim().toLowerCase();
    const planId = String(b.plan_id || '').trim();
    const moduleId = String(b.module_id || '').trim();
    const buyerName = String(b.buyer_name || '').trim();
    const companyName = String(b.company_name || '').trim();
    const phone = String(b.phone || '').trim();
    const paymentReference = String(b.payment_reference || '').trim().slice(0, 255);
    const purchaseType = planId ? 'plan' : 'module';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }
    if (!planId && !moduleId) return res.status(400).json({ error: 'Chọn gói chính hoặc modun mua thêm' });
    if (planId && moduleId) return res.status(400).json({ error: 'Chỉ chọn gói HOẶC modun trong một lần' });
    if (!buyerName) return res.status(400).json({ error: 'Nhập họ tên' });
    if (purchaseType === 'plan' && !companyName) {
      return res.status(400).json({ error: 'Nhập tên công ty / xưởng' });
    }

    let amount = 0;
    let productTitle = '';

    if (purchaseType === 'plan') {
      const { data: plan, error: pErr } = await supabase
        .from('saas_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();
      if (pErr || !plan) return res.status(404).json({ error: 'Gói không tồn tại' });
      if (!plan.is_purchasable && plan.price_monthly > 0) {
        return res.status(400).json({ error: 'Gói này chưa mở đăng ký trực tuyến' });
      }
      amount = plan.price_monthly;
      productTitle = plan.title;
    } else {
      const buyerPlanId = await resolvePlanIdByEmail(email);
      if (!buyerPlanId) {
        return res.status(400).json({
          error: 'Cần đăng ký gói chính (Free/Standard/Pro/Ultra) trước khi mua modun thêm',
          code: 'plan_required',
        });
      }

      const { data: mod, error: mErr } = await supabase
        .from('saas_modules')
        .select('*')
        .eq('id', moduleId)
        .eq('is_active', true)
        .single();
      if (mErr || !mod) return res.status(404).json({ error: 'Modun không tồn tại' });
      if (!mod.is_addon) {
        return res.status(400).json({ error: 'Đây là tính năng gói chính — chọn gói phù hợp thay vì mua lẻ' });
      }

      const eligible = await moduleAddonEligible(mod, buyerPlanId);
      if (!eligible) {
        return res.status(400).json({
          error: `Modun đã có trong gói ${PLAN_LABELS[buyerPlanId] || buyerPlanId} của bạn`,
          code: 'already_in_plan',
        });
      }

      if (mod.min_plan_id && planRank(buyerPlanId) < planRank(mod.min_plan_id)) {
        return res.status(400).json({
          error: `Cần gói ${PLAN_LABELS[mod.min_plan_id] || mod.min_plan_id} trở lên để mua modun này`,
        });
      }

      amount = mod.price_monthly;
      productTitle = mod.title;
    }

    const payCheck = validatePaymentMethod(b.payment_method, amount);
    if (!payCheck.ok) return res.status(400).json({ error: payCheck.error });

    const insertRow = {
      purchase_type: purchaseType,
      plan_id: planId || null,
      module_id: moduleId || null,
      buyer_email: email,
      buyer_name: buyerName,
      company_name: companyName || null,
      phone: phone || null,
      amount,
      status: 'pending',
      payment_method: payCheck.method,
      payment_status: payCheck.status,
      payment_reference: paymentReference || null,
      ip_address: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 512),
    };

    const { data: purchase, error } = await supabase
      .from('saas_purchases')
      .insert(insertRow)
      .select('id, status, created_at, purchase_type')
      .single();
    if (error) throw error;

    void sendPurchaseConfirmationEmail({
      email,
      fullName: buyerName,
      moduleTitle: productTitle,
      statusLabel: PURCHASE_STATUS.pending,
      paymentMethod: paymentMethodLabel(payCheck.method),
      paymentStatus: PAYMENT_STATUS[payCheck.status] || payCheck.status,
      paymentInstructions: getPaymentInstructions(payCheck.method),
      amount,
    });

    const instructions = getPaymentInstructions(payCheck.method);
    const webPay = resolveWebPayment({
      ...insertRow,
      id: purchase.id,
      purchase_type: purchaseType,
      ip_address: insertRow.ip_address,
    }, req);

    if (webPay.txn_ref) {
      await supabase.from('saas_purchases').update({
        payment_reference: webPay.txn_ref,
        updated_at: new Date().toISOString(),
      }).eq('id', purchase.id);
    }

    res.status(201).json({
      ok: true,
      purchase_id: purchase.id,
      purchase_type: purchaseType,
      payment_method: payCheck.method,
      payment_status: payCheck.status,
      payment_instructions: instructions,
      payment_redirect_url: webPay.redirect_url || null,
      vietqr_url: webPay.vietqr_url || null,
      payment_mode: webPay.mode,
      message: webPay.redirect_url
        ? 'Chuyển tới cổng thanh toán...'
        : (purchaseType === 'plan'
          ? 'Đã ghi nhận đăng ký gói. Xem hướng dẫn thanh toán bên dưới.'
          : 'Đã ghi nhận mua modun thêm. Xem hướng dẫn thanh toán.'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: CRUD gói chính ──────────────────────────────────
adminRouter.get('/saas-plans', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('saas_plans').select('*').order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.patch('/saas-plans/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    [
      'title', 'subtitle', 'description', 'price_monthly', 'max_users', 'max_companies',
      'highlights', 'badge', 'color', 'trial_days', 'is_active', 'is_purchasable', 'sort_order', 'tenant_tier',
    ].forEach((f) => { if (b[f] !== undefined) update[f] = b[f]; });

    const { data, error } = await supabase
      .from('saas_plans')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: CRUD modun add-on ───────────────────────────────
adminRouter.get('/saas-modules', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('saas_modules')
      .select('*')
      .order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/saas-modules', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.id?.trim() || !b.title?.trim()) {
      return res.status(400).json({ error: 'Thiếu id hoặc tên modun' });
    }
    const row = {
      id: String(b.id).trim().toLowerCase(),
      title: b.title.trim(),
      description: b.description || '',
      features: b.features || [],
      price_monthly: Number(b.price_monthly) || 0,
      category: b.category || 'management',
      color: b.color || '#3b82f6',
      icon_url: b.icon_url || null,
      icon_key: b.icon_key || null,
      badge: b.badge || 'comingSoon',
      featured: Number(b.featured) || 99,
      feature_key: b.feature_key || null,
      trial_days: Number(b.trial_days) || 14,
      is_active: b.is_active !== false,
      is_addon: b.is_addon !== false,
      is_purchasable: b.is_purchasable !== false,
      min_plan_id: b.min_plan_id || 'free',
      sort_order: Number(b.sort_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('saas_modules').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'ID modun đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

adminRouter.patch('/saas-modules/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    [
      'title', 'description', 'features', 'price_monthly', 'category', 'color',
      'icon_url', 'icon_key', 'badge', 'featured', 'feature_key',
      'trial_days', 'is_active', 'is_addon', 'is_purchasable', 'min_plan_id', 'sort_order',
    ].forEach((f) => { if (b[f] !== undefined) update[f] = b[f]; });

    const { data, error } = await supabase
      .from('saas_modules')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin: đơn mua ────────────────────────────────────────
adminRouter.get('/saas-purchases', async (req, res) => {
  try {
    const { status, module_id, plan_id, purchase_type, search } = req.query;
    let q = supabase
      .from('saas_purchases')
      .select('*, saas_modules(id, title, price_monthly), saas_plans(id, title, price_monthly), tenants(id, name, slug), users(id, email, full_name)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (status) q = q.eq('status', status);
    if (module_id) q = q.eq('module_id', module_id);
    if (plan_id) q = q.eq('plan_id', plan_id);
    if (purchase_type) q = q.eq('purchase_type', purchase_type);
    const { data, error } = await q;
    if (error) throw error;

    let rows = data || [];
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.buyer_email?.toLowerCase().includes(s)
        || r.buyer_name?.toLowerCase().includes(s)
        || r.company_name?.toLowerCase().includes(s));
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.patch('/saas-purchases/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (b.status) update.status = b.status;
    if (b.notes !== undefined) update.notes = b.notes;
    if (b.payment_status) {
      update.payment_status = b.payment_status;
      if (b.payment_status === 'paid') update.paid_at = new Date().toISOString();
    }
    if (b.payment_reference !== undefined) update.payment_reference = b.payment_reference;

    const { data, error } = await supabase
      .from('saas_purchases')
      .update(update)
      .eq('id', req.params.id)
      .select('*, saas_modules(*), saas_plans(*)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/saas-purchases/:id/provision', async (req, res) => {
  try {
    const loginBaseUrl = req.body?.login_url || config.frontendUrl;
    const result = await provisionPurchase(req.params.id, {
      loginBaseUrl,
      forceNewTenant: !!req.body?.force_new_tenant,
    });
    res.json({
      ok: true,
      purchase: result.purchase,
      email_sent: result.emailSent,
      temp_password: result.tempPassword,
      already_provisioned: result.alreadyProvisioned || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.get('/saas-notify', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('saas_notify_subscribers')
      .select('*, saas_modules(id, title)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.get('/saas-store/stats', async (_req, res) => {
  try {
    const [
      { count: planCount },
      { count: moduleCount },
      { count: purchasePending },
      { count: planPurchasePending },
      { count: purchaseProvisioned },
      { count: notifyCount },
    ] = await Promise.all([
      supabase.from('saas_plans').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('saas_modules').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_addon', true),
      supabase.from('saas_purchases').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('saas_purchases').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('purchase_type', 'plan'),
      supabase.from('saas_purchases').select('id', { count: 'exact', head: true }).eq('status', 'provisioned'),
      supabase.from('saas_notify_subscribers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    res.json({
      active_plans: planCount || 0,
      active_addon_modules: moduleCount || 0,
      pending_purchases: purchasePending || 0,
      pending_plan_purchases: planPurchasePending || 0,
      provisioned_purchases: purchaseProvisioned || 0,
      notify_subscribers: notifyCount || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { publicRouter, adminRouter };

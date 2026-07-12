const bcrypt = require('bcryptjs');
const config = require('../config');
const { supabase } = require('../config/supabase');
const { onboardTenant } = require('./tenantOnboarding');
const { invalidateTenantCache } = require('./tenantScope');
const { PLAN_TO_TIER } = require('./saasPlans');
const {
  generateTempPassword,
  slugify,
  sendWelcomeCredentialsEmail,
} = require('./saasEmail');

const PURCHASE_STATUS = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  provisioned: 'Đã cấp tài khoản',
  cancelled: 'Đã huỷ',
};

async function applyPlanToTenant(tenantId, plan) {
  if (!tenantId || !plan) return;
  const trialDays = plan.trial_days || 14;
  const end = new Date();
  end.setDate(end.getDate() + trialDays);

  await supabase.from('tenants').update({
    tier: plan.tenant_tier || PLAN_TO_TIER[plan.id] || 'free',
    max_users: plan.max_users || 50,
    max_companies: plan.max_companies || 5,
    quotas: plan.quotas && typeof plan.quotas === 'object' ? plan.quotas : {},
    subscription_start: new Date().toISOString(),
    subscription_end: end.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', tenantId);

  const tier = plan.tenant_tier || PLAN_TO_TIER[plan.id] || 'free';
  const { data: tfRows } = await supabase
    .from('tier_features')
    .select('feature_key, enabled, config')
    .eq('tier', tier);
  if (tfRows?.length) {
    await supabase.from('tenant_features').upsert(
      tfRows.map((f) => ({
        tenant_id: tenantId,
        feature_key: f.feature_key,
        enabled: f.enabled,
        config: f.config,
      })),
      { onConflict: 'tenant_id,feature_key' },
    );
  }
  invalidateTenantCache(tenantId);
}

async function provisionPurchase(purchaseId, { loginBaseUrl, forceNewTenant = false, skipWelcomeEmail = false, provisionedBy = 'platform' } = {}) {
  const { data: purchase, error: pErr } = await supabase
    .from('saas_purchases')
    .select('*, saas_modules(*), saas_plans(*)')
    .eq('id', purchaseId)
    .single();
  if (pErr || !purchase) throw new Error('Không tìm thấy đơn mua');

  if (purchase.status === 'provisioned' && purchase.user_id) {
    return { purchase, alreadyProvisioned: true };
  }

  const isPlan = purchase.purchase_type === 'plan' || purchase.plan_id;
  const plan = purchase.saas_plans;
  const mod = purchase.saas_modules;
  const email = String(purchase.buyer_email || '').trim().toLowerCase();
  if (!email) throw new Error('Thiếu email người mua');

  await supabase.from('saas_purchases').update({
    status: 'processing',
    updated_at: new Date().toISOString(),
  }).eq('id', purchaseId);

  const tempPassword = generateTempPassword();
  let tenantId = purchase.tenant_id;
  let userId = purchase.user_id;
  let tenant = null;
  let adminUser = null;

  const { data: existingUser } = await supabase
    .from('users')
    .select('id, tenant_id, email, full_name')
    .eq('email', email)
    .maybeSingle();

  if (isPlan) {
    if (!plan) throw new Error('Không tìm thấy gói chính');

    if (existingUser?.tenant_id && !forceNewTenant) {
      tenantId = existingUser.tenant_id;
      userId = existingUser.id;
      const hash = await bcrypt.hash(tempPassword, 12);
      await supabase.from('users').update({
        password: hash,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      await applyPlanToTenant(tenantId, plan);
      adminUser = { ...existingUser, password_reset: true };
      const { data: tRow } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      tenant = tRow;
    } else {
      const baseSlug = slugify(purchase.company_name || purchase.buyer_name || email.split('@')[0]);
      let slug = baseSlug;
      for (let i = 0; i < 5; i += 1) {
        const { data: dup } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
        if (!dup) break;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const result = await onboardTenant({
        name: purchase.company_name || purchase.buyer_name || `HST ${slug}`,
        slug,
        tier: plan.tenant_tier || PLAN_TO_TIER[plan.id] || 'free',
        maxUsers: plan.max_users || 50,
        maxCompanies: plan.max_companies || 5,
        adminEmail: email,
        adminPassword: tempPassword,
        adminFullName: purchase.buyer_name || email.split('@')[0],
      });

      tenant = result.tenant;
      adminUser = result.adminUser;
      tenantId = tenant?.id;
      userId = adminUser?.id;

      if (tenant) await applyPlanToTenant(tenantId, plan);
    }
  } else {
    // Mua thêm module
    if (!mod) throw new Error('Không tìm thấy modun');

    if (existingUser && !forceNewTenant) {
      userId = existingUser.id;
      tenantId = existingUser.tenant_id;
      if (!tenantId) throw new Error('Email chưa có gói chính — vui lòng đăng ký gói trước');
      const hash = await bcrypt.hash(tempPassword, 12);
      await supabase.from('users').update({
        password: hash,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      adminUser = { ...existingUser, password_reset: true };
    } else if (!tenantId) {
      throw new Error('Cần có gói chính trước khi mua modun thêm. Đăng ký Free/Standard/Pro/Ultra trước.');
    }

    if (tenantId && mod.feature_key) {
      await supabase.from('tenant_features').upsert({
        tenant_id: tenantId,
        feature_key: mod.feature_key,
        enabled: true,
      }, { onConflict: 'tenant_id,feature_key' });
      invalidateTenantCache(tenantId);
    }
  }

  const productTitle = isPlan ? plan?.title : mod?.title;
  let emailResult = { ok: false, skipped: true };
  if (!skipWelcomeEmail) {
    const loginUrl = `${loginBaseUrl || config.frontendUrl}/login`;
    emailResult = await sendWelcomeCredentialsEmail({
      email,
      fullName: purchase.buyer_name,
      password: tempPassword,
      loginUrl,
      moduleTitle: productTitle,
      companyName: purchase.company_name,
    });
  }

  const provisionMeta = {
    temp_password_hint: emailResult.skipped ? tempPassword : undefined,
    email_result: emailResult.ok ? 'sent' : (emailResult.skipped ? 'logged_only' : 'failed'),
    provisioned_by: provisionedBy,
    purchase_type: isPlan ? 'plan' : 'module',
  };

  const { data: updated, error: uErr } = await supabase
    .from('saas_purchases')
    .update({
      status: 'provisioned',
      tenant_id: tenantId,
      user_id: userId,
      provision_meta: provisionMeta,
      provisioned_at: new Date().toISOString(),
      email_sent_at: emailResult.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .select('*, saas_modules(*), saas_plans(*)')
    .single();
  if (uErr) throw uErr;

  return {
    purchase: updated,
    tenant,
    adminUser,
    tempPassword: emailResult.skipped ? tempPassword : undefined,
    emailSent: emailResult.ok,
  };
}

/** Đơn trả phí đang chờ — chặn auto đăng ký Google Free. */
async function findBlockingPendingPurchase(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const { data } = await supabase
    .from('saas_purchases')
    .select('id, status, amount, payment_status, plan_id')
    .eq('buyer_email', em)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const amount = Number(data.amount) || 0;
  const paid = data.payment_status === 'paid' || data.payment_status === 'waived';
  if (amount > 0 && !paid) return data;
  return null;
}

/**
 * Tài khoản mới đăng nhập Google → tenant + admin user gói Free.
 */
async function provisionGoogleFreeSignup({ email, googleId, fullName, picture, companyName, planId = 'free' }) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !googleId) throw new Error('Thiếu email hoặc Google ID');

  const pid = String(planId || 'free').trim().toLowerCase();
  const { data: plan, error: planErr } = await supabase
    .from('saas_plans')
    .select('*')
    .eq('id', pid)
    .eq('is_active', true)
    .maybeSingle();
  if (planErr || !plan) throw new Error(`Gói "${pid}" chưa được cấu hình hoặc không khả dụng`);
  if (Number(plan.price_monthly) > 0) {
    throw new Error('Gói trả phí cần hoàn tất mua gói trước khi đăng nhập Google');
  }

  const displayName = String(fullName || '').trim() || em.split('@')[0];
  const orgName = String(companyName || '').trim() || `Xưởng ${displayName}`;
  const baseSlug = slugify(orgName || displayName || em.split('@')[0]);
  let slug = baseSlug;
  for (let i = 0; i < 5; i += 1) {
    const { data: dup } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (!dup) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const tempPassword = generateTempPassword();
  const result = await onboardTenant({
    name: orgName,
    slug,
    tier: plan.tenant_tier || PLAN_TO_TIER.free || 'free',
    maxUsers: plan.max_users || 3,
    maxCompanies: plan.max_companies || 1,
    adminEmail: em,
    adminPassword: tempPassword,
    adminFullName: displayName,
  });
  if (!result.tenant?.id || !result.adminUser?.id) {
    throw new Error('Không tạo được tenant Free');
  }

  await applyPlanToTenant(result.tenant.id, plan);

  const userPatch = {
    google_id: googleId,
    auth_provider: 'google',
    updated_at: new Date().toISOString(),
  };
  if (picture) userPatch.avatar = String(picture).slice(0, 2048);

  await supabase.from('users').update(userPatch).eq('id', result.adminUser.id);

  await supabase.from('saas_purchases').insert({
    purchase_type: 'plan',
    plan_id: pid,
    buyer_email: em,
    buyer_name: displayName,
    company_name: orgName,
    amount: 0,
    status: 'provisioned',
    payment_method: 'free',
    payment_status: 'waived',
    tenant_id: result.tenant.id,
    user_id: result.adminUser.id,
    provisioned_at: new Date().toISOString(),
    provision_meta: { provisioned_by: 'google_signup', auto_free: true },
  });

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', result.adminUser.id)
    .single();
  if (uErr || !user) throw new Error('Không tải được user sau cấp Free');

  return { user, tenant: result.tenant, plan };
}

module.exports = {
  provisionPurchase,
  provisionGoogleFreeSignup,
  findBlockingPendingPurchase,
  PURCHASE_STATUS,
  applyPlanToTenant,
};

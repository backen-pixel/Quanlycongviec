const { supabase } = require('../config/supabase');

/** Gói landing → tier trong bảng tenants / tier_features */
const PLAN_TO_TIER = {
  free: 'free',
  standard: 'starter',
  pro: 'pro',
  ultra: 'enterprise',
};

const TIER_TO_PLAN = Object.fromEntries(
  Object.entries(PLAN_TO_TIER).map(([plan, tier]) => [tier, plan]),
);

const PLAN_ORDER = ['free', 'standard', 'pro', 'ultra'];

const PLAN_LABELS = {
  free: 'Free',
  standard: 'Standard',
  pro: 'Pro',
  ultra: 'Ultra',
};

let tierFeaturesCache = null;
let tierFeaturesCacheAt = 0;
const CACHE_MS = 60_000;

async function loadTierFeatures() {
  if (tierFeaturesCache && Date.now() - tierFeaturesCacheAt < CACHE_MS) {
    return tierFeaturesCache;
  }
  const { data, error } = await supabase
    .from('tier_features')
    .select('tier, feature_key, enabled')
    .eq('enabled', true);
  if (error) throw error;

  const byTier = {};
  (data || []).forEach((row) => {
    if (!byTier[row.tier]) byTier[row.tier] = new Set();
    byTier[row.tier].add(row.feature_key);
  });

  const byPlan = {};
  Object.entries(PLAN_TO_TIER).forEach(([planId, tier]) => {
    byPlan[planId] = Array.from(byTier[tier] || []);
  });

  tierFeaturesCache = { byTier, byPlan };
  tierFeaturesCacheAt = Date.now();
  return tierFeaturesCache;
}

function planRank(planId) {
  const i = PLAN_ORDER.indexOf(planId);
  return i >= 0 ? i : 99;
}

/** feature_key có trong gói planId không */
async function featureIncludedInPlan(featureKey, planId) {
  if (!featureKey || !planId) return false;
  const { byPlan } = await loadTierFeatures();
  return (byPlan[planId] || []).includes(featureKey);
}

/** Gói thấp nhất (theo thứ tự) có feature này */
async function lowestPlanIncludingFeature(featureKey) {
  if (!featureKey) return null;
  const { byPlan } = await loadTierFeatures();
  for (const planId of PLAN_ORDER) {
    if ((byPlan[planId] || []).includes(featureKey)) return planId;
  }
  return null;
}

/** Modun add-on: có thể mua thêm khi gói hiện tại chưa bao gồm feature */
async function moduleAddonEligible(module, currentPlanId) {
  if (!module?.is_addon) return false;
  if (!module.is_purchasable) return false;
  if (!module.feature_key) return true;
  if (!currentPlanId) return true;
  const included = await featureIncludedInPlan(module.feature_key, currentPlanId);
  return !included;
}

async function resolveTenantPlanId(tenantId) {
  if (!tenantId) return null;
  const { data } = await supabase.from('tenants').select('tier').eq('id', tenantId).maybeSingle();
  if (!data?.tier) return null;
  return TIER_TO_PLAN[data.tier] || null;
}

async function resolvePlanIdByEmail(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const { data: user } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('email', em)
    .maybeSingle();
  if (!user?.tenant_id) return null;
  return resolveTenantPlanId(user.tenant_id);
}

function invalidateTierFeaturesCache() {
  tierFeaturesCache = null;
}

module.exports = {
  PLAN_TO_TIER,
  TIER_TO_PLAN,
  PLAN_ORDER,
  PLAN_LABELS,
  planRank,
  loadTierFeatures,
  featureIncludedInPlan,
  lowestPlanIncludingFeature,
  moduleAddonEligible,
  resolveTenantPlanId,
  resolvePlanIdByEmail,
  invalidateTierFeaturesCache,
};

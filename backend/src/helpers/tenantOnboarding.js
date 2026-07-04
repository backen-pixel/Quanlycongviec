const { supabase } = require('../config/supabase');

async function onboardTenant({ name, slug, tier = 'free', maxUsers = 50, maxCompanies = 5, adminEmail, adminPassword, adminFullName }) {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .insert({
      name,
      slug,
      tier,
      max_users: maxUsers,
      max_companies: maxCompanies,
      is_active: true,
    })
    .select('*')
    .single();
  if (tErr) throw tErr;

  const { data: rootLevel } = await supabase
    .from('ecosystem_levels')
    .select('id')
    .eq('level_index', 0)
    .maybeSingle();

  let rootUnit = null;
  if (rootLevel) {
    const { data: unit, error: uErr } = await supabase
      .from('ecosystem_units')
      .insert({
        name: tenant.name,
        level_id: rootLevel.id,
        tenant_id: tenant.id,
        is_active: true,
      })
      .select('*')
      .single();
    if (!uErr) rootUnit = unit;
  }

  const { data: tfRows } = await supabase
    .from('tier_features')
    .select('feature_key, enabled, config')
    .eq('tier', tier);
  if (tfRows?.length) {
    await supabase.from('tenant_features').insert(
      tfRows.map((f) => ({
        tenant_id: tenant.id,
        feature_key: f.feature_key,
        enabled: f.enabled,
        config: f.config,
      }))
    );
  }

  let adminUser = null;
  if (adminEmail) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(adminPassword || 'changeme123', 10);
    const { data: user, error: usErr } = await supabase
      .from('users')
      .insert({
        email: adminEmail.trim().toLowerCase(),
        password_hash: hash,
        full_name: adminFullName || 'Tenant Admin',
        role: 'admin',
        tenant_id: tenant.id,
        is_active: true,
      })
      .select('id, email, full_name, role, tenant_id')
      .single();
    if (!usErr) adminUser = user;
  }

  return { tenant, rootUnit, adminUser };
}

module.exports = { onboardTenant };

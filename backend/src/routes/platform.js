const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/tenantGate');
const { onboardTenant } = require('../helpers/tenantOnboarding');
const { invalidateTenantCache } = require('../helpers/tenantScope');
const {
  listPublishedBlueprints,
  listBlueprintCatalog,
  getBlueprintDetail,
  createBlueprint,
  createBlueprintVersion,
  publishBlueprintVersion,
  updateBlueprint,
  getTenantBlueprintInstallation,
  previewBlueprintForTenant,
  applyBlueprintToTenant,
  isMissingBlueprintSchema,
} = require('../helpers/businessBlueprint');

const r = Router();
r.use(auth);
r.use(requirePlatformAdmin);

function blueprintErrorResponse(res, error) {
  if (isMissingBlueprintSchema(error)) {
    return res.status(503).json({
      error: 'Chưa cài đặt cấu trúc Business Blueprint. Hãy chạy migration 567_business_blueprint_control_plane.sql.',
      code: 'BUSINESS_BLUEPRINT_SCHEMA_REQUIRED',
    });
  }
  if (error?.code === 'BLUEPRINT_VALIDATION') {
    return res.status(400).json({ error: error.message, validation_errors: error.validation_errors || [] });
  }
  if (error?.code === '23505') {
    return res.status(409).json({ error: 'Blueprint key hoặc số phiên bản đã tồn tại.' });
  }
  if (error?.code === 'BLUEPRINT_VERSION_CONFLICT') {
    return res.status(409).json({
      error: error.message,
      code: error.code,
      expected_version: error.expected_version,
      actual_version: error.actual_version,
    });
  }
  return res.status(500).json({ error: error.message || 'Lỗi Business Blueprint' });
}

// ─── Business Blueprint catalog ─────────────────────────────
r.get('/blueprints', async (req, res) => {
  try {
    const blueprints = req.query.catalog === '1'
      ? await listBlueprintCatalog()
      : await listPublishedBlueprints();
    res.json({ blueprints });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.post('/blueprints', async (req, res) => {
  try {
    const blueprint = await createBlueprint({
      blueprintKey: req.body?.blueprint_key,
      name: req.body?.name,
      industry: req.body?.industry,
      description: req.body?.description,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.status(201).json({ blueprint });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.get('/blueprints/:id', async (req, res) => {
  try {
    const blueprint = await getBlueprintDetail(req.params.id);
    if (!blueprint) return res.status(404).json({ error: 'Không tìm thấy Blueprint.' });
    res.json({ blueprint });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.patch('/blueprints/:id', async (req, res) => {
  try {
    const blueprint = await updateBlueprint(req.params.id, req.body || {});
    res.json({ blueprint });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.post('/blueprints/:id/versions', async (req, res) => {
  try {
    const version = await createBlueprintVersion({
      blueprintId: req.params.id,
      definition: req.body?.definition,
      releaseNotes: req.body?.release_notes,
      actorUserId: req.user?.userId || req.user?.id,
    });
    res.status(201).json({ version });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.post('/blueprints/:id/versions/:versionId/publish', async (req, res) => {
  try {
    const version = await publishBlueprintVersion({
      blueprintId: req.params.id,
      versionId: req.params.versionId,
    });
    res.json({ version });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

// ─── List tenants ───────────────────────────────────────────
r.get('/tenants', async (req, res) => {
  try {
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const enriched = await Promise.all((tenants || []).map(async (t) => {
      const [{ count: userCount }, { count: companyCount }] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('is_active', true),
        supabase.from('companies').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ]);
      return { ...t, user_count: userCount || 0, company_count: companyCount || 0 };
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Create tenant ──────────────────────────────────────────
r.post('/tenants', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên hệ sinh thái' });
    if (!b.slug?.trim()) return res.status(400).json({ error: 'Thiếu slug' });

    const { data, error } = await supabase
      .from('tenants')
      .insert({
        name: b.name.trim(),
        slug: b.slug.trim().toLowerCase(),
        tier: b.tier || 'free',
        max_users: b.max_users || 50,
        max_companies: b.max_companies || 5,
        logo_url: b.logo_url || null,
        domain: b.domain || null,
        settings: b.settings || {},
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

// ─── Get tenant detail ──────────────────────────────────────
r.get('/tenants/:id', async (req, res) => {
  try {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const [{ count: userCount }, { count: companyCount }, { data: features }] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('tenant_features').select('*').eq('tenant_id', tenant.id),
    ]);

    res.json({
      ...tenant,
      user_count: userCount || 0,
      company_count: companyCount || 0,
      features: features || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update tenant ──────────────────────────────────────────
r.patch('/tenants/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'slug', 'tier', 'max_users', 'max_companies', 'logo_url', 'domain', 'is_active', 'settings', 'subscription_start', 'subscription_end'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (update.slug) update.slug = String(update.slug).trim().toLowerCase();
    if (update.name) update.name = String(update.name).trim();

    const { data, error } = await supabase
      .from('tenants')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    invalidateTenantCache(req.params.id);
    res.json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

// ─── Soft-delete tenant ─────────────────────────────────────
r.delete('/tenants/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    invalidateTenantCache(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Toggle tenant features ────────────────────────────────
r.post('/tenants/:id/features', async (req, res) => {
  try {
    const { feature_key, enabled } = req.body || {};
    if (!feature_key) return res.status(400).json({ error: 'Thiếu feature_key' });

    const { data, error } = await supabase
      .from('tenant_features')
      .upsert({
        tenant_id: req.params.id,
        feature_key,
        enabled: enabled !== false,
      }, { onConflict: 'tenant_id,feature_key' })
      .select('*')
      .single();
    if (error) throw error;
    invalidateTenantCache(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get tenant features ───────────────────────────────────
r.get('/tenants/:id/features', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', req.params.id);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Users in tenant ────────────────────────────────────────
r.get('/tenants/:id/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, company_id, department_id, created_at, last_login_at')
      .eq('tenant_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Companies in tenant ────────────────────────────────────
r.get('/tenants/:id/companies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('tenant_id', req.params.id)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Blueprint installed in tenant ─────────────────────────
r.get('/tenants/:id/blueprints', async (req, res) => {
  try {
    const installations = await getTenantBlueprintInstallation(req.params.id);
    res.json({ installations });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.get('/tenants/:id/blueprints/preview', async (req, res) => {
  try {
    const preview = await previewBlueprintForTenant({
      tenantId: req.params.id,
      blueprintKey: req.query.blueprint_key,
      versionNumber: req.query.version_number,
    });
    res.json({ preview });
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

r.post('/tenants/:id/blueprints/apply', async (req, res) => {
  try {
    const b = req.body || {};
    const result = await applyBlueprintToTenant({
      tenantId: req.params.id,
      blueprintKey: b.blueprint_key,
      versionNumber: b.version_number,
      actorUserId: req.user?.userId || req.user?.id,
      companyName: b.company_name,
      companyShortName: b.company_short_name,
      bootstrapCompany: b.bootstrap_company === true,
      expectedCurrentVersion: Object.prototype.hasOwnProperty.call(b, 'expected_current_version')
        ? b.expected_current_version
        : undefined,
    });
    res.json(result);
  } catch (error) {
    return blueprintErrorResponse(res, error);
  }
});

function buildEcosystemTree(units) {
  const map = {};
  (units || []).forEach((u) => { map[u.id] = { ...u, children: [] }; });
  const roots = [];
  (units || []).forEach((u) => {
    if (u.parent_id && map[u.parent_id]) {
      map[u.parent_id].children.push(map[u.id]);
    } else {
      roots.push(map[u.id]);
    }
  });
  return roots;
}

// ─── Ecosystem diagram for tenant ───────────────────────────
r.get('/tenants/:id/ecosystem', async (req, res) => {
  try {
    const tid = req.params.id;
    const { data: companyRows, error: coErr } = await supabase
      .from('companies')
      .select('id, name, short_name, division_unit_id, is_active, phone, email')
      .eq('tenant_id', tid)
      .or('is_active.eq.true,is_active.is.null')
      .order('name');
    if (coErr) throw coErr;

    const companyIds = (companyRows || []).map((c) => c.id).filter(Boolean);

    const unitSelect = `
      *,
      level:ecosystem_levels(id,name,slug,depth,icon,color),
      company:companies!ecosystem_units_company_id_fkey(id,name,short_name,tenant_id)
    `;

    const [{ data: byTenant, error: tErr }, byCompanyRes] = await Promise.all([
      supabase.from('ecosystem_units').select(unitSelect).eq('tenant_id', tid).eq('is_active', true).order('order_index'),
      companyIds.length
        ? supabase.from('ecosystem_units').select(unitSelect).in('company_id', companyIds).eq('is_active', true).order('order_index')
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (tErr) throw tErr;
    if (byCompanyRes.error) throw byCompanyRes.error;

    const unitMap = new Map();
    [...(byTenant || []), ...(byCompanyRes.data || [])].forEach((u) => {
      if (u?.id) unitMap.set(u.id, u);
    });
    const unitList = Array.from(unitMap.values());

    await Promise.all(unitList.map(async (unit) => {
      const { count } = await supabase.from('ecosystem_unit_members')
        .select('id', { count: 'exact', head: true })
        .eq('unit_id', unit.id);
      unit.member_count = count || 0;
    }));

    const linkedCompanyIds = new Set(
      unitList.map((u) => u.company_id).filter(Boolean),
    );
    const orphanCompanies = (companyRows || []).filter((c) => !linkedCompanyIds.has(c.id));

    res.json({
      tree: buildEcosystemTree(unitList),
      units: unitList,
      companies: companyRows || [],
      orphan_companies: orphanCompanies,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Tenant stats ───────────────────────────────────────────
r.get('/tenants/:id/stats', async (req, res) => {
  try {
    const tid = req.params.id;
    const [
      { count: userCount, error: uErr },
      { count: activeUserCount, error: auErr },
      { count: companyCount, error: ccErr },
      { data: companyRows, error: coErr },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('is_active', true),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('companies').select('id').eq('tenant_id', tid),
    ]);
    if (uErr) throw uErr;
    if (auErr) throw auErr;
    if (ccErr) throw ccErr;
    if (coErr) throw coErr;

    const companyIds = (companyRows || []).map((c) => c.id).filter(Boolean);
    let dealCount = 0;
    let projectCount = 0;
    if (companyIds.length > 0) {
      const [{ count: dc, error: dErr }, { count: pc, error: pErr }] = await Promise.all([
        supabase.from('crm_leads').select('id', { count: 'exact', head: true }).in('company_id', companyIds),
        supabase.from('projects').select('id', { count: 'exact', head: true }).in('company_id', companyIds),
      ]);
      if (dErr) throw dErr;
      if (pErr) throw pErr;
      dealCount = dc || 0;
      projectCount = pc || 0;
    }

    res.json({
      total_users: userCount || 0,
      active_users: activeUserCount || 0,
      companies: companyCount || 0,
      deals: dealCount,
      projects: projectCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Full onboarding ────────────────────────────────────────
r.post('/tenants/onboard', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên hệ sinh thái' });
    if (!b.slug?.trim()) return res.status(400).json({ error: 'Thiếu slug' });

    const result = await onboardTenant({
      name: b.name.trim(),
      slug: b.slug.trim().toLowerCase(),
      tier: b.tier || 'free',
      maxUsers: b.max_users || 50,
      maxCompanies: b.max_companies || 5,
      adminEmail: b.admin_email,
      adminPassword: b.admin_password,
      adminFullName: b.admin_full_name,
    });

    let blueprint = null;
    let blueprintWarning = null;
    if (b.blueprint_key) {
      try {
        blueprint = await applyBlueprintToTenant({
          tenantId: result.tenant.id,
          blueprintKey: b.blueprint_key,
          versionNumber: b.blueprint_version,
          actorUserId: req.user?.userId || req.user?.id,
          companyName: b.company_name,
          companyShortName: b.company_short_name,
          bootstrapCompany: b.bootstrap_company === true,
        });
      } catch (blueprintError) {
        blueprintWarning = isMissingBlueprintSchema(blueprintError)
          ? 'Tenant đã được tạo nhưng chưa áp dụng Blueprint vì migration 567 chưa được cài đặt.'
          : `Tenant đã được tạo nhưng áp dụng Blueprint chưa hoàn tất: ${blueprintError.message}`;
      }
    }

    res.status(201).json({
      ...result,
      blueprint,
      blueprint_warning: blueprintWarning,
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

// ─── Platform overview stats ────────────────────────────────
r.get('/stats/overview', async (req, res) => {
  try {
    const [
      { count: tenantCount },
      { count: activeCount },
      { count: totalUsers },
      { count: totalCompanies },
    ] = await Promise.all([
      supabase.from('tenants').select('id', { count: 'exact', head: true }),
      supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
    ]);

    const { data: tierBreakdown } = await supabase
      .from('tenants')
      .select('tier');

    const tiers = {};
    (tierBreakdown || []).forEach((t) => {
      tiers[t.tier] = (tiers[t.tier] || 0) + 1;
    });

    res.json({
      total_tenants: tenantCount || 0,
      active_tenants: activeCount || 0,
      total_users: totalUsers || 0,
      total_companies: totalCompanies || 0,
      tier_breakdown: tiers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Tier features (defaults) ───────────────────────────────
r.get('/tier-features', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tier_features')
      .select('*')
      .order('tier');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/tier-features', async (req, res) => {
  try {
    const { tier, feature_key, enabled } = req.body || {};
    if (!tier || !feature_key) return res.status(400).json({ error: 'Thiếu tier hoặc feature_key' });

    const { data, error } = await supabase
      .from('tier_features')
      .upsert({
        tier: String(tier).trim().toLowerCase(),
        feature_key: String(feature_key).trim(),
        enabled: enabled !== false,
      }, { onConflict: 'tier,feature_key' })
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Users toàn nền tảng ────────────────────────────────────
r.get('/users', async (req, res) => {
  try {
    const { search, tenant_id } = req.query;
    let q = supabase
      .from('users')
      .select('id, email, full_name, role, is_active, tenant_id, company_id, created_at, last_login_at, tenants(name, slug)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    if (search?.trim()) {
      const s = search.trim();
      q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

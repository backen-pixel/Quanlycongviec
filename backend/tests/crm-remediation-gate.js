/**
 * CRM modularization remediation gate:
 * - shared schema state propagation
 * - task authorization (unit + structural)
 * - route parity vs Git pre-split baseline
 *
 * Usage: node tests/crm-remediation-gate.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CRM = path.join(ROOT, 'src/routes/crm');
const PRE_SPLIT = '13840874571d12ea5d7c2eb100f28bb5419bf638';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

function collectLiveRoutes(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      out.push(...collectLiveRoutes(layer.handle));
    }
  }
  return out;
}

function routeKey(r) {
  return `${r.method} ${r.path}`;
}

console.log('\n=== 1. Shared schema state ===');

test('crmSchemaCompat exported as object', () => {
  const h = require('../src/routes/crm/shared/helpersBundle');
  assert.ok(h.crmSchemaCompat && typeof h.crmSchemaCompat === 'object');
  assert.strictEqual(typeof h.crmSchemaCompat.vcPipelineStageAvailable, 'boolean');
  assert.strictEqual(typeof h.crmSchemaCompat.leadSelectMigrationChecked, 'boolean');
  assert.strictEqual(typeof h.crmSchemaCompat.leadTypeColorAvailable, 'boolean');
});

test('no primitive schema flags exported', () => {
  const h = require('../src/routes/crm/shared/helpersBundle');
  assert.strictEqual(h._vcPipelineStageAvailable, undefined);
  assert.strictEqual(h._crmLeadSelectMigrationChecked, undefined);
  assert.strictEqual(h._crmLeadTypeColorAvailable, undefined);
});

test('IIFE routers receive same crmSchemaCompat reference', () => {
  const h = require('../src/routes/crm/shared/helpersBundle');
  const lifeSrc = fs.readFileSync(path.join(CRM, 'routes/leadLifecycle.js'), 'utf8');
  assert.ok(lifeSrc.includes('helpers["crmSchemaCompat"]'), 'leadLifecycle must pass object ref');
  assert.ok(!lifeSrc.includes('helpers["_vcPipelineStageAvailable"]'), 'must not pass primitive');
  const ref = h.crmSchemaCompat;
  const before = ref.vcPipelineStageAvailable;
  ref.vcPipelineStageAvailable = !before;
  assert.strictEqual(h.crmSchemaCompat.vcPipelineStageAvailable, !before);
  ref.vcPipelineStageAvailable = before;
});

test('mutation in one consumer visible via helpers export', () => {
  const h = require('../src/routes/crm/shared/helpersBundle');
  const a = h.crmSchemaCompat;
  a.leadSelectMigrationChecked = true;
  a.vcPipelineStageAvailable = false;
  const h2 = require('../src/routes/crm/shared/helpersBundle');
  assert.strictEqual(h2.crmSchemaCompat.leadSelectMigrationChecked, true);
  assert.strictEqual(h2.crmSchemaCompat.vcPipelineStageAvailable, false);
  // reset
  h2.crmSchemaCompat.leadSelectMigrationChecked = false;
  h2.crmSchemaCompat.vcPipelineStageAvailable = true;
});

test('route modules do not bind schema primitives in IIFE params', () => {
  const dir = path.join(CRM, 'routes');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!src.includes('(function (')) continue;
    assert.ok(
      !/helpers\["_vcPipelineStageAvailable"\]/.test(src),
      `${f} still passes primitive _vcPipelineStageAvailable`,
    );
  }
});

console.log('\n=== 2. Task authorization ===');

test('assertCrmTaskLeadAccess helper exists', () => {
  const mod = require('../src/helpers/crmTaskLeadAccess');
  assert.strictEqual(typeof mod.assertCrmTaskLeadAccess, 'function');
  assert.strictEqual(typeof mod.loadLeadForTaskAccess, 'function');
});

test('index.js does not bare-bypass /tasks', () => {
  const src = fs.readFileSync(path.join(CRM, 'index.js'), 'utf8');
  assert.ok(src.includes('assertCrmTaskLeadAccess'), 'must call assertCrmTaskLeadAccess');
  // Old pattern: if (/\/tasks.../) return next(); without assert
  const bypassOnly = /if\s*\(\s*\/\\\/tasks\(\\\/\|\$\)\/\.test\(p\)\s*\)\s*return\s+next\(\s*\)\s*;/;
  assert.ok(!bypassOnly.test(src), 'bare tasks bypass still present');
});

test('task routes under lead UUID hit enforceCrmDealAssigneeAccess path', () => {
  const src = fs.readFileSync(path.join(CRM, 'index.js'), 'utf8');
  assert.ok(/\/tasks\(\\\/\|\$\)/.test(src));
  assert.ok(src.includes('loadLeadForTaskAccess'));
});

(async () => {
  await testAsync('negative: stranger denied without assignee/participant/executor', async () => {
    const { assertCrmTaskLeadAccess } = require('../src/helpers/crmTaskLeadAccess');
    const calls = [];
    const fakeSb = {
      from(table) {
        calls.push(table);
        const api = {
          select() { return api; },
          eq() { return api; },
          limit() { return api; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return api;
      },
    };
    const req = {
      user: { userId: '11111111-1111-4111-8111-111111111111', role: 'sales', company_id: 'cccccccccccccccccccccccccccccccccccc'.replace(/c/g, 'c') },
      tenant_company_ids: null,
      crm_region_ids: null,
    };
    // companyInTenantContext: need to understand - if no tenant context, may pass
    const lead = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'deal',
      company_id: '33333333-3333-4333-8333-333333333333',
      assigned_to: '44444444-4444-4444-8444-444444444444',
      lead_owner_id: null,
      parent_lead_id: null,
      project_id: null,
      region_id: null,
    };
    // Stub tenant to allow company (isolate authz logic)
    const tenant = require('../src/helpers/tenantScope');
    const orig = tenant.companyInTenantContext;
    tenant.companyInTenantContext = () => true;
    const region = require('../src/helpers/crmRegionScope');
    const origR = region.assertLeadReadableByRegionScope;
    region.assertLeadReadableByRegionScope = () => ({ ok: true });

    try {
      const gate = await assertCrmTaskLeadAccess(fakeSb, req, lead);
      assert.strictEqual(gate.ok, false, 'expected deny');
      assert.ok(gate.status === 403 || !gate.status);
    } finally {
      tenant.companyInTenantContext = orig;
      region.assertLeadReadableByRegionScope = origR;
    }
  });

  await testAsync('positive: deal assignee allowed', async () => {
    const { assertCrmTaskLeadAccess } = require('../src/helpers/crmTaskLeadAccess');
    const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fakeSb = {
      from() {
        const api = {
          select() { return api; },
          eq() { return api; },
          limit() { return api; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return api;
      },
    };
    const req = { user: { userId: uid, role: 'sales', company_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } };
    const lead = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      type: 'deal',
      company_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      assigned_to: uid,
      lead_owner_id: null,
      parent_lead_id: null,
      project_id: null,
      region_id: null,
    };
    const tenant = require('../src/helpers/tenantScope');
    const region = require('../src/helpers/crmRegionScope');
    const orig = tenant.companyInTenantContext;
    const origR = region.assertLeadReadableByRegionScope;
    tenant.companyInTenantContext = () => true;
    region.assertLeadReadableByRegionScope = () => ({ ok: true });
    try {
      const gate = await assertCrmTaskLeadAccess(fakeSb, req, lead);
      assert.strictEqual(gate.ok, true);
    } finally {
      tenant.companyInTenantContext = orig;
      region.assertLeadReadableByRegionScope = origR;
    }
  });

  await testAsync('negative: tenant mismatch denied', async () => {
    const { assertCrmTaskLeadAccess } = require('../src/helpers/crmTaskLeadAccess');
    const fakeSb = { from() { return { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) }; } };
    const req = { user: { userId: 'a', role: 'sales', company_id: 'x' } };
    const lead = { id: 'l', type: 'deal', company_id: 'other', assigned_to: 'a' };
    const tenant = require('../src/helpers/tenantScope');
    const orig = tenant.companyInTenantContext;
    tenant.companyInTenantContext = () => false;
    try {
      const gate = await assertCrmTaskLeadAccess(fakeSb, req, lead);
      assert.strictEqual(gate.ok, false);
      assert.ok(/hệ sinh thái|quyền/i.test(gate.error));
    } finally {
      tenant.companyInTenantContext = orig;
    }
  });

  console.log('\n=== 3. Route parity / inventory ===');

  test('regenerate inventory script runs', () => {
    execSync('node scripts/crm-route-inventory.js --write', {
      cwd: ROOT,
      stdio: 'pipe',
      maxBuffer: 20 * 1024 * 1024,
    });
    assert.ok(fs.existsSync(path.join(CRM, 'route-manifest.presplit.json')));
    assert.ok(fs.existsSync(path.join(CRM, 'route-manifest.runtime.json')));
    assert.ok(fs.existsSync(path.join(CRM, 'route-parity-report.json')));
  });

  test('presplit manifest = 224 from Git baseline', () => {
    const m = JSON.parse(fs.readFileSync(path.join(CRM, 'route-manifest.presplit.json'), 'utf8'));
    assert.strictEqual(m.git_commit, PRE_SPLIT);
    assert.strictEqual(m.total_routes, 224);
    assert.strictEqual(m.routes.length, 224);
    assert.strictEqual(Object.values(m.by_file).reduce((a, b) => a + b, 0), 224);
  });

  test('runtime manifest internally consistent (no 224/225 drift)', () => {
    const m = JSON.parse(fs.readFileSync(path.join(CRM, 'route-manifest.json'), 'utf8'));
    const sum = Object.values(m.by_file).reduce((a, b) => a + b, 0);
    assert.strictEqual(m.total_routes, m.routes.length, 'total_routes vs routes[]');
    assert.strictEqual(m.total_routes, sum, 'total_routes vs by_file');
    assert.ok(m.checksum, 'checksum required');
  });

  test('parity: no missing vs presplit; extras only intentional', () => {
    const report = JSON.parse(fs.readFileSync(path.join(CRM, 'route-parity-report.json'), 'utf8'));
    assert.strictEqual(report.counts.missing, 0, `missing: ${JSON.stringify(report.missing)}`);
    assert.strictEqual(
      report.counts.unexpected_extra,
      0,
      `unexpected extra: ${JSON.stringify(report.extra.filter((e) => !e.intentional))}`,
    );
    assert.ok(report.counts.intentional_extra >= 3, 'visibleProduction (+ optionally vcBooking) expected');
  });

  test('visibleProduction mounted and documented', () => {
    const idx = fs.readFileSync(path.join(CRM, 'index.js'), 'utf8');
    assert.ok(idx.includes('visibleProduction'));
    const report = JSON.parse(fs.readFileSync(path.join(CRM, 'route-parity-report.json'), 'utf8'));
    assert.ok(report.visibleProduction?.routes?.length === 3);
    const live = collectLiveRoutes(require('../src/routes/crm'));
    const keys = new Set(live.map(routeKey));
    assert.ok(keys.has('GET /production-companies'));
    assert.ok(keys.has('GET /companies/:companyId/visible-production-companies'));
    assert.ok(keys.has('PUT /companies/:companyId/visible-production-companies'));
  });

  test('live unique count matches runtime manifest', () => {
    const m = JSON.parse(fs.readFileSync(path.join(CRM, 'route-manifest.runtime.json'), 'utf8'));
    const live = collectLiveRoutes(require('../src/routes/crm'));
    const liveUnique = new Set(live.map(routeKey)).size;
    assert.strictEqual(liveUnique, m.live_unique_count || m.total_routes);
    assert.strictEqual(m.total_routes, liveUnique);
  });

  console.log('\n=== 4. Structural smoke (composition) ===');

  test('core.js stub; bak gitignored locally optional', () => {
    const core = fs.readFileSync(path.join(CRM, 'core.js'), 'utf8');
    assert.ok(/module\.exports\s*=\s*require\(['"]\.\/index/.test(core));
    // Baseline is Git commit, not bak
    assert.ok(fs.existsSync(path.join(CRM, 'route-manifest.presplit.json')));
  });

  test('nested feature routers ≥ 14 (includes visibleProduction/vcBooking)', () => {
    const crm = require('../src/routes/crm');
    const nested = (crm.stack || []).filter((l) => l.name === 'router').length;
    assert.ok(nested >= 14, `nested=${nested}`);
    // Current expected: 16
    assert.strictEqual(nested, 16, `expected 16 routers, got ${nested}`);
  });

  test('leadsList before leadLifecycle', () => {
    const src = fs.readFileSync(path.join(CRM, 'index.js'), 'utf8');
    assert.ok(src.indexOf('r.use(leadsList)') < src.indexOf('r.use(leadLifecycle)'));
  });

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed) {
    console.log(JSON.stringify(failures, null, 2));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

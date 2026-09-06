const test = require('node:test');
const assert = require('node:assert/strict');

// This regression test must not discover, probe, or write to a real environment.
process.env.NODE_ENV = 'test';
process.env.RUNTIME_PROFILE = 'test';
process.env.SUPABASE_HEALTH_CHECK_DISABLED = '1';
process.env.SUPABASE_URL = 'https://founder-local-crm-scope-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
process.env.JWT_SECRET = 'test-only-placeholder';
process.env.DOTENV_CONFIG_QUIET = 'true';

const express = require('express');
const {
  attestFounderLocalCompanyScope,
  createFounderLocalReadOnlyMiddleware,
} = require('../src/middleware/founderLocalReadOnly');
const {
  resolveCrmLeadsMergedQuery,
} = require('../src/routes/crm/shared/helpersBundle');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VERIFIED_COMPANY_B_ADMIN = Object.freeze({
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  role: 'admin',
  tenant_id: TENANT_ID,
  company_id: COMPANY_B,
  is_active: true,
});

test('real Founder-local CRM route rejects company-bound B admin requesting tenant company A', async (t) => {
  let tenantCompanyLookups = 0;
  const middleware = createFounderLocalReadOnlyMiddleware({
    runtimeEnabled: () => true,
    loadVerifiedAdmin: async () => ({ user: { ...VERIFIED_COMPANY_B_ADMIN } }),
    attestCompanyScope: (req, user) => attestFounderLocalCompanyScope(req, user, {
      tenantCompanyIds: async () => {
        tenantCompanyLookups += 1;
        return [COMPANY_A, COMPANY_B];
      },
    }),
  });
  const app = express();
  app.use(middleware);
  app.use('/api/crm', require('../src/routes/crm/routes/leadsList'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/crm/web-dashboard-bootstrap?company_id=${COMPANY_A}`,
    {
      headers: {
        Authorization: 'Bearer test-only-token',
        'X-Founder-Local-Company-Scope': COMPANY_A,
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'FOUNDER_LOCAL_SCOPE_DENIED');
  // The user-bound mismatch is rejected before even treating A as a tenant candidate.
  assert.equal(tenantCompanyLookups, 0);
});

test('Founder-local CRM effective company derives from the verified exact scope', async () => {
  const req = {
    query: { type: 'lead', company_id: COMPANY_B },
    // Deliberately omit the JWT company claim: the verified DB user and scope
    // remain the authoritative Founder-local inputs.
    user: { userId: VERIFIED_COMPANY_B_ADMIN.id, role: 'admin', tenant_id: TENANT_ID },
    founderLocalVerifiedUser: { ...VERIFIED_COMPANY_B_ADMIN },
    founderLocalScope: {
      key: COMPANY_B,
      companyId: COMPANY_B,
      tenantId: TENANT_ID,
      verified: true,
    },
  };

  const resolved = await resolveCrmLeadsMergedQuery(req, {});
  assert.equal(resolved.mergedQuery.company_id, COMPANY_B);
  assert.equal(resolved.mergedQuery.company_ids_scope, undefined);
});

test('CRM defense-in-depth rejects an attested company that conflicts with the verified DB user', async () => {
  const req = {
    query: { type: 'lead', company_id: COMPANY_A },
    user: { userId: VERIFIED_COMPANY_B_ADMIN.id, role: 'admin', tenant_id: TENANT_ID },
    founderLocalVerifiedUser: { ...VERIFIED_COMPANY_B_ADMIN },
    founderLocalScope: {
      key: COMPANY_A,
      companyId: COMPANY_A,
      tenantId: TENANT_ID,
      verified: true,
    },
  };

  await assert.rejects(resolveCrmLeadsMergedQuery(req, {}), {
    code: 'FOUNDER_LOCAL_SCOPE_DENIED',
    status: 403,
  });
});

test('standard CRM runtime keeps its existing company-admin scoping behavior', async () => {
  const resolved = await resolveCrmLeadsMergedQuery({
    query: { type: 'lead', company_id: COMPANY_A },
    user: { userId: VERIFIED_COMPANY_B_ADMIN.id, role: 'admin', company_id: COMPANY_B },
  }, {});

  assert.equal(resolved.mergedQuery.company_id, COMPANY_B);
});

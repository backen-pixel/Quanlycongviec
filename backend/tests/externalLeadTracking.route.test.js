'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tracking = require('../src/domain/externalLeadTracking');
function harness() {
  const routes = new Map(), writes = [];
  const router = {};
  for (const method of ['use', 'get', 'post', 'put', 'delete', 'patch']) router[method] = (url, ...fns) => routes.set(`${method}:${url}`, fns);
  const db = { from(table) {
    let payload, inserting = false;
    const q = {};
    for (const op of ['select', 'eq', 'ilike', 'order', 'limit']) q[op] = () => q;
    q.insert = row => { payload = row; inserting = true; writes.push({ table, row }); return q; };
    q.update = row => { writes.push({ table, row }); return q; };
    const result = () => {
      let data = null;
      if (table === 'company_regions') data = { id: 'region', company_id: 'scoped-company', is_active: true };
      if (table === 'crm_pipelines') data = { id: 'pipeline', company_id: 'scoped-company' };
      if (table === 'crm_pipeline_stages') data = { id: 'stage' };
      if (table === 'customers' && inserting) data = { id: 'synthetic-customer' };
      if (table === 'crm_sources') data = inserting ? { id: 'source' } : [];
      if (table === 'crm_leads') data = { id: 'lead', ...payload, created_at: '2026-10-08T00:00:00Z' };
      return { data, error: null };
    };
    q.single = q.maybeSingle = async () => result();
    q.then = (yes, no) => Promise.resolve(result()).then(yes, no);
    return q;
  } };
  const dependencies = {
    express: { Router: () => router }, '../config/supabase': { supabase: db },
    '../middleware/apiKeyAuth': { apiKeyAuth() {} },
    '../domain/externalLeadTracking': tracking,
    '../helpers/crmNextCode': { nextCrmCode: async () => 'LEAD-SYNTHETIC' },
    '../helpers/tenantQuotas': { enforceQuotaForRequest: async () => false, resolveTenantIdForQuota: async () => null },
    '../helpers/tenantScope': {}, '../helpers/autoGenCrmTasks': {},
    https: {}, http: {}, '../helpers/apiKeyTokens': {}, '../helpers/projectDeadlineExport': {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/external.js'), 'utf8'), {
    module: { exports: {} }, process: { env: {} }, console: { warn() {}, error() {} },
    require(id) { if (!(id in dependencies)) throw Error(`Unexpected import ${id}`); return dependencies[id]; },
  });
  return { writes, async send(body) {
    const req = { body: { title: 'Synthetic', phone: 'synthetic-phone', source_name: 'Website VPT V1', ...body },
      apiKey: { id: 'key', company_id: 'scoped-company', name: 'synthetic' }, headers: {}, protocol: 'https', get: () => 'example.test' };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get('post:/leads').at(-1)(req, res); return res;
  } };
}
test('external route writes validated attribution in the same scoped CRM insert and preserves description/source', async () => {
  const h = harness(); const r = await h.send({ company_id: 'foreign', is_test: true, description: 'unchanged gclid',
    attribution: { campaign_id: '23976669573', platform: 'google' } });
  assert.equal(r.statusCode, 201);
  const row = h.writes.find(w => w.table === 'crm_leads').row;
  assert.equal(row.company_id, 'scoped-company'); assert.equal(row.source_id, 'source');
  assert.equal(row.is_test, true); assert.equal(row.intake_attribution.campaign_id, '23976669573');
  assert.equal(row.description, 'unchanged gclid'); assert.equal(row.first_touch_time, undefined);
  assert.equal(row.intake_attribution.gclid, undefined);
});
test('invalid tracking is rejected before customer or lead writes; legacy payload still creates a lead', async () => {
  const h = harness(); assert.equal((await h.send({ attribution: { company_id: 'foreign' } })).statusCode, 400);
  assert.equal(h.writes.length, 0);
  assert.equal((await h.send({})).statusCode, 201);
  assert.equal(h.writes.find(w => w.table === 'crm_leads').row.intake_attribution, undefined);
});

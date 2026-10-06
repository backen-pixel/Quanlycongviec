'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/helpers/supabaseReplication.js'), 'utf8');
const PRIMARY = 'https://primary.synthetic.invalid';
const BACKUP = 'https://backup.synthetic.invalid';

function reply(status, body = null, message = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return message || JSON.stringify(body); },
  };
}

function harness(fetch) {
  const state = { calls: [], fetch };
  const module = { exports: {} };
  const imports = {
    crypto: require('node:crypto'),
    undici: { fetch: async (url, init = {}) => {
      state.calls.push({ url: String(url), init });
      return state.fetch(String(url), init);
    } },
    '../config': {
      supabaseReplicationEnabled: true,
      supabaseSwitchLogEnabled: false,
      supabaseUrl: PRIMARY,
      supabaseServiceKey: 'SYNTHETIC_PRIMARY',
      supabaseBackupUrl: BACKUP,
      supabaseBackupServiceKey: 'SYNTHETIC_BACKUP',
    },
    '../config/httpAgents': { supabaseDispatcher: { synthetic: true } },
    '../config/redis': { getRedisIfReady: () => null },
    './cronLeader': { runIfLeader: async (_key, fn) => fn() },
    '../config/supabaseRouter': { getActiveTarget: () => 'primary' },
  };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(id) {
      assert.ok(Object.hasOwn(imports, id), `Unexpected infrastructure import ${id}`);
      return imports[id];
    },
    URL, Buffer, Date,
    process: { env: {} },
    console: { log() {}, warn() {}, error() {} },
    setTimeout() { return { unref() {} }; },
    clearTimeout() {},
  }, { filename: 'supabaseReplication.parentGuard.isolated.js', timeout: 1000 });
  state.replication = module.exports;
  state.enqueueAndDrain = async (table, id) => {
    state.replication.maybeEnqueueRestReplication(
      `${PRIMARY}/rest/v1/${table}?id=eq.${id}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'updated' }) },
      { status: 204 },
    );
    await new Promise((resolve) => setImmediate(resolve));
    return state.replication.drainReplicationQueue({ maxJobs: 1 });
  };
  return state;
}

function assertQueuedFailure(state, result, expectedError) {
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(state.replication.getReplicationStatus().applied, 0);
  assert.match(state.replication.getReplicationStatus().last_error, expectedError);
}

test('a contact keeps its Lead link when the parent is absent on both databases', async () => {
  const h = harness(async (url, init) => {
    if (url.startsWith(`${PRIMARY}/rest/v1/facebook_contacts?`)) {
      return reply(200, [{ id: 'contact-1', page_id: 'page-1', psid: 'psid-1', lead_id: 'lead-1' }]);
    }
    if (url.startsWith(`${BACKUP}/rest/v1/crm_leads?`)) return reply(200, []);
    if (url.startsWith(`${PRIMARY}/rest/v1/crm_leads?`)) return reply(200, []);
    throw new Error(`Unexpected request ${init.method || 'GET'} ${url}`);
  });
  const result = await h.enqueueAndDrain('facebook_contacts', 'contact-1');
  assertQueuedFailure(h, result, /crm_leads not confirmed.*lead_id/);
  assert.equal(h.calls.some(({ init }) => init.method === 'POST'), false);
});

test('a contact keeps its Customer link when parent REST reads fail', async () => {
  const h = harness(async (url, init) => {
    if (url.startsWith(`${PRIMARY}/rest/v1/facebook_contacts?`)) {
      return reply(200, [{ id: 'contact-1', page_id: 'page-1', psid: 'psid-1', customer_id: 'customer-1' }]);
    }
    if (url.includes('/rest/v1/customers?')) return reply(503, null, 'temporary upstream failure');
    throw new Error(`Unexpected request ${init.method || 'GET'} ${url}`);
  });
  const result = await h.enqueueAndDrain('facebook_contacts', 'contact-1');
  assertQueuedFailure(h, result, /customers not confirmed.*customer_id/);
  assert.equal(h.calls.some(({ init }) => init.method === 'POST'), false);
});

test('a contact with confirmed parents retains both links in the Backup write', async () => {
  const h = harness(async (url, init) => {
    if (url.startsWith(`${PRIMARY}/rest/v1/facebook_contacts?`)) {
      return reply(200, [{
        id: 'contact-1', page_id: 'page-1', psid: 'psid-1',
        lead_id: 'lead-1', customer_id: 'customer-1',
      }]);
    }
    if (url.startsWith(`${BACKUP}/rest/v1/crm_leads?`)) return reply(200, [{ id: 'lead-1' }]);
    if (url.startsWith(`${BACKUP}/rest/v1/customers?`)) return reply(200, [{ id: 'customer-1' }]);
    if (url.startsWith(`${BACKUP}/rest/v1/facebook_contacts?`) && init.method === 'POST') {
      return reply(201, [{ id: 'contact-1' }]);
    }
    if (url.startsWith(`${BACKUP}/rest/v1/facebook_contacts?`) && init.method === 'PATCH') {
      return reply(204);
    }
    throw new Error(`Unexpected request ${init.method || 'GET'} ${url}`);
  });
  const result = await h.enqueueAndDrain('facebook_contacts', 'contact-1');
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  const upsert = h.calls.find(({ url, init }) => url.includes('/facebook_contacts?') && init.method === 'POST');
  assert.ok(upsert);
  const row = JSON.parse(upsert.init.body);
  assert.equal(row.lead_id, 'lead-1');
  assert.equal(row.customer_id, 'customer-1');
});

for (const parentRestStatus of [200, 503]) {
  test(`a missing template item (${parentRestStatus}) cannot be replaced with null`, async () => {
    const h = harness(async (url, init) => {
      if (url.startsWith(`${BACKUP}/rest/v1/crm_daily_report_lines?`) && !init.method) return reply(200, []);
      if (url.startsWith(`${PRIMARY}/rest/v1/crm_daily_report_lines?`)) {
        return reply(200, [{ id: 'line-1', template_item_id: 'item-1', report_id: null }]);
      }
      if (url.includes('/rest/v1/crm_daily_report_template_items?')) {
        return parentRestStatus === 200 ? reply(200, []) : reply(503, null, 'temporary upstream failure');
      }
      if (url.startsWith(`${BACKUP}/rest/v1/crm_daily_report_lines?`) && init.method === 'POST') {
        return reply(409, null,
          'Key (template_item_id)=(item-1) is not present in table "crm_daily_report_template_items"');
      }
      throw new Error(`Unexpected request ${init.method || 'GET'} ${url}`);
    });
    const result = await h.enqueueAndDrain('crm_daily_report_lines', 'line-1');
    assertQueuedFailure(h, result, /crm_daily_report_template_items not confirmed.*template_item_id/);
    const writes = h.calls.filter(({ init }) => init.method === 'POST');
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0].init.body).template_item_id, 'item-1');
  });
}

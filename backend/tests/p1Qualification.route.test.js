'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/p1Qualification.js'), 'utf8');
const leadId = '11111111-1111-4111-8111-111111111111';
const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actorId = '22222222-2222-4222-8222-222222222222';
const user = (company_id = companyA, role = 'admin') =>
  ({ userId: actorId, company_id, role });
const body = () => ({ request_id: 'synthetic-request', expected_revision: 0,
  status: 'QUALIFIED', contact_usable: true, need_in_scope: true,
  area_in_service: true, evidence_ref: 'synthetic-evidence' });

function harness({ enabled = true, session = user(), leadCompany = companyA,
  tenantCompanyIds = [companyA, companyB], target = 'primary', missing = false } = {}) {
  const layers = [], calls = [], events = [], requests = new Map();
  let rpcError = null;
  const lead = { id: leadId, company_id: leadCompany, customer_id: null,
    phone: 'synthetic-private-phone', stage_id: null };
  const db = {
    from(table) {
      calls.push(['from', table]);
      return { select(columns) {
        calls.push(['select', columns]);
        return { eq(column, value) {
          calls.push(['eq', column, value]);
          return { async maybeSingle() { return { data: missing ? null : lead, error: null }; } };
        } };
      } };
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (rpcError) return { data: null, error: { message: rpcError } };
      if (name === 'p1_qualification_state_v1')
        return { data: events.at(-1) || null, error: null };
      const prior = requests.get(args._request_id);
      const command = JSON.stringify(args);
      if (prior) return prior.command === command
        ? { data: { event: prior.event }, error: null }
        : { data: null, error: { message: 'REQUEST_CONFLICT' } };
      const event = { id: '33333333-3333-4333-8333-333333333333',
        company_id: args._company_id, actor_id: args._actor_id,
        status: args._command === 'revoke' ? 'PENDING' : args._payload.status,
        contact_usable: args._payload.contact_usable ?? false,
        need_in_scope: args._payload.need_in_scope ?? false,
        area_in_service: args._payload.area_in_service ?? false,
        evidence_ref: args._payload.evidence_ref ?? null, reason: args._payload.reason ?? null,
        revision: events.length + 1, recorded_at: '2026-10-07T00:00:00Z',
        phone: lead.phone, input: args._payload };
      events.push(event); requests.set(args._request_id, { command, event });
      return { data: { event }, error: null };
    },
  };
  const router = { use(fn) { layers.push({ method: 'USE', fn }); },
    get(path, fn) { layers.push({ method: 'GET', path, fn }); },
    put(path, fn) { layers.push({ method: 'PUT', path, fn }); },
    post(path, fn) { layers.push({ method: 'POST', path, fn }); } };
  const imports = {
    express: { Router: () => router },
    '../config/supabase': { supabase: db },
    '../config/supabaseRouter': { getActiveTarget: () => target,
      withPrimaryDatabase: callback => callback() },
    '../middleware/auth': { auth: (req, res, next) => session ? next()
      : res.status(401).json({ error: 'Chưa đăng nhập' }) },
    '../helpers/tenantScope': { isTenantScopeEnforced: () => true },
    '../modules/marketingAutomation/qualification': require('../src/modules/marketingAutomation/qualification'),
  };
  vm.runInNewContext(`(function(require,module,process){${source}\n})`,
    { Buffer, console, JSON, Object, String, Number }).call(null,
    name => name === 'node:crypto' ? { createHash } : imports[name],
    { exports: {} }, { env: { VPT_P1_REVIEW_WRITE: enabled ? '1' : '0' } });
  async function send(method = 'GET', data = undefined, overrides = {}) {
    const req = { user: session, tenantCompanyIds, params: { leadId }, body: data, ...overrides };
    const res = { statusCode: 200, body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; } };
    const stack = layers.filter(layer => layer.method === 'USE' || layer.method === method);
    for (const layer of stack) {
      let advanced = false;
      await layer.fn(req, res, () => { advanced = true; });
      if (!advanced) break;
    }
    return res;
  }
  return { send, calls, events, setRpcError(value) { rpcError = value; } };
}

test('flag off returns 404 without DB access', async () => {
  const h = harness({ enabled: false });
  assert.equal((await h.send('PUT', body())).statusCode, 404);
  assert.equal(h.calls.length, 0);
});
test('unauthenticated request is rejected before DB access', async () => {
  const h = harness({ session: null });
  assert.equal((await h.send()).statusCode, 401);
  assert.equal(h.calls.length, 0);
});
for (const role of ['sales_admin', 'sales', 'manager', 'ecosystem_admin']) {
  test(`${role} cannot read or write qualification`, async () => {
    const h = harness({ session: user(companyA, role) });
    assert.equal((await h.send()).statusCode, 403);
    assert.equal((await h.send('PUT', body())).statusCode, 403);
    assert.equal(h.calls.filter(call => call[0] === 'rpc').length, 0);
  });
}
test('company admin cannot write another company and tenant scope is enforced', async () => {
  const h = harness({ leadCompany: companyB });
  assert.equal((await h.send('PUT', body())).statusCode, 403);
  assert.equal(h.calls.filter(call => call[0] === 'rpc').length, 0);
  const outside = harness({ session: user(null), tenantCompanyIds: [companyA], leadCompany: companyB });
  assert.equal((await outside.send('PUT', body())).statusCode, 403);
  assert.equal(outside.calls.filter(call => call[0] === 'rpc').length, 0);
});
test('system admin can write each company inside tenant', async () => {
  for (const company of [companyA, companyB]) {
    const h = harness({ session: user(null), leadCompany: company });
    assert.equal((await h.send('PUT', body())).statusCode, 200);
    assert.equal(h.calls.find(call => call[0] === 'rpc')[2]._company_id, company);
  }
});
test('missing lead returns 404 without RPC', async () => {
  const h = harness({ missing: true });
  assert.equal((await h.send('PUT', body())).statusCode, 404);
  assert.equal(h.calls.filter(call => call[0] === 'rpc').length, 0);
});
test('body identity and unknown keys are rejected; RPC uses session and CRM identity', async () => {
  const h = harness();
  for (const key of ['actor_id', 'company_id', 'context_hash', 'unknown']) {
    assert.equal((await h.send('PUT', { ...body(), [key]: 'forged' })).statusCode, 400);
  }
  assert.equal((await h.send('PUT', body())).statusCode, 200);
  const args = h.calls.find(call => call[0] === 'rpc')[2];
  assert.equal(args._actor_id, actorId);
  assert.equal(args._company_id, companyA);
  assert.match(args._payload.context_hash, /^[a-f0-9]{64}$/);
  assert.equal(args._payload.context_hash,
    createHash('sha256').update(JSON.stringify([leadId, companyA, null,
      'synthetic-private-phone', null])).digest('hex'));
});
test('GET returns pending default and never exposes CRM phone or stored input', async () => {
  const h = harness();
  assert.deepEqual(JSON.parse(JSON.stringify((await h.send()).body)), { status: 'PENDING', revision: 0 });
  await h.send('PUT', body());
  const result = await h.send();
  assert.equal(result.body.status, 'QUALIFIED');
  assert.doesNotMatch(JSON.stringify(result.body), /synthetic-private-phone|input|company_id|context_hash/);
});
test('revoke sends only reason and server context', async () => {
  const h = harness();
  const response = await h.send('POST', { request_id: 'revoke-1', expected_revision: 0,
    reason: 'synthetic-reason' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'PENDING');
  assert.equal(h.calls.find(call => call[0] === 'rpc')[2]._command, 'revoke');
});
for (const [code, status] of [['INVALID_COMMAND',400], ['REASON_REQUIRED',400],
  ['EVIDENCE_REQUIRED',400], ['REVISION_CONFLICT',409], ['REQUEST_CONFLICT',409],
  ['COMPANY_MISMATCH',409]]) {
  test(`${code} maps to ${status} without raw error`, async () => {
    const h = harness(); h.setRpcError(`private sentinel ${code}`);
    const response = await h.send('PUT', body());
    assert.equal(response.statusCode, status);
    assert.equal(response.body.reason_code, code);
    assert.doesNotMatch(JSON.stringify(response.body), /private sentinel/);
  });
}
test('unknown DB error is sanitized', async () => {
  const h = harness(); h.setRpcError('private sentinel SQL detail');
  const response = await h.send('PUT', body());
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.reason_code, 'WRITE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response.body), /private sentinel/);
});
test('same request and payload replays old event; changed payload conflicts', async () => {
  const h = harness();
  const first = await h.send('PUT', body());
  const replay = await h.send('PUT', body());
  assert.deepEqual(replay.body, first.body);
  assert.equal(h.events.length, 1);
  assert.equal((await h.send('PUT', { ...body(), reason: 'changed' })).statusCode, 409);
});
test('backup target closes GET and write without CRM read', async () => {
  const h = harness({ target: 'backup' });
  assert.equal((await h.send()).body.reason_code, 'WRITE_GATE_CLOSED');
  assert.equal((await h.send('PUT', body())).statusCode, 503);
  assert.equal(h.calls.length, 0);
});
test('route contains only the review flag and no leadQuality import', () => {
  assert.deepEqual([...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(m => m[1]),
    ['VPT_P1_REVIEW_WRITE']);
  assert.doesNotMatch(source, /require\([^)]*leadQuality/);
});

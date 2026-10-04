'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { repairFacebookSources } = require('../src/helpers/facebookLegacySourceRepair');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), company = id(2), lead = id(3), sourceId = id(4), requestId = id(5), version = 'a'.repeat(32);
const request = () => ({ user: { userId: actor }, body: { company_id: company, lead_ids: [lead], mode: 'preview' } });
const good = () => ({ policy: 'FACEBOOK_SOURCE_REPAIR_V1', mode: 'preview', companyId: company, contextVersion: version,
  items: [{ leadId: lead, status: 'READY', sourceId, reason: 'ORIGINAL_INTAKE_SOURCE' }], updated: 0, replayed: false, restoresCrmLabelOnly: true });
function setup({ data = good(), error, thrown, isPrimary = () => true } = {}) {
  const calls = [], db = { from() { throw Error('Direct writes forbidden'); }, async rpc(name, args) {
    calls.push({ name, args }); if (thrown) throw Error('PRIVATE DATABASE ERROR'); return { data, error };
  } };
  let handler;
  const code = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
  const start = code.indexOf("r.post('/sync-source-ids'");
  vm.runInNewContext(code.slice(start, code.indexOf("r.get('/batch-create-leads'", start)), {
    r: { post(_url, ...fns) { handler = fns.at(-1); } }, authMiddleware() {}, supabase: db,
    repairFacebookSources, leadIntakePrimary: isPrimary,
  });
  return { calls, async run(req = request()) {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; },
      status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res); return res;
  } };
}
test('actual source route sends bounded company and authenticated actor to one RPC, no direct writes', async () => {
  const s = setup(), req = request(); req.body.lead_ids = [lead.toUpperCase(), lead];
  const r = await s.run(req); assert.equal(r.statusCode, 200); assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.deepEqual(s.calls, [{ name: 'crm_facebook_source_repair', args: { p_actor: actor, p_company: company,
    p_lead_ids: [lead], p_mode: 'preview', p_request_id: null, p_context_version: null } }]);
  assert.equal(r.body.resultKind, 'CURRENT_PREVIEW'); assert.equal(r.body.updated, 0);
});
for (const [label, change] of [
  ['empty body', r => { r.body = {}; }], ['implicit company', r => { delete r.body.company_id; }],
  ['actor from body', r => { r.body.actor_id = actor; }], ['absent actor', r => { r.user = {}; }],
  ['implicit selection', r => { delete r.body.lead_ids; }], ['empty selection', r => { r.body.lead_ids = []; }],
  ['invalid identity', r => { r.body.lead_ids = ['all']; }], ['over limit', r => { r.body.lead_ids = Array(501).fill(lead); }],
  ['apply without preview', r => { r.body.mode = 'apply'; r.body.requestId = requestId; }],
  ['preview with version', r => { r.body.contextVersion = version; }], ['invalid mode', r => { r.body.mode = 'sync'; }],
]) test('source command rejects ' + label + ' before RPC', async () => {
  const s = setup(), req = request(); change(req); const r = await s.run(req);
  assert.equal(r.statusCode, 400); assert.equal(s.calls.length, 0);
});
for (const [code, status] of [['42501', 403], ['22023', 400], ['40001', 409], ['23505', 409], ['55P03', 409], ['40P01', 409], ['XX000', 503]]) {
  test('source route reports DB ' + code + ' without details or retry', async () => {
    const s = setup({ error: { code, message: 'PRIVATE DATABASE ERROR' } }), r = await s.run();
    assert.equal(r.statusCode, status); assert.equal(s.calls.length, 1); assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));
  });
}
test('transport failure is uncertain and never triggers automatic retry', async () => {
  const s = setup({ thrown: true }); assert.equal((await s.run()).statusCode, 503); assert.equal(s.calls.length, 1);
});
test('non-primary refuses command; failover after response withholds result', async () => {
  const s = setup({ isPrimary: () => false }); assert.equal((await s.run()).statusCode, 503); assert.equal(s.calls.length, 0);
  let n = 0; const drift = setup({ isPrimary: () => ++n === 1 }); assert.equal((await drift.run()).statusCode, 503); assert.equal(drift.calls.length, 1);
});
for (const [label, mutate] of [
  ['wrong company', x => { x.companyId = id(90); }], ['wrong selection', x => { x.items[0].leadId = id(90); }],
  ['wrong count', x => { x.updated = 1; }], ['wrong status', x => { x.items[0].status = 'RESTORED'; }],
  ['missing source', x => { x.items[0].sourceId = null; }], ['paid claim', x => { x.restoresCrmLabelOnly = false; }],
  ['invalid reason', x => { x.items[0].reason = 'FREE_FORM_PRIVATE_DATA'; }],
]) test('malformed DB result withheld: ' + label, async () => {
  const data = good(); mutate(data); assert.equal((await setup({ data }).run()).statusCode, 503);
});
test('source response strips extra private fields', async () => {
  const data = good(); data.proof = 'PRIVATE'; data.items[0].phone = 'PRIVATE';
  const r = await setup({ data }).run(); assert.equal(r.statusCode, 200); assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));
});
test('apply and replay preserve request/version and explicitly return recorded outcome', async () => {
  const req = request(); Object.assign(req.body, { mode: 'apply', requestId, contextVersion: version });
  for (const replayed of [false, true]) {
    const data = good(); Object.assign(data, { mode: 'apply', requestId, updated: 1, replayed }); data.items[0].status = 'RESTORED';
    const s = setup({ data }), r = await s.run(req); assert.equal(r.statusCode, 200); assert.equal(r.body.resultKind, 'RECORDED_OUTCOME');
    assert.equal(s.calls[0].args.p_request_id, requestId); assert.equal(s.calls[0].args.p_context_version, version);
  }
});

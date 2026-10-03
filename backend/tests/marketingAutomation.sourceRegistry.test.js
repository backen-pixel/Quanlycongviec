'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { createSourceRegistry, projectRegistry, commandValid } = require('../src/modules/marketingAutomation/sourceRegistry');
const { fixture } = require('./marketingAutomation.trial.fixture');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
const actor = randomUUID(), company = randomUUID(), trial = randomUUID(), key = randomUUID();
const entry = { accountId: 'act_77', kind: 'META_LEAD_ADS', pageId: '123', formId: '456', destination: null };
const command = () => ({ expectedRevision: 0, expectedInventoryVersion: 'a'.repeat(64), sourceReference: 'Synthetic dossier', sourceDate: '2026-10-01', sourceNote: 'Synthetic scope evidence for registry acceptance', entries: [entry] });
const projection = () => ({ actorId: actor, version: 1, companyId: company, trialId: trial, asOf: '2026-10-03T00:00:00Z', inventoryVersion: 'a'.repeat(64), status: 'MISSING', declaration: null, gaps: [], providerCoverage: 'UNVERIFIED', allowBudgetExecution: false,
  inventory: { trial: { id: trial, company_id: company, revision: 1, since: '2026-10-01', until: '2026-10-30', account_ids: ['act_77'] }, accounts: [{ id: 'act_77', active: true, expiresAt: null }, { id: 'act_78', active: false, expiresAt: null }], pages: [{ pageId: '123', active: true }], knownForms: [{ pageId: '123', formId: '456', accountId: 'act_77', bindingActive: true }, { pageId: '123', formId: '457', accountId: null, bindingActive: false }] } });
const request = () => ({ user: { userId: actor }, query: { company_id: company }, params: { trialId: trial }, body: { requestId: key, command: command() } });
function harness({ primary = true, env = { VPT_MARKETING_SOURCE_REGISTRY: '1', VPT_MARKETING_TRIAL_REPORT: '1' }, result = { data: projection() }, throws = false } = {}) {
  const calls = [], res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  const run = createSourceRegistry({ isPrimary: () => primary, env, db: { rpc: async (...args) => { calls.push(args); if (throws) throw Error('private secret'); return result; } } });
  return { calls, res, run: (r = request(), write = false) => run(r, res, write) };
}
for (const opts of [{ env: {} }, { primary: false }, { env: { VPT_MARKETING_TRIAL_REPORT: '1' } }]) test('source registry is default-off and primary-only ' + JSON.stringify(opts), async () => { const h = harness(opts); await h.run(); assert.equal(h.res.statusCode, 503); assert.equal(h.calls.length, 0); });
test('authenticated scope and purpose cannot be provided by the request body', async () => {
  for (const change of [r => r.user.id = randomUUID(), r => r.query.company_id = [], r => r.params.trialId = 'bad', r => r.body.actorId = randomUUID(), r => r.body.command.providerCoverage = 'COMPLETE']) {
    const h = harness(), r = request(); change(r); await h.run(r, true); assert.ok([400, 403].includes(h.res.statusCode)); assert.equal(h.calls.length, 0);
  }
});
test('read returns bounded public projection with authenticated identity and no private evidence', async () => {
  const p = projection(); p.secret = 'hidden'; p.inventory.trial.secret = 'hidden'; p.inventory.accounts[0].access_token = 'hidden';
  const h = harness({ result: { data: p } }); await h.run(); assert.equal(h.res.headers['Cache-Control'], 'no-store'); assert.equal(h.res.body.actorId, actor); assert.equal(JSON.stringify(h.res.body).includes('hidden'), false);
  assert.deepEqual(h.calls[0], ['marketing_source_registry_read', { p_actor: actor, p_company: company, p_trial: trial }]);
});
for (const change of [p => p.actorId = randomUUID(), p => p.companyId = randomUUID(), p => p.inventory.trial.id = randomUUID(), p => p.providerCoverage = 'COMPLETE', p => p.allowBudgetExecution = true, p => p.status = 'CURRENT']) test('invalid success projection is hidden ' + change, async () => {
  const p = projection(); change(p); const h = harness({ result: { data: p } }); await h.run(); assert.equal(h.res.statusCode, 503); assert.equal(h.res.body.inventory, undefined);
});
test('command rejects numeric IDs, impossible dates, undeclared keys and missing historical reason', () => {
  assert.equal(commandValid(command()), true);
  for (const change of [c => c.entries[0] = { ...entry, pageId: 123 }, c => c.sourceDate = '2026-02-30', c => c.secret = 'unexpected', c => c.expectedRevision = -1, c => c.entries = [{ ...entry, kind: 'UNRESOLVED_FORM', accountId: null, destination: '' }]]) { const c = command(); change(c); assert.equal(commandValid(c), false); }
});
test('write sends exact immutable command; validated receipt distinguishes declaration from provider proof', async () => {
  const data = { companyId: company, trialId: trial, requestId: key, revision: 1, declarationDigest: 'b'.repeat(64), recordedAt: '2026-10-03T00:00:00Z', replayed: true, purpose: 'DECLARED_BUSINESS_SCOPE', allowBudgetExecution: false };
  const h = harness({ result: { data } }); await h.run(request(), true); assert.equal(h.res.statusCode, 200); assert.equal(h.res.body.replayed, true); assert.deepEqual(h.calls[0][1].p_command, command());
  data.revision = 2; const bad = harness({ result: { data } }); await bad.run(request(), true); assert.equal(bad.res.statusCode, 503);
});
for (const [code, status] of [['42501', 403], ['40001', 409], ['23505', 409], ['22023', 400], ['22008', 400], ['XX000', 503]]) test('sanitized source error ' + code, async () => {
  const h = harness({ result: { error: { code, message: 'private secret' } } }); await h.run(request(), true); assert.equal(h.res.statusCode, status); assert.equal(JSON.stringify(h.res.body).includes('secret'), false); assert.equal(h.res.body.code === 'SOURCE_CHANGED', code === '40001');
});
test('network or empty results are unknown, never a success', async () => { for (const opts of [{ throws: true }, { result: { data: null } }]) { const h = harness(opts); await h.run(); assert.equal(h.res.statusCode, 503); } });
test('report retains compatibility with old snapshots; source declaration cannot change full CPQL', () => {
  const f = fixture(); assert.equal(reportTrial(f).sourceRegistry, null);
  const p = projection(); p.companyId = p.inventory.trial.company_id = f.companyId; p.trialId = p.inventory.trial.id = f.trial.id;
  f.sourceRegistry = p; const r = reportTrial(f); assert.equal(r.sourceRegistry.status, 'MISSING'); assert.equal(r.costPerQualifiedLeadVnd, null); assert.equal(r.allowBudgetExecution, false);
  f.sourceRegistry.allowBudgetExecution = true; assert.throws(() => reportTrial(f)); assert.equal(projectRegistry(undefined, company, trial), null);
});
test('UI suggests known forms, leaves unknown form unresolved and never assumes a zero-lead account has no entrypoint', async () => {
  const ui = await import('../../frontend/src/components/marketing/sourceRegistryState.mjs'); const entries = ui.initialEntries(projection());
  assert.equal(entries.find(e => e.formId === '457').accountId, null); assert.equal(entries.find(e => e.formId === '457').kind, 'UNRESOLVED_FORM');
  assert.equal(entries.find(e => e.accountId === 'act_78').kind, ''); assert.equal(entries.some(e => e.kind === 'NO_LEAD_SOURCE'), false);
});
test('UI stores an exact retry across reload and isolates actor/company/trial; corrupt or unwritable storage fails closed', async () => {
  const ui = await import('../../frontend/src/components/marketing/sourceRegistryState.mjs'), map = new Map(), storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }, r = request().body;
  ui.pendingSave(storage, actor, company, trial, r); assert.deepEqual(ui.pendingRead(storage, actor, company, trial), r);
  for (const scope of [[randomUUID(), company, trial], [actor, randomUUID(), trial], [actor, company, randomUUID()]]) assert.equal(ui.pendingRead(storage, ...scope), null);
  assert.throws(() => ui.pendingSave({ ...storage, setItem: () => {} }, actor, company, randomUUID(), r));
  map.set([...map.keys()][0], '{broken'); assert.throws(() => ui.pendingRead(storage, actor, company, trial));
});
test('UI rejects scope/purpose mismatches and cannot consume another actor receipt', async () => {
  const ui = await import('../../frontend/src/components/marketing/sourceRegistryState.mjs'); assert.equal(ui.registryResult(projection(), actor, company, trial).status, 'MISSING');
  assert.throws(() => ui.registryResult(projection(), randomUUID(), company, trial));
  assert.throws(() => ui.registryResult({ ...projection(), allowBudgetExecution: true }, actor, company, trial));
  assert.throws(() => ui.receiptResult({ actorId: randomUUID() }, request().body, actor, company, trial));
});

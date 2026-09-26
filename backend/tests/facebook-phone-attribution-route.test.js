const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { vnDateStartIso, vnNextDateStartIso } = require('../src/helpers/facebookContactActivity');
const { vietnamCalendarDate, buildPhoneAttributionReadiness } = require('../src/helpers/facebookMessengerCampaignAttribution');

// Execute the actual route body with isolated adapters. No server/env/CRM access.
const source = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
const start = source.indexOf("r.get('/ads/phone-attribution', authMiddleware, async (req, res) => {");
const end = source.indexOf('// ── Exclude one authorised E2E', start);
assert(start >= 0 && end > start);
let handler;
let rpcCalls;
let filters;
let rows;
let capability;
let reportError;
let queueReady;
const context = vm.createContext({
  console: { error() {} },
  r: { get(_path, _auth, fn) { handler = fn; } }, authMiddleware() {},
  vnDateStartIso, vnNextDateStartIso, vietnamCalendarDate, buildPhoneAttributionReadiness,
  resolveFacebookPageScope: async () => ({ mode: 'filter', pageIds: ['page-allowed'] }),
  facebookAppSecretConfigured: () => true,
  messengerReceiptHealth: async ({ pageIds }) => {
    assert.deepEqual(Array.from(pageIds), ['page-allowed']);
    return { ready: queueReady, reason: queueReady ? null : 'webhook_receipts_unprocessed' };
  },
  supabase: {
    from(table) {
      assert.equal(table, 'facebook_ad_campaign_mappings');
      const query = {
        select() { return query; },
        in(field, values) { filters.push([field, Array.from(values)]); return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: [{ campaign_id: 'campaign-1', page_id: 'page-allowed' }], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push([name, args]);
      return name === 'fb_campaign_phone_attribution_capabilities'
        ? capability : { data: rows, error: reportError };
    },
  },
});
vm.runInContext(source.slice(start, end), context);
function reset() {
  rpcCalls = []; filters = []; rows = []; reportError = null; queueReady = true;
  capability = { data: { schema_version: 639, verified_events_only: true,
    same_vietnam_day: true, ambiguous_latest_referral_excluded: true }, error: null };
}
async function request(query = {}) {
  let status = 200;
  let body;
  const res = { status(code) { status = code; return res; }, json(value) { body = value; return res; } };
  await handler({ query: { date: '2026-09-26', campaign_ids: 'campaign-1', ...query } }, res);
  return { status, body };
}

(async () => {
  reset();
  for (const date of ['2026-02-30', '2026-13-01', '2026-09-00', 'invalid']) {
    assert.equal((await request({ date })).status, 400);
  }
  assert.equal(rpcCalls.length, 0, 'invalid dates do not query attribution');
  assert.equal((await request({ page_id: 'page-other-tenant' })).status, 403);
  assert.equal(rpcCalls.length, 0, 'unauthorised Page cannot reach report RPC');
  reset();
  capability = { data: null, error: { code: 'PGRST202' } };
  const oldSchema = await request();
  assert.equal(oldSchema.status, 503);
  assert(oldSchema.body.blocking_reasons.includes('attribution_schema_upgrade_required'));
  assert.equal(oldSchema.body.phone_by_campaign, undefined, 'missing migration is never zero leads');
  reset();
  const empty = await request();
  assert.equal(empty.status, 200);
  assert.equal(empty.body.phone_by_campaign['campaign-1'], 0);
  assert.equal(empty.body.tracking_ready, true);
  assert.equal(empty.body.automation_ready, false);
  assert.equal(empty.body.crm_acceptance_verified, false);
  assert(empty.body.blocking_reasons.includes('crm_linkage_not_retry_safe'));
  assert(empty.body.blocking_reasons.includes('messenger_live_e2e_not_verified'));
  assert.deepEqual(filters, [['campaign_id', ['campaign-1']], ['page_id', ['page-allowed']]]);
  const args = rpcCalls.find(([name]) => name === 'fb_campaign_phone_numbers_in_range')[1];
  assert.deepEqual(Array.from(args.p_page_ids), ['page-allowed']);
  assert.equal(args.p_from, '2026-09-26T00:00:00+07:00');
  assert.equal(args.p_to, '2026-09-26T17:00:00.000Z');
  reset(); queueReady = false;
  assert.equal((await request()).body.tracking_ready, false, 'unfinished queue blocks a trusted zero');
  reset(); reportError = { code: '08006' };
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.equal(failed.body.phone_by_campaign, undefined);
  for (const bad of [null, false, '', -1, 'bad', 1.5, '9007199254740993']) {
    reset(); rows = [{ campaign_id: 'campaign-1', phone_contacts: bad }];
    assert.equal((await request()).status, 503, 'malformed count is not silently zero');
  }
  reset(); rows = [{ campaign_id: 'campaign-1', phone_contacts: '2' }];
  assert.equal((await request()).body.phone_by_campaign['campaign-1'], 2);
  console.log('facebook-phone-attribution-route: ok (scope, dates, schema gate, counts, release blockers)');
})().catch((error) => { console.error(error); process.exitCode = 1; });

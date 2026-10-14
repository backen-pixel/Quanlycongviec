'use strict';

// Actual pure parser and external handler, synthetic adapters only. No client/config/live DB.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const { websiteIntakeReceipt: parse, COMPANY, WEBSITE_API_KEY_NAME } = require('../src/domain/websiteIntakeReceipt');
const tracking = require('../src/domain/externalLeadTracking');
const U = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const KEY = U(7), KEY_FINGERPRINT = createHash('sha256').update(KEY).digest('hex');
const DAY = 86400000, NOW = Date.now() - 1000, CLICK = 'originalSyntheticClick';
const clone = value => JSON.parse(JSON.stringify(value));
const iso = ms => new Date(ms).toISOString();
function fixture({ consent = true } = {}) {
  const source = { kenh: 'website', platform: 'facebook', utm_source: 'facebook', utm_medium: 'paid',
    fbclid: CLICK, campaign_id: '120200000000001', ad_id: '120200000000002',
    landing_url: 'https://vanphuthanh.net/tu-bep/' };
  return { input: { version: 1, request_id: U(1), form_id: '11116', site_host: 'vanphuthanh.net',
    submitted_at: iso(NOW - 30000), landing_url: source.landing_url,
    captured_at: consent ? iso(NOW - 60000) : null,
    fbc: consent ? `fb.1.${NOW - 60000}.${CLICK}` : null,
    fbp: consent ? `fb.1.${NOW - 90000}.123456789` : null,
    measurement_consent: consent, consent_version: 'VPT_ADS_V1' },
  options: { apiKeyId: KEY, apiKeyName: WEBSITE_API_KEY_NAME, companyId: COMPANY, attribution: source, nowMs: NOW } };
}

test('legacy intake remains unchanged; actual website evidence binds only the dedicated server API key', () => {
  assert.equal(parse(undefined), null);
  assert.deepEqual(tracking.externalLeadTracking({}), { is_test: false });
  const f = fixture(), original = clone(f.input), source = clone(f.options.attribution);
  const result = parse(f.input, { ...f.options, apiKeyId: KEY.toUpperCase() });
  assert.equal(result.api_key_fingerprint, KEY_FINGERPRINT); assert.equal(result.request_id, U(1));
  assert.equal(result.api_key_id, undefined); assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.deepEqual(f.input, original); assert.deepEqual(f.options.attribution, source);
  assert.equal(result.fbc, original.fbc); assert.equal(result.captured_at, original.captured_at);
  const received = tracking.externalLeadTracking({ is_test: false,
    attribution: source, website_intake: original }, f.options);
  assert.deepEqual(received.intake_attribution, source); assert.deepEqual(received.website_intake, result);
});

test('shape/form/site/company/version/request ID and caller-supplied API identity fail closed', () => {
  const f = fixture();
  for (const key of Object.keys(f.input)) {
    const incomplete = clone(f.input); delete incomplete[key]; assert.throws(() => parse(incomplete, f.options), key);
  }
  for (const patch of [{ version: '1' }, { version: 2 }, { request_id: U(1).replace('-4000-', '-1000-') },
    { request_id: 'invalid' }, { form_id: '1438656288329447' }, { site_host: 'www.vanphuthanh.net' },
    { site_host: 'evil.test' }, { consent_version: 'legacy' }, { api_key_id: KEY },
    { api_key_fingerprint: KEY_FINGERPRINT },
    { company_id: COMPANY }, { phone: 'private' }, { raw: 'private' }])
    assert.throws(() => parse({ ...f.input, ...patch }, f.options));
  for (const value of [null, [], 'metadata', true, 1]) assert.throws(() => parse(value, f.options));
  for (const patch of [{ companyId: U(9) }, { companyId: null }, { apiKeyId: null },
    { apiKeyId: 'secret-is-not-an-id' }, { apiKeyName: null }, { apiKeyName: 'dashboard' },
    { apiKeyName: WEBSITE_API_KEY_NAME.toLowerCase() }])
    assert.throws(() => parse(f.input, { ...f.options, ...patch }));
  assert.throws(() => tracking.externalLeadTracking({ website_intake: f.input }, f.options));
});

test('clean website URL is strictly string, owned and identical to the normalized source projection', () => {
  const f = fixture();
  for (const landing_url of [['https://vanphuthanh.net/tu-bep/'], null, 1,
    'http://vanphuthanh.net/tu-bep/', 'https://evil.test/tu-bep/', 'https://vanphuthanh.net.evil.test/',
    'https://username:password@vanphuthanh.net/tu-bep/', 'https://vanphuthanh.net:8443/tu-bep/',
    'https://vanphuthanh.net/tu-bep/?phone=private', 'https://vanphuthanh.net/tu-bep/#private',
    'https://vanphuthanh.net/' + 'a'.repeat(1000)])
    assert.throws(() => parse({ ...f.input, landing_url }, f.options));
  assert.throws(() => parse(f.input, { ...f.options, attribution: { ...f.options.attribution, landing_url: 'https://vanphuthanh.net/other/' } }));
  const received = parse({ ...f.input, landing_url: 'https://www.vanphuthanh.net/tu-bep/' }, f.options);
  assert.equal(received.landing_url, f.input.landing_url);
});

test('timestamps require real calendar values, actual bounds and capture before submit; offsets normalize exactly', () => {
  const f = fixture();
  for (const submitted_at of [null, 123, [], 'yesterday', iso(NOW + 1), iso(NOW - 30 * DAY - 1)])
    assert.throws(() => parse({ ...f.input, submitted_at }, f.options));
  for (const invalid of ['2026-09-31T12:00:00Z', '2026-02-29T12:00:00Z',
    '2026-10-13T24:01:00Z', '2026-10-13T12:60:00Z', '2026-10-13T12:00:60Z']) {
    assert.throws(() => parse({ ...f.input, fbc: null, fbp: null, captured_at: null, submitted_at: invalid },
      { ...f.options, nowMs: Date.parse('2026-10-14T00:00:00Z') }), invalid);
  }
  assert.throws(() => parse({ ...f.input, captured_at: f.input.submitted_at }, f.options), 'FBC timestamp must match original capture');
  assert.throws(() => parse({ ...f.input, captured_at: iso(NOW) }, f.options));
  const leap = parse({ ...f.input, submitted_at: '2024-02-29T12:30:00+07:00',
    fbc: null, fbp: null, captured_at: null }, { ...f.options, nowMs: Date.parse('2024-03-01T00:00:00Z') });
  assert.equal(leap.submitted_at, '2024-02-29T05:30:00.000Z');
  const cutoff = parse({ ...f.input, submitted_at: iso(NOW - 30 * DAY), fbc: null, fbp: null, captured_at: null }, f.options);
  assert.equal(cutoff.submitted_at, iso(NOW - 30 * DAY));
});

test('measurement choice must be boolean/current; denied measurement cannot retain FBC/FBP/capture', () => {
  const f = fixture({ consent: false });
  const result = parse(f.input, f.options); assert.equal(result.measurement_consent, false);
  for (const key of ['fbc', 'fbp', 'captured_at']) assert.equal(result[key], null);
  for (const measurement_consent of [null, 1, 0, 'true', 'false', [], {}])
    assert.throws(() => parse({ ...f.input, measurement_consent }, f.options));
  for (const key of ['fbc', 'fbp', 'captured_at']) {
    const yes = fixture(); assert.throws(() => parse({ ...f.input, [key]: yes.input[key] }, f.options));
  }
  const missingMatch = parse({ ...f.input, measurement_consent: true }, f.options);
  assert.equal(missingMatch.fbc, null, 'Consent alone must not fabricate matching evidence');
});

test('FBC suffix and original milliseconds agree exactly; optional FBP has bounded genuine format and time', () => {
  const f = fixture();
  for (const patch of [{ fbc: 'fb.3.1234567890123.bad' }, { fbc: f.input.fbc + ' ' },
    { fbc: `fb.1.${NOW - 60000}.differentClick` }, { fbc: `fb.1.${NOW - 30000}.${CLICK}` },
    { fbc: null }, { captured_at: null }, { fbp: 'invented' }, { fbp: `fb.1.${NOW}.123456789` }])
    assert.throws(() => parse({ ...f.input, ...patch }, f.options));
  assert.equal(parse({ ...f.input, fbp: null }, f.options).fbp, null);
  for (const size of [1, 300, 500]) {
    const click = 'A'.repeat(size), input = { ...f.input, fbc: `fb.1.${NOW - 60000}.${click}` };
    assert.equal(parse(input, { ...f.options, attribution: { ...f.options.attribution, fbclid: click } }).fbc, input.fbc);
  }
  assert.throws(() => parse({ ...f.input, fbc: `fb.1.${NOW - 60000}.${'A'.repeat(501)}` },
    { ...f.options, attribution: { ...f.options.attribution, fbclid: 'A'.repeat(501) } }));
});

function handlerHarness({ companyId = COMPANY, apiKeyId = KEY, apiKeyName = WEBSITE_API_KEY_NAME } = {}) {
  const routes = new Map(), writes = [], router = {};
  for (const method of ['use', 'get', 'post', 'put', 'delete', 'patch']) router[method] = (url, ...fns) => routes.set(`${method}:${url}`, fns);
  const db = { from(table) {
    let payload, inserting = false;
    const q = {};
    for (const op of ['select', 'eq', 'ilike', 'order', 'limit']) q[op] = () => q;
    q.insert = row => { payload = row; inserting = true; writes.push({ table, row }); return q; };
    q.update = row => { writes.push({ table, row }); return q; };
    const result = () => {
      let data = null;
      if (table === 'company_regions') data = { id: U(10), company_id: companyId, is_active: true };
      if (table === 'crm_pipelines') data = { id: U(11), company_id: companyId };
      if (table === 'crm_pipeline_stages') data = { id: U(12) };
      if (table === 'customers' && inserting) data = { id: U(13) };
      if (table === 'crm_sources') data = inserting ? { id: U(14) } : [];
      if (table === 'crm_leads') data = { id: U(15), ...payload, created_at: iso(NOW) };
      return { data, error: null };
    };
    q.single = q.maybeSingle = async () => result();
    q.then = (yes, no) => Promise.resolve(result()).then(yes, no); return q;
  } };
  const dependencies = { express: { Router: () => router }, '../config/supabase': { supabase: db },
    '../middleware/apiKeyAuth': { apiKeyAuth() {} }, '../domain/externalLeadTracking': tracking,
    '../helpers/crmNextCode': { nextCrmCode: async () => 'LEAD-SYNTHETIC' },
    '../helpers/tenantQuotas': { enforceQuotaForRequest: async () => false, resolveTenantIdForQuota: async () => null },
    '../helpers/tenantScope': {}, '../helpers/autoGenCrmTasks': {},
    https: {}, http: {}, '../helpers/apiKeyTokens': {}, '../helpers/projectDeadlineExport': {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/external.js'), 'utf8'), {
    module: { exports: {} }, process: { env: {} }, console: { warn() {}, error() {} },
    require(id) { if (!(id in dependencies)) throw Error(`Unexpected import ${id}`); return dependencies[id]; },
  });
  return { writes, async send(body) {
    const req = { body: { title: 'Synthetic', phone: 'synthetic-phone', source_name: 'Website VPT V1', ...body },
      apiKey: { id: apiKeyId, company_id: companyId, name: apiKeyName }, headers: {}, protocol: 'https', get: () => 'example.test' };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await routes.get('post:/leads').at(-1)(req, res); return res;
  } };
}

test('actual external handler writes immutable receipt and source with authoritative key company, even for denied measurement', async () => {
  for (const consent of [true, false]) {
    const h = handlerHarness(), f = fixture({ consent });
    const response = await h.send({ company_id: U(9), website_intake: f.input,
      attribution: f.options.attribution, is_test: false, description: 'Synthetic unchanged notes' });
    assert.equal(response.statusCode, 201);
    const rows = h.writes.filter(row => row.table === 'crm_leads'); assert.equal(rows.length, 1);
    const lead = rows[0].row; assert.equal(lead.company_id, COMPANY);
    assert.equal(lead.website_intake.api_key_fingerprint, KEY_FINGERPRINT);
    assert.equal(lead.website_intake.api_key_id, undefined);
    assert.equal(JSON.stringify(lead.website_intake).includes(KEY), false);
    assert.equal(lead.website_intake.measurement_consent, consent);
    assert.deepEqual(lead.intake_attribution, f.options.attribution);
    assert.equal(lead.description, 'Synthetic unchanged notes');
  }
});

test('wrong key/company and invalid website contracts are rejected before any customer/source/lead write', async () => {
  const f = fixture();
  for (const options of [{ companyId: U(9) }, { apiKeyId: 'invalid' },
    { apiKeyName: 'dashboard', apiKeyId: U(2) }, { apiKeyName: null }]) {
    const h = handlerHarness(options);
    assert.equal((await h.send({ website_intake: f.input, attribution: f.options.attribution })).statusCode, 400);
    assert.equal(h.writes.length, 0);
  }
  for (const patch of [{ measurement_consent: 'true' }, { api_key_id: KEY },
    { api_key_fingerprint: KEY_FINGERPRINT },
    { request_id: 'invalid' }, { fbc: 'different' }]) {
    const h = handlerHarness();
    assert.equal((await h.send({ website_intake: { ...f.input, ...patch }, attribution: f.options.attribution })).statusCode, 400);
    assert.equal(h.writes.length, 0);
  }
  const h = handlerHarness(); assert.equal((await h.send({})).statusCode, 201);
  assert.equal(h.writes.find(row => row.table === 'crm_leads').row.website_intake, undefined);
});

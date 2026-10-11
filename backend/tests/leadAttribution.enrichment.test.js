'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(initial, fail = false, alwaysMiss = false) {
  let updateCount = 0;
  const row = { id: 'attribution', lead_id: 'lead', company_id: 'company', ...initial };
  const db = { from() {
    let patch; const predicates = [];
    const q = {
      select() { return q; }, limit() { return q; },
      eq(k, v) { predicates.push(r => r[k] === v); return q; },
      is(k, v) { assert.equal(v, null); predicates.push(r => r[k] == null); return q; },
      update(value) { patch = value; return q; },
      async maybeSingle() {
        if (!patch) return { data: { ...row }, error: null };
        updateCount++;
        if (alwaysMiss) return { data: null, error: null };
        if (fail) return { data: null, error: { message: 'private failure' } };
        if (!predicates.every(p => p(row))) return { data: null, error: null };
        Object.assign(row, patch);
        return { data: { id: row.id }, error: null };
      },
    }; return q;
  } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/helpers/leadAttribution.js'), 'utf8'), {
    module, console: { warn() {} }, require(id) {
      if (id === '../config/supabase') return { supabase: db };
      if (id === './parseLandingUrl') return require('../src/helpers/parseLandingUrl');
      throw Error(id);
    },
  });
  return { row, write: module.exports.ghiQuyKet, updates: () => updateCount };
}

test('ad already present does not block missing campaign; preserves original UTM/raw/time and identity', async () => {
  const h = harness({ fb_ad_id: 'first-ad', utm_source: 'first-source', raw: { retained: true }, cham_dau_luc: 'original' });
  const input = { lead_id: 'lead', company_id: 'company', fb_ad_id: 'first-ad', fb_campaign_id: 'campaign',
    utm_source: 'later-source', raw: { retained: false }, cham_dau_luc: 'later' };
  assert.equal((await h.write(input)).ok, true);
  assert.equal(h.row.fb_campaign_id, 'campaign');
  assert.equal(h.row.fb_ad_id, 'first-ad');
  assert.equal(h.row.utm_source, 'first-source');
  assert.equal(h.row.cham_dau_luc, 'original');
  assert.deepEqual(h.row.raw, { retained: true });
  await h.write(input);
  assert.equal(h.row.fb_campaign_id, 'campaign');
});
test('concurrent enrichment is one atomic first-writer-wins patch', async () => {
  const h = harness({});
  await Promise.all(['first', 'second'].map(fb_campaign_id => h.write({ lead_id: 'lead', company_id: 'company', fb_campaign_id })));
  assert.equal(h.row.fb_campaign_id, 'first');
});
test('company mismatch cannot mutate attribution and errors are not reported as success', async () => {
  const h = harness({});
  await h.write({ lead_id: 'lead', company_id: 'foreign', fb_campaign_id: 'campaign' });
  assert.equal(h.row.fb_campaign_id, undefined);
  assert.equal((await harness({}, true).write({ lead_id: 'lead', fb_campaign_id: 'campaign' })).ok, false);
});

test('a different ad cannot donate a campaign to the first-touch ad', async () => {
  const h = harness({ fb_ad_id: 'first' });
  assert.equal((await h.write({ lead_id: 'lead', company_id: 'company', fb_ad_id: 'later', fb_campaign_id: 'unrelated' })).ok, false);
  assert.equal(h.row.fb_campaign_id, undefined);
});

test('concurrent different ads cannot mix campaign into the winning ad', async () => {
  const h = harness({});
  await Promise.all(['first', 'second'].map(id => h.write({ lead_id: 'lead', company_id: 'company',
    fb_campaign_id: `${id}-campaign`, fb_ad_id: id })));
  assert.equal(h.row.fb_ad_id, 'first');
  assert.equal(h.row.fb_campaign_id, 'first-campaign');
});

for (const click of ['gclid', 'fbclid', 'gbraid', 'wbraid']) {
  test(`different ${click} rejects the entire later touch, without borrowing campaign or keyword`, async () => {
    const h = harness({ platform: 'google', [click]: 'first-click', utm_campaign: null,
      utm_term: null, landing_url: 'https://example.test/first' });
    const result = await h.write({ lead_id: 'lead', company_id: 'company', platform: 'google',
      [click]: 'second-click', utm_campaign: 'second-campaign', utm_term: 'second-keyword',
      landing_url: 'https://example.test/second' });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, 'khac_lan_cham');
    assert.equal(h.row[click], 'first-click');
    assert.equal(h.row.utm_campaign, null);
    assert.equal(h.row.utm_term, null);
    assert.equal(h.row.landing_url, 'https://example.test/first');
  });
}

for (const campaign of ['fb_campaign_id', 'campaign_id']) {
  test(`concurrent ${campaign}-only requests cannot mix the losing campaign name`, async () => {
    const h = harness({});
    const results = await Promise.all([
      h.write({ lead_id: 'lead', company_id: 'company', [campaign]: 'campaign-A' }),
      h.write({ lead_id: 'lead', company_id: 'company', [campaign]: 'campaign-B', fb_campaign_name: 'Campaign B' }),
    ]);
    assert.deepEqual(results.map(r => r.ok), [true, false]);
    assert.equal(results[1].skipped, 'khac_lan_cham');
    assert.equal(h.row[campaign], 'campaign-A');
    assert.equal(h.row.fb_campaign_name, undefined);
  });
}

test('repeated zero-row compare-and-set failures are bounded and never reported as success', async () => {
  const h = harness({}, false, true);
  const result = await h.write({ lead_id: 'lead', company_id: 'company', fb_campaign_id: 'campaign' });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, 'xung_dot_dong_thoi');
  assert.equal(h.updates(), 3);
  assert.equal(h.row.fb_campaign_id, undefined);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(initial, fail = false) {
  const row = { id: 'attribution', lead_id: 'lead', company_id: 'company', ...initial };
  const db = { from() {
    let patch; const predicates = [];
    const q = {
      select() { return q; }, limit() { return q; },
      eq(k, v) { predicates.push(r => r[k] === v); return q; },
      is(k, v) { assert.equal(v, null); predicates.push(r => r[k] == null); return q; },
      update(value) { patch = value; return q; },
      async maybeSingle() { return { data: { ...row }, error: null }; },
      then(resolve) {
        if (!fail && predicates.every(p => p(row))) Object.assign(row, patch);
        return Promise.resolve({ error: fail ? { message: 'private failure' } : null }).then(resolve);
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
  return { row, write: module.exports.ghiQuyKet };
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
test('concurrent enrichment is first-writer-wins per field', async () => {
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

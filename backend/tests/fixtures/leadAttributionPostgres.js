'use strict';
// Run the actual helper against independent psql sessions, never a production client.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const leadId = '00000000-0000-4000-8000-000000000714';
const literal = value => value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
const column = name => { assert.match(name, /^[a-z_]+$/); return `"${name}"`; };

function loadHelper(runSql, barrierSize = 0) {
  let reads = 0, updates = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  if (!barrierSize) release();
  const db = { from(table) {
    assert.equal(table, 'lead_attribution');
    let patch, fields = '*'; const where = [];
    const q = {
      select(value) { fields = value.split(',').map(column).join(','); return q; },
      limit(value) { assert.equal(value, 1); return q; },
      eq(key, value) { where.push(`${column(key)}=${literal(value)}`); return q; },
      is(key, value) { assert.equal(value, null); where.push(`${column(key)} IS NULL`); return q; },
      update(value) { patch = value; return q; },
      async maybeSingle() {
        let statement;
        if (patch) {
          updates++;
          const set = Object.entries(patch).map(([key, value]) => `${column(key)}=${literal(value)}`).join(',');
          statement = `WITH changed AS (UPDATE public.lead_attribution SET ${set} WHERE ${where.join(' AND ')} RETURNING ${fields}) SELECT row_to_json(changed) FROM changed;`;
        } else {
          statement = `SELECT row_to_json(found) FROM (SELECT ${fields} FROM public.lead_attribution WHERE ${where.join(' AND ')} LIMIT 1) found;`;
        }
        try {
          const output = await runSql(`SET ROLE service_role; ${statement}`);
          const data = output.trim() ? JSON.parse(output.trim()) : null;
          if (!patch && barrierSize && ++reads <= barrierSize) {
            if (reads === barrierSize) release();
            await barrier; // Both initial snapshots must exist before either UPDATE.
          }
          return { data, error: null };
        } catch (error) { return { data: null, error }; }
      },
    };
    return q;
  } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/helpers/leadAttribution.js'), 'utf8'), {
    module, console: { warn() {} }, require(id) {
      if (id === '../config/supabase') return { supabase: db };
      if (id === './parseLandingUrl') return require('../../src/helpers/parseLandingUrl');
      throw Error(`Unexpected dependency: ${id}`);
    },
  });
  return { write: module.exports.ghiQuyKet, updates: () => updates };
}

async function runEnrichmentRaceChecks(t, { sql, runSql, company }) {
  sql(`INSERT INTO public.crm_leads(id,code,company_id) VALUES('${leadId}','SYNTHETIC-RACE','${company}');`);
  const reset = (extra = {}) => {
    sql(`DELETE FROM public.lead_attribution WHERE lead_id='${leadId}';`);
    const row = { lead_id: leadId, company_id: company, kenh: 'website', platform: 'google',
      raw: '{"original":true}', cham_dau_luc: '2020-01-01T00:00:00Z', ...extra };
    sql(`INSERT INTO public.lead_attribution(${Object.keys(row).map(column).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`);
  };
  const current = async () => JSON.parse((await runSql(`SELECT row_to_json(a) FROM public.lead_attribution a WHERE lead_id='${leadId}';`)).trim());
  const base = { lead_id: leadId, company_id: company, platform: 'google' };
  for (const click of ['gclid', 'fbclid', 'gbraid', 'wbraid']) {
    await t.test(`PostgreSQL rejects conflicting ${click} without partial UTM writes`, async () => {
      reset({ [click]: 'first-click', landing_url: 'https://example.test/first' });
      const before = await current();
      const helper = loadHelper(runSql);
      const result = await helper.write({ ...base, [click]: 'second-click', utm_campaign: 'second-campaign',
        utm_term: 'second-keyword', landing_url: 'https://example.test/second' });
      assert.equal(result.ok, false); assert.equal(result.skipped, 'khac_lan_cham');
      assert.equal(helper.updates(), 0);
      assert.deepEqual(await current(), before);
    });
  }
  for (const identity of ['fb_campaign_id', 'campaign_id', 'gclid']) {
    await t.test(`PostgreSQL concurrent ${identity}-only writes keep one coherent touch`, async () => {
      reset();
      const helper = loadHelper(runSql, 2);
      const results = await Promise.all(['A', 'B'].map(value => helper.write({ ...base,
        [identity]: value, ...(value === 'B' ? { fb_campaign_name: 'Campaign B', utm_term: 'keyword-B' } : {}) })));
      assert.equal(results.filter(r => r.ok).length, 1);
      assert.equal(results.find(r => !r.ok).skipped, 'khac_lan_cham');
      assert.equal(helper.updates(), 2); // Losing UPDATE really executed, affected zero rows.
      const after = await current();
      assert.ok(['A', 'B'].includes(after[identity]));
      assert.equal(after.fb_campaign_name, after[identity] === 'B' ? 'Campaign B' : null);
      assert.equal(after.utm_term, after[identity] === 'B' ? 'keyword-B' : null);
      assert.deepEqual(after.raw, { original: true });
      assert.equal(Date.parse(after.cham_dau_luc), Date.parse('2020-01-01T00:00:00Z'));
    });
  }
  await t.test('PostgreSQL same-touch concurrent enrichment retries safely and stays idempotent', async () => {
    reset({ gclid: 'same-click' });
    const helper = loadHelper(runSql, 2);
    const inputs = [{ ...base, gclid: 'same-click', utm_campaign: 'same-campaign' },
      { ...base, gclid: 'same-click', utm_term: 'same-keyword' }];
    assert.ok((await Promise.all(inputs.map(helper.write))).every(r => r.ok));
    const after = await current();
    assert.equal(after.utm_campaign, 'same-campaign'); assert.equal(after.utm_term, 'same-keyword');
    assert.equal(helper.updates(), 3); // One stale snapshot retried as a whole patch.
    await helper.write(inputs[0]); await helper.write(inputs[1]);
    assert.deepEqual(await current(), after);
  });
}

module.exports = { runEnrichmentRaceChecks };

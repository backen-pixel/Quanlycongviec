'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function harness(isTest = false, company = 'allowed') {
  const routes = new Map();
  const tables = { crm_leads: [{ id: 'lead', company_id: company, is_test: isTest, source_id: 'source',
    created_at: 'received', assigned_at: 'assigned', first_touch_time: null, actual_close_date: null, type: 'lead' }],
    lead_attribution: [{ lead_id: 'lead', campaign_id: '23976669573', platform: 'google', kenh: 'website', gbraid: 'synthetic', cham_dau_luc: 'received' }] };
  const db = { from(table) {
    // Match Supabase: filters are available only after select().
    return { select() {
      let rows = tables[table] || [];
      const q = { eq(k,v) { rows = rows.filter(r => r[k] === v); return q; },
        in(k,v) { rows = rows.filter(r => v.includes(r[k])); return q; },
        async maybeSingle() { return { data: rows[0] || null }; } }; return q;
    } };
  } };
  const imports = { express: { Router: () => ({ use() {}, get(url, fn) { routes.set(url, fn); } }) },
    crypto: require('node:crypto'), '../config/supabase': { supabase: db }, '../middleware/partnerAuth': {},
    '../helpers/partnerScope': { locTheoCongTy: (q, scope, col) => q.in(col, scope.company_ids) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/partner.js'), 'utf8'), {
    module: { exports: {} }, require: id => imports[id], Buffer,
  });
  return async () => {
    const res = { statusCode: 200, locals: {}, status(n) { this.statusCode = n; return this; }, type() { return this; }, json(x) { this.body=x; return this; } };
    await routes.get('/leads/:id')({ params: { id: 'lead' }, partner: { pii_level: 'hashed', scope: { company_ids: ['allowed'] } } }, res);
    return res;
  };
}
test('partner exposes generic campaign and distinct receipt/assignment/contact/outcome milestones', async () => {
  const r = await harness()(); assert.equal(r.statusCode, 200);
  assert.equal(r.body.attribution.campaign_id, '23976669573');
  assert.equal(r.body.attribution.gbraid, 'synthetic');
  assert.equal(r.body.source_id, 'source');
  assert.deepEqual(JSON.parse(JSON.stringify(r.body.milestones)), {
    received_at: 'received', assigned_at: 'assigned', contacted_at: null, closed_on: null,
  });
});
test('partner hides marked tests and company outside the key scope', async () => {
  assert.equal((await harness(true)()).statusCode, 404);
  assert.equal((await harness(false, 'foreign')()).statusCode, 404);
});

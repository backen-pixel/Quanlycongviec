'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { buildWebConversions, channelOf } = require('../src/modules/marketingAutomation/webConversions');
const { createWebConversionsRouter } = require('../src/routes/webConversions');

const A = '991dc79d-cbf5-49f9-a364-35227cb47635', B = '11111111-1111-4111-8111-111111111111';

function fakeDb(tables, { fail } = {}) {
  const writes = [];
  return { writes, from(name) {
    let rows = [...(tables[name] || [])], start = 0, end = Infinity;
    const q = {
      select() { return q; },
      eq(k, v) { rows = rows.filter(r => r[k] === v); return q; },
      not(k) { rows = rows.filter(r => r[k] != null); return q; },
      in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return q; },
      or(expr) { // stageMilestone: slug list or deal pipeline
        const slugs = expr.match(/in\.\(([^)]*)\)/)[1].split(',');
        rows = rows.filter(r => slugs.includes(r.to_canonical_slug) || r.pipeline_type === 'deal'); return q; },
      gte(k, v) { rows = rows.filter(r => (k === 'ngay' ? r[k] >= v : Date.parse(r[k]) >= Date.parse(v))); return q; },
      lte(k, v) { rows = rows.filter(r => r[k] <= v); return q; },
      lt(k, v) { rows = rows.filter(r => Date.parse(r[k]) < Date.parse(v)); return q; },
      order() { return q; },
      range(a, b) { start = a; end = b + 1; return q; },
      async upsert(data, opts) { writes.push(['upsert', name, data, opts]); return { error: fail === name ? Error('x') : null }; },
      async insert(data) { writes.push(['insert', name, data]); return { error: fail === name ? Error('x') : null }; },
      then(resolve) { return Promise.resolve({ data: rows.slice(start, end), error: fail === name ? Error('private') : null }).then(resolve); },
    };
    return q;
  } };
}

const T = '2026-10-12T03:00:00Z';
const tables = {
  lead_attribution: [
    { id: 'a1', lead_id: 'L1', company_id: A, kenh: 'website', platform: 'google', utm_medium: 'cpc', gclid: 'g', cham_dau_luc: T },
    { id: 'a2', lead_id: 'L2', company_id: A, kenh: 'website', platform: 'facebook', ad_id: '900', fb_ad_id: '900', cham_dau_luc: T },
    { id: 'a3', lead_id: 'L3', company_id: A, kenh: 'website', platform: 'google', utm_medium: 'organic', cham_dau_luc: T },
    { id: 'a4', lead_id: 'L4', company_id: A, kenh: 'website', platform: 'direct', cham_dau_luc: T },
    { id: 'a5', lead_id: 'L5', company_id: A, kenh: 'website', platform: 'google', utm_medium: 'cpc', cham_dau_luc: T },
    { id: 'a6', lead_id: 'L6', company_id: A, kenh: 'lead_ads', platform: 'facebook', cham_dau_luc: T },
    { id: 'a7', lead_id: 'L7', company_id: B, kenh: 'website', platform: 'google', utm_medium: 'cpc', cham_dau_luc: T },
    { id: 'a8', lead_id: 'L8', company_id: A, kenh: 'website', platform: 'google', utm_medium: 'cpc', cham_dau_luc: '2026-10-01T03:00:00Z' },
  ],
  crm_leads: [{ id: 'L1', company_id: A, is_test: false }, { id: 'L2', company_id: A, is_test: false },
    { id: 'L3', company_id: A, is_test: false }, { id: 'L4', company_id: A, is_test: false },
    { id: 'L5', company_id: A, is_test: true }, { id: 'L7', company_id: B, is_test: false }],
  crm_lead_stage_history: [
    { lead_id: 'L1', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at: '2026-10-12T05:00:00Z' },
    { lead_id: 'L2', pipeline_type: 'lead', to_canonical_slug: 'lead_new', changed_by: 'u', entered_at: '2026-10-12T05:00:00Z' }],
  crm_pipeline_stages: [],
  web_conversion_events: [
    { id: 'e1', company_id: A, kind: 'call', platform: 'google', utm_medium: 'cpc', gclid: 'g', occurred_at: T },
    { id: 'e2', company_id: A, kind: 'zalo', platform: 'facebook', ad_id: '901', occurred_at: T },
    { id: 'e3', company_id: A, kind: 'messenger', platform: 'direct', occurred_at: T },
    { id: 'e4', company_id: B, kind: 'call', platform: 'google', gclid: 'g', occurred_at: T }],
  fb_ad_spend_daily: [{ ad_id: '900', ngay: '2026-10-12', chi_tieu: '300000', tien_te: 'VND' },
    { ad_id: '901', ngay: '2026-10-12', chi_tieu: 200001, tien_te: 'VND' },
    { ad_id: '999', ngay: '2026-10-12', chi_tieu: 5000000, tien_te: 'VND' },
    { ad_id: '900', ngay: '2026-09-30', chi_tieu: 7000000, tien_te: 'VND' }],
  ad_spend_daily_manual: [{ id: 'm1', company_id: A, provider: 'GOOGLE', ngay: '2026-10-12', chi_tieu_vnd: 1000000 },
    { id: 'm2', company_id: A, provider: 'TIKTOK', ngay: '2026-10-12', chi_tieu_vnd: 9 },
    { id: 'm3', company_id: B, provider: 'GOOGLE', ngay: '2026-10-12', chi_tieu_vnd: 777 }],
};

test('channel rules', () => {
  assert.equal(channelOf({ platform: 'direct', gclid: 'x' }), 'google_ads');
  assert.equal(channelOf({ platform: 'google', utm_medium: 'organic' }), 'seo');
  assert.equal(channelOf({ platform: 'instagram' }), 'facebook');
  assert.equal(channelOf({ platform: 'chatgpt', utm_medium: 'paid' }), 'chatgpt_ads');
  assert.equal(channelOf({ platform: 'chatgpt', utm_medium: 'organic' }), 'other');
});

test('report counts website leads, valid leads, clicks and spend by channel, scoped and without tests', async () => {
  const r = await buildWebConversions({ db: fakeDb(tables), companyId: A, from: '2026-10-06', to: '2026-10-12' });
  const by = Object.fromEntries(r.channels.map(c => [c.key, c]));
  assert.deepEqual([by.google_ads.form_leads, by.google_ads.valid_leads, by.google_ads.calls], [1, 1, 1]);
  assert.equal(by.google_ads.spend_vnd, 1000000);
  assert.equal(by.google_ads.cost_per_conversion_vnd, 500000);
  assert.equal(by.google_ads.cost_per_valid_vnd, 1000000);
  assert.deepEqual([by.facebook.form_leads, by.facebook.valid_leads, by.facebook.zalo], [1, 0, 1]);
  assert.equal(by.facebook.spend_vnd, 500001);
  assert.equal(by.facebook.cost_per_conversion_vnd, 250001);
  assert.equal(by.facebook.cost_per_valid_vnd, null);
  assert.deepEqual([by.seo.form_leads, by.seo.spend_vnd, by.seo.cost_per_conversion_vnd], [1, 0, null]);
  assert.deepEqual([by.other.form_leads, by.other.messenger], [1, 1]);
  assert.equal(by.chatgpt_ads.spend_vnd, null);
  assert.equal(r.totals.conversions, 7);
  assert.equal(r.totals.spend_vnd, 1500001);
});

test('invalid range and DB errors propagate', async () => {
  await assert.rejects(buildWebConversions({ db: fakeDb(tables), companyId: A, from: '2026-10-12', to: '2026-10-01' }), /INVALID_RANGE/);
  await assert.rejects(buildWebConversions({ db: fakeDb(tables, { fail: 'web_conversion_events' }), companyId: A, from: '2026-10-06', to: '2026-10-12' }));
});

async function call(db, user, method, path, body) {
  const app = express(); app.use(express.json());
  app.use('/m', createWebConversionsRouter({ db, primary: () => 'primary', withPrimary: fn => fn(),
    authMiddleware: (req, _res, next) => { req.user = user; next(); } }));
  const server = app.listen(0);
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ port: server.address().port, path: `/m${path}`, method,
        headers: { 'Content-Type': 'application/json' } }, res => {
        let text = ''; res.on('data', c => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
      });
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  } finally { server.close(); }
}

test('route: admin only, company scoped, range limits', async () => {
  const db = fakeDb(tables);
  const q = '/summary?from=2026-10-06&to=2026-10-12';
  assert.equal((await call(db, { role: 'sales_admin', company_id: A }, 'GET', q)).status, 403);
  assert.equal((await call(db, { role: 'admin', company_id: A }, 'GET', `${q}&company_id=${B}`)).status, 403);
  assert.equal((await call(db, { role: 'admin' }, 'GET', q)).status, 400);
  assert.equal((await call(db, { role: 'admin' }, 'GET', `${q}&company_id=${A}`)).status, 200);
  const own = await call(db, { role: 'admin', company_id: A }, 'GET', q);
  assert.equal(own.status, 200); assert.equal(own.body.totals.conversions, 7);
  assert.equal((await call(db, { role: 'admin', company_id: A }, 'GET', '/summary?from=2026-01-01&to=2026-10-12')).status, 400);
  assert.equal((await call(db, { role: 'admin', company_id: A }, 'GET', '/summary?from=2026-02-30&to=2026-03-01')).status, 400);
  const failed = await call(fakeDb(tables, { fail: 'lead_attribution' }), { role: 'admin', company_id: A }, 'GET', q);
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed.body), /private/);
});

test('route: spend upsert validates rows and logs every write', async () => {
  const user = { role: 'admin', company_id: A, userId: 'u1' };
  const row = { provider: 'google', campaign_key: '23976669573', campaign_name: 'Tủ bếp HCM', ngay: '2026-10-12', chi_tieu_vnd: 450000 };
  const db = fakeDb(tables);
  const ok = await call(db, user, 'PUT', '/spend', { nguon: 'csv', rows: [row] });
  assert.equal(ok.status, 200); assert.equal(ok.body.saved, 1);
  const [upsert, log] = db.writes;
  assert.equal(upsert[1], 'ad_spend_daily_manual');
  assert.deepEqual(upsert[3], { onConflict: 'company_id,provider,campaign_key,ngay' });
  assert.equal(upsert[2][0].provider, 'GOOGLE'); assert.equal(upsert[2][0].company_id, A); assert.equal(upsert[2][0].nguon, 'csv');
  assert.equal(log[1], 'ad_spend_daily_manual_log'); assert.equal(log[2][0].entered_by, 'u1');
  for (const bad of [[], [{ ...row, provider: 'META' }], [{ ...row, chi_tieu_vnd: -1 }], [{ ...row, chi_tieu_vnd: 1.5 }],
    [{ ...row, ngay: '2026-13-01' }], [row, row]]) {
    assert.equal((await call(fakeDb(tables), user, 'PUT', '/spend', { rows: bad })).status, 400);
  }
  assert.equal((await call(fakeDb(tables), { role: 'user', company_id: A }, 'PUT', '/spend', { rows: [row] })).status, 403);
  assert.equal((await call(fakeDb(tables, { fail: 'ad_spend_daily_manual_log' }), user, 'PUT', '/spend', { rows: [row] })).status, 503);
});

test('live-site QA traffic (utm_source=vpt_test) is never counted', async () => {
  const qa = { ...tables,
    lead_attribution: [...tables.lead_attribution, { id: 'q1', lead_id: 'L1', company_id: A, kenh: 'website', platform: 'vpt_test', utm_source: 'vpt_test', cham_dau_luc: '2026-10-12T02:00:00Z' }],
    web_conversion_events: [...tables.web_conversion_events,
      { id: 'q2', company_id: A, kind: 'call', platform: 'vpt_test', utm_source: 'VPT_TEST', occurred_at: T }] };
  const r = await buildWebConversions({ db: fakeDb(qa), companyId: A, from: '2026-10-06', to: '2026-10-12' });
  assert.equal(r.totals.conversions, 7);
});

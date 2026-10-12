'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const G = require('../src/modules/marketingAutomation/googleOfflineConversions');
const { createGoogleAdsExportRouter } = require('../src/routes/googleAdsExport');
const { createWebConversionsRouter } = require('../src/routes/webConversions');

const A = '991dc79d-cbf5-49f9-a364-35227cb47635', B = '11111111-1111-4111-8111-111111111111';
const cmp = (a, b) => (typeof b === 'number' ? Number(a) - b : Date.parse(a) - Date.parse(b));

function fakeDb(tables, { fail } = {}) {
  return { from(name) {
    let rows = [...(tables[name] || [])], start = 0, end = Infinity;
    const q = {
      select() { return q; },
      eq(k, v) { rows = rows.filter(r => r[k] === v); return q; },
      not(k) { rows = rows.filter(r => r[k] != null); return q; },
      in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return q; },
      or(expr) {
        const slugs = expr.match(/in\.\(([^)]*)\)/)[1].split(',');
        rows = rows.filter(r => slugs.includes(r.to_canonical_slug) || r.pipeline_type === 'deal'); return q; },
      gte(k, v) { rows = rows.filter(r => r[k] != null && cmp(r[k], v) >= 0); return q; },
      lte(k, v) { rows = rows.filter(r => r[k] != null && cmp(r[k], v) <= 0); return q; },
      lt(k, v) { rows = rows.filter(r => r[k] != null && cmp(r[k], v) < 0); return q; },
      order() { return q; },
      range(a, b) { start = a; end = b + 1; return q; },
      then(resolve) { return Promise.resolve({ data: rows.slice(start, end), error: fail === name ? Error('private') : null }).then(resolve); },
    };
    return q;
  } };
}

const at = iso => Date.parse(iso);
const GC = n => `Cj0KCQjw${n}xxxxxxxxxxxxxxxx`;
const NOW = at('2026-10-12T10:00:00Z');
const RANGE = { fromMs: NOW - 60 * 86400000, toMs: NOW };

function baseTables() {
  return {
    web_conversion_events: [
      // matched by r1 (closest before)
      { id: 'c1', company_id: A, kind: 'call', gclid: GC(1), campaign_id: '111', occurred_at: '2026-10-10T02:55:00Z' },
      { id: 'c0', company_id: A, kind: 'call', gclid: GC(0), occurred_at: '2026-10-10T02:51:00Z' },
      // too early for r1 (11 min before)
      { id: 'c2', company_id: A, kind: 'call', gclid: GC(2), occurred_at: '2026-10-10T02:49:00Z' },
      // QA and test gclid, other company, braid only, zalo
      { id: 'q1', company_id: A, kind: 'call', gclid: GC(9), utm_source: 'vpt_test', occurred_at: '2026-10-11T03:00:00Z' },
      { id: 'q2', company_id: A, kind: 'call', gclid: 'VPT_TEST_abcdefgh', occurred_at: '2026-10-11T03:00:00Z' },
      { id: 'b1', company_id: B, kind: 'call', gclid: GC(5), occurred_at: '2026-10-11T03:00:00Z' },
      { id: 'w1', company_id: A, kind: 'call', gbraid: 'braid', occurred_at: '2026-10-11T03:00:00Z' },
      { id: 'z1', company_id: A, kind: 'zalo', gclid: GC(6), occurred_at: '2026-10-11T03:00:00Z' },
      // click 30 s after r3's call
      { id: 'c3', company_id: A, kind: 'call', gclid: GC(3), occurred_at: '2026-10-09T05:00:30Z' },
    ],
    voice_recordings: [
      { id: 'r1', company_id: A, lead_id: 'L2', duration_sec: 120, direction: null, call_started_at: '2026-10-10T03:00:00Z', created_at: '2026-10-10T03:10:00Z' },
      // second recording at the same time competes for the same clicks: gets the next one (c0)
      { id: 'r2', company_id: A, lead_id: null, duration_sec: 60, direction: 'inbound', call_started_at: '2026-10-10T03:00:10Z', created_at: '2026-10-10T03:10:00Z' },
      // no call_started_at: t = created_at - duration = 05:00:00
      { id: 'r3', company_id: A, lead_id: null, duration_sec: 300, direction: null, call_started_at: null, created_at: '2026-10-09T05:05:00Z' },
      { id: 'r4', company_id: A, lead_id: null, duration_sec: 20, direction: null, call_started_at: '2026-10-11T03:00:00Z', created_at: '2026-10-11T03:01:00Z' },
      { id: 'r5', company_id: A, lead_id: null, duration_sec: 90, direction: 'outbound', call_started_at: '2026-10-11T03:00:20Z', created_at: '2026-10-11T03:05:00Z' },
      { id: 'r6', company_id: A, lead_id: null, duration_sec: 90, direction: null, call_started_at: '2026-10-08T01:00:00Z', created_at: '2026-10-08T01:05:00Z' },
    ],
    lead_attribution: [
      { id: 'a1', lead_id: 'L1', company_id: A, kenh: 'website', gclid: GC(7), campaign_id: '777', cham_dau_luc: '2026-10-05T03:00:00Z' },
      { id: 'a3', lead_id: 'L3', company_id: A, kenh: 'website', gbraid: 'gb', cham_dau_luc: '2026-10-05T03:00:00Z' },
      { id: 'a4', lead_id: 'L4', company_id: A, kenh: 'website', gclid: GC(4), cham_dau_luc: '2026-10-05T03:00:00Z' },
      { id: 'a5', lead_id: 'L5', company_id: A, kenh: 'website', gclid: 'VPT_TEST_lead00001', cham_dau_luc: '2026-10-05T03:00:00Z' },
      { id: 'a6', lead_id: 'L6', company_id: A, kenh: 'website', gclid: GC(8), utm_source: 'vpt_test', cham_dau_luc: '2026-10-05T03:00:00Z' },
      { id: 'a7', lead_id: 'L7', company_id: A, kenh: 'website', gclid: GC(10), cham_dau_luc: '2026-10-05T03:00:00Z' },
    ],
    crm_leads: [
      { id: 'L1', company_id: A, is_test: false }, { id: 'L2', company_id: A, is_test: false },
      { id: 'L3', company_id: A, is_test: false }, { id: 'L4', company_id: A, is_test: true },
      { id: 'L5', company_id: A, is_test: false }, { id: 'L6', company_id: A, is_test: false },
      { id: 'L7', company_id: A, is_test: false }],
    crm_lead_stage_history: [
      { lead_id: 'L1', pipeline_type: 'lead', to_canonical_slug: 'warm', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      { lead_id: 'L2', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at: '2026-10-10T05:00:00Z' },
      // L2 also moved before its call click — ignored (before the touch)
      { lead_id: 'L2', pipeline_type: 'lead', to_canonical_slug: 'cold', changed_by: 'u', entered_at: '2026-10-01T05:00:00Z' },
      { lead_id: 'L3', pipeline_type: 'lead', to_canonical_slug: 'cold', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      { lead_id: 'L4', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      { lead_id: 'L5', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      { lead_id: 'L6', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      // L7 only reached lead_new / was set by the system — not valid
      { lead_id: 'L7', pipeline_type: 'lead', to_canonical_slug: 'lead_new', changed_by: 'u', entered_at: '2026-10-06T04:00:00Z' },
      { lead_id: 'L7', pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: null, entered_at: '2026-10-06T04:00:00Z' }],
    crm_pipeline_stages: [],
  };
}

test('helpers: call time fallback, direction, Vietnam time format, masking', () => {
  assert.deepEqual(G.callTimeMs({ call_started_at: '2026-10-10T03:00:00Z' }), { ms: at('2026-10-10T03:00:00Z'), estimated: false });
  assert.deepEqual(G.callTimeMs({ created_at: '2026-10-10T03:05:00Z', duration_sec: 300 }), { ms: at('2026-10-10T03:00:00Z'), estimated: true });
  assert.ok(G.inboundLike(null) && G.inboundLike('INBOUND') && G.inboundLike('unknown'));
  assert.ok(!G.inboundLike('outbound') && !G.inboundLike('outgoing'));
  assert.equal(G.formatVietnamTime(at('2026-10-10T17:30:05.900Z')), '2026-10-11 00:30:05');
  assert.equal(G.maskGclid('abcdefghij123456'), '…123456');
});

test('matching: window [t-10min, t+1min], closest before, one click per recording, earliest wins', () => {
  const t = at('2026-10-10T03:00:00Z');
  const clicks = [
    { id: 'early', ms: t - 11 * 60000 }, { id: 'before5', ms: t - 5 * 60000 }, { id: 'before1', ms: t - 60000 },
    { id: 'after30', ms: t + 30000 }, { id: 'after2m', ms: t + 120000 }];
  const m = G.matchCallsToClicks([{ id: 'r2', t: t + 1000 }, { id: 'r1', t }, { id: 'r3', t: t + 2000 },
    { id: 'r4', t: t + 3000 }, { id: 'r5', t: t + 4000 }], clicks);
  assert.equal(m.get('r1').id, 'before1');
  assert.equal(m.get('r2').id, 'before5');
  assert.equal(m.get('r3').id, 'after30'); // nothing left before, closest after within 1 min
  assert.equal(m.has('r4'), false); // early is 11 min before; after2m is beyond +1 min
  assert.equal(m.size, 3);
});

test('builds CALL and VALID_LEAD rows with ordering, sources and test exclusion', async () => {
  const { rows, diagnostics: d } = await G.buildGoogleOfflineConversions({ db: fakeDb(baseTables()), companyId: A, ...RANGE });
  const calls = rows.filter(r => r.type === 'CALL');
  const byRec = Object.fromEntries(calls.map(r => [r.recording_id, r]));
  assert.deepEqual(Object.keys(byRec).sort(), ['r1', 'r2', 'r3']);
  assert.equal(byRec.r1.gclid, GC(1));
  assert.equal(byRec.r2.gclid, GC(0));
  assert.equal(byRec.r1.conversion_ms, at('2026-10-10T03:00:00Z'));
  // click after the call: conversion time = click + 1 s
  assert.equal(byRec.r3.gclid, GC(3));
  assert.equal(byRec.r3.conversion_ms, at('2026-10-09T05:00:31Z'));
  for (const r of calls) assert.ok(r.conversion_ms > r.click_ms);
  assert.equal(calls.every(r => r.conversion_name === 'VPT CRM - Cuoc goi that'), true);

  const valid = Object.fromEntries(rows.filter(r => r.type === 'VALID_LEAD').map(r => [r.lead_id, r]));
  assert.deepEqual(Object.keys(valid).sort(), ['L1', 'L2']);
  assert.equal(valid.L1.gclid, GC(7)); assert.equal(valid.L1.gclid_source, 'form');
  assert.equal(valid.L1.conversion_ms, at('2026-10-06T04:00:00Z'));
  assert.equal(valid.L2.gclid, GC(1)); assert.equal(valid.L2.gclid_source, 'call');
  assert.equal(valid.L2.conversion_ms, at('2026-10-10T05:00:00Z'));
  assert.equal(valid.L2.conversion_name, 'VPT CRM - Khach hop le');
  assert.ok(rows.every(r => !r.gclid.startsWith('VPT_TEST_')));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].conversion_ms <= rows[i].conversion_ms);

  assert.equal(d.recordings_considered, 4); // r1 r2 r3 r6 (r4 short, r5 outbound)
  assert.equal(d.recordings_skipped_outbound, 1);
  assert.equal(d.recordings_estimated_time, 1);
  assert.equal(d.recordings_matched, 3);
  assert.equal(d.recordings_without_click, 1);
  assert.equal(d.call_clicks_braid_only, 1);
  assert.equal(d.call_clicks_unmatched, 1); // c2
  assert.equal(d.valid_leads_without_gclid, 1); // L3
  assert.equal(d.valid_leads_braid_only, 1);
  assert.equal(d.valid_leads_via_form_gclid, 1);
  assert.equal(d.valid_leads_via_call_gclid, 1);
  assert.ok(d.test_excluded >= 4); // q1, q2, L5 (VPT_TEST_ gclid), L6 (vpt_test form)
});

test('valid lead whose milestone is not after the click is skipped', async () => {
  const t = baseTables();
  t.crm_lead_stage_history = [{ lead_id: 'L1', pipeline_type: 'lead', to_canonical_slug: 'warm', changed_by: 'u',
    entered_at: '2026-10-05T03:00:00Z' }];
  const { rows, diagnostics } = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
  assert.equal(rows.filter(r => r.type === 'VALID_LEAD').length, 0);
  assert.equal(diagnostics.valid_leads_milestone_before_click, 1);
});

test('CSV format: timezone line, header, Vietnam time, blank value, VND', () => {
  const csv = G.toGoogleCsv([
    { gclid: GC(1), conversion_name: G.CONVERSION_NAMES.CALL, conversion_ms: at('2026-10-10T03:00:00Z') },
    { gclid: 'bad,gclid"=cmd', conversion_name: G.CONVERSION_NAMES.CALL, conversion_ms: 0 }]);
  assert.equal(csv, 'Parameters:TimeZone=Asia/Ho_Chi_Minh\r\n' +
    'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n' +
    `${GC(1)},VPT CRM - Cuoc goi that,2026-10-10 10:00:00,,VND\r\n`);
});

async function request(app, path, headers = {}) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await new Promise((resolve, reject) => {
      http.get({ port, path, headers }, res => {
        let body = ''; res.setEncoding('utf8');
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  } finally { server.close(); }
}

const ENV = { GOOGLE_ADS_EXPORT_USER: 'google', GOOGLE_ADS_EXPORT_PASSWORD: 'a-long-test-password-123', VPT_WEB_EVENTS_COMPANY_ID: A };
const basic = (u, p) => ({ Authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });
function exportApp(env, opts = {}) {
  const app = express();
  app.use('/x', createGoogleAdsExportRouter({ db: fakeDb(baseTables(), opts), env, primary: () => 'primary',
    withPrimary: fn => fn(), now: () => NOW }));
  return app;
}

test('CSV route: 503 without env, 401 on wrong or missing creds, CSV on success', async () => {
  for (const env of [{}, { ...ENV, GOOGLE_ADS_EXPORT_PASSWORD: '' }, { ...ENV, GOOGLE_ADS_EXPORT_PASSWORD: 'short' },
    { ...ENV, VPT_WEB_EVENTS_COMPANY_ID: '' }]) {
    const r = await request(exportApp(env), '/x/google.csv', basic('google', 'a-long-test-password-123'));
    assert.equal(r.status, 503);
  }
  const missing = await request(exportApp(ENV), '/x/google.csv');
  assert.equal(missing.status, 401); assert.match(missing.headers['www-authenticate'], /^Basic/);
  assert.equal((await request(exportApp(ENV), '/x/google.csv', basic('google', 'wrong-password-wrong'))).status, 401);
  assert.equal((await request(exportApp(ENV), '/x/google.csv', basic('other', ENV.GOOGLE_ADS_EXPORT_PASSWORD))).status, 401);
  const ok = await request(exportApp(ENV), '/x/google.csv', basic('google', ENV.GOOGLE_ADS_EXPORT_PASSWORD));
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /^text\/csv/);
  assert.equal(ok.headers['cache-control'], 'no-store');
  const lines = ok.body.trim().split('\r\n');
  assert.equal(lines[0], 'Parameters:TimeZone=Asia/Ho_Chi_Minh');
  assert.equal(lines[1], G.CSV_HEADER);
  assert.equal(lines.length, 2 + 5); // 3 calls + 2 valid leads
  assert.ok(lines.slice(2).every(l => /^[A-Za-z0-9_-]+,VPT CRM - (Cuoc goi that|Khach hop le),\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,,VND$/.test(l)));
  const failed = await request(exportApp(ENV, { fail: 'voice_recordings' }), '/x/google.csv', basic('google', ENV.GOOGLE_ADS_EXPORT_PASSWORD));
  assert.equal(failed.status, 503); assert.doesNotMatch(failed.body, /private/);
});

test('admin preview masks gclid and is admin-only', async () => {
  const make = user => {
    const app = express();
    app.use('/m', createWebConversionsRouter({ db: fakeDb(baseTables()), primary: () => 'primary', withPrimary: fn => fn(),
      now: () => NOW, authMiddleware: (req, _res, next) => { req.user = user; next(); } }));
    return app;
  };
  const denied = await request(make({ role: 'sales', company_id: A }), '/m/offline-conversions?from=2026-08-14&to=2026-10-12');
  assert.equal(denied.status, 403);
  const r = await request(make({ role: 'admin', company_id: A }), '/m/offline-conversions?from=2026-08-14&to=2026-10-12');
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.deepEqual(body.counts, { calls: 3, valid_leads: 2 });
  assert.ok(body.rows.every(row => /^….{6}$/.test(row.gclid_tail) && !('gclid' in row)));
  assert.doesNotMatch(r.body, new RegExp(GC(1)));
  assert.equal(typeof body.diagnostics.recordings_without_click, 'number');
});

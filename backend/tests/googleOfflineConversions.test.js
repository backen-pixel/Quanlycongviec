'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs'), path = require('node:path');
const { Module, createRequire } = require('node:module');
const express = require('express');
const G = require('../src/modules/marketingAutomation/googleOfflineConversions');

// Compile the actual Express handlers with their unused default infrastructure
// isolated. Tests inject synthetic DB/auth/primary dependencies below; importing
// them must not load .env, start health probes or initialize a real Supabase SDK.
function loadRoute(name) {
  const filename = path.resolve(__dirname, '../src/routes/' + name + '.js');
  const loaded = new Module(filename), actualRequire = createRequire(filename);
  const unconfigured = () => { throw Error('Test infrastructure must be explicitly injected'); };
  loaded.filename = filename;
  loaded.require = dependency => {
    if (dependency === '../config/supabase') return { supabase: { from: unconfigured } };
    if (dependency === '../config/supabaseRouter') return { getActiveTarget: unconfigured, withPrimaryDatabase: unconfigured };
    if (dependency === '../middleware/auth') return { auth: (_req, res) => res.status(401).json({ error: 'Test authentication required' }) };
    if (dependency === '../helpers/tenantScope') return { isTenantScopeEnforced: req => req?.tenantContext?.enforced === true };
    return actualRequire(dependency);
  };
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
const { createGoogleAdsExportRouter } = loadRoute('googleAdsExport');
const { createWebConversionsRouter } = loadRoute('webConversions');

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
      // only '%needle%' patterns are used
      ilike(k, pattern) { const needle = pattern.replace(/^%|%$/g, '').toLowerCase();
        rows = rows.filter(r => r[k] != null && String(r[k]).toLowerCase().includes(needle)); return q; },
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
      // no call_started_at / duration, uploaded days later: t = file name time 12:00:00 VN = 05:00:00Z
      { id: 'r3', company_id: A, lead_id: null, duration_sec: null, direction: null, call_started_at: null,
        file_name: 'Ghi âm cuộc gọi 0385197809_261009_120000.m4a', file_size: 412121, created_at: '2026-10-12T02:00:00Z' },
      // a short call is still a call (no duration rule); no gclid click near it
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

test('new website denial blocks legacy stage conversions and the linked call conversion', async () => {
  const t = baseTables();
  for (const id of ['L1', 'L2']) t.crm_leads.find(row => row.id === id).website_intake = { measurement_consent: false };
  const { rows } = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
  assert.equal(rows.some(row => ['L1', 'L2'].includes(row.lead_id)), false);
  assert.equal(rows.some(row => row.recording_id === 'r1'), false);
  assert.deepEqual(rows.filter(row => row.type === 'CALL').map(row => row.recording_id).sort(), ['r2', 'r3']);
});

test('literal true website choice preserves legacy stage/call output and absent or NULL metadata remains compatible', async () => {
  const baseline = await G.buildGoogleOfflineConversions({ db: fakeDb(baseTables()), companyId: A, ...RANGE });
  for (const metadata of [{ measurement_consent: true }, null]) {
    const t = baseTables();
    for (const row of t.crm_leads) row.website_intake = metadata;
    const actual = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
    assert.deepEqual(actual.rows, baseline.rows);
    assert(actual.rows.some(row => row.type === 'VALID_LEAD' && row.lead_id === 'L1'));
    assert(actual.rows.some(row => row.type === 'CALL' && row.recording_id === 'r1'));
  }
});

test('missing or nonboolean consent in new metadata blocks stage, linked call and description fallback', async () => {
  for (const consent of [undefined, null, 'true', 'false', 1, 0]) {
    const t = baseTables();
    for (const id of ['L1', 'L2']) t.crm_leads.find(row => row.id === id).website_intake =
      consent === undefined ? {} : { measurement_consent: consent };
    t.lead_attribution = t.lead_attribution.filter(row => row.lead_id !== 'L1');
    t.crm_leads.find(row => row.id === 'L1').description = `VPT_V1 | 2026-10-05T03:00:00Z\ngclid: ${GC(7)}`;
    const actual = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
    assert.equal(actual.rows.some(row => ['L1', 'L2'].includes(row.lead_id)), false);
    assert.equal(actual.rows.some(row => row.recording_id === 'r1'), false);
  }
});

test('a linked call cannot bypass consent lookup through a missing or foreign-company Lead', async () => {
  for (const missing of [true, false]) {
    const t = baseTables();
    if (missing) t.crm_leads = t.crm_leads.filter(row => row.id !== 'L2');
    else t.crm_leads.find(row => row.id === 'L2').company_id = B;
    const actual = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
    assert.equal(actual.rows.some(row => row.recording_id === 'r1' || row.lead_id === 'L2'), false);
    assert(actual.rows.some(row => row.type === 'VALID_LEAD' && row.lead_id === 'L1'));
  }
});

test('helpers: call time fallback, direction, Vietnam time format, masking', () => {
  assert.deepEqual(G.callTimeMs({ call_started_at: '2026-10-10T03:00:00Z', file_name: 'x_261001_000000.m4a' }),
    { ms: at('2026-10-10T03:00:00Z'), source: 'call_started_at' });
  assert.deepEqual(G.callTimeMs({ file_name: 'Ghi âm cuộc gọi 0385197809_261007_203408.m4a', created_at: '2026-10-12T03:05:00Z' }, NOW),
    { ms: at('2026-10-07T13:34:08Z'), source: 'file_name' });
  // upload time is never used as the call time
  assert.equal(G.callTimeMs({ created_at: '2026-10-10T03:05:00Z', duration_sec: 300, file_name: 'rec.m4a' }), null);
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

  assert.equal(d.recordings_considered, 5); // r1 r2 r3 r4 r6 (r5 outbound)
  assert.equal(d.recordings_skipped_outbound, 1);
  assert.equal(d.recordings_time_from_file_name, 1);
  assert.equal(d.recordings_matched, 3);
  assert.equal(d.recordings_without_click, 2); // r4, r6
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

test('recordings: real app row (no duration/time/direction, late upload) matched by file name time', async () => {
  const t = baseTables();
  t.web_conversion_events = [
    { id: 'k1', company_id: A, kind: 'call', gclid: GC(40), occurred_at: '2026-10-07T13:30:00Z' }];
  t.voice_recordings = [
    // same file uploaded twice: one conversion only
    { id: 'v1', company_id: A, lead_id: null, duration_sec: null, direction: null, call_started_at: null,
      file_name: 'Ghi âm cuộc gọi 0385197809_261007_203408.m4a', file_size: 412121, created_at: '2026-10-12T01:00:00Z' },
    { id: 'v2', company_id: A, lead_id: 'L2', duration_sec: null, direction: null, call_started_at: null,
      file_name: 'Ghi âm cuộc gọi 0385197809_261007_203408.m4a', file_size: 412121, created_at: '2026-10-12T01:05:00Z' },
    // no call time anywhere: skipped, never placed at its upload time (a click sits right before it)
    { id: 'v3', company_id: A, lead_id: null, duration_sec: 45, direction: null, call_started_at: null,
      file_name: 'recording.m4a', file_size: 1000, created_at: '2026-10-08T01:00:30Z' },
    // same name, different size: a different recording
    { id: 'v4', company_id: A, lead_id: null, duration_sec: 5, direction: 'outbound', call_started_at: null,
      file_name: 'Ghi âm cuộc gọi 0385197809_261007_203408.m4a', file_size: 999, created_at: '2026-10-12T01:06:00Z' },
  ];
  t.web_conversion_events.push({ id: 'k2', company_id: A, kind: 'call', gclid: GC(41), occurred_at: '2026-10-08T01:00:00Z' });
  const { rows, diagnostics: d } = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
  const calls = rows.filter(r => r.type === 'CALL');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].recording_id, 'v1');
  assert.equal(calls[0].gclid, GC(40));
  assert.equal(calls[0].conversion_ms, at('2026-10-07T13:34:08Z'));
  assert.equal(calls[0].lead_id, 'L2'); // lead filled from the duplicate copy
  assert.equal(d.recordings_duplicates_merged, 1);
  assert.equal(d.recordings_no_call_time, 1);
  assert.equal(d.recordings_time_from_file_name, 1);
  assert.equal(d.recordings_skipped_outbound, 1);
  assert.equal(d.recordings_considered, 1);
  assert.equal(d.call_clicks_unmatched, 1); // k2 not matched to v3's upload time
});

test('dedupeRecordings keeps the earliest row and only merges same company + name + size', () => {
  const { rows, merged } = G.dedupeRecordings([
    { id: 'a', company_id: A, file_name: 'x_261007_203408.m4a', file_size: 10, lead_id: null },
    { id: 'b', company_id: A, file_name: 'x_261007_203408.m4a', file_size: 10, lead_id: 'L', duration_sec: 33 },
    { id: 'c', company_id: B, file_name: 'x_261007_203408.m4a', file_size: 10 },
    { id: 'd', company_id: A, file_name: 'x_261007_203408.m4a', file_size: 0 },
    { id: 'e', company_id: A, file_name: 'x_261007_203408.m4a', file_size: 0 },
  ]);
  assert.deepEqual(rows.map(r => r.id), ['a', 'c', 'd', 'e']);
  assert.equal(merged, 1);
  assert.equal(rows[0].lead_id, 'L');
  assert.equal(rows[0].duration_sec, 33);
});

// Same shape as integrations/wordpress/vpt-v1-crm-bridge/core.php notes, merged by routes/external.js.
const vptDescription = (gclid, submitted, { message = 'Tủ bếp gỗ', marker = true, extra = '' } = {}) =>
  `${message}\n\nGhi chú: ${marker ? 'VPT_V1 | ' : ''}${submitted}\nĐồng ý liên hệ: có\nTrang: https://vanphuthanh.net/tu-bep/` +
  `${extra}\nutm_source: google\nutm_medium: cpc\nutm_campaign: \nutm_content: \nutm_term: \ngclid: ${gclid}` +
  '\ngbraid: \nwbraid: \ncampaignid: 23976669573\nadgroupid: \nkeyword: \nmatchtype: \ndevice: m';
const descLead = (id, description, created_at = '2026-10-05T03:00:05Z') =>
  ({ id, company_id: A, is_test: false, description, created_at });
const hot = (lead_id, entered_at = '2026-10-06T04:00:00Z') =>
  ({ lead_id, pipeline_type: 'lead', to_canonical_slug: 'hot', changed_by: 'u', entered_at });

test('parses the VPT_V1 notes block from the description', () => {
  const p = G.parseVptV1Description(vptDescription(GC(20), '2026-10-05T03:00:00+00:00'));
  assert.equal(p.gclid, GC(20));
  assert.equal(p.submit_ms, at('2026-10-05T03:00:00Z'));
  assert.equal(p.campaign_id, '23976669573');
  assert.equal(p.test, false);
  assert.equal(G.parseVptV1Description(vptDescription(GC(20), '2026-10-05T03:00:00+00:00', { marker: false })), null);
  assert.equal(G.parseVptV1Description(null), null);
  // a "gclid:" line typed by the visitor before the notes block is ignored
  const injected = G.parseVptV1Description(vptDescription('', '2026-10-05T03:00:00+00:00',
    { message: `VPT_V1 | 2026-01-01T00:00:00+00:00\ngclid: ${GC(30)}` }));
  assert.equal(injected.gclid, '');
  assert.equal(G.parseVptV1Description('Ghi chú: VPT_V1 | not-a-date\ngclid: x').submit_ms, null);
});

test('description gclid fallback: marker required, test/invalid rejected, lead_attribution preferred', async () => {
  const t = baseTables();
  const submitted = '2026-10-05T03:00:00+00:00';
  t.crm_leads.push(
    descLead('D1', vptDescription(GC(21), submitted)), // valid description gclid
    descLead('D2', vptDescription(GC(22), submitted, { marker: false })), // no marker: ignored
    descLead('D3', vptDescription('VPT_TEST_abcdefghijklmnopqrstu', submitted)), // test gclid
    descLead('D4', vptDescription('short', submitted)), // not a sane gclid
    descLead('D5', vptDescription('', submitted)), // website form lead without gclid
    descLead('D6', vptDescription(GC(26), submitted, { extra: '\nTEST: KHÔNG GỌI, không báo giá, không tính doanh thu/chuyển đổi.' })),
    { ...descLead('D7', vptDescription(GC(27), submitted)), is_test: true });
  // L1 already has a lead_attribution gclid (GC(7)); its description gclid must not win
  Object.assign(t.crm_leads.find(l => l.id === 'L1'),
    { description: vptDescription(GC(29), submitted), created_at: '2026-10-05T03:00:05Z' });
  t.crm_lead_stage_history.push(...['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map(id => hot(id)));
  const base = (await G.buildGoogleOfflineConversions({ db: fakeDb(baseTables()), companyId: A, ...RANGE })).diagnostics;
  const { rows, diagnostics: d } = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
  const valid = Object.fromEntries(rows.filter(r => r.type === 'VALID_LEAD').map(r => [r.lead_id, r]));
  assert.deepEqual(Object.keys(valid).sort(), ['D1', 'L1', 'L2']);
  assert.equal(valid.D1.gclid, GC(21));
  assert.equal(valid.D1.gclid_source, 'description');
  assert.equal(valid.D1.campaign_id, '23976669573');
  assert.equal(valid.D1.click_ms, at('2026-10-05T03:00:00Z'));
  assert.equal(valid.D1.conversion_ms, at('2026-10-06T04:00:00Z'));
  assert.equal(valid.L1.gclid, GC(7)); assert.equal(valid.L1.gclid_source, 'form');
  assert.equal(d.valid_leads_via_description_gclid, 1);
  assert.equal(d.valid_leads_via_form_gclid, 1);
  assert.equal(d.valid_leads_without_gclid, base.valid_leads_without_gclid + 1); // D5
  assert.equal(d.website_form_leads, base.website_form_leads + 3); // D1, D4, D5 (D2 unmarked, D3/D6 test data, D7 is_test)
  assert.equal(d.test_excluded, base.test_excluded + 2); // D3, D6
  assert.equal(d.invalid_gclid, base.invalid_gclid + 1); // D4
  assert.ok(rows.every(r => !r.gclid.startsWith('VPT_TEST_')));
  const csv = G.toGoogleCsv(rows);
  assert.match(csv, new RegExp(`${GC(21)},VPT CRM - Khach hop le,2026-10-06 11:00:00\\+07:00,,VND`));
  assert.doesNotMatch(csv, new RegExp(`${GC(22)}|${GC(26)}|${GC(27)}|${GC(29)}`));
});

test('description lead: click time is the form submit time, else created_at', async () => {
  const t = baseTables();
  t.crm_leads.push(
    // submitted 07/10 but milestone 06/10 (before submit): never a conversion
    descLead('E1', vptDescription(GC(31), '2026-10-07T00:00:00+00:00'), '2026-10-04T00:00:00Z'),
    // no parsable timestamp: created_at (05/10) is the click time, milestone after it counts
    descLead('E2', vptDescription(GC(32), 'garbage'), '2026-10-05T00:00:00Z'));
  t.crm_lead_stage_history.push(hot('E1'), hot('E2'), hot('E1', '2026-10-07T00:00:00Z'));
  const { rows } = await G.buildGoogleOfflineConversions({ db: fakeDb(t), companyId: A, ...RANGE });
  const valid = Object.fromEntries(rows.filter(r => r.type === 'VALID_LEAD').map(r => [r.lead_id, r]));
  assert.equal(valid.E2.click_ms, at('2026-10-05T00:00:00Z'));
  assert.equal(valid.E2.conversion_ms, at('2026-10-06T04:00:00Z'));
  assert.equal('E1' in valid, false); // milestone at exactly the submit time is not after the click
  for (const r of rows) assert.ok(r.conversion_ms > r.click_ms);
});

test('CSV format: header first, Vietnam time with offset, blank value, VND', () => {
  const csv = G.toGoogleCsv([
    { gclid: GC(1), conversion_name: G.CONVERSION_NAMES.CALL, conversion_ms: at('2026-10-10T03:00:00Z') },
    { gclid: 'bad,gclid"=cmd', conversion_name: G.CONVERSION_NAMES.CALL, conversion_ms: 0 }]);
  assert.equal(csv, 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n' +
    `${GC(1)},VPT CRM - Cuoc goi that,2026-10-10 10:00:00+07:00,,VND\r\n`);
});

async function request(app, path, headers = {}) {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const { port } = server.address();
    return await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path, headers }, res => {
        let body = ''; res.setEncoding('utf8');
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
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
  assert.equal(lines[0], G.CSV_HEADER);
  assert.equal(lines.length, 1 + 5); // 3 calls + 2 valid leads
  assert.ok(lines.slice(1).every(l => /^[A-Za-z0-9_-]+,VPT CRM - (Cuoc goi that|Khach hop le),\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\+07:00,,VND$/.test(l)));
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

'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

// The real apiKeyAuth imports config/supabase; stub it so the auth test never touches a DB.
const keysDb = { from() {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
  return q;
} };
require.cache[require.resolve(path.join(__dirname, '../src/config/supabase'))] = {
  id: 'supabase-stub', loaded: true, exports: { supabase: keysDb },
};

const { createPhoneCallsRouter, leadCreatorFrom, normalizeCallerPhone } = require('../src/routes/phoneCalls');

const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const OTHER = '00000000-0000-4000-8000-000000000000';
const NOW = Date.parse('2026-10-12T07:30:00Z'); // 14:30 in Vietnam

// Minimal PostgREST-like query builder over in-memory tables.
function fakeDb(seed = {}) {
  const tables = { crm_call_logs: [], customers: [], crm_leads: [], web_conversion_events: [], ...seed };
  const inserts = [];
  return { tables, inserts, from(name) {
    const filters = []; let orders = []; let limit = Infinity; let row = null;
    const q = {
      select: () => q,
      eq: (k, v) => { filters.push(r => String(r[k]) === String(v)); return q; },
      gte: (k, v) => { filters.push(r => r[k] >= v); return q; },
      lte: (k, v) => { filters.push(r => r[k] <= v); return q; },
      in: (k, vs) => { filters.push(r => vs.includes(r[k])); return q; },
      or: expr => {
        const parts = [...expr.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map(m => [m[1], m[2].split(',')]);
        filters.push(r => parts.some(([k, vs]) => vs.includes(String(r[k]))));
        return q;
      },
      order: (k, { ascending = true } = {}) => { orders.push([k, ascending]); return q; },
      limit: n => { limit = n; return q; },
      insert: r => { row = r; return q; },
      maybeSingle: async () => ({ data: run()[0] || null, error: null }),
      then: (yes, no) => Promise.resolve({ data: run(), error: null }).then(yes, no),
    };
    function run() {
      if (row) { tables[name].push(row); inserts.push({ table: name, row }); return [row]; }
      let rows = (tables[name] || []).filter(r => filters.every(f => f(r)));
      for (const [k, asc] of orders.slice().reverse()) {
        rows = rows.slice().sort((a, b) => {
          if (a[k] == null && b[k] == null) return 0;
          if (a[k] == null) return -1; if (b[k] == null) return 1;
          return (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      return rows.slice(0, limit);
    }
    return q;
  } };
}

function fakeLeads(db) {
  const calls = [];
  return { calls, async create(req, body) {
    calls.push({ body, apiKey: req.apiKey });
    const id = `lead-${calls.length}`;
    db.tables.crm_leads.push({ id, company_id: req.apiKey.company_id, phone: body.phone, customer_id: 'cust-new' });
    return { status: 201, body: { success: true, lead: { id } } };
  } };
}

const fakeAuth = (req, res, next) => {
  if (req.headers['x-api-key'] !== 'good') return res.status(401).json({ error: 'no key' });
  req.apiKey = { id: 'key-1', name: 'Phone', company_id: COMPANY };
  next();
};

async function send({ db = fakeDb(), leads, auth = fakeAuth, key = 'good', body, now = NOW, type = 'application/json' } = {}) {
  leads = leads || fakeLeads(db);
  const app = express();
  app.use(express.json());
  app.use('/p', createPhoneCallsRouter({ getDb: () => db, createLead: leads.create, auth, now: () => now }));
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return await new Promise((resolve, reject) => {
      const req = http.request({ port, path: '/p', method: 'POST',
        headers: { 'Content-Type': type, ...(key ? { 'X-Api-Key': key } : {}) } }, res => {
        let text = ''; res.on('data', c => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null, db, leads }));
      });
      req.on('error', reject); req.end(payload);
    });
  } finally { server.close(); }
}

const iso = ms => new Date(ms).toISOString();

test('auth is required (real apiKeyAuth middleware)', async () => {
  const { apiKeyAuth } = require('../src/middleware/apiKeyAuth');
  const db = fakeDb();
  const noKey = await send({ db, auth: apiKeyAuth, key: null, body: { phone: '0908309222' } });
  assert.equal(noKey.status, 401);
  const badKey = await send({ db, auth: apiKeyAuth, key: 'not-a-key', body: { phone: '0908309222' } });
  assert.equal(badKey.status, 401);
  assert.equal(db.inserts.length, 0);
});

test('phone normalization and invalid/hidden numbers are skipped with 200', async () => {
  assert.equal(normalizeCallerPhone('+84908309222'), '0908309222');
  assert.equal(normalizeCallerPhone('0908 309 222'), '0908309222');
  assert.equal(normalizeCallerPhone('0084908309222'), '0908309222');
  assert.equal(normalizeCallerPhone('84 908-309-222'), '0908309222');
  for (const phone of ['', 'Private', 'Unknown', '-1', '123', undefined, { x: 1 }]) {
    const db = fakeDb();
    const res = await send({ db, body: { phone } });
    assert.equal(res.status, 200, String(phone));
    assert.deepEqual(res.json, { ok: true, skipped: 'invalid_phone' });
    assert.equal(db.inserts.length, 0);
    assert.equal(res.leads.calls.length, 0);
  }
});

test('existing lead/customer of this company is linked, no new lead', async () => {
  const db = fakeDb({
    customers: [{ id: 'cust-1', phone: '+84908309222', company_id: COMPANY }],
    crm_leads: [
      { id: 'lead-other-co', company_id: OTHER, customer_id: 'cust-1', created_at: '2026-10-10' },
      { id: 'lead-old', company_id: COMPANY, customer_id: 'cust-1', actual_close_date: '2026-01-01', created_at: '2026-01-01' },
      { id: 'lead-open', company_id: COMPANY, customer_id: 'cust-1', actual_close_date: null, created_at: '2025-12-01' },
    ],
  });
  const res = await send({ db, body: { phone: '+84 908 309 222', contact_name: 'Anh Ba' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true, lead_id: 'lead-open', created: false, matched: true });
  assert.equal(res.leads.calls.length, 0);
  const log = db.tables.crm_call_logs[0];
  assert.deepEqual(
    [log.company_id, log.provider, log.direction, log.status, log.phone_from, log.lead_id, log.customer_id],
    [COMPANY, 'android_phone', 'inbound', 'incoming', '0908309222', 'lead-open', 'cust-1']);
  assert.doesNotMatch(JSON.stringify(db.inserts), /Anh Ba/);
});

test('lead matched by crm_leads.phone in this company only; other company does not count', async () => {
  const db = fakeDb({ crm_leads: [{ id: 'x', company_id: OTHER, phone: '0908309222' }] });
  const res = await send({ db, body: { phone: '0908309222' } });
  assert.equal(res.json.created, true);
  const db2 = fakeDb({ crm_leads: [{ id: 'mine', company_id: COMPANY, phone: '0908309222' }] });
  const res2 = await send({ db: db2, body: { phone: '0908309222' } });
  assert.deepEqual([res2.json.lead_id, res2.json.created], ['mine', false]);
});

test('new number creates a lead through the external-leads path and logs the call', async () => {
  const db = fakeDb();
  const res = await send({ db, body: { phone: '0908 309 222', name: 'Chị Tư', at: iso(NOW - 60_000) } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true, lead_id: 'lead-1', created: true, matched: false });
  const { body } = res.leads.calls[0];
  assert.equal(body.title, 'Cuộc gọi đến — 0908309222');
  assert.equal(body.phone, '0908309222');
  assert.equal(body.type, 'lead');
  assert.equal(body.source_name, 'Cuộc gọi đến điện thoại');
  assert.equal(body.attribution, undefined);
  assert.equal(body.full_name, undefined);
  assert.match(body.description, /lúc 14:29/);
  assert.doesNotMatch(JSON.stringify(res.leads.calls), /Chị Tư/);
  const log = db.tables.crm_call_logs[0];
  assert.deepEqual([log.lead_id, log.customer_id, log.started_at], ['lead-1', 'cust-new', iso(NOW - 60_000)]);
});

test('same phone within 30 minutes is a duplicate; after 30 minutes it is logged again', async () => {
  const db = fakeDb();
  const leads = fakeLeads(db);
  await send({ db, leads, body: { phone: '0908309222' } });
  const dup = await send({ db, leads, body: { phone: '+84908309222' }, now: NOW + 29 * 60_000 });
  assert.deepEqual(dup.json, { ok: true, duplicate: true });
  assert.equal(db.tables.crm_call_logs.length, 1);
  assert.equal(leads.calls.length, 1);
  const later = await send({ db, leads, body: { phone: '0908309222' }, now: NOW + 31 * 60_000 });
  assert.deepEqual([later.json.matched, later.json.lead_id], [true, 'lead-1']);
  assert.equal(db.tables.crm_call_logs.length, 2);
  assert.equal(leads.calls.length, 1);
});

test('attribution is taken from the latest website call click within 10 minutes', async () => {
  const click = (min, extra) => ({ company_id: COMPANY, kind: 'call', occurred_at: iso(NOW - min * 60_000),
    platform: 'direct', utm_source: null, gclid: null, fbclid: null, campaign_id: null, ad_id: null, landing_url: null, ...extra });
  const db = fakeDb({ web_conversion_events: [
    click(9, { platform: 'google', utm_source: 'google', utm_medium: 'cpc', gclid: 'G-1', campaign_id: '23976669573',
      landing_url: 'https://vanphuthanh.net/tu-bep/' }),
    click(20, { platform: 'facebook', fbclid: 'old' }),
    click(2, { kind: 'zalo', platform: 'facebook' }),
    click(1, { company_id: OTHER, platform: 'tiktok' }),
  ] });
  const res = await send({ db, body: { phone: '0908309222' } });
  const { body } = res.leads.calls[0];
  assert.deepEqual(body.attribution, { kenh: 'website', platform: 'google', utm_source: 'google', utm_medium: 'cpc',
    gclid: 'G-1', campaign_id: '23976669573', landing_url: 'https://vanphuthanh.net/tu-bep/' });
  assert.match(body.description, /Đoán nguồn theo lượt bấm gọi trên web lúc 14:21/);
  // The receipt must pass the same validation the website form uses.
  const { externalLeadTracking } = require('../src/domain/externalLeadTracking');
  assert.equal(externalLeadTracking(body).intake_attribution.gclid, 'G-1');
});

test('a call click older than 10 minutes is ignored', async () => {
  const db = fakeDb({ web_conversion_events: [{ company_id: COMPANY, kind: 'call', occurred_at: iso(NOW - 11 * 60_000), platform: 'google', gclid: 'G-old' }] });
  const res = await send({ db, body: { phone: '0908309222' } });
  const { body } = res.leads.calls[0];
  assert.equal(body.attribution, undefined);
  assert.doesNotMatch(body.description, /Đoán nguồn/);
});

test('text/plain JSON body is accepted; lead creation failure is reported and nothing is logged', async () => {
  const db = fakeDb();
  const leads = { calls: [], create: async () => ({ status: 400, body: { error: 'Công ty chưa có pipeline' } }) };
  const res = await send({ db, leads, type: 'text/plain', body: JSON.stringify({ phone: '0908309222' }) });
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(db.tables.crm_call_logs.length, 0);
});

test('leadCreatorFrom runs the handler with the given body and restores req.body', async () => {
  const req = { body: { phone: 'raw' }, apiKey: { id: 'k' } };
  const create = leadCreatorFrom(async (r, res) => res.status(201).json({ lead: { id: 'L' }, seen: r.body }));
  const out = await create(req, { title: 't' });
  assert.deepEqual(out, { status: 201, body: { lead: { id: 'L' }, seen: { title: 't' } } });
  assert.deepEqual(req.body, { phone: 'raw' });
});

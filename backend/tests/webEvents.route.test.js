'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createWebEventsRouter } = require('../src/routes/webEvents');
const { webClickEvent } = require('../src/domain/webClickEvent');

const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const SESSION = 'abcdefghijklmnop1234';

function fakeDb({ fail = false } = {}) {
  const rows = [];
  return { rows, from(name) {
    assert.equal(name, 'web_conversion_events');
    return { async upsert(row, opts) {
      assert.deepEqual(opts, { onConflict: 'company_id,session_key,kind', ignoreDuplicates: true });
      if (fail) return { error: Error('private DB detail') };
      if (!rows.some(r => r.company_id === row.company_id && r.session_key === row.session_key && r.kind === row.kind)) rows.push(row);
      return { error: null };
    } };
  } };
}

async function send({ db = fakeDb(), env = { VPT_WEB_EVENTS_COMPANY_ID: COMPANY },
  origin = 'https://vanphuthanh.net', body, type = 'text/plain' } = {}) {
  const app = express();
  app.use('/w', createWebEventsRouter({ getDb: () => db, env }));
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return await new Promise((resolve, reject) => {
      const req = http.request({ port, path: '/w', method: 'POST',
        headers: { 'Content-Type': type, ...(origin ? { Origin: origin } : {}) } }, res => {
        let text = ''; res.on('data', c => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, text, db }));
      });
      req.on('error', reject); req.end(payload);
    });
  } finally { server.close(); }
}

const click = (extra = {}) => ({ kind: 'call', session_key: SESSION,
  page_url: 'https://www.vanphuthanh.net/tu-bep/?phone=0900000000#x', ...extra });

test('valid beacon is stored once per session and kind, without query strings', async () => {
  const db = fakeDb();
  assert.equal((await send({ db, body: click() })).status, 204);
  assert.equal((await send({ db, body: click() })).status, 204);
  assert.equal((await send({ db, body: click({ kind: 'zalo' }) })).status, 204);
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[0].page_url, 'https://vanphuthanh.net/tu-bep/');
  assert.equal(db.rows[0].company_id, COMPANY);
  assert.doesNotMatch(JSON.stringify(db.rows), /0900000000/);
});

test('origin, feature flag, body and kind guards', async () => {
  assert.equal((await send({ env: {}, body: click() })).status, 404);
  for (const origin of [null, 'https://evil.example', 'http://vanphuthanh.net', 'https://vanphuthanh.net.evil.com', 'https://vanphuthanh.net:8443']) {
    assert.equal((await send({ origin, body: click() })).status, 403, String(origin));
  }
  assert.equal((await send({ body: '{not json' })).status, 400);
  assert.equal((await send({ body: click({ kind: 'form' }) })).status, 400);
  assert.equal((await send({ body: click({ session_key: 'short' }) })).status, 400);
  assert.equal((await send({ body: click({ phone: '0900000000' }) })).status, 400);
  assert.equal((await send({ body: click({ page_url: 'https://evil.example/x' }) })).status, 400);
  assert.equal((await send({ body: click({ utm_source: 'x'.repeat(300) }) })).status, 400);
  assert.equal((await send({ body: 'x'.repeat(5000) })).status, 413);
});

test('write failure is 503 and hides DB details', async () => {
  const res = await send({ db: fakeDb({ fail: true }), body: click() });
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.text, /private/);
});

test('platform rules match the WordPress bridge', () => {
  const base = { kind: 'messenger', session_key: SESSION };
  assert.equal(webClickEvent(base).platform, 'direct');
  assert.equal(webClickEvent({ ...base, gclid: 'g' }).platform, 'google');
  assert.equal(webClickEvent({ ...base, fbclid: 'f' }).platform, 'facebook');
  assert.equal(webClickEvent({ ...base, utm_source: 'Google', utm_medium: 'organic' }).platform, 'google');
  const fb = webClickEvent({ ...base, utm_source: 'FB', utm_campaign: '120200000000001', utm_content: '120200000000002' });
  assert.deepEqual([fb.platform, fb.campaign_id, fb.ad_id], ['facebook', '120200000000001', '120200000000002']);
  const named = webClickEvent({ ...base, utm_source: 'facebook', utm_campaign: 'tet', utm_content: 'video' });
  assert.deepEqual([named.campaign_id, named.ad_id], [null, null]);
  const google = webClickEvent({ ...base, utm_source: 'google', utm_content: '120200000000002', campaignid: '23976669573' });
  assert.deepEqual([google.ad_id, google.campaign_id], [null, '23976669573']);
  assert.throws(() => webClickEvent({ ...base, referrer_host: 'google.com/x?y' }), /referrer_host/);
});

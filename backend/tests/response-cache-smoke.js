/**
 * Smoke tests for response cache middleware (no live server required).
 * Run: node tests/response-cache-smoke.js
 */

const assert = require('assert');
const { responseCache, invalidateTags, buildCacheKey } = require('../src/middleware/responseCache');
const { getSnapshot, resetMetrics } = require('../src/helpers/requestMetrics');

function mockReq(method, path, query = {}, user = null, headers = {}) {
  return {
    method,
    path,
    baseUrl: '/api/test',
    query,
    user,
    headers,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    _headers: {},
    _body: null,
    _ended: false,
    set(k, v) { this._headers[k] = v; return this; },
    getHeader(k) { return this._headers[k]; },
    status(code) { this.statusCode = code; return this; },
    send(body) {
      this._body = body;
      this._ended = true;
      return this;
    },
    json(body) {
      this._body = JSON.stringify(body);
      this._ended = true;
      return this;
    },
    end() {
      this._ended = true;
      return this;
    },
  };
  return res;
}

async function run() {
  process.env.RESPONSE_CACHE_DISABLED = '0';
  resetMetrics();

  // buildCacheKey scope isolation
  const keyA = buildCacheKey(mockReq('GET', '/', {}, { userId: 'aaa' }), 'user');
  const keyB = buildCacheKey(mockReq('GET', '/', {}, { userId: 'bbb' }), 'user');
  assert.notStrictEqual(keyA, keyB, 'cross-user keys must differ');

  // MISS then HIT
  const handler = (req, res) => res.json({ ok: true, n: 1 });
  const mw = responseCache({ ttl: 60, scope: 'user', tags: ['test'] });

  const req1 = mockReq('GET', '/item', {}, { userId: 'u1' });
  const res1 = mockRes();
  let nextCalled = false;
  await new Promise((resolve) => {
    mw(req1, res1, () => { nextCalled = true; resolve(); });
  });
  assert.strictEqual(nextCalled, true);
  handler(req1, res1);
  assert.strictEqual(res1._headers['X-Cache'], 'MISS');

  const req2 = mockReq('GET', '/item', {}, { userId: 'u1' });
  const res2 = mockRes();
  let nextCalled2 = false;
  await new Promise((resolve) => {
    mw(req2, res2, () => { nextCalled2 = true; resolve(); });
  });
  assert.strictEqual(nextCalled2, false, 'second request should be cache HIT');
  assert.strictEqual(res2._headers['X-Cache'], 'HIT');
  assert.strictEqual(res2._body, res1._body);

  // ETag / 304
  const req3 = mockReq('GET', '/item', {}, { userId: 'u1' }, { 'if-none-match': res1._headers.ETag });
  const res3 = mockRes();
  await new Promise((resolve) => {
    mw(req3, res3, resolve);
  });
  assert.strictEqual(res3.statusCode, 304, 'If-None-Match should return 304');

  // Invalidation
  await invalidateTags(['test', 'user:u1']);
  const req4 = mockReq('GET', '/item', {}, { userId: 'u1' });
  const res4 = mockRes();
  let nextCalled4 = false;
  await new Promise((resolve) => {
    mw(req4, res4, () => { nextCalled4 = true; resolve(); });
  });
  assert.strictEqual(nextCalled4, true, 'after invalidate should MISS again');

  const snap = getSnapshot();
  assert.ok(snap.cache.rc_hit >= 1, 'rc_hit counter');
  assert.ok(snap.cache.rc_miss >= 1, 'rc_miss counter');
  assert.ok(snap.cache.rc_304 >= 1, 'rc_304 counter');

  console.log('response-cache-smoke: OK');
  console.log(JSON.stringify(snap.cache, null, 2));
}

run().catch((err) => {
  console.error('response-cache-smoke FAILED:', err);
  process.exit(1);
});

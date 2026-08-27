/**
 * Smoke tests cho single-flight của response cache (không cần server chạy thật).
 * Run: node tests/response-cache-singleflight-smoke.js
 *
 * Kiểm chứng: khi cache trống mà N request cùng key ập đến một lúc, chỉ 1 request chạy
 * handler thật; các request còn lại chờ và dùng chung kết quả.
 */

const assert = require('assert');
const { responseCache, invalidateTags } = require('../src/middleware/responseCache');

const TAG = 'sf:test';

function mockReq(query = {}, headers = {}) {
  return {
    method: 'GET',
    baseUrl: '/api/sf',
    path: '/',
    query,
    user: { userId: 'user-sf' },
    headers,
  };
}

/** res giả có đủ .on() để middleware gắn lưới an toàn. */
function mockRes() {
  const listeners = {};
  return {
    statusCode: 200,
    _body: null,
    _headers: {},
    _ended: false,
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return this; },
    emit(evt) { (listeners[evt] || []).forEach((f) => f()); },
    set(k, v) { this._headers[k] = v; return this; },
    getHeader(k) { return this._headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this._body = b; this._ended = true; return this; },
    send(b) { this._body = b; this._ended = true; return this; },
    end() { this._ended = true; return this; },
  };
}

/** Chạy middleware; nếu tới next() thì gọi handler (đếm số lần chạy thật). */
function runRequest(mw, req, handler) {
  const res = mockRes();
  const done = new Promise((resolve) => {
    mw(req, res, async () => {
      await handler(res);
      res.emit('finish');
      resolve(res);
    }).then(() => { if (res._ended) resolve(res); });
  });
  return done;
}

async function testCoalescing() {
  await invalidateTags([TAG]);
  const mw = responseCache({ ttl: 60, scope: 'user', tags: [TAG] });

  let handlerRuns = 0;
  const handler = async (res) => {
    handlerRuns += 1;
    await new Promise((r) => setTimeout(r, 120)); // giả lập truy vấn nặng
    res.json({ value: 'computed', run: handlerRuns });
  };

  // 5 request đồng thời, cùng key, cache đang trống
  const results = await Promise.all(
    Array.from({ length: 5 }, () => runRequest(mw, mockReq({ a: '1' }), handler)),
  );

  assert.strictEqual(handlerRuns, 1, `handler phải chạy đúng 1 lần, thực tế ${handlerRuns}`);
  console.log('✓ 5 request đồng thời → handler chỉ chạy 1 lần');

  const labels = results.map((r) => r._headers['X-Cache']);
  const coalesced = labels.filter((l) => l === 'HIT-COALESCED').length;
  assert.strictEqual(labels.filter((l) => l === 'MISS').length, 1, 'phải có đúng 1 MISS');
  assert.strictEqual(coalesced, 4, `phải có 4 HIT-COALESCED, thực tế ${coalesced}`);
  console.log('✓ nhãn X-Cache đúng: 1 MISS + 4 HIT-COALESCED');

  // Mọi request đều nhận đúng nội dung
  for (const r of results) {
    const body = typeof r._body === 'string' ? JSON.parse(r._body) : r._body;
    assert.strictEqual(body.value, 'computed', 'nội dung trả về phải giống nhau');
  }
  console.log('✓ tất cả request nhận cùng nội dung đúng');
}

async function testSequentialStillHits() {
  await invalidateTags([TAG]);
  const mw = responseCache({ ttl: 60, scope: 'user', tags: [TAG] });
  let runs = 0;
  const handler = async (res) => { runs += 1; res.json({ n: runs }); };

  const r1 = await runRequest(mw, mockReq({ b: '1' }), handler);
  const r2 = await runRequest(mw, mockReq({ b: '1' }), handler);
  assert.strictEqual(runs, 1, 'request thứ 2 phải lấy từ cache');
  assert.strictEqual(r1._headers['X-Cache'], 'MISS');
  assert.strictEqual(r2._headers['X-Cache'], 'HIT');
  console.log('✓ request tuần tự: MISS rồi HIT (không hồi quy)');
}

async function testDifferentKeysDontCoalesce() {
  await invalidateTags([TAG]);
  const mw = responseCache({ ttl: 60, scope: 'user', tags: [TAG] });
  let runs = 0;
  const handler = async (res) => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 80));
    res.json({ n: runs });
  };
  await Promise.all([
    runRequest(mw, mockReq({ c: '1' }), handler),
    runRequest(mw, mockReq({ c: '2' }), handler),
  ]);
  assert.strictEqual(runs, 2, 'key khác nhau thì KHÔNG được ghép chung');
  console.log('✓ key khác nhau → chạy độc lập (không ghép nhầm)');
}

async function testFailedLeaderDoesNotHang() {
  await invalidateTags([TAG]);
  const mw = responseCache({ ttl: 60, scope: 'user', tags: [TAG] });
  let runs = 0;
  const handler = async (res) => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 60));
    res.statusCode = 500;            // lỗi → không được cache
    res.json({ error: 'boom' });
  };

  const started = Date.now();
  await Promise.all([
    runRequest(mw, mockReq({ d: '1' }), handler),
    runRequest(mw, mockReq({ d: '1' }), handler),
  ]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `không được treo chờ timeout, mất ${elapsed}ms`);
  assert.strictEqual(runs, 2, 'leader lỗi → follower phải tự chạy lại');
  console.log(`✓ leader lỗi → follower tự chạy, không treo (${elapsed}ms)`);
}

/**
 * Cache-Control phải mặc định là `no-cache` — nếu ai đó đổi lại thành `max-age`, trình duyệt
 * sẽ phục vụ bản cũ sau khi server đã xoá cache (người dùng sửa xong vẫn thấy dữ liệu cũ).
 */
async function testDefaultCacheControlIsNoCache() {
  await invalidateTags([TAG]);
  const handler = async (res) => res.json({ ok: 1 });

  const mwUser = responseCache({ ttl: 60, scope: 'user', tags: [TAG] });
  const r1 = await runRequest(mwUser, mockReq({ e: '1' }), handler);
  assert.strictEqual(r1._headers['Cache-Control'], 'private, no-cache',
    `scope user phải là "private, no-cache", nhận "${r1._headers['Cache-Control']}"`);
  const r2 = await runRequest(mwUser, mockReq({ e: '1' }), handler);
  assert.strictEqual(r2._headers['Cache-Control'], 'private, no-cache', 'đường HIT cũng phải no-cache');
  console.log('✓ mặc định scope user → "private, no-cache" (cả MISS lẫn HIT)');

  const mwGlobal = responseCache({ ttl: 60, scope: 'global', tags: [TAG] });
  const r3 = await runRequest(mwGlobal, mockReq({ f: '1' }), handler);
  assert.strictEqual(r3._headers['Cache-Control'], 'public, no-cache',
    `scope global phải là "public, no-cache", nhận "${r3._headers['Cache-Control']}"`);
  console.log('✓ mặc định scope global → "public, no-cache"');

  // Vẫn cho phép chủ động tắt để dùng max-age
  const mwOptOut = responseCache({ ttl: 60, scope: 'user', tags: [TAG], revalidate: false });
  const r4 = await runRequest(mwOptOut, mockReq({ g: '1' }), handler);
  assert.strictEqual(r4._headers['Cache-Control'], 'private, max-age=60',
    `opt-out phải là "private, max-age=60", nhận "${r4._headers['Cache-Control']}"`);
  console.log('✓ revalidate:false vẫn cho ra "private, max-age=60" (opt-out hoạt động)');
}

(async () => {
  await testCoalescing();
  await testSequentialStillHits();
  await testDifferentKeysDontCoalesce();
  await testFailedLeaderDoesNotHang();
  await testDefaultCacheControlIsNoCache();
  console.log('\nTẤT CẢ ĐỀU ĐẠT');
  process.exit(0);
})().catch((e) => {
  console.error('✗ THẤT BẠI:', e.message);
  process.exit(1);
});

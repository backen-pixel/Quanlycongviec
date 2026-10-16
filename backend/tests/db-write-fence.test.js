// node --test backend/tests/db-write-fence.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  CLIENT_CODE,
  MSG_HELD,
  MSG_RETRIABLE,
  detectFenceCode,
  fenceErrorBody,
  isRetriableFence,
  dbWriteFenceResponder,
} = require('../src/helpers/dbWriteFence');

function fakeRes(status = 200) {
  const res = {
    statusCode: status,
    headers: {},
    sent: null,
    status(code) { this.statusCode = code; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    json(body) { this.sent = body; return this; },
  };
  dbWriteFenceResponder({}, res, () => {});
  return res;
}

test('nhận ra message hàng rào trong body lỗi', () => {
  assert.strictEqual(detectFenceCode({ error: 'CUTOVER_V2_WRITE_FENCED' }), 'CUTOVER_V2_WRITE_FENCED');
  assert.strictEqual(
    detectFenceCode({ message: 'lỗi: CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY' }),
    'CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY',
  );
  assert.strictEqual(detectFenceCode('CUTOVER_TRUNCATE_HELD'), 'CUTOVER_TRUNCATE_HELD');
});

test('không đụng vào nội dung người dùng nhập', () => {
  assert.strictEqual(detectFenceCode({ error: 'Lỗi gửi bình luận' }), null);
  // Bình luận nhắc tới mã lỗi vẫn là dữ liệu, không phải message của Postgres
  assert.strictEqual(detectFenceCode({ content: 'anh ơi em thấy CUTOVER_V2_WRITE_FENCED' }), null);
  assert.strictEqual(detectFenceCode(null), null);
  assert.strictEqual(detectFenceCode([{ error: 'CUTOVER_V2_WRITE_FENCED' }]), null);
});

test('phân loại chờ được / phải báo kỹ thuật', () => {
  assert.ok(isRetriableFence('CUTOVER_V2_WRITE_FENCED'));
  assert.ok(!isRetriableFence('CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY'));
  assert.strictEqual(fenceErrorBody('CUTOVER_V2_WRITE_FENCED').error, MSG_RETRIABLE);
  assert.strictEqual(fenceErrorBody('CUTOVER_V2_CONTROL_MISMATCH').error, MSG_HELD);
});

test('res.json đổi message và trả 503 + Retry-After', () => {
  const res = fakeRes(500);
  res.json({ error: 'CUTOVER_V2_WRITE_FENCED' });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.headers['Retry-After'], '60');
  assert.strictEqual(res.sent.error, MSG_RETRIABLE);
  assert.strictEqual(res.sent.code, CLIENT_CODE);
  assert.strictEqual(res.sent.db_code, 'CUTOVER_V2_WRITE_FENCED');
  assert.strictEqual(res.sent.retriable, true);
});

test('hàng rào hết hạn: 503 nhưng không giục thử lại', () => {
  const res = fakeRes(500);
  res.json({ error: 'CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY' });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.headers['Retry-After'], undefined);
  assert.strictEqual(res.sent.error, MSG_HELD);
  assert.strictEqual(res.sent.retriable, false);
});

test('body bình thường đi qua nguyên vẹn, status giữ nguyên', () => {
  const res = fakeRes(200);
  const body = { id: 1, content: 'GỬI CÔNG NỢ 16-10' };
  res.json(body);
  assert.deepStrictEqual(res.sent, body);
  assert.strictEqual(res.statusCode, 200);

  const err = fakeRes(400);
  err.json({ error: 'Thiếu nội dung' });
  assert.strictEqual(err.statusCode, 400);
  assert.deepStrictEqual(err.sent, { error: 'Thiếu nội dung' });
});

test('body 2xx chỉ đổi chữ, không đổi status', () => {
  const res = fakeRes(200);
  res.json({ ok: false, error: 'CUTOVER_V2_WRITE_FENCED' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sent.error, MSG_RETRIABLE);
  assert.strictEqual(res.sent.ok, false);
});

/**
 * Smoke tests cho các thay đổi hiệu năng vòng 2 (không cần server hay DB thật).
 * Run: node tests/perf-retention-and-chunking.js   |   npm run test:perf-retention
 *
 * Phủ 3 nhóm rủi ro thật đã tìm ra khi rà soát:
 *
 *  1. HAI CRON DỌN DỮ LIỆU (logRetentionCron, notificationRetentionCron)
 *     - Đường SQL trực tiếp chạy xong thì KHÔNG được chạy tiếp đường REST
 *       (nếu không sẽ xoá/ghi hai lần và tốn gấp đôi).
 *     - Khi pg.Pool không khả dụng, phải rơi sang REST với lô NHỎ. Bản đầu tiên
 *       tôi viết dùng lô 5000 cho `.in('id', ids)`, tức URL ~200 KB — vượt xa
 *       mọi kích thước từng chạy được trong production (800 id ~30 KB).
 *     - Tên bảng ghép vào SQL phải bị chặn bằng allowlist.
 *     - Phải có trần số lô để không thành vòng lặp vô hạn.
 *     - notificationRetentionCron CHỈ được UPDATE dismissed_at, TUYỆT ĐỐI
 *       không DELETE (đó là cam kết trong tài liệu của job đó).
 *
 *  2. selectInChunks trong routes/facebook.js
 *     - Bản đầu tiên tôi viết `if (error) throw error`, nhưng hai chỗ dùng nó
 *       (nhúng lead, đếm tin nhắn) trước đây bỏ qua lỗi. Ném lỗi ở đó biến một
 *       truy vấn phụ lỗi thành HTTP 500 → hộp thư TRẮNG. Test khoá hành vi
 *       "lỗi một lô thì vẫn trả các lô còn lại".
 *
 *  3. clampContactLimit
 *     - Giao diện từng cho chọn 5000 trong khi backend kẹp cứng 400. Test khoá
 *       việc `?limit=5000` nay trả về trần thật (1000), không phải 400.
 */

const assert = require('assert');
const path = require('path');
const Module = require('module');

// ── Tiêm stub vào require.cache trước khi nạp module cần test ──────────────
const SRC = path.join(__dirname, '..', 'src');
function stub(relPath, exports) {
  const full = require.resolve(path.join(SRC, relPath));
  const m = new Module(full, null);
  m.filename = full;
  m.loaded = true;
  m.exports = exports;
  require.cache[full] = m;
  return exports;
}

let pgImpl = () => null;
stub('config/db', { pgQuerySafe: (...a) => pgImpl(...a) });

const sbCalls = [];
let sbRespond = () => ({ data: [], error: null });
function makeQB(state) {
  const qb = {
    select() { state.op = 'select'; return qb; },
    delete() { state.op = 'delete'; return qb; },
    update(v) { state.op = 'update'; state.val = v; return qb; },
    eq() { return qb; },
    is() { return qb; },
    lt(c, v) { state.lt = [c, v]; return qb; },
    limit(n) { state.limit = n; return qb; },
    in(col, ids) { state.in = [col, ids.length]; return qb; },
    then(res, rej) { return Promise.resolve(sbRespond(state)).then(res, rej); },
  };
  return qb;
}
stub('config/supabase', {
  supabase: { from(t) { const st = { table: t }; sbCalls.push(st); return makeQB(st); } },
});
stub('helpers/cronLeader', { runIfLeader: (_n, fn) => fn() });

const logCron = require('../src/jobs/logRetentionCron');
const notifCron = require('../src/jobs/notificationRetentionCron');

/**
 * selectInChunks + clampContactLimit nằm trong routes/facebook.js, mà file đó
 * khởi động interval khi require. Trích hai hàm thuần ra rồi eval trong sandbox
 * — vẫn test đúng mã đang chạy, không kéo theo side-effect của route.
 */
function loadFbPureFns() {
  const src = require('fs').readFileSync(path.join(SRC, 'routes', 'facebook.js'), 'utf8');
  const pick = (from, to) => {
    const i = src.indexOf(from);
    assert.ok(i >= 0, `Không tìm thấy "${from}" trong routes/facebook.js — có thể đã đổi tên, cập nhật test này`);
    const j = src.indexOf(to, i);
    assert.ok(j > i, `Không tìm thấy mốc kết thúc "${to}"`);
    return src.slice(i, j);
  };
  const maxLine = /const FB_CONTACTS_MAX_LIMIT = .*/.exec(src);
  const defLine = /const FB_CONTACTS_DEFAULT_LIMIT = .*/.exec(src);
  assert.ok(maxLine && defLine, 'Thiếu FB_CONTACTS_MAX_LIMIT / FB_CONTACTS_DEFAULT_LIMIT');
  const body = [
    maxLine[0],
    defLine[0],
    pick('const IN_CHUNK =', '/** @param {*} raw giá trị ?limit thô'),
    pick('function clampContactLimit', '\n}\n') + '\n}\n',
    'return { IN_CHUNK, selectInChunks, clampContactLimit, FB_CONTACTS_MAX_LIMIT, FB_CONTACTS_DEFAULT_LIMIT };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('process', 'console', body)(process, { warn() {} });
}
const fb = loadFbPureFns();

let pass = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); pass += 1; console.log('  PASS  ' + name); }
  catch (e) { failures.push(name + ' → ' + e.message); console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
const ids = (n) => Array.from({ length: n }, (_, i) => 'id-' + i);
function resetSb(respond) { sbCalls.length = 0; sbRespond = respond || (() => ({ data: [], error: null })); }
/** Trả 1 trang đầy rồi hết — dùng cho nhánh REST. */
function servePages(pagesOfFull) {
  let served = 0;
  return (st) => {
    if (st.op !== 'select') return { data: null, error: null };
    if (served >= pagesOfFull) return { data: [], error: null };
    served += 1;
    return { data: ids(st.limit), error: null };
  };
}

(async () => {
  console.log('\n=== logRetentionCron.pruneTable ===');

  await t('SQL: cộng đúng các lô, dừng ở lô lẻ, KHÔNG rơi sang REST', async () => {
    const seq = [5000, 5000, 5000, 137]; // = 15137
    let i = 0;
    pgImpl = () => ({ rowCount: seq[i++] });
    resetSb();
    const r = await logCron.pruneTable('facebook_webhook_logs', 14);
    assert.strictEqual(r.deleted, 15137, 'deleted=' + r.deleted);
    assert.strictEqual(r.via, 'sql');
    assert.strictEqual(sbCalls.length, 0, 'REST bị gọi ' + sbCalls.length + ' lần dù SQL đã xong');
  });

  await t('Pool null → REST fallback, lô nằm trong vùng URL đã kiểm chứng', async () => {
    pgImpl = () => null;
    resetSb(servePages(1));
    const r = await logCron.pruneTable('facebook_webhook_logs', 14);
    const sel = sbCalls.filter((c) => c.op === 'select');
    const del = sbCalls.filter((c) => c.op === 'delete');
    assert.ok(sel.length >= 1, 'không có SELECT');
    assert.ok(sel[0].limit <= 800, 'lô REST = ' + sel[0].limit + ' → URL vượt mức từng chạy được (800)');
    assert.ok(sel[0].limit >= 100, 'lô REST = ' + sel[0].limit + ' → quá nhỏ, thừa round-trip');
    assert.strictEqual(del[0].in[1], sel[0].limit, 'số id trong DELETE khác lô SELECT');
    assert.strictEqual(r.via, 'rest');
  });

  await t('Bảng ngoài allowlist bị chặn, không sinh truy vấn nào', async () => {
    pgImpl = () => { throw new Error('không được ghép tên bảng lạ vào SQL'); };
    resetSb();
    const r = await logCron.pruneTable('users', 14);
    assert.strictEqual(r.skipped, 'table_not_allowed');
    assert.strictEqual(r.deleted, 0);
    assert.strictEqual(sbCalls.length, 0);
  });

  await t('retention = 0 → bỏ qua hoàn toàn', async () => {
    pgImpl = () => { throw new Error('không được gọi'); };
    resetSb();
    const r = await logCron.pruneTable('facebook_webhook_logs', 0);
    assert.strictEqual(r.skipped, 'retention=0');
    assert.strictEqual(sbCalls.length, 0);
  });

  await t('Cutoff đúng bằng now − N ngày', async () => {
    let seen = null;
    pgImpl = (_sql, params) => { seen = params[0]; return { rowCount: 0 }; };
    await logCron.pruneTable('facebook_webhook_logs', 14);
    const days = (Date.now() - new Date(seen).getTime()) / 86400000;
    assert.ok(Math.abs(days - 14) < 0.01, 'cutoff lệch ' + days + ' ngày');
  });

  await t('Có trần số lô → không thể thành vòng lặp vô hạn', async () => {
    let n = 0;
    pgImpl = () => { n += 1; if (n > 5000) throw new Error('VÒNG LẶP VÔ HẠN'); return { rowCount: 5000 }; };
    await logCron.pruneTable('facebook_webhook_logs', 14);
    assert.ok(n < 5000, 'chạy ' + n + ' lô — nghi vô hạn');
  });

  console.log('\n=== notificationRetentionCron.runOnce ===');

  await t('SQL xong → không chạy thêm REST', async () => {
    const seq = [5000, 42];
    let i = 0;
    pgImpl = () => ({ rowCount: seq[i++] });
    resetSb();
    const r = await notifCron.runOnce();
    assert.strictEqual(r.hidden, 5042, 'hidden=' + r.hidden);
    assert.strictEqual(sbCalls.length, 0, 'REST bị gọi ' + sbCalls.length + ' lần');
  });

  await t('Pool null → REST, lô an toàn, đặt dismissed_at', async () => {
    pgImpl = () => null;
    resetSb(servePages(1));
    const r = await notifCron.runOnce();
    const sel = sbCalls.filter((c) => c.op === 'select');
    const upd = sbCalls.filter((c) => c.op === 'update');
    assert.ok(sel[0].limit <= 800, 'lô = ' + sel[0].limit);
    assert.ok(upd.length >= 1, 'không có UPDATE');
    assert.ok(upd[0].val && upd[0].val.dismissed_at, 'UPDATE không đặt dismissed_at');
    assert.strictEqual(upd[0].in[1], sel[0].limit);
    assert.strictEqual(r.hidden, sel[0].limit);
  });

  await t('CHỈ UPDATE, tuyệt đối không DELETE thông báo', async () => {
    pgImpl = () => null;
    resetSb(servePages(1));
    await notifCron.runOnce();
    assert.strictEqual(sbCalls.filter((c) => c.op === 'delete').length, 0, 'CÓ DELETE trên notifications');
  });

  console.log('\n=== facebook.js: clampContactLimit ===');

  await t('Trần = 1000, kích thước trang mặc định = 400', async () => {
    assert.strictEqual(fb.FB_CONTACTS_MAX_LIMIT, 1000, 'MAX=' + fb.FB_CONTACTS_MAX_LIMIT);
    assert.strictEqual(fb.FB_CONTACTS_DEFAULT_LIMIT, 400);
  });

  await t('Đầu vào biên → luôn ra số hợp lệ', async () => {
    const cases = [
      [undefined, 400], [null, 400], ['', 400], ['abc', 400], ['0', 400], ['-5', 400],
      ['1', 1], ['400', 400], ['1000', 1000],
      ['5000', 1000],   // giao diện cũ chọn 5000 → nay ra trần thật, KHÔNG phải 400
      ['999999999', 1000], ['400.9', 400], ['  700  ', 700],
      ['1e9', 1],       // parseInt dừng ở 'e'; code cũ cũng cho 1 → không phải hồi quy
    ];
    for (const [inp, want] of cases) {
      const got = fb.clampContactLimit(inp);
      assert.strictEqual(got, want, `clampContactLimit(${JSON.stringify(inp)}) = ${got}, mong ${want}`);
    }
  });

  await t('Không bao giờ trả NaN / số ngoài khoảng', async () => {
    for (const v of [NaN, Infinity, -Infinity, {}, [], 'null', '+', '0x10']) {
      const got = fb.clampContactLimit(v);
      assert.ok(Number.isInteger(got) && got > 0 && got <= fb.FB_CONTACTS_MAX_LIMIT,
        `clampContactLimit(${String(v)}) = ${got}`);
    }
  });

  console.log('\n=== facebook.js: selectInChunks ===');

  await t('1000 id → mọi lô ≤ IN_CHUNK và phủ đủ 1000', async () => {
    const seen = [];
    const out = await fb.selectInChunks(ids(1000), (c) => {
      seen.push(c.length);
      return Promise.resolve({ data: c.map((id) => ({ id })), error: null });
    });
    assert.strictEqual(out.length, 1000, 'trả về ' + out.length);
    assert.ok(Math.max(...seen) <= fb.IN_CHUNK, 'có lô ' + Math.max(...seen) + ' > IN_CHUNK');
    assert.strictEqual(seen.reduce((a, b) => a + b, 0), 1000, 'tổng id gửi đi ≠ 1000');
  });

  await t('Danh sách rỗng → không gọi truy vấn nào', async () => {
    let n = 0;
    const out = await fb.selectInChunks([], () => { n += 1; return Promise.resolve({ data: [], error: null }); });
    assert.strictEqual(n, 0);
    assert.deepStrictEqual(out, []);
  });

  await t('Số id bằng đúng IN_CHUNK → 1 lô, không sinh lô rỗng', async () => {
    const seen = [];
    await fb.selectInChunks(ids(fb.IN_CHUNK), (c) => {
      seen.push(c.length);
      return Promise.resolve({ data: [], error: null });
    });
    assert.deepStrictEqual(seen, [fb.IN_CHUNK], 'các lô: ' + seen.join(','));
  });

  await t('LỖI MỘT LÔ → không ném, vẫn trả các lô còn lại (hộp thư không trắng)', async () => {
    let k = 0;
    const out = await fb.selectInChunks(ids(1000), (c) => {
      k += 1;
      if (k === 1) return Promise.resolve({ data: null, error: { message: 'giả lập lỗi mạng' } });
      return Promise.resolve({ data: c.map((id) => ({ id })), error: null });
    });
    assert.ok(out.length > 0, 'trả rỗng — lỗi một lô đã làm mất hết dữ liệu');
    assert.ok(out.length < 1000, 'lô lỗi vẫn có dữ liệu?');
  });

  await t('TẤT CẢ lô lỗi → mảng rỗng, vẫn không ném', async () => {
    const out = await fb.selectInChunks(ids(1000), () => Promise.resolve({ data: null, error: { message: 'down' } }));
    assert.deepStrictEqual(out, []);
  });

  await t('data = null mà không có error → bỏ qua an toàn', async () => {
    const out = await fb.selectInChunks(ids(600), () => Promise.resolve({ data: null, error: null }));
    assert.deepStrictEqual(out, []);
  });

  console.log('');
  if (failures.length) {
    console.error(`THẤT BẠI: ${pass} pass, ${failures.length} fail`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`TẤT CẢ ĐẠT: ${pass} pass\n`);
})().catch((e) => { console.error(e); process.exit(1); });

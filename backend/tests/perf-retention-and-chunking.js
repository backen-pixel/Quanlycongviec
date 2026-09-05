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
 *
 *  4. pgUnifiedTaskBadgeCounts — SỐ HIỆU THAM SỐ SQL
 *     Bản đầu viết cứng '$2' cho user và '$3' cho company. Khi user là manager
 *     thì mệnh đề dùng $2 biến mất khỏi SQL nhưng driver vẫn gửi 3 giá trị →
 *     Postgres không suy được kiểu của $2:
 *       42P18 could not determine data type of parameter $2      (114 lần/3h)
 *       08P01 bind message supplies 2 parameters ... requires 1   (43 lần/3h)
 *     Lỗi này ĐƯỢC .catch() nên không sập — badge âm thầm rơi về đường cũ.
 *     Nghĩa là mọi MANAGER dùng đường 386 ms và đếm SAI, đúng nhóm nhiều việc
 *     nhất. Lỗi im lặng kiểu này chỉ có test mới bắt được, nên test dưới kiểm
 *     bất biến: mọi $n xuất hiện trong SQL, và dãy số không có lỗ.
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
const pgSeen = [];
stub('config/db', {
  pgQuerySafe: (sql, params) => { pgSeen.push({ sql, params }); return pgImpl(sql, params); },
  isPgEnabled: () => true,
});

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

const { pgUnifiedTaskBadgeCounts } = require('../src/helpers/pgHotQueries');
const logCron = require('../src/jobs/logRetentionCron');
const notifCron = require('../src/jobs/notificationRetentionCron');

/**
 * selectInChunks + clampContactLimit nằm trong routes/facebook.js, mà file đó
 * khởi động interval khi require. Trích hai hàm thuần ra rồi eval trong sandbox
 * — vẫn test đúng mã đang chạy, không kéo theo side-effect của route.
 */
function loadFbPureFns() {
  // Chuẩn hoá xuống dòng trước khi tìm mốc: repo được sửa từ máy Windows nên
  // file có thể là CRLF, mà các mốc dưới đây viết theo LF. Không chuẩn hoá thì
  // test đỏ vì lý do vô nghĩa (đã dính đúng lỗi này một lần).
  const src = require('fs')
    .readFileSync(path.join(SRC, 'routes', 'facebook.js'), 'utf8')
    .replace(/\r\n/g, '\n');
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

  await t('Pool null → REST fallback, lô dưới ngưỡng gãy 643 của .in()', async () => {
    pgImpl = () => null;
    resetSb(servePages(1));
    const r = await logCron.pruneTable('facebook_webhook_logs', 14);
    const sel = sbCalls.filter((c) => c.op === 'select');
    const del = sbCalls.filter((c) => c.op === 'delete');
    assert.ok(sel.length >= 1, 'không có SELECT');
    assert.ok(sel[0].limit <= 643, 'lô REST = ' + sel[0].limit + ' → vượt ngưỡng gãy đo được của .in() là 643');
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

  await t('Pool null → REST, lô dưới ngưỡng gãy, đặt dismissed_at', async () => {
    pgImpl = () => null;
    resetSb(servePages(1));
    const r = await notifCron.runOnce();
    const sel = sbCalls.filter((c) => c.op === 'select');
    const upd = sbCalls.filter((c) => c.op === 'update');
    assert.ok(sel[0].limit <= 643, 'lô = ' + sel[0].limit);
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

  console.log('\n=== pgHotQueries: số hiệu tham số của pgUnifiedTaskBadgeCounts ===');

  /**
   * Bất biến phải giữ với MỌI tổ hợp user:
   *   (a) mọi $n với n = 1..params.length đều xuất hiện trong SQL
   *   (b) SQL không tham chiếu $n nào vượt quá params.length
   * Vi phạm (a) chính là bug 42P18/08P01 đã xảy ra trên production.
   */
  function checkParamNumbering(sql, params, label) {
    const refs = new Set((sql.match(/\$\d+/g) || []).map((m) => Number(m.slice(1))));
    const missing = [];
    for (let n = 1; n <= params.length; n += 1) if (!refs.has(n)) missing.push('$' + n);
    assert.strictEqual(
      missing.length, 0,
      `${label}: truyền ${params.length} tham số nhưng SQL không dùng ${missing.join(', ')}`
      + ' → Postgres sẽ báo 42P18/08P01',
    );
    const tooHigh = [...refs].filter((n) => n > params.length);
    assert.strictEqual(
      tooHigh.length, 0,
      `${label}: SQL dùng ${tooHigh.map((n) => '$' + n).join(', ')} nhưng chỉ truyền ${params.length} tham số`,
    );
  }

  const SHAPES = [
    { label: 'A manager + công ty', user: { userId: 'u1', company_id: 'c1' }, flags: { isManager: true, isSystemAdmin: false }, soTham: 2 },
    { label: 'B nhân viên + công ty', user: { userId: 'u1', company_id: 'c1' }, flags: { isManager: false, isSystemAdmin: false }, soTham: 3 },
    { label: 'C sys-admin + manager', user: { userId: 'u1', company_id: 'c1' }, flags: { isManager: true, isSystemAdmin: true }, soTham: 1 },
    { label: 'D sys-admin + nhân viên', user: { userId: 'u1', company_id: 'c1' }, flags: { isManager: false, isSystemAdmin: true }, soTham: 2 },
  ];

  for (const sh of SHAPES) {
    // eslint-disable-next-line no-await-in-loop
    await t(`${sh.label} → ${sh.soTham} tham số, không có lỗ trong dãy $n`, async () => {
      pgSeen.length = 0;
      pgImpl = () => ({ rows: [{ open: 1, overdue: 0 }] });
      const r = await pgUnifiedTaskBadgeCounts(sh.user, sh.flags);
      assert.ok(r, 'trả về null — hàm không chạy tới truy vấn');
      assert.strictEqual(pgSeen.length, 1, 'gọi pgQuerySafe ' + pgSeen.length + ' lần');
      const { sql, params } = pgSeen[0];
      assert.strictEqual(params.length, sh.soTham,
        `truyền ${params.length} tham số, mong ${sh.soTham}`);
      checkParamNumbering(sql, params, sh.label);
    });
  }

  await t('Manager KHÔNG lọc theo user (đúng phạm vi), nhân viên thì CÓ', async () => {
    pgSeen.length = 0;
    pgImpl = () => ({ rows: [{ open: 0, overdue: 0 }] });
    await pgUnifiedTaskBadgeCounts({ userId: 'u1', company_id: 'c1' }, { isManager: true });
    const sqlManager = pgSeen[0].sql;
    pgSeen.length = 0;
    await pgUnifiedTaskBadgeCounts({ userId: 'u1', company_id: 'c1' }, { isManager: false });
    const sqlEmployee = pgSeen[0].sql;
    assert.ok(!/assignee_id\s*=\s*\$/.test(sqlManager), 'manager lại bị lọc theo assignee_id');
    assert.ok(/assignee_id\s*=\s*\$/.test(sqlEmployee), 'nhân viên KHÔNG bị lọc theo assignee_id');
  });

  await t('Mọi tham số uuid đều có ::uuid tường minh', async () => {
    for (const sh of SHAPES) {
      pgSeen.length = 0;
      pgImpl = () => ({ rows: [{ open: 0, overdue: 0 }] });
      // eslint-disable-next-line no-await-in-loop
      await pgUnifiedTaskBadgeCounts(sh.user, sh.flags);
      const { sql } = pgSeen[0];
      const untyped = (sql.match(/\$\d+(?!::)/g) || []).filter((m) => m !== '$1');
      assert.strictEqual(untyped.length, 0,
        `${sh.label}: tham số thiếu ép kiểu: ${untyped.join(', ')}`);
    }
  });

  console.log('');
  if (failures.length) {
    console.error(`THẤT BẠI: ${pass} pass, ${failures.length} fail`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log(`TẤT CẢ ĐẠT: ${pass} pass\n`);
})().catch((e) => { console.error(e); process.exit(1); });

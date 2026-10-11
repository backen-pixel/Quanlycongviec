/**
 * Test offline cho scripts/optimize-user-avatars.js — dùng DB/Storage giả, KHÔNG đụng dữ liệu thật.
 * Chạy: node tests/avatar-optimize-batch.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('../scripts/optimize-user-avatars');
const { optimizeAvatarUrl, SMALL_ENOUGH_BYTES } = require('../src/helpers/avatarOptimize');

const BASE = 'https://proj.supabase.co/storage/v1/object/public/attachments/';

/** Supabase giả: bảng users trong bộ nhớ + Storage tối thiểu. */
function fakeDb(rows, objects = {}) {
  const uploads = [];
  function from(table) {
    assert.strictEqual(table, 'users');
    const q = { mode: 'select', filters: [], upd: null, range: null, notNull: false, like: null };
    const api = {
      select() { return api; },
      not() { q.notNull = true; return api; },
      like(_c, pat) { q.like = pat; return api; },
      order() { return api; },
      range(a, b) { q.range = [a, b]; return api; },
      eq(c, v) { q.filters.push([c, v]); return api; },
      update(v) { q.mode = 'update'; q.upd = v; return api; },
      then(res, rej) {
        try {
          let m = rows.filter((r) => q.filters.every(([c, v]) => r[c] === v));
          if (q.mode === 'update') {
            m.forEach((r) => Object.assign(r, q.upd));
            res({ data: m.map((r) => ({ id: r.id })), error: null });
            return;
          }
          if (q.notNull) m = m.filter((r) => r.avatar != null);
          if (q.like) { const pre = q.like.replace(/%$/, ''); m = m.filter((r) => String(r.avatar).startsWith(pre)); }
          if (q.range) m = m.slice(q.range[0], q.range[1] + 1);
          res({ data: m.map((r) => ({ ...r })), error: null });
        } catch (e) { rej(e); }
      },
    };
    return api;
  }
  const storage = {
    from: () => ({
      getPublicUrl: (p) => ({ data: { publicUrl: BASE + p } }),
      download: async (p) => {
        const b = objects[p];
        if (!b) return { data: null, error: { message: 'not found' } };
        return { data: { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }, error: null };
      },
      upload: async (p, body) => { uploads.push({ path: p, size: body.length }); return { error: null }; },
    }),
  };
  return { from, storage, uploads };
}

const noSleep = async () => {};
const silent = () => {};
const BIG = Buffer.alloc(SMALL_ENOUGH_BYTES * 20, 1);
const fakeResize = async () => ({ buffer: Buffer.alloc(20 * 1024, 3), ext: 'webp', mime: 'image/webp' });

function makeRows() {
  return [
    { id: 'a', full_name: 'A lớn', avatar: BASE + 'internal_social/a/big.png' },
    { id: 'b', full_name: 'B nhỏ', avatar: BASE + 'internal_social/b/small.png' },
    { id: 'c', full_name: 'C Google', avatar: 'https://lh3.googleusercontent.com/a/x' },
    { id: 'd', full_name: 'D không ảnh', avatar: null },
  ];
}
function makeObjects() {
  return { 'internal_social/a/big.png': BIG, 'internal_social/b/small.png': Buffer.alloc(500, 2) };
}
// optimize thật nhưng thay ffmpeg bằng bản giả
const optimizeReal = (url, uid, deps) => optimizeAvatarUrl(url, uid, { ...deps, resize: fakeResize, log: silent });

(async () => {
  let passed = 0;
  const ok = (n) => { passed += 1; console.log('ok -', n); };

  // 1) dry-run: không ghi DB, không upload, không nhật ký
  {
    const rows = makeRows();
    const db = fakeDb(rows, makeObjects());
    const logs = [];
    const res = await main([], { supabase: db, optimize: optimizeReal, out: silent, sleep: noSleep, appendLog: (o) => logs.push(o) });
    assert.strictEqual(res.seen, 2); // chỉ a và b nằm trong Storage; c ngoài, d rỗng bị lọc
    assert.strictEqual(res.counts.would_optimize, 1);
    assert.strictEqual(res.counts.small, 1);
    assert.strictEqual(db.uploads.length, 0);
    assert.strictEqual(logs.length, 0);
    assert.strictEqual(rows[0].avatar, BASE + 'internal_social/a/big.png');
    ok('dry-run: ước tính nhưng không ghi gì (DB, Storage, nhật ký)');
  }

  // 2) --apply: ghi DB + upload + nhật ký
  {
    const rows = makeRows();
    const db = fakeDb(rows, makeObjects());
    const logs = [];
    const res = await main(['--apply'], { supabase: db, optimize: optimizeReal, out: silent, sleep: noSleep, appendLog: (o) => logs.push(o) });
    assert.strictEqual(res.changed, 1);
    assert.strictEqual(db.uploads.length, 1);
    assert.ok(rows[0].avatar.includes('/avatar_') && rows[0].avatar.endsWith('.webp'));
    assert.strictEqual(rows[1].avatar, BASE + 'internal_social/b/small.png'); // ảnh nhỏ giữ nguyên
    assert.strictEqual(rows[2].avatar, 'https://lh3.googleusercontent.com/a/x'); // URL ngoài giữ nguyên
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].old, BASE + 'internal_social/a/big.png');
    assert.strictEqual(logs[0].new, rows[0].avatar);
    ok('--apply: sửa đúng người cần sửa, ghi nhật ký, bỏ qua ảnh nhỏ/URL ngoài');
  }

  // 3) điều kiện: avatar bị đổi giữa chừng thì KHÔNG đè
  {
    const rows = makeRows();
    const db = fakeDb(rows, makeObjects());
    const racing = async (url, uid, deps) => {
      const r = await optimizeReal(url, uid, deps);
      rows[0].avatar = 'https://example.com/nguoi-dung-vua-doi.png'; // người dùng đổi avatar ngay lúc đó
      return r;
    };
    const res = await main(['--apply'], { supabase: db, optimize: racing, out: silent, sleep: noSleep, appendLog: () => {} });
    assert.strictEqual(res.changed, 0);
    assert.strictEqual(res.counts.changed_meanwhile, 1);
    assert.strictEqual(rows[0].avatar, 'https://example.com/nguoi-dung-vua-doi.png');
    ok('avatar vừa được đổi: không bị đè');
  }

  // 4) --user và --limit
  {
    const rows = makeRows();
    const db = fakeDb(rows, makeObjects());
    const r1 = await main(['--user', 'b'], { supabase: db, optimize: optimizeReal, out: silent, sleep: noSleep, appendLog: () => {} });
    assert.strictEqual(r1.seen, 1);
    const r2 = await main(['--limit', '1'], { supabase: db, optimize: optimizeReal, out: silent, sleep: noSleep, appendLog: () => {} });
    assert.strictEqual(r2.seen, 1);
    ok('--user và --limit giới hạn phạm vi');
  }

  // 5) khôi phục
  {
    const rows = [
      { id: 'a', avatar: 'NEW-A' },
      { id: 'b', avatar: 'NGUOI-DUNG-DOI-TIEP' },
    ];
    const db = fakeDb(rows);
    const file = path.join(os.tmpdir(), `avatar-rollback-test-${Date.now()}.jsonl`);
    fs.writeFileSync(file, [
      JSON.stringify({ id: 'a', old: 'OLD-A', new: 'NEW-A' }),
      JSON.stringify({ id: 'b', old: 'OLD-B', new: 'NEW-B' }),
    ].join('\n'));
    // chạy thử không ghi
    await main(['--rollback', file], { supabase: db, out: silent, sleep: noSleep });
    assert.strictEqual(rows[0].avatar, 'NEW-A');
    const res = await main(['--rollback', file, '--apply'], { supabase: db, out: silent, sleep: noSleep });
    assert.strictEqual(res.restored, 1);
    assert.strictEqual(res.skipped, 1);
    assert.strictEqual(rows[0].avatar, 'OLD-A');
    assert.strictEqual(rows[1].avatar, 'NGUOI-DUNG-DOI-TIEP'); // đã đổi tiếp → không đè
    fs.unlinkSync(file);
    ok('rollback: trả về URL cũ, không đè avatar đã đổi tiếp, mặc định chỉ chạy thử');
  }

  console.log(`\n${passed} kiểm tra đạt`);
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

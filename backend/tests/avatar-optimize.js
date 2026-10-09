/**
 * Test offline cho helpers/avatarOptimize.js — không cần Supabase, mạng hay ffmpeg thật (dùng bản giả).
 * Chạy: node tests/avatar-optimize.js
 */
const assert = require('assert');
const {
  optimizeAvatarUrl,
  resizeAvatarBuffer,
  storagePathFromUrl,
  buildScaleFilter,
  SMALL_ENOUGH_BYTES,
} = require('../src/helpers/avatarOptimize');

const BASE = 'https://proj.supabase.co/storage/v1/object/public/attachments/';

/** Supabase giả: lưu đối tượng trong bộ nhớ, ghi lại các lần upload. */
function fakeSupabase(objects) {
  const uploads = [];
  return {
    uploads,
    storage: {
      from: () => ({
        getPublicUrl: (p) => ({ data: { publicUrl: BASE + p } }),
        download: async (p) => {
          const buf = objects[p];
          if (!buf) return { data: null, error: { message: 'not found' } };
          return { data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, error: null };
        },
        upload: async (p, body, opts) => {
          uploads.push({ path: p, size: body.length, opts });
          return { error: null };
        },
      }),
    },
  };
}

const quiet = { log: () => {} };
const big = Buffer.alloc(SMALL_ENOUGH_BYTES * 20, 1); // ~3MB giả
const smallFile = Buffer.alloc(1000, 2);
const fakeResize = async () => ({ buffer: Buffer.alloc(30 * 1024, 3), ext: 'webp', mime: 'image/webp' });

(async () => {
  let passed = 0;
  const ok = (name) => { passed += 1; console.log('ok -', name); };

  // 1) storagePathFromUrl
  assert.strictEqual(storagePathFromUrl(BASE + 'internal_social/u1/a%20b.png?x=1', BASE), 'internal_social/u1/a b.png');
  assert.strictEqual(storagePathFromUrl('https://evil.example/x.png', BASE), null);
  assert.strictEqual(storagePathFromUrl(BASE + '../secret', BASE), null);
  assert.strictEqual(storagePathFromUrl(BASE + 'a/%2e%2e/b', BASE), null);
  ok('storagePathFromUrl: nhận URL trong Storage, chặn URL ngoài và path traversal');

  // 2) bộ lọc không phóng to ảnh bé
  assert.ok(buildScaleFilter(512).includes('min(512,iw)'));
  ok('buildScaleFilter: giới hạn 512px');

  // 3) URL ngoài → giữ nguyên, không tải gì
  {
    const sb = fakeSupabase({});
    const r = await optimizeAvatarUrl('https://lh3.googleusercontent.com/a/abc', 'u1', { supabase: sb, resize: fakeResize, ...quiet });
    assert.strictEqual(r.optimized, false);
    assert.strictEqual(r.url, 'https://lh3.googleusercontent.com/a/abc');
    assert.strictEqual(sb.uploads.length, 0);
    ok('URL ngoài (vd. Google): giữ nguyên');
  }

  // 4) ảnh nhỏ → giữ nguyên
  {
    const sb = fakeSupabase({ 'internal_social/u1/s.png': smallFile });
    const url = BASE + 'internal_social/u1/s.png';
    const r = await optimizeAvatarUrl(url, 'u1', { supabase: sb, resize: fakeResize, ...quiet });
    assert.strictEqual(r.optimized, false);
    assert.strictEqual(r.url, url);
    assert.strictEqual(sb.uploads.length, 0);
    ok('ảnh nhỏ: không xử lý');
  }

  // 5) ảnh lớn → thu nhỏ, upload bản mới, trả URL mới
  {
    const sb = fakeSupabase({ 'internal_social/u1/big.png': big });
    const url = BASE + 'internal_social/u1/big.png';
    const r = await optimizeAvatarUrl(url, 'u1', { supabase: sb, resize: fakeResize, ...quiet });
    assert.strictEqual(r.optimized, true);
    assert.notStrictEqual(r.url, url);
    assert.ok(r.url.startsWith(BASE + 'internal_social/u1/avatar_') && r.url.endsWith('.webp'));
    assert.strictEqual(sb.uploads.length, 1);
    assert.strictEqual(sb.uploads[0].opts.contentType, 'image/webp');
    assert.ok(r.afterBytes < r.beforeBytes);
    ok('ảnh lớn: thu nhỏ và trỏ sang bản mới');
  }

  // 6) thu nhỏ thất bại → giữ URL gốc
  {
    const sb = fakeSupabase({ 'internal_social/u1/big.png': big });
    const url = BASE + 'internal_social/u1/big.png';
    const r = await optimizeAvatarUrl(url, 'u1', { supabase: sb, resize: async () => null, ...quiet });
    assert.strictEqual(r.optimized, false);
    assert.strictEqual(r.url, url);
    ok('ffmpeg lỗi/thiếu: giữ URL gốc');
  }

  // 7) kết quả không nhỏ hơn → giữ URL gốc
  {
    const sb = fakeSupabase({ 'internal_social/u1/big.png': big });
    const url = BASE + 'internal_social/u1/big.png';
    const r = await optimizeAvatarUrl(url, 'u1', { supabase: sb, resize: async () => ({ buffer: Buffer.alloc(big.length + 1), ext: 'jpg', mime: 'image/jpeg' }), ...quiet });
    assert.strictEqual(r.optimized, false);
    assert.strictEqual(r.url, url);
    ok('kết quả không nhỏ hơn: giữ URL gốc');
  }

  // 8) lỗi tải / lỗi bất ngờ → giữ URL gốc, không ném lỗi
  {
    const sb = fakeSupabase({});
    sb.storage.from = () => ({
      getPublicUrl: (p) => ({ data: { publicUrl: BASE + p } }),
      download: async () => { throw new Error('mạng đứt'); },
      upload: async () => ({ error: { message: 'x' } }),
    });
    const url = BASE + 'internal_social/u1/big.png';
    const r = await optimizeAvatarUrl(url, 'u1', { supabase: sb, resize: fakeResize, ...quiet });
    assert.strictEqual(r.optimized, false);
    assert.strictEqual(r.url, url);
    ok('lỗi bất ngờ: không ném lỗi, giữ URL gốc');
  }

  // 9) rỗng
  {
    const r = await optimizeAvatarUrl('', 'u1', { supabase: fakeSupabase({}), ...quiet });
    assert.strictEqual(r.url, '');
    ok('URL rỗng: trả rỗng');
  }

  // 10) resizeAvatarBuffer: thử WebP trước, rơi về JPEG khi bộ mã hoá WebP thiếu
  {
    const calls = [];
    const fs = require('fs');
    const run = async (args) => {
      calls.push(args);
      const out = args[args.length - 1];
      if (out.endsWith('.webp')) throw Object.assign(new Error('no libwebp'), { code: 'FFMPEG_FAIL' });
      fs.writeFileSync(out, Buffer.from([1, 2, 3, 4]));
    };
    const r = await resizeAvatarBuffer(Buffer.from('x'), { run });
    assert.strictEqual(r.ext, 'jpg');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[0].includes('libwebp') && calls[1].includes('mjpeg'));
    ok('resizeAvatarBuffer: WebP lỗi → rơi về JPEG');
  }
  {
    const run = async () => { throw Object.assign(new Error('no ffmpeg'), { code: 'NO_FFMPEG' }); };
    const r = await resizeAvatarBuffer(Buffer.from('x'), { run });
    assert.strictEqual(r, null);
    ok('resizeAvatarBuffer: thiếu ffmpeg → null');
  }

  console.log(`\n${passed} kiểm tra đạt`);
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

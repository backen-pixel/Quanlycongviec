/**
 * Làm nhẹ ảnh đại diện (avatar) khi người dùng đổi avatar.
 *
 * Vấn đề: web tải ảnh gốc lên Storage rồi lưu nguyên URL vào users.avatar — có avatar là PNG/ảnh chụp màn hình hàng chục MB, khiến
 * app mobile / chat overlay tải rất chậm và tốn dữ liệu. Giải pháp: ngay khi nhận URL avatar mới, server tải ảnh từ Storage, cắt
 * thu nhỏ cho vừa khung 512px (giữ nguyên tỷ lệ, KHÔNG cắt), nén WebP (dự phòng JPEG), lưu bản nhỏ và dùng URL bản nhỏ.
 *
 * An toàn:
 * - Chỉ xử lý URL nằm trong Storage của chính dự án (bucket attachments) — URL ngoài (vd. ảnh Google) giữ nguyên, tránh SSRF.
 * - Bất kỳ lỗi nào (thiếu ffmpeg, ảnh hỏng, upload lỗi…) → trả về URL gốc; không bao giờ làm hỏng việc đổi avatar.
 * - Ảnh gốc KHÔNG bị xoá (có thể đang được bài viết khác dùng).
 *
 * Dùng ffmpeg-static (đã có trong dependencies) hoặc biến môi trường FFMPEG_PATH — không thêm thư viện mới.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BUCKET = 'attachments';
/** Cạnh tối đa (px) của avatar sau khi thu nhỏ. */
const AVATAR_MAX_PX = 512;
/** Ảnh gốc nhỏ hơn mức này thì bỏ qua, không cần xử lý. */
const SMALL_ENOUGH_BYTES = 150 * 1024;

function resolveFfmpegPath() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return process.env.FFMPEG_PATH || null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpegPath();
    if (!bin) {
      const err = new Error('Thiếu ffmpeg (cài ffmpeg-static hoặc set FFMPEG_PATH)');
      err.code = 'NO_FFMPEG';
      reject(err);
      return;
    }
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const err = new Error(`ffmpeg thoát ${code}: ${stderr.slice(-300)}`);
        err.code = 'FFMPEG_FAIL';
        reject(err);
      }
    });
  });
}

/**
 * Bộ lọc: chỉ THU NHỎ cho vừa khung maxPx×maxPx, GIỮ NGUYÊN tỷ lệ và toàn bộ ảnh (không cắt). Ảnh bé hơn khung giữ nguyên
 * kích thước (không phóng to). Nơi hiển thị avatar tròn tự lấy phần giữa (object-fit: cover) nên hình nhìn không đổi.
 */
function buildScaleFilter(maxPx = AVATAR_MAX_PX) {
  return `scale='min(${maxPx},iw)':'min(${maxPx},ih)':force_original_aspect_ratio=decrease`;
}

/**
 * Thu nhỏ một ảnh trong bộ nhớ. Trả về { buffer, ext, mime } hoặc null nếu không làm được.
 * @param {Buffer} input
 * @param {{ run?: (args: string[]) => Promise<void> }} [deps] — để test thay runner ffmpeg
 */
async function resizeAvatarBuffer(input, deps = {}) {
  const run = deps.run || runFfmpeg;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'avatar-'));
  const inPath = path.join(dir, 'in.bin');
  try {
    await fs.promises.writeFile(inPath, input);
    const attempts = [
      { ext: 'webp', mime: 'image/webp', codec: ['-c:v', 'libwebp', '-quality', '82'] },
      { ext: 'jpg', mime: 'image/jpeg', codec: ['-c:v', 'mjpeg', '-q:v', '3', '-pix_fmt', 'yuvj420p'] },
    ];
    for (const a of attempts) {
      const outPath = path.join(dir, `out.${a.ext}`);
      try {
        await run(['-y', '-v', 'error', '-i', inPath, '-vf', buildScaleFilter(), '-frames:v', '1', ...a.codec, outPath]);
        const buf = await fs.promises.readFile(outPath);
        if (buf.length > 0) return { buffer: buf, ext: a.ext, mime: a.mime };
      } catch (e) {
        if (e && e.code === 'NO_FFMPEG') return null;
        // thử bộ mã hoá kế tiếp
      }
    }
    return null;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** URL công khai của Storage + tiền tố bucket, ví dụ https://xxx.supabase.co/storage/v1/object/public/attachments/ */
function publicBaseOf(supabase) {
  const u = supabase.storage.from(BUCKET).getPublicUrl('__probe__').data.publicUrl;
  return String(u).replace(/__probe__$/, '');
}

/** Lấy đường dẫn đối tượng trong bucket từ URL công khai; null nếu URL không thuộc Storage của dự án hoặc đáng ngờ. */
function storagePathFromUrl(url, publicBase) {
  const s = String(url || '').trim();
  if (!s || !publicBase || !s.startsWith(publicBase)) return null;
  let p = s.slice(publicBase.length).split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch { return null; }
  if (!p || p.includes('..') || p.startsWith('/')) return null;
  return p;
}

/**
 * Trả về { url, optimized, reason?, beforeBytes?, afterBytes? }.
 * @param {string} url URL avatar người dùng vừa chọn
 * @param {string} userId
 * @param {{ supabase?: any, resize?: Function, log?: (m: string) => void }} [deps]
 */
async function optimizeAvatarUrl(url, userId, deps = {}) {
  const original = String(url == null ? '' : url).trim();
  const log = deps.log || ((m) => console.warn(m));
  if (!original || !userId) return { url: original, optimized: false, reason: 'empty' };
  try {
    // eslint-disable-next-line global-require
    const supabase = deps.supabase || require('../config/supabase').supabase;
    const resize = deps.resize || resizeAvatarBuffer;
    const storagePath = storagePathFromUrl(original, publicBaseOf(supabase));
    if (!storagePath) return { url: original, optimized: false, reason: 'external' };

    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) return { url: original, optimized: false, reason: 'download_failed' };
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.length <= SMALL_ENOUGH_BYTES) {
      return { url: original, optimized: false, reason: 'small', beforeBytes: buffer.length };
    }

    const out = await resize(buffer);
    if (!out || !out.buffer || !out.buffer.length) return { url: original, optimized: false, reason: 'resize_failed' };
    if (out.buffer.length >= buffer.length) return { url: original, optimized: false, reason: 'not_smaller' };

    // Chạy thử: chỉ báo ước tính, KHÔNG ghi gì lên Storage.
    if (deps.dryRun) {
      return { url: original, optimized: false, reason: 'dry_run', beforeBytes: buffer.length, afterBytes: out.buffer.length };
    }

    const newPath = `internal_social/${userId}/avatar_${Date.now()}.${out.ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, out.buffer, { contentType: out.mime, upsert: false });
    if (upErr) {
      log(`[avatarOptimize] upload lỗi: ${upErr.message || upErr}`);
      return { url: original, optimized: false, reason: 'upload_failed' };
    }
    const newUrl = supabase.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
    return { url: newUrl, optimized: true, beforeBytes: buffer.length, afterBytes: out.buffer.length };
  } catch (e) {
    log(`[avatarOptimize] bỏ qua do lỗi: ${e && e.message ? e.message : e}`);
    return { url: original, optimized: false, reason: 'error' };
  }
}

module.exports = {
  optimizeAvatarUrl,
  resizeAvatarBuffer,
  storagePathFromUrl,
  publicBaseOf,
  buildScaleFilter,
  AVATAR_MAX_PX,
  SMALL_ENOUGH_BYTES,
};

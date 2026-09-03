import { resolveMediaUrl } from './mediaUrl';
import { resolveApiOrigin } from './apiOrigin';

const LOCAL_UPLOAD_PREFIXES = ['/uploads/messenger-chat/', '/uploads/lead-chat/'];

function localUploadPathFromUrl(url) {
  const t = String(url || '').trim();
  if (!t) return '';
  if (t.startsWith('/uploads/')) return t;
  try {
    const u = new URL(t);
    if (u.pathname.startsWith('/uploads/')) return u.pathname;
  } catch {
    /* ignore */
  }
  return '';
}

function isLocalUploadPath(url) {
  const p = localUploadPathFromUrl(url);
  return LOCAL_UPLOAD_PREFIXES.some((prefix) => p.startsWith(prefix));
}

async function saveBlobDownload(blob, fileName) {
  try {
    const { saveAs } = await import('file-saver');
    saveAs(blob, fileName);
  } catch {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

/** SPA static host (tubep-frontend) trả index.html 200 cho /uploads/... — không phải file thật. */
function canServeUploadsFromPageOrigin() {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  const apiOrigin = (resolveApiOrigin() || '').replace(/\/$/, '');
  return !apiOrigin || apiOrigin === window.location.origin;
}

/** Từ chối blob HTML/JSON (thường do SPA fallback hoặc trang lỗi được lưu nhầm thành .xlsx). */
async function assertValidDownloadBlob(blob, fileName) {
  if (!blob || blob.size < 4) {
    throw new Error('File tải về rỗng hoặc hỏng — hãy gửi lại file trong chat');
  }
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const sig4 = String.fromCharCode(head[0], head[1], head[2], head[3]);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isPdf = sig4 === '%PDF';
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  const zipExt = new Set(['xlsx', 'xlsm', 'docx', 'pptx', 'zip']);
  if (zipExt.has(ext) && !isZip) {
    throw new Error('File Excel/Word tải về không hợp lệ — có thể đã mất trên server, hãy gửi lại');
  }
  if (ext === 'pdf' && !isPdf) {
    throw new Error('File PDF tải về không hợp lệ — hãy gửi lại file trong chat');
  }
  const textHead = new TextDecoder('utf-8', { fatal: false }).decode(head).trimStart();
  if (textHead.startsWith('<!DOCTYPE') || textHead.startsWith('<html') || textHead.startsWith('{')) {
    throw new Error('File không còn trên máy chủ — hãy gửi lại file trong chat');
  }
  return blob;
}

async function fetchLocalUploadBlob(urlPath, fileName) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const qs = new URLSearchParams({ path: urlPath, name: fileName || 'download' });
  const pathOnly = localUploadPathFromUrl(urlPath);

  const candidates = [
    `/api/messenger/files/download?${qs}`,
    `/api/upload/serve-local?${qs}`,
  ];

  const apiOrigin = (resolveApiOrigin() || '').replace(/\/$/, '');
  if (apiOrigin && typeof window !== 'undefined' && apiOrigin !== window.location.origin) {
    candidates.push(
      `${apiOrigin}/api/messenger/files/download?${qs}`,
      `${apiOrigin}/api/upload/serve-local?${qs}`,
    );
  }
  if (pathOnly?.startsWith('/uploads/') && canServeUploadsFromPageOrigin()) {
    candidates.push(`${window.location.origin}${pathOnly}`);
  }

  let lastErr = null;
  for (const href of [...new Set(candidates.filter(Boolean))]) {
    try {
      const needsAuth = href.includes('/api/');
      const res = await fetch(href, {
        credentials: 'include',
        headers: needsAuth && token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const blob = await res.blob();
        try {
          return await assertValidDownloadBlob(blob, fileName);
        } catch (e) {
          lastErr = e;
          continue;
        }
      }
      if (res.status === 404) {
        lastErr = new Error('File không còn trên máy chủ — hãy gửi lại file trong chat');
        continue;
      }
      const body = await res.json().catch(() => ({}));
      lastErr = new Error(body?.error || `Không tải được tệp (HTTP ${res.status})`);
    } catch (e) {
      lastErr = e?.message === 'Failed to fetch'
        ? new Error('Không kết nối được server — kiểm tra backend đang chạy')
        : e;
    }
  }
  throw lastErr || new Error('Không tải được tệp');
}

/** Ký tự Latin mở rộng (tiếng Việt có dấu, gồm Ứ ư ự …). */
const VIETNAMESE_NAME_CHARS = 'a-zA-Z0-9.\\u00C0-\\u024F\\u1E00-\\u1EFF\\u0100-\\u017F';

/** Có dấu hiệu UTF-8 bị đọc nhầm Latin-1 (Multer). */
function looksLikeUtf8Mojibake(name) {
  return /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|Ä[\u0080-\u00BF]|Æ|Ð|á»|Ã©|Ã¨|Ãª|Ã­|Ã³|Ã´|Ãº|Ã½|Äƒ|Ä‘|Æ°|Æ¡/i.test(String(name || ''));
}

/** Sửa tên file bị Multer encode sai (Latin-1 → UTF-8). */
function decodeMulterFilename(name) {
  if (name == null || name === '') return '';
  const s = String(name).trim();
  if (/[\u1E00-\u1EFF]/.test(s) && !looksLikeUtf8Mojibake(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded && !decoded.includes('\uFFFD') && decoded !== s) return decoded.trim();
  } catch {
    /* ignore */
  }
  return s;
}

/** @deprecated alias */
export function fixMessengerFilename(name) {
  return decodeMulterFilename(name);
}

/** Bỏ prefix timestamp/hash khi DB chỉ còn tên object storage. */
function unwrapStorageAttachmentName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const m = s.match(/^\d{10,}_[a-f0-9]{6,16}_(.+)$/i);
  if (!m) return s;
  const base = m[1];
  return base.includes('_') ? base.replace(/_/g, ' ') : base;
}

/** Tên hiển thị tệp đính kèm messenger (ưu tiên metadata, fallback URL). */
export function displayMessengerFilename(source) {
  const att = typeof source === 'string' ? { name: source } : source;
  const raw = att?.name || att?.attachment_name || att?.file_name || '';
  let name = decodeMulterFilename(raw);
  if (!name) {
    const url = att?.url || att?.attachment_url || '';
    const base = decodeURIComponent(String(url).split('/').pop()?.split('?')[0] || '');
    if (/^\d{10,}_[a-f0-9]{6,16}_/i.test(base)) {
      name = decodeMulterFilename(unwrapStorageAttachmentName(base));
    } else {
      name = decodeMulterFilename(base);
    }
  } else if (/^\d{10,}_[a-f0-9]{6,16}_/i.test(name)) {
    name = decodeMulterFilename(unwrapStorageAttachmentName(name));
  }
  return name || 'Tệp đính kèm';
}

/** Chuẩn hoá attachment — tên file hiển thị đúng tiếng Việt. */
export function normalizeMessengerAttachment(att) {
  if (!att || typeof att !== 'object') return att;
  const name = displayMessengerFilename(att);
  return name !== att.name ? { ...att, name } : att;
}

/** Nội dung text để chia sẻ (có tên người gửi). */
export function buildMessengerShareText(msg, { groupTitle } = {}) {
  if (!msg) return '';
  const header = groupTitle ? `[${groupTitle}] ` : '';
  const who = msg.user?.full_name || 'Ai đó';
  const body = extractMessengerMessagePlainText(msg);
  const atts = collectMessengerAttachments(msg);
  const lines = [`${header}${who}:`];
  if (body) lines.push(body);
  for (const a of atts) {
    const u = resolveMediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!body && !atts.length && msg.attachment_url) {
    lines.push(resolveMediaUrl(msg.attachment_url) || '');
  }
  return lines.filter(Boolean).join('\n').trim();
}

/** Nội dung thuần để sao chép — không kèm tên người gửi / header nhóm. */
export function extractMessengerMessagePlainText(msg) {
  if (!msg) return '';
  let body = normalizeForwardDisplayContent(String(msg.content || '').trim()) || String(msg.content || '').trim();
  if (body.startsWith(':sticker:')) {
    body = body.slice(':sticker:'.length).trim();
  }
  return body;
}

/** Sao chép tin nhắn — chỉ nội dung, không prefix tên người gửi. */
export function buildMessengerCopyText(msg) {
  if (!msg) return '';
  const body = extractMessengerMessagePlainText(msg);
  const atts = collectMessengerAttachments(msg);
  const lines = [];
  if (body) lines.push(body);
  for (const a of atts) {
    const u = resolveMediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!body && !atts.length && msg.attachment_url) {
    lines.push(resolveMediaUrl(msg.attachment_url) || '');
  }
  return lines.filter(Boolean).join('\n').trim();
}

export function collectMessengerAttachments(message) {
  if (Array.isArray(message?.attachments) && message.attachments.length) {
    return message.attachments.map(normalizeMessengerAttachment);
  }
  if (message?.attachment_url) {
    return [normalizeMessengerAttachment({
      url: message.attachment_url,
      name: message.attachment_name,
      type: message.attachment_mime,
      size: message.attachment_size,
    })];
  }
  return [];
}

export function getFirstImageAttachment(msg) {
  const items = collectMessengerAttachments(msg);
  for (const a of items) {
    if ((a.type || '').startsWith('image/') || isImageAttachmentName(a.name || a.url)) return a;
  }
  const mime = msg?.attachment_mime || '';
  if ((mime.startsWith('image/') || isImageAttachmentName(msg?.attachment_name || msg?.attachment_url)) && msg?.attachment_url) {
    return { url: msg.attachment_url, name: msg.attachment_name, type: mime || 'image/jpeg' };
  }
  return null;
}

export function getImageAttachments(msg) {
  const items = collectMessengerAttachments(msg);
  const images = items.filter((a) => (a.type || '').startsWith('image/') || isImageAttachmentName(a.name || a.url));
  if (images.length) return images;
  const one = getFirstImageAttachment(msg);
  return one ? [one] : [];
}

function isImageAttachmentName(nameOrUrl) {
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)(?:$|\?)/i.test(String(nameOrUrl || ''));
}

export function getFirstDownloadableAttachment(msg) {
  const img = getFirstImageAttachment(msg);
  if (img) return img;
  const items = collectMessengerAttachments(msg);
  if (items.length) return items[0];
  if (msg?.attachment_url) {
    return {
      url: msg.attachment_url,
      name: msg.attachment_name,
      type: msg.attachment_mime,
    };
  }
  return null;
}

export async function copyTextToClipboard(text) {
  const t = (text || '').trim();
  if (!t) throw new Error('Không có nội dung để sao chép');
  await navigator.clipboard.writeText(t);
}

async function loadImageBlobViaCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Không tạo được ảnh'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh'))),
          'image/png',
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Không tải được ảnh'));
    img.src = url;
  });
}

async function fetchMessengerImageBlob(url) {
  // /uploads trả ACAO * — không dùng credentials: 'include' (trình duyệt chặn kết hợp này).
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('Không tải được ảnh');
  const blob = await res.blob();
  if (blob.size > 0) return blob;
  throw new Error('Ảnh rỗng');
}

/** Clipboard API thường chỉ chấp nhận image/png khi ghi — chuyển JPEG/WebP/… sang PNG. */
async function blobToPngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const objUrl = URL.createObjectURL(blob);
  try {
    return await loadImageBlobViaCanvas(objUrl);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

async function fetchImageAsPngBlob(url) {
  const full = resolveMediaUrl(url);
  if (!full) throw new Error('URL ảnh không hợp lệ');
  let blob;
  try {
    const { fetchUploadBlob } = await import('./publicFileUrl');
    blob = await fetchUploadBlob(url);
  } catch {
    try {
      blob = await fetchMessengerImageBlob(full);
    } catch {
      blob = await loadImageBlobViaCanvas(full);
    }
  }
  return blobToPngBlob(blob);
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh'))),
      'image/png',
    );
  });
}

/** Ghép nhiều ảnh thành 1 tấm (dọc) để dán clipboard. */
async function stitchPngBlobs(pngBlobs) {
  const MAX_W = 1600;
  const MAX_H = 14000;
  const GAP = 8;
  const bitmaps = [];
  for (const blob of pngBlobs) {
    try {
      bitmaps.push(await createImageBitmap(blob));
    } catch {
      const objUrl = URL.createObjectURL(blob);
      try {
        const imgBlob = await loadImageBlobViaCanvas(objUrl);
        bitmaps.push(await createImageBitmap(imgBlob));
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
  }
  if (!bitmaps.length) throw new Error('Không tạo được ảnh');

  const maxW = Math.min(MAX_W, Math.max(...bitmaps.map((b) => b.width), 1));
  const scaled = bitmaps.map((b) => {
    const scale = Math.min(1, maxW / Math.max(b.width, 1));
    return { bmp: b, w: Math.max(1, Math.round(b.width * scale)), h: Math.max(1, Math.round(b.height * scale)) };
  });
  let totalH = scaled.reduce((s, x) => s + x.h, 0) + GAP * Math.max(0, scaled.length - 1);
  const extra = totalH > MAX_H ? MAX_H / totalH : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(maxW * extra));
  canvas.height = Math.max(1, Math.round(totalH * extra));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được ảnh');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const s of scaled) {
    const w = Math.max(1, Math.round(s.w * extra));
    const h = Math.max(1, Math.round(s.h * extra));
    ctx.drawImage(s.bmp, 0, y, w, h);
    if (typeof s.bmp.close === 'function') s.bmp.close();
    y += h + Math.round(GAP * extra);
  }
  return canvasToPngBlob(canvas);
}

function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export async function copyImageToClipboard(url) {
  const full = resolveMediaUrl(url);
  if (!full) throw new Error('URL ảnh không hợp lệ');
  const pngBlob = await fetchImageAsPngBlob(url);
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    await navigator.clipboard.writeText(full);
    return 'url';
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    return 'image';
  } catch {
    await navigator.clipboard.writeText(full);
    return 'url';
  }
}

/** Sao chép nhiều ảnh: PNG ghép 1 tấm (Zalo/chat) + HTML nhiều img (Word). */
export async function copyImagesToClipboard(urls) {
  const list = [...new Set((urls || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!list.length) throw new Error('Không có ảnh');
  if (list.length === 1) return copyImageToClipboard(list[0]);

  const pngBlobs = [];
  for (const url of list) {
    try {
      pngBlobs.push(await fetchImageAsPngBlob(url));
    } catch {
      /* bỏ ảnh lỗi, copy phần còn lại */
    }
  }
  if (!pngBlobs.length) throw new Error('Không tải được ảnh để sao chép');

  const collage = await stitchPngBlobs(pngBlobs);
  const html = `<div>${list
    .map((u) => `<img src="${escapeHtmlAttr(resolveMediaUrl(u) || u)}" />`)
    .join('<br/>')}</div>`;
  const links = list.map((u) => resolveMediaUrl(u) || u).join('\n');

  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    await navigator.clipboard.writeText(links);
    return 'url';
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': collage,
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
    return pngBlobs.length === list.length ? 'images' : 'images-partial';
  } catch {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': collage })]);
      return pngBlobs.length === list.length ? 'images' : 'images-partial';
    } catch {
      await navigator.clipboard.writeText(links);
      return 'url';
    }
  }
}

export async function downloadMessengerFile(url, name) {
  const fileName = fixMessengerFilename(name) || 'download';
  const localPath = localUploadPathFromUrl(url) || localUploadPathFromUrl(resolveMediaUrl(url));

  if (localPath && isLocalUploadPath(localPath)) {
    const blob = await fetchLocalUploadBlob(localPath, fileName);
    await saveBlobDownload(blob, fileName);
    return;
  }

  const full = resolveMediaUrl(url);
  if (!full) return Promise.reject(new Error('URL không hợp lệ'));

  try {
    const res = await fetch(full, {
      mode: 'cors',
      credentials: 'omit',
      headers: {},
    });
    if (!res.ok) throw new Error('Không tải được tệp');
    const blob = await assertValidDownloadBlob(await res.blob(), fileName);
    await saveBlobDownload(blob, fileName);
  } catch (e) {
    throw new Error(
      e?.message === 'Failed to fetch'
        ? 'Không tải được tệp — kiểm tra kết nối hoặc file đã bị xóa trên máy chủ'
        : (e?.message || 'Không tải được tệp'),
    );
  }
}

/** Tải hết ảnh trong 1 tin nhắn — 1 ảnh thì tải lẻ, nhiều ảnh gói ZIP. */
export async function downloadAllMessengerImages(message) {
  const images = getImageAttachments(message);
  if (!images.length) throw new Error('Tin nhắn không có ảnh');
  if (images.length === 1) {
    await downloadMessengerFile(images[0].url, images[0].name || 'anh.jpg');
    return { ok: 1, total: 1 };
  }
  const { downloadUploadFilesAsZip } = await import('./publicFileUrl');
  return downloadUploadFilesAsZip(
    images.map((img, i) => ({
      url: resolveMediaUrl(img.url) || img.url,
      name: fixMessengerFilename(img.name) || `anh-${i + 1}.jpg`,
    })),
    `anh-tin-nhan-${images.length}.zip`,
  );
}

/** Mở tệp trong tab mới (blob URL — tránh cross-origin chặn mở trực tiếp). */
export async function openMessengerFile(url, name) {
  const fileName = fixMessengerFilename(name) || 'download';
  const localPath = localUploadPathFromUrl(url) || localUploadPathFromUrl(resolveMediaUrl(url));

  try {
    let blob;
    if (localPath && isLocalUploadPath(localPath)) {
      blob = await fetchLocalUploadBlob(localPath, fileName);
    } else {
      const full = resolveMediaUrl(url);
      if (!full) throw new Error('URL không hợp lệ');
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(full, {
        mode: 'cors',
        credentials: 'omit',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('fetch failed');
      blob = await assertValidDownloadBlob(await res.blob(), fileName);
    }
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      await saveBlobDownload(blob, fileName);
      URL.revokeObjectURL(blobUrl);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  } catch {
    await downloadMessengerFile(url, name);
  }
}

/** Tên nguồn chia sẻ (chat / người gửi gốc) — một nhãn, không lặp. */
function forwardSourceLabel(sourceTitle, msg) {
  const who = msg?.user?.full_name || msg?.user?.email || '';
  const title = String(sourceTitle || '')
    .trim()
    .replace(/^«\s*|\s*»$/g, '');
  return title || who || '';
}

/** Rút gọn header chia sẻ cũ khi hiển thị (tin đã gửi trước khi đổi format). */
export function normalizeForwardDisplayContent(content) {
  if (!content || typeof content !== 'string') return content;
  return content
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) «([^»]+)» — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n')
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) ([^\n—]+?) — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n');
}

/** Nội dung gửi sang chat khác khi chuyển tiếp / chia sẻ tin nhắn. */
export function buildForwardMessageContent(msg, { sourceTitle, note } = {}) {
  if (!msg) return '';
  const from = forwardSourceLabel(sourceTitle, msg);
  const lines = [];
  if (note?.trim()) lines.push(note.trim());
  lines.push(from ? `↪ Chia sẻ từ ${from}` : '↪ Chia sẻ tin nhắn');
  const text = (msg.content || '').trim();
  if (text) lines.push(text);
  const atts = collectMessengerAttachments(msg);
  for (const a of atts) {
    const u = resolveMediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!text && !atts.length && msg.attachment_url) {
    const u = resolveMediaUrl(msg.attachment_url);
    if (u) lines.push(u);
  }
  return lines.filter(Boolean).join('\n\n');
}

/** Gộp nhiều tin để sao chép — chỉ nội dung từng tin. */
export function buildBulkMessengerCopyText(messages) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  return list.map((m) => buildMessengerCopyText(m)).filter(Boolean).join('\n\n———\n\n');
}

/** Gộp nhiều tin để chia sẻ hàng loạt. */
export function buildBulkMessengerShareText(messages, opts = {}) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  return list.map((m) => buildMessengerShareText(m, opts)).filter(Boolean).join('\n\n———\n\n');
}

export function buildBulkForwardMessageContent(messages, opts = {}) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return buildForwardMessageContent(list[0], opts);
  const { sourceTitle, note } = opts;
  const lines = [];
  if (note?.trim()) lines.push(note.trim());
  const from = forwardSourceLabel(sourceTitle, list[0]);
  lines.push(
    from ? `↪ Chia sẻ ${list.length} tin từ ${from}` : `↪ Chia sẻ ${list.length} tin nhắn`,
  );
  list.forEach((msg, i) => {
    const text = (msg.content || '').trim();
    lines.push(`\n${i + 1}.`);
    if (text) lines.push(text);
    const atts = collectMessengerAttachments(msg);
    for (const a of atts) {
      const u = resolveMediaUrl(a.url);
      if (u) lines.push(u);
    }
    if (!text && !atts.length && msg.attachment_url) {
      const u = resolveMediaUrl(msg.attachment_url);
      if (u) lines.push(u);
    }
  });
  return lines.filter(Boolean).join('\n').trim();
}

export async function shareMessengerMessage(msg, opts) {
  const text = buildMessengerShareText(msg, opts);
  if (!text) throw new Error('Không có nội dung để chia sẻ');
  if (navigator.share) {
    try {
      await navigator.share({ text, title: opts?.groupTitle || 'Tin nhắn' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  await copyTextToClipboard(text);
}

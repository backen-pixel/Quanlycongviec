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

function saveBlobDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

async function fetchLocalUploadBlob(urlPath, fileName) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const qs = new URLSearchParams({ path: urlPath, name: fileName || 'download' });
  const pathOnly = localUploadPathFromUrl(urlPath);

  const candidates = [];
  if (pathOnly?.startsWith('/uploads/') && typeof window !== 'undefined') {
    candidates.push(`${window.location.origin}${pathOnly}`);
  }
  candidates.push(
    `/api/messenger/files/download?${qs}`,
    `/api/upload/serve-local?${qs}`,
  );

  const apiOrigin = (resolveApiOrigin() || '').replace(/\/$/, '');
  if (apiOrigin && typeof window !== 'undefined' && apiOrigin !== window.location.origin) {
    candidates.push(
      `${apiOrigin}/api/messenger/files/download?${qs}`,
      `${apiOrigin}/api/upload/serve-local?${qs}`,
    );
  }

  let lastErr = null;
  for (const href of [...new Set(candidates.filter(Boolean))]) {
    try {
      const needsAuth = href.includes('/api/');
      const res = await fetch(href, {
        credentials: 'include',
        headers: needsAuth && token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) return res.blob();
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
    if ((a.type || '').startsWith('image/')) return a;
  }
  const mime = msg?.attachment_mime || '';
  if (mime.startsWith('image/') && msg?.attachment_url) {
    return { url: msg.attachment_url, name: msg.attachment_name, type: mime };
  }
  return null;
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

export async function copyImageToClipboard(url) {
  const full = resolveMediaUrl(url);
  if (!full) throw new Error('URL ảnh không hợp lệ');
  let blob;
  try {
    blob = await fetchMessengerImageBlob(full);
  } catch {
    blob = await loadImageBlobViaCanvas(full);
  }
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    await navigator.clipboard.writeText(full);
    return 'url';
  }
  try {
    const pngBlob = await blobToPngBlob(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    return 'image';
  } catch {
    await navigator.clipboard.writeText(full);
    return 'url';
  }
}

export async function downloadMessengerFile(url, name) {
  const fileName = fixMessengerFilename(name) || 'download';
  const localPath = localUploadPathFromUrl(url) || localUploadPathFromUrl(resolveMediaUrl(url));

  if (localPath && isLocalUploadPath(localPath)) {
    const blob = await fetchLocalUploadBlob(localPath, fileName);
    saveBlobDownload(blob, fileName);
    return;
  }

  const full = resolveMediaUrl(url);
  if (!full) return Promise.reject(new Error('URL không hợp lệ'));
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  try {
    const res = await fetch(full, {
      mode: 'cors',
      credentials: 'omit',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Không tải được tệp');
    const blob = await res.blob();
    saveBlobDownload(blob, fileName);
  } catch (e) {
    throw new Error(
      e?.message === 'Failed to fetch'
        ? 'Không tải được tệp — kiểm tra kết nối hoặc file đã bị xóa trên máy chủ'
        : (e?.message || 'Không tải được tệp'),
    );
  }
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
      blob = await res.blob();
    }
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      saveBlobDownload(blob, fileName);
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

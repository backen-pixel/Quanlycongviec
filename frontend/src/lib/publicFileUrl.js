/**
 * Chuẩn hoá URL file tĩnh (/uploads/...) khi frontend và API khác origin
 * hoặc khi VITE_API_URL trỏ thẳng tới backend.
 * Hỗ trợ data:/blob: (fallback upload) — không strip.
 *
 * Ảnh minh họa Kiến thức: ưu tiên Supabase Storage (bucket attachments/knowledge/).
 */
const DEFAULT_KNOWLEDGE_STORAGE =
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge';

function knowledgeStorageBase() {
  return (import.meta.env.VITE_KNOWLEDGE_STORAGE_URL || DEFAULT_KNOWLEDGE_STORAGE).replace(/\/$/, '');
}

/** Đổi số này khi thay ảnh cùng tên — tránh trình duyệt/CDN giữ bản cũ. */
const KNOWLEDGE_SHOT_VER = '20260819';

/** /uploads/knowledge-screenshots/lead-01.png → URL public trên Supabase */
function resolveKnowledgeScreenshotUrl(path) {
  const m = String(path || '').trim().match(
    /^(?:\/uploads\/knowledge-screenshots\/|uploads\/knowledge-screenshots\/)([^/?#]+)(?:\?.*)?$/i,
  );
  if (!m) return null;
  return `${knowledgeStorageBase()}/${m[1]}?v=${KNOWLEDGE_SHOT_VER}`;
}

export function publicFileUrl(pathOrUrl) {
  if (pathOrUrl == null || pathOrUrl === '') return '';
  const s = String(pathOrUrl).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s) || /^blob:/i.test(s)) return s;

  const knowledgeUrl = resolveKnowledgeScreenshotUrl(s);
  if (knowledgeUrl) return knowledgeUrl;

  let base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (!base && typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.includes('tubep-frontend') && hostname.endsWith('.onrender.com')) {
      base = 'https://tubep-backend.onrender.com';
    }
  }
  if (base && s.startsWith('/')) return `${base}${s}`;
  if (base && !s.startsWith('//')) {
    const path = s.startsWith('/') ? s : `/${s.replace(/^\//, '')}`;
    return `${base}${path}`;
  }
  if (s.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${s}`;
  }
  return s;
}

/** Đường dẫn /uploads/... cùng origin (Vite proxy dev → backend). */
export function sameOriginUploadPath(pathOrUrl) {
  const s = String(pathOrUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.pathname.startsWith('/uploads/')) return u.pathname;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function looksLikeHtmlOrSpaFallback(buf) {
  if (!buf || buf.byteLength < 15) return false;
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(new Uint8Array(buf.slice(0, 64)))
    .trimStart()
    .toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head');
}

/**
 * Tải file upload về Blob.
 * - /uploads/...: ưu tiên API serve-local (tránh SPA frontend trả index.html 200)
 * - URL tuyệt đối (Supabase…): fetch CORS, bỏ qua HTML giả
 */
export async function fetchUploadBlob(pathOrUrl) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const localPath = sameOriginUploadPath(pathOrUrl);
  const absolute = publicFileUrl(pathOrUrl);
  const candidates = [];

  if (localPath?.startsWith('/uploads/')) {
    const qs = new URLSearchParams({ path: localPath });
    candidates.push({ href: `/api/upload/serve-local?${qs}`, auth: true });
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      candidates.push({ href: localPath, auth: false });
    }
  }
  if (absolute && !absolute.startsWith('blob:') && !absolute.startsWith('data:')) {
    candidates.push({ href: absolute, auth: false });
  } else if (absolute) {
    candidates.push({ href: absolute, auth: false });
  }

  let lastErr = null;
  for (const { href, auth } of candidates) {
    if (!href) continue;
    try {
      const res = await fetch(href, {
        credentials: auth ? 'include' : 'omit',
        cache: 'no-store',
        headers: auth && token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        lastErr = new Error(`Không tải được file (HTTP ${res.status})`);
        continue;
      }
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 1) {
        lastErr = new Error('File tải về rỗng hoặc hỏng');
        continue;
      }
      if (looksLikeHtmlOrSpaFallback(buf)) {
        lastErr = new Error('File không còn trên máy chủ hoặc URL sai');
        continue;
      }
      const type = res.headers.get('content-type') || '';
      return new Blob([buf], type && !type.includes('text/html') ? { type } : undefined);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr?.message === 'Failed to fetch') {
    throw new Error('Không tải được file — kiểm tra kết nối hoặc thử «Tab mới» / «Tải».');
  }
  throw lastErr || new Error('Không tải được file');
}

/** Tải file upload về ArrayBuffer — ưu tiên same-origin /uploads (tránh CORS). */
export async function fetchUploadArrayBuffer(pathOrUrl) {
  const blob = await fetchUploadBlob(pathOrUrl);
  return blob.arrayBuffer();
}

/**
 * Chrome thường chặn tab mới (about:blank#blocked) với href data:/blob: + target=_blank.
 * Với URL thường vẫn mở tab mới.
 */
export function getFileOpenAnchorProps(pathOrUrl, opts = {}) {
  const href = publicFileUrl(pathOrUrl);
  if (!href) return null;
  const fileName = opts.fileName;
  const lower = href.trim().toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return {
      href,
      target: '_self',
      rel: 'noopener noreferrer',
      ...(fileName ? { download: fileName } : {}),
    };
  }
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
  };
}

/** Anchor props ưu tiên tải file về máy (không chỉ mở tab mới). */
export function getFileDownloadAnchorProps(pathOrUrl, opts = {}) {
  const href = publicFileUrl(pathOrUrl);
  if (!href) return null;
  const fileName = opts.fileName;
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    ...(fileName ? { download: fileName } : {}),
  };
}

/** In ảnh upload — mở cửa sổ tạm, tải blob (tránh CORS), rồi gọi print. */
export async function printUploadImage(pathOrUrl, title = 'Ảnh') {
  const printWin = window.open('', '_blank');
  if (!printWin) {
    throw new Error('Trình duyệt đã chặn cửa sổ in. Cho phép popup rồi thử lại.');
  }

  const safeTitle = String(title || 'Ảnh')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  printWin.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>`
    + '<style>html,body{margin:0;padding:0;background:#fff}'
    + 'img{max-width:100%;height:auto;display:block;margin:0 auto}'
    + '@media print{html,body{height:auto}img{max-width:100%;page-break-inside:avoid}}</style>'
    + '</head><body><p id="print-status" style="font-family:sans-serif;padding:16px;color:#666">Đang tải ảnh…</p></body></html>',
  );
  printWin.document.close();

  let src = '';
  let revoke = null;
  try {
    const buf = await fetchUploadArrayBuffer(pathOrUrl);
    if (!buf || buf.byteLength < 1) throw new Error('File rỗng');
    const blobUrl = URL.createObjectURL(new Blob([buf]));
    src = blobUrl;
    revoke = () => URL.revokeObjectURL(blobUrl);
  } catch {
    src = publicFileUrl(pathOrUrl);
  }

  if (!src) {
    try { printWin.close(); } catch { /* ignore */ }
    throw new Error('Không tìm thấy ảnh để in');
  }

  const body = printWin.document.body;
  body.innerHTML = '';
  const img = printWin.document.createElement('img');
  img.id = 'print-img';
  img.alt = String(title || 'Ảnh');
  img.src = src;
  body.appendChild(img);

  const cleanup = () => {
    if (revoke) {
      try { revoke(); } catch { /* ignore */ }
      revoke = null;
    }
    try { printWin.close(); } catch { /* ignore */ }
  };

  const doPrint = () => {
    try {
      printWin.focus();
      printWin.print();
    } catch { /* ignore */ }
    try {
      printWin.addEventListener('afterprint', cleanup, { once: true });
    } catch {
      window.setTimeout(cleanup, 1000);
    }
    // Fallback nếu afterprint không chạy (một số trình duyệt)
    window.setTimeout(cleanup, 120_000);
  };

  if (img.complete && img.naturalWidth > 0) {
    doPrint();
    return;
  }
  img.onload = doPrint;
  img.onerror = () => {
    body.innerHTML =
      '<p style="font-family:sans-serif;padding:16px;color:#b91c1c">Không tải được ảnh để in.</p>';
    if (revoke) {
      try { revoke(); } catch { /* ignore */ }
      revoke = null;
    }
  };
}

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/x-ms-bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/heic': '.heic',
  'image/heif': '.heic',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-excel.sheet.macroenabled.12': '.xlsm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'text/csv': '.csv',
  'text/plain': '.txt',
};

const IMAGE_EXTS = new Set(['.jpg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.avif']);

function extFromMime(mime) {
  const t = String(mime || '').toLowerCase().split(';')[0].trim();
  return MIME_TO_EXT[t] || '';
}

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.jpeg') return '.jpg';
  if (e === '.heif') return '.heic';
  return e;
}

function extFromFileName(name) {
  const m = String(name || '').trim().match(
    /(\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|pdf|xlsx|xlsm|xlsb|xls|csv|docx|docm|doc|pptx|pptm|ppt|odt|ods|odp|zip|rar|7z|txt|json|xml|dwg|dxf))$/i,
  );
  if (!m) return '';
  return normalizeExt(m[1]);
}

function extFromSrc(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const pathParam = u.searchParams.get('path');
    if (pathParam) {
      const e = extFromFileName(pathParam.split('/').pop() || '');
      if (e) return e;
    }
    const e = extFromFileName(u.pathname.split('/').pop() || '');
    if (e) return e;
  } catch {
    /* ignore */
  }
  return extFromFileName(s.split('?')[0].split('#')[0].split('/').pop() || '');
}

function isZipBytes(bytes) {
  return !!bytes && bytes.length >= 4
    && bytes[0] === 0x50 && bytes[1] === 0x4B
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

function isOleBytes(bytes) {
  return !!bytes && bytes.length >= 4
    && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
}

/** Office Open XML (.xlsx/.docx/.pptx) là ZIP — đọc tên file đầu trong header ZIP. */
function sniffOfficeZip(bytes) {
  if (!isZipBytes(bytes) || bytes.length < 34) return '';
  const nameLen = bytes[26] | (bytes[27] << 8);
  if (nameLen < 1 || 30 + nameLen > bytes.length) return '';
  let fname = '';
  for (let i = 0; i < nameLen; i += 1) fname += String.fromCharCode(bytes[30 + i]);
  const n = fname.replace(/\\/g, '/').toLowerCase();
  if (n.startsWith('xl/') || n.includes('workbook')) return '.xlsx';
  if (n.startsWith('word/') || n.includes('document.xml')) return '.docx';
  if (n.startsWith('ppt/') || n.includes('presentation')) return '.pptx';
  return '';
}

function sniffFileExt(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return '.jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return '.png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return '.gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return '.bmp';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return '.webp';
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return '.pdf';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return '.avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'heif' || brand === 'mif1' || brand === 'msf1') return '.heic';
  }
  const office = sniffOfficeZip(bytes);
  if (office) return office;
  return '';
}

function sanitizeDownloadBase(name, fallback = 'file') {
  return String(name || fallback).trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || fallback;
}

function withExt(name, ext) {
  const e = ext && ext.startsWith('.') ? ext.toLowerCase() : ext ? `.${ext.toLowerCase()}` : '';
  const base = sanitizeDownloadBase(name).replace(/\.[a-z0-9]{2,8}$/i, '') || 'file';
  return e ? `${base}${e}` : base;
}

function uniqueZipName(used, name) {
  let entry = name;
  let n = 2;
  while (used.has(entry.toLowerCase())) {
    const dot = name.lastIndexOf('.');
    entry = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    n += 1;
  }
  used.add(entry.toLowerCase());
  return entry;
}

function fileNameForBytes(bytes, fileName, src, mime) {
  const sniffed = sniffFileExt(bytes);
  const fromName = extFromFileName(fileName) || extFromSrc(src);
  const fromMime = extFromMime(mime);
  const zip = isZipBytes(bytes);
  const ole = isOleBytes(bytes);

  if (sniffed) return withExt(fileName || 'file', sniffed);

  const fakeImageName = IMAGE_EXTS.has(fromName) && (zip || ole);
  const fakeImageMime = IMAGE_EXTS.has(fromMime) && (zip || ole);
  if (fromName && !fakeImageName) return withExt(fileName || 'file', fromName);
  if (fromMime && !fakeImageMime) return withExt(fileName || 'file', fromMime);

  if (zip) return withExt(fileName || 'file', '.zip');
  if (ole) return withExt(fileName || 'file', fromName || '.xls');

  const raw = sanitizeDownloadBase(fileName, 'tai-lieu');
  if (/\.[a-z0-9]{2,8}$/i.test(raw)) return raw;
  return raw;
}

/** Tải file về máy — blob + file-saver (ổn định hơn anchor thủ công trên Chrome). */
export async function downloadUploadFile(pathOrUrl, fileName = 'tai-lieu') {
  const fallbackName = sanitizeDownloadBase(fileName, 'tai-lieu');
  try {
    const blob = await fetchUploadBlob(pathOrUrl);
    const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    const safeName = fileNameForBytes(bytes, fallbackName, pathOrUrl, blob.type);
    const { saveAs } = await import('file-saver');
    saveAs(blob, safeName);
  } catch (err) {
    const props = getFileDownloadAnchorProps(pathOrUrl, { fileName: fallbackName });
    if (props?.href && /^https?:\/\//i.test(props.href)) {
      // Fallback: mở URL gốc (Supabase thường vẫn cho tải qua tab).
      const a = document.createElement('a');
      a.href = props.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    throw new Error(err?.message || 'Không tải được file');
  }
}

/**
 * Tải nhiều ảnh/file thành 1 ZIP.
 * @param {Array<{ url?: string, rawPath?: string, name?: string, title?: string, mime?: string }>} items
 * @param {string} [zipName]
 */
export async function downloadUploadFilesAsZip(items, zipName = 'anh-binh-luan.zip') {
  const list = (items || []).filter((it) => it?.url || it?.rawPath);
  if (!list.length) throw new Error('Không có ảnh để tải');

  const JSZip = (await import('jszip')).default;
  const { saveAs } = await import('file-saver');
  const zip = new JSZip();
  const used = new Set();
  let ok = 0;
  let lastErr = null;

  for (let i = 0; i < list.length; i += 1) {
    const it = list[i];
    const src = it.rawPath || it.url;
    const rawName = String(it.name || it.title || `anh-${i + 1}`).trim() || `anh-${i + 1}`;
    try {
      const blob = await fetchUploadBlob(src);
      const buf = await blob.arrayBuffer();
      const extName = fileNameForBytes(
        new Uint8Array(buf.slice(0, 512)),
        rawName,
        src,
        it.mime || blob.type,
      );
      zip.file(uniqueZipName(used, extName), buf, { binary: true });
      ok += 1;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!ok) throw new Error(lastErr?.message || 'Không tải được ảnh');
  const out = await zip.generateAsync({ type: 'blob' });
  const safeZip = String(zipName || 'anh.zip').replace(/[\\/:*?"<>|]/g, '_') || 'anh.zip';
  saveAs(out, safeZip.endsWith('.zip') ? safeZip : `${safeZip}.zip`);
  return { ok, total: list.length };
}


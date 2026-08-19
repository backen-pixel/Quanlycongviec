import { API_ORIGIN } from '../config';

/** Chỉ encode khoảng trắng / ngoặc trên path — không decode URI (làm hỏng chữ ký URL). */
function encodeMediaPath(joined: string): string {
  const hashIdx = joined.indexOf('#');
  const hash = hashIdx >= 0 ? joined.slice(hashIdx) : '';
  const noHash = hashIdx >= 0 ? joined.slice(0, hashIdx) : joined;
  const qIdx = noHash.indexOf('?');
  const path = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const query = qIdx >= 0 ? noHash.slice(qIdx) : '';
  return path.replace(/ /g, '%20').replace(/\[/g, '%5B').replace(/\]/g, '%5D') + query + hash;
}

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  const joined = /^https?:\/\//i.test(u)
    ? u
    : `${API_ORIGIN}${u.startsWith('/') ? u : `/${u}`}`;
  try {
    return encodeMediaPath(joined);
  } catch {
    return joined.replace(/ /g, '%20');
  }
}

export function isHeicLike(url?: string | null, mime?: string | null): boolean {
  const m = String(mime || '').toLowerCase();
  if (m.includes('heic') || m.includes('heif')) return true;
  const path = String(url || '').split('?')[0].split('#')[0];
  return /\.(heic|heif)$/i.test(path);
}

export type ImageFileLike = {
  mime_type?: string | null;
  doc_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  name?: string | null;
};

export function isImageFile(input: ImageFileLike): boolean {
  const mime = String(input.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const dt = String(input.doc_type || '').toLowerCase();
  if (dt === 'image') return true;
  const name = String(input.file_name || input.name || input.file_url || '');
  const path = name.split('?')[0].split('#')[0];
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(path);
}

export type GalleryImageItem = {
  id: string;
  uri: string;
  title?: string;
  subtitle?: string;
};

export function toGalleryImage(
  id: string,
  input: ImageFileLike,
  meta?: { title?: string; subtitle?: string },
): GalleryImageItem | null {
  if (!isImageFile(input)) return null;
  const uri = resolveMediaUrl(input.file_url);
  if (!uri) return null;
  return {
    id,
    uri,
    title: meta?.title || input.file_name || input.name || 'Ảnh',
    subtitle: meta?.subtitle,
  };
}

const AVATAR_PALETTE = [
  '#3B82F6', '#F97316', '#A855F7', '#38BDF8', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6',
];

export function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initialsFromName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

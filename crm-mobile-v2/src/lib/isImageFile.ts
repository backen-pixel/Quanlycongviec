import { resolveMediaUrl } from './media';

export type ImageFileLike = {
  mime_type?: string | null;
  doc_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  name?: string | null;
};

function filePathOf(input: ImageFileLike): string {
  const name = String(input.file_name || input.name || input.file_url || '');
  return name.split('?')[0].split('#')[0];
}

export function isImageFile(input: ImageFileLike): boolean {
  const mime = String(input.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const dt = String(input.doc_type || '').toLowerCase();
  if (dt === 'image') return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(filePathOf(input));
}

export function isVideoFile(input: ImageFileLike): boolean {
  const mime = String(input.mime_type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const dt = String(input.doc_type || '').toLowerCase();
  if (dt === 'video') return true;
  return /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(filePathOf(input));
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

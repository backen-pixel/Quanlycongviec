import type { ShareIntentFile } from 'expo-share-intent';

const AUDIO_EXT = /\.(m4a|mp3|amr|3gp|aac|wav|opus|ogg|mp4)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|avif)(\?|$)/i;
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar)(\?|$)/i;

export function normalizeShareFileName(raw?: string | null): string {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* ignore */
  }
  return s;
}

export function isSharedAudioFile(file: ShareIntentFile): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const label = `${file.fileName || ''} ${file.path || ''}`.toLowerCase();
  if (AUDIO_EXT.test(label)) return true;
  return mime === 'application/octet-stream' && AUDIO_EXT.test(file.fileName || '');
}

export function isSharedImageFile(file: ShareIntentFile): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const label = `${file.fileName || ''} ${file.path || ''}`.toLowerCase();
  return IMAGE_EXT.test(label);
}

export function isSharedDocumentFile(file: ShareIntentFile): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('application/vnd.') || mime.startsWith('text/')) return true;
  const label = `${file.fileName || ''} ${file.path || ''}`.toLowerCase();
  return DOC_EXT.test(label);
}

export function guessMimeFromFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/m4a';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/octet-stream';
}

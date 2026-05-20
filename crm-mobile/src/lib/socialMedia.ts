import { resolveAttachmentUrl } from './resolveMediaUrl';
import type { SocialAttachment, SocialPost } from '../types/internalSocial';
import type { SlideshowItem } from './crmNoteMedia';
import { classifyUrlMediaKind } from './crmNoteMedia';

/** YouTube / Vimeo helpers — không phát được bằng expo-av, mở trình duyệt. */
const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i;
const VIMEO_RE = /^(https?:\/\/)?(www\.)?vimeo\.com\//i;

export function isYoutubeUrl(u: string): boolean {
  return YT_RE.test(u);
}
export function isVimeoUrl(u: string): boolean {
  return VIMEO_RE.test(u);
}

/** Lấy media trình chiếu được (ảnh + video) từ 1 bài đăng. */
export function slideshowItemsFromPost(post: SocialPost | null | undefined): SlideshowItem[] {
  if (!post) return [];
  const seen = new Set<string>();
  const items: SlideshowItem[] = [];

  const push = (raw?: string | null, mime?: string | null) => {
    if (!raw) return;
    const url = resolveAttachmentUrl(raw) || raw;
    if (!url) return;
    const kind = classifyUrlMediaKind(raw, mime);
    if (kind !== 'image' && kind !== 'video') return;
    const key = `${kind}:${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ uri: url, kind });
  };

  push(post.image_url, 'image/*');
  if (post.video_url && !isYoutubeUrl(post.video_url) && !isVimeoUrl(post.video_url)) {
    push(post.video_url, 'video/*');
  }
  for (const att of post.attachments || []) {
    push(att.file_url, att.mime_type);
  }
  return items;
}

/** Đếm số ảnh trong bài (dùng grid 2x trên feed). */
export function imagesFromPost(post: SocialPost | null | undefined): SlideshowItem[] {
  return slideshowItemsFromPost(post).filter((m) => m.kind === 'image');
}

/** Video chính (nếu có) — ưu tiên post.video_url, fallback attachment đầu tiên. */
export function primaryVideoFromPost(post: SocialPost | null | undefined): {
  uri: string;
  poster?: string;
} | null {
  if (!post) return null;
  if (post.video_url && !isYoutubeUrl(post.video_url) && !isVimeoUrl(post.video_url)) {
    const url = resolveAttachmentUrl(post.video_url);
    if (url) return { uri: url };
  }
  const att = (post.attachments || []).find((a) => String(a.mime_type || '').startsWith('video/'));
  if (att?.file_url) {
    const url = resolveAttachmentUrl(att.file_url);
    if (url) return { uri: url };
  }
  return null;
}

/** Các file không phải ảnh/video (PDF, doc…) — hiển thị dưới dạng chip. */
export function fileAttachmentsFromPost(post: SocialPost | null | undefined): SocialAttachment[] {
  if (!post) return [];
  return (post.attachments || []).filter((a) => {
    const mt = String(a.mime_type || '').toLowerCase();
    if (mt.startsWith('image/') || mt.startsWith('video/')) return false;
    return true;
  });
}

import api from './api';

const UPLOAD_STREAM_BYTES = 48 * 1024 * 1024;

export const MAX_SOCIAL_ATTACHMENTS = 12;

export function normalizeSocialPost(p) {
  if (!p || typeof p !== 'object') return p;
  const rc = p.reaction_counts;
  const reaction_counts = rc && typeof rc === 'object' && !Array.isArray(rc) ? { ...rc } : {};
  return {
    ...p,
    reaction_counts,
    like_count: Number(p.like_count) || 0,
    comment_count: Number(p.comment_count) || 0,
    liked_by_me: !!p.liked_by_me,
    my_reaction: typeof p.my_reaction === 'string' ? p.my_reaction : null,
    video_url: typeof p.video_url === 'string' ? p.video_url : (p.video_url || null),
    visibility: p.visibility === 'selected_users'
      ? 'selected_users'
      : (p.visibility === 'selected_companies' ? 'selected_companies' : 'company'),
    published_at: p.published_at || null,
    hidden_at: p.hidden_at || null,
    audience_users: Array.isArray(p.audience_users) ? p.audience_users : [],
    audience_companies: Array.isArray(p.audience_companies) ? p.audience_companies : [],
    blocked_companies: Array.isArray(p.blocked_companies) ? p.blocked_companies : [],
  };
}

export function isoToDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isScheduledPost(post) {
  if (!post?.published_at) return false;
  return new Date(post.published_at).getTime() > Date.now();
}

export function emptyComposerFields() {
  return {
    body: '',
    link_url: '',
    link_title: '',
    image_url: '',
    video_url: '',
    publishMode: 'now',
    scheduledAt: '',
    visibility: 'company',
    audienceUserIds: [],
    audienceCompanyIds: [],
    blockedCompanyIds: [],
  };
}

export function composerFromPost(post) {
  return {
    ...emptyComposerFields(),
    body: post.body || '',
    link_url: post.link_url || '',
    link_title: post.link_title || '',
    image_url: post.image_url || '',
    video_url: post.video_url || '',
    publishMode: isScheduledPost(post) ? 'scheduled' : 'now',
    scheduledAt: post.published_at ? isoToDatetimeLocalValue(post.published_at) : '',
    visibility: post.visibility === 'selected_users'
      ? 'selected_users'
      : (post.visibility === 'selected_companies' ? 'selected_companies' : 'company'),
    audienceUserIds: (post.audience_users || []).map((u) => String(u.id)).filter(Boolean),
    audienceCompanyIds: (post.audience_companies || [])
      .map((c) => String(c?.id || ''))
      .filter((cid) => cid && cid !== String(post.company_id)),
    blockedCompanyIds: (post.blocked_companies || [])
      .map((c) => String(c?.id || ''))
      .filter(Boolean),
  };
}

export function attachSlotsFromPost(post) {
  return (post.attachments || []).map((a) => ({
    localId: String(a.id != null ? a.id : crypto.randomUUID()),
    fileName: a.file_name || 'Tệp',
    uploading: false,
    result: {
      file_url: a.file_url,
      file_name: a.file_name,
      mime_type: a.mime_type,
      file_size: a.file_size,
    },
  }));
}

export function uploadSocialFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const isVideo = String(file.type || '').startsWith('video/');
  const useStream = isVideo || file.size > UPLOAD_STREAM_BYTES;
  const url = useStream ? '/upload/internal-social-stream' : '/upload/internal-social';
  const timeout = useStream || file.size > UPLOAD_STREAM_BYTES ? 600000 : 120000;
  return api.post(url, fd, { timeout });
}

import { api } from '../api/client';
import { normalizeCommentAttachments, type CommentAttachment } from './commentAttachments';
import {
  fetchProjectComments,
  postProjectComment,
  toggleProjectCommentReaction,
  type ProjectComment,
} from './productionApi';

export type CommentThreadSource =
  | { kind: 'lead'; leadId: string }
  | { kind: 'project'; projectId: string };

export type PostThreadCommentOptions = {
  parentId?: string | null;
  attachments?: CommentAttachment[] | null;
  mentionUserIds?: string[] | null;
};

/** URL-like pattern: absolute http/https hoặc relative /uploads/ */
const RAW_URL_RE = /^(https?:\/\/|\/uploads\/)\S+$/i;

/** Nếu body chỉ là JSON attachments hoặc URL file thô, ẩn text và lấy attachments. */
function sanitizeCommentContent(
  content: string,
  attachments: CommentAttachment[],
): { content: string; attachments: CommentAttachment[] } {
  const trimmed = String(content || '').trim();
  if (!trimmed) return { content: '', attachments };

  const looksLikeJson =
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
    || (trimmed.startsWith('{') && trimmed.endsWith('}'));

  // Thử parse JSON từ body → lấy attachments
  if (looksLikeJson && trimmed.includes('url')) {
    try {
      const parsed = JSON.parse(trimmed);
      const fromBody = normalizeCommentAttachments(parsed);
      if (fromBody.length) {
        return { content: '', attachments: attachments.length ? attachments : fromBody };
      }
    } catch {
      /* keep */
    }
  }

  // Body là URL thô (https://... hoặc /uploads/...) — bỏ khỏi text
  if (RAW_URL_RE.test(trimmed)) {
    if (attachments.length) {
      // Đã có attachments riêng → bỏ text thừa
      return { content: '', attachments };
    }
    // Không có attachments → tạo 1 attachment từ URL
    const url = trimmed.slice(0, 600);
    const namePart = url.split('/').pop()?.split('?')[0] || 'file';
    const ext = namePart.includes('.') ? namePart.split('.').pop()!.toLowerCase() : '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif'];
    const mime = imageExts.includes(ext) ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : '';
    return {
      content: '',
      attachments: [{ url, name: decodeURIComponent(namePart), type: mime, size: 0 }],
    };
  }

  // Body có URLs nhúng giữa text thì để nguyên (người dùng paste link thật)
  return { content: trimmed, attachments };
}

/** Chuẩn hoá row CRM (`body`) hoặc project (`content`) → ProjectComment. */
export function mapAnyCommentRow(raw: Record<string, unknown>): ProjectComment {
  const user = (raw.user || {}) as Record<string, unknown>;
  const reactions = (raw.reactions || { summary: [], mine: null }) as ProjectComment['reactions'];
  const attachments = normalizeCommentAttachments(raw.attachments);
  const sanitized = sanitizeCommentContent(String(raw.content ?? raw.body ?? ''), attachments);
  return {
    id: String(raw.id || ''),
    project_id: raw.project_id != null ? String(raw.project_id) : undefined,
    user_id: String(raw.user_id || ''),
    parent_id: raw.parent_id != null && raw.parent_id !== '' ? String(raw.parent_id) : null,
    content: sanitized.content,
    created_at: String(raw.created_at || ''),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    attachments: sanitized.attachments,
    user: {
      id: user.id != null ? String(user.id) : undefined,
      full_name: user.full_name != null ? String(user.full_name) : undefined,
      avatar: user.avatar != null ? String(user.avatar) : null,
    },
    reactions: {
      summary: Array.isArray(reactions?.summary) ? reactions!.summary : [],
      mine: reactions?.mine ?? null,
    },
  };
}

export function resolveCommentSource(
  projectId: string,
  dealId?: string | null,
): CommentThreadSource {
  if (dealId) return { kind: 'lead', leadId: String(dealId) };
  return { kind: 'project', projectId: String(projectId) };
}

export async function fetchThreadComments(source: CommentThreadSource): Promise<ProjectComment[]> {
  if (source.kind === 'project') {
    const rows = await fetchProjectComments(source.projectId);
    return rows.map((row) => {
      const sanitized = sanitizeCommentContent(row.content, row.attachments || []);
      return { ...row, content: sanitized.content, attachments: sanitized.attachments };
    });
  }
  const { data } = await api.get<unknown>(`/crm/leads/${source.leadId}/comments`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => mapAnyCommentRow(row as Record<string, unknown>));
}

export async function postThreadComment(
  source: CommentThreadSource,
  text: string,
  options?: PostThreadCommentOptions | string | null,
): Promise<ProjectComment> {
  // Backward compatible: old signature (parentId as 3rd arg)
  const opts: PostThreadCommentOptions =
    options != null && typeof options === 'object' && !Array.isArray(options)
      ? (options as PostThreadCommentOptions)
      : { parentId: typeof options === 'string' ? options : null };

  const trimmed = String(text || '').trim();
  const attachments = opts.attachments?.length ? opts.attachments : undefined;
  const mentionUserIds = opts.mentionUserIds?.length ? opts.mentionUserIds : undefined;
  const parentId = opts.parentId;

  if (source.kind === 'project') {
    return postProjectComment(source.projectId, trimmed, parentId, attachments);
  }

  const payload: {
    body: string;
    parent_id?: string | number;
    attachments?: CommentAttachment[];
    mention_user_ids?: string[];
  } = { body: trimmed };
  if (parentId) {
    const n = Number(parentId);
    payload.parent_id = Number.isFinite(n) ? n : parentId;
  }
  if (attachments?.length) payload.attachments = attachments;
  if (mentionUserIds?.length) payload.mention_user_ids = mentionUserIds;

  const { data } = await api.post<Record<string, unknown>>(
    `/crm/leads/${source.leadId}/comments`,
    payload,
  );
  return mapAnyCommentRow((data || {}) as Record<string, unknown>);
}

export async function toggleThreadCommentReaction(
  source: CommentThreadSource,
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  if (source.kind === 'project') {
    return toggleProjectCommentReaction(source.projectId, commentId, emoji);
  }
  const { data } = await api.put<ProjectComment['reactions']>(
    `/crm/lead-comments/${commentId}/reaction`,
    { emoji },
  );
  return data || { summary: [], mine: null };
}

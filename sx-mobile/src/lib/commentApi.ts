import { api } from '../api/client';
import { normalizeCommentAttachments, type CommentAttachment } from './commentAttachments';
import {
  fetchProjectComments,
  postProjectComment,
  toggleProjectCommentReaction,
  type ProjectComment,
} from './productionApi';
import {
  QUERY_TTL_SHORT,
  cachedQuery,
  getQueryData,
  invalidateQuery,
  invalidateQueryPrefix,
  isQueryFresh,
  patchQueryData,
  setQueryData,
} from './queryCache';

export type CommentThreadSource =
  | { kind: 'lead'; leadId: string }
  | { kind: 'project'; projectId: string };

export type PostThreadCommentOptions = {
  parentId?: string | null;
  attachments?: CommentAttachment[] | null;
  mentionUserIds?: string[] | null;
};

export type FetchThreadCommentsOptions = {
  force?: boolean;
  signal?: AbortSignal;
};

const K_THREAD = 'sx:threadComments:';
const K_COUNT = 'sx:threadCommentCount:';

export function threadCommentsCacheKey(source: CommentThreadSource): string {
  return source.kind === 'lead'
    ? `${K_THREAD}lead:${source.leadId}`
    : `${K_THREAD}project:${source.projectId}`;
}

export function threadCommentCountCacheKey(source: CommentThreadSource): string {
  return source.kind === 'lead'
    ? `${K_COUNT}lead:${source.leadId}`
    : `${K_COUNT}project:${source.projectId}`;
}

export function invalidateThreadCommentsCache(source?: CommentThreadSource | null): void {
  if (source) {
    invalidateQuery(threadCommentsCacheKey(source));
    invalidateQuery(threadCommentCountCacheKey(source));
  } else {
    invalidateQueryPrefix(K_THREAD);
    invalidateQueryPrefix(K_COUNT);
  }
}

function syncCommentCountCache(source: CommentThreadSource, count: number): void {
  setQueryData(threadCommentCountCacheKey(source), count);
}

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

async function fetchThreadCommentsNetwork(source: CommentThreadSource): Promise<ProjectComment[]> {
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

/**
 * Thread comments — SHORT TTL + dedupe inflight.
 * Badge dùng index count nhẹ; tab Comments dùng full list (chung key khi đã mở).
 */
export async function fetchThreadComments(
  source: CommentThreadSource,
  opts?: FetchThreadCommentsOptions,
): Promise<ProjectComment[]> {
  const rows = await cachedQuery<ProjectComment[]>({
    key: threadCommentsCacheKey(source),
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: () => fetchThreadCommentsNetwork(source),
  });
  syncCommentCountCache(source, rows.length);
  return rows;
}

async function fetchCommentCountFromIndex(source: CommentThreadSource): Promise<number> {
  if (source.kind === 'lead') {
    const { data } = await api.get<Record<string, { count?: number }>>(
      '/crm/lead-comments/index',
      { params: { lead_ids: source.leadId } },
    );
    const entry = data?.[source.leadId] || data?.[String(source.leadId)];
    return Math.max(0, Number(entry?.count || 0));
  }
  const { data } = await api.get<Record<string, { count?: number }>>(
    '/projects/comments/index',
    { params: { project_ids: source.projectId } },
  );
  const entry = data?.[source.projectId] || data?.[String(source.projectId)];
  return Math.max(0, Number(entry?.count || 0));
}

/**
 * Badge count — ưu tiên cache full-thread nếu còn fresh; không thì GET index nhẹ
 * (không tải body/attachments cả thread).
 */
export async function fetchThreadCommentCount(
  source: CommentThreadSource,
  opts?: FetchThreadCommentsOptions,
): Promise<number> {
  if (!opts?.force) {
    const listKey = threadCommentsCacheKey(source);
    if (isQueryFresh(listKey, QUERY_TTL_SHORT)) {
      const rows = getQueryData<ProjectComment[]>(listKey);
      if (rows) {
        syncCommentCountCache(source, rows.length);
        return rows.length;
      }
    }
  }

  return cachedQuery<number>({
    key: threadCommentCountCacheKey(source),
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: () => fetchCommentCountFromIndex(source),
  });
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

  let created: ProjectComment;
  if (source.kind === 'project') {
    created = await postProjectComment(source.projectId, trimmed, parentId, attachments);
  } else {
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
    created = mapAnyCommentRow((data || {}) as Record<string, unknown>);
  }

  invalidateThreadCommentsCache(source);
  return created;
}

export async function toggleThreadCommentReaction(
  source: CommentThreadSource,
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  const reactions = source.kind === 'project'
    ? await toggleProjectCommentReaction(source.projectId, commentId, emoji)
    : ((
      await api.put<ProjectComment['reactions']>(
        `/crm/lead-comments/${commentId}/reaction`,
        { emoji },
      )
    ).data || { summary: [], mine: null });

  patchQueryData<ProjectComment[]>(threadCommentsCacheKey(source), (prev) =>
    prev.map((c) => (c.id === commentId ? { ...c, reactions: reactions || c.reactions } : c)),
  );

  return reactions || { summary: [], mine: null };
}

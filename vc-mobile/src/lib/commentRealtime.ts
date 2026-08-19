import type { SxCommentNotification } from './notificationApi';
import { trimCommentPreview } from './notificationApi';

export type ProjectCommentSocketEvent = {
  project_id?: string;
  action?: string;
  comment?: {
    id?: string;
    user_id?: string;
    content?: string;
    created_at?: string;
    user?: { full_name?: string | null };
  };
};

export function buildNotificationFromCommentEvent(
  evt: ProjectCommentSocketEvent,
  projectMeta?: { code?: string | null; name?: string | null },
): SxCommentNotification | null {
  const pid = evt.project_id ? String(evt.project_id) : '';
  const c = evt.comment;
  if (!pid || !c?.created_at || evt.action === 'deleted') return null;

  const authorName = c.user?.full_name || 'Thành viên';
  const code = projectMeta?.code || projectMeta?.name || 'dự án';
  const preview = trimCommentPreview(String(c.content || ''), 120);

  return {
    id: `rt:${pid}:${c.id || c.created_at}`,
    type: 'comment_added',
    title: `${authorName} · ${code}`,
    message: `${authorName}: "${trimCommentPreview(String(c.content || ''), 80)}"`,
    entity_type: 'project',
    entity_id: pid,
    is_read: false,
    created_at: String(c.created_at),
    metadata: {
      project_id: pid,
      project_code: projectMeta?.code || null,
      project_name: projectMeta?.name || null,
      comment_preview: preview,
      comment_id: c.id != null ? String(c.id) : null,
      author_name: authorName,
      ecosystem_module_key: 'logistics',
    },
  };
}

import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import {
  openChatFromBubble,
  openProjectCommentFromNotif,
} from '../navigation/navigationRef';

function parseMeta(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  let meta = data.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : undefined;
}

function extractProjectId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const meta = parseMeta(data);
  if (meta?.project_id) return String(meta.project_id);
  const direct = data.project_id ?? data.projectId;
  if (direct) return String(direct);
  const entityId = data.entity_id ?? data.entityId;
  if (entityId && String(data.entity_type || '') === 'project') return String(entityId);
  return null;
}

function extractCommentId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const direct = data.comment_id ?? data.commentId;
  if (direct != null && String(direct).trim()) return String(direct);
  const meta = parseMeta(data);
  const fromMeta = meta?.comment_id ?? meta?.commentId;
  if (fromMeta != null && String(fromMeta).trim()) return String(fromMeta);
  return null;
}

function extractChatPayload(data: Record<string, unknown> | undefined): { groupId: string; title: string } | null {
  if (!data) return null;
  const type = String(data.type || '');
  if (type !== 'messenger_chat') return null;
  const entityType = String(data.entity_type || data.entityType || '');
  const groupId = String(data.entity_id ?? data.entityId ?? data.group_id ?? data.groupId ?? '');
  if (!groupId) return null;
  if (entityType && entityType !== 'messenger_group') return null;
  const meta = parseMeta(data);
  const title =
    (typeof data.group_name === 'string' && data.group_name.trim())
    || (typeof meta?.group_name === 'string' && meta.group_name.trim())
    || (typeof data.title === 'string' && data.title.trim())
    || 'Tin nhắn';
  return { groupId, title };
}

function handleNotificationData(data: Record<string, unknown> | undefined): void {
  const chat = extractChatPayload(data);
  if (chat) {
    openChatFromBubble(chat.groupId, chat.title);
    return;
  }
  const pid = extractProjectId(data);
  if (!pid) return;
  // Bình luận → chi tiết tab comments + scroll tới comment_id (nếu có).
  const type = String(data?.type || '');
  const initialTab = type === 'comment_added' ? 'comments' as const : undefined;
  const focusCommentId = type === 'comment_added' ? extractCommentId(data) : null;
  openProjectCommentFromNotif(pid, initialTab, focusCommentId);
}

export default function PushNotificationBridge() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
      const key = JSON.stringify(data || {});
      if (handledRef.current === key) return;
      handledRef.current = key;
      handleNotificationData(data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      handleNotificationData(data);
    });

    return () => sub.remove();
  }, []);

  return null;
}

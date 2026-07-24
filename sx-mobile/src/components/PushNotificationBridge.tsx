import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import {
  openChatFromBubble,
  openProjectCommentFromNotif,
  navigateToMainTab,
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

function isAssignmentNotification(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const type = String(data.type || '');
  if (
    type === 'crm_assignment_assigned'
    || type === 'crm_assignment_comment'
    || type === 'crm_assignment_overdue'
    || type === 'crm_assignment_due_soon'
    || type.startsWith('crm_assignment')
    || type === 'crm_task_assigned'
  ) {
    return true;
  }
  return String(data.entity_type || '') === 'crm_assignment';
}

function handleNotificationData(data: Record<string, unknown> | undefined): void {
  const chat = extractChatPayload(data);
  if (chat) {
    openChatFromBubble(chat.groupId, chat.title);
    return;
  }
  if (isAssignmentNotification(data)) {
    navigateToMainTab('Work');
    return;
  }
  const pid = extractProjectId(data);
  if (pid) openProjectCommentFromNotif(pid);
}

export default function PushNotificationBridge() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
        const key = JSON.stringify(data || {});
        if (handledRef.current === key) return;
        handledRef.current = key;
        handleNotificationData(data);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        handleNotificationData(data);
      } catch {
        /* ignore */
      }
    });

    return () => sub.remove();
  }, []);

  return null;
}

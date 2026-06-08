import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

type OpenCommentPayload = { projectId: string };

type Props = {
  onOpenComment: (payload: OpenCommentPayload) => void;
};

function extractProjectId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  let meta = data.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      meta = undefined;
    }
  }
  if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).project_id) {
    return String((meta as Record<string, unknown>).project_id);
  }
  const direct = data.project_id ?? data.projectId;
  if (direct) return String(direct);
  const entityId = data.entity_id ?? data.entityId;
  if (entityId && String(data.entity_type || '') === 'project') return String(entityId);
  return null;
}

export default function PushNotificationBridge({ onOpenComment }: Props) {
  const handlerRef = useRef(onOpenComment);
  handlerRef.current = onOpenComment;

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
      const pid = extractProjectId(data);
      if (pid) handlerRef.current({ projectId: pid });
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const pid = extractProjectId(data);
      if (pid) handlerRef.current({ projectId: pid });
    });

    const subFg = Notifications.addNotificationReceivedListener(() => {
      /* badge refresh handled by NotificationContext polling */
    });

    return () => {
      sub.remove();
      subFg.remove();
    };
  }, []);

  return null;
}

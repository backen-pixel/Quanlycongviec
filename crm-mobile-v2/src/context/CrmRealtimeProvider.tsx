import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { invalidateCrmHubCache, invalidatePlannerCache } from '../api/crm';
import { subscribeAppSocket } from '../lib/appSocket';
import { emitCrmRealtime } from '../lib/crmRealtimeBus';

const LIVE_VERSION_POLL_MS = 15000;
const SOCKET_RECENT_MS = 45000;

/** Loại notification CRM — làm mới badge / danh sách khi nhận qua socket. */
const CRM_NOTIFICATION_TYPES = new Set([
  'lead_assigned',
  'lead_stage_changed',
  'lead_chat',
  'crm_deadline_set',
  'crm_deadline_reminder',
  'crm_deadline_overdue',
  'lead_stage_sla_reminder',
  'ai_crm_deadline_digest',
  'task_assigned',
  'task_updated',
]);

function bumpCaches(): void {
  invalidateCrmHubCache();
  invalidatePlannerCache();
}

/**
 * Lắng nghe Socket.IO CRM + poll GET /crm/live-version (fallback như web CRMDashboard).
 * Phát sự kiện qua crmRealtimeBus — màn hình đăng ký bằng useCrmRealtimeRefresh.
 */
export function CrmRealtimeProvider({ children }: { children: React.ReactNode }) {
  const lastVersionRef = useRef<number | null>(null);
  const lastSocketAtRef = useRef(0);

  useEffect(() => {
    return subscribeAppSocket((socket) => {
      const onDashboard = (payload?: Record<string, unknown>) => {
        lastSocketAtRef.current = Date.now();
        bumpCaches();
        emitCrmRealtime({ reason: 'dashboard_changed', detail: payload });
      };

      const onBadge = (payload?: Record<string, unknown>) => {
        lastSocketAtRef.current = Date.now();
        emitCrmRealtime({ reason: 'badge_updated', detail: payload });
      };

      const onTask = (payload?: Record<string, unknown>) => {
        lastSocketAtRef.current = Date.now();
        emitCrmRealtime({ reason: 'task_changed', detail: payload });
      };

      const onNotification = (payload?: Record<string, unknown>) => {
        const type = String(payload?.type || '');
        if (!CRM_NOTIFICATION_TYPES.has(type)) return;
        emitCrmRealtime({ reason: 'notification', detail: payload });
      };

      const onLeadComment = (payload?: Record<string, unknown>) => {
        lastSocketAtRef.current = Date.now();
        emitCrmRealtime({ reason: 'lead_comment', detail: payload });
      };

      socket.on('crm:dashboard_changed', onDashboard);
      socket.on('crm:badge_updated', onBadge);
      socket.on('crm:task_changed', onTask);
      socket.on('notification', onNotification);
      socket.on('lead:comment', onLeadComment);

      return () => {
        socket.off('crm:dashboard_changed', onDashboard);
        socket.off('crm:badge_updated', onBadge);
        socket.off('crm:task_changed', onTask);
        socket.off('notification', onNotification);
        socket.off('lead:comment', onLeadComment);
      };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled || AppState.currentState !== 'active') return;
      try {
        const { data } = await api.get<{ v?: number }>('/crm/live-version');
        const v = Number(data?.v) || 0;
        if (lastVersionRef.current != null && v > lastVersionRef.current) {
          const recentSocket = Date.now() - lastSocketAtRef.current < SOCKET_RECENT_MS;
          bumpCaches();
          if (!recentSocket) invalidatePlannerCache();
          emitCrmRealtime({ reason: 'live_version' });
        }
        lastVersionRef.current = v;
      } catch {
        /* offline — bỏ qua */
      }
    };

    void poll();
    const interval = setInterval(poll, LIVE_VERSION_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void poll();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return <>{children}</>;
}

import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { invalidateCrmHubCache, invalidatePlannerCache, invalidateDeadlineBucketCounts, evictStaleCrmCaches } from '../api/crm';
import { subscribeAppSocket } from '../lib/appSocket';
import { emitCrmRealtime, type CrmRealtimeReason } from '../lib/crmRealtimeBus';

const LIVE_VERSION_POLL_MS = 20000;
const SOCKET_RECENT_MS = 45000;
const BUMP_DEBOUNCE_MS = 2000;

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

/**
 * Lắng nghe Socket.IO CRM + poll GET /crm/live-version (fallback như web CRMDashboard).
 * Phát sự kiện qua crmRealtimeBus — màn hình đăng ký bằng useCrmRealtimeRefresh.
 */
export function CrmRealtimeProvider({ children }: { children: React.ReactNode }) {
  const lastVersionRef = useRef<number | null>(null);
  const lastSocketAtRef = useRef(0);
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlannerRef = useRef(false);
  const pendingReasonRef = useRef<CrmRealtimeReason>('dashboard_changed');
  const pendingDetailRef = useRef<Record<string, unknown> | undefined>(undefined);

  const flushBump = () => {
    bumpTimerRef.current = null;
    invalidateCrmHubCache();
    invalidateDeadlineBucketCounts();
    if (pendingPlannerRef.current) invalidatePlannerCache();
    pendingPlannerRef.current = false;
    emitCrmRealtime({ reason: pendingReasonRef.current, detail: pendingDetailRef.current });
  };

  const scheduleBumpAndEmit = (
    reason: CrmRealtimeReason,
    detail?: Record<string, unknown>,
    alsoPlanner = false,
  ) => {
    pendingReasonRef.current = reason;
    pendingDetailRef.current = detail;
    if (alsoPlanner) pendingPlannerRef.current = true;
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    bumpTimerRef.current = setTimeout(flushBump, BUMP_DEBOUNCE_MS);
  };

  useEffect(() => {
    return subscribeAppSocket((socket) => {
      const onDashboard = (payload?: Record<string, unknown>) => {
        lastSocketAtRef.current = Date.now();
        scheduleBumpAndEmit('dashboard_changed', payload, false);
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
        const plannerRelated =
          type.includes('deadline')
          || type === 'lead_assigned'
          || type === 'task_assigned'
          || type === 'task_updated';
        if (plannerRelated) {
          scheduleBumpAndEmit('notification', payload, true);
        } else {
          emitCrmRealtime({ reason: 'notification', detail: payload });
        }
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
    // scheduleBumpAndEmit ổn định qua refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          scheduleBumpAndEmit('live_version', undefined, !recentSocket);
        }
        lastVersionRef.current = v;
      } catch {
        /* offline — bỏ qua */
      }
    };

    void poll();
    const interval = setInterval(poll, LIVE_VERSION_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        evictStaleCrmCaches();
        return;
      }
      if (state === 'active') void poll();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

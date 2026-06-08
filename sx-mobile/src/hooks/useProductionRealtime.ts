import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import type { CrmTaskChangedPayload, ProjectStageChangedPayload } from '../lib/realtimeSync';

type Options = {
  projectId?: string | null;
  dealId?: string | null;
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
};

function projectIdFromStagePayload(payload: ProjectStageChangedPayload): string | null {
  const pid = payload?.id ?? payload?.project_id;
  return pid != null ? String(pid) : null;
}

/**
 * Debounced refetch khi web/mobile thay đổi Kanban hoặc nhiệm vụ CRM (socket).
 */
export function useProductionRealtime({
  projectId,
  dealId,
  onRefresh,
  enabled = true,
  debounceMs = 650,
}: Options) {
  const { subscribeSync } = useNotifications();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void onRefreshRef.current();
      }, debounceMs);
    };

    const unsub = subscribeSync((evt) => {
      if (evt.type === 'project:stage_changed') {
        const pid = projectIdFromStagePayload(evt.payload);
        if (!projectId) {
          scheduleRefresh();
          return;
        }
        if (pid && String(pid) === String(projectId)) scheduleRefresh();
        return;
      }

      if (evt.type === 'crm:task_changed') {
        const p = evt.payload;
        const matchProject =
          projectId && p.project_id && String(p.project_id) === String(projectId);
        const matchDeal = dealId && p.lead_id && String(p.lead_id) === String(dealId);
        if (!projectId && !dealId) {
          scheduleRefresh();
          return;
        }
        if (matchProject || matchDeal) scheduleRefresh();
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [enabled, projectId, dealId, debounceMs, subscribeSync]);
}

export type { CrmTaskChangedPayload, ProjectStageChangedPayload };

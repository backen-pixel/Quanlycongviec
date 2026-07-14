import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import type { SyncEvent } from '../lib/realtimeSync';
import { dealIdFromSyncEvent, projectIdFromSyncEvent } from '../lib/realtimeSync';

type Options = {
  projectId?: string | null;
  dealId?: string | null;
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
  /** Chỉ lắng nghe sự kiện bảng Kanban / dự án (mặc định: tất cả). */
  modes?: Array<'board' | 'task' | 'comment'>;
};

function eventMatchesMode(evt: SyncEvent, modes?: Options['modes']): boolean {
  if (!modes?.length) return true;
  if (evt.type === 'crm:task_changed') return modes.includes('task');
  if (evt.type === 'project:comment_changed' || evt.type === 'lead:comment_changed') {
    return modes.includes('comment');
  }
  return modes.includes('board');
}

function shouldRefreshForEvent(
  evt: SyncEvent,
  projectId?: string | null,
  dealId?: string | null,
): boolean {
  if (!projectId && !dealId) return true;

  const pid = projectIdFromSyncEvent(evt);
  if (projectId && pid && String(pid) === String(projectId)) return true;

  const lid = dealIdFromSyncEvent(evt);
  if (dealId && lid && String(lid) === String(dealId)) return true;

  // Sự kiện toàn cục (không gắn project/deal) — vẫn refresh màn không lọc theo id.
  if (!projectId && !dealId) return true;

  return false;
}

/**
 * Debounced refetch khi web/mobile thay đổi Kanban, nhiệm vụ, bình luận… (socket).
 */
export function useProductionRealtime({
  projectId,
  dealId,
  onRefresh,
  enabled = true,
  debounceMs = 650,
  modes,
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
      if (!eventMatchesMode(evt, modes)) return;
      if (shouldRefreshForEvent(evt, projectId, dealId)) scheduleRefresh();
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [enabled, projectId, dealId, debounceMs, modes, subscribeSync]);
}

export type { CrmTaskChangedPayload, ProjectStageChangedPayload } from '../lib/realtimeSync';

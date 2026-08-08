import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { patchCachedProjectById } from '../lib/logisticsBoardCache';
import type { SyncEvent } from '../lib/realtimeSync';
import { dealIdFromSyncEvent, projectIdFromSyncEvent } from '../lib/realtimeSync';

export type BoardRealtimeInfo = {
  evt: SyncEvent;
  /** true = đã patch cache tại chỗ, không cần tải lại full board. */
  patched: boolean;
};

type Options = {
  projectId?: string | null;
  dealId?: string | null;
  onRefresh: (info?: BoardRealtimeInfo) => void | Promise<void>;
  enabled?: boolean;
  /**
   * false = vẫn refetch dù tab/màn không focus (mặc định true: chỉ tab đang xem
   * để tránh nhiều tab cùng tải lại full board).
   */
  onlyWhenFocused?: boolean;
  debounceMs?: number;
  /** Chỉ lắng nghe sự kiện bảng Kanban / dự án (mặc định: tất cả). Dùng hằng từ realtimeModes. */
  modes?: ReadonlyArray<'board' | 'task' | 'comment'>;
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

  if (!projectId && !dealId) return true;

  return false;
}

function tryPatchFromStageEvent(evt: SyncEvent): boolean {
  if (evt.type !== 'project:stage_changed') return false;
  const pid = projectIdFromSyncEvent(evt);
  if (!pid) return false;
  const payload = evt.payload as Record<string, unknown>;
  const col = payload.vc_kanban_column_id;
  if (col == null || col === '') return false;
  return !!patchCachedProjectById(pid, {
    vc_kanban_column_id: String(col),
    resolved_column_id: String(col),
  });
}

/**
 * Debounced refetch khi web/mobile thay đổi Kanban, nhiệm vụ, bình luận… (socket).
 * Stage change có cột đích → patch cache tại chỗ (không tải lại nhiều dự án).
 */
export function useProductionRealtime({
  projectId,
  dealId,
  onRefresh,
  enabled = true,
  onlyWhenFocused = true,
  debounceMs = 650,
  modes,
}: Options) {
  const { subscribeSync } = useNotifications();
  const isFocused = useIsFocused();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const active = enabled && (!onlyWhenFocused || isFocused);

  useEffect(() => {
    if (!active) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFullRefresh = (evt: SyncEvent) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void Promise.resolve(onRefreshRef.current({ evt, patched: false })).catch(() => {});
      }, debounceMs);
    };

    const unsub = subscribeSync((evt) => {
      if (!eventMatchesMode(evt, modes)) return;
      if (!shouldRefreshForEvent(evt, projectId, dealId)) return;

      if (tryPatchFromStageEvent(evt)) {
        void Promise.resolve(onRefreshRef.current({ evt, patched: true })).catch(() => {});
        return;
      }
      scheduleFullRefresh(evt);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [active, projectId, dealId, debounceMs, modes, subscribeSync]);
}

export type { CrmTaskChangedPayload, ProjectStageChangedPayload } from '../lib/realtimeSync';

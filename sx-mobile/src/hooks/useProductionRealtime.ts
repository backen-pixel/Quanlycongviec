import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { patchCachedProjectById } from '../lib/productionBoardCache';
import type { SyncEvent } from '../lib/realtimeSync';
import { dealIdFromSyncEvent, projectIdFromSyncEvent } from '../lib/realtimeSync';
import type { ProductionProject } from '../types';

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
   * để tránh 3–4 tab cùng tải lại full board).
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
  const col = evt.payload.sx_kanban_column_id;
  if (col == null || col === '') return false;
  return !!patchCachedProjectById(pid, {
    sx_kanban_column_id: String(col),
    resolved_column_id: String(col),
  });
}

/** Patch thẻ từ socket project:updated — tránh full reload board lớn. */
function tryPatchFromProjectUpdated(evt: SyncEvent): boolean {
  if (evt.type !== 'project:updated') return false;
  const pid = projectIdFromSyncEvent(evt);
  if (!pid) return false;
  const p = evt.payload as Record<string, unknown>;
  const patch: Partial<ProductionProject> = {};
  if (p.sx_kanban_column_id != null && p.sx_kanban_column_id !== '') {
    patch.sx_kanban_column_id = String(p.sx_kanban_column_id);
    patch.resolved_column_id = String(p.sx_kanban_column_id);
  }
  if (p.status != null) patch.status = String(p.status);
  if (p.name != null) patch.name = String(p.name);
  if (p.code != null) patch.code = String(p.code);
  if (p.production_person_id != null) {
    patch.production_person_id = String(p.production_person_id);
  }
  if (p.production_person_name != null) {
    patch.production_person_name = String(p.production_person_name);
  }
  if (p.production_value != null && p.production_value !== '') {
    patch.production_value = Number(p.production_value);
  }
  if (p.deposit_amount != null && p.deposit_amount !== '') {
    patch.deposit_amount = Number(p.deposit_amount);
  }
  if (p.is_overdue != null) patch.is_overdue = Boolean(p.is_overdue);
  if (p.deadline != null) patch.deadline = String(p.deadline);
  if (p.delivery_date != null) patch.delivery_date = String(p.delivery_date);
  if (p.production_deadline != null) {
    patch.production_deadline = String(p.production_deadline);
  }
  if (Object.keys(patch).length === 0) {
    // Có id nhưng không có field — bỏ qua full reload (tránh bão socket).
    return true;
  }
  return !!patchCachedProjectById(pid, patch);
}

/**
 * Debounced refetch khi web/mobile thay đổi Kanban, nhiệm vụ, bình luận… (socket).
 * Stage / project:updated có đủ field → patch cache (không tải lại 1000+ deal).
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

      if (tryPatchFromStageEvent(evt) || tryPatchFromProjectUpdated(evt)) {
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

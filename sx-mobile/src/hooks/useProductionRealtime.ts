import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { fetchProductionProject } from '../lib/productionApi';
import {
  patchCachedProjectById,
  removeCachedProjectById,
  upsertCachedProject,
} from '../lib/productionBoardCache';
import type { SyncEvent } from '../lib/realtimeSync';
import { dealIdFromSyncEvent, projectIdFromSyncEvent } from '../lib/realtimeSync';
import type { ProductionProject } from '../types';

export type BoardRealtimeInfo = {
  evt: SyncEvent;
  /** true = đã patch/upsert cache tại chỗ, không cần tải lại full board. */
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
 * Soft-ingest board_changed: cập nhật/gỡ 1 thẻ thay vì full board.
 * Trash/purge → remove; còn lại fetch 1 project rồi upsert.
 * `isCancelled` — bỏ upsert nếu đã có soft-ingest mới hơn (tránh out-of-order).
 */
async function trySoftIngestBoardChanged(
  evt: SyncEvent,
  isCancelled?: () => boolean,
): Promise<boolean> {
  if (evt.type !== 'project:board_changed') return false;
  const pid = projectIdFromSyncEvent(evt);
  if (!pid) return false;
  const reason = String(evt.payload.reason || evt.payload.action || '').toLowerCase();
  if (/trash|purg/.test(reason)) {
    if (isCancelled?.()) return false;
    return !!removeCachedProjectById(pid);
  }
  try {
    const project = await fetchProductionProject(pid);
    if (isCancelled?.()) return false;
    if (!project?.id) return false;
    // Restore / deal mới / intake — upsert vào cache hiện có.
    const board = upsertCachedProject(project);
    // Không có cache nào (chưa mở Kanban) → để full refresh khi vào tab.
    return !!board;
  } catch {
    return false;
  }
}

/**
 * Debounced refetch khi web/mobile thay đổi Kanban, nhiệm vụ, bình luận… (socket).
 * Stage / project:updated / board_changed(+id) → patch/upsert cache (không tải lại 1000+ deal).
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
    let softSeq = 0;
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

      if (evt.type === 'project:board_changed') {
        const seq = ++softSeq;
        void trySoftIngestBoardChanged(evt, () => seq !== softSeq).then((ok) => {
          // Soft cũ hơn → không notify / không full-refresh (event mới đã/đang xử lý).
          if (seq !== softSeq) return;
          if (ok) {
            void Promise.resolve(onRefreshRef.current({ evt, patched: true })).catch(() => {});
            return;
          }
          scheduleFullRefresh(evt);
        });
        return;
      }

      scheduleFullRefresh(evt);
    });

    return () => {
      if (timer) clearTimeout(timer);
      softSeq += 1;
      unsub();
    };
  }, [active, projectId, dealId, debounceMs, modes, subscribeSync]);
}

export type { CrmTaskChangedPayload, ProjectStageChangedPayload } from '../lib/realtimeSync';

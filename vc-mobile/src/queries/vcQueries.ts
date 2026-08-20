import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { fetchEventsRange, type AppEvent } from '../api/events';
import {
  type BoardFilters,
  type CompanyOption,
  fetchCompanies,
  fetchLogisticsBoard,
  fetchVcOverviewKpis,
} from '../lib/logisticsApi';
import {
  BOARD_CACHE_FRESH_MS,
  BOARD_CACHE_UPDATED,
  boardCacheKey,
  getCachedBoard,
  getCachedBoardAge,
  setCachedBoard,
} from '../lib/logisticsBoardCache';
import { fetchCommentNotifications, type SxCommentNotification } from '../lib/notificationApi';
import { fetchLogisticsAssignments, fetchPrivateDealInbox, type CrmAssignment, type SharedInboxGroup, type SharedInboxTask } from '../lib/sharedWorkspaceApi';
import { fetchLogisticsWorkTasks, type WorkTask } from '../lib/workTasksApi';
import {
  getCachedWorkInbox,
  setCachedWorkInbox,
  workInboxCacheKey,
  type WorkInboxPayload,
} from '../lib/workInboxCache';
import { getCachedVcKpis, setCachedVcKpis } from '../lib/vcKpiCache';
import type { ProductionBoard } from '../types';
import type { VcBoardKpis } from '../lib/vcBoardKpis';
import { vcKeys } from './keys';
import { queryClient } from './queryClient';

/** Danh sách công ty — đổi rất ít, cache lâu. */
export function useVcCompanies(enabled = true): UseQueryResult<CompanyOption[]> {
  return useQuery({
    queryKey: vcKeys.companies(),
    queryFn: () => fetchCompanies(),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export type VcOverviewKpisResult = { kpis: VcBoardKpis; source: 'api' | 'board' };

/**
 * KPI Tổng quan — gọi API nhẹ `/logistics/overview-kpis`.
 * Không kéo full board nữa (đó là API nặng nhất của module VC).
 */
export function useVcOverviewKpis(
  filters: BoardFilters,
  opts: { enabled?: boolean } = {},
): UseQueryResult<VcOverviewKpisResult> {
  const cached = getCachedVcKpis(filters);
  return useQuery({
    queryKey: vcKeys.overviewKpis(filters),
    queryFn: async () => {
      const res = await fetchVcOverviewKpis(filters);
      setCachedVcKpis(filters, res.kpis);
      return res;
    },
    // Cold start: hiện số từ đĩa ngay, revalidate ngầm nếu snapshot đã cũ.
    initialData: cached ? { kpis: cached.kpis, source: 'board' as const } : undefined,
    initialDataUpdatedAt: cached?.at,
    staleTime: 60_000,
    enabled: opts.enabled !== false,
  });
}

/**
 * Board Kanban đầy đủ (API nặng nhất của module) — Kanban / Kế hoạch / Quá hạn /
 * Danh sách dùng CHUNG một entry cache, nên chỉ tải một lần cho cùng bộ lọc.
 *
 * Vẫn ghi board cache trên đĩa để cold start hiện thẻ ngay.
 */
export function useVcBoard(
  filters: BoardFilters,
  opts: { enabled?: boolean } = {},
): UseQueryResult<ProductionBoard> {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // fetchLogisticsBoard ghi cache "soft" sau mỗi trang → đẩy vào query cache
  // để thẻ hiện dần thay vì đợi tải hết tất cả trang.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      BOARD_CACHE_UPDATED,
      (ev: { key?: string; board?: ProductionBoard }) => {
        const f = filtersRef.current;
        if (!ev?.board || ev.key !== boardCacheKey(f)) return;
        queryClient.setQueryData(vcKeys.board(f), ev.board);
      },
    );
    return () => sub.remove();
  }, []);

  const cached = getCachedBoard(filters);
  const cachedAge = getCachedBoardAge(filters);

  return useQuery({
    queryKey: vcKeys.board(filters),
    queryFn: async () => {
      const board = await fetchLogisticsBoard(false, filters);
      setCachedBoard(filters, board);
      return board;
    },
    initialData: cached ?? undefined,
    // Tuổi thật của snapshot đĩa — cache cũ vẫn hiện ngay nhưng được revalidate.
    initialDataUpdatedAt: cachedAge != null ? Date.now() - cachedAge : undefined,
    staleTime: BOARD_CACHE_FRESH_MS,
    enabled: opts.enabled !== false,
  });
}

/** Pull-to-refresh: buộc bỏ qua cache phía API rồi đồng bộ vào query cache. */
export async function refreshVcBoard(filters: BoardFilters): Promise<ProductionBoard> {
  const board = await fetchLogisticsBoard(true, filters);
  setCachedBoard(filters, board);
  queryClient.setQueryData(vcKeys.board(filters), board);
  return board;
}

/** Board đã đổi (realtime không patch được) → refetch màn đang mở. */
export function invalidateVcBoard(): void {
  void queryClient.invalidateQueries({ queryKey: vcKeys.prefix.board() });
}

/** KG chung: server trả tasks rời + tasks trong group → gộp, bỏ trùng id. */
function flattenSharedInboxTasks(inbox: {
  tasks?: SharedInboxTask[];
  groups?: { tasks?: SharedInboxTask[] }[];
}): SharedInboxTask[] {
  const merged = [
    ...(Array.isArray(inbox.tasks) ? inbox.tasks : []),
    ...((inbox.groups || []).flatMap((g) => g.tasks || [])),
  ];
  const seen = new Set<string>();
  return merged.filter((t) => {
    const id = String(t.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export type VcWorkInboxArgs = {
  companyId?: string | null;
  assigneeId?: string | null;
  limit: number;
};

/**
 * Inbox công việc (nhiệm vụ + giao việc + KG chung).
 * Đồng thời ghi cache dùng chung để tab Công việc không fetch lại.
 */
export function useVcWorkInbox(
  args: VcWorkInboxArgs,
  opts: { enabled?: boolean } = {},
): UseQueryResult<WorkInboxPayload> {
  const legacyKey = workInboxCacheKey({
    companyId: args.companyId,
    assigneeId: args.assigneeId,
  });

  return useQuery({
    queryKey: vcKeys.workInbox(args),
    queryFn: async () => {
      const [workTasks, assignments, sharedInbox] = await Promise.all([
        fetchLogisticsWorkTasks({
          assigneeId: args.assigneeId || null,
          companyId: args.companyId || undefined,
          limit: args.limit,
        }).catch(() => [] as WorkTask[]),
        fetchLogisticsAssignments({
          companyId: args.companyId || undefined,
          assigneeId: args.assigneeId || undefined,
          limit: args.limit,
        }).catch(() => [] as CrmAssignment[]),
        fetchPrivateDealInbox('logistics').catch(() => ({
          tasks: [] as SharedInboxTask[],
          groups: [] as SharedInboxGroup[],
        })),
      ]);

      const payload: WorkInboxPayload = {
        assignments,
        sharedGroups: Array.isArray(sharedInbox.groups) ? sharedInbox.groups : [],
        sharedTasks: flattenSharedInboxTasks(sharedInbox),
        workTasks,
      };
      setCachedWorkInbox(legacyKey, payload);
      return payload;
    },
    initialData: () => getCachedWorkInbox(legacyKey) ?? undefined,
    staleTime: 60_000,
    enabled: opts.enabled !== false,
  });
}

/** Sự kiện trong ngày (module logistics). */
export function useVcDayEvents(
  args: { day: string; companyId?: string | null; userId?: string | null },
  opts: { enabled?: boolean } = {},
): UseQueryResult<AppEvent[]> {
  return useQuery({
    queryKey: vcKeys.events(args),
    queryFn: () => fetchEventsRange({
      dateFrom: args.day,
      dateTo: args.day,
      companyId: args.companyId || undefined,
      module: 'logistics',
      userId: args.userId || undefined,
    }),
    staleTime: 60_000,
    enabled: opts.enabled !== false,
  });
}

export type VcNotificationsResult = {
  notifications: SxCommentNotification[];
  unread_count: number;
};

/** Thông báo VC — preview Tổng quan (limit nhỏ, ít enrich comment). */
export function useVcNotifications(
  args: { limit: number; enrichLimit: number },
  opts: { enabled?: boolean } = {},
): UseQueryResult<VcNotificationsResult> {
  return useQuery({
    queryKey: vcKeys.notifications({ limit: args.limit }),
    queryFn: () => fetchCommentNotifications(false, {
      enrichLimit: args.enrichLimit,
      limit: args.limit,
    }),
    staleTime: 45_000,
    enabled: opts.enabled !== false,
  });
}

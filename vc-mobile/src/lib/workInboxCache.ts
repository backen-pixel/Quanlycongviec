import type { WorkTask } from './workTasksApi';
import type { CrmAssignment, SharedInboxGroup, SharedInboxTask } from './sharedWorkspaceApi';

/**
 * Cache giao việc / inbox dùng chung Tổng quan ↔ Công việc.
 * Key gồm cả limit: hai màn fetch số lượng khác nhau sẽ KHÔNG ghi đè nhau
 * (trước đây Tổng quan đọc entry do Work ghi và hiện thiếu việc).
 */
export type WorkInboxPayload = {
  assignments: CrmAssignment[];
  sharedGroups: SharedInboxGroup[];
  sharedTasks: SharedInboxTask[];
  workTasks: WorkTask[];
};

type Entry = WorkInboxPayload & { at: number };

const cache = new Map<string, Entry>();

/** Coi còn tươi trong khoảng này → Work/Overview không refetch mạng. */
export const WORK_INBOX_FRESH_MS = 60_000;

/** Limit chung Overview + Work — cùng số lượng thì hai màn dùng chung 1 lượt tải. */
export const WORK_INBOX_FETCH_LIMIT = 200;

export function workInboxCacheKey(opts: {
  companyId?: string | null;
  assigneeId?: string | null;
  limit?: number;
}): string {
  const limit = opts.limit && opts.limit > 0 ? opts.limit : WORK_INBOX_FETCH_LIMIT;
  return `${String(opts.companyId || '')}|${String(opts.assigneeId || '')}|${limit}`;
}

export function getCachedWorkInbox(key: string): WorkInboxPayload | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return {
    assignments: entry.assignments,
    sharedGroups: entry.sharedGroups,
    sharedTasks: entry.sharedTasks,
    workTasks: entry.workTasks,
  };
}

/** Thời điểm entry được ghi — dùng cho initialDataUpdatedAt của React Query. */
export function getCachedWorkInboxAt(key: string): number | null {
  return cache.get(key)?.at ?? null;
}

export function isCachedWorkInboxFresh(key: string): boolean {
  const entry = cache.get(key);
  return Boolean(entry && Date.now() - entry.at < WORK_INBOX_FRESH_MS);
}

export function setCachedWorkInbox(key: string, data: WorkInboxPayload): void {
  cache.set(key, {
    assignments: data.assignments,
    sharedGroups: data.sharedGroups,
    sharedTasks: data.sharedTasks,
    workTasks: data.workTasks,
    at: Date.now(),
  });
}

export function invalidateWorkInboxCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

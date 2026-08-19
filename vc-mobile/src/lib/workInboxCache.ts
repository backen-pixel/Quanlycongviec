import type { WorkTask } from './workTasksApi';
import type { CrmAssignment, SharedInboxGroup, SharedInboxTask } from './sharedWorkspaceApi';

/**
 * Cache giao việc / inbox dùng chung Tổng quan ↔ Công việc.
 * Key: companyId|assigneeId — cùng limit để tránh list lệch.
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

/** Limit chung Overview + Work (trước đây Overview 80 / Work 200). */
export const WORK_INBOX_FETCH_LIMIT = 200;

export function workInboxCacheKey(opts: {
  companyId?: string | null;
  assigneeId?: string | null;
}): string {
  return `${String(opts.companyId || '')}|${String(opts.assigneeId || '')}`;
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

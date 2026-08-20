import type { BoardFilters } from '../lib/logisticsApi';

/**
 * Query keys module VC — mọi màn hình phải dùng helper ở đây
 * để Overview / Kanban / Detail chia sẻ cùng cache entry.
 */
const scope = 'vc' as const;

function filterTuple(filters: BoardFilters = {}): [string, string, string, string] {
  return [
    filters.companyId || '',
    filters.dealCompanyId || '',
    filters.workshopTypeId || '',
    filters.priority || '',
  ];
}

export const vcKeys = {
  all: [scope] as const,

  companies: () => [scope, 'companies'] as const,

  /** KPI Tổng quan — API nhẹ, tách khỏi board. */
  overviewKpis: (filters: BoardFilters = {}) =>
    [scope, 'overviewKpis', ...filterTuple(filters)] as const,

  /** Board Kanban đầy đủ (nặng) — chỉ tab Kanban/Planner dùng. */
  board: (filters: BoardFilters = {}) =>
    [scope, 'board', ...filterTuple(filters)] as const,

  /** Inbox công việc dùng chung Tổng quan ↔ tab Công việc. */
  workInbox: (opts: { companyId?: string | null; assigneeId?: string | null; limit?: number }) =>
    [
      scope,
      'workInbox',
      opts.companyId || '',
      opts.assigneeId || '',
      String(opts.limit || 0),
    ] as const,

  /** Sự kiện theo ngày. */
  events: (opts: { companyId?: string | null; userId?: string | null; day: string }) =>
    [scope, 'events', opts.day, opts.companyId || '', opts.userId || ''] as const,

  /** Thông báo VC (preview Tổng quan). */
  notifications: (opts: { limit: number }) =>
    [scope, 'notifications', String(opts.limit)] as const,

  projectDetail: (projectId: string) => [scope, 'project', projectId] as const,

  /** Prefix để invalidate mọi filter của cùng loại dữ liệu (realtime). */
  prefix: {
    overviewKpis: () => [scope, 'overviewKpis'] as const,
    board: () => [scope, 'board'] as const,
    workInbox: () => [scope, 'workInbox'] as const,
    events: () => [scope, 'events'] as const,
    notifications: () => [scope, 'notifications'] as const,
  },
};

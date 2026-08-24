/**
 * Query key chuẩn cho toàn app: type + filters + stage|bucket + offset.
 *
 * Mọi query CRM phải lấy key từ đây để cache/invalidate nhất quán.
 * Prefix cố định theo thứ tự trên nên có thể invalidate từng nhánh:
 *   ['crm','board','lead']            -> mọi cột/trang của Lead
 *   ['crm','board','lead',filterKey]  -> mọi cột/trang của Lead với bộ lọc hiện tại
 */
import type { CrmStageFetchOpts } from '../api/crm';
import type { CrmHubFilters } from '../lib/crmFilters';
import { serverFilterKey } from '../lib/crmFilters';

export type CrmKind = 'lead' | 'deal';

/** Chuỗi lọc ổn định từ CrmHubFilters + search (dùng cho board/deadline/KPI). */
export function filterKeyFromFilters(filters: CrmHubFilters, search: string): string {
  return serverFilterKey(filters, search.trim());
}

/**
 * Chuỗi lọc ổn định từ opts đã build cho API — sort key để không phụ thuộc
 * thứ tự thuộc tính.
 *
 * Bỏ các field không phải điều kiện lọc (`signal`, cờ bootstrap `lite`/`skipCounts`,
 * `suggest`): cùng bộ lọc phải cho ra cùng một key, dù gọi từ luồng refresh hay
 * luồng mở màn.
 */
const NON_FILTER_OPT_KEYS = new Set(['signal', 'lite', 'skipCounts', 'suggest']);

export function filterKeyFromOpts(opts?: Record<string, unknown> | CrmStageFetchOpts): string {
  if (!opts) return '';
  const entries = Object.entries(opts)
    .filter(
      ([k, v]) =>
        !NON_FILTER_OPT_KEYS.has(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'function',
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('|');
}

export const crmKeys = {
  all: ['crm'] as const,

  /** KPI Tổng quan (theo user + bộ lọc thời gian). */
  kpiRoot: () => ['crm', 'kpi'] as const,
  kpi: (userId: string, filterKey: string) => ['crm', 'kpi', userId, filterKey] as const,

  /** Board Lead/Deal: stages + counts + từng trang của cột. */
  boardRoot: (kind?: CrmKind) => (kind ? (['crm', 'board', kind] as const) : (['crm', 'board'] as const)),
  stages: (kind: CrmKind, filterKey: string) => ['crm', 'board', kind, filterKey, 'stages'] as const,
  stageCounts: (kind: CrmKind, filterKey: string) =>
    ['crm', 'board', kind, filterKey, 'stage-counts'] as const,
  stagePage: (kind: CrmKind, filterKey: string, stageId: string, offset: number) =>
    ['crm', 'board', kind, filterKey, 'stage', stageId, offset] as const,
  /** Mọi trang của 1 cột (invalidate khi kéo thẻ vào/ra cột đó). */
  stagePages: (kind: CrmKind, filterKey: string, stageId: string) =>
    ['crm', 'board', kind, filterKey, 'stage', stageId] as const,

  /** Deadline: đếm theo bucket + từng trang của bucket. */
  deadlineRoot: (kind?: CrmKind) =>
    kind ? (['crm', 'deadline', kind] as const) : (['crm', 'deadline'] as const),
  deadlineBucketCounts: (kind: CrmKind, filterKey: string) =>
    ['crm', 'deadline', kind, filterKey, 'bucket-counts'] as const,
  deadlineBucketPage: (kind: CrmKind, filterKey: string, bucket: string, offset: number) =>
    ['crm', 'deadline', kind, filterKey, 'bucket', bucket, offset] as const,
  deadlineBucketPages: (kind: CrmKind, filterKey: string, bucket: string) =>
    ['crm', 'deadline', kind, filterKey, 'bucket', bucket] as const,

  /** Chi tiết Lead/Deal + các tab con. */
  detailRoot: () => ['crm', 'detail'] as const,
  leadDetail: (leadId: string) => ['crm', 'detail', String(leadId)] as const,
  leadCommentBadge: (leadId: string, userId: string) =>
    ['crm', 'detail', String(leadId), 'comment-badge', userId] as const,
};

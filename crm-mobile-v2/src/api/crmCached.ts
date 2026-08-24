/**
 * Lối vào duy nhất cho các truy vấn CRM đi qua cache dùng chung (TanStack Query).
 *
 * Vì sao bọc thêm một lớp thay vì gọi thẳng `api/crm.ts`:
 * - Gộp request trùng giữa các màn (Hub, List, Deadline cùng xin stage-counts).
 * - Cache sống ngoài vòng đời màn hình nên vào lại tab có số/thẻ ngay.
 * - Chỉ một chỗ để vô hiệu hoá theo nhánh key sau khi ghi dữ liệu.
 *
 * Các hàm `peek*` đọc đồng bộ để vẽ khung đầu tiên không phải chờ mạng.
 */
import {
  fetchCrmStageCountsBatch,
  fetchCrmStagePage,
  fetchDeadlineBucketCounts,
  fetchDeadlineBucketPages,
  type CrmStageFetchOpts,
  type CrmStagePage,
  type DeadlineBucketCounts,
  type DeadlineBucketPageResult,
  type DeadlineFetchOpts,
} from './crm';
import type { DeadlineBucketKey } from '../lib/crmDeadlineBuckets';
import { QUERY_STALE_MS, queryClient } from '../lib/queryClient';
import { crmKeys, filterKeyFromOpts, type CrmKind } from '../lib/queryKeys';

type StageCountsBatch = Awaited<ReturnType<typeof fetchCrmStageCountsBatch>>;

/* ------------------------------------------------------------------ *
 * Board: đếm cột + trang của cột
 * ------------------------------------------------------------------ */

export function peekStageCountsBatch(
  type: CrmKind,
  opts?: CrmStageFetchOpts,
): StageCountsBatch | undefined {
  return queryClient.getQueryData<StageCountsBatch>(
    crmKeys.stageCounts(type, filterKeyFromOpts(opts)),
  );
}

export function fetchStageCountsBatchCached(
  type: CrmKind,
  opts?: CrmStageFetchOpts & { force?: boolean },
): Promise<StageCountsBatch> {
  const queryKey = crmKeys.stageCounts(type, filterKeyFromOpts(opts));
  if (opts?.force) queryClient.removeQueries({ queryKey, exact: true });
  return queryClient.fetchQuery({
    queryKey,
    queryFn: ({ signal }) => fetchCrmStageCountsBatch(type, { ...opts, signal }),
    staleTime: opts?.force ? 0 : QUERY_STALE_MS.counts,
    // Caller đã có luồng retry/refresh riêng — để lỗi nổi lên ngay, không chờ retry.
    retry: 0,
  });
}

export function peekStagePage(
  type: CrmKind,
  stageId: string,
  offset: number,
  opts?: CrmStageFetchOpts,
): CrmStagePage | undefined {
  return queryClient.getQueryData<CrmStagePage>(
    crmKeys.stagePage(type, filterKeyFromOpts(opts), stageId, offset),
  );
}

export function fetchStagePageCached(
  type: CrmKind,
  stageId: string,
  offset: number,
  limit?: number,
  opts?: CrmStageFetchOpts,
  validStageIds?: Set<string>,
): Promise<CrmStagePage> {
  return queryClient.fetchQuery({
    queryKey: crmKeys.stagePage(type, filterKeyFromOpts(opts), stageId, offset),
    queryFn: ({ signal }) =>
      fetchCrmStagePage(type, stageId, offset, limit, { ...opts, signal }, validStageIds),
    staleTime: QUERY_STALE_MS.boardPage,
    retry: 0,
  });
}

/* ------------------------------------------------------------------ *
 * Deadline: đếm bucket + trang của bucket
 * ------------------------------------------------------------------ */

export function peekDeadlineBucketCountsQuery(
  type: CrmKind,
  filterKey: string,
): DeadlineBucketCounts | undefined {
  return queryClient.getQueryData<DeadlineBucketCounts>(
    crmKeys.deadlineBucketCounts(type, filterKey),
  );
}

export async function fetchDeadlineBucketCountsCached(
  type: CrmKind,
  filterKey: string,
  opts?: DeadlineFetchOpts & { force?: boolean },
): Promise<DeadlineBucketCounts> {
  const queryKey = crmKeys.deadlineBucketCounts(type, filterKey);
  if (opts?.force) queryClient.removeQueries({ queryKey, exact: true });
  const res = await queryClient.fetchQuery({
    queryKey,
    queryFn: ({ signal }) => fetchDeadlineBucketCounts(type, filterKey, { ...opts, signal }),
    staleTime: opts?.force ? 0 : QUERY_STALE_MS.counts,
    retry: 0,
  });
  // `complete: false` = mất mạng / chạm trần an toàn, số chỉ là cận dưới (thường là 0).
  // API không throw nên fetchQuery coi đây là dữ liệu hợp lệ và giữ suốt staleTime;
  // giữ lại sẽ khiến Deadline dính số 0 của lúc offline dù mạng đã trở lại.
  if (!res.complete) queryClient.removeQueries({ queryKey, exact: true });
  return res;
}

export function fetchDeadlineBucketPageCached(
  type: CrmKind,
  filterKey: string,
  bucket: DeadlineBucketKey,
  offset: number,
  limit: number,
  opts?: DeadlineFetchOpts,
): Promise<Record<string, DeadlineBucketPageResult>> {
  return queryClient.fetchQuery({
    queryKey: crmKeys.deadlineBucketPage(type, filterKey, bucket, offset),
    queryFn: ({ signal }) =>
      fetchDeadlineBucketPages(type, [{ bucket, offset, limit }], { ...opts, signal }),
    staleTime: QUERY_STALE_MS.boardPage,
    retry: 0,
  });
}

/* ------------------------------------------------------------------ *
 * Vô hiệu hoá theo nhánh — gọi sau khi ghi dữ liệu (kéo thẻ, đổi deadline…)
 * ------------------------------------------------------------------ */

export function invalidateBoardQueries(type?: CrmKind): void {
  void queryClient.invalidateQueries({ queryKey: crmKeys.boardRoot(type) });
}

export function invalidateDeadlineQueries(type?: CrmKind): void {
  void queryClient.invalidateQueries({ queryKey: crmKeys.deadlineRoot(type) });
}

export function invalidateLeadDetailQueries(leadId?: string): void {
  void queryClient.invalidateQueries({
    queryKey: leadId ? crmKeys.leadDetail(leadId) : crmKeys.detailRoot(),
  });
}

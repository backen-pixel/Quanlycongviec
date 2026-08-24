/**
 * Hook đọc dữ liệu CRM qua cache dùng chung (TanStack Query).
 *
 * Tất cả đi qua crmKeys nên cache/invalidate nhất quán giữa các màn:
 * mở lại màn cũ có dữ liệu ngay (stale-while-revalidate), refetch chạy nền.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  fetchCrmStageCountsBatch,
  fetchCrmStagePage,
  type CrmStageFetchOpts,
  type CrmStagePage,
} from '../api/crm';
import { fetchLeadDetail, type LeadDetailRow } from '../api/leadDetail';
import { QUERY_STALE_MS } from '../lib/queryClient';
import { crmKeys, filterKeyFromOpts, type CrmKind } from '../lib/queryKeys';

/** Chi tiết Lead/Deal — giữ dữ liệu cũ khi mở lại, không trắng màn. */
export function useLeadDetailQuery(leadId: string, enabled = true) {
  return useQuery<LeadDetailRow>({
    queryKey: crmKeys.leadDetail(leadId),
    queryFn: ({ signal }) => fetchLeadDetail(leadId, signal),
    enabled: enabled && !!leadId,
    staleTime: QUERY_STALE_MS.detail,
  });
}

/** Đếm bản ghi + giá trị từng cột của board (1 API call). */
export function useCrmStageCountsQuery(
  kind: CrmKind,
  opts?: CrmStageFetchOpts,
  enabled = true,
) {
  const filterKey = filterKeyFromOpts(opts);
  return useQuery({
    queryKey: crmKeys.stageCounts(kind, filterKey),
    queryFn: ({ signal }) => fetchCrmStageCountsBatch(kind, { ...opts, signal }),
    enabled,
    staleTime: QUERY_STALE_MS.counts,
  });
}

/** Một trang của cột board (key gồm offset nên mỗi trang cache riêng). */
export function useCrmStagePageQuery(
  kind: CrmKind,
  stageId: string,
  offset: number,
  limit?: number,
  opts?: CrmStageFetchOpts,
  enabled = true,
) {
  const filterKey = filterKeyFromOpts(opts);
  return useQuery<CrmStagePage>({
    queryKey: crmKeys.stagePage(kind, filterKey, stageId, offset),
    queryFn: ({ signal }) => fetchCrmStagePage(kind, stageId, offset, limit, { ...opts, signal }),
    enabled: enabled && !!stageId,
    staleTime: QUERY_STALE_MS.boardPage,
  });
}

/** Tiện ích invalidate theo nhánh key — dùng sau khi ghi dữ liệu. */
export function useCrmCacheActions() {
  const qc = useQueryClient();

  const invalidateBoard = useCallback(
    (kind?: CrmKind) => qc.invalidateQueries({ queryKey: crmKeys.boardRoot(kind) }),
    [qc],
  );
  const invalidateDeadline = useCallback(
    (kind?: CrmKind) => qc.invalidateQueries({ queryKey: crmKeys.deadlineRoot(kind) }),
    [qc],
  );
  const invalidateKpi = useCallback(
    () => qc.invalidateQueries({ queryKey: crmKeys.kpiRoot() }),
    [qc],
  );
  const invalidateLeadDetail = useCallback(
    (leadId?: string) =>
      qc.invalidateQueries({
        queryKey: leadId ? crmKeys.leadDetail(leadId) : crmKeys.detailRoot(),
      }),
    [qc],
  );

  return { invalidateBoard, invalidateDeadline, invalidateKpi, invalidateLeadDetail };
}

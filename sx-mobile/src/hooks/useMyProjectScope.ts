import { useCallback, useEffect, useMemo, useState } from 'react';
import { canViewTeamWork, fetchMyParticipationTasks, type WorkTask } from '../lib/workTasksApi';
import type { ProductionProject } from '../types';

type ScopeUser = { id?: string | null; userId?: string | null } | null | undefined;

/**
 * Phạm vi «dự án của tôi» cho NHÂN VIÊN: dự án đứng tên phụ trách SX HOẶC được giao việc.
 * Quản lý/admin (`canViewTeamWork`) không bị giới hạn — `restricted` = false, `allows` luôn đúng.
 *
 * Nhân viên xưởng hiếm khi đứng tên «người phụ trách» mà chủ yếu nhận việc, nên chỉ lọc theo
 * `production_person_id` sẽ ra danh sách rỗng. Dùng chung định nghĩa với Tổng quan và tab Dự án.
 *
 * Trong lúc danh sách việc chưa về (`ready` = false) chỉ khớp theo người phụ trách — màn hình nên
 * coi là «đang tải» chứ không phải «không có dự án».
 */
export function useMyProjectScope(
  user: ScopeUser,
  opts?: { tasks?: WorkTask[] },
): {
  restricted: boolean;
  ready: boolean;
  allows: (p: ProductionProject) => boolean;
} {
  const restricted = !canViewTeamWork(user as Parameters<typeof canViewTeamWork>[0]);
  const uid = String(user?.id || user?.userId || '');
  const [fetchedIds, setFetchedIds] = useState<Set<string> | null>(null);
  // Màn đã tự nạp việc của nhân viên (vd. Tổng quan) thì truyền vào đây để dùng đúng một bản dữ liệu,
  // kể cả khi kéo làm mới; không truyền thì hook tự nạp.
  const externalTasks = opts?.tasks;
  const externalIds = useMemo(
    () => (externalTasks
      ? new Set(externalTasks.map((t) => t.lead?.project_id).filter(Boolean).map(String))
      : null),
    [externalTasks],
  );
  const projectIds = externalIds ?? fetchedIds;

  useEffect(() => {
    if (!restricted || !uid || externalTasks) return undefined;
    const ac = new AbortController();
    void fetchMyParticipationTasks(uid, { signal: ac.signal })
      .then((tasks) => {
        setFetchedIds(new Set(
          tasks.map((t) => t.lead?.project_id).filter(Boolean).map(String),
        ));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [restricted, uid, externalTasks]);

  const allows = useCallback(
    (p: ProductionProject) => {
      if (!restricted) return true;
      return String(p.production_person_id || '') === uid || Boolean(projectIds?.has(String(p.id)));
    },
    [restricted, uid, projectIds],
  );

  return { restricted, ready: !restricted || projectIds !== null, allows };
}

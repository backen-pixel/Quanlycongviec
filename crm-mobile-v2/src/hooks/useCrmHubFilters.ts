import { useEffect, useReducer } from 'react';
import { currentUserId, useAuth } from '../context/AuthContext';
import type { CrmHubFilters } from '../lib/crmFilters';
import {
  commitCrmHubSearch,
  flushCrmHubFilters,
  getCrmHubFilterLive,
  hydrateCrmHubFilters,
  isCrmHubFiltersReady,
  patchCrmHubFilters,
  resetCrmHubFilterStore,
  resetCrmHubFilters,
  setCrmHubFilters,
  setCrmHubSearchDraft,
  subscribeCrmHubFilters,
} from '../lib/crmHubFilterStore';

/** Một bộ lọc CRM dùng chung Lead / Deal / Deadline / Overview. */
export function useCrmHubFilters() {
  const { user } = useAuth();
  const userId = currentUserId(user) || '';
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeCrmHubFilters(() => bump()), []);

  useEffect(() => {
    if (!userId) {
      resetCrmHubFilterStore();
      return undefined;
    }
    void hydrateCrmHubFilters(userId, user);
    return () => { flushCrmHubFilters(userId); };
    // Chỉ hydrate theo userId — object `user` đổi identity mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const ready = !userId || isCrmHubFiltersReady(userId);
  const live = getCrmHubFilterLive();

  return {
    ready,
    filters: live.filters,
    search: live.search,
    searchDraft: live.searchDraft,
    setSearchDraft: setCrmHubSearchDraft,
    commitSearch: commitCrmHubSearch,
    patchFilters: (patch: Partial<CrmHubFilters>) => patchCrmHubFilters(user, patch),
    setFilters: (next: CrmHubFilters | ((prev: CrmHubFilters) => CrmHubFilters)) =>
      setCrmHubFilters(user, next),
    resetFilters: () => resetCrmHubFilters(user),
  };
}

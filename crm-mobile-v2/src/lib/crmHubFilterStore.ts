import {
  applyCrmFilterLocks,
  DEFAULT_CRM_FILTERS,
  resetSharedCrmFilters,
  type CrmHubFilters,
} from './crmFilters';
import { loadCrmHubFilterSnapshot, saveCrmHubFilterSnapshot } from './crmHubFilterStorage';

type FilterUser = {
  role?: string | null;
  company_id?: string | null;
} | null | undefined;

export type CrmHubFilterLive = {
  filters: CrmHubFilters;
  search: string;
  searchDraft: string;
};

type Store = {
  userId: string;
  ready: boolean;
  live: CrmHubFilterLive;
};

const emptyLive = (): CrmHubFilterLive => ({
  filters: { ...DEFAULT_CRM_FILTERS },
  search: '',
  searchDraft: '',
});

let store: Store = { userId: '', ready: false, live: emptyLive() };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<CrmHubFilterLive> | null = null;
let hydrateUserId = '';

function emit() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

function sameFilters(a: CrmHubFilters, b: CrmHubFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function persistSoon(userId: string) {
  if (!userId || !store.ready) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveCrmHubFilterSnapshot(userId, {
      filters: store.live.filters,
      search: store.live.search,
    });
  }, 400);
}

export function subscribeCrmHubFilters(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getCrmHubFilterLive(): CrmHubFilterLive {
  return store.live;
}

export function isCrmHubFiltersReady(userId: string): boolean {
  return store.ready && store.userId === userId;
}

export function peekCrmHubFiltersForUser(userId: string): CrmHubFilterLive | null {
  if (store.ready && store.userId === userId) return store.live;
  return null;
}

export function flushCrmHubFilters(userId = store.userId) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!userId || !store.ready) return;
  void saveCrmHubFilterSnapshot(userId, {
    filters: store.live.filters,
    search: store.live.search,
  });
}

export function resetCrmHubFilterStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  hydratePromise = null;
  hydrateUserId = '';
  store = { userId: '', ready: false, live: emptyLive() };
  emit();
}

export async function hydrateCrmHubFilters(userId: string, user: FilterUser): Promise<CrmHubFilterLive> {
  if (!userId) {
    resetCrmHubFilterStore();
    return store.live;
  }
  if (store.ready && store.userId === userId) return store.live;
  if (hydratePromise && hydrateUserId === userId) return hydratePromise;

  hydrateUserId = userId;
  hydratePromise = (async () => {
    const snap = await loadCrmHubFilterSnapshot(userId);
    if (hydrateUserId !== userId) return store.live;
    const base = snap?.filters
      ? { ...DEFAULT_CRM_FILTERS, ...snap.filters }
      : resetSharedCrmFilters(user);
    const filters = applyCrmFilterLocks(user, base);
    const search = snap?.search || '';
    store = {
      userId,
      ready: true,
      live: { filters, search, searchDraft: search },
    };
    emit();
    return store.live;
  })();

  try {
    return await hydratePromise;
  } finally {
    if (hydrateUserId === userId) hydratePromise = null;
  }
}

export function patchCrmHubFilters(user: FilterUser, patch: Partial<CrmHubFilters>) {
  if (!store.ready) return;
  const filters = applyCrmFilterLocks(user, { ...store.live.filters, ...patch });
  if (sameFilters(filters, store.live.filters)) return;
  store = { ...store, live: { ...store.live, filters } };
  emit();
  persistSoon(store.userId);
}

export function setCrmHubFilters(
  user: FilterUser,
  next: CrmHubFilters | ((prev: CrmHubFilters) => CrmHubFilters),
) {
  if (!store.ready) return;
  const raw = typeof next === 'function' ? next(store.live.filters) : next;
  const filters = applyCrmFilterLocks(user, raw);
  if (sameFilters(filters, store.live.filters)) return;
  store = { ...store, live: { ...store.live, filters } };
  emit();
  persistSoon(store.userId);
}

export function setCrmHubSearchDraft(draft: string) {
  if (store.live.searchDraft === draft) return;
  store = { ...store, live: { ...store.live, searchDraft: draft } };
  emit();
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    const q = store.live.searchDraft.trim();
    if (q === store.live.search) return;
    store = { ...store, live: { ...store.live, search: q } };
    emit();
    persistSoon(store.userId);
  }, 320);
}

export function commitCrmHubSearch(q: string) {
  const next = q.trim();
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (store.live.search === next && store.live.searchDraft === next) return;
  store = { ...store, live: { ...store.live, search: next, searchDraft: next } };
  emit();
  persistSoon(store.userId);
}

export function resetCrmHubFilters(user: FilterUser) {
  if (!store.ready) return;
  store = {
    ...store,
    live: { filters: resetSharedCrmFilters(user), search: '', searchDraft: '' },
  };
  emit();
  persistSoon(store.userId);
}

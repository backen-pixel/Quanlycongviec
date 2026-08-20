import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { BoardFilters } from './productionApi';

const KEY = 'sx_kanban_filters_v1';
/** Event đồng bộ bộ lọc giữa Overview / Kanban / Work / Planner. */
export const SHARED_FILTERS_CHANGED = 'sx_shared_production_filters_changed';

export type KanbanFilterSnapshot = {
  filterCompany?: string;
  filterDealCompany?: string;
  filterWorkTypeId?: string;
};

/** Serialize writes — tránh Overview/Kanban/Work ghi đè lẫn nhau. */
let writeChain: Promise<void> = Promise.resolve();

/** Bản RAM — đọc sync sau khi hydrate / save. */
let memorySnap: KanbanFilterSnapshot | null = null;
let memoryHydrated = false;

function emitChanged(snap: KanbanFilterSnapshot): void {
  DeviceEventEmitter.emit(SHARED_FILTERS_CHANGED, snap);
}

export function getSharedFiltersSync(): KanbanFilterSnapshot {
  return memorySnap ? { ...memorySnap } : {};
}

export function subscribeSharedFilters(
  listener: (snap: KanbanFilterSnapshot) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(
    SHARED_FILTERS_CHANGED,
    (snap: KanbanFilterSnapshot) => listener(snap || {}),
  );
  return () => sub.remove();
}

/**
 * Deal company picker → param API board.
 * `ext:…` chỉ lọc client trên Kanban — không gửi lên server (tránh cache key lệch).
 */
export function dealCompanyIdForBoardApi(filterDealCompany?: string | null): string | undefined {
  const raw = String(filterDealCompany || '').trim();
  if (!raw || raw.startsWith('ext:')) return undefined;
  return raw;
}

/** Snapshot → BoardFilters dùng chung Overview / Kanban / Planner / cache key. */
export function boardFiltersFromSharedSnap(
  snap: KanbanFilterSnapshot | null | undefined,
  opts?: { companyIdOverride?: string | null },
): BoardFilters {
  const companyId = String(opts?.companyIdOverride ?? snap?.filterCompany ?? '').trim() || undefined;
  const workRaw = String(snap?.filterWorkTypeId || '').trim();
  const workshopTypeId = companyId && workRaw && workRaw !== 'none' ? workRaw : undefined;
  return {
    companyId,
    dealCompanyId: dealCompanyIdForBoardApi(snap?.filterDealCompany),
    workshopTypeId,
  };
}

export async function loadKanbanFilters(): Promise<KanbanFilterSnapshot | null> {
  try {
    if (memoryHydrated && memorySnap) return { ...memorySnap };
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      memorySnap = {};
      memoryHydrated = true;
      return null;
    }
    const parsed = JSON.parse(raw) as KanbanFilterSnapshot;
    const snap = parsed && typeof parsed === 'object' ? parsed : {};
    memorySnap = { ...snap };
    memoryHydrated = true;
    return { ...snap };
  } catch {
    memoryHydrated = true;
    return memorySnap ? { ...memorySnap } : null;
  }
}

/**
 * Merge partial vào snapshot hiện có (không replace toàn bộ).
 * Chỉ ghi field được truyền (undefined = bỏ qua; '' = xóa có chủ đích).
 */
export async function saveKanbanFilters(
  partial: Partial<KanbanFilterSnapshot>,
): Promise<void> {
  const run = async () => {
    try {
      const prev = (await loadKanbanFilters()) || {};
      const next: KanbanFilterSnapshot = { ...prev };
      (Object.keys(partial) as Array<keyof KanbanFilterSnapshot>).forEach((k) => {
        const v = partial[k];
        if (v !== undefined) next[k] = v;
      });
      memorySnap = { ...next };
      memoryHydrated = true;
      const same =
        String(prev.filterCompany || '') === String(next.filterCompany || '')
        && String(prev.filterDealCompany || '') === String(next.filterDealCompany || '')
        && String(prev.filterWorkTypeId || '') === String(next.filterWorkTypeId || '');
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      if (!same) emitChanged(next);
    } catch {
      /* ignore */
    }
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

/** Xóa bộ lọc khi đăng xuất — tránh user mới kế thừa scope công ty cũ. */
export async function clearKanbanFilters(): Promise<void> {
  writeChain = writeChain.then(async () => {
    try {
      memorySnap = {};
      memoryHydrated = true;
      await AsyncStorage.removeItem(KEY);
      emitChanged({});
    } catch {
      /* ignore */
    }
  }, async () => {
    try {
      memorySnap = {};
      memoryHydrated = true;
      await AsyncStorage.removeItem(KEY);
      emitChanged({});
    } catch {
      /* ignore */
    }
  });
  return writeChain;
}

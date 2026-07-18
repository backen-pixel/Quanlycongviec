import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProductionBoard, ProductionProject } from '../types';
import type { BoardFilters } from './productionApi';

/**
 * Cache board dùng chung giữa các tab (Kanban, Tổng quan, Kế hoạch, Danh sách, Quá hạn).
 * RAM + AsyncStorage (cold start): stale-while-revalidate, không bắt user đợi full download.
 */
type CacheEntry = { board: ProductionBoard; at: number };

const cache = new Map<string, CacheEntry>();
const DISK_KEY = 'sx_board_cache_v1';
const DISK_SCHEMA = 1;
/** Board coi là còn "tươi" trong khoảng này → không cần refetch nền. */
export const BOARD_CACHE_FRESH_MS = 90_000;
/** Snapshot đĩa vẫn dùng để hiện UI (sau đó refresh nền). */
const DISK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DISK_MAX_PROJECTS = 2500;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;

export function boardCacheKey(filters: BoardFilters = {}): string {
  return [
    filters.companyId || '',
    filters.dealCompanyId || '',
    filters.workshopTypeId || '',
  ].join('|');
}

export function getCachedBoard(filters: BoardFilters = {}): ProductionBoard | null {
  return cache.get(boardCacheKey(filters))?.board ?? null;
}

/** Seed UI khi chưa biết filter — lấy board mới nhất trong cache (bất kỳ key). */
export function getAnyCachedBoard(): ProductionBoard | null {
  let newest: CacheEntry | null = null;
  for (const entry of cache.values()) {
    if (!newest || entry.at > newest.at) newest = entry;
  }
  return newest?.board ?? null;
}

/** Tuổi cache (ms) hoặc null nếu chưa có. */
export function getCachedBoardAge(filters: BoardFilters = {}): number | null {
  const entry = cache.get(boardCacheKey(filters));
  return entry ? Date.now() - entry.at : null;
}

export function isCachedBoardFresh(filters: BoardFilters = {}): boolean {
  const age = getCachedBoardAge(filters);
  return age != null && age < BOARD_CACHE_FRESH_MS;
}

export function setCachedBoard(filters: BoardFilters = {}, board: ProductionBoard): void {
  // Chỉ lưu khi có dữ liệu thực (tránh ghi đè bằng partial rỗng lúc đầu).
  if (!board || (board.projects.length === 0 && board.stages.length === 0)) return;
  cache.set(boardCacheKey(filters), { board, at: Date.now() });
  schedulePersist(boardCacheKey(filters));
}

/**
 * Cập nhật 1 dự án trong mọi snapshot cache (kéo cột / socket stage_changed).
 * Trả về board đã patch theo key gần nhất, hoặc null nếu không có trong cache.
 */
export function patchCachedProjectById(
  projectId: string,
  patch: Partial<ProductionProject>,
): ProductionBoard | null {
  const pid = String(projectId || '');
  if (!pid) return null;
  let newest: CacheEntry | null = null;
  let newestKey = '';
  for (const [key, entry] of cache.entries()) {
    const idx = entry.board.projects.findIndex((p) => String(p.id) === pid);
    if (idx < 0) continue;
    const nextProjects = entry.board.projects.slice();
    const prev = nextProjects[idx];
    const merged: ProductionProject = { ...prev, ...patch };
    if (patch.sx_kanban_column_id != null && patch.resolved_column_id == null) {
      merged.resolved_column_id = String(patch.sx_kanban_column_id);
    }
    if (patch.sx_kanban_column_id != null) {
      const col = entry.board.stages.find((s) => String(s.id) === String(patch.sx_kanban_column_id));
      if (col?.progress_percent != null && Number.isFinite(Number(col.progress_percent))) {
        merged.sx_pipeline_percent = Number(col.progress_percent);
      }
    }
    nextProjects[idx] = merged;
    const nextEntry: CacheEntry = {
      board: { ...entry.board, projects: nextProjects, kpis: null },
      at: Date.now(),
    };
    cache.set(key, nextEntry);
    if (!newest || nextEntry.at >= newest.at) {
      newest = nextEntry;
      newestKey = key;
    }
  }
  if (newest && newestKey) schedulePersist(newestKey);
  return newest?.board ?? null;
}

export function clearBoardCache(): void {
  cache.clear();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  void AsyncStorage.removeItem(DISK_KEY).catch(() => {});
}

function schedulePersist(key: string): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistToDisk(key);
  }, 900);
}

async function persistToDisk(preferredKey: string): Promise<void> {
  try {
    let key = preferredKey;
    let entry = cache.get(preferredKey) ?? null;
    if (!entry) {
      for (const [k, e] of cache.entries()) {
        if (!entry || e.at > entry.at) {
          entry = e;
          key = k;
        }
      }
    }
    if (!entry) return;
    const { board, at } = entry;
    if (board.projects.length > DISK_MAX_PROJECTS) return;

    const payload = JSON.stringify({
      v: DISK_SCHEMA,
      key,
      at,
      board: {
        stages: board.stages,
        projects: board.projects,
        kpis: null,
      },
    });
    // AsyncStorage Android ~6MB — bỏ qua nếu quá lớn.
    if (payload.length > 4_500_000) return;
    await AsyncStorage.setItem(DISK_KEY, payload);
  } catch {
    /* ignore disk errors */
  }
}

/** Gọi sớm khi mở app — hydrate RAM trước khi các tab mount. */
export function hydrateBoardCacheFromDisk(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(DISK_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        v?: number;
        key?: string;
        at?: number;
        board?: ProductionBoard;
      };
      if (parsed?.v !== DISK_SCHEMA || !parsed.key || !parsed.board || !parsed.at) return;
      if (Date.now() - parsed.at > DISK_MAX_AGE_MS) {
        await AsyncStorage.removeItem(DISK_KEY);
        return;
      }
      if (!Array.isArray(parsed.board.stages) || !Array.isArray(parsed.board.projects)) return;
      if (cache.has(parsed.key)) return; // RAM mới hơn
      cache.set(parsed.key, { board: parsed.board, at: parsed.at });
    } catch {
      /* ignore corrupt */
    }
  })();
  return hydratePromise;
}

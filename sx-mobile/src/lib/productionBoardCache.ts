import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProductionBoard, ProductionProject } from '../types';
import type { BoardFilters } from './productionApi';

/**
 * Cache board dùng chung giữa các tab (Kanban, Tổng quan, Kế hoạch, Danh sách, Quá hạn).
 * RAM + AsyncStorage (cold start): stale-while-revalidate.
 * Partial (đang tải thêm trang) không đánh «tươi» — tránh silent skip board dở.
 */
type CacheEntry = {
  board: ProductionBoard;
  at: number;
  /** false = đang tải dở / abort giữa chừng / truncated — không dùng làm fresh. */
  complete: boolean;
};

const cache = new Map<string, CacheEntry>();
/** Patch socket trong lúc multi-page fetch — re-apply trước mỗi emitAttached. */
const pendingProjectPatches = new Map<string, Partial<ProductionProject>>();
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

export function isCachedBoardComplete(filters: BoardFilters = {}): boolean {
  return cache.get(boardCacheKey(filters))?.complete === true;
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

/** Chỉ board đã tải xong (không truncated) mới được coi tươi (silent skip). */
export function isCachedBoardFresh(filters: BoardFilters = {}): boolean {
  const entry = cache.get(boardCacheKey(filters));
  if (!entry?.complete) return false;
  if (entry.board.truncated) return false;
  return Date.now() - entry.at < BOARD_CACHE_FRESH_MS;
}

export type SetCachedBoardOptions = {
  /** false = partial / abort / truncated — giữ UI nhưng không fresh, không ghi disk. */
  complete?: boolean;
};

export function setCachedBoard(
  filters: BoardFilters = {},
  board: ProductionBoard,
  opts: SetCachedBoardOptions = {},
): void {
  // Chỉ lưu khi có dữ liệu thực (tránh ghi đè bằng partial rỗng lúc đầu).
  if (!board || (board.projects.length === 0 && board.stages.length === 0)) return;
  const key = boardCacheKey(filters);
  // Truncated không bao giờ «complete/fresh» — tránh silent skip dataset thiếu.
  const complete = opts.complete !== false && !board.truncated;
  const prev = cache.get(key);

  if (!complete) {
    // Không đẩy `at` lên «tươi» — nếu đã có bản complete trước đó, giữ timestamp cũ
    // để vẫn có thể refresh nền; UI vẫn thấy board đang lớn dần.
    cache.set(key, {
      board,
      at: prev?.complete ? prev.at : 0,
      complete: false,
    });
    return;
  }

  cache.set(key, { board, at: Date.now(), complete: true });
  // Giới hạn RAM: giữ tối đa 6 key mới nhất.
  if (cache.size > 6) {
    const ranked = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    while (ranked.length > 6) {
      const oldest = ranked.shift();
      if (oldest) cache.delete(oldest[0]);
    }
  }
  schedulePersist(key);
}

function mergeProjectPatch(
  prev: ProductionProject,
  patch: Partial<ProductionProject>,
  stages?: ProductionBoard['stages'],
): ProductionProject {
  const merged: ProductionProject = { ...prev, ...patch };
  if (patch.sx_kanban_column_id != null && patch.resolved_column_id == null) {
    merged.resolved_column_id = String(patch.sx_kanban_column_id);
  }
  if (patch.sx_kanban_column_id != null && stages?.length) {
    const col = stages.find((s) => String(s.id) === String(patch.sx_kanban_column_id));
    if (col?.progress_percent != null && Number.isFinite(Number(col.progress_percent))) {
      merged.sx_pipeline_percent = Number(col.progress_percent);
    }
    if (patch.sx_intake == null) {
      merged.sx_intake = col?.bucket_slug === 'won_pending';
    }
  }
  return merged;
}

/** Ghi nhớ patch để không bị multi-page emitAttached ghi đè. */
export function notePendingProjectPatch(
  projectId: string,
  patch: Partial<ProductionProject>,
): void {
  const pid = String(projectId || '');
  if (!pid || !patch || !Object.keys(patch).length) return;
  const prev = pendingProjectPatches.get(pid) || {};
  pendingProjectPatches.set(pid, { ...prev, ...patch });
}

/** Áp mọi pending patch lên danh sách đang assemble (trước khi ghi cache). */
export function applyPendingPatchesToProjects(
  projects: ProductionProject[],
  stages?: ProductionBoard['stages'],
): ProductionProject[] {
  if (!pendingProjectPatches.size || !projects.length) return projects;
  let changed = false;
  const next = projects.map((p) => {
    const patch = pendingProjectPatches.get(String(p.id));
    if (!patch) return p;
    changed = true;
    return mergeProjectPatch(p, patch, stages);
  });
  return changed ? next : projects;
}

export function clearPendingProjectPatches(): void {
  pendingProjectPatches.clear();
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
  notePendingProjectPatch(pid, patch);
  let newest: CacheEntry | null = null;
  let newestKey = '';
  for (const [key, entry] of cache.entries()) {
    const idx = entry.board.projects.findIndex((p) => String(p.id) === pid);
    if (idx < 0) continue;
    const nextProjects = entry.board.projects.slice();
    nextProjects[idx] = mergeProjectPatch(nextProjects[idx], patch, entry.board.stages);
    const nextEntry: CacheEntry = {
      board: { ...entry.board, projects: nextProjects, kpis: null },
      at: entry.at,
      complete: entry.complete,
    };
    cache.set(key, nextEntry);
    if (!newest || nextEntry.at >= newest.at) {
      newest = nextEntry;
      newestKey = key;
    }
  }
  if (newest && newestKey && newest.complete) schedulePersist(newestKey);
  return newest?.board ?? null;
}

export function clearBoardCache(): void {
  cache.clear();
  pendingProjectPatches.clear();
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
    if (!entry?.complete) {
      entry = null;
      for (const [k, e] of cache.entries()) {
        if (!e.complete) continue;
        if (!entry || e.at > entry.at) {
          entry = e;
          key = k;
        }
      }
    }
    if (!entry?.complete) return;
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
        truncated: board.truncated || false,
      },
    });
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
      if (cache.has(parsed.key)) return;
      // Truncated snapshot không đánh complete.
      const complete = !parsed.board.truncated;
      cache.set(parsed.key, { board: parsed.board, at: parsed.at, complete });
    } catch {
      /* ignore corrupt */
    }
  })();
  return hydratePromise;
}

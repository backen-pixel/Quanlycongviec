import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { ProductionBoard, ProductionProject } from '../types';
import type { BoardFilters } from './logisticsApi';
import { bindProjectToDisplayStages } from './logisticsApi';

/**
 * Cache board dùng chung giữa các tab (Kanban, Tổng quan, Kế hoạch, Quá hạn).
 * RAM + AsyncStorage (cold start): stale-while-revalidate, không bắt user đợi full download.
 *
 * P0: board > DISK_MAX_PROJECTS vẫn ghi đĩa — cắt snapshot (stages + N dự án đầu).
 * Full list chỉ giữ RAM; cold start hiện snapshot rồi refresh nền.
 */
type CacheEntry = { board: ProductionBoard; at: number };

const cache = new Map<string, CacheEntry>();
const DISK_KEY = 'vc_board_cache_v1';
const DISK_SCHEMA = 2;
/** Board coi là còn "tươi" trong khoảng này → không cần refetch nền. */
export const BOARD_CACHE_FRESH_MS = 90_000;
/** Snapshot đĩa vẫn dùng để hiện UI (sau đó refresh nền). */
const DISK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Số dự án tối đa ghi AsyncStorage (Android ~6MB). */
const DISK_MAX_PROJECTS = 2500;

/** Emit khi RAM cache đổi — Kanban/Overview nhận bản progressive. */
export const BOARD_CACHE_UPDATED = 'vc_board_cache_updated';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;

/**
 * Patch lạc quan chờ server xác nhận (kéo thẻ / bàn giao).
 * Lượt phân trang đang chạy dở trả về cột CŨ → phải áp lại patch lên mọi board
 * ghi sau đó, nếu không thẻ sẽ nhảy về cột cũ giữa lúc tải.
 */
const pendingPatches = new Map<string, { patch: Partial<ProductionProject>; at: number }>();
const PENDING_PATCH_TTL_MS = 20_000;

function applyPendingPatches(board: ProductionBoard): ProductionBoard {
  if (!pendingPatches.size) return board;
  const now = Date.now();
  for (const [id, entry] of pendingPatches.entries()) {
    if (now - entry.at > PENDING_PATCH_TTL_MS) pendingPatches.delete(id);
  }
  if (!pendingPatches.size) return board;
  let changed = false;
  const projects = board.projects.map((p) => {
    const entry = pendingPatches.get(String(p.id));
    if (!entry) return p;
    changed = true;
    return bindProjectToDisplayStages({ ...p, ...entry.patch }, board.stages);
  });
  return changed ? { ...board, projects } : board;
}

export function boardCacheKey(filters: BoardFilters = {}): string {
  return [
    filters.companyId || '',
    filters.dealCompanyId || '',
    filters.workshopTypeId || '',
    filters.priority || '',
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

export type SetCachedBoardOptions = {
  /**
   * Cập nhật RAM giữa chừng khi đang tải trang — không refresh đồng hồ "tươi"
   * và không ghi đĩa (tránh coi partial là đủ / ghi đĩa giữa chừng).
   */
  soft?: boolean;
};

export function setCachedBoard(
  filters: BoardFilters = {},
  board: ProductionBoard,
  opts?: SetCachedBoardOptions,
): void {
  // Chỉ lưu khi có dữ liệu thực (tránh ghi đè bằng partial rỗng lúc đầu).
  if (!board || (board.projects.length === 0 && board.stages.length === 0)) return;
  const key = boardCacheKey(filters);
  const prev = cache.get(key);
  const soft = Boolean(opts?.soft);
  const next = applyPendingPatches(board);
  // soft: giữ `at` cũ (hoặc 0) → isCachedBoardFresh vẫn false cho đến khi fetch xong.
  const at = soft ? (prev?.at ?? 0) : Date.now();
  cache.set(key, { board: next, at });
  // Giới hạn RAM: giữ tối đa 6 key mới nhất.
  if (cache.size > 6) {
    const ranked = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    while (ranked.length > 6) {
      const oldest = ranked.shift();
      if (oldest) cache.delete(oldest[0]);
    }
  }
  DeviceEventEmitter.emit(BOARD_CACHE_UPDATED, { key, board: next, soft });
  if (!soft) schedulePersist(key);
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
  pendingPatches.set(pid, { patch, at: Date.now() });
  let newest: CacheEntry | null = null;
  let newestKey = '';
  for (const [key, entry] of cache.entries()) {
    const idx = entry.board.projects.findIndex((p) => String(p.id) === pid);
    if (idx < 0) continue;
    const nextProjects = entry.board.projects.slice();
    const prev = nextProjects[idx];
    const merged: ProductionProject = { ...prev, ...patch };
    nextProjects[idx] = bindProjectToDisplayStages(merged, entry.board.stages);
    const nextEntry: CacheEntry = {
      board: {
        ...entry.board,
        projects: nextProjects,
        kpis: null,
        meta: entry.board.meta ? { ...entry.board.meta } : entry.board.meta,
      },
      at: Date.now(),
    };
    cache.set(key, nextEntry);
    DeviceEventEmitter.emit(BOARD_CACHE_UPDATED, { key, board: nextEntry.board, soft: false });
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
  pendingPatches.clear();
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

function slimProjectsForDisk(projects: ProductionProject[]): {
  projects: ProductionProject[];
  diskPartial: boolean;
} {
  if (projects.length <= DISK_MAX_PROJECTS) {
    return { projects, diskPartial: false };
  }
  return {
    projects: projects.slice(0, DISK_MAX_PROJECTS),
    diskPartial: true,
  };
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
    // P0: luôn ghi snapshot — cắt bớt nếu > DISK_MAX (trước đây bỏ hẳn → cold start luôn mạng).
    const { projects, diskPartial } = slimProjectsForDisk(board.projects);
    const diskBoard: ProductionBoard = {
      stages: board.stages,
      projects,
      kpis: board.kpis ?? null,
      meta: {
        ...(board.meta || {}),
        fetchedCount: board.projects.length,
        diskPartial: diskPartial || Boolean(board.meta?.diskPartial),
        truncated: board.meta?.truncated,
        totalKnown: board.meta?.totalKnown ?? null,
      },
    };

    const payload = JSON.stringify({
      v: DISK_SCHEMA,
      key,
      at,
      board: diskBoard,
    });
    // AsyncStorage Android ~6MB — bỏ qua nếu quá lớn.
    if (payload.length > 4_500_000) {
      // Thử cắt mạnh hơn (stages + 800 dự án) thay vì bỏ cache.
      const tighter = slimProjectsForDisk(projects.slice(0, 800));
      const compact: ProductionBoard = {
        ...diskBoard,
        projects: tighter.projects,
        meta: { ...diskBoard.meta, diskPartial: true, fetchedCount: board.projects.length },
      };
      const compactPayload = JSON.stringify({ v: DISK_SCHEMA, key, at, board: compact });
      if (compactPayload.length > 4_500_000) return;
      await AsyncStorage.setItem(DISK_KEY, compactPayload);
      return;
    }
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
      if (!parsed.key || !parsed.board || !parsed.at) return;
      if (parsed.v !== DISK_SCHEMA && parsed.v !== 1) return;
      if (Date.now() - parsed.at > DISK_MAX_AGE_MS) {
        await AsyncStorage.removeItem(DISK_KEY);
        return;
      }
      if (!Array.isArray(parsed.board.stages) || !Array.isArray(parsed.board.projects)) return;
      // Schema 1: key = company|deal|workshop — thêm suffix priority rỗng.
      let key = parsed.key;
      if (key.split('|').length === 3) key = `${key}|`;
      if (cache.has(key)) return; // RAM mới hơn
      // Snapshot đĩa (có thể partial) — đặt at cũ hơn FRESH để luôn refresh nền.
      const at = parsed.board.meta?.diskPartial
        ? Math.min(parsed.at, Date.now() - BOARD_CACHE_FRESH_MS - 1)
        : parsed.at;
      cache.set(key, { board: parsed.board, at });
    } catch {
      /* ignore corrupt */
    }
  })();
  return hydratePromise;
}

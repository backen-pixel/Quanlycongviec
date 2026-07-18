import type { ProductionBoard } from '../types';
import type { BoardFilters } from './productionApi';

/**
 * Cache board dùng chung giữa các tab (Kanban, Tổng quan, Kế hoạch, Danh sách, Quá hạn).
 * Mục tiêu: chuyển tab hiển thị dữ liệu NGAY (stale-while-revalidate) thay vì tải lại
 * toàn bộ board mỗi lần vào tab.
 */
type CacheEntry = { board: ProductionBoard; at: number };

const cache = new Map<string, CacheEntry>();

/** Board coi là còn "tươi" trong khoảng này → không cần refetch nền. */
export const BOARD_CACHE_FRESH_MS = 60_000;

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
}

export function clearBoardCache(): void {
  cache.clear();
}

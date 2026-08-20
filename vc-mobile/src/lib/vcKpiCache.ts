import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BoardFilters } from './logisticsApi';
import type { VcBoardKpis } from './vcBoardKpis';

/**
 * Cache KPI Tổng quan (RAM + AsyncStorage).
 *
 * Payload chỉ ~12 số nên rẻ hơn cache board rất nhiều — dùng làm initialData
 * cho query KPI để cold start hiện số ngay rồi mới revalidate.
 */
const DISK_KEY = 'vc_overview_kpis_v1';
const DISK_SCHEMA = 1;
const DISK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Entry = { at: number; kpis: VcBoardKpis };

let mem: Record<string, Entry> = {};
let writeTimer: ReturnType<typeof setTimeout> | null = null;

export function vcKpiCacheKey(filters: BoardFilters = {}): string {
  return [
    filters.companyId || '',
    filters.dealCompanyId || '',
    filters.workshopTypeId || '',
    filters.priority || '',
  ].join('|');
}

export function getCachedVcKpis(filters: BoardFilters = {}): Entry | null {
  const hit = mem[vcKpiCacheKey(filters)];
  if (!hit) return null;
  if (Date.now() - hit.at > DISK_MAX_AGE_MS) return null;
  return hit;
}

export function setCachedVcKpis(filters: BoardFilters, kpis: VcBoardKpis): void {
  mem[vcKpiCacheKey(filters)] = { at: Date.now(), kpis };
  scheduleDiskWrite();
}

export function clearVcKpiCache(): void {
  mem = {};
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  void AsyncStorage.removeItem(DISK_KEY).catch(() => {});
}

/** Gộp nhiều lần ghi trong 1 giây — tránh chặn JS thread khi realtime dồn. */
function scheduleDiskWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void AsyncStorage.setItem(
      DISK_KEY,
      JSON.stringify({ v: DISK_SCHEMA, entries: mem }),
    ).catch(() => {});
  }, 1000);
}

export async function hydrateVcKpiCacheFromDisk(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DISK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { v?: number; entries?: Record<string, Entry> };
    if (parsed?.v !== DISK_SCHEMA || !parsed.entries) return;
    const fresh: Record<string, Entry> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (!entry?.kpis || typeof entry.at !== 'number') continue;
      if (Date.now() - entry.at > DISK_MAX_AGE_MS) continue;
      fresh[key] = entry;
    }
    // Dữ liệu vừa fetch trong session luôn thắng snapshot trên đĩa.
    mem = { ...fresh, ...mem };
  } catch {
    /* ignore */
  }
}

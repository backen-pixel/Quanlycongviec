import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeadlineFocusBreakdown } from '../api/deadlineOverdue';

const KEY = 'crmv2_overview_kpi_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type OverviewKpiCache = {
  userId: string;
  focus: DeadlineFocusBreakdown;
  todayLead: number;
  todayDeal: number;
  at: number;
};

let mem: OverviewKpiCache | null = null;
let hydratePromise: Promise<void> | null = null;

export function peekOverviewKpiCache(userId: string): OverviewKpiCache | null {
  if (!userId || !mem || mem.userId !== userId) return null;
  if (Date.now() - mem.at > MAX_AGE_MS) return null;
  return mem;
}

export async function hydrateOverviewKpiCache(): Promise<void> {
  if (mem) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OverviewKpiCache;
      if (!parsed?.userId || !parsed.focus || typeof parsed.at !== 'number') return;
      if (Date.now() - parsed.at > MAX_AGE_MS) return;
      mem = parsed;
    } catch {
      /* bỏ qua cache hỏng */
    }
  })().finally(() => {
    hydratePromise = null;
  });
  return hydratePromise;
}

export async function saveOverviewKpiCache(next: OverviewKpiCache): Promise<void> {
  mem = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function clearOverviewKpiCache(): Promise<void> {
  mem = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

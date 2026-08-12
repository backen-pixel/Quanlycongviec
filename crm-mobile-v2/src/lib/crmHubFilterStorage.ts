import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeCrmHubFilters, type CrmHubFilters } from './crmFilters';

const keyForUser = (userId: string) => `crmv2_hub_filters:${userId || 'anon'}`;

export type CrmHubFilterSnapshot = {
  filters: CrmHubFilters;
  search: string;
};

export async function loadCrmHubFilterSnapshot(userId: string): Promise<CrmHubFilterSnapshot | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CrmHubFilterSnapshot>;
    return {
      filters: sanitizeCrmHubFilters(parsed.filters),
      search: typeof parsed.search === 'string' ? parsed.search : '',
    };
  } catch {
    return null;
  }
}

export async function saveCrmHubFilterSnapshot(
  userId: string,
  snap: CrmHubFilterSnapshot,
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(
      keyForUser(userId),
      JSON.stringify({
        filters: sanitizeCrmHubFilters(snap.filters),
        search: String(snap.search || ''),
      }),
    );
  } catch {
    /* ignore */
  }
}

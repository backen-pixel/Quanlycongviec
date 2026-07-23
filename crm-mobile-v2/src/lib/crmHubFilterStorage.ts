import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CRM_FILTERS, type CrmHubFilters } from './crmFilters';

const keyForUser = (userId: string) => `crmv2_hub_filters:${userId || 'anon'}`;

export type CrmHubFilterSnapshot = {
  filters: CrmHubFilters;
  search: string;
};

function sanitizeFilters(raw: Partial<CrmHubFilters> | null | undefined): CrmHubFilters {
  const f = { ...DEFAULT_CRM_FILTERS, ...(raw || {}) };
  const phoneOk = f.phone === '' || f.phone === 'has_phone' || f.phone === 'no_phone';
  const assigneeOk = f.assignee === 'all' || f.assignee === 'mine' || f.assignee === 'user';
  const dueOk = f.due === 'all' || f.due === 'overdue' || f.due === 'today';
  const timeOk = f.timePreset === '' || f.timePreset === 'this_week' || f.timePreset === 'this_month';
  const searchOk = ['all', 'title', 'phone', 'code', 'assignee'].includes(f.searchField);
  return {
    phone: phoneOk ? f.phone : DEFAULT_CRM_FILTERS.phone,
    assignee: assigneeOk ? f.assignee : DEFAULT_CRM_FILTERS.assignee,
    assigneeUserId: String(f.assigneeUserId || ''),
    departmentId: String(f.departmentId || ''),
    due: dueOk ? f.due : DEFAULT_CRM_FILTERS.due,
    timePreset: timeOk ? f.timePreset : DEFAULT_CRM_FILTERS.timePreset,
    companyId: String(f.companyId || ''),
    regionId: String(f.regionId || ''),
    showOrphan: !!f.showOrphan,
    searchField: searchOk ? f.searchField : DEFAULT_CRM_FILTERS.searchField,
  };
}

export async function loadCrmHubFilterSnapshot(userId: string): Promise<CrmHubFilterSnapshot | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CrmHubFilterSnapshot>;
    return {
      filters: sanitizeFilters(parsed.filters),
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
        filters: sanitizeFilters(snap.filters),
        search: String(snap.search || ''),
      }),
    );
  } catch {
    /* ignore */
  }
}

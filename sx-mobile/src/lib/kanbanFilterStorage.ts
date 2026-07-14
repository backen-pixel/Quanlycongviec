import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sx_kanban_filters_v1';

export type KanbanFilterSnapshot = {
  filterCompany?: string;
  filterDealCompany?: string;
  filterWorkTypeId?: string;
};

export async function loadKanbanFilters(): Promise<KanbanFilterSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KanbanFilterSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveKanbanFilters(snap: KanbanFilterSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

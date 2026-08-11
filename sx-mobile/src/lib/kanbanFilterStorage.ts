import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sx_kanban_filters_v1';

export type KanbanFilterSnapshot = {
  filterCompany?: string;
  filterDealCompany?: string;
  filterWorkTypeId?: string;
};

/** Serialize writes — tránh Overview/Kanban/Work ghi đè lẫn nhau. */
let writeChain: Promise<void> = Promise.resolve();

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
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
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
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, async () => {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  });
  return writeChain;
}

import type { MessengerGroupListItem } from '../types/messenger';

let cached: MessengerGroupListItem[] | null = null;
let cachedAt = 0;

export function setMessengerGroupsCache(list: MessengerGroupListItem[]) {
  cached = list;
  cachedAt = Date.now();
}

export function getMessengerGroupsCache(maxAgeMs = 180_000): MessengerGroupListItem[] | null {
  if (!cached?.length || Date.now() - cachedAt > maxAgeMs) return null;
  return cached;
}

/** Prefetch danh sách nhóm — gọi trước khi mở màn chuyển tiếp. */
export async function prefetchMessengerGroups(
  fetcher: () => Promise<MessengerGroupListItem[]>,
): Promise<MessengerGroupListItem[]> {
  try {
    const list = await fetcher();
    setMessengerGroupsCache(list);
    return list;
  } catch {
    return getMessengerGroupsCache(86400_000) || [];
  }
}

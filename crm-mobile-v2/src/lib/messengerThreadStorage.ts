import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (userId: string) => `messenger_deleted_threads_${userId}`;

export async function loadDeletedThreadIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

export async function saveDeletedThreadIds(userId: string, ids: Set<string>): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(key(userId), JSON.stringify([...ids]));
}

export async function markThreadDeleted(userId: string, threadId: string): Promise<Set<string>> {
  const set = await loadDeletedThreadIds(userId);
  set.add(String(threadId));
  await saveDeletedThreadIds(userId, set);
  return set;
}

export async function restoreThread(userId: string, threadId: string): Promise<Set<string>> {
  const set = await loadDeletedThreadIds(userId);
  set.delete(String(threadId));
  await saveDeletedThreadIds(userId, set);
  return set;
}

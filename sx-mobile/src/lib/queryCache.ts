/**
 * Cache truy vấn dùng chung cho các API không phải board: key + TTL + dedupe inflight.
 *
 * Board vẫn dùng productionBoardCache (có persist đĩa + soft patch realtime riêng).
 * Lớp này phục vụ chi tiết dự án, danh sách công việc, KPI giao việc — những chỗ
 * trước đây fetch lại mỗi lần mở màn hình.
 *
 * Hai bảo đảm chính:
 * - Cùng key trong TTL → không gọi mạng lần hai.
 * - Nhiều màn hình gọi song song cùng key → chung một lượt mạng (dedupe inflight);
 *   signal của một caller chỉ bỏ chờ của caller đó, không hủy fetch dùng chung.
 */

type QueryEntry<T> = { data: T; at: number };

const store = new Map<string, QueryEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Trần số entry — Map giữ thứ tự chèn nên xóa từ đầu là LRU thô. */
const MAX_ENTRIES = 160;

export const QUERY_TTL_SHORT = 30_000;
export const QUERY_TTL_MEDIUM = 60_000;
export const QUERY_TTL_LONG = 5 * 60_000;

export function queryAbortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

export function isQueryAbortError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'CanceledError') return true;
  return /aborted|canceled|cancelled/i.test(String(err.message || ''));
}

/** Chờ promise dùng chung nhưng bỏ chờ khi signal abort — fetch vẫn chạy tới cùng. */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(queryAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(queryAbortError());
    };
    signal.addEventListener('abort', onAbort);
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

export function setQueryData<T>(key: string, data: T): void {
  store.delete(key);
  store.set(key, { data, at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function getQueryData<T>(key: string): T | null {
  const hit = store.get(key);
  return hit ? (hit.data as T) : null;
}

/** Tuổi cache (ms) hoặc null nếu chưa có. */
export function getQueryAge(key: string): number | null {
  const hit = store.get(key);
  return hit ? Date.now() - hit.at : null;
}

export function isQueryFresh(key: string, ttlMs = QUERY_TTL_SHORT): boolean {
  const age = getQueryAge(key);
  return age != null && age < ttlMs;
}

/** Sửa tại chỗ dữ liệu đã cache (optimistic update) — bỏ qua nếu chưa có. */
export function patchQueryData<T>(key: string, updater: (prev: T) => T): void {
  const hit = store.get(key);
  if (!hit) return;
  try {
    store.set(key, { data: updater(hit.data as T), at: hit.at });
  } catch {
    store.delete(key);
  }
}

export function invalidateQuery(key: string): void {
  store.delete(key);
}

/** Xóa mọi key bắt đầu bằng prefix — dùng sau khi mutate (vd 'sx:dealTasks:'). */
export function invalidateQueryPrefix(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Đăng xuất / đổi công ty — bỏ toàn bộ để không lẫn dữ liệu giữa tài khoản. */
export function clearQueryCache(): void {
  store.clear();
  inflight.clear();
}

export type CachedQueryOptions<T> = {
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
  /** true = bỏ qua cache (kéo làm mới). Vẫn dùng chung inflight đang chạy. */
  force?: boolean;
  /** Bỏ chờ của caller khi đổi màn/đổi filter. */
  signal?: AbortSignal;
  /** Có cache cũ quá TTL → trả ra trước để UI hiện ngay, rồi vẫn fetch nền. */
  onStale?: (data: T) => void;
};

export async function cachedQuery<T>(opts: CachedQueryOptions<T>): Promise<T> {
  const { key, fetcher, ttlMs = QUERY_TTL_SHORT, force, signal, onStale } = opts;
  if (signal?.aborted) throw queryAbortError();

  if (!force) {
    const hit = store.get(key);
    if (hit) {
      if (Date.now() - hit.at < ttlMs) {
        // Đẩy về cuối Map để không bị LRU cắt sớm.
        store.delete(key);
        store.set(key, hit);
        return hit.data as T;
      }
      if (onStale) {
        try {
          onStale(hit.data as T);
        } catch {
          /* lỗi của listener không được làm hỏng query */
        }
      }
    }
  }

  let shared = inflight.get(key) as Promise<T> | undefined;
  if (!shared) {
    shared = (async () => {
      const data = await fetcher();
      setQueryData(key, data);
      return data;
    })();
    const current = shared;
    inflight.set(key, current);
    current.then(
      () => {
        if (inflight.get(key) === current) inflight.delete(key);
      },
      () => {
        if (inflight.get(key) === current) inflight.delete(key);
      },
    );
  }

  return raceAbort(shared, signal);
}

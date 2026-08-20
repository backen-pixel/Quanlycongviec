import { QueryClient } from '@tanstack/react-query';

/**
 * Query/Cache layer dùng chung (Tổng quan / Kanban / Chi tiết).
 *
 * Mục tiêu: mỗi màn hình đọc cùng một cache key → không fetch trùng,
 * và mỗi query cập nhật UI độc lập (không chờ request chậm nhất).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache còn "tươi" → đọc RAM, không gọi mạng.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      // Mobile: focus/reconnect do screen tự điều khiển (useFocusEffect) → tắt auto.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // KHÔNG keepPreviousData: đổi công ty/bộ lọc phải hiện loading, không được
      // để số của phạm vi cũ đứng lại trên UI của phạm vi mới.
    },
    mutations: { retry: 0 },
  },
});

/** Xoá toàn bộ cache server-data khi đăng xuất. */
export function clearQueryCache(): void {
  queryClient.clear();
}

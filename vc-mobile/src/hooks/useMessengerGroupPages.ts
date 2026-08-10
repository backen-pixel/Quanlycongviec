import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMessengerGroupsPage,
  MESSENGER_INBOX_PAGE_SIZE,
} from '../lib/messengerApi';
import type { MessengerThread } from '../types/messenger';

/** Inbox phân trang cursor — dùng Forward / Share, không tải full list. */
export function useMessengerGroupPages(myUserId?: string | null) {
  const [threads, setThreads] = useState<MessengerThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const threadsRef = useRef<MessengerThread[]>([]);

  hasMoreRef.current = hasMore;
  threadsRef.current = threads;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchMessengerGroupsPage(myUserId, { limit: MESSENGER_INBOX_PAGE_SIZE });
      setThreads(page.threads);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách');
      setThreads([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [myUserId]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const last = threadsRef.current[threadsRef.current.length - 1];
    if (!last?.lastMessageAt) {
      setHasMore(false);
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMessengerGroupsPage(myUserId, {
        limit: MESSENGER_INBOX_PAGE_SIZE,
        before: last.lastMessageAt,
        beforeId: last.id,
      });
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const extra = page.threads.filter((t) => !seen.has(t.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
      setHasMore(page.hasMore);
    } catch {
      /* giữ trang đã tải */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [myUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { threads, loading, loadingMore, hasMore, error, refresh, loadMore };
}

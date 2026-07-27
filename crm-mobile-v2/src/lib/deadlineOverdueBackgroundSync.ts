import { api, getStoredToken } from '../api/client';
import { fetchDeadlineOverdueBreakdown } from '../api/deadlineOverdue';
import { maybeNotifyDeadlineOverdue } from './deadlineOverdueNotify';
import {
  getDeadlineOverdueBreakdown,
  isDeadlineOverdueFresh,
} from './deadlineOverdueStore';

let running = false;

type MeUser = {
  id?: string;
  company_id?: string | null;
  role?: string | null;
};

/**
 * Quét số quá hạn + nhắc tray (nếu đủ 3h).
 * Dùng cho foreground runner và background task.
 */
export async function runDeadlineOverdueCheckOnce(opts?: {
  forceFetch?: boolean;
  /** Truyền user đã có (foreground) để khỏi gọi /auth/me. */
  user?: MeUser | null;
}): Promise<void> {
  if (running) return;
  running = true;
  try {
    const token = await getStoredToken();
    if (!token) return;

    let breakdown = getDeadlineOverdueBreakdown();
    const needFetch = opts?.forceFetch || !isDeadlineOverdueFresh(90_000);

    if (needFetch) {
      let user = opts?.user || null;
      if (!user?.id) {
        try {
          const { data } = await api.get<{ user?: MeUser }>('/auth/me');
          user = data?.user || null;
        } catch {
          return;
        }
      }
      if (!user?.id) return;
      breakdown = await fetchDeadlineOverdueBreakdown(user);
    }

    await maybeNotifyDeadlineOverdue(breakdown);
  } catch {
    /* bỏ qua — không chặn app */
  } finally {
    running = false;
  }
}

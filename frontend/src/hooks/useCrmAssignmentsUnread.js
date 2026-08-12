import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Số nhiệm vụ "Giao việc CRM" cần chú ý của user hiện tại:
 *   overdue + dueSoon (24h) + pending.
 * Refresh: mỗi 60s + bắt event 'notification' nếu socket có sẵn (qua window).
 *
 * Chỉ gọi API khi đã đăng nhập — nếu không, route sẽ trả 401 và bị
 * interceptor redirect về /login (vô nghĩa khi user vốn dĩ đang ở /login).
 */
export function useCrmAssignmentsUnread(assignmentModule = 'crm') {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [detail, setDetail] = useState({ overdue: 0, dueSoon: 0, pending: 0 });
  const mod = String(assignmentModule || 'crm').toLowerCase();

  const refresh = useCallback(async () => {
    if (!user) {
      setUnread(0);
      setDetail({ overdue: 0, dueSoon: 0, pending: 0 });
      return;
    }
    try {
      const params = /^[a-z][a-z0-9_-]{0,63}$/.test(mod) ? { assignment_module: mod } : {};
      const { data } = await api.get('/crm/assignments/unread-count', { params });
      setUnread(Number(data?.unread) || 0);
      setDetail({
        overdue: Number(data?.overdue) || 0,
        dueSoon: Number(data?.dueSoon) || 0,
        pending: Number(data?.pending) || 0,
      });
    } catch {
      setUnread(0);
      setDetail({ overdue: 0, dueSoon: 0, pending: 0 });
    }
  }, [user, mod]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      setDetail({ overdue: 0, dueSoon: 0, pending: 0 });
      return undefined;
    }
    void refresh();
    const t = setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    const onBadge = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('badge:refresh:assignments', onBadge);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('badge:refresh:assignments', onBadge);
    };
  }, [refresh, user]);

  return { unread, ...detail, refresh };
}

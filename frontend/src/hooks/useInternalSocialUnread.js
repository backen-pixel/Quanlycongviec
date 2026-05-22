import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';

const LS_SOCIAL_COMPANY = 'internal_social_filter_company_id';

/**
 * Số bài mới trên bảng tin nội bộ (kể từ lần xem gần nhất).
 * Admin hệ thống: tổng mọi công ty hoặc theo company_id trong localStorage.
 */
export function useInternalSocialUnread() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const isSystemAdmin = checkSystemAdmin(user);

  const refresh = useCallback(async () => {
    try {
      const params = {};
      if (isSystemAdmin) {
        try {
          const cid = localStorage.getItem(LS_SOCIAL_COMPANY);
          if (cid) params.company_id = cid;
        } catch { /* ignore */ }
      }
      const { data } = await api.get('/internal-social/unread-count', { params });
      setUnread(Number(data?.unread) || 0);
    } catch {
      setUnread(0);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    const onRead = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('internal-social-read', onRead);
    window.addEventListener('storage', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('internal-social-read', onRead);
      window.removeEventListener('storage', onFocus);
    };
  }, [refresh]);

  return { unread, refresh };
}

import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';

import { readScopeField } from '../shared/lib/scopeFilterStorage';

const SOCIAL_SCOPE_PREFIX = 'internal_social';

/**
 * Số bài mới trên bảng tin nội bộ (kể từ lần xem gần nhất).
 * Admin hệ thống: tổng mọi công ty hoặc theo company_id trong localStorage.
 *
 * Chỉ gọi API khi đã đăng nhập — provider này được mount ở root (ngoài
 * ProtectedLayout) nên hook chạy cả khi user đang ở /login.
 */
export function useInternalSocialUnread() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const isSystemAdmin = checkSystemAdmin(user);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnread(0);
      return;
    }
    try {
      const params = {};
      if (isSystemAdmin) {
        try {
          const cid = readScopeField(SOCIAL_SCOPE_PREFIX, 'company_id');
          if (cid) params.company_id = cid;
        } catch { /* ignore */ }
      }
      const { data } = await api.get('/internal-social/unread-count', { params });
      setUnread(Number(data?.unread) || 0);
    } catch {
      setUnread(0);
    }
  }, [user, isSystemAdmin]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return undefined;
    }
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
  }, [refresh, user]);

  return { unread, refresh };
}

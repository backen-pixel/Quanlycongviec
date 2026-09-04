import { useCallback, useEffect, useRef } from 'react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { setAppHeartbeatActive } from '../lib/appHeartbeatFlag';
import { readScopeField } from '../shared/lib/scopeFilterStorage';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';

const HEARTBEAT_MS = 60_000;
const SOCIAL_SCOPE_PREFIX = 'internal_social';

const EMPTY_ASSIGN = { unread: 0, overdue: 0, dueSoon: 0, pending: 0 };

function buildSocialCompanyParam(user) {
  if (!user || !checkSystemAdmin(user)) return undefined;
  try {
    const cid = readScopeField(SOCIAL_SCOPE_PREFIX, 'company_id');
    return cid || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 1 request /api/heartbeat thay:
 *   POST /users/ping + GET assignments×2 + GET social + GET release-notes
 * Badge server cache 15s — giảm query DB trên host.
 */
export function useAppHeartbeat({ enabled, user, onUpdate }) {
  const enabledRef = useRef(enabled);
  const onUpdateRef = useRef(onUpdate);
  enabledRef.current = enabled;
  onUpdateRef.current = onUpdate;

  const tick = useCallback(async ({ fresh = false, badges = true } = {}) => {
    if (!enabledRef.current || !user) return;
    const expectedUserId = user?.id || user?.userId;
    try {
      const params = {};
      const socialCid = buildSocialCompanyParam(user);
      if (socialCid) params.social_company_id = socialCid;
      if (fresh) params.fresh = '1';
      if (!badges) params.badges = '0';

      const { data } = await api.get('/heartbeat', { params });
      if (!enabledRef.current) return;
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const currentId = currentUser?.id || currentUser?.userId;
      if (!localStorage.getItem('token') || String(currentId || '') !== String(expectedUserId || '')) {
        return;
      }
      const badges = data?.badges;
      if (badges && onUpdateRef.current) {
        onUpdateRef.current({
          assignmentsCrm: badges.assignments_crm || EMPTY_ASSIGN,
          assignmentsProduction: badges.assignments_production || EMPTY_ASSIGN,
          assignmentsLogistics: badges.assignments_logistics || EMPTY_ASSIGN,
          social: Number(badges.social?.unread) || 0,
          releaseNotesDb: Number(badges.release_notes?.unread) || 0,
          notifications: badges.notifications || null,
          unifiedTasks: badges.unified_tasks || { open: 0, overdue: 0 },
        });
      }

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('presence:ping');
      }
    } catch {
      /* ignore — badge/presence không critical */
    }
  }, [user]);

  useEffect(() => {
    if (!enabled || !user) {
      setAppHeartbeatActive(false);
      return undefined;
    }

    setAppHeartbeatActive(true);

    void tick();
    // Tab đang ẩn: VẪN ping để giữ trạng thái "đang online" (ngưỡng phía server là 90–120s),
    // nhưng bỏ phần tính badge — không ai nhìn badge khi tab ẩn, mà nó chính là phần tốn kém:
    // mỗi nhịp chạy ~6 câu tổng hợp (đếm việc, thông báo, giao việc, mạng nội bộ...).
    // Đo trên pg_stat_statements: riêng heartbeat chiếm khoảng 48% tổng thời gian DB.
    // Backend đã hỗ trợ sẵn ?badges=0 (routes/heartbeat.js) — trước giờ chưa ai dùng.
    // Khi tab hiện lại, listener visibilitychange bên dưới gọi tick() đầy đủ nên badge
    // được làm mới ngay, không bị trễ.
    const intervalId = setInterval(() => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      void tick(hidden ? { badges: false } : {});
    }, HEARTBEAT_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    const onFocus = () => void tick({ fresh: true });
    const onBadge = () => void tick({ fresh: true });

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('badge:refresh:assignments', onBadge);
    window.addEventListener('badge:refresh:social', onBadge);
    window.addEventListener('badge:refresh:updates', onBadge);

    const socket = getSocket();
    const onSocketConnect = () => void tick();
    if (socket) socket.on('connect', onSocketConnect);

    return () => {
      setAppHeartbeatActive(false);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('badge:refresh:assignments', onBadge);
      window.removeEventListener('badge:refresh:social', onBadge);
      window.removeEventListener('badge:refresh:updates', onBadge);
      if (socket) socket.off('connect', onSocketConnect);
    };
  }, [enabled, user, tick]);

  return { refresh: tick };
}

export { EMPTY_ASSIGN };

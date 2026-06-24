import { invalidateApiCache } from './api';
import { setAppHeartbeatActive } from './appHeartbeatFlag';
import { clearCrmDashboardCache, clearCrmDashboardMetaCache } from './crmDashboardCache';
import { cancelNotificationSpeech } from './notificationAlert';

/** Dọn state client khi đăng xuất / đổi tài khoản — tránh tin nhắn tài khoản cũ. */
export function resetClientSessionState() {
  setAppHeartbeatActive(false);
  invalidateApiCache();
  try {
    clearCrmDashboardCache();
    clearCrmDashboardMetaCache();
  } catch {
    /* ignore */
  }
  try {
    cancelNotificationSpeech();
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('auth:session-cleared'));
  } catch {
    /* ignore */
  }
}

import { invalidateApiCache } from './api';
import { setAppHeartbeatActive } from './appHeartbeatFlag';
import { clearCrmDashboardCache, clearCrmDashboardMetaCache } from './crmDashboardCache';
import { cancelNotificationSpeech } from './notificationAlert';

const LS_SX_DASH = 'sx_dash_filters_v1';
const LS_VC_DASH = 'vc_dash_filters_v1';
const LS_WORKSHOP_RENAMES = 'workshop_project_rename_patches_v1';

/** Xóa bộ lọc / patch Kanban SX·VC — sống qua F5 nhưng phải hết khi logout. */
export function clearWorkshopDashFilterStorage() {
  try {
    localStorage.removeItem(LS_SX_DASH);
    localStorage.removeItem(LS_VC_DASH);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(LS_WORKSHOP_RENAMES);
    sessionStorage.removeItem('sx_focus_pipeline_card_id');
    sessionStorage.removeItem('vc_focus_pipeline_card_id');
    sessionStorage.removeItem('sx_kanban_board_snap_v1');
    sessionStorage.removeItem('vc_kanban_board_snap_v1');
    sessionStorage.removeItem('sx_dash_stage_kpis_v1');
    sessionStorage.removeItem('sx_dash_column_counts_v1');
  } catch {
    /* ignore */
  }
}

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
    clearWorkshopDashFilterStorage();
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

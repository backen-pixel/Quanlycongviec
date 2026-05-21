import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { api } from '../api/client';

const KEY = 'crm_mobile_prefs_v1';

/** Để `NotificationContext` cập nhật ngay khi lưu Cài đặt. */
export const CRM_MOBILE_PREFS_CHANGED = 'crm-mobile-prefs-changed';

export type CrmMobilePrefs = {
  /** Cho phép dùng micro / tải ghi âm lên web từ app */
  voiceCaptureEnabled: boolean;
  /** Android: quét file audio mới theo định kỳ và tải lên server khi app ở nền */
  voiceBackgroundSyncEnabled: boolean;
  /** Sau khi có file mới, gọi quét ghép CRM theo SĐT (API relink-unassigned) */
  autoLinkVoiceByPhone: boolean;
  /**
   * Mặc định bật: giữ socket thông báo khi app ở nền.
   * Tắt trong Cài đặt → ngắt socket khi chuyển app (tiết kiệm pin / dữ liệu).
   */
  backgroundRealtimeEnabled: boolean;
  /** Master: bật nhóm công cụ tự động (Facebook / danh bạ — mở rộng sau) */
  autoToolsEnabled: boolean;
  facebookAutoTool: boolean;
  contactsAutoTool: boolean;
  floatingChatBubbleEnabled: boolean;
  floatingChatBubbleOnlyWhenUnread: boolean;
  floatingChatBubbleCompact: boolean;
  /** Android: bong bóng SYSTEM overlay trên app khác (TYPE_APPLICATION_OVERLAY). */
  floatingChatBubbleSystemOverlay: boolean;
  /**
   * Android 11+: ưu tiên dùng Android Bubbles API (chuẩn hệ thống, không cần quyền overlay)
   * thay vì overlay tự vẽ. Khi user cấm Bubbles trong cài đặt hệ thống → tự fallback overlay.
   * Đối ứng feature flag `change_chat_head_permission_for_bubbles` của Messenger.
   */
  useAndroidBubblesWhenAvailable: boolean;
};

/** Bật tối đa mọi tùy chọn bool (cài mới; nút «Bật tất cả» trong Tài khoản). */
export function createAllEnabledCrmMobilePrefs(): CrmMobilePrefs {
  return {
    voiceCaptureEnabled: true,
    voiceBackgroundSyncEnabled: true,
    autoLinkVoiceByPhone: true,
    backgroundRealtimeEnabled: true,
    autoToolsEnabled: true,
    facebookAutoTool: true,
    contactsAutoTool: true,
    floatingChatBubbleEnabled: true,
    /** false = luôn hiện bong bóng khi có tin (không chỉ khi unread). */
    floatingChatBubbleOnlyWhenUnread: false,
    floatingChatBubbleCompact: false,
    floatingChatBubbleSystemOverlay: true,
    useAndroidBubblesWhenAvailable: true,
  };
}

const DEFAULTS: CrmMobilePrefs = createAllEnabledCrmMobilePrefs();

const SERVER_KEYS: (keyof CrmMobilePrefs)[] = [
  'voiceCaptureEnabled',
  'voiceBackgroundSyncEnabled',
  'autoLinkVoiceByPhone',
  'backgroundRealtimeEnabled',
  'autoToolsEnabled',
  'facebookAutoTool',
  'contactsAutoTool',
  'floatingChatBubbleEnabled',
  'floatingChatBubbleOnlyWhenUnread',
  'floatingChatBubbleCompact',
  'floatingChatBubbleSystemOverlay',
  'useAndroidBubblesWhenAvailable',
];

export async function loadCrmMobilePrefs(): Promise<CrmMobilePrefs> {
  let local: CrmMobilePrefs = { ...DEFAULTS };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<CrmMobilePrefs>;
      local = { ...DEFAULTS, ...o };
    }
  } catch {
    local = { ...DEFAULTS };
  }
  try {
    const { data } = await api.get<Record<string, unknown>>('/users/crm-app-prefs');
    if (!data || typeof data !== 'object') return local;
    let merged: CrmMobilePrefs = { ...local };
    let touched = false;
    for (const k of SERVER_KEYS) {
      if (data[k] !== undefined) {
        merged = { ...merged, [k]: !!data[k] };
        touched = true;
      }
    }
    if (touched) await AsyncStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return local;
  }
}

export async function saveCrmMobilePrefs(p: CrmMobilePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  DeviceEventEmitter.emit(CRM_MOBILE_PREFS_CHANGED, p);
  try {
    await api.put('/users/crm-app-prefs', p);
  } catch {
    /* vẫn dùng được cục bộ khi offline */
  }
}

export function canAssigneeFilterLeads(role?: string | null): boolean {
  const r = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

export function canAssigneeFilterDeals(role?: string | null): boolean {
  const r = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

/** Admin xem toàn bộ ghi âm + quét ghép đa nhân viên (API voice-recordings). */
export function isCrmVoiceAdmin(role?: string | null): boolean {
  const r = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

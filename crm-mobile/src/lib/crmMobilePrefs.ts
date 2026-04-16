import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { api } from '../api/client';

const KEY = 'crm_mobile_prefs_v1';

/** Để `NotificationContext` cập nhật ngay khi lưu Cài đặt. */
export const CRM_MOBILE_PREFS_CHANGED = 'crm-mobile-prefs-changed';

export type CrmMobilePrefs = {
  /** Cho phép dùng micro / tải ghi âm lên web từ app */
  voiceCaptureEnabled: boolean;
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
};

const DEFAULTS: CrmMobilePrefs = {
  voiceCaptureEnabled: true,
  autoLinkVoiceByPhone: true,
  backgroundRealtimeEnabled: true,
  autoToolsEnabled: false,
  facebookAutoTool: false,
  contactsAutoTool: false,
};

const SERVER_KEYS: (keyof CrmMobilePrefs)[] = [
  'voiceCaptureEnabled',
  'autoLinkVoiceByPhone',
  'backgroundRealtimeEnabled',
  'autoToolsEnabled',
  'facebookAutoTool',
  'contactsAutoTool',
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
  return ['admin', 'manager', 'director', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

/** Admin xem toàn bộ ghi âm + quét ghép đa nhân viên (API voice-recordings). */
export function isCrmVoiceAdmin(role?: string | null): boolean {
  const r = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(r);
}

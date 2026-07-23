import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEY = 'crmv2_mobile_prefs';

export const CRMV2_PREFS_CHANGED = 'crmv2_prefs_changed';

export type CrmMobilePrefs = {
  voiceCaptureEnabled: boolean;
  voiceBackgroundSyncEnabled: boolean;
  autoLinkVoiceByPhone: boolean;
  /** Chỉ tự upload khi SĐT đã có trong CRM — tránh lưu cuộc gọi cá nhân. */
  uploadCrmPhonesOnly: boolean;
  floatingChatBubbleEnabled: boolean;
  floatingChatBubbleOnlyWhenUnread: boolean;
  floatingChatBubbleSystemOverlay: boolean;
};

export const DEFAULT_CRM_MOBILE_PREFS: CrmMobilePrefs = {
  voiceCaptureEnabled: true,
  voiceBackgroundSyncEnabled: true,
  autoLinkVoiceByPhone: true,
  uploadCrmPhonesOnly: true,
  floatingChatBubbleEnabled: true,
  floatingChatBubbleOnlyWhenUnread: false,
  floatingChatBubbleSystemOverlay: true,
};

export async function loadCrmMobilePrefs(): Promise<CrmMobilePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CRM_MOBILE_PREFS };
    return { ...DEFAULT_CRM_MOBILE_PREFS, ...(JSON.parse(raw) as Partial<CrmMobilePrefs>) };
  } catch {
    return { ...DEFAULT_CRM_MOBILE_PREFS };
  }
}

export async function saveCrmMobilePrefs(p: CrmMobilePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  DeviceEventEmitter.emit(CRMV2_PREFS_CHANGED, p);
}

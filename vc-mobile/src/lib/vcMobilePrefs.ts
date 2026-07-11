import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEY = 'vc_mobile_prefs';

export const VC_PREFS_CHANGED = 'vc_prefs_changed';

export type VcMobilePrefs = {
  floatingChatBubbleEnabled: boolean;
  floatingChatBubbleOnlyWhenUnread: boolean;
  floatingChatBubbleSystemOverlay: boolean;
};

export const DEFAULT_VC_MOBILE_PREFS: VcMobilePrefs = {
  floatingChatBubbleEnabled: true,
  floatingChatBubbleOnlyWhenUnread: false,
  floatingChatBubbleSystemOverlay: true,
};

export async function loadVcMobilePrefs(): Promise<VcMobilePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_VC_MOBILE_PREFS };
    return { ...DEFAULT_VC_MOBILE_PREFS, ...(JSON.parse(raw) as Partial<VcMobilePrefs>) };
  } catch {
    return { ...DEFAULT_VC_MOBILE_PREFS };
  }
}

export async function saveVcMobilePrefs(p: VcMobilePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  DeviceEventEmitter.emit(VC_PREFS_CHANGED, p);
}

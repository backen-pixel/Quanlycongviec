import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const KEY = 'sx_mobile_prefs';

export const SX_PREFS_CHANGED = 'sx_prefs_changed';

export type SxMobilePrefs = {
  floatingChatBubbleEnabled: boolean;
  floatingChatBubbleOnlyWhenUnread: boolean;
  floatingChatBubbleSystemOverlay: boolean;
};

export const DEFAULT_SX_MOBILE_PREFS: SxMobilePrefs = {
  floatingChatBubbleEnabled: true,
  floatingChatBubbleOnlyWhenUnread: false,
  floatingChatBubbleSystemOverlay: true,
};

export async function loadSxMobilePrefs(): Promise<SxMobilePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SX_MOBILE_PREFS };
    return { ...DEFAULT_SX_MOBILE_PREFS, ...(JSON.parse(raw) as Partial<SxMobilePrefs>) };
  } catch {
    return { ...DEFAULT_SX_MOBILE_PREFS };
  }
}

export async function saveSxMobilePrefs(p: SxMobilePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
  DeviceEventEmitter.emit(SX_PREFS_CHANGED, p);
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'crmv2_mobile_prefs';

export type CrmMobilePrefs = {
  voiceCaptureEnabled: boolean;
  voiceBackgroundSyncEnabled: boolean;
  autoLinkVoiceByPhone: boolean;
};

const DEFAULTS: CrmMobilePrefs = {
  voiceCaptureEnabled: true,
  voiceBackgroundSyncEnabled: true,
  autoLinkVoiceByPhone: true,
};

export async function loadCrmMobilePrefs(): Promise<CrmMobilePrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CrmMobilePrefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveCrmMobilePrefs(p: CrmMobilePrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

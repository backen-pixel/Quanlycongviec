import AsyncStorage from '@react-native-async-storage/async-storage';

/** Khớp web `CRM_DEAL_KH_SPLIT_LS_KEY`. */
export const CRM_DEAL_KH_SPLIT_LS_KEY = 'crm_deal_kh_split';

/** Mặc định: admin/sales_admin tách Deal/ĐH; user thường gộp. */
export function readDefaultDealKhSplitEnabled(isAdminLike: boolean): boolean {
  return !!isAdminLike;
}

export async function readStoredDealKhSplitPreference(isAdminLike: boolean): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(CRM_DEAL_KH_SPLIT_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return readDefaultDealKhSplitEnabled(isAdminLike);
}

export async function storeDealKhSplitPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CRM_DEAL_KH_SPLIT_LS_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

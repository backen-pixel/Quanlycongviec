import * as Updates from 'expo-updates';

type OtaOpts = {
  onFetching?: () => void;
};

/** Kiểm tra & áp dụng OTA — tự reload nếu có bản mới. */
export async function checkAndApplyOtaUpdate(opts: OtaOpts = {}): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) return false;
    opts.onFetching?.();
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

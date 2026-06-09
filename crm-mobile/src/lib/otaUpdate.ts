/**
 * Cập nhật JS nhanh (OTA bundle) qua expo-updates — KHÔNG cần cài lại APK.
 * Manifest tự host: server /api/app-updates/manifest (cấu hình ở app.json → updates.url).
 *
 * Dùng cho thay đổi JS/giao diện. Thay đổi native (quyền, versionCode, thư viện native)
 * vẫn cần full APK (xem src/lib/appUpdate).
 */
import * as Updates from 'expo-updates';

/** Kiểm tra & áp dụng bản OTA mới nhất. Nếu có → tải và reload app. Không ném lỗi. */
export async function checkAndApplyOtaUpdate(): Promise<boolean> {
  // Bỏ qua trong Expo Go / dev (expo-updates chỉ chạy ở bản build).
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

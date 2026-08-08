/** Thông báo khóa tính năng gọi thoại/video (đang hoàn tất) trên app Vận chuyển. */
export const CALL_FEATURE_LOCKED_MESSAGE = 'Tính năng gọi thoại/video đã tắt trên app Vận chuyển.';

export function alertCallFeatureLocked(
  Alert: { alert: (title: string, message?: string) => void },
): void {
  Alert.alert('Cuộc gọi', CALL_FEATURE_LOCKED_MESSAGE);
}

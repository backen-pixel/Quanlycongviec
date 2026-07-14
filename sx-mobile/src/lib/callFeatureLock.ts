/** Thông báo khóa tính năng gọi (đang hoàn tất). */
export const CALL_FEATURE_LOCKED_MESSAGE = 'Tính năng cuộc gọi đang trong quá trình hoàn tất.';

export function alertCallFeatureLocked(
  Alert: { alert: (title: string, message?: string) => void },
): void {
  Alert.alert('Cuộc gọi', CALL_FEATURE_LOCKED_MESSAGE);
}

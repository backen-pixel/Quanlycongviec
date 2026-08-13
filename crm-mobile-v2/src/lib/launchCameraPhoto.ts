/**
 * Mở camera hệ thống — ổn định khi gọi từ ô nhập (bình luận).
 * Android: phải đợi bàn phím đóng hẳn rồi mới launch, nếu không Intent bị hủy im lặng.
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert, Keyboard, PermissionsAndroid, Platform } from 'react-native';

export async function ensureCameraPermission(opts?: {
  title?: string;
  message?: string;
}): Promise<boolean> {
  const title = opts?.title || 'Quyền camera';
  const message = opts?.message || 'Cần quyền camera để chụp ảnh. Bật Camera trong Cài đặt ứng dụng.';

  try {
    if (Platform.OS === 'android') {
      const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (already) return true;
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Cho phép Camera',
        message: 'Ứng dụng cần camera để chụp ảnh gửi bình luận / tin nhắn.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Từ chối',
      });
      if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
      Alert.alert(title, message);
      return false;
    }

    const cur = await ImagePicker.getCameraPermissionsAsync();
    if (cur.granted) return true;
    const req = await ImagePicker.requestCameraPermissionsAsync();
    if (req.granted) return true;
    Alert.alert(title, message);
    return false;
  } catch (e) {
    Alert.alert(title, e instanceof Error ? e.message : message);
    return false;
  }
}

/** Đợi bàn phím ẩn — tránh launchCamera bị cancel khi còn SoftInput. */
export function waitForKeyboardHidden(timeoutMs = 700): Promise<void> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      Keyboard.dismiss();
      setTimeout(resolve, 40);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sub.remove();
      } catch {
        /* bỏ qua */
      }
      clearTimeout(timer);
      // Thêm nhịp layout sau keyboardDidHide (KeyboardAvoidingView).
      setTimeout(resolve, 120);
    };
    const sub = Keyboard.addListener('keyboardDidHide', finish);
    const timer = setTimeout(finish, timeoutMs);
    Keyboard.dismiss();
  });
}

export async function launchCameraPhoto(opts?: {
  quality?: number;
  /** @deprecated dùng waitKeyboard — mặc định luôn đợi bàn phím trên Android. */
  settleMs?: number;
  /** true = đợi keyboard đóng (mặc định true trên Android). */
  waitKeyboard?: boolean;
}): Promise<ImagePicker.ImagePickerAsset | null> {
  const waitKb = opts?.waitKeyboard ?? Platform.OS === 'android';
  if (waitKb) {
    await waitForKeyboardHidden(
      typeof opts?.settleMs === 'number' && opts.settleMs > 0
        ? Math.max(opts.settleMs, 500)
        : 700,
    );
  } else if ((opts?.settleMs ?? 0) > 0) {
    await new Promise<void>((r) => setTimeout(r, opts!.settleMs));
  }

  const ok = await ensureCameraPermission();
  if (!ok) return null;

  try {
    // Khớp tin nhắn: mediaTypes dạng mảng string — ổn định hơn enum trên một số máy.
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: opts?.quality ?? 0.85,
      allowsEditing: false,
      exif: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return null;
    return shot.assets[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Alert.alert(
      'Không mở được camera',
      /activity|intent|camera|permission/i.test(msg)
        ? 'Máy không mở được ứng dụng camera. Thử chọn ảnh từ thư viện hoặc kiểm tra quyền Camera.'
        : msg,
    );
    return null;
  }
}

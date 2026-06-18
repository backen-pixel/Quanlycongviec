import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Thông tin thiết bị gửi kèm QR login (hiển thị trong thông báo). */
export function getQrDeviceInfo() {
  const model = Device.modelName || Device.deviceName || Platform.OS;
  return {
    device_name: `CRM Mobile (${model})`,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  };
}

export type QrDeviceInfo = { platform?: string | null; device_name?: string | null };

export function formatQrDeviceLabel(d?: QrDeviceInfo | null) {
  if (!d?.device_name) return 'Thiết bị không xác định';
  return d.device_name;
}

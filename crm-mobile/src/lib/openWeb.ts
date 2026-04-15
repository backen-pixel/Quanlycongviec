import { Alert, Linking } from 'react-native';
import { WEB_APP_ORIGIN } from '../config';

/** Mở đường dẫn trên web app, ví dụ `/crm/quotations/new?lead_id=...` */
export function openWebPath(path: string) {
  const base = WEB_APP_ORIGIN;
  if (!base) {
    Alert.alert(
      'Chưa cấu hình web',
      'Thêm EXPO_PUBLIC_WEB_APP_URL vào .env (URL trang web TuBep Pro, ví dụ https://app.example.com).',
    );
    return;
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  void Linking.openURL(`${base}${p}`);
}

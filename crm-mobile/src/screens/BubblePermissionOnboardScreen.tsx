import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  NativeModules,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { registerPushToken } from '../lib/pushRegistration';

type Props = NativeStackScreenProps<MoreStackParamList, 'BubblePermissionOnboard'>;

const Overlay = NativeModules.FloatingBubbleOverlay as
  | {
      canDrawOverlays?: () => Promise<boolean>;
      openOverlaySettings?: () => void;
      startOverlay?: () => Promise<boolean>;
      stopOverlay?: () => Promise<boolean>;
    }
  | undefined;

interface OemInfo {
  manufacturer: string;
  brand: string;
  model: string;
  hasAutoStartSettings: boolean;
  oemKey: string;
}

const Battery = NativeModules.CrmBatteryOptimization as
  | {
      isIgnoringBatteryOptimizations: () => Promise<boolean>;
      requestIgnoreBatteryOptimizations: () => void;
      getOemAutoStartInfo: () => Promise<OemInfo>;
      openOemAutoStartSettings: () => Promise<boolean>;
      openAppNotificationSettings: () => void;
    }
  | undefined;

const OEM_GUIDE: Record<string, string> = {
  xiaomi:
    'Bật "Tự khởi động" (Autostart) cho TuBep CRM trong Bảo mật. Đồng thời vào Pin → "Không hạn chế nền".',
  oppo:
    'Vào Cài đặt → Pin → Quản lý ứng dụng nền → cho phép TuBep CRM "Chạy nền".',
  realme:
    'Vào Cài đặt → Pin → Quản lý ứng dụng nền → cho phép TuBep CRM "Chạy nền".',
  vivo:
    'Vào iManager → Quản lý ứng dụng nền → bật cho TuBep CRM "Khởi động nền tự động" và "Pin cao".',
  huawei:
    'Vào Cài đặt → Pin → Khởi chạy ứng dụng → tắt tự động cho TuBep CRM và bật cả 3 mục thủ công.',
  honor:
    'Vào Cài đặt → Pin → Khởi chạy ứng dụng → tắt tự động cho TuBep CRM và bật cả 3 mục thủ công.',
  oneplus:
    'Vào Cài đặt → Pin → Tối ưu hoá pin → đặt TuBep CRM "Không tối ưu".',
  samsung:
    'Vào Cài đặt → Pin → Giới hạn pin nền → loại trừ TuBep CRM.',
  meizu:
    'Vào Phone Manager → Cấp quyền → cho phép TuBep CRM khởi động nền.',
  asus:
    'Vào Mobile Manager → PowerMaster → tự khởi động → bật cho TuBep CRM.',
  letv:
    'Vào Letv Manager → Autoboot → bật cho TuBep CRM.',
};

export default function BubblePermissionOnboardScreen({ navigation }: Props) {
  const [notifOk, setNotifOk] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [batteryOk, setBatteryOk] = useState(false);
  const [oem, setOem] = useState<OemInfo | null>(null);

  const refresh = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifOk(status === 'granted');
    if (Platform.OS === 'android' && Overlay?.canDrawOverlays) {
      const can = await Overlay.canDrawOverlays().catch(() => false);
      setOverlayOk(!!can);
    } else {
      setOverlayOk(true);
    }
    if (Platform.OS === 'android' && Battery) {
      try {
        const ign = await Battery.isIgnoringBatteryOptimizations();
        setBatteryOk(ign);
        const info = await Battery.getOemAutoStartInfo();
        setOem(info);
      } catch {
        setBatteryOk(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stepNotif = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifOk(status === 'granted');
    if (status === 'granted') {
      await registerPushToken();
    }
  };

  const stepOverlay = () => {
    if (Platform.OS === 'android') {
      Overlay?.openOverlaySettings?.();
    } else {
      Alert.alert('iOS', 'Bong bóng hệ thống chỉ hỗ trợ đầy đủ trên Android.');
    }
    setTimeout(() => void refresh(), 800);
  };

  const stepBattery = () => {
    if (Platform.OS !== 'android') return;
    if (Battery?.requestIgnoreBatteryOptimizations) {
      try {
        Battery.requestIgnoreBatteryOptimizations();
      } catch {
        Linking.openSettings();
      }
      setTimeout(() => void refresh(), 800);
      return;
    }
    try {
      const intent = 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS';
      Linking.openURL(intent).catch(() => Linking.openSettings());
    } catch {
      Linking.openSettings();
    }
  };

  const stepOemAutoStart = async () => {
    if (Platform.OS !== 'android' || !Battery) return;
    try {
      const ok = await Battery.openOemAutoStartSettings();
      if (!ok) {
        Alert.alert('Tự khởi động', OEM_GUIDE[oem?.oemKey || ''] || 'Hãy bật autostart cho TuBep CRM trong cài đặt máy.');
      }
    } catch {
      Linking.openSettings();
    }
    setTimeout(() => void refresh(), 1500);
  };

  const done = notifOk && overlayOk && (batteryOk || Platform.OS !== 'android');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Thiết lập bong bóng tin nhắn</Text>
      <Text style={styles.sub}>
        Giống Messenger: nhận thông báo khi app tắt, bong bóng nổi trên màn hình khác, chạm để mở chat.
      </Text>

      <View style={[styles.card, CrmShadow.card]}>
        <Text style={styles.stepNum}>1</Text>
        <View style={styles.stepBody}>
          <Text style={styles.stepTitle}>Thông báo hệ thống</Text>
          <Text style={styles.stepDesc}>Âm, rung và hiện trên thanh trạng thái khi có tin mới.</Text>
          <Text style={[styles.status, notifOk && styles.statusOk]}>
            {notifOk ? '✓ Đã bật' : 'Chưa bật'}
          </Text>
          {!notifOk ? (
            <TouchableOpacity style={styles.btn} onPress={() => void stepNotif()}>
              <Text style={styles.btnTxt}>Cấp quyền thông báo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {Platform.OS === 'android' ? (
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.stepNum}>2</Text>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Hiển thị trên app khác</Text>
            <Text style={styles.stepDesc}>
              Bong bóng chat nổi khi dùng app khác (cần quyền «Hiển thị trên các ứng dụng khác»).
            </Text>
            <Text style={[styles.status, overlayOk && styles.statusOk]}>
              {overlayOk ? '✓ Đã bật' : 'Chưa bật'}
            </Text>
            {!overlayOk ? (
              <TouchableOpacity style={styles.btn} onPress={stepOverlay}>
                <Text style={styles.btnTxt}>Mở cài đặt quyền</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={[styles.card, CrmShadow.card]}>
        <Text style={styles.stepNum}>{Platform.OS === 'android' ? '3' : '2'}</Text>
        <View style={styles.stepBody}>
          <Text style={styles.stepTitle}>Tắt tối ưu pin (bắt buộc nhận tin khi app tắt)</Text>
          <Text style={styles.stepDesc}>
            Nếu bật tối ưu pin, Android có thể trì hoãn thông báo 5-15 phút khi máy ngủ.
          </Text>
          <Text style={[styles.status, batteryOk && styles.statusOk]}>
            {batteryOk ? '✓ Đã miễn trừ' : 'Chưa miễn trừ'}
          </Text>
          {Platform.OS === 'android' && !batteryOk ? (
            <TouchableOpacity style={styles.btn} onPress={stepBattery}>
              <Text style={styles.btnTxt}>Tắt tối ưu pin cho TuBep CRM</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {Platform.OS === 'android' && oem?.hasAutoStartSettings ? (
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.stepNum}>4</Text>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>
              Cho phép tự khởi động ({oem.manufacturer || 'OEM'})
            </Text>
            <Text style={styles.stepDesc}>
              {OEM_GUIDE[oem.oemKey] ||
                'Một số máy chặn ứng dụng tự khởi động sau khi tắt máy hoặc dọn RAM. Hãy bật autostart cho TuBep CRM.'}
            </Text>
            <TouchableOpacity style={styles.btnSec} onPress={() => void stepOemAutoStart()}>
              <Text style={styles.btnSecTxt}>Mở cài đặt tự khởi động</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.btnPrimary, !done && { opacity: 0.5 }]}
        onPress={() => {
          void registerPushToken();
          if (done && Platform.OS === 'android') {
            // Bật bubble nổi luôn khi vừa cấp đủ quyền — không cần restart app.
            void Overlay?.startOverlay?.().catch(() => {});
          }
          navigation.goBack();
        }}
      >
        <Text style={styles.btnPrimaryTxt}>{done ? 'Hoàn tất & hiện bong bóng' : 'Bỏ qua — làm sau'}</Text>
      </TouchableOpacity>

      {Platform.OS === 'android' && overlayOk ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => {
            void Overlay?.startOverlay?.().catch(() => {});
            Alert.alert('Bong bóng', 'Đã yêu cầu hiện bong bóng. Kéo notification bar xuống nếu chưa thấy.');
          }}
        >
          <Text style={styles.linkBtnTxt}>Hiện bong bóng nổi ngay</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.link} onPress={() => void refresh()}>
        <Text style={styles.linkTxt}>Kiểm tra lại quyền</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: '800', color: CrmColors.gray900, marginBottom: 8 },
  sub: { fontSize: 14, color: CrmColors.gray600, lineHeight: 20, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CrmColors.blue600,
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  stepDesc: { fontSize: 13, color: CrmColors.gray600, marginTop: 4, lineHeight: 18 },
  status: { fontSize: 12, fontWeight: '700', color: CrmColors.amber600, marginTop: 8 },
  statusOk: { color: CrmColors.emerald600 },
  btn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: CrmRadii.md,
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnSec: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: CrmColors.gray300,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: CrmRadii.md,
  },
  btnSecTxt: { color: CrmColors.gray800, fontWeight: '700', fontSize: 13 },
  btnPrimary: {
    marginTop: 16,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { marginTop: 14, alignItems: 'center' },
  linkTxt: { color: CrmColors.blue600, fontWeight: '700', fontSize: 14 },
  linkBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
  },
  linkBtnTxt: { color: CrmColors.blue700, fontWeight: '700', fontSize: 13 },
});

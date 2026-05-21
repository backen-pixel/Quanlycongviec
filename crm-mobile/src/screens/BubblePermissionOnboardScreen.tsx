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

export default function BubblePermissionOnboardScreen({ navigation }: Props) {
  const [notifOk, setNotifOk] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);

  const refresh = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifOk(status === 'granted');
    if (Platform.OS === 'android' && Overlay?.canDrawOverlays) {
      const can = await Overlay.canDrawOverlays().catch(() => false);
      setOverlayOk(!!can);
    } else {
      setOverlayOk(true);
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
    try {
      const intent = 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS';
      Linking.openURL(intent).catch(() => {
        Linking.openSettings();
      });
    } catch {
      Linking.openSettings();
    }
  };

  const done = notifOk && overlayOk;

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
          <Text style={styles.stepTitle}>Pin / pin nền (khuyến nghị)</Text>
          <Text style={styles.stepDesc}>
            Tắt tối ưu pin cho TuBep CRM để nhận tin khi app ở nền lâu (một số máy Xiaomi/Oppo cần bật Autostart).
          </Text>
          {Platform.OS === 'android' ? (
            <TouchableOpacity style={styles.btnSec} onPress={stepBattery}>
              <Text style={styles.btnSecTxt}>Mở cài đặt pin</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

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

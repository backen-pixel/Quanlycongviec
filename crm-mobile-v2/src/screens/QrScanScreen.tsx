import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, formatApiError } from '../api/client';
import { getQrDeviceInfo, formatQrDeviceLabel } from '../lib/qrDeviceInfo';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'QrScan'>;

function parseQrPayload(raw: string) {
  try {
    const obj = JSON.parse(String(raw).trim());
    if (obj?.t !== 'crm-qr-login' || !obj?.id) return null;
    return obj as { id: string; target: 'web' | 'app' };
  } catch {
    return null;
  }
}

export default function QrScanScreen({ navigation }: Props) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const busyRef = useRef(false);
  const [phase, setPhase] = useState<'scanning' | 'confirming' | 'done' | 'error'>('scanning');
  const [message, setMessage] = useState('');

  const confirmQr = useCallback(async (qrText: string) => {
    if (busyRef.current) return;
    const parsed = parseQrPayload(qrText);
    if (!parsed) {
      setMessage('Mã QR không hợp lệ.');
      return;
    }
    if (parsed.target !== 'web') {
      setMessage('Đây là mã đăng nhập app. Trên app: Đăng nhập → tab QR → quét mã từ web.');
      return;
    }
    busyRef.current = true;
    setPhase('confirming');
    const dev = getQrDeviceInfo();
    try {
      const { data } = await api.post<{
        message?: string;
        confirmerDevice?: { device_name?: string };
        targetLabel?: string;
      }>('/auth/qr/confirm', { sessionId: parsed.id, qrText, ...dev });
      setPhase('done');
      const who = formatQrDeviceLabel(data?.confirmerDevice || dev);
      setMessage(
        data?.message
          || `${who} đã xác nhận đăng nhập ${data?.targetLabel || 'web'}. Thiết bị web sẽ nhận phiên trong giây lát.`,
      );
    } catch (e) {
      setPhase('error');
      setMessage(formatApiError(e));
    }
  }, []);

  const onBarcode = useCallback(({ data }: { data: string }) => {
    if (phase !== 'scanning' || busyRef.current) return;
    void confirmQr(data);
  }, [confirmQr, phase]);

  if (!permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <SpinningLoader color={Colors.blue} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center, { padding: 24 }]}>
        <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.permTitle}>Cần quyền camera</Text>
        <Text style={styles.permHint}>Quét mã QR để xác nhận đăng nhập thiết bị khác.</Text>
        <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
          <Text style={styles.permBtnTxt}>Cho phép camera</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backLink}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quét QR đăng nhập</Text>
          <Text style={styles.subtitle}>Xác nhận bằng tài khoản đang đăng nhập</Text>
        </View>
      </View>

      {phase === 'scanning' ? (
        <View style={styles.scanWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcode}
          />
          <Text style={styles.scanHint}>Hướng camera vào mã QR trên trang đăng nhập web</Text>
        </View>
      ) : (
        <View style={[styles.center, { flex: 1, padding: 24 }]}>
          {phase === 'confirming' ? (
            <SpinningLoader color={Colors.blue} size="large" />
          ) : (
            <Ionicons
              name={phase === 'done' ? 'checkmark-circle' : 'alert-circle'}
              size={56}
              color={phase === 'done' ? Colors.green : Colors.red}
            />
          )}
          <Text style={styles.resultMsg}>{message}</Text>
          {phase !== 'confirming' ? (
            <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnTxt}>Xong</Text>
            </Pressable>
          ) : null}
          {phase === 'error' ? (
            <Pressable
              onPress={() => {
                busyRef.current = false;
                setPhase('scanning');
                setMessage('');
              }}
            >
              <Text style={styles.backLink}>Thử lại</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 17, fontWeight: '700', color: Colors.text },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    scanWrap: { flex: 1, padding: 16 },
    camera: { flex: 1, borderRadius: Radii.lg, overflow: 'hidden' },
    scanHint: { marginTop: 12, textAlign: 'center', fontSize: 13, color: Colors.textMuted },
    permTitle: { marginTop: 16, fontSize: 18, fontWeight: '700', color: Colors.text },
    permHint: { marginTop: 8, fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
    permBtn: {
      marginTop: 20,
      backgroundColor: Colors.blue,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: Radii.md,
    },
    permBtnTxt: { color: '#fff', fontWeight: '600' },
    backLink: { marginTop: 16, color: Colors.blue, fontWeight: '600' },
    resultMsg: { marginTop: 16, fontSize: 15, color: Colors.text, textAlign: 'center' },
    doneBtn: {
      marginTop: 20,
      backgroundColor: Colors.blue,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: Radii.md,
    },
    doneBtnTxt: { color: '#fff', fontWeight: '600' },
  });

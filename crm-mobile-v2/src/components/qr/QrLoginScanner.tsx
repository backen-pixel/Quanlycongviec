import React, { useCallback, useEffect, useRef, useState } from 'react';
import SpinningLoader from '../SpinningLoader';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, formatApiError } from '../../api/client';
import { getQrDeviceInfo, formatQrDeviceLabel } from '../../lib/qrDeviceInfo';
import { Radii, useColors, type ThemeColors } from '../../theme';

const POLL_MS = 1500;

type Props = {
  onSuccess: (auth: { token: string; user: unknown; session_id?: string }) => void;
};

function parseQrPayload(raw: string) {
  try {
    const obj = JSON.parse(String(raw).trim());
    if (obj?.t !== 'crm-qr-login' || !obj?.id) return null;
    return obj as { id: string; target: 'web' | 'app' };
  } catch {
    return null;
  }
}

export default function QrLoginScanner({ onSuccess }: Props) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<'scan' | 'polling' | 'error'>('scan');
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => clearPoll(), []);

  const pollSession = useCallback((sessionId: string) => {
    clearPoll();
    setPhase('polling');
    setMessage('Đang đăng nhập…');

    const poll = async () => {
      if (doneRef.current) return;
      try {
        const dev = getQrDeviceInfo();
        const { data } = await api.get<{
          status: string;
          token?: string;
          user?: unknown;
          session_id?: string;
          loginDevice?: { device_name?: string };
          confirmerDevice?: { device_name?: string };
        }>(`/auth/qr/${sessionId}/status`, { params: dev });
        if (data.status === 'confirmed' && data.token) {
          doneRef.current = true;
          clearPoll();
          const confirmer = formatQrDeviceLabel(data.confirmerDevice);
          setMessage(`Đăng nhập thành công trên ${formatQrDeviceLabel(data.loginDevice || dev)} (từ ${confirmer})`);
          setTimeout(() => {
            onSuccess({
              token: data.token,
              user: data.user,
              session_id: data.session_id,
            });
          }, 800);
        } else if (data.status === 'expired') {
          clearPoll();
          busyRef.current = false;
          setPhase('error');
          setMessage('Mã QR đã hết hạn. Tạo mã mới trên web.');
        }
      } catch {
        /* giữ poll */
      }
    };

    void poll();
    pollRef.current = setInterval(poll, POLL_MS);
  }, [onSuccess]);

  const onBarcode = useCallback(({ data }: { data: string }) => {
    if (busyRef.current || phase !== 'scan') return;
    const parsed = parseQrPayload(data);
    if (!parsed) {
      setMessage('Mã QR không hợp lệ.');
      return;
    }
    if (parsed.target !== 'app') {
      setMessage('Đây là mã đăng nhập web. Dùng Menu → Quét QR web khi đã đăng nhập.');
      return;
    }
    busyRef.current = true;
    setMessage('');
    pollSession(parsed.id);
  }, [phase, pollSession]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <SpinningLoader color={Colors.blue} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Cần quyền camera để quét mã QR trên web.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnTxt}>Cho phép camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Trên web đã đăng nhập: Cài đặt → Thiết bị → Mã QR đăng nhập app
      </Text>
      {phase === 'scan' ? (
        <View style={styles.scanBox}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcode}
          />
        </View>
      ) : (
        <View style={[styles.center, styles.waitBox]}>
          <SpinningLoader color={Colors.blue} size="large" />
          <Text style={styles.waitTxt}>{message || 'Đang xử lý…'}</Text>
        </View>
      )}
      {!!message && phase === 'scan' ? (
        <Text style={styles.err}>{message}</Text>
      ) : null}
      {phase === 'error' ? (
        <Pressable
          style={styles.retry}
          onPress={() => {
            busyRef.current = false;
            doneRef.current = false;
            setPhase('scan');
            setMessage('');
          }}
        >
          <Text style={styles.retryTxt}>Quét lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { width: '100%', alignItems: 'center' },
    hint: {
      fontSize: 13,
      color: Colors.textMuted,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 20,
    },
    scanBox: {
      width: '100%',
      height: 280,
      borderRadius: Radii.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    camera: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    waitBox: { width: '100%', height: 280 },
    waitTxt: { marginTop: 12, fontSize: 14, color: Colors.textMuted },
    err: { marginTop: 10, fontSize: 13, color: Colors.red, textAlign: 'center' },
    btn: {
      marginTop: 12,
      backgroundColor: Colors.blue,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: Radii.md,
    },
    btnTxt: { color: '#fff', fontWeight: '600' },
    retry: { marginTop: 12 },
    retryTxt: { color: Colors.blue, fontWeight: '600' },
  });

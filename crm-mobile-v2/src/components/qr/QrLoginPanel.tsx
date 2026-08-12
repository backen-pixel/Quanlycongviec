import React, { useCallback, useEffect, useRef, useState } from 'react';
import SpinningLoader from '../SpinningLoader';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, formatApiError } from '../../api/client';
import { Radii, useColors, type ThemeColors } from '../../theme';

const POLL_MS = 2000;

type Props = {
  target: 'web' | 'app';
  onSuccess: (auth: { token: string; user: unknown; session_id?: string }) => void;
};

export default function QrLoginPanel({ target, onSuccess }: Props) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrText, setQrText] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'pending' | 'expired' | 'confirmed' | 'error'>('loading');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [err, setErr] = useState('');
  const doneRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const createSession = useCallback(async () => {
    clearPoll();
    doneRef.current = false;
    setStatus('loading');
    setErr('');
    try {
      const { data } = await api.post<{ sessionId: string; qrText: string; expiresAt: number }>(
        '/auth/qr/create',
        { target },
      );
      setSessionId(data.sessionId);
      setQrText(data.qrText);
      setExpiresAt(data.expiresAt);
      setStatus('pending');
    } catch (e) {
      setStatus('error');
      setErr(formatApiError(e));
    }
  }, [target]);

  useEffect(() => {
    void createSession();
    return () => clearPoll();
  }, [createSession]);

  useEffect(() => {
    if (!expiresAt || status !== 'pending') return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setStatus('expired');
        clearPoll();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, status]);

  useEffect(() => {
    if (!sessionId || status !== 'pending') return undefined;
    const poll = async () => {
      if (doneRef.current) return;
      try {
        const { data } = await api.get<{
          status: string;
          token?: string;
          user?: unknown;
          session_id?: string;
        }>(`/auth/qr/${sessionId}/status`);
        if (data.status === 'confirmed' && data.token) {
          doneRef.current = true;
          clearPoll();
          setStatus('confirmed');
          onSuccess({
            token: data.token,
            user: data.user,
            session_id: data.session_id,
          });
        } else if (data.status === 'expired') {
          setStatus('expired');
          clearPoll();
        }
      } catch {
        /* giữ poll */
      }
    };
    void poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearPoll();
  }, [sessionId, status, onSuccess]);

  const hint = target === 'app'
    ? 'Trên web đã đăng nhập: Cài đặt → Thiết bị → Quét QR app'
    : 'Mở app CRM (đã đăng nhập) → Menu → Quét QR web';

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.qrBox}>
        {status === 'loading' ? (
          <SpinningLoader color={Colors.blue} size="large" />
        ) : null}
        {status !== 'loading' && qrText && status !== 'expired' ? (
          <QRCode value={qrText} size={200} />
        ) : null}
        {status === 'expired' ? (
          <Text style={styles.expired}>Mã QR đã hết hạn</Text>
        ) : null}
      </View>
      {status === 'pending' ? (
        <Text style={styles.wait}>Chờ xác nhận… ({secondsLeft}s)</Text>
      ) : null}
      {status === 'confirmed' ? (
        <Text style={styles.ok}>Đăng nhập thành công!</Text>
      ) : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {(status === 'expired' || status === 'error') ? (
        <Pressable style={styles.retryBtn} onPress={() => void createSession()}>
          <Text style={styles.retryTxt}>Tạo mã mới</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', width: '100%' },
    hint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    qrBox: {
      width: 232,
      height: 232,
      borderRadius: Radii.lg,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    expired: { color: Colors.textMuted, fontSize: 13 },
    wait: { marginTop: 12, fontSize: 12, color: Colors.textMuted },
    ok: { marginTop: 12, fontSize: 14, fontWeight: '600', color: Colors.green },
    err: { marginTop: 8, fontSize: 13, color: Colors.red, textAlign: 'center' },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.blue,
    },
    retryTxt: { color: Colors.blue, fontWeight: '600', fontSize: 14 },
  });

import { useShareIntentContext } from 'expo-share-intent';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { formatApiError } from '../api/client';
import { navigate } from '../navigation/navigationRef';
import { isSharedAudioFile, uploadSharedVoiceFiles } from '../lib/voiceShareUpload';
import { useColors, type ThemeColors } from '../theme';

type Props = {
  enabled: boolean;
};

/** Nhận file ghi âm chia sẻ từ Google Phone / app khác (Android) và upload lên CRM. */
export default function VoiceShareHandler({ enabled }: Props) {
  const Colors = useColors();
  const styles = makeStyles(Colors);
  const { hasShareIntent, shareIntent, resetShareIntent, error, isReady } = useShareIntentContext();
  const [uploading, setUploading] = useState(false);
  const handledKeyRef = useRef('');

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled || !isReady || !hasShareIntent || uploading) return;

    const files = shareIntent?.files?.filter(isSharedAudioFile) || [];
    if (!files.length) {
      if (shareIntent?.files?.length) {
        Alert.alert(
          'Chia sẻ ghi âm',
          'File nhận được không phải định dạng ghi âm (.m4a, .mp3, .amr…).',
          [{ text: 'Đóng', onPress: () => resetShareIntent() }],
        );
      }
      return;
    }

    const key = files.map((f) => `${f.path}|${f.fileName}|${f.size ?? 0}`).join(';;');
    if (!key || handledKeyRef.current === key) return;
    handledKeyRef.current = key;

    void (async () => {
      setUploading(true);
      try {
        const { uploaded, errors } = await uploadSharedVoiceFiles(files);
        resetShareIntent();
        handledKeyRef.current = '';
        if (uploaded > 0) {
          navigate('Tabs', { screen: 'Recordings' });
          const extra = errors.length ? `\n\n${errors.length} file lỗi: ${errors[0]}` : '';
          Alert.alert(
            'Đã tải lên CRM',
            `Đã gửi ${uploaded} file ghi âm lên server.${extra}`,
          );
        } else {
          Alert.alert('Upload thất bại', errors[0] || 'Không tải được file');
        }
      } catch (e) {
        handledKeyRef.current = '';
        Alert.alert('Chia sẻ ghi âm', formatApiError(e));
        resetShareIntent();
      } finally {
        setUploading(false);
      }
    })();
  }, [enabled, error, hasShareIntent, isReady, resetShareIntent, shareIntent, uploading]);

  useEffect(() => {
    if (!error || !hasShareIntent) return;
    Alert.alert('Chia sẻ ghi âm', error, [{ text: 'Đóng', onPress: () => resetShareIntent() }]);
  }, [error, hasShareIntent, resetShareIntent]);

  if (!uploading) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator color={Colors.purple} size="large" />
          <Text style={styles.title}>Đang tải ghi âm lên CRM…</Text>
        </View>
      </View>
    </Modal>
  );
}

/** Nhắc đăng nhập khi user Share ghi âm vào app mà chưa có token. */
export function VoiceShareLoginHint() {
  const { hasShareIntent, shareIntent, isReady } = useShareIntentContext();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isReady || !hasShareIntent || promptedRef.current) return;
    const files = shareIntent?.files?.filter(isSharedAudioFile) || [];
    if (!files.length) return;
    promptedRef.current = true;
    Alert.alert(
      'Đăng nhập CRM',
      'Bạn vừa chia sẻ ghi âm vào app. Đăng nhập xong hệ thống sẽ tự tải file lên.',
    );
  }, [hasShareIntent, isReady, shareIntent?.files]);

  return null;
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: Colors.bgElevated,
      borderRadius: 16,
      paddingVertical: 28,
      paddingHorizontal: 32,
      alignItems: 'center',
      gap: 14,
      minWidth: 240,
    },
    title: {
      color: Colors.text,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
  });

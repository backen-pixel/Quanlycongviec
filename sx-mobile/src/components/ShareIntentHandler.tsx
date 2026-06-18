import { useShareIntentContext } from 'expo-share-intent';
import React, { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { setPendingShareFiles } from '../lib/sharePending';
import { isSharedChatFile, shareIntentFilesToPending } from '../lib/shareToChatUpload';
import { navigateToShareToChat } from '../navigation/navigationRef';

type Props = {
  enabled: boolean;
};

/** Nhận ảnh/PDF chia sẻ từ app khác → chọn hội thoại để gửi. */
export default function ShareIntentHandler({ enabled }: Props) {
  const { hasShareIntent, shareIntent, resetShareIntent, error, isReady } = useShareIntentContext();
  const handledKeyRef = useRef('');
  const processingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled || !isReady || !hasShareIntent || processingRef.current) {
      return;
    }

    const files = shareIntent?.files?.filter(isSharedChatFile) || [];
    if (!files.length) {
      if (shareIntent?.files?.length) {
        Alert.alert(
          'Chia sẻ vào chat',
          'File không được hỗ trợ. Chỉ nhận ảnh hoặc tài liệu (PDF, Word, Excel…).',
          [{ text: 'Đóng', onPress: () => resetShareIntent() }],
        );
      }
      return;
    }

    const key = files.map((f) => `${f.path}|${f.fileName}|${f.size ?? 0}`).join(';;');
    if (!key || handledKeyRef.current === key) return;
    handledKeyRef.current = key;
    processingRef.current = true;

    void (async () => {
      try {
        const pending = await shareIntentFilesToPending(files);
        setPendingShareFiles(pending);
        resetShareIntent();
        handledKeyRef.current = '';
        navigateToShareToChat();
      } catch (e) {
        handledKeyRef.current = '';
        Alert.alert('Chia sẻ vào chat', (e as Error)?.message || 'Không đọc được file');
        resetShareIntent();
      } finally {
        processingRef.current = false;
      }
    })();
  }, [enabled, hasShareIntent, isReady, resetShareIntent, shareIntent]);

  useEffect(() => {
    if (!error || !hasShareIntent) return;
    Alert.alert('Chia sẻ vào chat', error, [{ text: 'Đóng', onPress: () => resetShareIntent() }]);
  }, [error, hasShareIntent, resetShareIntent]);

  return null;
}

/** Nhắc đăng nhập khi Share vào app mà chưa có token. */
export function ShareLoginHint() {
  const { hasShareIntent, shareIntent, isReady } = useShareIntentContext();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isReady || !hasShareIntent || promptedRef.current) return;
    const files = shareIntent?.files?.filter(isSharedChatFile) || [];
    if (!files.length) return;
    promptedRef.current = true;
    Alert.alert(
      'Đăng nhập',
      'Bạn vừa chia sẻ file vào app. Đăng nhập xong sẽ chọn hội thoại để gửi.',
    );
  }, [hasShareIntent, isReady, shareIntent?.files]);

  return null;
}

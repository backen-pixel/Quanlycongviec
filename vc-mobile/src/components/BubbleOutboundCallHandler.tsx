import { useCallback, useEffect } from 'react';
import { Alert, AppState, DeviceEventEmitter, Platform } from 'react-native';
import {
  consumePendingOutboundCall,
  hasPendingOutboundCall,
  peekPendingOutboundCallSync,
  type PendingOutboundCall,
} from '../lib/bubbleOutboundCallPending';
import { CALL_FEATURE_LOCKED_MESSAGE } from '../lib/callFeatureLock';

/** Bắt cuộc gọi thoại/video từ overlay bubble — hiện đang khóa trên app Vận chuyển. */
export default function BubbleOutboundCallHandler() {
  const runOutboundCall = useCallback(async (_pending: PendingOutboundCall) => {
    Alert.alert('Cuộc gọi', CALL_FEATURE_LOCKED_MESSAGE);
  }, []);

  const tryPending = useCallback(async () => {
    const pending = peekPendingOutboundCallSync();
    if (!pending) return;
    await consumePendingOutboundCall();
    await runOutboundCall(pending);
  }, [runOutboundCall]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    if (hasPendingOutboundCall()) {
      void tryPending();
    }

    const callSub = DeviceEventEmitter.addListener(
      'BubbleStartCall',
      (p: { groupId?: string; title?: string; media?: string } | null) => {
        const groupId = p?.groupId?.trim();
        if (!groupId) return;
        void runOutboundCall({
          groupId,
          title: p?.title?.trim() || 'Chat',
          media: p?.media === 'video' ? 'video' : 'audio',
        });
      },
    );

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!hasPendingOutboundCall()) return;
      void tryPending();
    });

    return () => {
      callSub.remove();
      appSub.remove();
    };
  }, [runOutboundCall, tryPending]);

  return null;
}

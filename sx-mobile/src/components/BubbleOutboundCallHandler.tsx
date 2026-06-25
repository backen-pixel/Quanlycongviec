import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, DeviceEventEmitter, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { fetchMessengerGroupDetail } from '../lib/messengerApi';
import {
  consumePendingOutboundCall,
  hasPendingOutboundCall,
  peekPendingOutboundCallSync,
  type PendingOutboundCall,
} from '../lib/bubbleOutboundCallPending';

/** Bắt cuộc gọi thoại/video từ overlay bubble (📞 / 📹 trên header panel). */
export default function BubbleOutboundCallHandler() {
  const { user } = useAuth();
  const { startCall, startVideoCall, startGroupCall, status: callStatus } = useCall();
  const startingRef = useRef(false);
  const myUserId = user?.id != null ? String(user.id) : '';

  const runOutboundCall = useCallback(async (pending: PendingOutboundCall) => {
    if (Platform.OS !== 'android') return;
    if (startingRef.current || callStatus !== 'idle') {
      Alert.alert('Cuộc gọi', 'Đang có cuộc gọi khác.');
      return;
    }
    startingRef.current = true;
    try {
      const detail = await fetchMessengerGroupDetail(pending.groupId);
      const displayName = detail.name?.trim() || pending.title || 'Chat';
      const avatarUrl = detail.avatar || null;

      if (detail.isDirect) {
        const peerId = detail.peerId?.trim();
        if (!peerId) {
          Alert.alert('Cuộc gọi', 'Không xác định được người nhận.');
          return;
        }
        const peer = { id: peerId, name: displayName, avatar: avatarUrl };
        if (pending.media === 'video') {
          await startVideoCall(peer);
        } else {
          await startCall(peer);
        }
        return;
      }

      const members = (detail.members || [])
        .filter((m) => String(m.id) !== myUserId)
        .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
      if (!members.length) {
        Alert.alert('Cuộc gọi nhóm', 'Nhóm không có thành viên khác.');
        return;
      }
      await startGroupCall(
        { id: pending.groupId, name: displayName, members },
        pending.media === 'video' ? 'video' : 'audio',
      );
    } catch {
      Alert.alert(
        'Cuộc gọi',
        pending.media === 'video' ? 'Không thể bắt đầu cuộc gọi video.' : 'Không thể bắt đầu cuộc gọi.',
      );
    } finally {
      startingRef.current = false;
    }
  }, [callStatus, myUserId, startCall, startGroupCall, startVideoCall]);

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

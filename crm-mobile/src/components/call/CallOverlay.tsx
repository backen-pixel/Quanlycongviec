import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCall } from '../../context/CallContext';
import { CrmColors, CrmRadii } from '../../theme/crmTheme';
import { isLockScreenCallUiActive } from '../../lib/lockScreenCall';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function CallOverlay() {
  const {
    status,
    mode,
    peer,
    groupName,
    error,
    isMuted,
    startedAt,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  } = useCall();

  const [tick, setTick] = useState(0);
  const [lockScreenNativeUi, setLockScreenNativeUi] = useState(false);

  useEffect(() => {
    if (status === 'idle' || Platform.OS !== 'android') {
      setLockScreenNativeUi(false);
      return;
    }
    void isLockScreenCallUiActive().then(setLockScreenNativeUi);
  }, [status]);

  useEffect(() => {
    if (status !== 'active' || !startedAt) return;
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [status, startedAt]);

  if (status === 'idle') return null;
  if (lockScreenNativeUi) return null;

  const title =
    mode === 'group'
      ? groupName || 'Cuộc gọi nhóm'
      : peer?.name || 'Cuộc gọi';
  const subtitle =
    status === 'incoming'
      ? mode === 'group'
        ? `${peer?.name || 'Ai đó'} mời bạn tham gia`
        : 'Cuộc gọi đến…'
      : status === 'outgoing'
        ? 'Đang gọi…'
        : status === 'connecting'
          ? 'Đang kết nối…'
          : startedAt
            ? formatDuration(Date.now() - startedAt)
            : 'Đang nói';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={endCall}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.avatar}>
            <Ionicons name={mode === 'group' ? 'people' : 'person'} size={36} color="#fff" />
          </View>
          <Text style={s.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={s.sub}>{subtitle}</Text>
          {error ? <Text style={s.err}>{error}</Text> : null}

          {status === 'incoming' ? (
            <View style={s.row}>
              <TouchableOpacity style={[s.btn, s.reject]} onPress={rejectCall}>
                <Ionicons name="close" size={28} color="#fff" />
                <Text style={s.btnTxt}>Từ chối</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.accept]} onPress={() => void acceptCall()}>
                <Ionicons name="call" size={28} color="#fff" />
                <Text style={s.btnTxt}>Nghe</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.row}>
              <TouchableOpacity style={[s.iconBtn, isMuted && s.iconBtnOn]} onPress={toggleMute}>
                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.reject]} onPress={endCall}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={s.btnTxt}>Kết thúc</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1E293B',
    borderRadius: CrmRadii.xl,
    padding: 28,
    alignItems: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 14, color: '#94A3B8', marginTop: 6, marginBottom: 8 },
  err: { fontSize: 12, color: '#FCA5A5', textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 20 },
  btn: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  accept: {},
  reject: {},
  btnTxt: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOn: { backgroundColor: '#DC2626' },
});

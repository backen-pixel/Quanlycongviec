/**
 * Presentation — màn hình cuộc gọi DUY NHẤT (overlay toàn màn hình).
 * Tự render theo state máy trạng thái: incoming (đổ chuông) → call (đang gọi/kết nối/đã nối).
 * Hỗ trợ voice + video (RTCView).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useCall } from './CallProvider';

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function statusLabel(state: string, direction: string) {
  switch (state) {
    case 'RINGING': return direction === 'outgoing' ? 'Đang gọi…' : 'Cuộc gọi đến';
    case 'CONNECTING': return 'Đang kết nối…';
    case 'CONNECTED': return 'Đã kết nối';
    case 'REJECTED': return 'Bị từ chối';
    case 'MISSED': return 'Không trả lời';
    case 'ENDED': return 'Kết thúc';
    default: return '';
  }
}

function RoundBtn({ icon, label, active, danger, onPress }: {
  icon: any; label?: string; active?: boolean; danger?: boolean; onPress: () => void;
}) {
  return (
    <View style={styles.ctrlWrap}>
      <Pressable
        onPress={onPress}
        style={[styles.ctrl, active && styles.ctrlActive, danger && styles.ctrlDanger]}
      >
        <Ionicons name={icon} size={26} color={danger || active ? '#fff' : '#fff'} />
      </Pressable>
      {!!label && <Text style={styles.ctrlLabel}>{label}</Text>}
    </View>
  );
}

export default function CallScreen() {
  const {
    session, localStream, remoteStream,
    acceptCall, rejectCall, endCall,
    toggleMute, toggleSpeaker, toggleCamera, switchCamera,
  } = useCall();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (session?.state !== 'CONNECTED') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.state]);

  const duration = useMemo(() => {
    if (session?.state === 'CONNECTED' && session.connectedAt) return now - session.connectedAt;
    return 0;
  }, [now, session?.state, session?.connectedAt]);

  if (!session || session.state === 'IDLE') return null;

  const isVideo = session.media === 'video';
  const isIncomingRinging = session.direction === 'incoming' && session.state === 'RINGING';
  const showVideo = isVideo && session.state === 'CONNECTED';

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.root}>
        {/* Remote video nền */}
        {showVideo && remoteStream ? (
          <RTCView streamURL={(remoteStream as any).toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
        ) : null}

        {/* Local video PiP */}
        {showVideo && localStream && !session.isCameraOff ? (
          <RTCView streamURL={(localStream as any).toURL()} style={styles.pip} objectFit="cover" zOrder={1} mirror />
        ) : null}

        {/* Thông tin người gọi (ẩn bớt khi video đã nối) */}
        {!showVideo && (
          <View style={styles.info}>
            {session.peer.avatar ? (
              <Image source={{ uri: session.peer.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarTxt}>{(session.peer.name || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name}>{session.peer.name}</Text>
            <Text style={styles.status}>
              {session.state === 'CONNECTED' ? fmtDuration(duration) : statusLabel(session.state, session.direction)}
            </Text>
            {!!session.error && <Text style={styles.error}>{session.error}</Text>}
          </View>
        )}

        {/* Điều khiển */}
        <View style={styles.controls}>
          {isIncomingRinging ? (
            <View style={styles.row}>
              <RoundBtn icon="call" label="Nghe" onPress={acceptCall} />
              <RoundBtn icon="close" label="Từ chối" danger onPress={rejectCall} />
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <RoundBtn icon={session.isMuted ? 'mic-off' : 'mic'} label="Mic" active={session.isMuted} onPress={toggleMute} />
                <RoundBtn icon={session.isSpeaker ? 'volume-high' : 'volume-medium'} label="Loa" active={session.isSpeaker} onPress={toggleSpeaker} />
                {isVideo && <RoundBtn icon={session.isCameraOff ? 'videocam-off' : 'videocam'} label="Camera" active={session.isCameraOff} onPress={toggleCamera} />}
                {isVideo && <RoundBtn icon="camera-reverse" label="Đổi" onPress={switchCamera} />}
              </View>
              <View style={styles.row}>
                <RoundBtn icon="call" label="Kết thúc" danger onPress={endCall} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b141a', justifyContent: 'space-between', paddingVertical: 60 },
  info: { alignItems: 'center', marginTop: 40 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1f2c34' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 48, fontWeight: '700' },
  name: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 20 },
  status: { color: '#aebac1', fontSize: 16, marginTop: 8 },
  error: { color: '#f87171', fontSize: 14, marginTop: 10 },
  pip: { position: 'absolute', top: 50, right: 16, width: 110, height: 160, borderRadius: 12, backgroundColor: '#1f2c34' },
  controls: { paddingBottom: 24, gap: 24 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 8 },
  ctrlWrap: { alignItems: 'center', gap: 6 },
  ctrl: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  ctrlActive: { backgroundColor: '#374151' },
  ctrlDanger: { backgroundColor: '#ef4444' },
  ctrlLabel: { color: '#aebac1', fontSize: 12 },
});

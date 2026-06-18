/**
 * Presentation — màn hình cuộc gọi DUY NHẤT (overlay toàn màn hình).
 * Video: camera full màn + PiP, điều khiển cố định dưới cùng (không dùng native phone UI).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
        <Ionicons name={icon} size={26} color="#fff" />
      </Pressable>
      {!!label && <Text style={styles.ctrlLabel}>{label}</Text>}
    </View>
  );
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const {
    session, localStream, remoteStream, groupPeers = [], groupJoinRequests = [],
    acceptCall, rejectCall, endCall,
    toggleMute, toggleSpeaker, toggleCamera, switchCamera,
    approveGroupJoin, denyGroupJoin,
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
  const isGroup = session.mode === 'group';
  const isIncomingRinging = session.direction === 'incoming' && session.state === 'RINGING';
  const displayName = isGroup ? (session.groupName || 'Cuộc gọi nhóm') : session.peer.name;

  const showRemoteVideo = isVideo && !isGroup && session.state === 'CONNECTED' && !!remoteStream;
  const showLocalFull = isVideo && !isIncomingRinging && !showRemoteVideo && !!localStream && !session.isCameraOff;
  const showLocalPip = showRemoteVideo && !!localStream && !session.isCameraOff;
  const showVoiceStage = !isVideo || isIncomingRinging || (isVideo && !showRemoteVideo && !showLocalFull);

  const statusText = session.joinPending
    ? 'Đang chờ chủ phòng duyệt…'
    : session.state === 'CONNECTED'
      ? fmtDuration(duration)
      : statusLabel(session.state, session.direction);

  const controlsBottom = Math.max(insets.bottom, 20);

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.root}>
        {showRemoteVideo && (
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            style={styles.videoLayer}
            objectFit="cover"
          />
        )}

        {showLocalFull && (
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={styles.videoLayer}
            objectFit="cover"
            mirror
          />
        )}

        {showLocalPip && (
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={[styles.pip, { bottom: controlsBottom + 168 }]}
            objectFit="cover"
            zOrder={1}
            mirror
          />
        )}

        {showVoiceStage && (
          <View style={[styles.voiceStage, { paddingTop: insets.top + 40 }]}>
            {session.peer.avatar ? (
              <Image source={{ uri: session.peer.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarTxt}>{(displayName || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.status}>
              {isGroup && groupPeers.length > 0 ? `${1 + groupPeers.length} người · ` : ''}
              {statusText}
            </Text>
            {isGroup && groupPeers.length > 0 && (
              <Text style={styles.groupPeers}>
                {groupPeers.map((p) => p.name || 'Thành viên').join(', ')}
              </Text>
            )}
            {!!session.error && <Text style={styles.error}>{session.error}</Text>}
          </View>
        )}

        {isVideo && !showVoiceStage && (
          <View style={[styles.videoTopBar, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.videoName}>{displayName}</Text>
            <Text style={styles.videoStatus}>{statusText}</Text>
            {!!session.error && <Text style={styles.error}>{session.error}</Text>}
          </View>
        )}

        {isGroup && groupJoinRequests.length > 0 && !isIncomingRinging && (
          <View style={[styles.joinPanel, { top: insets.top + 12 }]}>
            <Text style={styles.joinTitle}>Yêu cầu tham gia ({groupJoinRequests.length})</Text>
            {groupJoinRequests.map((req) => (
              <View key={req.requesterId} style={styles.joinRow}>
                <Text style={styles.joinName} numberOfLines={1}>{req.requesterName}</Text>
                <View style={styles.joinActions}>
                  <Pressable style={[styles.joinBtn, styles.joinApprove]} onPress={() => approveGroupJoin(req.requesterId)}>
                    <Text style={styles.joinBtnTxt}>Duyệt</Text>
                  </Pressable>
                  <Pressable style={[styles.joinBtn, styles.joinDeny]} onPress={() => denyGroupJoin(req.requesterId)}>
                    <Text style={styles.joinBtnTxt}>Từ chối</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.controlsBottom, { paddingBottom: controlsBottom }]}>
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
  root: { flex: 1, backgroundColor: '#0b141a' },
  videoLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  voiceStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1f2c34' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 48, fontWeight: '700' },
  name: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 20 },
  status: { color: '#aebac1', fontSize: 16, marginTop: 8, textAlign: 'center' },
  groupPeers: { color: '#9ca3af', fontSize: 13, marginTop: 10, textAlign: 'center' },
  error: { color: '#f87171', fontSize: 14, marginTop: 8, textAlign: 'center' },
  videoTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 2,
    backgroundColor: 'rgba(11,20,26,0.35)',
  },
  videoName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  videoStatus: { color: '#aebac1', fontSize: 14, marginTop: 4 },
  pip: {
    position: 'absolute',
    right: 16,
    width: 100,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#1f2c34',
    overflow: 'hidden',
    zIndex: 2,
  },
  controlsBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(11,20,26,0.92)',
    zIndex: 3,
  },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 8 },
  ctrlWrap: { alignItems: 'center', gap: 6 },
  ctrl: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlActive: { backgroundColor: '#374151' },
  ctrlDanger: { backgroundColor: '#ef4444' },
  ctrlLabel: { color: '#aebac1', fontSize: 12 },
  joinPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(31,44,52,0.95)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 4,
  },
  joinTitle: { color: '#aebac1', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  joinName: { color: '#fff', fontSize: 14, flex: 1 },
  joinActions: { flexDirection: 'row', gap: 8 },
  joinBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  joinApprove: { backgroundColor: '#22c55e' },
  joinDeny: { backgroundColor: '#ef4444' },
  joinBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

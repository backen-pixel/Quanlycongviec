/**
 * Presentation — màn hình cuộc gọi DUY NHẤT (overlay toàn màn hình).
 * Video: full màn, overlay trong suốt; chạm màn hình để hiện/ẩn nút điều khiển.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall } from './CallProvider';

const VIDEO_CONTROLS_HIDE_MS = 4500;

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

function RoundBtn({ icon, label, active, danger, compact, onPress }: {
  icon: any; label?: string; active?: boolean; danger?: boolean; compact?: boolean; onPress: () => void;
}) {
  const size = compact ? 48 : 64;
  const iconSize = compact ? 22 : 26;
  return (
    <View style={styles.ctrlWrap}>
      <Pressable
        onPress={onPress}
        style={[
          styles.ctrl,
          { width: size, height: size, borderRadius: size / 2 },
          active && styles.ctrlActive,
          danger && styles.ctrlDanger,
        ]}
      >
        <Ionicons name={icon} size={iconSize} color="#fff" />
      </Pressable>
      {!!label && !compact && <Text style={styles.ctrlLabel}>{label}</Text>}
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
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (session?.state !== 'CONNECTED') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.state]);

  const duration = useMemo(() => {
    if (session?.state === 'CONNECTED' && session.connectedAt) return now - session.connectedAt;
    return 0;
  }, [now, session?.state, session?.connectedAt]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setVideoControlsVisible(false);
    }, VIDEO_CONTROLS_HIDE_MS);
  }, [clearHideTimer]);

  const revealVideoControls = useCallback(() => {
    setVideoControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const toggleVideoControls = useCallback(() => {
    setVideoControlsVisible((v) => {
      if (v) {
        clearHideTimer();
        return false;
      }
      scheduleHideControls();
      return true;
    });
  }, [clearHideTimer, scheduleHideControls]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const isVideo = session?.media === 'video';
  const isGroup = session?.mode === 'group';
  const isIncomingRinging = session?.direction === 'incoming' && session?.state === 'RINGING';
  const showRemoteVideo = isVideo && !isGroup && session?.state === 'CONNECTED' && !!remoteStream;
  const showLocalFull = isVideo && !isIncomingRinging && !showRemoteVideo && !!localStream && !session?.isCameraOff;
  const showVoiceStage = !session || session.state === 'IDLE' || !isVideo || isIncomingRinging || (isVideo && !showRemoteVideo && !showLocalFull);
  const immersiveVideo = !!(session && session.state !== 'IDLE' && isVideo && !showVoiceStage && !isIncomingRinging);

  useEffect(() => {
    if (immersiveVideo) {
      setVideoControlsVisible(true);
      scheduleHideControls();
    } else {
      clearHideTimer();
      setVideoControlsVisible(true);
    }
  }, [immersiveVideo, session?.callId, scheduleHideControls, clearHideTimer]);

  if (!session || session.state === 'IDLE') return null;

  const displayName = isGroup ? (session.groupName || 'Cuộc gọi nhóm') : session.peer.name;
  const showLocalPip = showRemoteVideo && !!localStream && !session.isCameraOff;

  const statusText = session.joinPending
    ? 'Đang chờ chủ phòng duyệt…'
    : session.state === 'CONNECTED'
      ? fmtDuration(duration)
      : statusLabel(session.state, session.direction);

  const bottomInset = Math.max(insets.bottom, 12);
  const pipBottom = immersiveVideo
    ? (videoControlsVisible ? bottomInset + 72 : bottomInset + 16)
    : bottomInset + 168;

  const onVideoOverlayPress = () => {
    if (!immersiveVideo || isIncomingRinging) return;
    toggleVideoControls();
  };

  const voiceControls = isIncomingRinging ? (
    <View style={styles.incomingActions}>
      <View style={styles.incomingActionCol}>
        <Pressable style={styles.incomingRejectBtn} onPress={rejectCall}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.incomingBtnLabel}>Từ chối</Text>
      </View>
      <View style={styles.incomingActionCol}>
        <Pressable style={styles.incomingAcceptBtn} onPress={() => { void acceptCall(); }}>
          <Ionicons name="call" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.incomingBtnLabel}>Trả lời</Text>
      </View>
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
  );

  const videoControlsExpanded = videoControlsVisible && (
    <View style={[styles.videoControlsRow, { paddingBottom: bottomInset }]}>
      <RoundBtn compact icon={session.isMuted ? 'mic-off' : 'mic'} active={session.isMuted} onPress={() => { toggleMute(); revealVideoControls(); }} />
      <RoundBtn compact icon={session.isSpeaker ? 'volume-high' : 'volume-medium'} active={session.isSpeaker} onPress={() => { toggleSpeaker(); revealVideoControls(); }} />
      <RoundBtn compact icon={session.isCameraOff ? 'videocam-off' : 'videocam'} active={session.isCameraOff} onPress={() => { toggleCamera(); revealVideoControls(); }} />
      <RoundBtn compact icon="camera-reverse" onPress={() => { switchCamera(); revealVideoControls(); }} />
      <RoundBtn compact icon="call" danger onPress={endCall} />
    </View>
  );

  const videoControlsCollapsed = !videoControlsVisible && (
    <View style={[styles.videoControlsMini, { bottom: bottomInset }]}>
      <Pressable style={styles.miniEndBtn} onPress={endCall}>
        <Ionicons name="call" size={22} color="#fff" />
      </Pressable>
      <Pressable style={styles.miniExpandBtn} onPress={revealVideoControls}>
        <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.root, immersiveVideo && styles.rootVideo]}>
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

        {immersiveVideo && (
          <Pressable style={styles.videoTapLayer} onPress={onVideoOverlayPress} />
        )}

        {showLocalPip && (
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={[styles.pip, { bottom: pipBottom }]}
            objectFit="cover"
            zOrder={1}
            mirror
          />
        )}

        {isGroup && groupPeers.map((p) => (
          p.remoteStream ? (
            <RTCView
              key={p.userId}
              streamURL={(p.remoteStream as any).toURL()}
              style={styles.hiddenPeerAudio}
              objectFit="cover"
            />
          ) : null
        ))}

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

        {immersiveVideo && (
          <View style={[styles.videoTopOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="none">
            <Text style={styles.videoNameShadow}>{displayName}</Text>
            <Text style={styles.videoStatusShadow}>{statusText}</Text>
            {!!session.error && <Text style={styles.errorShadow}>{session.error}</Text>}
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

        {immersiveVideo ? (
          <>
            {isIncomingRinging && (
              <View style={[styles.incomingActionsOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <View style={styles.incomingActionCol}>
                  <Pressable style={styles.incomingRejectBtn} onPress={rejectCall}>
                    <Ionicons name="close" size={28} color="#fff" />
                  </Pressable>
                  <Text style={styles.incomingBtnLabel}>Từ chối</Text>
                </View>
                <View style={styles.incomingActionCol}>
                  <Pressable style={styles.incomingAcceptBtn} onPress={() => { void acceptCall(); }}>
                    <Ionicons name="call" size={28} color="#fff" />
                  </Pressable>
                  <Text style={styles.incomingBtnLabel}>Trả lời</Text>
                </View>
              </View>
            )}
            {videoControlsExpanded}
            {videoControlsCollapsed}
          </>
        ) : (
          <View style={[styles.controlsVoice, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {voiceControls}
          </View>
        )}
      </View>
    </Modal>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.75)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b141a' },
  hiddenPeerAudio: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
  rootVideo: { backgroundColor: '#000' },
  videoLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  videoTapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  voiceStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 2 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1f2c34' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 48, fontWeight: '700' },
  name: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: 20 },
  status: { color: '#aebac1', fontSize: 16, marginTop: 8, textAlign: 'center' },
  groupPeers: { color: '#9ca3af', fontSize: 13, marginTop: 10, textAlign: 'center' },
  error: { color: '#f87171', fontSize: 14, marginTop: 8, textAlign: 'center' },
  videoTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  videoNameShadow: { color: '#fff', fontSize: 18, fontWeight: '700', ...shadow },
  videoStatusShadow: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 2, ...shadow },
  errorShadow: { color: '#fca5a5', fontSize: 13, marginTop: 6, ...shadow },
  pip: {
    position: 'absolute',
    right: 12,
    width: 96,
    height: 136,
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  controlsVoice: {
    paddingTop: 16,
    paddingHorizontal: 12,
    zIndex: 3,
  },
  videoControlsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
    paddingHorizontal: 12,
    zIndex: 4,
  },
  videoControlsMini: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 4,
  },
  miniEndBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239,68,68,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniExpandBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 8 },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 48,
    paddingVertical: 8,
  },
  incomingActionCol: { alignItems: 'center', gap: 10 },
  incomingActionsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
    paddingTop: 16,
    paddingHorizontal: 24,
    zIndex: 10,
    backgroundColor: 'rgba(11,20,26,0.72)',
  },
  incomingAcceptBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingRejectBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingBtnLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  ctrlWrap: { alignItems: 'center', gap: 6 },
  ctrl: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlActive: { backgroundColor: 'rgba(55,65,81,0.85)' },
  ctrlDanger: { backgroundColor: 'rgba(239,68,68,0.92)' },
  ctrlLabel: { color: '#aebac1', fontSize: 12 },
  joinPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(31,44,52,0.88)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 5,
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

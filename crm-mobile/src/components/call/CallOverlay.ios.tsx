import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Easing,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCall } from '../../context/CallContext';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function PulseRing({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 700,
            delay,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.92,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.9,
            duration: 700,
            delay,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, opacity, scale]);

  return (
    <Animated.View
      style={[
        s.pulseRing,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function Waveform() {
  const bars = [12, 20, 28, 18, 24, 16, 22];
  return (
    <View style={s.waveformRow}>
      {bars.map((h, i) => (
        <View key={i} style={[s.waveBar, { height: h }]} />
      ))}
    </View>
  );
}

export default function CallOverlayIos() {
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

  const [elapsed, setElapsed] = useState(0);
  const ringStart = useRef(Date.now());

  useEffect(() => {
    if (status === 'incoming' || status === 'outgoing') {
      ringStart.current = Date.now();
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'active' || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [status, startedAt]);

  if (status === 'idle') return null;

  const title =
    mode === 'group' ? groupName || 'Cuộc gọi nhóm' : peer?.name || 'Cuộc gọi';

  const statusLabel =
    status === 'incoming'
      ? mode === 'group'
        ? 'CUỘC GỌI NHÓM'
        : 'CUỘC GỌI ĐẾN'
      : status === 'outgoing'
        ? 'ĐANG GỌI'
        : status === 'connecting'
          ? 'ĐANG KẾT NỐI'
          : 'ĐANG GỌI';

  const subtitle =
    status === 'connecting'
      ? 'Đang kết nối…'
      : status === 'active'
        ? formatDuration(elapsed)
        : status === 'incoming' && mode === 'group'
          ? `${peer?.name || 'Ai đó'} đang mời bạn`
          : formatDuration(Date.now() - ringStart.current);

  const isIncoming = status === 'incoming';

  return (
    <Modal visible animationType="fade" onRequestClose={isIncoming ? rejectCall : endCall}>
      <View style={s.root}>
        <View style={[s.decorCircle, s.decorTop]} />
        <View style={[s.decorCircle, s.decorBottom]} />

        <View style={s.content}>
          <View style={s.avatarWrap}>
            <PulseRing delay={0} />
            <PulseRing delay={200} />
            <PulseRing delay={400} />
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(title)}</Text>
            </View>
          </View>

          <Text style={s.name} numberOfLines={2}>
            {title}
          </Text>
          <Text style={s.statusLabel}>{statusLabel}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
          <Waveform />
          {error ? <Text style={s.err}>{error}</Text> : null}

          <View style={s.spacer} />

          <View style={s.secondaryRow}>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={toggleMute}
              disabled={isIncoming}
            >
              <View style={[s.secondaryIcon, isMuted && s.secondaryIconMuted]}>
                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color="#E2E8F0" />
              </View>
              <Text style={s.secondaryLabel}>TẮT TIẾNG</Text>
            </TouchableOpacity>
            <View style={s.secondaryBtn}>
              <View style={[s.secondaryIcon, s.secondaryIconDisabled]}>
                <Ionicons name="volume-high" size={22} color="#64748B" />
              </View>
              <Text style={s.secondaryLabel}>LOA NGOÀI</Text>
            </View>
            <View style={s.secondaryBtn}>
              <View style={[s.secondaryIcon, s.secondaryIconDisabled]}>
                <Ionicons name="keypad" size={22} color="#64748B" />
              </View>
              <Text style={s.secondaryLabel}>BÀN PHÍM</Text>
            </View>
          </View>

          {isIncoming ? (
            <View style={s.primaryRow}>
              <TouchableOpacity style={s.primaryBtn} onPress={rejectCall}>
                <View style={s.declineBtn}>
                  <Ionicons name="close" size={32} color="#F87171" />
                </View>
                <Text style={s.primaryLabel}>Từ chối</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.primaryBtn} onPress={() => void acceptCall()}>
                <View style={s.answerBtn}>
                  <Ionicons name="call" size={32} color="#4ADE80" />
                </View>
                <Text style={s.primaryLabel}>Trả lời</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.endWrap}>
              <TouchableOpacity onPress={endCall}>
                <View style={s.declineBtn}>
                  <Ionicons
                    name="call"
                    size={32}
                    color="#F87171"
                    style={{ transform: [{ rotate: '135deg' }] }}
                  />
                </View>
                <Text style={s.primaryLabel}>Kết thúc</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(30, 58, 95, 0.45)',
  },
  decorTop: {
    width: 280,
    height: 280,
    top: -40,
    alignSelf: 'center',
  },
  decorBottom: {
    width: 200,
    height: 200,
    bottom: 120,
    left: -60,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 72,
    paddingBottom: 48,
  },
  avatarWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(251, 146, 60, 0.55)',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },
  name: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  statusLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#FB923C',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: '#94A3B8',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 20,
    height: 32,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
  },
  err: {
    marginTop: 8,
    fontSize: 12,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  spacer: { flex: 1 },
  secondaryRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 24,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
  },
  secondaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconMuted: {
    opacity: 0.5,
  },
  secondaryIconDisabled: {
    opacity: 0.4,
  },
  secondaryLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  primaryRow: {
    flexDirection: 'row',
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerBtn: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endWrap: {
    alignItems: 'center',
  },
  primaryLabel: {
    marginTop: 10,
    fontSize: 14,
    color: '#94A3B8',
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getMessengerColors } from '../../lib/messengerTheme';

function fmtSecs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Props = {
  url: string;
  mine: boolean;
  onLongPress?: () => void;
  onMorePress?: () => void;
  onSelect?: () => void;
};

export default function ChatAudioPlayer({ url, mine, onLongPress, onMorePress, onSelect }: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(false);
  const finishedRef = useRef(false);

  const unloadSound = async () => {
    try {
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
  };

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, []);

  const onStatus = (st: AVPlaybackStatus) => {
    if (!st.isLoaded) return;
    setPlaying(st.isPlaying);
    setDur(st.durationMillis ?? 0);
    setPos(st.positionMillis);
    if (st.didJustFinish) {
      finishedRef.current = true;
      setPlaying(false);
      setPos(0);
      void soundRef.current?.setPositionAsync(0).catch(() => {});
    } else if (st.isPlaying) {
      finishedRef.current = false;
    }
  };

  const ensureSound = async (): Promise<Audio.Sound> => {
    if (soundRef.current) return soundRef.current;
    setLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: false }, onStatus);
      soundRef.current = sound;
      return sound;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    if (loading) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const sound = await ensureSound();
      const st = await sound.getStatusAsync();
      if (!st.isLoaded) return;

      if (st.isPlaying) {
        await sound.pauseAsync();
        return;
      }

      const atEnd =
        finishedRef.current
        || (st.durationMillis != null && st.positionMillis >= Math.max(0, st.durationMillis - 200));
      if (atEnd) {
        await sound.setPositionAsync(0);
        finishedRef.current = false;
        setPos(0);
      }

      await sound.playAsync();
      setPlaying(true);
    } catch {
      await unloadSound();
      finishedRef.current = false;
      Alert.alert('Lỗi', 'Không phát được tin nhắn thoại.');
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minWidth: 200,
          maxWidth: 280,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 18,
          backgroundColor: mine ? mc.bubbleOut : mc.bubbleIn,
          borderWidth: mine ? 0 : 1,
          borderColor: mc.bubbleInBorder,
        },
        playBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: mine ? 'rgba(255,255,255,0.2)' : mc.accentSoft,
        },
        track: {
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: mine ? 'rgba(255,255,255,0.25)' : colors.border,
          overflow: 'hidden',
        },
        fill: {
          height: '100%',
          borderRadius: 2,
          backgroundColor: mine ? '#fff' : mc.accent,
        },
        dur: {
          fontSize: 11,
          fontWeight: '600',
          color: mine ? 'rgba(255,255,255,0.85)' : colors.textMuted,
          minWidth: 36,
          textAlign: 'right',
        },
        moreBtn: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors, mc, mine],
  );

  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;
  const timeLabel = playing || pos > 0 ? pos : dur;
  const moreTint = mine ? 'rgba(255,255,255,0.9)' : colors.textMuted;

  return (
    <Pressable style={styles.wrap} onLongPress={onLongPress} onPress={onSelect} delayLongPress={320}>
      <Pressable style={styles.playBtn} onPress={() => void toggle()}>
        <Ionicons
          name={loading ? 'hourglass-outline' : playing ? 'pause' : 'play'}
          size={18}
          color={mine ? '#fff' : mc.accent}
        />
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={styles.dur}>{fmtSecs(timeLabel / 1000)}</Text>
      {onMorePress ? (
        <Pressable style={styles.moreBtn} onPress={onMorePress} hitSlop={6}>
          <Ionicons name="ellipsis-horizontal" size={18} color={moreTint} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

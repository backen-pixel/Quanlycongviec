import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from './SpinningLoader';
import { Audio, ResizeMode, Video } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type VideoPlayerSource = {
  uri: string;
  title?: string;
  headers?: Record<string, string>;
};

type Props = {
  visible: boolean;
  source: VideoPlayerSource | null;
  onClose: () => void;
};

export default function VideoPlayerModal({ visible, source, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const ref = useRef<Video>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setReady(false);
    setError(null);
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, [visible, source?.uri]);

  useEffect(() => {
    if (visible) return;
    void ref.current?.unloadAsync().catch(() => {});
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
          <Text style={styles.title} numberOfLines={1}>
            {source?.title || 'Video'}
          </Text>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.playerWrap}>
          {source?.uri ? (
            <Video
              ref={ref}
              style={styles.player}
              source={source.headers ? { uri: source.uri, headers: source.headers } : { uri: source.uri }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={visible}
              onLoad={() => setReady(true)}
              onError={(e) => {
                setReady(true);
                setError(e || 'Không phát được video trong app.');
              }}
            />
          ) : null}
          {!ready && !error ? (
            <View style={styles.overlay} pointerEvents="none">
              <SpinningLoader color="#fff" size="large" />
            </View>
          ) : null}
          {error ? (
            <View style={styles.overlay}>
              <Text style={styles.errTxt}>{error}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', marginRight: 8 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrap: { flex: 1, justifyContent: 'center' },
  player: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errTxt: { color: '#fecaca', textAlign: 'center', fontSize: 14, fontWeight: '600' },
});

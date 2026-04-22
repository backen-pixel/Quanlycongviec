import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import type { SlideshowItem } from '../lib/crmNoteMedia';

type Props = {
  visible: boolean;
  items: SlideshowItem[];
  initialIndex: number;
  onClose: () => void;
};

export default function CrmMediaSlideshowModal({ visible, items, initialIndex, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [page, setPage] = useState(initialIndex);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    setPage(initialIndex);
  }, [initialIndex, visible]);

  useEffect(() => {
    if (!visible || !listRef.current || items.length === 0) return;
    const idx = Math.min(Math.max(0, initialIndex), items.length - 1);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch {
        listRef.current?.scrollToOffset({ offset: width * idx, animated: false });
      }
    });
  }, [visible, initialIndex, items.length, width]);

  const unloadSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, [unloadSound]);

  useEffect(() => {
    if (!visible) void unloadSound();
  }, [visible, unloadSound]);

  const playAudio = async (uri: string) => {
    await unloadSound();
    setAudioLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
    } catch {
      /* ignore */
    } finally {
      setAudioLoading(false);
    }
  };

  const slideH = Math.min(height * 0.72, height - 120);

  const imgW = Math.max(0, width - 16);

  const renderSlide = ({ item }: { item: SlideshowItem }) => {
    if (item.kind === 'image') {
      return (
        <View style={[styles.slide, { width }]}>
          <Image
            source={{ uri: item.uri }}
            style={{ width: imgW, height: slideH, backgroundColor: '#111', borderRadius: CrmRadii.md }}
            resizeMode="contain"
          />
        </View>
      );
    }
    if (item.kind === 'video') {
      return (
        <View style={[styles.slide, { width }]}>
          <Video
            source={{ uri: item.uri }}
            style={{ width: imgW, height: slideH, backgroundColor: '#000', borderRadius: CrmRadii.md }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
          />
        </View>
      );
    }
    if (item.kind === 'audio') {
      return (
        <View style={[styles.slide, { width, justifyContent: 'center' }]}>
          <Text style={styles.audLbl}>Ghi âm / âm thanh</Text>
          {audioLoading ? <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 12 }} /> : null}
          <TouchableOpacity style={styles.audBtn} onPress={() => void playAudio(item.uri)}>
            <Text style={styles.audBtnTxt}>Phát</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={[styles.slide, { width }]}>
        <Text style={styles.unsup}>Không xem được loại tệp này trong trình chiếu.</Text>
      </View>
    );
  };

  if (!items.length) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose}>
        <Pressable style={[styles.inner, { maxHeight: height * 0.92 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeTxt}>✕ Đóng</Text>
            </TouchableOpacity>
            <Text style={styles.counter}>
              {page + 1} / {items.length}
            </Text>
            <View style={{ width: 72 }} />
          </View>
          <FlatList
            ref={listRef}
            horizontal
            pagingEnabled
            data={items}
            keyExtractor={(_, i) => `m-${i}`}
            renderItem={renderSlide}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const next = Math.round(x / width);
              setPage(Math.min(items.length - 1, Math.max(0, next)));
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({ index: info.index, animated: false });
                } catch {
                  listRef.current?.scrollToOffset({ offset: width * info.index, animated: false });
                }
              }, 120);
            }}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            initialNumToRender={3}
            windowSize={5}
            removeClippedSubviews={false}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  closeTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  counter: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audLbl: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  audBtn: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
  },
  audBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  unsup: { color: 'rgba(255,255,255,0.75)', paddingHorizontal: 24, textAlign: 'center' },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const THUMB = 56;

export type GalleryImage = {
  uri: string;
  title?: string;
  subtitle?: string;
};

type Props = {
  visible: boolean;
  images: GalleryImage[];
  initialIndex?: number;
  onClose: () => void;
};

/** Pinch-zoom (iOS) + chạm đúp phóng/thu (Android & iOS). Không mở trình duyệt. */
function ZoomableImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const lastTap = useRef(0);

  useEffect(() => {
    setFailed(false);
    setLoading(true);
    setZoomed(false);
  }, [uri]);

  const onDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setZoomed((z) => !z);
    }
    lastTap.current = now;
  };

  if (failed) {
    return (
      <View style={styles.slide}>
        <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.45)" />
        <Text style={styles.failTxt}>Không tải được ảnh</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ width: SCREEN_W, flex: 1 }}
      contentContainerStyle={styles.zoomContent}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      bouncesZoom
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={onDoubleTap}>
        {loading ? (
          <ActivityIndicator color="#fff" style={styles.loader} />
        ) : null}
        <Image
          source={{ uri }}
          style={[
            styles.mainImg,
            zoomed && styles.mainImgZoomed,
            loading && { opacity: 0 },
          ]}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      </Pressable>
    </ScrollView>
  );
}

export default function ImageGalleryLightbox({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const mainRef = useRef<FlatList<GalleryImage>>(null);
  const thumbRef = useRef<FlatList<GalleryImage>>(null);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible || !images.length) return;
    const i = Math.min(Math.max(initialIndex, 0), images.length - 1);
    setIndex(i);
    const t = setTimeout(() => {
      try {
        mainRef.current?.scrollToIndex({ index: i, animated: false });
        thumbRef.current?.scrollToIndex({ index: i, animated: false, viewPosition: 0.5 });
      } catch {
        /* layout chưa sẵn sàng */
      }
    }, 60);
    return () => clearTimeout(t);
  }, [visible, initialIndex, images.length]);

  const goTo = useCallback(
    (next: number) => {
      if (!images.length) return;
      const i = Math.min(Math.max(next, 0), images.length - 1);
      setIndex(i);
      mainRef.current?.scrollToIndex({ index: i, animated: true });
      thumbRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
    },
    [images.length],
  );

  const onMainScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i >= 0 && i < images.length && i !== index) {
      setIndex(i);
      thumbRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
    }
  };

  if (!visible || !images.length) return null;

  const current = images[index];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
          <View style={styles.topMeta}>
            <Text style={styles.counter}>{index + 1} / {images.length}</Text>
            {current?.title ? <Text style={styles.title} numberOfLines={1}>{current.title}</Text> : null}
            <Text style={styles.hint}>
              {Platform.OS === 'ios' ? 'Chụm/duỗi để zoom · Chạm đúp phóng to' : 'Chạm đúp để phóng to / thu nhỏ'}
            </Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.mainArea}>
          <FlatList
            ref={mainRef}
            style={styles.mainList}
            data={images}
            keyExtractor={(item, i) => `${item.uri}-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(initialIndex, images.length - 1)}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            onMomentumScrollEnd={onMainScrollEnd}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <View style={styles.slide}>
                <ZoomableImage uri={item.uri} />
              </View>
            )}
          />
        </View>

        {images.length > 1 ? (
          <>
            {index > 0 ? (
              <Pressable style={[styles.navBtn, styles.navLeft]} onPress={() => goTo(index - 1)} hitSlop={16}>
                <Ionicons name="chevron-back" size={32} color="#fff" />
              </Pressable>
            ) : null}
            {index < images.length - 1 ? (
              <Pressable style={[styles.navBtn, styles.navRight]} onPress={() => goTo(index + 1)} hitSlop={16}>
                <Ionicons name="chevron-forward" size={32} color="#fff" />
              </Pressable>
            ) : null}
          </>
        ) : null}

        {images.length > 1 ? (
          <View style={[styles.thumbBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <FlatList
              ref={thumbRef}
              data={images}
              keyExtractor={(item, i) => `t-${item.uri}-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbContent}
              initialScrollIndex={Math.min(initialIndex, images.length - 1)}
              getItemLayout={(_, i) => ({ length: THUMB + 8, offset: (THUMB + 8) * i, index: i })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index: ti }) => (
                <Pressable
                  onPress={() => goTo(ti)}
                  style={[styles.thumbWrap, ti === index && styles.thumbWrapActive]}
                >
                  <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                </Pressable>
              )}
            />
          </View>
        ) : (
          <View style={{ height: Math.max(insets.bottom, 12) }} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  mainArea: { flex: 1 },
  mainList: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 2,
  },
  topMeta: { flex: 1, marginRight: 8 },
  counter: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  title: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomContent: {
    flexGrow: 1,
    width: SCREEN_W,
    minHeight: SCREEN_H * 0.55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImg: { width: SCREEN_W, height: SCREEN_H * 0.62 },
  mainImgZoomed: { width: SCREEN_W * 2.2, height: SCREEN_H * 0.9 },
  loader: { position: 'absolute', alignSelf: 'center' },
  failTxt: { color: 'rgba(255,255,255,0.55)', marginTop: 10, fontSize: 13, fontWeight: '600' },
  navBtn: {
    position: 'absolute',
    top: '45%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  thumbBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 10,
    maxHeight: THUMB + 24,
  },
  thumbContent: { paddingHorizontal: 12, gap: 8 },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 8,
  },
  thumbWrapActive: { borderColor: '#3B82F6' },
  thumb: { width: '100%', height: '100%' },
});

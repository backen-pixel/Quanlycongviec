import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, Modal, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const FIT_H = SCREEN_H * 0.62;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
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

function clampTransform(scale: number, x: number, y: number) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  const maxX = Math.max(0, (SCREEN_W * (s - 1)) / 2);
  const maxY = Math.max(0, (FIT_H * (s - 1)) / 2);
  return {
    s,
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function touchDistance(touches: { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

/** Pinch + chạm đúp zoom, kéo để xem phần bị che khi phóng to. */
function ZoomableImage({
  uri,
  onZoomedChange,
}: {
  uri: string;
  onZoomedChange?: (zoomed: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const scale = useRef(new Animated.Value(1)).current;
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentScale = useRef(1);
  const currentTx = useRef(0);
  const currentTy = useRef(0);
  const zoomedRef = useRef(false);
  const lastTap = useRef(0);
  const mode = useRef<'none' | 'pan' | 'pinch'>('none');
  const pinchStartDist = useRef(1);
  const pinchStartScale = useRef(1);
  const panStartTx = useRef(0);
  const panStartTy = useRef(0);

  const apply = useCallback((nextScale: number, x: number, y: number, animated = false) => {
    const c = clampTransform(nextScale, x, y);
    currentScale.current = c.s;
    currentTx.current = c.x;
    currentTy.current = c.y;
    const zoomed = c.s > 1.02;
    if (zoomed !== zoomedRef.current) {
      zoomedRef.current = zoomed;
      onZoomedChange?.(zoomed);
    }
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: c.s, useNativeDriver: true, friction: 8, tension: 80 }),
        Animated.spring(translate.x, { toValue: c.x, useNativeDriver: true, friction: 8, tension: 80 }),
        Animated.spring(translate.y, { toValue: c.y, useNativeDriver: true, friction: 8, tension: 80 }),
      ]).start();
      return;
    }
    scale.setValue(c.s);
    translate.setValue({ x: c.x, y: c.y });
  }, [onZoomedChange, scale, translate]);

  useEffect(() => {
    setFailed(false);
    setLoading(true);
    apply(1, 0, 0);
  }, [uri, apply]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, g) => {
          const n = e.nativeEvent.touches?.length || 0;
          if (n >= 2) return true;
          return currentScale.current > 1.02 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4);
        },
        onMoveShouldSetPanResponderCapture: (e, g) => {
          const n = e.nativeEvent.touches?.length || 0;
          if (n >= 2) return true;
          return currentScale.current > 1.02 && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6);
        },
        onPanResponderGrant: (e) => {
          const touches = e.nativeEvent.touches || [];
          if (touches.length >= 2) {
            mode.current = 'pinch';
            pinchStartDist.current = touchDistance(touches) || 1;
            pinchStartScale.current = currentScale.current;
            return;
          }
          mode.current = 'pan';
          panStartTx.current = currentTx.current;
          panStartTy.current = currentTy.current;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches || [];
          if (touches.length >= 2) {
            if (mode.current !== 'pinch') {
              mode.current = 'pinch';
              pinchStartDist.current = touchDistance(touches) || 1;
              pinchStartScale.current = currentScale.current;
            }
            const d = touchDistance(touches);
            apply(pinchStartScale.current * (d / (pinchStartDist.current || 1)), currentTx.current, currentTy.current);
            return;
          }
          if (currentScale.current > 1.02) {
            apply(currentScale.current, panStartTx.current + g.dx, panStartTy.current + g.dy);
          }
        },
        onPanResponderRelease: () => {
          if (currentScale.current < 1.05) apply(1, 0, 0, true);
          else apply(currentScale.current, currentTx.current, currentTy.current, true);
          mode.current = 'none';
        },
        onPanResponderTerminate: () => {
          mode.current = 'none';
        },
        onPanResponderTerminationRequest: () => currentScale.current <= 1.02,
      }),
    [apply],
  );

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (currentScale.current > 1.05) apply(1, 0, 0, true);
      else apply(2.4, 0, 0, true);
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
    <View style={styles.zoomStage} {...pan.panHandlers}>
      <Pressable onPress={onTap} style={styles.zoomPress}>
        {loading ? <SpinningLoader color="#fff" style={styles.loader} /> : null}
        <Animated.Image
          source={{ uri }}
          style={[
            styles.mainImg,
            loading && { opacity: 0 },
            {
              transform: [
                { translateX: translate.x },
                { translateY: translate.y },
                { scale },
              ],
            },
          ]}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      </Pressable>
    </View>
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
  const [viewerZoomed, setViewerZoomed] = useState(false);

  useEffect(() => {
    if (!visible || !images.length) return;
    const i = Math.min(Math.max(initialIndex, 0), images.length - 1);
    setIndex(i);
    setViewerZoomed(false);
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
      setViewerZoomed(false);
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
              Chụm hoặc chạm đúp để zoom · Kéo để xem phần bị che
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
            pagingEnabled={!viewerZoomed}
            scrollEnabled={!viewerZoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(initialIndex, images.length - 1)}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            onMomentumScrollEnd={onMainScrollEnd}
            extraData={index}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index: i }) => (
              <View style={styles.slide}>
                <ZoomableImage
                  uri={item.uri}
                  onZoomedChange={i === index ? setViewerZoomed : undefined}
                />
              </View>
            )}
          />
        </View>

        {images.length > 1 && !viewerZoomed ? (
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
    overflow: 'hidden',
  },
  zoomStage: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  zoomPress: {
    width: SCREEN_W,
    height: FIT_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImg: { width: SCREEN_W, height: FIT_H },
  loader: { position: 'absolute', alignSelf: 'center', zIndex: 1 },
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

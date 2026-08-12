import React, { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

type Props = {
  uri: string;
  headers?: Record<string, string>;
  onZoomChange?: (scale: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4.5;
const DOUBLE_TAP_MS = 280;

export default function ZoomableImage({ uri, headers, onZoomChange }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0 });
  const pinch = useRef({ dist: 0, scale: 1 });
  const lastTap = useRef(0);
  const lastTouchCount = useRef(0);
  const layout = useRef({ w: 0, h: 0 });
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const clampPan = (s: number, x: number, y: number) => {
    const { w, h } = layout.current;
    if (!w || !h || s <= 1.01) return { x: 0, y: 0 };
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const apply = (s: number, x: number, y: number) => {
    const nextS = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    const p = clampPan(nextS, x, y);
    cur.current = { scale: nextS, x: p.x, y: p.y };
    scale.setValue(nextS);
    tx.setValue(p.x);
    ty.setValue(p.y);
    onZoomChangeRef.current?.(nextS);
  };

  const touchDist = (touches: readonly { pageX: number; pageY: number }[]) => {
    const a = touches[0];
    const b = touches[1];
    if (!a || !b) return 0;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        cur.current.scale > 1.01 || Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => cur.current.scale <= 1.01,
      onPanResponderGrant: (e) => {
        const now = Date.now();
        const touches = e.nativeEvent.touches;
        start.current = { x: cur.current.x, y: cur.current.y };
        lastTouchCount.current = touches.length;
        if (touches.length >= 2) {
          pinch.current = { dist: Math.max(1, touchDist(touches)), scale: cur.current.scale };
          lastTap.current = 0;
          return;
        }
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          if (cur.current.scale > 1.15) apply(1, 0, 0);
          else apply(2.4, 0, 0);
          return;
        }
        lastTap.current = now;
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const d = Math.max(1, touchDist(touches));
          if (lastTouchCount.current < 2) {
            pinch.current = { dist: d, scale: cur.current.scale };
            start.current = { x: cur.current.x, y: cur.current.y };
          }
          lastTouchCount.current = touches.length;
          apply((pinch.current.scale * d) / pinch.current.dist, cur.current.x, cur.current.y);
          return;
        }
        if (lastTouchCount.current >= 2) {
          start.current = { x: cur.current.x, y: cur.current.y };
        }
        lastTouchCount.current = 1;
        if (cur.current.scale > 1.01) {
          apply(cur.current.scale, start.current.x + g.dx, start.current.y + g.dy);
        }
      },
      onPanResponderRelease: () => {
        lastTouchCount.current = 0;
        if (cur.current.scale <= 1.02) apply(1, 0, 0);
      },
      onPanResponderTerminate: () => {
        lastTouchCount.current = 0;
      },
    }),
  ).current;

  useEffect(() => {
    cur.current = { scale: 1, x: 0, y: 0 };
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
    onZoomChangeRef.current?.(1);
  }, [uri, scale, tx, ty]);

  const onLayout = (e: LayoutChangeEvent) => {
    layout.current = {
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    };
  };

  return (
    <View style={styles.wrap} onLayout={onLayout} {...responder.panHandlers}>
      <Animated.Image
        source={headers ? { uri, headers } : { uri }}
        style={[
          styles.img,
          { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
});

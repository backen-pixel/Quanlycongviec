import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bù phần app bị bàn phím che cho toàn bộ app (Android).
 *
 * Android ≤ 14: adjustResize co cửa sổ → không cần bù.
 * Android 15+ (edge-to-edge bắt buộc với targetSdk 35+): cửa sổ KHÔNG co nữa,
 * bàn phím đè lên nội dung → tự chừa paddingBottom.
 *
 * Lưu ý: `endCoordinates.height` của React Native KHÔNG gồm thanh điều hướng
 * (đo được 310dp trong khi bàn phím thật chiếm 358dp), nên phải tính phần bàn
 * phím chiếm từ `screenY`, hoặc cộng thêm inset đáy đo lúc chưa có bàn phím.
 */
type KeyboardInsetState = {
  keyboardVisible: boolean;
  /** px bàn phím đang che nội dung app (0 nếu cửa sổ đã tự co). */
  overlap: number;
};

const KeyboardInsetContext = createContext<KeyboardInsetState>({
  keyboardVisible: false,
  overlap: 0,
});

/** Coi là cửa sổ đã tự co khi mất từ 80dp chiều cao trở lên. */
const RESIZE_MIN_DP = 80;

export function KeyboardInsetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [outerHeight, setOuterHeight] = useState(0);
  const [keyboard, setKeyboard] = useState({ visible: false, occupied: 0 });
  /** Chiều cao khi chưa có bàn phím — mốc để biết cửa sổ có co không. */
  const baseHeightRef = useRef(0);
  /** Inset đáy lúc chưa có bàn phím: khi bàn phím mở hệ thống báo 0. */
  const baseBottomInsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  keyboardVisibleRef.current = keyboard.visible;
  if (!keyboard.visible && insets.bottom > 0) baseBottomInsetRef.current = insets.bottom;

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = (e: { endCoordinates?: { height?: number; screenY?: number } }) => {
      const height = Math.round(e.endCoordinates?.height || 0);
      if (height < RESIZE_MIN_DP) return;
      const screenY = e.endCoordinates?.screenY;
      const screenH = Dimensions.get('screen').height;
      const fromScreenY =
        typeof screenY === 'number' && screenY > 0 ? Math.round(screenH - screenY) : 0;
      const occupied = Math.max(height + baseBottomInsetRef.current, fromScreenY);
      setKeyboard((prev) =>
        prev.visible && prev.occupied === occupied ? prev : { visible: true, occupied },
      );
    };
    const hide = () =>
      setKeyboard((prev) => (prev.visible ? { visible: false, occupied: 0 } : prev));

    const showSub = Keyboard.addListener('keyboardDidShow', show);
    const frameSub = Keyboard.addListener('keyboardDidChangeFrame', show);
    const hideSub = Keyboard.addListener('keyboardDidHide', hide);
    return () => {
      showSub.remove();
      frameSub.remove();
      hideSub.remove();
    };
  }, []);

  const value = useMemo<KeyboardInsetState>(() => {
    if (!keyboard.visible || Platform.OS !== 'android') {
      return { keyboardVisible: keyboard.visible, overlap: 0 };
    }
    const base = baseHeightRef.current;
    const shrunk = base > 0 && outerHeight > 0 ? Math.max(0, base - outerHeight) : 0;
    if (shrunk >= RESIZE_MIN_DP) {
      // Cửa sổ đã co tới mép bàn phím — phần thanh điều hướng không cần bù.
      const rest = keyboard.occupied - shrunk - baseBottomInsetRef.current;
      return { keyboardVisible: true, overlap: Math.max(0, Math.round(rest)) };
    }
    return { keyboardVisible: true, overlap: Math.round(keyboard.occupied) };
  }, [keyboard.visible, keyboard.occupied, outerHeight]);

  return (
    <View
      style={styles.fill}
      collapsable={false}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (!h) return;
        setOuterHeight(h);
        if (!keyboardVisibleRef.current) baseHeightRef.current = h;
      }}
    >
      <View style={[styles.fill, value.overlap > 0 ? { paddingBottom: value.overlap } : null]}>
        <KeyboardInsetContext.Provider value={value}>
          {children}
        </KeyboardInsetContext.Provider>
      </View>
    </View>
  );
}

export function useKeyboardInset(): KeyboardInsetState {
  return useContext(KeyboardInsetContext);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

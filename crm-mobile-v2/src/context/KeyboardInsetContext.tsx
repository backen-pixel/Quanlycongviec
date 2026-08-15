import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

/**
 * Bù phần app bị bàn phím che cho toàn bộ app (Android).
 *
 * Chỉ so hai mốc, không đoán theo phiên bản Android: chiều cao view gốc (view này
 * bắt đầu từ đỉnh màn hình nên chiều cao = toạ độ đáy) và mép trên bàn phím
 * (`screenY`, cũng tính từ đỉnh màn hình). Cửa sổ tự co (adjustResize) thì đáy
 * view gốc đã nằm trên bàn phím → hiệu số ≤ 0 → không bù; cửa sổ không co
 * (edge-to-edge) thì hiệu số đúng bằng phần bị che.
 *
 * Không quy đổi qua `measureInWindow`: gốc toạ độ cửa sổ không trùng đỉnh màn
 * hình trên mọi máy (S23/Android 16 trả về -33dp vì cửa sổ bắt đầu dưới thanh
 * trạng thái) nên cộng vào sẽ làm thanh nhập chìm dưới bàn phím.
 *
 * Không dùng `endCoordinates.height` để suy ra phần bị che: máy báo không nhất
 * quán (S23 báo 310dp khi bàn phím chiếm 358dp vì thiếu thanh điều hướng, A13
 * báo 310dp nhưng view gốc cũng đã chừa thanh điều hướng). Cũng không ghi nhớ
 * "chiều cao khi chưa có bàn phím": trên A13 cửa sổ co TRƯỚC khi JS nhận sự kiện
 * bàn phím nên mốc đó bị ghi đè bằng chiều cao đã co, khiến app bù thêm một lần
 * nữa và thanh nhập bật lên giữa màn hình.
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

/** Bàn phím thấp hơn mức này là sự kiện rác (bàn phím đang tắt). */
const KEYBOARD_MIN_DP = 80;
/** Chặn trên cho phần bù: bàn phím + thanh điều hướng, chừa dư một chút. */
const EXTRA_INSET_MAX_DP = 64;

export function KeyboardInsetProvider({ children }: { children: React.ReactNode }) {
  /**
   * Chiều cao view gốc (dp). View gốc luôn bắt đầu từ đỉnh màn hình (app vẽ dưới
   * thanh trạng thái) nên chiều cao này cũng chính là toạ độ đáy view trên màn
   * hình — cùng hệ với `screenY` của bàn phím.
   */
  const [rootHeight, setRootHeight] = useState(0);
  const [keyboard, setKeyboard] = useState({ visible: false, top: 0, height: 0 });

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = (e: { endCoordinates?: { height?: number; screenY?: number } }) => {
      const height = Math.round(e.endCoordinates?.height || 0);
      const screenY = e.endCoordinates?.screenY;
      if (height < KEYBOARD_MIN_DP || typeof screenY !== 'number' || screenY <= 0) return;
      const top = Math.round(screenY);
      setKeyboard((prev) =>
        prev.visible && prev.top === top && prev.height === height
          ? prev
          : { visible: true, top, height },
      );
    };
    const hide = () =>
      setKeyboard((prev) => (prev.visible ? { visible: false, top: 0, height: 0 } : prev));

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
    if (!keyboard.visible || Platform.OS !== 'android' || rootHeight <= 0) {
      return { keyboardVisible: keyboard.visible, overlap: 0 };
    }
    const hidden = rootHeight - keyboard.top;
    const limit = keyboard.height + EXTRA_INSET_MAX_DP;
    const overlap = Math.min(Math.max(0, Math.round(hidden)), limit);
    return { keyboardVisible: true, overlap };
  }, [keyboard.visible, keyboard.top, keyboard.height, rootHeight]);

  return (
    <View
      style={styles.fill}
      collapsable={false}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h) setRootHeight(h);
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

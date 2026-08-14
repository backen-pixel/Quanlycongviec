import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Nhịp phát sáng gây chú ý cho FAB — chỉ chạy vài nhịp rồi dừng.
 *
 * Vòng lặp vô hạn khiến app vẽ 60fps liên tục ngay cả khi người dùng không
 * tương tác (đo được 1194 khung hình / 20 giây, ~17% CPU), rất tốn pin.
 */
export function usePulseGlow(restartKey?: string | number, pulses = 3): Animated.Value {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    glow.setValue(0);
    const step = (toValue: number) =>
      Animated.timing(glow, {
        toValue,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]), { iterations: pulses });
    loop.start();
    return () => loop.stop();
  }, [glow, pulses, restartKey]);

  return glow;
}

export default usePulseGlow;

import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** Style thêm khi đang giữ/chạm (hover trên mobile). */
  pressStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
};

/** Phản hồi nhẹ khi chạm — opacity + scale để người dùng biết nút có thể bấm. */
export default function TapHighlight({
  style,
  pressStyle,
  children,
  disabled,
  android_ripple,
  ...rest
}: Props) {
  // Tránh android_ripple mặc định: trên một số máy (emulator) ripple + backgroundColor
  // của Pressable giữ màu nền theme cũ khi đổi dark/light.
  return (
    <Pressable
      disabled={disabled}
      android_ripple={android_ripple}
      style={({ pressed }) => [
        style,
        disabled ? { opacity: 0.42 } : null,
        !disabled && pressed
          ? [{ opacity: 0.88, transform: [{ scale: 0.97 }] }, pressStyle]
          : null,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

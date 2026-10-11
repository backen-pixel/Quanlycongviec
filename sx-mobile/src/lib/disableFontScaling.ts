/**
 * Tắt phóng chữ theo cài đặt «Cỡ chữ» của điện thoại cho toàn app.
 *
 * Trước đây dùng `Text.defaultProps.allowFontScaling = false`, nhưng từ React 19 / React Native 0.81 `defaultProps` của
 * component hàm KHÔNG còn tác dụng — chữ vẫn phình theo cỡ chữ hệ thống (đã thử: font_scale 1.3 làm lời chào xuống dòng,
 * tiêu đề hàng việc bị cắt, nút chật) nên giao diện mất cân đối so với thiết kế. Nay bọc `Text` và `TextInput`:
 * mặc định `allowFontScaling={false}`; chỗ nào truyền tường minh thì vẫn được giữ.
 *
 * Cách làm: ghi đè thuộc tính `Text` / `TextInput` trên đối tượng 'react-native' (mọi màn lấy chúng từ đó mỗi lần render).
 * Không gán đè `module.default` được vì nó chỉ có getter.
 *
 * PHẢI được import trước mọi màn hình (xem đầu App.tsx).
 */
import React from 'react';

type AnyComponent = React.ComponentType<Record<string, unknown>>;

function wrapNoFontScaling(Orig: AnyComponent, name: string): AnyComponent {
  function NoFontScaling(props: Record<string, unknown>) {
    // React 19: `ref` là một prop thường nên đi qua spread, không cần forwardRef.
    return React.createElement(Orig, { ...props, allowFontScaling: props.allowFontScaling ?? false });
  }
  NoFontScaling.displayName = name;
  // Giữ các thuộc tính tĩnh (vd. TextInput.State) để mã dùng chúng không vỡ.
  for (const key of Object.keys(Orig)) {
    try {
      (NoFontScaling as unknown as Record<string, unknown>)[key] = (Orig as unknown as Record<string, unknown>)[key];
    } catch {
      /* bỏ qua thuộc tính chỉ đọc */
    }
  }
  return NoFontScaling as AnyComponent;
}

function patchExport(RN: Record<string, unknown>, name: 'Text' | 'TextInput') {
  try {
    const Orig = RN[name] as AnyComponent | undefined;
    if (!Orig || (Orig as unknown as Record<string, unknown>).__noFontScalingPatched) return;
    const Wrapped = wrapNoFontScaling(Orig, name);
    (Wrapped as unknown as Record<string, unknown>).__noFontScalingPatched = true;
    Object.defineProperty(RN, name, { configurable: true, enumerable: true, get: () => Wrapped });
  } catch {
    /* không vá được thì giữ hành vi mặc định của RN */
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactNative = require('react-native') as Record<string, unknown>;
patchExport(ReactNative, 'Text');
patchExport(ReactNative, 'TextInput');

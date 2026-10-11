/**
 * Icon SVG tự vẽ cho thanh tab: nét bo tròn, 2 trạng thái — viền (chưa chọn) và đặc (đang chọn).
 * Lưới 24x24 như bộ icon thông dụng nên đổi `size` là co giãn sắc nét ở mọi mật độ điểm ảnh.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'home' | 'projects' | 'work' | 'chat' | 'plus';

type Props = {
  name: TabIconName;
  size: number;
  color: string;
  active?: boolean;
  /** Màu nét/chấm khắc trên nền đặc (dấu tích, chấm tin nhắn) — thường là màu nền thanh. */
  cut?: string;
};

const STROKE = 1.9;

export default function TabIcon({ name, size, color, active = false, cut = '#FFFFFF' }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 24 24' } as const;
  const line = {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;

  switch (name) {
    case 'home':
      return (
        <Svg {...common}>
          <Path
            d="M3.5 10.6 11.1 3.9a1.4 1.4 0 0 1 1.8 0l7.6 6.7a1.4 1.4 0 0 1 .5 1.1V19a2 2 0 0 1-2 2h-3.2a.8.8 0 0 1-.8-.8V15a1.6 1.6 0 0 0-1.6-1.6h-1.8A1.6 1.6 0 0 0 9.4 15v5.2a.8.8 0 0 1-.8.8H5.5a2 2 0 0 1-2-2v-7.3c0-.4.1-.8.4-1.1Z"
            {...(active ? { fill: color, stroke: color, strokeWidth: 1, strokeLinejoin: 'round' as const } : line)}
          />
        </Svg>
      );
    case 'projects':
      return (
        <Svg {...common}>
          {[
            [3.5, 3.5],
            [13.5, 3.5],
            [3.5, 13.5],
            [13.5, 13.5],
          ].map(([x, y], i) => (
            <Rect
              key={i}
              x={x}
              y={y}
              width={7}
              height={7}
              rx={2}
              {...(active ? { fill: color } : line)}
            />
          ))}
        </Svg>
      );
    case 'work':
      return (
        <Svg {...common}>
          <Rect
            x={3.5}
            y={3.5}
            width={17}
            height={17}
            rx={5}
            {...(active ? { fill: color } : line)}
          />
          <Path
            d="m8.2 12.4 2.6 2.6 5.2-5.6"
            stroke={active ? cut : color}
            strokeWidth={STROKE + 0.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );
    case 'chat':
      return (
        <Svg {...common}>
          <Path
            d="M12 3.2c-4.9 0-8.8 3.6-8.8 8.1 0 1.9.7 3.7 1.9 5L4.4 20.2a.6.6 0 0 0 .8.7l3.7-1.7c1 .4 2 .6 3.1.6 4.9 0 8.8-3.6 8.8-8.1S16.9 3.2 12 3.2Z"
            {...(active ? { fill: color } : line)}
          />
          <Circle cx={8.3} cy={11.5} r={1.1} fill={active ? cut : color} />
          <Circle cx={12} cy={11.5} r={1.1} fill={active ? cut : color} />
          <Circle cx={15.7} cy={11.5} r={1.1} fill={active ? cut : color} />
        </Svg>
      );
    case 'plus':
    default:
      return (
        <Svg {...common}>
          <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        </Svg>
      );
  }
}

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { colorWithAlpha, type AppColors } from '../theme';
import TabIcon, { type TabIconName } from './TabIcons';

type TabMeta = { label: string; icon: TabIconName };

/** Chỉ các tab này hiện trên thanh; Profile / Planner mở từ menu nên bị ẩn. «CreateDeal» là nút + ở giữa. */
const TAB_META: Record<string, TabMeta> = {
  Overview: { label: 'Tổng quan', icon: 'home' },
  Kanban: { label: 'Dự án', icon: 'projects' },
  Work: { label: 'Công việc', icon: 'work' },
  Messages: { label: 'Tin nhắn', icon: 'chat' },
};

const FAB_SIZE = 50;
/** Nút + nhô lên khỏi mép trên của thanh. */
const FAB_RISE = 22;
/** Khe hở đều quanh nút + (rãnh khoét ĐỒNG TÂM với nút, bán kính lớn hơn nút đúng bằng khe này). */
const NOTCH_GAP = 8;
const NOTCH_R = FAB_SIZE / 2 + NOTCH_GAP;
/** Tâm nút + nằm dưới mép trên của thanh bao nhiêu px (nút cao FAB_RISE nhô lên → tâm ở FAB_SIZE/2 - FAB_RISE). */
const FAB_CENTER_BELOW_DOCK_TOP = FAB_SIZE / 2 - FAB_RISE;
const DOCK_RADIUS = 28;

/**
 * Đường viền trên của thanh (một nét liền): bo góc trái → mặt phẳng → vai mềm → cung tròn ĐỒNG TÂM với nút + → vai mềm → mặt phẳng
 * → bo góc phải. `closed` thêm hai cạnh đáy để tô nền. Tọa độ gốc ở góc trên trái của thanh.
 */
function dockPath(w: number, h: number, notch: boolean, closed: boolean): string {
  const r = DOCK_RADIUS;
  const cx = w / 2;
  let d = `M0,${r} A${r},${r} 0 0 1 ${r},0`;
  if (notch) {
    // Cung rãnh đi từ điểm φ dưới đường ngang qua tâm, vòng qua đáy sang điểm đối xứng; mỗi bên nối với mặt phẳng bằng đường cong bezier.
    const phi = (25 * Math.PI) / 180;
    const R = NOTCH_R;
    const cy = FAB_CENTER_BELOW_DOCK_TOP;
    const px = R * Math.cos(phi);
    const py = cy + R * Math.sin(phi);
    const tx = Math.sin(phi) * 10; // tiếp tuyến tại điểm nối (hướng xuống/vào trong), nhân độ dài tay đòn
    const ty = Math.cos(phi) * 10;
    const shoulder = R + 16;
    d += ` L${cx - shoulder},0`;
    d += ` C${cx - shoulder + 14},0 ${cx - px - tx},${py - ty} ${cx - px},${py}`;
    d += ` A${R},${R} 0 0 0 ${cx + px},${py}`;
    d += ` C${cx + px + tx},${py - ty} ${cx + shoulder - 14},0 ${cx + shoulder},0`;
  }
  d += ` L${w - r},0 A${r},${r} 0 0 1 ${w},${r}`;
  if (closed) d += ` L${w},${h} L0,${h} Z`;
  return d;
}

type Props = BottomTabBarProps & {
  /** Quản lý/admin mới có nút tạo đơn ở giữa (và khoảng khuyết cong). */
  canCreate: boolean;
  onCreate: () => void;
  messageUnread: number;
};

type ItemProps = {
  meta: TabMeta;
  focused: boolean;
  badge?: number;
  colors: AppColors;
  /** Nhích nội dung ra xa khoảng khuyết ở giữa (thiết kế: pr-2 / pl-2 cho tab 2 và 3). */
  shift?: 'left' | 'right';
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({ meta, focused, badge = 0, colors, shift, onPress, onLongPress }: ItemProps) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 140,
    }).start();
  }, [focused, anim]);

  const styles = useMemo(() => makeItemStyles(colors), [colors]);

  return (
    <Pressable
      style={[styles.item, shift === 'left' && styles.shiftLeft, shift === 'right' && styles.shiftRight]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={meta.label}
      accessibilityState={{ selected: focused }}
      android_ripple={{ color: colorWithAlpha(colors.primary, 0.12), borderless: true, radius: 34 }}
    >
      <View style={styles.iconWrap}>
        <Animated.View style={{ transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
          <TabIcon
            name={meta.icon}
            size={focused ? 25 : 23}
            color={focused ? colors.primary : colors.textMuted}
            active={focused}
            cut={colors.bgElevated}
          />
        </Animated.View>
        {badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.label, { color: focused ? colors.primary : colors.textMuted }, focused && styles.labelActive]}
        numberOfLines={1}
      >
        {meta.label}
      </Text>
      {/* Gạch chỉ báo dưới tab đang chọn; tab khác để trong suốt để chiều cao không nhảy. */}
      <Animated.View
        style={[
          styles.indicator,
          { backgroundColor: colors.primary, opacity: anim, transform: [{ scaleX: anim }] },
        ]}
      />
    </Pressable>
  );
}

export default function FloatingTabBar({ state, navigation, canCreate, onCreate, messageUnread }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tabs = state.routes.filter((r) => !!TAB_META[r.name]);
  const half = Math.ceil(tabs.length / 2);

  // Tab vừa chạm: sáng lên NGAY (chỉ vẽ lại thanh tab, rất nhẹ) rồi mới chuyển màn hình ở khung hình kế tiếp — màn nặng
  // (vd. Công việc) dựng mất vài trăm ms nên nếu gộp chung thì thanh tab cũng đứng hình theo.
  const currentKey = state.routes[state.index]?.key;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [dockSize, setDockSize] = useState({ w: 0, h: 0 });
  useEffect(() => { setPendingKey(null); }, [currentKey]);
  useEffect(() => {
    if (!pendingKey) return undefined;
    const t = setTimeout(() => setPendingKey(null), 2000); // phòng khi chuyển tab bị chặn/hủy
    return () => clearTimeout(t);
  }, [pendingKey]);

  const press = (routeKey: string, routeName: string, params: object | undefined, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      setPendingKey(routeKey);
      requestAnimationFrame(() => {
        (navigation.navigate as unknown as (name: string, params?: object) => void)(routeName, params);
      });
    }
  };

  return (
    // Nền trùng nền trang: hai góc bo trên của thanh lộ ra nền này. Thanh nằm TRONG luồng nên không che nội dung các màn.
    <View style={[styles.wrap, { paddingTop: canCreate ? FAB_RISE : 0 }]}>
      <View
        style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setDockSize((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
        }}
      >
        {/* Nền thanh vẽ bằng SVG một nét liền (góc bo + rãnh khoét mềm đồng tâm với nút +); đặt dưới các tab. */}
        {dockSize.w > 0 ? (
          <Svg
            pointerEvents="none"
            style={styles.dockBg}
            width={dockSize.w}
            height={dockSize.h + 1}
            viewBox={`0 -1 ${dockSize.w} ${dockSize.h + 1}`}
          >
            <Path d={dockPath(dockSize.w, dockSize.h, canCreate, true)} fill={colors.bgElevated} />
            <Path
              d={dockPath(dockSize.w, dockSize.h, canCreate, false)}
              fill="none"
              stroke={colorWithAlpha(colors.border, 0.7)}
              strokeWidth={StyleSheet.hairlineWidth * 2}
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
        {tabs.map((route, i) => {
          const focused = (pendingKey ?? currentKey) === route.key;
          // Chỉ khi có nút giữa mới cần nhích tab sát khoảng khuyết (tab cuối nhóm trái / đầu nhóm phải).
          const shift = canCreate ? (i === half - 1 ? 'left' : i === half ? 'right' : undefined) : undefined;
          return (
            <TabItem
              key={route.key}
              meta={TAB_META[route.name]}
              focused={focused}
              badge={route.name === 'Messages' ? messageUnread : 0}
              colors={colors}
              shift={shift}
              onPress={() => press(route.key, route.name, route.params, focused)}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>

      {canCreate ? (
        <View pointerEvents="box-none" style={styles.fabLayer}>
          <Pressable
            onPress={onCreate}
            accessibilityRole="button"
            accessibilityLabel="Tạo đơn mới"
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          >
            <LinearGradient
              colors={[colorWithAlpha(colors.primary, 0.82), colors.primary]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.fabFill}
            >
              <TabIcon name="plus" size={28} color={colors.white} />
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function makeItemStyles(colors: AppColors) {
  return StyleSheet.create({
    item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
    shiftLeft: { paddingRight: 8 },
    shiftRight: { paddingLeft: 8 },
    iconWrap: { height: 26, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    labelActive: { fontWeight: '800' },
    indicator: { width: 14, height: 2.5, borderRadius: 2, marginTop: 2 },
    badge: {
      position: 'absolute',
      top: -4,
      right: -12,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bgElevated,
    },
    badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', lineHeight: 12 },
  });
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { backgroundColor: colors.bg },
    dock: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingTop: 8,
      paddingHorizontal: 12,
    },
    // Nền thanh (SVG) phủ kín thanh, lệch lên 1px để nét viền trên không bị cắt.
    dockBg: { position: 'absolute', top: -1, left: 0 },
    fabLayer: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      shadowColor: colors.primary,
      shadowOpacity: 0.45,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      ...Platform.select({ android: { elevation: 12 } }),
    },
    fabFill: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabPressed: { transform: [{ scale: 0.94 }], opacity: 0.92 },
  });
}

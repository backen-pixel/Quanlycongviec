/**
 * Mảnh giao diện dùng chung cho màn Tổng quan.
 *
 * Chỉ trình bày — không gọi API, không giữ trạng thái nghiệp vụ. Dữ liệu và hành
 * động đều do màn cha truyền xuống, nên sau này thay nguồn dữ liệu không phải
 * đụng tới các component này.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Radii, colorWithAlpha, type AppColors } from '../../theme';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/** Một ô số liệu trên dải "Tổng quan sản xuất". */
export type KpiStat = {
  key: string;
  label: string;
  value: number;
  icon: IoniconName;
  /** Màu chủ đạo của ô — chữ số, icon và nền chuyển sắc đều suy từ đây. */
  color: string;
  onPress: () => void;
};

/** Một ô trong lưới Lối tắt. */
export type ShortcutAction = {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  onPress: () => void;
};

/**
 * Đốm sáng tròn, tỏa dần ra rìa.
 *
 * Vẽ bằng `experimental_backgroundImage` của React Native (RN 0.81 + kiến trúc
 * mới): một View, một shader radial phía native (Android dùng
 * `android.graphics.RadialGradient`). Bản trước xếp 22 vòng tròn mờ chồng lên
 * nhau để giả radial — GPU phải blend 22 lớp trong suốt mỗi khung hình đúng
 * vùng đó, máy yếu thấy rõ. Nay còn một lần blend.
 *
 * Dùng dạng CHUỖI CSS chứ không phải object: kiểu `GradientValue` của RN 0.81
 * mới khai báo 'linear-gradient', truyền object sẽ lỗi type. Tiền tố
 * `experimental_` nghĩa là tên thuộc tính có thể đổi ở bản RN sau — mọi chỗ
 * dùng đốm sáng đều đi qua component này nên lúc đó chỉ phải sửa ở đây.
 *
 * `layers` × `intensity` giữ nguyên ý nghĩa cũ (độ mờ cộng dồn ở tâm) để không
 * phải chỉnh lại các chỗ đang gọi. Vệt sáng cũ đặc đều trong 20% bán kính giữa
 * rồi nhạt tuyến tính ra rìa, nên hai mốc màu dưới đây tả đúng dáng đó.
 */
export function GlowSpot({
  size,
  color,
  layers = 22,
  intensity = 0.016,
  style,
}: {
  size: number;
  color: string;
  /** Số lớp của bản cũ — nay chỉ còn dùng để suy ra độ mờ ở tâm. */
  layers?: number;
  /** Độ mờ mỗi lớp — nhân với `layers` ra độ sáng tâm. */
  intensity?: number;
  style?: object;
}) {
  const backgroundImage = useMemo(() => {
    const peak = Math.min(1, layers * intensity);
    const core = colorWithAlpha(color, peak);
    const edge = colorWithAlpha(color, 0);
    // closest-side = đúng nửa cạnh View, để đốm vừa khít khung vuông size×size.
    return `radial-gradient(circle closest-side at 50% 50%, ${core} 0%, ${core} 20%, ${edge} 100%)`;
  }, [color, layers, intensity]);

  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size, experimental_backgroundImage: backgroundImage }, style]}
    />
  );
}

/** Tiêu đề mục kèm icon màu và liên kết phụ bên phải. */
export function SectionHeader({
  icon,
  iconColor,
  title,
  actionLabel,
  onAction,
  badge,
}: {
  icon: IoniconName;
  iconColor?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Tổng số mục — hiện thành huy hiệu tròn cạnh tiêu đề; bỏ qua khi không truyền. */
  badge?: number;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.secHead}>
      <View style={s.secTitleWrap}>
        <Ionicons name={icon} size={16} color={iconColor || colors.primary} />
        <Text style={s.secTitle}>{title}</Text>
        {badge != null && badge > 0 ? (
          <View style={s.secBadge}>
            <Text style={s.secBadgeTxt}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={s.secAction}>
          <Text style={s.secActionTxt}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * `compact`: xếp DỌC (icon trên — số — nhãn) cho lưới 4 ô một hàng. Bố cục ngang
 * ở bề rộng ~85px sẽ bóp nhãn thành một chữ hoặc cắt mất.
 */
export function KpiCard({
  stat,
  style,
  compact = false,
}: { stat: KpiStat; style?: object; compact?: boolean }) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  // Chuyển sắc suy từ chính màu của ô nên theme sáng/tối đều ra đúng sắc độ.
  const grad: [string, string] = [
    colorWithAlpha(stat.color, isDark ? 0.46 : 0.2),
    colorWithAlpha(stat.color, isDark ? 0.08 : 0.03),
  ];
  return (
    <Pressable
      style={({ pressed }) => [s.kpiCard, style, pressed && s.pressed]}
      onPress={stat.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stat.label}: ${stat.value}`}
    >
      {/* Bố cục NGANG: trong lưới 2 cột thẻ đã rộng, xếp dọc icon/số/nhãn làm thẻ
          cao gấp đôi mức cần thiết và đẩy nội dung phía dưới xuống sâu. */}
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.kpiFill, compact && s.kpiFillCompact]}
      >
        <View style={[s.kpiIcon, compact && s.kpiIconCompact, { backgroundColor: stat.color }]}>
          <Ionicons name={stat.icon} size={compact ? 14 : 16} color={colors.white} />
        </View>
        <View style={[s.kpiText, compact && s.kpiTextCompact]}>
          <Text style={[s.kpiValue, compact && s.kpiValueCompact, { color: stat.color }]}>
            {stat.value}
          </Text>
          <Text style={[s.kpiLabel, compact && s.kpiLabelCompact]} numberOfLines={1}>
            {stat.label}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export function ShortcutTile({ action }: { action: ShortcutAction }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={({ pressed }) => [s.tile, pressed && s.pressed]}
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={[s.tileIcon, { backgroundColor: colorWithAlpha(action.color, 0.16) }]}>
        <Ionicons name={action.icon} size={20} color={action.color} />
      </View>
      <Text style={s.tileLabel} numberOfLines={1}>{action.label}</Text>
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    secHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      marginBottom: 10,
    },
    secBadge: {
      minWidth: 22,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colorWithAlpha(colors.primary, 0.14),
    },
    secBadgeTxt: { color: colors.primary, fontSize: 11.5, fontWeight: '800' },
    secTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
    secTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      flexShrink: 1,
    },
    secAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    secActionTxt: { color: colors.primary, fontSize: 13, fontWeight: '700' },

    kpiCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      // Cắt lớp chuyển sắc theo góc bo.
      overflow: 'hidden',
    },
    kpiFill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    kpiIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kpiText: { flex: 1, minWidth: 0 },
    kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    kpiLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },

    // Biến thể gọn — 4 ô một hàng. Giữ icon BÊN TRÁI như thiết kế, chỉ thu nhỏ.
    kpiFillCompact: {
      gap: 6,
      paddingHorizontal: 7,
      paddingVertical: 9,
    },
    kpiIconCompact: { width: 24, height: 24, borderRadius: 12 },
    kpiTextCompact: {},
    kpiValueCompact: { fontSize: 18 },
    kpiLabelCompact: { fontSize: 9 },

    tile: {
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    tileIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },

    pressed: { opacity: 0.82 },
  });
}

import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { TaskGroupTone } from '../lib/workTasksApi';
import { Radii, colorWithAlpha } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Nhãn trạng thái của một nhóm việc theo dự án — dùng chung cho tab Công việc và Tổng quan.
 * Chỉ là nhãn nhỏ (không tô nền thẻ) để danh sách đỡ nặng màu.
 *
 * Mỗi nhãn là MỘT `Text` có nền + bo + đệm, icon đặt lồng trong chữ — trước đây là View + Ionicons + Text (3 View native)
 * lặp lại trên từng dòng nhóm của danh sách dài.
 */
export const TODAY_COLOR = '#7C3AED';

function Tag({ color, icon, label }: { color: string; icon: IconName; label: string }) {
  return (
    <Text style={[styles.tag, { backgroundColor: colorWithAlpha(color, 0.15), color }]} numberOfLines={1}>
      <Ionicons name={icon} size={12} color={color} />
      {` ${label}`}
    </Text>
  );
}

/** Nhãn «Hôm nay» cho việc / nhóm việc có hạn là ngày hiện tại. */
export function TodayTag({ count = 0 }: { count?: number }) {
  return <Tag color={TODAY_COLOR} icon="today" label={count > 1 ? `Hôm nay ${count}` : 'Hôm nay'} />;
}

export default function TaskGroupTag({
  tone,
  overdueCount = 0,
  dueTodayCount = 0,
}: {
  tone: TaskGroupTone | null;
  overdueCount?: number;
  /** Số việc chưa xong có hạn là hôm nay; >0 thì thêm nhãn «Hôm nay». */
  dueTodayCount?: number;
}) {
  const { colors } = useTheme();
  if (!tone) return dueTodayCount > 0 ? <TodayTag count={dueTodayCount} /> : null;
  const info: Record<TaskGroupTone, { color: string; label: string; icon: IconName }> = {
    overdue: { color: colors.danger, label: `Quá hạn ${overdueCount}`, icon: 'alert-circle' },
    done: { color: colors.success, label: 'Hoàn thành', icon: 'checkmark-circle' },
    doing: { color: colors.primary, label: 'Đang làm', icon: 'time' },
    todo: { color: colors.warning, label: 'Chưa làm', icon: 'ellipse-outline' },
  };
  const { color, label, icon } = info[tone];
  const tag = <Tag color={color} icon={icon} label={label} />;
  // Chỉ bọc View khi có HAI nhãn cạnh nhau; một nhãn thì trả thẳng Text (không thêm View).
  if (dueTodayCount <= 0) return tag;
  return (
    <View style={styles.wrap}>
      <TodayTag count={dueTodayCount} />
      {tag}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.full,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '800',
  },
});

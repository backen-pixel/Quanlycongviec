import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../../theme';
import type { TaskGroupTone } from '../../lib/workTasksApi';
import { KpiCard, SectionHeader, type KpiStat } from '../dashboard/DashboardParts';
import TaskGroupTag, { TodayTag } from '../TaskGroupTag';

/**
 * Bố cục Tổng quan cho NHÂN VIÊN — khác bản quản trị ở chỗ đặt việc của mình
 * lên trước, rút KPI còn 4 ô có nghĩa với người làm, và bỏ các chỉ số điều hành.
 * Thuần trình bày: mọi số liệu do `OverviewScreen` tính rồi truyền xuống.
 */

/** Một việc nằm trong nhóm — hiện khi xổ nhóm ra. */
export type StaffGroupTask = {
  id: string;
  title: string;
  done: boolean;
  inProgress: boolean;
  overdue: boolean;
  /** Chưa xong và hạn là hôm nay. */
  dueToday?: boolean;
  /** «dd/mm» hoặc null nếu chưa có hạn. */
  dueLabel: string | null;
};

/** Việc của nhân viên gom theo dự án (giống tab Công việc) — gọn hơn liệt kê từng việc. */
export type StaffTaskGroup = {
  /** Các việc bên trong, hiện khi chạm vào nhóm. */
  tasks: StaffGroupTask[];
  id: string;
  /** Dự án để mở khi chạm; null = nhóm «Giao việc» không gắn dự án. */
  projectId: string | null;
  /** «mã · tên dự án». */
  title: string;
  done: number;
  open: number;
  total: number;
  overdueCount: number;
  /** Số việc chưa xong có hạn hôm nay. */
  dueTodayCount?: number;
  tone: TaskGroupTone | null;
};

export type StaffProjectRow = {
  id: string;
  name: string;
  /** 0–100. */
  percent: number;
  /** Tên cột Kanban đang đứng — dùng làm chip trạng thái. */
  stageName: string;
  stageColor?: string | null;
  orderLabel?: string | null;
  deliveryLabel?: string | null;
  deadlineLabel?: string | null;
  overdue?: boolean;
};

export default function StaffOverviewBody({
  kpiStats,
  taskGroups,
  projectRows,
  taskTotal,
  taskGroupTotal,
  projectTotal,
  loadFailed = false,
  onOpenProject,
  onSeeAllTasks,
  onSeeAllProjects,
}: {
  kpiStats: KpiStat[];
  /** Phần xem trước các nhóm việc; tổng số nhóm ở `taskGroupTotal`. */
  taskGroups: StaffTaskGroup[];
  projectRows: StaffProjectRow[];
  /** Tổng số việc (badge) / số nhóm việc / số dự án — danh sách chỉ là phần xem trước. */
  taskTotal: number;
  taskGroupTotal: number;
  projectTotal: number;
  /** Lần tải việc gần nhất lỗi — dòng rỗng phải nói «chưa tải được» chứ không phải «không có». */
  loadFailed?: boolean;
  onOpenProject: (id: string) => void;
  onSeeAllTasks: () => void;
  onSeeAllProjects: () => void;
}) {
  const { colors, isDark } = useTheme();
  /** Nhóm đang xổ ra — đóng mặc định, chạm để mở (giống tab Công việc). */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const bottomInset = useSafeAreaInsets().bottom;
  const s = useMemo(() => makeStyles(colors, bottomInset, isDark), [colors, bottomInset, isDark]);
  // Tối: nền xanh đêm chuyển sắc nhẹ + viền xanh sáng mờ. Sáng: nền trắng thuần.
  const panelColors: [string, string] = isDark
    ? ['#0B2142', '#061427']
    : [colors.card, colors.card];

  return (
      /* Một khung «Tổng quan sản xuất» bao toàn bộ: KPI + việc của tôi + dự án. */
      <LinearGradient
        colors={panelColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={s.kpiPanel}
      >
        <SectionHeader icon="cube-outline" title="Tổng quan sản xuất" />
        <View style={s.kpiRow}>
          {kpiStats.map((stat) => (
            <KpiCard key={stat.key} stat={stat} style={s.kpiCell} compact />
          ))}
        </View>

      <>
          <SectionHeader
            icon="checkbox-outline"
            title="Công việc của tôi"
            badge={taskTotal}
            // Chỉ hiện «Xem tất cả» khi còn mục chưa được liệt kê; tổng số đã có ở badge nên không lặp lại.
            actionLabel={taskGroupTotal > taskGroups.length ? 'Xem tất cả' : undefined}
            onAction={onSeeAllTasks}
          />
          <View style={s.list}>
            {taskGroups.length === 0 ? (
              <View style={s.emptyRow}>
                <Ionicons name="checkmark-done-outline" size={20} color={colors.textFaint} />
                <Text style={s.emptyTxt}>
                  {loadFailed ? 'Chưa tải được công việc — kéo xuống để thử lại' : 'Chưa có công việc nào'}
                </Text>
              </View>
            ) : taskGroups.map((g) => {
              const open = !!expanded[g.id];
              return (
                <View key={g.id} style={s.groupCard}>
                  {/* Chạm vào nhóm = xổ/thu các việc bên trong (giống tab Công việc). */}
                  <Pressable
                    style={({ pressed }) => [s.groupHead, pressed && s.pressed]}
                    onPress={() => toggle(g.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${g.title}, ${g.done} trên ${g.total} xong`}
                  >
                    <Ionicons
                      name={open ? 'chevron-down' : 'chevron-forward'}
                      size={18}
                      color={colors.textMuted}
                    />
                    <View style={s.rowBody}>
                      <Text style={s.rowTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>
                        {g.done}/{g.total} xong{g.open > 0 ? ` · ${g.open} còn lại` : ''}
                        {open ? '' : ' · chạm để mở'}
                      </Text>
                    </View>
                    <TaskGroupTag tone={g.tone} overdueCount={g.overdueCount} dueTodayCount={g.dueTodayCount} />
                    {g.projectId ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => onOpenProject(g.projectId as string)}
                        accessibilityLabel={`Mở dự án ${g.title}`}
                      >
                        <Ionicons name="open-outline" size={18} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                  {open ? (
                    <View style={s.groupBody}>
                      {g.tasks.map((t) => {
                        const tone = t.done
                          ? colors.success
                          : t.overdue ? colors.danger : t.inProgress ? colors.primary : colors.warning;
                        return (
                          <View key={t.id} style={s.taskItem}>
                            <Ionicons
                              name={
                                t.done ? 'checkmark-circle'
                                  : t.overdue ? 'alert-circle'
                                    : t.inProgress ? 'time' : 'ellipse-outline'
                              }
                              size={16}
                              color={tone}
                            />
                            <Text
                              style={[s.taskItemTitle, t.done && s.taskItemDone]}
                              numberOfLines={2}
                            >
                              {t.title}
                            </Text>
                            {t.dueToday ? <TodayTag /> : null}
                            {t.dueLabel ? (
                              <Text style={[s.taskItemDue, t.overdue && { color: colors.danger }]}>
                                {t.dueLabel}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
      </>

      <>
          <SectionHeader
            icon="cube-outline"
            title="Dự án sản xuất"
            badge={projectTotal}
            actionLabel={projectTotal > projectRows.length ? 'Xem tất cả' : undefined}
            onAction={onSeeAllProjects}
          />
          <View style={s.list}>
            {projectRows.length === 0 ? (
              <View style={s.emptyRow}>
                <Ionicons name="cube-outline" size={20} color={colors.textFaint} />
                <Text style={s.emptyTxt}>
                  {loadFailed ? 'Chưa tải được dự án — kéo xuống để thử lại' : 'Chưa có dự án nào'}
                </Text>
              </View>
            ) : projectRows.map((p) => {
              const tone = p.stageColor || colors.primary;
              const pct = Math.max(0, Math.min(100, Math.round(p.percent)));
              return (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [s.row, pressed && s.pressed]}
                  onPress={() => onOpenProject(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${pct}%, ${p.stageName}`}
                >
                  <View style={[s.rowAccent, { backgroundColor: tone }]} />
                  <View style={s.rowBody}>
                    <Text style={s.rowTitle} numberOfLines={2}>{p.name}</Text>
                    <View style={s.metaRow}>
                      <View style={[s.stageChip, { backgroundColor: colorWithAlpha(tone, 0.14) }]}>
                        <Text style={[s.chipTxt, { color: tone }]} numberOfLines={1}>{p.stageName}</Text>
                      </View>
                      {[
                        { key: 'o', icon: 'calendar-outline' as const, text: p.orderLabel ? `Đặt ${p.orderLabel}` : null },
                        { key: 'g', icon: 'car-outline' as const, text: p.deliveryLabel ? `Giao ${p.deliveryLabel}` : null },
                        { key: 'h', icon: 'time-outline' as const, text: p.deadlineLabel ? `Hạn ${p.deadlineLabel}` : null },
                      ].filter((d) => d.text).map((d) => (
                        <View key={d.key} style={s.dateItem}>
                          <Ionicons
                            name={d.icon}
                            size={12}
                            color={p.overdue && d.key !== 'o' ? colors.danger : colors.textMuted}
                          />
                          <Text style={[s.dueTxt, p.overdue && d.key !== 'o' && { color: colors.danger }]}>
                            {d.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </View>
      </>
      </LinearGradient>
  );
}

function makeStyles(colors: AppColors, bottomInset: number, isDark: boolean) {
  return StyleSheet.create({
    /** Khung trải hết bề ngang (bù lề 14 của ScrollView) và kéo dài tới đáy màn hình. */
    kpiPanel: {
      flexGrow: 1,
      marginHorizontal: -14,
      paddingHorizontal: 14,
      paddingTop: Spacing.sm,
      paddingBottom: bottomInset + 110,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: isDark ? colorWithAlpha(colors.primary, 0.32) : colors.border,
    },
    kpiRow: {
      flexDirection: 'row',
      gap: 6,
    },
    /** 4 ô chia đều một hàng; `minWidth: 0` để ô không nở theo chữ dài. */
    kpiCell: { flex: 1, minWidth: 0 },
    list: { gap: Spacing.sm, marginBottom: Spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: 10,
      paddingRight: Spacing.sm,
      overflow: 'hidden',
      borderRadius: Radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      // Sáng: thẻ trắng trên khung trắng — thêm bóng nhẹ để nổi lên. Tối đã tương phản sẵn.
      ...(isDark ? null : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.14,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }),
    },
    pressed: { opacity: 0.7 },
    /** Thẻ nhóm việc: đầu nhóm + (khi xổ) danh sách việc bên trong. */
    groupCard: {
      borderRadius: Radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...(isDark ? null : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.14,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }),
    },
    groupHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.sm,
    },
    groupBody: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      gap: 2,
    },
    taskItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 7,
      paddingLeft: 4,
    },
    taskItemTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
    taskItemDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
    taskItemDue: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    dot: {
      width: 34,
      height: 34,
      borderRadius: Radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Vạch màu theo cột Kanban ở mép trái thẻ dự án. */
    rowAccent: { alignSelf: 'stretch', width: 4, marginVertical: -10, marginRight: 2 },
    rowBody: { flex: 1, gap: 6 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, columnGap: 10 },
    stageChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radii.full },
    dateItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
    rowSub: { color: colors.textMuted, fontSize: 12 },
    dueLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dueTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    progressLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    track: {
      flex: 1,
      height: 6,
      borderRadius: Radii.full,
      // Sáng: thẻ trắng nên nền thanh phải xám rõ, nếu không cả thanh biến mất.
      backgroundColor: isDark ? colors.bgElevated : '#E2E8F0',
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: Radii.full },
    pctTxt: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      minWidth: 34,
      textAlign: 'right',
    },
    chip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radii.full,
      maxWidth: 110,
    },
    chipTxt: { fontSize: 11, fontWeight: '800' },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: Radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTxt: { color: colors.textFaint, fontSize: 13 },
  });
}

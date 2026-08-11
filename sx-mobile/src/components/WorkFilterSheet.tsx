/**
 * Bottom sheet bộ lọc tab Công việc — một trang cuộn (đồng nhất với Kanban/CRM).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { colorWithAlpha, Radii, Spacing, type AppColors } from '../theme';

export type WorkFilterOption = { id: string; label: string };
export type WorkStatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
export type WorkScopeFilter = 'team' | 'mine';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  search?: string;
  showScope: boolean;
  scope: WorkScopeFilter;
  onScopeChange: (id: WorkScopeFilter) => void;
  statusFilter: WorkStatusFilter;
  onStatusChange: (id: WorkStatusFilter) => void;
  showCompanyPicker: boolean;
  companyOptions: WorkFilterOption[];
  filterCompany: string;
  onCompanyChange: (id: string) => void;
  showAssignee: boolean;
  assigneeOptions: WorkFilterOption[];
  assigneeFilter: string;
  onAssigneeChange: (id: string) => void;
};

const STATUS_OPTS: {
  id: WorkStatusFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'all', label: 'Tất cả', icon: 'list-outline' },
  { id: 'pending', label: 'Chưa làm', icon: 'time-outline' },
  { id: 'in_progress', label: 'Đang làm', icon: 'play-outline' },
  { id: 'completed', label: 'Hoàn tất', icon: 'checkmark-circle-outline' },
  { id: 'overdue', label: 'Quá hạn', icon: 'alert-circle-outline' },
];

const SCOPE_OPTS: {
  id: WorkScopeFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'team', label: 'Đội', icon: 'people-outline' },
  { id: 'mine', label: 'Tôi', icon: 'person' },
];

const COLLAPSE_LIMIT = 6;

function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? colors.white : colors.textMuted}
          style={chipStyles.chipIcon}
        />
      ) : active ? (
        <Ionicons name="checkmark" size={12} color={colors.white} style={chipStyles.chipIcon} />
      ) : null}
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? colors.white : colors.text },
          active && chipStyles.chipTextActive,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FilterSection({
  title,
  subtitle,
  colors,
  children,
}: {
  title: string;
  subtitle?: string;
  colors: AppColors;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text
        style={{
          marginHorizontal: Spacing.lg,
          fontSize: 13,
          fontWeight: '800',
          color: colors.text,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            marginHorizontal: Spacing.lg,
            marginTop: 2,
            marginBottom: 8,
            fontSize: 11,
            fontWeight: '600',
            color: colors.textMuted,
          }}
        >
          {subtitle}
        </Text>
      ) : (
        <View style={{ height: 8 }} />
      )}
      {children}
    </View>
  );
}

function CollapsibleChips({
  options,
  selectedId,
  onChange,
  forceExpand,
  chipWrapStyle,
  moreBtnStyle,
  moreTxtColor,
}: {
  options: WorkFilterOption[];
  selectedId: string;
  onChange: (id: string) => void;
  forceExpand?: boolean;
  chipWrapStyle: object;
  moreBtnStyle: object;
  moreTxtColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const showAll = forceExpand || expanded || options.length <= COLLAPSE_LIMIT;
  const visible = showAll ? options : options.slice(0, COLLAPSE_LIMIT);
  const hiddenCount = options.length - COLLAPSE_LIMIT;

  return (
    <View>
      <View style={chipWrapStyle}>
        {visible.map((opt) => (
          <Chip
            key={opt.id || 'all'}
            label={opt.label}
            active={selectedId === opt.id}
            onPress={() => onChange(opt.id)}
          />
        ))}
      </View>
      {!forceExpand && options.length > COLLAPSE_LIMIT ? (
        <TouchableOpacity
          style={moreBtnStyle}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.75}
        >
          <Text style={{ color: moreTxtColor, fontSize: 12, fontWeight: '800' }}>
            {expanded ? 'Thu gọn' : `Xem thêm (${hiddenCount})`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={moreTxtColor}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function WorkFilterSheet({
  visible,
  onClose,
  onReset,
  search = '',
  showScope,
  scope,
  onScopeChange,
  statusFilter,
  onStatusChange,
  showCompanyPicker,
  companyOptions,
  filterCompany,
  onCompanyChange,
  showAssignee,
  assigneeOptions,
  assigneeFilter,
  onAssigneeChange,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);

  const filteredCompanies = useMemo(
    () => companyOptions.filter((o) => match(o.label)),
    [companyOptions, q],
  );
  const filteredAssignees = useMemo(
    () => assigneeOptions.filter((o) => match(o.label)),
    [assigneeOptions, q],
  );

  const showListSearch =
    companyOptions.length > 8 || assigneeOptions.length > 8;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '88%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
          overflow: 'hidden',
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          alignSelf: 'center',
          marginTop: 10,
          marginBottom: 6,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: Spacing.lg,
          paddingBottom: 10,
          gap: 8,
        },
        title: { color: colors.text, fontSize: 17, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
        searchBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.lg,
          marginBottom: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: Radii.md,
          backgroundColor: colorWithAlpha(colors.primary, 0.1),
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.22),
        },
        searchBannerTxt: { flex: 1, color: colors.primary, fontSize: 12, fontWeight: '700' },
        listSearch: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.lg,
          marginBottom: 10,
          paddingHorizontal: 12,
          height: 38,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },
        listSearchInput: { flex: 1, color: colors.text, fontSize: 13 },
        chipWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.lg,
        },
        moreBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          marginTop: 10,
          marginHorizontal: Spacing.lg,
          paddingVertical: 4,
        },
        footer: {
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        resetBtn: {
          flex: 1,
          height: 44,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        resetTxt: { color: colors.text, fontSize: 14, fontWeight: '800' },
        applyBtn: {
          flex: 1.4,
          height: 44,
          borderRadius: Radii.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        applyTxt: { color: colors.white, fontSize: 14, fontWeight: '800' },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Bộ lọc công việc</Text>
              <Text style={styles.subtitle}>
                {[
                  showScope ? 'Phạm vi' : null,
                  'Trạng thái',
                  showCompanyPicker ? 'Công ty' : null,
                  showAssignee ? 'Người nhận' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {search.trim() ? (
            <View style={styles.searchBanner}>
              <Ionicons name="search" size={14} color={colors.primary} />
              <Text style={styles.searchBannerTxt} numberOfLines={1}>
                Đang tìm: «{search.trim()}»
              </Text>
            </View>
          ) : null}

          {showListSearch ? (
            <View style={styles.listSearch}>
              <Ionicons name="search-outline" size={16} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm trong danh sách lọc…"
                placeholderTextColor={colors.textFaint}
                style={styles.listSearchInput}
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {showScope ? (
              <FilterSection title="Phạm vi" subtitle="Đội · công việc của tôi" colors={colors}>
                <View style={styles.chipWrap}>
                  {SCOPE_OPTS.map((opt) => (
                    <Chip
                      key={opt.id}
                      label={opt.label}
                      icon={opt.icon}
                      active={scope === opt.id}
                      onPress={() => onScopeChange(opt.id)}
                    />
                  ))}
                </View>
              </FilterSection>
            ) : null}

            <FilterSection title="Trạng thái" subtitle="Lọc theo tiến độ giao việc" colors={colors}>
              <View style={styles.chipWrap}>
                {STATUS_OPTS.map((opt) => (
                  <Chip
                    key={opt.id}
                    label={opt.label}
                    icon={opt.icon}
                    active={statusFilter === opt.id}
                    onPress={() => onStatusChange(opt.id)}
                  />
                ))}
              </View>
            </FilterSection>

            {showCompanyPicker && companyOptions.length > 0 ? (
              <FilterSection title="Công ty" subtitle="Phạm vi xưởng / công ty" colors={colors}>
                <CollapsibleChips
                  options={filteredCompanies}
                  selectedId={filterCompany}
                  onChange={onCompanyChange}
                  forceExpand={!!q}
                  chipWrapStyle={styles.chipWrap}
                  moreBtnStyle={styles.moreBtn}
                  moreTxtColor={colors.primary}
                />
              </FilterSection>
            ) : null}

            {showAssignee ? (
              <FilterSection title="Người nhận" subtitle="Lọc giao việc theo người" colors={colors}>
                <CollapsibleChips
                  options={filteredAssignees}
                  selectedId={assigneeFilter}
                  onChange={onAssigneeChange}
                  forceExpand={!!q}
                  chipWrapStyle={styles.chipWrap}
                  moreBtnStyle={styles.moreBtn}
                  moreTxtColor={colors.primary}
                />
              </FilterSection>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.85}>
              <Text style={styles.resetTxt}>Xóa lọc</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.applyTxt}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipIcon: { marginRight: 4 },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chipTextActive: { fontWeight: '800' },
});

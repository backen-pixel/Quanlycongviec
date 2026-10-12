/**
 * Bottom sheet bộ lọc SX — một trang cuộn (giống CRM), không tách tab.
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

export type FilterPickOption = { id: string; label: string; group?: string };
export type QuickFilterId = 'all' | 'mine' | 'overdue' | 'today';
export type PhoneFilterId = '' | 'has' | 'no';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  search?: string;
  quickFilter?: QuickFilterId;
  onQuickFilterChange?: (id: QuickFilterId) => void;
  filterPhone?: PhoneFilterId;
  onPhoneChange?: (id: PhoneFilterId) => void;
  /** Công tắc «Cột Chưa PL» (giống web) — gom dự án chưa có phân loại vào cột ảo riêng. */
  showOrphanColumn?: boolean;
  onShowOrphanColumnChange?: (next: boolean) => void;
  personOptions?: FilterPickOption[];
  filterPersonId?: string;
  onPersonChange?: (id: string) => void;
  showWorkshopPicker: boolean;
  workshopOptions: FilterPickOption[];
  filterCompany: string;
  onWorkshopChange: (id: string) => void;
  showDealCompanyPicker: boolean;
  dealCompanyOptions: FilterPickOption[];
  filterDealCompany: string;
  onDealCompanyChange: (id: string) => void;
  dealCompanyReadOnlyLabel?: string;
  workTypeOptions: FilterPickOption[];
  filterWorkTypeId: string;
  onWorkTypeChange: (id: string) => void;
};

const QUICK_OPTS: { id: QuickFilterId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Tất cả', icon: 'apps-outline' },
  { id: 'mine', label: 'Của tôi', icon: 'person' },
  { id: 'overdue', label: 'Quá hạn', icon: 'alert-circle-outline' },
  { id: 'today', label: 'Hôm nay', icon: 'today-outline' },
];

const PHONE_OPTS: { id: PhoneFilterId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'has', label: 'Có SĐT', icon: 'call' },
  { id: '', label: 'Tất cả', icon: 'apps-outline' },
  { id: 'no', label: 'Chưa có SĐT', icon: 'call-outline' },
];

function Chip({
  label,
  active,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: disabled ? 0.55 : 1,
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
      <Text style={{
        marginHorizontal: Spacing.lg,
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
      }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{
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

/** Thu gọn chip dài — mặc định hiện COLLAPSE_LIMIT, bấm «Xem thêm» để mở hết. */
const COLLAPSE_LIMIT = 6;

function CollapsibleChips({
  options,
  selectedId,
  onChange,
  forceExpand,
  chipWrapStyle,
  moreBtnStyle,
  moreTxtColor,
}: {
  options: FilterPickOption[];
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

export default function ProductionFilterSheet({
  visible,
  onClose,
  onReset,
  search = '',
  quickFilter = 'all',
  onQuickFilterChange,
  filterPhone = '',
  onPhoneChange,
  showOrphanColumn = false,
  onShowOrphanColumnChange,
  personOptions = [],
  filterPersonId = '',
  onPersonChange,
  showWorkshopPicker,
  workshopOptions,
  filterCompany,
  onWorkshopChange,
  showDealCompanyPicker,
  dealCompanyOptions,
  filterDealCompany,
  onDealCompanyChange,
  dealCompanyReadOnlyLabel,
  workTypeOptions,
  filterWorkTypeId,
  onWorkTypeChange,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);

  const filteredWorkshops = useMemo(
    () => workshopOptions.filter((o) => match(o.label)),
    [workshopOptions, q],
  );
  const filteredDeals = useMemo(
    () => dealCompanyOptions.filter((o) => match(o.label)),
    [dealCompanyOptions, q],
  );
  const filteredPersons = useMemo(
    () => personOptions.filter((o) => match(o.label)),
    [personOptions, q],
  );
  const filteredWorkTypes = useMemo(
    () => workTypeOptions.filter((o) => match(o.label)),
    [workTypeOptions, q],
  );

  const showListSearch =
    workshopOptions.length > 8
    || dealCompanyOptions.length > 8
    || personOptions.length > 8
    || workTypeOptions.length > 8;

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
        readOnly: {
          marginHorizontal: Spacing.lg,
          padding: Spacing.md,
          borderRadius: Radii.md,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.2),
        },
        readOnlyText: { color: colors.text, fontSize: 13, fontWeight: '600' },
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
        moreBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          marginTop: 10,
          marginHorizontal: Spacing.lg,
          paddingVertical: 4,
        },
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
              <Text style={styles.title}>Bộ lọc sản xuất</Text>
              <Text style={styles.subtitle}>
                Nhanh · SĐT · Xưởng · Đặt hàng · Phụ trách · Phân loại
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
            <FilterSection title="Lọc nhanh" subtitle="Của tôi · hạn xử lý" colors={colors}>
              <View style={styles.chipWrap}>
                {QUICK_OPTS.map((opt) => (
                  <Chip
                    key={opt.id}
                    label={opt.label}
                    icon={opt.icon}
                    active={quickFilter === opt.id}
                    onPress={() => onQuickFilterChange?.(opt.id)}
                  />
                ))}
              </View>
            </FilterSection>

            <FilterSection title="Số điện thoại" subtitle="Lọc theo SĐT khách hàng" colors={colors}>
              <View style={styles.chipWrap}>
                {PHONE_OPTS.map((opt) => (
                  <Chip
                    key={opt.id || 'all-phone'}
                    label={opt.label}
                    icon={opt.icon}
                    active={filterPhone === opt.id}
                    onPress={() => onPhoneChange?.(opt.id)}
                  />
                ))}
              </View>
            </FilterSection>

            {onShowOrphanColumnChange ? (
              <FilterSection
                title="Cột «Chưa PL»"
                subtitle="Gom dự án chưa phân loại vào một cột riêng"
                colors={colors}
              >
                <View style={styles.chipWrap}>
                  <Chip
                    label={showOrphanColumn ? 'Đang hiện cột Chưa PL' : 'Hiện cột «Chưa PL»'}
                    icon={showOrphanColumn ? 'checkbox' : 'square-outline'}
                    active={showOrphanColumn}
                    onPress={() => onShowOrphanColumnChange(!showOrphanColumn)}
                  />
                </View>
              </FilterSection>
            ) : null}

            {showWorkshopPicker && workshopOptions.length > 0 ? (
              <FilterSection
                title="Công ty sản xuất (xưởng)"
                subtitle="Phạm vi xưởng"
                colors={colors}
              >
                <CollapsibleChips
                  options={filteredWorkshops}
                  selectedId={filterCompany}
                  onChange={onWorkshopChange}
                  forceExpand={!!q}
                  chipWrapStyle={styles.chipWrap}
                  moreBtnStyle={styles.moreBtn}
                  moreTxtColor={colors.primary}
                />
              </FilterSection>
            ) : null}

            {showDealCompanyPicker ? (
              <FilterSection title="Công ty đặt hàng" colors={colors}>
                {dealCompanyReadOnlyLabel ? (
                  <View style={styles.readOnly}>
                    <Text style={styles.readOnlyText}>{dealCompanyReadOnlyLabel}</Text>
                  </View>
                ) : (
                  <CollapsibleChips
                    options={filteredDeals}
                    selectedId={filterDealCompany}
                    onChange={onDealCompanyChange}
                    forceExpand={!!q}
                    chipWrapStyle={styles.chipWrap}
                    moreBtnStyle={styles.moreBtn}
                    moreTxtColor={colors.primary}
                  />
                )}
              </FilterSection>
            ) : null}

            {personOptions.length > 0 ? (
              <FilterSection title="Người phụ trách SX" colors={colors}>
                <CollapsibleChips
                  options={filteredPersons}
                  selectedId={filterPersonId}
                  onChange={(id) => onPersonChange?.(id)}
                  forceExpand={!!q}
                  chipWrapStyle={styles.chipWrap}
                  moreBtnStyle={styles.moreBtn}
                  moreTxtColor={colors.primary}
                />
              </FilterSection>
            ) : null}

            <FilterSection
              title="Phân loại pipeline"
              subtitle="Loại sản xuất / chưa phân loại"
              colors={colors}
            >
              <CollapsibleChips
                options={filteredWorkTypes}
                selectedId={filterWorkTypeId}
                onChange={onWorkTypeChange}
                forceExpand={!!q}
                chipWrapStyle={styles.chipWrap}
                moreBtnStyle={styles.moreBtn}
                moreTxtColor={colors.primary}
              />
            </FilterSection>

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

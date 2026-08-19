/**
 * Bottom sheet bộ lọc Kanban VC — gọn, tab Phạm vi | Pipeline (đồng bộ web).
 * Chip chỉ sửa bản nháp; danh sách reload khi bấm Áp dụng.
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
import { colorWithAlpha, HIT_TARGET, Radii, Spacing } from '../theme';

export type FilterPickOption = { id: string; label: string; group?: string };

type TabId = 'scope' | 'pipeline';
export type QuickFilterId = 'all' | 'mine' | 'overdue' | 'today';
export type PhoneFilterId = '' | 'has' | 'no';

export type ProductionFilterValues = {
  quickFilter: QuickFilterId;
  filterPhone: PhoneFilterId;
  filterPersonId: string;
  filterPriority: string;
  filterCompany: string;
  filterDealCompany: string;
  filterRegion: string;
  filterWorkTypeId: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  onApply: (next: ProductionFilterValues) => void;
  initialTab?: TabId;
  quickFilter?: QuickFilterId;
  filterPhone?: PhoneFilterId;
  personOptions?: FilterPickOption[];
  filterPersonId?: string;
  filterPriority?: string;
  showWorkshopPicker: boolean;
  workshopOptions: FilterPickOption[];
  filterCompany: string;
  showDealCompanyPicker: boolean;
  dealCompanyOptions: FilterPickOption[];
  filterDealCompany: string;
  dealCompanyReadOnlyLabel?: string;
  regionOptions?: FilterPickOption[];
  filterRegion?: string;
  workTypeOptions: FilterPickOption[];
  filterWorkTypeId: string;
};

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
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
      {active ? (
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

const QUICK_FILTERS: { id: QuickFilterId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'mine', label: 'Của tôi' },
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'today', label: 'Hôm nay' },
];

const PHONE_FILTERS: { id: PhoneFilterId; label: string }[] = [
  { id: '', label: 'Tất cả SĐT' },
  { id: 'has', label: 'Có SĐT' },
  { id: 'no', label: 'Chưa có SĐT' },
];

const PRIORITY_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Tất cả ưu tiên' },
  { id: 'urgent', label: 'Gấp' },
  { id: 'high', label: 'Cao' },
  { id: 'medium', label: 'TB' },
  { id: 'low', label: 'Thấp' },
];

function emptyDraft(company: string): ProductionFilterValues {
  return {
    quickFilter: 'all',
    filterPhone: '',
    filterPersonId: '',
    filterPriority: '',
    filterCompany: company,
    filterDealCompany: '',
    filterRegion: '',
    filterWorkTypeId: '',
  };
}

export default function ProductionFilterSheet({
  visible,
  onClose,
  onReset,
  onApply,
  initialTab = 'scope',
  quickFilter = 'all',
  filterPhone = '',
  personOptions = [],
  filterPersonId = '',
  filterPriority = '',
  showWorkshopPicker,
  workshopOptions,
  filterCompany,
  showDealCompanyPicker,
  dealCompanyOptions,
  filterDealCompany,
  dealCompanyReadOnlyLabel,
  regionOptions = [],
  filterRegion = '',
  workTypeOptions,
  filterWorkTypeId,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const showScopeTab = showWorkshopPicker || showDealCompanyPicker || regionOptions.length > 0
    || personOptions.length > 0;
  const [tab, setTab] = useState<TabId>(showScopeTab ? initialTab : 'pipeline');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ProductionFilterValues>(() => ({
    quickFilter,
    filterPhone,
    filterPersonId,
    filterPriority,
    filterCompany,
    filterDealCompany,
    filterRegion,
    filterWorkTypeId,
  }));

  useEffect(() => {
    if (!visible) return;
    setTab(showScopeTab ? initialTab : 'pipeline');
    setQuery('');
    setDraft({
      quickFilter,
      filterPhone,
      filterPersonId,
      filterPriority,
      filterCompany,
      filterDealCompany,
      filterRegion,
      filterWorkTypeId,
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- hydrate once when opening

  const scopeCount = useMemo(() => {
    let n = 0;
    if (draft.filterCompany) n += 1;
    if (draft.filterDealCompany) n += 1;
    if (draft.filterRegion) n += 1;
    if (draft.filterPersonId) n += 1;
    if (draft.filterPhone) n += 1;
    return n;
  }, [draft]);

  const pipelineCount = (draft.filterWorkTypeId ? 1 : 0) + (draft.filterPriority ? 1 : 0);

  const filterOptions = (opts: FilterPickOption[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return opts;
    return opts.filter((o) => o.label.toLowerCase().includes(q));
  };

  const searchPlaceholder =
    tab === 'pipeline'
      ? 'Tìm phân loại…'
      : regionOptions.length && !showWorkshopPicker
        ? 'Tìm khu vực…'
        : 'Tìm công ty / khu vực…';

  const themed = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '78%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
          overflow: 'hidden',
        },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colorWithAlpha(colors.primary, 0.06),
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          alignSelf: 'center',
          marginBottom: 10,
        },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        iconWrap: {
          width: 32,
          height: 32,
          borderRadius: Radii.md,
          backgroundColor: colorWithAlpha(colors.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        },
        resetBtn: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.full,
          backgroundColor: colorWithAlpha(colors.primary, 0.1),
        },
        resetText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        tabRow: {
          flexDirection: 'row',
          marginTop: 10,
          padding: 3,
          borderRadius: Radii.lg,
          backgroundColor: colorWithAlpha(colors.primary, 0.08),
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.15),
        },
        tabBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingVertical: 8,
          borderRadius: Radii.md,
        },
        tabBtnActive: {
          backgroundColor: colors.bgElevated,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        },
        tabText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
        tabTextActive: { color: colors.primary },
        tabBadge: {
          minWidth: 16,
          height: 16,
          paddingHorizontal: 4,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colorWithAlpha(colors.primary, 0.2),
        },
        tabBadgeActive: { backgroundColor: colors.primary },
        tabBadgeText: { fontSize: 9, fontWeight: '800', color: colors.primary },
        tabBadgeTextActive: { color: colors.white },
        searchBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.md,
          marginBottom: 4,
          paddingHorizontal: 12,
          height: 38,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },
        searchInput: { flex: 1, color: colors.text, fontSize: 13 },
        sectionLabel: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.sm,
          marginBottom: 6,
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          color: colors.textMuted,
          textTransform: 'uppercase',
        },
        readOnly: {
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.sm,
          padding: Spacing.md,
          borderRadius: Radii.md,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.2),
        },
        readOnlyText: { color: colors.text, fontSize: 13, fontWeight: '600' },
        chipWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        applyBtn: {
          height: 44,
          borderRadius: Radii.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        applyText: { color: colors.white, fontSize: 14, fontWeight: '800' },
      }),
    [colors],
  );

  const patchDraft = (partial: Partial<ProductionFilterValues>) => {
    setDraft((d) => ({ ...d, ...partial }));
  };

  const renderScope = () => (
    <>
      {showWorkshopPicker && workshopOptions.length > 0 ? (
        <>
          <Text style={themed.sectionLabel}>Công ty lắp đặt</Text>
          <View style={themed.chipWrap}>
            {filterOptions(workshopOptions).map((opt) => (
              <Chip
                key={`ws-${opt.id || 'all'}`}
                label={opt.label}
                active={draft.filterCompany === opt.id}
                onPress={() => {
                  const changed = opt.id !== draft.filterCompany;
                  patchDraft({
                    filterCompany: opt.id,
                    ...(changed
                      ? { filterWorkTypeId: '', filterRegion: '', filterPersonId: '' }
                      : {}),
                  });
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {showDealCompanyPicker ? (
        <>
          <Text style={themed.sectionLabel}>Công ty đặt hàng</Text>
          {dealCompanyReadOnlyLabel ? (
            <View style={themed.readOnly}>
              <Text style={themed.readOnlyText}>{dealCompanyReadOnlyLabel}</Text>
            </View>
          ) : (
            <View style={themed.chipWrap}>
              {filterOptions(dealCompanyOptions).map((opt) => (
                <Chip
                  key={`dc-${opt.id || 'all'}`}
                  label={opt.label}
                  active={draft.filterDealCompany === opt.id}
                  onPress={() => {
                    const changed = opt.id !== draft.filterDealCompany;
                    patchDraft({
                      filterDealCompany: opt.id,
                      ...(changed ? { filterWorkTypeId: '' } : {}),
                    });
                  }}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

      {regionOptions.length > 0 ? (
        <>
          <Text style={themed.sectionLabel}>Khu vực</Text>
          <View style={themed.chipWrap}>
            {filterOptions(regionOptions).map((opt) => (
              <Chip
                key={`rg-${opt.id || 'all'}`}
                label={opt.label}
                active={draft.filterRegion === opt.id}
                onPress={() => patchDraft({ filterRegion: opt.id })}
              />
            ))}
          </View>
        </>
      ) : null}

      {personOptions.length > 0 ? (
        <>
          <Text style={themed.sectionLabel}>NV phụ trách VC/LĐ</Text>
          <View style={themed.chipWrap}>
            {filterOptions(personOptions).map((opt) => (
              <Chip
                key={`ps-${opt.id || 'all'}`}
                label={opt.label}
                active={draft.filterPersonId === opt.id}
                onPress={() => patchDraft({ filterPersonId: opt.id })}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={themed.sectionLabel}>Số điện thoại KH</Text>
      <View style={themed.chipWrap}>
        {PHONE_FILTERS.map((opt) => (
          <Chip
            key={`ph-${opt.id || 'all'}`}
            label={opt.label}
            active={draft.filterPhone === opt.id}
            onPress={() => patchDraft({ filterPhone: opt.id })}
          />
        ))}
      </View>
    </>
  );

  const renderPipeline = () => (
    <>
      <Text style={themed.sectionLabel}>Phân loại pipeline</Text>
      <View style={themed.chipWrap}>
        {filterOptions(workTypeOptions).map((opt) => (
          <Chip
            key={`wt-${opt.id || 'all'}`}
            label={opt.label}
            active={draft.filterWorkTypeId === opt.id}
            onPress={() => patchDraft({ filterWorkTypeId: opt.id })}
          />
        ))}
      </View>
      <Text style={themed.sectionLabel}>Ưu tiên</Text>
      <View style={themed.chipWrap}>
        {PRIORITY_FILTERS.map((opt) => (
          <Chip
            key={`pr-${opt.id || 'all'}`}
            label={opt.label}
            active={draft.filterPriority === opt.id}
            onPress={() => patchDraft({ filterPriority: opt.id })}
          />
        ))}
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={themed.backdrop} onPress={onClose}>
        <Pressable
          style={[themed.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          <View style={themed.header}>
            <View style={themed.handle} />
            <View style={themed.titleRow}>
              <View style={themed.iconWrap}>
                <Ionicons name="options-outline" size={18} color={colors.primary} />
              </View>
              <Text style={themed.title}>Bộ lọc vận chuyển</Text>
              <TouchableOpacity
                onPress={() => {
                  setDraft(emptyDraft(showWorkshopPicker ? '' : filterCompany));
                  onReset();
                }}
                style={themed.resetBtn}
              >
                <Text style={themed.resetText}>Xóa lọc</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={themed.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {showScopeTab ? (
              <View style={themed.tabRow}>
                <TouchableOpacity
                  style={[themed.tabBtn, tab === 'scope' && themed.tabBtnActive]}
                  onPress={() => { setTab('scope'); setQuery(''); }}
                >
                  <Ionicons
                    name="business-outline"
                    size={14}
                    color={tab === 'scope' ? colors.primary : colors.textMuted}
                  />
                  <Text style={[themed.tabText, tab === 'scope' && themed.tabTextActive]}>Phạm vi</Text>
                  {scopeCount > 0 ? (
                    <View style={[themed.tabBadge, tab === 'scope' && themed.tabBadgeActive]}>
                      <Text style={[themed.tabBadgeText, tab === 'scope' && themed.tabBadgeTextActive]}>
                        {scopeCount}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[themed.tabBtn, tab === 'pipeline' && themed.tabBtnActive]}
                  onPress={() => { setTab('pipeline'); setQuery(''); }}
                >
                  <Ionicons
                    name="layers-outline"
                    size={14}
                    color={tab === 'pipeline' ? colors.primary : colors.textMuted}
                  />
                  <Text style={[themed.tabText, tab === 'pipeline' && themed.tabTextActive]}>Pipeline</Text>
                  {pipelineCount > 0 ? (
                    <View style={[themed.tabBadge, tab === 'pipeline' && themed.tabBadgeActive]}>
                      <Text style={[themed.tabBadgeText, tab === 'pipeline' && themed.tabBadgeTextActive]}>
                        {pipelineCount}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={themed.sectionLabel}>Lọc nhanh</Text>
            <View style={themed.chipWrap}>
              {QUICK_FILTERS.map((opt) => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  active={draft.quickFilter === opt.id}
                  onPress={() => patchDraft({ quickFilter: opt.id })}
                />
              ))}
            </View>

            {(showScopeTab || tab === 'pipeline') && (
              <View style={themed.searchBox}>
                <Ionicons name="search-outline" size={16} color={colors.textFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.textFaint}
                  style={themed.searchInput}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {showScopeTab ? (tab === 'scope' ? renderScope() : renderPipeline()) : renderPipeline()}
          </ScrollView>

          <View style={themed.footer}>
            <TouchableOpacity
              style={themed.applyBtn}
              onPress={() => onApply(draft)}
              activeOpacity={0.85}
            >
              <Text style={themed.applyText}>Áp dụng</Text>
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

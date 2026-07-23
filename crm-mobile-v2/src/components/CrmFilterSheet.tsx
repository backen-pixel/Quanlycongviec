import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CrmCompany, CrmDepartment, CrmEmployee, CrmRegion } from '../api/crmMeta';
import {
  DEFAULT_CRM_FILTERS,
  REGION_NONE,
  type AssigneeFilter,
  type CrmHubFilters,
  type DueFilter,
  type PhoneFilter,
  type TimePreset,
} from '../lib/crmFilters';
import { Radii, useColors, type ThemeColors } from '../theme';

type Props = {
  visible: boolean;
  mode: 'leads' | 'deals' | 'orders';
  filters: CrmHubFilters;
  search: string;
  companies: CrmCompany[];
  regions: CrmRegion[];
  departments: CrmDepartment[];
  employees: CrmEmployee[];
  metaLoading: boolean;
  /** Nhân viên thường: khóa lọc Công ty + Người phụ trách (không cho đổi). */
  lockScope?: boolean;
  /** Hiện Gộp/Tách khi pipeline có cột sau Thắng. */
  showDealOrderSplit?: boolean;
  dealKhSplitEnabled?: boolean;
  onDealKhSplitChange?: (enabled: boolean) => void;
  onApply: (filters: CrmHubFilters) => void;
  onCompanyChange: (companyId: string) => void;
  onClose: () => void;
};

type Option<T extends string> = { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap; hint?: string };

const PHONE_OPTS: Option<PhoneFilter>[] = [
  { value: 'has_phone', label: 'Có SĐT', icon: 'call' },
  { value: '', label: 'Tất cả', icon: 'apps-outline' },
  { value: 'no_phone', label: 'Chưa có SĐT', icon: 'call-outline' },
];

const ASSIGNEE_OPTS: Option<AssigneeFilter>[] = [
  { value: 'all', label: 'Tất cả', icon: 'people-outline' },
  { value: 'mine', label: 'Của tôi', icon: 'person' },
];

const DUE_OPTS: Option<DueFilter>[] = [
  { value: 'all', label: 'Tất cả', icon: 'calendar-outline' },
  { value: 'overdue', label: 'Quá hạn', icon: 'alert-circle-outline' },
  { value: 'today', label: 'Hôm nay', icon: 'today-outline' },
];

const TIME_OPTS: Option<TimePreset>[] = [
  { value: '', label: 'Mọi thời điểm', icon: 'time-outline' },
  { value: 'this_week', label: 'Tuần này', icon: 'calendar' },
  { value: 'this_month', label: 'Tháng này', icon: 'calendar-number-outline' },
];

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  accent,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent: string;
  disabled?: boolean;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value || 'all'}
            disabled={disabled}
            style={[
              styles.miniChip,
              active && { backgroundColor: accent + '22', borderColor: accent },
              disabled && !active && styles.miniChipDisabled,
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.miniChipTxt, active && { color: accent }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function FilterSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export default function CrmFilterSheet({
  visible,
  mode,
  filters,
  search,
  companies,
  regions,
  departments,
  employees,
  metaLoading,
  lockScope = false,
  showDealOrderSplit = false,
  dealKhSplitEnabled = true,
  onDealKhSplitChange,
  onApply,
  onCompanyChange,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const accent = mode === 'leads' ? Colors.blue : (mode === 'orders' ? Colors.purple : Colors.orange);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const patch = (p: Partial<CrmHubFilters>) => setDraft((d) => ({ ...d, ...p }));

  const companyRows = useMemo(
    () => [{ id: '', name: 'Tất cả công ty' }, ...companies],
    [companies],
  );
  const regionRows = useMemo(
    () => [
      { id: '', name: 'Tất cả khu vực' },
      { id: REGION_NONE, name: 'Chưa gán khu vực' },
      ...regions,
    ],
    [regions],
  );

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (draft.departmentId) {
      list = list.filter((u) => u.department_id === draft.departmentId);
    }
    if (draft.regionId && draft.regionId !== REGION_NONE) {
      list = list.filter((u) => (u.crm_region_ids || []).includes(draft.regionId));
    }
    return list;
  }, [employees, draft.departmentId, draft.regionId]);

  const handleCompany = (companyId: string) => {
    if (lockScope) return;
    patch({ companyId, regionId: '', departmentId: '', assigneeUserId: '', assignee: 'all' });
    onCompanyChange(companyId);
  };

  const pickEmployee = (user: CrmEmployee) => {
    patch({
      assignee: 'user',
      assigneeUserId: user.id,
      departmentId: user.department_id || draft.departmentId,
    });
  };

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
              <Text style={styles.title}>
                Bộ lọc {mode === 'leads' ? 'Leads' : mode === 'orders' ? 'Đơn hàng' : 'Deals'}
              </Text>
              <Text style={styles.subtitle}>Công ty · Khu vực · NV · giai đoạn · SĐT</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {search.trim() ? (
            <View style={styles.searchBanner}>
              <Ionicons name="search" size={14} color={Colors.cyan} />
              <Text style={styles.searchBannerTxt} numberOfLines={1}>Đang tìm: «{search.trim()}»</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <FilterSection
              title="Công ty"
              subtitle={lockScope ? 'Đã khóa theo tài khoản của bạn' : 'Lọc qua API theo company_id'}
            >
              {metaLoading && !companies.length ? (
                <ActivityIndicator color={accent} style={{ marginVertical: 8 }} />
              ) : (
                <ChipRow
                  options={companyRows.map((c) => ({ value: c.id, label: c.name }))}
                  value={draft.companyId}
                  onChange={handleCompany}
                  accent={accent}
                  disabled={lockScope}
                />
              )}
              {lockScope ? (
                <View style={styles.lockHint}>
                  <Ionicons name="lock-closed" size={13} color={Colors.textFaint} />
                  <Text style={styles.lockHintTxt}>Bạn chỉ xem dữ liệu trong công ty của mình.</Text>
                </View>
              ) : null}
            </FilterSection>

            <FilterSection title="Khu vực" subtitle="Lọc trên danh sách cột (region_id)">
              <ChipRow
                options={regionRows.map((r) => ({ value: r.id, label: r.name }))}
                value={draft.regionId}
                onChange={(v) => patch({ regionId: v })}
                accent={accent}
              />
            </FilterSection>

            <FilterSection
              title="Người phụ trách"
              subtitle={lockScope ? 'Đã khóa: chỉ xem bản ghi của bạn' : 'Chọn phòng ban → chọn nhân viên'}
            >
              <ChipRow
                options={
                  lockScope
                    ? [{ value: 'mine' as AssigneeFilter, label: 'Của tôi' }]
                    : ASSIGNEE_OPTS.map((o) => ({ value: o.value, label: o.label }))
                }
                value={lockScope ? 'mine' : draft.assignee === 'user' ? 'all' : draft.assignee}
                onChange={(v) => patch({ assignee: v, assigneeUserId: '' })}
                accent={accent}
                disabled={lockScope}
              />
              {lockScope ? (
                <View style={styles.lockHint}>
                  <Ionicons name="lock-closed" size={13} color={Colors.textFaint} />
                  <Text style={styles.lockHintTxt}>Không thể đổi người phụ trách.</Text>
                </View>
              ) : null}
              {!lockScope && departments.length > 0 ? (
                <>
                  <Text style={styles.subLbl}>Phòng ban</Text>
                  <ChipRow
                    options={[{ value: '', label: 'Tất cả PB' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                    value={draft.departmentId}
                    onChange={(v) => patch({ departmentId: v, assigneeUserId: '', assignee: draft.assignee === 'user' ? 'all' : draft.assignee })}
                    accent={accent}
                  />
                </>
              ) : null}
              {lockScope ? null : metaLoading && !employees.length ? (
                <ActivityIndicator color={accent} style={{ marginTop: 8 }} />
              ) : filteredEmployees.length > 0 ? (
                <View style={styles.userList}>
                  {filteredEmployees.slice(0, 40).map((u) => {
                    const active = draft.assigneeUserId === u.id;
                    const dept = departments.find((d) => d.id === u.department_id);
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.userRow, active && { borderColor: accent, backgroundColor: accent + '15' }]}
                        onPress={() => pickEmployee(u)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userName} numberOfLines={1}>{u.full_name || u.email || '—'}</Text>
                          {dept ? <Text style={styles.userDept} numberOfLines={1}>{dept.name}</Text> : null}
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={18} color={accent} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyHint}>Chọn công ty để xem danh sách nhân viên theo phòng ban.</Text>
              )}
            </FilterSection>

            <FilterSection title="Hiển thị đặc biệt">
              <TouchableOpacity
                style={[styles.toggleRow, draft.showOrphan && { borderColor: accent, backgroundColor: accent + '15' }]}
                onPress={() => patch({ showOrphan: !draft.showOrphan })}
              >
                <Ionicons name="albums-outline" size={18} color={draft.showOrphan ? accent : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Chưa có giai đoạn</Text>
                  <Text style={styles.toggleSub}>Thêm cột ảo cho {mode === 'leads' ? 'lead' : 'deal'} lệch stage / trống stage</Text>
                </View>
                <Ionicons
                  name={draft.showOrphan ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={draft.showOrphan ? accent : Colors.textFaint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleRow, draft.hideEmptyStages && { borderColor: accent, backgroundColor: accent + '15' }]}
                onPress={() => patch({ hideEmptyStages: !draft.hideEmptyStages })}
              >
                <Ionicons name="eye-off-outline" size={18} color={draft.hideEmptyStages ? accent : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Ẩn cột trống</Text>
                  <Text style={styles.toggleSub}>Chỉ hiện giai đoạn có dữ liệu (giảm cột trên mobile)</Text>
                </View>
                <Ionicons
                  name={draft.hideEmptyStages ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={draft.hideEmptyStages ? accent : Colors.textFaint}
                />
              </TouchableOpacity>
            </FilterSection>

            <FilterSection title="Số điện thoại">
              <View style={styles.optionGrid}>
                {PHONE_OPTS.map((opt) => {
                  const active = draft.phone === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value || 'all'}
                      style={[styles.option, active && { backgroundColor: accent + '22', borderColor: accent }]}
                      onPress={() => patch({ phone: opt.value })}
                    >
                      {opt.icon ? <Ionicons name={opt.icon} size={15} color={active ? accent : Colors.textMuted} /> : null}
                      <Text style={[styles.optionLabel, active && { color: accent }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FilterSection>

            <FilterSection title="Hạn xử lý" subtitle="Lọc trên cột đang xem">
              <ChipRow
                options={DUE_OPTS.map((o) => ({ value: o.value, label: o.label }))}
                value={draft.due}
                onChange={(v) => patch({ due: v })}
                accent={accent}
              />
            </FilterSection>

            <FilterSection title="Ngày tạo">
              <ChipRow
                options={TIME_OPTS.map((o) => ({ value: o.value, label: o.label }))}
                value={draft.timePreset}
                onChange={(v) => patch({ timePreset: v })}
                accent={accent}
              />
            </FilterSection>

            {showDealOrderSplit && onDealKhSplitChange ? (
              <FilterSection title="Tab Deal / Đơn hàng">
                <Text style={styles.splitHint}>
                  Gộp: một tab Deal toàn pipeline. Tách: Deal riêng + tab ĐH (Thắng & sau Thắng).
                </Text>
                <View style={styles.splitRow}>
                  <Pressable
                    style={[
                      styles.splitBtn,
                      !dealKhSplitEnabled && { backgroundColor: Colors.green + '22', borderColor: Colors.green },
                    ]}
                    onPress={() => onDealKhSplitChange(false)}
                  >
                    <Text style={[styles.splitBtnTxt, !dealKhSplitEnabled && { color: Colors.green }]}>Gộp</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.splitBtn,
                      dealKhSplitEnabled && { backgroundColor: Colors.cyan + '22', borderColor: Colors.cyan },
                    ]}
                    onPress={() => onDealKhSplitChange(true)}
                  >
                    <Text style={[styles.splitBtnTxt, dealKhSplitEnabled && { color: Colors.cyan }]}>Tách ĐH</Text>
                  </Pressable>
                </View>
              </FilterSection>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() =>
                setDraft(
                  lockScope
                    ? { ...DEFAULT_CRM_FILTERS, companyId: draft.companyId, assignee: 'mine', assigneeUserId: '' }
                    : { ...DEFAULT_CRM_FILTERS },
                )
              }
            >
              <Text style={styles.resetTxt}>Đặt lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: accent }]}
              onPress={() => { onApply(draft); onClose(); }}
            >
              <Text style={styles.applyTxt}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '900' },
  subtitle: { color: Colors.textFaint, fontSize: 12, marginTop: 3, fontWeight: '600' },
  searchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.sm,
    backgroundColor: Colors.blueSoft,
    borderWidth: 1,
    borderColor: Colors.blue + '44',
  },
  searchBannerTxt: { flex: 1, color: Colors.cyan, fontSize: 13, fontWeight: '700' },
  scroll: { paddingHorizontal: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  sectionSub: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 8 },
  splitHint: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 10, lineHeight: 16 },
  splitRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
  },
  splitBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  splitBtnTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '800' },
  subLbl: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  hScroll: { marginBottom: 4 },
  miniChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    maxWidth: 180,
  },
  miniChipDisabled: { opacity: 0.45 },
  lockHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  lockHintTxt: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', flex: 1 },
  miniChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  userList: { marginTop: 8, gap: 6 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  userName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  userDept: { color: Colors.textFaint, fontSize: 11, marginTop: 2, fontWeight: '600' },
  emptyHint: { color: Colors.textFaint, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  toggleTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  toggleSub: { color: Colors.textFaint, fontSize: 11, marginTop: 2, fontWeight: '600' },
  optionGrid: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionLabel: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resetBtn: {
    flex: 1,
    height: 46,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetTxt: { color: Colors.textMuted, fontWeight: '800', fontSize: 14 },
  applyBtn: {
    flex: 2,
    height: 46,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchOrgOverviewReport,
  type EmployeeReportQuery,
  type EmployeeReportRow,
  type OrgOverviewReport,
} from '../api/employeeReport';
import {
  applyCrmHubSnapshotToReport,
  fetchCrmReportHubSnapshot,
} from '../lib/crmReportHubSync';
import { fetchCrmCompanies, fetchCrmCompanyRegions } from '../api/crm';
import { formatApiError } from '../api/client';
import EmployeeReportCard from '../components/reports/EmployeeReportCard';
import ReportFilterModal, { ReportDateRangeBar } from '../components/reports/ReportFilterModal';
import ReportOverviewTab from '../components/reports/ReportOverviewTab';
import ReportPerformanceTab from '../components/reports/ReportPerformanceTab';
import ReportPipelineTab from '../components/reports/ReportPipelineTab';
import ReportTabBar, { type ReportTabId } from '../components/reports/ReportTabBar';
import { useAuth } from '../context/AuthContext';
import { canViewEmployeeReport } from '../lib/employeeReportAccess';
import {
  defaultMonthRange,
  getReportRangeForPreset,
  shiftReportRange,
  type ReportPeriodPreset,
} from '../lib/reportFormat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TypeView = 'all' | 'lead' | 'deal';

const TYPE_OPTIONS: { key: TypeView; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'lead', label: 'Lead' },
  { key: 'deal', label: 'Deal' },
];

function isAdminLike(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'sales_admin';
}

function isSystemAdmin(user: { role?: string | null; company_id?: string | null } | null): boolean {
  return String(user?.role || '').trim().toLowerCase() === 'admin' && !user?.company_id;
}

export default function EmployeeReportScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const allowed = canViewEmployeeReport(user?.role);

  const lockedCompanyId = !isAdminLike(user?.role) && user?.company_id
    ? String(user.company_id)
    : null;
  const showCompanyPicker = isAdminLike(user?.role);

  const [range, setRange] = useState(defaultMonthRange);
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>('month');
  const [typeView, setTypeView] = useState<TypeView>('all');
  const [activeTab, setActiveTab] = useState<ReportTabId>('overview');
  const [companyId, setCompanyId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<OrgOverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);

  const applyPeriodFilter = useCallback((preset: ReportPeriodPreset, nextRange: { from: string; to: string }) => {
    setPeriodPreset(preset);
    setRange(nextRange);
  }, []);

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  const effectiveCompanyId = useMemo(() => {
    if (lockedCompanyId) return lockedCompanyId;
    if (companyId) return companyId;
    if (user?.company_id && !isSystemAdmin(user)) return String(user.company_id);
    return '';
  }, [lockedCompanyId, companyId, user]);

  const query: EmployeeReportQuery = useMemo(() => ({
    date_from: range.from,
    date_to: range.to,
    type: typeView,
    ...(effectiveCompanyId ? { company_id: effectiveCompanyId } : {}),
    ...(regionId ? { region_id: regionId } : {}),
  }), [range.from, range.to, typeView, effectiveCompanyId, regionId]);

  useEffect(() => {
    if (!showCompanyPicker) return;
    void fetchCrmCompanies()
      .then((list) => setCompanies(list.map((c) => ({ id: c.id, name: c.shortName || c.name }))))
      .catch(() => setCompanies([]));
  }, [showCompanyPicker]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setRegions([]);
      return;
    }
    const ac = new AbortController();
    void fetchCrmCompanyRegions(effectiveCompanyId, null, ac.signal)
      .then((list) => setRegions(list))
      .catch(() => setRegions([]));
    return () => ac.abort();
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!regionId) return;
    const ok = regions.some((r) => r.id === regionId);
    if (!ok) setRegionId('');
  }, [regions, regionId]);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!allowed) return;
    if (opts?.refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const typeView = query.type || 'all';
      const orgReport = await fetchOrgOverviewReport(query);
      if (typeView === 'lead') {
        setReport(orgReport);
        return;
      }
      const hubSnap = await fetchCrmReportHubSnapshot(query);
      let prevSnap = null;
      if (orgReport.period_previous?.date_from && orgReport.period_previous?.date_to) {
        prevSnap = await fetchCrmReportHubSnapshot({
          ...query,
          date_from: orgReport.period_previous.date_from,
          date_to: orgReport.period_previous.date_to,
        });
      }
      setReport(applyCrmHubSnapshotToReport(orgReport, hubSnap, typeView, prevSnap));
    } catch (e) {
      setError(formatApiError(e));
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const companyLabel = useMemo(() => {
    if (!effectiveCompanyId) return isSystemAdmin(user) ? 'Tất cả công ty' : 'Chọn công ty';
    const found = companies.find((c) => c.id === effectiveCompanyId);
    if (found) return found.name;
    if (lockedCompanyId) return 'Công ty của bạn';
    return 'Đã chọn';
  }, [effectiveCompanyId, companies, lockedCompanyId, user]);

  const regionLabel = useMemo(() => {
    if (!regionId) return 'Tất cả khu vực';
    return regions.find((r) => r.id === regionId)?.name || 'Đã chọn';
  }, [regionId, regions]);

  const filteredEmployees = useMemo(() => {
    const rows = report?.by_employee || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.full_name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const dept = (r.department_name || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q);
    });
  }, [report?.by_employee, search]);

  const openDetail = (row: EmployeeReportRow) => {
    if (!row.user_id) return;
    setEmployeeModalOpen(false);
    navigation.navigate('EmployeeReportDetail', {
      userId: row.user_id,
      fullName: row.full_name,
      avatar: row.avatar || null,
      departmentName: row.department_name || null,
      dateFrom: query.date_from,
      dateTo: query.date_to,
      typeView,
      companyId: effectiveCompanyId || undefined,
      regionId: regionId || undefined,
    });
  };

  const renderTabContent = () => {
    if (!report) return null;
    if (activeTab === 'overview') return <ReportOverviewTab report={report} />;
    if (activeTab === 'performance') {
      return (
        <ReportPerformanceTab
          report={report}
          onEmployeePress={openDetail}
          onViewAllEmployees={() => setEmployeeModalOpen(true)}
        />
      );
    }
    return <ReportPipelineTab report={report} />;
  };

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Header
          onMenu={() => navigation.goBack()}
          onFilter={() => setFilterOpen(true)}
          Colors={Colors}
          styles={styles}
        />
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.textFaint} />
          <Text style={styles.deniedTitle}>Không có quyền xem</Text>
          <Text style={styles.deniedText}>Báo cáo CRM chỉ dành cho quản lý / giám đốc.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header
        onMenu={() => navigation.goBack()}
        onFilter={() => setFilterOpen(true)}
        Colors={Colors}
        styles={styles}
      />

      <View style={{ paddingHorizontal: 16 }}>
        <ReportDateRangeBar
          preset={periodPreset}
          from={range.from}
          to={range.to}
          onShift={(delta) => setRange((r) => shiftReportRange(periodPreset, r.from, r.to, delta))}
          onOpenFilter={() => setFilterOpen(true)}
        />
      </View>

      {loading && !refreshing && !report ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.purple} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.purple} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.chips}>
            {TYPE_OPTIONS.map((opt) => {
              const active = typeView === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTypeView(opt.key)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {(showCompanyPicker || effectiveCompanyId) ? (
            <View style={styles.filterRow}>
              {showCompanyPicker ? (
                <Pressable style={styles.filterBtn} onPress={() => setCompanyPickerOpen(true)}>
                  <Ionicons name="business-outline" size={14} color={Colors.purple} />
                  <Text style={styles.filterBtnText} numberOfLines={1}>{companyLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textFaint} />
                </Pressable>
              ) : lockedCompanyId ? (
                <View style={[styles.filterBtn, styles.filterBtnLocked]}>
                  <Ionicons name="business-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.filterBtnTextMuted} numberOfLines={1}>{companyLabel}</Text>
                </View>
              ) : null}

              {effectiveCompanyId ? (
                <Pressable style={styles.filterBtn} onPress={() => setRegionPickerOpen(true)}>
                  <Ionicons name="location-outline" size={14} color={Colors.purple} />
                  <Text style={styles.filterBtnText} numberOfLines={1}>{regionLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <ReportTabBar value={activeTab} onChange={setActiveTab} />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}><Text style={styles.retry}>Thử lại</Text></Pressable>
            </View>
          ) : null}

          <View style={styles.tabBody}>
            {renderTabContent()}
          </View>
        </ScrollView>
      )}

      <ReportFilterModal
        visible={filterOpen}
        preset={periodPreset}
        from={range.from}
        to={range.to}
        onClose={() => setFilterOpen(false)}
        onApply={applyPeriodFilter}
        bottomInset={insets.bottom}
      />

      <PickerModal
        visible={companyPickerOpen}
        title="Chọn công ty"
        items={(isSystemAdmin(user) ? [{ id: '', name: 'Tất cả công ty' }] : []).concat(companies)}
        selectedId={companyId}
        onSelect={(id) => {
          setCompanyId(id);
          setRegionId('');
          setCompanyPickerOpen(false);
        }}
        onClose={() => setCompanyPickerOpen(false)}
        insets={insets}
        Colors={Colors}
        styles={styles}
      />

      <PickerModal
        visible={regionPickerOpen}
        title="Chọn khu vực"
        items={[{ id: '', name: 'Tất cả khu vực' }, ...regions]}
        selectedId={regionId}
        onSelect={(id) => {
          setRegionId(id);
          setRegionPickerOpen(false);
        }}
        onClose={() => setRegionPickerOpen(false)}
        insets={insets}
        Colors={Colors}
        styles={styles}
      />

      <Modal visible={employeeModalOpen} transparent animationType="slide" onRequestClose={() => setEmployeeModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.employeeSheet, { paddingBottom: insets.bottom + 12, maxHeight: '88%' }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Nhân viên</Text>
              <Pressable onPress={() => setEmployeeModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={Colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tên, email, phòng ban…"
                placeholderTextColor={Colors.textFaint}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredEmployees.map((row) => (
                <EmployeeReportCard
                  key={row.user_id}
                  row={row}
                  onPress={() => openDetail(row)}
                />
              ))}
              {!filteredEmployees.length ? (
                <Text style={styles.empty}>Chưa có dữ liệu nhân viên trong kỳ này</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Header({
  onMenu,
  onFilter,
  Colors,
  styles,
}: {
  onMenu: () => void;
  onFilter: () => void;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onMenu}>
        <Ionicons name="menu" size={22} color={Colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Báo cáo CRM</Text>
      <Pressable style={styles.iconBtn} onPress={onFilter} accessibilityLabel="Bộ lọc">
        <Ionicons name="funnel-outline" size={21} color={Colors.purple} />
      </Pressable>
    </View>
  );
}

function PickerModal({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  insets,
  Colors,
  styles,
}: {
  visible: boolean;
  title: string;
  items: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  insets: { bottom: number };
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {items.map((c) => (
              <Pressable
                key={c.id || 'all'}
                style={[styles.modalRow, (c.id || '') === (selectedId || '') && styles.modalRowActive]}
                onPress={() => onSelect(c.id)}
              >
                <Text style={styles.modalRowText}>{c.name}</Text>
                {(c.id || '') === (selectedId || '') ? (
                  <Ionicons name="checkmark" size={18} color={Colors.purple} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: 'rgba(168,85,247,0.16)', borderColor: Colors.purple },
  chipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: Colors.purple },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterBtn: {
    flex: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    paddingHorizontal: 10,
    height: 40,
  },
  filterBtnLocked: { opacity: 0.85 },
  filterBtnText: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: '700' },
  filterBtnTextMuted: { flex: 1, color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabBody: { marginTop: 12 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  deniedTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  deniedText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  errorBox: {
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.redSoft,
    borderWidth: 1,
    borderColor: Colors.red,
    marginBottom: 10,
  },
  errorText: { color: Colors.red, fontSize: 13 },
  retry: { color: Colors.purple, fontWeight: '700', marginTop: 6, fontSize: 13 },
  empty: { textAlign: 'center', color: Colors.textFaint, fontSize: 14, paddingVertical: 40 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalRowActive: { backgroundColor: 'rgba(168,85,247,0.12)' },
  modalRowText: { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  employeeSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
});

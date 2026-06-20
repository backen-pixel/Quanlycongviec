import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  type OrgReportRow,
} from '../api/employeeReport';
import { fetchCrmCompanies, fetchCrmCompanyRegions } from '../api/crm';
import { formatApiError } from '../api/client';
import FilterChipBar, { type FilterChipOption } from '../components/FilterChipBar';
import EmployeeReportCard from '../components/reports/EmployeeReportCard';
import ReportOrgRowCard from '../components/reports/ReportOrgRowCard';
import ReportOverviewSummary from '../components/reports/ReportOverviewSummary';
import ReportOverviewCharts, { ReportEmployeeListCharts, ReportRegionCharts } from '../components/reports/ReportOverviewCharts';
import { useAuth } from '../context/AuthContext';
import { canViewEmployeeReport } from '../lib/employeeReportAccess';
import { defaultMonthRange, formatViDateIso, shiftMonthRange } from '../lib/reportFormat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TypeView = 'all' | 'lead' | 'deal';
type ReportTab = 'overview' | 'company' | 'region' | 'employee';

const TYPE_OPTIONS: { key: TypeView; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'lead', label: 'Lead' },
  { key: 'deal', label: 'Deal' },
];

const TAB_OPTIONS: FilterChipOption<ReportTab>[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'stats-chart-outline' },
  { id: 'company', label: 'Công ty', icon: 'business-outline' },
  { id: 'region', label: 'Khu vực', icon: 'location-outline' },
  { id: 'employee', label: 'Nhân viên', icon: 'people-outline' },
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
  const [typeView, setTypeView] = useState<TypeView>('all');
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [companyId, setCompanyId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<OrgOverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetchOrgOverviewReport(query);
      setReport(res);
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

  const drillToCompany = (row: OrgReportRow) => {
    if (!row.company_id) return;
    if (!lockedCompanyId) setCompanyId(String(row.company_id));
    setRegionId('');
    setActiveTab('region');
  };

  const drillToRegion = (row: OrgReportRow) => {
    if (row.company_id && !lockedCompanyId) setCompanyId(String(row.company_id));
    if (row.region_id) setRegionId(String(row.region_id));
    setActiveTab('employee');
  };

  const openDetail = (row: EmployeeReportRow) => {
    if (!row.user_id) return;
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

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.rangeRow}>
        <Pressable style={styles.rangeBtn} onPress={() => setRange((r) => shiftMonthRange(r.from, r.to, -1))}>
          <Ionicons name="chevron-back" size={18} color={Colors.text} />
        </Pressable>
        <Text style={styles.rangeLabel}>
          {formatViDateIso(range.from)} – {formatViDateIso(range.to)}
        </Text>
        <Pressable style={styles.rangeBtn} onPress={() => setRange((r) => shiftMonthRange(r.from, r.to, 1))}>
          <Ionicons name="chevron-forward" size={18} color={Colors.text} />
        </Pressable>
      </View>

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

      <View style={styles.filterRow}>
        {showCompanyPicker ? (
          <Pressable style={styles.filterBtn} onPress={() => setCompanyPickerOpen(true)}>
            <Ionicons name="business-outline" size={14} color={Colors.blue} />
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
            <Ionicons name="location-outline" size={14} color={Colors.blue} />
            <Text style={styles.filterBtnText} numberOfLines={1}>{regionLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <FilterChipBar value={activeTab} options={TAB_OPTIONS} onChange={setActiveTab} />

      {activeTab === 'employee' ? (
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
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()}><Text style={styles.retry}>Thử lại</Text></Pressable>
        </View>
      ) : null}

      {activeTab === 'overview' && report?.summary ? (
        <ReportOverviewSummary summary={report.summary} />
      ) : null}

      {activeTab === 'overview' && report ? (
        <ReportOverviewCharts report={report} />
      ) : null}

      {activeTab === 'region' && report ? (
        <ReportRegionCharts report={report} />
      ) : null}

      {activeTab === 'employee' && report ? (
        <ReportEmployeeListCharts report={report} />
      ) : null}

      {activeTab !== 'overview' ? (
        <Text style={styles.subtitle}>{listSubtitle(activeTab, report, filteredEmployees.length)}</Text>
      ) : (
        <Text style={styles.subtitle}>Số liệu lead/deal theo ngày tạo · chọn tab để xem chi tiết</Text>
      )}
    </View>
  );

  const listData = useMemo(() => {
    if (!report) return [] as Array<{ kind: 'company' | 'region' | 'employee'; row: OrgReportRow | EmployeeReportRow }>;
    if (activeTab === 'company') {
      return report.by_company.map((row) => ({ kind: 'company' as const, row }));
    }
    if (activeTab === 'region') {
      return report.by_region.map((row) => ({ kind: 'region' as const, row }));
    }
    if (activeTab === 'employee') {
      return filteredEmployees.map((row) => ({ kind: 'employee' as const, row }));
    }
    return [];
  }, [report, activeTab, filteredEmployees]);

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Header onBack={() => navigation.goBack()} title="Báo cáo CRM" Colors={Colors} styles={styles} />
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
      <Header onBack={() => navigation.goBack()} title="Báo cáo CRM" Colors={Colors} styles={styles} />

      {loading && !refreshing && !report ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.blue} size="large" />
        </View>
      ) : activeTab === 'overview' ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
        >
          {renderListHeader()}
        </ScrollView>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, idx) => {
            if (item.kind === 'employee') return String((item.row as EmployeeReportRow).user_id);
            const org = item.row as OrgReportRow;
            if (item.kind === 'company') return `c-${org.company_id || idx}`;
            return `r-${org.region_id || idx}`;
          }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>{emptyLabel(activeTab)}</Text>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'company') {
              return (
                <ReportOrgRowCard
                  row={item.row as OrgReportRow}
                  variant="company"
                  onPress={() => drillToCompany(item.row as OrgReportRow)}
                />
              );
            }
            if (item.kind === 'region') {
              return (
                <ReportOrgRowCard
                  row={item.row as OrgReportRow}
                  variant="region"
                  onPress={() => drillToRegion(item.row as OrgReportRow)}
                />
              );
            }
            return (
              <EmployeeReportCard
                row={item.row as EmployeeReportRow}
                onPress={() => openDetail(item.row as EmployeeReportRow)}
              />
            );
          }}
        />
      )}

      <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn công ty</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(isSystemAdmin(user) ? [{ id: '', name: 'Tất cả công ty' }] : []).concat(companies).map((c) => (
                <Pressable
                  key={c.id || 'all'}
                  style={[styles.modalRow, (c.id || '') === (companyId || '') && styles.modalRowActive]}
                  onPress={() => {
                    setCompanyId(c.id);
                    setRegionId('');
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{c.name}</Text>
                  {(c.id || '') === (companyId || '') ? (
                    <Ionicons name="checkmark" size={18} color={Colors.blue} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={regionPickerOpen} transparent animationType="fade" onRequestClose={() => setRegionPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRegionPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn khu vực</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {[{ id: '', name: 'Tất cả khu vực' }, ...regions].map((r) => (
                <Pressable
                  key={r.id || 'all'}
                  style={[styles.modalRow, (r.id || '') === (regionId || '') && styles.modalRowActive]}
                  onPress={() => {
                    setRegionId(r.id);
                    setRegionPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{r.name}</Text>
                  {(r.id || '') === (regionId || '') ? (
                    <Ionicons name="checkmark" size={18} color={Colors.blue} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function listSubtitle(tab: ReportTab, report: OrgOverviewReport | null, employeeCount: number): string {
  if (!report) return 'Đang tải…';
  if (tab === 'company') return `${report.by_company.length} công ty · chạm để xem khu vực`;
  if (tab === 'region') return `${report.by_region.length} khu vực · chạm để xem nhân viên`;
  return `${employeeCount} nhân viên · chọn thẻ để xem chi tiết pipeline`;
}

function emptyLabel(tab: ReportTab): string {
  if (tab === 'company') return 'Chưa có dữ liệu công ty trong kỳ này';
  if (tab === 'region') return 'Chưa có dữ liệu khu vực trong kỳ này';
  return 'Chưa có dữ liệu nhân viên trong kỳ này';
}

function Header({
  title,
  onBack,
  Colors,
  styles,
}: {
  title: string;
  onBack: () => void;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
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
  backBtn: {
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
  listHeader: { gap: 10, paddingBottom: 4 },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  rangeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  rangeLabel: { color: Colors.text, fontSize: 14, fontWeight: '700', minWidth: 170, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.blueSoft, borderColor: Colors.blue },
  chipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: Colors.blue },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  subtitle: { color: Colors.textMuted, fontSize: 12, marginBottom: 6 },
  empty: { textAlign: 'center', color: Colors.textFaint, fontSize: 14, paddingVertical: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  deniedTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  deniedText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  errorBox: {
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.redSoft,
    borderWidth: 1,
    borderColor: Colors.red,
  },
  errorText: { color: Colors.red, fontSize: 13 },
  retry: { color: Colors.blue, fontWeight: '700', marginTop: 6, fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  modalRowActive: { backgroundColor: Colors.blueSoft + '55' },
  modalRowText: { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
});

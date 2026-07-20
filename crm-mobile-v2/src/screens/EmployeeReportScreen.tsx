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
import { fetchCrmCompanies, fetchCrmCompanyRegions } from '../api/crm';
import { formatApiError } from '../api/client';
import EmployeeReportCard from '../components/reports/EmployeeReportCard';
import ReportFiltersPanel from '../components/reports/ReportFiltersPanel';
import ReportFilterModal from '../components/reports/ReportFilterModal';
import ReportOverviewTab from '../components/reports/ReportOverviewTab';
import ReportPerformanceTab from '../components/reports/ReportPerformanceTab';
import ReportPipelineTab from '../components/reports/ReportPipelineTab';
import ReportTabBar, { type ReportTabId } from '../components/reports/ReportTabBar';
import { useAuth } from '../context/AuthContext';
import { defaultCompanyIdForUser, isSystemWideAdmin } from '../lib/crmDefaultCompany';
import { canViewEmployeeReport } from '../lib/employeeReportAccess';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import {
  defaultMonthRange,
  formatReportRangeLabel,
  getReportRangeForPreset,
  type ReportPeriodPreset,
} from '../lib/reportFormat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TypeView = 'all' | 'lead' | 'deal';

const TAB_TITLES: Record<ReportTabId, string> = {
  overview: 'Báo cáo CRM',
  performance: 'Hiệu suất',
  pipeline: 'Pipeline',
};

function isAdminLike(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'sales_admin';
}

function isSystemAdmin(user: { role?: string | null; company_id?: string | null } | null): boolean {
  return isSystemWideAdmin(user);
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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
      .then((list) => {
        const mapped = list.map((c) => ({ id: c.id, name: c.shortName || c.name }));
        setCompanies(mapped);
        setCompanyId((prev) => {
          if (prev) return prev;
          return defaultCompanyIdForUser(user, mapped);
        });
      })
      .catch(() => setCompanies([]));
  }, [showCompanyPicker, user]);

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

  const load = useCallback(async (opts?: { refresh?: boolean; silent?: boolean }) => {
    if (!allowed) return;
    if (opts?.refresh && !opts?.silent) setRefreshing(true);
    else if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const orgReport = await fetchOrgOverviewReport(query);
      setReport(orgReport);
    } catch (e) {
      setError(formatApiError(e));
      setReport(null);
    } finally {
      if (!opts?.silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [allowed, query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useCrmRealtimeRefresh(
    useCallback(() => {
      void load({ refresh: true, silent: true });
    }, [load]),
    allowed,
  );

  const companyLabel = useMemo(() => {
    if (!effectiveCompanyId) return 'Chọn công ty';
    const found = companies.find((c) => c.id === effectiveCompanyId);
    if (found) return found.name;
    if (lockedCompanyId) return 'Công ty của bạn';
    return 'Đã chọn';
  }, [effectiveCompanyId, companies, lockedCompanyId]);

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
    if (activeTab === 'overview') {
      return (
        <ReportOverviewTab
          report={report}
          onViewPerformance={() => setActiveTab('performance')}
        />
      );
    }
    if (activeTab === 'performance') {
      return (
        <ReportPerformanceTab
          report={report}
          onEmployeePress={openDetail}
          onViewAllEmployees={() => setEmployeeModalOpen(true)}
        />
      );
    }
    return <ReportPipelineTab report={report} activityQuery={query} />;
  };

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Header
          title={TAB_TITLES[activeTab]}
          onBack={() => (navigation.canGoBack() ? navigation.goBack() : undefined)}
          filtersExpanded={filtersExpanded}
          onToggleFilters={() => setFiltersExpanded((v) => !v)}
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
        title={TAB_TITLES[activeTab]}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : undefined)}
        filtersExpanded={filtersExpanded}
        onToggleFilters={() => setFiltersExpanded((v) => !v)}
        Colors={Colors}
        styles={styles}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <ReportFiltersPanel
          expanded={filtersExpanded}
          dateLabel={formatReportRangeLabel(periodPreset, range.from, range.to)}
          companyLabel={companyLabel}
          regionLabel={regionLabel}
          showCompany={showCompanyPicker || !!lockedCompanyId}
          showRegion={!!effectiveCompanyId}
          onDatePress={() => setFilterOpen(true)}
          onCompanyPress={showCompanyPicker ? () => setCompanyPickerOpen(true) : undefined}
          onRegionPress={effectiveCompanyId ? () => setRegionPickerOpen(true) : undefined}
        />

        <ReportTabBar value={activeTab} onChange={setActiveTab} />
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
  title,
  onBack,
  filtersExpanded,
  onToggleFilters,
  Colors,
  styles,
}: {
  title: string;
  onBack: () => void;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack} accessibilityLabel="Quay lại">
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable
        style={[styles.iconBtn, filtersExpanded && styles.iconBtnActive]}
        onPress={onToggleFilters}
        accessibilityLabel="Bộ lọc"
      >
        <Ionicons
          name={filtersExpanded ? 'funnel' : 'funnel-outline'}
          size={21}
          color={filtersExpanded ? Colors.purple : Colors.text}
        />
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
  iconBtnActive: {
    backgroundColor: 'rgba(168,85,247,0.14)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  tabBody: { marginTop: 4 },
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

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchEmployeeReportRows,
  type EmployeeReportQuery,
  type EmployeeReportRow,
} from '../api/employeeReport';
import { formatApiError } from '../api/client';
import EmployeeReportCard from '../components/reports/EmployeeReportCard';
import { useAuth } from '../context/AuthContext';
import { canViewEmployeeReport } from '../lib/employeeReportAccess';
import { defaultMonthRange, formatViDateIso, shiftMonthRange } from '../lib/reportFormat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TypeView = 'all' | 'lead' | 'deal';

const TYPE_OPTIONS: { key: TypeView; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'lead', label: 'Lead' },
  { key: 'deal', label: 'Deal' },
];

export default function EmployeeReportScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const allowed = canViewEmployeeReport(user?.role);

  const [range, setRange] = useState(defaultMonthRange);
  const [typeView, setTypeView] = useState<TypeView>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<EmployeeReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query: EmployeeReportQuery = useMemo(() => ({
    date_from: range.from,
    date_to: range.to,
    type: typeView,
    ...(user?.company_id ? { company_id: String(user.company_id) } : {}),
  }), [range.from, range.to, typeView, user?.company_id]);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!allowed) return;
    if (opts?.refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployeeReportRows(query);
      setRows(res.rows);
    } catch (e) {
      setError(formatApiError(e));
      setRows([]);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.full_name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const dept = (r.department_name || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q);
    });
  }, [rows, search]);

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
    });
  };

  if (!allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Header onBack={() => navigation.goBack()} title="Báo cáo nhân viên" Colors={Colors} styles={styles} />
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.textFaint} />
          <Text style={styles.deniedTitle}>Không có quyền xem</Text>
          <Text style={styles.deniedText}>Báo cáo nhân viên chỉ dành cho quản lý / giám đốc.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onBack={() => navigation.goBack()} title="Báo cáo nhân viên" Colors={Colors} styles={styles} />

      <View style={styles.toolbar}>
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
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()}><Text style={styles.retry}>Thử lại</Text></Pressable>
        </View>
      ) : null}

      {loading && !refreshing && rows.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Colors.blue} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.user_id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={Colors.blue} />
          }
          ListHeaderComponent={
            <Text style={styles.subtitle}>
              {filtered.length} nhân viên · chọn thẻ để xem chi tiết pipeline
            </Text>
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>Chưa có dữ liệu nhân viên trong kỳ này</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <EmployeeReportCard row={item} onPress={() => openDetail(item)} />
          )}
        />
      )}
    </View>
  );
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
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  subtitle: { color: Colors.textMuted, fontSize: 12, marginBottom: 10, marginTop: 4 },
  empty: { textAlign: 'center', color: Colors.textFaint, fontSize: 14, paddingVertical: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  deniedTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  deniedText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: Colors.redSoft,
    borderWidth: 1,
    borderColor: Colors.red,
  },
  errorText: { color: Colors.red, fontSize: 13 },
  retry: { color: Colors.blue, fontWeight: '700', marginTop: 6, fontSize: 13 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import ActionGrid2x2 from '../components/ActionGrid2x2';
import FilterGridPanel from '../components/FilterGridPanel';
import {
  ensureVoiceBackgroundSyncPermissions,
  isLocallyMarkedUploaded,
  listLocalCallRecordings,
  reuploadLocalByName,
  runVoiceBackgroundSyncOnce,
  skipLocalUpload,
  type LocalCallRecording,
} from '../lib/voiceBackgroundSync';
import type { RootStackParamList } from '../navigation/types';
import { PAGE_HPAD, Radii, Spacing, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Status = 'synced' | 'deleted_on_server' | 'pending';
type Row = LocalCallRecording & {
  status: Status;
  serverId: string | null;
  serverPhone: string | null;
};
type StatusFilter = 'all' | Status;
type RangeFilter = 'all' | '7d' | '30d' | '90d';

function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rangeToSinceMs(r: RangeFilter): number {
  if (r === 'all') return 0;
  const days = r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function statusLabel(status: Status): string {
  if (status === 'synced') return 'Đã đồng bộ';
  if (status === 'pending') return 'Chưa đồng bộ';
  return 'Đã xóa server';
}

export default function VoiceLocalRecordingsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30d');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const load = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setErr('Chỉ hỗ trợ Android.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const perm = await ensureVoiceBackgroundSyncPermissions();
      if (!perm.mediaGranted) {
        setErr('Chưa cấp quyền đọc file âm thanh. Bật trong Cài đặt ứng dụng.');
        setRows([]);
        return;
      }

      const sinceMs = rangeToSinceMs(rangeFilter);
      const local = await listLocalCallRecordings({ sinceMs, limit: 200, includeAll: false });
      const items = local.map((it) => ({ file_name: it.name, file_size: it.size }));

      let existing: { id: string; file_name: string; file_size: number | null; phone_number: string | null }[] = [];
      let tombstoned: { file_name: string; file_size: number | null }[] = [];
      try {
        const { data } = await api.post<{
          existing?: typeof existing;
          tombstoned?: typeof tombstoned;
        }>('/voice-recordings/bulk-check', { items });
        existing = data?.existing || [];
        tombstoned = data?.tombstoned || [];
      } catch {
        /* offline */
      }

      const serverByName = new Map<string, (typeof existing)[0]>();
      for (const r of existing) {
        serverByName.set(`${r.file_name}|${r.file_size ?? 0}`, r);
        if (!serverByName.has(r.file_name)) serverByName.set(r.file_name, r);
      }
      const tombSet = new Set<string>();
      for (const t of tombstoned) {
        tombSet.add(`${t.file_name}|${t.file_size ?? 0}`);
        tombSet.add(t.file_name);
      }

      const enriched: Row[] = [];
      for (const it of local) {
        const k = `${it.name}|${it.size}`;
        const onServer = serverByName.get(k) || serverByName.get(it.name) || null;
        const isTomb = tombSet.has(k) || tombSet.has(it.name);
        const marked = await isLocallyMarkedUploaded(it.name);
        let status: Status;
        if (onServer) status = 'synced';
        else if (isTomb || marked) status = 'deleted_on_server';
        else status = 'pending';
        enriched.push({
          ...it,
          status,
          serverId: onServer?.id || null,
          serverPhone: onServer?.phone_number || null,
        });
      }
      setRows(enriched);
    } catch (e: unknown) {
      setErr((e as Error)?.message || 'Lỗi tải danh sách');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rangeFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        const hay = [r.name, r.phoneHint || '', r.serverPhone || ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: rows.length, synced: 0, deleted_on_server: 0, pending: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const filterActive = statusFilter !== 'all' || rangeFilter !== '30d' || !!search;

  const handleSyncNow = async () => {
    setLoading(true);
    try {
      const { uploaded, scanned } = await runVoiceBackgroundSyncOnce();
      Alert.alert('Đồng bộ nền', `Đã quét ${scanned} file, tải lên ${uploaded} bản ghi mới.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Đồng bộ', (e as Error)?.message || 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (r: Row) => {
    setBusyId(r.id);
    try {
      await reuploadLocalByName(r);
      Alert.alert('Đã tải lên', `"${r.name}" đã gửi lên server.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Tải lên', (e as Error)?.message || 'Lỗi');
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = (r: Row) => {
    Alert.alert('Bỏ qua?', 'Không tự động tải file này lên nữa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Bỏ qua',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(r.id);
            try {
              await skipLocalUpload(r.name);
              await load();
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  if (Platform.OS !== 'android') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingHorizontal: PAGE_HPAD }]}>
        <Text style={styles.banner}>Tính năng này chỉ có trên Android.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.fixedTop}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Ghi âm trên máy</Text>
            <View style={styles.syncRow}>
              <View style={styles.syncDot} />
              <Text style={styles.syncTxt}>
                {rows.length} file · hiển thị {filtered.length}
              </Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => void load()} hitSlop={8}>
            <Ionicons name="refresh-outline" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm SĐT hoặc tên file…"
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            autoCapitalize="none"
          />
          {searchDraft ? (
            <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={Colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.gridLabel}>Khoảng thời gian</Text>
        <FilterGridPanel
          value={rangeFilter}
          onChange={setRangeFilter}
          pagePadding={PAGE_HPAD}
          cells={[
            { type: 'filter', id: 'all', label: 'Tất cả' },
            { type: 'filter', id: '7d', label: '7 ngày' },
            { type: 'filter', id: '30d', label: '30 ngày' },
            { type: 'filter', id: '90d', label: '90 ngày' },
          ]}
        />

        <Text style={styles.gridLabel}>Trạng thái</Text>
        <FilterGridPanel
          value={statusFilter}
          onChange={setStatusFilter}
          pagePadding={PAGE_HPAD}
          cells={[
            { type: 'filter', id: 'all', label: 'Tất cả', icon: 'albums-outline', count: counts.all },
            { type: 'filter', id: 'pending', label: 'Chưa đồng bộ', icon: 'cloud-upload-outline', count: counts.pending },
            { type: 'filter', id: 'synced', label: 'Đã đồng bộ', icon: 'checkmark-circle-outline', count: counts.synced },
            { type: 'filter', id: 'deleted_on_server', label: 'Đã xóa server', icon: 'trash-outline', count: counts.deleted_on_server },
          ]}
        />

        <Pressable
          style={[styles.syncFullBtn, loading && { opacity: 0.6 }]}
          onPress={() => void handleSyncNow()}
          disabled={loading}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.syncFullTxt}>{loading ? 'Đang quét…' : 'Đồng bộ ngay'}</Text>
        </Pressable>

        {filterActive ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChipContent}>
            {rangeFilter !== '30d' ? (
              <Pressable style={styles.activeChip} onPress={() => setRangeFilter('30d')}>
                <Text style={styles.activeChipTxt}>
                  {rangeFilter === 'all' ? 'Tất cả thời gian' : rangeFilter === '7d' ? '7 ngày' : '90 ngày'}
                </Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ) : null}
            {statusFilter !== 'all' ? (
              <Pressable style={styles.activeChip} onPress={() => setStatusFilter('all')}>
                <Text style={styles.activeChipTxt}>{statusLabel(statusFilter as Status)}</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ) : null}
            {search ? (
              <Pressable style={styles.activeChip} onPress={() => setSearchDraft('')}>
                <Text style={styles.activeChipTxt}>«{search}»</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.activeChipClear}
              onPress={() => {
                setSearchDraft('');
                setStatusFilter('all');
                setRangeFilter('30d');
              }}
            >
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {err ? <Text style={styles.err}>{err}</Text> : null}
      </View>

      <FlatList
        style={styles.listFlex}
        data={filtered}
        keyExtractor={(r) => `${r.id}-${r.name}`}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={loading && rows.length > 0}
            onRefresh={() => void load()}
            tintColor={Colors.blue}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.blue} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={38} color={Colors.textFaint} />
              <Text style={styles.empty}>{filterActive ? 'Không có file phù hợp bộ lọc.' : 'Không có bản ghi phù hợp.'}</Text>
            </View>
          )
        }
        renderItem={({ item: r }) => {
          const actions = [];
          if (r.status === 'pending' || r.status === 'deleted_on_server') {
            actions.push({
              key: 'upload',
              label: busyId === r.id ? '…' : r.status === 'pending' ? 'Tải lên' : 'Tải lại',
              icon: 'cloud-upload-outline' as const,
              onPress: () => void handleUpload(r),
              disabled: busyId === r.id,
            });
          }
          if (r.status === 'deleted_on_server') {
            actions.push({
              key: 'skip',
              label: 'Bỏ qua',
              icon: 'close-circle-outline' as const,
              onPress: () => handleSkip(r),
            });
          }
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={2}>{r.name}</Text>
              <Text style={styles.meta}>{formatDateTime(r.dateAddedMs)} · {formatBytes(r.size)}</Text>
              {r.phoneHint ? <Text style={styles.meta}>{r.phoneHint}</Text> : null}
              <Text style={styles.statusBadge}>{statusLabel(r.status)}</Text>
              {actions.length ? (
                <View style={{ marginTop: Spacing.sm }}>
                  <ActionGrid2x2 pagePadding={PAGE_HPAD + 14} items={actions} />
                </View>
              ) : null}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    fixedTop: { paddingHorizontal: PAGE_HPAD, gap: Spacing.sm, paddingBottom: Spacing.sm },
    listFlex: { flex: 1 },
    listContent: { paddingHorizontal: PAGE_HPAD, paddingTop: 4 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: Spacing.sm },
    backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.green },
    syncTxt: { color: Colors.textFaint, fontSize: 12 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    banner: { color: Colors.textMuted, fontSize: 12 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      height: 46,
      paddingHorizontal: 12,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    gridLabel: {
      color: Colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    syncFullBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      height: 44,
      borderRadius: Radii.md,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    syncFullTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
    activeChipContent: { alignItems: 'center', paddingRight: 4 },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      height: 30,
      borderRadius: Radii.pill,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
      marginRight: 8,
    },
    activeChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    activeChipClear: {
      paddingHorizontal: 10,
      height: 30,
      borderRadius: Radii.pill,
      backgroundColor: Colors.redSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeChipClearTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
    err: { color: Colors.red, fontSize: 12 },
    emptyBox: { alignItems: 'center', paddingTop: 40, gap: 10 },
    empty: { color: Colors.textFaint, textAlign: 'center', fontSize: 14 },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
    },
    cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    meta: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
    statusBadge: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', marginTop: 8 },
  });

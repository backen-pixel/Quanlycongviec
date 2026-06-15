import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
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
import Chip from '../components/Chip';
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
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Status = 'synced' | 'deleted_on_server' | 'pending';
type Row = LocalCallRecording & {
  status: Status;
  serverId: string | null;
  serverPhone: string | null;
};
type StatusFilter = 'all' | Status;
type RangeFilter = 'all' | '7d' | '30d' | '90d';

const RANGE_LABEL: Record<RangeFilter, string> = {
  all: 'Tất cả',
  '7d': '7 ngày',
  '30d': '30 ngày',
  '90d': '90 ngày',
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'Tất cả',
  synced: 'Đã đồng bộ',
  deleted_on_server: 'Đã xóa server',
  pending: 'Chưa đồng bộ',
};

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
  const [search, setSearch] = useState('');

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
        /* offline — hiển thị local */
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
    const q = search.trim().toLowerCase();
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
    const c = { synced: 0, deleted_on_server: 0, pending: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

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
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingHorizontal: 20 }]}>
        <Text style={styles.banner}>Tính năng này chỉ có trên Android.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.h1}>Ghi âm trên máy</Text>
        <Text style={styles.banner}>
          Quét file ghi cuộc gọi trên điện thoại và so với server. Bấm «Đồng bộ ngay» để gửi bản ghi mới lên.
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: Colors.greenSoft }]}>
          <Text style={[styles.statNum, { color: Colors.green }]}>{counts.synced}</Text>
          <Text style={styles.statLbl}>Đã đồng bộ</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: Colors.amberSoft }]}>
          <Text style={[styles.statNum, { color: Colors.amber }]}>{counts.deleted_on_server}</Text>
          <Text style={styles.statLbl}>Đã xóa server</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: Colors.blueSoft }]}>
          <Text style={[styles.statNum, { color: Colors.blue }]}>{counts.pending}</Text>
          <Text style={styles.statLbl}>Chưa đồng bộ</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', '7d', '30d', '90d'] as RangeFilter[]).map((k) => (
          <Chip key={k} label={RANGE_LABEL[k]} active={rangeFilter === k} onPress={() => setRangeFilter(k)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', 'pending', 'deleted_on_server', 'synced'] as StatusFilter[]).map((k) => (
          <Chip key={k} label={STATUS_LABEL[k]} active={statusFilter === k} onPress={() => setStatusFilter(k)} />
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Tìm SĐT hoặc tên file…"
          placeholderTextColor={Colors.textFaint}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <Pressable style={[styles.syncBtn, loading && { opacity: 0.6 }]} onPress={() => void handleSyncNow()} disabled={loading}>
          <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
          <Text style={styles.syncBtnTxt}>Đồng bộ ngay</Text>
        </Pressable>
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(r) => `${r.id}-${r.name}`}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={() => void load()} tintColor={Colors.purple} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.purple} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>Không có bản ghi phù hợp.</Text>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>{r.name}</Text>
            <Text style={styles.meta}>{formatDateTime(r.dateAddedMs)} · {formatBytes(r.size)}</Text>
            {r.phoneHint ? <Text style={styles.phone}>📞 {r.phoneHint}</Text> : null}
            <View style={[styles.badge, badgeStyle(r.status, Colors)]}>
              <Text style={[styles.badgeTxt, { color: badgeColor(r.status, Colors) }]}>
                {r.status === 'synced' ? '✓ Đã đồng bộ' : r.status === 'pending' ? '↑ Chưa đồng bộ' : '⚠ Đã xóa khỏi server'}
              </Text>
            </View>
            <View style={styles.actions}>
              {(r.status === 'pending' || r.status === 'deleted_on_server') && (
                <Pressable
                  style={[styles.actionPrimary, busyId === r.id && { opacity: 0.5 }]}
                  disabled={busyId === r.id}
                  onPress={() => void handleUpload(r)}
                >
                  <Text style={styles.actionPrimaryTxt}>{busyId === r.id ? '…' : r.status === 'pending' ? 'Tải lên' : 'Tải lại'}</Text>
                </Pressable>
              )}
              {r.status === 'deleted_on_server' && (
                <Pressable style={styles.actionMuted} onPress={() => handleSkip(r)}>
                  <Text style={styles.actionMutedTxt}>Bỏ qua</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function badgeStyle(status: Status, Colors: ThemeColors) {
  if (status === 'synced') return { backgroundColor: Colors.greenSoft, borderColor: 'rgba(34,197,94,0.35)' };
  if (status === 'pending') return { backgroundColor: Colors.blueSoft, borderColor: 'rgba(47,107,255,0.35)' };
  return { backgroundColor: Colors.amberSoft, borderColor: 'rgba(245,158,11,0.35)' };
}

function badgeColor(status: Status, Colors: ThemeColors) {
  if (status === 'synced') return Colors.green;
  if (status === 'pending') return Colors.blue;
  return Colors.amber;
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
      marginBottom: 8,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    banner: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
    statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginTop: 10 },
    stat: { flex: 1, borderRadius: Radii.md, paddingVertical: 10, alignItems: 'center' },
    statNum: { fontSize: 18, fontWeight: '900' },
    statLbl: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
    chips: { gap: 8, paddingHorizontal: 14, paddingTop: 10 },
    searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginTop: 10 },
    search: {
      flex: 1,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: Colors.text,
      backgroundColor: Colors.card,
      fontSize: 14,
    },
    syncBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.purple,
      paddingHorizontal: 14,
      borderRadius: Radii.md,
      justifyContent: 'center',
    },
    syncBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
    err: { color: Colors.red, marginHorizontal: 14, marginTop: 8, fontSize: 12 },
    empty: { color: Colors.textFaint, textAlign: 'center', marginTop: 40 },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginTop: 10,
    },
    cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    meta: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
    phone: { color: Colors.text, fontSize: 13, marginTop: 4 },
    badge: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: Radii.pill,
      borderWidth: 1,
    },
    badgeTxt: { fontSize: 11, fontWeight: '800' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    actionPrimary: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: Radii.sm,
      backgroundColor: Colors.blue,
    },
    actionPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
    actionMuted: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: Radii.sm,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    actionMutedTxt: { color: Colors.textMuted, fontWeight: '700', fontSize: 13 },
  });

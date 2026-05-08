import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import {
  isVoiceDataSyncAvailable,
  voiceListLocalCallRecordings,
  voiceReuploadByName,
  voiceMarkLocallyUploaded,
  voiceUnmarkLocallyUploaded,
  voiceTriggerSyncNow,
  type LocalCallRecording,
} from '../native/voiceDataSyncAndroid';
import { ensureVoiceBackgroundSyncPermissions } from '../lib/voiceBackgroundSync';

type ServerExisting = {
  id: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
  customer_id: string | null;
  lead_id: string | null;
  phone_number: string | null;
};

type ServerTombstoned = {
  original_id: string | null;
  file_name: string;
  file_size: number | null;
  deleted_at: string;
};

type Status = 'synced' | 'deleted_on_server' | 'pending';

type Row = LocalCallRecording & {
  status: Status;
  serverId: string | null;
  serverPhone: string | null;
  /** True nếu server có tombstone (đã từng upload + đã xóa). */
  serverTombstoned: boolean;
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
  deleted_on_server: 'Đã xóa khỏi server',
  pending: 'Chưa đồng bộ',
};

const STATUS_COLOR: Record<Status, { bg: string; fg: string; border: string }> = {
  synced: { bg: CrmColors.emerald100, fg: CrmColors.emerald700, border: CrmColors.emerald100 },
  deleted_on_server: { bg: CrmColors.amber50, fg: CrmColors.amber600, border: CrmColors.amber100 },
  pending: { bg: CrmColors.blue50, fg: CrmColors.blue700, border: CrmColors.blue100 },
};

const STATUS_TEXT: Record<Status, string> = {
  synced: '✓ Đã đồng bộ',
  deleted_on_server: '⚠ Đã xóa khỏi server — có thể tải lại',
  pending: '↑ Chưa đồng bộ',
};

function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function rangeToSinceMs(r: RangeFilter): number {
  if (r === 'all') return 0;
  const days = r === '7d' ? 7 : r === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function VoiceLocalRecordingsScreen() {
  const available = isVoiceDataSyncAvailable();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30d');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!available) {
      setErr('Tính năng này chỉ hoạt động trên Android (đã build native module).');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const perm = await ensureVoiceBackgroundSyncPermissions();
      if (!perm.mediaGranted) {
        setErr('Chưa cấp quyền đọc audio. Bật quyền «Âm thanh» trong cài đặt app.');
        setRows([]);
        return;
      }

      const sinceMs = rangeToSinceMs(rangeFilter);
      const local = await voiceListLocalCallRecordings({ sinceMs, limit: 300, includeAll: false });

      const items = local.map((it) => ({
        file_name: it.name,
        file_size: it.size,
      }));
      let existing: ServerExisting[] = [];
      let tombstoned: ServerTombstoned[] = [];
      try {
        const { data } = await api.post<{
          existing?: ServerExisting[];
          tombstoned?: ServerTombstoned[];
        }>('/voice-recordings/bulk-check', { items });
        existing = Array.isArray(data?.existing) ? data.existing : [];
        tombstoned = Array.isArray(data?.tombstoned) ? data.tombstoned : [];
      } catch {
        // Mất mạng / 5xx — vẫn hiển thị danh sách local; status sẽ rơi về local-only.
        existing = [];
        tombstoned = [];
      }

      const serverByName = new Map<string, ServerExisting>();
      for (const r of existing) {
        const k = `${r.file_name}|${r.file_size ?? 0}`;
        serverByName.set(k, r);
        if (!serverByName.has(r.file_name)) serverByName.set(r.file_name, r);
      }
      const tombSet = new Set<string>();
      for (const t of tombstoned) {
        tombSet.add(`${t.file_name}|${t.file_size ?? 0}`);
        tombSet.add(t.file_name); // fallback theo tên
      }

      const enriched: Row[] = local.map((it) => {
        const k = `${it.name}|${it.size}`;
        const onServer = serverByName.get(k) || serverByName.get(it.name) || null;
        const isTomb = tombSet.has(k) || tombSet.has(it.name);
        let status: Status;
        if (onServer) status = 'synced';
        else if (isTomb || it.locallyUploaded) status = 'deleted_on_server';
        else status = 'pending';
        return {
          ...it,
          status,
          serverId: onServer?.id || null,
          serverPhone: onServer?.phone_number || null,
          serverTombstoned: isTomb,
        };
      });

      setRows(enriched);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Lỗi tải danh sách';
      setErr(String(msg));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [available, rangeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const handleReupload = async (r: Row) => {
    setBusyAction(r.id);
    try {
      const ok = await voiceReuploadByName(r.name, r.size);
      if (!ok) throw new Error('Upload thất bại');
      Alert.alert('Đã tải lại', `Đã upload "${r.name}" lên server.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Tải lại', (e as Error)?.message || 'Lỗi không xác định');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSkip = async (r: Row) => {
    Alert.alert(
      'Bỏ qua bản ghi này?',
      'Hệ thống sẽ đánh dấu đã xử lý và không hỏi tải lại nữa. Bạn vẫn có thể bấm "Tải lại" trong tương lai để gửi.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Bỏ qua',
          style: 'destructive',
          onPress: async () => {
            setBusyAction(r.id);
            try {
              await voiceMarkLocallyUploaded(r.name);
              await load();
            } catch (e: unknown) {
              Alert.alert('Bỏ qua', (e as Error)?.message || 'Lỗi');
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  const handleResetUploadFlag = async (r: Row) => {
    setBusyAction(r.id);
    try {
      await voiceUnmarkLocallyUploaded(r.name);
      await load();
    } catch (e: unknown) {
      Alert.alert('Reset', (e as Error)?.message || 'Lỗi');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await voiceTriggerSyncNow();
      Alert.alert('Đã yêu cầu', 'Service nền sẽ chạy 1 lượt đồng bộ ngay. Mở "Làm mới" sau vài giây.');
    } catch (e: unknown) {
      Alert.alert('Trigger', (e as Error)?.message || 'Lỗi');
    }
  };

  if (Platform.OS !== 'android' || !available) {
    return (
      <View style={styles.screen}>
        <Text style={styles.banner}>
          Tính năng "Bản ghi trên máy" chỉ hoạt động trên app Android (build native). Trên iOS hoặc Expo Go,
          dùng tab "Ghi âm CRM" để xem các bản ghi đã upload.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.banner}>
        Liệt kê file ghi âm cuộc gọi trên máy + so với server. Bản ghi <Text style={styles.bold}>"đã xóa khỏi server"</Text> là
        bạn đã upload trước đây nhưng admin đã xóa — bấm "Tải lại" để gửi lên lần nữa, hoặc "Bỏ qua" nếu không cần.
      </Text>

      <View style={styles.statsRow}>
        <View style={[styles.statChip, { backgroundColor: CrmColors.emerald100 }]}>
          <Text style={[styles.statTxt, { color: CrmColors.emerald700 }]}>{counts.synced}</Text>
          <Text style={[styles.statLbl, { color: CrmColors.emerald700 }]}>Đã đồng bộ</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: CrmColors.amber50 }]}>
          <Text style={[styles.statTxt, { color: CrmColors.amber600 }]}>{counts.deleted_on_server}</Text>
          <Text style={[styles.statLbl, { color: CrmColors.amber600 }]}>Đã xóa khỏi server</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: CrmColors.blue50 }]}>
          <Text style={[styles.statTxt, { color: CrmColors.blue700 }]}>{counts.pending}</Text>
          <Text style={[styles.statLbl, { color: CrmColors.blue700 }]}>Chưa đồng bộ</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLbl}>Thời gian</Text>
        <View style={styles.chipsWrap}>
          {(['all', '7d', '30d', '90d'] as RangeFilter[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, rangeFilter === k && styles.chipActive]}
              onPress={() => setRangeFilter(k)}
            >
              <Text style={[styles.chipTxt, rangeFilter === k && styles.chipTxtActive]}>{RANGE_LABEL[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLbl}>Trạng thái</Text>
        <View style={styles.chipsWrap}>
          {(['all', 'pending', 'deleted_on_server', 'synced'] as StatusFilter[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, statusFilter === k && styles.chipActive]}
              onPress={() => setStatusFilter(k)}
            >
              <Text style={[styles.chipTxt, statusFilter === k && styles.chipTxtActive]}>{STATUS_LABEL[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo SĐT hoặc tên file…"
          placeholderTextColor={CrmColors.gray400}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.btn} onPress={() => void handleTriggerSync()} disabled={loading}>
          <Text style={styles.btnTxt}>Đồng bộ ngay</Text>
        </TouchableOpacity>
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(r) => `${r.id}-${r.name}`}
        refreshControl={
          <RefreshControl
            refreshing={loading && rows.length > 0}
            onRefresh={() => void load()}
            tintColor={CrmColors.blue600}
          />
        }
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={CrmColors.blue600} style={{ marginTop: 32 }} />
          ) : (
            <Text style={styles.empty}>
              {rows.length === 0
                ? 'Chưa thấy bản ghi cuộc gọi nào trong thời gian đã chọn.'
                : 'Không có kết quả lọc.'}
            </Text>
          )
        }
        renderItem={({ item: r }) => (
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {r.name}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(new Date(r.dateAddedMs).toISOString())} · {formatBytes(r.size)}
            </Text>
            {r.phoneHint ? <Text style={styles.phone}>📞 {r.phoneHint}</Text> : null}
            {r.relativePath ? (
              <Text style={styles.path} numberOfLines={1}>
                {r.relativePath}
              </Text>
            ) : null}

            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLOR[r.status].bg, borderColor: STATUS_COLOR[r.status].border },
              ]}
            >
              <Text style={[styles.statusTxt, { color: STATUS_COLOR[r.status].fg }]}>{STATUS_TEXT[r.status]}</Text>
            </View>

            <View style={styles.actions}>
              {r.status === 'deleted_on_server' || r.status === 'pending' ? (
                <TouchableOpacity
                  style={[styles.actionPrimary, busyAction === r.id && { opacity: 0.5 }]}
                  disabled={busyAction === r.id}
                  onPress={() => void handleReupload(r)}
                >
                  <Text style={styles.actionPrimaryTxt}>
                    {busyAction === r.id ? '…' : r.status === 'deleted_on_server' ? 'Tải lại' : 'Tải lên'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {r.status === 'deleted_on_server' ? (
                <TouchableOpacity
                  style={[styles.actionMuted, busyAction === r.id && { opacity: 0.5 }]}
                  disabled={busyAction === r.id}
                  onPress={() => void handleSkip(r)}
                >
                  <Text style={styles.actionMutedTxt}>Bỏ qua</Text>
                </TouchableOpacity>
              ) : null}

              {r.status === 'synced' && r.locallyUploaded ? (
                <TouchableOpacity
                  style={[styles.actionGhost, busyAction === r.id && { opacity: 0.5 }]}
                  disabled={busyAction === r.id}
                  onPress={() => void handleResetUploadFlag(r)}
                >
                  <Text style={styles.actionGhostTxt}>Reset cờ</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  banner: { marginHorizontal: 16, marginTop: 10, fontSize: 12, color: CrmColors.gray600, lineHeight: 17 },
  bold: { fontWeight: '800', color: CrmColors.gray800 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  statChip: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: CrmRadii.md, alignItems: 'center' },
  statTxt: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 11, marginTop: 2, fontWeight: '700' },
  filterRow: { paddingHorizontal: 16, marginTop: 10 },
  filterLbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginBottom: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipActive: { backgroundColor: CrmColors.blue600, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray700 },
  chipTxtActive: { color: '#fff' },
  searchRow: { paddingHorizontal: 16, marginTop: 10, flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue600,
    justifyContent: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  err: { color: CrmColors.red700, marginHorizontal: 16, marginTop: 8, fontSize: 12 },
  listPad: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 24 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900 },
  meta: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  phone: { fontSize: 13, color: CrmColors.gray900, marginTop: 4 },
  path: { fontSize: 11, color: CrmColors.gray400, marginTop: 4 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    marginTop: 8,
  },
  statusTxt: { fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actionPrimary: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue600,
  },
  actionPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  actionMuted: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  actionMutedTxt: { color: CrmColors.gray700, fontWeight: '700', fontSize: 13 },
  actionGhost: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  actionGhostTxt: { color: CrmColors.gray600, fontWeight: '700', fontSize: 13 },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { forcePingNow, getDeviceId } from '../lib/deviceHeartbeat';
import { getPushSetupStatus, type PushSetupStatus } from '../lib/pushRegistration';

type DeviceRow = {
  id: string;
  device_id: string;
  platform: string;
  device_name?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  ip?: string | null;
  last_ping_at?: string | null;
  last_login_at?: string | null;
  first_seen_at?: string | null;
  online?: boolean;
};

const ONLINE_WINDOW_MS = 90 * 1000;

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 60_000) return 'vừa xong';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleString('vi-VN');
}

function platformLabel(p: string): string {
  if (p === 'android') return 'Android';
  if (p === 'ios') return 'iOS';
  if (p === 'web') return 'Trình duyệt';
  if (p === 'desktop') return 'Desktop';
  return p;
}

export default function MyDevicesScreen() {
  const [items, setItems] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string>('');
  const [pushStatus, setPushStatus] = useState<PushSetupStatus | null>(null);

  useEffect(() => {
    void (async () => setThisDeviceId(await getDeviceId()))();
    void getPushSetupStatus().then(setPushStatus);
  }, []);

  const load = useCallback(async (forcePing = false) => {
    setError(null);
    try {
      if (forcePing) {
        // Ping ngay trước khi GET — đảm bảo thiết bị hiện tại tồn tại + last_ping_at mới nhất.
        await forcePingNow();
      }
      const { data } = await api.get<{ devices: DeviceRow[] }>('/devices/me');
      setItems(Array.isArray(data?.devices) ? data.devices : []);
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { error?: string } } };
      if (ax?.response?.status === 503) {
        setError('Cần chạy migration database/205_user_devices.sql trên Supabase rồi reload.');
      } else if (ax?.response?.status === 401) {
        setError('Phiên hết hạn — đăng nhập lại.');
      } else {
        setError(ax?.response?.data?.error || 'Không tải được danh sách thiết bị');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Lần đầu mở màn: ping ngay rồi load — không phải chờ heartbeat 60s.
    void load(true);
    const id = setInterval(() => void load(false), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const onRevoke = (row: DeviceRow) => {
    Alert.alert(
      'Đăng xuất thiết bị?',
      `Gỡ "${row.device_name || platformLabel(row.platform)}" khỏi tài khoản?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            setRevoking(row.id);
            try {
              await api.delete(`/devices/${row.id}`);
              setItems((list) => list.filter((d) => d.id !== row.id));
            } catch (e: unknown) {
              const ax = e as { response?: { data?: { error?: string } } };
              Alert.alert('Lỗi', ax?.response?.data?.error || 'Không gỡ được thiết bị');
            } finally {
              setRevoking(null);
            }
          },
        },
      ],
    );
  };

  const onlineCount = items.filter((d) => {
    if (!d.last_ping_at) return false;
    return Date.now() - new Date(d.last_ping_at).getTime() < ONLINE_WINDOW_MS;
  }).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Thiết bị đang đăng nhập</Text>
              <TouchableOpacity
                onPress={() => void load(true)}
                style={styles.reloadBtn}
                disabled={loading}
              >
                <Text style={styles.reloadTxt}>{loading ? '…' : '↻ Tải lại'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sub}>
              Tài khoản đang hoạt động trên {onlineCount} thiết bị (ping mỗi 60 giây).
            </Text>
            {pushStatus ? (
              <View
                style={[
                  styles.pushStatusBox,
                  pushStatus.hasPushToken && pushStatus.notificationPermission === 'granted'
                    ? styles.pushOk
                    : styles.pushWarn,
                ]}
              >
                <Text style={styles.pushStatusTitle}>
                  {pushStatus.hasPushToken && pushStatus.notificationPermission === 'granted'
                    ? '✓ Push đã sẵn sàng (khi tắt app vẫn nhận thông báo)'
                    : '⚠ Push chưa hoàn tất — thông báo có thể không tới khi tắt app'}
                </Text>
                <Text style={styles.pushStatusLine}>
                  Quyền: {pushStatus.notificationPermission} · projectId:{' '}
                  {pushStatus.hasProjectId ? 'có' : 'thiếu'} · token:{' '}
                  {pushStatus.hasPushToken ? 'có' : 'thiếu'}
                </Text>
                {pushStatus.hint ? (
                  <Text style={styles.pushStatusHint}>{pushStatus.hint}</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.testRow}>
              <TouchableOpacity
                style={styles.testBtn}
                onPress={async () => {
                  try {
                    const { data } = await api.post<{
                      tokens_count?: number;
                      hint?: string;
                    }>('/devices/test-push', { kind: 'chat' });
                    if (!data?.tokens_count) {
                      Alert.alert(
                        'Không có token push',
                        data?.hint ||
                          'Chưa đăng ký được Expo Push Token. Kiểm tra mục «Push» phía trên rồi build lại APK.',
                      );
                    } else {
                      Alert.alert(
                        'Đã gửi',
                        `Push đã gửi tới ${data.tokens_count} thiết bị. Khoá máy hoặc thoát app để thấy banner; bật bong bóng nếu chưa thấy.`,
                      );
                    }
                  } catch (e: unknown) {
                    const ax = e as { response?: { data?: { error?: string } } };
                    Alert.alert('Lỗi', ax?.response?.data?.error || 'Không gửi được');
                  }
                }}
              >
                <Text style={styles.testBtnTxt}>Gửi push thử (Chat)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testBtn, styles.testBtnAlt]}
                onPress={async () => {
                  try {
                    const { data } = await api.post<{
                      tokens_count?: number;
                      hint?: string;
                    }>('/devices/test-push', { kind: 'deal' });
                    if (!data?.tokens_count) {
                      Alert.alert(
                        'Không có token push',
                        data?.hint ||
                          'Chưa đăng ký được Expo Push Token. Kiểm tra mục «Push» phía trên rồi build lại APK.',
                      );
                    } else {
                      Alert.alert(
                        'Đã gửi',
                        `Push đã gửi tới ${data.tokens_count} thiết bị. Khoá máy hoặc thoát app để thấy banner.`,
                      );
                    }
                  } catch (e: unknown) {
                    const ax = e as { response?: { data?: { error?: string } } };
                    Alert.alert('Lỗi', ax?.response?.data?.error || 'Không gửi được');
                  }
                }}
              >
                <Text style={styles.testBtnTxt}>Gửi push thử (Deal)</Text>
              </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? <ActivityIndicator style={{ marginTop: 12 }} color={CrmColors.blue600} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>Chưa ghi nhận thiết bị nào.</Text>
              <Text style={styles.emptyHint}>
                • Bấm «↻ Tải lại» để ping thủ công và kiểm tra lại.
                {'\n'}• Đảm bảo migration database/205_user_devices.sql đã chạy trên Supabase.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isThis = item.device_id === thisDeviceId;
          const isOnline =
            !!item.last_ping_at &&
            Date.now() - new Date(item.last_ping_at).getTime() < ONLINE_WINDOW_MS;
          return (
            <View style={[styles.card, CrmShadow.card, isThis && styles.cardThis]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.device_name || `${platformLabel(item.platform)} · ${item.os_name || ''}`}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, isOnline ? styles.badgeOn : styles.badgeOff]}>
                      <Text style={[styles.badgeTxt, isOnline ? styles.badgeTxtOn : styles.badgeTxtOff]}>
                        {isOnline ? 'Đang online' : 'Offline'}
                      </Text>
                    </View>
                    {isThis ? (
                      <View style={[styles.badge, styles.badgeSelf]}>
                        <Text style={[styles.badgeTxt, styles.badgeTxtSelf]}>Thiết bị này</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {!isThis ? (
                  <TouchableOpacity
                    onPress={() => onRevoke(item)}
                    disabled={revoking === item.id}
                    style={[styles.revokeBtn, revoking === item.id && { opacity: 0.5 }]}
                  >
                    <Text style={styles.revokeTxt}>
                      {revoking === item.id ? '…' : 'Đăng xuất'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.metaLine}>
                {platformLabel(item.platform)}
                {item.os_version ? ` · ${item.os_version}` : ''}
                {item.app_version ? ` · v${item.app_version}` : ''}
              </Text>
              {item.ip ? <Text style={styles.metaLine}>IP: {item.ip}</Text> : null}
              <Text style={styles.metaSub}>
                Hoạt động: {relativeTime(item.last_ping_at)} · Đăng nhập: {relativeTime(item.last_login_at)}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CrmColors.pageBg },
  list: { padding: 14, paddingBottom: 40 },
  header: { marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', color: CrmColors.gray900 },
  reloadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: CrmColors.blue50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  reloadTxt: { color: CrmColors.blue700, fontWeight: '700', fontSize: 12 },
  sub: { fontSize: 13, color: CrmColors.gray600, marginTop: 4, lineHeight: 18 },
  emptyBox: { paddingHorizontal: 8 },
  emptyHint: { fontSize: 12, color: CrmColors.gray500, lineHeight: 18, marginTop: 6, paddingHorizontal: 6 },
  error: {
    marginTop: 10,
    color: CrmColors.red700,
    backgroundColor: CrmColors.red50,
    borderColor: CrmColors.red200,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    fontSize: 12,
  },
  empty: { textAlign: 'center', color: CrmColors.gray500, marginTop: 30, fontStyle: 'italic' },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 10,
  },
  cardThis: { borderColor: CrmColors.blue100, backgroundColor: CrmColors.blue50 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeOn: { backgroundColor: CrmColors.emerald100 },
  badgeOff: { backgroundColor: CrmColors.gray100 },
  badgeSelf: { backgroundColor: CrmColors.blue100 },
  badgeTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  badgeTxtOn: { color: CrmColors.emerald700 },
  badgeTxtOff: { color: CrmColors.gray600 },
  badgeTxtSelf: { color: CrmColors.blue800 },
  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    backgroundColor: CrmColors.red50,
  },
  revokeTxt: { color: CrmColors.red700, fontWeight: '700', fontSize: 12 },
  metaLine: { fontSize: 12, color: CrmColors.gray600, marginTop: 6 },
  metaSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 4 },
  testRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  testBtn: {
    flex: 1,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  testBtnAlt: { backgroundColor: CrmColors.emerald600 },
  testBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  pushStatusBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
  },
  pushOk: {
    backgroundColor: CrmColors.emerald50,
    borderColor: CrmColors.emerald200,
  },
  pushWarn: {
    backgroundColor: CrmColors.amber50,
    borderColor: CrmColors.amber200,
  },
  pushStatusTitle: { fontSize: 12, fontWeight: '800', color: CrmColors.gray900 },
  pushStatusLine: { fontSize: 11, color: CrmColors.gray700, marginTop: 4 },
  pushStatusHint: { fontSize: 11, color: CrmColors.gray700, marginTop: 4, lineHeight: 15 },
});

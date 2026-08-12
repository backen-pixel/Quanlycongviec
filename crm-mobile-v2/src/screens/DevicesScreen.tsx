import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AUTH_EVENT_LABEL,
  fetchMyAuthEvents,
  fetchMyDevices,
  revokeDevice,
  type AuthEventRow,
  type UserDevice,
} from '../api/devices';
import { formatApiError } from '../api/client';
import { getOrCreateDeviceId } from '../lib/deviceHeartbeat';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ONLINE_WINDOW_MS = 90 * 1000;

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 60_000) return 'vừa xong';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleString('vi-VN');
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function platformIcon(platform?: string | null): keyof typeof Ionicons.glyphMap {
  if (platform === 'android' || platform === 'ios') return 'phone-portrait-outline';
  if (platform === 'desktop') return 'laptop-outline';
  return 'desktop-outline';
}

function eventTone(Colors: ThemeColors, event?: string | null) {
  switch (event) {
    case 'login_success':
      return { bg: Colors.greenSoft, text: Colors.green, border: 'rgba(34,197,94,0.35)' };
    case 'login_failed':
    case 'token_invalid':
      return { bg: Colors.redSoft, text: Colors.red, border: 'rgba(239,68,68,0.35)' };
    case 'logout':
    case 'auto_logout_midnight':
    case 'session_expired':
      return { bg: Colors.amberSoft, text: Colors.amber, border: 'rgba(245,158,11,0.35)' };
    case 'password_changed':
      return { bg: Colors.blueSoft, text: Colors.blue, border: 'rgba(47,107,255,0.35)' };
    default:
      return { bg: Colors.surfaceSoft, text: Colors.textMuted, border: Colors.border };
  }
}

function isDeviceOnline(d: UserDevice): boolean {
  if (typeof d.online === 'boolean') return d.online;
  if (!d.last_ping_at) return false;
  return Date.now() - new Date(d.last_ping_at).getTime() < ONLINE_WINDOW_MS;
}

export default function DevicesScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [events, setEvents] = useState<AuthEventRow[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [devList, eventList, devId] = await Promise.all([
        fetchMyDevices(ac.signal),
        fetchMyAuthEvents(80, ac.signal),
        getOrCreateDeviceId(),
      ]);
      if (!ac.signal.aborted) {
        setDevices(devList);
        setEvents(eventList);
        setCurrentDeviceId(devId);
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        setError(formatApiError(e));
        setDevices([]);
        setEvents([]);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  const onlineCount = useMemo(() => devices.filter((d) => isDeviceOnline(d)).length, [devices]);

  const onRevoke = (device: UserDevice) => {
    if (!device.id) return;
    const label = device.device_name || device.platform || 'thiết bị';
    Alert.alert('Đăng xuất thiết bị', `Gỡ "${label}" khỏi tài khoản?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => {
          setRevoking(device.id);
          void revokeDevice(device.id)
            .then(() => setDevices((list) => list.filter((d) => d.id !== device.id)))
            .catch((e: unknown) => Alert.alert('Lỗi', formatApiError(e)))
            .finally(() => setRevoking(null));
        },
      },
    ]);
  };

  const renderDevice = (d: UserDevice) => {
    const online = isDeviceOnline(d);
    const isCurrent = !!d.device_id && d.device_id === currentDeviceId;
    return (
      <View key={d.id} style={[styles.deviceCard, isCurrent && styles.deviceCardCurrent]}>
        <View style={[styles.deviceIcon, { backgroundColor: online ? Colors.greenSoft : Colors.surfaceSoft }]}>
          <Ionicons
            name={platformIcon(d.platform)}
            size={22}
            color={online ? Colors.green : Colors.textMuted}
          />
        </View>
        <View style={styles.deviceBody}>
          <View style={styles.deviceTitleRow}>
            <Text style={styles.deviceTitle} numberOfLines={1}>
              {d.device_name || `${d.platform || 'Thiết bị'} · ${d.os_name || ''}`}
            </Text>
            {online ? (
              <View style={[styles.badge, { backgroundColor: Colors.greenSoft }]}>
                <Text style={[styles.badgeTxt, { color: Colors.green }]}>Online</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: Colors.surfaceSoft }]}>
                <Text style={[styles.badgeTxt, { color: Colors.textMuted }]}>Offline</Text>
              </View>
            )}
            {isCurrent ? (
              <View style={[styles.badge, { backgroundColor: Colors.blueSoft }]}>
                <Text style={[styles.badgeTxt, { color: Colors.blue }]}>Thiết bị này</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.deviceMeta}>
            {d.platform || '—'}
            {d.os_version ? ` · ${d.os_version}` : ''}
            {d.app_version ? ` · v${d.app_version}` : ''}
          </Text>
          {d.ip ? <Text style={styles.deviceMeta}>IP: {d.ip}</Text> : null}
          <Text style={styles.deviceMeta}>
            Hoạt động: {relativeTime(d.last_ping_at)} · Đăng nhập: {relativeTime(d.last_login_at)}
          </Text>
        </View>
        {!isCurrent ? (
          <Pressable
            style={styles.revokeBtn}
            onPress={() => onRevoke(d)}
            disabled={revoking === d.id}
            hitSlop={8}
          >
            {revoking === d.id ? (
              <SpinningLoader color={Colors.red} size="small" />
            ) : (
              <Ionicons name="log-out-outline" size={20} color={Colors.red} />
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderEvent = ({ item: ev }: { item: AuthEventRow }) => {
    const tone = eventTone(Colors, ev.event);
    const label = AUTH_EVENT_LABEL[ev.event || ''] || ev.event || 'Sự kiện';
    return (
      <View style={styles.eventCard}>
        <View style={[styles.eventIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Ionicons
            name={
              ev.event === 'login_success'
                ? 'log-in-outline'
                : ev.event === 'login_failed'
                  ? 'alert-circle-outline'
                  : ev.event === 'password_changed'
                    ? 'key-outline'
                    : 'log-out-outline'
            }
            size={18}
            color={tone.text}
          />
        </View>
        <View style={styles.eventBody}>
          <View style={styles.eventTop}>
            <Text style={[styles.eventLabel, { color: tone.text }]}>{label}</Text>
            <Text style={styles.eventTime}>{formatDateTime(ev.occurred_at)}</Text>
          </View>
          <Text style={styles.eventSub} numberOfLines={2}>
            {[ev.device_name || ev.platform, ev.ip ? `IP ${ev.ip}` : null, ev.reason].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    );
  };

  const listHeader = (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Thiết bị đăng nhập</Text>
          <Text style={styles.sub}>
            {devices.length} thiết bị · {onlineCount} đang online
          </Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={() => void load(true)} hitSlop={8}>
          <Ionicons name="refresh" size={20} color={Colors.purple} />
        </Pressable>
      </View>

      <Text style={styles.secTitle}>Thiết bị đã / đang đăng nhập</Text>
      {loading && !devices.length ? (
        <View style={styles.centerBox}>
          <SpinningLoader color={Colors.purple} />
        </View>
      ) : devices.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="phone-portrait-outline" size={36} color={Colors.textFaint} />
          <Text style={styles.emptyTxt}>{error || 'Chưa ghi nhận thiết bị nào'}</Text>
        </View>
      ) : (
        <View style={styles.deviceList}>{devices.map(renderDevice)}</View>
      )}

      <Text style={styles.secTitle}>Lịch sử đăng nhập</Text>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: 0 }]}>
      <FlatList
        data={events}
        keyExtractor={(it) => it.id}
        renderItem={renderEvent}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.purple} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="time-outline" size={36} color={Colors.textFaint} />
              <Text style={styles.emptyTxt}>{error ? '' : 'Chưa có lịch sử đăng nhập'}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingBottom: 8,
      marginHorizontal: -16,
      paddingHorizontal: 16,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
      marginTop: 2,
    },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
      marginTop: 2,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    sub: { color: Colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
    secTitle: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 10,
    },
    centerBox: { padding: 24, alignItems: 'center' },
    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      gap: 10,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 8,
    },
    emptyTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    deviceList: { gap: 10, marginBottom: 4 },
    deviceCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      ...Shadow.card,
    },
    deviceCardCurrent: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft + '33' },
    deviceIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deviceBody: { flex: 1, minWidth: 0 },
    deviceTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    deviceTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
    badge: { borderRadius: Radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
    badgeTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    deviceMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' },
    revokeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: Colors.redSoft,
    },
    eventCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      marginBottom: 8,
    },
    eventIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventBody: { flex: 1, minWidth: 0 },
    eventTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    eventLabel: { fontSize: 14, fontWeight: '800', flex: 1 },
    eventTime: { color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
    eventSub: { color: Colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600', lineHeight: 16 },
  });

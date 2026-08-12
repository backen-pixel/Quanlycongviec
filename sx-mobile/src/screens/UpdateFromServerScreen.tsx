import Ionicons from '@expo/vector-icons/Ionicons';
import * as Application from 'expo-application';
import {
  useNavigation } from '@react-navigation/native';
import { useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { checkForUpdate, currentVersionCode, currentVersionName, downloadAndInstall } from '../lib/appUpdate';
import {
  checkAndApplyOtaUpdate,
  fetchOtaReleaseFromServer,
  getLocalOtaInfo,
  type OtaReleaseInfo,
} from '../lib/otaUpdate';
import { API_ORIGIN } from '../config';
import { HIT_TARGET, Radii, Spacing } from '../theme';

import SpinningLoader from '../components/SpinningLoader';
function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

export default function UpdateFromServerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [server, setServer] = useState<OtaReleaseInfo | null>(null);
  const local = getLocalOtaInfo();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        backBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cardAlt,
        },
        title: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 },
        content: { padding: Spacing.md, paddingBottom: insets.bottom + Spacing.lg },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
        loadingText: { marginTop: 12, fontSize: 13, color: colors.textMuted },
        banner: {
          backgroundColor: colors.success,
          borderRadius: Radii.lg,
          padding: Spacing.md,
          marginBottom: Spacing.md,
          alignItems: 'center',
        },
        bannerTitle: { fontSize: 14, fontWeight: '700', color: '#ECFDF5' },
        bannerVersion: { fontSize: 22, fontWeight: '900', color: colors.white, marginTop: 4 },
        card: {
          backgroundColor: colors.card,
          borderRadius: Radii.lg,
          padding: Spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
        row: { marginBottom: 10 },
        rowLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 2 },
        rowValue: { fontSize: 14, color: colors.text, lineHeight: 20 },
        rowValueHighlight: { color: colors.primary, fontWeight: '800', fontSize: 16 },
        mono: { fontFamily: 'monospace', fontSize: 11 },
        notes: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
        checkBtn: {
          marginTop: Spacing.md,
          minHeight: HIT_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.primary,
          borderRadius: Radii.md,
        },
        checkBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
      }),
    [colors, insets.bottom],
  );

  const loadServerInfo = useCallback(async () => {
    setLoading(true);
    const info = await fetchOtaReleaseFromServer(local.runtimeVersion);
    setServer(info);
    setLoading(false);
  }, [local.runtimeVersion]);

  useEffect(() => {
    void loadServerInfo();
  }, [loadServerInfo]);

  const onCheckUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const otaApplied = await checkAndApplyOtaUpdate();
      if (otaApplied) return;

      const apk = await checkForUpdate();
      if (apk.updateAvailable && apk.downloadUrl) {
        Alert.alert(
          `Có bản APK mới (${apk.latestVersion || ''})`,
          apk.releaseNotes || 'Tải và cài bản cập nhật mới?',
          [
            { text: 'Để sau', style: 'cancel' },
            {
              text: 'Cập nhật',
              onPress: () => {
                void downloadAndInstall(
                  apk.downloadUrl!,
                  apk.latestVersion || 'latest',
                  { expectedSize: apk.size },
                ).catch((e: Error) => Alert.alert('Lỗi', e.message || 'Cập nhật thất bại'));
              },
            },
          ],
        );
        return;
      }

      if (apk.needsUpdate && apk.apkReady === false && apk.latestVersion) {
        Alert.alert(
          `Bản ${apk.latestVersion} trên hệ thống`,
          'Bản cập nhật đã được đăng ký trên web nhưng file APK chưa sẵn sàng trên máy chủ. Vui lòng thử lại sau hoặc liên hệ quản trị.',
        );
        return;
      }

      await loadServerInfo();
      Alert.alert('Đã kiểm tra', 'App đang ở phiên bản mới nhất.');
    } finally {
      setChecking(false);
    }
  }, [loadServerInfo]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <SpinningLoader size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang đọc thông tin từ server…</Text>
        </View>
      </View>
    );
  }

  const otaVersion = server?.version;
  const fromServer = !local.isEmbeddedLaunch && otaVersion;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Cập nhật ứng dụng</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {fromServer ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Đã cập nhật từ server</Text>
            <Text style={styles.bannerVersion}>Bản {otaVersion}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thông tin cập nhật</Text>

          <InfoRow styles={styles} label="Nguồn" value="Máy chủ (OTA)" />
          <InfoRow styles={styles} label="Server" value={API_ORIGIN.replace(/^https?:\/\//, '')} />
          <InfoRow
            styles={styles}
            label="APK gốc"
            value={`v${currentVersionName()} (code ${currentVersionCode() ?? Application.nativeBuildVersion ?? '—'})`}
          />
          <InfoRow
            styles={styles}
            label="Bundle OTA trên server"
            value={otaVersion ? `v${otaVersion}` : 'Chưa có'}
            highlight={!!otaVersion}
          />
          <InfoRow styles={styles} label="Runtime" value={local.runtimeVersion || server?.runtimeVersion || '—'} />
          <InfoRow styles={styles} label="Update ID" value={local.updateId || server?.updateId || '—'} mono />
          <InfoRow
            styles={styles}
            label="Đang chạy bundle"
            value={local.isEmbeddedLaunch ? 'Gốc trong APK' : 'Từ server'}
          />
          <InfoRow styles={styles} label="Phát hành lúc" value={formatDate(server?.publishedAt)} />
          {server?.releaseNotes ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Ghi chú</Text>
              <Text style={styles.notes}>{server.releaseNotes}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.checkBtn}
          onPress={() => void onCheckUpdate()}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking ? (
            <SpinningLoader color={colors.white} />
          ) : (
            <Ionicons name="cloud-download-outline" size={18} color={colors.white} />
          )}
          <Text style={styles.checkBtnText}>
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  label,
  value,
  highlight,
  mono,
  styles,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          highlight && styles.rowValueHighlight,
          mono && styles.mono,
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

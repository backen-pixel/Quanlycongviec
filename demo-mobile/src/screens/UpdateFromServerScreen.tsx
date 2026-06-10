import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Application from 'expo-application';
import { API_ORIGIN } from '../config';
import {
  fetchOtaReleaseFromServer,
  getLocalOtaInfo,
  type OtaReleaseInfo,
} from '../lib/otaUpdate';

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

export default function UpdateFromServerScreen() {
  const [loading, setLoading] = useState(true);
  const [server, setServer] = useState<OtaReleaseInfo | null>(null);
  const local = getLocalOtaInfo();

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const info = await fetchOtaReleaseFromServer(local.runtimeVersion);
      setServer(info);
      setLoading(false);
    })();
  }, [local.runtimeVersion]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Đang đọc thông tin từ server…</Text>
      </View>
    );
  }

  const otaVersion = server?.version;
  const fromServer = !local.isEmbeddedLaunch && otaVersion;

  return (
    <View style={styles.wrap}>
      {fromServer && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Đã cập nhật từ server</Text>
          <Text style={styles.bannerVersion}>Bản {otaVersion}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Thông tin cập nhật</Text>

        <Row label="Nguồn" value="Máy chủ (OTA)" />
        <Row label="Server" value={API_ORIGIN} />
        <Row label="APK gốc" value={`v${Application.nativeApplicationVersion} (code ${Application.nativeBuildVersion})`} />
        <Row label="Bundle OTA trên server" value={otaVersion ? `v${otaVersion}` : 'Chưa có'} highlight={!!otaVersion} />
        <Row label="Runtime" value={local.runtimeVersion || server?.runtimeVersion || '—'} />
        <Row label="Update ID" value={local.updateId || server?.updateId || '—'} mono />
        <Row label="Đang chạy bundle" value={local.isEmbeddedLaunch ? 'Gốc trong APK' : 'Từ server'} />
        <Row label="Phát hành lúc" value={formatDate(server?.publishedAt)} />
        {server?.releaseNotes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.rowLabel}>Ghi chú</Text>
            <Text style={styles.notes}>{server.releaseNotes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
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

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 13, color: '#64748B' },
  banner: {
    backgroundColor: '#059669',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#ECFDF5' },
  bannerVersion: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  row: { marginBottom: 10 },
  rowLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 2 },
  rowValue: { fontSize: 14, color: '#334155', lineHeight: 20 },
  rowValueHighlight: { color: '#2563EB', fontWeight: '800', fontSize: 16 },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  notesBlock: { marginTop: 4 },
  notes: { fontSize: 13, color: '#475569', lineHeight: 19 },
});

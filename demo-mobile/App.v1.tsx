/** APK 1.0.0 — chỉ màn Tủ bếp (dùng khi build v1). */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Application from 'expo-application';
import UpdateGate from './src/components/UpdateGate';
import { checkAndApplyOtaUpdate } from './src/lib/otaUpdate';

export default function App() {
  const [otaStatus, setOtaStatus] = useState('');

  useEffect(() => {
    void (async () => {
      setOtaStatus('Đang kiểm tra OTA…');
      const applied = await checkAndApplyOtaUpdate();
      setOtaStatus(applied ? 'Đã áp dụng OTA' : 'Không có OTA mới');
    })();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.badge}>TuBep Demo v1</Text>
      <Text style={styles.title}>Tủ bếp</Text>
      <Text style={styles.meta}>
        v{Application.nativeApplicationVersion} (code {Application.nativeBuildVersion})
      </Text>
      <Text style={styles.ota}>{otaStatus}</Text>
      <UpdateGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF2F8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
  },
  title: { fontSize: 42, fontWeight: '900', color: '#0F172A' },
  meta: { marginTop: 20, fontSize: 12, color: '#94A3B8', fontFamily: 'monospace' },
  ota: { marginTop: 8, fontSize: 11, color: '#64748B' },
});

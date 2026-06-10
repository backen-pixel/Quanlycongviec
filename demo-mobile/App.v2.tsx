/**
 * v2 — hai tab: Tủ bếp + Kính (dùng sau khi cài APK v1, phát hành OTA).
 *
 * Cách dùng:
 *   1. Sao nội dung file này vào App.tsx (hoặc đổi export trong index.ts)
 *   2. cd backend && node scripts/publish-ota.js --app tubep-demo --dir ../demo-mobile --runtime 1.0.0 --notes "Thêm trang Kính"
 *   3. Mở lại app v1 trên máy → tự tải OTA → thấy 2 tab
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Application from 'expo-application';
import UpdateGate from './src/components/UpdateGate';
import { checkAndApplyOtaUpdate } from './src/lib/otaUpdate';

type Tab = 'tubep' | 'kinh';

export default function App() {
  const [tab, setTab] = useState<Tab>('tubep');
  const [otaStatus, setOtaStatus] = useState('');

  useEffect(() => {
    void (async () => {
      const applied = await checkAndApplyOtaUpdate();
      setOtaStatus(applied ? 'OTA applied' : 'No OTA');
    })();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.badge}>TuBep Demo v2 (OTA)</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'tubep' && styles.tabActive]}
          onPress={() => setTab('tubep')}
        >
          <Text style={[styles.tabText, tab === 'tubep' && styles.tabTextActive]}>Tủ bếp</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'kinh' && styles.tabActive]}
          onPress={() => setTab('kinh')}
        >
          <Text style={[styles.tabText, tab === 'kinh' && styles.tabTextActive]}>Kính</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'tubep' ? (
          <Text style={styles.title}>Tủ bếp</Text>
        ) : (
          <Text style={styles.title}>Kính</Text>
        )}
      </View>

      <Text style={styles.meta}>
        v{Application.nativeApplicationVersion} (code {Application.nativeBuildVersion}) · {otaStatus}
      </Text>
      <UpdateGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2F8', paddingTop: 48, paddingHorizontal: 20 },
  badge: {
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 24,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  tabActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#2563EB' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 42, fontWeight: '900', color: '#0F172A' },
  meta: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginBottom: 16 },
});

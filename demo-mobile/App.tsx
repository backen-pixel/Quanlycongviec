/**
 * v3 — thêm tab Cập nhật (đã cập nhật từ server, thông báo bản 1.0.3).
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Application from 'expo-application';
import UpdateGate from './src/components/UpdateGate';
import OtaSuccessNotice from './src/components/OtaSuccessNotice';
import UpdateFromServerScreen from './src/screens/UpdateFromServerScreen';
import { checkAndApplyOtaUpdate } from './src/lib/otaUpdate';

type Tab = 'tubep' | 'kinh' | 'capnhat';

export default function App() {
  const [tab, setTab] = useState<Tab>('tubep');
  const [otaPhase, setOtaPhase] = useState<'checking' | 'downloading' | 'done' | 'none'>('checking');

  useEffect(() => {
    void (async () => {
      setOtaPhase('checking');
      const applied = await checkAndApplyOtaUpdate({
        onFetching: () => setOtaPhase('downloading'),
      });
      if (!applied) setOtaPhase('none');
    })();
  }, []);

  if (otaPhase === 'checking' || otaPhase === 'downloading') {
    return (
      <View style={styles.otaBlock}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.otaBlockTitle}>Cập nhật bắt buộc</Text>
        <Text style={styles.otaBlockSub}>
          {otaPhase === 'checking' ? 'Đang kiểm tra bản mới…' : 'Đang tải bản cập nhật…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.badge}>TuBep Demo v3</Text>

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
          <Text style={[styles.tabText, tab === 'kinh' && styles.tabTextActive]}>Cửa kính</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'capnhat' && styles.tabActive]}
          onPress={() => setTab('capnhat')}
        >
          <Text style={[styles.tabText, tab === 'capnhat' && styles.tabTextActive]}>Cập nhật</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'tubep' && <Text style={styles.title}>Tủ bếp</Text>}
        {tab === 'kinh' && <Text style={styles.title}>Cửa kính</Text>}
        {tab === 'capnhat' && <UpdateFromServerScreen />}
      </View>

      {tab !== 'capnhat' && (
        <Text style={styles.meta}>
          v{Application.nativeApplicationVersion} (code {Application.nativeBuildVersion})
        </Text>
      )}
      <OtaSuccessNotice />
      <UpdateGate />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2F8', paddingTop: 48, paddingHorizontal: 20 },
  otaBlock: {
    flex: 1,
    backgroundColor: '#EEF2F8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  otaBlockTitle: { marginTop: 16, fontSize: 18, fontWeight: '800', color: '#0F172A' },
  otaBlockSub: { marginTop: 8, fontSize: 14, color: '#64748B' },
  badge: {
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 24,
  },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  tabActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#2563EB' },
  content: { flex: 1 },
  title: { fontSize: 42, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginTop: 40 },
  meta: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginBottom: 16 },
});

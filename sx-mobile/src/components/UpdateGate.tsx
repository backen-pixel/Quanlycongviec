/**
 * Kiểm tra cập nhật full APK lúc mở app.
 * - Có file tải được → modal cập nhật bình thường.
 * - Có bản mới nhưng file chưa sẵn sàng (apkReady=false) → thông báo nhẹ.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { checkForUpdate, downloadAndInstall, type UpdateCheckResult } from '../lib/appUpdate';

type GateMode = 'download' | 'pending';

export default function UpdateGate() {
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [mode, setMode] = useState<GateMode>('download');
  const [visible, setVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await checkForUpdate();
      if (!mounted) return;
      if (res.updateAvailable && res.downloadUrl) {
        setInfo(res);
        setMode('download');
        setVisible(true);
        return;
      }
      if (res.needsUpdate && res.apkReady === false && res.latestVersion) {
        setInfo(res);
        setMode('pending');
        setVisible(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onUpdate = useCallback(async () => {
    if (!info?.downloadUrl) return;
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadAndInstall(info.downloadUrl, info.latestVersion || 'latest', {
        expectedSize: info.size,
        onProgress: (r) => setProgress(r),
      });
      if (!info.mandatory) setVisible(false);
    } catch (e: any) {
      setError(e?.message || 'Cập nhật thất bại');
    } finally {
      setDownloading(false);
    }
  }, [info]);

  if (!visible || !info) return null;

  const pct = Math.round(progress * 100);
  const isPending = mode === 'pending';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!info.mandatory && !downloading) setVisible(false);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {isPending ? 'Bản cập nhật đang chờ phát hành' : 'Có bản cập nhật mới'}
          </Text>
          <Text style={styles.version}>Phiên bản {info.latestVersion}</Text>

          {!!info.releaseNotes && (
            <ScrollView style={styles.notes}>
              <Text style={styles.notesText}>{info.releaseNotes}</Text>
            </ScrollView>
          )}

          {isPending ? (
            <Text style={styles.pending}>
              Hệ thống đã ghi nhận bản {info.latestVersion} trên web, nhưng file cài đặt chưa sẵn sàng
              trên máy chủ. Vui lòng thử lại sau hoặc liên hệ quản trị để upload APK.
            </Text>
          ) : null}

          {info.mandatory && !isPending && (
            <Text style={styles.mandatory}>Bản cập nhật bắt buộc — cần cập nhật để tiếp tục sử dụng.</Text>
          )}

          {downloading ? (
            <View style={styles.progressWrap}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.progressText}>Đang tải… {pct}%</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
            </View>
          ) : (
            <>
              {!!error && <Text style={styles.error}>{error}</Text>}
              {!isPending ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={onUpdate}>
                  <Text style={styles.primaryBtnText}>Cập nhật ngay</Text>
                </TouchableOpacity>
              ) : null}
              {!info.mandatory && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setVisible(false)}>
                  <Text style={styles.secondaryBtnText}>Để sau</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%', maxWidth: 420 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  version: { fontSize: 13, color: '#2563EB', fontWeight: '700', marginTop: 2 },
  notes: { maxHeight: 180, marginTop: 12 },
  notesText: { fontSize: 13, color: '#475569', lineHeight: 19 },
  pending: { fontSize: 12, color: '#B45309', marginTop: 12, lineHeight: 18, fontWeight: '600' },
  mandatory: { fontSize: 12, color: '#DC2626', marginTop: 12, fontWeight: '600' },
  progressWrap: { marginTop: 18, alignItems: 'center' },
  progressText: { fontSize: 13, color: '#475569', marginTop: 8 },
  bar: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, width: '100%', marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#2563EB' },
  error: { fontSize: 12, color: '#DC2626', marginTop: 12 },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: { paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  secondaryBtnText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
});

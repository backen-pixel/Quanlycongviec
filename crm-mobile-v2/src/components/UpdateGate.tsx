/**
 * Kiểm tra cập nhật APK lúc mở app — giống TuBep Demo.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { checkForUpdate, downloadAndInstall, type UpdateCheckResult } from '../lib/appUpdate';
import { Colors, Radii } from '../theme';

export default function UpdateGate() {
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const res = await checkForUpdate();
      if (mounted && res.updateAvailable && res.downloadUrl) {
        setInfo(res);
        setVisible(true);
      }
    })();
    return () => {
      mounted = false;
    };
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cập nhật thất bại';
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }, [info]);

  if (!visible || !info) return null;

  const pct = Math.round(progress * 100);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!info.mandatory) setVisible(false);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Có bản cập nhật mới</Text>
          <Text style={styles.version}>Phiên bản {info.latestVersion}</Text>

          {!!info.releaseNotes && (
            <ScrollView style={styles.notes}>
              <Text style={styles.notesText}>{info.releaseNotes}</Text>
            </ScrollView>
          )}

          {info.mandatory && (
            <Text style={styles.mandatory}>
              Bản cập nhật bắt buộc — cần cập nhật để tiếp tục sử dụng.
            </Text>
          )}

          {downloading ? (
            <View style={styles.progressWrap}>
              <ActivityIndicator color={Colors.blue} />
              <Text style={styles.progressText}>Đang tải… {pct}%</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
            </View>
          ) : (
            <>
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void onUpdate()}>
                <Text style={styles.primaryBtnText}>Cập nhật ngay</Text>
              </TouchableOpacity>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.lg,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  version: { fontSize: 13, color: Colors.blue, fontWeight: '700', marginTop: 4 },
  notes: { maxHeight: 180, marginTop: 12 },
  notesText: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  mandatory: { fontSize: 12, color: Colors.red, marginTop: 12, fontWeight: '600' },
  progressWrap: { marginTop: 18, alignItems: 'center' },
  progressText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  bar: {
    height: 6,
    backgroundColor: Colors.surfaceSoft,
    borderRadius: 3,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: Colors.blue },
  error: { fontSize: 12, color: Colors.red, marginTop: 12 },
  primaryBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: { paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  secondaryBtnText: { color: Colors.textFaint, fontWeight: '600', fontSize: 14 },
});

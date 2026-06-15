/**
 * Kiểm tra cập nhật APK lúc mở app — giống TuBep Demo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  checkForUpdate,
  consumeUpdateSuccessMessage,
  downloadApkToCache,
  openDownloadedApk,
  type UpdateCheckResult,
} from '../lib/appUpdate';
import { Radii, useColors, type ThemeColors } from '../theme';

export default function UpdateGate() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [readyUri, setReadyUri] = useState<string | null>(null);
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const successMsg = await consumeUpdateSuccessMessage();
      if (mounted && successMsg) setToast(successMsg);
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const startDownload = useCallback(async (installAfterDownload: boolean, hideModal: boolean) => {
    if (!info?.downloadUrl) return;
    setError(null);
    setDownloading(true);
    setProgress(0);
    if (hideModal && !info.mandatory) setVisible(false);
    try {
      const apk = await downloadApkToCache(info.downloadUrl, info.latestVersion || 'latest', {
        expectedSize: info.size,
        onProgress: (r) => setProgress(r),
      });
      if (installAfterDownload) {
        await openDownloadedApk(apk.uri, {
          version: info.latestVersion || null,
          versionCode: info.latestVersionCode ?? null,
        });
        setToast('Đã mở màn hình cài đặt. Sau khi cài xong, mở lại app để nhận thông báo thành công.');
        if (!info.mandatory) setVisible(false);
      } else {
        setReadyUri(apk.uri);
        setReadyVersion(info.latestVersion || null);
        setToast(
          `Đã tải xong bản ${info.latestVersion || ''}. Bạn có thể cài đặt ngay khi thuận tiện.`,
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cập nhật thất bại';
      setError(msg);
      if (!visible) setToast(msg);
    } finally {
      setDownloading(false);
    }
  }, [info, visible]);

  const installReadyApk = useCallback(async () => {
    if (!readyUri || !info) return;
    try {
      await openDownloadedApk(readyUri, {
        version: readyVersion || info.latestVersion || null,
        versionCode: info.latestVersionCode ?? null,
      });
      setToast('Đã mở màn hình cài đặt bản cập nhật.');
      setReadyUri(null);
      setReadyVersion(null);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Không mở được màn hình cài đặt');
    }
  }, [readyUri, readyVersion, info]);

  const pct = Math.round(progress * 100);

  if (!info && !toast) return null;

  return (
    <>
      {!!info && (
        <Modal
          visible={visible}
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
                  {!info.mandatory ? (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => setVisible(false)}>
                      <Text style={styles.secondaryBtnText}>Tiếp tục dùng app</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <>
                  {!!error && <Text style={styles.error}>{error}</Text>}
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => void startDownload(true, false)}
                  >
                    <Text style={styles.primaryBtnText}>Tải & cài ngay</Text>
                  </TouchableOpacity>
                  {!info.mandatory && (
                    <TouchableOpacity
                      style={styles.midBtn}
                      onPress={() => void startDownload(false, true)}
                    >
                      <Text style={styles.midBtnText}>Tải nền, cài sau</Text>
                    </TouchableOpacity>
                  )}
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
      )}

      {!!info && downloading && !visible && (
        <View style={styles.floating}>
          <Text style={styles.floatingText}>Đang tải bản {info.latestVersion}… {pct}%</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}

      {!!info && !!readyUri && !downloading && (
        <View style={styles.floating}>
          <Text style={styles.floatingText}>
            Đã tải xong bản {readyVersion || info.latestVersion}. Bạn có thể cài ngay.
          </Text>
          <Pressable style={styles.installBtn} onPress={() => void installReadyApk()}>
            <Text style={styles.installBtnText}>Cài đặt ngay</Text>
          </Pressable>
        </View>
      )}

      {!!toast && (
        <View style={styles.toast}>
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  midBtn: {
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  midBtnText: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  floating: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 24,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    zIndex: 60,
  },
  floatingText: { color: Colors.text, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  installBtn: {
    marginTop: 2,
    height: 38,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blue,
  },
  installBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 56,
    backgroundColor: Colors.greenSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 70,
  },
  toastTxt: { color: Colors.green, fontSize: 12, fontWeight: '700' },
});

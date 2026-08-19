import SpinningLoader from './SpinningLoader';
/**
 * Kiểm tra cập nhật APK — lúc mở app, định kỳ và khi quay lại foreground.
 * Modal lần đầu; banner nhẹ khi đang dùng app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  checkForUpdate,
  clearDismissedUpdate,
  consumeUpdateSuccessMessage,
  dismissUpdateForRelease,
  downloadApkToCache,
  isUpToDate,
  openDownloadedApk,
  openApkInstallSettings,
  reconcileUpdateStorage,
  shouldSuppressUpdateModal,
  type UpdateCheckResult,
} from '../lib/appUpdate';
import { isInstallPermissionError } from '../lib/apkInstallNative';
import { hasPendingBubbleChat } from '../lib/bubbleChatPending';
import { isOnBubbleChatRoute } from '../navigation/navigationRef';
import { Radii, type AppColors } from '../theme';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FOREGROUND_DEBOUNCE_MS = 60 * 1000;

function promptInstallPermission(onRetry?: () => void) {
  Alert.alert(
    'Cần quyền cài đặt',
    'Android cần bật "Cho phép cài đặt ứng dụng không rõ nguồn" cho Lắp đặt.\n\n'
      + '1. Bấm "Mở cài đặt"\n'
      + '2. Bật công tắc cho phép cài đặt\n'
      + '3. Quay lại app và bấm "Cài" lại',
    [
      { text: 'Để sau', style: 'cancel' },
      {
        text: 'Mở cài đặt',
        onPress: () => {
          void openApkInstallSettings();
          if (onRetry) setTimeout(onRetry, 1500);
        },
      },
    ],
  );
}

function handleInstallError(e: unknown, onRetry?: () => void) {
  const msg = e instanceof Error ? e.message : 'Cập nhật thất bại';
  if (isInstallPermissionError(e)) {
    promptInstallPermission(onRetry);
    return msg;
  }
  return msg;
}

export default function UpdateGate() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [readyUri, setReadyUri] = useState<string | null>(null);
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastCheckAt = useRef(0);
  const checkingRef = useRef(false);

  const runCheck = useCallback(async (opts: { allowModal?: boolean } = {}) => {
    if (hasPendingBubbleChat()) return;
    if (isOnBubbleChatRoute()) return;
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      await reconcileUpdateStorage();
      const successMsg = await consumeUpdateSuccessMessage();
      if (successMsg) {
        setToast(successMsg);
        setInfo(null);
        setVisible(false);
        setBannerVisible(false);
        setReadyUri(null);
        return;
      }

      const res = await checkForUpdate();
      lastCheckAt.current = Date.now();

      if (isUpToDate(res)) {
        await clearDismissedUpdate();
        setInfo(null);
        setVisible(false);
        setBannerVisible(false);
        setReadyUri(null);
        return;
      }

      if (!res.updateAvailable || !res.downloadUrl) {
        if (res.needsUpdate && res.latestVersion) {
          setInfo(res);
          setVisible(false);
          setBannerVisible(true);
          return;
        }
        setInfo(null);
        setVisible(false);
        setBannerVisible(false);
        return;
      }

      setInfo(res);
      const suppressed = await shouldSuppressUpdateModal(res);

      if (res.mandatory) {
        setVisible(true);
        setBannerVisible(false);
        return;
      }

      if (suppressed) {
        setVisible(false);
        setBannerVisible(true);
        return;
      }

      if (opts.allowModal) {
        setVisible(true);
        setBannerVisible(false);
      } else {
        setVisible(false);
        setBannerVisible(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void runCheck({ allowModal: true });

    const interval = setInterval(() => {
      void runCheck({ allowModal: false });
    }, CHECK_INTERVAL_MS);

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastCheckAt.current < FOREGROUND_DEBOUNCE_MS) return;
      void runCheck({ allowModal: false });
    });

    return () => {
      clearInterval(interval);
      appSub.remove();
    };
  }, [runCheck]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
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
        setVisible(false);
        setBannerVisible(true);
        setToast('Đã mở màn hình cài đặt. Sau khi cài xong, mở lại app để hết thông báo cập nhật.');
      } else {
        setReadyUri(apk.uri);
        setReadyVersion(info.latestVersion || null);
        setBannerVisible(true);
        setToast(`Đã tải xong bản ${info.latestVersion || ''}. Bạn có thể cài khi thuận tiện.`);
      }
    } catch (e: unknown) {
      const msg = handleInstallError(e, () => void startDownload(true, false));
      setError(msg);
      setToast(msg);
    } finally {
      setDownloading(false);
    }
  }, [info]);

  const installReadyApk = useCallback(async () => {
    if (!readyUri || !info) return;
    try {
      await openDownloadedApk(readyUri, {
        version: readyVersion || info.latestVersion || null,
        versionCode: info.latestVersionCode ?? null,
      });
      setVisible(false);
      setBannerVisible(true);
      setToast('Đã mở màn hình cài đặt. Mở lại app sau khi cài xong.');
      setReadyUri(null);
      setReadyVersion(null);
    } catch (e: unknown) {
      setToast(handleInstallError(e, () => void installReadyApk()));
    }
  }, [readyUri, readyVersion, info]);

  const dismissForNow = useCallback(async () => {
    if (info) await dismissUpdateForRelease(info);
    setVisible(false);
    setBannerVisible(true);
  }, [info]);

  const hideBanner = useCallback(async () => {
    if (info) await dismissUpdateForRelease(info);
    setBannerVisible(false);
  }, [info]);

  const openModalFromBanner = useCallback(() => {
    setBannerVisible(false);
    setVisible(true);
  }, []);

  const pct = Math.round(progress * 100);
  const showBanner = !!info && bannerVisible && !visible && !info.mandatory;

  if (!info && !toast && !showBanner) return null;

  return (
    <>
      {showBanner ? (
        <View style={[styles.banner, { top: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Có bản mới {info.latestVersion}</Text>
            <Text style={styles.bannerSub} numberOfLines={2}>
              {readyUri
                ? 'APK đã tải — bấm Cài để cập nhật'
                : info.downloadUrl
                  ? 'Cập nhật ngay hoặc để sau — không cần tắt app'
                  : 'Bản mới đang chờ admin upload APK lên server'}
            </Text>
          </View>
          {readyUri ? (
            <Pressable style={styles.bannerBtn} onPress={() => void installReadyApk()}>
              <Text style={styles.bannerBtnTxt}>Cài</Text>
            </Pressable>
          ) : info.downloadUrl ? (
            <Pressable style={styles.bannerBtn} onPress={() => void startDownload(true, true)}>
              <Text style={styles.bannerBtnTxt}>Cập nhật</Text>
            </Pressable>
          ) : null}
          <Pressable hitSlop={8} onPress={() => void hideBanner()}>
            <Text style={styles.bannerClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {!!info && (
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!info.mandatory) void dismissForNow();
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

              {!info.downloadUrl ? (
                <Text style={styles.pending}>
                  Hệ thống đã ghi nhận bản {info.latestVersion}, nhưng file cài đặt chưa sẵn sàng trên
                  server. Thử lại sau hoặc liên hệ quản trị.
                </Text>
              ) : null}

              {info.mandatory && !!info.downloadUrl && (
                <Text style={styles.mandatory}>
                  Bản cập nhật bắt buộc — cần cập nhật để tiếp tục sử dụng.
                </Text>
              )}

              {downloading ? (
                <View style={styles.progressWrap}>
                  <SpinningLoader color={colors.primary} />
                  <Text style={styles.progressText}>Đang tải… {pct}%</Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                  {!info.mandatory ? (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => void dismissForNow()}>
                      <Text style={styles.secondaryBtnText}>Tiếp tục dùng app</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <>
                  {!!error && <Text style={styles.error}>{error}</Text>}
                  {info.downloadUrl ? (
                    <>
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
                    </>
                  ) : null}
                  {!info.mandatory && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => void dismissForNow()}>
                      <Text style={styles.secondaryBtnText}>Để sau (nhắc nhẹ sau)</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

      {!!info && downloading && !visible && (
        <View style={[styles.floating, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.floatingText}>Đang tải bản {info.latestVersion}… {pct}%</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}

      {!!info && !!readyUri && !downloading && !showBanner && (
        <View style={[styles.floating, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.floatingText}>
            Đã tải xong bản {readyVersion || info.latestVersion}. Bạn có thể cài ngay.
          </Text>
          <Pressable style={styles.installBtn} onPress={() => void installReadyApk()}>
            <Text style={styles.installBtnText}>Cài đặt ngay</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={openModalFromBanner}>
            <Text style={styles.secondaryBtnText}>Chi tiết</Text>
          </Pressable>
        </View>
      )}

      {!!toast && (
        <View style={[styles.toast, { top: insets.top + (showBanner ? 72 : 8) }]}>
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 80,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.bgElevated,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: c.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    bannerTitle: { fontSize: 13, fontWeight: '800', color: c.text },
    bannerSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    bannerBtn: {
      backgroundColor: c.primary,
      borderRadius: Radii.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bannerBtnTxt: { color: c.white, fontWeight: '800', fontSize: 12 },
    bannerClose: { color: c.textMuted, fontSize: 16, paddingHorizontal: 4 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: Radii.lg,
      padding: 22,
      width: '100%',
      maxWidth: 420,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    version: { fontSize: 13, color: c.primary, fontWeight: '700', marginTop: 4 },
    notes: { maxHeight: 180, marginTop: 12 },
    notesText: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    pending: { fontSize: 12, color: c.warning, marginTop: 12, lineHeight: 18, fontWeight: '600' },
    mandatory: { fontSize: 12, color: c.danger, marginTop: 12, fontWeight: '600' },
    progressWrap: { marginTop: 18, alignItems: 'center' },
    progressText: { fontSize: 13, color: c.textMuted, marginTop: 8 },
    bar: {
      height: 6,
      backgroundColor: c.cardAlt,
      borderRadius: 3,
      width: '100%',
      marginTop: 8,
      overflow: 'hidden',
    },
    barFill: { height: '100%', backgroundColor: c.primary },
    error: { fontSize: 12, color: c.danger, marginTop: 12 },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: Radii.md,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 18,
    },
    primaryBtnText: { color: c.white, fontWeight: '800', fontSize: 15 },
    secondaryBtn: { paddingVertical: 11, alignItems: 'center', marginTop: 6 },
    secondaryBtnText: { color: c.textFaint, fontWeight: '600', fontSize: 14 },
    midBtn: {
      borderRadius: Radii.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.cardAlt,
    },
    midBtnText: { color: c.text, fontWeight: '700', fontSize: 14 },
    floating: {
      position: 'absolute',
      left: 14,
      right: 14,
      backgroundColor: c.bgElevated,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      zIndex: 60,
    },
    floatingText: { color: c.text, fontSize: 12, fontWeight: '600', marginBottom: 8 },
    installBtn: {
      marginTop: 2,
      height: 38,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    installBtnText: { color: c.white, fontWeight: '800', fontSize: 13 },
    toast: {
      position: 'absolute',
      left: 14,
      right: 14,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      zIndex: 90,
    },
    toastTxt: { color: c.primary, fontSize: 12, fontWeight: '700' },
  });
}

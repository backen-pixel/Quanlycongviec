/**
 * Kiểm tra cập nhật APK — lúc mở app, định kỳ và khi quay lại foreground.
 * Modal chỉ hiện lần đầu; sau đó dùng banner nhẹ trong lúc dùng app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkForUpdate,
  clearDismissedUpdate,
  reconcileUpdateStorage,
  consumeUpdateSuccessMessage,
  dismissUpdateForRelease,
  downloadApkToCache,
  isUpToDate,
  openDownloadedApk,
  shouldSuppressUpdateModal,
  type UpdateCheckResult,
} from '../lib/appUpdate';
import {
  clearAppUpdateNotifyState,
  consumeOpenUpdateGateRequest,
  maybeNotifyAppUpdate,
  onOpenUpdateGateRequest,
} from '../lib/appUpdateNotify';
import { hasPendingBubbleChat } from '../lib/bubbleChatPending';
import { isOnBubbleChatRoute } from '../navigation/navigationRef';
import { Radii, useColors, type ThemeColors } from '../theme';
import SpinningLoader from './SpinningLoader';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOREGROUND_DEBOUNCE_MS = 90 * 1000;

export default function UpdateGate() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

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

  const runCheck = useCallback(async (opts: { allowModal?: boolean; forceModal?: boolean } = {}) => {
    if (checkingRef.current) return;
    // Ưu tiên mở chat overlay — không chặn bằng modal cập nhật.
    if (hasPendingBubbleChat()) return;
    if (isOnBubbleChatRoute()) return;
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
        await clearAppUpdateNotifyState();
        return;
      }

      const res = await checkForUpdate();
      lastCheckAt.current = Date.now();

      if (isUpToDate(res)) {
        await clearDismissedUpdate();
        await clearAppUpdateNotifyState();
        setInfo(null);
        setVisible(false);
        setBannerVisible(false);
        setReadyUri(null);
        return;
      }

      if (!res.updateAvailable || !res.downloadUrl) {
        setInfo(null);
        setVisible(false);
        setBannerVisible(false);
        return;
      }

      setInfo(res);
      void maybeNotifyAppUpdate(res);

      if (opts.forceModal || res.mandatory) {
        setVisible(true);
        setBannerVisible(false);
        return;
      }

      const suppressed = await shouldSuppressUpdateModal(res);

      if (suppressed) {
        if (isUpToDate(res)) {
          await clearDismissedUpdate();
          await clearAppUpdateNotifyState();
          setInfo(null);
          setVisible(false);
          setBannerVisible(false);
          setReadyUri(null);
          return;
        }
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
    /** Nhường cold start Overview — check update sau vài giây. */
    const bootTimer = setTimeout(() => {
      const forceModal = consumeOpenUpdateGateRequest();
      void runCheck({ allowModal: true, forceModal });
    }, 6000);

    const interval = setInterval(() => {
      void runCheck({ allowModal: false });
    }, CHECK_INTERVAL_MS);

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (hasPendingBubbleChat()) return;
      if (isOnBubbleChatRoute()) return;
      if (consumeOpenUpdateGateRequest()) {
        void runCheck({ allowModal: true, forceModal: true });
        return;
      }
      if (Date.now() - lastCheckAt.current < FOREGROUND_DEBOUNCE_MS) return;
      void runCheck({ allowModal: false });
    });

    const unsubOpen = onOpenUpdateGateRequest(() => {
      void runCheck({ allowModal: true, forceModal: true });
    });

    return () => {
      clearTimeout(bootTimer);
      clearInterval(interval);
      appSub.remove();
      unsubOpen();
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
        expectedSha256: info.sha256,
        onProgress: (r) => setProgress(r),
      });
      if (installAfterDownload) {
        await openDownloadedApk(apk.uri, {
          version: info.latestVersion || null,
          versionCode: info.latestVersionCode ?? null,
        });
        setVisible(false);
        setBannerVisible(true);
        setToast('Đã mở màn hình cài đặt. Sau khi cài xong, mở lại app một lần để hết thông báo cập nhật.');
      } else {
        setReadyUri(apk.uri);
        setReadyVersion(info.latestVersion || null);
        setBannerVisible(true);
        setToast(`Đã tải xong bản ${info.latestVersion || ''}. Bạn có thể cài khi thuận tiện.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cập nhật thất bại';
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
      setToast(e instanceof Error ? e.message : 'Không mở được màn hình cài đặt');
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
                : 'Cập nhật ngay hoặc để sau — không cần tắt app'}
            </Text>
          </View>
          {readyUri ? (
            <Pressable style={styles.bannerBtn} onPress={() => void installReadyApk()}>
              <Text style={styles.bannerBtnTxt}>Cài</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.bannerBtn} onPress={() => void startDownload(true, true)}>
              <Text style={styles.bannerBtnTxt}>Cập nhật</Text>
            </Pressable>
          )}
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

              {info.mandatory && (
                <Text style={styles.mandatory}>
                  Bản cập nhật bắt buộc — cần cập nhật để tiếp tục sử dụng.
                </Text>
              )}

              {downloading ? (
                <View style={styles.progressWrap}>
                  <SpinningLoader color={Colors.blue} />
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

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.blue,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerTitle: { fontSize: 13, fontWeight: '800', color: Colors.text },
  bannerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  bannerBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bannerClose: { color: Colors.textMuted, fontSize: 16, paddingHorizontal: 4 },
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
    backgroundColor: Colors.greenSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 90,
  },
  toastTxt: { color: Colors.green, fontSize: 12, fontWeight: '700' },
});

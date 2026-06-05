import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  getAppPermissionGaps,
  grantAllPermissionsQuick,
  openBatteryOptimizationSettings,
  openCallNotificationSettings,
  openOverlaySettings,
  type AppPermissionGap,
} from '../lib/appPermissions';
import { registerPushToken } from '../lib/pushRegistration';
import { syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

const PERM_LABEL: Record<AppPermissionGap, string> = {
  microphone: '🎙 Micro (cuộc gọi / ghi âm)',
  photos: '🖼 Ảnh / Thư viện',
  camera: '📷 Camera',
  location: '📍 Vị trí',
  notification: '🔔 Thông báo (cuộc gọi khi tắt app)',
  fullScreenCall: '📞 Cuộc gọi toàn màn hình',
  batteryOptimization: '🔋 Tắt tối ưu pin',
  systemOverlay: '💬 Bong bóng nổi trên app khác',
};

export default function PermissionBootstrap() {
  const { token, loading } = useAuth();
  const [gaps, setGaps] = useState<AppPermissionGap[]>([]);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionSkipped = useRef(false);
  const lastCheckMs = useRef(0);

  const checkGaps = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheckMs.current < 2000) return;
    lastCheckMs.current = now;
    const g = await getAppPermissionGaps();
    setGaps(g);
    if (g.length > 0 && !sessionSkipped.current) setVisible(true);
    else if (g.length === 0) setVisible(false);
  }, []);

  useEffect(() => {
    if (loading || !token) return;
    void checkGaps(true);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void checkGaps();
    });
    return () => sub.remove();
  }, [loading, token, checkGaps]);

  const handleGrant = useCallback(async () => {
    setBusy(true);
    try {
      await grantAllPermissionsQuick();
      void registerPushToken();
      void syncVoiceBackgroundTaskWithPrefs();
      setTimeout(async () => {
        const remaining = await getAppPermissionGaps();
        setGaps(remaining);
        if (remaining.length === 0) setVisible(false);
        setBusy(false);
      }, 1500);
    } catch {
      setBusy(false);
    }
  }, []);

  const handleSkip = useCallback(() => {
    sessionSkipped.current = true;
    setVisible(false);
    void syncVoiceBackgroundTaskWithPrefs();
  }, []);

  if (!visible || gaps.length === 0 || Platform.OS !== 'android') return null;

  const needsOverlay = gaps.includes('systemOverlay');
  const needsCall = gaps.some((g) =>
    g === 'notification' || g === 'fullScreenCall' || g === 'batteryOptimization',
  );

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={handleSkip}>
      <View style={styles.backdrop}>
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.title}>Cấp quyền cần thiết</Text>

          {needsCall ? (
            <Text style={styles.callNote}>
              Để nhận cuộc gọi khi không mở app (giống Zalo/Messenger), cần bật thông báo, cuộc gọi
              toàn màn hình và tắt tối ưu pin cho TuBep CRM.
            </Text>
          ) : null}

          {needsOverlay ? (
            <Text style={styles.overlayNote}>
              Để hiện bong bóng chat nổi trên màn hình (khi dùng app khác), bạn cần bật quyền
              «Hiển thị trên các ứng dụng khác» trong Cài đặt Android.
            </Text>
          ) : null}

          {/* Chỉ hiển thị các quyền còn thiếu */}
          <View style={styles.list}>
            {gaps.map((key) => (
              <View key={key} style={styles.row}>
                <View style={styles.dot} />
                <Text style={styles.label}>{PERM_LABEL[key]}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void handleGrant()}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={CrmColors.white} size="small" />
            ) : (
              <Text style={styles.btnTxt}>Cấp quyền</Text>
            )}
          </TouchableOpacity>

          {needsOverlay ? (
            <TouchableOpacity
              style={styles.overlayBtn}
              disabled={busy}
              onPress={() => openOverlaySettings()}
            >
              <Text style={styles.overlayBtnTxt}>Mở cài đặt bong bóng nổi</Text>
            </TouchableOpacity>
          ) : null}

          {gaps.includes('fullScreenCall') ? (
            <TouchableOpacity
              style={styles.overlayBtn}
              disabled={busy}
              onPress={() => openCallNotificationSettings()}
            >
              <Text style={styles.overlayBtnTxt}>Bật cuộc gọi toàn màn hình</Text>
            </TouchableOpacity>
          ) : null}

          {gaps.includes('batteryOptimization') ? (
            <TouchableOpacity
              style={styles.overlayBtn}
              disabled={busy}
              onPress={() => openBatteryOptimizationSettings()}
            >
              <Text style={styles.overlayBtnTxt}>Tắt tối ưu pin cho app</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.skip} disabled={busy} onPress={handleSkip}>
            <Text style={styles.skipTxt}>Bỏ qua</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    padding: 20,
  },
  title: { fontSize: 16, fontWeight: '700', color: CrmColors.gray900, marginBottom: 14 },
  list: { gap: 8, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CrmColors.blue600,
  },
  label: { fontSize: 14, color: CrmColors.gray800, fontWeight: '600' },
  overlayNote: {
    fontSize: 12,
    color: '#92400E',
    backgroundColor: '#FFF7ED',
    padding: 10,
    borderRadius: CrmRadii.sm,
    marginBottom: 14,
    lineHeight: 17,
  },
  callNote: {
    fontSize: 12,
    color: '#1E40AF',
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: CrmRadii.sm,
    marginBottom: 14,
    lineHeight: 17,
  },
  btn: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 13,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 15 },
  overlayBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  overlayBtnTxt: { color: CrmColors.blue700, fontWeight: '700', fontSize: 14 },
  skip: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  skipTxt: { color: CrmColors.gray400, fontSize: 13 },
});

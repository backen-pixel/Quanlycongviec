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
  type AppPermissionGap,
} from '../lib/appPermissions';
import { syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

const PERM_LABEL: Record<AppPermissionGap, string> = {
  microphone: '🎙 Micro',
  photos: '🖼 Ảnh / Thư viện',
  camera: '📷 Camera',
  location: '📍 Vị trí',
  notification: '🔔 Thông báo',
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

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={handleSkip}>
      <View style={styles.backdrop}>
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.title}>Cấp quyền cần thiết</Text>

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
  btn: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 13,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 15 },
  skip: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  skipTxt: { color: CrmColors.gray400, fontSize: 13 },
});

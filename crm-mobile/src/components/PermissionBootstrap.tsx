import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import {
  CRM_PERMISSION_ONBOARDING_DONE_KEY,
  grantAllPermissionsQuick,
  promptAppPermissionsIfNeeded,
} from '../lib/appPermissions';
import { syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

/**
 * Lần đầu sau đăng nhập: modal «cấp quyền nhanh» — sau đó nhắc micro/thông báo… khi thiếu (foreground).
 */
export default function PermissionBootstrap() {
  const { token, loading } = useAuth();
  const lastPromptRef = useRef(0);
  const [introOpen, setIntroOpen] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (loading || !token) return;
      const done = await AsyncStorage.getItem(CRM_PERMISSION_ONBOARDING_DONE_KEY);
      if (!cancelled && !done) setIntroOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, token]);

  useEffect(() => {
    if (loading || !token || introOpen) return;

    const maybePrompt = () => {
      const now = Date.now();
      if (now - lastPromptRef.current < 1500) return;
      lastPromptRef.current = now;
      promptAppPermissionsIfNeeded();
      void syncVoiceBackgroundTaskWithPrefs();
    };

    maybePrompt();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybePrompt();
    });
    return () => sub.remove();
  }, [loading, token, introOpen]);

  async function dismissIntro(grantQuick: boolean) {
    setIntroBusy(true);
    try {
      if (grantQuick) await grantAllPermissionsQuick();
      await AsyncStorage.setItem(CRM_PERMISSION_ONBOARDING_DONE_KEY, '1');
      setIntroOpen(false);
      void syncVoiceBackgroundTaskWithPrefs();
      promptAppPermissionsIfNeeded();
    } finally {
      setIntroBusy(false);
    }
  }

  return (
    <Modal visible={introOpen} animationType="fade" transparent onRequestClose={() => void dismissIntro(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.title}>Cấp quyền ngay</Text>
          <Text style={styles.lead}>
            Để ghi âm, đồng bộ, chat có ảnh, thông báo tin nhắn và bong bóng Messenger (overlay Android), nên bật đủ quyền
            ngay từ đầu.
          </Text>
          <ScrollView style={styles.listWrap} showsVerticalScrollIndicator={false}>
            <Text style={styles.bullets}>
              • Micro · Thông báo{'\n'}• Ảnh & camera (đính kèm chat){'\n'}• Android: hiển thị trên app khác (bong bóng)
            </Text>
          </ScrollView>
          <TouchableOpacity
            style={[styles.primaryBtn, introBusy && styles.btnDisabled]}
            disabled={introBusy}
            onPress={() => void dismissIntro(true)}
          >
            {introBusy ? (
              <ActivityIndicator color={CrmColors.white} />
            ) : (
              <Text style={styles.primaryTxt}>Cấp nhanh tất cả</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} disabled={introBusy} onPress={() => void dismissIntro(false)}>
            <Text style={styles.secondaryTxt}>Để sau · vào app</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    padding: 20,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  lead: {
    marginTop: 10,
    fontSize: 13,
    color: CrmColors.gray600,
    lineHeight: 19,
  },
  listWrap: { maxHeight: 160, marginTop: 12 },
  bullets: { fontSize: 13, color: CrmColors.gray800, lineHeight: 21 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  primaryTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 15 },
  secondaryBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryTxt: { color: CrmColors.blue700, fontWeight: '700', fontSize: 14 },
});

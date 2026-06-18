import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentVersionCode, currentVersionName } from '../lib/appUpdate';
import { openOverlaySettings } from '../lib/floatingBubbleOverlay';
import { loadCrmMobilePrefs, saveCrmMobilePrefs, type CrmMobilePrefs } from '../lib/crmMobilePrefs';
import {
  startVoiceBackgroundSyncLoop,
  stopVoiceBackgroundSyncLoop,
  syncVoiceBackgroundTaskWithPrefs,
} from '../lib/voiceBackgroundSync';
import {
  registerVoiceBackgroundTask,
  unregisterVoiceBackgroundTask,
} from '../lib/voiceBackgroundTask';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, useTheme, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const Colors = useColors();
  const { mode, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);

  useEffect(() => {
    void loadCrmMobilePrefs().then(setPrefs);
  }, []);

  const updatePrefs = async (next: CrmMobilePrefs) => {
    setPrefs(next);
    await saveCrmMobilePrefs(next);
    if (next.voiceCaptureEnabled && next.voiceBackgroundSyncEnabled) {
      startVoiceBackgroundSyncLoop();
      void syncVoiceBackgroundTaskWithPrefs();
      void registerVoiceBackgroundTask();
    } else {
      stopVoiceBackgroundSyncLoop();
      void unregisterVoiceBackgroundTask();
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.h1}>Cài đặt</Text>
      </View>

      <Text style={styles.secTitle}>Giao diện</Text>
      <Pressable style={styles.rowCard} onPress={toggle}>
        <View style={[styles.iconWrap, { backgroundColor: (mode === 'dark' ? Colors.blue : Colors.amber) + '22' }]}>
          <Ionicons
            name={mode === 'dark' ? 'moon' : 'sunny'}
            size={20}
            color={mode === 'dark' ? Colors.blue : Colors.amber}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Chế độ hiển thị</Text>
          <Text style={styles.cardSub}>{mode === 'dark' ? 'Tối' : 'Sáng'} · chạm để đổi</Text>
        </View>
        <View style={[styles.themeSwitch, mode === 'light' && styles.themeSwitchOn]}>
          <View style={[styles.themeKnob, mode === 'light' && styles.themeKnobOn]} />
        </View>
      </Pressable>

      <Text style={styles.secTitle}>Ghi âm & đồng bộ</Text>
      {prefs ? (
        <View style={styles.blockCard}>
          <View style={styles.cardHead}>
            <Ionicons name="mic" size={18} color={Colors.purple} />
            <Text style={styles.cardTitle}>Ghi âm cuộc gọi</Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Bật ghi âm / upload</Text>
            <Switch
              value={prefs.voiceCaptureEnabled}
              onValueChange={(v) => void updatePrefs({ ...prefs, voiceCaptureEnabled: v })}
              trackColor={{ false: Colors.border, true: Colors.purple }}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleLbl}>Tự động quét & đẩy lên (Android)</Text>
              <Text style={styles.toggleHint}>
                Tự đọc ghi âm cuộc gọi, quét và tải lên hệ thống — chạy cả khi app đang đóng.
              </Text>
            </View>
            <Switch
              value={prefs.voiceBackgroundSyncEnabled}
              onValueChange={(v) => void updatePrefs({ ...prefs, voiceBackgroundSyncEnabled: v })}
              disabled={!prefs.voiceCaptureEnabled}
              trackColor={{ false: Colors.border, true: Colors.purple }}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Tự ghép Lead theo SĐT</Text>
            <Switch
              value={prefs.autoLinkVoiceByPhone}
              onValueChange={(v) => void updatePrefs({ ...prefs, autoLinkVoiceByPhone: v })}
              disabled={!prefs.voiceCaptureEnabled}
              trackColor={{ false: Colors.border, true: Colors.purple }}
            />
          </View>
          <View style={styles.shareHint}>
            <Ionicons name="share-social-outline" size={16} color={Colors.purple} />
            <Text style={styles.shareHintTxt}>
              ROM quốc tế (Google Phone): mở bản ghi trong Cuộc gọi → Chia sẻ → chọn{' '}
              <Text style={styles.shareHintBold}>CRM Mobile</Text>. App sẽ tự tải lên sau khi bạn đăng nhập.
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.secTitle}>Thông báo & bong bóng chat</Text>
      {prefs ? (
        <View style={styles.blockCard}>
          <View style={styles.cardHead}>
            <Ionicons name="chatbubbles" size={18} color={Colors.green} />
            <Text style={styles.cardTitle}>Bong bóng chat nổi</Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Bật bong bóng chat</Text>
            <Switch
              value={prefs.floatingChatBubbleEnabled}
              onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleEnabled: v })}
              trackColor={{ false: Colors.border, true: Colors.green }}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.toggleLbl}>Hiển thị trên app khác</Text>
              <Text style={styles.toggleHint}>
                Cần quyền «Hiển thị trên app khác» — bong bóng nổi khi thoát CRM hoặc dùng app khác.
              </Text>
            </View>
            <Switch
              value={prefs.floatingChatBubbleSystemOverlay}
              onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleSystemOverlay: v })}
              disabled={!prefs.floatingChatBubbleEnabled}
              trackColor={{ false: Colors.border, true: Colors.green }}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Chỉ hiện khi có tin chưa đọc</Text>
            <Switch
              value={prefs.floatingChatBubbleOnlyWhenUnread}
              onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleOnlyWhenUnread: v })}
              disabled={!prefs.floatingChatBubbleEnabled}
              trackColor={{ false: Colors.border, true: Colors.green }}
            />
          </View>
          <Pressable style={styles.overlayBtn} onPress={() => openOverlaySettings()}>
            <Ionicons name="layers-outline" size={18} color={Colors.green} />
            <Text style={styles.overlayBtnTxt}>Cấp quyền hiển thị trên app khác</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.secTitle}>Thông tin</Text>
      <View style={styles.rowCard}>
        <View style={styles.infoRow}>
          <Ionicons name="phone-portrait-outline" size={18} color={Colors.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Phiên bản ứng dụng</Text>
            <Text style={styles.cardSub}>
              v{currentVersionName() || '?'} · code {currentVersionCode() ?? '?'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
      marginBottom: 8,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    secTitle: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 10,
    },
    rowCard: {
      marginHorizontal: 16,
      padding: 14,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    blockCard: {
      marginHorizontal: 16,
      padding: 14,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      marginBottom: 4,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
    cardSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: '600' },
    themeSwitch: {
      width: 48,
      height: 28,
      borderRadius: 14,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 3,
      justifyContent: 'center',
    },
    themeSwitchOn: { backgroundColor: Colors.amber },
    themeKnob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: Colors.textMuted,
    },
    themeKnobOn: { backgroundColor: Colors.white, alignSelf: 'flex-end' },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: Colors.borderSoft,
      width: '100%',
    },
    toggleLbl: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', flex: 1, paddingRight: 12 },
    toggleHint: { color: Colors.textFaint, fontSize: 11, lineHeight: 15, marginTop: 3 },
    shareHint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: Colors.borderSoft,
    },
    shareHintTxt: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    shareHintBold: { color: Colors.text, fontWeight: '800' },
    overlayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: Colors.borderSoft,
    },
    overlayBtnTxt: { color: Colors.green, fontSize: 13, fontWeight: '700' },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  });

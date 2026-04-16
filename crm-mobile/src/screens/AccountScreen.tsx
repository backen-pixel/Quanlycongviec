import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import {
  CRM_MOBILE_PREFS_CHANGED,
  loadCrmMobilePrefs,
  saveCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import {
  requestVoicePermissionsQuick,
  showVoicePermissionDialogThenRequest,
} from '../lib/voicePermissions';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.fullName || '—';
  const email = user?.email || '—';

  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const [permBusy, setPermBusy] = useState(false);

  const refreshPrefs = useCallback(async () => {
    const next = await loadCrmMobilePrefs();
    setPrefs(next);
    DeviceEventEmitter.emit(CRM_MOBILE_PREFS_CHANGED, next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPrefs();
    }, [refreshPrefs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshPrefs();
    });
    return () => sub.remove();
  }, [refreshPrefs]);

  const pullToolsFromServer = async () => {
    await refreshPrefs();
    Alert.alert('Đã đồng bộ', 'Đã tải cài đặt công cụ & ghi âm từ máy chủ (giống khi bạn chỉnh trên web).');
  };

  const updatePrefs = async (next: CrmMobilePrefs) => {
    setPrefs(next);
    await saveCrmMobilePrefs(next);
  };

  const onVoicePermQuick = async () => {
    setPermBusy(true);
    try {
      await requestVoicePermissionsQuick();
    } finally {
      setPermBusy(false);
    }
  };

  const onVoicePermLikeSync = async () => {
    setPermBusy(true);
    try {
      await showVoicePermissionDialogThenRequest();
    } finally {
      setPermBusy(false);
    }
  };

  const masterOff = !prefs?.autoToolsEnabled;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>TuBep Pro · CRM Mobile</Text>
        <Text style={styles.h1}>Tài khoản</Text>

        <View style={[styles.card, CrmShadow.card]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{email}</Text>
          {user?.role ? (
            <View style={styles.rolePill}>
              <Text style={styles.roleTxt}>{user.role}</Text>
            </View>
          ) : null}
        </View>

        {prefs ? (
          <>
            <Text style={styles.sectionH}>Cài đặt ghi âm & đồng bộ web</Text>
            <View style={[styles.card, CrmShadow.card]}>
              <RowSwitch
                label="Đồng bộ nền & thông báo (mặc định bật)"
                sub="Giữ kết nối socket khi bạn chuyển sang app khác. Tắt tại đây để chỉ nhận tin khi mở lại CRM."
                value={prefs.backgroundRealtimeEnabled}
                onValueChange={(v) => void updatePrefs({ ...prefs, backgroundRealtimeEnabled: v })}
              />
              <View style={styles.divider} />
              <RowSwitch
                label="Cho phép ghi âm & tải lên web"
                sub="Tắt nếu không dùng micro / upload từ app CRM."
                value={prefs.voiceCaptureEnabled}
                onValueChange={(v) => void updatePrefs({ ...prefs, voiceCaptureEnabled: v })}
              />
              <View style={styles.divider} />
              <RowSwitch
                label="Tự động ghép lead theo SĐT sau khi ghi"
                sub="Gọi quét CRM khi có SĐT trên bản ghi (khớp khách hàng / lead)."
                value={prefs.autoLinkVoiceByPhone}
                onValueChange={(v) => void updatePrefs({ ...prefs, autoLinkVoiceByPhone: v })}
                disabled={!prefs.voiceCaptureEnabled}
              />
              <Text style={styles.permRowTitle}>Quyền micro & cuộc gọi (giống Voice Sync)</Text>
              <Text style={styles.permRowSub}>
                «Cấp quyền nhanh» = mở luôn màn hình hệ thống. «Như app Voice Sync» = một hộp thoại giải thích rồi mới
                xin quyền.
              </Text>
              <View style={styles.permBtnRow}>
                <TouchableOpacity
                  style={[styles.permQuick, (!prefs.voiceCaptureEnabled || permBusy) && styles.permRowOff]}
                  onPress={() => void onVoicePermQuick()}
                  disabled={!prefs.voiceCaptureEnabled || permBusy}
                >
                  <Text style={styles.permQuickTxt}>{permBusy ? '…' : 'Cấp quyền nhanh'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.permSync, (!prefs.voiceCaptureEnabled || permBusy) && styles.permRowOff]}
                  onPress={() => void onVoicePermLikeSync()}
                  disabled={!prefs.voiceCaptureEnabled || permBusy}
                >
                  <Text style={styles.permSyncTxt}>Như Voice Sync</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionH}>Công cụ tự động</Text>
            <Text style={styles.sectionSub}>
              Thanh trượt ngang: bật master trước, rồi bật từng kênh (Facebook / danh bạ). Cấu hình được lưu trên
              máy và đồng bộ lên máy chủ (cùng tài khoản với trang Facebook trên web).
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.toolStrip}
            >
              <View style={[styles.toolCard, CrmShadow.card]}>
                <Text style={styles.toolCardH}>Tổng</Text>
                <Text style={styles.toolCardSub}>Bật/tắt nhóm công cụ</Text>
                <Switch
                  value={prefs.autoToolsEnabled}
                  onValueChange={(v) =>
                    void updatePrefs({
                      ...prefs,
                      autoToolsEnabled: v,
                      ...(v ? {} : { facebookAutoTool: false, contactsAutoTool: false }),
                    })
                  }
                  trackColor={{ true: CrmColors.blue100, false: CrmColors.gray200 }}
                  thumbColor={prefs.autoToolsEnabled ? CrmColors.tabActive : CrmColors.gray400}
                />
              </View>
              <View style={[styles.toolCard, CrmShadow.card, masterOff && styles.toolCardDim]}>
                <Text style={styles.toolCardH}>Facebook</Text>
                <Text style={styles.toolCardSub}>Tự động (khi có tích hợp)</Text>
                <Switch
                  value={prefs.facebookAutoTool && prefs.autoToolsEnabled}
                  onValueChange={(v) =>
                    void updatePrefs({ ...prefs, facebookAutoTool: v, ...(v ? { autoToolsEnabled: true } : {}) })
                  }
                  disabled={masterOff}
                  trackColor={{ true: CrmColors.blue100, false: CrmColors.gray200 }}
                  thumbColor={prefs.facebookAutoTool && prefs.autoToolsEnabled ? CrmColors.tabActive : CrmColors.gray400}
                />
              </View>
              <View style={[styles.toolCard, CrmShadow.card, masterOff && styles.toolCardDim]}>
                <Text style={styles.toolCardH}>Danh bạ</Text>
                <Text style={styles.toolCardSub}>Đồng bộ / gợi ý (khi có tích hợp)</Text>
                <Switch
                  value={prefs.contactsAutoTool && prefs.autoToolsEnabled}
                  onValueChange={(v) =>
                    void updatePrefs({ ...prefs, contactsAutoTool: v, ...(v ? { autoToolsEnabled: true } : {}) })
                  }
                  disabled={masterOff}
                  trackColor={{ true: CrmColors.blue100, false: CrmColors.gray200 }}
                  thumbColor={prefs.contactsAutoTool && prefs.autoToolsEnabled ? CrmColors.tabActive : CrmColors.gray400}
                />
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.syncServerBtn, CrmShadow.sm]} onPress={() => void pullToolsFromServer()} activeOpacity={0.88}>
              <Text style={styles.syncServerBtnTxt}>Đồng bộ từ máy chủ ngay</Text>
              <Text style={styles.syncServerBtnSub}>
                Nếu bạn bật/tắt công cụ trên web, chạm đây để app khớp lại (và khi bạn mở lại app từ nền cũng tự tải).
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        <Text style={styles.voiceHint}>
          Danh sách ghi âm (theo nhân viên / quản trị xem hết): dùng tab «Ghi âm» ở thanh dưới.
        </Text>

        <TouchableOpacity style={[styles.logout, CrmShadow.sm]} onPress={() => void logout()} activeOpacity={0.85}>
          <Text style={styles.logoutTxt}>Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tab Thông báo: danh sách giống web. Dự án / đơn / báo giá PDF mở trên web nếu đã cấu hình
          EXPO_PUBLIC_WEB_APP_URL.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function RowSwitch({
  label,
  sub,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  sub: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.rowSw, disabled && styles.rowSwOff]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowSwLabel}>{label}</Text>
        <Text style={styles.rowSwSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: CrmColors.blue100, false: CrmColors.gray200 }}
        thumbColor={value ? CrmColors.tabActive : CrmColors.gray400}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CrmColors.pageBg },
  scroll: { padding: 20, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: '700', color: CrmColors.blue700, letterSpacing: 0.5, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: '800', color: CrmColors.gray900, marginBottom: 20 },
  sectionH: {
    fontSize: 15,
    fontWeight: '800',
    color: CrmColors.gray900,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionSub: { fontSize: 12, color: CrmColors.gray500, marginBottom: 12, lineHeight: 17 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarTxt: { fontSize: 28, fontWeight: '800', color: CrmColors.blue700 },
  name: { fontSize: 18, fontWeight: '700', color: CrmColors.gray900, textAlign: 'center' },
  email: { fontSize: 14, color: CrmColors.gray500, marginTop: 6, textAlign: 'center' },
  rolePill: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  roleTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray700, textTransform: 'capitalize' },
  rowSw: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 6 },
  rowSwOff: { opacity: 0.45 },
  rowSwLabel: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  rowSwSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, lineHeight: 16 },
  divider: { height: 1, backgroundColor: CrmColors.gray100, width: '100%', marginVertical: 12 },
  permRowOff: { opacity: 0.5 },
  permRowTitle: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900, alignSelf: 'flex-start', width: '100%' },
  permRowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 6, lineHeight: 17, marginBottom: 10 },
  permBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  permQuick: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray800,
    alignItems: 'center',
  },
  permQuickTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  permSync: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray300,
    alignItems: 'center',
  },
  permSyncTxt: { color: CrmColors.gray800, fontWeight: '700', fontSize: 13 },
  toolStrip: { gap: 12, paddingBottom: 8, paddingRight: 8 },
  toolCard: {
    width: 168,
    padding: 14,
    borderRadius: CrmRadii.card,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  toolCardDim: { opacity: 0.55 },
  toolCardH: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  toolCardSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 6, marginBottom: 10, lineHeight: 15 },
  syncServerBtn: {
    marginTop: 14,
    padding: 14,
    borderRadius: CrmRadii.card,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  syncServerBtnTxt: { fontSize: 15, fontWeight: '800', color: CrmColors.blue800 },
  syncServerBtnSub: { fontSize: 12, color: CrmColors.gray600, marginTop: 8, lineHeight: 17 },
  voiceHint: {
    fontSize: 13,
    color: CrmColors.gray600,
    lineHeight: 19,
    marginBottom: 12,
    marginTop: 4,
  },
  logout: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    paddingVertical: 14,
    borderRadius: CrmRadii.card,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutTxt: { fontSize: 16, fontWeight: '700', color: CrmColors.red700 },
  hint: { marginTop: 24, fontSize: 12, color: CrmColors.gray400, textAlign: 'center', lineHeight: 18 },
});

import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
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
  Platform,
  TextInput,
  ActivityIndicator,
  NativeModules,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import {
  CRM_MOBILE_PREFS_CHANGED,
  createAllEnabledCrmMobilePrefs,
  loadCrmMobilePrefs,
  saveCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import {
  requestVoicePermissionsQuick,
  showVoicePermissionDialogThenRequest,
} from '../lib/voicePermissions';
import { ensureVoiceBackgroundSyncPermissions, getVoiceBackgroundSyncDebugInfo, syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';
import { api, postMultipart } from '../api/client';
import type { CrmVoiceRecording } from '../types/crm';
import { guessAudioMimeFromFileName } from '../lib/guessAudioMime';
import { clearFloatingBubbleHidden } from '../lib/floatingChatBubbleStorage';

export default function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.fullName || '—';
  const email = user?.email || '—';

  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const [permBusy, setPermBusy] = useState(false);
  const [bgInfo, setBgInfo] = useState<{
    foregroundSyncEnabled: boolean;
    mediaGranted: boolean;
    lastRunMs: number;
    lastUploaded: number;
    lastResult: string;
    lastSyncMs: number;
  } | null>(null);

  const [manualPhone, setManualPhone] = useState('');
  const [manualUploading, setManualUploading] = useState(false);

  const [myVoices, setMyVoices] = useState<CrmVoiceRecording[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);

  const loadMyVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const { data } = await api.get<{ recordings?: CrmVoiceRecording[] }>('/voice-recordings');
      const rows = Array.isArray(data?.recordings) ? data.recordings : [];
      setMyVoices(rows.slice(0, 15));
    } catch {
      setMyVoices([]);
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  const refreshPrefs = useCallback(async () => {
    const next = await loadCrmMobilePrefs();
    setPrefs(next);
    DeviceEventEmitter.emit(CRM_MOBILE_PREFS_CHANGED, next);
    try {
      setBgInfo(await getVoiceBackgroundSyncDebugInfo());
    } catch {
      setBgInfo(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPrefs();
      void loadMyVoices();
    }, [refreshPrefs, loadMyVoices]),
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
    if (next.voiceCaptureEnabled && next.voiceBackgroundSyncEnabled) {
      const r = await ensureVoiceBackgroundSyncPermissions();
      if (!r.mediaGranted) {
        Alert.alert('Chưa có quyền đọc audio', 'Cần cấp quyền Thư viện/Audio để app quét file ghi âm và đồng bộ nền.');
      }
    }
    await syncVoiceBackgroundTaskWithPrefs();
    try {
      setBgInfo(await getVoiceBackgroundSyncDebugInfo());
    } catch {
      setBgInfo(null);
    }
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

  const pickAndUploadManualVoice = async () => {
    if (manualUploading || Platform.OS !== 'android') return;
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['audio/*'],
      });
      if (pick.canceled || !pick.assets?.[0]) return;
      const asset = pick.assets[0];
      let mime = asset.mimeType || '';
      if (!mime || mime === 'application/octet-stream') {
        mime = guessAudioMimeFromFileName(asset.name || '');
      }
      const fileName =
        (asset.name || `manual_voice_${Date.now()}.m4a`).trim() || `manual_voice_${Date.now()}.m4a`;
      setManualUploading(true);
      try {
        const form = new FormData();
        form.append('audio', {
          uri: asset.uri,
          name: fileName,
          type: mime,
        } as unknown as Parameters<FormData['append']>[1]);
        form.append('source', 'crm_mobile_manual');
        form.append('device_label', `${Platform.OS} crm-mobile manual`);
        const raw = manualPhone.replace(/\s+/g, '').trim();
        if (raw) form.append('phone_number', raw.slice(0, 32));
        await postMultipart<{ recording?: { id?: string } }>('/voice-recordings', form);
        setManualPhone('');
        Alert.alert('Đã tải lên', 'File âm thanh đã được gửi lên máy chủ.');
        try {
          const pr = await loadCrmMobilePrefs();
          if (pr.autoLinkVoiceByPhone) await api.post('/voice-recordings/relink-unassigned', {}).catch(() => {});
        } catch {
          /* ignore */
        }
      } finally {
        setManualUploading(false);
      }
    } catch (e: unknown) {
      Alert.alert('Upload', (e as Error)?.message || 'Không chọn được file');
    }
  };

  const confirmDeleteVoice = (item: CrmVoiceRecording) => {
    Alert.alert('Xóa ghi âm?', 'Xóa trên máy chủ; không khôi phục được.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => void deleteVoiceRecording(item.id),
      },
    ]);
  };

  const deleteVoiceRecording = async (rid: string) => {
    setDeletingVoiceId(rid);
    try {
      await api.delete(`/voice-recordings/${rid}`);
      await loadMyVoices();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Xóa thất bại';
      Alert.alert('Xóa', String(msg));
    } finally {
      setDeletingVoiceId(null);
    }
  };

  const masterOff = !prefs?.autoToolsEnabled;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>TuBep Pro · CRM Mobile</Text>
        <Text style={styles.h1}>Tài khoản</Text>

        <TouchableOpacity
          style={[styles.card, CrmShadow.card]}
          activeOpacity={0.9}
          onPress={() => {
            const uid = String(user?.id || user?.userId || '');
            if (uid) navigation.navigate('SocialProfile', { userId: uid });
          }}
        >
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
          <Text style={styles.viewProfileTxt}>👤 Mở trang cá nhân</Text>
        </TouchableOpacity>

        {prefs ? (
          <>
            <Text style={styles.sectionH}>Chế độ nhanh</Text>
            <View style={[styles.card, CrmShadow.card, styles.enableAllCard]}>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Bật tất cả chức năng CRM mobile?',
                    'Bật ghi âm, đồng bộ nền, công cụ tự động, bong bóng (gồm overlay Android nếu bạn đã cấp quyền).',
                    [
                      { text: 'Hủy', style: 'cancel' },
                      {
                        text: 'Bật tất cả',
                        onPress: () => void updatePrefs(createAllEnabledCrmMobilePrefs()),
                      },
                    ],
                  );
                }}
              >
                <Text style={styles.enableAllTitle}>Bật tất cả chức năng</Text>
                <Text style={styles.enableAllSub}>
                  Mặc định tối đa giống cài mới: ghi âm, đồng bộ file, realtime, Facebook/danh bạ tự động, bong bóng chat &
                  overlay.
                </Text>
              </TouchableOpacity>
            </View>

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
                label="Android: Tự đồng bộ file ghi âm mới (chạy nền)"
                sub="Mỗi lần quét chỉ tải một bản: cuộc gọi mới nhất chưa đồng bộ (lọc chặt tên/đường dẫn). Không quét WhatsApp/nhạc. Máy không đưa file vào thư viện — dùng «Chọn file» bên dưới."
                value={prefs.voiceBackgroundSyncEnabled}
                onValueChange={(v) => void updatePrefs({ ...prefs, voiceBackgroundSyncEnabled: v })}
                disabled={!prefs.voiceCaptureEnabled}
              />
              {bgInfo ? (
                <Text style={styles.bgHint}>
                  Foreground (dataSync): {bgInfo.foregroundSyncEnabled ? 'đang bật' : 'đang tắt'} · Quyền audio{' '}
                  {bgInfo.mediaGranted ? 'đã cấp' : 'chưa cấp'} · Lần quét gần nhất:{' '}
                  {bgInfo.lastRunMs ? new Date(bgInfo.lastRunMs).toLocaleString() : 'chưa có'} · Upload lần trước:{' '}
                  {bgInfo.lastUploaded} · KQ: {bgInfo.lastResult || '—'} · Mốc sync:{' '}
                  {bgInfo.lastSyncMs ? new Date(bgInfo.lastSyncMs).toLocaleString() : '—'}
                </Text>
              ) : null}
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

            <Text style={styles.sectionH}>Công việc & nhiệm vụ</Text>
            <TouchableOpacity
              style={[styles.onboardBubbleBtn, CrmShadow.card]}
              onPress={() => navigation.navigate('WorkTaskList')}
            >
              <Text style={styles.onboardBubbleTitle}>Giao việc · Việc dự án</Text>
              <Text style={styles.onboardBubbleSub}>
                Xem việc được giao, tạo nhanh, đổi trạng thái, bình luận như trên web.
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionH}>Bảo mật & thiết bị</Text>
            <TouchableOpacity
              style={[styles.onboardBubbleBtn, CrmShadow.card]}
              onPress={() => navigation.navigate('MyDevices')}
            >
              <Text style={styles.onboardBubbleTitle}>Thiết bị đang đăng nhập</Text>
              <Text style={styles.onboardBubbleSub}>
                Xem các thiết bị tài khoản đang online và đăng xuất từ xa.
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionH}>Bong bóng chat nổi</Text>
            {Platform.OS === 'android' ? (
              <TouchableOpacity
                style={[styles.onboardBubbleBtn, CrmShadow.card]}
                onPress={() => navigation.navigate('BubblePermissionOnboard')}
              >
                <Text style={styles.onboardBubbleTitle}>Thiết lập bong bóng & thông báo</Text>
                <Text style={styles.onboardBubbleSub}>
                  Quyền thông báo, hiển thị trên app khác và tối ưu pin — giống Messenger/Zalo.
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={[styles.cardRow, CrmShadow.card]}>
              <RowSwitch
                label="Hiển thị bong bóng chat"
                sub="Kiểu Zalo: avatar tròn · chạm mở Messenger · giữ để menu · kéo dính mép hoặc thả đáy để ẩn · badge đỏ = tin CRM chưa đọc."
                value={prefs.floatingChatBubbleEnabled}
                onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleEnabled: v })}
              />
              <View style={styles.divider} />
              <RowSwitch
                label="Chỉ hiện khi có tin chưa đọc"
                sub="Giống tùy chỉnh Zalo: ẩn bubble khi không có số đếm đỏ (tin chat CRM)."
                value={prefs.floatingChatBubbleOnlyWhenUnread}
                onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleOnlyWhenUnread: v })}
                disabled={!prefs.floatingChatBubbleEnabled}
              />
              <View style={styles.divider} />
              <RowSwitch
                label="Bong bóng nhỏ gọn"
                sub="Thu nhỏ nút tròn (như cỡ nhỏ trên một số máy)."
                value={prefs.floatingChatBubbleCompact}
                onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleCompact: v })}
                disabled={!prefs.floatingChatBubbleEnabled}
              />
              {Platform.OS === 'android' ? (
                <>
                  <View style={styles.divider} />
                  <RowSwitch
                    label="Bong bóng trên app khác (Android)"
                    sub="Giống Zalo: vẫn thấy khi thoát CRM — cần quyền «Hiển thị trên các ứng dụng khác». Có thông báo chạy nền hợp lệ."
                    value={prefs.floatingChatBubbleSystemOverlay}
                    onValueChange={(v) => void updatePrefs({ ...prefs, floatingChatBubbleSystemOverlay: v })}
                    disabled={!prefs.floatingChatBubbleEnabled}
                  />
                  <TouchableOpacity
                    style={[
                      styles.showBubbleBtn,
                      (!prefs.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay) && styles.permRowOff,
                    ]}
                    onPress={() =>
                      (
                        NativeModules as {
                          FloatingBubbleOverlay?: { openOverlaySettings?: () => void };
                        }
                      ).FloatingBubbleOverlay?.openOverlaySettings?.()
                    }
                    disabled={!prefs.floatingChatBubbleEnabled || !prefs.floatingChatBubbleSystemOverlay}
                  >
                    <Text style={styles.showBubbleBtnTxt}>Cấp quyền hiển thị trên app khác</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.showBubbleBtn, !prefs.floatingChatBubbleEnabled && styles.permRowOff]}
                onPress={() => void clearFloatingBubbleHidden()}
                disabled={!prefs.floatingChatBubbleEnabled}
              >
                <Text style={styles.showBubbleBtnTxt}>Hiện lại bong bóng chat (sau khi ẩn)</Text>
              </TouchableOpacity>
            </View>

            {Platform.OS === 'android' && prefs.voiceCaptureEnabled ? (
              <>
                <Text style={styles.sectionH}>Chọn file ghi âm + SĐT</Text>
                <View style={[styles.cardRow, CrmShadow.card]}>
                  <Text style={styles.manualHint}>
                    Chọn file âm thanh trên máy và nhập số điện thoại để ghép CRM (tuỳ chọn). Không thay thế đồng bộ
                    nền — dùng khi máy không quét được thư viện.
                  </Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Số điện thoại (vd: 0912345678)"
                    placeholderTextColor={CrmColors.gray400}
                    keyboardType="phone-pad"
                    value={manualPhone}
                    onChangeText={setManualPhone}
                  />
                  <TouchableOpacity
                    style={[styles.manualPickBtn, manualUploading && styles.permRowOff]}
                    disabled={manualUploading}
                    onPress={() => void pickAndUploadManualVoice()}
                  >
                    {manualUploading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.manualPickTxt}>Chọn file âm thanh và tải lên</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {prefs.voiceCaptureEnabled ? (
              <>
                <Text style={styles.sectionH}>Ghi âm trên máy chủ</Text>
                <View style={[styles.cardRow, CrmShadow.card]}>
                  <Text style={styles.manualHint}>
                    Tối đa 15 bản mới nhất của bạn. Xóa trên server nếu tải nhầm (đồng bộ nền không xóa file trên
                    điện thoại).
                  </Text>
                  {voicesLoading ? (
                    <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 8 }} />
                  ) : null}
                  {!voicesLoading && myVoices.length === 0 ? (
                    <Text style={styles.voiceEmpty}>Chưa có ghi âm.</Text>
                  ) : null}
                  {myVoices.map((v) => (
                    <View key={v.id} style={styles.voiceRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.voiceName} numberOfLines={1}>
                          {v.file_name || '—'}
                        </Text>
                        <Text style={styles.voiceMeta}>
                          {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                          {v.phone_number ? ` · ${v.phone_number}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.voiceDel, deletingVoiceId === v.id && styles.permRowOff]}
                        disabled={deletingVoiceId === v.id}
                        onPress={() => confirmDeleteVoice(v)}
                      >
                        <Text style={styles.voiceDelTxt}>{deletingVoiceId === v.id ? '…' : 'Xóa'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

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
  cardRow: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 18,
    width: '100%',
    marginBottom: 16,
  },
  onboardBubbleBtn: {
    backgroundColor: CrmColors.blue50,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
    padding: 14,
    marginBottom: 10,
  },
  onboardBubbleTitle: { fontSize: 15, fontWeight: '700', color: CrmColors.blue800 },
  onboardBubbleSub: { fontSize: 12, color: CrmColors.gray600, marginTop: 4, lineHeight: 17 },
  showBubbleBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  showBubbleBtnTxt: { fontSize: 14, fontWeight: '700', color: CrmColors.gray800 },
  manualHint: { fontSize: 12, color: CrmColors.gray600, lineHeight: 17, marginBottom: 12 },
  phoneInput: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
    marginBottom: 12,
    width: '100%',
  },
  manualPickBtn: {
    paddingVertical: 14,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
  },
  manualPickTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  voiceEmpty: { fontSize: 13, color: CrmColors.gray500, marginBottom: 8 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  voiceName: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  voiceMeta: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  voiceDel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  voiceDelTxt: { fontSize: 13, fontWeight: '800', color: CrmColors.red700 },
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
  viewProfileTxt: { marginTop: 10, fontSize: 13, fontWeight: '700', color: CrmColors.blue700, textAlign: 'center' },
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
  enableAllCard: { paddingVertical: 4 },
  enableAllTitle: { fontSize: 16, fontWeight: '800', color: CrmColors.blue700 },
  enableAllSub: {
    marginTop: 10,
    fontSize: 12,
    color: CrmColors.gray600,
    lineHeight: 17,
  },
  divider: { height: 1, backgroundColor: CrmColors.gray100, width: '100%', marginVertical: 12 },
  bgHint: { marginTop: 10, fontSize: 12, color: CrmColors.gray500, lineHeight: 16 },
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

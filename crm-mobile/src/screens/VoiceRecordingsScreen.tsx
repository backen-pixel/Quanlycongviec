import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { CrmVoiceRecording } from '../types/crm';
import { navigationRef } from '../navigation/navigationRef';
import type { VoiceStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { voiceRecordingPlayUrl } from '../lib/crmVoicePlayUrl';
import { isCrmVoiceAdmin } from '../lib/crmMobilePrefs';

type Nav = NativeStackNavigationProp<VoiceStackParamList, 'VoiceRecordingsList'>;

type PickerUser = { id: string; full_name?: string | null; email?: string | null };

export default function VoiceRecordingsScreen({ navigation }: { navigation: Nav }) {
  const { user } = useAuth();
  const admin = isCrmVoiceAdmin(user?.role);
  const [list, setList] = useState<CrmVoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [relinkBusy, setRelinkBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<PickerUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const params: Record<string, string> = {};
      if (admin && filterUserId) params.user_id = filterUserId;
      const { data } = await api.get<{ recordings?: CrmVoiceRecording[] }>('/voice-recordings', { params });
      setList(Array.isArray(data?.recordings) ? data.recordings : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Không tải được';
      setErr(String(msg));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [admin, filterUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const openPicker = async () => {
    setPickerOpen(true);
    if (pickerUsers.length) return;
    setPickerLoading(true);
    try {
      const { data } = await api.get<{ users?: PickerUser[] }>('/users');
      setPickerUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      setPickerUsers([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const canDeleteVoice = (r: CrmVoiceRecording) => !!(user?.id && r.user_id && r.user_id === user.id);

  const confirmDeleteVoice = (r: CrmVoiceRecording) => {
    Alert.alert('Xóa bản ghi?', 'Xóa trên server; không lấy lại được.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => void deleteVoice(r) },
    ]);
  };

  const deleteVoice = async (r: CrmVoiceRecording) => {
    if (playingId === r.id) {
      try {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
      setPlayingId(null);
    }
    setDeletingId(r.id);
    try {
      await api.delete(`/voice-recordings/${r.id}`);
      setList((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Xóa thất bại';
      Alert.alert('Xóa', String(msg));
    } finally {
      setDeletingId(null);
    }
  };

  const togglePlay = async (item: CrmVoiceRecording) => {
    const uri = voiceRecordingPlayUrl(item);
    if (!uri) {
      Alert.alert('Phát', 'Không có URL âm thanh.');
      return;
    }
    if (playingId === item.id) {
      try {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
      setPlayingId(null);
      return;
    }
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && 'didJustFinish' in st && st.didJustFinish) {
          setPlayingId(null);
          void sound.unloadAsync();
          if (soundRef.current === sound) soundRef.current = null;
        }
      });
      await sound.playAsync();
      setPlayingId(item.id);
    } catch (e: unknown) {
      Alert.alert('Phát', (e as Error)?.message || 'Lỗi phát');
      setPlayingId(null);
    }
  };

  const relinkMine = async () => {
    setRelinkBusy(true);
    try {
      const { data } = await api.post<{ updated?: number; scanned?: number }>('/voice-recordings/relink-unassigned');
      const u = typeof data?.updated === 'number' ? data.updated : 0;
      Alert.alert('Ghép CRM', `Đã quét ${data?.scanned ?? 0} bản ghi, cập nhật ${u} (SĐT → KH → lead/deal).`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Lỗi';
      Alert.alert('Ghép CRM', String(msg));
    } finally {
      setRelinkBusy(false);
    }
  };

  const relinkCompany = async () => {
    setRelinkBusy(true);
    try {
      const { data } = await api.post<{ updated?: number; scanned?: number }>(
        '/voice-recordings/relink-unassigned',
        { all_users: true },
      );
      const u = typeof data?.updated === 'number' ? data.updated : 0;
      Alert.alert('Ghép CRM (toàn công ty)', `Đã quét ${data?.scanned ?? 0}, cập nhật ${u}.`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Lỗi';
      Alert.alert('Ghép CRM', String(msg));
    } finally {
      setRelinkBusy(false);
    }
  };

  const relinkOne = async (id: string) => {
    try {
      await api.patch(`/voice-recordings/${id}`, { action: 'relink_from_phone' });
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Lỗi';
      Alert.alert('Ghép theo SĐT', String(msg));
    }
  };

  const goLead = (id: string) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Main', {
        screen: 'CrmTab',
        params: { screen: 'LeadDetail', params: { id } },
      });
      return;
    }
    navigation.getParent()?.navigate('CrmTab', { screen: 'LeadDetail', params: { id } } as never);
  };

  const filterLabel = admin
    ? filterUserId
      ? pickerUsers.find((u) => u.id === filterUserId)?.full_name || filterUserId
      : 'Tất cả nhân viên'
    : user?.full_name || user?.fullName || 'Bạn';

  return (
    <View style={styles.screen}>
      <Text style={styles.banner}>
        {admin
          ? 'Quản trị: xem mọi ghi âm. Nhân viên chỉ thấy bản ghi do chính họ tải lên. Server tự ghép KH + lead/deal theo SĐT (khi upload hoặc khi bấm quét).'
          : 'Chỉ hiển thị ghi âm bạn đã gửi lên. Hệ thống tự ghép khách hàng và lead/deal theo số điện thoại trên file.'}
      </Text>

      {admin ? (
        <View style={styles.filterRow}>
          <Text style={styles.filterLbl}>Lọc theo NV</Text>
          <TouchableOpacity style={[styles.filterBtn, CrmShadow.sm]} onPress={() => void openPicker()}>
            <Text style={styles.filterBtnTxt} numberOfLines={1}>
              {filterLabel}
            </Text>
            <Text style={styles.filterChev}>▾</Text>
          </TouchableOpacity>
          {filterUserId ? (
            <TouchableOpacity
              style={styles.clearF}
              onPress={() => {
                setFilterUserId('');
                void load();
              }}
            >
              <Text style={styles.clearFTxt}>Xóa lọc</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={() => void load()} disabled={loading}>
          <Text style={styles.btnTxt}>{loading ? '…' : 'Làm mới'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('VoiceLocalRecordings')}
        >
          <Text style={styles.btnPrimaryTxt}>📱 Bản ghi trên máy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => void relinkMine()} disabled={relinkBusy}>
          <Text style={styles.btnGhostTxt}>{relinkBusy ? '…' : 'Quét ghép (của tôi)'}</Text>
        </TouchableOpacity>
        {admin ? (
          <TouchableOpacity style={styles.btnWarn} onPress={() => void relinkCompany()} disabled={relinkBusy}>
            <Text style={styles.btnWarnTxt}>Quét công ty</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl refreshing={loading && list.length > 0} onRefresh={() => void load()} tintColor={CrmColors.blue600} />
        }
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={CrmColors.blue600} style={{ marginTop: 32 }} /> : (
            <Text style={styles.empty}>Chưa có bản ghi.</Text>
          )
        }
        renderItem={({ item: r }) => (
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {r.file_name || 'Ghi âm'}
            </Text>
            <Text style={styles.meta}>{formatDateTime(r.created_at)}</Text>
            {admin && r.uploader?.full_name ? (
              <Text style={styles.owner}>👤 NV: {r.uploader.full_name}</Text>
            ) : null}
            {r.phone_number ? <Text style={styles.phone}>📞 {r.phone_number}</Text> : <Text style={styles.muted}>Chưa có SĐT</Text>}
            {r.customer?.full_name ? (
              <Text style={styles.link}>KH: {r.customer.full_name}</Text>
            ) : (
              <Text style={styles.warn}>Chưa ghép khách</Text>
            )}
            {r.lead?.id ? (
              <TouchableOpacity onPress={() => goLead(r.lead!.id!)}>
                <Text style={styles.leadTap}>
                  {r.lead.type === 'deal' ? '🎯 Deal' : '💼 Lead'}: {r.lead.code || ''} · {r.lead.title || '—'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.warn}>Chưa ghép lead/deal</Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.mini} onPress={() => void togglePlay(r)}>
                <Text style={styles.miniTxt}>{playingId === r.id ? 'Dừng' : 'Phát'}</Text>
              </TouchableOpacity>
              {r.phone_number && (!r.lead_id || !r.customer_id) ? (
                <TouchableOpacity style={styles.mini2} onPress={() => void relinkOne(r.id)}>
                  <Text style={styles.mini2Txt}>Ghép SĐT</Text>
                </TouchableOpacity>
              ) : null}
              {canDeleteVoice(r) ? (
                <TouchableOpacity
                  style={[styles.miniDel, deletingId === r.id && { opacity: 0.5 }]}
                  disabled={deletingId === r.id}
                  onPress={() => confirmDeleteVoice(r)}
                >
                  <Text style={styles.miniDelTxt}>{deletingId === r.id ? '…' : 'Xóa'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      />

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chọn nhân viên</Text>
            {pickerLoading ? <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 12 }} /> : null}
            <TouchableOpacity
              style={styles.modalRow}
              onPress={() => {
                setFilterUserId('');
                setPickerOpen(false);
                void load();
              }}
            >
              <Text style={styles.modalRowTxt}>Tất cả nhân viên</Text>
            </TouchableOpacity>
            <FlatList
              data={pickerUsers}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setFilterUserId(u.id);
                    setPickerOpen(false);
                    void load();
                  }}
                >
                  <Text style={styles.modalRowTxt}>{u.full_name || u.email || u.id}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  banner: {
    marginHorizontal: 16,
    marginTop: 10,
    fontSize: 12,
    color: CrmColors.gray600,
    lineHeight: 17,
  },
  filterRow: { paddingHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  filterLbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600 },
  filterBtn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  filterBtnTxt: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900, flex: 1 },
  filterChev: { color: CrmColors.gray400 },
  clearF: { paddingVertical: 8, paddingHorizontal: 4 },
  clearFTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue600 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  btnTxt: { fontWeight: '700', color: CrmColors.gray700, fontSize: 13 },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue600,
  },
  btnPrimaryTxt: { fontWeight: '700', color: '#fff', fontSize: 13 },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  btnGhostTxt: { fontWeight: '700', color: CrmColors.gray700, fontSize: 13 },
  btnWarn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.amber600,
  },
  btnWarnTxt: { fontWeight: '800', color: '#fff', fontSize: 13 },
  err: { color: CrmColors.red700, marginHorizontal: 16, marginTop: 8, fontSize: 12 },
  listPad: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 24 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray900 },
  meta: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  owner: { fontSize: 12, color: CrmColors.blue800, marginTop: 6, fontWeight: '600' },
  phone: { fontSize: 13, color: CrmColors.gray900, marginTop: 6 },
  muted: { fontSize: 12, color: CrmColors.gray400, marginTop: 6 },
  link: { fontSize: 13, color: CrmColors.emerald700, marginTop: 6, fontWeight: '600' },
  warn: { fontSize: 12, color: CrmColors.amber600, marginTop: 4 },
  leadTap: { fontSize: 13, color: CrmColors.blue700, marginTop: 6, fontWeight: '700', textDecorationLine: 'underline' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  mini: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
  },
  miniTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray800 },
  mini2: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CrmColors.blue100,
    borderRadius: CrmRadii.md,
  },
  mini2Txt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue800 },
  miniDel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  miniDelTxt: { fontSize: 13, fontWeight: '800', color: CrmColors.red700 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 18,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  modalRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  modalRowTxt: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  modalClose: { alignSelf: 'center', marginTop: 14, paddingVertical: 10 },
  modalCloseTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.blue600 },
});

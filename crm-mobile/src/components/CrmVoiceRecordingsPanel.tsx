import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { api } from '../api/client';
import type { CrmVoiceRecording } from '../types/crm';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import {
  ensureMicOnlyAsync,
  getMicPermissionLabel,
  onAppForeground,
  requestVoicePermissionsQuick,
  showVoicePermissionDialogThenRequest,
} from '../lib/voicePermissions';
import { loadCrmMobilePrefs, type CrmMobilePrefs } from '../lib/crmMobilePrefs';
import { voiceRecordingPlayUrl } from '../lib/crmVoicePlayUrl';

const NOTES_MAX = 2000;

type Props = {
  leadId: string;
  /** Gửi kèm POST để backend có thể tự ghép theo SĐT (bổ sung cho PATCH lead). */
  customerPhone?: string | null;
};

function dirLabel(d: string | null | undefined) {
  if (d === 'inbound') return 'Gọi đến';
  if (d === 'outbound') return 'Gọi đi';
  if (d === 'unknown') return 'Không rõ';
  return d || '';
}

export default function CrmVoiceRecordingsPanel({ leadId, customerPhone }: Props) {
  const [list, setList] = useState<CrmVoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [micStatus, setMicStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [okBanner, setOkBanner] = useState('');
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const okBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshMicLabel = useCallback(async () => {
    try {
      setMicStatus(await getMicPermissionLabel());
    } catch {
      setMicStatus('');
    }
  }, []);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get<{ recordings?: CrmVoiceRecording[] }>('/voice-recordings', {
        params: { lead_id: leadId },
      });
      setList(Array.isArray(data?.recordings) ? data.recordings : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Không tải được danh sách';
      setErr(String(msg));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setPrefs(await loadCrmMobilePrefs());
      })();
    }, []),
  );

  useEffect(() => {
    void refreshMicLabel();
  }, [refreshMicLabel]);

  useEffect(() => {
    return onAppForeground(() => {
      void refreshMicLabel();
    });
  }, [refreshMicLabel]);

  useEffect(() => {
    return () => {
      if (okBannerTimerRef.current) {
        clearTimeout(okBannerTimerRef.current);
        okBannerTimerRef.current = null;
      }
      void (async () => {
        try {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync();
            recordingRef.current = null;
          }
        } catch {
          /* ignore */
        }
        try {
          if (soundRef.current) {
            await soundRef.current.unloadAsync();
            soundRef.current = null;
          }
        } catch {
          /* ignore */
        }
      })();
    };
  }, []);

  const startRecord = async () => {
    if (uploading || recording) return;
    let micOk = await ensureMicOnlyAsync();
    if (!micOk) {
      const r = await requestVoicePermissionsQuick();
      micOk = r.micGranted;
    }
    if (!micOk) {
      Alert.alert('Chưa có micro', 'Bấm «Cấp quyền nhanh» bên dưới, hoặc «Như Voice Sync» để xem hộp thoại giống app gốc.', [
        { text: 'Đóng', style: 'cancel' },
        { text: 'Như Voice Sync', onPress: () => void showVoicePermissionDialogThenRequest().then(refreshMicLabel) },
      ]);
      return;
    }
    void refreshMicLabel();
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Không bắt đầu ghi được';
      Alert.alert('Ghi âm', msg);
      recordingRef.current = null;
      setRecording(false);
    }
  };

  const stopAndUpload = async () => {
    const rec = recordingRef.current;
    if (!rec || !recording) return;
    setUploading(true);
    setRecording(false);
    let localUri: string | null = null;
    let durationSec = 0;
    try {
      const st = await rec.getStatusAsync();
      durationSec = st.durationMillis != null ? Math.max(0, st.durationMillis / 1000) : 0;
      await rec.stopAndUnloadAsync();
      localUri = rec.getURI() ?? null;
      recordingRef.current = null;
    } catch (e: unknown) {
      recordingRef.current = null;
      setUploading(false);
      Alert.alert('Ghi âm', (e as Error)?.message || 'Dừng ghi thất bại');
      return;
    }

    if (!localUri) {
      setUploading(false);
      Alert.alert('Ghi âm', 'Không lấy được file ghi âm.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      /* ignore */
    }

    const notes = noteDraft.trim().slice(0, NOTES_MAX);
    const fileName = `crm_mobile_${Date.now()}.m4a`;
    const form = new FormData();
    form.append('audio', {
      uri: Platform.OS === 'ios' ? localUri.replace('file://', '') : localUri,
      name: fileName,
      type: 'audio/m4a',
    } as unknown as Parameters<FormData['append']>[1]);
    form.append('source', 'crm_mobile');
    form.append('device_label', `${Platform.OS} crm-mobile`);
    if (notes) form.append('notes', notes);
    if (durationSec > 0) form.append('duration_sec', String(Math.round(durationSec * 10) / 10));
    const phone = customerPhone?.replace(/\s+/g, '').trim();
    if (phone) form.append('phone_number', phone.slice(0, 32));

    try {
      const { data } = await api.post<{ recording?: CrmVoiceRecording }>('/voice-recordings', form);
      const rid = data?.recording?.id;
      if (!rid) throw new Error('Thiếu id bản ghi sau upload');

      await api.patch(`/voice-recordings/${rid}`, { lead_id: leadId });
      setNoteDraft('');
      await load();
      const p = await loadCrmMobilePrefs();
      setPrefs(p);
      if (p.autoLinkVoiceByPhone) {
        void api.post('/voice-recordings/relink-unassigned').catch(() => {});
      }
      setOkBanner('Đã tải lên server — mở lead này trên web sẽ thấy trong phần ghi âm.');
      if (okBannerTimerRef.current) clearTimeout(okBannerTimerRef.current);
      okBannerTimerRef.current = setTimeout(() => {
        okBannerTimerRef.current = null;
        setOkBanner('');
      }, 5000);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Tải lên thất bại';
      Alert.alert('Ghi âm', String(msg));
    } finally {
      setUploading(false);
    }
  };

  const togglePlay = async (item: CrmVoiceRecording) => {
    const uri = voiceRecordingPlayUrl(item);
    if (!uri) {
      Alert.alert('Phát', 'Không có đường dẫn âm thanh.');
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
      if (recordingRef.current && recording) {
        Alert.alert('Phát', 'Dừng ghi âm trước khi phát.');
        return;
      }
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
      Alert.alert('Phát', (e as Error)?.message || 'Không phát được');
      setPlayingId(null);
    }
  };

  const confirmDelete = (item: CrmVoiceRecording) => {
    Alert.alert('Xóa bản ghi?', 'Xóa trên server; không hiển thị trên web nữa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => void deleteRecording(item.id),
      },
    ]);
  };

  const deleteRecording = async (rid: string) => {
    if (playingId === rid) {
      try {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
      setPlayingId(null);
    }
    setDeletingId(rid);
    try {
      await api.delete(`/voice-recordings/${rid}`);
      await load();
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

  return (
    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
      <Text style={styles.hint}>
        Ghi micro trong app → tải lên API `/voice-recordings` (giống web & app Voice Sync). Sau khi tải xong, mở chi
        tiết lead trên web sẽ thấy trong phần ghi âm.
      </Text>

      <View style={[styles.permCard, CrmShadow.card]}>
        <Text style={styles.permTitle}>Quyền (Voice Sync)</Text>
        <Text style={styles.permStatus}>{micStatus || '…'}</Text>
        <Text style={styles.permSub}>
          «Nhanh» = hệ thống xin quyền ngay. «Voice Sync» = một hộp thoại + nút Cấp quyền như app TuBep Voice Sync.
        </Text>
        <View style={styles.permTwoRow}>
          <TouchableOpacity
            style={styles.permQuick}
            onPress={() => void requestVoicePermissionsQuick().then(() => refreshMicLabel())}
          >
            <Text style={styles.permQuickTxt}>Cấp quyền nhanh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.permSync}
            onPress={() => void showVoicePermissionDialogThenRequest().then(() => refreshMicLabel())}
          >
            <Text style={styles.permSyncTxt}>Như Voice Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.label}>Ghi chú kèm file (hiển thị trên web, tùy chọn)</Text>
      <TextInput
        style={styles.noteInput}
        placeholder="Ví dụ: Tư vấn báo giá tủ bếp…"
        placeholderTextColor={CrmColors.gray400}
        value={noteDraft}
        onChangeText={(t) => setNoteDraft(t.slice(0, NOTES_MAX))}
        multiline
        maxLength={NOTES_MAX}
        textAlignVertical="top"
        editable={!recording && !uploading}
      />
      <Text style={styles.noteCount}>
        {noteDraft.length}/{NOTES_MAX}
      </Text>

      <View style={styles.row}>
        {!recording ? (
          <TouchableOpacity
            style={[styles.recBtn, (uploading || loading) && styles.recBtnOff]}
            onPress={() => void startRecord()}
            disabled={uploading || loading}
          >
            <Text style={styles.recBtnTxt}>{uploading ? 'Đang tải…' : '🎙 Bắt đầu ghi'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopBtn} onPress={() => void stopAndUpload()} disabled={uploading}>
            <Text style={styles.stopBtnTxt}>{uploading ? 'Đang tải…' : '⏹ Dừng & gửi web'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()} disabled={loading}>
          <Text style={styles.refreshTxt}>{loading ? '…' : 'Làm mới'}</Text>
        </TouchableOpacity>
      </View>

      {recording ? <Text style={styles.recordingLive}>Đang ghi…</Text> : null}

      {okBanner ? <Text style={styles.okBanner}>{okBanner}</Text> : null}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {loading && list.length === 0 ? (
        <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.tabActive} />
      ) : list.length === 0 ? (
        <Text style={styles.muted}>Chưa có ghi âm ghép với lead/deal này.</Text>
      ) : (
        list.map((r) => (
          <View key={r.id} style={[styles.card, CrmShadow.card]}>
            <Text style={styles.title}>{r.file_name || 'Ghi âm'}</Text>
            <Text style={styles.meta}>
              {formatDateTime(r.created_at)}
              {r.duration_sec != null ? ` · ${Math.round(Number(r.duration_sec))}s` : ''}
              {r.source ? ` · ${r.source}` : ''}
            </Text>
            {r.direction ? <Text style={styles.meta}>{dirLabel(r.direction)}</Text> : null}
            {r.notes ? <Text style={styles.notes}>{r.notes}</Text> : null}
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => void togglePlay(r)}
                disabled={!voiceRecordingPlayUrl(r)}
              >
                <Text style={styles.playBtnTxt}>{playingId === r.id ? '⏸ Dừng phát' : '▶ Phát'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.delBtn, deletingId === r.id && styles.delBtnOff]}
                onPress={() => confirmDelete(r)}
                disabled={deletingId === r.id}
              >
                <Text style={styles.delBtnTxt}>{deletingId === r.id ? '…' : 'Xóa'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blocked: {
    padding: 16,
    backgroundColor: CrmColors.amber50,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.amber100,
  },
  blockedTitle: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  blockedTxt: { fontSize: 13, color: CrmColors.gray600, marginTop: 8, lineHeight: 19 },
  hint: {
    fontSize: 13,
    color: CrmColors.gray600,
    marginBottom: 12,
    lineHeight: 19,
  },
  permCard: {
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  permTitle: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  permStatus: { fontSize: 13, color: CrmColors.tabActive, marginTop: 6, fontWeight: '600' },
  permSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 6, lineHeight: 17 },
  permTwoRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
  label: { fontSize: 13, fontWeight: '600', color: CrmColors.gray700, marginBottom: 6 },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 12,
    fontSize: 14,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.gray50,
  },
  noteCount: { fontSize: 11, color: CrmColors.gray400, alignSelf: 'flex-end', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  recBtn: {
    backgroundColor: CrmColors.tabActive,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: CrmRadii.md,
  },
  recBtnOff: { opacity: 0.5 },
  recBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  stopBtn: {
    backgroundColor: '#b91c1c',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: CrmRadii.md,
  },
  stopBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  refreshBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  refreshTxt: { color: CrmColors.gray700, fontWeight: '600' },
  recordingLive: { color: '#b91c1c', fontWeight: '600', marginBottom: 8 },
  okBanner: {
    fontSize: 13,
    color: CrmColors.emerald700,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 18,
  },
  err: { color: '#b91c1c', marginBottom: 8, fontSize: 13 },
  muted: { color: CrmColors.gray500, fontSize: 14, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: CrmRadii.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  title: { fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  meta: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  notes: { fontSize: 13, color: CrmColors.gray700, marginTop: 8 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  playBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
  },
  playBtnTxt: { fontWeight: '600', color: CrmColors.tabActive, fontSize: 14 },
  delBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.red50,
    borderWidth: 1,
    borderColor: CrmColors.red200,
  },
  delBtnOff: { opacity: 0.6 },
  delBtnTxt: { fontWeight: '600', color: CrmColors.red700, fontSize: 14 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatApiError } from '../api/client';
import { uploadRecording } from '../api/recordings';
import { guessAudioMimeFromFileName } from '../lib/guessAudioMime';
import {
  ensureMicOnlyAsync,
  getMicPermissionLabel,
  onAppForeground,
  requestVoicePermissionsQuick,
  showVoicePermissionDialogThenRequest,
} from '../lib/voicePermissions';
import { Radii, useColors, type ThemeColors } from '../theme';

const NOTES_MAX = 2000;

type Props = {
  onUploaded: () => void;
  disabled?: boolean;
};

export default function VoiceRecorderToolbar({ onUploaded, disabled }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [micStatus, setMicStatus] = useState('');
  const [okBanner, setOkBanner] = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const okBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshMicLabel = useCallback(async () => {
    try {
      setMicStatus(await getMicPermissionLabel());
    } catch {
      setMicStatus('');
    }
  }, []);

  useEffect(() => {
    void refreshMicLabel();
    return onAppForeground(() => {
      void refreshMicLabel();
    });
  }, [refreshMicLabel]);

  useEffect(() => {
    return () => {
      if (okBannerTimerRef.current) clearTimeout(okBannerTimerRef.current);
      void (async () => {
        try {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync();
            recordingRef.current = null;
          }
        } catch {
          /* ignore */
        }
      })();
    };
  }, []);

  const performUpload = async (
    localUri: string,
    fileName: string,
    mime: string,
    durationSec?: number,
  ) => {
    await uploadRecording({
      localUri,
      fileName,
      mime,
      durationSec,
      notes: noteDraft.trim() || undefined,
    });
    setNoteDraft('');
    setOkBanner('Đã tải lên server — hệ thống sẽ tự ghép KH/Lead theo SĐT nếu có.');
    if (okBannerTimerRef.current) clearTimeout(okBannerTimerRef.current);
    okBannerTimerRef.current = setTimeout(() => {
      okBannerTimerRef.current = null;
      setOkBanner('');
    }, 5000);
    onUploaded();
  };

  const startRecord = async () => {
    if (uploading || recording || disabled) return;
    let micOk = await ensureMicOnlyAsync();
    if (!micOk) {
      const r = await requestVoicePermissionsQuick();
      micOk = r.micGranted;
    }
    if (!micOk) {
      Alert.alert('Chưa có micro', 'Bấm «Cấp quyền nhanh» hoặc «Như Voice Sync» bên dưới.', [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Như Voice Sync',
          onPress: () => void showVoicePermissionDialogThenRequest().then(refreshMicLabel),
        },
      ]);
      return;
    }
    void refreshMicLabel();
    try {
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
      Alert.alert('Ghi âm', (e as Error)?.message || 'Không bắt đầu ghi được');
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

    try {
      const uriName = String(localUri).split('/').pop() || '';
      const ext = uriName.includes('.') ? uriName.split('.').pop() : '';
      const fileName = `crm_v2_${Date.now()}${ext ? `.${ext}` : '.m4a'}`;
      const mime = guessAudioMimeFromFileName(fileName) || 'audio/m4a';
      await performUpload(localUri, fileName, mime, durationSec > 0 ? durationSec : undefined);
    } catch (e: unknown) {
      Alert.alert('Ghi âm', formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const pickRecordingFromDevice = async () => {
    if (uploading || recording || disabled) return;
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
        (asset.name || `phone_recording_${Date.now()}.m4a`).trim() ||
        `phone_recording_${Date.now()}.m4a`;
      setUploading(true);
      try {
        await performUpload(asset.uri, fileName, mime);
      } catch (e: unknown) {
        Alert.alert('Ghi âm', formatApiError(e));
      } finally {
        setUploading(false);
      }
    } catch (e: unknown) {
      Alert.alert('File', (e as Error)?.message || 'Không chọn được file');
    }
  };

  const busy = uploading || disabled;

  return (
    <View style={styles.wrap}>
      <View style={styles.permCard}>
        <Text style={styles.permTitle}>Quyền ghi âm</Text>
        <Text style={styles.permStatus}>{micStatus || '…'}</Text>
        <View style={styles.permRow}>
          <Pressable
            style={styles.permQuick}
            onPress={() => void requestVoicePermissionsQuick().then(refreshMicLabel)}
          >
            <Text style={styles.permQuickTxt}>Cấp quyền nhanh</Text>
          </Pressable>
          <Pressable
            style={styles.permSync}
            onPress={() => void showVoicePermissionDialogThenRequest().then(refreshMicLabel)}
          >
            <Text style={styles.permSyncTxt}>Như Voice Sync</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.shareTip}>
        <Ionicons name="share-outline" size={14} color={Colors.purple} />
        <Text style={styles.shareTipTxt}>
          Google Phone: Gần đây → bản ghi → Chia sẻ → CRM Mobile
        </Text>
      </View>

      <Text style={styles.label}>Ghi chú kèm file (tùy chọn)</Text>
      <TextInput
        style={styles.noteInput}
        placeholder="Ví dụ: Tư vấn báo giá tủ bếp…"
        placeholderTextColor={Colors.textFaint}
        value={noteDraft}
        onChangeText={(t) => setNoteDraft(t.slice(0, NOTES_MAX))}
        multiline
        maxLength={NOTES_MAX}
        textAlignVertical="top"
        editable={!recording && !busy}
      />
      <Text style={styles.noteCount}>
        {noteDraft.length}/{NOTES_MAX}
      </Text>

      <View style={styles.row}>
        {!recording ? (
          <Pressable
            style={[styles.recBtn, busy && styles.btnOff]}
            onPress={() => void startRecord()}
            disabled={busy}
          >
            <Ionicons name="mic" size={16} color="#fff" />
            <Text style={styles.recBtnTxt}>{uploading ? 'Đang tải…' : 'Bắt đầu ghi'}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.stopBtn} onPress={() => void stopAndUpload()} disabled={uploading}>
            <Ionicons name="stop" size={16} color="#fff" />
            <Text style={styles.stopBtnTxt}>{uploading ? 'Đang tải…' : 'Dừng & gửi'}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.pickBtn, (busy || recording) && styles.btnOff]}
          onPress={() => void pickRecordingFromDevice()}
          disabled={busy || recording}
        >
          <Ionicons name="folder-open-outline" size={16} color={Colors.blue} />
          <Text style={styles.pickBtnTxt}>File máy</Text>
        </Pressable>
      </View>

      {recording ? <Text style={styles.live}>Đang ghi…</Text> : null}
      {okBanner ? <Text style={styles.okBanner}>{okBanner}</Text> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginTop: 4, marginBottom: 8 },
    permCard: {
      backgroundColor: Colors.surfaceSoft,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginBottom: 12,
    },
    permTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    permStatus: { color: Colors.purple, fontSize: 12, marginTop: 6, fontWeight: '700' },
    permRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    permQuick: {
      flex: 1,
      height: 38,
      borderRadius: Radii.sm,
      backgroundColor: Colors.purple,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permQuickTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
    permSync: {
      flex: 1,
      height: 38,
      borderRadius: Radii.sm,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permSyncTxt: { color: Colors.text, fontWeight: '700', fontSize: 12 },
    shareTip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: Radii.sm,
      backgroundColor: Colors.purple + '14',
    },
    shareTipTxt: { flex: 1, color: Colors.textMuted, fontSize: 11, fontWeight: '600', lineHeight: 15 },
    label: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    noteInput: {
      minHeight: 68,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      padding: 12,
      fontSize: 14,
      color: Colors.text,
      backgroundColor: Colors.card,
    },
    noteCount: {
      fontSize: 11,
      color: Colors.textFaint,
      alignSelf: 'flex-end',
      marginBottom: 10,
      marginTop: 4,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    recBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.purple,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: Radii.md,
    },
    stopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.red,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: Radii.md,
    },
    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: 'rgba(47,107,255,0.35)',
      backgroundColor: Colors.blueSoft,
    },
    recBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    stopBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    pickBtnTxt: { color: Colors.blue, fontWeight: '800', fontSize: 14 },
    btnOff: { opacity: 0.5 },
    live: { color: Colors.red, fontWeight: '700', fontSize: 13, marginTop: 8 },
    okBanner: { color: Colors.green, fontWeight: '600', fontSize: 12, marginTop: 8, lineHeight: 17 },
  });

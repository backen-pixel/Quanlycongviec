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
import ActionGrid2x2 from './ActionGrid2x2';
import { guessAudioMimeFromFileName } from '../lib/guessAudioMime';
import {
  ensureMicOnlyAsync,
  getMicPermissionLabel,
  onAppForeground,
  requestVoicePermissionsQuick,
  showVoicePermissionDialogThenRequest,
} from '../lib/voicePermissions';
import { PAGE_HPAD, Radii, useColors, type ThemeColors } from '../theme';

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
  const [permOpen, setPermOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

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
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Ghi âm mới</Text>
        </View>

        <ActionGrid2x2
          pagePadding={PAGE_HPAD + 12}
          items={[
            {
              key: 'record',
              label: recording
                ? uploading
                  ? 'Đang tải…'
                  : 'Dừng & gửi'
                : uploading
                  ? 'Đang tải…'
                  : 'Bắt đầu ghi',
              icon: recording ? 'stop' : 'mic-outline',
              onPress: () => void (recording ? stopAndUpload() : startRecord()),
              disabled: busy && !recording,
              active: recording,
            },
            {
              key: 'pick',
              label: 'File máy',
              icon: 'folder-open-outline',
              onPress: () => void pickRecordingFromDevice(),
              disabled: busy || recording,
            },
          ]}
        />

        <CollapseSection
          title="Cấp quyền"
          subtitle={micStatus || 'Micro, file âm thanh…'}
          open={permOpen}
          onToggle={() => setPermOpen((v) => !v)}
          Colors={Colors}
          styles={styles}
        >
          <ActionGrid2x2
            pagePadding={PAGE_HPAD + 12}
            items={[
              {
                key: 'perm-quick',
                label: 'Cấp quyền nhanh',
                icon: 'mic-outline',
                onPress: () => void requestVoicePermissionsQuick().then(refreshMicLabel),
              },
              {
                key: 'perm-sync',
                label: 'Như Voice Sync',
                icon: 'settings-outline',
                onPress: () => void showVoicePermissionDialogThenRequest().then(refreshMicLabel),
              },
            ]}
          />
          <Text style={styles.shareTip}>
            Google Phone: Gần đây → bản ghi → Chia sẻ → CRM Mobile
          </Text>
        </CollapseSection>

        <CollapseSection
          title="Ghi chú"
          subtitle={noteDraft.trim() ? noteDraft.trim() : 'Tùy chọn kèm file upload'}
          open={noteOpen}
          onToggle={() => setNoteOpen((v) => !v)}
          Colors={Colors}
          styles={styles}
        >
          <TextInput
            style={styles.noteInput}
            placeholder="Ghi chú kèm file (tùy chọn)…"
            placeholderTextColor={Colors.textFaint}
            value={noteDraft}
            onChangeText={(t) => setNoteDraft(t.slice(0, NOTES_MAX))}
            multiline
            maxLength={NOTES_MAX}
            textAlignVertical="top"
            editable={!recording && !busy}
          />
          <Text style={styles.noteCount}>{noteDraft.length}/{NOTES_MAX}</Text>
        </CollapseSection>

        {recording ? <Text style={styles.live}>Đang ghi…</Text> : null}
        {okBanner ? <Text style={styles.okBanner}>{okBanner}</Text> : null}
      </View>
    </View>
  );
}

function CollapseSection({
  title,
  subtitle,
  open,
  onToggle,
  Colors,
  styles,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.collapseWrap}>
      <Pressable
        style={({ pressed }) => [styles.collapseHead, pressed && { opacity: 0.85 }]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.collapseHeadBody}>
          <Text style={styles.collapseTitle}>{title}</Text>
          {!open && subtitle ? (
            <Text style={styles.collapseSub} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textFaint}
        />
      </Pressable>
      {open ? <View style={styles.collapseBody}>{children}</View> : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { width: '100%' },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
    },
    cardHead: {
      marginBottom: 10,
    },
    cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    collapseWrap: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      overflow: 'hidden',
      backgroundColor: Colors.surfaceSoft,
    },
    collapseHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    collapseHeadBody: { flex: 1, minWidth: 0 },
    collapseTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
    collapseSub: { color: Colors.textFaint, fontSize: 11, marginTop: 2 },
    collapseBody: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.border,
    },
    shareTip: { color: Colors.textFaint, fontSize: 11, lineHeight: 15, marginTop: 10 },
    noteInput: {
      minHeight: 52,
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
      marginTop: 4,
    },
    live: { color: Colors.textMuted, fontWeight: '600', fontSize: 12, marginTop: 8 },
    okBanner: { color: Colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  });

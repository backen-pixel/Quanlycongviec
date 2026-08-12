import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Audio } from 'expo-av';
import React,
  { useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { guessAudioMimeFromFileName } from '../../lib/guessAudioMime';
import { type PendingChatFile } from '../../lib/messengerMedia';
import { getMessengerColors } from '../../lib/messengerTheme';
import { ensureMicOnlyAsync, requestVoicePermissionsQuick } from '../../lib/voicePermissions';
import { Radii, Spacing } from '../../theme';

import SpinningLoader from '../SpinningLoader';

type Props = {
  draft: string;
  sending: boolean;
  pendingFiles: PendingChatFile[];
  emojiOpen: boolean;
  paddingBottom: number;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onToggleEmoji: () => void;
  onAttach: () => void;
  onRemoveFile: (index: number) => void;
  onInputFocus?: () => void;
  onVoiceSend?: (file: PendingChatFile) => void | Promise<void>;
  onSelectionChange?: (start: number, end: number) => void;
  placeholder?: string;
};

const MIN_VOICE_MS = 800;

export default function ChatComposer({
  draft,
  sending,
  pendingFiles,
  emojiOpen,
  paddingBottom,
  onChangeDraft,
  onSend,
  onToggleEmoji,
  onAttach,
  onRemoveFile,
  onInputFocus,
  onVoiceSend,
  onSelectionChange,
  placeholder = 'Nhắn tin...',
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const canSend = !sending && (draft.trim().length > 0 || pendingFiles.length > 0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordStartedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          paddingBottom,
        },
        recordBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 8,
          paddingHorizontal: Spacing.md,
          backgroundColor: isDark ? '#2A1518' : '#FEF2F2',
        },
        recordDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.danger,
        },
        recordTxt: { color: colors.danger, fontSize: 13, fontWeight: '700' },
        pendingRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: Spacing.md,
          paddingTop: 8,
        },
        pendingChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: Radii.lg,
          backgroundColor: mc.accentSoft,
          maxWidth: '100%',
        },
        pendingTxt: { color: colors.text, fontSize: 12, flexShrink: 1 },
        bar: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 10,
          paddingHorizontal: Spacing.md,
          paddingTop: 10,
          paddingBottom: 10,
        },
        plusBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: mc.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        },
        inputWrap: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: mc.inputBg,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 44,
          paddingLeft: 16,
          paddingRight: 4,
        },
        input: {
          flex: 1,
          color: colors.text,
          fontSize: 15,
          maxHeight: 120,
          paddingVertical: 11,
        },
        emojiBtn: {
          width: 36,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBtn: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: mc.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        actionBtnDisabled: { opacity: 0.5 },
      }),
    [colors, isDark, mc, paddingBottom],
  );

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (sending || recording || canSend || !onVoiceSend) return;

    let micOk = await ensureMicOnlyAsync();
    if (!micOk) {
      const r = await requestVoicePermissionsQuick();
      micOk = r.micGranted;
    }
    if (!micOk) {
      Alert.alert('Cần quyền micro', 'Cho phép micro để ghi tin nhắn thoại.');
      return;
    }

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
      recordStartedAt.current = Date.now();
      setRecording(true);
      setRecordSec(0);
      clearRecordTimer();
      recordTimerRef.current = setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch (e) {
      recordingRef.current = null;
      setRecording(false);
      Alert.alert('Ghi âm', (e as Error)?.message || 'Không bắt đầu ghi được');
    }
  };

  const stopRecording = async () => {
    const rec = recordingRef.current;
    if (!rec || !recording) return;

    clearRecordTimer();
    setRecording(false);

    const elapsed = Date.now() - recordStartedAt.current;
    let localUri: string | null = null;

    try {
      await rec.stopAndUnloadAsync();
      localUri = rec.getURI() ?? null;
    } catch {
      localUri = null;
    } finally {
      recordingRef.current = null;
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

    if (elapsed < MIN_VOICE_MS) {
      setRecordSec(0);
      return;
    }

    if (!localUri) {
      Alert.alert('Ghi âm', 'Không lấy được file ghi âm.');
      setRecordSec(0);
      return;
    }

    const uriName = String(localUri).split('/').pop() || '';
    const ext = uriName.includes('.') ? uriName.split('.').pop() : '';
    const fileName = `voice_${Date.now()}${ext ? `.${ext}` : '.m4a'}`;
    const mime = guessAudioMimeFromFileName(fileName) || 'audio/m4a';

    setRecordSec(0);
    await onVoiceSend?.({ uri: localUri, name: fileName, type: mime });
  };

  const formatRecordTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <View style={styles.wrap}>
      {recording ? (
        <View style={styles.recordBar}>
          <View style={styles.recordDot} />
          <Text style={styles.recordTxt}>
            Đang ghi… {formatRecordTime(recordSec)} · Thả để gửi
          </Text>
        </View>
      ) : null}

      {pendingFiles.length ? (
        <View style={styles.pendingRow}>
          {pendingFiles.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={styles.pendingChip}>
              <Ionicons name="document-attach" size={14} color={mc.accent} />
              <Text style={styles.pendingTxt} numberOfLines={1}>{f.name}</Text>
              <Pressable onPress={() => onRemoveFile(i)} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.bar}>
        <Pressable
          style={styles.plusBtn}
          onPress={onAttach}
          disabled={sending || recording}
          hitSlop={4}
        >
          <Ionicons name="add" size={22} color={mc.accent} />
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            value={draft}
            onChangeText={onChangeDraft}
            onSelectionChange={(e) => {
              const { start, end } = e.nativeEvent.selection;
              onSelectionChange?.(start, end);
            }}
            multiline
            editable={!sending && !recording}
            onFocus={() => {
              if (emojiOpen) onToggleEmoji();
              onInputFocus?.();
            }}
          />
          <Pressable
            style={styles.emojiBtn}
            onPress={onToggleEmoji}
            disabled={sending || recording}
            hitSlop={4}
          >
            <Ionicons
              name={emojiOpen ? 'happy' : 'happy-outline'}
              size={22}
              color={emojiOpen ? mc.accent : colors.textFaint}
            />
          </Pressable>
        </View>

        {canSend ? (
          <Pressable
            style={[styles.actionBtn, sending && styles.actionBtnDisabled]}
            onPress={onSend}
            disabled={!canSend}
          >
            {sending ? (
              <SpinningLoader size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionBtn, (sending || !onVoiceSend) && styles.actionBtnDisabled]}
            onPressIn={() => void startRecording()}
            onPressOut={() => void stopRecording()}
            disabled={sending || !onVoiceSend}
          >
            <Ionicons name="mic" size={24} color="#FFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

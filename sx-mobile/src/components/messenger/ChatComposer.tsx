import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
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
  /** Chọn thẳng ảnh từ thư viện (nút ảnh cạnh «+», như khung bong bóng chat). */
  onPickImage?: () => void;
  onRemoveFile: (index: number) => void;
  onInputFocus?: () => void;
  onVoiceSend?: (file: PendingChatFile) => void | Promise<void>;
  onSelectionChange?: (start: number, end: number) => void;
  placeholder?: string;
};

const MIN_VOICE_MS = 800;
// Chiều cao nội dung tối đa của ô nhập (≈ 3 dòng chữ 15). Quá mức này thì ô cuộn bên trong, khung không to thêm.
const MAX_INPUT_H = 66;

// Màu nhấn của khung nhập: GIỐNG khung bong bóng chat (xanh dương) để hai nơi trông như một.
const COMPOSER_BLUE_LIGHT = '#2563EB';
const COMPOSER_BLUE_DARK = '#2F6BFF';
const COMPOSER_GRADIENT = ['#0084FF', '#2563EB'] as const;

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
  onPickImage,
  onRemoveFile,
  onInputFocus,
  onVoiceSend,
  onSelectionChange,
  placeholder = 'Nhắn tin...',
}: Props) {
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const blue = isDark ? COMPOSER_BLUE_DARK : COMPOSER_BLUE_LIGHT;
  const blueSoft = isDark ? 'rgba(47, 107, 255, 0.16)' : 'rgba(37, 99, 235, 0.12)';
  const canSend = !sending && (draft.trim().length > 0 || pendingFiles.length > 0);
  // Đã xuống dòng (cao hơn một dòng chữ) → đổi khung từ «viên thuốc» sang bo nhỏ hơn để không phình như quả bóng.
  const [multiline, setMultiline] = useState(false);
  // Chiều cao nội dung của MỘT dòng (đo thực tế lúc ô trống) — so sánh với nó thay vì con số cố định, vì cỡ chữ hệ thống làm một dòng cao khác nhau.
  const singleLineH = useRef(0);
  // Chiều cao nội dung đo được; ô nhập được GÁN chiều cao cụ thể (kẹp giữa 1 dòng và tối đa) để tin quá dài không thể làm phình khung.
  const [inputContentH, setInputContentH] = useState(0);
  // Một dòng: ép đúng 22 (+18 đệm = 40, khung 52) — không tin vào contentSize lúc ô trống vì có máy báo cao hơn làm khung phình
  // thành hình chữ nhật bo góc thay vì viên thuốc. Nhiều dòng: theo nội dung, kẹp ở MAX_INPUT_H.
  const inputH = multiline ? Math.min(Math.max(inputContentH, 22), MAX_INPUT_H) : 22;
  const inputScrolls = inputContentH > MAX_INPUT_H;

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
          // Cùng nền với vùng tin nhắn → khung nhập «nổi» liền mạch, không còn đường kẻ cứng phía trên (đồng bộ khung bong bóng).
          backgroundColor: colors.bg,
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
        // Thanh đang ghi âm: thay cho khung nhập — [thùng rác huỷ] [chấm đỏ + đồng hồ + hướng dẫn]; nút gửi tròn bên phải.
        recWrap: { alignItems: 'center' },
        recCancel: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2',
        },
        recBody: { flex: 1, paddingHorizontal: 12, justifyContent: 'center' },
        recRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        recTime: { color: colors.text, fontSize: 14, fontWeight: '700' },
        recHint: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
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
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 10,
        },
        plusBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: blueSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        imageBtn: {
          width: 36,
          height: 36,
          marginLeft: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        // «Viên thuốc» nổi: khung sáng bo tròn, viền mảnh + bóng nhẹ, chứa [+] ô nhập [cảm xúc] (như khung bong bóng chat).
        inputWrap: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: colors.bgElevated,
          // Tròn hết cỡ (viên thuốc thật sự) bất kể chiều cao; RN tự kẹp về nửa chiều cao. Nhiều dòng thì bo 20 (xem inputWrapMulti).
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 50,
          paddingHorizontal: 6,
          paddingVertical: 6,
          elevation: 3,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        // Bằng khung bong bóng chat: viên thuốc 26, khi xuống dòng bo 20.
        inputWrapMulti: { borderRadius: 20 },
        input: {
          flex: 1,
          color: colors.text,
          fontSize: 15,
          // Tối đa ~3 dòng rồi cuộn trong ô (chiều cao thật được gán ở JSX theo nội dung, kẹp bởi MAX_INPUT_H).
          maxHeight: MAX_INPUT_H + 18,
          paddingTop: 9,
          paddingBottom: 9,
          paddingHorizontal: 8,
          textAlignVertical: 'center',
        },
        emojiBtn: {
          width: 34,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
        },
        // Nút gửi / ghi âm: tròn lớn 50 (cao bằng khung nhập), chuyển sắc, có bóng.
        actionBtn: {
          width: 50,
          height: 50,
          borderRadius: 25,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        },
        actionBtnDisabled: { opacity: 0.5 },
      }),
    [colors, isDark, mc, paddingBottom, blueSoft],
  );

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  // Chạm micro → bắt đầu ghi (không còn «giữ để ghi»: cú thả tay có thể đến TRƯỚC khi việc ghi kịp bắt đầu, khiến lệnh dừng bị bỏ qua
  // hoặc chạy lên bộ ghi chưa sẵn sàng — lỗi «MediaRecorder: stop called in an invalid state»). Gửi / huỷ bằng hai nút rõ ràng.
  const startingRef = useRef(false);

  const startRecording = async () => {
    if (sending || recording || startingRef.current || canSend || !onVoiceSend) return;
    startingRef.current = true;
    let rec: Audio.Recording | null = null;
    try {
      let micOk = await ensureMicOnlyAsync();
      if (!micOk) {
        const r = await requestVoicePermissionsQuick();
        micOk = r.micGranted;
      }
      if (!micOk) {
        Alert.alert('Cần quyền micro', 'Cho phép micro để ghi tin nhắn thoại.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      rec = new Audio.Recording();
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
      // Bộ ghi đã tạo nhưng chưa chạy được: giải phóng cho sạch (bỏ qua lỗi nếu nó chưa ở trạng thái dừng được).
      if (rec) {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
      }
      Alert.alert('Ghi âm', (e as Error)?.message || 'Không bắt đầu ghi được');
    } finally {
      startingRef.current = false;
    }
  };

  /** Dừng ghi. [send] = true → gửi tin thoại; false → huỷ, bỏ bản ghi. */
  const stopRecording = async (send: boolean) => {
    const rec = recordingRef.current;
    clearRecordTimer();
    setRecording(false);
    if (!rec) return;
    recordingRef.current = null;

    const elapsed = Date.now() - recordStartedAt.current;
    let localUri: string | null = null;

    try {
      await rec.stopAndUnloadAsync();
      localUri = rec.getURI() ?? null;
    } catch {
      localUri = null;
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

    setRecordSec(0);
    if (!send) return;

    if (elapsed < MIN_VOICE_MS) {
      Alert.alert('Ghi âm quá ngắn', 'Hãy ghi ít nhất 1 giây rồi chạm nút gửi.');
      return;
    }

    if (!localUri) {
      Alert.alert('Ghi âm', 'Không lấy được file ghi âm.');
      return;
    }

    const uriName = String(localUri).split('/').pop() || '';
    const ext = uriName.includes('.') ? uriName.split('.').pop() : '';
    const fileName = `voice_${Date.now()}${ext ? `.${ext}` : '.m4a'}`;
    const mime = guessAudioMimeFromFileName(fileName) || 'audio/m4a';

    await onVoiceSend?.({ uri: localUri, name: fileName, type: mime });
  };

  const formatRecordTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <View style={styles.wrap}>
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
        {recording ? (
          <View style={[styles.inputWrap, styles.recWrap]}>
            <Pressable
              style={styles.recCancel}
              onPress={() => void stopRecording(false)}
              hitSlop={8}
              accessibilityLabel="Huỷ ghi âm"
            >
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
            <View style={styles.recBody}>
              <View style={styles.recRow}>
                <View style={styles.recordDot} />
                <Text style={styles.recTime}>Đang ghi âm · {formatRecordTime(recordSec)}</Text>
              </View>
              <Text style={styles.recHint} numberOfLines={1}>Chạm nút gửi để gửi · thùng rác để huỷ</Text>
            </View>
          </View>
        ) : (
        <View style={[styles.inputWrap, multiline && styles.inputWrapMulti]}>
          <Pressable
            style={styles.plusBtn}
            onPress={onAttach}
            disabled={sending || recording}
            hitSlop={4}
          >
            <Ionicons name="add" size={22} color={blue} />
          </Pressable>
          {/* Nút ảnh: chọn thẳng từ thư viện; ẩn khi đang gõ chữ để ô nhập rộng hơn (như khung bong bóng chat). */}
          {onPickImage && draft.length === 0 ? (
            <Pressable
              style={styles.imageBtn}
              onPress={onPickImage}
              disabled={sending || recording}
              hitSlop={4}
            >
              <Ionicons name="image-outline" size={24} color={blue} />
            </Pressable>
          ) : null}
          <TextInput
            style={[styles.input, { height: inputH + 18 }]}
            scrollEnabled={inputScrolls}
            onContentSizeChange={(e) => {
              const h = e.nativeEvent.contentSize.height;
              setInputContentH(h);
              if (draft.length === 0 || singleLineH.current === 0) {
                // Ô trống (hoặc chưa có mốc): đây chính là chiều cao một dòng.
                singleLineH.current = h;
                setMultiline(false);
                return;
              }
              // Cao hơn mốc một dòng ≥ 14 (gần một dòng chữ) = đã xuống dòng.
              setMultiline(h >= singleLineH.current + 14);
            }}
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
              color={emojiOpen ? blue : colors.textFaint}
            />
          </Pressable>
        </View>
        )}

        {recording ? (
          <Pressable
            style={styles.actionBtn}
            onPress={() => void stopRecording(true)}
            accessibilityLabel="Gửi tin nhắn thoại"
          >
            <LinearGradient colors={COMPOSER_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="send" size={22} color="#FFF" />
          </Pressable>
        ) : canSend ? (
          <Pressable
            style={[styles.actionBtn, sending && styles.actionBtnDisabled]}
            onPress={onSend}
            disabled={!canSend}
          >
            <LinearGradient colors={COMPOSER_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            {sending ? (
              <SpinningLoader size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={22} color="#FFF" />
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionBtn, (sending || !onVoiceSend) && styles.actionBtnDisabled]}
            onPress={() => void startRecording()}
            disabled={sending || !onVoiceSend}
            accessibilityLabel="Ghi tin nhắn thoại"
          >
            <LinearGradient colors={COMPOSER_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="mic" size={24} color="#FFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchMessengerGroups } from '../lib/messengerApi';
import { formatFileSize, type PendingChatFile } from '../lib/messengerMedia';
import { getMessengerColors } from '../lib/messengerTheme';
import { sendMessengerWithFiles } from '../lib/messengerUpload';
import { takePendingShareFiles } from '../lib/sharePending';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing } from '../theme';
import type { MessengerThread } from '../types/messenger';
import MessengerAvatar from '../components/messenger/MessengerAvatar';

import SpinningLoader from '../components/SpinningLoader';
type Props = NativeStackScreenProps<RootStackParamList, 'ShareToChat'>;

export default function ShareToChatScreen({ navigation }: Props) {
  const { user } = useAuth();
  const myId = String(user?.id || user?.userId || '');
  const { colors, isDark } = useTheme();
  const mc = getMessengerColors(colors, isDark);
  const insets = useSafeAreaInsets();

  const [files, setFiles] = useState<PendingChatFile[]>(() => takePendingShareFiles());
  const [groups, setGroups] = useState<MessengerThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!files.length) {
      Alert.alert('Chia sẻ', 'Không có file để gửi.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [files.length, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMessengerGroups(myId);
      setGroups(list);
    } catch (e) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không tải được danh sách chat');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGroups = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter(
      (g) => g.name.toLowerCase().includes(term) || g.preview.toLowerCase().includes(term),
    );
  }, [groups, q]);

  const send = async () => {
    if (!selectedId || !files.length) {
      Alert.alert('Chia sẻ', 'Chọn hội thoại để gửi file.');
      return;
    }
    setSending(true);
    try {
      await sendMessengerWithFiles(selectedId, {
        content: caption.trim(),
        files,
      });
      Alert.alert('Đã gửi', 'File đã được gửi vào hội thoại.', [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
            navigation.navigate('ChatDetail', {
              threadId: selectedId,
              title: groups.find((g) => g.id === selectedId)?.name || 'Chat',
            });
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Lỗi', e instanceof Error ? e.message : 'Không gửi được file');
    } finally {
      setSending(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        backBtn: {
          width: 38,
          height: 38,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
        previewCard: {
          margin: Spacing.md,
          marginBottom: 8,
          padding: 12,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        previewTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
        fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
        thumb: { width: 48, height: 48, borderRadius: Radii.md, backgroundColor: colors.border },
        fileName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
        fileMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
        captionWrap: {
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          padding: 12,
          backgroundColor: colors.bgElevated,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        captionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
        captionInput: { color: colors.text, fontSize: 15, minHeight: 40, textAlignVertical: 'top' },
        search: {
          marginHorizontal: Spacing.md,
          marginBottom: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: mc.inputBg,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          fontSize: 15,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowOn: { backgroundColor: mc.accentSoft },
        rowBody: { flex: 1, minWidth: 0 },
        rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
        rowTitleOn: { color: mc.accent },
        rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
        empty: { textAlign: 'center', color: colors.textFaint, marginTop: 32, paddingHorizontal: 24 },
        footer: {
          flexDirection: 'row',
          gap: 10,
          padding: Spacing.md,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: colors.bgElevated,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        cancelBtn: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',
          alignItems: 'center',
        },
        cancelTxt: { fontWeight: '700', color: colors.text },
        sendBtn: {
          flex: 2,
          paddingVertical: 14,
          borderRadius: Radii.lg,
          backgroundColor: mc.accent,
          alignItems: 'center',
        },
        sendBtnOff: { opacity: 0.5 },
        sendTxt: { fontWeight: '800', color: '#FFF' },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      }),
    [colors, isDark, mc, insets],
  );

  const firstImage = files.find((f) => f.type.startsWith('image/'));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TapHighlight style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TapHighlight>
        <Text style={styles.headerTitle}>Gửi vào chat</Text>
      </View>

      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>
          {files.length} file{files.length > 1 ? '' : ''} chia sẻ
        </Text>
        {files.slice(0, 3).map((f) => (
          <View key={`${f.uri}-${f.name}`} style={styles.fileRow}>
            {f.type.startsWith('image/') ? (
              <Image source={{ uri: f.uri }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="document-outline" size={22} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={2}>
                {f.name}
              </Text>
              {f.size ? <Text style={styles.fileMeta}>{formatFileSize(f.size)}</Text> : null}
            </View>
          </View>
        ))}
        {files.length > 3 ? (
          <Text style={styles.fileMeta}>+{files.length - 3} file khác</Text>
        ) : null}
        {firstImage ? (
          <Image
            source={{ uri: firstImage.uri }}
            style={{ width: '100%', height: 120, borderRadius: Radii.md, marginTop: 4 }}
            resizeMode="cover"
          />
        ) : null}
      </View>

      <View style={styles.captionWrap}>
        <Text style={styles.captionLabel}>Ghi chú (tuỳ chọn)</Text>
        <TextInput
          style={styles.captionInput}
          placeholder="Thêm lời nhắn…"
          placeholderTextColor={colors.textFaint}
          value={caption}
          onChangeText={setCaption}
          multiline
        />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Tìm hội thoại…"
        placeholderTextColor={colors.textFaint}
        value={q}
        onChangeText={setQ}
      />

      {loading ? (
        <View style={styles.center}>
          <SpinningLoader size="large" color={mc.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>Không có hội thoại nào.</Text>
          }
          renderItem={({ item }) => {
            const on = selectedId === item.id;
            return (
              <TapHighlight
                style={[styles.row, on && styles.rowOn]}
                onPress={() => setSelectedId(item.id)}
              >
                <MessengerAvatar
                  name={item.name}
                  avatarUrl={item.avatarUrl}
                  color={item.avatarColor}
                  size={44}
                />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, on && styles.rowTitleOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.preview ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.preview}
                    </Text>
                  ) : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={mc.accent} /> : null}
              </TapHighlight>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <TapHighlight style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={styles.cancelTxt}>Huỷ</Text>
        </TapHighlight>
        <TapHighlight
          style={[styles.sendBtn, (!selectedId || sending) && styles.sendBtnOff]}
          onPress={() => void send()}
          disabled={!selectedId || sending}
        >
          {sending ? (
            <SpinningLoader color="#FFF" />
          ) : (
            <Text style={styles.sendTxt}>Gửi</Text>
          )}
        </TapHighlight>
      </View>
    </View>
  );
}

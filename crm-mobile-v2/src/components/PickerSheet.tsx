import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radii, Spacing, useColors, type ThemeColors } from '../theme';

export type PickerOption = { id: string; name: string };

type Props = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  /** Cho phép tìm kiếm khi danh sách dài. */
  searchable?: boolean;
  /** Nhãn cho lựa chọn rỗng (vd "-- Không chọn --"); ẩn nếu không truyền. */
  emptyLabel?: string;
  /** Bật ô nhập tay (vd Người giới thiệu mới). */
  allowCustom?: boolean;
  customPlaceholder?: string;
  loading?: boolean;
  accent?: string;
  onSelect: (option: PickerOption | null) => void;
  /** Gọi khi người dùng nhập tay & xác nhận (allowCustom). */
  onCustom?: (text: string) => void;
  onClose: () => void;
};

export default function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  searchable,
  emptyLabel,
  allowCustom,
  customPlaceholder,
  loading,
  accent,
  onSelect,
  onCustom,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const tint = accent ?? Colors.blue;
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const close = () => {
    setQuery('');
    setCustom('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {searchable ? (
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={Colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm..."
                placeholderTextColor={Colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>
          ) : null}

          {allowCustom ? (
            <View style={styles.customWrap}>
              <TextInput
                style={styles.customInput}
                placeholder={customPlaceholder || 'Nhập mới...'}
                placeholderTextColor={Colors.textFaint}
                value={custom}
                onChangeText={setCustom}
              />
              <TouchableOpacity
                style={[styles.customBtn, { backgroundColor: tint }, !custom.trim() && { opacity: 0.4 }]}
                disabled={!custom.trim()}
                onPress={() => {
                  onCustom?.(custom.trim());
                  close();
                }}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              emptyLabel ? (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => {
                    onSelect(null);
                    close();
                  }}
                >
                  <Text style={[styles.rowText, { color: Colors.textMuted }]}>{emptyLabel}</Text>
                  {!selectedId ? <Ionicons name="checkmark" size={18} color={tint} /> : null}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>{loading ? 'Đang tải...' : 'Không có dữ liệu'}</Text>
            }
            renderItem={({ item }) => {
              const active = String(item.id) === String(selectedId || '');
              return (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => {
                    onSelect(item);
                    close();
                  }}
                >
                  <Text style={[styles.rowText, active && { color: tint, fontWeight: '800' }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={tint} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { flex: 1, color: Colors.text, fontSize: 16, fontWeight: '800' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginTop: 12,
    backgroundColor: Colors.card, borderRadius: Radii.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 0 },
  customWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginTop: 12,
  },
  customInput: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radii.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 44,
    color: Colors.text, fontSize: 15,
  },
  customBtn: { width: 44, height: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  list: { marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, minHeight: 48,
  },
  rowText: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '600' },
  empty: { color: Colors.textFaint, textAlign: 'center', paddingVertical: 28, fontSize: 14 },
});

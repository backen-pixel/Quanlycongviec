import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import { HIT_TARGET, Radii, Spacing } from '../theme';

export type FilterOption = { id: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Bật ô tìm trong sheet (lọc theo label). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Nếu truyền — parent tự lọc options theo query; không thì lọc local. */
  onSearchChange?: (q: string) => void;
};

export default function FilterPickerModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  searchable = false,
  searchPlaceholder = 'Tìm…',
  onSearchChange,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    if (onSearchChange) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label || '').toLowerCase().includes(q));
  }, [options, query, onSearchChange]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '70%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          alignSelf: 'center',
          marginTop: 10,
          marginBottom: 4,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        closeBtn: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        searchWrap: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 10,
          paddingBottom: 4,
        },
        searchInput: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: Radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: colors.text,
          fontSize: 14,
          fontWeight: '600',
        },
        list: { maxHeight: 360 },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          minHeight: HIT_TARGET,
        },
        rowActive: { backgroundColor: colors.primarySoft },
        rowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', marginRight: 8 },
        rowTextActive: { color: colors.primary, fontWeight: '800' },
        empty: {
          textAlign: 'center',
          color: colors.textFaint,
          fontSize: 13,
          fontWeight: '600',
          paddingVertical: 24,
        },
      }),
    [colors],
  );

  const rowColor = colors.text;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {searchable ? (
            <View style={styles.searchWrap}>
              <TextInput
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  onSearchChange?.(t);
                }}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoFocus
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id || '__all__'}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>Không có kết quả</Text>}
            renderItem={({ item }) => {
              const active = selectedId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.rowText,
                      { color: rowColor },
                      active && styles.rowTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

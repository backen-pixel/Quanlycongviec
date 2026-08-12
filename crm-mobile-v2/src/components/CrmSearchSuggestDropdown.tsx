import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Radii, useColors, type ThemeColors } from '../theme';
import type { CrmKanbanItem } from '../types';

type Props = {
  open: boolean;
  query: string;
  loading?: boolean;
  items: CrmKanbanItem[];
  total?: number;
  onSelect: (item: CrmKanbanItem) => void;
  onOpenDetail?: (item: CrmKanbanItem) => void;
  onDismiss: () => void;
};

export default function CrmSearchSuggestDropdown({
  open,
  query,
  loading,
  items,
  total,
  onSelect,
  onOpenDetail,
  onDismiss,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [panelH, setPanelH] = useState(0);
  if (!open) return null;

  const shown = total != null && total > items.length ? total : items.length;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={styles.panel}
        collapsable={false}
        onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
      >
        <View style={styles.head}>
          <Text style={styles.headTxt}>
            {loading && !items.length
              ? 'Đang tìm…'
              : (
                <>
                  <Text style={styles.headCount}>{shown}</Text>
                  {` kết quả cho “${query.trim()}”`}
                </>
              )}
          </Text>
          <Text style={styles.headHint}>
            Chạm dòng để tới thẻ · biểu tượng mắt mở chi tiết
            {total != null && total > items.length ? ` · hiện ${items.length} đầu` : ''}
          </Text>
        </View>
        {loading && items.length ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.blue} />
          </View>
        ) : null}
        {!loading && items.length === 0 ? (
          <Text style={styles.empty}>Không tìm thấy Lead/Deal phù hợp</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.list}
            bounces
            overScrollMode="always"
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
                  onPress={() => onSelect(item)}
                >
                  <View style={styles.codeBox}>
                    <Text style={styles.codeTxt}>{(item.code || '?').slice(0, 2)}</Text>
                  </View>
                  <View style={styles.body}>
                    <View style={styles.titleRow}>
                      {item.code ? (
                        <Text style={styles.codeFull} numberOfLines={1}>{item.code}</Text>
                      ) : null}
                      <Text style={styles.title} numberOfLines={1}>{item.title || '—'}</Text>
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[
                        item.phone || null,
                        item.contactName && item.contactName !== '—' ? item.contactName : null,
                        item.stageName || null,
                        item.ownerName || null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textFaint} />
                </Pressable>
                {onOpenDetail ? (
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => onOpenDetail(item)}
                    hitSlop={6}
                    accessibilityLabel="Mở chi tiết"
                  >
                    <Ionicons name="eye-outline" size={18} color={Colors.blue} />
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
      {/* Backdrop chỉ dưới panel — không đè list (tránh chặn cuộn). */}
      {panelH > 0 ? (
        <Pressable
          style={[styles.backdrop, { top: panelH + 4 }]}
          onPress={onDismiss}
          accessibilityLabel="Đóng gợi ý tìm"
        />
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    zIndex: 40,
    elevation: 20,
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 640,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  panel: {
    marginHorizontal: 12,
    marginTop: 4,
    maxHeight: 320,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: Colors.blue,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
    zIndex: 2,
  },
  head: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.blueSoft,
  },
  headTxt: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  headCount: { color: Colors.blue, fontWeight: '800' },
  headHint: { color: Colors.textMuted, fontSize: 10, marginTop: 2, fontWeight: '500' },
  loadingRow: { paddingVertical: 6, alignItems: 'center' },
  empty: {
    padding: 16,
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  list: { maxHeight: 248 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mainPressed: { backgroundColor: Colors.blueSoft },
  codeBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeTxt: { color: Colors.textMuted, fontSize: 10, fontWeight: '800' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeFull: { color: Colors.textFaint, fontSize: 10, fontWeight: '700', maxWidth: 72 },
  title: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' },
  meta: { color: Colors.textMuted, fontSize: 11, fontWeight: '500' },
  eyeBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
});

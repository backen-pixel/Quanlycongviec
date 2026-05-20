import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import { searchUsersForAssign, type WorkTaskUserOption } from '../lib/workTaskApi';

type Props = {
  visible: boolean;
  title?: string;
  allowClear?: boolean;
  excludeIds?: string[];
  onClose: () => void;
  onPick: (user: WorkTaskUserOption | null) => void;
};

export default function AssigneePickerModal({
  visible,
  title = 'Giao cho ai?',
  allowClear = true,
  excludeIds = [],
  onClose,
  onPick,
}: Props) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<WorkTaskUserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const list = await searchUsersForAssign(search);
        if (mounted) setUsers(list);
      } catch {
        if (mounted) setUsers([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [visible, search]);

  const filtered = users.filter((u) => !excludeIds.includes(u.id));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>Đóng</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.search}
            placeholder="Tìm theo tên hoặc email"
            placeholderTextColor={CrmColors.gray400}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {allowClear && (
            <TouchableOpacity
              style={styles.clearRow}
              onPress={() => {
                onPick(null);
                onClose();
              }}
            >
              <View style={styles.clearAvatar}>
                <Text style={styles.clearAvatarTxt}>—</Text>
              </View>
              <Text style={styles.clearTxt}>Bỏ chọn / Không giao cho ai</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={CrmColors.blue600} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => String(u.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {search ? `Không có ai khớp "${search}".` : 'Không có người dùng.'}
                </Text>
              }
              renderItem={({ item }) => {
                const name = item.full_name || item.email || 'Người dùng';
                const initials = (name || '?')
                  .split(/\s+/)
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => {
                      onPick(item);
                      onClose();
                    }}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      {item.email ? (
                        <Text style={styles.email} numberOfLines={1}>
                          {item.email}
                        </Text>
                      ) : null}
                    </View>
                    {item.position ? (
                      <Text style={styles.pos} numberOfLines={1}>
                        {item.position}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '85%',
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: CrmColors.gray900 },
  close: { fontSize: 14, color: CrmColors.blue600, fontWeight: '600' },
  search: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    color: CrmColors.gray900,
    fontSize: 14,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  clearAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CrmColors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAvatarTxt: { color: CrmColors.gray600, fontWeight: '700' },
  clearTxt: { color: CrmColors.gray700, fontSize: 14 },
  loadingBox: { paddingVertical: 24 },
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
    color: CrmColors.gray500,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: CrmColors.blue700, fontWeight: '700', fontSize: 12 },
  name: { color: CrmColors.gray900, fontSize: 14, fontWeight: '600' },
  email: { color: CrmColors.gray500, fontSize: 12, marginTop: 2 },
  pos: { color: CrmColors.gray500, fontSize: 11, maxWidth: 100 },
});

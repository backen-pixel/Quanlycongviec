import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'FacebookInbox'>;

type FbPage = { id: string; page_id: string; page_name?: string | null; is_active?: boolean | null };
type FbContact = {
  id: string;
  fb_name?: string | null;
  page_id?: string | null;
  last_message_preview?: string | null;
  unread_count?: number | null;
  display_phone?: string | null;
  lead?: { id: string; title?: string | null; code?: string | null } | null;
};

type Props = { navigation: Nav };

export default function FacebookInboxScreen({ navigation }: Props) {
  const [pages, setPages] = useState<FbPage[]>([]);
  const [pageId, setPageId] = useState<string>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FbContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPages = useCallback(async () => {
    try {
      const { data } = await api.get<FbPage[]>('/facebook/pages');
      setPages(Array.isArray(data) ? data : []);
    } catch {
      setPages([]);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data?: FbContact[] }>('/facebook/contacts', {
        params: {
          page_id: pageId || undefined,
          search: q.trim() || undefined,
          limit: 500,
        },
      });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pageId, q]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPages();
      await loadContacts();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>Danh bạ & hội thoại Facebook (API giống web).</Text>
      <View style={styles.pageRow}>
        <TouchableOpacity
          style={[styles.pageChip, !pageId && styles.pageChipOn]}
          onPress={() => setPageId('')}
        >
          <Text style={[styles.pageChipTxt, !pageId && styles.pageChipTxtOn]}>Tất cả Page</Text>
        </TouchableOpacity>
        <FlatList
          horizontal
          data={pages}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: p }) => {
            const on = pageId === p.page_id;
            return (
              <TouchableOpacity style={[styles.pageChip, on && styles.pageChipOn]} onPress={() => setPageId(p.page_id)}>
                <Text style={[styles.pageChipTxt, on && styles.pageChipTxtOn]} numberOfLines={1}>
                  {p.page_name || p.page_id}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInp}
          placeholder="Tìm tên FB, SĐT…"
          placeholderTextColor={CrmColors.gray400}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void loadContacts()}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchGo} onPress={() => void loadContacts()}>
          <Text style={styles.searchGoTxt}>Tìm</Text>
        </TouchableOpacity>
      </View>
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
          }
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<Text style={styles.empty}>Không có liên hệ.</Text>}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[styles.row, CrmShadow.sm]}
              onPress={() => navigation.navigate('FacebookChat', { contactId: c.id })}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.fb_name || '—'}
                  </Text>
                  {(c.unread_count || 0) > 0 ? (
                    <View style={styles.unread}>
                      <Text style={styles.unreadTxt}>{c.unread_count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.preview} numberOfLines={2}>
                  {c.last_message_preview || '—'}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {c.display_phone ? `📞 ${c.display_phone}` : ''}
                  {c.lead?.code ? ` · ${c.lead.code}` : ''}
                </Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  hint: { paddingHorizontal: 16, paddingTop: 10, fontSize: 12, color: CrmColors.gray500 },
  pageRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  pageChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 6,
  },
  pageChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  pageChipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600, maxWidth: 140 },
  pageChipTxtOn: { color: CrmColors.blue700 },
  searchWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  searchInp: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  searchGo: {
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
  },
  searchGoTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  unread: {
    backgroundColor: CrmColors.rose500,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  preview: { fontSize: 12, color: CrmColors.gray600, marginTop: 4 },
  meta: { fontSize: 11, color: CrmColors.gray400, marginTop: 6 },
  chev: { fontSize: 22, color: CrmColors.gray300, paddingLeft: 6 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 40 },
});

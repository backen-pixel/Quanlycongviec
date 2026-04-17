import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
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
  phone?: string | null;
  last_message_preview?: string | null;
  unread_count?: number | null;
  display_phone?: string | null;
  lead?: { id: string; title?: string | null; code?: string | null } | null;
  customer?: { phone?: string | null } | null;
};

type ContactFilter =
  | 'all'
  | 'has_phone'
  | 'no_phone'
  | 'has_lead'
  | 'no_lead'
  | 'lead_has_phone'
  | 'lead_no_phone';

type Props = { navigation: Nav };

function hasPhone(c: FbContact): boolean {
  return !!(c.display_phone || c.phone || c.customer?.phone);
}

function rowSurface(c: FbContact): { borderLeftColor: string; bg: string } {
  const ph = hasPhone(c);
  const ld = !!c.lead;
  if (ld && ph) return { borderLeftColor: '#059669', bg: '#ecfdf5' };
  if (ld && !ph) return { borderLeftColor: '#d97706', bg: '#fffbeb' };
  if (!ld && ph) return { borderLeftColor: '#16a34a', bg: '#f0fdf4' };
  return { borderLeftColor: CrmColors.gray200, bg: CrmColors.white };
}

const FILTER_CHIPS: { key: ContactFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'has_phone', label: '📞 Có SĐT' },
  { key: 'no_phone', label: '❌ Chưa SĐT' },
  { key: 'has_lead', label: '🏷 Có Lead' },
  { key: 'no_lead', label: '🔔 Chưa Lead' },
  { key: 'lead_has_phone', label: '✅ Lead + SĐT' },
  { key: 'lead_no_phone', label: '⚠️ Lead thiếu SĐT' },
];

export default function FacebookInboxScreen({ navigation }: Props) {
  const [pages, setPages] = useState<FbPage[]>([]);
  const [pageId, setPageId] = useState<string>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FbContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');

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
      const params: Record<string, string | number> = {
        limit: 500,
      };
      if (pageId) params.page_id = pageId;
      if (q.trim()) params.search = q.trim();
      if (contactFilter === 'has_lead') params.has_lead = 'true';
      else if (contactFilter === 'no_lead') params.has_lead = 'false';

      const { data } = await api.get<{ data?: FbContact[] }>('/facebook/contacts', { params });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pageId, q, contactFilter]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filtered = useMemo(() => {
    const list = rows;
    switch (contactFilter) {
      case 'has_phone':
        return list.filter((c) => hasPhone(c));
      case 'no_phone':
        return list.filter((c) => !hasPhone(c));
      case 'has_lead':
      case 'no_lead':
        return list;
      case 'lead_has_phone':
        return list.filter((c) => !!c.lead && hasPhone(c));
      case 'lead_no_phone':
        return list.filter((c) => !!c.lead && !hasPhone(c));
      default:
        return list;
    }
  }, [rows, contactFilter]);

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
      <Text style={styles.hint}>Danh bạ Facebook — màu & lọc giống web (SĐT / Lead).</Text>
      <View style={styles.pageRow}>
        <TouchableOpacity
          style={[styles.pageChip, styles.pageChipFirst, !pageId && styles.pageChipOn]}
          onPress={() => setPageId('')}
        >
          <Text style={[styles.pageChipTxt, !pageId && styles.pageChipTxtOn]} numberOfLines={1}>
            Tất cả Page
          </Text>
        </TouchableOpacity>
        <View style={styles.pageListWrap}>
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
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        {FILTER_CHIPS.map((f) => {
          const on = contactFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, on && styles.filterChipOn]}
              onPress={() => setContactFilter(f.key)}
            >
              <Text style={[styles.filterChipTxt, on && styles.filterChipTxtOn]} numberOfLines={1}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
        <TouchableOpacity style={styles.searchGo} onPress={() => void loadContacts()} activeOpacity={0.85}>
          <Text style={styles.searchGoTxt}>Tìm</Text>
        </TouchableOpacity>
      </View>
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={CrmColors.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />
          }
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={<Text style={styles.empty}>Không có liên hệ.</Text>}
          renderItem={({ item: c }) => {
            const surf = rowSurface(c);
            const phoneStr = c.display_phone || c.phone || c.customer?.phone;
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  CrmShadow.sm,
                  { borderLeftWidth: 4, borderLeftColor: surf.borderLeftColor, backgroundColor: surf.bg },
                ]}
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
                  <View style={styles.badgeRow}>
                    {phoneStr ? (
                      <View style={styles.badgeGreen}>
                        <Text style={styles.badgeGreenTxt}>📞 {phoneStr}</Text>
                      </View>
                    ) : null}
                    {c.lead?.code ? (
                      <View style={styles.badgeBlue}>
                        <Text style={styles.badgeBlueTxt}>🏷 {c.lead.code}</Text>
                      </View>
                    ) : null}
                    {!phoneStr && !c.lead ? (
                      <View style={styles.badgeGray}>
                        <Text style={styles.badgeGrayTxt}>💬 Messenger</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.chevWrap}>
                  <Text style={styles.chev}>›</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  hint: { paddingHorizontal: 16, paddingTop: 10, fontSize: 12, color: CrmColors.gray500 },
  pageRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  pageChipFirst: { flexShrink: 0, maxWidth: 118 },
  pageListWrap: { flex: 1, minWidth: 0 },
  pageChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 6,
    flexShrink: 0,
  },
  pageChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  pageChipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600, maxWidth: 160 },
  pageChipTxtOn: { color: CrmColors.blue700 },
  filterScroll: { maxHeight: 52, flexGrow: 0, marginTop: 8 },
  filterScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: 20,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 8,
    flexShrink: 0,
  },
  filterChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  filterChipTxt: { fontSize: 11, fontWeight: '700', color: CrmColors.gray600 },
  filterChipTxtOn: { color: CrmColors.blue700 },
  searchWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  searchInp: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchGoTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listPad: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badgeGreen: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGreenTxt: { fontSize: 10, fontWeight: '700', color: '#15803d' },
  badgeBlue: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeBlueTxt: { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },
  badgeGray: {
    backgroundColor: CrmColors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  badgeGrayTxt: { fontSize: 10, fontWeight: '700', color: CrmColors.gray600 },
  chevWrap: { flexShrink: 0, justifyContent: 'center', paddingLeft: 4 },
  chev: { fontSize: 22, color: CrmColors.gray300 },
  empty: { textAlign: 'center', color: CrmColors.gray400, marginTop: 40 },
});

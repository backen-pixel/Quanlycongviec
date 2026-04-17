import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDateTime } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';

type Props = { leadId: string };

type FbMsg = {
  id: string;
  direction?: string | null;
  content?: string | null;
  created_at?: string | null;
  message_type?: string | null;
  attachment_url?: string | null;
  contact?: { id: string; fb_name?: string | null } | null;
};

export default function LeadFacebookPanel({ leadId }: Props) {
  const [items, setItems] = useState<FbMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<FbMsg[]>(`/facebook/leads/${leadId}/messages`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const contactId = useMemo(() => {
    for (const m of items) {
      const c = m.contact?.id;
      if (c) return String(c);
    }
    return null;
  }, [items]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !contactId) return;
    setSending(true);
    try {
      await api.post(`/facebook/contacts/${contactId}/reply`, { message: text });
      setDraft('');
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không gửi được tin nhắn.';
      Alert.alert('Lỗi', String(msg));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={styles.box}>
        <Text style={styles.muted}>Chưa có tin nhắn Facebook gắn khách hàng / lead này (hoặc chưa kết nối Page).</Text>
        <TouchableOpacity style={[styles.outline, CrmShadow.card]} onPress={() => openWebPath(`/crm/leads/${leadId}?tab=facebook`)}>
          <Text style={styles.outlineTxt}>Mở Facebook đầy đủ trên web</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Tin nhắn từ Facebook (theo liên hệ gắn lead). Trả lời nhanh ở dưới nếu có quyền Page.
      </Text>
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const out = String(item.direction || '').toLowerCase() === 'outbound';
          return (
            <View style={[styles.bubbleRow, out ? styles.rowOut : styles.rowIn]}>
              <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn, CrmShadow.card]}>
                <Text style={[styles.meta, out && styles.metaOnPrimary]}>
                  {out ? 'Page' : item.contact?.fb_name || 'Khách'}{' · '}
                  {formatDateTime(item.created_at)}
                </Text>
                {item.content ? <Text style={[styles.body, out && styles.bodyOnPrimary]}>{item.content}</Text> : null}
                {item.attachment_url ? (
                  <TouchableOpacity onPress={() => void Linking.openURL(item.attachment_url!)}>
                    <Text style={[styles.link, out && styles.linkOnPrimary]}>Đính kèm / ảnh</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      {contactId ? (
        <View style={[styles.composer, CrmShadow.card]}>
          <TextInput
            style={styles.inp}
            placeholder="Trả lời Messenger…"
            placeholderTextColor={CrmColors.gray400}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}
            onPress={() => void send()}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendTxt}>{sending ? '…' : 'Gửi'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.mutedSmall}>Không xác định được contact — chỉ xem, trả lời trên web.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 280 },
  box: { paddingVertical: 8 },
  center: { paddingVertical: 24, alignItems: 'center' },
  hint: { fontSize: 12, color: CrmColors.gray600, marginBottom: 10 },
  list: { flexGrow: 0, maxHeight: 360 },
  listContent: { paddingBottom: 8 },
  bubbleRow: { marginBottom: 8, flexDirection: 'row' },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '92%', padding: 10, borderRadius: CrmRadii.md },
  bubbleOut: { backgroundColor: CrmColors.blue600 },
  bubbleIn: { backgroundColor: CrmColors.white, borderWidth: 1, borderColor: CrmColors.gray200 },
  meta: { fontSize: 11, color: CrmColors.gray500, marginBottom: 4 },
  metaOnPrimary: { color: 'rgba(255,255,255,0.88)' },
  body: { fontSize: 14, color: CrmColors.gray900 },
  bodyOnPrimary: { color: CrmColors.white },
  link: { marginTop: 6, fontSize: 13, color: CrmColors.blue600, fontWeight: '700' },
  linkOnPrimary: { color: CrmColors.white },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
    padding: 8,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  inp: { flex: 1, minHeight: 40, maxHeight: 100, fontSize: 15, color: CrmColors.gray900, paddingHorizontal: 8 },
  send: {
    marginLeft: 8,
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: CrmRadii.sm,
  },
  sendOff: { opacity: 0.45 },
  sendTxt: { color: CrmColors.white, fontWeight: '800' },
  muted: { fontSize: 13, color: CrmColors.gray500, marginBottom: 12, lineHeight: 19 },
  mutedSmall: { fontSize: 12, color: CrmColors.gray500, marginTop: 6 },
  outline: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue600,
    backgroundColor: CrmColors.white,
  },
  outlineTxt: { color: CrmColors.blue600, fontWeight: '700', fontSize: 14 },
});

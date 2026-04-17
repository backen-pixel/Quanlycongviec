import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { openMoreTab } from '../navigation/openMoreTab';
import type { CrmStackParamList } from '../navigation/types';

type Props = {
  leadId: string;
  navigation: NativeStackNavigationProp<CrmStackParamList, 'LeadDetail'>;
};

type EnsureRes = { group_id: string; name?: string; created?: boolean };

export default function LeadMessengerPanel({ leadId, navigation }: Props) {
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const { data } = await api.get<{ id: string; name?: string }[]>('/messenger/groups', {
        params: { crm_lead_id: leadId },
      });
      const list = Array.isArray(data) ? data : [];
      if (list[0]?.id) {
        setGroupId(String(list[0].id));
        setGroupName(list[0].name || null);
      } else {
        setGroupId(null);
        setGroupName(null);
      }
    } catch {
      setGroupId(null);
      setGroupName(null);
    } finally {
      setChecking(false);
    }
  }, [leadId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const openChat = () => {
    if (!groupId) return;
    openMoreTab(navigation, 'MessengerGroupChat', {
      groupId,
      title: groupName || 'Chat nội bộ',
      isDirect: false,
    });
  };

  const ensureGroup = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<EnsureRes>(`/messenger/leads/${leadId}/ensure-internal-chat`);
      if (data?.group_id) {
        setGroupId(String(data.group_id));
        setGroupName(data.name || null);
        openMoreTab(navigation, 'MessengerGroupChat', {
          groupId: String(data.group_id),
          title: data.name || 'Chat nội bộ',
          isDirect: false,
        });
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không tạo/mở được nhóm chat nội bộ.';
      Alert.alert('Lỗi', String(msg));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
        <Text style={styles.muted}>Đang kiểm tra nhóm nội bộ…</Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Chat nội bộ (Messenger)</Text>
      <Text style={styles.sub}>
        Một nhóm gắn với lead/deal này: team lead được thêm thành viên; trao đổi nội bộ tách khỏi lịch sử CRM trên tab «Trao đổi CRM».
      </Text>
      {groupId ? (
        <>
          <Text style={styles.name} numberOfLines={2}>
            {groupName || 'Nhóm chat'}
          </Text>
          <TouchableOpacity style={[styles.btn, CrmShadow.card]} onPress={openChat} activeOpacity={0.88}>
            <Text style={styles.btnTxt}>Mở nhóm chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.link} onPress={() => void ensureGroup()} disabled={busy}>
            <Text style={styles.linkTxt}>{busy ? 'Đang đồng bộ…' : 'Làm mới / đảm bảo thành viên'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.muted}>Chưa có nhóm nội bộ cho lead/deal này.</Text>
          <TouchableOpacity
            style={[styles.btn, busy && styles.btnOff, CrmShadow.card]}
            onPress={() => void ensureGroup()}
            disabled={busy}
            activeOpacity={0.88}
          >
            <Text style={styles.btnTxt}>{busy ? 'Đang tạo…' : 'Tạo & mở nhóm chat nội bộ'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 4 },
  center: { paddingVertical: 24, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900, marginBottom: 8 },
  sub: { fontSize: 13, color: CrmColors.gray600, lineHeight: 19, marginBottom: 16 },
  name: { fontSize: 14, fontWeight: '700', color: CrmColors.gray800, marginBottom: 12 },
  muted: { fontSize: 13, color: CrmColors.gray500, marginBottom: 12 },
  btn: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.55 },
  btnTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 15 },
  link: { marginTop: 12, alignSelf: 'center' },
  linkTxt: { color: CrmColors.blue600, fontWeight: '600', fontSize: 13 },
});

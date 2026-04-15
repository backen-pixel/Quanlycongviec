import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import { useNotifications } from '../context/NotificationContext';
import { formatDateTime } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';
import { notifIconFor, notifTintFor } from '../lib/notifPresentation';
import type { MainTabParamList } from '../navigation/types';
import type { AppNotification } from '../types/notifications';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type TabNav = BottomTabNavigationProp<MainTabParamList>;

type TabKey = 'all' | 'unread';

function meta(n: AppNotification): Record<string, unknown> {
  const m = n.metadata;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

function openFromNotification(n: AppNotification, navigation: TabNav) {
  const m = meta(n);
  const pid =
    (typeof m.project_id === 'string' && m.project_id) ||
    (n.entity_type === 'project' && n.entity_id ? n.entity_id : null);
  const navTab = typeof m.nav_tab === 'string' ? m.nav_tab : undefined;
  if (pid) {
    const q = navTab ? `?tab=${encodeURIComponent(navTab)}` : '';
    openWebPath(`/projects/${pid}${q}`);
    return;
  }
  if (n.entity_type === 'task' && n.entity_id) {
    openWebPath(`/tasks?task=${encodeURIComponent(n.entity_id)}`);
    return;
  }
  if (n.entity_type === 'crm_lead' || n.entity_type === 'crm_deal' || n.entity_type === 'lead') {
    const id = n.entity_id;
    if (id) navigation.navigate('CrmTab', { screen: 'LeadDetail', params: { id } });
    return;
  }
  if (n.entity_type === 'quotation' && n.entity_id) {
    openWebPath(`/crm/quotations/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'order' && n.entity_id) {
    openWebPath(`/crm/orders/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'invoice' && n.entity_id) {
    openWebPath(`/crm/invoices/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'crm_task') {
    openWebPath('/crm/tasks');
    return;
  }
  if (n.entity_type === 'event') {
    openWebPath('/crm/events');
    return;
  }
  if (n.entity_type === 'release_note') {
    openWebPath('/updates');
    return;
  }
  Alert.alert('Thông báo', 'Không có liên kết mở cho loại thông báo này.');
}

export default function NotificationsScreen() {
  const navigation = useNavigation<TabNav>();
  const { refreshUnread, subscribeIncoming, unreadCount: apiUnread } = useNotifications();
  const [tab, setTab] = useState<TabKey>('all');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [approvalForm, setApprovalForm] = useState<{
    notifId: string;
    action: 'approve' | 'reject';
    reason: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === 'unread' ? { unread: 'true' as const } : {};
      const { data } = await api.get<{ notifications?: AppNotification[] }>('/dashboard/notifications', { params });
      setItems(data.notifications || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), refreshUnread()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshUnread();
    }, [load, refreshUnread]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = subscribeIncoming((n) => {
      setItems((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev];
      });
    });
    return unsub;
  }, [subscribeIncoming]);

  const markAllRead = useCallback(async () => {
    try {
      await api.put('/dashboard/notifications/read-all');
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      await refreshUnread();
    } catch {
      /* ignore */
    }
  }, [refreshUnread]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await api.put(`/dashboard/notifications/${id}/read`);
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
        await refreshUnread();
      } catch {
        /* ignore */
      }
    },
    [refreshUnread],
  );

  const handleApproval = useCallback(
    async (notifId: string, action: 'approve' | 'reject', reason: string) => {
      const n = items.find((x) => x.id === notifId);
      const m = n ? meta(n) : {};
      const projectId = typeof m.project_id === 'string' ? m.project_id : null;
      if (!projectId) {
        Alert.alert('Lỗi', 'Thiếu thông tin dự án.');
        return;
      }
      if (!reason.trim()) {
        Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do (bắt buộc).');
        return;
      }
      try {
        await api.post(`/projects/${projectId}/approve-advance`, {
          notification_id: notifId,
          action,
          reject_reason: reason.trim(),
        });
        setItems((prev) =>
          prev.map((x) => {
            if (x.id !== notifId) return x;
            const md = meta(x);
            return {
              ...x,
              is_read: true,
              metadata: { ...md, status: action === 'approve' ? 'approved' : 'rejected' },
            };
          }),
        );
        setApprovalForm(null);
        await refreshUnread();
      } catch (e: unknown) {
        const msg =
          e && typeof e === 'object' && 'response' in e
            ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error || '')
            : '';
        Alert.alert('Lỗi', msg || 'Không thực hiện được phê duyệt');
      }
    },
    [items, refreshUnread],
  );

  const renderItem = useCallback(
    ({ item: n }: { item: AppNotification }) => {
      const m = meta(n);
      const isApproval = m.type === 'approval_request';
      const approvalStatus = typeof m.status === 'string' ? m.status : undefined;
      const tint = notifTintFor(n.type, isApproval);
      const icon = notifIconFor(n.type, isApproval);

      const onRowMainPress = () => {
        if (!n.is_read && !isApproval) void markRead(n.id);
        if (!isApproval) openFromNotification(n, navigation);
      };

      return (
        <View style={[styles.notifRow, !n.is_read && styles.notifUnread]}>
          <TouchableOpacity
            style={styles.notifMainHit}
            activeOpacity={0.75}
            onPress={onRowMainPress}
            disabled={isApproval}
          >
            <View style={[styles.iconCircle, { backgroundColor: tint.bg }]}>
              <Ionicons name={icon} size={20} color={tint.fg} />
            </View>
            <View style={styles.notifBody}>
              <View style={styles.titleRow}>
                <Text style={[styles.notifTitle, !n.is_read && styles.notifTitleBold]} numberOfLines={2}>
                  {n.title}
                </Text>
                {!n.is_read && !isApproval ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.notifMsg} numberOfLines={4}>
                {n.message}
              </Text>

              {isApproval && typeof m.notes === 'string' && m.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesTxt}>📝 {m.notes}</Text>
                </View>
              ) : null}

              {isApproval && Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                <View style={styles.attachRow}>
                  {(m.attachments as { file_url?: string; file_name?: string; mime_type?: string }[]).map((f, fi) => {
                    const url = f.file_url || '';
                    const name = f.file_name || 'file';
                    const isImg = (f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) && url;
                    return isImg ? (
                      <Pressable key={fi} onPress={() => void Linking.openURL(url)}>
                        <Image source={{ uri: url }} style={styles.thumb} />
                      </Pressable>
                    ) : (
                      <Pressable key={fi} onPress={() => url && void Linking.openURL(url)} style={styles.fileChip}>
                        <Text style={styles.fileChipTxt} numberOfLines={1}>
                          📎 {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </TouchableOpacity>

          <View style={styles.notifBodyFull}>
            {isApproval && approvalStatus === 'pending' && approvalForm?.notifId !== n.id ? (
              <View style={styles.approvalBtns}>
                <TouchableOpacity
                  style={styles.btnApprove}
                  onPress={() => setApprovalForm({ notifId: n.id, action: 'approve', reason: '' })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnApproveTxt}>Duyệt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnReject}
                  onPress={() => setApprovalForm({ notifId: n.id, action: 'reject', reason: '' })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnRejectTxt}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {isApproval && approvalForm?.notifId === n.id ? (
              <View style={styles.inlineForm}>
                <Text style={styles.inlineLabel}>
                  {approvalForm.action === 'approve' ? 'Lý do duyệt' : 'Lý do từ chối'} (bắt buộc)
                </Text>
                <TextInput
                  style={styles.inlineInput}
                  value={approvalForm.reason}
                  onChangeText={(t) => setApprovalForm((f) => (f ? { ...f, reason: t } : f))}
                  placeholder={approvalForm.action === 'approve' ? 'Nhập lý do duyệt…' : 'Nhập lý do từ chối…'}
                  multiline
                />
                <View style={styles.inlineActions}>
                  <TouchableOpacity
                    style={approvalForm.action === 'approve' ? styles.btnConfirmOk : styles.btnConfirmNo}
                    onPress={() => void handleApproval(n.id, approvalForm.action, approvalForm.reason)}
                  >
                    <Text style={styles.btnConfirmTxt}>Xác nhận</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnCancelSmall} onPress={() => setApprovalForm(null)}>
                    <Text style={styles.btnCancelSmallTxt}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {isApproval && approvalStatus === 'approved' ? (
              <Text style={styles.statusOk}>Đã duyệt</Text>
            ) : null}
            {isApproval && approvalStatus === 'rejected' ? (
              <Text style={styles.statusNo}>Đã từ chối</Text>
            ) : null}

            <Text style={styles.time}>{formatDateTime(n.created_at)}</Text>
          </View>
        </View>
      );
    },
    [approvalForm, handleApproval, markRead, navigation],
  );

  const listData = tab === 'unread' ? items.filter((x) => !x.is_read) : items;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TuBep Pro</Text>
          <Text style={styles.h1}>Thông báo</Text>
        </View>
        <View style={styles.headerActions}>
          {apiUnread > 0 ? (
            <TouchableOpacity onPress={() => void markAllRead()} style={styles.markAll} activeOpacity={0.8}>
              <Ionicons name="checkmark-done-outline" size={18} color={CrmColors.blue600} />
              <Text style={styles.markAllTxt}>Đọc tất cả</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn} hitSlop={10}>
            <Ionicons name="settings-outline" size={22} color={CrmColors.gray600} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.tabBar, CrmShadow.sm]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'all' && styles.tabOn]}
          onPress={() => setTab('all')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabTxt, tab === 'all' && styles.tabTxtOn]}>Tất cả</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'unread' && styles.tabOn]}
          onPress={() => setTab('unread')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabTxt, tab === 'unread' && styles.tabTxtOn]}>
            Chưa đọc{apiUnread > 0 ? ` (${apiUnread})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && listData.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CrmColors.blue600} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={CrmColors.gray300} />
              <Text style={styles.emptyTxt}>{tab === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}</Text>
            </View>
          }
        />
      )}

      <NotificationSettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CrmColors.pageBg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  kicker: { fontSize: 11, fontWeight: '700', color: CrmColors.blue700, letterSpacing: 0.5 },
  h1: { fontSize: 26, fontWeight: '800', color: CrmColors.gray900, marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10 },
  markAllTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue600 },
  iconBtn: { padding: 8, borderRadius: CrmRadii.md },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: CrmRadii.md },
  tabOn: { backgroundColor: CrmColors.blue50 },
  tabTxt: { fontSize: 13, fontWeight: '600', color: CrmColors.gray500 },
  tabTxtOn: { color: CrmColors.blue600 },
  listPad: { paddingHorizontal: 20, paddingBottom: 24 },
  notifRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    ...CrmShadow.card,
  },
  notifMainHit: { flexDirection: 'row', alignItems: 'flex-start' },
  notifUnread: { backgroundColor: '#F0F6FF' },
  notifBodyFull: { paddingLeft: 52 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifBody: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  notifTitle: { flex: 1, fontSize: 14, color: CrmColors.gray700 },
  notifTitleBold: { fontWeight: '700', color: CrmColors.gray900 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CrmColors.blue600, marginTop: 5 },
  notifMsg: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, lineHeight: 17 },
  notesBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: CrmColors.amber50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.amber100,
  },
  notesTxt: { fontSize: 11, color: CrmColors.amber600 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  thumb: { width: 48, height: 48, borderRadius: CrmRadii.sm, borderWidth: 1, borderColor: CrmColors.gray200 },
  fileChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: CrmRadii.sm,
    backgroundColor: CrmColors.blue50,
    maxWidth: 160,
  },
  fileChipTxt: { fontSize: 10, color: CrmColors.blue600, fontWeight: '600' },
  approvalBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.emerald600,
  },
  btnApproveTxt: { color: CrmColors.white, fontSize: 12, fontWeight: '700' },
  btnReject: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.red50,
    borderWidth: 1,
    borderColor: CrmColors.red200,
  },
  btnRejectTxt: { color: CrmColors.red700, fontSize: 12, fontWeight: '700' },
  inlineForm: { marginTop: 10 },
  inlineLabel: { fontSize: 11, fontWeight: '700', color: CrmColors.gray700, marginBottom: 6 },
  inlineInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 13,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
    textAlignVertical: 'top',
  },
  inlineActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnConfirmOk: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: CrmRadii.md, backgroundColor: CrmColors.emerald600 },
  btnConfirmNo: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: CrmRadii.md, backgroundColor: CrmColors.red500 },
  btnConfirmTxt: { color: CrmColors.white, fontSize: 12, fontWeight: '700' },
  btnCancelSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
  },
  btnCancelSmallTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  statusOk: { marginTop: 6, fontSize: 11, fontWeight: '700', color: CrmColors.emerald600 },
  statusNo: { marginTop: 6, fontSize: 11, fontWeight: '700', color: CrmColors.red500 },
  time: { fontSize: 10, color: CrmColors.gray400, marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTxt: { marginTop: 10, fontSize: 14, color: CrmColors.gray400 },
});

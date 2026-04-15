import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import type { NotifPrefToggleKey } from '../lib/notificationPrefs';

type Row = { key: NotifPrefToggleKey | 'sound' | 'browser_push'; label: string; sub?: string };

const TOGGLE_ROWS: Row[] = [
  { key: 'task_assigned', label: 'Nhiệm vụ được giao' },
  { key: 'task_completed', label: 'Nhiệm vụ hoàn thành' },
  { key: 'deadline_warning', label: 'Nhắc hạn & deadline' },
  { key: 'comment_added', label: 'Bình luận' },
  { key: 'stage_changed', label: 'Đổi giai đoạn / pipeline' },
  { key: 'deal_won', label: 'Deal thắng' },
  { key: 'approval_request', label: 'Phê duyệt tạm ứng' },
  { key: 'checklist_completed', label: 'Checklist hoàn thành' },
  { key: 'lead_assigned', label: 'Lead / khách được giao' },
  { key: 'order_confirmed', label: 'Đơn hàng & xác nhận' },
  { key: 'invoice_overdue', label: 'Hóa đơn quá hạn' },
  {
    key: 'sound',
    label: 'Chuông trên web',
    sub: 'Khi bạn đăng nhập web, chuông thông báo theo cài đặt này.',
  },
  {
    key: 'browser_push',
    label: 'Thông báo trình duyệt (Web Push)',
    sub: 'Lưu ý: đăng ký nhận push thực tế vẫn bật trên trình duyệt. Tắt ở đây để không gửi push tới thiết bị đã đăng ký.',
  },
];

type Props = { visible: boolean; onClose: () => void };

export default function NotificationSettingsModal({ visible, onClose }: Props) {
  const { prefs, loadPrefs, updatePrefs } = useNotifications();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setErr(null);
      void loadPrefs();
    }
  }, [visible, loadPrefs]);

  const onToggle = useCallback(
    async (key: Row['key'], next: boolean) => {
      setBusyKey(key);
      setErr(null);
      try {
        await updatePrefs({ [key]: next } as Record<string, boolean>);
      } catch (e: unknown) {
        const msg = e && typeof e === 'object' && 'response' in e ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error) : '';
        setErr(msg || 'Không lưu được cài đặt');
      } finally {
        setBusyKey(null);
      }
    },
    [updatePrefs],
  );

  const val = (key: Row['key']) => {
    if (!prefs) return true;
    if (key === 'browser_push') return prefs.browser_push !== false;
    if (key === 'sound') return prefs.sound !== false;
    return prefs[key] !== false;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, CrmShadow.card]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.h2}>Cài đặt thông báo</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          {err ? (
            <View style={styles.errBox}>
              <Text style={styles.errTxt}>{err}</Text>
            </View>
          ) : null}
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {TOGGLE_ROWS.map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
                </View>
                <View style={styles.switchWrap}>
                  {busyKey === row.key ? <ActivityIndicator size="small" color={CrmColors.blue600} /> : null}
                  <Switch
                    value={val(row.key)}
                    onValueChange={(v) => void onToggle(row.key, v)}
                    disabled={busyKey !== null}
                    trackColor={{ false: CrmColors.gray200, true: CrmColors.blue100 }}
                    thumbColor={val(row.key) ? CrmColors.blue600 : CrmColors.gray400}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneTxt}>Đóng</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 20 },
  sheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    maxHeight: '88%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  h2: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  closeBtn: { width: 36, height: 36, borderRadius: CrmRadii.md, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 18, color: CrmColors.gray400 },
  errBox: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    backgroundColor: CrmColors.red50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.red200,
  },
  errTxt: { fontSize: 13, color: CrmColors.red700 },
  scroll: { paddingHorizontal: 16, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray50,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: CrmColors.gray800 },
  rowSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 4, lineHeight: 15 },
  switchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  done: {
    margin: 16,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    alignItems: 'center',
    backgroundColor: CrmColors.gray50,
  },
  doneTxt: { fontSize: 15, fontWeight: '600', color: CrmColors.gray700 },
});

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

type Row = {
  key: NotifPrefToggleKey | 'sound' | 'browser_push';
  label: string;
  sub?: string;
  /** Mỗi phần tử = một dòng ví dụ khi chế độ đang BẬT */
  examples?: string[];
};

const TOGGLE_ROWS: Row[] = [
  {
    key: 'lead_new',
    label: 'Lead mới',
    sub: 'Thông báo khi có lead mới hoặc tự động từ kênh (Facebook…).',
    examples: ['Lead vừa được tạo', 'Lead tự động từ tin nhắn / Facebook'],
  },
  {
    key: 'lead_assigned',
    label: 'Lead được giao / chuyển',
    sub: 'Khi bạn được chỉ định phụ trách hoặc lead được chuyển cho bạn.',
    examples: ['Bạn thành chủ lead / phụ trách', 'Lead được chuyển từ người khác'],
  },
  {
    key: 'crm_lead_deadlines',
    label: 'Nhắc hạn nhiệm vụ CRM (lead & deal, không gồm sx_*)',
    sub: 'Nhiệm vụ tab Công việc: tư vấn, báo giá… — không gồm cột Sản xuất sx_* (mục đó nằm ở «Xưởng»).',
    examples: ['Ngày mai đến hạn', 'Còn 1 giờ đến hạn', 'Quá hạn nhiệm vụ CRM'],
  },
  {
    key: 'deal_new',
    label: 'Deal mới & giao deal',
    sub: 'Deal vừa tạo hoặc được giao cho bạn.',
    examples: ['Deal mới sau chuyển từ lead', 'Bạn được giao deal'],
  },
  { key: 'deal_won', label: 'Deal thắng', sub: 'Khi deal chốt thắng.', examples: ['Deal chuyển trạng thái thắng'] },
  {
    key: 'stage_changed',
    label: 'Đổi giai đoạn pipeline',
    sub: 'Lead/deal kéo sang cột khác trên Kanban.',
    examples: ['Deal từ «Báo giá» sang «Hợp đồng»'],
  },
  {
    key: 'task_assigned',
    label: 'Nhiệm vụ được giao (dự án)',
    sub: 'Task trên dự án khi có người được giao.',
    examples: ['Bạn được giao task trên dự án'],
  },
  {
    key: 'task_completed',
    label: 'Nhiệm vụ hoàn thành',
    sub: 'Task đổi trạng thái hoàn thành hoặc cập nhật liên quan bạn.',
    examples: ['Task được đánh dấu xong'],
  },
  {
    key: 'production_deadlines',
    label: 'Nhắc / quá hạn — Xưởng & sx_* trên deal',
    sub: 'Task dự án đang SX + nhiệm vụ CRM cột sx_* trên deal.',
    examples: ['Sắp hết hạn / quá hạn task xưởng', 'Nhắc hạn nhiệm vụ pipeline SX trên deal'],
  },
  {
    key: 'logistics_deadlines',
    label: 'Nhắc / quá hạn — Vận chuyển',
    sub: 'Task khi dự án ở giai đoạn giao / lắp / bảo hành.',
    examples: ['Sắp đến hạn giao hàng', 'Task VC quá hạn'],
  },
  {
    key: 'deadline_warning',
    label: 'Nhắc / quá hạn — Giai đoạn dự án (trước SX)',
    sub: 'Task dự án chưa vào chế độ đang sản xuất.',
    examples: ['Hạn task giai đoạn chuẩn bị / thiết kế'],
  },
  {
    key: 'comment_added',
    label: 'Bình luận',
    sub: 'Comment mới trên công việc / luồng bạn tham gia.',
    examples: ['Có người nhắc bạn trong comment'],
  },
  {
    key: 'checklist_completed',
    label: 'Checklist hoàn thành',
    sub: 'Mục checklist được tick xong.',
    examples: ['Một hạng mục checklist hoàn thành'],
  },
  {
    key: 'order_confirmed',
    label: 'Đơn hàng',
    sub: 'Tạo / xác nhận / cập nhật đơn.',
    examples: ['Đơn mới', 'Đơn được xác nhận'],
  },
  {
    key: 'invoice_overdue',
    label: 'Hóa đơn quá hạn',
    sub: 'Nhắc thanh toán quá hạn.',
    examples: ['Hóa đơn quá hạn N ngày'],
  },
  {
    key: 'approval_request',
    label: 'Phê duyệt tạm ứng',
    sub: 'Luồng duyệt chi phí / tạm ứng.',
    examples: ['Có yêu cầu cần bạn duyệt'],
  },
  {
    key: 'sound',
    label: 'Chuông trong app (web)',
    sub: 'Khi mở web app, có phát chuông theo cài đặt âm lượng / file tùy chỉnh.',
    examples: ['Thông báo mới trong phiên web (không gồm nhóm đã tắt ở trên)'],
  },
  {
    key: 'browser_push',
    label: 'Web Push (trình duyệt)',
    sub: 'Điều khiển việc gửi push tới thiết bị đã đăng ký. Đăng ký thực tế vẫn bật trên trình duyệt.',
    examples: ['TB đẩy ra desktop khi tab đóng (nếu đã cho phép trình duyệt)'],
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
            <Text style={styles.intro}>
              Bật/tắt từng nhóm để điều khiển thông báo (và push, nếu có). Khi tắt, bạn sẽ không nhận các ví dụ dưới mục đó.
            </Text>
            {TOGGLE_ROWS.map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
                  {row.examples?.length ? (
                    <View style={styles.exWrap}>
                      <Text style={styles.exTitle}>Ví dụ khi bật</Text>
                      {row.examples.map((ex) => (
                        <Text key={ex} style={styles.exItem}>
                          • {ex}
                        </Text>
                      ))}
                    </View>
                  ) : null}
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
  intro: {
    fontSize: 11,
    color: CrmColors.gray600,
    lineHeight: 16,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray50,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: CrmColors.gray800 },
  rowSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 4, lineHeight: 15 },
  exWrap: { marginTop: 8 },
  exTitle: { fontSize: 10, fontWeight: '700', color: CrmColors.gray500, textTransform: 'uppercase', letterSpacing: 0.3 },
  exItem: { fontSize: 10, color: CrmColors.gray500, marginTop: 3, lineHeight: 14, paddingLeft: 2 },
  switchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
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

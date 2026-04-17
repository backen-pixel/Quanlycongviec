import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

type Row = {
  key: string;
  title: string;
  sub?: string;
  emoji: string;
  onPress: (n: Nav) => void;
};

type Section = { key: string; emoji: string; title: string; rows: Row[] };

function goCrmTab(n: Nav) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', { screen: 'CrmTab', params: { screen: 'LeadList' } });
    return;
  }
  const p = n.getParent() as { navigate: (name: string, params?: object) => void } | undefined;
  p?.navigate('CrmTab', { screen: 'LeadList' });
}

function goVoiceTab(n: Nav) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', { screen: 'VoiceTab', params: { screen: 'VoiceRecordingsList' } });
    return;
  }
  const p = n.getParent() as { navigate: (name: string, params?: object) => void } | undefined;
  p?.navigate('VoiceTab', { screen: 'VoiceRecordingsList' });
}

const sections: Section[] = [
  {
    key: 's1',
    emoji: '📊',
    title: '1. Tổng quan',
    rows: [
      {
        key: 'dash',
        title: 'Dashboard CRM',
        sub: 'Trong app (KPI + ống bán hàng)',
        emoji: '📈',
        onPress: (n) => n.navigate('CrmDashboard', {}),
      },
      {
        key: 'events',
        title: 'Sự kiện',
        sub: 'Trong app',
        emoji: '📅',
        onPress: (n) => n.navigate('CrmEvents', {}),
      },
      {
        key: 'voice',
        title: 'Ghi âm',
        sub: 'Đã có tab dưới — mở nhanh',
        emoji: '🎙️',
        onPress: (n) => goVoiceTab(n),
      },
    ],
  },
  {
    key: 's2',
    emoji: '💰',
    title: '2. Bán hàng',
    rows: [
      {
        key: 'crm_tab',
        title: 'Pipeline & Leads',
        sub: 'Tab CRM phía dưới',
        emoji: '💼',
        onPress: (n) => goCrmTab(n),
      },
      {
        key: 'tasks',
        title: 'Công việc CRM',
        sub: 'Danh sách, lọc, mở lead, đánh dấu hoàn thành',
        emoji: '✅',
        onPress: (n) => n.navigate('CrmTasksOverview'),
      },
      {
        key: 'sales_hub',
        title: 'Báo giá · Đơn hàng · Hóa đơn',
        sub: 'Trong app: CRUD, import Excel, review, thanh toán HĐ',
        emoji: '💳',
        onPress: (n) => n.navigate('SalesHub'),
      },
    ],
  },
  {
    key: 's3',
    emoji: '📋',
    title: '3. Dữ liệu & công cụ',
    rows: [
      {
        key: 'cust',
        title: 'Khách hàng',
        sub: 'Danh sách, chi tiết, lead/BG/ĐH/HĐ',
        emoji: '👥',
        onPress: (n) => n.navigate('CustomerList'),
      },
      {
        key: 'prod',
        title: 'Sản phẩm',
        sub: 'Danh sách, chi tiết, BOM',
        emoji: '📦',
        onPress: (n) => n.navigate('ProductList'),
      },
      {
        key: 'cat',
        title: 'Nhóm ngành',
        sub: 'Danh sách, thêm / sửa',
        emoji: '🏷️',
        onPress: (n) => n.navigate('CategoryList'),
      },
      {
        key: 'rep',
        title: 'Báo cáo',
        sub: 'Trang web trong app (cần EXPO_PUBLIC_WEB_APP_URL)',
        emoji: '📉',
        onPress: (n) => n.navigate('CrmEmbeddedWeb', { path: '/crm/reports', title: 'Báo cáo' }),
      },
      {
        key: 'fb',
        title: 'Facebook',
        sub: 'Danh bạ & chat trong app',
        emoji: '📘',
        onPress: (n) => n.navigate('FacebookInbox'),
      },
      {
        key: 'messenger',
        title: 'Chat nhóm nội bộ',
        sub: 'Nhóm, 1–1, ảnh & chụp gửi hình',
        emoji: '💬',
        onPress: (n) => n.navigate('MessengerGroupList'),
      },
      {
        key: 'pipe_set',
        title: 'Pipeline (cấu hình)',
        sub: 'Danh sách pipeline, chỉnh giai đoạn (tên, màu)',
        emoji: '⚙️',
        onPress: (n) => n.navigate('CrmPipelineList'),
      },
      {
        key: 'auto_pipe',
        title: 'Công cụ tự động Facebook',
        sub: 'Trạng thái chạy trong app',
        emoji: '⚡',
        onPress: (n) => n.navigate('AutoPipelineStatus'),
      },
      {
        key: 'guide',
        title: 'Hướng dẫn sử dụng',
        sub: 'Trang web trong app',
        emoji: '📖',
        onPress: (n) => n.navigate('CrmEmbeddedWeb', { path: '/guide', title: 'Hướng dẫn' }),
      },
      {
        key: 'updates',
        title: 'Có gì mới?',
        sub: 'Trang web trong app',
        emoji: '✨',
        onPress: (n) => n.navigate('CrmEmbeddedWeb', { path: '/updates', title: 'Có gì mới?' }),
      },
      {
        key: 'settings',
        title: 'Cài đặt tài khoản',
        sub: 'Thông báo, đồng bộ, quyền micro…',
        emoji: '⚙️',
        onPress: (n) => n.navigate('AccountSettings'),
      },
    ],
  },
];

type Props = { navigation: Nav };

export default function MoreHomeScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.kicker}>CRM Mobile</Text>
      <Text style={styles.h1}>Menu</Text>
      <Text style={styles.intro}>
        Hầu hết mục CRM mở trong app (API + giao diện native). Báo cáo / hướng dẫn / cập nhật dùng WebView (cần cấu hình web URL; đăng nhập web nếu phiên khác với app). Tab dưới: CRM, Ghi âm, Thông báo.
      </Text>

      {sections.map((sec) => (
        <View key={sec.key} style={styles.sec}>
          <Text style={styles.secTitle}>
            {sec.emoji} {sec.title}
          </Text>
          {sec.rows.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={[styles.row, CrmShadow.card]}
              onPress={() => it.onPress(navigation)}
              activeOpacity={0.85}
            >
              <Text style={styles.emoji}>{it.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{it.title}</Text>
                {it.sub ? <Text style={styles.sub}>{it.sub}</Text> : null}
              </View>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: '600', color: CrmColors.gray500, textTransform: 'uppercase' },
  h1: { fontSize: 24, fontWeight: '800', color: CrmColors.gray900, marginTop: 4, marginBottom: 8 },
  intro: { fontSize: 13, color: CrmColors.gray600, marginBottom: 16, lineHeight: 19 },
  sec: { marginBottom: 20 },
  secTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray800, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  emoji: { fontSize: 26 },
  title: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  chev: { fontSize: 22, color: CrmColors.gray300 },
});

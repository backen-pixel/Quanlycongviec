import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { WEB_APP_ORIGIN } from '../config';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

type Row = {
  key: string;
  title: string;
  sub?: string;
  emoji: string;
  onPress: (n: Nav) => void;
};

type Section = { key: string; emoji: string; title: string; rows: Row[] };

function web(path: string) {
  const base = WEB_APP_ORIGIN;
  if (!base) {
    Alert.alert(
      'Chưa cấu hình web',
      'Thêm biến EXPO_PUBLIC_WEB_APP_URL trong .env của crm-mobile (URL ứng dụng web CRM, ví dụ https://app.example.com).',
    );
    return;
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  void Linking.openURL(`${base}${p}`);
}

function goCrmTab(n: Nav) {
  const p = n.getParent() as { navigate: (name: string, params?: object) => void } | undefined;
  p?.navigate('CrmTab', { screen: 'LeadList' });
}

function goVoiceTab(n: Nav) {
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
        sub: 'Mở trên web',
        emoji: '📈',
        onPress: () => web('/crm/dashboard'),
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
        sub: 'Mở web',
        emoji: '✅',
        onPress: () => web('/crm/tasks'),
      },
      {
        key: 'quo',
        title: 'Báo giá',
        sub: 'Danh sách & tạo mới trên web',
        emoji: '📄',
        onPress: () => web('/crm/quotations'),
      },
      {
        key: 'ord',
        title: 'Đơn hàng',
        sub: 'Mở web',
        emoji: '🛒',
        onPress: () => web('/crm/orders'),
      },
      {
        key: 'inv',
        title: 'Hóa đơn',
        sub: 'Mở web',
        emoji: '🧾',
        onPress: () => web('/crm/invoices'),
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
        sub: 'Mở web',
        emoji: '👥',
        onPress: () => web('/crm/customers'),
      },
      {
        key: 'prod',
        title: 'Sản phẩm',
        sub: 'Mở web',
        emoji: '📦',
        onPress: () => web('/crm/products'),
      },
      {
        key: 'cat',
        title: 'Nhóm ngành',
        sub: 'Mở web',
        emoji: '🏷️',
        onPress: () => web('/crm/categories'),
      },
      {
        key: 'rep',
        title: 'Báo cáo',
        sub: 'Mở web',
        emoji: '📉',
        onPress: () => web('/crm/reports'),
      },
      {
        key: 'fb',
        title: 'Facebook',
        sub: 'Danh bạ & chat trong app',
        emoji: '📘',
        onPress: (n) => n.navigate('FacebookInbox'),
      },
      {
        key: 'pipe_set',
        title: 'Pipeline (cấu hình)',
        sub: 'Mở web',
        emoji: '⚙️',
        onPress: () => web('/crm/pipeline-settings'),
      },
      {
        key: 'tpl',
        title: 'Bộ mẫu CRM',
        sub: 'Mở web',
        emoji: '📑',
        onPress: () => web('/crm/task-templates'),
      },
      {
        key: 'auto_proj',
        title: 'Auto tạo dự án',
        sub: 'Mở web',
        emoji: '🤖',
        onPress: () => web('/crm/auto-project-config'),
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
        sub: 'Mở web',
        emoji: '📖',
        onPress: () => web('/guide'),
      },
      {
        key: 'updates',
        title: 'Có gì mới?',
        sub: 'Mở web',
        emoji: '✨',
        onPress: () => web('/updates'),
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
        Các mục giống cấu trúc web. Mục chỉ có trên web sẽ mở trình duyệt (cần đăng nhập web nếu phiên khác). Tab dưới: CRM, Ghi âm, Thông báo — không lặp lại ở đây trừ khi cần lối tắt.
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

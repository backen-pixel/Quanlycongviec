import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

type Row = { key: string; title: string; emoji: string; onPress: (n: Nav) => void };
type Section = { key: string; title: string; rows: Row[] };

const sections: Section[] = [
  {
    key: 's1',
    title: 'Tổng quan',
    rows: [
      {
        key: 'dash',
        title: 'Dashboard CRM',
        emoji: '📈',
        onPress: (n) => n.navigate('CrmDashboard', {}),
      },
      {
        key: 'events',
        title: 'Sự kiện',
        emoji: '📅',
        onPress: (n) => n.navigate('CrmEvents', {}),
      },
    ],
  },
  {
    key: 's2',
    title: 'Bán hàng',
    rows: [
      {
        key: 'tasks',
        title: 'Công việc CRM',
        emoji: '✅',
        onPress: (n) => n.navigate('CrmTasksOverview'),
      },
      {
        key: 'sales_hub',
        title: 'Báo giá · Đơn hàng · Hóa đơn',
        emoji: '💳',
        onPress: (n) => n.navigate('SalesHub'),
      },
    ],
  },
  {
    key: 's3',
    title: 'Dữ liệu',
    rows: [
      {
        key: 'cust',
        title: 'Khách hàng',
        emoji: '👥',
        onPress: (n) => n.navigate('CustomerList'),
      },
      {
        key: 'prod',
        title: 'Sản phẩm',
        emoji: '📦',
        onPress: (n) => n.navigate('ProductList'),
      },
      {
        key: 'cat',
        title: 'Nhóm ngành',
        emoji: '🏷️',
        onPress: (n) => n.navigate('CategoryList'),
      },
      {
        key: 'rep',
        title: 'Báo cáo',
        emoji: '📉',
        onPress: (n) => n.navigate('CrmEmbeddedWeb', { path: '/crm/reports', title: 'Báo cáo' }),
      },
    ],
  },
  {
    key: 's4',
    title: 'Công cụ',
    rows: [
      {
        key: 'messenger',
        title: 'Chat nhóm nội bộ',
        emoji: '💬',
        onPress: (n) => n.navigate('MessengerGroupList'),
      },
      {
        key: 'fb',
        title: 'Facebook',
        emoji: '📘',
        onPress: (n) => n.navigate('FacebookInbox'),
      },
      {
        key: 'auto_pipe',
        title: 'Tự động Facebook',
        emoji: '⚡',
        onPress: (n) => n.navigate('AutoPipelineStatus'),
      },
      {
        key: 'pipe_set',
        title: 'Cấu hình Pipeline',
        emoji: '⚙️',
        onPress: (n) => n.navigate('CrmPipelineList'),
      },
      {
        key: 'settings',
        title: 'Cài đặt tài khoản',
        emoji: '👤',
        onPress: (n) => n.navigate('AccountSettings'),
      },
    ],
  },
];

type Props = { navigation: Nav };

export default function MoreHomeScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Menu</Text>

      {sections.map((sec) => (
        <View key={sec.key} style={styles.sec}>
          <Text style={styles.secTitle}>{sec.title}</Text>
          {sec.rows.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={[styles.row, CrmShadow.card]}
              onPress={() => it.onPress(navigation)}
              activeOpacity={0.85}
            >
              <Text style={styles.emoji}>{it.emoji}</Text>
              <Text style={styles.title}>{it.title}</Text>
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
  h1: { fontSize: 22, fontWeight: '800', color: CrmColors.gray900, marginBottom: 16 },
  sec: { marginBottom: 18 },
  secTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: CrmColors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  emoji: { fontSize: 22 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', color: CrmColors.gray900 },
  chev: { fontSize: 20, color: CrmColors.gray300 },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

const items: {
  title: string;
  sub: string;
  emoji: string;
  onPress: (n: Nav) => void;
}[] = [
  {
    title: 'Sự kiện CRM',
    sub: 'Danh sách + lịch, tạo lịch hẹn',
    emoji: '📅',
    onPress: (n) => n.navigate('CrmEvents', {}),
  },
  {
    title: 'Facebook Messenger',
    sub: 'Danh bạ & chat (giống web)',
    emoji: '📘',
    onPress: (n) => n.navigate('FacebookInbox'),
  },
  {
    title: 'Công cụ tự động',
    sub: 'Trạng thái pipeline Facebook → Lead',
    emoji: '⚡',
    onPress: (n) => n.navigate('AutoPipelineStatus'),
  },
  {
    title: 'Tài khoản & cài đặt',
    sub: 'Thông báo, đồng bộ, quyền micro',
    emoji: '👤',
    onPress: (n) => n.navigate('AccountSettings'),
  },
];

type Props = { navigation: Nav };

export default function MoreHomeScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.kicker}>CRM Mobile</Text>
      <Text style={styles.h1}>Menu</Text>
      <Text style={styles.intro}>Chọn chức năng. Tab CRM giữ pipeline Lead/Deal; tab Ghi âm xem bản ghi theo quyền.</Text>
      {items.map((it) => (
        <TouchableOpacity
          key={it.title}
          style={[styles.row, CrmShadow.card]}
          onPress={() => it.onPress(navigation)}
          activeOpacity={0.85}
        >
          <Text style={styles.emoji}>{it.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{it.title}</Text>
            <Text style={styles.sub}>{it.sub}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
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
  emoji: { fontSize: 28 },
  title: { fontSize: 16, fontWeight: '700', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  chev: { fontSize: 22, color: CrmColors.gray300 },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'SalesHub'>;

type Props = { navigation: Nav };

type SalesListRoute = 'QuotationList' | 'OrderList' | 'InvoiceList';

const cards: { key: SalesListRoute; title: string; sub: string; emoji: string }[] = [
  { key: 'QuotationList', title: 'Báo giá', sub: 'Danh sách, tạo/sửa, import Excel', emoji: '📄' },
  { key: 'OrderList', title: 'Đơn hàng', sub: 'Trạng thái, xuất hóa đơn', emoji: '🛒' },
  { key: 'InvoiceList', title: 'Hóa đơn', sub: 'Chi tiết, ghi nhận thanh toán', emoji: '🧾' },
];

export default function SalesHubScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.kicker}>Bán hàng</Text>
      <Text style={styles.h1}>Báo giá · Đơn · Hóa đơn</Text>
      <Text style={styles.intro}>Dữ liệu đồng bộ với web CRM. Báo giá hỗ trợ đọc file Excel (mẫu STT + Hạng mục như file nội bộ).</Text>
      {cards.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[styles.card, CrmShadow.card]}
          onPress={() => navigation.navigate(c.key)}
          activeOpacity={0.88}
        >
          <Text style={styles.emoji}>{c.emoji}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardSub}>{c.sub}</Text>
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
  h1: { fontSize: 22, fontWeight: '800', color: CrmColors.gray900, marginTop: 4, marginBottom: 8 },
  intro: { fontSize: 13, color: CrmColors.gray600, marginBottom: 18, lineHeight: 19 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  emoji: { fontSize: 32 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900 },
  cardSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, lineHeight: 17 },
  chev: { fontSize: 22, color: CrmColors.gray300, flexShrink: 0 },
});

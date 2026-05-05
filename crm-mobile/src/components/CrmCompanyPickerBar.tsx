import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import type { CompanyOption } from '../context/CrmCompanyFilterContext';

type Props = {
  visible: boolean;
  companies: CompanyOption[];
  value: string;
  onChange: (companyId: string) => void;
  /** Khi admin hệ thống chưa chọn được công ty */
  warn?: boolean;
};

export default function CrmCompanyPickerBar({ visible, companies, value, onChange, warn }: Props) {
  const [open, setOpen] = useState(false);
  if (!visible) return null;

  const current = companies.find((c) => c.id === value);

  return (
    <>
      <View style={[styles.bar, CrmShadow.card, warn && styles.barWarn]}>
        <Ionicons name="business-outline" size={18} color={CrmColors.gray600} />
        <TouchableOpacity style={styles.touch} onPress={() => setOpen(true)} activeOpacity={0.85}>
          <Text style={styles.lab}>Công ty</Text>
          <Text style={styles.val} numberOfLines={1}>
            {current?.name || 'Chọn công ty…'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.back} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Chọn công ty CRM</Text>
            <FlatList
              data={companies}
              keyExtractor={(it) => it.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, item.id === value && styles.rowOn]}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.rowTxt, item.id === value && styles.rowTxtOn]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  barWarn: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  touch: { flex: 1, minWidth: 0 },
  lab: { fontSize: 10, fontWeight: '700', color: CrmColors.gray500, textTransform: 'uppercase' },
  val: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900, marginTop: 2 },
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.lg,
    borderTopRightRadius: CrmRadii.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '56%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900, marginBottom: 12 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CrmColors.gray200,
  },
  rowOn: { backgroundColor: '#eff6ff' },
  rowTxt: { fontSize: 15, color: CrmColors.gray800 },
  rowTxtOn: { fontWeight: '800', color: CrmColors.blue600 },
});

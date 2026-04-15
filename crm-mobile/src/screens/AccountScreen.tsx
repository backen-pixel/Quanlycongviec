import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.fullName || '—';
  const email = user?.email || '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>TuBep Pro · CRM</Text>
        <Text style={styles.h1}>Tài khoản</Text>

        <View style={[styles.card, CrmShadow.card]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{email}</Text>
          {user?.role ? (
            <View style={styles.rolePill}>
              <Text style={styles.roleTxt}>{user.role}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity style={[styles.logout, CrmShadow.sm]} onPress={() => void logout()} activeOpacity={0.85}>
          <Text style={styles.logoutTxt}>Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tab Thông báo: danh sách giống web, đánh dấu đã đọc, cài đặt loại tin. Dự án / đơn / báo giá mở trên web nếu đã cấu hình EXPO_PUBLIC_WEB_APP_URL.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CrmColors.pageBg },
  scroll: { padding: 20, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: '700', color: CrmColors.blue700, letterSpacing: 0.5, marginBottom: 4 },
  h1: { fontSize: 26, fontWeight: '800', color: CrmColors.gray900, marginBottom: 20 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 22,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarTxt: { fontSize: 28, fontWeight: '800', color: CrmColors.blue700 },
  name: { fontSize: 18, fontWeight: '700', color: CrmColors.gray900, textAlign: 'center' },
  email: { fontSize: 14, color: CrmColors.gray500, marginTop: 6, textAlign: 'center' },
  rolePill: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  roleTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray700, textTransform: 'capitalize' },
  logout: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    paddingVertical: 14,
    borderRadius: CrmRadii.card,
    alignItems: 'center',
  },
  logoutTxt: { fontSize: 16, fontWeight: '700', color: CrmColors.red700 },
  hint: { marginTop: 24, fontSize: 12, color: CrmColors.gray400, textAlign: 'center', lineHeight: 18 },
});

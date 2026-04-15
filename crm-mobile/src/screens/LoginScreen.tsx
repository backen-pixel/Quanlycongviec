import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr('');
    if (!email.trim() || !password) {
      setErr('Nhập email và mật khẩu.');
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e as Error)?.message ||
        'Lỗi đăng nhập';
      setErr(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconTxt}>🏠</Text>
          </View>
          <Text style={styles.brandTitle}>TuBep Pro</Text>
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.cardTitle}>Đăng nhập</Text>
          <Text style={styles.cardSub}>Vui lòng nhập thông tin tài khoản</Text>

          {err ? (
            <View style={styles.errBox}>
              <Text style={styles.errTxt}>{err}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor={CrmColors.gray400}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />

          <Text style={styles.label}>Mật khẩu</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={CrmColors.gray400}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={onSubmit}
          />

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={CrmColors.white} />
            ) : (
              <Text style={styles.btnText}>Đăng nhập</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CrmColors.pageBg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  brandRow: { alignItems: 'center', marginBottom: 28 },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: CrmRadii.xl,
    backgroundColor: CrmColors.sidebar,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandIconTxt: { fontSize: 26 },
  brandTitle: { fontSize: 22, fontWeight: '700', color: CrmColors.gray900 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 28,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: CrmColors.gray900, marginBottom: 4 },
  cardSub: { fontSize: 14, color: CrmColors.gray500, marginBottom: 20 },
  errBox: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: CrmColors.red50,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    borderRadius: CrmRadii.md,
  },
  errTxt: { fontSize: 14, color: CrmColors.red700 },
  label: { fontSize: 14, fontWeight: '500', color: CrmColors.gray700, marginBottom: 6 },
  input: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: CrmColors.gray900,
    marginBottom: 16,
  },
  btn: {
    marginTop: 4,
    backgroundColor: CrmColors.blue600,
    borderRadius: CrmRadii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { color: CrmColors.white, fontSize: 16, fontWeight: '600' },
});

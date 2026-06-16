import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { HIT_TARGET, Radii, Spacing } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.bg },
        scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl, paddingTop: 48 },
        brand: { alignItems: 'center', marginBottom: 28 },
        brandIcon: {
          width: 60,
          height: 60,
          borderRadius: Radii.xl,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        },
        brandIconTxt: { fontSize: 28 },
        brandTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
        brandTag: { fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
        card: {
          backgroundColor: colors.card,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 24,
        },
        cardTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
        cardSub: { fontSize: 14, color: colors.textMuted, marginBottom: 20 },
        errBox: {
          marginBottom: 16,
          padding: 12,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
          borderRadius: Radii.md,
        },
        errTxt: { fontSize: 13, color: colors.danger },
        label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
        input: {
          backgroundColor: colors.bgElevated,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: colors.text,
          marginBottom: 16,
        },
        btn: {
          marginTop: 4,
          backgroundColor: colors.primary,
          borderRadius: Radii.md,
          minHeight: HIT_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        },
        btnDisabled: { opacity: 0.65 },
        btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconTxt}>🏭</Text>
          </View>
          <Text style={styles.brandTitle}>Quản lý sản xuất</Text>
          <Text style={styles.brandTag}>Quản lý sản xuất · đồng bộ hệ thống</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Đăng nhập</Text>
          <Text style={styles.cardSub}>Dùng tài khoản hệ thống của bạn</Text>

          {err ? (
            <View style={styles.errBox}>
              <Text style={styles.errTxt}>{err}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor={colors.textFaint}
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
            placeholderTextColor={colors.textFaint}
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
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>Đăng nhập</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

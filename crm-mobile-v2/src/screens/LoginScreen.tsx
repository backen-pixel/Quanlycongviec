import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Colors, CreateGradient, Radii } from '../theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setErr('Nhập email và mật khẩu.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await login(email, password);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={CreateGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
          <Ionicons name="briefcase" size={34} color="#fff" />
        </LinearGradient>
        <Text style={styles.title}>CRM Mobile</Text>
        <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>

        <View style={styles.field}>
          <Ionicons name="mail-outline" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="Mật khẩu"
            placeholderTextColor={Colors.textFaint}
            secureTextEntry={!show}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => setShow((s) => !s)} hitSlop={10}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textFaint} />
          </Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable style={[styles.btn, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnTxt}>Đăng nhập</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>Kết nối: tubep-backend.onrender.com</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 28, paddingBottom: 40, alignItems: 'center' },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { color: Colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: 28 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    height: 52,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 0 },
  err: { color: Colors.red, fontSize: 13, alignSelf: 'flex-start', marginBottom: 8, fontWeight: '600' },
  btn: {
    width: '100%',
    height: 52,
    borderRadius: Radii.md,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { color: Colors.textFaint, fontSize: 12, marginTop: 20 },
});

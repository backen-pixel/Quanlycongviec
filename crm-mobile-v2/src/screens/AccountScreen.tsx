import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { changePassword, fetchCurrentUser, roleLabel } from '../api/auth';
import { formatApiError } from '../api/client';
import { fetchCrmCompanies, fetchCrmEmployeesByCompany } from '../api/crmMeta';
import Avatar from '../components/Avatar';
import { useAuth, type AuthUser } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function displayName(u: AuthUser | null): string {
  return u?.full_name || u?.fullName || u?.email || 'Người dùng';
}

function InfoRow({
  icon,
  label,
  value,
  Colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  Colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: Colors.blueSoft }]}>
        <Ionicons name={icon} size={16} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLbl}>{label}</Text>
        <Text style={styles.infoVal} numberOfLines={2}>
          {value || '—'}
        </Text>
      </View>
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
  styles,
  Colors,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  styles: ReturnType<typeof makeStyles>;
  Colors: ThemeColors;
  autoComplete?: 'password' | 'new-password' | 'off';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <View style={styles.fieldInputWrap}>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          placeholderTextColor={Colors.textFaint}
        />
        <Pressable style={styles.eyeBtn} onPress={onToggleShow} hitSlop={8}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, refreshProfile } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  const loadProfile = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingMeta(true);
    try {
      const me = await fetchCurrentUser(ac.signal);
      if (ac.signal.aborted) return;
      await refreshProfile(me);

      let cName = '';
      let dName = '';
      if (me.company_id) {
        const companies = await fetchCrmCompanies(ac.signal);
        const co = companies.find((c) => c.id === String(me.company_id));
        cName = co?.short_name || co?.name || '';
        if (me.department_id) {
          const org = await fetchCrmEmployeesByCompany(String(me.company_id), ac.signal);
          const dept = org.departments.find((d) => d.id === String(me.department_id));
          dName = dept?.name || '';
        }
      }
      if (!ac.signal.aborted) {
        setCompanyName(cName);
        setDepartmentName(dName);
      }
    } catch {
      /* giữ user cache từ AuthContext */
    } finally {
      if (!ac.signal.aborted) setLoadingMeta(false);
    }
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
      return () => abortRef.current?.abort();
    }, [loadProfile]),
  );

  const submitPassword = async () => {
    setPwdMsg('');
    setPwdErr('');
    if (!currentPassword.trim()) {
      setPwdErr('Nhập mật khẩu hiện tại');
      return;
    }
    if (newPassword.length < 8) {
      setPwdErr('Mật khẩu mới cần ít nhất 8 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('Mật khẩu mới và xác nhận không khớp');
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwdMsg('Đã đổi mật khẩu thành công.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: unknown) {
      setPwdErr(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const name = displayName(user);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.h1}>Tài khoản</Text>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#2F6BFF', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          />
          <View style={styles.heroBody}>
            <Avatar name={name} size={72} color={Colors.blue} avatarUrl={user?.avatar} />
            <Text style={styles.heroName} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.heroRole}>{roleLabel(user?.role)}</Text>
            {user?.email ? (
              <Text style={styles.heroEmail} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.secTitle}>Thông tin</Text>
        {!user && loadingMeta ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.blue} />
          </View>
        ) : (
          <View style={styles.blockCard}>
            {loadingMeta ? (
              <View style={styles.refreshRow}>
                <ActivityIndicator color={Colors.blue} size="small" />
                <Text style={styles.refreshTxt}>Đang cập nhật...</Text>
              </View>
            ) : null}
            <InfoRow icon="mail-outline" label="Email" value={user?.email || ''} Colors={Colors} styles={styles} />
            <InfoRow icon="call-outline" label="Số điện thoại" value={user?.phone || ''} Colors={Colors} styles={styles} />
            <InfoRow icon="briefcase-outline" label="Chức vụ" value={user?.position || ''} Colors={Colors} styles={styles} />
            <InfoRow icon="business-outline" label="Công ty" value={companyName} Colors={Colors} styles={styles} />
            <InfoRow icon="people-outline" label="Phòng ban" value={departmentName} Colors={Colors} styles={styles} />
            <InfoRow icon="shield-outline" label="Vai trò" value={roleLabel(user?.role)} Colors={Colors} styles={styles} />
          </View>
        )}

        <Text style={styles.secTitle}>Đổi mật khẩu</Text>
        <View style={styles.blockCard}>
          <Text style={styles.pwdHint}>Nhập mật khẩu hiện tại để đặt mật khẩu mới (tối thiểu 8 ký tự).</Text>
          <PasswordField
            label="Mật khẩu hiện tại"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            show={showCur}
            onToggleShow={() => setShowCur((v) => !v)}
            styles={styles}
            Colors={Colors}
            autoComplete="password"
          />
          <PasswordField
            label="Mật khẩu mới"
            value={newPassword}
            onChangeText={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            styles={styles}
            Colors={Colors}
            autoComplete="new-password"
          />
          <PasswordField
            label="Xác nhận mật khẩu mới"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            show={showCf}
            onToggleShow={() => setShowCf((v) => !v)}
            styles={styles}
            Colors={Colors}
            autoComplete="new-password"
          />

          {pwdErr ? <Text style={styles.pwdErr}>{pwdErr}</Text> : null}
          {pwdMsg ? <Text style={styles.pwdOk}>{pwdMsg}</Text> : null}

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => void submitPassword()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.white} />
                <Text style={styles.saveBtnTxt}>Cập nhật mật khẩu</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8 },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surfaceSoft,
      marginBottom: 8,
    },
    h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
    heroCard: {
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: Radii.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    heroGradient: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 88,
      opacity: 0.35,
    },
    heroBody: { alignItems: 'center', paddingTop: 28, paddingBottom: 20, paddingHorizontal: 16 },
    heroName: { color: Colors.text, fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' },
    heroRole: { color: Colors.blue, fontSize: 13, fontWeight: '800', marginTop: 4 },
    heroEmail: { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: '600' },
    secTitle: {
      color: Colors.textFaint,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 10,
    },
    blockCard: {
      marginHorizontal: 16,
      padding: 14,
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    loadingBox: { marginHorizontal: 16, padding: 24, alignItems: 'center' },
    refreshRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 10,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    refreshTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    infoIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoLbl: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', marginBottom: 2 },
    infoVal: { color: Colors.text, fontSize: 14, fontWeight: '700' },
    pwdHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12, fontWeight: '600' },
    field: { marginBottom: 12 },
    fieldLbl: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    fieldInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surfaceSoft,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingLeft: 12,
      paddingRight: 4,
      height: 46,
    },
    fieldInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    eyeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    pwdErr: {
      color: Colors.red,
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: Colors.redSoft,
      borderRadius: Radii.md,
      padding: 10,
      marginBottom: 8,
    },
    pwdOk: {
      color: Colors.green,
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: Colors.greenSoft,
      borderRadius: Radii.md,
      padding: 10,
      marginBottom: 8,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: Colors.blue,
      borderRadius: Radii.md,
      paddingVertical: 14,
      marginTop: 4,
    },
    saveBtnDisabled: { opacity: 0.65 },
    saveBtnTxt: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  });

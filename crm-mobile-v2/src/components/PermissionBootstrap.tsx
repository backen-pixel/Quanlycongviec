import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth, currentUserId } from '../context/AuthContext';
import {
  APP_PERMISSION_CATALOG,
  getAppPermissionStatus,
  grantEssentialPermissionsQuick,
  openAppSettings,
  OPTIONAL_PERMISSION_KINDS,
  type AppPermissionItem,
} from '../lib/appPermissions';
import { Radii, useColors, type ThemeColors } from '../theme';

function introKeyForUser(userId: string) {
  return `@crmv2_perm_intro_${userId}`;
}

export default function PermissionBootstrap() {
  const { token, loading, user } = useAuth();
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const userId = currentUserId(user);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<AppPermissionItem[]>([]);

  const refresh = useCallback(async () => {
    const status = await getAppPermissionStatus();
    setItems(status);
    return status;
  }, []);

  useEffect(() => {
    if (loading || !token || !userId) return;
    void (async () => {
      const introDone = await AsyncStorage.getItem(introKeyForUser(userId));
      // Chỉ hiện 1 lần / user — không ép lại mỗi lần mở app vì thiếu micro/overlay.
      if (introDone) return;
      await refresh();
      setVisible(true);
    })();
  }, [loading, token, userId, refresh]);

  useEffect(() => {
    if (!token || !visible) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [token, visible, refresh]);

  const finishIntro = useCallback(async () => {
    if (userId) await AsyncStorage.setItem(introKeyForUser(userId), '1');
    setVisible(false);
  }, [userId]);

  const handleGrant = useCallback(async () => {
    setBusy(true);
    try {
      await grantEssentialPermissionsQuick();
      setTimeout(async () => {
        await refresh();
        await finishIntro();
        setBusy(false);
      }, 600);
    } catch {
      setBusy(false);
    }
  }, [refresh, finishIntro]);

  if (!visible) return null;

  const catalog = items.length ? items : APP_PERMISSION_CATALOG.map((c) => ({ ...c, granted: false }));
  const missingRequired = catalog.filter((i) => !i.granted && !OPTIONAL_PERMISSION_KINDS.has(i.kind));

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => void finishIntro()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.blue} />
            <Text style={styles.title}>Quyền cần thiết</Text>
          </View>
          <Text style={styles.sub}>
            Chỉ xin tối thiểu để nhận thông báo CRM. Micro và bong bóng chat có thể cấp sau khi bạn dùng tính năng đó.
          </Text>

          <View style={styles.list}>
            {catalog.map((item) => (
              <View key={item.kind} style={styles.row}>
                <Ionicons
                  name={item.granted ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={item.granted ? Colors.green : Colors.amber}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.label}>
                    {item.label}
                    {OPTIONAL_PERMISSION_KINDS.has(item.kind) ? (
                      <Text style={styles.optional}> · tùy chọn</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.desc}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void handleGrant()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnTxt}>
                {missingRequired.length ? 'Cho phép thông báo' : 'Tiếp tục'}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.settingsBtn} disabled={busy} onPress={openAppSettings}>
            <Text style={styles.settingsTxt}>Mở cài đặt ứng dụng</Text>
          </Pressable>

          <Pressable style={styles.skip} disabled={busy} onPress={() => void finishIntro()}>
            <Text style={styles.skipTxt}>Bỏ qua lần này</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      paddingHorizontal: 22,
    },
    card: {
      backgroundColor: Colors.card,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    title: { color: Colors.text, fontSize: 17, fontWeight: '900', flex: 1 },
    sub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    list: { gap: 12, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    rowBody: { flex: 1 },
    label: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    optional: { color: Colors.textFaint, fontWeight: '600', fontSize: 12 },
    desc: { color: Colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 17 },
    btn: {
      backgroundColor: Colors.blue,
      height: 46,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    btnDisabled: { opacity: 0.6 },
    btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
    settingsBtn: {
      marginTop: 10,
      height: 42,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.blueSoft,
      borderWidth: 1,
      borderColor: 'rgba(47,107,255,0.35)',
    },
    settingsTxt: { color: Colors.blue, fontWeight: '800', fontSize: 13 },
    skip: { marginTop: 12, paddingVertical: 8, alignItems: 'center' },
    skipTxt: { color: Colors.textFaint, fontSize: 13, fontWeight: '600' },
  });

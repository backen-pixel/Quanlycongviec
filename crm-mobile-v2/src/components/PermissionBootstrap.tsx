import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { currentUserId } from '../context/AuthContext';
import {
  APP_PERMISSION_CATALOG,
  getAppPermissionStatus,
  grantAllPermissionsQuick,
  openAppSettings,
  type AppPermissionItem,
} from '../lib/appPermissions';
import { syncVoiceBackgroundTaskWithPrefs } from '../lib/voiceBackgroundSync';
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
  const sessionSkipped = useRef(false);

  const refresh = useCallback(async () => {
    const status = await getAppPermissionStatus();
    setItems(status);
    return status;
  }, []);

  useEffect(() => {
    if (loading || !token || !userId) return;
    sessionSkipped.current = false;
    void (async () => {
      const status = await refresh();
      const introDone = await AsyncStorage.getItem(introKeyForUser(userId));
      const missing = status.filter((s) => !s.granted);
      if (!introDone || missing.length > 0) {
        setVisible(true);
      }
    })();
  }, [loading, token, userId, refresh]);

  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && visible) void refresh();
    });
    return () => sub.remove();
  }, [token, visible, refresh]);

  const finishIntro = useCallback(async () => {
    if (userId) await AsyncStorage.setItem(introKeyForUser(userId), '1');
    setVisible(false);
    void syncVoiceBackgroundTaskWithPrefs();
  }, [userId]);

  const handleGrant = useCallback(async () => {
    setBusy(true);
    try {
      await grantAllPermissionsQuick();
      void syncVoiceBackgroundTaskWithPrefs();
      setTimeout(async () => {
        const status = await refresh();
        const missing = status.filter((s) => !s.granted);
        if (missing.length === 0) await finishIntro();
        setBusy(false);
      }, 1200);
    } catch {
      setBusy(false);
    }
  }, [refresh, finishIntro]);

  const handleSkip = useCallback(() => {
    sessionSkipped.current = true;
    void finishIntro();
  }, [finishIntro]);

  if (!visible) return null;

  const missing = items.filter((i) => !i.granted);
  const catalog = items.length ? items : APP_PERMISSION_CATALOG.map((c) => ({ ...c, granted: false }));

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={handleSkip}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.purple} />
            <Text style={styles.title}>Cấp quyền cho ứng dụng</Text>
          </View>
          <Text style={styles.sub}>
            CRM cần các quyền sau để ghi âm, nhận cuộc gọi (kể cả khi app tắt) và đồng bộ file lên server.
          </Text>

          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.list}>
              {catalog.map((item) => (
                <View key={item.kind} style={styles.row}>
                  <Ionicons
                    name={item.granted ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={item.granted ? Colors.green : Colors.amber}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.label}>{item.label}</Text>
                    <Text style={styles.desc}>{item.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {Platform.OS === 'android' && missing.length > 0 ? (
            <Text style={styles.note}>
              Bật «Thông báo» và «Cuộc gọi toàn màn hình» để nhận cuộc gọi khi app đóng hoặc màn hình khóa.
              Nếu vẫn thiếu, mở Cài đặt ứng dụng và bật thủ công.
            </Text>
          ) : null}

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void handleGrant()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnTxt}>Cấp quyền</Text>
            )}
          </Pressable>

          {missing.length > 0 ? (
            <Pressable style={styles.settingsBtn} disabled={busy} onPress={openAppSettings}>
              <Text style={styles.settingsTxt}>Mở cài đặt ứng dụng</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.skip} disabled={busy} onPress={handleSkip}>
            <Text style={styles.skipTxt}>Bỏ qua — cấp sau trong tab Ghi âm</Text>
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
      maxHeight: '88%',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    title: { color: Colors.text, fontSize: 17, fontWeight: '900', flex: 1 },
    sub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    listScroll: { maxHeight: 280 },
    list: { gap: 12, paddingBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    rowBody: { flex: 1 },
    label: { color: Colors.text, fontSize: 14, fontWeight: '800' },
    desc: { color: Colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 17 },
    note: {
      color: Colors.amber,
      fontSize: 12,
      lineHeight: 17,
      backgroundColor: Colors.amberSoft,
      padding: 10,
      borderRadius: Radii.sm,
      marginTop: 12,
      marginBottom: 4,
    },
    btn: {
      backgroundColor: Colors.purple,
      height: 46,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
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

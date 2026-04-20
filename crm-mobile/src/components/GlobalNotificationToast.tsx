import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { navigateFromAppNotification, navigateToNotificationsTab } from '../lib/navigateFromAppNotification';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

const AUTO_HIDE_MS = 5200;

export default function GlobalNotificationToast() {
  const insets = useSafeAreaInsets();
  const { toast, dismissToast } = useNotifications();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (!toast) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -24, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(() => dismissToast(), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [toast, dismissToast, opacity, translateY]);

  // Chat notifications (messenger_chat, lead_chat) hiển thị qua ChatNotificationToast riêng.
  if (!toast || isChatNotification(toast)) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 8) + 4,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.card, CrmShadow.card]}>
        <TouchableOpacity
          activeOpacity={0.92}
          style={styles.mainTap}
          onPress={() => {
            navigateFromAppNotification(toast);
            dismissToast();
          }}
        >
          <View style={styles.dot} />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {toast.title}
            </Text>
            <Text style={styles.msg} numberOfLines={3}>
              {toast.message}
            </Text>
            <Text style={styles.hint}>Chạm để mở · Tab Thông báo để xem đầy đủ</Text>
          </View>
          <TouchableOpacity onPress={dismissToast} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.close}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          activeOpacity={0.85}
          onPress={() => {
            navigateToNotificationsTab();
            dismissToast();
          }}
        >
          <Text style={styles.secondaryTxt}>Mở danh sách thông báo</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9999,
    paddingHorizontal: 14,
  },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    overflow: 'hidden',
  },
  mainTap: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CrmColors.blue600,
    marginTop: 6,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700', color: CrmColors.gray900 },
  msg: { fontSize: 12, color: CrmColors.gray600, marginTop: 4, lineHeight: 17 },
  hint: { fontSize: 10, color: CrmColors.blue600, marginTop: 8, fontWeight: '600' },
  close: { padding: 4 },
  closeTxt: { fontSize: 16, color: CrmColors.gray400, fontWeight: '600' },
  secondary: {
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: CrmColors.gray50,
  },
  secondaryTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.blue600 },
});

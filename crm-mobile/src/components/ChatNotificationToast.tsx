import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { navigateFromAppNotification } from '../lib/navigateFromAppNotification';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

const AUTO_HIDE_MS = 5000;
const ZALO_BLUE = '#0068FF';

function senderLetter(title: string): string {
  return (String(title || '').trim()[0] || '?').toUpperCase();
}

export default function ChatNotificationToast() {
  const insets = useSafeAreaInsets();
  const { toast, dismissToast } = useNotifications();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-28)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = !!toast && isChatNotification(toast);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -28, duration: 160, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(() => dismissToast(), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, toast?.id, dismissToast, opacity, translateY]);

  if (!toast || !visible) return null;

  const letter = senderLetter(toast.title);

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
          activeOpacity={0.9}
          style={styles.row}
          onPress={() => {
            navigateFromAppNotification(toast);
            dismissToast();
          }}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{letter}</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {toast.title}
            </Text>
            <Text style={styles.msg} numberOfLines={2}>
              {toast.message}
            </Text>
            <Text style={styles.hint}>Chạm để mở chat</Text>
          </View>
          <TouchableOpacity
            onPress={dismissToast}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.close}
          >
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
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
    zIndex: 10000,
    paddingHorizontal: 14,
  },
  card: {
    backgroundColor: '#EBF5FF',
    borderRadius: CrmRadii.card,
    borderWidth: 1.5,
    borderColor: ZALO_BLUE + '44',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ZALO_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarTxt: {
    color: CrmColors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: CrmColors.gray900,
  },
  msg: {
    fontSize: 13,
    color: CrmColors.gray700 ?? CrmColors.gray600,
    marginTop: 2,
    lineHeight: 18,
  },
  hint: {
    fontSize: 10,
    color: ZALO_BLUE,
    marginTop: 6,
    fontWeight: '700',
  },
  close: { padding: 4, alignSelf: 'flex-start' },
  closeTxt: { fontSize: 16, color: CrmColors.gray400, fontWeight: '600' },
});

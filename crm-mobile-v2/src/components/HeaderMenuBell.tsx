import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import NotificationBadge from './NotificationBadge';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import type { RootStackParamList } from '../navigation/types';
import { useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  /** Hiện nút thông báo (mặc định có). */
  showBell?: boolean;
};

/** Nút Menu (+ chuông thông báo) góc phải header — thay cho tab Menu. */
export default function HeaderMenuBell({ showBell = true }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const navigation = useNavigation<Nav>();
  const unreadNotifCount = useUnreadNotificationCount();

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate('Menu')}
        accessibilityLabel="Menu"
        hitSlop={6}
      >
        <Ionicons name="menu-outline" size={20} color={Colors.text} />
      </Pressable>
      {showBell ? (
        <Pressable
          style={styles.btn}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityLabel="Thông báo"
          hitSlop={6}
        >
          <Ionicons name="notifications-outline" size={20} color={Colors.text} />
          <NotificationBadge count={unreadNotifCount} style={styles.badge} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { top: -4, right: -4 },
});

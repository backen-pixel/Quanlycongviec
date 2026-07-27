import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateMenu } from '../context/CreateMenuContext';
import { useMessenger } from '../context/MessengerContext';
import { useDeadlineOverdueCount } from '../hooks/useDeadlineOverdueCount';
import { useColors, type ThemeColors } from '../theme';
import FloatingCreateButton from './FloatingCreateButton';

type TabMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
};

const META: Record<string, TabMeta> = {
  Kanban: { icon: 'grid-outline', iconActive: 'grid', label: 'Kanban' },
  Deadline: { icon: 'alarm-outline', iconActive: 'alarm', label: 'Deadline' },
  Messages: { icon: 'chatbubble-outline', iconActive: 'chatbubble', label: 'Tin nhắn' },
  Menu: { icon: 'menu-outline', iconActive: 'menu', label: 'Menu' },
};

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { open, toggle } = useCreateMenu();
  const { unreadTotal } = useMessenger();
  const deadlineOverdue = useDeadlineOverdueCount();
  const padBottom = Math.max(insets.bottom, 10);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View style={[styles.bar, { height: 64 + padBottom, paddingBottom: padBottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;

        if (route.name === 'CreatePlaceholder') {
          return (
            <View key={route.key} style={styles.fabSlot}>
              <FloatingCreateButton open={open} onPress={toggle} />
            </View>
          );
        }

        const meta = META[route.name];
        if (!meta) return null;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable key={route.key} style={styles.tab} onPress={onPress}>
            <View>
              <Ionicons
                name={focused ? meta.iconActive : meta.icon}
                size={23}
                color={focused ? Colors.tabActive : Colors.tabInactive}
              />
              {route.name === 'Messages' && unreadTotal > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{unreadTotal > 99 ? '99+' : unreadTotal}</Text>
                </View>
              ) : null}
              {route.name === 'Deadline' && deadlineOverdue > 0 ? (
                <View style={[styles.badge, styles.badgeOverdue]}>
                  <Text style={styles.badgeTxt}>
                    {deadlineOverdue > 99 ? '99+' : deadlineOverdue}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, focused && { color: Colors.tabActive }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: Colors.tabBarBorder,
    paddingTop: 9,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  fabSlot: { width: 88, alignItems: 'center' },
  label: { fontSize: 10.5, fontWeight: '700', color: Colors.tabInactive },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeOverdue: { backgroundColor: Colors.red },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
});

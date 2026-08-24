import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMessenger } from '../context/MessengerContext';
import { useDeadlineOverdueCount } from '../hooks/useDeadlineOverdueCount';
import { commitCrmHubSearch } from '../lib/crmHubFilterStore';
import { useColors, type ThemeColors } from '../theme';

type TabMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
};

const META: Record<string, TabMeta> = {
  Overview: { icon: 'home-outline', iconActive: 'home', label: 'Tổng quan' },
  Lead: { icon: 'people-outline', iconActive: 'people', label: 'Lead' },
  Deal: { icon: 'pricetags-outline', iconActive: 'pricetags', label: 'Deal' },
  Deadline: { icon: 'alarm-outline', iconActive: 'alarm', label: 'Deadline' },
  Messages: { icon: 'chatbubble-outline', iconActive: 'chatbubble', label: 'Tin nhắn' },
};

const CRM_SEARCH_TABS = new Set(['Lead', 'Deal', 'Deadline']);
const TAB_BAR_CONTENT_H = 64;

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
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
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.bar, { height: TAB_BAR_CONTENT_H + padBottom, paddingBottom: padBottom }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = META[route.name];
          if (!meta) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              const from = state.routes[state.index]?.name;
              if (CRM_SEARCH_TABS.has(from) && CRM_SEARCH_TABS.has(route.name)) {
                commitCrmHubSearch('');
              }
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
                  <View style={[styles.badge, unreadTotal > 99 && styles.badgeWide]}>
                    <Text style={styles.badgeTxt} allowFontScaling={false} numberOfLines={1}>
                      {unreadTotal > 99 ? '99+' : unreadTotal}
                    </Text>
                  </View>
                ) : null}
                {route.name === 'Deadline' && deadlineOverdue > 0 ? (
                  <View style={[styles.badge, styles.badgeOverdue, deadlineOverdue > 99 && styles.badgeWide]}>
                    <Text style={styles.badgeTxt} allowFontScaling={false} numberOfLines={1}>
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
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: Colors.tabBarBorder,
    paddingTop: 9,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10.5, fontWeight: '700', color: Colors.tabInactive },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  badgeWide: { minWidth: 26, paddingHorizontal: 6 },
  badgeOverdue: { backgroundColor: Colors.red },
  badgeTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';

import React, { useMemo } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import TapHighlight from '../TapHighlight';

import MessengerAvatar from './MessengerAvatar';

import { useTheme } from '../../context/ThemeContext';

import { getMessengerColors } from '../../lib/messengerTheme';

import { Radii, Spacing } from '../../theme';



type Props = {

  threadId: string;

  displayName: string;

  avatarColor: string;

  avatarUrl?: string | null;

  statusLabel: string;

  online?: boolean;

  isDirect?: boolean;

  peerId?: string | null;

  myUserId?: string;

  paddingTop: number;

  onBack: () => void;

  onOpenDetails: () => void;
  onSearch?: () => void;
};



export default function ChatHeader({

  displayName,

  avatarColor,

  avatarUrl,

  statusLabel,

  online,

  paddingTop,

  onBack,

  onOpenDetails,

  onSearch,

}: Props) {

  const { colors, isDark } = useTheme();

  const mc = getMessengerColors(colors, isDark);

  // Tính năng gọi thoại/video đã tắt trên app Vận chuyển — ẩn nút gọi khỏi header.

  const styles = useMemo(

    () =>

      StyleSheet.create({

        bar: {

          flexDirection: 'row',

          alignItems: 'center',

          paddingTop,

          paddingBottom: 10,

          paddingHorizontal: Spacing.sm,

          borderBottomWidth: StyleSheet.hairlineWidth,

          borderBottomColor: colors.border,

          backgroundColor: colors.bgElevated,

          gap: 4,

        },

        iconBtn: {

          width: 38,

          height: 38,

          borderRadius: 19,

          alignItems: 'center',

          justifyContent: 'center',

          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',

        },

        left: {

          flex: 1,

          flexDirection: 'row',

          alignItems: 'center',

          gap: 10,

          minWidth: 0,

          paddingLeft: 4,

        },

        body: { flex: 1, minWidth: 0 },

        name: { color: colors.text, fontSize: 16, fontWeight: '800' },

        status: {
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },

        actions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 2 },

        callBtn: {

          width: 36,

          height: 36,

          borderRadius: 18,

          alignItems: 'center',

          justifyContent: 'center',

          backgroundColor: isDark ? '#1A1F28' : '#F1F5F9',

        },

      }),

    [colors, isDark, mc, online, paddingTop],

  );



  return (

    <View style={styles.bar}>

      <TapHighlight style={styles.iconBtn} onPress={onBack}>

        <Ionicons name="arrow-back" size={22} color={colors.text} />

      </TapHighlight>



      <TapHighlight style={styles.left} onPress={onOpenDetails}>

        <MessengerAvatar

          name={displayName}

          size={40}

          color={avatarColor}

          avatarUrl={avatarUrl}

        />

        <View style={styles.body}>

          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>

          {statusLabel ? (
            <Text
              style={[styles.status, online && { color: mc.online }]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          ) : null}

        </View>

      </TapHighlight>



      <View style={styles.actions}>

        {onSearch ? (
          <TapHighlight style={styles.callBtn} onPress={onSearch}>
            <Ionicons name="search" size={18} color={mc.accent} />
          </TapHighlight>
        ) : null}

        <TapHighlight style={styles.callBtn} onPress={onOpenDetails}>

          <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />

        </TapHighlight>

      </View>

    </View>

  );

}



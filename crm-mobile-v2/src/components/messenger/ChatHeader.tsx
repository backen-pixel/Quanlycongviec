import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../SpinningLoader';

import React, { useMemo, useState } from 'react';

import { Alert, StyleSheet, Text, View } from 'react-native';

import TapHighlight from '../TapHighlight';

import MessengerAvatar from './MessengerAvatar';

import { useCall } from '../../context/CallContext';
import { CALLING_ENABLED } from '../../config';
import { useTheme } from '../../theme';
import { fetchMessengerGroupDetail } from '../../lib/messengerApi';
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

  threadId,

  displayName,

  avatarColor,

  avatarUrl,

  statusLabel,

  online,

  isDirect,

  peerId,

  myUserId,

  paddingTop,

  onBack,

  onOpenDetails,

  onSearch,

}: Props) {

  const { colors, isDark } = useTheme();

  const mc = getMessengerColors(colors, isDark);

  const { startCall, startVideoCall, startGroupCall, status: callStatus } = useCall();

  const [calling, setCalling] = useState(false);



  const onCall = async () => {

    if (callStatus !== 'idle' || calling) {

      Alert.alert('Cuộc gọi', 'Đang có cuộc gọi khác.');

      return;

    }

    if (isDirect) {

      if (!peerId) {

        Alert.alert('Cuộc gọi', 'Không xác định được người nhận.');

        return;

      }

      setCalling(true);

      try {

        await startCall({ id: String(peerId), name: displayName, avatar: avatarUrl || null });

      } finally {

        setCalling(false);

      }

      return;

    }

    setCalling(true);

    try {

      const detail = await fetchMessengerGroupDetail(threadId);

      const members = (detail.members || [])

        .filter((m) => String(m.id) !== String(myUserId))

        .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));

      if (!members.length) {

        Alert.alert('Cuộc gọi nhóm', 'Nhóm không có thành viên khác.');

        return;

      }

      await startGroupCall({ id: threadId, name: displayName, members });

    } catch {

      Alert.alert('Cuộc gọi nhóm', 'Không thể bắt đầu cuộc gọi nhóm.');

    } finally {

      setCalling(false);

    }

  };



  const onVideoCall = async () => {
    if (callStatus !== 'idle' || calling) {
      Alert.alert('Cuộc gọi', 'Đang có cuộc gọi khác.');
      return;
    }
    if (isDirect) {
      if (!peerId) {
        Alert.alert('Gọi video', 'Không xác định được người nhận.');
        return;
      }
      setCalling(true);
      try {
        await startVideoCall({ id: String(peerId), name: displayName, avatar: avatarUrl || null });
      } finally {
        setCalling(false);
      }
      return;
    }

    setCalling(true);
    try {
      const detail = await fetchMessengerGroupDetail(threadId);
      const members = (detail.members || [])
        .filter((m) => String(m.id) !== String(myUserId))
        .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
      if (!members.length) {
        Alert.alert('Cuộc gọi nhóm', 'Nhóm không có thành viên khác.');
        return;
      }
      await startGroupCall({ id: threadId, name: displayName, members }, 'video');
    } catch {
      Alert.alert('Cuộc gọi nhóm', 'Không thể bắt đầu cuộc gọi video nhóm.');
    } finally {
      setCalling(false);
    }
  };



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
        {CALLING_ENABLED ? (
          <>
            <TapHighlight style={styles.callBtn} onPress={onCall} disabled={calling}>
              {calling ? (
                <SpinningLoader size="small" color={mc.accent} />
              ) : (
                <Ionicons name="call" size={18} color={mc.accent} />
              )}
            </TapHighlight>
            <TapHighlight style={styles.callBtn} onPress={onVideoCall} disabled={calling}>
              <Ionicons name="videocam" size={18} color={mc.accent} />
            </TapHighlight>
          </>
        ) : null}
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



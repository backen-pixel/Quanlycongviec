import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { avatarColorFromName, initialsFromName } from '../../lib/messengerTheme';

type Props = {
  name: string;
  size?: number;
  color?: string;
  avatarUrl?: string | null;
  online?: boolean;
  dashed?: boolean;
  children?: React.ReactNode;
};

export default function MessengerAvatar({
  name,
  size = 48,
  color,
  avatarUrl,
  online,
  dashed,
  children,
}: Props) {
  const bg = color || avatarColorFromName(name);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { width: size, height: size, position: 'relative' },
        circle: {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dashed ? 'transparent' : bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: dashed ? 2 : 0,
          borderColor: dashed ? '#6C5CE7' : 'transparent',
          borderStyle: dashed ? 'dashed' : 'solid',
          overflow: 'hidden',
        },
        image: { width: size, height: size },
        text: {
          color: '#FFFFFF',
          fontSize: Math.max(11, size * 0.34),
          fontWeight: '800',
        },
        dot: {
          position: 'absolute',
          right: 1,
          bottom: 1,
          width: Math.max(10, size * 0.22),
          height: Math.max(10, size * 0.22),
          borderRadius: 99,
          backgroundColor: '#22C55E',
          borderWidth: 2,
          borderColor: '#12141A',
        },
      }),
    [size, bg, dashed],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        {children}
        {!dashed && !children && avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.image} />
        ) : null}
        {!dashed && !children && !avatarUrl ? (
          <Text style={styles.text}>{initialsFromName(name)}</Text>
        ) : null}
      </View>
      {online ? <View style={styles.dot} /> : null}
    </View>
  );
}

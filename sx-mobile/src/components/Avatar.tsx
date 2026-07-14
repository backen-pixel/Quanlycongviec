import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { resolveMediaUrl } from '../lib/messengerApi';
import { avatarColorFromName, initialsFromName } from '../lib/messengerTheme';

type Props = {
  name: string;
  initials?: string;
  size?: number;
  color?: string;
  online?: boolean;
  avatarUrl?: string | null;
};

function Avatar({
  name,
  initials,
  size = 40,
  color,
  online,
  avatarUrl,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bg = color || avatarColorFromName(name);
  const label = initials || initialsFromName(name);
  const uri = resolveMediaUrl(avatarUrl);

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '33' }]}>
          <Text style={[styles.initials, { color: bg, fontSize: size * 0.32 }]}>{label}</Text>
        </View>
      )}
      {online ? (
        <View
          style={[
            styles.dot,
            {
              width: Math.max(10, size * 0.28),
              height: Math.max(10, size * 0.28),
              borderRadius: Math.max(5, size * 0.14),
              right: size * 0.02,
              bottom: size * 0.02,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export default memo(Avatar);

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    fallback: { alignItems: 'center', justifyContent: 'center' },
    initials: { fontWeight: '800' },
    dot: {
      position: 'absolute',
      backgroundColor: c.success,
      borderWidth: 2,
      borderColor: c.bgElevated,
    },
  });
}

import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors, type ThemeColors } from '../theme';

type Props = {
  name: string;
  initials?: string;
  size?: number;
  color?: string;
  online?: boolean;
  avatarUrl?: string | null;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  initials,
  size = 40,
  color,
  online,
  avatarUrl,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const circleColor = color ?? Colors.blue;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: circleColor },
        ]}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} />
        ) : (
          <Text style={[styles.text, { fontSize: Math.max(11, size * 0.36) }]}>
            {initials || initialsFromName(name)}
          </Text>
        )}
      </View>
      {online ? (
        <View
          style={[
            styles.dot,
            { width: Math.max(9, size * 0.24), height: Math.max(9, size * 0.24) },
          ]}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { color: '#FFFFFF', fontWeight: '800' },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderRadius: 99,
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
});

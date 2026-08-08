import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlowActionFab from './GlowActionFab';

type Props = {
  onPress: () => void;
  /** Khoảng cách đáy (mặc định phía trên tab bar). */
  bottom?: number;
};

/**
 * Bong bóng nổi «Tạo dự án» — góc phải tab Dự án.
 */
export default function CreateProjectFab({ onPress, bottom }: Props) {
  const insets = useSafeAreaInsets();
  const bottomOffset = bottom ?? Math.max(insets.bottom, 8) + 78;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <GlowActionFab variant="project" onPress={onPress} size={66} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 8,
    zIndex: 40,
    alignItems: 'center',
  },
});

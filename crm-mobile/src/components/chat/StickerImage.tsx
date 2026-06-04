import React, { useState } from 'react';
import { Image, Text, StyleSheet } from 'react-native';
import { STICKER_BY_EMOJI, fluentStickerUrl } from '../../lib/messengerStickers';

type Props = { emoji: string; size?: number };

/** Sticker 3D Fluent Emoji — fallback emoji Unicode nếu ảnh lỗi. */
export function StickerImage({ emoji, size = 128 }: Props) {
  const sticker = STICKER_BY_EMOJI.get(emoji);
  const [errored, setErrored] = useState(false);

  if (!sticker || errored) {
    return (
      <Text style={[s.fallback, { fontSize: Math.round(size * 0.85), lineHeight: size }]}>
        {emoji}
      </Text>
    );
  }

  return (
    <Image
      source={{ uri: fluentStickerUrl(sticker.name) }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setErrored(true)}
    />
  );
}

const s = StyleSheet.create({
  fallback: { textAlign: 'center' },
});

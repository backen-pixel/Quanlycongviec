import React, { useMemo } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { openExternalLink, splitTextWithUrls } from '../../lib/messengerFileOpen';

type Props = {
  content: string;
  style: TextStyle;
  linkStyle?: TextStyle;
};

export default function LinkedMessageText({ content, style, linkStyle }: Props) {
  const parts = useMemo(() => splitTextWithUrls(content), [content]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        link: { textDecorationLine: 'underline', ...(linkStyle || {}) },
      }),
    [linkStyle],
  );

  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.type === 'url' ? (
          <Text
            key={`${i}-${p.value}`}
            style={[style, styles.link]}
            onPress={() => void openExternalLink(p.value)}
          >
            {p.value}
          </Text>
        ) : (
          <Text key={`${i}-t`}>{p.value}</Text>
        ),
      )}
    </Text>
  );
}

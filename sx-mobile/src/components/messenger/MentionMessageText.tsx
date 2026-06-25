import React, { useMemo } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { openExternalLink, splitTextWithUrls } from '../../lib/messengerFileOpen';
import type { MessengerGroupMember } from '../../lib/messengerApi';
import { tokenizeMessageContent } from '../../lib/messengerMentions';

type Props = {
  content: string;
  style: TextStyle;
  linkStyle?: TextStyle;
  mentionStyle?: TextStyle;
  mentionMineStyle?: TextStyle;
  mine?: boolean;
  members?: MessengerGroupMember[];
};

export default function MentionMessageText({
  content,
  style,
  linkStyle,
  mentionStyle,
  mentionMineStyle,
  mine = false,
  members = [],
}: Props) {
  const styles = useMemo(
    () =>
      StyleSheet.create({
        link: { textDecorationLine: 'underline', ...(linkStyle || {}) },
        mention: mentionStyle || { fontWeight: '800' },
        mentionMine: mentionMineStyle || { fontWeight: '800' },
      }),
    [linkStyle, mentionMineStyle, mentionStyle],
  );

  const mentionStyleResolved = mine ? styles.mentionMine : styles.mention;

  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let key = 0;
    for (const token of tokenizeMessageContent(content, members)) {
      if (token.type === 'mention') {
        out.push(
          <Text key={`m-${key++}`} style={[style, mentionStyleResolved]}>
            {token.value}
          </Text>,
        );
        continue;
      }
      for (const p of splitTextWithUrls(token.value)) {
        if (p.type === 'url') {
          out.push(
            <Text
              key={`u-${key++}`}
              style={[style, styles.link]}
              onPress={() => void openExternalLink(p.value)}
            >
              {p.value}
            </Text>,
          );
        } else if (p.value) {
          out.push(<Text key={`t-${key++}`}>{p.value}</Text>);
        }
      }
    }
    return out;
  }, [content, members, mentionStyleResolved, style, styles.link]);

  return <Text style={style}>{nodes}</Text>;
}

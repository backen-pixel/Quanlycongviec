import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { LeadMember } from '../../api/leadDetail';
import { CRM_MENTION_ALL_LABEL, memberDisplayName, normalizeMentionSearch } from '../../lib/crmCommentMentions';
import { useColors, type ThemeColors } from '../../theme';

type Props = {
  content?: string | null;
  members?: LeadMember[];
};

export default function CrmCommentBody({ content, members = [] }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const nodes = useMemo(() => {
    if (!content) return null;
    const text = String(content);
    const spans: React.ReactNode[] = [];
    let last = 0;
    let i = 0;

    const sorted = [...members].sort(
      (a, b) => memberDisplayName(b).length - memberDisplayName(a).length,
    );

    while (i < text.length) {
      if (text[i] !== '@') {
        i += 1;
        continue;
      }
      const rest = text.slice(i + 1);
      const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
      if (allMatch) {
        if (i > last) spans.push(<Text key={`t-${i}`}>{text.slice(last, i)}</Text>);
        const len = 1 + allMatch[0].length;
        spans.push(
          <Text key={`m-${i}`} style={styles.mention}>
            {text.slice(i, i + len)}
          </Text>,
        );
        i += len;
        last = i;
        continue;
      }

      let hit: string | null = null;
      for (const mem of sorted) {
        const name = memberDisplayName(mem);
        if (!name) continue;
        const restNorm = normalizeMentionSearch(rest);
        const nameNorm = normalizeMentionSearch(name);
        if (!restNorm.startsWith(nameNorm)) continue;
        const after = rest.slice(name.length);
        if (after.length > 0 && after[0] !== ' ' && after[0] !== '\n') continue;
        hit = name;
        break;
      }

      if (hit) {
        if (i > last) spans.push(<Text key={`t-${i}`}>{text.slice(last, i)}</Text>);
        const len = 1 + hit.length;
        spans.push(
          <Text key={`m-${i}`} style={styles.mention}>
            {text.slice(i, i + len)}
          </Text>,
        );
        i += len;
        last = i;
      } else {
        i += 1;
      }
    }

    if (last < text.length) spans.push(<Text key="tail">{text.slice(last)}</Text>);
    if (!spans.length) return text;
    return spans;
  }, [content, members, styles.mention]);

  if (!content) return null;
  return <Text style={styles.body}>{nodes}</Text>;
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    body: { fontSize: 15, lineHeight: 21, color: C.text },
    mention: {
      fontWeight: '700',
      color: C.orange,
      backgroundColor: C.orangeSoft,
    },
  });
}

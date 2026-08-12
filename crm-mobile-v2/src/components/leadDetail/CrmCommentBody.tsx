/**
 * Nội dung bình luận CRM — @mention + «tên|url» file hệ thống.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { LeadMember } from '../../api/leadDetail';
import { memberDisplayName, normalizeMentionSearch } from '../../lib/crmCommentMentions';
import { SYSTEM_FILE_HIDDEN_PREFIX } from '../../lib/crmSystemCommentFiles';
import { promptMessengerFileActions } from '../../lib/messengerFileOpen';
import { useColors, type ThemeColors } from '../../theme';

type Props = {
  content?: string | null;
  members?: LeadMember[];
};

type Seg =
  | { type: 'text'; value: string; key: string }
  | { type: 'mention'; value: string; key: string }
  | { type: 'file'; label: string; url: string | null; hidden?: boolean; key: string };

function splitSegments(text: string, members: LeadMember[]): Seg[] {
  const sorted = [...members].sort(
    (a, b) => memberDisplayName(b).length - memberDisplayName(a).length,
  );
  const out: Seg[] = [];
  let i = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (!value) return;
    out.push({ type: 'text', value, key: `t-${key++}` });
  };

  while (i < text.length) {
    // «label» hoặc «label|url»
    if (text[i] === '«') {
      const close = text.indexOf('»', i + 1);
      if (close > i) {
        const inner = text.slice(i + 1, close);
        const pipeIdx = inner.indexOf('|');
        if (pipeIdx > 0 && pipeIdx < inner.length - 1) {
          const label = inner.slice(0, pipeIdx).trim();
          const urlRaw = inner.slice(pipeIdx + 1).trim();
          const hidden = urlRaw.startsWith(SYSTEM_FILE_HIDDEN_PREFIX);
          const url = hidden ? null : urlRaw;
          out.push({
            type: 'file',
            label: label || 'file',
            url,
            hidden,
            key: `f-${key++}`,
          });
        } else {
          out.push({ type: 'file', label: inner || '…', url: null, key: `f-${key++}` });
        }
        i = close + 1;
        continue;
      }
    }

    // @mention
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
      if (allMatch) {
        const len = 1 + allMatch[0].length;
        out.push({ type: 'mention', value: text.slice(i, i + len), key: `m-${key++}` });
        i += len;
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
        const len = 1 + hit.length;
        out.push({ type: 'mention', value: text.slice(i, i + len), key: `m-${key++}` });
        i += len;
        continue;
      }
    }

    // plain run until next special
    let j = i + 1;
    while (j < text.length && text[j] !== '@' && text[j] !== '«') j += 1;
    pushText(text.slice(i, j));
    i = j;
  }
  return out;
}

export default function CrmCommentBody({ content, members = [] }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  const segs = useMemo(
    () => (content ? splitSegments(String(content), members) : []),
    [content, members],
  );

  if (!content) return null;

  return (
    <Text style={styles.body}>
      {segs.map((s) => {
        if (s.type === 'text') {
          return <Text key={s.key}>{s.value}</Text>;
        }
        if (s.type === 'mention') {
          return (
            <Text key={s.key} style={styles.mention}>{s.value}</Text>
          );
        }
        // file
        if (s.hidden || !s.url) {
          return (
            <Text key={s.key} style={styles.fileMuted}>
              «{s.label}»{s.hidden ? ' (đã ẩn)' : ''}
            </Text>
          );
        }
        return (
          <Text
            key={s.key}
            style={styles.fileLink}
            onPress={() => promptMessengerFileActions(s.url!, { name: s.label })}
          >
            «{s.label}»
          </Text>
        );
      })}
    </Text>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    body: { fontSize: 15, lineHeight: 21, color: C.text },
    mention: {
      fontWeight: '700',
      color: C.orange,
      backgroundColor: C.orangeSoft,
    },
    fileLink: {
      fontWeight: '800',
      color: C.blue,
      textDecorationLine: 'underline',
    },
    fileMuted: {
      fontWeight: '700',
      color: C.textMuted,
    },
  });
}

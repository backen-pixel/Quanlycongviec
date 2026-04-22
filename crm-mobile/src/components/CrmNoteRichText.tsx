import React, { useMemo } from 'react';
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import {
  classifyUrlMediaKind,
  segmentTextWithUrls,
  slideshowItemsFromNoteText,
  type SlideshowItem,
} from '../lib/crmNoteMedia';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';

type Props = {
  text: string;
  bodyStyle?: StyleProp<TextStyle>;
  onOpenSlideshow: (items: SlideshowItem[], index: number) => void;
};

export default function CrmNoteRichText({ text, bodyStyle, onOpenSlideshow }: Props) {
  const segments = useMemo(() => segmentTextWithUrls(text || ''), [text]);
  const mediaItems = useMemo(() => slideshowItemsFromNoteText(text || ''), [text]);

  const openAtUri = (resolvedUri: string) => {
    const idx = mediaItems.findIndex((it) => it.uri === resolvedUri);
    if (mediaItems.length === 0) return;
    onOpenSlideshow(mediaItems, idx >= 0 ? idx : 0);
  };

  return (
    <View style={styles.wrap}>
      {(segments.length ? segments : text.trim() ? [{ kind: 'text' as const, value: text }] : []).map((seg, i) => {
        if (seg.kind === 'text') {
          return seg.value ? (
            <Text key={`t-${i}`} style={[styles.body, bodyStyle]}>
              {seg.value}
            </Text>
          ) : null;
        }
        const raw = seg.value;
        const uri = resolveAttachmentUrl(raw) || raw;
        const kind = classifyUrlMediaKind(raw);
        if (kind === 'image') {
          return (
            <TouchableOpacity
              key={`u-${i}`}
              activeOpacity={0.9}
              onPress={() => openAtUri(uri)}
              style={styles.imgWrap}
            >
              <Image source={{ uri }} style={styles.inlineImg} resizeMode="cover" />
              <Text style={styles.imgHint}>Chạm xem · trình chiếu</Text>
            </TouchableOpacity>
          );
        }
        if (kind === 'video') {
          return (
            <TouchableOpacity
              key={`u-${i}`}
              style={styles.mediaChip}
              onPress={() => openAtUri(uri)}
              activeOpacity={0.85}
            >
              <Text style={styles.mediaChipTxt}>▶ Video — chạm trình chiếu</Text>
            </TouchableOpacity>
          );
        }
        if (kind === 'audio') {
          return (
            <TouchableOpacity
              key={`u-${i}`}
              style={styles.mediaChip}
              onPress={() => openAtUri(uri)}
              activeOpacity={0.85}
            >
              <Text style={styles.mediaChipTxt}>🎧 Âm thanh — chạm nghe (toàn màn)</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity key={`u-${i}`} onPress={() => void Linking.openURL(uri)}>
            <Text style={[styles.body, styles.link, bodyStyle]} numberOfLines={3}>
              🔗 {raw}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  body: { fontSize: 14, color: CrmColors.gray800, lineHeight: 20 },
  link: { color: CrmColors.blue600, fontWeight: '600' },
  imgWrap: {
    borderRadius: CrmRadii.md,
    overflow: 'hidden',
    backgroundColor: CrmColors.gray100,
    maxWidth: '100%',
  },
  inlineImg: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: CrmColors.gray200,
    maxHeight: 220,
  },
  imgHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  mediaChip: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: CrmColors.blue50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  mediaChipTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
});

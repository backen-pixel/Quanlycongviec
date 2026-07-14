import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useFileDownload } from '../hooks/useFileDownload';
import {
  commentAttachmentHref,
  fileKindColor,
  humanFileSize,
  isCommentImage,
  type CommentAttachment,
} from '../lib/commentAttachments';
import { Radii } from '../theme';
import DownloadProgressModal from './DownloadProgressModal';
import ImageGalleryLightbox, { type GalleryImage } from './ImageGalleryLightbox';

type Props = {
  attachments?: CommentAttachment[] | null;
  /** Nếu truyền: mở gallery dùng chung (toàn thread). Không truyền: gallery nội bộ theo comment. */
  onOpenImage?: (uri: string) => void;
};

export default function CommentAttachmentsBlock({ attachments, onOpenImage }: Props) {
  const { colors } = useTheme();
  const { state: dl, download, close: closeDownload } = useFileDownload();
  const items = Array.isArray(attachments) ? attachments : [];
  const images = items.filter(isCommentImage);
  const files = items.filter((a) => !isCommentImage(a));
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [galleryIndex, setGalleryIndex] = React.useState(0);

  const galleryItems: GalleryImage[] = useMemo(
    () =>
      images
        .map((img) => {
          const uri = commentAttachmentHref(img);
          if (!uri) return null;
          return { uri, title: img.name || 'Ảnh' };
        })
        .filter(Boolean) as GalleryImage[],
    [images],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginTop: 8, gap: 8 },
        imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        image: {
          width: 140,
          height: 140,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
        },
        fileCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        fileIcon: {
          width: 42,
          height: 42,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fileIconTxt: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
        fileBody: { flex: 1, minWidth: 0, gap: 2 },
        fileName: { color: colors.text, fontSize: 13, fontWeight: '700' },
        fileMeta: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        download: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.primary,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: Radii.md,
        },
        downloadTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
      }),
    [colors],
  );

  const handleImagePress = (uri: string, localIndex: number) => {
    if (onOpenImage) {
      onOpenImage(uri);
      return;
    }
    setGalleryIndex(localIndex);
    setGalleryOpen(true);
  };

  const handleDownload = (f: CommentAttachment) => {
    if (dl.visible && dl.phase !== 'done' && dl.phase !== 'error') return;
    const href = commentAttachmentHref(f);
    if (!href) return;
    void download({ url: href, name: f.name, mime: f.type });
  };

  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      {images.length > 0 ? (
        <View style={styles.imageRow}>
          {images.map((img, i) => {
            const uri = commentAttachmentHref(img);
            if (!uri) return null;
            return (
              <Pressable
                key={`${img.url}-${i}`}
                onPress={() => handleImagePress(uri, i)}
              >
                <Image source={{ uri }} style={styles.image} resizeMode="cover" />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {files.map((f, i) => {
        const visual = fileKindColor(f.name, f.type);
        const size = humanFileSize(f.size);
        const key = `${f.url}-${i}`;
        return (
          <Pressable
            key={key}
            style={styles.fileCard}
            onPress={() => handleDownload(f)}
          >
            <View style={[styles.fileIcon, { backgroundColor: visual.bg }]}>
              <Text style={[styles.fileIconTxt, { color: visual.fg }]}>{visual.label}</Text>
            </View>
            <View style={styles.fileBody}>
              <Text style={styles.fileName} numberOfLines={2}>{f.name}</Text>
              <Text style={styles.fileMeta}>
                {visual.label.toUpperCase()}
                {size ? ` · ${size}` : ''}
              </Text>
            </View>
            <View style={styles.download}>
              <Ionicons name="download-outline" size={14} color="#FFF" />
              <Text style={styles.downloadTxt}>Tải</Text>
            </View>
          </Pressable>
        );
      })}

      {!onOpenImage ? (
        <ImageGalleryLightbox
          visible={galleryOpen}
          images={galleryItems}
          initialIndex={galleryIndex}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}

      <DownloadProgressModal
        visible={dl.visible}
        fileName={dl.fileName}
        percent={dl.percent}
        phase={dl.phase}
        error={dl.error}
        locationHint={dl.locationHint}
        onClose={closeDownload}
      />
    </View>
  );
}

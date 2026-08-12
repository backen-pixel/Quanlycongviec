/**
 * Ảnh / file đính kèm trong bình luận CRM — khớp web CommentAttachmentsBlock.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AuthRemoteImage from '../AuthRemoteImage';
import { useMediaPreview } from '../../context/MediaPreviewContext';
import { isImageFile, isVideoFile } from '../../lib/isImageFile';
import { promptMessengerFileActions } from '../../lib/messengerFileOpen';
import { resolveFileAccessUrl } from '../../lib/remoteFile';
import { Radii, useColors, type ThemeColors } from '../../theme';

export type CommentAttachment = {
  url?: string | null;
  file_url?: string | null;
  name?: string | null;
  file_name?: string | null;
  type?: string | null;
  mime_type?: string | null;
  size?: number | null;
  file_size?: number | null;
};

type Normalized = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

function normalize(att: CommentAttachment | null | undefined): Normalized | null {
  if (!att) return null;
  const url = String(att.file_url || att.url || '').trim();
  if (!url) return null;
  return {
    url,
    name: String(att.file_name || att.name || 'file').trim() || 'file',
    mime: String(att.mime_type || att.type || '').trim(),
    size: Number(att.file_size != null ? att.file_size : att.size) || 0,
  };
}

function asImageLike(a: Normalized) {
  return { mime_type: a.mime, file_name: a.name, name: a.name, file_url: a.url };
}

type Props = {
  attachments?: CommentAttachment[] | null;
};

export default function CommentAttachmentsBlock({ attachments }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { openImages, openInAppMedia } = useMediaPreview();

  const items = useMemo(
    () => (Array.isArray(attachments) ? attachments : []).map(normalize).filter((x): x is Normalized => !!x),
    [attachments],
  );
  const images = useMemo(() => items.filter((a) => isImageFile(asImageLike(a))), [items]);
  const files = useMemo(() => items.filter((a) => !isImageFile(asImageLike(a))), [items]);

  if (!items.length) return null;

  const openImageAt = (index: number) => {
    void (async () => {
      const gallery = (
        await Promise.all(
          images.map(async (img) => {
            const uri = await resolveFileAccessUrl(img.url, { name: img.name });
            if (!uri) return null;
            return { uri, title: img.name || 'Ảnh' };
          }),
        )
      ).filter((g): g is { uri: string; title: string } => !!g);
      if (!gallery.length) return;
      openImages(gallery, Math.min(Math.max(index, 0), gallery.length - 1));
    })();
  };

  const openFile = (a: Normalized) => {
    void (async () => {
      const uri = await resolveFileAccessUrl(a.url, { name: a.name });
      if (!uri) return;
      const like = asImageLike(a);
      if (isImageFile(like) || isVideoFile(like)) {
        if (openInAppMedia({ uri, mime_type: a.mime, name: a.name, title: a.name })) return;
      }
      promptMessengerFileActions(a.url, { name: a.name, mime: a.mime });
    })();
  };

  return (
    <View style={styles.wrap}>
      {images.length > 0 ? (
        <View style={styles.imgGrid}>
          {images.map((img, i) => (
            <Pressable key={`img-${i}-${img.url}`} style={styles.imgWrap} onPress={() => openImageAt(i)}>
              <AuthRemoteImage rawUrl={img.url} style={styles.imgTile} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}
      {files.map((f, i) => (
        <Pressable key={`file-${i}-${f.url}`} style={styles.fileRow} onPress={() => openFile(f)}>
          <Ionicons name="document-attach-outline" size={16} color={Colors.blue} />
          <Text style={styles.fileName} numberOfLines={2}>{f.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginTop: 8, gap: 8 },
    imgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    imgWrap: { borderRadius: Radii.sm, overflow: 'hidden' },
    imgTile: { width: 96, height: 96, backgroundColor: C.surfaceSoft },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: Radii.sm,
      backgroundColor: C.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderSoft,
    },
    fileName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.blue },
  });
}

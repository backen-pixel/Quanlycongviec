import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SocialPost } from '../types/internalSocial';
import { imagesFromPost, primaryVideoFromPost, slideshowItemsFromPost } from '../lib/socialMedia';
import { CrmColors, CrmRadii } from '../theme/crmTheme';
import SocialMediaViewer from './SocialMediaViewer';

type Props = { post: SocialPost };

/**
 * Khu vực media (ảnh / video) trong 1 bài đăng — chạm để mở trình chiếu toàn màn hình.
 * - 1 ảnh: full-width 16:9
 * - 2 ảnh: lưới 2 cột
 * - 3+ ảnh: 2 ô lớn + ô +N
 * - Có video: hiện ảnh nền hoặc khung tối với nút ▶, chạm mở Video player
 */
export default function SocialPostMedia({ post }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const items = slideshowItemsFromPost(post);
  const images = imagesFromPost(post);
  const video = primaryVideoFromPost(post);

  if (!items.length) return null;

  const openAt = (slideshowIdx: number) => {
    setViewerIndex(slideshowIdx);
    setViewerOpen(true);
  };

  const indexInItems = (uri: string) => items.findIndex((it) => it.uri === uri);

  return (
    <View style={styles.wrap}>
      {video ? (
        <TouchableOpacity
          style={styles.videoBox}
          activeOpacity={0.88}
          onPress={() => openAt(Math.max(0, indexInItems(video.uri)))}
        >
          <View style={styles.videoPoster} />
          <View style={styles.playBtn}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
          <Text style={styles.videoLabel}>Video — chạm để xem</Text>
        </TouchableOpacity>
      ) : null}

      {images.length === 1 ? (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => openAt(indexInItems(images[0].uri))}
        >
          <Image source={{ uri: images[0].uri }} style={styles.single} resizeMode="cover" />
        </TouchableOpacity>
      ) : null}

      {images.length === 2 ? (
        <View style={styles.row}>
          {images.map((img) => (
            <TouchableOpacity
              key={img.uri}
              activeOpacity={0.92}
              style={styles.half}
              onPress={() => openAt(indexInItems(img.uri))}
            >
              <Image source={{ uri: img.uri }} style={styles.halfImg} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {images.length >= 3 ? (
        <View style={styles.row}>
          {images.slice(0, 2).map((img, idx) => {
            const remaining = images.length - 2;
            const isLast = idx === 1 && remaining > 0;
            return (
              <TouchableOpacity
                key={img.uri}
                activeOpacity={0.92}
                style={styles.half}
                onPress={() => openAt(indexInItems(img.uri))}
              >
                <Image source={{ uri: img.uri }} style={styles.halfImg} resizeMode="cover" />
                {isLast ? (
                  <View style={styles.overlayMore}>
                    <Text style={styles.overlayMoreTxt}>+{remaining}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <SocialMediaViewer
        visible={viewerOpen}
        items={items}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10, gap: 6 },
  single: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
  },
  row: { flexDirection: 'row', gap: 6 },
  half: { flex: 1, position: 'relative' },
  halfImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
  },
  overlayMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayMoreTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: CrmRadii.md,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoPoster: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    opacity: 0.85,
  },
  playBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 22, color: CrmColors.gray900, marginLeft: 4 },
  videoLabel: {
    position: 'absolute',
    bottom: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

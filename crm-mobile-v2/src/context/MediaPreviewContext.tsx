import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ImageGalleryLightbox, { type GalleryImage } from '../components/ImageGalleryLightbox';
import VideoPlayerModal, { type VideoPlayerSource } from '../components/VideoPlayerModal';
import { getStoredToken } from '../api/client';
import { driveFileContentUrl } from '../api/drive';
import { isImageFile, isVideoFile } from '../lib/isImageFile';

export type MediaFileLike = {
  uri?: string | null;
  url?: string | null;
  file_url?: string | null;
  mime?: string | null;
  mime_type?: string | null;
  name?: string | null;
  file_name?: string | null;
  headers?: Record<string, string>;
  title?: string;
};

type Ctx = {
  openImages: (images: GalleryImage[], index?: number) => void;
  openVideo: (source: VideoPlayerSource) => void;
  /** Ảnh/video → xem trong app. Trả về false nếu không phải media (gọi fallback mở ngoài). */
  openInAppMedia: (file: MediaFileLike) => boolean;
  /** Ảnh/video Drive → stream nội bộ (không mở Google web). */
  openDriveMedia: (file: { id: string; name?: string | null; mime_type?: string | null }) => Promise<boolean>;
};

const MediaPreviewContext = createContext<Ctx | null>(null);

function asImageLike(file: MediaFileLike) {
  return {
    mime_type: file.mime_type || file.mime,
    file_name: file.file_name || file.name,
    name: file.name,
    file_url: file.uri || file.url || file.file_url,
  };
}

export function MediaPreviewProvider({ children }: { children: React.ReactNode }) {
  const [gallery, setGallery] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [video, setVideo] = useState<VideoPlayerSource | null>(null);

  const openImages = useCallback((images: GalleryImage[], index = 0) => {
    if (!images.length) return;
    setGallery({ images, index: Math.min(Math.max(index, 0), images.length - 1) });
  }, []);

  const openVideo = useCallback((source: VideoPlayerSource) => {
    if (!source?.uri) return;
    setVideo(source);
  }, []);

  const openInAppMedia = useCallback((file: MediaFileLike) => {
    const uri = String(file.uri || file.url || file.file_url || '').trim();
    if (!uri) return false;
    const like = asImageLike(file);
    const title = file.title || file.file_name || file.name || undefined;
    if (isImageFile(like)) {
      openImages([{ uri, title, headers: file.headers }]);
      return true;
    }
    if (isVideoFile(like)) {
      openVideo({ uri, title: title || 'Video', headers: file.headers });
      return true;
    }
    return false;
  }, [openImages, openVideo]);

  const openDriveMedia = useCallback(async (file: {
    id: string;
    name?: string | null;
    mime_type?: string | null;
  }) => {
    const like = { mime_type: file.mime_type, name: file.name, file_name: file.name };
    if (!isImageFile(like) && !isVideoFile(like)) return false;
    const token = await getStoredToken();
    return openInAppMedia({
      uri: driveFileContentUrl(file.id, token),
      mime_type: file.mime_type,
      name: file.name,
      title: file.name || undefined,
    });
  }, [openInAppMedia]);

  const value = useMemo(
    () => ({ openImages, openVideo, openInAppMedia, openDriveMedia }),
    [openImages, openVideo, openInAppMedia, openDriveMedia],
  );

  return (
    <MediaPreviewContext.Provider value={value}>
      {children}
      <ImageGalleryLightbox
        visible={!!gallery}
        images={gallery?.images || []}
        initialIndex={gallery?.index || 0}
        onClose={() => setGallery(null)}
      />
      <VideoPlayerModal visible={!!video} source={video} onClose={() => setVideo(null)} />
    </MediaPreviewContext.Provider>
  );
}

export function useMediaPreview(): Ctx {
  const ctx = useContext(MediaPreviewContext);
  if (!ctx) throw new Error('useMediaPreview must be used within MediaPreviewProvider');
  return ctx;
}

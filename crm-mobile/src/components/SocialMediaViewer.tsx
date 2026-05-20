import React from 'react';
import CrmMediaSlideshowModal from './CrmMediaSlideshowModal';
import type { SlideshowItem } from '../lib/crmNoteMedia';

type Props = {
  visible: boolean;
  items: SlideshowItem[];
  initialIndex: number;
  onClose: () => void;
};

/**
 * Trình chiếu ảnh + video toàn màn hình cho bài đăng bảng tin nội bộ.
 * Tái sử dụng CrmMediaSlideshowModal (đã hỗ trợ vuốt ngang, expo-av Video).
 */
export default function SocialMediaViewer({ visible, items, initialIndex, onClose }: Props) {
  return (
    <CrmMediaSlideshowModal
      visible={visible}
      items={items}
      initialIndex={initialIndex}
      onClose={onClose}
    />
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';

/** Ảnh chờ gửi (paste / chọn file) — preview trước khi bấm Gửi. */
export function useChatPendingImages() {
  const [pendingImages, setPendingImages] = useState([]);
  const pendingRef = useRef(pendingImages);
  pendingRef.current = pendingImages;

  const revokeAll = useCallback((items) => {
    (items || []).forEach((p) => {
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
  }, []);

  useEffect(() => () => revokeAll(pendingRef.current), [revokeAll]);

  const addImages = useCallback((files) => {
    const list = Array.from(files || []).filter((f) => f && (f.type || '').startsWith('image/'));
    if (!list.length) return;
    setPendingImages((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const removeImage = useCallback((id) => {
    setPendingImages((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setPendingImages((prev) => {
      revokeAll(prev);
      return [];
    });
  }, [revokeAll]);

  const pendingFiles = pendingImages.map((p) => p.file);

  return {
    pendingImages,
    pendingFiles,
    hasPending: pendingImages.length > 0,
    addImages,
    removeImage,
    clearAll,
  };
}

/** Tách ảnh (vào hàng chờ) vs file khác (gửi ngay). */
export function splitChatImageFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  return {
    images: list.filter((f) => (f.type || '').startsWith('image/')),
    others: list.filter((f) => !(f.type || '').startsWith('image/')),
  };
}

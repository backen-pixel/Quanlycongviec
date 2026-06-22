import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, Loader2, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { driveFormatBytes, driveFetchFileBlobUrl, driveFetchPreviewBlobUrl, driveFileStreamUrl, driveFileThumbnailUrl } from '../../lib/drive';
import { filterImageFiles, isImageMime, isGoogleWorkspaceFile, isPdfFile, isVideoFile, LARGE_VIDEO_BYTES } from './DriveFileViews';

function portal(node) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

/**
 * PreviewModal — xem file Drive.
 * Ảnh: full viewport + prev/next trong galleryFiles.
 * Doc/Sheet: 90% màn hình, embed Google tương tác.
 */
export default function PreviewModal({ item, onClose, onDownload, galleryFiles }) {
  const itemIsImage = isImageMime(item?.mime_type || item?.preview?.mime_type, item?.name);

  const gallery = useMemo(() => {
    if (!itemIsImage) return [];
    const list = filterImageFiles(galleryFiles);
    if (list.length) return list;
    if (item) return [item];
    return [];
  }, [galleryFiles, item, itemIsImage]);

  const [index, setIndex] = useState(() => {
    const i = gallery.findIndex((f) => f.id === item?.id);
    return i >= 0 ? i : 0;
  });

  useEffect(() => {
    if (!itemIsImage) return;
    const i = gallery.findIndex((f) => f.id === item?.id);
    if (i >= 0) setIndex(i);
  }, [item?.id, gallery, itemIsImage]);

  /** Doc/Sheet không dùng gallery — luôn giữ đúng file user bấm. */
  const currentItem = itemIsImage && gallery.length ? (gallery[index] || item) : item;
  const preview = currentItem?.preview || {};
  const mime = currentItem?.mime_type || preview.mime_type || '';
  const isImage = itemIsImage && isImageMime(mime, currentItem?.name);
  const isPdf = isPdfFile(mime, currentItem?.name);
  const isVideo = isVideoFile(mime, currentItem?.name);
  const isLargeVideo = isVideo && (Number(currentItem?.size_bytes) || 0) > LARGE_VIDEO_BYTES;
  const isAudio = mime.startsWith('audio/');
  const previewMode = preview.preview_mode || (isGoogleWorkspaceFile(mime) ? 'google_edit' : 'iframe');
  const useGoogleEdit = previewMode === 'google_edit';
  const usePdfExport = previewMode === 'pdf_export';
  const editEmbedUrl = preview.edit_embed_url || null;
  const embedUrl = !isVideo && !usePdfExport && !useGoogleEdit ? (preview.embed_url || preview.view_url) : null;
  const editUrl = preview.edit_url || preview.view_url;
  const hasGallery = isImage && gallery.length > 1;
  /** Doc/Sheet/Slides/PDF — iframe Google full màn hình tương tác. */
  const useFullEmbed = useGoogleEdit && !!editEmbedUrl;

  const [imgSrc, setImgSrc] = useState(null);
  const [pdfSrc, setPdfSrc] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [contentLoading, setContentLoading] = useState(() => useFullEmbed);

  useEffect(() => {
    if (useFullEmbed && editEmbedUrl) setContentLoading(true);
  }, [currentItem?.id, useFullEmbed, editEmbedUrl]);

  const goPrev = useCallback((e) => {
    e?.stopPropagation();
    setIndex((i) => (i - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const goNext = useCallback((e) => {
    e?.stopPropagation();
    setIndex((i) => (i + 1) % gallery.length);
  }, [gallery.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (hasGallery && e.key === 'ArrowLeft') goPrev();
      if (hasGallery && e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, hasGallery, goPrev, goNext]);

  const [imgFallback, setImgFallback] = useState(0);

  useEffect(() => {
    if (!isImage || !currentItem?.id) return undefined;
    setImgFallback(0);
    setImgSrc(driveFileStreamUrl(currentItem.id));
    setContentLoading(false);
    return undefined;
  }, [currentItem?.id, isImage]);

  const handleImageError = useCallback(() => {
    if (!currentItem?.id) return;
    if (imgFallback === 0) {
      setImgFallback(1);
      setImgSrc(driveFileThumbnailUrl(currentItem.id));
      return;
    }
    if (imgFallback === 1) {
      setImgFallback(2);
      driveFetchFileBlobUrl(currentItem.id)
        .then((url) => setImgSrc(url))
        .catch(() => setImgSrc(null));
      return;
    }
    setImgSrc(null);
  }, [currentItem?.id, imgFallback]);

  useEffect(() => {
    if (isImage || !usePdfExport || !currentItem?.id) return undefined;
    let blobUrl = null;
    let cancelled = false;
    setContentLoading(true);
    setPdfSrc(null);

    (async () => {
      try {
        blobUrl = await driveFetchPreviewBlobUrl(currentItem.id);
        if (!cancelled) setPdfSrc(blobUrl);
      } catch (_) {
        if (!cancelled) setPdfSrc(null);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [currentItem?.id, isImage, usePdfExport]);

  useEffect(() => {
    if (!isVideo || !currentItem?.id || isLargeVideo) {
      setVideoSrc(null);
      setContentLoading(false);
      return undefined;
    }
    setContentLoading(true);
    setVideoSrc(driveFileStreamUrl(currentItem.id));
    return undefined;
  }, [currentItem?.id, isVideo, isLargeVideo]);

  const downloadCurrent = () => onDownload?.(currentItem ?? item);

  if (isImage) {
    return portal(
      <div
        className="fixed inset-0 z-[9999] bg-black"
        style={{ width: '100vw', height: '100dvh' }}
        role="dialog"
        aria-modal="true"
        aria-label={currentItem.name}
      >
        <header
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none"
        >
          <div className="flex-1 min-w-0 text-white pointer-events-auto">
            <h2 className="font-medium truncate text-sm" title={currentItem.name}>{currentItem.name}</h2>
            <p className="text-xs text-white/60">
              {driveFormatBytes(currentItem.size_bytes)}
              {hasGallery && <span> · {index + 1} / {gallery.length}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
            <button
              type="button"
              onClick={downloadCurrent}
              className="h-9 px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 backdrop-blur"
            >
              <Download size={14} /> Tải xuống
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur"
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {hasGallery && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur transition"
              aria-label="Ảnh trước"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur transition"
              aria-label="Ảnh sau"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}

        <div
          className="absolute inset-0 flex items-center justify-center cursor-zoom-out"
          onClick={onClose}
        >
          {contentLoading ? (
            <div className="flex flex-col items-center gap-3 text-white/70">
              <Loader2 size={36} className="animate-spin" />
              <span className="text-sm">Đang tải ảnh...</span>
            </div>
          ) : imgSrc ? (
            <img
              key={currentItem.id}
              src={imgSrc}
              alt={currentItem.name}
              className="max-w-[100vw] max-h-[100dvh] w-auto h-auto object-contain select-none cursor-default"
              onClick={(e) => e.stopPropagation()}
              onError={handleImageError}
              draggable={false}
            />
          ) : (
            <div className="text-center text-white/70 pointer-events-auto">
              <p className="mb-3">Không tải được ảnh.</p>
              <button
                type="button"
                onClick={downloadCurrent}
                className="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium"
              >
                Tải xuống để xem
              </button>
            </div>
          )}
        </div>
      </div>,
    );
  }

  return portal(
    <div
      className="fixed inset-0 z-[9999] bg-black/75 flex items-center justify-center"
      style={{ width: '100vw', height: '100dvh' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          width: useFullEmbed ? '96vw' : '90vw',
          height: useFullEmbed ? '96vh' : '90vh',
          maxWidth: useFullEmbed ? '96vw' : '90vw',
          maxHeight: useFullEmbed ? '96vh' : '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`px-4 border-b flex items-center justify-between gap-3 shrink-0 ${useFullEmbed ? 'py-2.5 min-h-[3.5rem]' : 'h-14'}`}>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 truncate" title={currentItem.name}>{currentItem.name}</h2>
            <p className="text-xs text-slate-400">
              {mime || 'unknown'} · {driveFormatBytes(currentItem.size_bytes)}
              {useGoogleEdit && !isPdf && <span className="text-emerald-600"> · Chỉnh sửa trực tiếp</span>}
              {useGoogleEdit && isPdf && <span className="text-emerald-600"> · Xem PDF tương tác</span>}
              {usePdfExport && <span className="text-slate-400"> · Xem PDF</span>}
            </p>
            {useFullEmbed && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isPdf
                  ? 'Zoom, lật trang trong khung xem. Bấm tab mới nếu không thấy nội dung.'
                  : 'Nếu không thấy thanh công cụ, bấm Chỉnh sửa (tab mới) hoặc đăng nhập Google trên trình duyệt.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {useGoogleEdit && editUrl && !isPdf && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                title="Mở tab mới với đầy đủ thanh công cụ Google"
              >
                <Pencil size={14} /> Chỉnh sửa (tab mới)
              </a>
            )}
            {useGoogleEdit && editUrl && isPdf && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                title="Mở PDF trên Google Drive tab mới"
              >
                <ExternalLink size={14} /> Mở tab mới
              </a>
            )}
            {editUrl && isGoogleWorkspaceFile(mime) && !useGoogleEdit && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50"
              >
                <Pencil size={14} /> Chỉnh sửa
              </a>
            )}
            {preview.view_url && (
              <a
                href={preview.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50"
              >
                <ExternalLink size={14} /> Google Drive
              </a>
            )}
            <button
              type="button"
              onClick={downloadCurrent}
              className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <Download size={14} /> Tải xuống
            </button>
            <button type="button" onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 bg-slate-100 overflow-hidden flex items-center justify-center min-h-0 relative">
          {contentLoading && !useFullEmbed && !isVideo ? (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Đang tải xem trước...</span>
            </div>
          ) : useFullEmbed && editEmbedUrl ? (
            <>
              {contentLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 bg-slate-100 z-10">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm">{isPdf ? 'Đang mở PDF...' : 'Đang mở trình soạn thảo...'}</span>
                </div>
              )}
              <iframe
                src={editEmbedUrl}
                className="w-full h-full bg-white border-0"
                title={currentItem.name}
                allow="clipboard-read; clipboard-write; autoplay; encrypted-media; fullscreen"
                onLoad={() => setContentLoading(false)}
              />
            </>
          ) : usePdfExport && pdfSrc ? (
            <iframe
              src={pdfSrc}
              className="w-full h-full bg-white border-0"
              title={currentItem.name}
            />
          ) : isVideo && isLargeVideo ? (
            <div className="text-center text-slate-600 p-8 max-w-lg">
              <p className="text-base font-semibold text-slate-800 mb-2">Video quá lớn để phát trực tiếp</p>
              <p className="text-sm text-slate-500 mb-5">
                File <strong>{driveFormatBytes(currentItem.size_bytes)}</strong> — vui lòng tải xuống và mở bằng trình phát trên máy (VLC, Windows Media Player…).
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={downloadCurrent}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  <Download size={16} /> Tải xuống để xem
                </button>
                {editUrl && (
                  <a
                    href={editUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    <ExternalLink size={14} /> Mở trên Google Drive
                  </a>
                )}
              </div>
            </div>
          ) : isVideo && videoSrc ? (
            <>
              {contentLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 bg-slate-100/90 z-10">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm">Đang mở video...</span>
                </div>
              )}
              <video
                key={currentItem.id}
                controls
                autoPlay
                playsInline
                preload="metadata"
                src={videoSrc}
                className="max-w-full max-h-full bg-black"
                onLoadedData={() => setContentLoading(false)}
                onCanPlay={() => setContentLoading(false)}
                onError={() => setContentLoading(false)}
              />
            </>
          ) : isVideo && contentLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Đang mở video...</span>
            </div>
          ) : embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full bg-white border-0"
              title={currentItem.name}
              allow="autoplay; encrypted-media; fullscreen"
            />
          ) : (
            <div className="text-center text-slate-500 p-6">
              <p className="mb-3">Không có bản xem trước trực tiếp.</p>
              {editUrl && (
                <a
                  href={editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium mb-2"
                >
                  <ExternalLink size={14} /> Mở trên Google Drive
                </a>
              )}
              <div>
                <button type="button" onClick={downloadCurrent} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-slate-50">
                  Tải xuống để xem
                </button>
              </div>
            </div>
          )}
          {isAudio && !embedUrl && !pdfSrc && (
            <audio controls src={preview.view_url} className="w-3/4" />
          )}
        </div>
      </div>
    </div>,
  );
}

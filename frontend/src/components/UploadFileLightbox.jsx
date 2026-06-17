import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { getFileDownloadAnchorProps } from '../lib/publicFileUrl';

/** Xem ảnh upload (/uploads/...) full màn hình — không cần tải file hay mở tab mới. */
export default function UploadFileLightbox({ url, title, rawPath, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!url) return null;

  const downloadProps = rawPath ? getFileDownloadAnchorProps(rawPath, { fileName: title }) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Xem ảnh'}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {downloadProps && (
          <a
            {...downloadProps}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
          >
            <Download size={16} /> Tải xuống
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-white hover:bg-white/10 rounded-full"
          aria-label="Đóng"
        >
          <X size={22} />
        </button>
      </div>
      {title && (
        <p className="absolute top-4 left-4 text-white/80 text-sm max-w-[60vw] truncate">{title}</p>
      )}
      <img
        src={url}
        alt={title || ''}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

export function isUploadImageFile(mime, fileNameOrUrl) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i.test(fileNameOrUrl || '');
}

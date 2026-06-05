import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn } from 'lucide-react';

const IMG_LINE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

function isNotificationReleaseImage(src) {
  return /notification/i.test(String(src || ''));
}

function ReleaseNoteImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-8 bg-black/75 backdrop-blur-sm cursor-zoom-out"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Xem ảnh minh họa'}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer border border-white/20"
        aria-label="Đóng"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt || 'Minh họa'}
        className="max-w-[min(96vw,1200px)] max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
      {alt ? (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-lg text-center text-sm text-white/90 px-4">
          {alt}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

function ClickableReleaseImage({ src, alt, isNotif, onPreview }) {
  const open = useCallback(() => onPreview({ src, alt }), [src, alt, onPreview]);

  const imgClass = isNotif
    ? 'w-full h-auto block'
    : 'absolute inset-0 w-full h-full object-cover object-center';

  const wrapper = (
    <button
      type="button"
      onClick={open}
      className={`group relative w-full text-left cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl ${
        isNotif ? 'block bg-slate-900' : ''
      }`}
      title="Bấm để phóng to ảnh"
    >
      {isNotif ? (
        <img src={src} alt={alt || 'Minh họa'} className={imgClass} loading="lazy" />
      ) : (
        <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-50">
          <img src={src} alt={alt || 'Minh họa'} className={imgClass} loading="lazy" />
        </div>
      )}
      <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
      <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/55 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ZoomIn className="h-3.5 w-3.5" /> Phóng to
      </span>
    </button>
  );

  return (
    <figure className="my-4">
      <div className="rounded-xl border border-gray-200 shadow-md overflow-hidden">
        {wrapper}
      </div>
      {alt ? (
        <figcaption className="text-[11px] text-gray-500 mt-2 text-center leading-snug px-1">
          {alt}
          <span className="text-gray-400"> · Bấm ảnh để xem lớn</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Nội dung release note — markdown nhẹ + ảnh bấm phóng to. */
export function ReleaseNoteContent({ content }) {
  const [preview, setPreview] = useState(null);

  if (!content) return null;

  return (
    <>
      {content.split('\n').map((line, i) => {
        const img = line.trim().match(IMG_LINE);
        if (img) {
          const [, alt, src] = img;
          return (
            <ClickableReleaseImage
              key={i}
              src={src}
              alt={alt}
              isNotif={isNotificationReleaseImage(src)}
              onPreview={setPreview}
            />
          );
        }
        if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h2>;
        if (line.startsWith('- ')) return <li key={i} className="ml-4 text-sm list-disc">{line.slice(2)}</li>;
        if (line.startsWith('* ')) return <li key={i} className="ml-4 text-sm list-disc">{line.slice(2)}</li>;
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
      {preview ? (
        <ReleaseNoteImageLightbox
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

/** @deprecated Dùng `<ReleaseNoteContent content={...} />` */
export function renderReleaseNoteContent(content) {
  return <ReleaseNoteContent content={content} />;
}

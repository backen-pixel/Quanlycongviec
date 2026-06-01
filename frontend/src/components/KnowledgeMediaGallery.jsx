import { useState } from 'react';
import { youtubeEmbedUrl } from '../lib/knowledgeMarkdown';
import { publicFileUrl } from '../lib/publicFileUrl';
import { Image as ImageIcon, PlayCircle, FileText, ExternalLink, X, Maximize2 } from 'lucide-react';

export function detectMediaType(url) {
  if (!url) return 'link';
  const s = String(url).toLowerCase();
  if (s.match(/(youtu\.be|youtube\.com)/)) return 'youtube';
  if (s.match(/vimeo\.com/)) return 'vimeo';
  if (s.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/)) return 'image';
  if (s.match(/\.(mp4|webm|mov|m4v)(\?|$)/)) return 'video';
  if (s.match(/\.(pdf|docx?|xlsx?|pptx?|zip|rar)(\?|$)/)) return 'file';
  return 'link';
}

function resolveMediaUrl(url) {
  return publicFileUrl(url);
}

function MediaTile({ item, onOpen }) {
  const type = item.type || detectMediaType(item.url);
  const src = resolveMediaUrl(item.url);

  if (type === 'image') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen({ ...item, type })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen({ ...item, type });
          }
        }}
        className="group relative aspect-video rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:border-violet-300 transition-all cursor-pointer"
      >
        <img
          src={src}
          alt={item.caption || 'Hình ảnh'}
          referrerPolicy="no-referrer"
          className="absolute inset-0 z-0 w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 z-10 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
          <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100" />
        </div>
        {item.caption && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-2 pointer-events-none">
            <p className="text-white text-xs truncate text-left">{item.caption}</p>
          </div>
        )}
      </div>
    );
  }

  if (type === 'youtube' || type === 'vimeo') {
    const embed = type === 'youtube' ? youtubeEmbedUrl(item.url) : null;
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-200">
        {embed ? (
          <iframe
            src={embed}
            title={item.caption || 'Video'}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          <a href={item.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center text-white">
            <PlayCircle className="h-12 w-12" />
          </a>
        )}
        {item.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2">
            <p className="text-white text-xs truncate">{item.caption}</p>
          </div>
        )}
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-200">
        <video controls className="absolute inset-0 w-full h-full" preload="metadata">
          <source src={src} />
        </video>
        {item.caption && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-2">
            <p className="text-white text-xs truncate">{item.caption}</p>
          </div>
        )}
      </div>
    );
  }

  if (type === 'file') {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-violet-300 hover:bg-white transition-all"
      >
        <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{item.name || item.caption || 'Tệp đính kèm'}</p>
          <p className="text-xs text-gray-400 truncate">{item.url}</p>
        </div>
        <ExternalLink className="h-4 w-4 text-gray-400" />
      </a>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-violet-300 hover:bg-white transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
        <ExternalLink className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 truncate">{item.caption || item.url}</p>
        <p className="text-xs text-gray-400 truncate">{item.url}</p>
      </div>
    </a>
  );
}

function Lightbox({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={resolveMediaUrl(item.url)}
        alt={item.caption || ''}
        referrerPolicy="no-referrer"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      {item.caption && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-lg text-sm">
          {item.caption}
        </p>
      )}
    </div>
  );
}

export default function KnowledgeMediaGallery({ items, title }) {
  const [lightbox, setLightbox] = useState(null);
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  const images = items.filter((it) => (it.type || detectMediaType(it.url)) === 'image');
  const videos = items.filter((it) => ['youtube', 'vimeo', 'video'].includes(it.type || detectMediaType(it.url)));
  const others = items.filter((it) => !images.includes(it) && !videos.includes(it));

  return (
    <section className="mt-6">
      {title && (
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-violet-600" /> {title}
        </h3>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {videos.map((it, i) => (
            <MediaTile key={`v-${i}`} item={it} onOpen={setLightbox} />
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {images.map((it, i) => (
            <MediaTile key={`i-${i}`} item={it} onOpen={setLightbox} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {others.map((it, i) => (
            <MediaTile key={`o-${i}`} item={it} onOpen={setLightbox} />
          ))}
        </div>
      )}

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

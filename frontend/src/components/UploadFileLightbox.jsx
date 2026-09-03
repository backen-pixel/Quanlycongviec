import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ExternalLink, Printer, Loader2, Copy } from 'lucide-react';
import { getFileDownloadAnchorProps, publicFileUrl, downloadUploadFile, downloadUploadFilesAsZip, printUploadImage } from '../lib/publicFileUrl';
import { copyImageWithToast, copyImagesWithToast } from './ImageCopyContextMenu';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Xem ảnh upload (/uploads/...) full màn hình — gallery, phóng to và kéo xem vùng ảnh. */
export default function UploadFileLightbox({
  url,
  title,
  rawPath,
  onClose,
  items: itemsProp,
  index: indexProp = 0,
  onIndexChange,
}) {
  const items = itemsProp?.length
    ? itemsProp
    : (url ? [{ url, title, rawPath }] : []);

  const index = Math.min(Math.max(indexProp ?? 0, 0), Math.max(items.length - 1, 0));
  const cur = items[index];
  const multi = items.length > 1;
  const canPrev = multi && index > 0;
  const canNext = multi && index < items.length - 1;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlAllBusy, setDlAllBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const draggingRef = useRef(false);

  const adjustZoom = useCallback((delta) => {
    setZoom((z) => {
      const next = Math.round((z + delta) * 100) / 100;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      if (clamped <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return clamped;
    });
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index, cur?.url]);

  const onImagePointerDown = (e) => {
    if (zoom <= MIN_ZOOM) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onImagePointerMove = (e) => {
    if (!draggingRef.current || zoom <= MIN_ZOOM) return;
    e.preventDefault();
    e.stopPropagation();
    setPan({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
    });
  };

  const endImageDrag = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const goPrev = () => {
    if (!canPrev) return;
    onIndexChange?.(index - 1);
  };

  const goNext = () => {
    if (!canNext) return;
    onIndexChange?.(index + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft' && items.length > 1 && index > 0) onIndexChange?.(index - 1);
      if (e.key === 'ArrowRight' && items.length > 1 && index < items.length - 1) onIndexChange?.(index + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!cur?.url) return null;

  const downloadHref = cur.rawPath || cur.url;
  const downloadName = cur.title || 'tai-lieu';
  const downloadProps = cur.rawPath
    ? getFileDownloadAnchorProps(cur.rawPath, { fileName: cur.title })
    : null;

  const handleDownload = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!downloadHref || dlBusy) return;
    setDlBusy(true);
    downloadUploadFile(downloadHref, downloadName)
      .catch((err) => {
        // Fallback: mở tab gốc nếu blob download thất bại
        if (downloadProps?.href) window.open(downloadProps.href, '_blank', 'noopener,noreferrer');
        else alert(err?.message || 'Không tải được file');
      })
      .finally(() => setDlBusy(false));
  };

  const handleDownloadAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!multi || dlAllBusy) return;
    setDlAllBusy(true);
    downloadUploadFilesAsZip(
      items.map((it) => ({
        url: it.url,
        rawPath: it.rawPath || it.url,
        name: it.title || 'anh',
      })),
      `anh-${items.length}.zip`,
    )
      .catch((err) => alert(err?.message || 'Không tải được ảnh'))
      .finally(() => setDlAllBusy(false));
  };

  const handlePrint = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const src = downloadHref || cur.url;
    if (!src) return;
    printUploadImage(src, downloadName).catch((err) => {
      alert(err?.message || 'Không in được ảnh');
    });
  };

  const handleCopyImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const src = downloadHref || cur.url;
    if (!src || copyBusy) return;
    setCopyBusy(true);
    copyImageWithToast(src)
      .catch((err) => alert(err?.message || 'Không sao chép được ảnh'))
      .finally(() => setCopyBusy(false));
  };

  const handleCopyAllImages = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!multi || copyBusy) return;
    const urls = items.map((it) => it.rawPath || it.url).filter(Boolean);
    if (!urls.length) return;
    setCopyBusy(true);
    copyImagesWithToast(urls)
      .catch((err) => alert(err?.message || 'Không sao chép được ảnh'))
      .finally(() => setCopyBusy(false));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={cur.title || 'Xem ảnh'}
    >
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 pointer-events-none" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 pointer-events-auto">
          {items.length > 1 && (
            <span className="inline-flex items-center rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 tabular-nums">
              {index + 1} / {items.length}
            </span>
          )}
          {cur.title && (
            <p className="mt-1 text-white/80 text-sm max-w-[50vw] truncate">{cur.title}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
          <span className="hidden sm:inline text-[11px] text-white/50 mr-1">Cuộn/double-click phóng to · kéo ảnh khi đã phóng to</span>
          <button
            type="button"
            onClick={() => adjustZoom(-0.25)}
            disabled={zoom <= MIN_ZOOM}
            className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-40"
            aria-label="Thu nhỏ"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-xs text-white/80 tabular-nums min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => adjustZoom(0.25)}
            disabled={zoom >= MAX_ZOOM}
            className="p-2 text-white hover:bg-white/10 rounded-full disabled:opacity-40"
            aria-label="Phóng to"
          >
            <ZoomIn size={18} />
          </button>
          {(downloadHref || cur.url) && (
            <button
              type="button"
              onClick={handleCopyImage}
              disabled={copyBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
              title="Sao chép ảnh để dán vào Word, Zalo, chat…"
            >
              {copyBusy ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Sao chép ảnh
            </button>
          )}
          {multi && (
            <button
              type="button"
              onClick={handleCopyAllImages}
              disabled={copyBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
              title="Sao chép tất cả ảnh trong tin/bình luận"
            >
              {copyBusy ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Sao chép hết ({items.length})
            </button>
          )}
          {(downloadHref || cur.url) && (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
            >
              <Printer size={16} /> In ảnh
            </button>
          )}
          {downloadHref && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={dlBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
            >
              {dlBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Tải xuống
            </button>
          )}
          {multi && (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={dlAllBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
            >
              {dlAllBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Tải hết ({items.length})
            </button>
          )}
          {!downloadHref && cur.url && (
            <a
              href={cur.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={16} /> Mở gốc
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
      </div>

      <div
        className="relative flex items-center justify-center w-full max-w-[96vw] min-h-[50vh]"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          adjustZoom(e.deltaY < 0 ? 0.15 : -0.15);
        }}
      >
        {multi && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            disabled={!canPrev}
            className={`absolute left-2 sm:left-6 z-10 rounded-full p-3 text-white shadow-lg transition-colors ${
              canPrev ? 'bg-white/20 hover:bg-white/35 cursor-pointer' : 'bg-white/5 opacity-40 cursor-not-allowed'
            }`}
            aria-label="Ảnh trước"
          >
            <ChevronLeft size={32} />
          </button>
        )}
        <div
          className="relative overflow-hidden max-h-[85vh] max-w-[calc(100%-7rem)] w-full flex items-center justify-center select-none"
          style={{ touchAction: zoom > MIN_ZOOM ? 'none' : 'auto' }}
        >
          <img
            src={cur.url}
            alt={cur.title || ''}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.15s ease-out',
            }}
            className={`max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl ${
              zoom > MIN_ZOOM ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
            onPointerDown={onImagePointerDown}
            onPointerMove={onImagePointerMove}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const src = downloadHref || cur.url;
              if (!src) return;
              copyImageWithToast(src).catch((err) => alert(err?.message || 'Không sao chép được ảnh'));
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setZoom((z) => {
                const next = z > MIN_ZOOM ? MIN_ZOOM : 2;
                if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
          />
        </div>
        {multi && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            disabled={!canNext}
            className={`absolute right-2 sm:right-6 z-10 rounded-full p-3 text-white shadow-lg transition-colors ${
              canNext ? 'bg-white/20 hover:bg-white/35 cursor-pointer' : 'bg-white/5 opacity-40 cursor-not-allowed'
            }`}
            aria-label="Ảnh sau"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function isUploadImageFile(mime, fileNameOrUrl) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i.test(fileNameOrUrl || '');
}

/** Chuẩn hoá 1 file/attachment thành item gallery. */
export function buildUploadLightboxItem(ref) {
  if (!ref) return null;
  const rawPath = ref.file_url || ref.file_path || ref.url || ref.attachment_url || '';
  const url = publicFileUrl(rawPath);
  if (!url) return null;
  const name = ref.file_name || ref.name || ref.attachment_name || '';
  const mime = ref.mime_type || ref.type || ref.attachment_mime || '';
  const docType = String(ref.doc_type || '');
  const pathHint = [name, rawPath].filter(Boolean).join(' ');
  const isImage = docType === 'image' || isUploadImageFile(mime, pathHint);
  if (!isImage) return null;
  const key = String(rawPath || url).trim();
  return { url, title: name || 'Ảnh', rawPath: rawPath || undefined, key };
}

/** Gom danh sách ảnh (bỏ trùng) theo thứ tự xuất hiện. */
export function collectUploadLightboxItems(refs) {
  const items = [];
  const seen = new Set();
  for (const ref of refs || []) {
    const item = buildUploadLightboxItem(ref);
    if (!item) continue;
    const k = item.key || item.rawPath || item.url;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(item);
  }
  return items;
}

/** Tìm index ảnh trong gallery theo path/url. */
export function findUploadLightboxIndex(items, rawPathOrUrl) {
  const target = String(rawPathOrUrl || '').trim();
  if (!target || !items?.length) return -1;
  const targetUrl = publicFileUrl(target);
  return items.findIndex((it) => {
    const rp = String(it.rawPath || '').trim();
    const u = String(it.url || '').trim();
    return target === rp || target === u || targetUrl === u || publicFileUrl(rp) === targetUrl;
  });
}

/** Gom ảnh trong luồng chat (Zalo OA, Messenger, …). */
export function collectMessageImageGallery(messages) {
  return collectUploadLightboxItems(
    (messages || [])
      .filter((m) => m?.attachment_url && (m.message_type === 'image' || isUploadImageFile(null, m.attachment_url)))
      .map((m) => ({
        attachment_url: m.attachment_url,
        url: m.attachment_url,
        mime_type: m.attachment_mime || 'image/jpeg',
        file_name: m.attachment_name || 'Ảnh',
      })),
  );
}

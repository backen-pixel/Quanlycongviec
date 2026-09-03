import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, Download, Image as ImageIcon, Loader2, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveApiOrigin } from '../lib/apiOrigin';
import { copyImageWithToast, copyImagesWithToast } from '../components/ImageCopyContextMenu';
import { downloadUploadFile, downloadUploadFilesAsZip } from '../lib/publicFileUrl';

function apiUrl(path) {
  const origin = resolveApiOrigin();
  return `${origin}${path}`;
}

function absSrc(src) {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  return apiUrl(src.startsWith('/') ? src : `/${src}`);
}

function formatExpiry(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

function touchDist(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function ShareLightbox({ hrefs, images, index, onIndex, onClose, onCopy, busy }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef({
    kind: 'none',
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
    startZoom: 1,
    startDist: 0,
    lastTap: 0,
  });

  const multi = images.length > 1;
  const src = hrefs[index];

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index, src]);

  const adjustZoom = useCallback((delta) => {
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const showPrev = useCallback(() => {
    if (!multi) return;
    onIndex((index - 1 + images.length) % images.length);
  }, [multi, index, images.length, onIndex]);

  const showNext = useCallback(() => {
    if (!multi) return;
    onIndex((index + 1) % images.length);
  }, [multi, index, images.length, onIndex]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') showNext();
      if (e.key === 'ArrowLeft') showPrev();
      if (e.key === '+' || e.key === '=') adjustZoom(0.25);
      if (e.key === '-' || e.key === '_') adjustZoom(-0.25);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, showNext, showPrev, adjustZoom]);

  const onTouchStart = (e) => {
    const touches = e.touches;
    if (touches.length >= 2) {
      e.preventDefault();
      gesture.current = {
        kind: 'pinch',
        x: 0,
        y: 0,
        panX: pan.x,
        panY: pan.y,
        startZoom: zoom,
        startDist: touchDist(touches[0], touches[1]),
        lastTap: 0,
      };
      return;
    }
    const t = touches[0];
    if (!t) return;
    const now = Date.now();
    const isDouble = now - gesture.current.lastTap < 280;
    gesture.current = {
      kind: zoom > MIN_ZOOM ? 'pan' : 'swipe',
      x: t.clientX,
      y: t.clientY,
      panX: pan.x,
      panY: pan.y,
      startZoom: zoom,
      startDist: 0,
      lastTap: isDouble ? 0 : now,
    };
    if (isDouble) {
      setZoom((z) => {
        const next = z > 1.2 ? MIN_ZOOM : 2.4;
        if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
        return next;
      });
      gesture.current.kind = 'none';
    }
  };

  const onTouchMove = (e) => {
    const g = gesture.current;
    if (g.kind === 'pinch' && e.touches.length >= 2) {
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      if (g.startDist < 8) return;
      const next = clampZoom(g.startZoom * (dist / g.startDist));
      setZoom(next);
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return;
    }
    if (g.kind !== 'pan' || zoom <= MIN_ZOOM) return;
    const t = e.touches[0];
    if (!t) return;
    e.preventDefault();
    setDragging(true);
    setPan({
      x: g.panX + (t.clientX - g.x),
      y: g.panY + (t.clientY - g.y),
    });
  };

  const onTouchEnd = (e) => {
    const g = gesture.current;
    setDragging(false);
    if (g.kind === 'swipe' && multi && zoom <= MIN_ZOOM) {
      const t = e.changedTouches?.[0];
      if (t) {
        const dx = t.clientX - g.x;
        const dy = t.clientY - g.y;
        if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          if (dx < 0) showNext();
          else showPrev();
        }
      }
    }
    gesture.current = { ...g, kind: 'none' };
  };

  const onWheel = (e) => {
    e.preventDefault();
    adjustZoom(e.deltaY < 0 ? 0.2 : -0.2);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return;
    if (zoom <= MIN_ZOOM) return;
    e.preventDefault();
    gesture.current = {
      kind: 'pan',
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      startZoom: zoom,
      startDist: 0,
      lastTap: 0,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (e.pointerType === 'touch') return;
    const g = gesture.current;
    if (g.kind !== 'pan' || zoom <= MIN_ZOOM) return;
    setPan({
      x: g.panX + (e.clientX - g.x),
      y: g.panY + (e.clientY - g.y),
    });
  };

  const onPointerUp = (e) => {
    if (e.pointerType === 'touch') return;
    gesture.current.kind = 'none';
    setDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2 text-white">
        <p className="min-w-0 shrink-0 text-[15px] font-medium tabular-nums">
          {index + 1} / {images.length}
        </p>
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 active:bg-white/25 disabled:opacity-40"
            onClick={() => adjustZoom(-0.35)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Thu nhỏ"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="w-11 text-center text-[12px] font-semibold tabular-nums text-white/90">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 active:bg-white/25 disabled:opacity-40"
            onClick={() => adjustZoom(0.35)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Phóng to"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="ml-1 inline-flex min-h-11 items-center rounded-xl bg-white/15 px-3 text-[13px] font-semibold active:bg-white/25"
            onClick={() => void onCopy(src)}
            disabled={busy}
          >
            Sao chép
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 active:bg-white/25"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => {
          setZoom((z) => {
            const next = z > 1.2 ? MIN_ZOOM : 2.4;
            if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
            return next;
          });
        }}
      >
        {multi ? (
          <button
            type="button"
            className="absolute left-1.5 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg active:bg-black/65 sm:left-3 sm:h-14 sm:w-14"
            onClick={(e) => { e.stopPropagation(); showPrev(); }}
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        ) : null}
        <img
          src={src}
          alt={images[index]?.name || 'Ảnh'}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging || gesture.current.kind === 'pinch' ? 'none' : 'transform 0.12s ease-out',
            cursor: zoom > MIN_ZOOM ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {multi ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg active:bg-black/65 sm:right-3 sm:h-14 sm:w-14"
            onClick={(e) => { e.stopPropagation(); showNext(); }}
            aria-label="Ảnh sau"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        ) : null}
      </div>
      <p className="px-3 py-2 text-center text-[11px] text-white/65">
        {multi ? 'Mũi tên hoặc vuốt để đổi ảnh · ' : ''}
        Chụm / nút + − để phóng to · kéo khi đã phóng
      </p>
    </div>
  );
}

export default function PublicSharePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);
  const [goneReason, setGoneReason] = useState('');
  const [title, setTitle] = useState('Ảnh chia sẻ');
  const [images, setImages] = useState([]);
  const [expiresAt, setExpiresAt] = useState(null);
  const [unlimited, setUnlimited] = useState(false);
  const [openIndex, setOpenIndex] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const prev = document.querySelector('meta[name="theme-color"]');
    const created = !prev;
    const meta = prev || document.createElement('meta');
    if (created) {
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    const old = meta.getAttribute('content');
    meta.setAttribute('content', '#ffffff');
    return () => {
      if (created) meta.remove();
      else if (old) meta.setAttribute('content', old);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = String(token || '').trim();
    if (!t) {
      setError('Link không hợp lệ');
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    setGone(false);
    setGoneReason('');
    fetch(apiUrl(`/api/public/share/${encodeURIComponent(t)}`))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 410) {
          setGone(true);
          setGoneReason(body.reason === 'expired' ? 'expired' : 'revoked');
          setError(body.error || 'Link hết hạn hoặc đã thu hồi');
          return;
        }
        if (!res.ok) {
          setError(body.error || 'Không tìm thấy link');
          return;
        }
        setTitle(body.title || 'Ảnh chia sẻ');
        setImages(Array.isArray(body.images) ? body.images : []);
        setExpiresAt(body.expires_at || null);
        setUnlimited(!!body.unlimited || !body.expires_at);
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được trang. Thử lại sau.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const hrefs = useMemo(() => images.map((img) => absSrc(img.src)), [images]);

  const handleCopyOne = async (src) => {
    setBusy(true);
    try {
      await copyImageWithToast(src);
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAll = async () => {
    if (!hrefs.length) return;
    setBusy(true);
    try {
      await copyImagesWithToast(hrefs);
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!images.length) return;
    setBusy(true);
    try {
      if (images.length === 1) {
        await downloadUploadFile(hrefs[0], images[0].name || 'anh.jpg');
      } else {
        await downloadUploadFilesAsZip(
          images.map((img, i) => ({
            url: hrefs[i],
            name: img.name || `anh-${i + 1}`,
            mime: img.mime,
          })),
          `anh-chia-se-${images.length}.zip`,
        );
      }
    } catch (err) {
      alert(err?.message || 'Không tải được ảnh');
    } finally {
      setBusy(false);
    }
  };

  const expiryText = unlimited || !expiresAt ? 'Không giới hạn thời gian' : `Hết hạn ${formatExpiry(expiresAt)}`;
  const goneTitle = goneReason === 'expired' || (gone && /hết hạn/i.test(error))
    ? 'Link đã hết hạn'
    : gone
      ? 'Link đã bị vô hiệu hóa'
      : 'Không xem được';

  const showActions = !loading && !error && images.length > 0;
  const copyLabel = images.length > 1 ? `Sao chép ${images.length}` : 'Sao chép';
  const downloadLabel = images.length > 1 ? 'Tải ZIP' : 'Tải ảnh';

  const actionButtons = (wide) => (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleCopyAll()}
        className={
          wide
            ? 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1877f2] px-4 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60'
            : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1877f2] px-3 text-[14px] font-semibold text-white active:bg-[#166fe5] disabled:opacity-60'
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4 shrink-0" />}
        <span className="truncate">{copyLabel}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleDownloadAll()}
        className={
          wide
            ? 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#e4e6eb] bg-white px-4 text-sm font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60'
            : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#e4e6eb] bg-white px-3 text-[14px] font-semibold text-[#1877f2] active:bg-[#f0f2f5] disabled:opacity-60'
        }
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="truncate">{downloadLabel}</span>
      </button>
    </>
  );

  return (
    <div
      className="min-h-[100dvh] bg-[#f0f2f5] text-[#050505] touch-manipulation"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <header className="sticky top-0 z-20 border-b border-[#e4e6eb] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#65676b]">
              Xem ảnh · không cần đăng nhập
            </p>
            <h1 className="mt-1 text-[17px] font-bold leading-snug sm:text-xl lg:text-2xl">{title}</h1>
            {!loading && !error ? (
              <p className="mt-1 text-[13px] leading-snug text-[#65676b] sm:text-sm">
                {images.length} ảnh · {expiryText}
              </p>
            ) : null}
          </div>
          {showActions ? (
            <div className="hidden shrink-0 md:flex md:items-center md:gap-2">
              {actionButtons(true)}
            </div>
          ) : null}
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 ${
          showActions
            ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10'
            : 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]'
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 text-[#65676b]">
            <Loader2 className="h-8 w-8 animate-spin text-[#1877f2]" />
            <p className="mt-3 text-sm">Đang tải ảnh…</p>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-[#e4e6eb] bg-white px-5 py-12 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-[#bcc0c4]" />
            <p className="mt-3 text-base font-semibold">{goneTitle}</p>
            <p className="mt-1 text-sm text-[#65676b]">{error}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-[#e4e6eb] bg-white px-5 py-12 text-center text-sm text-[#65676b]">
            Link này không có ảnh.
          </div>
        ) : (
          <>
            {images.length === 1 ? (
              <button
                type="button"
                onClick={() => setOpenIndex(0)}
                className="mx-auto block w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#e4e6eb] md:max-w-4xl"
              >
                <img
                  src={hrefs[0]}
                  alt={images[0].name || 'Ảnh'}
                  className="mx-auto max-h-[72dvh] w-full object-contain md:max-h-[78vh]"
                />
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
                {images.map((img, i) => (
                  <button
                    key={`${img.index}-${img.name}`}
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    className="relative aspect-square overflow-hidden rounded-xl bg-[#e4e6eb] ring-1 ring-[#e4e6eb] transition hover:ring-[#1877f2] active:opacity-90 md:rounded-2xl"
                  >
                    <img
                      src={hrefs[i]}
                      alt={img.name || `Ảnh ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-5 text-center text-[12px] leading-relaxed text-[#8a8d91] md:mt-8 md:text-left md:text-[13px]">
              Ai có link này đều xem được, không cần tài khoản.
              Trang chỉ hiện ảnh — không có tên, SĐT hay địa chỉ khách hàng.
            </p>
          </>
        )}
      </main>

      {showActions ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e4e6eb] bg-white/95 backdrop-blur md:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 px-3 pt-2.5">
            {actionButtons(false)}
          </div>
        </div>
      ) : null}

      {openIndex != null && hrefs[openIndex] ? (
        <ShareLightbox
          hrefs={hrefs}
          images={images}
          index={openIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onCopy={handleCopyOne}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

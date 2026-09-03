import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Image as ImageIcon, Images } from 'lucide-react';
import { copyImageToClipboard, copyImagesSequentially, copyImagesToClipboard, copyTextToClipboard } from '../lib/messengerMessageActions';
import { showCopyToast } from '../lib/copyToast';

export async function copyImageWithToast(url) {
  const kind = await copyImageToClipboard(url);
  showCopyToast(kind === 'url' ? 'Đã sao chép link ảnh' : 'Đã sao chép ảnh');
  return kind;
}

export async function copyImagesWithToast(urls) {
  const list = (urls || []).filter(Boolean);
  if (list.length <= 1) return copyImageWithToast(list[0]);
  const kind = await copyImagesToClipboard(list);
  if (kind === 'url') {
    showCopyToast(`Đã sao chép ${list.length} link ảnh`);
  } else if (kind === 'images-partial') {
    showCopyToast(`Đã sao chép một phần ${list.length} ảnh (1 tấm)`);
  } else {
    showCopyToast(`Đã sao chép ${list.length} ảnh (1 tấm) — dán Zalo`);
  }
  return kind;
}

export async function copyImagesSequentiallyWithToast(urls) {
  const list = (urls || []).filter(Boolean);
  if (list.length <= 1) return copyImageWithToast(list[0]);
  const kind = await copyImagesSequentially(list);
  if (kind === 'url') {
    showCopyToast(`Đã sao chép ${list.length} link ảnh`);
  } else {
    showCopyToast(`Đã copy ảnh 1/${list.length} — dán Zalo, rồi bấm «Ảnh tiếp»`);
  }
  return kind;
}

export function menuPosition(clientX, clientY, width = 220, height = 96) {
  const pad = 8;
  const x = Math.min(Math.max(pad, clientX), window.innerWidth - width - pad);
  const yBelow = clientY + 6;
  const y = yBelow + height > window.innerHeight - pad
    ? Math.max(pad, clientY - height - 4)
    : yBelow;
  return { left: x, top: y };
}

function ContextMenuPortal({ x, y, width = 220, height = 96, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const pos = menuPosition(x, y, width, height);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[240] min-w-[210px] py-1 rounded-xl bg-white border border-slate-200 shadow-xl"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ContextMenuRow({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 transition disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-slate-500" /> : null}
      {label}
    </button>
  );
}

/**
 * Chuột phải trên ảnh → Sao chép ảnh (PNG clipboard, dán Word / Zalo / chat).
 */
export default function CopyableImage({
  src,
  copyUrl,
  fileName,
  alt,
  className,
  imgClassName,
  onClick,
  onDownload,
  allUrls,
  as: Comp = 'button',
  children,
  ...rest
}) {
  const [menu, setMenu] = useState(null);
  const url = copyUrl || src;
  const extraUrls = (allUrls || []).filter(Boolean);
  const canCopyAll = extraUrls.length > 1;

  const openMenu = (e) => {
    if (!url) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenu(null);

  const run = async (fn) => {
    closeMenu();
    try {
      await fn();
    } catch (err) {
      alert(err?.message || 'Thao tác thất bại');
    }
  };

  const menuRows = 1 + (canCopyAll ? 1 : 0) + (onDownload ? 1 : 0);

  return (
    <>
      <Comp
        type={Comp === 'button' ? 'button' : undefined}
        className={className}
        onClick={onClick}
        onContextMenu={openMenu}
        {...rest}
      >
        {children || (
          <img src={src} alt={alt || ''} className={imgClassName} />
        )}
      </Comp>
      {menu ? (
        <ContextMenuPortal x={menu.x} y={menu.y} height={8 + menuRows * 44} onClose={closeMenu}>
          <ContextMenuRow
            icon={ImageIcon}
            label="Sao chép ảnh"
            onClick={() => void run(() => copyImageWithToast(url))}
          />
          {canCopyAll ? (
            <ContextMenuRow
              icon={Images}
              label={`Sao chép hết ${extraUrls.length} ảnh`}
              onClick={() => void run(() => copyImagesWithToast(extraUrls))}
            />
          ) : null}
          {onDownload ? (
            <ContextMenuRow
              icon={Download}
              label="Tải xuống"
              onClick={() => void run(() => onDownload(url, fileName))}
            />
          ) : null}
        </ContextMenuPortal>
      ) : null}
    </>
  );
}

/** Menu chuột phải cho bong bóng bình luận: sao chép chữ và/hoặc ảnh. */
export function CommentBubbleContextMenu({ menu, onClose }) {
  if (!menu) return null;
  const hasText = !!(menu.body || '').trim();
  const imageUrls = (menu.imageUrls || []).filter(Boolean);
  const hasImage = !!menu.imageUrl || imageUrls.length > 0;
  if (!hasText && !hasImage) return null;
  const allUrls = imageUrls.length ? imageUrls : (menu.imageUrl ? [menu.imageUrl] : []);

  const run = async (fn) => {
    onClose?.();
    try {
      await fn();
    } catch (err) {
      alert(err?.message || 'Thao tác thất bại');
    }
  };

  const rows = (hasText ? 1 : 0) + (hasImage ? 1 : 0) + (allUrls.length > 1 ? 1 : 0) + (menu.onDownloadImage ? 1 : 0);

  return (
    <ContextMenuPortal x={menu.x} y={menu.y} height={8 + rows * 44} onClose={onClose}>
      {hasText ? (
        <ContextMenuRow
          icon={Copy}
          label="Sao chép tin nhắn"
          onClick={() =>
            void run(async () => {
              await copyTextToClipboard(menu.body);
              showCopyToast('Đã sao chép');
            })
          }
        />
      ) : null}
      {hasImage ? (
        <ContextMenuRow
          icon={ImageIcon}
          label="Sao chép ảnh"
          onClick={() => void run(() => copyImageWithToast(menu.imageUrl || allUrls[0]))}
        />
      ) : null}
      {allUrls.length > 1 ? (
        <ContextMenuRow
          icon={Images}
          label={`Sao chép hết ${allUrls.length} ảnh`}
          onClick={() => void run(() => copyImagesWithToast(allUrls))}
        />
      ) : null}
      {hasImage && menu.onDownloadImage ? (
        <ContextMenuRow
          icon={Download}
          label="Tải ảnh"
          onClick={() => void run(() => menu.onDownloadImage())}
        />
      ) : null}
    </ContextMenuPortal>
  );
}

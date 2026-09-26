import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isClickOutside } from '../lib/domUtils';

/** Menu dropdown neo theo nút trigger — render portal để không bị cắt bởi overflow. */
export default function AnchoredDropdownMenu({
  open,
  onClose,
  anchorRef,
  align = 'right',
  className = '',
  minWidth,
  fitContent = false,
  matchAnchorWidth = false,
  children,
  'data-tour': dataTour,
}) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: undefined, ready: false });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuW = matchAnchorWidth
      ? rect.width
      : (menuRef.current?.offsetWidth || (minWidth ? parseFloat(minWidth) * 16 : 168));
    let left = align === 'right' ? rect.right - menuW : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));

    // Nút neo nằm thấp trong trang thì menu tràn xuống dưới mép màn hình — lật lên trên khi
    // phía trên rộng chỗ hơn. Dùng chiều cao đang render (tôn trọng max-h của chính menu) nên
    // không có chuyện đo đi đo lại dao động.
    const GAP = 4;
    const menuH = menuRef.current?.offsetHeight || 0;
    let top = rect.bottom + GAP;
    const choDuoi = window.innerHeight - rect.bottom - GAP;
    const choTren = rect.top - GAP;
    if (menuH && menuH > choDuoi && choTren > choDuoi) {
      top = Math.max(8, rect.top - GAP - menuH);
    }

    setPos({
      top,
      left,
      width: matchAnchorWidth ? rect.width : undefined,
      ready: true,
    });
  }, [anchorRef, align, minWidth, matchAnchorWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setPos((p) => ({ ...p, ready: false }));
      return;
    }
    updatePosition();
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return undefined;
    const onReflow = () => updatePosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (isClickOutside(anchorRef?.current, e) && isClickOutside(menuRef.current, e)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      data-tour={dataTour || undefined}
      className={`ui-solid-white fixed z-[99990] border border-slate-200 bg-white shadow-xl ${fitContent ? 'w-max' : ''} ${className}`}
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        visibility: pos.ready ? 'visible' : 'hidden',
        minWidth: pos.width ? undefined : (minWidth || undefined),
      }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

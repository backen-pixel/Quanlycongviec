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
    setPos({
      top: rect.bottom + 4,
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

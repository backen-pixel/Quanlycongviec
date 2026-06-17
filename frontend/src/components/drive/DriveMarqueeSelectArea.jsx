/**
 * Vùng chọn file bằng kéo chuột (marquee) — giống Explorer / Google Drive.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DRAG_THRESHOLD = 4;

const guard = { until: 0 };

/** Bỏ qua click mở file ngay sau khi kéo chọn xong. */
export function shouldIgnoreDriveMarqueeClick() {
  return Date.now() < guard.until;
}

function normalizeBox(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function rectsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('button, a, input, textarea, select, label, [data-no-marquee]');
}

function getIntersectingIds(root, box) {
  const ids = [];
  root.querySelectorAll('[data-drive-select-id]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (rectsIntersect(box, r)) {
      const id = el.getAttribute('data-drive-select-id');
      if (id) ids.push(id);
    }
  });
  return ids;
}

export default function DriveMarqueeSelectArea({
  enabled = false,
  selectedIds,
  onSelectionChange,
  children,
  className = '',
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  const selectedIdsRef = useRef(selectedIds);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const [marquee, setMarquee] = useState(null);

  selectedIdsRef.current = selectedIds;
  onSelectionChangeRef.current = onSelectionChange;

  const finishDrag = useCallback(() => {
    dragRef.current = null;
    setMarquee(null);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0 || !onSelectionChangeRef.current) return;
    if (isInteractiveTarget(e.target)) return;

    const root = containerRef.current;
    if (!root) return;

    e.preventDefault();

    const additive = e.ctrlKey || e.metaKey;
    const base = selectedIdsRef.current;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      additive,
      baseSelection: additive
        ? new Set(base instanceof Set ? base : base || [])
        : new Set(),
    };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;

      const dx = Math.abs(ev.clientX - d.startX);
      const dy = Math.abs(ev.clientY - d.startY);

      if (!d.dragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        d.dragging = true;
      }

      if (!d.dragging) return;

      ev.preventDefault();

      const box = normalizeBox(d.startX, d.startY, ev.clientX, ev.clientY);
      setMarquee({
        left: box.left,
        top: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      });

      const ids = getIntersectingIds(root, box);
      const next = new Set(d.baseSelection);
      ids.forEach((id) => next.add(id));
      onSelectionChangeRef.current?.(next);
    };

    const onUp = (ev) => {
      const d = dragRef.current;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!d) return;

      if (d.dragging) {
        guard.until = Date.now() + 250;
      } else if (!isInteractiveTarget(ev.target) && !(ev.ctrlKey || ev.metaKey)) {
        const clickedItem = ev.target instanceof Element
          ? ev.target.closest('[data-drive-select-id]')
          : null;
        if (!clickedItem) onSelectionChangeRef.current?.(new Set());
      }

      finishDrag();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [enabled, finishDrag]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;

    const onNativeDragStart = (e) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };
    el.addEventListener('dragstart', onNativeDragStart);
    return () => el.removeEventListener('dragstart', onNativeDragStart);
  }, [enabled]);

  return (
    <div
      ref={containerRef}
      data-drive-marquee-zone={enabled ? '1' : undefined}
      className={`relative w-full ${enabled ? 'select-none' : ''}`}
      onMouseDownCapture={handleMouseDown}
    >
      <div ref={contentRef} className={`${className || ''} ${enabled ? 'min-h-[140px]' : ''}`.trim()}>
        {children}
      </div>
      {marquee && createPortal(
        <div
          className="fixed pointer-events-none z-[10040] border-2 border-blue-500 bg-blue-500/20 rounded-sm shadow-sm"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
          aria-hidden
        />,
        document.body,
      )}
    </div>
  );
}

/**
 * Vùng chọn file bằng kéo chuột (marquee) — giống Explorer / Google Drive.
 */
import { useCallback, useRef, useState } from 'react';

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

function getIntersectingIds(container, box) {
  const ids = [];
  container.querySelectorAll('[data-drive-select-id]').forEach((el) => {
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
  const dragRef = useRef(null);
  const [marquee, setMarquee] = useState(null);

  const finishDrag = useCallback(() => {
    dragRef.current = null;
    setMarquee(null);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0 || !onSelectionChange) return;
    if (isInteractiveTarget(e.target)) return;

    const container = containerRef.current;
    if (!container) return;

    const additive = e.ctrlKey || e.metaKey;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      additive,
      baseSelection: additive
        ? new Set(selectedIds instanceof Set ? selectedIds : selectedIds || [])
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
      const cRect = container.getBoundingClientRect();
      setMarquee({
        left: box.left - cRect.left + container.scrollLeft,
        top: box.top - cRect.top + container.scrollTop,
        width: box.right - box.left,
        height: box.bottom - box.top,
      });

      const ids = getIntersectingIds(container, box);
      const next = new Set(d.baseSelection);
      ids.forEach((id) => next.add(id));
      onSelectionChange(next);
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
        if (!clickedItem) onSelectionChange(new Set());
      }

      finishDrag();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [enabled, selectedIds, onSelectionChange, finishDrag]);

  return (
    <div
      ref={containerRef}
      className={`relative ${enabled ? 'select-none cursor-default' : ''} ${className}`}
      onMouseDown={handleMouseDown}
    >
      {children}
      {marquee && (
        <div
          className="absolute pointer-events-none z-30 border border-blue-500 bg-blue-500/15 rounded-sm"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

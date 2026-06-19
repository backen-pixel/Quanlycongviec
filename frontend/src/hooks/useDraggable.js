import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_PREFIX = 'tubep_widget_pos_';

export default function useDraggable(id, defaultPos = { right: 24, bottom: 24 }, options = {}) {
  const edgeW = options.edgeWidth ?? 100;
  const edgeH = options.edgeHeight ?? edgeW;
  const margin = options.margin ?? 8;

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + id)); } catch {}

  const clampPos = useCallback((p) => ({
    right: Math.max(margin, Math.min(window.innerWidth - edgeW - margin, p.right)),
    bottom: Math.max(margin, Math.min(window.innerHeight - edgeH - margin, p.bottom)),
  }), [edgeW, edgeH, margin]);

  const [pos, setPos] = useState(() => clampPos(saved || defaultPos));
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, pos: { right: 24, bottom: 24 } });
  const movedRef = useRef(false);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPos]);

  const onDragStart = useCallback((e) => {
    // Don't drag if clicking buttons/inputs/links (unless marked as drag handle)
    if (!e.target.closest('[data-drag-handle]') && e.target.closest('button, input, a, [data-no-drag]')) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    movedRef.current = false;
    setDragging(true);
    startRef.current = { x: clientX, y: clientY, pos: { ...pos } };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = startRef.current.x - clientX;
      const dy = startRef.current.y - clientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      setPos(clampPos({
        right: startRef.current.pos.right + dx,
        bottom: startRef.current.pos.bottom + dy,
      }));
    };

    const onEnd = () => {
      setDragging(false);
      if (movedRef.current) {
        setPos(p => { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(p)); return p; });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragging, id, clampPos]);

  const didDrag = useCallback(() => movedRef.current, []);

  return { pos, dragging, onDragStart, didDrag };
}

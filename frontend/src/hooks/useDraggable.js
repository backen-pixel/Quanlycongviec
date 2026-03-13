import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_PREFIX = 'tubep_widget_pos_';

export default function useDraggable(id, defaultPos = { right: 24, bottom: 24 }) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + id)); } catch {}

  const [pos, setPos] = useState(saved || defaultPos);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, pos: { right: 24, bottom: 24 } });

  const onDragStart = useCallback((e) => {
    if (e.target.closest('button, input, a, [data-no-drag]')) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragging(true);
    startRef.current = { x: clientX, y: clientY, pos: { ...pos } };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = startRef.current.x - clientX;
      const dy = startRef.current.y - clientY;
      const newRight = Math.max(8, Math.min(window.innerWidth - 80, startRef.current.pos.right + dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - 80, startRef.current.pos.bottom + dy));
      setPos({ right: newRight, bottom: newBottom });
    };

    const onEnd = () => {
      setDragging(false);
      setPos(p => { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(p)); return p; });
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
  }, [dragging, id]);

  return { pos, dragging, onDragStart };
}

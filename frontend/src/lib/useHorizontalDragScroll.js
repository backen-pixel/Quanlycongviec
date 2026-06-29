import { useRef, useCallback, useEffect } from 'react';

/** Kéo ngang để cuộn vùng overflow-x (desktop không có touchpad). */
export function useHorizontalDragScroll() {
  const ref = useRef(null);
  const stateRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });

  const endDrag = useCallback(() => {
    if (!stateRef.current.active) return;
    stateRef.current.active = false;
    const el = ref.current;
    if (el) el.classList.remove('select-none');
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!stateRef.current.active) return;
      const el = ref.current;
      if (!el) return;
      const dx = e.pageX - stateRef.current.startX;
      if (Math.abs(dx) > 3) stateRef.current.moved = true;
      el.scrollLeft = stateRef.current.scrollLeft - dx;
    };
    const onUp = () => endDrag();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [endDrag]);

  const onMouseDown = useCallback((e) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    if (e.target.closest('button')) return;
    stateRef.current = { active: true, startX: e.pageX, scrollLeft: el.scrollLeft, moved: false };
    el.classList.add('select-none');
  }, []);

  return { ref, onMouseDown };
}

import { useRef, useCallback, useEffect } from 'react';

/**
 * Kéo ngang để cuộn vùng overflow-x (desktop không có touchpad).
 * @param {{ allowFromButton?: boolean }} [opts] allowFromButton: cho phép bắt đầu kéo ngay
 *   cả khi nhấn chuột xuống một <button> (vd. hàng toàn nút chip/tab) — mặc định false vì đa số
 *   nơi dùng hook này chỉ có 1 nút nhỏ (icon xoá) bên trong hàng, nên nhấn xuống nút đó vẫn cần
 *   click bình thường, không kéo. Khi bật allowFromButton, dùng thêm `onClickCapture` trả về để
 *   chặn click "nhầm" phát sinh khi thả chuột sau một cú kéo thật sự.
 */
export function useHorizontalDragScroll({ allowFromButton = false } = {}) {
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
    if (!allowFromButton && e.target.closest('button')) return;
    stateRef.current = { active: true, startX: e.pageX, scrollLeft: el.scrollLeft, moved: false };
    el.classList.add('select-none');
  }, [allowFromButton]);

  /** Chặn click ngay sau khi vừa kéo — tránh bấm nhầm nút bên dưới con trỏ lúc thả chuột. */
  const onClickCapture = useCallback((e) => {
    if (stateRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      stateRef.current.moved = false;
    }
  }, []);

  return { ref, onMouseDown, onClickCapture };
}

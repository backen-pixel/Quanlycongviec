import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const EDGE_ZONE_PX = 56;
const MIN_STEP = 5;
const MAX_STEP = 34;
const NUDGE_PX = 280;

/**
 * Vùng mép hai bên (mũi tên) + tự cuộn ngang khi kéo thẻ tới sát mép / bấm để nudge.
 * @param {string} cardSelector — selector cho `Element.closest` khi bắt drag (vd: '[data-sx-kanban-card]')
 * @param {boolean} enableViewportScroll — bật chế độ cuộn dọc toàn Kanban như CRM
 * @param {number|string} remeasureToken — token đổi khi cần đo lại chiều cao vùng cuộn
 */
export default function WorkshopPipelineKanbanScroll({
  cardSelector,
  children,
  enableViewportScroll = false,
  remeasureToken,
}) {
  const kanbanHScrollRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const pipelineDraggingRef = useRef(false);
  const scrollRafRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [scrollMaxH, setScrollMaxH] = useState('70vh');

  const stopScrollLoop = useCallback(() => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    }
  }, []);

  const endDrag = useCallback(() => {
    pipelineDraggingRef.current = false;
    setIsDraggingCard(false);
    stopScrollLoop();
  }, [stopScrollLoop]);

  const scrollStep = useCallback((delta) => {
    const sc = kanbanHScrollRef.current;
    if (!sc || delta === 0) return false;
    const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
    const before = sc.scrollLeft;
    sc.scrollLeft = Math.max(0, Math.min(maxLeft, before + delta));
    return sc.scrollLeft !== before;
  }, []);

  const runScrollLoop = useCallback(() => {
    scrollRafRef.current = 0;
    if (!pipelineDraggingRef.current) return;
    const sc = kanbanHScrollRef.current;
    const wrap = kanbanWrapRef.current;
    if (!sc || !wrap) return;

    const { x } = lastPointerRef.current;
    const r = wrap.getBoundingClientRect();
    const innerLeft = r.left + EDGE_ZONE_PX;
    const innerRight = r.right - EDGE_ZONE_PX;
    let delta = 0;

    if (x < innerLeft) {
      const t = Math.min(1, (innerLeft - x) / EDGE_ZONE_PX);
      delta = -(MIN_STEP + t * t * (MAX_STEP - MIN_STEP));
    } else if (x > innerRight) {
      const t = Math.min(1, (x - innerRight) / EDGE_ZONE_PX);
      delta = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
    }

    if (delta !== 0) {
      const moved = scrollStep(delta);
      const inZone = x < innerLeft || x > innerRight;
      if (inZone && moved) {
        scrollRafRef.current = requestAnimationFrame(runScrollLoop);
      }
    }
  }, [scrollStep]);

  const scheduleScrollLoop = useCallback(() => {
    if (!scrollRafRef.current) {
      scrollRafRef.current = requestAnimationFrame(runScrollLoop);
    }
  }, [runScrollLoop]);

  /** Kéo qua vùng mép (nút trái/phải) — luôn cuộn theo hướng mép. */
  const handleEdgeDragOver = useCallback((e, direction) => {
    if (!pipelineDraggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    const step = direction === 'left' ? -MAX_STEP : MAX_STEP;
    scrollStep(step);
    scheduleScrollLoop();
  }, [scrollStep, scheduleScrollLoop]);

  useEffect(() => {
    if (!enableViewportScroll) return undefined;
    const measure = () => {
      const el = kanbanHScrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const avail = window.innerHeight - rect.top - 12;
      setScrollMaxH(`${Math.max(360, avail)}px`);
    };
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [enableViewportScroll, remeasureToken]);

  useEffect(() => {
    const isOurCard = (e) => {
      if (!e?.target) return false;
      try {
        return !!e.target.closest?.(cardSelector);
      } catch {
        return false;
      }
    };

    const onDragStart = (e) => {
      if (isOurCard(e)) {
        pipelineDraggingRef.current = true;
        setIsDraggingCard(true);
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onDragOver = (e) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pipelineDraggingRef.current) return;
      e.preventDefault();
      const wrap = kanbanWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const innerLeft = r.left + EDGE_ZONE_PX;
      const innerRight = r.right - EDGE_ZONE_PX;
      if (e.clientX < innerLeft || e.clientX > innerRight) {
        scheduleScrollLoop();
      }
    };

    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', endDrag, true);
    document.addEventListener('drop', endDrag, true);
    document.addEventListener('dragover', onDragOver, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', endDrag, true);
      document.removeEventListener('drop', endDrag, true);
      document.removeEventListener('dragover', onDragOver, true);
      stopScrollLoop();
    };
  }, [cardSelector, endDrag, scheduleScrollLoop, stopScrollLoop]);

  const nudge = (dir) => {
    const sc = kanbanHScrollRef.current;
    if (!sc) return;
    sc.scrollLeft = Math.max(
      0,
      Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? NUDGE_PX : -NUDGE_PX)),
    );
  };

  const edgeZoneClass = (side) =>
    `absolute ${side === 'left' ? 'left-0' : 'right-0'} top-0 bottom-4 z-[21] w-10 sm:w-12 ${
      isDraggingCard ? 'pointer-events-auto' : 'pointer-events-none'
    }`;

  const clickBtnClass = (side) =>
    `absolute ${side === 'left' ? 'left-0' : 'right-0'} top-0 bottom-4 z-[22] w-10 border-0 bg-transparent p-0 sm:w-12 ${
      isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
    }`;

  return (
    <div ref={kanbanWrapRef} className="relative">
      {/* Gradient hints */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronLeft className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} aria-hidden />
        </div>
      </div>
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronRight className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} aria-hidden />
        </div>
      </div>

      {/* Vùng mép nhận dragover khi đang kéo thẻ — kích hoạt auto-scroll */}
      <div
        className={edgeZoneClass('left')}
        onDragOver={(e) => handleEdgeDragOver(e, 'left')}
        onDragEnter={(e) => handleEdgeDragOver(e, 'left')}
        aria-hidden
      />
      <div
        className={edgeZoneClass('right')}
        onDragOver={(e) => handleEdgeDragOver(e, 'right')}
        onDragEnter={(e) => handleEdgeDragOver(e, 'right')}
        aria-hidden
      />

      {/* Nút bấm cuộn nhanh — chỉ khi không kéo */}
      <button
        type="button"
        className={clickBtnClass('left')}
        title="Kéo thẻ tới mép này để tự cuộn cột bên trái — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={clickBtnClass('right')}
        title="Kéo thẻ tới mép này để tự cuộn cột bên phải — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('right')}
      />

      <div
        ref={kanbanHScrollRef}
        className={`${enableViewportScroll ? 'overflow-auto' : 'overflow-x-auto'} pb-4 [scrollbar-gutter:stable]`}
        style={enableViewportScroll ? { maxHeight: scrollMaxH } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Vùng mép hai bên (mũi tên) + tự cuộn ngang khi kéo thẻ tới sát mép / bấm để nudge — cùng ý tưởng CRMDashboard Kanban.
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
      }
    };
    const onDragEnd = () => {
      pipelineDraggingRef.current = false;
      setIsDraggingCard(false);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };

    const EDGE_ZONE_PX = 56;
    const MIN_STEP = 5;
    const MAX_STEP = 34;

    const runScroll = () => {
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
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = -step;
      } else if (x > innerRight) {
        const t = Math.min(1, (x - innerRight) / EDGE_ZONE_PX);
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = step;
      }
      if (delta !== 0) {
        const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const before = sc.scrollLeft;
        sc.scrollLeft = Math.max(0, Math.min(maxLeft, before + delta));
        const moved = sc.scrollLeft !== before;
        const inZone = x < innerLeft || x > innerRight;
        if (inZone && moved) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
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
        if (!scrollRafRef.current) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
      }
    };

    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('dragover', onDragOver, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('dragover', onDragOver, true);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [cardSelector]);

  const nudge = (dir) => {
    const sc = kanbanHScrollRef.current;
    if (!sc) return;
    const w = 280;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)));
  };

  return (
    <div ref={kanbanWrapRef} className="relative">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronLeft
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
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
          <ChevronRight
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <button
        type="button"
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Kéo thẻ tới mép này để tự cuộn cột bên trái — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={`absolute right-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
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

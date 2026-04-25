import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Vùng mép hai bên (mũi tên) + tự cuộn ngang khi kéo thẻ tới sát mép / bấm để nudge — cùng ý tưởng CRMDashboard Kanban.
 * @param {string} cardSelector — selector cho `Element.closest` khi bắt drag (vd: '[data-sx-kanban-card]')
 */
export default function WorkshopPipelineKanbanScroll({ cardSelector, children }) {
  const kanbanHScrollRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const pipelineDraggingRef = useRef(false);
  const scrollRafRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);

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

    const runScroll = () => {
      scrollRafRef.current = 0;
      if (!pipelineDraggingRef.current) return;
      const sc = kanbanHScrollRef.current;
      const wrap = kanbanWrapRef.current;
      if (!sc || !wrap) return;
      const { x } = lastPointerRef.current;
      const r = wrap.getBoundingClientRect();
      const margin = 56;
      if (x < r.left + margin) {
        sc.scrollLeft = Math.max(0, sc.scrollLeft - 14);
        scrollRafRef.current = requestAnimationFrame(runScroll);
      } else if (x > r.right - margin) {
        sc.scrollLeft = Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + 14);
        scrollRafRef.current = requestAnimationFrame(runScroll);
      }
    };

    const onDragOver = (e) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pipelineDraggingRef.current) return;
      e.preventDefault();
      if (scrollRafRef.current) return;
      const wrap = kanbanWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const margin = 56;
      if (e.clientX < r.left + margin || e.clientX > r.right - margin) {
        scrollRafRef.current = requestAnimationFrame(runScroll);
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
      <div ref={kanbanHScrollRef} className="overflow-x-auto pb-4 [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}

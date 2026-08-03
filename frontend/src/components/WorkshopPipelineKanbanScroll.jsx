import { useRef, useState, useEffect, useCallback, createContext, useContext } from 'react';
import { UI_KANBAN_FIXED_CLASS } from '../lib/kanbanColumnTheme';
import {
  KanbanBoardEdgeScrollChrome,
} from '../lib/kanbanEdgeScrollControls';
import {
  KANBAN_H_SCROLL_MAIN_CLASS,
  useKanbanFixedHorizontalScrollbar,
} from '../lib/useKanbanFixedHorizontalScrollbar';

const EDGE_ZONE_PX = 56;
const MIN_STEP = 5;
const MAX_STEP = 34;
const NUDGE_PX = 280;
/** Chừa chỗ cho thanh cuộn ngang cố định (16px) + khoảng hở đáy màn hình. */
const BOTTOM_RESERVE_PX = 24;
const MIN_BOARD_H = 360;
const MAX_BOARD_H = 1180;

/** Vùng cuộn dọc gần nhất bọc ngoài board (thường là <main>). */
function findScrollParent(el) {
  let node = el?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Chiều cao nội dung thật nằm dưới board (chân board, padding trang) tính tới `stopAt`.
 * Chỉ cộng sibling + padding/margin đáy nên không phụ thuộc chiều cao board → không co lặp.
 */
function measureSpaceBelow(el, stopAt) {
  let total = 0;
  let node = el;
  while (node && node !== stopAt && node !== document.body) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const style = getComputedStyle(sib);
      if (style.position === 'absolute' || style.position === 'fixed' || style.display === 'none') continue;
      total += sib.getBoundingClientRect().height
        + (parseFloat(style.marginTop) || 0)
        + (parseFloat(style.marginBottom) || 0);
    }
    const parent = node.parentElement;
    if (!parent) break;
    const parentStyle = getComputedStyle(parent);
    total += (parseFloat(parentStyle.paddingBottom) || 0)
      + (parent === stopAt ? 0 : (parseFloat(parentStyle.marginBottom) || 0));
    node = parent;
  }
  return total;
}

const DEFAULT_LEFT_TITLE = 'Giữ chuột trên mép để cuộn chậm sang trái — bấm để cuộn nhanh — kéo thẻ tới mép để tự cuộn';
const DEFAULT_RIGHT_TITLE = 'Giữ chuột trên mép để cuộn chậm sang phải — bấm để cuộn nhanh — kéo thẻ tới mép để tự cuộn';

function assignRef(targetRef, node) {
  if (!targetRef) return;
  if (typeof targetRef === 'function') {
    targetRef(node);
    return;
  }
  targetRef.current = node;
}

/** Chiều cao vùng cuộn Kanban — dùng cho cột khi `per-column`. */
export const WorkshopKanbanScrollContext = createContext({ columnScrollMaxH: null });

export function useWorkshopKanbanScrollLayout() {
  return useContext(WorkshopKanbanScrollContext);
}

/**
 * Vùng mép hai bên (mũi tên) + tự cuộn ngang khi kéo thẻ tới sát mép / bấm để nudge / giữ chuột để cuộn chậm.
 * @param {string} cardSelector — selector cho `Element.closest` khi bắt drag (vd: '[data-sx-kanban-card]')
 * @param {(event: DragEvent) => boolean} [isDragCardTarget] — tùy chọn, ưu tiên hơn cardSelector
 * @param {'unified'|'per-column'|'off'} columnScrollMode — cuộn dọc chung / riêng từng cột / tắt
 * @param {boolean} enableViewportScroll — legacy: true = unified
 * @param {number|string} remeasureToken — token đổi khi cần đo lại chiều cao vùng cuộn
 * @param {boolean} pauseRemeasure — tạm bỏ ResizeObserver khi board đang sync/load-more
 * @param {boolean} showLegend — chú thích màu thẻ SX ở chân board
 * @param {import('react').RefObject<HTMLElement|null>|((node: HTMLElement|null) => void)} [scrollContainerRef]
 */
export default function WorkshopPipelineKanbanScroll({
  cardSelector,
  isDragCardTarget,
  children,
  columnScrollMode,
  enableViewportScroll = false,
  remeasureToken,
  pauseRemeasure = false,
  showLegend = false,
  scrollContainerRef,
  leftTitle = DEFAULT_LEFT_TITLE,
  rightTitle = DEFAULT_RIGHT_TITLE,
}) {
  const resolvedScrollMode = columnScrollMode ?? (enableViewportScroll ? 'unified' : 'off');
  const perColumnScroll = resolvedScrollMode === 'per-column';
  const unifiedScroll = resolvedScrollMode === 'unified';
  const kanbanHScrollRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const pipelineDraggingRef = useRef(false);
  const scrollRafRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [scrollMaxH, setScrollMaxH] = useState('70vh');
  const [quickChatDockRightInset, setQuickChatDockRightInset] = useState(0);

  const setScrollContainerRef = useCallback((node) => {
    kanbanHScrollRef.current = node;
    assignRef(scrollContainerRef, node);
  }, [scrollContainerRef]);

  const { fixedScrollbarPortal } = useKanbanFixedHorizontalScrollbar(
    kanbanHScrollRef,
    kanbanWrapRef,
    [resolvedScrollMode, remeasureToken, quickChatDockRightInset],
  );

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
    const innerRight = r.right - EDGE_ZONE_PX - quickChatDockRightInset;
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
  }, [scrollStep, quickChatDockRightInset]);

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
    if (!unifiedScroll && !perColumnScroll) return undefined;
    const measure = () => {
      if (pauseRemeasure) return;
      const el = kanbanHScrollRef.current;
      if (!el) return;
      // Đo từ vị trí thật của board (dưới header + thanh lọc) để đáy board
      // không bị tràn khỏi màn hình — nếu tràn thì thẻ cuối luôn bị cắt.
      const rect = el.getBoundingClientRect();
      const scrollParent = findScrollParent(el);
      // Phần nội dung nằm dưới board (chân board, padding trang) cũng phải lọt màn hình.
      const belowBoard = measureSpaceBelow(el, scrollParent);
      const bottomInset = Math.max(belowBoard, BOTTOM_RESERVE_PX);
      const viewportH = scrollParent ? scrollParent.clientHeight : window.innerHeight;
      let fitInPlace;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const topWithin = rect.top - parentRect.top + scrollParent.scrollTop;
        fitInPlace = viewportH - topWithin - bottomInset;
      } else {
        fitInPlace = window.innerHeight - rect.top - bottomInset;
      }
      // Header quá cao khiến board còn quá ít chỗ → dùng trọn màn hình,
      // phần dư reach được nhờ cuộn trang (overscroll đã cho nối tiếp).
      const target = fitInPlace >= MIN_BOARD_H ? fitInPlace : (viewportH - bottomInset);
      const maxByViewport = Math.max(MIN_BOARD_H, Math.floor(target));
      setScrollMaxH(`${Math.min(MAX_BOARD_H, maxByViewport)}px`);
    };
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    const scrollParent = findScrollParent(kanbanHScrollRef.current);
    const ro = new ResizeObserver(() => {
      if (pauseRemeasure) return;
      measure();
    });
    if (scrollParent) ro.observe(scrollParent);
    if (kanbanWrapRef.current) ro.observe(kanbanWrapRef.current);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      clearTimeout(t2);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [unifiedScroll, perColumnScroll, remeasureToken, pauseRemeasure]);

  useEffect(() => {
    const isOurCard = (e) => {
      if (!e?.target) return false;
      if (typeof isDragCardTarget === 'function') {
        try {
          return isDragCardTarget(e);
        } catch {
          return false;
        }
      }
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
      const innerRight = r.right - EDGE_ZONE_PX - quickChatDockRightInset;
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
  }, [cardSelector, isDragCardTarget, endDrag, scheduleScrollLoop, stopScrollLoop, quickChatDockRightInset]);

  const nudge = (dir) => {
    const sc = kanbanHScrollRef.current;
    if (!sc) return;
    sc.scrollLeft = Math.max(
      0,
      Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? NUDGE_PX : -NUDGE_PX)),
    );
  };

  useEffect(() => {
    const el = kanbanHScrollRef.current;
    if (!el || (!unifiedScroll && !perColumnScroll)) return undefined;

    const onWheel = (e) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX < 2 || absX <= absY * 0.85) return;

      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxLeft < 1) return;

      const next = el.scrollLeft + e.deltaX;
      const clamped = Math.max(0, Math.min(maxLeft, next));
      if (clamped === el.scrollLeft) return;

      e.preventDefault();
      el.scrollLeft = clamped;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [unifiedScroll, perColumnScroll, remeasureToken]);

  const rightEdgeStyle = quickChatDockRightInset > 0 ? { right: quickChatDockRightInset } : undefined;

  return (
    <WorkshopKanbanScrollContext.Provider value={{ columnScrollMaxH: scrollMaxH }}>
      {fixedScrollbarPortal}
      <div ref={kanbanWrapRef} className={`relative ${UI_KANBAN_FIXED_CLASS}`}>
      <KanbanBoardEdgeScrollChrome
        wrapRef={kanbanWrapRef}
        scrollRef={kanbanHScrollRef}
        remeasureToken={remeasureToken}
        isDraggingCard={isDraggingCard}
        onNudgeLeft={() => nudge('left')}
        onNudgeRight={() => nudge('right')}
        onRightInsetChange={setQuickChatDockRightInset}
        leftTitle={leftTitle}
        rightTitle={rightTitle}
      />

      {/* Vùng mép nhận dragover khi đang kéo thẻ — kích hoạt auto-scroll */}
      <div
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 sm:w-12 ${
          isDraggingCard ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        onDragOver={(e) => handleEdgeDragOver(e, 'left')}
        onDragEnter={(e) => handleEdgeDragOver(e, 'left')}
        aria-hidden
      />
      <div
        className={`absolute top-0 bottom-4 z-[21] w-10 sm:w-12 motion-reduce:transition-none transition-[right] duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)] ${
          isDraggingCard ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        style={rightEdgeStyle ?? { right: 0 }}
        onDragOver={(e) => handleEdgeDragOver(e, 'right')}
        onDragEnter={(e) => handleEdgeDragOver(e, 'right')}
        aria-hidden
      />

      <div
        ref={setScrollContainerRef}
        className={`${KANBAN_H_SCROLL_MAIN_CLASS} overscroll-behavior-contain pb-4 [scrollbar-gutter:stable] [overflow-anchor:none] ${
          perColumnScroll ? 'overflow-x-auto overflow-y-hidden' : unifiedScroll ? 'overflow-auto' : 'overflow-x-auto'
        }`}
        style={{
          ...(perColumnScroll ? { height: scrollMaxH } : unifiedScroll ? { maxHeight: scrollMaxH } : {}),
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
      {showLegend ? (
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 mt-1 border-t border-gray-100 bg-white text-[11px] text-gray-600 rounded-b-lg ui-solid-white">
        <span className="font-semibold text-gray-500 mr-1">Chú thích:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-gray-300 bg-white" aria-hidden />
          Bình thường
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-orange-300 bg-orange-100" aria-hidden />
          Sắp tới hạn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-red-300 bg-red-100" aria-hidden />
          Quá hạn
        </span>
      </div>
      ) : null}
      </div>
    </WorkshopKanbanScrollContext.Provider>
  );
}

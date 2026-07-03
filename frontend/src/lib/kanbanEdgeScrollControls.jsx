import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const MESSENGER_QUICK_CHAT_DOCK_SELECTOR = '[data-messenger-quick-chat-dock]';
export const MESSENGER_QUICK_CHAT_DOCK_REGION_SELECTOR = '[data-messenger-quick-chat-dock-region]';

const BOTTOM_INSET_PX = 16;
const EDGE_BTN_W_SM = 40;
const EDGE_BTN_W_MD = 48;
const DOCK_LAYOUT_POLL_MS = 280;
const DOCK_MOTION_MS = 520;
const RIGHT_GAP_PX = 8;
const DOCK_MOTION_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
const HOVER_SCROLL_MIN_STEP = 3;
const HOVER_SCROLL_MAX_STEP = 11;
const HOVER_SCROLL_RAMP_MS = 900;

function edgeButtonWidth() {
  if (typeof window === 'undefined') return EDGE_BTN_W_MD;
  return window.matchMedia('(min-width: 640px)').matches ? EDGE_BTN_W_MD : EDGE_BTN_W_SM;
}

/** Hợp nhất bounding rect của các vùng dock hiển thị (panel mở + cột compact). */
export function measureMessengerQuickChatDockVisibleRect() {
  if (typeof document === 'undefined') return null;

  const regions = document.querySelectorAll(MESSENGER_QUICK_CHAT_DOCK_REGION_SELECTOR);
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let found = false;

  regions.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    found = true;
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  });

  if (found) {
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  const dock = document.querySelector(MESSENGER_QUICK_CHAT_DOCK_SELECTOR);
  if (!dock) return null;
  const r = dock.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
}

/** Lùi nút mép phải Kanban khi thanh chat nhanh (ghim/mở) che vùng bấm. */
export function measureQuickChatDockRightInsetPx(kanbanRect, extraGap = RIGHT_GAP_PX) {
  if (!kanbanRect || typeof document === 'undefined') return 0;

  const dr = measureMessengerQuickChatDockVisibleRect();
  if (!dr) return 0;

  const btnW = edgeButtonWidth();
  const zoneTop = kanbanRect.top;
  const zoneBottom = kanbanRect.bottom - BOTTOM_INSET_PX;
  const btnLeftDefault = kanbanRect.right - btnW;
  const btnRightDefault = kanbanRect.right;

  if (dr.bottom <= zoneTop || dr.top >= zoneBottom) return 0;
  if (dr.right <= btnLeftDefault || dr.left >= btnRightDefault) return 0;

  return Math.max(0, Math.ceil(kanbanRect.right - dr.left + extraGap));
}

function observeDockRegions(ro, sync) {
  ro.disconnect();
  document.querySelectorAll(MESSENGER_QUICK_CHAT_DOCK_REGION_SELECTOR).forEach((el) => ro.observe(el));
  const dock = document.querySelector(MESSENGER_QUICK_CHAT_DOCK_SELECTOR);
  if (dock) ro.observe(dock);
  sync();
}

export function useQuickChatDockRightInset(kanbanRect, remeasureToken) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const sync = () => {
      setInset(measureQuickChatDockRightInsetPx(kanbanRect));
    };

    sync();
    const poll = window.setInterval(sync, DOCK_LAYOUT_POLL_MS);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    window.addEventListener('messenger-quick-dock-layout', sync);

    let ro;
    let mo;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync);
      observeDockRegions(ro, sync);
    }

    const dock = document.querySelector(MESSENGER_QUICK_CHAT_DOCK_SELECTOR);
    if (dock && typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => {
        if (ro) observeDockRegions(ro, sync);
        else sync();
      });
      mo.observe(dock, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('messenger-quick-dock-layout', sync);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [kanbanRect, remeasureToken]);

  return inset;
}

/** Theo dõi vị trí viewport của vùng Kanban (cuộn / resize). */
export function useKanbanWrapViewportRect(wrapRef, remeasureToken) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const sync = () => {
      const el = wrapRef.current;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        height: r.height,
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    const el = wrapRef.current;
    if (el) ro.observe(el);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [wrapRef, remeasureToken]);

  return rect;
}

export function useKanbanEdgeScrollLayout(wrapRef, remeasureToken) {
  const rect = useKanbanWrapViewportRect(wrapRef, remeasureToken);
  const rightInset = useQuickChatDockRightInset(rect, remeasureToken);
  return { rect, rightInset };
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cuộn ngang chậm/mượt khi giữ chuột trên nút mép (kiểu Bitrix). */
export function useKanbanEdgeButtonHoverScroll(scrollRef, { disabled = false } = {}) {
  const rafRef = useRef(0);
  const directionRef = useRef(null);
  const startedAtRef = useRef(0);

  const stopHoverScroll = useCallback(() => {
    directionRef.current = null;
    startedAtRef.current = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const tick = useCallback(() => {
    rafRef.current = 0;
    const direction = directionRef.current;
    if (!direction || disabled) return;

    const sc = scrollRef?.current;
    if (!sc) return;

    const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
    const elapsed = startedAtRef.current ? performance.now() - startedAtRef.current : 0;
    const ramp = prefersReducedMotion() ? 1 : Math.min(1, elapsed / HOVER_SCROLL_RAMP_MS);
    const easedRamp = ramp * ramp;
    const step = HOVER_SCROLL_MIN_STEP + easedRamp * (HOVER_SCROLL_MAX_STEP - HOVER_SCROLL_MIN_STEP);
    const delta = direction === 'right' ? step : -step;
    const before = sc.scrollLeft;
    sc.scrollLeft = Math.max(0, Math.min(maxLeft, before + delta));

    if (sc.scrollLeft !== before && directionRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [scrollRef, disabled]);

  const startHoverScroll = useCallback((direction) => {
    if (disabled) return;
    directionRef.current = direction;
    startedAtRef.current = performance.now();
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [disabled, tick]);

  useEffect(() => () => stopHoverScroll(), [stopHoverScroll]);

  return { startHoverScroll, stopHoverScroll };
}

/**
 * Gradient mép + nút cuộn absolute (cùng vùng bấm với mũi tên hiển thị).
 */
export function KanbanBoardEdgeScrollChrome({
  wrapRef,
  scrollRef,
  remeasureToken,
  isDraggingCard,
  onNudgeLeft,
  onNudgeRight,
  leftTitle,
  rightTitle,
  bottomClass = 'bottom-4',
  onRightInsetChange,
}) {
  const { rightInset } = useKanbanEdgeScrollLayout(wrapRef, remeasureToken);
  const dragging = !!isDraggingCard;
  const rightStyle = rightInset > 0 ? { right: rightInset } : undefined;
  const [hoverSide, setHoverSide] = useState(null);
  const { startHoverScroll, stopHoverScroll } = useKanbanEdgeButtonHoverScroll(scrollRef, { disabled: dragging });

  useEffect(() => {
    onRightInsetChange?.(rightInset);
  }, [rightInset, onRightInsetChange]);

  useEffect(() => {
    if (dragging) {
      setHoverSide(null);
      stopHoverScroll();
    }
  }, [dragging, stopHoverScroll]);

  const edgeActive = (side) => dragging || hoverSide === side;
  const chevronTone = (side) => (
    edgeActive(side)
      ? 'text-slate-700/90 opacity-100'
      : 'text-slate-600/70 opacity-45'
  );

  const clickBtnBase = `kanban-edge-scroll-btn absolute top-0 ${bottomClass} z-[30] w-10 border-0 bg-transparent p-0 sm:w-12 ${
    dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'
  }`;

  const bindHoverScroll = (side) => ({
    onMouseEnter: () => {
      if (dragging || !scrollRef) return;
      setHoverSide(side);
      startHoverScroll(side);
    },
    onMouseLeave: () => {
      setHoverSide((prev) => (prev === side ? null : prev));
      stopHoverScroll();
    },
  });

  return (
    <>
      <div
        className={`kanban-edge-scroll-chrome pointer-events-none absolute left-0 top-0 ${bottomClass} z-[28] flex w-12 items-stretch sm:w-14`}
        aria-hidden
      >
        <div className="flex w-full items-center justify-center bg-transparent pl-0.5 transition-opacity duration-200">
          <ChevronLeft
            className={`h-9 w-9 drop-shadow-[0_0_4px_rgba(255,255,255,0.85)] transition-opacity duration-200 sm:h-10 sm:w-10 ${chevronTone('left')}`}
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <div
        className={`kanban-edge-scroll-chrome pointer-events-none absolute top-0 ${bottomClass} z-[28] flex w-12 items-stretch sm:w-14 motion-reduce:transition-none transition-[right] duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)]`}
        style={rightStyle ?? { right: 0 }}
        aria-hidden
      >
        <div className="ml-auto flex w-full items-center justify-center bg-transparent pr-0.5 transition-opacity duration-200">
          <ChevronRight
            className={`h-9 w-9 drop-shadow-[0_0_4px_rgba(255,255,255,0.85)] transition-opacity duration-200 sm:h-10 sm:w-10 ${chevronTone('right')}`}
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>

      <button
        type="button"
        className={`${clickBtnBase} left-0`}
        title={leftTitle}
        aria-label={leftTitle}
        onClick={onNudgeLeft}
        {...bindHoverScroll('left')}
      />
      <button
        type="button"
        className={`${clickBtnBase} motion-reduce:transition-none transition-[right] duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)]`}
        style={rightStyle ?? { right: 0 }}
        title={rightTitle}
        aria-label={rightTitle}
        onClick={onNudgeRight}
        {...bindHoverScroll('right')}
      />
    </>
  );
}

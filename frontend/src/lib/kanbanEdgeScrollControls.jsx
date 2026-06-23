import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { KANBAN_EDGE_SCROLL_Z_INDEX } from '../components/MessengerQuickChatDock';

export const MESSENGER_QUICK_CHAT_DOCK_SELECTOR = '[data-messenger-quick-chat-dock]';
export const MESSENGER_QUICK_CHAT_DOCK_REGION_SELECTOR = '[data-messenger-quick-chat-dock-region]';

const BOTTOM_INSET_PX = 16;
const EDGE_BTN_W_SM = 40;
const EDGE_BTN_W_MD = 48;
const DOCK_LAYOUT_POLL_MS = 120;
const DOCK_MOTION_MS = 520;
const RIGHT_GAP_PX = 8;
const DOCK_MOTION_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

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

/**
 * Gradient mép + nút portal (tự lùi khi thanh chat nhanh mở/ghim).
 */
export function KanbanBoardEdgeScrollChrome({
  wrapRef,
  remeasureToken,
  isDraggingCard,
  onNudgeLeft,
  onNudgeRight,
  leftTitle,
  rightTitle,
  bottomClass = 'bottom-4',
  onRightInsetChange,
}) {
  const { rect, rightInset } = useKanbanEdgeScrollLayout(wrapRef, remeasureToken);
  const dragging = !!isDraggingCard;
  const rightStyle = rightInset > 0 ? { right: rightInset } : { right: 0 };

  useEffect(() => {
    onRightInsetChange?.(rightInset);
  }, [rightInset, onRightInsetChange]);

  return (
    <>
      <div
        className={`pointer-events-none absolute left-0 top-0 ${bottomClass} z-20 flex w-12 items-stretch sm:w-14`}
        aria-hidden
      >
        <div
          className={`flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5 transition-opacity duration-200 ${
            dragging ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronLeft className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} aria-hidden />
        </div>
      </div>
      <div
        className={`pointer-events-none absolute top-0 ${bottomClass} z-20 flex w-12 items-stretch sm:w-14 motion-reduce:transition-none transition-[right] duration-[520ms] ease-[cubic-bezier(0.33,1,0.68,1)]`}
        style={rightStyle}
        aria-hidden
      >
        <div
          className={`ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5 transition-opacity duration-200 ${
            dragging ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronRight className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10" strokeWidth={2.25} aria-hidden />
        </div>
      </div>
      <KanbanScrollEdgeClickPortals
        rect={rect}
        rightGapPx={rightInset}
        isDraggingCard={dragging}
        onNudgeLeft={onNudgeLeft}
        onNudgeRight={onNudgeRight}
        leftTitle={leftTitle}
        rightTitle={rightTitle}
      />
    </>
  );
}

/**
 * Nút mép trái/phải render qua portal (fixed, z-index trên thanh chat nhanh).
 * Chỉ nhận click — gradient/mũi tên vẫn vẽ trong Kanban.
 */
export function KanbanScrollEdgeClickPortals({
  rect,
  rightGapPx = 0,
  isDraggingCard,
  onNudgeLeft,
  onNudgeRight,
  leftTitle,
  rightTitle,
}) {
  if (!rect || typeof document === 'undefined') return null;

  const width = edgeButtonWidth();
  const height = Math.max(0, rect.height - BOTTOM_INSET_PX);
  const dragging = !!isDraggingCard;
  const gap = Math.max(0, rightGapPx);

  const baseStyle = {
    position: 'fixed',
    top: rect.top,
    height,
    width,
    zIndex: KANBAN_EDGE_SCROLL_Z_INDEX,
    border: 0,
    padding: 0,
    margin: 0,
    background: 'transparent',
    transition: `left ${DOCK_MOTION_MS}ms ${DOCK_MOTION_EASE}`,
  };

  return createPortal(
    <>
      <button
        type="button"
        style={{ ...baseStyle, left: rect.left }}
        className={dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'}
        title={leftTitle}
        aria-label={leftTitle}
        onClick={onNudgeLeft}
      />
      <button
        type="button"
        style={{
          ...baseStyle,
          left: Math.max(rect.left, rect.right - width - gap),
        }}
        className={dragging ? 'pointer-events-none cursor-default' : 'cursor-pointer'}
        title={rightTitle}
        aria-label={rightTitle}
        onClick={onNudgeRight}
      />
    </>,
    document.body,
  );
}

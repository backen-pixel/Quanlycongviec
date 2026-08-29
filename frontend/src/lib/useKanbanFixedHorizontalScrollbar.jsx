import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export const KANBAN_H_SCROLL_MAIN_CLASS = 'kanban-h-scroll-main';
export const KANBAN_FIXED_H_SCROLLBAR_CLASS = 'kanban-fixed-h-scrollbar';

const BOTTOM_GUTTER_PX = 4;

function measureOsTaskbarHeightPx() {
  if (typeof window === 'undefined' || !window.screen) return 0;
  const { height, availHeight } = window.screen;
  if (!Number.isFinite(height) || !Number.isFinite(availHeight)) return 0;
  return Math.max(0, Math.round(height - availHeight));
}

function measureViewportBottomInsetPx() {
  let inset = BOTTOM_GUTTER_PX;

  const taskbarH = measureOsTaskbarHeightPx();
  const innerH = window.innerHeight;
  const availH = window.screen?.availHeight ?? innerH;

  if (taskbarH > 0 && innerH > availH + 4) {
    inset = Math.max(inset, taskbarH + BOTTOM_GUTTER_PX);
  }

  const vv = window.visualViewport;
  if (vv) {
    const gap = window.innerHeight - (vv.offsetTop + vv.height);
    if (gap > 0) inset = Math.max(inset, Math.round(gap) + BOTTOM_GUTTER_PX);
  }

  const safeRaw = getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)').trim();
  const safe = parseFloat(safeRaw) || 0;
  if (safe > 0) inset = Math.max(inset, safe + BOTTOM_GUTTER_PX);

  return inset;
}

function applyBarGeometry(bar, { left, width, bottom, scrollWidth }) {
  if (!bar) return;
  bar.style.left = `${Math.max(0, left)}px`;
  bar.style.width = `${Math.max(0, width)}px`;
  bar.style.bottom = `${Math.max(0, bottom)}px`;
  const track = bar.firstElementChild;
  if (track instanceof HTMLElement) {
    track.style.width = `${Math.max(0, scrollWidth)}px`;
  }
}

/**
 * Thanh cuộn ngang cố định đáy viewport, đồng bộ với container Kanban.
 */
export function useKanbanFixedHorizontalScrollbar(mainScrollRef, wrapRef, remeasureDeps = []) {
  const fixedBarRef = useRef(null);
  const trackRef = useRef(null);
  const syncFromRef = useRef(null);
  const barDraggingRef = useRef(false);
  const showRef = useRef(false);
  const trackWidthRef = useRef(0);
  const measureRafRef = useRef(0);
  const [showBar, setShowBar] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const syncBarFromMain = useCallback((main) => {
    const bar = fixedBarRef.current;
    if (!bar || !main || barDraggingRef.current) return;
    if (syncFromRef.current === 'bar') return;
    if (Math.abs(bar.scrollLeft - main.scrollLeft) > 0.5) {
      bar.scrollLeft = main.scrollLeft;
    }
  }, []);

  const measureNow = useCallback(() => {
    const main = mainScrollRef.current;
    const wrap = wrapRef.current;
    if (!main || !wrap) {
      if (showRef.current) {
        showRef.current = false;
        setShowBar(false);
      }
      return;
    }

    const mainRect = main.getBoundingClientRect();
    const scrollWidth = main.scrollWidth;
    const clientWidth = main.clientWidth;
    const hasOverflow = scrollWidth > clientWidth + 1;
    const show = hasOverflow;

    if (show !== showRef.current) {
      showRef.current = show;
      setShowBar(show);
    }

    if (!show) return;

    const bottom = measureViewportBottomInsetPx();

    if (Math.abs(trackWidthRef.current - scrollWidth) > 0.5) {
      trackWidthRef.current = scrollWidth;
      setTrackWidth(scrollWidth);
    }

    applyBarGeometry(fixedBarRef.current, {
      left: mainRect.left,
      width: mainRect.width,
      bottom,
      scrollWidth,
    });

    syncBarFromMain(main);
  }, [mainScrollRef, wrapRef, syncBarFromMain]);

  const measure = useCallback(() => {
    if (measureRafRef.current) return;
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = 0;
      measureNow();
    });
  }, [measureNow]);

  useEffect(() => {
    const main = mainScrollRef.current;
    if (!main) return undefined;

    const onMainScroll = () => {
      if (syncFromRef.current === 'bar') return;
      syncFromRef.current = 'main';
      syncBarFromMain(main);
      syncFromRef.current = null;
      measure();
    };

    main.addEventListener('scroll', onMainScroll, { passive: true });

    const ro = new ResizeObserver(() => measure());
    ro.observe(main);
    if (main.firstElementChild) ro.observe(main.firstElementChild);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const onWindow = () => measure();
    window.addEventListener('resize', onWindow);
    window.addEventListener('scroll', onWindow, true);
    window.visualViewport?.addEventListener('resize', onWindow);
    window.visualViewport?.addEventListener('scroll', onWindow);

    measureNow();
    const t = window.setTimeout(measureNow, 200);

    return () => {
      if (measureRafRef.current) {
        cancelAnimationFrame(measureRafRef.current);
        measureRafRef.current = 0;
      }
      main.removeEventListener('scroll', onMainScroll);
      ro.disconnect();
      window.removeEventListener('resize', onWindow);
      window.removeEventListener('scroll', onWindow, true);
      window.visualViewport?.removeEventListener('resize', onWindow);
      window.visualViewport?.removeEventListener('scroll', onWindow);
      window.clearTimeout(t);
    };
  }, [mainScrollRef, wrapRef, measure, measureNow, syncBarFromMain, ...remeasureDeps]);

  const onFixedBarScroll = useCallback(() => {
    const main = mainScrollRef.current;
    const bar = fixedBarRef.current;
    if (!main || !bar || syncFromRef.current === 'main') return;
    // Sự kiện `scroll` bắn ở frame SAU, lúc đó syncFromRef đã được reset về null
    // (onMainScroll reset đồng bộ), nên guard 'main' ở trên không bao giờ khớp:
    // mỗi nhịp vuốt board đều ghi ngược vào main.scrollLeft. Ghi scrollLeft giữa
    // lúc ngón tay đang vuốt sẽ triệt tiêu quán tính → cuộn ngang trên cảm ứng
    // khựng/dừng giữa chừng. Chỉ ghi khi hai bên thực sự lệch — đối xứng với
    // guard sẵn có trong syncBarFromMain. Kéo trực tiếp thanh cuộn vẫn chạy vì
    // lúc đó bar.scrollLeft khác main.scrollLeft thật.
    if (Math.abs(main.scrollLeft - bar.scrollLeft) <= 0.5) return;
    syncFromRef.current = 'bar';
    main.scrollLeft = bar.scrollLeft;
    syncFromRef.current = null;
  }, [mainScrollRef]);

  const onFixedBarWheel = useCallback((e) => {
    const main = mainScrollRef.current;
    if (!main) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (!delta) return;
    e.preventDefault();
    main.scrollLeft += delta;
  }, [mainScrollRef]);

  const onBarPointerDown = useCallback(() => {
    barDraggingRef.current = true;
  }, []);

  const onBarPointerUp = useCallback(() => {
    barDraggingRef.current = false;
    measure();
  }, [measure]);

  useEffect(() => {
    const onUp = () => {
      if (barDraggingRef.current) {
        barDraggingRef.current = false;
        measure();
      }
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [measure]);

  const fixedScrollbarPortal = showBar && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={fixedBarRef}
        className={KANBAN_FIXED_H_SCROLLBAR_CLASS}
        onScroll={onFixedBarScroll}
        onWheel={onFixedBarWheel}
        onPointerDown={onBarPointerDown}
        onPointerUp={onBarPointerUp}
        aria-hidden
      >
        <div
          ref={trackRef}
          className="kanban-fixed-h-scrollbar__track"
          style={{ width: `${Math.max(0, trackWidth)}px` }}
        />
      </div>,
      document.body,
    )
    : null;

  return { fixedScrollbarPortal, remeasure: measure };
}

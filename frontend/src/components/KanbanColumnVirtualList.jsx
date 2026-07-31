import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { findKanbanCard, scrollKanbanCardIntoView } from '../lib/kanbanCardSearchHighlight';

/** Bật virtualize khi cột có ít nhất N thẻ. */
export const CRM_KANBAN_VIRTUAL_THRESHOLD = 8;
/** Alias dùng chung CRM / SX / VC. */
export const KANBAN_VIRTUAL_THRESHOLD = CRM_KANBAN_VIRTUAL_THRESHOLD;

export const CRM_KANBAN_CARD_SLOT_CLASS = 'crm-kanban-card-slot';

const GAP_COMPACT = 8;
const GAP_DEFAULT = 10;
/** Ước lượng gần chiều cao thẻ thật (~210–240px) — estimate thấp gây nhảy layout khi measureElement. */
const ESTIMATE_COMPACT = 200;
const ESTIMATE_DEFAULT = 220;

/**
 * Danh sách thẻ Kanban có virtualize (@tanstack/react-virtual).
 * - per-column: scroll trong `columnScrollRef`
 * - unified: scroll chung qua `boardScrollRef` + đo `scrollMargin`
 */
export default function KanbanColumnVirtualList({
  items,
  columnScrollRef,
  boardScrollRef = null,
  compact = false,
  threshold = CRM_KANBAN_VIRTUAL_THRESHOLD,
  searchHighlightId = null,
  cardDomAttr = 'data-crm-pipeline-card',
  renderCard,
}) {
  const listRootRef = useRef(null);
  const gap = compact ? GAP_COMPACT : GAP_DEFAULT;
  const estimateSize = compact ? ESTIMATE_COMPACT : ESTIMATE_DEFAULT;
  const itemCount = items?.length || 0;
  const boardScrollMode = !!boardScrollRef;
  const shouldVirtualize = itemCount >= threshold;
  const useBoardScroll = boardScrollMode && shouldVirtualize;

  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollMarginRef = useRef(0);

  const measureScrollMargin = useCallback(() => {
    if (!useBoardScroll) return;
    const scrollEl = boardScrollRef.current;
    const listEl = listRootRef.current;
    if (!scrollEl || !listEl) return;
    // Offset list trong nội dung cuộn — ổn định khi cuộn dọc (sticky header).
    // Không đo lại theo scrollTop mỗi frame (tránh setState / lệch tạm thời).
    const next = Math.max(0, Math.round(
      listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop,
    ));
    if (Math.abs(next - scrollMarginRef.current) > 2) {
      scrollMarginRef.current = next;
      setScrollMargin(next);
    }
  }, [useBoardScroll, boardScrollRef]);

  useLayoutEffect(() => {
    if (!useBoardScroll) {
      scrollMarginRef.current = 0;
      setScrollMargin(0);
      return undefined;
    }
    measureScrollMargin();
    const scrollEl = boardScrollRef.current;
    if (!scrollEl) return undefined;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measureScrollMargin();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(scrollEl);
    if (listRootRef.current) ro.observe(listRootRef.current);
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [useBoardScroll, boardScrollRef, itemCount, measureScrollMargin]);

  const getScrollElement = useCallback(() => {
    if (!shouldVirtualize) return null;
    if (useBoardScroll) return boardScrollRef.current;
    return columnScrollRef?.current ?? null;
  }, [shouldVirtualize, useBoardScroll, boardScrollRef, columnScrollRef]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? itemCount : 0,
    getScrollElement,
    estimateSize: () => estimateSize + gap,
    overscan: compact ? 5 : 6,
    scrollMargin: useBoardScroll ? scrollMargin : 0,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  useLayoutEffect(() => {
    if (!shouldVirtualize || searchHighlightId == null || searchHighlightId === '') return undefined;
    const idx = items.findIndex((it) => String(it.id) === String(searchHighlightId));
    if (idx < 0) return undefined;
    virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'auto' });
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = findKanbanCard(cardDomAttr, searchHighlightId);
        scrollKanbanCardIntoView(el);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [searchHighlightId, items, shouldVirtualize, virtualizer, scrollMargin, cardDomAttr]);

  if (!itemCount) return null;

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : null;

  return (
    <div
      ref={listRootRef}
      className="relative w-full"
      style={shouldVirtualize ? { height: virtualizer.getTotalSize() } : undefined}
    >
      {shouldVirtualize ? (
        virtualItems.map((v) => {
          const item = items[v.index];
          if (!item) return null;
          // v.start đã gồm scrollMargin (offset list so với board scroll).
          // List root nằm ngay dưới header → phải trừ đi, nếu không card bị đẩy xuống
          // đúng bằng chiều cao header (lệch từng cột vì header cao/thấp khác nhau).
          const top = useBoardScroll ? v.start - scrollMargin : v.start;
          return (
            <div
              key={item.id}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className={CRM_KANBAN_CARD_SLOT_CLASS}
              style={{
                position: 'absolute',
                top,
                left: 0,
                width: '100%',
                paddingBottom: gap,
                boxSizing: 'border-box',
              }}
            >
              {renderCard(item)}
            </div>
          );
        })
      ) : (
        items.map((item, index) => (
          <div
            key={item.id}
            className={CRM_KANBAN_CARD_SLOT_CLASS}
            style={{ marginBottom: index < itemCount - 1 ? gap : 0 }}
          >
            {renderCard(item)}
          </div>
        ))
      )}
    </div>
  );
}

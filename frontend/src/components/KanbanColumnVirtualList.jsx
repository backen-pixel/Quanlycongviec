import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Bật virtualize khi cột có ít nhất N thẻ. */
export const CRM_KANBAN_VIRTUAL_THRESHOLD = 10;

export const CRM_KANBAN_CARD_SLOT_CLASS = 'crm-kanban-card-slot';

const GAP_COMPACT = 6;
const GAP_DEFAULT = 8;
const ESTIMATE_COMPACT = 118;
const ESTIMATE_DEFAULT = 132;

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
  renderCard,
}) {
  const listRootRef = useRef(null);
  const gap = compact ? GAP_COMPACT : GAP_DEFAULT;
  const estimateSize = compact ? ESTIMATE_COMPACT : ESTIMATE_DEFAULT;
  const itemCount = items?.length || 0;
  const shouldVirtualize = itemCount >= threshold;
  const useBoardScroll = shouldVirtualize && !!boardScrollRef;

  const getScrollElement = () => {
    if (!shouldVirtualize) return null;
    if (boardScrollRef) return boardScrollRef.current;
    return columnScrollRef?.current ?? null;
  };

  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (!useBoardScroll) {
      setScrollMargin(0);
      return undefined;
    }
    const scrollEl = boardScrollRef.current;
    const listEl = listRootRef.current;
    if (!scrollEl || !listEl) return undefined;

    const update = () => {
      const sRect = scrollEl.getBoundingClientRect();
      const lRect = listEl.getBoundingClientRect();
      setScrollMargin(lRect.top - sRect.top + scrollEl.scrollTop);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    ro.observe(listEl);
    scrollEl.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      scrollEl.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [useBoardScroll, boardScrollRef, itemCount]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? itemCount : 0,
    getScrollElement,
    estimateSize: () => estimateSize + gap,
    overscan: compact ? 4 : 6,
    scrollMargin: useBoardScroll ? scrollMargin : 0,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  useEffect(() => {
    if (!shouldVirtualize || searchHighlightId == null || searchHighlightId === '') return;
    const idx = items.findIndex((it) => String(it.id) === String(searchHighlightId));
    if (idx < 0) return;
    virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
  }, [searchHighlightId, items, shouldVirtualize, virtualizer]);

  if (!itemCount) return null;

  if (!shouldVirtualize) {
    return items.map((item) => (
      <div key={item.id} className={CRM_KANBAN_CARD_SLOT_CLASS}>
        {renderCard(item)}
      </div>
    ));
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={listRootRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((v) => {
        const item = items[v.index];
        if (!item) return null;
        return (
          <div
            key={item.id}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className={CRM_KANBAN_CARD_SLOT_CLASS}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${v.start}px)`,
              paddingBottom: gap,
            }}
          >
            {renderCard(item)}
          </div>
        );
      })}
    </div>
  );
}

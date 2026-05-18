import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Virtualized list wrapper using @tanstack/react-virtual.
 *
 * Props:
 *  - items: array of data
 *  - estimateSize: number | (index) => number  (px, default 64)
 *  - overscan: number of extra items to render off-screen (default 6)
 *  - renderItem: (item, index) => ReactNode
 *  - className: container className (must define max height + overflow-y)
 *  - keyExtractor: (item, index) => string|number  (optional)
 *
 * Usage example:
 *   <VirtualList
 *     items={messages}
 *     estimateSize={72}
 *     className="h-[600px] overflow-y-auto"
 *     renderItem={(msg) => <MessageRow message={msg} />}
 *   />
 *
 * Apply this in long lists such as:
 *   - FacebookPage thread/message list
 *   - SocialFeedPage feed
 *   - EventsFeedPage list view
 *   - CRMDashboard board columns
 */
export default function VirtualList({
  items,
  estimateSize = 64,
  overscan = 6,
  renderItem,
  className = 'h-[600px] overflow-y-auto',
  keyExtractor,
}) {
  const parentRef = useRef(null);
  const sizeFn = useMemo(
    () => (typeof estimateSize === 'function' ? estimateSize : () => estimateSize),
    [estimateSize],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: sizeFn,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className={className}>
      <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
        {virtualItems.map((v) => {
          const item = items[v.index];
          const key = keyExtractor ? keyExtractor(item, v.index) : v.key;
          return (
            <div
              key={key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${v.start}px)`,
              }}
            >
              {renderItem(item, v.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

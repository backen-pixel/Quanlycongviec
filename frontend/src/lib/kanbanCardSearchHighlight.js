import { useCallback, useEffect, useRef, useState } from 'react';

/** Thời gian highlight ngắn (quay lại từ chi tiết, không gắn với ô tìm). */
export const KANBAN_SEARCH_HIT_MS = 3500;

export const CRM_KANBAN_SEARCH_HIT_CLASS = 'crm-kanban-search-hit';
export const SX_KANBAN_SEARCH_HIT_CLASS = 'sx-kanban-search-hit';

/** Tailwind — viền inset (không bị cột Kanban overflow-hidden cắt). */
export const CRM_KANBAN_SEARCH_HIT_TW =
  '!border-[3px] !border-violet-500 ring-[3px] ring-inset ring-violet-400/90 !bg-violet-50/90 z-[60] relative';
export const SX_KANBAN_SEARCH_HIT_TW =
  '!border-[3px] !border-indigo-500 ring-[3px] ring-inset ring-indigo-400/90 !bg-indigo-50/90 z-[60] relative';

function escapeAttrValue(value) {
  const sid = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(sid);
  }
  return sid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Tìm thẻ Kanban đang hiển thị (ưu tiên trong `.ui-kanban-fixed`). */
export function findKanbanCard(dataAttr, id) {
  const sid = escapeAttrValue(id);
  return (
    document.querySelector(`.ui-kanban-fixed [${dataAttr}="${sid}"]`)
    || document.querySelector(`[${dataAttr}="${sid}"]`)
  );
}

/** Cuộn tới thẻ — cả slot wrapper (content-visibility) lẫn thẻ, cả ngang lẫn dọc. */
export function scrollKanbanCardIntoView(el) {
  if (!el) return;
  const slot = el.closest('.crm-kanban-card-slot') || el;
  const opts = { behavior: 'auto', block: 'center', inline: 'center' };
  slot.scrollIntoView(opts);
  el.scrollIntoView(opts);
  const column = el.closest('.kanban-unified-scroll-column') || el.closest('.kanban-column-surface');
  if (column) column.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
}

export const KANBAN_SEARCH_SCROLL_MAX_RETRIES = 32;

function scheduleKanbanCardScroll(dataAttr, id, hitClass, onFound, tryNum = 0) {
  const el = findKanbanCard(dataAttr, id);
  if (el) {
    if (hitClass) applyDomHitClass(el, hitClass);
    scrollKanbanCardIntoView(el);
    onFound?.(el);
    return el;
  }
  if (tryNum < KANBAN_SEARCH_SCROLL_MAX_RETRIES) {
    window.setTimeout(
      () => scheduleKanbanCardScroll(dataAttr, id, hitClass, onFound, tryNum + 1),
      50 + tryNum * 45,
    );
  }
  return null;
}

function applyDomHitClass(el, hitClass) {
  if (!el || !hitClass) return;
  el.classList.add(hitClass);
  const slot = el.closest('.crm-kanban-card-slot');
  if (slot) slot.classList.add('kanban-search-hit-slot');
}

function removeDomHitClass(el, hitClass) {
  if (!el || !hitClass) return;
  el.classList.remove(hitClass);
  const slot = el.closest('.crm-kanban-card-slot');
  if (slot) slot.classList.remove('kanban-search-hit-slot');
}

/**
 * State + cuộn retry — highlight React trên thẻ Kanban (CRM / SX).
 * @param {string} dataAttr — vd. `data-crm-pipeline-card` hoặc `data-sx-kanban-card`
 * @param {{ hitClass?: string, durationMs?: number }} opts
 */
export function useKanbanSearchHighlight(dataAttr, { hitClass, durationMs = KANBAN_SEARCH_HIT_MS } = {}) {
  const [highlightId, setHighlightId] = useState(null);
  const timerRef = useRef(null);
  const domElRef = useRef(null);
  const onDoneRef = useRef(null);

  const clearHighlight = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDoneRef.current?.();
    onDoneRef.current = null;
    if (domElRef.current && hitClass) {
      removeDomHitClass(domElRef.current, hitClass);
      domElRef.current = null;
    }
    setHighlightId(null);
  }, [hitClass]);

  const triggerHighlight = useCallback((id, { onDone, persist = false } = {}) => {
    if (id == null || id === '') return;
    const sid = String(id);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDoneRef.current = null;

    if (domElRef.current && hitClass) {
      removeDomHitClass(domElRef.current, hitClass);
      domElRef.current = null;
    }

    setHighlightId(sid);

    if (!persist) {
      onDoneRef.current = typeof onDone === 'function' ? onDone : null;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (domElRef.current && hitClass) {
          removeDomHitClass(domElRef.current, hitClass);
          domElRef.current = null;
        }
        setHighlightId(null);
        const done = onDoneRef.current;
        onDoneRef.current = null;
        done?.();
      }, durationMs);
    }

    requestAnimationFrame(() => {
      scheduleKanbanCardScroll(dataAttr, sid, hitClass, (el) => {
        domElRef.current = el;
      });
    });
  }, [dataAttr, durationMs, hitClass]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (domElRef.current && hitClass) {
      removeDomHitClass(domElRef.current, hitClass);
    }
  }, [hitClass]);

  const isHighlighted = useCallback(
    (id) => highlightId != null && String(id) === String(highlightId),
    [highlightId],
  );

  return { highlightId, triggerHighlight, clearHighlight, isHighlighted };
}

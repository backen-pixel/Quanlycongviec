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

/** Cuộn tới thẻ — cả slot wrapper (content-visibility) lẫn thẻ. */
export function scrollKanbanCardIntoView(el) {
  if (!el) return;
  const slot = el.closest('.crm-kanban-card-slot') || el;
  slot.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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

    const attemptScroll = (tryNum = 0) => {
      const el = findKanbanCard(dataAttr, sid);
      if (el) {
        if (hitClass) {
          applyDomHitClass(el, hitClass);
          domElRef.current = el;
        }
        scrollKanbanCardIntoView(el);
        return;
      }
      if (tryNum < 16) {
        window.setTimeout(() => attemptScroll(tryNum + 1), 40 + tryNum * 35);
      }
    };
    requestAnimationFrame(() => attemptScroll());
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

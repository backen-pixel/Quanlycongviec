/**
 * Chọn phần tử [data-tour] chính xác cho spotlight.
 */

const CARD_RELATED = new Set([
  'kanban-card',
  'kanban-card-select',
  'kanban-card-actions',
  'kanban-quick-move',
]);

const TASK_RELATED = new Set([
  'crm-task-row',
  'crm-task-complete',
  'crm-task-deadline',
  'crm-task-actions',
  'crm-task-notes-files',
  'crm-task-notes-panel',
  'crm-task-assign',
  'crm-task-verdict',
  'crm-task-file-note',
  'crm-task-edit',
  'crm-task-delete',
]);

/** @typedef {{ cardId?: string | null; taskRowId?: string | null; lastCenter?: { x: number; y: number } | null }} TourStickyContext */

export function isCardRelatedTarget(tourId) {
  return CARD_RELATED.has(tourId);
}

export function isTaskRelatedTarget(tourId) {
  return TASK_RELATED.has(tourId);
}

function hasSize(el) {
  const r = el.getBoundingClientRect();
  return r.width >= 2 && r.height >= 2;
}

/** Phần tử có thể chỉ spotlight (không ẩn / ngoài layout). */
export function isTourableElement(el) {
  if (!el || !(el instanceof Element)) return false;
  if (!hasSize(el)) return false;

  const tourId = el.getAttribute('data-tour');
  // Checkbox / nút trên thẻ Kanban thường opacity-0 đến khi hover
  const allowLowOpacity = tourId === 'kanban-card-select'
    || tourId === 'kanban-card-actions'
    || tourId === 'kanban-quick-move';

  try {
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({
        checkOpacity: !allowLowOpacity,
        checkVisibilityCSS: true,
      })) return false;
    }
  } catch {
    /* ignore */
  }

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (!allowLowOpacity && Number.parseFloat(style.opacity || '1') < 0.05) return false;

  let node = el;
  while (node && node !== document.body) {
    if (node.getAttribute?.('aria-hidden') === 'true') return false;
    if (node.hasAttribute?.('hidden')) return false;
    const cs = window.getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    node = node.parentElement;
  }
  return true;
}

function viewportOverlapScore(el) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const visibleW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const area = visibleW * visibleH;
  const fullyVisible = r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
  const nearTop = r.top >= 0 && r.top < vh * 0.55 ? 8000 : 0;
  return { area, fullyVisible, nearTop, rect: r };
}

function stackingBoost(el) {
  const style = window.getComputedStyle(el);
  let boost = 0;
  if (style.position === 'fixed' || style.position === 'sticky') boost += 20000;
  // Modal / menu nổi thường nằm trong portal body
  if (el.closest?.('[data-tour="new-lead-modal"], [data-tour="new-deal-modal"], [data-tour="event-create-modal"], [data-tour="crm-filter-panel"], [data-tour="crm-view-mode-menu"], [data-tour="crm-kanban-settings-menu"]')) {
    boost += 25000;
  }
  return boost;
}

function activeControlBoost(el, tourId) {
  const cls = String(el.className || '');
  // Tab pipeline đang chọn
  if (tourId === 'pipeline-tab-lead' || tourId === 'pipeline-tab-deal') {
    if (cls.includes('bg-white') && (cls.includes('text-blue-700') || cls.includes('text-emerald-700'))) {
      return 40000;
    }
  }
  // Tab LeadDetail đang chọn
  if (String(tourId || '').startsWith('lead-tab-')) {
    if (cls.includes('border-b-2') && cls.includes('border-blue-600')) return 40000;
  }
  if (el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true') {
    return 30000;
  }
  if (el.getAttribute('data-state') === 'open') return 20000;
  return 0;
}

function distanceScore(rect, center) {
  if (!center) return 0;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx - center.x;
  const dy = cy - center.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 15000 - d * 12);
}

/**
 * @param {string} tourId
 * @param {{ preferNear?: { x: number; y: number } | null; within?: Element | null }} [opts]
 */
export function findBestTourTarget(tourId, opts = {}) {
  const { preferNear = null, within = null } = opts;
  const root = within || document;
  const nodes = [...root.querySelectorAll(`[data-tour="${tourId}"]`)].filter(isTourableElement);
  if (!nodes.length) {
    // Fallback: có phần tử nhưng bị ẩn (vd. checkbox opacity-0) — vẫn lấy nếu có size
    const raw = [...root.querySelectorAll(`[data-tour="${tourId}"]`)].filter(hasSize);
    if (!raw.length) return null;
    return scorePick(raw, tourId, preferNear);
  }
  return scorePick(nodes, tourId, preferNear);
}

function scorePick(nodes, tourId, preferNear) {
  if (nodes.length === 1) return nodes[0];

  let best = null;
  let bestScore = -Infinity;

  for (const el of nodes) {
    const { area, fullyVisible, nearTop, rect } = viewportOverlapScore(el);
    if (area <= 0 && !preferNear) continue;
    let score = area
      + (area > 0 ? 1000 : 0)
      + (fullyVisible ? 50000 : 0)
      + nearTop
      + stackingBoost(el)
      + activeControlBoost(el, tourId)
      + distanceScore(rect, preferNear);

    // Ưu tiên thẻ nhỏ gọn hơn vùng khổng lồ (tránh khoanh cả pipeline khi lệch id)
    if (tourId === 'kanban-card' || tourId === 'crm-task-row') {
      score += Math.max(0, 12000 - area * 0.02);
    }

    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) return best;

  // Không cái nào giao viewport — chọn gần tâm / preferNear
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const cx = preferNear?.x ?? vw / 2;
  const cy = preferNear?.y ?? vh / 2;
  let minDist = Infinity;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < minDist) {
      minDist = d;
      best = el;
    }
  }
  return best || nodes[0];
}

function attrQuote(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Resolve target với sticky card / task row để các bước liên tiếp chỉ cùng một thẻ/dòng.
 * @param {string} tourId
 * @param {TourStickyContext} sticky
 */
export function resolveTourTarget(tourId, sticky = {}) {
  const preferNear = sticky.lastCenter || null;

  if (isCardRelatedTarget(tourId) && sticky.cardId) {
    const card = document.querySelector(`[data-crm-pipeline-card="${attrQuote(sticky.cardId)}"]`);
    if (card && (isTourableElement(card) || hasSize(card))) {
      if (tourId === 'kanban-card') return card;
      const inner = card.querySelector(`[data-tour="${tourId}"]`);
      if (inner && hasSize(inner)) return inner;
    }
  }

  if (isTaskRelatedTarget(tourId) && sticky.taskRowId) {
    const row = document.querySelector(`[data-tour="crm-task-row"][data-tour-task-id="${attrQuote(sticky.taskRowId)}"]`);
    if (row && (isTourableElement(row) || hasSize(row))) {
      if (tourId === 'crm-task-row') return row;
      const inner = row.querySelector(`[data-tour="${tourId}"]`);
      if (inner && hasSize(inner)) return inner;
    }
  }

  return findBestTourTarget(tourId, { preferNear });
}

/** Cập nhật sticky sau khi đã chọn được el cho bước hiện tại. */
export function updateStickyFromTarget(tourId, el, sticky) {
  const next = { ...sticky };
  if (!el) return next;

  if (isCardRelatedTarget(tourId)) {
    const card = tourId === 'kanban-card' ? el : el.closest?.('[data-crm-pipeline-card]');
    const id = card?.getAttribute?.('data-crm-pipeline-card');
    if (id) next.cardId = id;
  }

  if (isTaskRelatedTarget(tourId)) {
    const row = tourId === 'crm-task-row' ? el : el.closest?.('[data-tour="crm-task-row"]');
    const id = row?.getAttribute?.('data-tour-task-id');
    if (id) next.taskRowId = id;
  }

  const r = el.getBoundingClientRect();
  next.lastCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return next;
}

/** Hiện tạm checkbox chọn thẻ (thường opacity-0 đến khi hover). */
export function revealTourTarget(el, tourId) {
  if (!el) return () => {};
  const cleanups = [];

  if (tourId === 'kanban-card-select' || tourId === 'kanban-card-actions' || tourId === 'kanban-quick-move') {
    const prev = el.style.opacity;
    el.style.opacity = '1';
    cleanups.push(() => { el.style.opacity = prev; });

    const card = el.closest?.('[data-tour="kanban-card"]') || el;
    if (card && card !== el) {
      card.setAttribute('data-tour-spotlight', '1');
      cleanups.push(() => card.removeAttribute('data-tour-spotlight'));
      // Hiện mọi control opacity-0 trong thẻ đang chỉ
      const hiddenKids = [...card.querySelectorAll('.opacity-0')];
      for (const kid of hiddenKids) {
        const p = kid.style.opacity;
        kid.style.opacity = '1';
        cleanups.push(() => { kid.style.opacity = p; });
      }
    }
  }

  if (tourId === 'kanban-card-select') {
    const prev = el.style.opacity;
    el.style.opacity = '1';
    cleanups.push(() => { el.style.opacity = prev; });
  }

  return () => {
    for (const fn of cleanups) {
      try { fn(); } catch { /* ignore */ }
    }
  };
}

export function isTourTargetMostlyVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const vh = window.innerHeight || 1;
  const vw = window.innerWidth || 1;
  const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const visibleW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  // Khối lớn (tab hồ sơ, KPI…) — chỉ cần thấy một phần là đủ, tránh kéo trang lên đầu
  if (r.height > vh * 0.45 || r.width > vw * 0.55) {
    return visibleH >= 48 && visibleW >= 48;
  }
  return visibleH >= Math.min(r.height, 48) * 0.55 && visibleW >= Math.min(r.width, 48) * 0.55;
}

/** Có cần cuộn không — nới lỏng hơn mostlyVisible để tránh nhảy trang giữa các bước. */
export function needsTourScroll(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const vh = window.innerHeight || 1;
  const vw = window.innerWidth || 1;
  const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const visibleW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  if (visibleH >= 36 && visibleW >= 36) return false;
  return true;
}

/**
 * Cuộn tối thiểu trong `main` (không dùng scrollIntoView — hay kéo cả trang lên đầu).
 * Ưu tiên đưa mép trên target vào vùng nhìn (nút/tab nằm phía trên khối lớn).
 */
export function scrollTourTargetGently(el) {
  if (!el || !needsTourScroll(el)) return;
  try {
    const pos = window.getComputedStyle(el).position;
    // Menu/panel cố định — không cuộn trang
    if (pos === 'fixed') return;
  } catch { /* ignore */ }

  const main = document.querySelector('main.overflow-y-auto, main.flex-1.overflow-y-auto');
  const r = el.getBoundingClientRect();
  const margin = 72;
  const focusBottom = Math.min(r.bottom, r.top + Math.min(r.height, 100));

  if (main) {
    const mr = main.getBoundingClientRect();
    let delta = 0;
    if (r.top < mr.top + margin) {
      delta = r.top - (mr.top + margin);
    } else if (focusBottom > mr.bottom - margin) {
      delta = focusBottom - (mr.bottom - margin);
    }
    if (Math.abs(delta) < 4) return;
    main.scrollTop += delta;
    return;
  }

  let delta = 0;
  if (r.top < margin) delta = r.top - margin;
  else if (focusBottom > window.innerHeight - margin) {
    delta = focusBottom - (window.innerHeight - margin);
  }
  if (Math.abs(delta) >= 4) {
    window.scrollBy(0, delta);
  }
}

/** Tab LeadDetail đã active? */
export function isLeadDetailTabActive(tourId) {
  const el = findBestTourTarget(tourId);
  if (!el) return false;
  const cls = String(el.className || '');
  return cls.includes('border-b-2') && cls.includes('border-blue-600');
}

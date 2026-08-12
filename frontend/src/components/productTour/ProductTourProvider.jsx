import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { getTour, CRM_FAMILIAR_TOUR_ID, resolveTourStartIndex } from '../../lib/productTour/tours';
import {
  markTourDone,
  markTourDismissed,
  shouldShowTourHint,
} from '../../lib/productTour/storage';
import {
  resolveTourTarget,
  updateStickyFromTarget,
  revealTourTarget,
  scrollTourTargetGently,
  isLeadDetailTabActive,
  findBestTourTarget,
} from '../../lib/productTour/target';
import TourOverlay from './TourOverlay';
import TourHintChip from './TourHintChip';

const ProductTourContext = createContext(null);

export function useProductTour() {
  return useContext(ProductTourContext);
}

/** Giữ vị trí cuộn main ngay sau click — không restore trễ (tránh kéo lại đầu trang sau bước sau). */
function withPreservedMainScroll(fn) {
  const main = document.querySelector('main.overflow-y-auto, main.flex-1.overflow-y-auto');
  const top = main ? main.scrollTop : window.scrollY;
  const left = main ? main.scrollLeft : window.scrollX;
  try {
    fn();
  } finally {
    const restore = () => {
      if (main) {
        main.scrollTop = top;
        main.scrollLeft = left;
      } else {
        window.scrollTo(left, top);
      }
    };
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
  }
}

function clickTourTarget(tourId) {
  const el = findBestTourTarget(tourId);
  if (!el) return;
  withPreservedMainScroll(() => {
    try {
      el.focus?.({ preventScroll: true });
    } catch { /* ignore */ }
    el.click();
  });
}

function countSelectedKanbanCards() {
  return [...document.querySelectorAll('[data-tour="kanban-card-select"]')]
    .filter((btn) => String(btn.className || '').includes('border-amber-500')).length;
}

/** Chọn tối thiểu `min` thẻ Kanban để hiện thanh thao tác hàng loạt. */
function ensureKanbanCardsSelected(min) {
  const need = Math.max(0, Number(min) || 0);
  if (need <= 0) return;
  const selects = [...document.querySelectorAll('[data-tour="kanban-card-select"]')];
  let count = countSelectedKanbanCards();
  for (const btn of selects) {
    if (count >= need) break;
    if (!String(btn.className || '').includes('border-amber-500')) {
      btn.click();
      count += 1;
    }
  }
}

function toggleIfMissing(panelTourId, triggerTourId) {
  if (!document.querySelector(`[data-tour="${panelTourId}"]`)) {
    clickTourTarget(triggerTourId);
  }
}

function closeIfPresent(panelTourId, triggerTourId) {
  if (document.querySelector(`[data-tour="${panelTourId}"]`)) {
    clickTourTarget(triggerTourId);
  }
}

/** Đóng panel bộ lọc — không dùng `click() || …` vì click() luôn trả undefined. */
function closeCrmFilterPanel() {
  if (!document.querySelector('[data-tour="crm-filter-panel"]')) return;
  const closeBtn = document.querySelector('[data-tour="crm-filter-close"]');
  if (closeBtn) {
    closeBtn.click();
    return;
  }
  clickTourTarget('crm-filter');
}

function stepNeedsFilterPanel(step) {
  const t = step?.target;
  return t === 'crm-filter-panel'
    || t === 'crm-filter-tabs'
    || step?.ensureOpen === 'crm-filter-panel';
}

function stepNeedsViewModeMenu(step) {
  return step?.target === 'crm-view-mode-menu'
    || step?.ensureOpen === 'crm-view-mode-menu';
}

function stepNeedsKanbanSettingsMenu(step) {
  return step?.target === 'crm-kanban-settings-menu'
    || step?.ensureOpen === 'crm-kanban-settings-menu';
}

function stepNeedsEventModal(step) {
  const t = String(step?.target || '');
  return t.startsWith('event-create')
    || step?.ensureOpen === 'lead-event-modal'
    || step?.ensureOpen === 'events-create-modal';
}

function stepNeedsAssignFilterPanel(step) {
  return step?.target === 'assign-filter-panel'
    || step?.ensureOpen === 'assign-filter-panel';
}

function stepNeedsAssignCreateModal(step) {
  const t = String(step?.target || '');
  return t.startsWith('assign-create')
    || step?.ensureOpen === 'assign-create-modal';
}

function closeAssignFilterPanel() {
  if (!document.querySelector('[data-tour="assign-filter-panel"]')) return;
  const closeBtn = document.querySelector('[data-tour="assign-filter-close"]');
  if (closeBtn) {
    closeBtn.click();
    return;
  }
  clickTourTarget('assign-filter');
}

function clickPipelineTab(kind) {
  const byAttr = kind === 'deal' ? 'pipeline-tab-deal' : 'pipeline-tab-lead';
  const el = findBestTourTarget(byAttr);
  if (el) {
    el.click();
    return;
  }
  const root = document.querySelector('[data-tour="pipeline-tabs"]');
  if (!root) return;
  const needle = kind === 'deal' ? 'deal' : 'lead';
  const btn = [...root.querySelectorAll('button')].find((b) =>
    String(b.textContent || '').toLowerCase().includes(needle),
  );
  btn?.click();
}

const LEAD_TAB_ENSURES = new Set([
  'lead-tab-tasks',
  'lead-tab-documents',
  'lead-tab-notes',
  'lead-tab-drive',
  'lead-tab-shared',
  'lead-tab-orders',
  'lead-tab-comments',
  'lead-tab-team',
  'lead-tab-voice',
  'lead-tab-facebook',
  'lead-tab-zalo',
  'lead-tab-scores',
]);

function runStepChrome(step) {
  if (step?.ensureClose === 'app-switcher') {
    window.dispatchEvent(new CustomEvent('product-tour:close-app-switcher'));
  }
  if (step?.ensureClose === 'new-lead-modal') {
    document.querySelector('[data-tour="new-lead-modal-close"]')?.click();
  }
  if (step?.ensureClose === 'new-deal-modal') {
    document.querySelector('[data-tour="new-deal-modal-close"]')?.click();
  }
  if (step?.ensureClose === 'crm-bulk-selection') {
    document.querySelector('[data-tour="crm-bulk-clear"]')?.click();
  }
  if (step?.ensureClose === 'event-create-modal') {
    document.querySelector('[data-tour="event-create-modal-close"]')?.click();
  }
  if (step?.ensureClose === 'assign-create-modal') {
    document.querySelector('[data-tour="assign-create-modal-close"]')?.click();
  }
  if (step?.ensureClose === 'assign-filter-panel') {
    closeAssignFilterPanel();
  }

  // Tự đóng panel/menu không thuộc bước hiện tại (tránh đè / sai vị trí)
  if (!stepNeedsFilterPanel(step)) closeCrmFilterPanel();
  if (!stepNeedsAssignFilterPanel(step)) closeAssignFilterPanel();
  if (!stepNeedsViewModeMenu(step)) closeIfPresent('crm-view-mode-menu', 'crm-view-mode-more');
  if (!stepNeedsKanbanSettingsMenu(step)) {
    closeIfPresent('crm-kanban-settings-menu', 'crm-kanban-settings');
  }
  if (!stepNeedsEventModal(step) && document.querySelector('[data-tour="event-create-modal"]')) {
    document.querySelector('[data-tour="event-create-modal-close"]')?.click();
  }
  if (!stepNeedsAssignCreateModal(step) && document.querySelector('[data-tour="assign-create-modal"]')) {
    document.querySelector('[data-tour="assign-create-modal-close"]')?.click();
  }

  const ensureOpen = step?.ensureOpen;
  if (ensureOpen === 'app-switcher') {
    window.dispatchEvent(new CustomEvent('product-tour:open-app-switcher'));
  } else if (ensureOpen === 'crm-overview-menu') {
    window.dispatchEvent(new CustomEvent('product-tour:open-menu-group', {
      detail: { groupId: 'crm-overview' },
    }));
  } else if (ensureOpen === 'crm-lead-tab') {
    clickPipelineTab('lead');
  } else if (ensureOpen === 'crm-deal-tab') {
    clickPipelineTab('deal');
  } else if (ensureOpen === 'new-lead-modal') {
    if (!document.querySelector('[data-tour="new-lead-modal"]')) {
      clickPipelineTab('lead');
      findBestTourTarget('add-lead')?.click();
    }
  } else if (ensureOpen === 'new-deal-modal') {
    if (!document.querySelector('[data-tour="new-deal-modal"]')) {
      clickPipelineTab('deal');
      window.setTimeout(() => findBestTourTarget('add-lead')?.click(), 80);
    }
  } else if (ensureOpen === 'crm-select-cards-1') {
    ensureKanbanCardsSelected(1);
  } else if (ensureOpen === 'crm-select-cards-2') {
    ensureKanbanCardsSelected(2);
  } else if (ensureOpen === 'crm-open-lead-detail') {
    if (!String(window.location.pathname || '').startsWith('/crm/leads/')) {
      window.dispatchEvent(new CustomEvent('product-tour:open-lead-detail'));
    }
  } else if (ensureOpen === 'crm-filter-panel') {
    toggleIfMissing('crm-filter-panel', 'crm-filter');
  } else if (ensureOpen === 'crm-view-mode-menu') {
    closeCrmFilterPanel();
    closeIfPresent('crm-kanban-settings-menu', 'crm-kanban-settings');
    toggleIfMissing('crm-view-mode-menu', 'crm-view-mode-more');
  } else if (ensureOpen === 'crm-kanban-settings-menu') {
    closeCrmFilterPanel();
    closeIfPresent('crm-view-mode-menu', 'crm-view-mode-more');
    toggleIfMissing('crm-kanban-settings-menu', 'crm-kanban-settings');
  } else if (LEAD_TAB_ENSURES.has(ensureOpen)) {
    // Event → LeadDetail.setActiveTab (ổn định hơn click xuyên overlay)
    window.dispatchEvent(new CustomEvent('product-tour:set-lead-tab', {
      detail: { tourId: ensureOpen },
    }));
    // Fallback DOM click nếu event chưa được gắn (HMR / trang khác)
    if (!isLeadDetailTabActive(ensureOpen)) {
      clickTourTarget(ensureOpen);
    }
  } else if (ensureOpen === 'crm-task-expand-notes') {
    window.dispatchEvent(new CustomEvent('product-tour:set-lead-tab', {
      detail: { tourId: 'lead-tab-tasks' },
    }));
    if (!isLeadDetailTabActive('lead-tab-tasks')) {
      clickTourTarget('lead-tab-tasks');
    }
    // Mở khung ghi chú & file nếu chưa expand
    if (!document.querySelector('[data-tour="crm-task-notes-panel"]')) {
      const btn = findBestTourTarget('crm-task-notes-files');
      btn?.click();
    }
  } else if (ensureOpen === 'lead-event-modal') {
    if (!document.querySelector('[data-tour="event-create-modal"]')) {
      window.dispatchEvent(new CustomEvent('product-tour:open-lead-event-modal'));
      findBestTourTarget('lead-create-event')?.click();
    }
  } else if (ensureOpen === 'events-create-modal') {
    if (!document.querySelector('[data-tour="event-create-modal"]')) {
      window.dispatchEvent(new CustomEvent('product-tour:open-events-create-modal'));
      findBestTourTarget('events-create-btn')?.click();
    }
  } else if (ensureOpen === 'events-view-calendar') {
    window.dispatchEvent(new CustomEvent('product-tour:set-events-view', {
      detail: { view: 'calendar' },
    }));
    findBestTourTarget('events-view-calendar')?.click();
  } else if (ensureOpen === 'assign-tab-assignments') {
    window.dispatchEvent(new CustomEvent('product-tour:set-assign-tab', {
      detail: { tab: 'assignments' },
    }));
    findBestTourTarget('assign-tab-assignments')?.click();
  } else if (ensureOpen === 'assign-tab-private') {
    window.dispatchEvent(new CustomEvent('product-tour:set-assign-tab', {
      detail: { tab: 'private' },
    }));
    findBestTourTarget('assign-tab-private')?.click();
  } else if (ensureOpen === 'assign-view-kanban') {
    window.dispatchEvent(new CustomEvent('product-tour:set-assign-tab', {
      detail: { tab: 'assignments' },
    }));
    window.dispatchEvent(new CustomEvent('product-tour:set-assign-view', {
      detail: { view: 'kanban' },
    }));
    findBestTourTarget('assign-tab-assignments')?.click();
    findBestTourTarget('assign-view-kanban')?.click();
  } else if (ensureOpen === 'assign-filter-panel') {
    closeIfPresent('crm-view-mode-menu', 'crm-view-mode-more');
    toggleIfMissing('assign-filter-panel', 'assign-filter');
  } else if (ensureOpen === 'assign-create-modal') {
    closeAssignFilterPanel();
    closeIfPresent('crm-view-mode-menu', 'crm-view-mode-more');
    window.dispatchEvent(new CustomEvent('product-tour:set-assign-tab', {
      detail: { tab: 'assignments' },
    }));
    findBestTourTarget('assign-tab-assignments')?.click();
    if (!document.querySelector('[data-tour="assign-create-modal"]')) {
      findBestTourTarget('assign-create-btn')?.click();
    }
  }
}

function pathMatches(pathname, waitForPath) {
  if (!waitForPath) return true;
  const path = String(pathname || '');
  const prefixes = Array.isArray(waitForPath) ? waitForPath : [waitForPath];
  return prefixes.some((p) => path.startsWith(p));
}

function rectsEqual(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;
}

export default function ProductTourProvider({ children }) {
  const location = useLocation();
  const [activeTourId, setActiveTourId] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const [showHintChip, setShowHintChip] = useState(false);
  const advancingRef = useRef(false);
  const stickyRef = useRef({ cardId: null, taskRowId: null, lastCenter: null });
  const revealCleanupRef = useRef(null);

  const tour = activeTourId ? getTour(activeTourId) : null;
  const step = tour?.steps?.[stepIndex] || null;
  const isLast = !!(tour && stepIndex >= tour.steps.length - 1);

  const stopTour = useCallback((opts = {}) => {
    const { completed = false, dismissHint = !completed } = opts;
    if (revealCleanupRef.current) {
      revealCleanupRef.current();
      revealCleanupRef.current = null;
    }
    stickyRef.current = { cardId: null, taskRowId: null, lastCenter: null };
    setActiveTourId((id) => {
      if (id) {
        if (completed) markTourDone(id);
        else if (dismissHint) markTourDismissed(id);
      }
      return null;
    });
    setStepIndex(0);
    setTargetRect(null);
    setMissing(false);
    setShowHintChip(false);
  }, []);

  const startTour = useCallback((id, opts = {}) => {
    const def = getTour(id);
    if (!def?.steps?.length) {
      console.warn('[product-tour] Không tìm thấy tour:', id);
      return;
    }
    let idx = 0;
    if (typeof opts.startIndex === 'number' && opts.startIndex >= 0) {
      idx = Math.min(opts.startIndex, def.steps.length - 1);
    } else if (opts.preferCurrentPath) {
      idx = resolveTourStartIndex(id, location.pathname);
    }
    stickyRef.current = { cardId: null, taskRowId: null, lastCenter: null };
    setShowHintChip(false);
    setActiveTourId(id);
    setStepIndex(idx);
    setTargetRect(null);
    setMissing(false);
  }, [location.pathname]);

  // Cho phép mở tour từ nút ngoài context / HMR (LeadDetail → event)
  useEffect(() => {
    const onStart = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      startTour(id, {
        preferCurrentPath: !!e?.detail?.preferCurrentPath,
        startIndex: e?.detail?.startIndex,
      });
    };
    window.addEventListener('product-tour:start', onStart);
    return () => window.removeEventListener('product-tour:start', onStart);
  }, [startTour]);

  const next = useCallback(() => {
    if (!tour) return;
    const current = tour.steps[stepIndex];
    if (stepIndex >= tour.steps.length - 1) {
      stopTour({ completed: true });
      return;
    }
    // Rời bước «bấm thẻ» mà chưa vào hồ sơ → tự mở chi tiết
    if (
      current?.target === 'kanban-card'
      && !String(location.pathname || '').startsWith('/crm/leads/')
    ) {
      window.dispatchEvent(new CustomEvent('product-tour:open-lead-detail'));
    }
    // Giữ rect cũ đến khi đo xong target mới — tránh chớp (full-dim + tooltip nhảy giữa màn hình)
    setStepIndex((i) => i + 1);
    setMissing(false);
  }, [tour, stepIndex, stopTour, location.pathname]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (shouldShowTourHint(CRM_FAMILIAR_TOUR_ID)) setShowHintChip(true);
    }, 1000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    let tries = 0;
    const maxTries = step.optional ? 24 : 70;
    let scrolledForStep = false;
    let autoSkipped = false;

    if (revealCleanupRef.current) {
      revealCleanupRef.current();
      revealCleanupRef.current = null;
    }

    runStepChrome(step);
    // second pass after tab/modal / bỏ chọn hàng loạt (React cập nhật async)
    const chromeRetry = window.setTimeout(() => runStepChrome(step), 120);
    const chromeRetry2 = window.setTimeout(() => runStepChrome(step), 280);
    const chromeRetry3 = window.setTimeout(() => runStepChrome(step), 480);

    const updateRect = () => {
      if (cancelled) return 'cancel';
      // Chờ đúng route — không tính vào số lần thử (tránh báo thiếu khi đang navigate)
      if (!pathMatches(location.pathname, step.waitForPath)) return 'wait-path';
      const el = resolveTourTarget(step.target, stickyRef.current);
      if (!el) return 'missing';

      if (revealCleanupRef.current) {
        revealCleanupRef.current();
        revealCleanupRef.current = null;
      }
      revealCleanupRef.current = revealTourTarget(el, step.target);
      stickyRef.current = updateStickyFromTarget(step.target, el, stickyRef.current);

      // Cuộn tối thiểu trong main — tránh scrollIntoView kéo trang từ bước dưới lên đầu
      if (!scrolledForStep) {
        scrolledForStep = true;
        const skipScroll = step.scroll === false
          || String(step.target || '').startsWith('lead-tab-')
          || step.target === 'lead-detail-tabs';
        if (!skipScroll) {
          scrollTourTargetGently(el);
        }
      }
      const nextRect = el.getBoundingClientRect();
      // Bỏ qua đo 0×0 / ngoài màn hình quá xa khi vừa remount
      if (nextRect.width < 2 || nextRect.height < 2) return 'missing';
      setTargetRect((prev) => {
        const nextVal = {
          top: nextRect.top,
          left: nextRect.left,
          width: nextRect.width,
          height: nextRect.height,
          bottom: nextRect.bottom,
          right: nextRect.right,
        };
        if (rectsEqual(prev, nextVal)) return prev;
        return nextVal;
      });
      setMissing(false);
      return 'ok';
    };

    const tick = () => {
      if (cancelled || autoSkipped) return;
      const status = updateRect();
      if (status === 'ok' || status === 'cancel') return;
      if (status === 'wait-path') {
        window.setTimeout(tick, 80);
        return;
      }
      tries += 1;
      if (tries >= maxTries) {
        // Bước tùy chọn (tab FB/Zalo, nút theo quyền…) — bỏ qua tự động
        if (step.optional) {
          autoSkipped = true;
          if (!advancingRef.current) {
            advancingRef.current = true;
            window.setTimeout(() => {
              advancingRef.current = false;
              next();
            }, 40);
          }
          return;
        }
        setMissing(true);
        // Chỉ xóa spotlight khi chắc không tìm thấy — tránh chớp lúc đổi bước
        setTargetRect(null);
        return;
      }
      window.setTimeout(tick, 70);
    };

    // Đợi 1 frame sau ensureClose (thanh vàng biến mất → thẻ dồn lên)
    window.requestAnimationFrame(() => {
      if (!cancelled) tick();
    });
    // Đo lại sau khi tab/panel mở — không reset scrolledForStep (tránh cuộn lần 2)
    const lateMeasure = window.setTimeout(() => {
      if (!cancelled) updateRect();
    }, 360);
    const lateMeasure2 = window.setTimeout(() => {
      if (!cancelled) updateRect();
    }, 600);

    // Remeasure liên tục — panel/modal/kanban đổi layout
    const remeasureIv = window.setInterval(() => {
      if (!cancelled) updateRect();
    }, 120);

    const onLayout = () => { updateRect(); };
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      cancelled = true;
      window.clearTimeout(chromeRetry);
      window.clearTimeout(chromeRetry2);
      window.clearTimeout(chromeRetry3);
      window.clearTimeout(lateMeasure);
      window.clearTimeout(lateMeasure2);
      window.clearInterval(remeasureIv);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      if (revealCleanupRef.current) {
        revealCleanupRef.current();
        revealCleanupRef.current = null;
      }
    };
  }, [step, stepIndex, location.pathname, next]);

  useEffect(() => {
    if (!step || step.advanceOn !== 'target-click') return undefined;
    const handler = (e) => {
      const hit = e.target?.closest?.(`[data-tour="${step.target}"]`);
      if (!hit) return;
      // Chỉ nhận click đúng phần tử đang spotlight (tránh thẻ khác cùng data-tour)
      const preferred = resolveTourTarget(step.target, stickyRef.current);
      if (preferred && preferred !== hit && !preferred.contains(hit) && !hit.contains(preferred)) {
        return;
      }
      if (advancingRef.current) return;
      advancingRef.current = true;
      stickyRef.current = updateStickyFromTarget(step.target, preferred || hit, stickyRef.current);
      // Click xuyên overlay đôi khi không kích hoạt onClick thẻ — mở hồ sơ tường minh
      if (
        step.target === 'kanban-card'
        && !String(window.location.pathname || '').startsWith('/crm/leads/')
      ) {
        window.dispatchEvent(new CustomEvent('product-tour:open-lead-detail'));
      }
      window.setTimeout(() => {
        advancingRef.current = false;
        next();
      }, 180);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [step, next]);

  useEffect(() => {
    if (!activeTourId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') stopTour({ completed: false, dismissHint: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTourId, stopTour]);

  const value = useMemo(() => ({
    startTour,
    stopTour,
    activeTourId,
    isTourActive: !!activeTourId,
  }), [startTour, stopTour, activeTourId]);

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {tour && step && (
        <TourOverlay
          step={step}
          stepIndex={stepIndex}
          total={tour.steps.length}
          rect={targetRect}
          missing={missing}
          onNext={next}
          onSkip={() => stopTour({ completed: false, dismissHint: true })}
          isLast={isLast}
        />
      )}
      {showHintChip && !activeTourId && (
        <TourHintChip
          onStart={() => startTour(CRM_FAMILIAR_TOUR_ID)}
          onDismiss={() => {
            markTourDismissed(CRM_FAMILIAR_TOUR_ID);
            setShowHintChip(false);
          }}
        />
      )}
    </ProductTourContext.Provider>
  );
}

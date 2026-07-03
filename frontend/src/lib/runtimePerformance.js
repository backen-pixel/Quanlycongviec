/**
 * Lightweight runtime tier for adaptive quality (background WebGL, etc.).
 * @returns {'low' | 'medium' | 'high'}
 */
export function getRuntimePerformanceTier() {
  if (typeof window === 'undefined') return 'medium';

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return 'low';
  }

  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;

  if (memory <= 4 || cores <= 4 || dpr >= 2.5) return 'low';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'medium';
}

/**
 * Defer non-critical work until the browser is idle.
 * @param {() => void} fn
 * @param {{ timeout?: number }} [opts]
 */
export function runWhenIdle(fn, opts = {}) {
  const timeout = opts.timeout ?? 900;
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(fn, { timeout });
  }
  return window.setTimeout(fn, Math.min(timeout, 200));
}

/**
 * @param {number} id
 */
export function cancelIdle(id) {
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

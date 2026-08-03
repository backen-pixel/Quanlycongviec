const DONE_PREFIX = 'product_tour_done:';
const DISMISSED_PREFIX = 'product_tour_dismissed:';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function isTourDone(tourId) {
  return safeGet(`${DONE_PREFIX}${tourId}`) === '1';
}

export function markTourDone(tourId) {
  safeSet(`${DONE_PREFIX}${tourId}`, '1');
  try {
    localStorage.removeItem(`${DISMISSED_PREFIX}${tourId}`);
  } catch {
    /* ignore */
  }
}

export function isTourDismissed(tourId) {
  return safeGet(`${DISMISSED_PREFIX}${tourId}`) === '1';
}

export function markTourDismissed(tourId) {
  safeSet(`${DISMISSED_PREFIX}${tourId}`, '1');
}

export function shouldShowTourHint(tourId) {
  return !isTourDone(tourId) && !isTourDismissed(tourId);
}

/** @param {string[]} tourIds */
export function countDoneMissions(tourIds) {
  const ids = Array.isArray(tourIds) ? tourIds : [];
  const done = ids.filter((id) => isTourDone(id)).length;
  return { done, total: ids.length };
}

/** Kênh badge sidebar — đồng bộ với backend `notify:badge`. */
export const BADGE_CHANNELS = ['social', 'assignments', 'updates', 'events'];

export function dispatchBadgeRefresh(channel) {
  if (!channel) return;
  try {
    window.dispatchEvent(new CustomEvent(`badge:refresh:${channel}`));
  } catch {
    /* ignore */
  }
}

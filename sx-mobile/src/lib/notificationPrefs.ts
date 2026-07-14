import { api } from '../api/client';

type Prefs = {
  comment_show_on_screen?: boolean;
  comment_added?: boolean;
  [key: string]: unknown;
};

let cached: Prefs | null = null;
let inflight: Promise<Prefs> | null = null;

/** Fetch /push/preferences (cached). Mặc định comment_show_on_screen = true. */
export async function fetchNotificationPrefs(force = false): Promise<Prefs> {
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;
  inflight = api
    .get('/push/preferences')
    .then((r) => {
      cached = (r.data && typeof r.data === 'object' ? r.data : {}) as Prefs;
      return cached;
    })
    .catch(() => {
      cached = { comment_show_on_screen: true, comment_added: true };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function isCommentShowOnScreenEnabled(prefs?: Prefs | null): boolean {
  const p = prefs ?? cached;
  if (!p) return true;
  return p.comment_show_on_screen !== false;
}

export function invalidateNotificationPrefsCache() {
  cached = null;
}

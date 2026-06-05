import {
  getCustomCallRingtone,
} from './callRingtoneIdb';
import {
  getCallRingtoneVolumePercent,
  getUseCustomCallRingtone,
} from './callRingtonePrefs';
import {
  fetchGlobalCallRingtoneConfig,
  getCachedGlobalCallRingtone,
  resolveSystemCallRingtonePlayUrl,
} from './callRingtoneServer';

const MAX_BYTES = 8 * 1024 * 1024;

let blobUrlCache = null;
let activePlayback = null;

export function invalidateCallRingtoneCache() {
  if (blobUrlCache) {
    try { URL.revokeObjectURL(blobUrlCache); } catch { /* noop */ }
    blobUrlCache = null;
  }
}

export function stopCallRingtone() {
  if (activePlayback) {
    try { activePlayback.pause(); } catch { /* noop */ }
    activePlayback = null;
  }
}

async function resolveBlobUrl() {
  const stored = await getCustomCallRingtone();
  if (!stored?.buffer?.byteLength) return null;
  if (stored.buffer.byteLength > MAX_BYTES) return null;
  invalidateCallRingtoneCache();
  const mime = stored.mime || 'audio/mpeg';
  blobUrlCache = URL.createObjectURL(new Blob([stored.buffer], { type: mime }));
  return blobUrlCache;
}

async function resolvePlayUrl() {
  if (getUseCustomCallRingtone()) {
    const local = await resolveBlobUrl();
    if (local) return local;
  }
  return resolveSystemCallRingtonePlayUrl();
}

function playUrlLoop(url, volPct, playToneFallback, variant) {
  if (volPct <= 0) {
    return { pause: () => { stopCallRingtone(); } };
  }
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = Math.min(1, Math.max(0.05, volPct / 100));
  const ctrl = {
    pause: () => {
      try {
        audio.pause();
        audio.src = '';
      } catch { /* noop */ }
      if (activePlayback === ctrl) activePlayback = null;
    },
  };
  activePlayback = ctrl;
  audio.play().catch((err) => {
    console.warn('[call-ringtone] Không phát được file:', url, err?.message || err);
    ctrl.pause();
    const fb = playToneFallback?.(variant);
    if (fb) activePlayback = fb;
  });
  return ctrl;
}

/**
 * Phát nhạc chuông cuộc gọi (lặp) hoặc fallback Web Audio.
 * @param {'ringtone'|'ringback'} variant
 * @param {(variant: string) => { pause: () => void } | null} playToneFallback
 */
export async function playCallRingtone(variant, playToneFallback) {
  stopCallRingtone();

  const url = await resolvePlayUrl();
  if (url) {
    const volPct = getCallRingtoneVolumePercent();
    return playUrlLoop(url, volPct, playToneFallback, variant);
  }

  const fb = playToneFallback?.(variant);
  if (fb) activePlayback = fb;
  return fb ?? null;
}

/** Nghe thử (không lặp, tự dừng sau duration hoặc 8s). */
/** Nghe thử nhạc mặc định hệ thống (bỏ qua ghi đè cá nhân). */
export async function previewGlobalCallRingtone(playToneFallback) {
  stopCallRingtone();
  const url = await resolveSystemCallRingtonePlayUrl();
  if (!url) {
    const fb = playToneFallback?.('ringtone');
    if (fb) {
      activePlayback = fb;
      window.setTimeout(() => fb.pause(), 4000);
    }
    return;
  }
  const volPct = getCallRingtoneVolumePercent();
  const audio = new Audio(url);
  audio.loop = false;
  audio.volume = Math.min(1, Math.max(0.05, (volPct || 85) / 100));
  const ctrl = {
    pause: () => {
      try {
        audio.pause();
        audio.src = '';
      } catch { /* noop */ }
      if (activePlayback === ctrl) activePlayback = null;
    },
  };
  activePlayback = ctrl;
  const stopAfter = () => {
    window.clearTimeout(tid);
    ctrl.pause();
  };
  const tid = window.setTimeout(stopAfter, 8000);
  audio.onended = stopAfter;
  audio.play().catch(() => {
    stopAfter();
    const fb = playToneFallback?.('ringtone');
    if (fb) {
      activePlayback = fb;
      window.setTimeout(() => fb.pause(), 4000);
    }
  });
}

export async function previewCallRingtone(playToneFallback) {
  stopCallRingtone();
  const url = await resolvePlayUrl();
  if (url) {
    const volPct = getCallRingtoneVolumePercent();
    const audio = new Audio(url);
    audio.loop = false;
    audio.volume = Math.min(1, Math.max(0.05, (volPct || 85) / 100));
    const ctrl = {
      pause: () => {
        try {
          audio.pause();
          audio.src = '';
        } catch { /* noop */ }
        if (activePlayback === ctrl) activePlayback = null;
      },
    };
    activePlayback = ctrl;
    const stopAfter = () => {
      window.clearTimeout(tid);
      ctrl.pause();
    };
    const tid = window.setTimeout(stopAfter, 8000);
    audio.onended = stopAfter;
    audio.play().catch(() => {
      stopAfter();
      const fb = playToneFallback?.('ringtone');
      if (fb) {
        activePlayback = fb;
        window.setTimeout(() => fb.pause(), 4000);
      }
    });
    return;
  }
  const fb = playToneFallback?.('ringtone');
  if (fb) {
    activePlayback = fb;
    window.setTimeout(() => fb.pause(), 4000);
  }
}

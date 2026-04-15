import { getNotificationPrefsCache, isNotificationTypeEnabled } from './notificationPrefsCache';
import { getCustomNotificationSoundBuffer } from './notificationSoundIdb';

const MAX_PLAY_SEC = 15;
const DEFAULT_URL = '/notification.wav';
/** Hệ số khuếch đại gốc; nhân thêm `sound_volume_percent` / 100 */
const GAIN_BASE = 3.2;

/** Nhiều thông báo cùng lúc: chỉ phát chuông tối đa một lần trong khoảng này (tránh chồng âm). */
const BELL_MIN_INTERVAL_MS = 1400;

let lastBellAt = 0;

let audioContext = null;
let defaultDecoded = null;
let defaultDecodePromise = null;
let customDecoded = null;
let customDecodePromise = null;

export function invalidateNotificationSoundCache() {
  defaultDecoded = null;
  defaultDecodePromise = null;
  customDecoded = null;
  customDecodePromise = null;
}

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

async function ensureDefaultDecoded(ctx) {
  if (defaultDecoded) return defaultDecoded;
  if (!defaultDecodePromise) {
    defaultDecodePromise = (async () => {
      try {
        const res = await fetch(DEFAULT_URL);
        const raw = await res.arrayBuffer();
        defaultDecoded = await ctx.decodeAudioData(raw.slice(0));
        return defaultDecoded;
      } catch {
        return null;
      }
    })();
  }
  return defaultDecodePromise;
}

async function ensureCustomDecoded(ctx) {
  if (customDecoded) return customDecoded;
  if (!customDecodePromise) {
    customDecodePromise = (async () => {
      try {
        const ab = await getCustomNotificationSoundBuffer();
        if (!ab) return null;
        customDecoded = await ctx.decodeAudioData(ab.slice(0));
        return customDecoded;
      } catch {
        return null;
      }
    })();
  }
  const out = await customDecodePromise;
  if (!out) customDecodePromise = null;
  return out;
}

async function getBufferForPlay() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const p = getNotificationPrefsCache();
  if (p.use_custom_sound) {
    const c = await ensureCustomDecoded(ctx);
    if (c) return { ctx, buffer: c };
  }
  const d = await ensureDefaultDecoded(ctx);
  return d ? { ctx, buffer: d } : null;
}

/**
 * Phát chuông (tối đa 15 giây), âm lượng theo cài đặt.
 * @param {{ skipThrottle?: boolean }} [opts] — `skipThrottle: true` khi «Nghe thử» trong cài đặt (luôn phát).
 */
export async function playLoudNotificationSound(opts = {}) {
  const p = getNotificationPrefsCache();
  const volPct = Number(p.sound_volume_percent);
  const vol = Number.isFinite(volPct) ? Math.min(1.5, Math.max(0, volPct / 100)) : 1;
  if (vol <= 0) return;

  if (!opts.skipThrottle) {
    const now = Date.now();
    if (now - lastBellAt < BELL_MIN_INTERVAL_MS) return;
    lastBellAt = now;
  }

  try {
    const ready = await getBufferForPlay();
    if (ready?.ctx && ready.buffer) {
      const { ctx, buffer } = ready;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = GAIN_BASE * vol;
      source.connect(gain).connect(ctx.destination);

      let offset = 0;
      let playDur = Math.min(MAX_PLAY_SEC, buffer.duration);
      if (p.use_custom_sound) {
        const startRaw = Number(p.custom_sound_start_sec);
        const start = Number.isFinite(startRaw)
          ? Math.max(0, Math.min(startRaw, Math.max(0, buffer.duration - 0.05)))
          : 0;
        const maxFromStart = Math.min(MAX_PLAY_SEC, Math.max(0.05, buffer.duration - start));
        const lenRaw = Number(p.custom_sound_play_sec);
        const lenRequested = Number.isFinite(lenRaw) ? lenRaw : MAX_PLAY_SEC;
        const playLen = Math.max(0.05, Math.min(maxFromStart, Math.min(MAX_PLAY_SEC, lenRequested)));
        offset = start;
        playDur = playLen;
      }

      source.start(0, offset, playDur);
      return;
    }
  } catch {
    /* fallback */
  }

  try {
    const audio = new Audio(DEFAULT_URL);
    audio.volume = Math.min(1, vol);
    const cap = () => {
      if (audio.currentTime >= MAX_PLAY_SEC) {
        audio.pause();
        audio.removeEventListener('timeupdate', cap);
      }
    };
    audio.addEventListener('timeupdate', cap);
    await audio.play();
  } catch {
    /* ignore */
  }
}

/**
 * Chỉ phát chuông (không đọc giọng).
 * @param {{ type?: string }} [opts] — nếu có `type`, tôn trọng công tắc «Loại thông báo».
 */
export async function alertIncomingNotification(opts = {}) {
  const p = getNotificationPrefsCache();
  if (p.sound === false) return;
  if (opts.type && !isNotificationTypeEnabled(opts.type)) return;

  const volPct = Number(p.sound_volume_percent);
  if (!Number.isFinite(volPct) || volPct > 0) {
    await playLoudNotificationSound();
  }
}

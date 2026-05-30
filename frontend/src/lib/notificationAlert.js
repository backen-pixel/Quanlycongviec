import { getNotificationPrefsCache, isNotificationTypeEnabled } from './notificationPrefsCache';
import { getCustomNotificationSoundBuffer } from './notificationSoundIdb';
import { getPresetById } from './notificationPresets';

const MAX_PLAY_SEC = 15;

/** `public/notification.wav` — tôn trọng `base` khi deploy thư mục con. */
function resolvedDefaultWavUrl() {
  let base = import.meta.env.BASE_URL || '/';
  if (!base.endsWith('/')) base += '/';
  return `${base}notification.wav`;
}

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

/** Dừng Web Speech API nếu đang phát (tránh «giọng đọc» chồng với thông báo). */
export function cancelNotificationSpeech() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
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
        const res = await fetch(resolvedDefaultWavUrl());
        if (!res.ok) return null;
        const raw = await res.arrayBuffer();
        if (!raw?.byteLength) return null;
        defaultDecoded = await ctx.decodeAudioData(raw.slice(0));
        return defaultDecoded;
      } catch {
        return null;
      }
    })();
  }
  const out = await defaultDecodePromise;
  if (!out) defaultDecodePromise = null;
  return out;
}

/**
 * Phát preset (chuông tổng hợp). Bỏ qua nếu không có Web Audio.
 * @param {string} presetId
 * @param {number} vol — 0..1.5 hệ số âm lượng tổng từ prefs.
 * @returns {boolean} true nếu đã lên lịch phát.
 */
export function playPresetBell(presetId, vol) {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const preset = getPresetById(presetId);
  if (!preset || typeof preset.play !== 'function') return false;

  const master = ctx.createGain();
  master.gain.value = Math.min(1.2, Math.max(0, GAIN_BASE * vol * 0.45));
  master.connect(ctx.destination);
  try {
    preset.play(ctx, master);
    return true;
  } catch {
    return false;
  }
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

  cancelNotificationSpeech();

  if (!opts.skipThrottle) {
    const now = Date.now();
    if (now - lastBellAt < BELL_MIN_INTERVAL_MS) return;
    lastBellAt = now;
  }

  // Nếu user đã upload file tùy chỉnh — ưu tiên dùng file đó.
  if (p.use_custom_sound) {
    try {
      const ready = await getBufferForPlay();
      if (ready?.ctx && ready.buffer) {
        const { ctx, buffer } = ready;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = GAIN_BASE * vol;
        source.connect(gain).connect(ctx.destination);

        const startRaw = Number(p.custom_sound_start_sec);
        const start = Number.isFinite(startRaw)
          ? Math.max(0, Math.min(startRaw, Math.max(0, buffer.duration - 0.05)))
          : 0;
        const maxFromStart = Math.min(MAX_PLAY_SEC, Math.max(0.05, buffer.duration - start));
        const lenRaw = Number(p.custom_sound_play_sec);
        const lenRequested = Number.isFinite(lenRaw) ? lenRaw : MAX_PLAY_SEC;
        const playLen = Math.max(0.05, Math.min(maxFromStart, Math.min(MAX_PLAY_SEC, lenRequested)));

        source.start(0, start, playLen);
        return;
      }
    } catch {
      /* fallback xuống preset bên dưới */
    }
  }

  // Phát preset tổng hợp (mặc định 'classic').
  if (playPresetBell(p.preset_id || 'classic', vol)) return;

  // Fallback cuối: notification.wav nếu có; nếu không, oscillator đơn giản.
  try {
    const ready = await getBufferForPlay();
    if (ready?.ctx && ready.buffer) {
      const { ctx, buffer } = ready;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = GAIN_BASE * vol;
      source.connect(gain).connect(ctx.destination);
      source.start(0, 0, Math.min(MAX_PLAY_SEC, buffer.duration));
      return;
    }
  } catch {
    /* ignore */
  }

  try {
    const audio = new Audio(resolvedDefaultWavUrl());
    audio.volume = Math.min(1, vol);
    await audio.play();
  } catch {
    /* ignore */
  }
}

/**
 * Chỉ phát chuông (không đọc giọng).
 * @param {{ type?: string, entityType?: string|null }} [opts] — `type` + `entityType` để tôn trọng công tắc theo module.
 */
export async function alertIncomingNotification(opts = {}) {
  const p = getNotificationPrefsCache();
  if (p.sound === false) return;
  if (opts.type && !isNotificationTypeEnabled(opts.type, opts.entityType)) return;

  cancelNotificationSpeech();

  const volPct = Number(p.sound_volume_percent);
  if (!Number.isFinite(volPct) || volPct > 0) {
    await playLoudNotificationSound();
  }
}

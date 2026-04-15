import { getNotificationPrefsCache } from './notificationPrefsCache';
import { getCustomNotificationSoundBuffer } from './notificationSoundIdb';

const MAX_PLAY_SEC = 15;
const DEFAULT_URL = '/notification.wav';
/** Hệ số khuếch đại gốc; nhân thêm `sound_volume_percent` / 100 */
const GAIN_BASE = 3.2;

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
 */
export async function playLoudNotificationSound() {
  const p = getNotificationPrefsCache();
  const volPct = Number(p.sound_volume_percent);
  const vol = Number.isFinite(volPct) ? Math.min(1.5, Math.max(0, volPct / 100)) : 1;

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

function stripForSpeech(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đọc to tiêu đề (và phần đầu nội dung).
 */
export function speakNotificationSummary(title, message) {
  const p = getNotificationPrefsCache();
  if (p.read_title_aloud === false) return;
  const speechVol = Number(p.speech_volume_percent);
  const utterVol = Number.isFinite(speechVol) ? Math.min(1, Math.max(0, speechVol / 100)) : 1;
  if (utterVol <= 0) return;
  if (!window.speechSynthesis) return;

  const t = stripForSpeech(title);
  const m = stripForSpeech(message);
  let text = t;
  if (m && m !== t) {
    const short = m.length > 220 ? `${m.slice(0, 220)}…` : m;
    text = `${t}. ${short}`;
  }
  if (!text) return;

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.volume = utterVol;
    u.rate = 0.9;
    u.pitch = 1;

    const applyVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const vi =
        voices.find((v) => /^vi/i.test(v.lang)) ||
        voices.find((v) => /vietnamese/i.test(v.name || ''));
      if (vi) u.voice = vi;
    };

    let spoken = false;
    const speakOnce = () => {
      if (spoken) return;
      spoken = true;
      applyVoice();
      window.speechSynthesis.speak(u);
    };

    if (window.speechSynthesis.getVoices().length) {
      speakOnce();
    } else {
      const fallback = window.setTimeout(() => speakOnce(), 700);
      const onVoices = () => {
        window.clearTimeout(fallback);
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        speakOnce();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Chuông + (tuỳ cài đặt) đọc tóm tắt.
 */
export async function alertIncomingNotification({ title, message }) {
  const p = getNotificationPrefsCache();
  if (p.sound === false) return;

  const volPct = Number(p.sound_volume_percent);
  if (!Number.isFinite(volPct) || volPct > 0) {
    await playLoudNotificationSound();
  }

  const speechVol = Number(p.speech_volume_percent);
  const canSpeak = p.read_title_aloud !== false && (!Number.isFinite(speechVol) || speechVol > 0);
  if (canSpeak) {
    window.setTimeout(() => speakNotificationSummary(title, message), 380);
  }
}

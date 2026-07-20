/**
 * Gốc API (không có /api).
 * Ưu tiên: EXPO_PUBLIC_API_URL → local LDPlayer (adb reverse) → production.
 *
 * LDPlayer: chạy scripts/connect-ldplayer.ps1 (adb reverse tcp:4000)
 * rồi build APK với .env EXPO_PUBLIC_API_URL=http://127.0.0.1:4000
 */
const FROM_ENV = (process.env.EXPO_PUBLIC_API_URL || '').trim();

/** Bật true khi test app trên LDPlayer / emulator với backend local. Tắt khi publish production. */
const USE_LOCAL_API = false;
const LOCAL_API = 'http://127.0.0.1:4000';
const PROD_API = 'https://tubep-backend.onrender.com';

export const API_ORIGIN = (
  FROM_ENV || (USE_LOCAL_API ? LOCAL_API : PROD_API)
).replace(/\/$/, '');

export const API_PREFIX = `${API_ORIGIN}/api`;

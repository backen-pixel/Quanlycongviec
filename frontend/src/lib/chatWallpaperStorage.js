/** Hình nền chat — cache local + đồng bộ server (web ↔ app). */

import api from './api';

const KEY = 'web_chat_wallpapers_v1';
export const CHAT_WALLPAPER_CHANGED = 'messenger-chat-wallpaper-changed';

export function notifyChatWallpaperChanged(threadId) {
  try {
    window.dispatchEvent(new CustomEvent(CHAT_WALLPAPER_CHANGED, { detail: { threadId: String(threadId || '') } }));
  } catch {
    /* ignore */
  }
}

function readMap() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function cacheLocal(threadId, uriOrNull) {
  if (!threadId) return;
  const map = readMap();
  const key = String(threadId);
  if (!uriOrNull) delete map[key];
  else map[key] = String(uriOrNull);
  writeMap(map);
}

/**
 * Cache đồng bộ (không gọi mạng).
 * @returns {{ type: 'none' } | { type: 'image', uri: string }}
 */
export function getChatWallpaper(threadId) {
  if (!threadId) return { type: 'none' };
  const raw = readMap()[String(threadId)];
  if (!raw) return { type: 'none' };
  if (String(raw).startsWith('preset:')) return { type: 'none' };
  // data: cũ chỉ local — không dùng để “đồng bộ” nhưng vẫn hiện tạm
  return { type: 'image', uri: String(raw) };
}

/** Tải wallpaper từ server và cập nhật cache. */
export async function fetchChatWallpaper(threadId) {
  if (!threadId) return { type: 'none' };
  try {
    const { data } = await api.get(`/messenger/groups/${threadId}/wallpaper`);
    const url = data?.wallpaper_url ? String(data.wallpaper_url).trim() : '';
    cacheLocal(threadId, url || null);
    notifyChatWallpaperChanged(threadId);
    return url ? { type: 'image', uri: url } : { type: 'none' };
  } catch {
    return getChatWallpaper(threadId);
  }
}

/** Upload ảnh nền lên server — đồng bộ mọi thiết bị. */
export async function uploadChatWallpaper(threadId, file) {
  if (!threadId || !file) throw new Error('Thiếu ảnh');
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.put(`/messenger/groups/${threadId}/wallpaper`, form);
  const url = data?.wallpaper_url ? String(data.wallpaper_url).trim() : '';
  cacheLocal(threadId, url || null);
  notifyChatWallpaperChanged(threadId);
  return url ? { type: 'image', uri: url } : { type: 'none' };
}

/** Xóa hình nền (về mặc định) trên server. */
export async function clearChatWallpaper(threadId) {
  if (!threadId) return;
  try {
    await api.delete(`/messenger/groups/${threadId}/wallpaper`);
  } catch {
    try {
      await api.put(`/messenger/groups/${threadId}/wallpaper`, { clear: true });
    } catch {
      /* ignore offline */
    }
  }
  cacheLocal(threadId, null);
  notifyChatWallpaperChanged(threadId);
}

/** @deprecated dùng uploadChatWallpaper */
export function setChatWallpaper(threadId, dataUrlOrUri) {
  if (!threadId || !dataUrlOrUri) return;
  cacheLocal(threadId, dataUrlOrUri);
  notifyChatWallpaperChanged(threadId);
}

/** Nén ảnh trước khi upload (client-side). */
export function fileToWallpaperDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Chỉ chọn file ảnh'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (file.size <= 900_000) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        const scale = Math.min(1, maxW / (img.width || maxW));
        const w = Math.max(1, Math.round((img.width || maxW) * scale));
        const h = Math.max(1, Math.round((img.height || maxW) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/** data URL → Blob để upload. */
export function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Ảnh không hợp lệ');
  const mime = m[1] || 'image/jpeg';
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

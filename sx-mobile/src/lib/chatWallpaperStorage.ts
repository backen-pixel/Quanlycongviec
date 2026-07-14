import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMessengerChatWallpaper,
  fetchMessengerChatWallpaper,
  uploadMessengerChatWallpaper,
} from './messengerApi';

const KEY = 'sx_chat_wallpapers_v1';

export type ChatWallpaperPreset = {
  id: string;
  label: string;
  /** null = nền theo theme app (sạch, không pattern) */
  color: string | null;
};

/** Chỉ giữ «Mặc định» — bỏ các preset màu tối trước đây (dễ rối mắt). */
export const CHAT_WALLPAPER_PRESETS: ChatWallpaperPreset[] = [
  { id: 'default', label: 'Mặc định', color: null },
];

export type ChatWallpaper =
  | { type: 'none' }
  | { type: 'preset'; id: string; color: string }
  | { type: 'image'; uri: string };

type WallpaperMap = Record<string, string>;

function encode(w: ChatWallpaper): string | null {
  if (w.type === 'none') return null;
  if (w.type === 'preset') return `preset:${w.id}`;
  return w.uri;
}

function decode(raw: string | null | undefined): ChatWallpaper {
  if (!raw) return { type: 'none' };
  // Preset màu cũ (navy/slate/…) đã gỡ — luôn về nền theme sạch
  if (raw.startsWith('preset:')) return { type: 'none' };
  // file:// local cũ không đồng bộ web — bỏ qua, chờ fetch server
  if (raw.startsWith('file:') || raw.startsWith('content:') || raw.startsWith('ph://')) {
    return { type: 'none' };
  }
  return { type: 'image', uri: raw };
}

async function readMap(): Promise<WallpaperMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WallpaperMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: WallpaperMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

async function cacheLocal(threadId: string, uri: string | null): Promise<void> {
  if (!threadId) return;
  const map = await readMap();
  if (!uri) delete map[String(threadId)];
  else map[String(threadId)] = uri;
  await writeMap(map);
}

export async function getChatWallpaperValue(threadId: string): Promise<ChatWallpaper> {
  if (!threadId) return { type: 'none' };
  const map = await readMap();
  return decode(map[String(threadId)]);
}

/** Tải từ server rồi cache — đồng bộ với web. */
export async function syncChatWallpaperFromServer(threadId: string): Promise<ChatWallpaper> {
  if (!threadId) return { type: 'none' };
  try {
    const url = await fetchMessengerChatWallpaper(threadId);
    await cacheLocal(threadId, url);
    return url ? { type: 'image', uri: url } : { type: 'none' };
  } catch {
    return getChatWallpaperValue(threadId);
  }
}

/** @deprecated dùng getChatWallpaperValue — giữ tương thích ảnh URI cũ */
export async function getChatWallpaper(threadId: string): Promise<string | null> {
  const w = await getChatWallpaperValue(threadId);
  return w.type === 'image' ? w.uri : null;
}

/** Upload ảnh nền lên server (đồng bộ web). */
export async function setChatWallpaper(
  threadId: string,
  asset: { uri: string; name?: string; type?: string } | string,
): Promise<void> {
  if (!threadId) return;
  const a = typeof asset === 'string'
    ? { uri: asset, name: 'wallpaper.jpg', type: 'image/jpeg' }
    : asset;
  if (!a?.uri) return;
  const url = await uploadMessengerChatWallpaper(threadId, a);
  await cacheLocal(threadId, url || null);
}

export async function setChatWallpaperPreset(threadId: string, presetId: string): Promise<void> {
  if (!threadId) return;
  const preset = CHAT_WALLPAPER_PRESETS.find((p) => p.id === presetId);
  if (!preset || !preset.color) {
    await clearChatWallpaper(threadId);
    return;
  }
  const map = await readMap();
  map[String(threadId)] = `preset:${preset.id}`;
  await writeMap(map);
}

export async function clearChatWallpaper(threadId: string): Promise<void> {
  if (!threadId) return;
  try {
    await clearMessengerChatWallpaper(threadId);
  } catch {
    /* offline — vẫn xóa cache */
  }
  await cacheLocal(threadId, null);
}

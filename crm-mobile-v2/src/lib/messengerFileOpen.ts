import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking, Platform } from 'react-native';
import { getStoredToken } from '../api/client';
import { API_PREFIX } from '../config';
import { guessFileMime, resolveFileAccessUrl } from './remoteFile';

function safeFileName(name?: string | null): string {
  const base = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'file';
}

async function downloadToCache(url: string, name?: string | null): Promise<string> {
  const token = await getStoredToken();
  const fileName = safeFileName(name);
  const dest = `${FileSystem.cacheDirectory}crmfile_${Date.now()}_${fileName}`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Không tải được file (${result.status})`);
  }
  // SPA/HTML fallback (sai URL) — file quá nhỏ và là HTML
  try {
    const info = await FileSystem.getInfoAsync(result.uri);
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > 0 && info.size < 800) {
      const head = await FileSystem.readAsStringAsync(result.uri, {
        length: Math.min(64, info.size),
        position: 0,
      });
      const t = head.trimStart().toLowerCase();
      if (t.startsWith('<!doctype') || t.startsWith('<html')) {
        throw new Error('File không còn trên máy chủ hoặc URL sai');
      }
    }
  } catch (e) {
    if ((e as Error)?.message?.includes('máy chủ')) throw e;
  }
  return result.uri;
}

async function openLocalFile(localUri: string, mime: string): Promise<void> {
  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: mime,
    });
    return;
  }
  const can = await Linking.canOpenURL(localUri);
  if (can) await Linking.openURL(localUri);
  else throw new Error('Không mở được file trên thiết bị này');
}

export async function openExternalLink(url: string): Promise<void> {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) {
    Alert.alert('Link', 'Link không hợp lệ.');
    return;
  }
  const can = await Linking.canOpenURL(u);
  if (!can) {
    Alert.alert('Link', 'Không mở được link này.');
    return;
  }
  await Linking.openURL(u);
}

export async function openMessengerAttachment(
  url: string,
  opts?: { name?: string | null; mime?: string | null },
): Promise<void> {
  try {
    const accessUrl = await resolveFileAccessUrl(url, { name: opts?.name });
    if (!accessUrl) throw new Error('Không có đường dẫn file');
    const mime = guessFileMime(opts?.name, opts?.mime);
    const local = await downloadToCache(accessUrl, opts?.name);
    await openLocalFile(local, mime);
  } catch (e) {
    Alert.alert('Mở file', (e as Error)?.message || 'Không mở được file.');
  }
}

export async function saveMessengerAttachment(
  url: string,
  opts?: { name?: string | null; mime?: string | null },
): Promise<void> {
  try {
    const accessUrl = await resolveFileAccessUrl(url, { name: opts?.name });
    if (!accessUrl) throw new Error('Không có đường dẫn file');
    const mime = guessFileMime(opts?.name, opts?.mime);
    const local = await downloadToCache(accessUrl, opts?.name);

    if (
      mime.startsWith('image/')
      || mime.startsWith('video/')
      || mime.startsWith('audio/')
    ) {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        await MediaLibrary.createAssetAsync(local);
        Alert.alert('Đã lưu', 'File đã lưu vào thư viện trên máy.');
        return;
      }
    }

    await openLocalFile(local, mime);
    Alert.alert('Đã tải', 'File đã tải về. Ứng dụng xem file đã mở — bạn có thể lưu từ đó.');
  } catch (e) {
    Alert.alert('Tải file', (e as Error)?.message || 'Không tải được file.');
  }
}

/** Mở file Drive qua API download (Bearer), không phụ thuộc Google view_url. */
export async function openDriveFileById(
  fileId: string,
  opts?: { name?: string | null; mime?: string | null },
): Promise<void> {
  const token = await getStoredToken();
  const url = `${API_PREFIX}/drive/files/${encodeURIComponent(fileId)}/download`;
  // downloadToCache gửi Bearer; không cần query token
  void token;
  await openMessengerAttachment(url, opts);
}

export type FileActionTarget = {
  url: string;
  name?: string | null;
  mime?: string | null;
};

let fileActionsPrompt: ((url: string, opts?: Omit<FileActionTarget, 'url'>) => void) | null = null;

export function registerFileActionsPrompt(
  fn: ((url: string, opts?: Omit<FileActionTarget, 'url'>) => void) | null,
): void {
  fileActionsPrompt = fn;
}

/** Sheet Mở / Tải / Chia sẻ — dùng chung Messenger + CRM. */
export function promptMessengerFileActions(
  url: string,
  opts?: Omit<FileActionTarget, 'url'>,
): void {
  if (fileActionsPrompt) {
    fileActionsPrompt(url, opts);
    return;
  }
  void openMessengerAttachment(url, opts);
}

export type TextPart = { type: 'text' | 'url'; value: string };

export function splitTextWithUrls(text: string): TextPart[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', value: text.slice(last, idx) });
    out.push({ type: 'url', value: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out.length ? out : [{ type: 'text', value: text }];
}

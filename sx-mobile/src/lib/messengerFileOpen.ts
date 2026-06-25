import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking, Platform } from 'react-native';
import { getStoredToken } from '../api/client';
import { guessAudioMimeFromFileName } from './guessAudioMime';

function safeFileName(name?: string | null): string {
  const base = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'file';
}

function guessMime(name?: string | null, mime?: string | null): string {
  if (mime) return mime;
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(lower)) return 'image/jpeg';
  const audio = guessAudioMimeFromFileName(lower);
  if (audio) return audio;
  return 'application/octet-stream';
}

async function downloadToCache(url: string, name?: string | null): Promise<string> {
  const token = await getStoredToken();
  const fileName = safeFileName(name);
  const dest = `${FileSystem.cacheDirectory}messenger_${Date.now()}_${fileName}`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Không tải được file (${result.status})`);
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
    const mime = guessMime(opts?.name, opts?.mime);
    const local = await downloadToCache(url, opts?.name);
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
    const mime = guessMime(opts?.name, opts?.mime);
    const local = await downloadToCache(url, opts?.name);

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

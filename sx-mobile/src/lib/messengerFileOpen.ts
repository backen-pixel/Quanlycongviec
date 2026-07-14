import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking, Platform } from 'react-native';
import { getStoredToken } from '../api/client';
import { guessAudioMimeFromFileName } from './guessAudioMime';

const SAF_DOWNLOAD_DIR_KEY = 'sx_mobile_saf_download_dir_v1';

function safeFileName(name?: string | null): string {
  const base = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'file';
}

function guessMime(name?: string | null, mime?: string | null): string {
  if (mime && mime !== 'application/octet-stream' && mime !== 'image/*') return mime;
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(lower)) return 'image/jpeg';
  const audio = guessAudioMimeFromFileName(lower);
  if (audio) return audio;
  return mime || 'application/octet-stream';
}

export type DownloadProgressInfo = {
  /** 0..1 trong giai đoạn tải mạng */
  ratio: number;
  /** bytes đã tải */
  written: number;
  /** bytes tổng (0 nếu server không gửi Content-Length) */
  total: number;
  /** 'downloading' | 'saving' | 'done' */
  phase: 'downloading' | 'saving' | 'done';
};

export type SaveAttachmentOptions = {
  name?: string | null;
  mime?: string | null;
  onProgress?: (info: DownloadProgressInfo) => void;
};

async function downloadToCacheWithProgress(
  url: string,
  name?: string | null,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<string> {
  const token = await getStoredToken();
  const fileName = safeFileName(name);
  const dest = `${FileSystem.cacheDirectory}dl_${Date.now()}_${fileName}`;

  try {
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ignore */
  }

  const resumable = FileSystem.createDownloadResumable(
    url,
    dest,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    (p) => {
      const total = p.totalBytesExpectedToWrite || 0;
      const written = p.totalBytesWritten || 0;
      const ratio = total > 0 ? Math.min(1, written / total) : 0;
      onProgress?.({ ratio, written, total, phase: 'downloading' });
    },
  );

  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error('Tải file thất bại');
  if (result.status != null && (result.status < 200 || result.status >= 300)) {
    throw new Error(`Không tải được file (${result.status})`);
  }
  onProgress?.({
    ratio: 1,
    written: result.headers ? Number(result.headers['Content-Length'] || 0) : 0,
    total: result.headers ? Number(result.headers['Content-Length'] || 0) : 0,
    phase: 'saving',
  });
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
    const local = await downloadToCacheWithProgress(url, opts?.name);
    await openLocalFile(local, mime);
  } catch (e) {
    Alert.alert('Mở file', (e as Error)?.message || 'Không mở được file.');
  }
}

/** Lấy / xin quyền thư mục lưu công khai (Downloads). Cache URI để lần sau không hỏi lại. */
async function resolvePublicSaveDir(): Promise<string> {
  const cached = await AsyncStorage.getItem(SAF_DOWNLOAD_DIR_KEY);
  if (cached) return cached;

  const initial = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initial);
  if (!perm.granted || !perm.directoryUri) {
    throw new Error('Bạn cần chọn thư mục Downloads (hoặc thư mục bất kỳ) để lưu file.');
  }
  await AsyncStorage.setItem(SAF_DOWNLOAD_DIR_KEY, perm.directoryUri);
  return perm.directoryUri;
}

async function clearCachedSaveDir(): Promise<void> {
  await AsyncStorage.removeItem(SAF_DOWNLOAD_DIR_KEY);
}

/** Ghi file đã tải vào thư mục công khai người dùng chọn (Downloads…). */
async function persistToPublicFolder(
  localUri: string,
  name: string | null | undefined,
  mime: string,
): Promise<{ displayName: string; locationHint: string }> {
  const fileName = safeFileName(name);
  if (Platform.OS !== 'android') {
    // iOS: lưu vào Documents của app (Files app có thể thấy nếu share)
    const dir = `${FileSystem.documentDirectory || ''}downloads/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const dest = `${dir}${fileName}`;
    await FileSystem.copyAsync({ from: localUri, to: dest });
    return { displayName: fileName, locationHint: 'Thư mục Documents của app' };
  }

  let dirUri = await resolvePublicSaveDir();
  let fileUri: string | null = null;
  try {
    fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, fileName, mime);
  } catch {
    // URI cũ hết hạn / không còn quyền → xin lại
    await clearCachedSaveDir();
    dirUri = await resolvePublicSaveDir();
    fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, fileName, mime);
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    displayName: fileName,
    locationHint: 'Thư mục Downloads (hoặc thư mục bạn đã chọn)',
  };
}

export type SaveAttachmentResult = {
  displayName: string;
  locationHint: string;
  kind: 'media_library' | 'public_folder';
};

/**
 * Tải file về máy thật (thư viện ảnh hoặc thư mục Downloads công khai).
 * Báo tiến độ qua onProgress. Không mở app xem file.
 */
export async function saveMessengerAttachment(
  url: string,
  opts?: SaveAttachmentOptions,
): Promise<SaveAttachmentResult> {
  const mime = guessMime(opts?.name, opts?.mime);
  const local = await downloadToCacheWithProgress(url, opts?.name, opts?.onProgress);
  opts?.onProgress?.({ ratio: 1, written: 0, total: 0, phase: 'saving' });

  if (
    mime.startsWith('image/')
    || mime.startsWith('video/')
    || mime.startsWith('audio/')
  ) {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (perm.granted) {
      await MediaLibrary.createAssetAsync(local);
      opts?.onProgress?.({ ratio: 1, written: 0, total: 0, phase: 'done' });
      return {
        displayName: safeFileName(opts?.name),
        locationHint: 'Thư viện ảnh/video trên máy',
        kind: 'media_library',
      };
    }
  }

  const saved = await persistToPublicFolder(local, opts?.name, mime);
  opts?.onProgress?.({ ratio: 1, written: 0, total: 0, phase: 'done' });
  return {
    displayName: saved.displayName,
    locationHint: saved.locationHint,
    kind: 'public_folder',
  };
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

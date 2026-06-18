import * as FileSystem from 'expo-file-system/legacy';
import type { ShareIntentFile } from 'expo-share-intent';
import { Platform } from 'react-native';
import { guessMimeFromFileName, normalizeShareFileName } from './shareMime';

export type ReadableShareFile = {
  uri: string;
  fileName: string;
  mime: string;
};

/** Copy content:// hoặc URI không đọc được vào cache app. */
export async function ensureShareReadableFile(
  file: ShareIntentFile,
  opts: { cachePrefix?: string; fallbackBaseName?: string } = {},
): Promise<ReadableShareFile> {
  const rawPath = (file.path || '').trim();
  if (!rawPath) throw new Error('Không đọc được file chia sẻ');

  const prefix = opts.cachePrefix || 'share';
  const fallback = opts.fallbackBaseName || `shared_${Date.now()}.bin`;

  let fileName =
    normalizeShareFileName(file.fileName) ||
    rawPath.split('/').pop()?.split('?')[0] ||
    fallback;
  fileName = fileName.trim() || fallback;

  let mime = file.mimeType || guessMimeFromFileName(fileName);
  if (!mime || mime === 'application/octet-stream') {
    mime = guessMimeFromFileName(fileName);
  }

  const cacheDir = FileSystem.cacheDirectory;
  const needsCopy =
    rawPath.startsWith('content://') ||
    (Platform.OS === 'android' && !rawPath.startsWith('file://') && !rawPath.startsWith('/'));

  if (needsCopy && cacheDir) {
    const safe = fileName.replace(/[^\w.-]/g, '_');
    const dest = `${cacheDir}${prefix}_${Date.now()}_${safe}`;
    await FileSystem.copyAsync({ from: rawPath, to: dest });
    return { uri: dest, fileName, mime };
  }

  const uri =
    rawPath.startsWith('file://') || rawPath.startsWith('content://')
      ? rawPath
      : `file://${rawPath}`;
  return { uri, fileName, mime };
}

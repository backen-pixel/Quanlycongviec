import * as FileSystem from 'expo-file-system/legacy';
import type { ShareIntentFile } from 'expo-share-intent';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { uploadRecording } from '../api/recordings';
import { loadCrmMobilePrefs } from './crmMobilePrefs';
import { guessAudioMimeFromFileName } from './guessAudioMime';
import { normalizeVoiceRecordingFileName } from './voiceRecordingName';

const AUDIO_EXT = /\.(m4a|mp3|amr|3gp|aac|wav|opus|ogg|mp4)$/i;

function extractPhoneFromName(name: string): string | null {
  const m = name.replace(/\s+/g, '').match(/(?:\+84|84|0)([3-9]\d{8,9})/);
  if (!m) return null;
  const digits = (m[0].startsWith('+') ? m[0].slice(1) : m[0]).replace(/\D/g, '');
  return digits.slice(0, 32) || null;
}

export function isSharedAudioFile(file: ShareIntentFile): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const label = `${file.fileName || ''} ${file.path || ''}`.toLowerCase();
  if (AUDIO_EXT.test(label)) return true;
  return mime === 'application/octet-stream' && AUDIO_EXT.test(file.fileName || '');
}

async function ensureReadableUri(file: ShareIntentFile): Promise<{ uri: string; fileName: string; mime: string }> {
  const rawPath = (file.path || '').trim();
  if (!rawPath) throw new Error('Không đọc được file chia sẻ');

  let fileName =
    normalizeVoiceRecordingFileName(file.fileName) ||
    rawPath.split('/').pop()?.split('?')[0] ||
    `shared_voice_${Date.now()}.m4a`;
  fileName = fileName.trim() || `shared_voice_${Date.now()}.m4a`;

  let mime = file.mimeType || guessAudioMimeFromFileName(fileName);
  if (!mime || mime === 'application/octet-stream') {
    mime = guessAudioMimeFromFileName(fileName);
  }

  const cacheDir = FileSystem.cacheDirectory;
  const needsCopy =
    rawPath.startsWith('content://') ||
    (Platform.OS === 'android' && !rawPath.startsWith('file://') && !rawPath.startsWith('/'));

  if (needsCopy && cacheDir) {
    const safe = fileName.replace(/[^\w.-]/g, '_');
    const dest = `${cacheDir}share_voice_${Date.now()}_${safe}`;
    await FileSystem.copyAsync({ from: rawPath, to: dest });
    return { uri: dest, fileName, mime };
  }

  const uri = rawPath.startsWith('file://') || rawPath.startsWith('content://') ? rawPath : `file://${rawPath}`;
  return { uri, fileName, mime };
}

export async function uploadSharedVoiceFile(file: ShareIntentFile): Promise<void> {
  if (!isSharedAudioFile(file)) {
    throw new Error('File không phải ghi âm âm thanh');
  }
  const { uri, fileName, mime } = await ensureReadableUri(file);
  const phone = extractPhoneFromName(fileName);
  await uploadRecording({
    localUri: uri,
    fileName,
    mime,
    phoneNumber: phone,
    notes: 'Chia sẻ từ app Cuộc gọi / file trên máy',
    source: 'crm_mobile_v2_share',
    deviceLabel: 'android share-intent',
  });
}

export async function uploadSharedVoiceFiles(
  files: ShareIntentFile[],
): Promise<{ uploaded: number; errors: string[] }> {
  const audioFiles = files.filter(isSharedAudioFile);
  if (!audioFiles.length) {
    throw new Error('Không có file ghi âm trong lượt chia sẻ');
  }

  const errors: string[] = [];
  let uploaded = 0;
  for (const file of audioFiles) {
    try {
      await uploadSharedVoiceFile(file);
      uploaded += 1;
    } catch (e) {
      errors.push((e as Error)?.message || 'Lỗi upload');
    }
  }

  if (uploaded > 0) {
    const prefs = await loadCrmMobilePrefs();
    if (prefs.autoLinkVoiceByPhone) {
      void api.post('/voice-recordings/relink-unassigned').catch(() => {});
    }
  }

  return { uploaded, errors };
}

import type { ShareIntentFile } from 'expo-share-intent';
import { api } from '../api/client';
import { uploadRecording } from '../api/recordings';
import { loadCrmMobilePrefs } from './crmMobilePrefs';
import { ensureShareReadableFile } from '../../../mobile-shared/share-intent/lib/shareFileToCache';
import { isSharedAudioFile } from '../../../mobile-shared/share-intent/lib/shareMime';

function extractPhoneFromName(name: string): string | null {
  const m = name.replace(/\s+/g, '').match(/(?:\+84|84|0)([3-9]\d{8,9})/);
  if (!m) return null;
  const digits = (m[0].startsWith('+') ? m[0].slice(1) : m[0]).replace(/\D/g, '');
  return digits.slice(0, 32) || null;
}

export { isSharedAudioFile };

export async function uploadSharedVoiceFile(file: ShareIntentFile): Promise<void> {
  if (!isSharedAudioFile(file)) {
    throw new Error('File không phải ghi âm âm thanh');
  }
  const { uri, fileName, mime } = await ensureShareReadableFile(file, {
    cachePrefix: 'share_voice',
    fallbackBaseName: `shared_voice_${Date.now()}.m4a`,
  });
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

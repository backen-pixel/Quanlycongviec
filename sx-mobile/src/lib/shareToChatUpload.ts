import type { ShareIntentFile } from 'expo-share-intent';
import { ensureShareReadableFile } from '../../../mobile-shared/share-intent/lib/shareFileToCache';
import {
  isSharedDocumentFile,
  isSharedImageFile,
} from '../../../mobile-shared/share-intent/lib/shareMime';
import type { PendingChatFile } from './messengerMedia';
import { MESSENGER_MAX_FILE_BYTES } from './messengerMedia';

export function isSharedChatFile(file: ShareIntentFile): boolean {
  return isSharedImageFile(file) || isSharedDocumentFile(file);
}

export async function shareIntentFilesToPending(
  files: ShareIntentFile[],
): Promise<PendingChatFile[]> {
  const eligible = files.filter(isSharedChatFile);
  if (!eligible.length) {
    throw new Error('Chỉ hỗ trợ ảnh hoặc tài liệu (PDF, Word, Excel…)');
  }

  const out: PendingChatFile[] = [];
  for (const file of eligible) {
    const { uri, fileName, mime } = await ensureShareReadableFile(file, {
      cachePrefix: 'share_chat',
      fallbackBaseName: `shared_${Date.now()}.bin`,
    });
    const size = typeof file.size === 'number' ? file.size : undefined;
    if (size != null && size > MESSENGER_MAX_FILE_BYTES) {
      throw new Error(`File "${fileName}" vượt quá 50MB`);
    }
    out.push({ uri, name: fileName, type: mime, size });
  }
  return out;
}

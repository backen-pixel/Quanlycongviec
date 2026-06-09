import { postMultipart } from '../api/client';
import { mapMessageRow } from './messengerApi';
import type { PendingChatFile } from './messengerMedia';
import type { MessengerMessage } from '../types/messenger';

export async function sendMessengerWithFiles(
  groupId: string,
  opts: {
    content?: string;
    replyTo?: string | null;
    files: PendingChatFile[];
  },
): Promise<MessengerMessage> {
  const form = new FormData();
  form.append('content', opts.content || '');
  if (opts.replyTo) form.append('reply_to', opts.replyTo);
  opts.files.forEach((f, i) => {
    const safeName = (f.name || '').trim() || `file_${Date.now()}_${i}.bin`;
    form.append('files', {
      uri: f.uri,
      name: safeName,
      type: f.type || 'application/octet-stream',
    } as unknown as Blob);
  });
  const { data } = await postMultipart<Record<string, unknown>>(
    `/messenger/groups/${groupId}/chat`,
    form,
    { timeoutMs: 120000 },
  );
  return mapMessageRow({ ...data, group_id: groupId });
}

export async function uploadMessengerSingleFile(
  groupId: string,
  file: PendingChatFile,
  opts?: { content?: string; replyTo?: string | null },
): Promise<MessengerMessage> {
  const form = new FormData();
  form.append('content', opts?.content || '');
  if (opts?.replyTo) form.append('reply_to', opts.replyTo);
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type || 'application/octet-stream',
  } as unknown as Blob);
  const { data } = await postMultipart<Record<string, unknown>>(
    `/messenger/groups/${groupId}/chat/upload`,
    form,
    { timeoutMs: 120000 },
  );
  return mapMessageRow({ ...data, group_id: groupId });
}

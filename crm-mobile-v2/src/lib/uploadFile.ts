import { postMultipart } from '../api/client';

export type LocalUploadFile = {
  uri: string;
  name: string;
  type?: string | null;
  size?: number | null;
};

export type UploadSingleResult = {
  file_url: string;
  file_name?: string;
  original_name?: string;
  file_size?: number;
  mime_type?: string;
};

export async function uploadSingleFile(file: LocalUploadFile): Promise<UploadSingleResult> {
  const fd = new FormData();
  fd.append(
    'file',
    {
      uri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
    } as unknown as Blob,
  );
  const { data } = await postMultipart<UploadSingleResult>('/upload/single', fd, { timeoutMs: 180000 });
  return data;
}

export function docTypeFromUpload(
  up: UploadSingleResult,
  fileName?: string,
): 'image' | 'video' | 'drawing' | 'other' {
  const mime = up.mime_type || '';
  const name = fileName || up.file_name || up.original_name || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (/\.(dwg|dxf)$/i.test(name)) return 'drawing';
  return 'other';
}

export function attachmentItemFromUpload(up: UploadSingleResult) {
  const fileName = up.file_name || up.original_name || 'file';
  return {
    name: fileName.replace(/\.[^.]+$/, '') || 'File',
    doc_type: docTypeFromUpload(up, fileName),
    file_url: up.file_url,
    file_name: fileName,
    file_size: up.file_size,
    mime_type: up.mime_type,
  };
}

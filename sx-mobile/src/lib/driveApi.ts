import { api, postMultipart } from '../api/client';

export type DriveFile = {
  id: string;
  name: string;
  mime_type?: string | null;
  size_bytes?: number;
};

export type DriveFolder = {
  id: string;
  name: string;
};

export type DriveEntityChildren = {
  folders: DriveFolder[];
  files: DriveFile[];
  breadcrumb?: { type: string; id: string; name: string }[];
};

export type DriveEntityLink = {
  id: string;
  file_id: string;
  file?: DriveFile | null;
};

export type ProductionDriveEntityType = 'production_project';

export async function fetchDriveEntityChildren(
  entityType: ProductionDriveEntityType,
  entityId: string,
  folderId?: string | null,
): Promise<DriveEntityChildren> {
  const { data } = await api.get<DriveEntityChildren>(
    `/drive/entity/${entityType}/${entityId}/children`,
    { params: folderId ? { folder_id: folderId } : {} },
  );
  return {
    folders: data?.folders || [],
    files: data?.files || [],
    breadcrumb: data?.breadcrumb || [],
  };
}

export async function fetchDriveLinksByEntity(
  entityType: ProductionDriveEntityType,
  entityId: string,
): Promise<DriveEntityLink[]> {
  const { data } = await api.get<{ links: DriveEntityLink[] }>(
    `/drive/links/by-entity/${entityType}/${entityId}`,
  );
  return data?.links || [];
}

export async function drivePreview(fileId: string) {
  const { data } = await api.get<{
    view_url: string | null;
    embed_url: string | null;
    mime_type: string;
    name: string;
  }>(`/drive/files/${fileId}/preview`);
  return data;
}

export async function createDriveEntityFolder(
  entityType: ProductionDriveEntityType,
  entityId: string,
  name: string,
  parentFolderId?: string | null,
) {
  const { data } = await api.post<{ folder: DriveFolder }>(
    `/drive/entity/${entityType}/${entityId}/folders`,
    { name, parent_folder_id: parentFolderId || null },
  );
  return data.folder;
}

export async function uploadDriveEntityFile(input: {
  entityType: ProductionDriveEntityType;
  entityId: string;
  uri: string;
  name: string;
  mimeType?: string | null;
  folderId?: string | null;
}) {
  const fd = new FormData();
  fd.append(
    'file',
    {
      uri: input.uri,
      name: input.name,
      type: input.mimeType || 'application/octet-stream',
    } as unknown as Blob,
  );
  fd.append('entity_type', input.entityType);
  fd.append('entity_id', input.entityId);
  if (input.folderId) fd.append('folder_id', input.folderId);
  if (input.name) fd.append('name', input.name);
  const { data } = await postMultipart<{ file: DriveFile }>('/drive/entity/upload', fd, {
    timeoutMs: 300000,
  });
  return data;
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function iconNameForMime(mime: string | null | undefined): string {
  if (!mime) return 'document-outline';
  if (mime.startsWith('image/')) return 'image-outline';
  if (mime.startsWith('video/')) return 'videocam-outline';
  if (mime.startsWith('audio/')) return 'musical-notes-outline';
  if (mime.includes('pdf')) return 'document-text-outline';
  if (mime.includes('word')) return 'document-text-outline';
  if (mime.includes('sheet') || mime.includes('excel')) return 'grid-outline';
  if (mime.includes('zip') || mime.includes('rar')) return 'file-tray-stacked-outline';
  return 'document-outline';
}

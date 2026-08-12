/**
 * Drive API client cho crm-mobile-v2.
 */
import { API_PREFIX } from '../config';
import { api, postMultipart } from './client';

/** Stream Drive inline + Range (video/ảnh trong app). Có thể kèm JWT query. */
export function driveFileContentUrl(fileId: string, token?: string | null): string {
  const base = `${API_PREFIX}/drive/files/${fileId}/stream`;
  return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
}

export type DriveRoot = {
  id: string;
  scope: 'user' | 'company' | 'shared';
  owner_id: string | null;
  name: string;
  google_folder_id: string;
};

export type DriveFolder = {
  id: string;
  root_id: string;
  parent_id: string | null;
  name: string;
  google_folder_id: string;
  trashed_at: string | null;
};

export type DriveFile = {
  id: string;
  root_id: string;
  folder_id: string | null;
  name: string;
  mime_type: string | null;
  size_bytes: number;
  google_file_id: string;
  google_view_url: string | null;
  thumbnail_url: string | null;
  trashed_at: string | null;
};

export type Breadcrumb = { type: 'root' | 'folder' | 'view'; id: string; name: string; scope?: string };

export async function listRoots() {
  const r = await api.get<{ roots: DriveRoot[] }>('/drive/roots');
  return r.data.roots || [];
}

export async function ensurePersonalRoot() {
  const r = await api.post<{ root: DriveRoot }>('/drive/roots/ensure-personal');
  return r.data.root;
}

export async function listRootChildren(rootId: string) {
  const r = await api.get<{ folders: DriveFolder[]; files: DriveFile[]; root: DriveRoot }>(
    `/drive/folders/by-root/${rootId}/children`,
  );
  return r.data;
}

export async function listFolderChildren(folderId: string) {
  const r = await api.get<{ folders: DriveFolder[]; files: DriveFile[]; folder: DriveFolder }>(
    `/drive/folders/${folderId}/children`,
  );
  return r.data;
}

export async function folderBreadcrumb(folderId: string) {
  const r = await api.get<{ breadcrumb: Breadcrumb[] }>(`/drive/breadcrumb/folder/${folderId}`);
  return r.data.breadcrumb || [];
}

export async function createFolder(payload: { name: string; parent_id?: string | null; root_id?: string | null }) {
  const r = await api.post<{ folder: DriveFolder }>('/drive/folders', payload);
  return r.data.folder;
}

export async function trashFile(id: string) { await api.delete(`/drive/files/${id}`); }
export async function trashFolder(id: string) { await api.delete(`/drive/folders/${id}`); }
export async function restoreFile(id: string) { await api.post(`/drive/files/${id}/restore`); }
export async function restoreFolder(id: string) { await api.post(`/drive/folders/${id}/restore`); }

export async function preview(id: string) {
  const r = await api.get<{ view_url: string | null; embed_url: string | null; thumbnail_url: string | null; mime_type: string; name: string }>(
    `/drive/files/${id}/preview`,
  );
  return r.data;
}

export async function search(query: string, rootId?: string) {
  const r = await api.get<{ folders: DriveFolder[]; files: DriveFile[] }>('/drive/search', {
    params: { q: query, root_id: rootId },
  });
  return r.data;
}

export async function recent(limit = 50) {
  const r = await api.get<{ files: DriveFile[] }>('/drive/recent', { params: { limit } });
  return r.data.files || [];
}

export async function uploadFile(input: {
  uri: string;
  name: string;
  mimeType?: string | null;
  folderId?: string | null;
  rootId?: string | null;
}) {
  const fd = new FormData();
  // React Native multipart pattern
  fd.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType || 'application/octet-stream',
  } as unknown as Blob);
  if (input.folderId) fd.append('folder_id', input.folderId);
  if (input.rootId && !input.folderId) fd.append('root_id', input.rootId);
  const res = await postMultipart<{ file: DriveFile }>('/drive/files/upload', fd, { timeoutMs: 180000 });
  return res.data.file;
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
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

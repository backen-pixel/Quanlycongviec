/**
 * Drive module — REST client (gọi backend /api/drive).
 */
import api from './api';

// ── Roots ──
export const driveListRoots = () => api.get('/drive/roots').then((r) => r.data);
export const driveEnsurePersonalRoot = () => api.post('/drive/roots/ensure-personal').then((r) => r.data);
export const driveEnsureCompanyRoot = (company_id) =>
  api.post('/drive/roots/ensure-company', company_id ? { company_id } : {}).then((r) => r.data);
export const driveEnsureSharedCompany = (company_id, module_key = 'other') =>
  api.post('/drive/roots/ensure-shared-company', { company_id, module_key }).then((r) => r.data);
export const driveEnsureSharedRegion = (region_id, module_key = 'other') =>
  api.post('/drive/roots/ensure-shared-region', { region_id, module_key }).then((r) => r.data);
export const driveResetPersonalRoot = (user_id) =>
  api.post('/drive/roots/reset-personal', user_id ? { user_id } : {}).then((r) => r.data);
export const driveCreateSharedRoot = (name) => api.post('/drive/roots', { name }).then((r) => r.data);
export const driveHealth = () => api.get('/drive/health').then((r) => r.data);

// ── Org tree (Module → Công ty → Khu vực → Loại → Phòng ban → Nhân viên) ──
export const driveOrgTree = (moduleKey) =>
  api.get('/drive/org-tree', { params: moduleKey ? { module: moduleKey } : {} }).then((r) => r.data);
export const driveModules = () => api.get('/drive/modules').then((r) => r.data);
export const driveEnsureUserDrive = (user_id) =>
  api.post('/drive/org/ensure-user-drive', { user_id }).then((r) => r.data);
export const driveSetUserModule = (userId, module) =>
  api.patch(`/drive/admin/user-module/${userId}`, { module }).then((r) => r.data);
export const driveSetDeptCategory = (departmentId, category) =>
  api.patch(`/drive/admin/dept-category/${departmentId}`, { category }).then((r) => r.data);

// ── Navigation ──
export const driveListRootChildren = (rootId) =>
  api.get(`/drive/folders/by-root/${rootId}/children`).then((r) => r.data);
export const driveListFolderChildren = (folderId) =>
  api.get(`/drive/folders/${folderId}/children`).then((r) => r.data);
export const driveFolderBreadcrumb = (folderId) =>
  api.get(`/drive/breadcrumb/folder/${folderId}`).then((r) => r.data);
export const driveFileBreadcrumb = (fileId) =>
  api.get(`/drive/breadcrumb/file/${fileId}`).then((r) => r.data);

// ── Folders ──
export const driveCreateFolder = ({ name, parent_id = null, root_id = null }) =>
  api.post('/drive/folders', { name, parent_id, root_id }).then((r) => r.data);
export const driveUpdateFolder = (id, body) =>
  api.patch(`/drive/folders/${id}`, body).then((r) => r.data);
export const driveTrashFolder = (id) =>
  api.delete(`/drive/folders/${id}`).then((r) => r.data);
export const driveRestoreFolder = (id) =>
  api.post(`/drive/folders/${id}/restore`).then((r) => r.data);
export const driveDeleteFolderForever = (id) =>
  api.delete(`/drive/folders/${id}/forever`).then((r) => r.data);

// ── Files ──
/**
 * Upload file. options: { folder_id?, root_id?, name?, onProgress(p) }
 */
export function driveUploadFile(file, { folder_id, root_id, name, onProgress } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  if (folder_id) fd.append('folder_id', folder_id);
  if (root_id) fd.append('root_id', root_id);
  if (name) fd.append('name', name);
  return api.post('/drive/files/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  }).then((r) => r.data);
}

/**
 * Upload file vào "folder entity" trên Drive (Module/Cty/KV/Loại/PB/NV/Kind/Mã)
 * và auto-link vào entity. Dùng cho tab Drive trong chi tiết Lead/Deal/Dự án.
 *
 * options: { entity_type, entity_id, name?, onProgress(p) }
 */
export function driveUploadToEntity(file, { entity_type, entity_id, name, onProgress } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('entity_type', entity_type);
  fd.append('entity_id', entity_id);
  if (name) fd.append('name', name);
  return api.post('/drive/entity/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  }).then((r) => r.data);
}

/** Tạo Google Doc / Sheet / Slides trống trong folder hoặc root. */
export const driveCreateGoogleFile = ({ folder_id, root_id, kind, name }) =>
  api.post('/drive/files/create-google', { folder_id, root_id, kind, name }).then((r) => r.data);

/** Tạo Google Doc / Sheet / Slides trong folder entity + auto liên kết. */
export const driveCreateGoogleForEntity = ({ entity_type, entity_id, kind, name }) =>
  api.post('/drive/entity/create-google', { entity_type, entity_id, kind, name }).then((r) => r.data);

export const driveGetFile = (id) => api.get(`/drive/files/${id}`).then((r) => r.data);
export const driveDownloadFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `${api.defaults.baseURL}/drive/files/${id}/download${token ? `?_t=${Date.now()}` : ''}`;
};
export const driveOpenDownload = async (id, filename) => {
  // Tải qua axios để gắn Authorization header → blob → save.
  const resp = await api.get(`/drive/files/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(resp.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const drivePreview = (id) => api.get(`/drive/files/${id}/preview`).then((r) => r.data);

/** Tải nội dung xem trước qua API (PDF export cho Google Doc/Sheet, blob gốc cho file khác). */
export async function driveFetchPreviewBlobUrl(id) {
  const resp = await api.get(`/drive/files/${id}/preview-content`, { responseType: 'blob' });
  return URL.createObjectURL(resp.data);
}

/** Tải file qua API (có auth) → blob URL để hiển thị ảnh full màn hình. */
export async function driveFetchFileBlobUrl(id) {
  const resp = await api.get(`/drive/files/${id}/download`, { responseType: 'blob' });
  return URL.createObjectURL(resp.data);
}
export const driveUpdateFile = (id, body) => api.patch(`/drive/files/${id}`, body).then((r) => r.data);
export const driveTrashFile = (id) => api.delete(`/drive/files/${id}`).then((r) => r.data);
export const driveRestoreFile = (id) => api.post(`/drive/files/${id}/restore`).then((r) => r.data);
export const driveDeleteFileForever = (id) => api.delete(`/drive/files/${id}/forever`).then((r) => r.data);

// ── Share ──
export const driveShare = (body) => api.post('/drive/share', body).then((r) => r.data);
export const driveUnshare = (id) => api.delete(`/drive/share/${id}`).then((r) => r.data);
export const driveListShares = (target_type, target_id) =>
  api.get(`/drive/share/${target_type}/${target_id}`).then((r) => r.data);
export const driveSharedWithMe = () => api.get('/drive/shared-with-me').then((r) => r.data);

// ── Search / Recent / Stars ──
export const driveSearch = (params) => api.get('/drive/search', { params }).then((r) => r.data);
export const driveRecent = (limit = 50) => api.get('/drive/recent', { params: { limit } }).then((r) => r.data);
export const driveStarred = () => api.get('/drive/starred').then((r) => r.data);
export const driveStar = (target_type, target_id) =>
  api.post('/drive/stars', { target_type, target_id }).then((r) => r.data);
export const driveUnstar = (target_type, target_id) =>
  api.delete(`/drive/stars/${target_type}/${target_id}`).then((r) => r.data);

// ── Trash ──
export const driveTrashList = (rootId) => api.get('/drive/trash', { params: rootId ? { root_id: rootId } : {} }).then((r) => r.data);

// ── Activity ──
export const driveActivity = (target_type, target_id, limit = 100) =>
  api.get('/drive/activity', { params: { target_type, target_id, limit } }).then((r) => r.data);
export const driveActivityFeed = (limit = 100) => api.get('/drive/activity/feed', { params: { limit } }).then((r) => r.data);

// ── Entity links ──
export const driveLinkFile = (file_id, entity_type, entity_id, note) =>
  api.post('/drive/links', { file_id, entity_type, entity_id, note }).then((r) => r.data);
export const driveUnlinkFile = (id) => api.delete(`/drive/links/${id}`).then((r) => r.data);
export const driveLinksByEntity = (entity_type, entity_id) =>
  api.get(`/drive/links/by-entity/${entity_type}/${entity_id}`).then((r) => r.data);
export const driveLinksCountByEntity = (entity_type, entity_id) =>
  api.get(`/drive/links/count-by-entity/${entity_type}/${entity_id}`).then((r) => r.data?.count ?? 0);

// ── Chat share ──
export const driveShareToLeadChat = (leadId, body) =>
  api.post(`/crm/leads/${leadId}/chat/drive`, body).then((r) => r.data);
export const driveShareToMessengerChat = (groupId, body) =>
  api.post(`/messenger/groups/${groupId}/chat/drive`, body).then((r) => r.data);
export const driveLinksByFile = (file_id) =>
  api.get(`/drive/links/by-file/${file_id}`).then((r) => r.data);

// ── Utils ──
export const driveFormatBytes = (n) => {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export const driveIconForMime = (mime) => {
  if (!mime) return 'file';
  if (mime.includes('google-apps.document')) return 'word';
  if (mime.includes('google-apps.spreadsheet')) return 'excel';
  if (mime.includes('google-apps.presentation')) return 'powerpoint';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'word';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('officedocument.spreadsheet')) return 'excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'powerpoint';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) return 'archive';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return 'text';
  return 'file';
};

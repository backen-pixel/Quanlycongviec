/**
 * Google Drive service - dùng Service Account để thao tác trên 1 folder gốc đã share.
 * Tài liệu: https://developers.google.com/drive/api/guides/about-files
 *
 * Khởi tạo:
 *   - ENV GDRIVE_SERVICE_ACCOUNT_JSON: chuỗi JSON đầy đủ của file key.json (khuyến nghị cho production).
 *   - hoặc ENV GDRIVE_SERVICE_ACCOUNT_FILE: đường dẫn tới file key.json (dev local).
 *   - ENV GDRIVE_ROOT_FOLDER_ID: id folder gốc trên Drive (bạn tạo thủ công và share quyền Editor cho service account email).
 *   - ENV GDRIVE_IMPERSONATE_USER (tuỳ chọn): email Workspace user để impersonate (domain-wide delegation).
 *
 * Module trả về null nếu chưa cấu hình → routes phải bắt và trả 503 thân thiện.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const config = require('../config');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

let _client = null;
let _initError = null;

function loadCredentials() {
  if (config.gdriveServiceAccountJson) {
    try {
      return JSON.parse(config.gdriveServiceAccountJson);
    } catch (e) {
      throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ: ' + e.message);
    }
  }
  if (config.gdriveServiceAccountFile) {
    const p = path.isAbsolute(config.gdriveServiceAccountFile)
      ? config.gdriveServiceAccountFile
      : path.resolve(process.cwd(), config.gdriveServiceAccountFile);
    if (!fs.existsSync(p)) throw new Error('GDRIVE_SERVICE_ACCOUNT_FILE không tồn tại: ' + p);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function isConfigured() {
  return !!(config.gdriveServiceAccountJson || config.gdriveServiceAccountFile) && !!config.gdriveRootFolderId;
}

function getDriveClient() {
  if (_client) return _client;
  if (_initError) throw _initError;
  try {
    const creds = loadCredentials();
    if (!creds) {
      _initError = new Error('Google Drive chưa được cấu hình (thiếu GDRIVE_SERVICE_ACCOUNT_JSON/_FILE)');
      throw _initError;
    }
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
      subject: config.gdriveImpersonateUser || undefined,
    });
    _client = google.drive({ version: 'v3', auth });
    return _client;
  } catch (e) {
    _initError = e;
    throw e;
  }
}

function getRootFolderId() {
  if (!config.gdriveRootFolderId) {
    throw new Error('GDRIVE_ROOT_FOLDER_ID chưa cấu hình');
  }
  return config.gdriveRootFolderId;
}

// Fields chuẩn lấy về mỗi lần lookup file/folder.
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,parents,trashed,webViewLink,thumbnailLink,modifiedTime,createdTime,version';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function findChildByName(parentId, name, mimeType) {
  const drive = getDriveClient();
  const safeName = String(name).replace(/'/g, "\\'");
  let q = `'${parentId}' in parents and name = '${safeName}' and trashed = false`;
  if (mimeType) q += ` and mimeType = '${mimeType}'`;
  const { data } = await drive.files.list({
    q,
    fields: `files(${FILE_FIELDS})`,
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return data.files?.[0] || null;
}

/**
 * Tạo folder con (idempotent theo name dưới parent).
 * Trả về metadata file (id, name, ...).
 */
async function createFolder({ parentId, name }) {
  const existing = await findChildByName(parentId, name, FOLDER_MIME);
  if (existing) return existing;
  const drive = getDriveClient();
  const { data } = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

/**
 * Đảm bảo folder gốc (root) tồn tại trên Drive cho scope/owner. Trả về { google_folder_id, name }.
 * Layout: GDRIVE_ROOT_FOLDER_ID/{users|companies|shared}/<owner_id>
 *   - scope='user'     → users/<userId>
 *   - scope='company'  → companies/<companyId>
 *   - scope='shared'   → shared/<rootName>
 */
async function ensureScopeFolderOnDrive({ scope, ownerId, name }) {
  const rootId = getRootFolderId();
  let bucketName;
  let leafName;
  if (scope === 'user') { bucketName = 'users'; leafName = String(ownerId); }
  else if (scope === 'company') { bucketName = 'companies'; leafName = String(ownerId); }
  else if (scope === 'shared') { bucketName = 'shared'; leafName = String(name || ownerId); }
  else throw new Error('Scope không hợp lệ: ' + scope);

  const bucket = await createFolder({ parentId: rootId, name: bucketName });
  const leaf = await createFolder({ parentId: bucket.id, name: leafName });
  return { google_folder_id: leaf.id, name: leaf.name };
}

/**
 * Upload file qua resumable upload (chịu được file lớn).
 * @param {object} params
 * @param {string} params.parentId - google folder id
 * @param {string} params.name
 * @param {string} params.mimeType
 * @param {NodeJS.ReadableStream} params.stream
 */
async function uploadFile({ parentId, name, mimeType, stream }) {
  const drive = getDriveClient();
  const { data } = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: stream },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  }, {
    // 1 GB / chunk, tự retry nội bộ.
    onUploadProgress: () => {},
  });
  return data;
}

async function renameItem(googleFileId, newName) {
  const drive = getDriveClient();
  const { data } = await drive.files.update({
    fileId: googleFileId,
    requestBody: { name: newName },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

async function moveItem(googleFileId, newParentGoogleId, oldParentGoogleId) {
  const drive = getDriveClient();
  const { data } = await drive.files.update({
    fileId: googleFileId,
    addParents: newParentGoogleId,
    removeParents: oldParentGoogleId || undefined,
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

async function trashItem(googleFileId) {
  const drive = getDriveClient();
  const { data } = await drive.files.update({
    fileId: googleFileId,
    requestBody: { trashed: true },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

async function untrashItem(googleFileId) {
  const drive = getDriveClient();
  const { data } = await drive.files.update({
    fileId: googleFileId,
    requestBody: { trashed: false },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

async function deleteForever(googleFileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId: googleFileId, supportsAllDrives: true });
}

async function getFileMeta(googleFileId) {
  const drive = getDriveClient();
  const { data } = await drive.files.get({
    fileId: googleFileId,
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

/** Stream download nội dung file → trả ReadableStream để route proxy về client. */
async function getDownloadStream(googleFileId) {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId: googleFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return res.data; // Node stream
}

/** Lấy startPageToken (lần đầu của 1 root). */
async function getStartPageToken() {
  const drive = getDriveClient();
  const { data } = await drive.changes.getStartPageToken({ supportsAllDrives: true });
  return data.startPageToken;
}

/** List changes incremental từ pageToken. Trả về { changes, newStartPageToken, nextPageToken }. */
async function listChanges(pageToken) {
  const drive = getDriveClient();
  const { data } = await drive.changes.list({
    pageToken,
    pageSize: 1000,
    fields: `nextPageToken,newStartPageToken,changes(fileId,removed,time,file(${FILE_FIELDS}))`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    spaces: 'drive',
  });
  return data;
}

module.exports = {
  isConfigured,
  getDriveClient,
  getRootFolderId,
  ensureScopeFolderOnDrive,
  createFolder,
  uploadFile,
  renameItem,
  moveItem,
  trashItem,
  untrashItem,
  deleteForever,
  getFileMeta,
  getDownloadStream,
  getStartPageToken,
  listChanges,
  FOLDER_MIME,
};

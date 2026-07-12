/**
 * Google Drive service — hỗ trợ 2 chế độ xác thực:
 *
 *  (A) Service Account (khuyến nghị cho Workspace tổ chức):
 *      - GDRIVE_SERVICE_ACCOUNT_JSON: chuỗi JSON đầy đủ key.json (prod).
 *      - hoặc GDRIVE_SERVICE_ACCOUNT_FILE: đường dẫn file key.json (dev local).
 *      - GDRIVE_IMPERSONATE_USER (tuỳ chọn, domain-wide delegation).
 *      - Folder gốc PHẢI share Editor cho service-account email.
 *      - File thuộc về service account, không dùng quota cá nhân.
 *
 *  (B) OAuth Refresh Token (dễ thiết lập với 1 tài khoản Gmail/Workspace cá nhân):
 *      - GDRIVE_OAUTH_CLIENT_ID, GDRIVE_OAUTH_CLIENT_SECRET, GDRIVE_OAUTH_REFRESH_TOKEN.
 *      - Lấy 3 giá trị trên qua https://developers.google.com/oauthplayground
 *        + Chọn scope: https://www.googleapis.com/auth/drive (KHUYẾN NGHỊ — không dùng drive.file
 *          vì scope đó chỉ cho phép truy cập file do app tạo).
 *      - File sẽ thuộc về user đã uỷ quyền, dùng quota của user (15GB Free hoặc theo Workspace).
 *      - Folder gốc lấy từ Drive của chính user đó.
 *
 *  GDRIVE_ROOT_FOLDER_ID: id folder gốc (bắt buộc, cả 2 chế độ).
 *
 * Ưu tiên: Service Account → OAuth (nếu cả hai cùng đặt thì service account thắng).
 *
 * Module trả về null nếu chưa cấu hình → routes phải bắt và trả 503 thân thiện.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { JWT, OAuth2Client } = require('google-auth-library');
const config = require('../config');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

let _client = null;
let _initError = null;
let _authMode = null;

function loadServiceAccountCreds() {
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

function hasServiceAccountConfig() {
  return !!(config.gdriveServiceAccountJson || config.gdriveServiceAccountFile);
}

function hasOauthConfig() {
  return !!(config.gdriveOauthClientId && config.gdriveOauthClientSecret && config.gdriveOauthRefreshToken);
}

function isConfigured() {
  return (hasServiceAccountConfig() || hasOauthConfig()) && !!config.gdriveRootFolderId;
}

function getAuthMode() {
  if (_authMode) return _authMode;
  if (hasServiceAccountConfig()) _authMode = 'service_account';
  else if (hasOauthConfig()) _authMode = 'oauth';
  else _authMode = 'none';
  return _authMode;
}

function getDriveClient() {
  if (_client) return _client;
  if (_initError) throw _initError;
  try {
    const mode = getAuthMode();
    if (mode === 'service_account') {
      const creds = loadServiceAccountCreds();
      if (!creds) throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON/_FILE không hợp lệ');
      const auth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: SCOPES,
        subject: config.gdriveImpersonateUser || undefined,
      });
      _client = google.drive({ version: 'v3', auth });
      return _client;
    }
    if (mode === 'oauth') {
      const oauth2 = new OAuth2Client(config.gdriveOauthClientId, config.gdriveOauthClientSecret);
      oauth2.setCredentials({ refresh_token: config.gdriveOauthRefreshToken });
      // google-auth-library tự gọi /token để refresh access_token khi cần.
      _client = google.drive({ version: 'v3', auth: oauth2 });
      return _client;
    }
    _initError = new Error('Google Drive chưa được cấu hình (cần Service Account JSON hoặc OAuth refresh token)');
    throw _initError;
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
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,parents,trashed,webViewLink,thumbnailLink,iconLink,hasThumbnail,modifiedTime,createdTime,version';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';

const GOOGLE_CREATE_KINDS = {
  doc: GOOGLE_DOC_MIME,
  sheet: GOOGLE_SHEET_MIME,
  slides: GOOGLE_SLIDES_MIME,
};

/** Export Google Docs/Sheets/Slides → PDF để xem trong app (không cần login Google). */
const GOOGLE_EXPORT_PDF = {
  [GOOGLE_DOC_MIME]: 'application/pdf',
  [GOOGLE_SHEET_MIME]: 'application/pdf',
  [GOOGLE_SLIDES_MIME]: 'application/pdf',
};

function isGoogleNativeExportable(mimeType) {
  return !!GOOGLE_EXPORT_PDF[mimeType];
}

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
 *
 * Cấu trúc mới — phân loại theo cây tổ chức:
 *   - scope='user'     → <Cty>/Khu vực/<KV>/Phòng ban/<PB>/Nhân viên/<Tên NV>
 *   - scope='company'  → <Cty>/                                       (root cấp công ty)
 *   - scope='shared'   → shared/<rootName>                            (Drive chung tự do)
 *
 * Helper `driveOrgPath` lo phần tra cứu user → cty/khu vực/phòng ban và tạo từng cấp idempotent.
 */
async function ensureScopeFolderOnDrive({ scope, ownerId, name }) {
  const rootId = getRootFolderId();
  if (scope === 'user') {
    const orgPath = require('../helpers/driveOrgPath');
    const res = await orgPath.ensureUserOrgPath(ownerId);
    return { google_folder_id: res.google_folder_id, name: res.name, segments: res.segments, org: res.org };
  }
  if (scope === 'company') {
    const orgPath = require('../helpers/driveOrgPath');
    const res = await orgPath.ensureCompanyOrgPath(ownerId);
    return { google_folder_id: res.google_folder_id, name: res.name, segments: res.segments };
  }
  if (scope === 'shared') {
    const bucket = await createFolder({ parentId: rootId, name: 'shared' });
    const leaf = await createFolder({ parentId: bucket.id, name: String(name || ownerId) });
    return { google_folder_id: leaf.id, name: leaf.name };
  }
  throw new Error('Scope không hợp lệ: ' + scope);
}

/** Tạo Google Docs / Sheets / Slides trống. */
async function createGoogleFile({ parentId, name, googleMimeType }) {
  const drive = getDriveClient();
  const { data } = await drive.files.create({
    requestBody: { name, mimeType: googleMimeType, parents: [parentId] },
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  return data;
}

/** URL embed chỉnh sửa Google Doc/Sheet/Slides trong iframe CRM (giữ đủ menu + thanh công cụ). */
function buildGoogleEditEmbedUrl(googleFileId, mimeType) {
  const id = googleFileId;
  const qs = 'usp=drivesdk&embedded=true';
  if (mimeType === GOOGLE_DOC_MIME) {
    return `https://docs.google.com/document/d/${id}/edit?${qs}`;
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    return `https://docs.google.com/spreadsheets/d/${id}/edit?${qs}`;
  }
  if (mimeType === GOOGLE_SLIDES_MIME) {
    return `https://docs.google.com/presentation/d/${id}/edit?${qs}`;
  }
  return null;
}

/** URL embed xem PDF / file trên Google Drive trong iframe (zoom, lật trang). */
function buildDriveFilePreviewEmbedUrl(googleFileId) {
  return `https://drive.google.com/file/d/${googleFileId}/preview?usp=drivesdk&embedded=true`;
}

/**
 * Chia sẻ link công khai để embed Google Docs/Sheets chỉnh sửa trong iframe (không bắt login CRM).
 * Idempotent — bỏ qua nếu permission đã tồn tại.
 */
async function ensureAnyoneLinkAccess(googleFileId, role = 'writer') {
  const drive = getDriveClient();
  try {
    await drive.permissions.create({
      fileId: googleFileId,
      requestBody: { type: 'anyone', role },
      supportsAllDrives: true,
    });
  } catch (e) {
    const msg = String(e?.message || e?.errors?.[0]?.reason || '');
    if (msg.includes('already exists') || msg.includes('duplicate') || e?.code === 409) return;
    console.warn('[gdrive] ensureAnyoneLinkAccess:', msg);
  }
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
async function getDownloadStream(googleFileId, { range } = {}) {
  const drive = getDriveClient();
  const opts = { responseType: 'stream' };
  if (range) opts.headers = { Range: range };
  const res = await drive.files.get(
    { fileId: googleFileId, alt: 'media', supportsAllDrives: true },
    opts,
  );
  return {
    stream: res.data,
    status: res.status,
    contentRange: res.headers['content-range'],
    contentLength: res.headers['content-length'],
  };
}

/**
 * Google Docs/Sheets/Slides → export PDF stream (xem trong app, không iframe Google).
 * File thường → getDownloadStream.
 */
async function getPreviewStream(googleFileId, mimeType) {
  const exportMime = GOOGLE_EXPORT_PDF[mimeType];
  if (!exportMime) {
    const { stream } = await getDownloadStream(googleFileId);
    return { stream, contentType: mimeType || 'application/octet-stream' };
  }
  const drive = getDriveClient();
  const res = await drive.files.export(
    { fileId: googleFileId, mimeType: exportMime },
    { responseType: 'stream' },
  );
  return { stream: res.data, contentType: exportMime };
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

/** Liệt kê file/folder con trực tiếp trên Google Drive (không qua DB). */
async function listChildren(parentId, { pageSize = 200 } = {}) {
  if (!parentId) return [];
  const drive = getDriveClient();
  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: 'name',
  });
  return data.files || [];
}

module.exports = {
  isConfigured,
  getAuthMode,
  getDriveClient,
  getRootFolderId,
  ensureScopeFolderOnDrive,
  createFolder,
  createGoogleFile,
  buildGoogleEditEmbedUrl,
  buildDriveFilePreviewEmbedUrl,
  ensureAnyoneLinkAccess,
  uploadFile,
  renameItem,
  moveItem,
  trashItem,
  untrashItem,
  deleteForever,
  getFileMeta,
  getDownloadStream,
  getPreviewStream,
  isGoogleNativeExportable,
  getStartPageToken,
  listChanges,
  listChildren,
  FOLDER_MIME,
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDES_MIME,
  GOOGLE_CREATE_KINDS,
};

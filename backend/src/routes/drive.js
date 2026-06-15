/**
 * Module Drive — REST API.
 *
 *   GET    /api/drive/health                       - check config GDrive
 *   GET    /api/drive/roots                        - roots user truy cập được
 *   POST   /api/drive/roots                        - tạo Drive chung (cần permission drive.manage_shared)
 *   POST   /api/drive/roots/ensure-personal        - đảm bảo Drive cá nhân của user
 *   POST   /api/drive/roots/ensure-company         - đảm bảo Drive công ty của user (admin)
 *
 *   GET    /api/drive/folders/:id/children         - list folder+file con
 *   GET    /api/drive/folders/by-root/:rootId/children - list ngay dưới root
 *   GET    /api/drive/breadcrumb/folder/:id        - breadcrumb folder
 *   GET    /api/drive/breadcrumb/file/:id          - breadcrumb file
 *
 *   POST   /api/drive/folders                      - tạo folder mới
 *   PATCH  /api/drive/folders/:id                  - đổi tên / di chuyển
 *   DELETE /api/drive/folders/:id                  - trash
 *
 *   POST   /api/drive/files/upload                 - upload (multipart, field 'file', body folder_id|root_id)
 *   GET    /api/drive/files/:id                    - metadata
 *   GET    /api/drive/files/:id/download           - proxy stream
 *   GET    /api/drive/files/:id/preview            - link/iframe (Google webViewLink)
 *   PATCH  /api/drive/files/:id                    - đổi tên / di chuyển
 *   DELETE /api/drive/files/:id                    - trash
 *
 *   POST   /api/drive/share                        - cấp quyền cho user/dept/company/role
 *   DELETE /api/drive/share/:id
 *   GET    /api/drive/share/:target_type/:target_id  - list ACL của 1 target
 *   GET    /api/drive/shared-with-me
 *
 *   GET    /api/drive/search?q=&mime=&root_id=
 *   GET    /api/drive/recent
 *   GET    /api/drive/starred
 *   POST   /api/drive/stars                        - { target_type, target_id }
 *   DELETE /api/drive/stars/:target_type/:target_id
 *
 *   GET    /api/drive/trash?root_id=
 *   POST   /api/drive/files/:id/restore
 *   POST   /api/drive/folders/:id/restore
 *   DELETE /api/drive/files/:id/forever
 *   DELETE /api/drive/folders/:id/forever
 *
 *   GET    /api/drive/activity?target_type=&target_id=
 *   GET    /api/drive/activity/feed
 *
 *   POST   /api/drive/links                        - { file_id, entity_type, entity_id, note? }
 *   DELETE /api/drive/links/:id
 *   GET    /api/drive/links/by-entity/:entity_type/:entity_id
 *   GET    /api/drive/links/by-file/:file_id
 */

const { Router } = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const gdrive = require('../services/googleDrive');
const driveAcl = require('../helpers/drivePermissions');
const { logDriveActivity } = require('../helpers/driveActivity');
const { isAdminLike } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const MB = 1024 * 1024;
const MAX_UPLOAD_BYTES = (() => {
  const raw = parseInt(process.env.MAX_UPLOAD_VIDEO_MB || '1024', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : 1024;
  return Math.min(mb * MB, 5120 * MB);
})();

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) =>
      cb(null, `gdrive_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function fixFilename(originalname) {
  try {
    const utf8 = Buffer.from(originalname, 'latin1').toString('utf8');
    if (utf8 && !utf8.includes('\uFFFD') && utf8 !== originalname) return utf8;
  } catch (_) {}
  return originalname;
}

function requireGdrive(req, res) {
  if (!gdrive.isConfigured()) {
    res.status(503).json({
      error:
        'Google Drive chưa được cấu hình. Vui lòng cấu hình GDRIVE_SERVICE_ACCOUNT_JSON (hoặc _FILE) và GDRIVE_ROOT_FOLDER_ID, sau đó share folder gốc cho service account email.',
      code: 'GDRIVE_NOT_CONFIGURED',
    });
    return false;
  }
  return true;
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function getOwnerCompanyId(req) {
  return req.user?.company_id || null;
}

async function loadRoot(rootId) {
  if (!isUuid(rootId)) return null;
  const { data } = await supabase.from('drive_roots').select('*').eq('id', rootId).maybeSingle();
  return data || null;
}

async function loadFolder(id) {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('drive_folders').select('*').eq('id', id).maybeSingle();
  return data || null;
}

async function loadFile(id) {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('drive_files').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════
r.get('/health', async (req, res) => {
  res.json({
    configured: gdrive.isConfigured(),
    auth_mode: gdrive.getAuthMode(),
    root_folder_id: gdrive.isConfigured() ? require('../config').gdriveRootFolderId : null,
  });
});

// ═══════════════════════════════════════════════════════════════════
// ROOTS
// ═══════════════════════════════════════════════════════════════════

r.get('/roots', async (req, res) => {
  try {
    const roots = await driveAcl.listAccessibleRoots(req.user);
    res.json({ roots });
  } catch (e) {
    console.error('drive list roots error:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Tạo Drive chung mới — chỉ user có drive.manage_shared (hoặc admin). */
r.post('/roots', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { name, scope = 'shared' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu name' });
    if (!['shared'].includes(scope)) {
      return res.status(400).json({ error: 'POST /roots chỉ cho phép tạo scope=shared. Dùng /roots/ensure-* cho user/company' });
    }
    if (!isAdminLike(req.user)) {
      // TODO: check drive.manage_shared qua RPC user_has_permission khi sẵn sàng.
      // Hiện tại: chỉ admin tạo được.
      return res.status(403).json({ error: 'Cần quyền drive.manage_shared để tạo Drive chung' });
    }
    const folder = await gdrive.ensureScopeFolderOnDrive({ scope: 'shared', name });
    const { data, error } = await supabase
      .from('drive_roots')
      .insert({
        scope: 'shared',
        owner_id: null,
        name,
        google_folder_id: folder.google_folder_id,
        created_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) throw error;
    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: data.id, targetName: data.name, rootId: data.id });
    res.status(201).json({ root: data });
  } catch (e) {
    console.error('create root error:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Tạo/lấy Drive cá nhân của chính user. */
r.post('/roots/ensure-personal', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const userId = req.user.userId || req.user.id;
    const existing = await supabase
      .from('drive_roots')
      .select('*')
      .eq('scope', 'user')
      .eq('owner_id', userId)
      .maybeSingle();
    if (existing.data) return res.json({ root: existing.data });

    const folder = await gdrive.ensureScopeFolderOnDrive({ scope: 'user', ownerId: userId });
    const { data, error } = await supabase
      .from('drive_roots')
      .insert({
        scope: 'user',
        owner_id: userId,
        name: 'Drive của tôi',
        google_folder_id: folder.google_folder_id,
        created_by: userId,
      })
      .select()
      .single();
    if (error) {
      // Race condition: 2 request đồng thời cùng tạo — bên kia đã thành công, mình lấy lại record đó.
      if (error.code === '23505') {
        const { data: dup } = await supabase
          .from('drive_roots')
          .select('*')
          .eq('scope', 'user')
          .eq('owner_id', userId)
          .maybeSingle();
        if (dup) return res.json({ root: dup });
      }
      throw error;
    }
    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: data.id, targetName: data.name, rootId: data.id });
    res.status(201).json({ root: data });
  } catch (e) {
    console.error('ensure-personal error:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Tạo/lấy Drive công ty (theo company_id của user). */
r.post('/roots/ensure-company', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const companyId = await getOwnerCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'User chưa có company_id' });

    const existing = await supabase
      .from('drive_roots')
      .select('*')
      .eq('scope', 'company')
      .eq('owner_id', companyId)
      .maybeSingle();
    if (existing.data) return res.json({ root: existing.data });

    // Chỉ admin hoặc có drive.manage_shared mới tự ý tạo cho company.
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Cần quyền quản lý để tạo Drive công ty' });
    }

    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle();
    const folder = await gdrive.ensureScopeFolderOnDrive({ scope: 'company', ownerId: companyId });
    const { data, error } = await supabase
      .from('drive_roots')
      .insert({
        scope: 'company',
        owner_id: companyId,
        name: company?.name ? `Drive ${company.name}` : 'Drive công ty',
        google_folder_id: folder.google_folder_id,
        created_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        const { data: dup } = await supabase
          .from('drive_roots')
          .select('*')
          .eq('scope', 'company')
          .eq('owner_id', companyId)
          .maybeSingle();
        if (dup) return res.json({ root: dup });
      }
      throw error;
    }
    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: data.id, targetName: data.name, rootId: data.id });
    res.status(201).json({ root: data });
  } catch (e) {
    console.error('ensure-company error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LIST / NAVIGATION
// ═══════════════════════════════════════════════════════════════════

async function listChildrenForRootOrFolder({ rootId, folderId, includeTrashed = false }) {
  const baseFolderQuery = supabase.from('drive_folders').select('*').order('name');
  const baseFileQuery = supabase.from('drive_files').select('*').order('name');

  const folderQ = folderId
    ? baseFolderQuery.eq('parent_id', folderId)
    : baseFolderQuery.eq('root_id', rootId).is('parent_id', null);
  const fileQ = folderId
    ? baseFileQuery.eq('folder_id', folderId)
    : baseFileQuery.eq('root_id', rootId).is('folder_id', null);

  if (!includeTrashed) {
    folderQ.is('trashed_at', null);
    fileQ.is('trashed_at', null);
  }

  const [foldersRes, filesRes] = await Promise.all([folderQ, fileQ]);
  return { folders: foldersRes.data || [], files: filesRes.data || [] };
}

r.get('/folders/:id/children', async (req, res) => {
  try {
    const folder = await loadFolder(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền truy cập folder' });
    const out = await listChildrenForRootOrFolder({ rootId: folder.root_id, folderId: folder.id });
    res.json({ ...out, role: access.role, folder });
  } catch (e) {
    console.error('list children error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/folders/by-root/:rootId/children', async (req, res) => {
  try {
    const root = await loadRoot(req.params.rootId);
    if (!root) return res.status(404).json({ error: 'Root không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'root', targetId: root.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền truy cập Drive' });
    const out = await listChildrenForRootOrFolder({ rootId: root.id });
    res.json({ ...out, role: access.role, root });
  } catch (e) {
    console.error('list root children error:', e);
    res.status(500).json({ error: e.message });
  }
});

async function breadcrumbForFolder(folderId) {
  const chain = [];
  let id = folderId;
  const visited = new Set();
  while (id && !visited.has(id)) {
    visited.add(id);
    const { data } = await supabase
      .from('drive_folders')
      .select('id,name,parent_id,root_id')
      .eq('id', id)
      .maybeSingle();
    if (!data) break;
    chain.unshift({ type: 'folder', id: data.id, name: data.name, root_id: data.root_id });
    id = data.parent_id;
  }
  if (chain.length) {
    const rootId = chain[0].root_id;
    const { data: root } = await supabase.from('drive_roots').select('id,name,scope').eq('id', rootId).maybeSingle();
    if (root) chain.unshift({ type: 'root', id: root.id, name: root.name, scope: root.scope });
  }
  return chain;
}

r.get('/breadcrumb/folder/:id', async (req, res) => {
  try {
    const chain = await breadcrumbForFolder(req.params.id);
    res.json({ breadcrumb: chain });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/breadcrumb/file/:id', async (req, res) => {
  try {
    const f = await loadFile(req.params.id);
    if (!f) return res.status(404).json({ error: 'File không tồn tại' });
    const chain = f.folder_id ? await breadcrumbForFolder(f.folder_id) : [];
    if (!chain.length && f.root_id) {
      const { data: root } = await supabase.from('drive_roots').select('id,name,scope').eq('id', f.root_id).maybeSingle();
      if (root) chain.push({ type: 'root', id: root.id, name: root.name, scope: root.scope });
    }
    chain.push({ type: 'file', id: f.id, name: f.name });
    res.json({ breadcrumb: chain });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FOLDERS - CRUD
// ═══════════════════════════════════════════════════════════════════

r.post('/folders', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { root_id, parent_id, name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Thiếu tên folder' });
    if (!parent_id && !root_id) return res.status(400).json({ error: 'Cần parent_id hoặc root_id' });

    let parentFolder = null;
    let root = null;
    let parentGoogleId;
    if (parent_id) {
      parentFolder = await loadFolder(parent_id);
      if (!parentFolder) return res.status(404).json({ error: 'parent_id không tồn tại' });
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: parentFolder.id, requiredRole: 'editor' });
      if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor trên folder cha' });
      parentGoogleId = parentFolder.google_folder_id;
      root = await loadRoot(parentFolder.root_id);
    } else {
      root = await loadRoot(root_id);
      if (!root) return res.status(404).json({ error: 'root_id không tồn tại' });
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'root', targetId: root.id, requiredRole: 'editor' });
      if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor trên Drive' });
      parentGoogleId = root.google_folder_id;
    }

    const folder = await gdrive.createFolder({ parentId: parentGoogleId, name });
    const { data, error } = await supabase
      .from('drive_folders')
      .insert({
        root_id: root.id,
        parent_id: parentFolder?.id || null,
        name: folder.name,
        google_folder_id: folder.id,
        created_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) throw error;
    await logDriveActivity({ user: req.user, action: 'create_folder', targetType: 'folder', targetId: data.id, targetName: data.name, rootId: data.root_id });
    res.status(201).json({ folder: data });
  } catch (e) {
    console.error('create folder error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.patch('/folders/:id', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const folder = await loadFolder(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });

    const { name, parent_id } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    let action = null;

    if (name && name !== folder.name) {
      await gdrive.renameItem(folder.google_folder_id, name);
      patch.name = name;
      action = 'rename';
    }
    if (parent_id !== undefined && parent_id !== folder.parent_id) {
      let newParentGoogleId;
      let oldParentGoogleId;
      if (parent_id === null) {
        const root = await loadRoot(folder.root_id);
        newParentGoogleId = root.google_folder_id;
      } else {
        const newParent = await loadFolder(parent_id);
        if (!newParent) return res.status(404).json({ error: 'parent_id mới không tồn tại' });
        if (newParent.root_id !== folder.root_id) {
          return res.status(400).json({ error: 'Di chuyển sang Drive khác chưa hỗ trợ' });
        }
        const moveAccess = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: newParent.id, requiredRole: 'editor' });
        if (!moveAccess.ok) return res.status(403).json({ error: 'Cần quyền editor trên folder đích' });
        newParentGoogleId = newParent.google_folder_id;
      }
      if (folder.parent_id) {
        const oldParent = await loadFolder(folder.parent_id);
        oldParentGoogleId = oldParent?.google_folder_id;
      } else {
        const root = await loadRoot(folder.root_id);
        oldParentGoogleId = root?.google_folder_id;
      }
      await gdrive.moveItem(folder.google_folder_id, newParentGoogleId, oldParentGoogleId);
      patch.parent_id = parent_id;
      action = action ? 'move' : 'move';
    }

    const { data, error } = await supabase
      .from('drive_folders')
      .update(patch)
      .eq('id', folder.id)
      .select()
      .single();
    if (error) throw error;
    if (action) await logDriveActivity({ user: req.user, action, targetType: 'folder', targetId: data.id, targetName: data.name, rootId: data.root_id });
    res.json({ folder: data });
  } catch (e) {
    console.error('patch folder error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/folders/:id', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const folder = await loadFolder(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });

    await gdrive.trashItem(folder.google_folder_id);
    const trashedAt = new Date().toISOString();
    const { error } = await supabase
      .from('drive_folders')
      .update({ trashed_at: trashedAt, trashed_by: req.user.userId || null })
      .eq('id', folder.id);
    if (error) throw error;

    // Cascade trash: file/folder con cũng đánh dấu trashed (Drive đã tự ẩn).
    // Note: trash đệ quy đơn giản — đệ quy 1 cấp đủ để UI ẩn; sync job sẽ cập nhật sâu hơn.
    await supabase.from('drive_files').update({ trashed_at: trashedAt, trashed_by: req.user.userId || null }).eq('folder_id', folder.id).is('trashed_at', null);
    await supabase.from('drive_folders').update({ trashed_at: trashedAt, trashed_by: req.user.userId || null }).eq('parent_id', folder.id).is('trashed_at', null);

    await logDriveActivity({ user: req.user, action: 'trash', targetType: 'folder', targetId: folder.id, targetName: folder.name, rootId: folder.root_id });
    res.json({ ok: true });
  } catch (e) {
    console.error('trash folder error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FILES - upload / metadata / download / preview / rename / move / trash
// ═══════════════════════════════════════════════════════════════════

r.post('/files/upload', diskUpload.single('file'), async (req, res) => {
  if (!requireGdrive(req, res)) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return;
  }
  let cleanupPath = req.file?.path || null;
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
    const { folder_id, root_id, name } = req.body || {};
    if (!folder_id && !root_id) return res.status(400).json({ error: 'Cần folder_id hoặc root_id' });

    let folder = null;
    let root = null;
    let parentGoogleId;
    if (folder_id) {
      folder = await loadFolder(folder_id);
      if (!folder) return res.status(404).json({ error: 'folder_id không tồn tại' });
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'editor' });
      if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });
      parentGoogleId = folder.google_folder_id;
      root = await loadRoot(folder.root_id);
    } else {
      root = await loadRoot(root_id);
      if (!root) return res.status(404).json({ error: 'root_id không tồn tại' });
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'root', targetId: root.id, requiredRole: 'editor' });
      if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });
      parentGoogleId = root.google_folder_id;
    }

    const safeName = name || fixFilename(req.file.originalname);
    const stream = fs.createReadStream(req.file.path);
    const uploaded = await gdrive.uploadFile({
      parentId: parentGoogleId,
      name: safeName,
      mimeType: req.file.mimetype,
      stream,
    });

    const { data, error } = await supabase
      .from('drive_files')
      .insert({
        root_id: root.id,
        folder_id: folder?.id || null,
        name: uploaded.name,
        mime_type: uploaded.mimeType || req.file.mimetype,
        size_bytes: parseInt(uploaded.size || req.file.size || 0, 10) || 0,
        google_file_id: uploaded.id,
        google_view_url: uploaded.webViewLink || null,
        thumbnail_url: uploaded.thumbnailLink || null,
        md5: uploaded.md5Checksum || null,
        version: 1,
        uploaded_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) throw error;

    fs.unlink(req.file.path, () => {});
    cleanupPath = null;

    await logDriveActivity({ user: req.user, action: 'upload', targetType: 'file', targetId: data.id, targetName: data.name, rootId: data.root_id, meta: { size: data.size_bytes } });
    res.status(201).json({ file: data });
  } catch (e) {
    console.error('upload file error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    if (cleanupPath) fs.unlink(cleanupPath, () => {});
  }
});

r.get('/files/:id', async (req, res) => {
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    res.json({ file, role: access.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/files/:id/download', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });

    const stream = await gdrive.getDownloadStream(file.google_file_id);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    stream.on('error', (err) => {
      console.error('gdrive stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Lỗi tải file' });
      else res.end();
    });
    stream.pipe(res);
    await logDriveActivity({ user: req.user, action: 'download', targetType: 'file', targetId: file.id, targetName: file.name, rootId: file.root_id });
  } catch (e) {
    console.error('download file error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

r.get('/files/:id/preview', async (req, res) => {
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    await logDriveActivity({ user: req.user, action: 'open', targetType: 'file', targetId: file.id, targetName: file.name, rootId: file.root_id });
    res.json({
      view_url: file.google_view_url,
      thumbnail_url: file.thumbnail_url,
      embed_url: file.google_view_url ? file.google_view_url.replace('/view', '/preview') : null,
      mime_type: file.mime_type,
      name: file.name,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/files/:id', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });

    const { name, folder_id } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    let action = null;

    if (name && name !== file.name) {
      await gdrive.renameItem(file.google_file_id, name);
      patch.name = name;
      action = 'rename';
    }
    if (folder_id !== undefined && folder_id !== file.folder_id) {
      let newParentGoogleId;
      let oldParentGoogleId;
      if (folder_id === null) {
        const root = await loadRoot(file.root_id);
        newParentGoogleId = root.google_folder_id;
      } else {
        const newFolder = await loadFolder(folder_id);
        if (!newFolder) return res.status(404).json({ error: 'folder_id mới không tồn tại' });
        if (newFolder.root_id !== file.root_id) return res.status(400).json({ error: 'Di chuyển sang Drive khác chưa hỗ trợ' });
        const moveAccess = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: newFolder.id, requiredRole: 'editor' });
        if (!moveAccess.ok) return res.status(403).json({ error: 'Cần quyền editor trên folder đích' });
        newParentGoogleId = newFolder.google_folder_id;
      }
      if (file.folder_id) {
        const oldFolder = await loadFolder(file.folder_id);
        oldParentGoogleId = oldFolder?.google_folder_id;
      } else {
        const root = await loadRoot(file.root_id);
        oldParentGoogleId = root?.google_folder_id;
      }
      await gdrive.moveItem(file.google_file_id, newParentGoogleId, oldParentGoogleId);
      patch.folder_id = folder_id;
      action = action ? 'move' : 'move';
    }

    const { data, error } = await supabase
      .from('drive_files')
      .update(patch)
      .eq('id', file.id)
      .select()
      .single();
    if (error) throw error;
    if (action) await logDriveActivity({ user: req.user, action, targetType: 'file', targetId: data.id, targetName: data.name, rootId: data.root_id });
    res.json({ file: data });
  } catch (e) {
    console.error('patch file error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/files/:id', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });

    await gdrive.trashItem(file.google_file_id);
    await supabase
      .from('drive_files')
      .update({ trashed_at: new Date().toISOString(), trashed_by: req.user.userId || null })
      .eq('id', file.id);
    await logDriveActivity({ user: req.user, action: 'trash', targetType: 'file', targetId: file.id, targetName: file.name, rootId: file.root_id });
    res.json({ ok: true });
  } catch (e) {
    console.error('trash file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SHARING (ACL)
// ═══════════════════════════════════════════════════════════════════

r.post('/share', async (req, res) => {
  try {
    const { target_type, target_id, principal_type, principal_id = null, role = 'viewer' } = req.body || {};
    if (!['folder', 'file', 'root'].includes(target_type)) return res.status(400).json({ error: 'target_type không hợp lệ' });
    if (!isUuid(target_id)) return res.status(400).json({ error: 'target_id không hợp lệ' });
    if (!['user', 'department', 'company', 'role', 'everyone'].includes(principal_type)) return res.status(400).json({ error: 'principal_type không hợp lệ' });
    if (!['viewer', 'commenter', 'editor', 'owner'].includes(role)) return res.status(400).json({ error: 'role không hợp lệ' });
    if (principal_type !== 'everyone' && !isUuid(principal_id)) return res.status(400).json({ error: 'principal_id không hợp lệ' });

    const access = await driveAcl.canAccess({ user: req.user, targetType: target_type, targetId: target_id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor để chia sẻ' });

    const { data, error } = await supabase
      .from('drive_acl')
      .upsert(
        {
          target_type,
          target_id,
          principal_type,
          principal_id: principal_type === 'everyone' ? null : principal_id,
          role,
          granted_by: req.user.userId || null,
        },
        { onConflict: 'target_type,target_id,principal_type,principal_id' },
      )
      .select()
      .single();
    if (error) {
      // Conflict expression dùng cột generated — nếu lỗi thì fallback insert tay.
      const { data: existing } = await supabase
        .from('drive_acl')
        .select('id')
        .eq('target_type', target_type)
        .eq('target_id', target_id)
        .eq('principal_type', principal_type)
        .is('principal_id', principal_type === 'everyone' ? null : undefined)
        .eq('principal_id', principal_type === 'everyone' ? null : principal_id)
        .maybeSingle();
      if (existing) {
        const { data: upd } = await supabase
          .from('drive_acl')
          .update({ role, granted_by: req.user.userId || null })
          .eq('id', existing.id)
          .select()
          .single();
        await logDriveActivity({ user: req.user, action: 'share', targetType: target_type, targetId: target_id, meta: { principal_type, principal_id, role } });
        return res.json({ acl: upd });
      }
      throw error;
    }

    await logDriveActivity({ user: req.user, action: 'share', targetType: target_type, targetId: target_id, meta: { principal_type, principal_id, role } });
    res.status(201).json({ acl: data });
  } catch (e) {
    console.error('share error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/share/:id', async (req, res) => {
  try {
    const { data: row } = await supabase.from('drive_acl').select('*').eq('id', req.params.id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'ACL không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: row.target_type, targetId: row.target_id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });
    await supabase.from('drive_acl').delete().eq('id', req.params.id);
    await logDriveActivity({ user: req.user, action: 'unshare', targetType: row.target_type, targetId: row.target_id, meta: { principal_type: row.principal_type, principal_id: row.principal_id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/share/:target_type/:target_id', async (req, res) => {
  try {
    const { target_type, target_id } = req.params;
    const access = await driveAcl.canAccess({ user: req.user, targetType: target_type, targetId: target_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    const { data } = await supabase
      .from('drive_acl')
      .select('*')
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .order('created_at', { ascending: false });
    res.json({ acls: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/shared-with-me', async (req, res) => {
  try {
    const principals = await driveAcl.resolveUserPrincipals(req.user);
    const ors = [];
    if (principals.user_id) ors.push(`and(principal_type.eq.user,principal_id.eq.${principals.user_id})`);
    if (principals.dept_ids.length) ors.push(`and(principal_type.eq.department,principal_id.in.(${principals.dept_ids.join(',')}))`);
    if (principals.role_ids.length) ors.push(`and(principal_type.eq.role,principal_id.in.(${principals.role_ids.join(',')}))`);
    if (!ors.length) return res.json({ files: [], folders: [] });

    const { data: acls } = await supabase.from('drive_acl').select('*').or(ors.join(','));
    const fileIds = (acls || []).filter((a) => a.target_type === 'file').map((a) => a.target_id);
    const folderIds = (acls || []).filter((a) => a.target_type === 'folder').map((a) => a.target_id);

    const [filesRes, foldersRes] = await Promise.all([
      fileIds.length ? supabase.from('drive_files').select('*').in('id', fileIds).is('trashed_at', null) : Promise.resolve({ data: [] }),
      folderIds.length ? supabase.from('drive_folders').select('*').in('id', folderIds).is('trashed_at', null) : Promise.resolve({ data: [] }),
    ]);
    res.json({ files: filesRes.data || [], folders: foldersRes.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SEARCH / RECENT / STARRED
// ═══════════════════════════════════════════════════════════════════

r.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const mime = (req.query.mime || '').toString().trim();
    const rootId = (req.query.root_id || '').toString().trim();
    if (!q && !mime) return res.json({ files: [], folders: [] });

    const roots = await driveAcl.listAccessibleRoots(req.user);
    const allowedRootIds = roots.map((r) => r.id);
    if (rootId && !allowedRootIds.includes(rootId)) return res.status(403).json({ error: 'Không có quyền truy cập root' });
    const filterRoots = rootId ? [rootId] : allowedRootIds;
    if (!filterRoots.length) return res.json({ files: [], folders: [] });

    const fileQ = supabase.from('drive_files').select('*').in('root_id', filterRoots).is('trashed_at', null).limit(100);
    if (q) fileQ.ilike('name', `%${q}%`);
    if (mime) fileQ.ilike('mime_type', `${mime}%`);

    const folderQ = supabase.from('drive_folders').select('*').in('root_id', filterRoots).is('trashed_at', null).limit(50);
    if (q) folderQ.ilike('name', `%${q}%`);

    const [files, folders] = await Promise.all([fileQ, folderQ]);
    res.json({ files: files.data || [], folders: folders.data || [] });
  } catch (e) {
    console.error('search error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const uid = req.user.userId || req.user.id;
    const { data } = await supabase
      .from('drive_activity_log')
      .select('*')
      .eq('actor_id', uid)
      .in('action', ['upload', 'download', 'open', 'rename'])
      .eq('target_type', 'file')
      .order('created_at', { ascending: false })
      .limit(limit * 3);

    const seen = new Set();
    const ids = [];
    for (const row of data || []) {
      if (!seen.has(row.target_id)) { seen.add(row.target_id); ids.push(row.target_id); }
      if (ids.length >= limit) break;
    }
    if (!ids.length) return res.json({ files: [] });
    const { data: files } = await supabase.from('drive_files').select('*').in('id', ids).is('trashed_at', null);
    const indexMap = new Map(ids.map((id, i) => [id, i]));
    files?.sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));
    res.json({ files: files || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/starred', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    const { data: stars } = await supabase
      .from('drive_stars')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    const fileIds = (stars || []).filter((s) => s.target_type === 'file').map((s) => s.target_id);
    const folderIds = (stars || []).filter((s) => s.target_type === 'folder').map((s) => s.target_id);
    const [filesRes, foldersRes] = await Promise.all([
      fileIds.length ? supabase.from('drive_files').select('*').in('id', fileIds).is('trashed_at', null) : Promise.resolve({ data: [] }),
      folderIds.length ? supabase.from('drive_folders').select('*').in('id', folderIds).is('trashed_at', null) : Promise.resolve({ data: [] }),
    ]);
    res.json({ files: filesRes.data || [], folders: foldersRes.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/stars', async (req, res) => {
  try {
    const { target_type, target_id } = req.body || {};
    if (!['file', 'folder'].includes(target_type) || !isUuid(target_id)) return res.status(400).json({ error: 'Tham số không hợp lệ' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: target_type, targetId: target_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    const uid = req.user.userId || req.user.id;
    const { error } = await supabase.from('drive_stars').upsert({ user_id: uid, target_type, target_id });
    if (error) throw error;
    await logDriveActivity({ user: req.user, action: 'star', targetType: target_type, targetId: target_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/stars/:target_type/:target_id', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    const { target_type, target_id } = req.params;
    await supabase.from('drive_stars').delete().eq('user_id', uid).eq('target_type', target_type).eq('target_id', target_id);
    await logDriveActivity({ user: req.user, action: 'unstar', targetType: target_type, targetId: target_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// TRASH / RESTORE / DELETE FOREVER
// ═══════════════════════════════════════════════════════════════════

r.get('/trash', async (req, res) => {
  try {
    const rootId = (req.query.root_id || '').toString().trim();
    const roots = await driveAcl.listAccessibleRoots(req.user);
    const allowedRootIds = roots.map((r) => r.id);
    if (rootId && !allowedRootIds.includes(rootId)) return res.status(403).json({ error: 'Không có quyền' });
    const ids = rootId ? [rootId] : allowedRootIds;
    if (!ids.length) return res.json({ files: [], folders: [] });

    const [filesRes, foldersRes] = await Promise.all([
      supabase.from('drive_files').select('*').in('root_id', ids).not('trashed_at', 'is', null).order('trashed_at', { ascending: false }).limit(500),
      supabase.from('drive_folders').select('*').in('root_id', ids).not('trashed_at', 'is', null).order('trashed_at', { ascending: false }).limit(500),
    ]);
    res.json({ files: filesRes.data || [], folders: foldersRes.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/files/:id/restore', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });
    await gdrive.untrashItem(file.google_file_id);
    await supabase.from('drive_files').update({ trashed_at: null, trashed_by: null }).eq('id', file.id);
    await logDriveActivity({ user: req.user, action: 'restore', targetType: 'file', targetId: file.id, targetName: file.name, rootId: file.root_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/folders/:id/restore', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const folder = await loadFolder(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'editor' });
    if (!access.ok) return res.status(403).json({ error: 'Cần quyền editor' });
    await gdrive.untrashItem(folder.google_folder_id);
    await supabase.from('drive_folders').update({ trashed_at: null, trashed_by: null }).eq('id', folder.id);
    await logDriveActivity({ user: req.user, action: 'restore', targetType: 'folder', targetId: folder.id, targetName: folder.name, rootId: folder.root_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/files/:id/forever', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    if (!isAdminLike(req.user)) {
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'owner' });
      if (!access.ok) return res.status(403).json({ error: 'Chỉ owner/admin được xoá vĩnh viễn' });
    }
    try { await gdrive.deleteForever(file.google_file_id); } catch (e) { console.warn('gdrive deleteForever:', e.message); }
    await supabase.from('drive_files').delete().eq('id', file.id);
    await logDriveActivity({ user: req.user, action: 'delete_forever', targetType: 'file', targetId: file.id, targetName: file.name, rootId: file.root_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/folders/:id/forever', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const folder = await loadFolder(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder không tồn tại' });
    if (!isAdminLike(req.user)) {
      const access = await driveAcl.canAccess({ user: req.user, targetType: 'folder', targetId: folder.id, requiredRole: 'owner' });
      if (!access.ok) return res.status(403).json({ error: 'Chỉ owner/admin được xoá vĩnh viễn' });
    }
    try { await gdrive.deleteForever(folder.google_folder_id); } catch (e) { console.warn('gdrive deleteForever:', e.message); }
    await supabase.from('drive_folders').delete().eq('id', folder.id);
    await logDriveActivity({ user: req.user, action: 'delete_forever', targetType: 'folder', targetId: folder.id, targetName: folder.name, rootId: folder.root_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════════════════════════

r.get('/activity', async (req, res) => {
  try {
    const { target_type, target_id, limit = 100 } = req.query;
    if (!['folder', 'file', 'root'].includes(target_type) || !isUuid(target_id)) return res.status(400).json({ error: 'Tham số không hợp lệ' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: target_type, targetId: target_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });

    const { data } = await supabase
      .from('drive_activity_log')
      .select('*, actor:users!drive_activity_log_actor_id_fkey(id,full_name,email,avatar_url)')
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit, 10) || 100, 500));
    res.json({ activity: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/activity/feed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
    const roots = await driveAcl.listAccessibleRoots(req.user);
    const rootIds = roots.map((r) => r.id);
    if (!rootIds.length) return res.json({ activity: [] });
    const { data } = await supabase
      .from('drive_activity_log')
      .select('*, actor:users!drive_activity_log_actor_id_fkey(id,full_name,email,avatar_url)')
      .in('root_id', rootIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    res.json({ activity: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ENTITY LINKS (gắn file Drive vào lead/task/project/...)
// ═══════════════════════════════════════════════════════════════════

r.post('/links', async (req, res) => {
  try {
    const { file_id, entity_type, entity_id, note } = req.body || {};
    if (!isUuid(file_id) || !entity_type || !isUuid(entity_id)) return res.status(400).json({ error: 'Tham số không hợp lệ' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền với file' });

    const { data, error } = await supabase
      .from('drive_entity_links')
      .upsert(
        { file_id, entity_type, entity_id, note: note || null, created_by: req.user.userId || null },
        { onConflict: 'file_id,entity_type,entity_id' },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ link: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/links/:id', async (req, res) => {
  try {
    const { data: row } = await supabase.from('drive_entity_links').select('*').eq('id', req.params.id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Link không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: row.file_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('drive_entity_links').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/links/by-entity/:entity_type/:entity_id', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    const { data: links } = await supabase
      .from('drive_entity_links')
      .select('*, file:drive_files(*)')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .order('created_at', { ascending: false });

    // Filter files user có quyền xem.
    const out = [];
    for (const lnk of links || []) {
      if (!lnk.file) continue;
      const ac = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: lnk.file_id, requiredRole: 'viewer' });
      if (ac.ok) out.push(lnk);
    }
    res.json({ links: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/links/by-file/:file_id', async (req, res) => {
  try {
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: req.params.file_id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });
    const { data } = await supabase
      .from('drive_entity_links')
      .select('*')
      .eq('file_id', req.params.file_id)
      .order('created_at', { ascending: false });
    res.json({ links: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

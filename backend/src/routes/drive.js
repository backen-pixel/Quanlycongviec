/**
 * Module Drive — REST API.
 *
 *   GET    /api/drive/health                       - check config GDrive
 *   GET    /api/drive/roots                        - roots user truy cập được
 *   POST   /api/drive/roots                        - tạo Drive chung (cần permission drive.manage_shared)
 *   POST   /api/drive/roots/ensure-personal        - đảm bảo Drive cá nhân của user (Cty→KV→PB→NV)
 *   POST   /api/drive/roots/ensure-company         - đảm bảo Drive công ty của user (admin)
 *   POST   /api/drive/roots/ensure-shared-company  - đảm bảo Drive CHUNG công ty (auto viewer cho cty)
 *   POST   /api/drive/roots/ensure-shared-region   - đảm bảo Drive CHUNG khu vực (auto viewer cho region)
 *   POST   /api/drive/roots/reset-personal         - xoá metadata Drive cá nhân để tạo lại theo cấu trúc mới
 *
 *   GET    /api/drive/org-tree                     - cây Module → Cty → KV → Loại → PB → NV
 *   GET    /api/drive/modules                      - danh sách module Drive cố định
 *   POST   /api/drive/org/ensure-user-drive        - admin: tạo trước Drive cá nhân cho 1 user khác
 *   PATCH  /api/drive/admin/user-module/:userId    - admin: set module Drive cho user
 *   PATCH  /api/drive/admin/dept-category/:id      - admin: set "Loại" Drive cho phòng ban
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
 *   POST   /api/drive/entity/upload                - multipart: file + entity_type + entity_id
 *                                                     → upload vào folder entity (Mod/Cty/KV/Loại/PB/NV/Kind/Mã) và auto link
 *   POST   /api/drive/links                        - { file_id, entity_type, entity_id, note? }
 *   DELETE /api/drive/links/:id
 *   GET    /api/drive/links/count-by-entity/:entity_type/:entity_id
 *   GET    /api/drive/links/by-entity/:entity_type/:entity_id
 *   GET    /api/drive/links/by-file/:file_id
 */

const { Router } = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supabase } = require('../config/supabase');
const { auth, authWithQueryToken } = require('../middleware/auth');
const { fetchFreshThumbnailLink, getThumbnailStream } = require('../helpers/driveThumbnail');
const gdrive = require('../services/googleDrive');
const driveAcl = require('../helpers/drivePermissions');
const driveOrgPath = require('../helpers/driveOrgPath');
const driveEntityFolder = require('../helpers/driveEntityFolder');
const { logDriveActivity } = require('../helpers/driveActivity');
const { isAdminLike } = require('../helpers/adminRole');

const r = Router();

/** Proxy thumbnail — `<img>` dùng access_token query; fallback khi URL Google trực tiếp lỗi. */
r.get('/files/:id/thumbnail', authWithQueryToken, async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });

    const thumb = await getThumbnailStream(file.google_file_id, { mimeType: file.mime_type });
    if (!thumb?.stream) return res.status(404).json({ error: 'Không có thumbnail' });

    if (thumb.freshThumbnailLink) {
      void supabase.from('drive_files')
        .update({ thumbnail_url: thumb.freshThumbnailLink, updated_at: new Date().toISOString() })
        .eq('id', file.id);
    }

    res.setHeader('Content-Type', thumb.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    let aborted = false;
    req.on('close', () => {
      if (!res.writableEnded) {
        aborted = true;
        try { thumb.stream.destroy(); } catch (_) {}
      }
    });
    thumb.stream.on('error', (err) => {
      if (aborted || err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      console.error('[drive] thumbnail stream:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Lỗi thumbnail' });
      else res.end();
    });
    thumb.stream.pipe(res);
  } catch (e) {
    console.error('[drive] thumbnail:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

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

async function getUserDriveModule(userId) {
  if (!userId) return 'other';
  try {
    const { data } = await supabase.from('users').select('drive_module').eq('id', userId).maybeSingle();
    if (data?.drive_module) return String(data.drive_module).toLowerCase();
  } catch (_) {}
  return 'other';
}

/** Tìm hoặc tạo bản ghi drive_roots cho folder shared (module/công ty/khu vực). */
async function upsertSharedRootFromPath({ sp, shared_kind, company_id, region_id, module_key, created_by }) {
  let { data: existing } = await supabase
    .from('drive_roots')
    .select('*')
    .eq('google_folder_id', sp.google_folder_id)
    .maybeSingle();
  if (existing) {
    await supabase
      .from('drive_roots')
      .update({
        module_key,
        shared_kind,
        company_id: company_id || null,
        region_id: region_id || null,
        name: sp.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return { root: existing, created: false };
  }
  const ins = await supabase
    .from('drive_roots')
    .insert({
      scope: 'shared',
      owner_id: null,
      name: sp.name,
      google_folder_id: sp.google_folder_id,
      module_key,
      shared_kind,
      company_id: company_id || null,
      region_id: region_id || null,
      created_by: created_by || null,
    })
    .select()
    .single();
  if (ins.error) throw ins.error;
  return { root: ins.data, created: true };
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

/** Tạo/lấy Drive cá nhân của chính user (folder Drive được lồng theo Cty→KV→PB→NV). */
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
    if (existing.data) {
      let root = existing.data;
      let relocated = false;
      try {
        const synced = await driveOrgPath.syncUserDriveOrg(userId);
        relocated = !!synced?.relocated;
        if (synced?.google_folder_id && synced.google_folder_id !== root.google_folder_id) {
          const { data: updated } = await supabase
            .from('drive_roots')
            .update({
              google_folder_id: synced.google_folder_id,
              name: synced.name || root.name,
              updated_at: new Date().toISOString(),
            })
            .eq('id', root.id)
            .select()
            .single();
          if (updated) root = updated;
        } else if (relocated) {
          const { data: updated } = await supabase
            .from('drive_roots')
            .select('*')
            .eq('id', root.id)
            .maybeSingle();
          if (updated) root = updated;
        }
      } catch (e) {
        console.warn('ensure-personal sync org path:', e.message);
      }
      let orgInfo = null;
      try { orgInfo = await driveOrgPath.getUserOrgInfo(userId); } catch (_) {}
      return res.json({ root, org: orgInfo, relocated });
    }

    const folder = await gdrive.ensureScopeFolderOnDrive({ scope: 'user', ownerId: userId });
    // Tên Drive = tên NV để dễ nhận diện trong list "Roots".
    const driveName = folder.org?.employee_name || folder.name || 'Drive của tôi';
    const { data, error } = await supabase
      .from('drive_roots')
      .insert({
        scope: 'user',
        owner_id: userId,
        name: driveName,
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
        if (dup) return res.json({ root: dup, org: folder.org || null });
      }
      throw error;
    }
    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: data.id, targetName: data.name, rootId: data.id });
    res.status(201).json({ root: data, org: folder.org || null, segments: folder.segments || [] });
  } catch (e) {
    console.error('ensure-personal error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Reset Drive cá nhân: xoá row drive_roots cũ để lần `ensure-personal` kế tiếp tạo lại theo cấu trúc Cty→KV→PB→NV mới.
 * Lưu ý: folder cũ trên GDrive vẫn còn — admin/người dùng phải tự xoá thủ công nếu muốn.
 * Yêu cầu: chính chủ hoặc admin.
 */
r.post('/roots/reset-personal', async (req, res) => {
  try {
    const targetUserId = (req.body?.user_id && isUuid(req.body.user_id)) ? req.body.user_id : (req.user.userId || req.user.id);
    const me = req.user.userId || req.user.id;
    if (targetUserId !== me && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được reset Drive của người khác' });
    }
    const { data: root } = await supabase
      .from('drive_roots')
      .select('*')
      .eq('scope', 'user')
      .eq('owner_id', targetUserId)
      .maybeSingle();
    if (!root) return res.json({ ok: true, removed: false });

    // Xoá mirror metadata + acl thuộc về root này (file GDrive thực tế vẫn còn).
    await supabase.from('drive_files').delete().eq('root_id', root.id);
    await supabase.from('drive_folders').delete().eq('root_id', root.id);
    await supabase.from('drive_acl').delete().eq('target_type', 'root').eq('target_id', root.id);
    await supabase.from('drive_roots').delete().eq('id', root.id);
    res.json({ ok: true, removed: true });
  } catch (e) {
    console.error('reset-personal error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tạo/lấy Drive công ty.
 *   - Body { company_id }: admin chỉ định company khác (ví dụ từ org-tree).
 *   - Không truyền: dùng company_id của user đang đăng nhập.
 */
r.post('/roots/ensure-company', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const bodyCompanyId = req.body?.company_id;
    let companyId;
    if (bodyCompanyId) {
      if (!isUuid(bodyCompanyId)) return res.status(400).json({ error: 'company_id không hợp lệ' });
      const myCompanyId = await getOwnerCompanyId(req);
      if (bodyCompanyId !== myCompanyId && !isAdminLike(req.user)) {
        return res.status(403).json({ error: 'Chỉ admin được tạo Drive cho công ty khác' });
      }
      companyId = bodyCompanyId;
    } else {
      companyId = await getOwnerCompanyId(req);
      if (!companyId) return res.status(400).json({ error: 'User chưa có company_id. Vui lòng truyền company_id trong body hoặc gán company cho user.' });
    }

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
        name: company?.name || folder.name || 'Drive công ty',
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
  const files = await enrichFilesWithUploaders(filesRes.data || []);
  return { folders: foldersRes.data || [], files };
}

/** Gắn thông tin user (full_name, email, avatar) vào mảng file qua uploaded_by. */
async function enrichFilesWithUploaders(files) {
  if (!Array.isArray(files) || !files.length) return files || [];
  const userIds = [...new Set(files.map((f) => f.uploaded_by).filter(Boolean))];
  const usersById = new Map();
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id,full_name,email,avatar')
      .in('id', userIds);
    for (const u of users || []) usersById.set(u.id, u);
  }
  return files.map((f) => ({
    ...f,
    uploader: f.uploaded_by ? (usersById.get(f.uploaded_by) || { id: f.uploaded_by, full_name: null, email: null, avatar: null }) : null,
  }));
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

/** Breadcrumb folder entity (Lead/Deal/Dự án…) — luôn trả folder gốc entity. */
r.get('/breadcrumb/entity/:entity_type/:entity_id', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    const queryFolderId = req.query.folder_id;
    if (queryFolderId && isUuid(String(queryFolderId))) {
      const chain = await breadcrumbForFolder(queryFolderId);
      return res.json({ breadcrumb: chain, folder_id: queryFolderId });
    }
    const ctx = await driveEntityFolder.ensureEntityDriveContext({
      entityType: entity_type,
      entityId: entity_id,
      uploaderUserId: req.user.userId || req.user.id,
    });
    const chain = await breadcrumbForFolder(ctx.entityMirror.id);
    res.json({
      breadcrumb: chain,
      folder_id: ctx.entityMirror.id,
      entity_folder_id: ctx.entityMirror.id,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Duyệt folder + file trong cây entity (tab Drive chi tiết Lead/Deal). */
r.get('/entity/:entity_type/:entity_id/children', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { entity_type, entity_id } = req.params;
    if (!entity_type || !isUuid(entity_id)) {
      return res.status(400).json({ error: 'entity_type / entity_id không hợp lệ' });
    }
    const ctx = await driveEntityFolder.ensureEntityDriveContext({
      entityType: entity_type,
      entityId: entity_id,
      uploaderUserId: req.user.userId || req.user.id,
    });
    const browseFolderId = req.query.folder_id || ctx.entityMirror.id;
    const target = await driveEntityFolder.resolveEntityTargetFolder(ctx, browseFolderId);
    const out = await listChildrenForRootOrFolder({
      rootId: target.root.id,
      folderId: target.folder.id,
    });
    const breadcrumb = await breadcrumbForFolder(target.folder.id);
    res.json({
      ...out,
      folder: target.folder,
      entity_folder_id: ctx.entityMirror.id,
      breadcrumb,
    });
  } catch (e) {
    console.error('[drive] entity children:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Tạo thư mục con trong folder entity. */
r.post('/entity/:entity_type/:entity_id/folders', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { entity_type, entity_id } = req.params;
    const { name, parent_folder_id } = req.body || {};
    if (!entity_type || !isUuid(entity_id)) {
      return res.status(400).json({ error: 'entity_type / entity_id không hợp lệ' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Thiếu tên thư mục' });
    }
    const ctx = await driveEntityFolder.ensureEntityDriveContext({
      entityType: entity_type,
      entityId: entity_id,
      uploaderUserId: req.user.userId || req.user.id,
    });
    const parentId = parent_folder_id || ctx.entityMirror.id;
    const parentTarget = await driveEntityFolder.resolveEntityTargetFolder(ctx, parentId);
    const created = await gdrive.createFolder({
      parentId: parentTarget.googleParentId,
      name: String(name).trim(),
    });
    const { data, error } = await supabase
      .from('drive_folders')
      .insert({
        root_id: parentTarget.root.id,
        parent_id: parentTarget.folder.id,
        name: created.name,
        google_folder_id: created.id,
        created_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) throw error;
    await logDriveActivity({
      user: req.user,
      action: 'create_folder',
      targetType: 'folder',
      targetId: data.id,
      targetName: data.name,
      rootId: data.root_id,
      meta: { entity_type, entity_id },
    });
    res.status(201).json({ folder: data });
  } catch (e) {
    console.error('[drive] entity create folder:', e.message);
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

/**
 * Tạo Google Docs / Sheets / Slides trống trong folder hoặc root hiện tại.
 * Body: { folder_id?, root_id?, kind: 'doc'|'sheet'|'slides', name? }
 */
r.post('/files/create-google', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { folder_id, root_id, kind, name } = req.body || {};
    const googleMime = gdrive.GOOGLE_CREATE_KINDS[kind];
    if (!googleMime) return res.status(400).json({ error: 'kind phải là doc, sheet hoặc slides' });
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

    const defaultNames = { doc: 'Tài liệu mới', sheet: 'Bảng tính mới', slides: 'Trình chiếu mới' };
    const fileName = (name || defaultNames[kind] || 'File mới').trim();

    const created = await gdrive.createGoogleFile({
      parentId: parentGoogleId,
      name: fileName,
      googleMimeType: googleMime,
    });

    const { data, error } = await supabase
      .from('drive_files')
      .insert({
        root_id: root.id,
        folder_id: folder?.id || null,
        name: created.name,
        mime_type: created.mimeType || googleMime,
        size_bytes: parseInt(created.size || 0, 10) || 0,
        google_file_id: created.id,
        google_view_url: created.webViewLink || null,
        thumbnail_url: created.thumbnailLink || null,
        md5: created.md5Checksum || null,
        version: 1,
        uploaded_by: req.user.userId || null,
      })
      .select()
      .single();
    if (error) throw error;

    const [enriched] = await enrichFilesWithUploaders([data]);
    await gdrive.ensureAnyoneLinkAccess(created.id, 'writer');
    const edit_embed_url = gdrive.buildGoogleEditEmbedUrl(created.id, googleMime);
    await logDriveActivity({
      user: req.user, action: 'upload', targetType: 'file', targetId: data.id,
      targetName: data.name, rootId: data.root_id, meta: { kind, google: true },
    });
    res.status(201).json({
      file: enriched || data,
      edit_url: created.webViewLink || null,
      edit_embed_url,
      preview: {
        preview_mode: 'google_edit',
        edit_embed_url,
        edit_url: created.webViewLink || null,
        mime_type: googleMime,
      },
    });
  } catch (e) {
    console.error('create-google file error:', e);
    res.status(500).json({ error: e.message });
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

/** Lấy thumbnailLink mới từ Google, cập nhật DB — frontend gọi khi URL cũ lỗi. */
r.post('/files/:id/refresh-thumbnail', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });

    const fresh = await fetchFreshThumbnailLink(file.google_file_id);
    if (fresh.thumbnail_url) {
      await supabase.from('drive_files')
        .update({ thumbnail_url: fresh.thumbnail_url, updated_at: new Date().toISOString() })
        .eq('id', file.id);
    }
    res.json({ thumbnail_url: fresh.thumbnail_url || null });
  } catch (e) {
    console.error('[drive] refresh-thumbnail:', e.message);
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

    const googleNative = gdrive.isGoogleNativeExportable(file.mime_type);
    if (googleNative) {
      await gdrive.ensureAnyoneLinkAccess(file.google_file_id, 'writer');
      const edit_embed_url = gdrive.buildGoogleEditEmbedUrl(file.google_file_id, file.mime_type);
      return res.json({
        view_url: file.google_view_url,
        edit_url: file.google_view_url || null,
        edit_embed_url,
        thumbnail_url: file.thumbnail_url,
        embed_url: null,
        preview_mode: 'google_edit',
        mime_type: file.mime_type,
        name: file.name,
      });
    }

    const isPdf = file.mime_type === 'application/pdf'
      || String(file.name || '').toLowerCase().endsWith('.pdf');
    if (isPdf) {
      await gdrive.ensureAnyoneLinkAccess(file.google_file_id, 'reader');
      const edit_embed_url = gdrive.buildDriveFilePreviewEmbedUrl(file.google_file_id);
      return res.json({
        view_url: file.google_view_url,
        edit_url: file.google_view_url || null,
        edit_embed_url,
        embed_url: edit_embed_url,
        thumbnail_url: file.thumbnail_url,
        preview_mode: 'google_edit',
        mime_type: file.mime_type,
        name: file.name,
      });
    }

    res.json({
      view_url: file.google_view_url,
      edit_url: file.google_view_url || null,
      thumbnail_url: file.thumbnail_url,
      embed_url: file.google_view_url ? file.google_view_url.replace('/view', '/preview') : null,
      preview_mode: file.google_view_url ? 'iframe' : 'download',
      mime_type: file.mime_type,
      name: file.name,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Stream nội dung xem trước — Google Doc/Sheet export PDF qua API (không cần login Google). */
r.get('/files/:id/preview-content', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    const access = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: file.id, requiredRole: 'viewer' });
    if (!access.ok) return res.status(403).json({ error: 'Không có quyền' });

    const { stream, contentType } = await gdrive.getPreviewStream(file.google_file_id, file.mime_type);
    res.setHeader('Content-Type', contentType);
    const inlineName = contentType === 'application/pdf'
      ? `${file.name.replace(/\.[^.]+$/, '') || file.name}.pdf`
      : file.name;
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(inlineName)}`);
    stream.on('error', (err) => {
      console.error('preview stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Lỗi xem trước file' });
      else res.end();
    });
    stream.pipe(res);
  } catch (e) {
    console.error('preview-content error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
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

/**
 * Tạo/lấy Drive CHUNG cho 1 công ty (theo module).
 *   Path GDrive: <Module>/<Cty>/_Tài liệu chung công ty/
 *   Lưu drive_roots scope='shared'. Auto cấp ACL viewer cho company tương ứng.
 *
 * Body: { company_id, module_key? = 'other', editor_role_ids?: [], editor_user_ids?: [] }
 *   - editor_user_ids/editor_role_ids: cấp quyền editor ngay khi tạo (mặc định admin của hệ thống có quyền).
 */
r.post('/roots/ensure-shared-company', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { company_id, module_key = 'other', editor_user_ids = [], editor_role_ids = [] } = req.body || {};
    if (!isUuid(company_id)) return res.status(400).json({ error: 'company_id không hợp lệ' });
    const myCompanyId = await getOwnerCompanyId(req);
    if (company_id !== myCompanyId && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được tạo Drive chung cho công ty khác' });
    }

    // 1) Tạo folder GDrive
    const sp = await driveOrgPath.ensureSharedCompanyPath({ companyId: company_id, moduleKey: module_key });

    const modKey = (module_key || 'other').toLowerCase();
    const { root, created } = await upsertSharedRootFromPath({
      sp,
      shared_kind: 'shared_company',
      company_id,
      region_id: null,
      module_key: modKey,
      created_by: req.user.userId || null,
    });

    // 3) Auto cấp ACL: tất cả user trong company → viewer.
    await supabase
      .from('drive_acl')
      .upsert(
        { target_type: 'root', target_id: root.id, principal_type: 'company', principal_id: company_id, role: 'viewer', granted_by: req.user.userId || null },
        { onConflict: 'target_type,target_id,principal_type,principal_id' },
      );

    // 4) Editor extras
    for (const uid of (editor_user_ids || []).filter(isUuid)) {
      await supabase
        .from('drive_acl')
        .upsert(
          { target_type: 'root', target_id: root.id, principal_type: 'user', principal_id: uid, role: 'editor', granted_by: req.user.userId || null },
          { onConflict: 'target_type,target_id,principal_type,principal_id' },
        );
    }
    for (const rid of (editor_role_ids || []).filter(isUuid)) {
      await supabase
        .from('drive_acl')
        .upsert(
          { target_type: 'root', target_id: root.id, principal_type: 'role', principal_id: rid, role: 'editor', granted_by: req.user.userId || null },
          { onConflict: 'target_type,target_id,principal_type,principal_id' },
        );
    }

    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: root.id, targetName: root.name, rootId: root.id, meta: { kind: 'shared_company', company_id, module_key: modKey } });
    res.status(created ? 201 : 200).json({ root, segments: sp.segments, scope: 'shared_company', company_id, module_key: modKey });
  } catch (e) {
    console.error('ensure-shared-company error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tạo/lấy Drive CHUNG cho 1 khu vực (theo module).
 *   Path GDrive: <Module>/<Cty>/Khu vực/<KV>/_Tài liệu chung khu vực/
 *   Auto ACL viewer cho region.
 *
 * Body: { region_id, module_key? = 'other', editor_user_ids?: [], editor_role_ids?: [] }
 */
r.post('/roots/ensure-shared-region', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { region_id, module_key = 'other', editor_user_ids = [], editor_role_ids = [] } = req.body || {};
    if (!isUuid(region_id)) return res.status(400).json({ error: 'region_id không hợp lệ' });

    const myCompanyId = await getOwnerCompanyId(req);
    const region = await driveOrgPath.getRegionInfo(region_id);
    if (!region) return res.status(404).json({ error: 'Khu vực không tồn tại' });
    if (region.company_id !== myCompanyId && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được tạo Drive khu vực thuộc công ty khác' });
    }

    const sp = await driveOrgPath.ensureSharedRegionPath({ regionId: region_id, moduleKey: module_key });
    const modKey = (module_key || 'other').toLowerCase();
    const { root, created } = await upsertSharedRootFromPath({
      sp,
      shared_kind: 'shared_region',
      company_id: region.company_id,
      region_id,
      module_key: modKey,
      created_by: req.user.userId || null,
    });

    // Auto ACL: region viewer
    await supabase
      .from('drive_acl')
      .upsert(
        { target_type: 'root', target_id: root.id, principal_type: 'region', principal_id: region_id, role: 'viewer', granted_by: req.user.userId || null },
        { onConflict: 'target_type,target_id,principal_type,principal_id' },
      );

    for (const uid of (editor_user_ids || []).filter(isUuid)) {
      await supabase
        .from('drive_acl')
        .upsert(
          { target_type: 'root', target_id: root.id, principal_type: 'user', principal_id: uid, role: 'editor', granted_by: req.user.userId || null },
          { onConflict: 'target_type,target_id,principal_type,principal_id' },
        );
    }
    for (const rid of (editor_role_ids || []).filter(isUuid)) {
      await supabase
        .from('drive_acl')
        .upsert(
          { target_type: 'root', target_id: root.id, principal_type: 'role', principal_id: rid, role: 'editor', granted_by: req.user.userId || null },
          { onConflict: 'target_type,target_id,principal_type,principal_id' },
        );
    }

    await logDriveActivity({ user: req.user, action: 'create_root', targetType: 'root', targetId: root.id, targetName: root.name, rootId: root.id, meta: { kind: 'shared_region', region_id, module_key } });
    res.status(created ? 201 : 200).json({ root, segments: sp.segments, scope: 'shared_region', region_id, module_key: modKey });
  } catch (e) {
    console.error('ensure-shared-region error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ORG TREE — duyệt Drive theo Công ty → Khu vực → Phòng ban → Nhân viên
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/drive/org-tree
 *   Trả về cây tổ chức theo module: Module → Công ty → Khu vực → Nhân viên.
 *
 *   Query: ?module=crm (admin lọc module; user thường chỉ thấy module của mình)
 *
 *   Response:
 *     {
 *       my_module: 'crm',
 *       modules: [
 *         { key, name, companies: [
 *           { id, name, shared_root_id?, regions: [
 *             { id, name, shared_root_id?, employees: [
 *               { id, name, avatar, drive_root_id? }
 *             ] }
 *           ] }
 *         ] }
 *       ]
 *     }
 *
 *   Drive chung công ty (module → công ty): auto tạo + ACL viewer cho công ty khi user thuộc công ty đó.
 */
r.get('/org-tree', async (req, res) => {
  try {
    const isAdmin = isAdminLike(req.user);
    const meCompanyId = await getOwnerCompanyId(req);
    const myModuleKey = await getUserDriveModule(req.user.userId || req.user.id);
    const queryModule = req.query.module ? String(req.query.module).toLowerCase() : null;
    const filterModule = queryModule
      ? queryModule
      : (isAdmin ? null : myModuleKey);

    let companyQ = supabase.from('companies').select('id,name').order('name');
    if (!isAdmin && meCompanyId) companyQ = companyQ.eq('id', meCompanyId);
    let { data: companies = [] } = await companyQ;
    if (filterModule) {
      companies = await driveOrgPath.filterCompaniesForDriveModule(companies, filterModule);
    }
    if (!companies.length) return res.json({ my_module: myModuleKey, modules: [], filter_module: filterModule || null });
    const companyIds = companies.map((c) => c.id);

    const [regionsRes, usersRes, deptsRes] = await Promise.all([
      supabase
        .from('company_regions')
        .select('id,name,company_id,order_index,is_active')
        .in('company_id', companyIds)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .order('name'),
      supabase
        .from('users')
        .select('id,full_name,email,avatar,company_id,department_id,drive_module,is_active')
        .in('company_id', companyIds)
        .order('full_name', { nullsFirst: false }),
      supabase
        .from('departments')
        .select('id,name,company_id,drive_category')
        .in('company_id', companyIds)
        .order('name'),
    ]);
    const regions = regionsRes.data || [];
    const departments = deptsRes.data || [];
    let users = (usersRes.data || []).filter((u) => u.is_active !== false);

    let sharedRoots = [];
    const sharedRootsRes = await supabase
      .from('drive_roots')
      .select('id,module_key,company_id,region_id,shared_kind')
      .eq('scope', 'shared')
      .in('shared_kind', ['shared_company', 'shared_region']);
    if (!sharedRootsRes.error) {
      sharedRoots = sharedRootsRes.data || [];
    }

    // Lọc user theo module khi cần
    if (filterModule) {
      users = users.filter((u) => (u.drive_module || 'other').toLowerCase() === filterModule);
    }

    const userIds = users.map((u) => u.id);
    const { data: ucr = [] } = userIds.length
      ? await supabase.from('user_company_regions').select('user_id,region_id').in('user_id', userIds)
      : { data: [] };
    const regionByUser = new Map();
    const regionCompany = new Map(regions.map((r) => [r.id, r.company_id]));
    for (const row of ucr) {
      const u = users.find((x) => x.id === row.user_id);
      if (!u) continue;
      if (regionCompany.get(row.region_id) !== u.company_id) continue;
      if (!regionByUser.has(row.user_id)) regionByUser.set(row.user_id, row.region_id);
    }

    const { data: userRoots = [] } = userIds.length
      ? await supabase.from('drive_roots').select('id,owner_id').eq('scope', 'user').in('owner_id', userIds)
      : { data: [] };
    const rootByUser = new Map(userRoots.map((r) => [r.owner_id, r.id]));

    const sharedCompanyByKey = new Map();
    const sharedRegionByKey = new Map();
    for (const sr of sharedRoots) {
      const mk = (sr.module_key || 'other').toLowerCase();
      if (sr.shared_kind === 'shared_company' && sr.company_id) {
        sharedCompanyByKey.set(`${mk}:${sr.company_id}`, sr.id);
      }
      if (sr.shared_kind === 'shared_region' && sr.region_id) {
        sharedRegionByKey.set(`${mk}:${sr.region_id}`, sr.id);
      }
    }

    // Auto đảm bảo Drive chung công ty cho module + công ty của user hiện tại
    if (meCompanyId && myModuleKey && gdrive.isConfigured()) {
      const autoKey = `${myModuleKey}:${meCompanyId}`;
      if (!sharedCompanyByKey.has(autoKey) && (!filterModule || filterModule === myModuleKey)) {
        try {
          const sp = await driveOrgPath.ensureSharedCompanyPath({ companyId: meCompanyId, moduleKey: myModuleKey });
          const { root } = await upsertSharedRootFromPath({
            sp,
            shared_kind: 'shared_company',
            company_id: meCompanyId,
            region_id: null,
            module_key: myModuleKey,
            created_by: req.user.userId || null,
          });
          await supabase
            .from('drive_acl')
            .upsert(
              { target_type: 'root', target_id: root.id, principal_type: 'company', principal_id: meCompanyId, role: 'viewer', granted_by: req.user.userId || null },
              { onConflict: 'target_type,target_id,principal_type,principal_id' },
            );
          sharedCompanyByKey.set(autoKey, root.id);
        } catch (e) {
          console.warn('org-tree auto ensure shared company:', e.message);
        }
      }
    }

    const userNode = (u) => ({
      id: u.id,
      name: u.full_name || u.email || u.id,
      avatar: u.avatar || null,
      drive_root_id: rootByUser.get(u.id) || null,
    });

    const tree = [];

    function ensureBranch(moduleKey, moduleName) {
      let mod = tree.find((m) => m.key === moduleKey);
      if (!mod) { mod = { key: moduleKey, name: moduleName, companies: [] }; tree.push(mod); }
      return mod;
    }

    for (const co of companies) {
      const compUsers = users.filter((u) => u.company_id === co.id);
      const byModule = new Map();
      for (const u of compUsers) {
        const mk = (u.drive_module || 'other').toLowerCase();
        if (!byModule.has(mk)) byModule.set(mk, []);
        byModule.get(mk).push(u);
      }

      for (const [moduleKey, modUsers] of byModule.entries()) {
        if (filterModule && moduleKey !== filterModule) continue;
        const moduleName = driveOrgPath.moduleLabel(moduleKey);
        const mod = ensureBranch(moduleKey, moduleName);

        let compNode = mod.companies.find((c) => c.id === co.id);
        if (!compNode) {
          compNode = {
            id: co.id,
            name: co.name,
            shared_root_id: sharedCompanyByKey.get(`${moduleKey}:${co.id}`) || null,
            regions: [],
          };
          mod.companies.push(compNode);
        }

        const byRegion = new Map();
        for (const u of modUsers) {
          const rid = regionByUser.get(u.id) || null;
          if (!byRegion.has(rid)) byRegion.set(rid, []);
          byRegion.get(rid).push(u);
        }

        for (const [regionId, regionUsers] of byRegion.entries()) {
          const region = regionId ? regions.find((r) => r.id === regionId) : null;
          const regionName = region?.name || 'Chưa phân loại khu vực';
          let regionNode = compNode.regions.find((r) => (r.id || null) === regionId);
          if (!regionNode) {
            regionNode = {
              id: regionId,
              name: regionName,
              shared_root_id: regionId ? (sharedRegionByKey.get(`${moduleKey}:${regionId}`) || null) : null,
              categories: [],
            };
            compNode.regions.push(regionNode);
          }

          const byCategory = new Map();
          for (const u of regionUsers) {
            const dept = u.department_id ? departments.find((d) => d.id === u.department_id) : null;
            const catName = dept?.drive_category || 'Chưa phân loại';
            if (!byCategory.has(catName)) byCategory.set(catName, []);
            byCategory.get(catName).push({ user: u, dept });
          }

          for (const [catName, catUsers] of byCategory.entries()) {
            let catNode = regionNode.categories.find((c) => c.name === catName);
            if (!catNode) {
              catNode = { name: catName, departments: [] };
              regionNode.categories.push(catNode);
            }

            const byDept = new Map();
            for (const { user: u, dept } of catUsers) {
              const deptId = dept?.id || null;
              const deptName = dept?.name || 'Chưa phân loại phòng ban';
              const deptKey = deptId || deptName;
              if (!byDept.has(deptKey)) byDept.set(deptKey, { id: deptId, name: deptName, users: [] });
              byDept.get(deptKey).users.push(u);
            }

            for (const [, deptGroup] of byDept.entries()) {
              let deptNode = catNode.departments.find((d) => (d.id || d.name) === (deptGroup.id || deptGroup.name));
              if (!deptNode) {
                deptNode = { id: deptGroup.id, name: deptGroup.name, employees: [] };
                catNode.departments.push(deptNode);
              }
              for (const u of deptGroup.users) deptNode.employees.push(userNode(u));
              deptNode.employees.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
            }
            catNode.departments.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
          }
          regionNode.categories.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        }
        compNode.regions.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      }
    }

    const ORDER = ['crm', 'sx', 'vc', 'mkt', 'other'];
    tree.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

    res.json({ my_module: myModuleKey, filter_module: filterModule || null, modules: tree });
  } catch (e) {
    console.error('org-tree error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Danh sách module cố định + tên hiển thị — dùng cho FE dropdown.
 */
r.get('/modules', async (req, res) => {
  res.json({ modules: Object.entries(require('../helpers/driveOrgPath').MODULES).map(([key, name]) => ({ key, name })) });
});

/**
 * Admin: gán module Drive cho 1 user.
 * Body: { module: 'crm'|'sx'|'vc'|'mkt'|'other' }
 */
r.patch('/admin/user-module/:userId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền admin' });
    const { userId } = req.params;
    if (!isUuid(userId)) return res.status(400).json({ error: 'userId không hợp lệ' });
    const mod = String(req.body?.module || '').trim().toLowerCase();
    const VALID = ['crm', 'sx', 'vc', 'mkt', 'other'];
    if (mod && !VALID.includes(mod)) return res.status(400).json({ error: 'module không hợp lệ. Hợp lệ: ' + VALID.join(', ') });
    const { error } = await supabase
      .from('users')
      .update({ drive_module: mod || null })
      .eq('id', userId);
    if (error) throw error;
    let relocated = false;
    if (gdrive.isConfigured()) {
      try {
        const synced = await driveOrgPath.syncUserDriveOrg(userId);
        relocated = !!synced?.relocated;
      } catch (e) {
        console.warn('user-module sync drive:', e.message);
      }
    }
    res.json({ ok: true, drive_module: mod || null, relocated });
  } catch (e) {
    console.error('set user drive_module error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Admin: gán Loại Drive cho 1 phòng ban (free-text).
 * Body: { category: 'Văn phòng' }
 */
r.patch('/admin/dept-category/:departmentId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền admin' });
    const { departmentId } = req.params;
    if (!isUuid(departmentId)) return res.status(400).json({ error: 'departmentId không hợp lệ' });
    const cat = String(req.body?.category || '').trim();
    const { error } = await supabase
      .from('departments')
      .update({ drive_category: cat || null })
      .eq('id', departmentId);
    if (error) throw error;
    let usersSynced = 0;
    if (gdrive.isConfigured()) {
      try {
        const r = await driveOrgPath.syncDepartmentUsersDrive(departmentId);
        usersSynced = r.synced || 0;
      } catch (e) {
        console.warn('dept-category sync drive:', e.message);
      }
    }
    res.json({ ok: true, drive_category: cat || null, users_synced: usersSynced });
  } catch (e) {
    console.error('set dept drive_category error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/drive/org/ensure-user-drive
 *   Body: { user_id }
 *   Tạo (hoặc lấy) Drive cá nhân của user khác — admin only.
 *   Dùng khi click vào lá user trong org-tree → mở Drive của họ ngay cả khi user đó chưa truy cập.
 */
r.post('/org/ensure-user-drive', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { user_id } = req.body || {};
    if (!isUuid(user_id)) return res.status(400).json({ error: 'user_id không hợp lệ' });
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền admin' });

    const existing = await supabase
      .from('drive_roots')
      .select('*')
      .eq('scope', 'user')
      .eq('owner_id', user_id)
      .maybeSingle();
    if (existing.data) {
      try {
        await driveOrgPath.syncUserDriveOrg(user_id);
        const { data: refreshed } = await supabase
          .from('drive_roots')
          .select('*')
          .eq('id', existing.data.id)
          .maybeSingle();
        return res.json({ root: refreshed || existing.data });
      } catch (e) {
        console.warn('ensure-user-drive sync:', e.message);
        return res.json({ root: existing.data });
      }
    }

    const folder = await gdrive.ensureScopeFolderOnDrive({ scope: 'user', ownerId: user_id });
    const driveName = folder.org?.employee_name || folder.name || 'Drive cá nhân';
    const { data, error } = await supabase
      .from('drive_roots')
      .insert({
        scope: 'user',
        owner_id: user_id,
        name: driveName,
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
          .eq('scope', 'user')
          .eq('owner_id', user_id)
          .maybeSingle();
        if (dup) return res.json({ root: dup });
      }
      throw error;
    }
    res.status(201).json({ root: data, org: folder.org || null });
  } catch (e) {
    console.error('ensure-user-drive error:', e);
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
    res.json({ files: await enrichFilesWithUploaders(filesRes.data || []), folders: foldersRes.data || [] });
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
    res.json({ files: await enrichFilesWithUploaders(files.data || []), folders: folders.data || [] });
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
    res.json({ files: await enrichFilesWithUploaders(files || []) });
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
    res.json({ files: await enrichFilesWithUploaders(filesRes.data || []), folders: foldersRes.data || [] });
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
    res.json({ files: await enrichFilesWithUploaders(filesRes.data || []), folders: foldersRes.data || [] });
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

/**
 * Upload file thẳng vào "thư mục entity" trên Google Drive và auto-link với entity.
 *
 * Body (multipart):
 *   - file:       File cần upload
 *   - entity_type: 'lead' | 'deal' | 'production_project' | 'vc_project' | ...
 *   - entity_id:  UUID entity
 *
 * Folder GDrive: <ROOT>/<Module>/<Cty>/Khu vực/<KV>/<Loại>/Phòng ban/<PB>/Nhân viên/<NV>/<EntityKind>/<Mã — tên>/
 *   Trong đó NV = owner của entity (lead_owner_id/assigned_to/project_manager_id/created_by), fallback uploader.
 */
r.post('/entity/upload', diskUpload.single('file'), async (req, res) => {
  if (!requireGdrive(req, res)) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return;
  }
  let cleanupPath = req.file?.path || null;
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file' });
    const { entity_type, entity_id, folder_id: bodyFolderId } = req.body || {};
    if (!entity_type || !isUuid(entity_id)) {
      return res.status(400).json({ error: 'entity_type / entity_id không hợp lệ' });
    }

    const ctx = await driveEntityFolder.ensureEntityDriveContext({
      entityType: entity_type,
      entityId: entity_id,
      uploaderUserId: req.user.userId || req.user.id,
    });
    const target = await driveEntityFolder.resolveEntityTargetFolder(
      ctx,
      bodyFolderId || ctx.entityMirror.id,
    );
    const ep = ctx.ep;
    const ownerRoot = ctx.ownerRoot;
    const entityMirror = target.folder;

    // 4) Upload file thật lên GDrive
    const safeName = req.body?.name || fixFilename(req.file.originalname);
    const stream = fs.createReadStream(req.file.path);
    const uploaded = await gdrive.uploadFile({
      parentId: target.googleParentId,
      name: safeName,
      mimeType: req.file.mimetype,
      stream,
    });

    // 5) Insert drive_files
    const { data: fileRow, error: fileErr } = await supabase
      .from('drive_files')
      .insert({
        root_id: ownerRoot.id,
        folder_id: entityMirror.id,
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
    if (fileErr) throw fileErr;

    // 6) Auto link
    const { data: linkRow } = await supabase
      .from('drive_entity_links')
      .upsert(
        { file_id: fileRow.id, entity_type, entity_id, created_by: req.user.userId || null },
        { onConflict: 'file_id,entity_type,entity_id' },
      )
      .select()
      .single();

    fs.unlink(req.file.path, () => {});
    cleanupPath = null;

    await logDriveActivity({
      user: req.user, action: 'upload', targetType: 'file',
      targetId: fileRow.id, targetName: fileRow.name, rootId: fileRow.root_id,
      meta: { entity_type, entity_id, module: ep.module_key },
    });

    res.status(201).json({
      file: fileRow,
      link: linkRow,
      path: ep.segments,
      org: ep.org,
    });
  } catch (e) {
    console.error('entity upload error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    if (cleanupPath) fs.unlink(cleanupPath, () => {});
  }
});

/**
 * Tạo Google Doc/Sheet/Slides trong folder entity + auto liên kết.
 * Body: { entity_type, entity_id, kind: 'doc'|'sheet'|'slides', name? }
 */
r.post('/entity/create-google', async (req, res) => {
  if (!requireGdrive(req, res)) return;
  try {
    const { entity_type, entity_id, kind, name, folder_id: bodyFolderId } = req.body || {};
    const googleMime = gdrive.GOOGLE_CREATE_KINDS[kind];
    if (!googleMime) return res.status(400).json({ error: 'kind phải là doc, sheet hoặc slides' });
    if (!entity_type || !isUuid(entity_id)) return res.status(400).json({ error: 'entity_type / entity_id không hợp lệ' });

    const ctx = await driveEntityFolder.ensureEntityDriveContext({
      entityType: entity_type,
      entityId: entity_id,
      uploaderUserId: req.user.userId || req.user.id,
    });
    const target = await driveEntityFolder.resolveEntityTargetFolder(
      ctx,
      bodyFolderId || ctx.entityMirror.id,
    );
    const ep = ctx.ep;
    const ownerRoot = ctx.ownerRoot;
    const entityMirror = target.folder;

    const defaultNames = {
      doc: `${ep.entity_folder_name || 'Tài liệu'}`,
      sheet: `${ep.entity_folder_name || 'Bảng tính'} — Sheet`,
      slides: `${ep.entity_folder_name || 'Trình chiếu'} — Slides`,
    };
    const fileName = (name || defaultNames[kind] || 'File mới').trim();

    const created = await gdrive.createGoogleFile({
      parentId: target.googleParentId,
      name: fileName,
      googleMimeType: googleMime,
    });

    const { data: fileRow, error: fileErr } = await supabase
      .from('drive_files')
      .insert({
        root_id: ownerRoot.id,
        folder_id: entityMirror.id,
        name: created.name,
        mime_type: created.mimeType || googleMime,
        size_bytes: 0,
        google_file_id: created.id,
        google_view_url: created.webViewLink || null,
        thumbnail_url: created.thumbnailLink || null,
        version: 1,
        uploaded_by: req.user.userId || null,
      })
      .select()
      .single();
    if (fileErr) throw fileErr;

    const { data: linkRow } = await supabase
      .from('drive_entity_links')
      .upsert(
        { file_id: fileRow.id, entity_type, entity_id, created_by: req.user.userId || null },
        { onConflict: 'file_id,entity_type,entity_id' },
      )
      .select()
      .single();

    const [enriched] = await enrichFilesWithUploaders([fileRow]);

    await gdrive.ensureAnyoneLinkAccess(created.id, 'writer');
    const edit_embed_url = gdrive.buildGoogleEditEmbedUrl(created.id, googleMime);

    await logDriveActivity({
      user: req.user, action: 'upload', targetType: 'file',
      targetId: fileRow.id, targetName: fileRow.name, rootId: fileRow.root_id,
      meta: { entity_type, entity_id, kind, google: true },
    });

    res.status(201).json({
      file: enriched || fileRow,
      link: linkRow,
      edit_url: created.webViewLink || null,
      edit_embed_url,
      preview: {
        preview_mode: 'google_edit',
        edit_embed_url,
        edit_url: created.webViewLink || null,
        mime_type: googleMime,
      },
      path: ep.segments,
    });
  } catch (e) {
    console.error('entity create-google error:', e);
    res.status(500).json({ error: e.message });
  }
});

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

r.get('/links/count-by-entity/:entity_type/:entity_id', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    const { data: links } = await supabase
      .from('drive_entity_links')
      .select('file_id, file:drive_files(id)')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id);

    let count = 0;
    for (const lnk of links || []) {
      if (!lnk.file) continue;
      const ac = await driveAcl.canAccess({ user: req.user, targetType: 'file', targetId: lnk.file_id, requiredRole: 'viewer' });
      if (ac.ok) count++;
    }
    res.json({ count });
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
    const fileList = out.map((l) => l.file).filter(Boolean);
    const enriched = await enrichFilesWithUploaders(fileList);
    const byId = new Map(enriched.map((f) => [f.id, f]));
    res.json({ links: out.map((l) => ({ ...l, file: byId.get(l.file.id) || l.file })) });
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

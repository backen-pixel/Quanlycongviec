/**
 * Folder Drive gắn với entity CRM (Lead/Deal/Dự án…).
 */
const { supabase } = require('../config/supabase');
const driveOrgPath = require('./driveOrgPath');
const gdrive = require('../services/googleDrive');

async function ensureMirrorFolder({ root_id, parent_id, name, google_folder_id, created_by = null }) {
  const existing = await supabase
    .from('drive_folders')
    .select('*')
    .eq('root_id', root_id)
    .eq('google_folder_id', google_folder_id)
    .maybeSingle();
  if (existing.data) return existing.data;
  const ins = await supabase
    .from('drive_folders')
    .insert({ root_id, parent_id, name, google_folder_id, created_by })
    .select()
    .single();
  if (ins.error) {
    const again = await supabase
      .from('drive_folders')
      .select('*')
      .eq('root_id', root_id)
      .eq('google_folder_id', google_folder_id)
      .maybeSingle();
    if (again.data) return again.data;
    throw ins.error;
  }
  return ins.data;
}

/** Đảm bảo cây folder entity trên GDrive + mirror DB. */
async function ensureEntityDriveContext({ entityType, entityId, uploaderUserId }) {
  const ep = await driveOrgPath.ensureEntityOrgPath({
    entityType,
    entityId,
    uploaderUserId,
  });

  const ownerId = ep.owner_user_id || uploaderUserId;
  let { data: ownerRoot } = await supabase
    .from('drive_roots')
    .select('*')
    .eq('scope', 'user')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (!ownerRoot) {
    const ins = await supabase
      .from('drive_roots')
      .insert({
        scope: 'user',
        owner_id: ownerId,
        name: ep.org?.employee_name || 'Drive cá nhân',
        google_folder_id: ep.google_user_folder_id,
        created_by: uploaderUserId || null,
      })
      .select()
      .single();
    if (ins.error) {
      if (ins.error.code === '23505') {
        const dup = await supabase.from('drive_roots').select('*').eq('scope', 'user').eq('owner_id', ownerId).maybeSingle();
        ownerRoot = dup.data;
      } else {
        throw ins.error;
      }
    } else {
      ownerRoot = ins.data;
    }
  }

  const kindMirror = await ensureMirrorFolder({
    root_id: ownerRoot.id,
    parent_id: null,
    name: ep.entity_kind_label,
    google_folder_id: ep.google_kind_folder_id,
    created_by: uploaderUserId || null,
  });
  const entityMirror = await ensureMirrorFolder({
    root_id: ownerRoot.id,
    parent_id: kindMirror.id,
    name: ep.entity_folder_name,
    google_folder_id: ep.google_folder_id,
    created_by: uploaderUserId || null,
  });

  return { ep, ownerRoot, kindMirror, entityMirror };
}

/** folderId nằm trong cây con của entityFolderId (hoặc chính nó). */
async function isFolderUnderEntityRoot(entityFolderId, folderId) {
  if (!folderId || folderId === entityFolderId) return true;
  let id = folderId;
  const visited = new Set();
  while (id && !visited.has(id)) {
    visited.add(id);
    if (id === entityFolderId) return true;
    const { data } = await supabase
      .from('drive_folders')
      .select('parent_id')
      .eq('id', id)
      .maybeSingle();
    if (!data?.parent_id) return false;
    id = data.parent_id;
  }
  return false;
}

/** Resolve folder mirror + google id cho browse/upload (mặc định = entity root). */
async function resolveEntityTargetFolder(ctx, folderId) {
  const { entityMirror, ownerRoot } = ctx;
  if (!folderId || folderId === entityMirror.id) {
    return { folder: entityMirror, googleParentId: ctx.ep.google_folder_id, root: ownerRoot };
  }
  const { data: folder } = await supabase
    .from('drive_folders')
    .select('*')
    .eq('id', folderId)
    .maybeSingle();
  if (!folder) throw new Error('Folder không tồn tại');
  const ok = await isFolderUnderEntityRoot(entityMirror.id, folder.id);
  if (!ok) throw new Error('Folder không thuộc entity này');
  return { folder, googleParentId: folder.google_folder_id, root: ownerRoot };
}

module.exports = {
  ensureMirrorFolder,
  ensureEntityDriveContext,
  isFolderUnderEntityRoot,
  resolveEntityTargetFolder,
};

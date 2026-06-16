/**
 * Build attachment metadata for chat messages that reference Drive files.
 */
const { supabase } = require('../config/supabase');
const driveAcl = require('./drivePermissions');

async function buildDriveChatAttachments(user, fileIds) {
  const ids = [...new Set((Array.isArray(fileIds) ? fileIds : []).map(String).filter(Boolean))];
  const out = [];
  for (const fid of ids) {
    const ac = await driveAcl.canAccess({ user, targetType: 'file', targetId: fid, requiredRole: 'viewer' });
    if (!ac.ok) continue;
    const { data: file } = await supabase
      .from('drive_files')
      .select('id, name, mime_type, size_bytes, google_view_url')
      .eq('id', fid)
      .is('trashed_at', null)
      .maybeSingle();
    if (!file) continue;
    out.push({
      drive_file_id: file.id,
      name: file.name,
      type: file.mime_type || 'application/octet-stream',
      size: file.size_bytes || 0,
      is_drive: true,
      google_view_url: file.google_view_url || null,
    });
  }
  return out;
}

module.exports = { buildDriveChatAttachments };

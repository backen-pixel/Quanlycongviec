/**
 * Module Drive — sync incremental từ Google Drive về DB.
 *
 * Cách hoạt động:
 *   1) Lần đầu chạy với mỗi root: gọi `changes.getStartPageToken` và lưu vào drive_roots.start_page_token.
 *   2) Mỗi lần chạy sau: gọi `changes.list(pageToken)`, áp dụng:
 *        - file.trashed=true  → đánh dấu trashed_at (nếu chưa).
 *        - removed=true       → DELETE row trong DB.
 *        - file thường        → upsert metadata vào drive_files/drive_folders.
 *        - lưu newStartPageToken vào root.
 *   3) Lặp toàn bộ root mỗi GDRIVE_SYNC_INTERVAL_MS (mặc định 5 phút).
 *
 * Tắt: GDRIVE_SYNC_DISABLED=1
 */
const { supabase } = require('../config/supabase');
const gdrive = require('../services/googleDrive');
const config = require('../config');

let _timer = null;

function isFolder(file) {
  return file?.mimeType === 'application/vnd.google-apps.folder';
}

async function applyChangeToDb(rootId, change) {
  const fileId = change.fileId;
  if (!fileId) return;

  // Removed (xoá vĩnh viễn ngoài app) — xoá row khỏi DB.
  if (change.removed) {
    await supabase.from('drive_files').delete().eq('google_file_id', fileId);
    await supabase.from('drive_folders').delete().eq('google_folder_id', fileId);
    return;
  }

  const file = change.file;
  if (!file) return;

  const trashedAt = file.trashed ? new Date(change.time || Date.now()).toISOString() : null;

  if (isFolder(file)) {
    const { data: existing } = await supabase
      .from('drive_folders')
      .select('id,root_id,trashed_at,name,parent_id')
      .eq('google_folder_id', fileId)
      .maybeSingle();
    if (existing) {
      const patch = { name: file.name, updated_at: new Date().toISOString() };
      if (file.trashed && !existing.trashed_at) patch.trashed_at = trashedAt;
      if (!file.trashed && existing.trashed_at) { patch.trashed_at = null; patch.trashed_by = null; }
      await supabase.from('drive_folders').update(patch).eq('id', existing.id);
    }
    // Folder mới được tạo ngoài app: không tự insert vì cần root_id + parent_id mapping
    // (sẽ được tạo qua API khi user navigate; có thể bổ sung discovery sau).
    return;
  }

  // File
  const { data: existing } = await supabase
    .from('drive_files')
    .select('id,root_id,trashed_at,version')
    .eq('google_file_id', fileId)
    .maybeSingle();

  if (existing) {
    const patch = {
      name: file.name,
      mime_type: file.mimeType,
      size_bytes: parseInt(file.size || 0, 10) || 0,
      md5: file.md5Checksum || null,
      google_view_url: file.webViewLink || null,
      thumbnail_url: file.thumbnailLink || null,
      version: (existing.version || 1) + (file.md5Checksum && file.md5Checksum !== existing.md5 ? 1 : 0),
      updated_at: new Date().toISOString(),
    };
    if (file.trashed && !existing.trashed_at) patch.trashed_at = trashedAt;
    if (!file.trashed && existing.trashed_at) { patch.trashed_at = null; patch.trashed_by = null; }
    await supabase.from('drive_files').update(patch).eq('id', existing.id);
  }
  // File mới tạo ngoài app sẽ không được insert tự động (cần biết folder_id mapping); discovery sau.
}

async function syncOneRoot(root) {
  let pageToken = root.start_page_token;
  if (!pageToken) {
    try {
      pageToken = await gdrive.getStartPageToken();
      await supabase.from('drive_roots').update({ start_page_token: pageToken }).eq('id', root.id);
    } catch (e) {
      console.warn(`[drive-sync] failed getStartPageToken for root ${root.id}:`, e.message);
      return;
    }
    return;
  }

  try {
    let safety = 20;
    while (pageToken && safety-- > 0) {
      const resp = await gdrive.listChanges(pageToken);
      for (const ch of resp.changes || []) {
        await applyChangeToDb(root.id, ch);
      }
      if (resp.nextPageToken) {
        pageToken = resp.nextPageToken;
      } else {
        const newToken = resp.newStartPageToken || pageToken;
        await supabase.from('drive_roots')
          .update({ start_page_token: newToken, last_synced_at: new Date().toISOString() })
          .eq('id', root.id);
        break;
      }
    }
  } catch (e) {
    console.warn(`[drive-sync] sync failed for root ${root.id}:`, e.message);
  }
}

async function tick() {
  if (!gdrive.isConfigured()) return;
  try {
    const { data: roots } = await supabase.from('drive_roots').select('*');
    if (!roots?.length) return;
    // Google `changes` là changes của TOÀN BỘ Drive mà service account thấy
    // → chỉ cần sync 1 token chung. Nhưng để tránh thay đổi schema, lưu token vào root đầu tiên.
    // Để đơn giản & vẫn đúng: sync từng root tuần tự (token mỗi root sẽ hội tụ cùng giá trị).
    for (const root of roots) {
      await syncOneRoot(root);
    }
  } catch (e) {
    console.warn('[drive-sync] tick error:', e.message);
  }
}

function start() {
  if (!config.gdriveSyncEnabled) {
    console.log('[drive-sync] disabled by env GDRIVE_SYNC_DISABLED=1');
    return;
  }
  if (!gdrive.isConfigured()) {
    console.log('[drive-sync] skipped: Google Drive chưa được cấu hình');
    return;
  }
  if (_timer) return;
  const interval = config.gdriveSyncIntervalMs;
  _timer = setInterval(() => { void tick(); }, interval);
  setTimeout(() => { void tick(); }, 30_000); // chạy lần đầu sau 30s
  console.log(`[drive-sync] started (mỗi ${Math.round(interval / 1000)}s)`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, tick };

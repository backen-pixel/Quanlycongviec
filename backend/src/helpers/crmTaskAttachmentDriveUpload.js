/**
 * Khi nhiệm vụ CRM bật auto_upload_attachments_to_drive:
 * mirror file đính kèm (Supabase Storage / URL) → Google Drive entity (lead/deal).
 */
const { Readable } = require('stream');
const { supabase } = require('../config/supabase');
const gdrive = require('../services/googleDrive');
const driveEntityFolder = require('./driveEntityFolder');

const STORAGE_BUCKET = 'attachments';

function attachmentHasFile(att) {
  const url = String(att?.file_url || '').trim();
  if (!url) return false;
  const docType = String(att?.doc_type || '').toLowerCase();
  if (docType === 'task_note' || docType === 'task_inline_note' || docType === 'checklist_inline_note') {
    return false;
  }
  return true;
}

/** Trích storage path từ public URL Supabase (bucket attachments). */
function extractStoragePathFromUrl(fileUrl) {
  const raw = String(fileUrl || '').trim();
  if (!raw) return null;
  const markers = [
    `/storage/v1/object/public/${STORAGE_BUCKET}/`,
    `/storage/v1/object/sign/${STORAGE_BUCKET}/`,
  ];
  for (const m of markers) {
    const idx = raw.indexOf(m);
    if (idx >= 0) {
      const rest = raw.slice(idx + m.length).split('?')[0];
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }
  return null;
}

async function downloadAttachmentBytes(att) {
  const fileUrl = String(att.file_url || '').trim();
  const storagePath = extractStoragePathFromUrl(fileUrl);
  if (storagePath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (!error && data) {
      const ab = await data.arrayBuffer();
      return Buffer.from(ab);
    }
  }
  if (/^https?:\/\//i.test(fileUrl)) {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Tải file thất bại: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
  throw new Error('Không đọc được nội dung file đính kèm');
}

/**
 * Upload 1 attachment lên Drive entity của lead/deal.
 * @returns {{ fileRow, skipped?, reason? }|null}
 */
async function mirrorCrmTaskAttachmentToDrive({
  att,
  leadId,
  userId,
  entityTypeHint = null,
}) {
  if (!attachmentHasFile(att)) return { skipped: true, reason: 'no_file' };
  if (att.source_drive_file_id) return { skipped: true, reason: 'already_mirrored' };
  if (!gdrive.isConfigured()) return { skipped: true, reason: 'gdrive_not_configured' };
  if (!leadId) return { skipped: true, reason: 'no_lead' };

  let entityType = entityTypeHint;
  if (!entityType) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type, project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return { skipped: true, reason: 'lead_not_found' };
    entityType = lead.type === 'deal' ? 'deal' : 'lead';
  }

  const buffer = await downloadAttachmentBytes(att);
  const safeName = att.file_name || att.name || 'file';
  const mimeType = att.mime_type || 'application/octet-stream';

  const ctx = await driveEntityFolder.ensureEntityDriveContext({
    entityType,
    entityId: leadId,
    uploaderUserId: userId || null,
  });
  const target = await driveEntityFolder.resolveEntityTargetFolder(ctx, ctx.entityMirror.id);

  const stream = Readable.from(buffer);
  const uploaded = await gdrive.uploadFile({
    parentId: target.googleParentId,
    name: safeName,
    mimeType,
    stream,
  });

  const { data: fileRow, error: fileErr } = await supabase
    .from('drive_files')
    .insert({
      root_id: ctx.ownerRoot.id,
      folder_id: target.folder.id,
      name: uploaded.name || safeName,
      mime_type: uploaded.mimeType || mimeType,
      size_bytes: parseInt(uploaded.size || att.file_size || buffer.length || 0, 10) || 0,
      google_file_id: uploaded.id,
      google_view_url: uploaded.webViewLink || null,
      thumbnail_url: uploaded.thumbnailLink || null,
      md5: uploaded.md5Checksum || null,
      version: 1,
      uploaded_by: userId || null,
    })
    .select()
    .single();
  if (fileErr) throw fileErr;

  await supabase
    .from('drive_entity_links')
    .upsert(
      { file_id: fileRow.id, entity_type: entityType, entity_id: leadId, created_by: userId || null },
      { onConflict: 'file_id,entity_type,entity_id' },
    );

  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('project_id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadRow?.project_id) {
    try {
      await supabase.from('drive_entity_links').upsert(
        {
          file_id: fileRow.id,
          entity_type: 'production_project',
          entity_id: leadRow.project_id,
          created_by: userId || null,
        },
        { onConflict: 'file_id,entity_type,entity_id' },
      );
    } catch (e) {
      console.warn('[crm→drive] link production_project:', e.message);
    }
  }

  if (att.id) {
    const { error: updErr } = await supabase
      .from('crm_task_attachments')
      .update({ source_drive_file_id: fileRow.id })
      .eq('id', att.id);
    if (updErr && !String(updErr.message || '').includes('source_drive_file_id')) {
      console.warn('[crm→drive] update attachment:', updErr.message);
    }
  }

  return { fileRow, entityType, leadId };
}

/**
 * Mirror danh sách attachment nếu nhiệm vụ bật cờ.
 * Không ném lỗi ra ngoài — chỉ log cảnh báo (upload CRM vẫn thành công).
 */
async function maybeMirrorTaskAttachmentsToDrive({
  taskId,
  leadId,
  attachments,
  userId,
  taskFlag = null,
}) {
  try {
    let enabled = taskFlag;
    if (enabled == null && taskId) {
      const { data: task } = await supabase
        .from('crm_tasks')
        .select('id, auto_upload_attachments_to_drive')
        .eq('id', taskId)
        .maybeSingle();
      enabled = !!task?.auto_upload_attachments_to_drive;
    }
    if (!enabled) return { skipped: true, reason: 'flag_off' };

    const list = (attachments || []).filter(attachmentHasFile);
    if (!list.length) return { skipped: true, reason: 'no_files' };

    let entityType = null;
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, type')
      .eq('id', leadId)
      .maybeSingle();
    if (lead) entityType = lead.type === 'deal' ? 'deal' : 'lead';

    const results = [];
    for (const att of list) {
      try {
        const r = await mirrorCrmTaskAttachmentToDrive({
          att,
          leadId,
          userId,
          entityTypeHint: entityType,
        });
        results.push(r);
      } catch (e) {
        console.warn(`[crm→drive] mirror att ${att.id || att.file_name}:`, e.message);
        results.push({ skipped: true, reason: e.message, attId: att.id });
      }
    }
    return { ok: true, results };
  } catch (e) {
    console.warn('[crm→drive] maybeMirror:', e.message);
    return { skipped: true, reason: e.message };
  }
}

module.exports = {
  attachmentHasFile,
  mirrorCrmTaskAttachmentToDrive,
  maybeMirrorTaskAttachmentsToDrive,
};

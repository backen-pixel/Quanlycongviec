/**
 * Chia sẻ tài liệu CRM ↔ Sản xuất: auto-share khi deal có project_id,
 * đồng bộ Drive CRM → lead_documents, thông báo team SX.
 */
const { supabase } = require('../config/supabase');
const { cleanShareModulesInput } = require('./documentShareScope');
const { fetchProjectCommentAudienceUserIds } = require('./dealCommentNotifications');
const { notifyMultiple } = require('./notifications');
const { logProjectFileActivity } = require('./projectFileActivity');

/** Cờ mặc định trên lead_documents khi deal đã gắn dự án SX. */
function getDefaultLeadDocumentShareForDeal(projectId, explicit = {}) {
  if (explicit.shared_to_workshop !== undefined) {
    let mods = explicit.allowed_share_modules;
    if (mods?.length) {
      mods = cleanShareModulesInput(Array.isArray(mods) ? mods : [mods]);
    }
    return {
      shared_to_workshop: !!explicit.shared_to_workshop,
      allowed_share_modules: explicit.shared_to_workshop ? (mods?.length ? mods : ['production']) : null,
    };
  }
  if (projectId) {
    return { shared_to_workshop: true, allowed_share_modules: ['production'] };
  }
  return { shared_to_workshop: false, allowed_share_modules: null };
}

async function notifyProductionDocumentUploaded({
  req,
  projectId,
  leadId,
  fileName,
  dealTitle,
  source = 'crm',
}) {
  if (!req || !projectId) return;
  try {
    const actorId = req.user?.userId || req.user?.id;
    const { userIds, proj } = await fetchProjectCommentAudienceUserIds(supabase, projectId);
    const recipients = (userIds || []).filter((uid) => uid && String(uid) !== String(actorId));
    if (!recipients.length) return;

    const sourceLabel = source === 'drive' ? 'Drive CRM' : 'CRM';
    await notifyMultiple(
      req,
      recipients,
      'document_uploaded',
      '📎 Tài liệu mới từ CRM',
      `"${fileName || 'Tài liệu'}" được upload (${sourceLabel}) — ${dealTitle || proj?.name || proj?.code || 'Dự án'}`,
      'project',
      projectId,
      {
        ecosystem_module_key: 'production',
        project_id: String(projectId),
        lead_id: leadId ? String(leadId) : null,
        nav_tab: 'documents',
      },
    );
  } catch (e) {
    console.warn('[notifyProductionDocument]', e.message);
  }
}

async function findLeadDocumentByDriveFileId(driveFileId) {
  const { data, error } = await supabase
    .from('lead_documents')
    .select('id')
    .eq('source_drive_file_id', driveFileId)
    .maybeSingle();
  if (error && !String(error.message || '').includes('source_drive_file_id')) throw error;
  return data?.id || null;
}

/**
 * Drive upload/link trên deal/lead → lead_documents + link sang production_project.
 */
async function syncDriveFileToLeadDocument({ req, fileRow, entityType, entityId, userId }) {
  const et = String(entityType || '').toLowerCase();
  if (et !== 'deal' && et !== 'lead') return { skipped: true, reason: 'not_crm_entity' };
  if (!fileRow?.id) return { skipped: true, reason: 'no_file' };

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, title, project_id')
    .eq('id', entityId)
    .maybeSingle();
  if (!lead) return { skipped: true, reason: 'no_lead' };

  const share = getDefaultLeadDocumentShareForDeal(lead.project_id);
  const payload = {
    lead_id: lead.id,
    project_id: lead.project_id || null,
    name: fileRow.name || 'Tài liệu Drive',
    doc_type: 'drive',
    file_url: fileRow.google_view_url || null,
    file_name: fileRow.name || null,
    file_size: fileRow.size_bytes || null,
    mime_type: fileRow.mime_type || null,
    notes: 'Từ Google Drive',
    created_by: userId || fileRow.uploaded_by || null,
    source_drive_file_id: fileRow.id,
    crm_stage_group_label: 'Drive CRM',
    ...share,
  };

  const existingId = await findLeadDocumentByDriveFileId(fileRow.id);
  let docId;
  if (existingId) {
    const { error } = await supabase.from('lead_documents').update(payload).eq('id', existingId);
    if (error) throw error;
    docId = existingId;
  } else {
    let { data: ins, error } = await supabase.from('lead_documents').insert(payload).select('id').single();
    if (error && String(error.message || '').includes('source_drive_file_id')) {
      const { source_drive_file_id: _s, ...legacy } = payload;
      ({ data: ins, error } = await supabase.from('lead_documents').insert(legacy).select('id').single());
    }
    if (error) throw error;
    docId = ins?.id;
  }

  if (lead.project_id) {
    try {
      await supabase.from('drive_entity_links').upsert(
        {
          file_id: fileRow.id,
          entity_type: 'production_project',
          entity_id: lead.project_id,
          created_by: userId || null,
        },
        { onConflict: 'file_id,entity_type,entity_id' },
      );
    } catch (linkErr) {
      console.warn('[drive] link production_project:', linkErr.message);
    }
  }

  return { ok: true, docId, leadId: lead.id, projectId: lead.project_id, dealTitle: lead.title };
}

/** Sau upload/link Drive trên deal — ghi activity + thông báo SX. */
async function afterCrmDriveEntityFileUploaded({ req, fileRow, entityType, entityId }) {
  const userId = req.user?.userId || req.user?.id;
  const sync = await syncDriveFileToLeadDocument({ req, fileRow, entityType, entityId, userId });
  if (!sync.ok) return sync;

  const fileUrl = fileRow.google_view_url || null;
  await logProjectFileActivity(req, {
    projectId: sync.projectId,
    leadId: sync.leadId,
    action: 'uploaded',
    fileName: fileRow.name,
    fileUrl,
    extra: 'Google Drive',
  });

  if (sync.projectId) {
    await notifyProductionDocumentUploaded({
      req,
      projectId: sync.projectId,
      leadId: sync.leadId,
      fileName: fileRow.name,
      dealTitle: sync.dealTitle,
      source: 'drive',
    });
  }

  return sync;
}

module.exports = {
  getDefaultLeadDocumentShareForDeal,
  notifyProductionDocumentUploaded,
  syncDriveFileToLeadDocument,
  afterCrmDriveEntityFileUploaded,
};

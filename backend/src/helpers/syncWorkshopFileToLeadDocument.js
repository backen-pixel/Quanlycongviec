const { supabase } = require('../config/supabase');
const { resolveLeadIdForProject } = require('./syncProjectTaskToLeadDocument');

async function resolveProjectIdForFile(fileRow) {
  if (!fileRow) return null;
  if (fileRow.entity_type === 'project') return fileRow.entity_id || null;
  if (fileRow.entity_type === 'task' && fileRow.entity_id) {
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', fileRow.entity_id)
      .maybeSingle();
    return task?.project_id || null;
  }
  return null;
}

async function findMirrorDocIdByFileAttachment(fileId) {
  const { data, error } = await supabase
    .from('lead_documents')
    .select('id')
    .eq('source_file_attachment_id', fileId)
    .maybeSingle();
  if (error && !String(error.message || '').includes('source_file_attachment_id')) throw error;
  return data?.id || null;
}

/**
 * Đồng bộ file_attachments (xưởng) → lead_documents để CRM bên đặt hàng xem trên deal.
 * @param {object} fileRow — row file_attachments
 */
async function upsertLeadDocumentFromWorkshopFile(fileRow) {
  if (!fileRow?.id) return { skipped: true, reason: 'no_file' };

  const projectId = await resolveProjectIdForFile(fileRow);
  if (!projectId) return { skipped: true, reason: 'no_project' };

  const leadId = await resolveLeadIdForProject(projectId);
  if (!leadId) return { skipped: true, reason: 'no_crm_lead' };

  const name = fileRow.file_name || 'Tài liệu xưởng';
  const basePayload = {
    lead_id: leadId,
    project_id: projectId,
    name,
    doc_type: 'other',
    file_url: fileRow.file_url || null,
    file_name: fileRow.file_name || null,
    file_size: fileRow.file_size || null,
    mime_type: fileRow.mime_type || null,
    notes: fileRow.notes || null,
    shared_to_workshop: false,
    allowed_share_modules: null,
    allowed_companies: null,
    allowed_departments: null,
    crm_stage_group_label: 'Sản xuất (xưởng)',
    source_file_attachment_id: fileRow.id,
  };

  const existingId = await findMirrorDocIdByFileAttachment(fileRow.id);
  if (existingId) {
    const { error } = await supabase.from('lead_documents').update(basePayload).eq('id', existingId);
    if (error) throw error;
    return { ok: true, id: existingId, updated: true };
  }

  const { data: ins, error } = await supabase
    .from('lead_documents')
    .insert({ ...basePayload, created_by: fileRow.uploaded_by || null })
    .select('id')
    .single();
  if (error) throw error;
  return { ok: true, id: ins?.id, created: true };
}

async function removeLeadDocumentForWorkshopFile(fileId) {
  if (!fileId) return { deleted: 0 };
  const { error } = await supabase
    .from('lead_documents')
    .delete()
    .eq('source_file_attachment_id', fileId);
  if (error && !String(error.message || '').includes('source_file_attachment_id')) throw error;
  return { deleted: 1 };
}

/**
 * Bật/tắt chia sẻ CRM cho file xưởng + đồng bộ lead_documents.
 */
async function setWorkshopFileSharedToCrm(fileRow, shared) {
  const { data: updated, error } = await supabase
    .from('file_attachments')
    .update({ shared_to_crm: !!shared })
    .eq('id', fileRow.id)
    .select('*')
    .single();
  if (error) {
    if (String(error.message || '').includes('shared_to_crm')) {
      const err = new Error('Chưa cài cột shared_to_crm — chạy migration database/374_file_attachments_shared_to_crm.sql');
      err.code = 'migration_required';
      throw err;
    }
    throw error;
  }

  if (shared) {
    const sync = await upsertLeadDocumentFromWorkshopFile(updated);
    return { file: updated, sync };
  }
  await removeLeadDocumentForWorkshopFile(fileRow.id);
  return { file: updated, sync: { removed: true } };
}

module.exports = {
  resolveProjectIdForFile,
  upsertLeadDocumentFromWorkshopFile,
  removeLeadDocumentForWorkshopFile,
  setWorkshopFileSharedToCrm,
};

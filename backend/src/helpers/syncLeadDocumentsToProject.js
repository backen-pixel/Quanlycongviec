const { supabase } = require('../config/supabase');

/**
 * Gắn tài liệu CRM (lead_documents) với dự án và bật hiển thị module SX.
 * GET /production/projects/:id đọc lead_documents theo project_id; sharedDocuments lọc shared_to_workshop.
 *
 * @param {{ leadId: string, projectId: string, shareToWorkshop?: boolean }} opts
 * @returns {Promise<{ ok: boolean, count?: number, error?: string, skipped?: boolean }>}
 */
async function syncLeadDocumentsToProject({ leadId, projectId, shareToWorkshop = true }) {
  if (!leadId || !projectId) {
    return { ok: true, skipped: true };
  }

  const patch = { project_id: projectId };
  if (shareToWorkshop) {
    patch.shared_to_workshop = true;
  }

  const { data, error } = await supabase
    .from('lead_documents')
    .update(patch)
    .eq('lead_id', leadId)
    .select('id');

  if (error) {
    console.error('[syncLeadDocumentsToProject]', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, count: data?.length ?? 0 };
}

module.exports = { syncLeadDocumentsToProject };

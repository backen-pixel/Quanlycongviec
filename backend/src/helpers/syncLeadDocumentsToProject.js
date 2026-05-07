const { supabase } = require('../config/supabase');

/**
 * Gắn tài liệu CRM (lead_documents) với dự án (project_id).
 * Không ghi đè shared_to_workshop — bật/tắt chia sẻ xưởng chỉ từ CRM (tránh mất «khóa» sau bàn giao).
 *
 * @param {{ leadId: string, projectId: string }} opts
 * @returns {Promise<{ ok: boolean, count?: number, error?: string, skipped?: boolean }>}
 */
async function syncLeadDocumentsToProject({ leadId, projectId }) {
  if (!leadId || !projectId) {
    return { ok: true, skipped: true };
  }

  const { data, error } = await supabase
    .from('lead_documents')
    .update({ project_id: projectId })
    .eq('lead_id', leadId)
    .select('id');

  if (error) {
    console.error('[syncLeadDocumentsToProject]', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, count: data?.length ?? 0 };
}

module.exports = { syncLeadDocumentsToProject };

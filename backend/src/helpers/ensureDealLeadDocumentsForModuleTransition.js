const { supabase } = require('../config/supabase');
const { copyCrmTaskArtifactsToLeadDocuments } = require('./copyCrmTaskArtifactsToLeadDocuments');
const { syncLeadDocumentsToProject } = require('./syncLeadDocumentsToProject');

/**
 * Khi chuyển giữa module (CRM ↔ SX ↔ VC): đảm bảo ghi chú/đính kèm trên nhiệm vụ CRM
 * đã có bản lead_documents và đã gắn đúng project_id + chia sẻ xưởng.
 *
 * 1) copyCrmTaskArtifactsToLeadDocuments — bù các attachment/ghi chú task chưa có dòng tài liệu
 * 2) syncLeadDocumentsToProject — gán project_id (giữ nguyên cờ chia sẻ / khóa từ CRM)
 *
 * @param {{ leadId: string, projectId?: string|null }} p — projectId lấy từ crm_leads nếu thiếu
 */
async function ensureDealLeadDocumentsForModuleTransition({ leadId, projectId }) {
  if (!leadId) return { ok: false, reason: 'missing_lead_id' };

  let pid = projectId || null;
  if (!pid) {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('project_id')
      .eq('id', leadId)
      .maybeSingle();
    pid = leadRow?.project_id || null;
  }

  let copied = { attachmentsCopied: 0, notesCopied: 0 };
  try {
    copied = await copyCrmTaskArtifactsToLeadDocuments(leadId);
  } catch (e) {
    console.warn('[ensureDealLeadDocuments] copy:', e.message);
  }

  let synced = { ok: true, skipped: !pid };
  if (pid) {
    try {
      synced = await syncLeadDocumentsToProject({ leadId, projectId: pid });
    } catch (e) {
      console.warn('[ensureDealLeadDocuments] sync:', e.message);
      synced = { ok: false, error: e.message };
    }
  }

  return {
    ok: true,
    leadId,
    projectId: pid,
    copied,
    synced,
  };
}

/**
 * Gọi ensure cho mọi deal (type=deal) đang gắn `project_id` = dự án xưởng (SX hoặc master).
 */
async function ensureDealLeadDocumentsForProjectId(projectId) {
  if (!projectId) return { ok: false, reason: 'missing_project' };
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  if (error) {
    console.warn('[ensureDealLeadDocuments] list leads:', error.message);
    return { ok: false, error: error.message };
  }
  const rows = leads || [];
  const deals = [];
  for (const L of rows) {
    deals.push(await ensureDealLeadDocumentsForModuleTransition({ leadId: L.id, projectId }));
  }
  return { ok: true, projectId, dealCount: rows.length, deals };
}

module.exports = {
  ensureDealLeadDocumentsForModuleTransition,
  ensureDealLeadDocumentsForProjectId,
};

const { supabase } = require('../config/supabase');
const { getLeadDocumentFieldsFromCrmTask } = require('./crmTaskLeadDocumentMeta');

/**
 * Đưa đính kèm nhiệm vụ CRM và ghi chú task vào lead_documents (cùng lead_id deal).
 * Dùng trước syncLeadDocumentsToProject để mỗi artifact có lead_documents + project_id (cờ chia sẻ xưởng do CRM).
 *
 * @param {string} leadId — crm_leads.id (deal/lead)
 * @returns {Promise<{ attachmentsCopied: number, notesCopied: number }>}
 */
async function copyCrmTaskArtifactsToLeadDocuments(leadId) {
  let attachmentsCopied = 0;
  let notesCopied = 0;
  if (!leadId) return { attachmentsCopied, notesCopied };

  const { data: leadRow } = await supabase.from('crm_leads')
    .select('project_id').eq('id', leadId).maybeSingle();
  const linkOpts = { linkToProject: !!leadRow?.project_id };

  try {
    const { data: dealTaskAtts } = await supabase
      .from('crm_task_attachments')
      .select('*, task:crm_tasks(id, title, stage_slug)')
      .eq('lead_id', leadId);

    if (dealTaskAtts?.length) {
      const { data: existingDocs } = await supabase
        .from('lead_documents')
        .select('name, file_url')
        .eq('lead_id', leadId);
      const existingSet = new Set((existingDocs || []).map((d) => `${d.name}|${d.file_url || ''}`));
      const newDocInserts = dealTaskAtts
        .filter(
          (att) =>
            !existingSet.has(`[${att.task?.title || 'Task'}] ${att.name}|${att.file_url || ''}`),
        )
        .map((att) => ({
          lead_id: leadId,
          name: `[${att.task?.title || 'Task'}] ${att.name}`,
          doc_type: att.file_url ? att.doc_type || 'other' : 'requirement',
          file_url: att.file_url || null,
          file_name: att.file_name || null,
          file_size: att.file_size || null,
          mime_type: att.mime_type || null,
          notes: att.notes || null,
          created_by: att.created_by,
          ...getLeadDocumentFieldsFromCrmTask(att.task, linkOpts),
        }));
      if (newDocInserts.length) {
        const { error } = await supabase.from('lead_documents').insert(newDocInserts);
        if (!error) {
          attachmentsCopied = newDocInserts.length;
          console.log(`[crm-task-docs] Copied ${attachmentsCopied} task attachments → lead_documents`);
        } else {
          console.error('[crm-task-docs] attachments:', error.message);
        }
      }
    }
  } catch (e) {
    console.error('[crm-task-docs] attachments:', e.message);
  }

  try {
    const { data: dealTasksWithNotes } = await supabase
      .from('crm_tasks')
      .select('id, title, stage_slug, notes, created_by')
      .eq('lead_id', leadId)
      .not('notes', 'is', null);

    if (dealTasksWithNotes?.length) {
      const existingDocs2 =
        (await supabase.from('lead_documents').select('name').eq('lead_id', leadId)).data || [];
      const existingNames = new Set(existingDocs2.map((d) => d.name));
      const noteInserts = dealTasksWithNotes
        .filter((t) => t.notes?.trim() && !existingNames.has(`📝 Ghi chú: ${t.title}`))
        .map((t) => ({
          lead_id: leadId,
          name: `📝 Ghi chú: ${t.title}`,
          doc_type: 'requirement',
          notes: t.notes,
          created_by: t.created_by,
          ...getLeadDocumentFieldsFromCrmTask(t, linkOpts),
        }));
      if (noteInserts.length) {
        const { error } = await supabase.from('lead_documents').insert(noteInserts);
        if (!error) {
          notesCopied = noteInserts.length;
          console.log(`[crm-task-docs] Copied ${notesCopied} task notes → lead_documents`);
        } else {
          console.error('[crm-task-docs] notes:', error.message);
        }
      }
    }
  } catch (e) {
    console.error('[crm-task-docs] notes:', e.message);
  }

  return { attachmentsCopied, notesCopied };
}

module.exports = { copyCrmTaskArtifactsToLeadDocuments };

const { supabase } = require('../config/supabase');
const { getLeadDocumentShareFromCrm } = require('./crmTaskLeadDocumentMeta');

/**
 * Đồng bộ cờ chia sẻ từ crm_tasks → lead_documents (ghi chú task, tài liệu gắn source_crm_task_id).
 */
async function syncLeadDocumentsFromCrmTaskShare(taskId) {
  if (!taskId) return;
  const { data: task } = await supabase
    .from('crm_tasks')
    .select('id, shared_to_project, allowed_share_modules')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return;

  const fields = getLeadDocumentShareFromCrm(task);
  await supabase.from('lead_documents').update(fields).eq('source_crm_task_id', taskId);

  const { data: inlineAtts } = await supabase
    .from('crm_task_attachments')
    .select('id')
    .eq('task_id', taskId)
    .eq('doc_type', 'task_inline_note');
  for (const att of inlineAtts || []) {
    await supabase.from('lead_documents').update(fields).eq('source_attachment_id', att.id);
  }
}

/**
 * Đồng bộ cờ chia sẻ từ crm_task_attachments → lead_documents (source_attachment_id).
 */
async function syncLeadDocumentsFromCrmAttachmentShare(attId) {
  if (!attId) return;
  const { data: att } = await supabase
    .from('crm_task_attachments')
    .select('id, shared_to_project, allowed_share_modules')
    .eq('id', attId)
    .maybeSingle();
  if (!att) return;

  const fields = getLeadDocumentShareFromCrm(att);
  await supabase.from('lead_documents').update(fields).eq('source_attachment_id', attId);
}

module.exports = {
  syncLeadDocumentsFromCrmTaskShare,
  syncLeadDocumentsFromCrmAttachmentShare,
};

/**
 * Minh chứng khi hoàn thành NV CRM: ghi chú trên task hoặc đính kèm có nội dung (file URL hoặc text).
 * Dùng chung cho API cập nhật task và KPI A3.
 */
async function crmTaskHasCompletionEvidence(supabase, taskId, taskNotes) {
  if (taskNotes != null && String(taskNotes).trim() !== '') return true;
  const { data: rows, error } = await supabase
    .from('crm_task_attachments')
    .select('id,file_url,notes')
    .eq('task_id', taskId)
    .limit(200);
  if (error) throw error;
  for (const r of rows || []) {
    if (r.file_url && String(r.file_url).trim() !== '') return true;
    if (r.notes != null && String(r.notes).trim() !== '') return true;
  }
  return false;
}

/**
 * Với danh sách task_id (thường là task đã completed nhưng chưa có notes), trả về Set các task_id
 * có ít nhất một dòng attachment có file_url hoặc notes khác rỗng.
 */
async function loadCrmTaskIdsWithAttachmentEvidence(supabase, taskIds) {
  const ok = new Set();
  if (!taskIds?.length) return ok;
  const CHUNK = 120;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk = taskIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('crm_task_attachments')
      .select('task_id, file_url, notes')
      .in('task_id', chunk);
    if (error) throw error;
    for (const r of data || []) {
      if ((r.file_url && String(r.file_url).trim() !== '') || (r.notes != null && String(r.notes).trim() !== '')) {
        ok.add(r.task_id);
      }
    }
  }
  return ok;
}

module.exports = { crmTaskHasCompletionEvidence, loadCrmTaskIdsWithAttachmentEvidence };

/**
 * Map task_id -> { files, notes } cho CRM tasks (doc_type = task_note → note).
 * Ưu tiên RPC SQL (161) để tránh trả về quá nhiều dòng attachment → statement timeout.
 */
async function loadCrmTaskAttachmentCountMap(supabase, taskIds) {
  const countMap = {};
  if (!taskIds?.length) return countMap;

  try {
    const { data: rows, error } = await supabase.rpc('crm_task_attachment_counts_by_tasks', {
      p_task_ids: taskIds,
    });
    if (!error && Array.isArray(rows)) {
      for (const r of rows) {
        if (!r?.task_id) continue;
        countMap[r.task_id] = {
          files: Number(r.file_count || 0),
          notes: Number(r.note_count || 0),
        };
      }
      return countMap;
    }
  } catch (_) {
    /* RPC chưa deploy: fallback */
  }

  const CHUNK = 80;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk = taskIds.slice(i, i + CHUNK);
    const { data: attCounts, error } = await supabase
      .from('crm_task_attachments')
      .select('task_id, doc_type')
      .in('task_id', chunk);
    if (error) throw error;
    (attCounts || []).forEach((a) => {
      if (!countMap[a.task_id]) countMap[a.task_id] = { files: 0, notes: 0 };
      if (a.doc_type === 'task_note') countMap[a.task_id].notes += 1;
      else countMap[a.task_id].files += 1;
    });
  }
  return countMap;
}

/** Gắn notes + file_count/note_count cho các dòng crm_task trong unified list. */
async function enrichUnifiedCrmTasks(supabase, tasks) {
  const list = tasks || [];
  const crmRows = list.filter((t) => t.source === 'crm_task' && t.source_id);
  if (!crmRows.length) return list;

  const taskIds = [...new Set(crmRows.map((t) => t.source_id))];
  const [countMap, notesMap] = await Promise.all([
    loadCrmTaskAttachmentCountMap(supabase, taskIds),
    loadCrmTaskNotesMap(supabase, taskIds),
  ]);

  return list.map((t) => {
    if (t.source !== 'crm_task' || !t.source_id) return t;
    const counts = countMap[t.source_id] || { files: 0, notes: 0 };
    return {
      ...t,
      notes: notesMap[t.source_id] ?? t.notes ?? null,
      file_count: counts.files,
      note_count: counts.notes,
    };
  });
}

async function loadCrmTaskNotesMap(supabase, taskIds) {
  const notesMap = {};
  if (!taskIds?.length) return notesMap;
  const CHUNK = 80;
  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk = taskIds.slice(i, i + CHUNK);
    const { data: rows, error } = await supabase
      .from('crm_tasks')
      .select('id, notes')
      .in('id', chunk);
    if (error) throw error;
    (rows || []).forEach((r) => {
      notesMap[r.id] = r.notes || null;
    });
  }
  return notesMap;
}

module.exports = {
  loadCrmTaskAttachmentCountMap,
  enrichUnifiedCrmTasks,
};

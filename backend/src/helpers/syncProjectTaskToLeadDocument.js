const { supabase } = require('../config/supabase');

async function resolveLeadIdForProject(projectId) {
  const { data: dealLead } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .limit(1)
    .maybeSingle();
  if (dealLead?.id) return dealLead.id;
  const { data: anyLead } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle();
  return anyLead?.id || null;
}

function combinedTaskText(task) {
  return [task.description, task.notes]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim())
    .join('\n\n');
}

async function findExistingMirrorDocId(taskId, projectId, name) {
  try {
    const { data: exist, error } = await supabase
      .from('lead_documents')
      .select('id')
      .eq('source_project_task_id', taskId)
      .maybeSingle();
    if (!error && exist?.id) return exist.id;
    if (error && !String(error.message || '').includes('source_project_task_id')) return null;
  } catch (_) {
    /* ignore */
  }
  const { data: byName } = await supabase
    .from('lead_documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  return byName?.id || null;
}

/**
 * Đồng bộ mô tả/ghi chú nhiệm vụ dự án (tasks) sang lead_documents để các module SX/VC đọc chung.
 *
 * @param {object} task — row tasks sau update
 * @param {{ userId?: string }} opts
 */
async function upsertLeadDocumentFromProjectTask(task, opts = {}) {
  const projectId = task.project_id;
  if (!projectId || !task.id) return { skipped: true, reason: 'no_project_or_task' };

  const body = combinedTaskText(task);
  const leadId = await resolveLeadIdForProject(projectId);
  if (!leadId) return { skipped: true, reason: 'no_crm_lead' };

  const name = `📝 NV dự án: ${task.title || 'Nhiệm vụ'}`;
  const createdBy = opts.userId || task.created_by_id || null;

  const existingId = await findExistingMirrorDocId(task.id, projectId, name);

  if (!body.trim()) {
    if (existingId) {
      await supabase.from('lead_documents').delete().eq('id', existingId);
      return { deleted: true };
    }
    return { skipped: true, reason: 'empty_text' };
  }

  const basePayload = {
    lead_id: leadId,
    project_id: projectId,
    name,
    doc_type: 'requirement',
    notes: body,
    shared_to_workshop: true,
    allowed_share_modules: null,
  };

  if (existingId) {
    const { error } = await supabase
      .from('lead_documents')
      .update({ ...basePayload, source_project_task_id: task.id })
      .eq('id', existingId);
    if (error && String(error.message || '').includes('source_project_task_id')) {
      const { error: e2 } = await supabase.from('lead_documents').update(basePayload).eq('id', existingId);
      if (e2) throw e2;
      return { ok: true, id: existingId, updated: true, fallback: true };
    }
    if (error) throw error;
    return { ok: true, id: existingId, updated: true };
  }

  const insertPayload = { ...basePayload, created_by: createdBy, source_project_task_id: task.id };
  const { data: ins, error } = await supabase.from('lead_documents').insert(insertPayload).select('id').single();
  if (error && String(error.message || '').includes('source_project_task_id')) {
    const { data: ins2, error: e2 } = await supabase
      .from('lead_documents')
      .insert({ ...basePayload, created_by: createdBy })
      .select('id')
      .single();
    if (e2) throw e2;
    return { ok: true, id: ins2?.id, created: true, fallback: true };
  }
  if (error) throw error;
  return { ok: true, id: ins?.id, created: true };
}

module.exports = {
  upsertLeadDocumentFromProjectTask,
  resolveLeadIdForProject,
};

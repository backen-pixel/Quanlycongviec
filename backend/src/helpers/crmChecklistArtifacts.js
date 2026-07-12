/**
 * Đồng bộ ghi chú / đính kèm của mục checklist con (crm_tasks.checklist[]) → lead_documents.
 */
const { getLeadDocumentFieldsFromCrmTask, getDefaultCrmAttachmentShare } = require('./crmTaskLeadDocumentMeta');
const { getTaskVisibilityAllowlist } = require('./documentShareScope');

function parseChecklist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    if (typeof c === 'string') {
      return { id: `ckidx_${i}`, title: c, description: '', notes: '', done: false };
    }
    return {
      id: c?.id || `ckidx_${i}`,
      title: c?.title || c?.label || '',
      description: c?.description || '',
      notes: c?.notes || '',
      done: !!(c?.done ?? c?.is_completed),
    };
  });
}

function findChecklistItem(taskRow, checklistId) {
  if (!taskRow || !checklistId) return null;
  return parseChecklist(taskRow.checklist).find((c) => String(c.id) === String(checklistId)) || null;
}

function artifactNamePrefix(taskTitle, checklistTitle) {
  const t = taskTitle || 'Nhiệm vụ';
  if (checklistTitle) return `[${t} › ${checklistTitle}]`;
  return `[${t}]`;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function syncChecklistItemNotes(supabase, {
  leadId,
  taskRow,
  checklistId,
  notes,
  userId,
}) {
  const ck = findChecklistItem(taskRow, checklistId);
  if (!ck) return { ok: false, error: 'checklist_not_found' };

  const { data: leadForSync } = await supabase.from('crm_leads')
    .select('project_id').eq('id', leadId).maybeSingle();
  const taskDocOpts = { linkToProject: !!leadForSync?.project_id };
  const prefix = artifactNamePrefix(taskRow.title, ck.title);
  const trimmed = (notes || '').trim();

  const attFilter = supabase.from('crm_task_attachments')
    .select('id')
    .eq('task_id', taskRow.id)
    .eq('checklist_id', String(checklistId))
    .eq('doc_type', 'checklist_inline_note')
    .limit(1);

  const { data: existingAtt } = await attFilter.maybeSingle();

  if (!trimmed) {
    if (existingAtt?.id) {
      await supabase.from('crm_task_attachments').delete().eq('id', existingAtt.id);
      await supabase.from('lead_documents').delete().eq('source_attachment_id', existingAtt.id);
    }
    return { ok: true, cleared: true };
  }

  const noteShare = getDefaultCrmAttachmentShare(taskRow, taskDocOpts, ck);
  const vis = getTaskVisibilityAllowlist(taskRow);
  const attName = `📝 ${ck.title}`;

  if (existingAtt?.id) {
    await supabase.from('crm_task_attachments')
      .update({
        notes: trimmed,
        name: attName,
        allowed_companies: vis.allowed_companies,
        allowed_departments: vis.allowed_departments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingAtt.id);
    await supabase.from('lead_documents')
      .update({
        notes: trimmed,
        name: `${prefix} 📝 Ghi chú`,
        project_id: leadForSync?.project_id ?? null,
        source_checklist_id: String(checklistId),
        allowed_companies: vis.allowed_companies,
        allowed_departments: vis.allowed_departments,
        ...getLeadDocumentFieldsFromCrmTask(taskRow, taskDocOpts),
      })
      .eq('source_attachment_id', existingAtt.id);
    return { ok: true, attachmentId: existingAtt.id };
  }

  const { data: att, error: attErr } = await supabase.from('crm_task_attachments').insert({
    task_id: taskRow.id,
    lead_id: leadId,
    checklist_id: String(checklistId),
    name: attName,
    doc_type: 'checklist_inline_note',
    notes: trimmed,
    created_by: userId,
    allowed_companies: vis.allowed_companies,
    allowed_departments: vis.allowed_departments,
    ...noteShare,
  }).select('id').single();
  if (attErr) throw attErr;

  const docInsert = {
    lead_id: leadId,
    project_id: leadForSync?.project_id || null,
    name: `${prefix} 📝 Ghi chú`,
    doc_type: 'checklist_inline_note',
    notes: trimmed,
    allowed_companies: vis.allowed_companies,
    allowed_departments: vis.allowed_departments,
    created_by: userId,
    source_attachment_id: att.id,
    source_checklist_id: String(checklistId),
    ...getLeadDocumentFieldsFromCrmTask(taskRow, taskDocOpts),
  };
  let { error: docErr } = await supabase.from('lead_documents').insert(docInsert);
  if (docErr && String(docErr.message || '').toLowerCase().includes('source_checklist_id')) {
    const { source_checklist_id: _c, ...legacy } = docInsert;
    ({ error: docErr } = await supabase.from('lead_documents').insert(legacy));
  }
  if (docErr) throw docErr;

  return { ok: true, attachmentId: att.id };
}

function buildChecklistLeadDocumentRow({
  leadId,
  taskRow,
  checklistId,
  checklistTitle,
  att,
  taskDocOpts,
  finalCompanies,
  finalDepts,
  userId,
}) {
  const prefix = artifactNamePrefix(taskRow?.title, checklistTitle);
  return {
    lead_id: leadId,
    project_id: taskDocOpts?.projectId || null,
    name: `${prefix} ${att.name}`,
    doc_type: att.doc_type,
    file_url: att.file_url,
    file_name: att.file_name,
    file_size: att.file_size,
    mime_type: att.mime_type,
    notes: att.notes,
    allowed_companies: finalCompanies,
    allowed_departments: finalDepts,
    created_by: userId,
    source_attachment_id: att.id,
    source_checklist_id: checklistId ? String(checklistId) : null,
    ...getLeadDocumentFieldsFromCrmTask(taskRow, taskDocOpts, att),
  };
}

module.exports = {
  parseChecklist,
  findChecklistItem,
  artifactNamePrefix,
  syncChecklistItemNotes,
  buildChecklistLeadDocumentRow,
};

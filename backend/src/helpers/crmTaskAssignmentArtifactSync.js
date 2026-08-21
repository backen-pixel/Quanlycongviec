/**
 * Đồng bộ file & ghi chú giữa crm_tasks (tab Nhiệm vụ) ↔ crm_assignments (Giao việc).
 */
const { supabase } = require('../config/supabase');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');

const STORAGE_BUCKET = 'attachments';

function isLinkColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('source_assignment_file_id') || m.includes('source_task_attachment_id');
}

async function fetchAssignmentForTask(taskId) {
  if (!taskId) return null;
  const { data, error } = await supabase
    .from('crm_assignments')
    .select('id, crm_task_id, assignee_id, created_by_id, lead_id')
    .eq('crm_task_id', taskId)
    .maybeSingle();
  if (error && /crm_task_id/.test(error.message || '')) return null;
  if (error) throw error;
  return data;
}

function resolveKindForTaskAttachment(att, assignment) {
  const uploader = att.created_by ? String(att.created_by) : '';
  const assignee = assignment?.assignee_id ? String(assignment.assignee_id) : '';
  if (uploader && assignee && uploader === assignee) return 'sub';
  return 'req';
}

function assignmentFileRowFromAttachment(att, assignmentId, kind, uploadedBy) {
  return {
    assignment_id: assignmentId,
    kind,
    file_name: att.file_name || att.name || 'File',
    file_url: att.file_url,
    file_size: att.file_size || 0,
    mime_type: att.mime_type || null,
    storage_path: att.storage_path || null,
    uploaded_by: uploadedBy || att.created_by || null,
    source_task_attachment_id: att.id,
  };
}

function taskAttachmentRowFromAssignmentFile(asnFile, taskId, leadId, userId) {
  const isLink = asnFile.mime_type === 'text/uri-list';
  return {
    task_id: taskId,
    lead_id: leadId,
    name: asnFile.file_name || 'File',
    file_url: asnFile.file_url,
    file_name: asnFile.file_name || null,
    file_size: asnFile.file_size || 0,
    mime_type: asnFile.mime_type || null,
    doc_type: isLink ? 'other' : 'other',
    notes: null,
    created_by: userId || asnFile.uploaded_by || null,
    source_assignment_file_id: asnFile.id,
  };
}

async function upsertAssignmentFileFromAttachment(att, assignment, req) {
  if (!att?.id || !assignment?.id) return null;
  if (att.doc_type === 'task_inline_note') return null;
  if (!att.file_url) return null;

  const kind = resolveKindForTaskAttachment(att, assignment);
  const uid = req?.user?.userId || req?.user?.id || att.created_by || null;
  const row = assignmentFileRowFromAttachment(att, assignment.id, kind, uid);

  if (att.source_assignment_file_id) {
    const { data, error } = await supabase
      .from('crm_assignment_files')
      .update({
        kind: row.kind,
        file_name: row.file_name,
        file_url: row.file_url,
        file_size: row.file_size,
        mime_type: row.mime_type,
        source_task_attachment_id: att.id,
      })
      .eq('id', att.source_assignment_file_id)
      .select('id')
      .maybeSingle();
    if (error && !isLinkColumnError(error)) throw error;
    return data?.id || att.source_assignment_file_id;
  }

  const { data: existing } = await supabase
    .from('crm_assignment_files')
    .select('id')
    .eq('source_task_attachment_id', att.id)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from('crm_task_attachments')
      .update({ source_assignment_file_id: existing.id })
      .eq('id', att.id)
      .then(({ error: e }) => { if (e && !isLinkColumnError(e)) throw e; });
    return existing.id;
  }

  let insertRow = { ...row };
  let { data: created, error } = await supabase
    .from('crm_assignment_files')
    .insert(insertRow)
    .select('id')
    .single();
  if (error && isLinkColumnError(error)) {
    const { source_task_attachment_id: _s, ...legacy } = insertRow;
    ({ data: created, error } = await supabase.from('crm_assignment_files').insert(legacy).select('id').single());
  }
  if (error) throw error;

  if (created?.id) {
    const patch = { source_assignment_file_id: created.id };
    const { error: patchErr } = await supabase.from('crm_task_attachments').update(patch).eq('id', att.id);
    if (patchErr && !isLinkColumnError(patchErr)) throw patchErr;
  }
  return created?.id || null;
}

async function upsertTaskAttachmentFromAssignmentFile(asnFile, req) {
  if (!asnFile?.id || !asnFile.file_url) return null;

  const { data: assignment } = await supabase
    .from('crm_assignments')
    .select('id, crm_task_id, lead_id')
    .eq('id', asnFile.assignment_id)
    .maybeSingle();
  if (!assignment?.crm_task_id || !assignment.lead_id) return null;

  const uid = req?.user?.userId || req?.user?.id || asnFile.uploaded_by || null;

  if (asnFile.source_task_attachment_id) {
    const { data, error } = await supabase
      .from('crm_task_attachments')
      .update({
        name: asnFile.file_name || 'File',
        file_url: asnFile.file_url,
        file_name: asnFile.file_name,
        file_size: asnFile.file_size || 0,
        mime_type: asnFile.mime_type,
      })
      .eq('id', asnFile.source_task_attachment_id)
      .select('id')
      .maybeSingle();
    if (error && !isLinkColumnError(error)) throw error;
    return data?.id || asnFile.source_task_attachment_id;
  }

  const { data: existing } = await supabase
    .from('crm_task_attachments')
    .select('id')
    .eq('source_assignment_file_id', asnFile.id)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from('crm_assignment_files')
      .update({ source_task_attachment_id: existing.id })
      .eq('id', asnFile.id)
      .then(({ error: e }) => { if (e && !isLinkColumnError(e)) throw e; });
    return existing.id;
  }

  let insertRow = taskAttachmentRowFromAssignmentFile(
    asnFile,
    assignment.crm_task_id,
    assignment.lead_id,
    uid,
  );
  let { data: created, error } = await supabase
    .from('crm_task_attachments')
    .insert(insertRow)
    .select('id')
    .single();
  if (error && isLinkColumnError(error)) {
    const { source_assignment_file_id: _s, ...legacy } = insertRow;
    ({ data: created, error } = await supabase.from('crm_task_attachments').insert(legacy).select('id').single());
  }
  if (error) throw error;

  if (created?.id) {
    const patch = { source_task_attachment_id: created.id };
    const { error: patchErr } = await supabase.from('crm_assignment_files').update(patch).eq('id', asnFile.id);
    if (patchErr && !isLinkColumnError(patchErr)) throw patchErr;
  }
  return created?.id || null;
}

async function syncTaskNotesToAssignment(taskId, assignmentId) {
  const { data: task } = await supabase
    .from('crm_tasks')
    .select('id, notes')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return;
  const notes = String(task.notes || '').trim();
  // Luôn đẩy notes → description (kể cả khi xoá ghi chú) để hai bên khớp.
  await supabase.from('crm_assignments')
    .update({
      description: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);
}

async function syncTaskAttachmentToAssignment(att, req) {
  if (!att?.task_id) return null;
  const assignment = await fetchAssignmentForTask(att.task_id);
  if (!assignment?.id) return null;
  return upsertAssignmentFileFromAttachment(att, assignment, req);
}

async function syncAllTaskArtifactsToAssignment(taskId, assignmentId, req) {
  if (!taskId || !assignmentId) return { synced: 0 };

  try {
    await syncTaskNotesToAssignment(taskId, assignmentId);
  } catch (e) {
    console.warn('[artifact-sync] task notes→assignment:', e.message);
  }

  const { data: attachments, error } = await supabase
    .from('crm_task_attachments')
    .select('id, task_id, lead_id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, source_assignment_file_id')
    .eq('task_id', taskId);
  if (error) throw error;

  let synced = 0;
  const assignment = { id: assignmentId, assignee_id: null };
  const { data: asnRow } = await supabase
    .from('crm_assignments')
    .select('assignee_id')
    .eq('id', assignmentId)
    .maybeSingle();
  assignment.assignee_id = asnRow?.assignee_id || null;

  for (const att of attachments || []) {
    try {
      const id = await upsertAssignmentFileFromAttachment(att, assignment, req);
      if (id) synced += 1;
    } catch (e) {
      console.warn('[artifact-sync] task→assignment file:', e.message);
    }
  }
  return { synced };
}

async function syncAssignmentFileToTask(asnFile, req) {
  try {
    return await upsertTaskAttachmentFromAssignmentFile(asnFile, req);
  } catch (e) {
    console.warn('[artifact-sync] assignment→task file:', e.message);
    return null;
  }
}

async function deleteMirroredAssignmentFileForTaskAttachment(taskAttachmentId, assignmentFileId) {
  let fileId = assignmentFileId || null;
  if (!fileId) {
    const { data: row } = await supabase
      .from('crm_assignment_files')
      .select('id, storage_path')
      .eq('source_task_attachment_id', taskAttachmentId)
      .maybeSingle();
    if (!row?.id) return;
    fileId = row.id;
    if (row.storage_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([row.storage_path]).catch(() => {});
    }
  }
  await supabase.from('crm_assignment_files').delete().eq('id', fileId);
}

async function deleteMirroredTaskAttachmentForAssignmentFile(assignmentFileId, taskAttachmentId) {
  let attId = taskAttachmentId || null;
  if (!attId) {
    const { data: row } = await supabase
      .from('crm_task_attachments')
      .select('id')
      .eq('source_assignment_file_id', assignmentFileId)
      .maybeSingle();
    attId = row?.id || null;
  }
  if (!attId) return;
  await supabase.from('lead_documents').delete().eq('source_attachment_id', attId);
  await supabase.from('crm_task_attachments').delete().eq('id', attId);
}

async function syncProductionLeadTasksToAssignments(req, leadId, opts = {}) {
  const {
    fingerprints,
    fingerprintFn,
    assignmentModule = 'production',
    limit = 50,
  } = opts;
  if (!leadId || !fingerprints?.size || typeof fingerprintFn !== 'function') {
    return { synced_assignments: 0, synced_artifacts: 0 };
  }

  const { attachAssigneesToCrmTasks } = require('./crmTaskAssignees');

  const { data: tasks, error } = await supabase
    .from('crm_tasks')
    .select('id, lead_id, title, description, status, priority, deadline, stage_slug, assignee_id, completed_at, executor_company_id')
    .eq('lead_id', leadId)
    .like('stage_slug', 'sx_%')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  let synced_assignments = 0;
  let synced_artifacts = 0;
  const leadCache = { lead: null };
  const shouldNotify = opts.notify !== false;
  const { notifyAfterCrmTaskAssignmentSync } = require('./crmAssignmentNotifications');

  for (const task of tasks || []) {
    if (!fingerprints.has(fingerprintFn(task.title, task.stage_slug))) continue;
    await attachAssigneesToCrmTasks([task]);
    const ids = (task.assignees || []).map((u) => u.id).filter(Boolean);
    const assigneeIds = ids.length ? ids : (task.assignee_id ? [task.assignee_id] : []);
    if (!assigneeIds.length) continue;
    try {
      const r0 = await syncAssignmentFromCrmTask(req, task, assigneeIds, { assignmentModule });
      if (!r0?.assignmentId) continue;
      synced_assignments += 1;
      await notifyAfterCrmTaskAssignmentSync(req, {
        task,
        assigneeIds,
        assignmentId: r0.assignmentId,
        leadCache,
        assignmentModule,
        notify: shouldNotify,
      });
      const art = await syncAllTaskArtifactsToAssignment(task.id, r0.assignmentId, req);
      synced_artifacts += art?.synced || 0;
    } catch (e) {
      console.warn('[syncProductionLeadTasksToAssignments]', e.message);
    }
  }

  return { synced_assignments, synced_artifacts };
}

module.exports = {
  fetchAssignmentForTask,
  syncTaskAttachmentToAssignment,
  syncAllTaskArtifactsToAssignment,
  syncAssignmentFileToTask,
  deleteMirroredAssignmentFileForTaskAttachment,
  deleteMirroredTaskAttachmentForAssignmentFile,
  syncProductionLeadTasksToAssignments,
};

/**
 * Khi xóa lead/deal CRM: xóa luôn các dự án SX độc quyền gắn deal đó
 * (project_id chính + dự án phát sinh / xưởng phụ trong crm_deal_projects).
 *
 * Lưu ý: supabase-js không throw khi delete/update fail — phải đọc { error }.
 * quotations/orders/invoices/stage_transitions trỏ projects(id) kiểu RESTRICT,
 * nên phải gỡ FK trước, nếu không projects.delete im lặng thất bại và card SX còn.
 */
async function listProjectIdsLinkedToLeads(supabase, leadIds) {
  const ids = [...new Set((leadIds || []).map((x) => String(x || '')).filter(Boolean))];
  const set = new Set();
  if (!ids.length) return [];

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, project_id')
    .in('id', ids);
  if (leadErr) console.warn('[delete-sx-projects] list leads:', leadErr.message);
  for (const row of leads || []) {
    if (row?.project_id) set.add(String(row.project_id));
  }

  const { data: links, error: linkErr } = await supabase
    .from('crm_deal_projects')
    .select('project_id')
    .in('deal_id', ids);
  if (linkErr && !/crm_deal_projects/i.test(String(linkErr.message || ''))) {
    console.warn('[delete-sx-projects] list crm_deal_projects:', linkErr.message);
  }
  for (const row of links || []) {
    if (row?.project_id) set.add(String(row.project_id));
  }

  return [...set];
}

async function projectHasOtherDealLinks(supabase, projectId, deletingLeadIds) {
  const deleting = new Set((deletingLeadIds || []).map(String));

  const { data: byPrimary } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId);
  if ((byPrimary || []).some((row) => row?.id && !deleting.has(String(row.id)))) return true;

  const { data: byJunction, error } = await supabase
    .from('crm_deal_projects')
    .select('deal_id')
    .eq('project_id', projectId);
  if (error) return false;
  return (byJunction || []).some((row) => row?.deal_id && !deleting.has(String(row.deal_id)));
}

async function clearRestrictingProjectFks(supabase, projectId) {
  const ops = [
    supabase.from('quotations').update({ project_id: null }).eq('project_id', projectId),
    supabase.from('orders').update({ project_id: null }).eq('project_id', projectId),
    supabase.from('invoices').update({ project_id: null }).eq('project_id', projectId),
    supabase.from('stage_transitions').delete().eq('project_id', projectId),
  ];
  const results = await Promise.all(ops);
  for (const r of results) {
    if (r?.error) console.warn('[delete-sx-projects] clear FK:', r.error.message);
  }
}

async function hardDeleteProductionProject(supabase, projectId) {
  const pid = String(projectId || '');
  if (!pid) return { ok: false, error: 'missing_project_id' };

  const { data: taskIds, error: taskSelErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', pid);
  if (taskSelErr) console.warn('[delete-sx-projects] list tasks:', taskSelErr.message);
  if (taskIds?.length) {
    const ids = taskIds.map((t) => t.id);
    const taskKids = await Promise.all([
      supabase.from('task_checklists').delete().in('task_id', ids),
      supabase.from('task_comments').delete().in('task_id', ids),
      supabase.from('task_participants').delete().in('task_id', ids),
      supabase.from('task_time_logs').delete().in('task_id', ids),
      supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids),
    ]);
    for (const r of taskKids) {
      if (r?.error) console.warn('[delete-sx-projects] task child:', r.error.message);
    }
  }

  await Promise.all([
    supabase.from('tasks').delete().eq('project_id', pid),
    supabase.from('project_comments').delete().eq('project_id', pid),
    supabase.from('project_workflow_lines').delete().eq('project_id', pid),
    supabase.from('project_products').delete().eq('project_id', pid),
    supabase.from('project_company_assignments').delete().eq('project_id', pid),
    supabase.from('project_approvals').delete().eq('project_id', pid),
    supabase.from('crm_deal_projects').delete().eq('project_id', pid),
    supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', pid),
    supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', pid),
  ]);

  await clearRestrictingProjectFks(supabase, pid);

  const { error } = await supabase.from('projects').delete().eq('id', pid);
  if (error) {
    console.warn('[delete-sx-projects] projects.delete', pid, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * @returns {{ deleted: number, failed: string[], projectIds: string[] }}
 */
async function deleteExclusiveProjectsForLeads(supabase, leadIds, opts = {}) {
  const ids = [...new Set((leadIds || []).map((x) => String(x || '')).filter(Boolean))];
  const empty = { deleted: 0, failed: [], projectIds: [] };
  if (!ids.length) return empty;

  const linked = await listProjectIdsLinkedToLeads(supabase, ids);
  if (!linked.length) return empty;

  const exclusive = [];
  for (const pid of linked) {
    const shared = await projectHasOtherDealLinks(supabase, pid, ids);
    if (!shared) exclusive.push(pid);
  }
  if (!exclusive.length) return empty;

  if (!opts.skipSnapshot) {
    try {
      const { snapshotProject } = require('./trashSnapshot');
      for (const pid of exclusive) {
        const snap = await snapshotProject(supabase, pid, opts.deletedBy || null, {
          delete_reason: opts.deleteReason || 'Xóa cùng deal/lead CRM',
        });
        if (!snap?.ok) console.warn('[delete-sx-projects] snapshot:', pid, snap?.error);
      }
    } catch (e) {
      console.warn('[delete-sx-projects] snapshot:', e.message);
    }
  }

  let io = opts.io || null;
  try {
    if (io) {
      const { emitProductionKanbanChangedImmediate } = require('./workshopIntakeNotify');
      for (const pid of exclusive) {
        emitProductionKanbanChangedImmediate(io, { projectId: pid, reason: 'crm_lead_deleted' });
      }
    }
  } catch (e) {
    console.warn('[delete-sx-projects] emit kanban:', e.message);
  }

  const failed = [];
  let deleted = 0;
  for (const pid of exclusive) {
    const res = await hardDeleteProductionProject(supabase, pid);
    if (res.ok) deleted += 1;
    else failed.push(pid);
  }

  try {
    const { invalidateWonDealProjectIdsCache } = require('./workshopKanban');
    invalidateWonDealProjectIdsCache();
  } catch (e) {
    console.warn('[delete-sx-projects] invalidate wonIds:', e.message);
  }

  return { deleted, failed, projectIds: exclusive };
}

module.exports = {
  listProjectIdsLinkedToLeads,
  clearRestrictingProjectFks,
  hardDeleteProductionProject,
  deleteExclusiveProjectsForLeads,
};

/**
 * Gán nhiều NV mặc định trên crm_task_template_items / workshop_task_template_items.
 */
const { replaceCrmTaskAssignees } = require('./crmTaskAssignees');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');
const { notifyAfterCrmTaskAssignmentSync } = require('./crmAssignmentNotifications');

function normalizeTemplateItemAssigneeIds(source) {
  if (!source) return [];
  if (Array.isArray(source.default_assignee_ids)) {
    return [...new Set(source.default_assignee_ids.filter(Boolean).map(String))];
  }
  if (source.default_assignee_id) return [String(source.default_assignee_id)];
  return [];
}

function primaryTemplateItemAssigneeId(source) {
  const ids = normalizeTemplateItemAssigneeIds(source);
  return ids[0] || null;
}

/** Chuẩn hoá payload PUT/POST từ default_assignee_ids hoặc default_assignee_id (legacy). */
function templateItemAssigneePatch(body) {
  if (!body || typeof body !== 'object') return {};
  if (body.default_assignee_ids !== undefined) {
    const ids = normalizeTemplateItemAssigneeIds(body);
    return { default_assignee_ids: ids, default_assignee_id: ids[0] || null };
  }
  if (body.default_assignee_id !== undefined) {
    const id = body.default_assignee_id ? String(body.default_assignee_id) : null;
    return { default_assignee_ids: id ? [id] : [], default_assignee_id: id };
  }
  return {};
}

function isDefaultAssigneeIdsColumnError(err) {
  return String(err?.message || '').includes('default_assignee_ids');
}

async function applyAssigneesToInsertedCrmTasks(createdTasks, assigneeIdsList, req, opts = {}) {
  const rows = createdTasks || [];
  const idsList = assigneeIdsList || [];
  if (!rows.length) return { applied: 0 };

  let applied = 0;
  const leadCache = { lead: null };
  const shouldNotify = opts.notify !== false;
  for (let i = 0; i < rows.length; i++) {
    const task = rows[i];
    if (!task?.id) continue;
    const ids = idsList[i] || normalizeTemplateItemAssigneeIds({ assignee_id: task.assignee_id });
    if (!ids.length) continue;
    await replaceCrmTaskAssignees(task.id, ids);
    applied += 1;
    if (opts.syncAssignments === false || !req) continue;
    try {
      const assignmentModule = opts.assignmentModule
        || (String(task.stage_slug || '').startsWith('sx_') ? 'production' : 'crm');
      const sync = await syncAssignmentFromCrmTask(req, { ...task, assignee_id: ids[0] }, ids, { assignmentModule });
      await notifyAfterCrmTaskAssignmentSync(req, {
        task,
        assigneeIds: ids,
        assignmentId: sync?.assignmentId,
        leadCache,
        assignmentModule,
        notify: shouldNotify,
      });
    } catch (e) {
      console.warn('[templateItemAssignees] sync assignment:', e.message);
    }
  }
  return { applied };
}

/** Sau bulk insert: map fingerprint → assigneeIds, lọc cùng filter với rows insert. */
function assigneeIdsForFilteredInserts(allInserts, filteredInserts, fingerprintFn) {
  const byFp = new Map();
  for (const row of allInserts || []) {
    byFp.set(fingerprintFn(row.title, row.stage_slug), normalizeTemplateItemAssigneeIds({
      assignee_id: row.assignee_id,
      default_assignee_ids: row.__template_assignee_ids,
    }));
  }
  return (filteredInserts || []).map((row) => {
    const fromMeta = row.__template_assignee_ids;
    if (Array.isArray(fromMeta) && fromMeta.length) return fromMeta.map(String);
    return byFp.get(fingerprintFn(row.title, row.stage_slug)) || [];
  });
}

function stripAssigneeMetaFromInsertRow(row) {
  if (!row || typeof row !== 'object') return row;
  const { __template_assignee_ids: _a, ...rest } = row;
  return rest;
}

module.exports = {
  normalizeTemplateItemAssigneeIds,
  primaryTemplateItemAssigneeId,
  templateItemAssigneePatch,
  isDefaultAssigneeIdsColumnError,
  applyAssigneesToInsertedCrmTasks,
  assigneeIdsForFilteredInserts,
  stripAssigneeMetaFromInsertRow,
};

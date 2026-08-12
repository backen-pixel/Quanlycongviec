/**
 * Gán nhiều NV mặc định trên crm_task_template_items / workshop_task_template_items.
 */
const { replaceCrmTaskAssignees } = require('./crmTaskAssignees');
const { ensureActiveAssignmentForLead } = require('./crmSequentialAssignment');
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
  }

  // Tuần tự: chỉ 1 Giao việc mở / lead — không sync từng NV.
  if (opts.syncAssignments !== false && req) {
    const leadId = rows.find((t) => t?.lead_id)?.lead_id || null;
    if (leadId) {
      try {
        const seq = await ensureActiveAssignmentForLead(req, leadId);
        if (shouldNotify && seq?.assignmentId && seq?.taskId) {
          const task = rows.find((t) => String(t.id) === String(seq.taskId)) || rows[0];
          const assignmentModule = opts.assignmentModule
            || (String(task?.stage_slug || '').startsWith('sx_') ? 'production' : 'crm');
          const assigneeIds = idsList[rows.findIndex((t) => String(t.id) === String(seq.taskId))]
            || (task?.assignee_id ? [String(task.assignee_id)] : []);
          await notifyAfterCrmTaskAssignmentSync(req, {
            task,
            assigneeIds,
            assignmentId: seq.assignmentId,
            leadCache,
            assignmentModule,
            notify: shouldNotify,
          });
        }
      } catch (e) {
        console.warn('[templateItemAssignees] sequential assignment:', e.message);
      }
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
  const {
    __template_assignee_ids: _a,
    __assignment_module: _m,
    ...rest
  } = row;
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

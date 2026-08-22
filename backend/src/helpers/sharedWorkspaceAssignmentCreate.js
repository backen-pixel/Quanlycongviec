/**
 * Tạo cặp crm_tasks + crm_assignments từ form Phân công Không gian chung.
 * Đồng bộ trực tiếp (không qua sequential «1 assignment mở / deal»).
 */
const { supabase } = require('../config/supabase');
const { createCrmLeadTask } = require('./crmLeadTaskMutations');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');
const { replaceCrmTaskAssignees, attachAssigneesToCrmTasks } = require('./crmTaskAssignees');
const {
  resolveTaskSourceFields,
  resolvePhatSinhFields,
  normalizeAssignModule,
  stageSlugForAssignModule,
  isTaskSourceColumnError,
} = require('./sharedWorkspaceTaskSource');

const ASSIGNMENT_SELECT = `
  id, company_id, executor_company_id, column_id, lead_id, crm_task_id, assignment_module,
  task_source_type, employee_error_module, error_type_id, department_id, phat_sinh_kind,
  title, description, assignee_id, created_by_id, priority, status, deadline,
  position, created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar, role, drive_module),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
  lead:crm_leads(id, code, title, type)
`;

const ASSIGNMENT_SELECT_LEGACY = `
  id, company_id, column_id, lead_id, crm_task_id, assignment_module,
  title, description, assignee_id, created_by_id, priority, status, deadline,
  position, created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar, role, drive_module),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
  lead:crm_leads(id, code, title, type)
`;

async function loadAssignmentById(assignmentId) {
  let { data, error } = await supabase
    .from('crm_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('id', assignmentId)
    .maybeSingle();
  if (error && isTaskSourceColumnError(error)) {
    ({ data, error } = await supabase
      .from('crm_assignments')
      .select(ASSIGNMENT_SELECT_LEGACY)
      .eq('id', assignmentId)
      .maybeSingle());
  }
  if (error) throw error;
  return data || null;
}

async function hydrateAssignees(assignment) {
  if (!assignment?.id) return assignment;
  const { attachRoleToUser, isAssignRoleColumnError } = require('./assignmentAssigneeRoles');
  let { data: asnRows, error } = await supabase
    .from('crm_assignment_assignees')
    .select('user_id, assign_role, user:users(id, full_name, email, avatar, role, drive_module)')
    .eq('assignment_id', assignment.id);
  if (error && isAssignRoleColumnError(error)) {
    ({ data: asnRows, error } = await supabase
      .from('crm_assignment_assignees')
      .select('user_id, user:users(id, full_name, email, avatar, role, drive_module)')
      .eq('assignment_id', assignment.id));
  }
  assignment.assignees = (asnRows || []).map((r) => attachRoleToUser(r.user, r.assign_role)).filter(Boolean);
  if (!assignment.assignees.length && assignment.assignee) {
    assignment.assignees = [assignment.assignee];
  }
  return assignment;
}

/**
 * @param {object} req
 * @param {string} leadId
 * @param {object} body
 */
async function createSharedWorkspaceLinkedAssignment(req, leadId, body = {}) {
  const title = String(body.title || '').trim();
  if (!title) return { error: 'Cần tiêu đề', status: 400 };

  const rawIds = Array.isArray(body.assignee_ids)
    ? body.assignee_ids.filter(Boolean).map(String)
    : (body.assignee_id ? [String(body.assignee_id)] : []);
  if (!rawIds.length) {
    return { error: 'Chọn ít nhất một thành viên để giao việc', status: 400 };
  }

  const source = resolveTaskSourceFields(body, { required: true });
  if (!source.ok) return { error: source.error, status: source.status || 400 };
  const phatSinh = resolvePhatSinhFields(body);
  if (!phatSinh.ok) return { error: phatSinh.error, status: phatSinh.status || 400 };
  const { normalizeErrorTypeId } = require('./sharedWorkspaceErrorTypes');
  const { roleMapFromBody, pickPrimaryAssigneeId } = require('./assignmentAssigneeRoles');
  const errorTypeId = body.error_type_id !== undefined ? normalizeErrorTypeId(body.error_type_id) : undefined;
  const rolesByUserId = roleMapFromBody(body);

  const assignmentModule = normalizeAssignModule(body.assignment_module);
  const stageSlug = stageSlugForAssignModule(assignmentModule);

  const { data: memRows } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', leadId);
  const memberSet = new Set((memRows || []).map((m) => String(m.user_id)));
  const missing = rawIds.filter((id) => !memberSet.has(String(id)));
  if (missing.length) {
    const addedBy = req.user?.userId || req.user?.id || null;
    const rows = missing.map((user_id) => ({
      lead_id: leadId,
      user_id,
      role: 'member',
      added_by: addedBy,
    }));
    const { error: addErr } = await supabase
      .from('lead_members')
      .upsert(rows, { onConflict: 'lead_id,user_id' });
    if (addErr) {
      console.warn('[shared-ws] auto-add lead_members:', addErr.message);
    }
  }

  const { data: leadInfo } = await supabase
    .from('crm_leads')
    .select('id, company_id, code, title, type, stage_id, project_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!leadInfo) return { error: 'Lead/deal không tồn tại', status: 404 };

  let effectiveCompany = body.company_id || leadInfo.company_id || req.user?.company_id || null;
  let executorCompanyId = null;
  if (
    body.executor_company_id
    && leadInfo.company_id
    && String(body.executor_company_id) !== String(leadInfo.company_id)
  ) {
    executorCompanyId = String(body.executor_company_id);
  } else if (
    effectiveCompany
    && leadInfo.company_id
    && String(effectiveCompany) !== String(leadInfo.company_id)
  ) {
    executorCompanyId = String(effectiveCompany);
  } else if (body.executor_company_id) {
    executorCompanyId = String(body.executor_company_id);
  }

  const targetExec = executorCompanyId || (body.executor_company_id ? String(body.executor_company_id) : null);
  if (targetExec) {
    try {
      const { listProjectParticipantCompanies, isParticipantCompany } = require('./projectParticipantCompanies');
      let pid = leadInfo.project_id || body.project_id || null;
      if (!pid) {
        const { data: link } = await supabase
          .from('crm_deal_projects')
          .select('project_id')
          .eq('deal_id', leadId)
          .limit(1)
          .maybeSingle();
        pid = link?.project_id || null;
      }
      if (pid) {
        const companies = await listProjectParticipantCompanies(pid);
        if (!isParticipantCompany(companies, targetExec)) {
          return { error: 'Chỉ giao việc cho công ty đã thuộc dự án này', status: 400 };
        }
      }
    } catch (e) {
      console.warn('[shared-ws] participant companies:', e.message);
    }
  }

  let deadline = body.deadline || null;
  if (!deadline && phatSinh.phat_sinh_kind) {
    try {
      const { getSxScheduleConfig } = require('./sxCompanyScheduleConfig');
      const { loadSxHolidayIndex } = require('./sxWorkshopSchedule');
      const { resolvePhatSinhDeadlineIso } = require('./sxPhatSinhDeadline');
      const slaCompanyId = executorCompanyId || effectiveCompany || leadInfo.company_id;
      const { listPhatSinhKinds, findPhatSinhKind } = require('./sharedWorkspacePhatSinhKinds');
      const [cfg, holidays, kinds] = await Promise.all([
        getSxScheduleConfig(slaCompanyId),
        loadSxHolidayIndex(slaCompanyId),
        listPhatSinhKinds({ companyId: slaCompanyId }),
      ]);
      deadline = resolvePhatSinhDeadlineIso({
        kind: phatSinh.phat_sinh_kind,
        kindRow: findPhatSinhKind(kinds, phatSinh.phat_sinh_kind),
        config: cfg,
        holidayIndex: holidays,
        companyId: slaCompanyId,
      });
    } catch (e) {
      console.warn('[shared-ws] phat sinh deadline:', e.message);
    }
  }

  // Tạo crm_tasks — skip side-effect sequential; route sẽ sync trực tiếp + notify 1 lần.
  const taskResult = await createCrmLeadTask(req, leadId, {
    title,
    description: body.description || null,
    priority: body.priority || 'medium',
    status: body.status || 'pending',
    deadline,
    assignee_ids: rawIds,
    pipeline_stage_id: body.pipeline_stage_id || leadInfo.stage_id || null,
    stage_slug: stageSlug,
    order_index: body.order_index || 0,
    executor_company_id: executorCompanyId,
    task_source_type: source.task_source_type,
    employee_error_module: source.employee_error_module,
    department_id: phatSinh.department_id,
    phat_sinh_kind: phatSinh.phat_sinh_kind,
    error_type_id: errorTypeId,
    sync_assignment: 'direct',
    skip_assignment_notify: true,
  });
  if (taskResult.error) {
    return { error: taskResult.error, status: taskResult.status || 500, code: taskResult.code };
  }

  const task = taskResult.data;
  if (!task?.id) {
    return { error: 'Không tạo được nhiệm vụ liên kết', status: 500 };
  }

  // Đảm bảo assignees đã ghi (createCrmLeadTask đã làm; re-assert an toàn)
  try {
    await replaceCrmTaskAssignees(task.id, rawIds);
    const [enriched] = await attachAssigneesToCrmTasks([task]);
    Object.assign(task, enriched || {});
  } catch (e) {
    console.warn('[shared-ws] reassert assignees:', e.message);
  }

  let sync;
  try {
    sync = await syncAssignmentFromCrmTask(req, task, rawIds, {
      assignmentModule,
      columnId: body.column_id || null,
      companyId: effectiveCompany,
      taskSourceType: source.task_source_type,
      employeeErrorModule: source.employee_error_module,
      departmentId: phatSinh.department_id,
      phatSinhKind: phatSinh.phat_sinh_kind,
      errorTypeId,
      assigneeRoles: rolesByUserId,
      forceDirect: true,
    });
  } catch (syncErr) {
    // Compensation: xóa task vừa tạo nếu không gắn được assignment
    try {
      await supabase.from('crm_tasks').delete().eq('id', task.id);
    } catch (_) { /* ignore */ }
    return { error: `Không tạo được giao việc: ${syncErr.message}`, status: 500 };
  }

  const assignmentId = sync?.assignmentId || null;
  if (!assignmentId) {
    try {
      await supabase.from('crm_tasks').delete().eq('id', task.id);
    } catch (_) { /* ignore */ }
    return { error: 'Không tạo được giao việc liên kết', status: 500 };
  }

  // Ghi đè column_id / source fields nếu sync chưa ghi được (schema drift)
  const patch = {
    updated_at: new Date().toISOString(),
    assignment_module: assignmentModule,
  };
  if (body.column_id) patch.column_id = body.column_id;
  if (effectiveCompany) patch.company_id = effectiveCompany;
  patch.task_source_type = source.task_source_type;
  patch.employee_error_module = source.employee_error_module;
  if (phatSinh.department_id !== undefined) patch.department_id = phatSinh.department_id;
  if (phatSinh.phat_sinh_kind !== undefined) patch.phat_sinh_kind = phatSinh.phat_sinh_kind;
  if (errorTypeId !== undefined) patch.error_type_id = errorTypeId;
  if (executorCompanyId) patch.executor_company_id = executorCompanyId;

  let { error: patchErr } = await supabase
    .from('crm_assignments')
    .update(patch)
    .eq('id', assignmentId);
  if (patchErr && isTaskSourceColumnError(patchErr)) {
    const { task_source_type: _t, employee_error_module: _e, error_type_id: _et, ...legacy } = patch;
    ({ error: patchErr } = await supabase.from('crm_assignments').update(legacy).eq('id', assignmentId));
  }
  if (patchErr) {
    console.warn('[shared-ws] patch assignment:', patchErr.message);
  }

  let assignment = await loadAssignmentById(assignmentId);
  assignment = await hydrateAssignees(assignment);
  if (assignment) {
    assignment.crm_task = {
      id: task.id,
      title: task.title,
      status: task.status,
      stage_slug: task.stage_slug,
      task_source_type: source.task_source_type,
      employee_error_module: source.employee_error_module,
    };
  }

  return {
    data: {
      assignment,
      assignee_ids: rawIds,
      task,
      lead: leadInfo,
    },
    status: 201,
  };
}

module.exports = {
  createSharedWorkspaceLinkedAssignment,
};

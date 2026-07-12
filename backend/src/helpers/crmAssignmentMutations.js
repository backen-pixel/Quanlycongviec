/**
 * Core mutations cho crm_assignments — dùng chung từ /api/crm/assignments và /api/work-tasks.
 */
const { supabase } = require('../config/supabase');
const {
  persistAssignmentNotification,
  buildAssignmentNotificationInsert,
} = require('./crmAssignmentNotifications');

const ADMIN_ROLES = new Set(['admin', 'manager', 'sales_admin', 'crm_production_admin']);
const isAdmin = (req) => ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());

const ASSIGNMENT_SELECT = `
  id, company_id, column_id, lead_id, crm_task_id, assignment_module, title, description,
  assignee_id, created_by_id, priority, status, deadline,
  position, created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
  lead:crm_leads(id, code, title, type)
`;

async function expandAssigneeIds({ assignee_ids, department_ids, region_ids, company_id }) {
  const explicit = (assignee_ids || []).filter(Boolean).map(String);
  const set = new Set(explicit);
  const deptIds = (department_ids || []).filter(Boolean);
  if (deptIds.length) {
    const { data } = await supabase.from('users').select('id').in('department_id', deptIds).neq('is_active', false);
    (data || []).forEach((u) => set.add(String(u.id)));
  }
  const regIds = (region_ids || []).filter(Boolean);
  if (regIds.length) {
    const { data } = await supabase.from('user_company_regions').select('user_id').in('region_id', regIds);
    (data || []).forEach((r) => set.add(String(r.user_id)));
  }
  let ids = [...set];
  if (company_id && ids.length) {
    const { data: depts } = await supabase.from('departments').select('id').eq('company_id', company_id);
    const allowDeptIds = new Set((depts || []).map((d) => String(d.id)));
    const { data: usrs } = await supabase.from('users').select('id, department_id').in('id', ids);
    ids = (usrs || []).filter((u) => allowDeptIds.has(String(u.department_id))).map((u) => u.id);
  }
  return ids;
}

async function replaceAssignees(assignmentId, userIds) {
  await supabase.from('crm_assignment_assignees').delete().eq('assignment_id', assignmentId);
  const uniq = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniq.length) return;
  await supabase.from('crm_assignment_assignees').insert(
    uniq.map((uid) => ({ assignment_id: assignmentId, user_id: uid }))
  );
}

async function persistNotification(userId, payload) {
  return persistAssignmentNotification(supabase, userId, {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    assignmentId: payload.entity_id ?? payload.assignment_id,
    metadata: payload.metadata,
  });
}

function pushNotif(req, userId, notif) {
  const io = req.app?.get?.('io');
  if (io) io.to(`user:${userId}`).emit('notification', notif);
}

async function createCrmAssignment(req, body) {
  const {
    title, description, assignee_id, assignee_ids, department_ids, region_ids,
    column_id, company_id, priority, status, deadline, lead_id, assignment_module,
  } = body || {};
  const resolvedModule = assignment_module === 'production' ? 'production' : 'crm';
  if (!title || !title.trim()) return { error: 'Cần tiêu đề', status: 400 };

  let effectiveCompany = isAdmin(req)
    ? (company_id || req.user?.company_id || null)
    : (req.user?.company_id || null);

  let resolvedLeadId = lead_id || null;
  if (resolvedLeadId) {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, company_id')
      .eq('id', resolvedLeadId)
      .maybeSingle();
    if (!leadRow) return { error: 'Lead/deal không tồn tại', status: 404 };
    if (!effectiveCompany && leadRow.company_id) effectiveCompany = leadRow.company_id;
  }

  const finalAssignees = await expandAssigneeIds({
    assignee_ids: assignee_ids?.length ? assignee_ids : (assignee_id ? [assignee_id] : []),
    department_ids, region_ids, company_id: effectiveCompany,
  });
  const primaryAssignee = finalAssignees[0] || null;

  let posBase = 0;
  if (column_id) {
    const { data: maxRow } = await supabase.from('crm_assignments').select('position')
      .eq('column_id', column_id).order('position', { ascending: false }).limit(1).maybeSingle();
    posBase = ((maxRow?.position ?? -1) + 1);
  }

  const insertRow = {
    title: title.trim(),
    description: description || null,
    assignee_id: primaryAssignee,
    created_by_id: req.user.userId,
    column_id: column_id || null,
    company_id: effectiveCompany,
    priority: priority || 'medium',
    status: status || 'pending',
    deadline: deadline || null,
    position: posBase,
    assignment_module: resolvedModule,
    ...(resolvedLeadId ? { lead_id: resolvedLeadId } : {}),
  };

  let { data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single();
  if (error && /assignment_module/.test(error.message || '')) {
    delete insertRow.assignment_module;
    ({ data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single());
  }
  if (error && /lead_id/.test(error.message || '')) {
    delete insertRow.lead_id;
    ({ data, error } = await supabase.from('crm_assignments').insert(insertRow).select(ASSIGNMENT_SELECT).single());
  }
  if (error) return { error: error.message, status: 500 };

  await replaceAssignees(data.id, finalAssignees);
  return { data: { assignment: data, assignee_ids: finalAssignees }, status: 201 };
}

async function updateCrmAssignment(req, assignmentId, body) {
  const { data: before } = await supabase.from('crm_assignments')
    .select('id, assignee_id, status, company_id, created_by_id')
    .eq('id', assignmentId).maybeSingle();
  if (!before) return { error: 'Không tìm thấy nhiệm vụ', status: 404 };

  const update = { updated_at: new Date().toISOString() };
  ['title', 'description', 'column_id', 'priority', 'status', 'deadline', 'position', 'assignee_id'].forEach((f) => {
    if (body[f] !== undefined) update[f] = body[f];
  });
  if (update.status === 'completed' && before.status !== 'completed') {
    update.completed_at = new Date().toISOString();
  } else if (update.status && update.status !== 'completed' && before.status === 'completed') {
    update.completed_at = null;
  }

  const { data, error } = await supabase.from('crm_assignments').update(update)
    .eq('id', assignmentId).select(ASSIGNMENT_SELECT).single();
  if (error) return { error: error.message, status: 500 };
  return { data: { assignment: data }, status: 200 };
}

async function deleteCrmAssignment(req, assignmentId) {
  const { data: row } = await supabase.from('crm_assignments')
    .select('id, created_by_id').eq('id', assignmentId).maybeSingle();
  if (!row) return { error: 'Không tìm thấy nhiệm vụ', status: 404 };
  const { error } = await supabase.from('crm_assignments').delete().eq('id', assignmentId);
  if (error) return { error: error.message, status: 500 };
  return { data: { ok: true }, status: 200 };
}

async function addCrmAssignmentComment(req, assignmentId, body) {
  const content = String(body?.content || '').trim();
  if (!content) return { error: 'Nội dung trống', status: 400 };
  const { data, error } = await supabase.from('crm_assignment_comments').insert({
    assignment_id: assignmentId, user_id: req.user.userId, content,
    parent_id: body.parent_id || null,
  }).select('id, assignment_id, user_id, parent_id, content, created_at, user:users(id, full_name, avatar)').single();
  if (error) return { error: error.message, status: 500 };
  return { data: { comment: data }, status: 201 };
}

module.exports = {
  createCrmAssignment,
  updateCrmAssignment,
  deleteCrmAssignment,
  addCrmAssignmentComment,
};

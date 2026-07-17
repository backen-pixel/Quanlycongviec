const { supabase } = require('../config/supabase');
const { isAdminLike, isProductionAdmin } = require('./adminRole');

const PROJECT_COMMENT_SELECT = '*, user:users!project_comments_user_id_fkey(id,full_name,avatar)';

function getRequestUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

function formatDeadlineVi(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

async function fetchProductionStaffIds(projectId) {
  if (!projectId) return [];
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('user_id')
      .eq('project_id', projectId);
    return (data || []).map((r) => String(r.user_id)).filter(Boolean);
  } catch (_) { return []; }
}

async function fetchLeadMemberUserIds(leadId) {
  if (!leadId) return [];
  try {
    const { data } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', leadId);
    return (data || []).map((r) => String(r.user_id)).filter(Boolean);
  } catch (_) { return []; }
}

async function enrichWithLeadMembers(row) {
  if (!row?.id) return;
  row._member_ids = await fetchLeadMemberUserIds(row.id);
}

async function enrichWithProductionInfo(row, projectId) {
  const pid = projectId || row?.project_id;
  if (!pid) return;
  try {
    const { data: proj } = await supabase
      .from('projects')
      .select('production_person_id')
      .eq('id', pid)
      .maybeSingle();
    if (proj?.production_person_id) row.production_person_id = proj.production_person_id;
  } catch (_) {}
  row._staff_ids = await fetchProductionStaffIds(pid);
}

async function resolveDealRow(leadId, projectId) {
  if (leadId) {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, assigned_to, lead_owner_id, project_id, title')
      .eq('id', leadId)
      .maybeSingle();
    if (data) {
      await enrichWithProductionInfo(data, projectId);
      await enrichWithLeadMembers(data);
      return data;
    }
  }
  if (projectId) {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, assigned_to, lead_owner_id, project_id, title')
      .eq('project_id', projectId)
      .eq('type', 'deal')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      await enrichWithProductionInfo(data, projectId);
      await enrichWithLeadMembers(data);
      return data;
    }
    const { data: proj } = await supabase
      .from('projects')
      .select('id, production_person_id')
      .eq('id', projectId)
      .maybeSingle();
    const staffIds = await fetchProductionStaffIds(projectId);
    return {
      id: null,
      assigned_to: null,
      lead_owner_id: null,
      production_person_id: proj?.production_person_id || null,
      _staff_ids: staffIds,
      project_id: projectId,
      title: null,
    };
  }
  return null;
}

function isDealResponsibleUser(req, dealRow) {
  // admin-like + production_admin: được thao tác Kanban SX (khớp requireProductionKanbanEdit / checkPermission)
  if (isAdminLike(req.user) || isProductionAdmin(req.user)) return true;
  const uid = getRequestUserId(req);
  if (!uid || !dealRow) return false;
  const uidStr = String(uid);
  const crmOwner = dealRow.assigned_to || dealRow.lead_owner_id;
  if (crmOwner != null && String(crmOwner) === uidStr) return true;
  if (dealRow.production_person_id != null && String(dealRow.production_person_id) === uidStr) return true;
  if (Array.isArray(dealRow._staff_ids) && dealRow._staff_ids.includes(uidStr)) return true;
  return false;
}

async function isDealLeadMemberUser(req, dealRow) {
  const uid = getRequestUserId(req);
  if (!uid || !dealRow?.id) return false;
  const uidStr = String(uid);
  if (!Array.isArray(dealRow._member_ids)) {
    dealRow._member_ids = await fetchLeadMemberUserIds(dealRow.id);
  }
  return dealRow._member_ids.includes(uidStr);
}

async function canMutateProductionKanban(req, dealRow) {
  if (isDealResponsibleUser(req, dealRow)) return true;
  return isDealLeadMemberUser(req, dealRow);
}

async function userCanMutateProductionProjectKanban(userId, projectId, user = null) {
  if (!userId || !projectId) return false;
  const dealRow = await resolveDealRow(null, projectId);
  if (!dealRow) return false;
  return canMutateProductionKanban({ user: user || { userId } }, dealRow);
}

async function assertProductionKanbanMutation(req, res, { leadId, projectId } = {}) {
  const dealRow = await resolveDealRow(leadId, projectId);
  if (!dealRow) {
    res.status(403).json({ error: 'Không xác định được deal của dự án' });
    return false;
  }
  if (!(await canMutateProductionKanban(req, dealRow))) {
    res.status(403).json({ error: 'Chỉ thành viên hoặc người phụ trách deal mới được thao tác' });
    return false;
  }
  return true;
}

/** Cho phép `projects edit` hoặc thành viên deal (lead_members) thao tác Kanban SX. */
function requireProductionKanbanEdit() {
  const { checkPermission } = require('../middleware/newPermission');
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - no user ID' });
      }
      if (await checkPermission(userId, 'projects', 'edit', null, req.user)) return next();
      const projectId = req.params?.id || req.params?.projectId;
      if (projectId && await userCanMutateProductionProjectKanban(userId, projectId, req.user)) {
        return next();
      }
      return res.status(403).json({
        error: 'Không có quyền thực hiện hành động này',
        message: 'Vui lòng liên hệ quản trị viên nếu bạn cần quyền này',
      });
    } catch (e) {
      console.error('requireProductionKanbanEdit:', e);
      return res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra quyền' });
    }
  };
}

/** PUT /projects/:id — chỉ cho lead_members sửa workshop_type_id (kéo cột «Chưa phân loại»). */
function requireProjectEditOrSxKanbanWorkshopType() {
  const { checkPermission } = require('../middleware/newPermission');
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - no user ID' });
      }
      if (await checkPermission(userId, 'projects', 'edit', null, req.user)) return next();
      const b = req.body || {};
      const keys = Object.keys(b).filter((k) => b[k] !== undefined);
      const onlyWorkshopType = keys.length > 0 && keys.every((k) => k === 'workshop_type_id');
      if (onlyWorkshopType && await userCanMutateProductionProjectKanban(userId, req.params.id, req.user)) {
        return next();
      }
      return res.status(403).json({
        error: 'Không có quyền thực hiện hành động này',
        message: 'Vui lòng liên hệ quản trị viên nếu bạn cần quyền này',
      });
    } catch (e) {
      console.error('requireProjectEditOrSxKanbanWorkshopType:', e);
      return res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra quyền' });
    }
  };
}

async function assertDealResponsible(req, res, { leadId, projectId } = {}) {
  const dealRow = await resolveDealRow(leadId, projectId);
  if (!dealRow) {
    res.status(403).json({ error: 'Không xác định được người phụ trách deal' });
    return false;
  }
  if (!isDealResponsibleUser(req, dealRow) && !(await isDealLeadMemberUser(req, dealRow))) {
    res.status(403).json({ error: 'Chỉ người phụ trách deal mới được thao tác' });
    return false;
  }
  return true;
}

async function resolveProjectLeadId(projectId) {
  const row = await resolveDealRow(null, projectId);
  return row?.id || null;
}

async function logDealActivityComment(req, { leadId, projectId, body }) {
  try {
    const uid = getRequestUserId(req);
    if (!uid || !body) return;

    const dealRow = await resolveDealRow(leadId, projectId);
    const resolvedLeadId = dealRow?.id || leadId || null;
    const resolvedProjectId = projectId || dealRow?.project_id || null;
    const io = req.app?.get?.('io');

    if (resolvedLeadId) {
      const { data, error } = await supabase
        .from('crm_lead_comments')
        .insert({ lead_id: resolvedLeadId, user_id: uid, body })
        .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
        .single();
      if (!error && data && io) {
        io.to(`lead:${resolvedLeadId}`).emit('lead:comment', {
          lead_id: resolvedLeadId,
          action: 'created',
          comment: { ...data, reactions: { summary: [], mine: null } },
        });
      }
      return;
    }

    if (resolvedProjectId) {
      const { data, error } = await supabase
        .from('project_comments')
        .insert({ project_id: resolvedProjectId, user_id: uid, content: body, attachments: [] })
        .select(PROJECT_COMMENT_SELECT)
        .single();
      if (!error && data && io) {
        const evt = { project_id: resolvedProjectId, action: 'created', comment: data };
        io.to(`project:${resolvedProjectId}`).emit('project:comment', evt);
        io.emit('project:comment', evt);
      }
    }
  } catch (e) {
    console.warn('[logDealActivityComment]', e.message);
  }
}

const ACTION_LABELS = {
  uploaded: 'đã tải lên',
  deleted: 'đã xóa',
  updated: 'đã cập nhật',
  shared_crm: 'đã bật chia sẻ CRM',
  unshared_crm: 'đã tắt chia sẻ CRM',
  visibility_updated: 'đã đổi quyền xem',
  replaced: 'đã thay thế',
};

async function logProjectFileActivity(req, {
  projectId,
  leadId,
  action,
  fileName,
  fileUrl,
  taskTitle,
  extra,
}) {
  const uid = getRequestUserId(req);
  if (!uid) return;
  const { data: user } = await supabase.from('users').select('full_name').eq('id', uid).maybeSingle();
  const userName = user?.full_name || 'Người dùng';
  const actionLabel = ACTION_LABELS[action] || action;
  const safeName = fileName
    ? (fileUrl ? `«${fileName}|${fileUrl}»` : `«${fileName}»`)
    : 'tài liệu';
  const taskPart = taskTitle ? ` (nhiệm vụ: ${taskTitle})` : '';
  const extraPart = extra ? ` — ${extra}` : '';
  const body = `📎 ${userName} ${actionLabel} ${safeName}${taskPart}${extraPart}`;
  await logDealActivityComment(req, { leadId, projectId, body });
}

async function logDealStageChangeComment(req, { leadId, projectId, stageName }) {
  const uid = getRequestUserId(req);
  if (!uid) return;
  const { data: user } = await supabase.from('users').select('full_name').eq('id', uid).maybeSingle();
  const userName = user?.full_name || 'Người dùng';
  const label = stageName || 'giai đoạn mới';
  await logDealActivityComment(req, {
    leadId,
    projectId,
    body: `🔄 ${userName} đã thay đổi giai đoạn thành «${label}».`,
  });
}

async function logDealDeadlineChangeComment(req, { leadId, projectId, newDeadlineAt, cleared = false }) {
  const uid = getRequestUserId(req);
  if (!uid) return;
  const { data: user } = await supabase.from('users').select('full_name').eq('id', uid).maybeSingle();
  const userName = user?.full_name || 'Người dùng';
  const when = cleared ? '— (đã xóa hạn)' : formatDeadlineVi(newDeadlineAt);
  await logDealActivityComment(req, {
    leadId,
    projectId,
    body: `⏰ ${userName} đã thay đổi hạn chót thành ${when}.`,
  });
}

async function assertFileAttachmentMutation(req, res, fileRow) {
  if (!fileRow) {
    res.status(404).json({ error: 'Không tìm thấy file' });
    return false;
  }
  if (fileRow.entity_type === 'project') {
    return assertDealResponsible(req, res, { projectId: fileRow.entity_id });
  }
  if (fileRow.entity_type === 'task' || (!fileRow.entity_type && fileRow.entity_id)) {
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', fileRow.entity_id)
      .maybeSingle();
    return assertDealResponsible(req, res, { projectId: task?.project_id });
  }
  if (fileRow.lead_id) {
    return assertDealResponsible(req, res, { leadId: fileRow.lead_id });
  }
  return assertDealResponsible(req, res, {});
}

async function assertLeadDocumentOwner(req, res, doc) {
  return assertDealResponsible(req, res, {
    leadId: doc?.lead_id,
    projectId: doc?.project_id,
  });
}

async function assertFileOwner(req, res, row) {
  return assertDealResponsible(req, res, {
    leadId: row?.lead_id,
    projectId: row?.project_id || (row?.entity_type === 'project' ? row?.entity_id : null),
  });
}

module.exports = {
  getRequestUserId,
  formatDeadlineVi,
  resolveDealRow,
  isDealResponsibleUser,
  canMutateProductionKanban,
  userCanMutateProductionProjectKanban,
  assertDealResponsible,
  assertProductionKanbanMutation,
  requireProductionKanbanEdit,
  requireProjectEditOrSxKanbanWorkshopType,
  assertFileAttachmentMutation,
  assertLeadDocumentOwner,
  assertFileOwner,
  logDealActivityComment,
  logProjectFileActivity,
  logDealStageChangeComment,
  logDealDeadlineChangeComment,
  resolveProjectLeadId,
};

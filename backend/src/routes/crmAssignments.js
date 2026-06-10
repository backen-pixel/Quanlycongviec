// Module "Giao việc CRM" — độc lập với /api/tasks (Quản lý công việc) và /api/crm/tasks
// (Tasks gắn lead/deal). Cho phép quản lý CRM tạo cột Kanban + giao việc cho NV với deadline.
const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { sanitizeStorageFilename, isInvalidStorageKeyError } = require('../helpers/storageFilename');
const {
  persistAssignmentNotification,
  buildAssignmentNotificationInsert,
} = require('../helpers/crmAssignmentNotifications');
const {
  createCrmAssignment: createCrmAssignmentCore,
  updateCrmAssignment: updateCrmAssignmentCore,
  deleteCrmAssignment: deleteCrmAssignmentCore,
  addCrmAssignmentComment: addCrmAssignmentCommentCore,
} = require('../helpers/crmAssignmentMutations');
const { createTTLCache } = require('../helpers/ttlCache');
const {
  syncCrmTaskFromAssignment,
  attachCrmTaskMetaToAssignments,
  applyAssignmentStatusColumn,
} = require('../helpers/crmTaskAssignmentSync');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');

const assignColsCache = createTTLCache({
  ttlMs: 90_000,
  maxEntries: 10,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'crm:assign-cols:',
});
function invalidateAssignColumns() {
  assignColsCache.invalidateRemote(null).catch(() => {});
}

const STORAGE_BUCKET = 'attachments';
const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024 * 1024 },
});

function fixMulterFilename(file) {
  try {
    const buf = Buffer.from(file.originalname, 'latin1');
    const utf8 = buf.toString('utf8');
    if (utf8 && !utf8.includes('\uFFFD') && utf8 !== file.originalname) file.originalname = utf8;
  } catch { /* ignore */ }
}

async function uploadAssignmentFileToStorage(file, assignmentId, kind) {
  fixMulterFilename(file);
  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = sanitizeStorageFilename(path.basename(file.originalname, ext));
  const ts = Date.now();
  let storagePath = `crm_assignment/${kind}/${assignmentId}/${ts}_${safeName}${ext}`;

  let uploadError;
  ({ error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false }));

  if (uploadError && isInvalidStorageKeyError(uploadError)) {
    storagePath = `crm_assignment/${kind}/${assignmentId}/${ts}_file${ext}`;
    ({ error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false }));
  }

  if (uploadError) {
    console.error('[crm_assignment_files] storage:', uploadError.message);
    throw new Error(uploadError.message || 'Lỗi tải lên Storage');
  }
  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return {
    file_name: file.originalname,
    file_url: urlData.publicUrl,
    file_size: file.size,
    mime_type: file.mimetype,
    storage_path: storagePath,
  };
}

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function crmAssignmentsInvalidate(body) {
    if (res.statusCode < 400) void rcInvalidateTags(['crm:assignments']);
    return origJson(body);
  };
  next();
});

const ADMIN_ROLES = new Set(['admin', 'manager', 'sales_admin', 'crm_production_admin']);
const isAdmin = (req) => ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());

/** Cột Kanban dùng chung toàn hệ thống — không theo company_id. */
const SHARED_COLUMN_DEFAULTS = [
  { name: 'Chưa làm', color: '#94A3B8', position: 0, is_done_column: false },
  { name: 'Đang làm', color: '#3B82F6', position: 1, is_done_column: false },
  { name: 'Hoàn thành', color: '#10B981', position: 2, is_done_column: true },
];

async function ensureSharedAssignmentColumns(userId) {
  const { count, error: countErr } = await supabase
    .from('crm_assignment_columns')
    .select('id', { count: 'exact', head: true })
    .is('company_id', null);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;
  const rows = SHARED_COLUMN_DEFAULTS.map((d) => ({
    ...d,
    company_id: null,
    created_by_id: userId || null,
  }));
  const { error } = await supabase.from('crm_assignment_columns').insert(rows);
  if (error) throw error;
}

function sharedColumnsQuery() {
  return supabase
    .from('crm_assignment_columns')
    .select('*')
    .is('company_id', null)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
}

/** Cached version of sharedColumnsQuery — returns just `data` array (taxonomy chậm đổi). */
async function getSharedColumnsCached() {
  return assignColsCache.getOrFetch('cols', async () => {
    const { data, error } = await sharedColumnsQuery();
    if (error) throw error;
    return data || [];
  });
}

/** Id nhiệm vụ user được giao / tạo (bảng assignees + assignee_id + created_by). */
async function getUserInvolvedAssignmentIds(uid) {
  if (!uid) return [];
  const ids = new Set();
  const { data: junction } = await supabase
    .from('crm_assignment_assignees')
    .select('assignment_id')
    .eq('user_id', uid);
  (junction || []).forEach((r) => ids.add(r.assignment_id));

  const { data: direct } = await supabase
    .from('crm_assignments')
    .select('id')
    .or(`assignee_id.eq.${uid},created_by_id.eq.${uid}`);
  (direct || []).forEach((r) => ids.add(r.id));
  return [...ids];
}

function isAssignmentCreator(req, row) {
  return row && String(row.created_by_id || '') === String(req.user?.userId || '');
}

async function isAssignmentAssignee(req, assignmentId) {
  const uid = req.user?.userId;
  if (!uid || !assignmentId) return false;
  const { data: row } = await supabase
    .from('crm_assignments')
    .select('assignee_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (row?.assignee_id && String(row.assignee_id) === String(uid)) return true;
  const { data: asn } = await supabase
    .from('crm_assignment_assignees')
    .select('user_id')
    .eq('assignment_id', assignmentId)
    .eq('user_id', uid)
    .limit(1);
  return (asn || []).length > 0;
}

const ASSIGNMENT_STRUCTURAL_FIELDS = [
  'title', 'description', 'assignee_id', 'assignee_ids',
  'department_ids', 'region_ids', 'company_id', 'priority', 'deadline',
];

function bodyHasStructuralAssignmentChange(body) {
  if (!body || typeof body !== 'object') return false;
  return ASSIGNMENT_STRUCTURAL_FIELDS.some((f) => body[f] !== undefined);
}

async function userCanAccessAssignment(req, row) {
  if (!row) return false;
  if (isAdmin(req)) return true;
  const uid = String(req.user?.userId || '');
  if (!uid) return false;
  if (row.created_by_id && String(row.created_by_id) === uid) return true;
  if (row.assignee_id && String(row.assignee_id) === uid) return true;
  const { data: asn } = await supabase
    .from('crm_assignment_assignees')
    .select('user_id')
    .eq('assignment_id', row.id)
    .eq('user_id', req.user.userId)
    .limit(1);
  if ((asn || []).length) return true;
  const cid = req.user?.company_id;
  if (cid && row.company_id && String(row.company_id) === String(cid)) return true;
  if (cid && row.executor_company_id && String(row.executor_company_id) === String(cid)) return true;
  return false;
}

/** Id nhiệm vụ NV được xem: công ty + việc được giao (tránh .or() + UUID làm vỡ query Supabase). */
async function getVisibleAssignmentIdsForNonAdmin(req) {
  const uid = req.user?.userId;
  const companyId = req.user?.company_id || null;
  const involvedIds = await getUserInvolvedAssignmentIds(uid);
  const idSet = new Set(involvedIds);

  if (companyId) {
    const { data: companyRows, error } = await supabase
      .from('crm_assignments')
      .select('id')
      .eq('company_id', companyId);
    if (error) throw error;
    (companyRows || []).forEach((r) => idSet.add(r.id));

    const { data: execRows, error: execErr } = await supabase
      .from('crm_assignments')
      .select('id')
      .eq('executor_company_id', companyId);
    if (execErr && !String(execErr.message || '').includes('executor_company_id')) throw execErr;
    if (!execErr) (execRows || []).forEach((r) => idSet.add(r.id));
  }

  return [...idSet];
}

const ASSIGNMENT_SELECT = `
  id, company_id, executor_company_id, column_id, lead_id, crm_task_id, assignment_module, title, description,
  assignee_id, created_by_id, priority, status, deadline,
  position, created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, avatar),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email, avatar),
  company:companies(id, name, short_name),
  lead:crm_leads(id, code, title, type)
`;

async function attachAssigneesToAssignments(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const ids = list.map((x) => x.id);
  const { data: rows } = await supabase
    .from('crm_assignment_assignees')
    .select('assignment_id, user_id, user:users(id, full_name, email, avatar)')
    .in('assignment_id', ids);
  const byId = new Map();
  (rows || []).forEach((r) => {
    if (!byId.has(r.assignment_id)) byId.set(r.assignment_id, []);
    if (r.user) byId.get(r.assignment_id).push(r.user);
  });
  list.forEach((a) => { a.assignees = byId.get(a.id) || (a.assignee ? [a.assignee] : []); });
  return list;
}

/**
 * Mở rộng danh sách user_id từ assignee_ids + department_ids + region_ids,
 * giới hạn theo company nếu được cung cấp.
 */
async function expandAssigneeIds({ assignee_ids, department_ids, region_ids, company_id }) {
  const explicit = (assignee_ids || []).filter(Boolean).map(String);
  const set = new Set(explicit);

  const deptIds = (department_ids || []).filter(Boolean);
  if (deptIds.length) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .in('department_id', deptIds)
      .neq('is_active', false);
    (data || []).forEach((u) => set.add(String(u.id)));
  }

  const regIds = (region_ids || []).filter(Boolean);
  if (regIds.length) {
    const { data } = await supabase
      .from('user_company_regions')
      .select('user_id')
      .in('region_id', regIds);
    (data || []).forEach((r) => set.add(String(r.user_id)));
  }

  let ids = [...set];

  // Giới hạn theo company nếu có (an toàn cho user thường)
  if (company_id && ids.length) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', company_id);
    const allowDeptIds = new Set((depts || []).map((d) => String(d.id)));
    const { data: usrs } = await supabase
      .from('users')
      .select('id, department_id, company_id')
      .in('id', ids);
    const filtered = (usrs || []).filter((u) => {
      if (String(u.company_id || '') === String(company_id)) return true;
      return u.department_id && allowDeptIds.has(String(u.department_id));
    }).map((u) => String(u.id));
    ids = [...new Set([...filtered, ...explicit])];
  }

  return ids;
}

async function replaceAssignees(assignmentId, userIds) {
  await supabase.from('crm_assignment_assignees').delete().eq('assignment_id', assignmentId);
  if (!userIds.length) return [];
  const rows = userIds.map((uid) => ({ assignment_id: assignmentId, user_id: uid }));
  await supabase.from('crm_assignment_assignees').insert(rows);
  return userIds;
}

const { emitNotifyBadge } = require('../helpers/notifyBadge');

function pushNotif(req, userId, payload) {
  if (!userId || !payload) return;
  try {
    const io = req.app.get('io');
    if (io) io.to(`user:${userId}`).emit('notification', payload);
    const push = req.app.get('pushNotification');
    if (typeof push === 'function') void push(userId, payload);
    emitNotifyBadge(req.app, 'assignments');
  } catch { /* ignore */ }
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

// ─── COLUMNS ──────────────────────────────────────────────────────────────────
// GET /api/crm/assignments/columns — bộ cột Kanban dùng chung (company_id NULL)
r.get('/columns', async (req, res) => {
  try {
    await ensureSharedAssignmentColumns(req.user?.userId);
    const data = await getSharedColumnsCached();
    res.json({ columns: data, shared: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tải cột' }); }
});

// POST /api/crm/assignments/columns
r.post('/columns', async (req, res) => {
  try {
    const { name, color, is_done_column } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Cần tên cột' });

    const { data: maxRow } = await supabase
      .from('crm_assignment_columns')
      .select('position')
      .is('company_id', null)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((maxRow?.position ?? -1) + 1);

    const { data, error } = await supabase
      .from('crm_assignment_columns')
      .insert({
        name: name.trim(),
        color: color || '#3B82F6',
        company_id: null,
        is_done_column: !!is_done_column,
        position: nextPos,
        created_by_id: req.user.userId,
      })
      .select()
      .single();
    if (error) throw error;
    invalidateAssignColumns();
    res.status(201).json({ column: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tạo cột' }); }
});

// PUT /api/crm/assignments/columns/:id
r.put('/columns/:id', async (req, res) => {
  try {
    const update = { updated_at: new Date().toISOString() };
    ['name', 'color', 'position', 'is_done_column'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase
      .from('crm_assignment_columns')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    invalidateAssignColumns();
    res.json({ column: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi cập nhật cột' }); }
});

// DELETE /api/crm/assignments/columns/:id?move_to=<col_id>
// Nếu không có move_to: các nhiệm vụ sẽ có column_id = NULL (kéo lại sau).
r.delete('/columns/:id', async (req, res) => {
  try {
    const { move_to } = req.query;
    if (move_to) {
      await supabase
        .from('crm_assignments')
        .update({ column_id: move_to, updated_at: new Date().toISOString() })
        .eq('column_id', req.params.id);
    }
    const { error } = await supabase
      .from('crm_assignment_columns')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    invalidateAssignColumns();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi xóa cột' }); }
});

// POST /api/crm/assignments/columns/reorder { ids: [bigint, ...] }
r.post('/columns/reorder', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('crm_assignment_columns')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i]);
    }
    invalidateAssignColumns();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi sắp xếp cột' }); }
});

// ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────
// GET /api/crm/assignments?company_id=&assignee_id=&status=&priority=&q=
r.get('/', async (req, res) => {
  try {
    let q = supabase.from('crm_assignments').select(ASSIGNMENT_SELECT);

    let scopeIds = null;
    if (isAdmin(req)) {
      const companyId = req.query.company_id || null;
      if (companyId) {
        q = q.or(`company_id.eq.${companyId},executor_company_id.eq.${companyId}`);
      }
    } else {
      scopeIds = await getVisibleAssignmentIdsForNonAdmin(req);
      if (!scopeIds.length) return res.json({ assignments: [] });
      q = q.in('id', scopeIds);
    }

    if (req.query.assignee_id) {
      const { data: rows } = await supabase
        .from('crm_assignment_assignees')
        .select('assignment_id')
        .eq('user_id', req.query.assignee_id);
      let ids = [...new Set((rows || []).map((r) => r.assignment_id))];
      if (!ids.length) return res.json({ assignments: [] });
      if (scopeIds) {
        const allowed = new Set(scopeIds);
        ids = ids.filter((id) => allowed.has(id));
        if (!ids.length) return res.json({ assignments: [] });
      }
      q = q.in('id', ids);
    }
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.priority) q = q.eq('priority', req.query.priority);
    if (req.query.column_id) q = q.eq('column_id', req.query.column_id);
    if (req.query.lead_id) q = q.eq('lead_id', String(req.query.lead_id).trim());
    const moduleFilter = String(req.query.assignment_module || '').trim().toLowerCase();
    if (moduleFilter === 'production' || moduleFilter === 'crm') {
      q = q.eq('assignment_module', moduleFilter);
    }
    if (req.query.q) {
      const s = String(req.query.q).replace(/[%,]/g, ' ').trim();
      if (s) q = q.ilike('title', `%${s}%`);
    }

    q = q.order('position', { ascending: true }).order('created_at', { ascending: false });
    let { data, error } = await q;
    if (error && /executor_company_id/.test(error.message || '') && isAdmin(req) && req.query.company_id) {
      let qExec = supabase.from('crm_assignments').select(ASSIGNMENT_SELECT);
      qExec = qExec.eq('company_id', req.query.company_id);
      if (req.query.status) qExec = qExec.eq('status', req.query.status);
      if (req.query.priority) qExec = qExec.eq('priority', req.query.priority);
      if (moduleFilter === 'production' || moduleFilter === 'crm') qExec = qExec.eq('assignment_module', moduleFilter);
      qExec = qExec.order('position', { ascending: true }).order('created_at', { ascending: false });
      ({ data, error } = await qExec);
    }
    if (error && /assignment_module/.test(error.message || '') && moduleFilter) {
      let q2 = supabase.from('crm_assignments').select(ASSIGNMENT_SELECT);
      if (isAdmin(req)) {
        const companyId = req.query.company_id || null;
        if (companyId) q2 = q2.or(`company_id.eq.${companyId},executor_company_id.eq.${companyId}`);
      } else if (scopeIds?.length) {
        q2 = q2.in('id', scopeIds);
      }
      if (req.query.status) q2 = q2.eq('status', req.query.status);
      if (req.query.priority) q2 = q2.eq('priority', req.query.priority);
      if (req.query.column_id) q2 = q2.eq('column_id', req.query.column_id);
      if (req.query.lead_id) q2 = q2.eq('lead_id', String(req.query.lead_id).trim());
      if (req.query.q) {
        const s = String(req.query.q).replace(/[%,]/g, ' ').trim();
        if (s) q2 = q2.ilike('title', `%${s}%`);
      }
      q2 = q2.order('position', { ascending: true }).order('created_at', { ascending: false });
      ({ data, error } = await q2);
    }
    if (error) throw error;
    await attachAssigneesToAssignments(data || []);
    await attachCrmTaskMetaToAssignments(data || []);
    res.json({ assignments: data || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tải nhiệm vụ' }); }
});

// POST /api/crm/assignments
r.post('/', async (req, res) => {
  try {
    const result = await createCrmAssignmentCore(req, req.body || {});
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const data = result.data?.assignment;
    const finalAssignees = result.data?.assignee_ids?.length
      ? result.data.assignee_ids
      : (data?.assignee_id ? [data.assignee_id] : []);
    for (const uid of finalAssignees) {
      if (String(uid) === String(req.user.userId)) continue;
      const notif = await persistNotification(uid, {
        type: 'crm_assignment_assigned',
        title: '📋 Bạn vừa được giao nhiệm vụ CRM',
        message: `"${data.title}"${data.deadline ? ' — hạn ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`,
        entity_id: data.id,
      });
      pushNotif(req, uid, notif || buildAssignmentNotificationInsert(uid, {
        type: 'crm_assignment_assigned',
        title: '📋 Bạn vừa được giao nhiệm vụ CRM',
        message: `"${data.title}"${data.deadline ? ' — hạn ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`,
        assignmentId: data.id,
      }));
    }
    await attachAssigneesToAssignments([data]);
    res.status(result.status).json(result.data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tạo nhiệm vụ' }); }
});

// PUT /api/crm/assignments/:id
r.put('/:id', async (req, res) => {
  try {
    const { data: before } = await supabase
      .from('crm_assignments')
      .select('id, assignee_id, status, company_id, created_by_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!before) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });

    const creator = isAssignmentCreator(req, before);
    const rawIds = req.body.assignee_ids;
    const rawDept = req.body.department_ids;
    const rawReg = req.body.region_ids;
    const structuralChange = bodyHasStructuralAssignmentChange(req.body)
      || rawIds !== undefined || rawDept !== undefined || rawReg !== undefined;

    if (!creator) {
      if (structuralChange) {
        return res.status(403).json({ error: 'Chỉ người tạo nhiệm vụ mới được sửa hoặc xóa' });
      }
      const progressKeys = ['status', 'column_id', 'position'];
      const touched = progressKeys.filter((k) => req.body[k] !== undefined);
      if (!touched.length || !(await isAssignmentAssignee(req, before.id))) {
        return res.status(403).json({ error: 'Chỉ người tạo nhiệm vụ mới được sửa hoặc xóa' });
      }
    }

    const update = { updated_at: new Date().toISOString() };
    if (creator) {
      [
        'title', 'description', 'column_id',
        'priority', 'status', 'deadline', 'position', 'company_id',
      ].forEach((f) => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    } else {
      ['status', 'column_id', 'position'].forEach((f) => {
        if (req.body[f] !== undefined) update[f] = req.body[f];
      });
    }

    // Multi-assignees: nếu client gửi assignee_ids/department_ids/region_ids → thay toàn bộ
    let newAssignees = null;
    if (rawIds !== undefined || rawDept !== undefined || rawReg !== undefined) {
      newAssignees = await expandAssigneeIds({
        assignee_ids: rawIds || [],
        department_ids: rawDept || [],
        region_ids: rawReg || [],
        company_id: req.body.company_id ?? before?.company_id ?? null,
      });
      update.assignee_id = newAssignees[0] || null;
    } else if (req.body.assignee_id !== undefined) {
      update.assignee_id = req.body.assignee_id || null;
      newAssignees = req.body.assignee_id ? [req.body.assignee_id] : [];
    }

    if (update.status !== undefined) {
      await applyAssignmentStatusColumn(update, update.status);
    }

    const { data, error } = await supabase
      .from('crm_assignments')
      .update(update)
      .eq('id', req.params.id)
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error) throw error;

    // Thông báo cho người mới được giao
    if (newAssignees !== null) {
      const { data: prevRows } = await supabase
        .from('crm_assignment_assignees')
        .select('user_id')
        .eq('assignment_id', data.id);
      const prev = new Set((prevRows || []).map((r) => String(r.user_id)));
      await replaceAssignees(data.id, newAssignees);
      for (const uid of newAssignees) {
        if (prev.has(String(uid))) continue;
        if (String(uid) === String(req.user.userId)) continue;
        const notif = await persistNotification(uid, {
          type: 'crm_assignment_assigned',
          title: '📋 Bạn vừa được giao nhiệm vụ CRM',
          message: `"${data.title}"${data.deadline ? ' — hạn ' + new Date(data.deadline).toLocaleString('vi-VN') : ''}`,
          entity_id: data.id,
        });
        pushNotif(req, uid, notif);
      }
    }

    await attachAssigneesToAssignments([data]);
    await attachCrmTaskMetaToAssignments([data]);
    try {
      await syncCrmTaskFromAssignment(data);
    } catch (syncErr) {
      console.warn('[sync] assignment→crm_task PUT:', syncErr.message);
    }
    res.json({ assignment: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi cập nhật nhiệm vụ' }); }
});

// POST /api/crm/assignments/:id/move  { column_id, position }
r.post('/:id/move', async (req, res) => {
  try {
    const { data: row } = await supabase
      .from('crm_assignments')
      .select('id, created_by_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    const creator = isAssignmentCreator(req, row);
    if (!creator && !(await isAssignmentAssignee(req, row.id))) {
      return res.status(403).json({ error: 'Chỉ người tạo nhiệm vụ mới được sửa hoặc xóa' });
    }

    const { column_id, position } = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (column_id !== undefined) update.column_id = column_id;
    if (position !== undefined) update.position = position;

    // Auto status khi rớt vào cột Done / Doing / Todo
    if (column_id) {
      const { data: col } = await supabase
        .from('crm_assignment_columns')
        .select('is_done_column, position')
        .eq('id', column_id)
        .maybeSingle();
      if (col?.is_done_column) {
        update.status = 'completed';
        update.completed_at = new Date().toISOString();
      } else if ((col?.position ?? 0) >= 1) {
        update.status = 'in_progress';
        update.completed_at = null;
      } else {
        update.status = 'pending';
        update.completed_at = null;
      }
    }

    const { data, error } = await supabase
      .from('crm_assignments')
      .update(update)
      .eq('id', req.params.id)
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error) throw error;
    await attachAssigneesToAssignments([data]);
    await attachCrmTaskMetaToAssignments([data]);
    try {
      await syncCrmTaskFromAssignment(data);
    } catch (syncErr) {
      console.warn('[sync] assignment→crm_task move:', syncErr.message);
    }
    res.json({ assignment: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi chuyển cột' }); }
});

// DELETE /api/crm/assignments/:id
r.delete('/:id', async (req, res) => {
  try {
    const { data: row } = await supabase
      .from('crm_assignments')
      .select('id, created_by_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    if (!isAssignmentCreator(req, row)) {
      return res.status(403).json({ error: 'Chỉ người tạo nhiệm vụ mới được sửa hoặc xóa' });
    }
    const result = await deleteCrmAssignmentCore(req, req.params.id);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.json(result.data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi xóa nhiệm vụ' }); }
});

// ─── UNREAD / BADGE ──────────────────────────────────────────────────────────
// GET /api/crm/assignments/unread-count
// Đếm nhiệm vụ "cần chú ý" của user hiện tại: quá hạn / sắp hạn (24h) / chưa làm.
r.get('/unread-count', responseCache({ ttl: 30, scope: 'user', tags: ['crm:assignments'] }), async (req, res) => {
  try {
    const uid = req.user.userId;
    const ids = await getUserInvolvedAssignmentIds(uid);
    if (!ids.length) return res.json({ unread: 0, overdue: 0, dueSoon: 0, pending: 0 });

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: items } = await supabase
      .from('crm_assignments')
      .select('id, status, deadline')
      .in('id', ids)
      .neq('status', 'completed');

    const list = items || [];
    const overdue = list.filter((t) => t.deadline && t.deadline < now.toISOString()).length;
    const dueSoon = list.filter((t) => t.deadline && t.deadline >= now.toISOString() && t.deadline < in24h).length;
    const pending = list.filter((t) => t.status === 'pending').length;
    const unread = overdue + dueSoon + pending;

    res.json({ unread, overdue, dueSoon, pending, total: list.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── FILES (yêu cầu req / nộp bài sub) — bảng crm_assignment_files ───────────
// GET /api/crm/assignments/:id/files?kind=req|sub
r.get('/:id/files', async (req, res) => {
  try {
    const kind = req.query.kind === 'sub' ? 'sub' : 'req';
    let q = supabase
      .from('crm_assignment_files')
      .select('id, assignment_id, kind, file_name, file_url, file_size, mime_type, storage_path, uploaded_by, created_at, uploader:users(id, full_name)')
      .eq('assignment_id', req.params.id)
      .eq('kind', kind)
      .order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('crm_assignment_files')) {
        return res.json({ files: [], _hint: 'Chạy migration database/194_crm_assignment_files.sql' });
      }
      throw error;
    }
    res.json({ files: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi tải file' });
  }
});

// POST /api/crm/assignments/:id/files  multipart: file + kind=req|sub
r.post('/:id/files', (req, res, next) => {
  uploadMw.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File quá lớn (tối đa 256MB)' });
    return res.status(400).json({ error: err.message || 'Lỗi upload' });
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const kind = req.body.kind === 'sub' ? 'sub' : 'req';
    const assignmentId = req.params.id;

    const { data: assignment } = await supabase
      .from('crm_assignments')
      .select('id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return res.status(404).json({ error: 'Nhiệm vụ không tồn tại' });

    const uploaded = await uploadAssignmentFileToStorage(req.file, assignmentId, kind);
    const uid = req.user.userId || req.user.id;
    const { data, error } = await supabase
      .from('crm_assignment_files')
      .insert({
        assignment_id: assignmentId,
        kind,
        ...uploaded,
        uploaded_by: uid,
      })
      .select('id, assignment_id, kind, file_name, file_url, file_size, mime_type, storage_path, uploaded_by, created_at, uploader:users(id, full_name)')
      .single();
    if (error) {
      if (uploaded.storage_path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([uploaded.storage_path]).catch(() => {});
      }
      if (String(error.message || '').includes('crm_assignment_files')) {
        return res.status(503).json({
          error: 'Bảng crm_assignment_files chưa có. Chạy migration database/194_crm_assignment_files.sql',
        });
      }
      throw error;
    }
    res.status(201).json({ file: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi upload file' });
  }
});

// POST /api/crm/assignments/:id/files/link  { url, file_name?, kind=req|sub }
r.post('/:id/files/link', async (req, res) => {
  try {
    const rawUrl = String(req.body?.url || '').trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      return res.status(400).json({ error: 'URL phải bắt đầu bằng http:// hoặc https://' });
    }
    let fileUrl;
    try {
      fileUrl = new URL(rawUrl).href;
    } catch {
      return res.status(400).json({ error: 'URL không hợp lệ' });
    }
    const kind = req.body.kind === 'sub' ? 'sub' : 'req';
    const assignmentId = req.params.id;

    const { data: assignment } = await supabase
      .from('crm_assignments')
      .select('id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!assignment) return res.status(404).json({ error: 'Nhiệm vụ không tồn tại' });

    let fileName = String(req.body?.file_name || '').trim();
    if (!fileName) {
      try {
        const u = new URL(fileUrl);
        const base = decodeURIComponent(u.pathname.split('/').pop() || '');
        fileName = base || u.hostname || 'Liên kết';
      } catch {
        fileName = 'Liên kết';
      }
    }

    const uid = req.user.userId || req.user.id;
    const { data, error } = await supabase
      .from('crm_assignment_files')
      .insert({
        assignment_id: assignmentId,
        kind,
        file_name: fileName,
        file_url: fileUrl,
        file_size: 0,
        mime_type: 'text/uri-list',
        storage_path: null,
        uploaded_by: uid,
      })
      .select('id, assignment_id, kind, file_name, file_url, file_size, mime_type, storage_path, uploaded_by, created_at, uploader:users(id, full_name)')
      .single();
    if (error) {
      if (String(error.message || '').includes('crm_assignment_files')) {
        return res.status(503).json({
          error: 'Bảng crm_assignment_files chưa có. Chạy migration database/194_crm_assignment_files.sql',
        });
      }
      throw error;
    }
    res.status(201).json({ file: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi thêm liên kết' });
  }
});

// DELETE /api/crm/assignments/:id/files/:fileId
r.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    const { data: row } = await supabase
      .from('crm_assignment_files')
      .select('id, storage_path, uploaded_by')
      .eq('id', req.params.fileId)
      .eq('assignment_id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy file' });
    if (String(row.uploaded_by) !== String(uid) && !isAdmin(req)) {
      return res.status(403).json({ error: 'Không có quyền xóa file' });
    }
    if (row.storage_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([row.storage_path]).catch(() => {});
    }
    await supabase.from('crm_assignment_files').delete().eq('id', req.params.fileId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi xóa file' });
  }
});

// ─── COMMENTS ────────────────────────────────────────────────────────────────
// GET /api/crm/assignments/:id/comments
r.get('/:id/comments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('crm_assignment_comments')
      .select('id, assignment_id, user_id, parent_id, content, created_at, updated_at, user:users(id, full_name, email, avatar)')
      .eq('assignment_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ comments: data || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tải bình luận' }); }
});

// POST /api/crm/assignments/:id/comments  { content, parent_id? }
r.post('/:id/comments', async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Nội dung trống' });

    let parentId = null;
    const parentRaw = req.body?.parent_id;
    if (parentRaw != null && parentRaw !== '') {
      const n = Number(parentRaw);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'parent_id không hợp lệ' });
      const { data: parentRow, error: pErr } = await supabase
        .from('crm_assignment_comments')
        .select('id, assignment_id')
        .eq('id', n)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parentRow) return res.status(400).json({ error: 'Bình luận cần trả lời không tồn tại' });
      if (String(parentRow.assignment_id) !== String(req.params.id)) {
        return res.status(400).json({ error: 'Bình luận không thuộc nhiệm vụ này' });
      }
      parentId = n;
    }

    const { data, error } = await supabase
      .from('crm_assignment_comments')
      .insert({ assignment_id: req.params.id, user_id: req.user.userId, content, parent_id: parentId })
      .select('id, assignment_id, user_id, parent_id, content, created_at, updated_at, user:users(id, full_name, email, avatar)')
      .single();
    if (error) throw error;

    // Thông báo cho tất cả assignees + người tạo việc (trừ chính người bình luận)
    try {
      const { data: a } = await supabase
        .from('crm_assignments')
        .select('id, title, created_by_id')
        .eq('id', req.params.id)
        .maybeSingle();
      const { data: assignees } = await supabase
        .from('crm_assignment_assignees')
        .select('user_id')
        .eq('assignment_id', req.params.id);
      const targets = new Set();
      (assignees || []).forEach((x) => targets.add(String(x.user_id)));
      if (a?.created_by_id) targets.add(String(a.created_by_id));
      targets.delete(String(req.user.userId));
      const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;
      for (const uid of targets) {
        const notif = await persistNotification(uid, {
          type: 'crm_assignment_comment',
          title: '💬 Bình luận mới trên nhiệm vụ CRM',
          message: `"${a?.title || ''}": ${preview}`,
          entity_id: a?.id,
        });
        pushNotif(req, uid, notif);
      }
    } catch (notifErr) { console.warn('[crm_assignment_comment] notify:', notifErr.message); }

    res.status(201).json({ comment: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tạo bình luận' }); }
});

// PUT /api/crm/assignments/:id/comments/:cid  { content } — chỉ chủ bình luận hoặc admin
r.put('/:id/comments/:cid', async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Nội dung trống' });

    const { data: cur } = await supabase
      .from('crm_assignment_comments')
      .select('user_id')
      .eq('id', req.params.cid)
      .maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });
    if (String(cur.user_id) !== String(req.user.userId) && !isAdmin(req)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const { data, error } = await supabase
      .from('crm_assignment_comments')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', req.params.cid)
      .select('id, assignment_id, user_id, parent_id, content, created_at, updated_at, user:users(id, full_name, email, avatar)')
      .single();
    if (error) throw error;
    res.json({ comment: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi cập nhật bình luận' }); }
});

// DELETE /api/crm/assignments/:id/comments/:cid — chủ bình luận hoặc admin
r.delete('/:id/comments/:cid', async (req, res) => {
  try {
    const { data: cur } = await supabase
      .from('crm_assignment_comments')
      .select('user_id')
      .eq('id', req.params.cid)
      .maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Không tìm thấy' });
    if (String(cur.user_id) !== String(req.user.userId) && !isAdmin(req)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { error } = await supabase.from('crm_assignment_comments').delete().eq('id', req.params.cid);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi xóa bình luận' }); }
});

// ─── LOOKUPS — để form "Giao việc" lọc theo công ty/khu vực/phòng/NV ──────────
// GET /api/crm/assignments/lookups?company_id=...
r.get('/lookups', async (req, res) => {
  try {
    const companyId = req.query.company_id || (!isAdmin(req) ? req.user?.company_id : null);

    let departments = [];
    let regions = [];
    let users = [];

    if (companyId) {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name, color, company_id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      departments = depts || [];

      const { data: regs } = await supabase
        .from('company_regions')
        .select('id, name, company_id, division_unit_id, order_index')
        .eq('company_id', companyId)
        .order('order_index', { ascending: true });
      regions = regs || [];

      const deptIds = departments.map((d) => d.id);
      // Lấy NV: thuộc phòng ban của công ty HOẶC có company_id trùng (không cần phòng)
      const filters = [];
      if (deptIds.length) filters.push(`department_id.in.(${deptIds.join(',')})`);
      filters.push(`company_id.eq.${companyId}`);
      const { data: usrs } = await supabase
        .from('users')
        .select('id, full_name, email, avatar, role, position, department_id, company_id')
        .or(filters.join(','))
        .neq('is_active', false)
        .order('full_name');
      users = usrs || [];

      if (users.length) {
        const { data: ucr } = await supabase
          .from('user_company_regions')
          .select('user_id, region_id')
          .in('user_id', users.map((u) => u.id));
        const byUser = new Map();
        (ucr || []).forEach((r) => {
          if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
          byUser.get(r.user_id).push(r.region_id);
        });
        users.forEach((u) => { u.region_ids = byUser.get(u.id) || []; });
      }
    } else if (isAdmin(req)) {
      // admin không chọn công ty → trả toàn bộ cho UI lọc
      const [{ data: depts }, { data: regs }, { data: usrs }] = await Promise.all([
        supabase.from('departments').select('id, name, color, company_id').eq('is_active', true).order('name'),
        supabase.from('company_regions').select('id, name, company_id, division_unit_id, order_index').order('order_index', { ascending: true }),
        supabase.from('users').select('id, full_name, email, avatar, role, position, department_id, company_id').neq('is_active', false).order('full_name'),
      ]);
      departments = depts || [];
      regions = regs || [];
      users = usrs || [];
      const { data: ucr } = await supabase.from('user_company_regions').select('user_id, region_id');
      const byUser = new Map();
      (ucr || []).forEach((r) => {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id).push(r.region_id);
      });
      users.forEach((u) => { u.region_ids = byUser.get(u.id) || []; });
    }

    res.json({ departments, regions, users });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tải dữ liệu lọc' }); }
});

// GET /api/crm/assignments/:id — đặt cuối file; chỉ id số (Express 5 không dùng /:id([0-9]+))
r.get('/:id', async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id))) return next();
  try {
    const { data, error } = await supabase
      .from('crm_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    if (!(await userCanAccessAssignment(req, data))) {
      return res.status(403).json({ error: 'Không có quyền xem nhiệm vụ này' });
    }
    await attachAssigneesToAssignments([data]);
    await attachCrmTaskMetaToAssignments([data]);
    res.json({ assignment: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi tải nhiệm vụ' }); }
});

module.exports = r;

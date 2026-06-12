// Module "Kế hoạch phòng ban" (CRM) — mỗi tuần của một phòng ban là 1 sheet theo
// mẫu Excel "KH tuần": mỗi nhiệm vụ là 1 dòng có khoảng ngày Bắt đầu → Kết thúc
// (mini-Gantt), KPI, nơi thực hiện, tần suất, trạng thái, tiến độ; sheet có mục
// "Tổng kết tuần". Nhân viên tự quản lý nhiệm vụ của mình; trưởng phòng + admin
// quản lý toàn phòng.
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isCrmModuleAdmin, normalizeRole } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const TASK_FIELDS =
  'id, sheet_id, department_id, user_id, created_by, task_group, title, description, kpi, location, frequency, start_date, end_date, status, progress, priority, result_note, position, created_at, updated_at, completed_at';

const SHEET_FIELDS = 'id, department_id, company_id, week_start, name, summary, created_by, created_at, updated_at';

const STATUSES = new Set(['planned', 'in_progress', 'done', 'cancelled']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const SUMMARY_KEYS = ['result', 'review', 'issues', 'proposals'];

/** Admin module CRM hoặc manager hệ thống — thấy mọi phòng ban. */
function isGlobalManager(user) {
  return isCrmModuleAdmin(user) || normalizeRole(user?.role) === 'manager';
}

/**
 * Ngữ cảnh quyền của user đối với 1 phòng ban:
 * { canView, canManage } — canManage = sửa/xoá mọi task trong phòng.
 */
async function getDeptAccess(req, departmentId) {
  if (!departmentId) return { canView: false, canManage: false };
  if (isGlobalManager(req.user)) return { canView: true, canManage: true };

  const userId = req.user.userId;
  const [{ data: me }, { data: dept }] = await Promise.all([
    supabase.from('users').select('id, department_id').eq('id', userId).maybeSingle(),
    supabase.from('departments').select('id, manager_id').eq('id', departmentId).maybeSingle(),
  ]);
  if (!dept) return { canView: false, canManage: false };
  const isManager = dept.manager_id && String(dept.manager_id) === String(userId);
  const isMember = me?.department_id && String(me.department_id) === String(departmentId);
  return { canView: isManager || isMember, canManage: !!isManager };
}

/** Chuẩn hoá về thứ Hai của tuần chứa ngày d (YYYY-MM-DD). */
function toWeekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getUTCDay(); // 0=CN
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** Số tuần ISO-8601. */
function isoWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function fmtDM(dateStr) {
  const [, m, day] = dateStr.split('-');
  return `${day}/${m}`;
}

function defaultSheetName(weekStart) {
  return `Tuần ${isoWeekNumber(weekStart)} (${fmtDM(weekStart)} – ${fmtDM(addDays(weekStart, 6))})`;
}

/** Lấy (hoặc tạo) sheet tuần của phòng ban. */
async function getOrCreateSheet(departmentId, weekStart, userId) {
  const { data: existing, error: selErr } = await supabase
    .from('crm_dept_plan_sheets')
    .select(SHEET_FIELDS)
    .eq('department_id', departmentId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data: dept } = await supabase
    .from('departments')
    .select('id, company_id')
    .eq('id', departmentId)
    .maybeSingle();

  const { data: created, error: insErr } = await supabase
    .from('crm_dept_plan_sheets')
    .upsert(
      {
        department_id: departmentId,
        company_id: dept?.company_id || null,
        week_start: weekStart,
        name: defaultSheetName(weekStart),
        created_by: userId || null,
      },
      { onConflict: 'department_id,week_start' },
    )
    .select(SHEET_FIELDS)
    .single();
  if (insErr) throw insErr;
  return created;
}

/**
 * Bộ lọc người thực hiện từ query (?user_id= hoặc ?region_id=).
 * Trả về null = không lọc; mảng (có thể rỗng) = chỉ lấy task của các user này.
 */
async function resolveTaskUserFilter(req) {
  const userId = req.query.user_id && String(req.query.user_id).trim();
  if (userId) return [userId];
  const regionId = req.query.region_id && String(req.query.region_id).trim();
  if (regionId) {
    const { data } = await supabase
      .from('user_company_regions')
      .select('user_id')
      .eq('region_id', regionId);
    return [...new Set((data || []).map((r) => String(r.user_id)))];
  }
  return null;
}

function applyUserFilter(query, userIds) {
  if (userIds === null) return query;
  // .in với mảng rỗng trả về 0 dòng — đúng ý (khu vực không có nhân viên nào).
  return query.in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
}

async function getDeptMembers(departmentId) {
  const { data: dept } = await supabase
    .from('departments')
    .select('id, name, manager_id')
    .eq('id', departmentId)
    .maybeSingle();
  const { data: members } = await supabase
    .from('users')
    .select('id, full_name, email, avatar, role')
    .eq('department_id', departmentId)
    .eq('is_active', true)
    .order('full_name');
  const list = members || [];
  // Trưởng phòng có thể thuộc phòng khác — vẫn hiển thị trong danh sách.
  if (dept?.manager_id && !list.some((u) => String(u.id) === String(dept.manager_id))) {
    const { data: mgr } = await supabase
      .from('users')
      .select('id, full_name, email, avatar, role')
      .eq('id', dept.manager_id)
      .maybeSingle();
    if (mgr) list.unshift(mgr);
  }
  return { department: dept || null, members: list };
}

// ─── GET /sheets?department_id=&week_start= ───────────────────────────────────
// Lấy (tự tạo nếu chưa có) sheet tuần + tasks + thành viên phòng ban.
r.get('/sheets', async (req, res) => {
  try {
    const departmentId = req.query.department_id;
    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền xem phòng ban này' });

    const weekStart = toWeekStart(req.query.week_start || new Date().toISOString().slice(0, 10));
    if (!weekStart) return res.status(400).json({ error: 'week_start không hợp lệ' });

    const sheet = await getOrCreateSheet(departmentId, weekStart, req.user.userId);
    const userFilter = await resolveTaskUserFilter(req);
    const [{ data: tasks, error: tErr }, deptInfo] = await Promise.all([
      applyUserFilter(
        supabase
          .from('crm_dept_plan_tasks')
          .select(TASK_FIELDS)
          .eq('sheet_id', sheet.id),
        userFilter,
      )
        .order('position', { ascending: true })
        .order('id', { ascending: true }),
      getDeptMembers(departmentId),
    ]);
    if (tErr) throw tErr;

    res.json({
      sheet,
      tasks: tasks || [],
      department: deptInfo.department,
      members: deptInfo.members,
      can_manage: access.canManage || isGlobalManager(req.user),
    });
  } catch (e) {
    console.error('[dept-plans] GET /sheets:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── GET /sheets/list?department_id=&limit= ───────────────────────────────────
r.get('/sheets/list', async (req, res) => {
  try {
    const departmentId = req.query.department_id;
    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền xem phòng ban này' });

    const limit = Math.min(Number(req.query.limit) || 12, 60);
    const { data, error } = await supabase
      .from('crm_dept_plan_sheets')
      .select('id, week_start, name')
      .eq('department_id', departmentId)
      .order('week_start', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ sheets: data || [] });
  } catch (e) {
    console.error('[dept-plans] GET /sheets/list:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── PATCH /sheets/:id — cập nhật Tổng kết tuần / tên sheet ───────────────────
r.patch('/sheets/:id', async (req, res) => {
  try {
    const { data: sheet, error: sErr } = await supabase
      .from('crm_dept_plan_sheets')
      .select(SHEET_FIELDS)
      .eq('id', req.params.id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sheet) return res.status(404).json({ error: 'Không tìm thấy sheet' });

    const access = await getDeptAccess(req, sheet.department_id);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền với phòng ban này' });

    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) {
      if (!access.canManage && !isGlobalManager(req.user)) {
        return res.status(403).json({ error: 'Chỉ trưởng phòng/admin được đổi tên sheet' });
      }
      patch.name = String(b.name || '').trim() || defaultSheetName(sheet.week_start);
    }
    if (b.summary !== undefined && typeof b.summary === 'object' && b.summary) {
      const merged = { ...(sheet.summary || {}) };
      for (const k of SUMMARY_KEYS) {
        if (b.summary[k] !== undefined) merged[k] = String(b.summary[k] || '');
      }
      patch.summary = merged;
    }
    if (!Object.keys(patch).length) return res.json({ sheet });

    patch.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('crm_dept_plan_sheets')
      .update(patch)
      .eq('id', sheet.id)
      .select(SHEET_FIELDS)
      .single();
    if (error) throw error;
    res.json({ sheet: updated });
  } catch (e) {
    console.error('[dept-plans] PATCH /sheets:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── POST /tasks ──────────────────────────────────────────────────────────────
// Body: { department_id, week_start, user_id?, title, description?, kpi?, location?,
//         frequency?, task_group?, start_date?, end_date?, priority? }
r.post('/tasks', async (req, res) => {
  try {
    const {
      department_id: departmentId,
      week_start: weekStartRaw,
      user_id: targetUserId,
      title,
      description,
      kpi,
      location,
      frequency,
      task_group: taskGroup,
      start_date: startRaw,
      end_date: endRaw,
      priority,
    } = req.body || {};

    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Thiếu đầu công việc' });

    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền với phòng ban này' });

    const assigneeId = targetUserId || req.user.userId;
    const canManage = access.canManage || isGlobalManager(req.user);
    if (!canManage && String(assigneeId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Bạn chỉ được tạo nhiệm vụ cho chính mình' });
    }

    const weekStart = toWeekStart(weekStartRaw || startRaw || new Date().toISOString().slice(0, 10));
    if (!weekStart) return res.status(400).json({ error: 'week_start không hợp lệ' });
    const weekEnd = addDays(weekStart, 6);

    const startDate = isValidDate(startRaw) ? startRaw : weekStart;
    const endDate = isValidDate(endRaw) ? endRaw : startDate;
    if (endDate < startDate) return res.status(400).json({ error: 'Ngày kết thúc phải sau ngày bắt đầu' });
    if (endDate < weekStart || startDate > weekEnd) {
      return res.status(400).json({ error: 'Khoảng ngày thực hiện không giao với tuần của sheet' });
    }

    const sheet = await getOrCreateSheet(departmentId, weekStart, req.user.userId);

    const { data: maxRows } = await supabase
      .from('crm_dept_plan_tasks')
      .select('position')
      .eq('sheet_id', sheet.id)
      .order('position', { ascending: false })
      .limit(1);
    const position = ((maxRows && maxRows[0]?.position) || 0) + 1;

    const { data: task, error } = await supabase
      .from('crm_dept_plan_tasks')
      .insert({
        sheet_id: sheet.id,
        department_id: departmentId,
        user_id: assigneeId,
        created_by: req.user.userId,
        task_group: taskGroup ? String(taskGroup).trim() : null,
        title: String(title).trim(),
        description: description || null,
        kpi: kpi || null,
        location: location || null,
        frequency: frequency || null,
        start_date: startDate,
        end_date: endDate,
        priority: PRIORITIES.has(priority) ? priority : 'normal',
        position,
      })
      .select(TASK_FIELDS)
      .single();
    if (error) throw error;
    res.status(201).json({ task });
  } catch (e) {
    console.error('[dept-plans] POST /tasks:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── POST /tasks/import — nhập hàng loạt từ Excel ─────────────────────────────
// Body: { department_id, tasks: [{ title, description?, kpi?, location?, frequency?,
//         task_group?, user_id?, start_date, end_date?, priority?, status?, progress?, result_note? }] }
// Tuần của mỗi nhiệm vụ suy ra từ start_date — tự tạo sheet tuần tương ứng.
r.post('/tasks/import', async (req, res) => {
  try {
    const departmentId = req.body?.department_id;
    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền với phòng ban này' });
    const canManage = access.canManage || isGlobalManager(req.user);

    const list = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 500) : [];
    if (!list.length) return res.status(400).json({ error: 'Không có dòng nào để nhập' });

    // Chuẩn hoá từng dòng + gom theo tuần
    const rows = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i] || {};
      const title = String(t.title || '').trim();
      if (!title) return res.status(400).json({ error: `Dòng ${i + 1}: thiếu đầu công việc` });
      const startDate = isValidDate(t.start_date) ? t.start_date : null;
      if (!startDate) return res.status(400).json({ error: `Dòng ${i + 1} (${title}): ngày bắt đầu không hợp lệ` });
      const endDate = isValidDate(t.end_date) && t.end_date >= startDate ? t.end_date : startDate;
      const progress = Math.min(100, Math.max(0, Math.round(Number(t.progress) || 0)));
      const status = STATUSES.has(t.status) ? t.status : 'planned';
      rows.push({
        department_id: departmentId,
        user_id: canManage && t.user_id ? t.user_id : req.user.userId,
        created_by: req.user.userId,
        task_group: t.task_group ? String(t.task_group).trim() : null,
        title,
        description: t.description || null,
        kpi: t.kpi || null,
        location: t.location || null,
        frequency: t.frequency || null,
        start_date: startDate,
        end_date: endDate,
        priority: PRIORITIES.has(t.priority) ? t.priority : 'normal',
        status,
        progress: status === 'done' && !progress ? 100 : progress,
        result_note: t.result_note || null,
        completed_at: status === 'done' ? new Date().toISOString() : null,
        _week: toWeekStart(startDate),
      });
    }

    // Tạo/lấy sheet cho từng tuần + vị trí bắt đầu
    const weeks = [...new Set(rows.map((x) => x._week))];
    const sheetByWeek = new Map();
    for (const ws of weeks) {
      const sheet = await getOrCreateSheet(departmentId, ws, req.user.userId);
      const { data: maxRows } = await supabase
        .from('crm_dept_plan_tasks')
        .select('position')
        .eq('sheet_id', sheet.id)
        .order('position', { ascending: false })
        .limit(1);
      sheetByWeek.set(ws, { sheet, nextPos: ((maxRows && maxRows[0]?.position) || 0) + 1 });
    }

    const inserts = rows.map((x) => {
      const slot = sheetByWeek.get(x._week);
      const { _week, ...row } = x;
      return { ...row, sheet_id: slot.sheet.id, position: slot.nextPos++ };
    });

    const created = [];
    for (let i = 0; i < inserts.length; i += 200) {
      const { data, error } = await supabase
        .from('crm_dept_plan_tasks')
        .insert(inserts.slice(i, i + 200))
        .select(TASK_FIELDS);
      if (error) throw error;
      created.push(...(data || []));
    }

    res.status(201).json({ created: created.length, weeks, tasks: created });
  } catch (e) {
    console.error('[dept-plans] POST /tasks/import:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

async function loadTaskWithAccess(req, taskId) {
  const { data: task, error } = await supabase
    .from('crm_dept_plan_tasks')
    .select(TASK_FIELDS)
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task) return { task: null, canEdit: false };
  const access = await getDeptAccess(req, task.department_id);
  const canManage = access.canManage || isGlobalManager(req.user);
  const isOwn = String(task.user_id) === String(req.user.userId);
  return { task, canEdit: canManage || (access.canView && isOwn), canManage };
}

// ─── PATCH /tasks/:id ─────────────────────────────────────────────────────────
r.patch('/tasks/:id', async (req, res) => {
  try {
    const { task, canEdit, canManage } = await loadTaskWithAccess(req, req.params.id);
    if (!task) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    if (!canEdit) return res.status(403).json({ error: 'Không có quyền sửa nhiệm vụ này' });

    const b = req.body || {};
    const patch = {};
    if (b.title !== undefined) {
      if (!String(b.title).trim()) return res.status(400).json({ error: 'Đầu công việc không được trống' });
      patch.title = String(b.title).trim();
    }
    for (const k of ['description', 'kpi', 'location', 'frequency', 'result_note']) {
      if (b[k] !== undefined) patch[k] = b[k] || null;
    }
    if (b.task_group !== undefined) patch.task_group = b.task_group ? String(b.task_group).trim() : null;
    if (b.priority !== undefined) {
      if (!PRIORITIES.has(b.priority)) return res.status(400).json({ error: 'priority không hợp lệ' });
      patch.priority = b.priority;
    }
    if (b.status !== undefined) {
      if (!STATUSES.has(b.status)) return res.status(400).json({ error: 'status không hợp lệ' });
      patch.status = b.status;
      patch.completed_at = b.status === 'done' ? new Date().toISOString() : null;
      if (b.status === 'done' && b.progress === undefined) patch.progress = 100;
    }
    if (b.progress !== undefined) {
      const p = Number(b.progress);
      if (!Number.isFinite(p) || p < 0 || p > 100) return res.status(400).json({ error: 'progress phải từ 0–100' });
      patch.progress = Math.round(p);
    }
    if (b.position !== undefined) patch.position = Number(b.position) || 0;
    if (b.start_date !== undefined || b.end_date !== undefined) {
      const startDate = b.start_date !== undefined ? b.start_date : task.start_date;
      const endDate = b.end_date !== undefined ? b.end_date : task.end_date;
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return res.status(400).json({ error: 'Ngày không hợp lệ (YYYY-MM-DD)' });
      }
      if (endDate < startDate) return res.status(400).json({ error: 'Ngày kết thúc phải sau ngày bắt đầu' });
      patch.start_date = startDate;
      patch.end_date = endDate;
    }
    if (b.user_id !== undefined && String(b.user_id) !== String(task.user_id)) {
      if (!canManage) return res.status(403).json({ error: 'Chỉ trưởng phòng/admin được đổi người thực hiện' });
      patch.user_id = b.user_id;
    }
    if (!Object.keys(patch).length) return res.json({ task });

    patch.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('crm_dept_plan_tasks')
      .update(patch)
      .eq('id', task.id)
      .select(TASK_FIELDS)
      .single();
    if (error) throw error;
    res.json({ task: updated });
  } catch (e) {
    console.error('[dept-plans] PATCH /tasks:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────────
r.delete('/tasks/:id', async (req, res) => {
  try {
    const { task, canEdit } = await loadTaskWithAccess(req, req.params.id);
    if (!task) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    if (!canEdit) return res.status(403).json({ error: 'Không có quyền xoá nhiệm vụ này' });

    const { error } = await supabase.from('crm_dept_plan_tasks').delete().eq('id', task.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[dept-plans] DELETE /tasks:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── GET /calendar?department_id=&month=YYYY-MM ───────────────────────────────
// Trả về các nhiệm vụ có khoảng [start_date, end_date] giao với tháng.
r.get('/calendar', async (req, res) => {
  try {
    const departmentId = req.query.department_id;
    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền xem phòng ban này' });

    const month = String(req.query.month || '').trim() || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month phải dạng YYYY-MM' });
    const from = `${month}-01`;
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(d.getUTCDate() - 1);
    const to = d.toISOString().slice(0, 10); // ngày cuối tháng

    const userFilter = await resolveTaskUserFilter(req);
    const [{ data: tasks, error }, deptInfo] = await Promise.all([
      applyUserFilter(
        supabase
          .from('crm_dept_plan_tasks')
          .select(TASK_FIELDS)
          .eq('department_id', departmentId)
          .lte('start_date', to)
          .gte('end_date', from),
        userFilter,
      )
        .order('start_date')
        .order('position'),
      getDeptMembers(departmentId),
    ]);
    if (error) throw error;
    res.json({
      month,
      tasks: tasks || [],
      members: deptInfo.members,
      can_manage: access.canManage || isGlobalManager(req.user),
    });
  } catch (e) {
    console.error('[dept-plans] GET /calendar:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

// ─── GET /report?department_id=&date_from=&date_to= ───────────────────────────
// Báo cáo tiến độ theo nhân viên + theo ngày (bucket theo end_date/deadline).
r.get('/report', async (req, res) => {
  try {
    const departmentId = req.query.department_id;
    if (!departmentId) return res.status(400).json({ error: 'Thiếu department_id' });
    const access = await getDeptAccess(req, departmentId);
    if (!access.canView) return res.status(403).json({ error: 'Không có quyền xem phòng ban này' });

    const today = new Date().toISOString().slice(0, 10);
    const df = isValidDate(req.query.date_from) ? req.query.date_from : toWeekStart(today);
    const dt = isValidDate(req.query.date_to) ? req.query.date_to : addDays(toWeekStart(today), 6);

    const userFilter = await resolveTaskUserFilter(req);
    const [{ data: tasks, error }, deptInfo] = await Promise.all([
      applyUserFilter(
        supabase
          .from('crm_dept_plan_tasks')
          .select(TASK_FIELDS)
          .eq('department_id', departmentId)
          .lte('start_date', dt)
          .gte('end_date', df),
        userFilter,
      ),
      getDeptMembers(departmentId),
    ]);
    if (error) throw error;
    const all = tasks || [];

    const isOverdue = (t) =>
      t.status !== 'done' && t.status !== 'cancelled' && t.end_date && t.end_date < today;

    const emptyStat = () => ({ total: 0, done: 0, in_progress: 0, planned: 0, cancelled: 0, overdue: 0, progress_sum: 0 });
    const byUser = new Map();
    const byDate = new Map();
    const summary = emptyStat();

    for (const t of all) {
      const stats = [summary];
      if (!byUser.has(t.user_id)) byUser.set(t.user_id, emptyStat());
      stats.push(byUser.get(t.user_id));
      const bucket = t.end_date >= df && t.end_date <= dt ? t.end_date : null;
      if (bucket) {
        if (!byDate.has(bucket)) byDate.set(bucket, emptyStat());
        stats.push(byDate.get(bucket));
      }
      for (const s of stats) {
        s.total += 1;
        s[t.status] = (s[t.status] || 0) + 1;
        if (isOverdue(t)) s.overdue += 1;
        s.progress_sum += t.progress || 0;
      }
    }

    const finalize = (s) => ({
      total: s.total,
      done: s.done,
      in_progress: s.in_progress,
      planned: s.planned,
      cancelled: s.cancelled,
      overdue: s.overdue,
      completion_pct: s.total ? Math.round((s.done / s.total) * 100) : 0,
      avg_progress: s.total ? Math.round(s.progress_sum / s.total) : 0,
    });

    const memberById = new Map(deptInfo.members.map((m) => [String(m.id), m]));
    const rows = [...byUser.entries()]
      .map(([userId, s]) => ({
        user_id: userId,
        full_name: memberById.get(String(userId))?.full_name || 'Người dùng',
        avatar: memberById.get(String(userId))?.avatar || null,
        ...finalize(s),
      }))
      .sort((a, b) => b.total - a.total);

    const daily = [...byDate.entries()]
      .map(([date, s]) => ({ date, ...finalize(s) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    res.json({
      date_from: df,
      date_to: dt,
      department: deptInfo.department,
      summary: finalize(summary),
      rows,
      daily,
    });
  } catch (e) {
    console.error('[dept-plans] GET /report:', e.message || e);
    res.status(500).json({ error: e.message || 'Lỗi máy chủ' });
  }
});

module.exports = r;

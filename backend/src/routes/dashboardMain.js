const { Router } = require('express');
const { fetchAllByIds } = require('../helpers/supabaseFetchAll');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { pgDashboardMainStats } = require('../helpers/pgHotQueries');
const { responseCache } = require('../middleware/responseCache');
const {
  applyProjectTenantScope,
  isTenantScopeEnforced,
} = require('../helpers/tenantScope');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// DASHBOARD CHÍNH - PHÂN QUYỀN THÔNG MINH
// ═══════════════════════════════════════════════

/**
 * GET /api/dashboard-main
 * Dashboard chính với phân quyền tự động
 * 
 * Logic:
 * - Giám đốc/Quản lý/Giám sát → Xem tất cả dự án
 * - Nhân viên thường → Chỉ xem dự án được giao hoặc tham gia
 */
r.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { filter } = req.query; // 'all', 'division', 'company', 'department', 'mine'

    // 1. Lấy thông tin user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        role,
        department_id,
        primary_division_id,
        departments!users_department_id_fkey(
          id,
          name,
          company_id,
          companies(id, name)
        )
      `)
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // 2. Xác định quyền xem
    const hasFullAccess = ['admin', 'manager', 'director', 'supervisor'].includes(user.role);

    let projectIds = [];

    if (hasFullAccess) {
      // Giám đốc/Quản lý/Giám sát → Xem theo filter
      if (filter === 'division' && user.primary_division_id) {
        // Lọc theo Khối
        projectIds = await getProjectIdsByDivision(user.primary_division_id, req);
      } else if (filter === 'company' && user.departments?.company_id) {
        // Lọc theo Công ty
        projectIds = await getProjectIdsByCompany(user.departments.company_id, req);
      } else if (filter === 'department' && user.department_id) {
        // Lọc theo Phòng ban
        projectIds = await getProjectIdsByDepartment(user.department_id, req);
      } else if (filter === 'mine') {
        // Chỉ dự án của mình
        projectIds = await getProjectIdsByUser(userId, req);
      } else {
        // Mặc định: Tất cả dự án (trong phạm vi tenant nếu có)
        projectIds = await getAllProjectIds(req);
      }
    } else {
      // Nhân viên thường → Chỉ xem dự án của mình
      projectIds = await getProjectIdsByUser(userId, req);
    }

    // 3. Lấy thông tin dự án
    // 595 project id ≈ 23KB URL — sát ngưỡng ~25KB; fetchAllByIds tự chia khúc id.
    const projects = (await fetchAllByIds({
      table: 'projects',
      // projects KHÔNG có start_date/end_date/customer_name/customer_phone.
      columns: 'id, name, code, status, deadline, created_at, created_by,'
        + ' flow:workflow_flows(id, name)',
      key: 'id',
      ids: projectIds,
    })).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    // 4. Lấy tasks của các dự án — phải đọc đủ: 595 dự án × ~26,7 task ≈ 15.900 dòng,
    // vượt xa ngưỡng cắt 1.000 của PostgREST. Bị cắt thì thẻ dự án hiện "0 nhiệm vụ" và
    // các ô thống kê (total/overdue/my_tasks) đều hụt. Đồng thời tránh URL quá dài.
    const tasks = await fetchAllByIds({
      table: 'tasks',
      // tasks KHÔNG có `assigned_to`; cột thật là `assignee_id`.
      columns: 'id, project_id, title, status, priority, assignee_id, due_date, completed_at',
      key: 'project_id',
      ids: projectIds,
    });

    // 5. Tính toán thống kê
    const stats = calculateStats(projects, tasks, userId);

    // 6. Group tasks theo project
    const tasksByProject = {};
    (tasks || []).forEach(task => {
      if (!tasksByProject[task.project_id]) {
        tasksByProject[task.project_id] = [];
      }
      tasksByProject[task.project_id].push(task);
    });

    // 7. Build response
    const projectsWithStats = projects.map(project => {
      const projectTasks = tasksByProject[project.id] || [];
      const myTasks = projectTasks.filter(t => t.assignee_id === userId);

      return {
        ...project,
        task_count: projectTasks.length,
        my_task_count: myTasks.length,
        completed_tasks: projectTasks.filter(t => t.status === 'done').length,
        in_progress_tasks: projectTasks.filter(t => t.status === 'in_progress').length,
        pending_tasks: projectTasks.filter(t => NOT_STARTED_TASK_STATUSES.includes(t.status)).length,
        overdue_tasks: projectTasks.filter(t => 
          t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()
        ).length
      };
    });

    res.json({
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        department: user.departments?.name,
        company: user.departments?.companies?.name,
        has_full_access: hasFullAccess
      },
      stats,
      projects: projectsWithStats,
      filters: {
        current: filter || 'all',
        available: hasFullAccess 
          ? ['all', 'division', 'company', 'department', 'mine']
          : ['mine']
      }
    });

  } catch (e) {
    console.error('Dashboard main error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/dashboard-main/stats
 * Chỉ lấy thống kê (nhanh hơn)
 */
r.get('/stats', responseCache({ ttl: 30, scope: 'user', tags: ['dashboard-main'] }), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Lấy user info
    const { data: user } = await supabase
      .from('users')
      .select('id, role, department_id, primary_division_id')
      .eq('id', userId)
      .single();

    const hasFullAccess = ['admin', 'manager', 'director', 'supervisor'].includes(user?.role);

    let projectIds = [];

    if (hasFullAccess) {
      projectIds = await getAllProjectIds(req);
    } else {
      projectIds = await getProjectIdsByUser(userId, req);
    }

    // Đếm tasks — ưu tiên pg aggregate
    const pgStats = await pgDashboardMainStats(userId, projectIds);
    if (pgStats) {
      return res.json(pgStats);
    }

    const { count: totalProjects } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .in('id', projectIds);

    // Đếm tasks — 3 lỗi cùng lúc ở chỗ này trước đây:
    //  1. `error` không được đọc → khi lỗi thì `tasks` = null và `tasks.filter` ném
    //     "Cannot read properties of null (reading 'filter')" → endpoint trả 500.
    //  2. URL quá dài: 595 project id ≈ 23KB, vượt ngưỡng ~25KB khi cộng phần select.
    //  3. Cắt 1.000 dòng: 595 dự án × ~26,7 task = ~15.900 dòng → mọi con số đếm bị hụt.
    // fetchAllByIds tự chia khúc id (lỗi 2) và phân trang (lỗi 3), lỗi thì ném ra rõ ràng.
    const tasks = await fetchAllByIds({
      table: 'tasks',
      columns: 'id, status, assignee_id, due_date',
      key: 'project_id',
      ids: projectIds,
    });

    const myTasks = tasks.filter(t => t.assignee_id === userId);
    const now = new Date();

    const stats = {
      total_projects: totalProjects || 0,
      total_tasks: tasks.length,
      my_tasks: myTasks.length,
      completed_tasks: tasks.filter(t => t.status === 'done').length,
      // DB dùng 'in_progress' (gạch DƯỚI), và 'todo' cũng là chưa bắt đầu — xem chú thích
      // ở calculateStats phía dưới.
      in_progress_tasks: tasks.filter(t => t.status === 'in_progress').length,
      pending_tasks: tasks.filter(t => NOT_STARTED_TASK_STATUSES.includes(t.status)).length,
      overdue_tasks: tasks.filter(t => 
        t.status !== 'done' && t.due_date && new Date(t.due_date) < now
      ).length,
      my_overdue_tasks: myTasks.filter(t => 
        t.status !== 'done' && t.due_date && new Date(t.due_date) < now
      ).length
    };

    res.json(stats);

  } catch (e) {
    console.error('Dashboard stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════

async function getAllProjectIds(req) {
  if (isTenantScopeEnforced(req) && !(req.tenantCompanyIds || []).length) {
    return [];
  }
  let q = supabase.from('projects').select('id');
  q = applyProjectTenantScope(q, req);
  const { data } = await q;
  return (data || []).map((p) => p.id);
}

async function filterProjectIdsByTenant(req, projectIds) {
  if (!isTenantScopeEnforced(req) || !projectIds?.length) return projectIds || [];
  if (!(req.tenantCompanyIds || []).length) return [];
  let q = supabase.from('projects').select('id').in('id', projectIds);
  q = applyProjectTenantScope(q, req);
  const { data } = await q;
  return (data || []).map((p) => p.id);
}

async function getProjectIdsByDivision(divisionId, req) {
  // Lấy flows chứa division
  const { data: steps } = await supabase
    .from('workflow_flow_steps')
    .select('flow_id')
    .eq('division_unit_id', divisionId);

  if (!steps || steps.length === 0) return [];

  const flowIds = [...new Set(steps.map(s => s.flow_id))];

  // Lấy projects dùng flows đó
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .in('flow_id', flowIds);

  return filterProjectIdsByTenant(req, (projects || []).map(p => p.id));
}

async function getProjectIdsByCompany(companyId, req) {
  // Lấy flows có company
  const { data: steps } = await supabase
    .from('workflow_flow_steps')
    .select('flow_id')
    .eq('company_unit_id', companyId);

  if (!steps || steps.length === 0) return [];

  const flowIds = [...new Set(steps.map(s => s.flow_id))];

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .in('flow_id', flowIds);

  return filterProjectIdsByTenant(req, (projects || []).map(p => p.id));
}

async function getProjectIdsByDepartment(departmentId, req) {
  // Lấy users trong department
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('department_id', departmentId);

  if (!users || users.length === 0) return [];

  const userIds = users.map(u => u.id);

  // Lấy projects mà users tham gia (assigned tasks)
  // Đây là nơi SINH RA projectIds, nên bị cắt thì dự án BIẾN MẤT khỏi danh sách (không
  // chỉ sai số đếm), rồi tập thiếu đó lại bị cắt lần nữa ở truy vấn tasks phía sau.
  const tasks = await fetchAllByIds({
    table: 'tasks', columns: 'project_id', key: 'assignee_id', ids: userIds,
  });

  return filterProjectIdsByTenant(req, [...new Set(tasks.map(t => t.project_id))]);
}

async function getProjectIdsByUser(userId, req) {
  // Dự án user tạo
  const { data: created } = await supabase
    .from('projects')
    .select('id')
    .eq('created_by', userId);

  // Dự án user có task
  const { data: tasks } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('assignee_id', userId);

  const projectIds = [
    ...(created || []).map(p => p.id),
    ...(tasks || []).map(t => t.project_id)
  ];

  return filterProjectIdsByTenant(req, [...new Set(projectIds)]);
}

/**
 * Trạng thái thật trong DB (đã đối chiếu):
 *   projects.status : producing 495 · consulting 92 · shipping 5 · installing 3 · contract_signed 1
 *   tasks.status    : todo 9.683 · done 3.940 · pending 2.232 · in_progress 1
 *
 * Code cũ lọc theo những giá trị KHÔNG tồn tại nên luôn ra 0:
 *   - projects: ['planning','in-progress'] và 'done'  → active_projects/completed_projects = 0
 *   - tasks: 'in-progress' (gạch NGANG) trong khi DB là 'in_progress' (gạch DƯỚI)
 *   - 'todo' (9.683 dòng = 61% tổng task) không được đếm vào bất kỳ ô nào
 */
const ACTIVE_PROJECT_STATUSES = [
  'consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'shipping', 'installing',
];
const DONE_PROJECT_STATUSES = ['completed'];
/** Chưa bắt đầu: cả `pending` lẫn `todo`. */
const NOT_STARTED_TASK_STATUSES = ['pending', 'todo'];

function calculateStats(projects, tasks, userId) {
  const now = new Date();
  const myTasks = tasks.filter(t => t.assignee_id === userId);
  const isOverdue = (t) => t.status !== 'done' && t.due_date && new Date(t.due_date) < now;

  return {
    total_projects: projects.length,
    active_projects: projects.filter(p => ACTIVE_PROJECT_STATUSES.includes(p.status)).length,
    completed_projects: projects.filter(p => DONE_PROJECT_STATUSES.includes(p.status)).length,

    total_tasks: tasks.length,
    my_tasks: myTasks.length,

    completed_tasks: tasks.filter(t => t.status === 'done').length,
    in_progress_tasks: tasks.filter(t => t.status === 'in_progress').length,
    pending_tasks: tasks.filter(t => NOT_STARTED_TASK_STATUSES.includes(t.status)).length,

    overdue_tasks: tasks.filter(isOverdue).length,

    my_completed_tasks: myTasks.filter(t => t.status === 'done').length,
    my_in_progress_tasks: myTasks.filter(t => t.status === 'in_progress').length,
    my_pending_tasks: myTasks.filter(t => NOT_STARTED_TASK_STATUSES.includes(t.status)).length,
    my_overdue_tasks: myTasks.filter(isOverdue).length,
  };
}

module.exports = r;

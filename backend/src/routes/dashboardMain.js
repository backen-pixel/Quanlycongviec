const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { pgDashboardMainStats } = require('../helpers/pgHotQueries');
const { responseCache } = require('../middleware/responseCache');

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
        departments(
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
        projectIds = await getProjectIdsByDivision(user.primary_division_id);
      } else if (filter === 'company' && user.departments?.company_id) {
        // Lọc theo Công ty
        projectIds = await getProjectIdsByCompany(user.departments.company_id);
      } else if (filter === 'department' && user.department_id) {
        // Lọc theo Phòng ban
        projectIds = await getProjectIdsByDepartment(user.department_id);
      } else if (filter === 'mine') {
        // Chỉ dự án của mình
        projectIds = await getProjectIdsByUser(userId);
      } else {
        // Mặc định: Tất cả dự án
        const { data: allProjects } = await supabase
          .from('projects')
          .select('id');
        projectIds = (allProjects || []).map(p => p.id);
      }
    } else {
      // Nhân viên thường → Chỉ xem dự án của mình
      projectIds = await getProjectIdsByUser(userId);
    }

    // 3. Lấy thông tin dự án
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        code,
        status,
        start_date,
        end_date,
        customer_name,
        customer_phone,
        created_at,
        created_by,
        flow:workflow_flows(id, name)
      `)
      .in('id', projectIds)
      .order('created_at', { ascending: false });

    if (projectsError) throw projectsError;

    // 4. Lấy tasks của các dự án
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        id,
        project_id,
        title,
        status,
        priority,
        assigned_to,
        due_date,
        completed_at
      `)
      .in('project_id', projectIds);

    if (tasksError) throw tasksError;

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
      const myTasks = projectTasks.filter(t => t.assigned_to === userId);

      return {
        ...project,
        task_count: projectTasks.length,
        my_task_count: myTasks.length,
        completed_tasks: projectTasks.filter(t => t.status === 'done').length,
        in_progress_tasks: projectTasks.filter(t => t.status === 'in-progress').length,
        pending_tasks: projectTasks.filter(t => t.status === 'pending').length,
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
      const { data: allProjects } = await supabase.from('projects').select('id');
      projectIds = (allProjects || []).map(p => p.id);
    } else {
      projectIds = await getProjectIdsByUser(userId);
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

    // Đếm tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, status, assigned_to, due_date')
      .in('project_id', projectIds);

    const myTasks = tasks.filter(t => t.assigned_to === userId);
    const now = new Date();

    const stats = {
      total_projects: totalProjects || 0,
      total_tasks: tasks.length,
      my_tasks: myTasks.length,
      completed_tasks: tasks.filter(t => t.status === 'done').length,
      in_progress_tasks: tasks.filter(t => t.status === 'in-progress').length,
      pending_tasks: tasks.filter(t => t.status === 'pending').length,
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

async function getProjectIdsByDivision(divisionId) {
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

  return (projects || []).map(p => p.id);
}

async function getProjectIdsByCompany(companyId) {
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

  return (projects || []).map(p => p.id);
}

async function getProjectIdsByDepartment(departmentId) {
  // Lấy users trong department
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('department_id', departmentId);

  if (!users || users.length === 0) return [];

  const userIds = users.map(u => u.id);

  // Lấy projects mà users tham gia (assigned tasks)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('project_id')
    .in('assigned_to', userIds);

  return [...new Set((tasks || []).map(t => t.project_id))];
}

async function getProjectIdsByUser(userId) {
  // Dự án user tạo
  const { data: created } = await supabase
    .from('projects')
    .select('id')
    .eq('created_by', userId);

  // Dự án user có task
  const { data: tasks } = await supabase
    .from('tasks')
    .select('project_id')
    .eq('assigned_to', userId);

  const projectIds = [
    ...(created || []).map(p => p.id),
    ...(tasks || []).map(t => t.project_id)
  ];

  return [...new Set(projectIds)];
}

function calculateStats(projects, tasks, userId) {
  const now = new Date();
  const myTasks = tasks.filter(t => t.assigned_to === userId);

  return {
    total_projects: projects.length,
    active_projects: projects.filter(p => ['planning', 'in-progress'].includes(p.status)).length,
    completed_projects: projects.filter(p => p.status === 'done').length,
    
    total_tasks: tasks.length,
    my_tasks: myTasks.length,
    
    completed_tasks: tasks.filter(t => t.status === 'done').length,
    in_progress_tasks: tasks.filter(t => t.status === 'in-progress').length,
    pending_tasks: tasks.filter(t => t.status === 'pending').length,
    
    overdue_tasks: tasks.filter(t => 
      t.status !== 'done' && t.due_date && new Date(t.due_date) < now
    ).length,
    
    my_completed_tasks: myTasks.filter(t => t.status === 'done').length,
    my_in_progress_tasks: myTasks.filter(t => t.status === 'in-progress').length,
    my_pending_tasks: myTasks.filter(t => t.status === 'pending').length,
    my_overdue_tasks: myTasks.filter(t => 
      t.status !== 'done' && t.due_date && new Date(t.due_date) < now
    ).length
  };
}

module.exports = r;

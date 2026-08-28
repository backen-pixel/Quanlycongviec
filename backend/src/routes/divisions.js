const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { responseCache, invalidateTags } = require('../middleware/responseCache');
const {
  loadDivisionProjects,
  loadTasksForProjectIds,
  isOpenTaskStatus,
  ACTIVE_PROJECT_STATUSES,
  NOT_STARTED_TASK_STATUSES,
} = require('../helpers/divisionProjectScope');

const OVERVIEW_PROJECT_COLUMNS = `
  id, name, code, status, start_date, end_date, customer_name, customer_phone,
  flow_id, company_id, created_at,
  flow:workflow_flows(id, name),
  company:companies(id, name, short_name)
`;
const OVERVIEW_TASK_COLUMNS = `
  id, project_id, title, status, priority, stage, assigned_to, due_date, completed_at, created_at,
  assignee:users!tasks_assigned_to_fkey(id,full_name,avatar_url)
`;


const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function orgtreeInvalidate(body) {
    void invalidateTags(['orgtree']);
    return origJson(body);
  };
  next();
});

// ═══════════════════════════════════════════════
// QUẢN LÝ NHIỆM VỤ THEO KHỐI (DIVISION)
// ═══════════════════════════════════════════════

/**
 * GET /api/divisions
 * Lấy danh sách tất cả các Khối
 */
r.get('/', responseCache({ ttl: 120, scope: 'company', tags: ['orgtree'] }), async (req, res) => {
  try {
    const { data: levelData } = await supabase
      .from('ecosystem_levels')
      .select('id')
      .eq('slug', 'division')
      .single();

    if (!levelData) {
      return res.json({ divisions: [] });
    }

    const { data: allDivisions, error } = await supabase
      .from('ecosystem_units')
      .select('id, name, short_name, code, description, logo_url, icon, color, order_index')
      .eq('level_id', levelData.id)
      .order('code');

    if (error) throw error;

    // Filter: only return divisions that have at least 1 company linked
    const { data: companyCounts } = await supabase
      .from('companies')
      .select('division_unit_id');
    const activeDivIds = new Set((companyCounts || []).map(c => c.division_unit_id).filter(Boolean));
    const divisions = (allDivisions || []).filter(d => activeDivIds.has(d.id));

    res.json({ divisions });
  } catch (e) {
    console.error('Get divisions error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/divisions/:divisionId
 * Lấy thông tin 1 Khối
 */
r.get('/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;

    const { data: division, error } = await supabase
      .from('ecosystem_units')
      .select('id, name, short_name, code, description, logo_url, icon, color, created_at')
      .eq('id', divisionId)
      .single();

    if (error) throw error;

    res.json({ division });
  } catch (e) {
    console.error('Get division error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/divisions/:divisionId/projects-overview
 * Lấy tất cả dự án và nhiệm vụ của Khối (companies + assignments + flow steps).
 */
r.get('/:divisionId/projects-overview', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { status, search } = req.query;

    const { data: divisionRow } = await supabase
      .from('ecosystem_units')
      .select('id, name, short_name, code')
      .eq('id', divisionId)
      .maybeSingle();
    const divisionInfo = divisionRow || { id: divisionId, name: 'N/A' };

    const projects = await loadDivisionProjects(divisionId, OVERVIEW_PROJECT_COLUMNS);
    if (!projects.length) {
      return res.json({ projects: [] });
    }
    projects.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const tasks = await loadTasksForProjectIds(projects.map((p) => p.id), OVERVIEW_TASK_COLUMNS);
    tasks.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    const tasksByProject = {};
    tasks.forEach((task) => {
      if (!tasksByProject[task.project_id]) tasksByProject[task.project_id] = [];
      tasksByProject[task.project_id].push(task);
    });

    const now = new Date();
    const projectsWithData = projects.map((project) => {
      const projectTasks = tasksByProject[project.id] || [];
      const totalTasks = projectTasks.length;
      const completedTasks = projectTasks.filter((t) => t.status === 'done').length;
      const inProgressTasks = projectTasks.filter((t) => t.status === 'in_progress').length;
      const pendingTasks = projectTasks.filter((t) => NOT_STARTED_TASK_STATUSES.includes(t.status)).length;
      const overdueTasks = projectTasks.filter((t) =>
        isOpenTaskStatus(t.status) && t.due_date && new Date(t.due_date) < now
      ).length;

      return {
        assignment_id: project.id,
        project: {
          id: project.id,
          name: project.name,
          code: project.code,
          status: project.status,
          start_date: project.start_date,
          end_date: project.end_date,
          customer_name: project.customer_name,
          customer_phone: project.customer_phone,
          created_at: project.created_at,
        },
        division: divisionInfo,
        company: project.company || null,
        template_set: null,
        assigned_at: project.created_at,
        tasks: projectTasks,
        stats: {
          total: totalTasks,
          completed: completedTasks,
          in_progress: inProgressTasks,
          pending: pendingTasks,
          overdue: overdueTasks,
          completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        },
      };
    });

    // 7. Apply filters
    let filteredProjects = projectsWithData;

    if (status) {
      filteredProjects = filteredProjects.filter(p => p.project.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredProjects = filteredProjects.filter(p => 
        p.project.name?.toLowerCase().includes(searchLower) ||
        p.project.code?.toLowerCase().includes(searchLower) ||
        p.project.customer_name?.toLowerCase().includes(searchLower) ||
        p.company?.name?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ projects: filteredProjects });
  } catch (e) {
    console.error('Get division projects overview error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/divisions/:divisionId/task-summary
 * Tổng hợp nhiệm vụ của Khối theo trạng thái
 */
r.get('/:divisionId/task-summary', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const projects = await loadDivisionProjects(divisionId, 'id');
    if (!projects.length) {
      return res.json({ total: 0, by_status: {}, by_priority: {}, overdue: 0 });
    }

    const tasks = await loadTasksForProjectIds(
      projects.map((p) => p.id),
      'id, status, priority, due_date',
    );

    const now = new Date();
    const summary = { total: tasks.length, by_status: {}, by_priority: {}, overdue: 0 };
    tasks.forEach((task) => {
      summary.by_status[task.status] = (summary.by_status[task.status] || 0) + 1;
      summary.by_priority[task.priority] = (summary.by_priority[task.priority] || 0) + 1;
      if (isOpenTaskStatus(task.status) && task.due_date && new Date(task.due_date) < now) {
        summary.overdue += 1;
      }
    });

    res.json(summary);
  } catch (e) {
    console.error('Get division task summary error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/divisions/:divisionId/dashboard
 * Dashboard data for a specific division
 */
r.get('/:divisionId/dashboard', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { company_id } = req.query;

    // Get companies from both: companies table (linked via division_unit_id) 
    // AND ecosystem_units children (công ty trong khối)
    const { data: divCompanies } = await supabase
      .from('companies')
      .select('id, name, short_name, logo_url')
      .eq('division_unit_id', divisionId)
      .order('name');

    // Also get ecosystem child units as companies (if companies table doesn't have them)
    const { data: ecoChildren } = await supabase
      .from('ecosystem_units')
      .select('id, name, short_name, code')
      .eq('parent_id', divisionId)
      .eq('is_active', true)
      .order('order_index');

    // Merge: companies table first, then eco children that aren't already in companies
    const companyNames = new Set((divCompanies || []).map(c => c.name?.toLowerCase()));
    const ecoCompanies = (ecoChildren || [])
      .filter(e => !companyNames.has(e.name?.toLowerCase()))
      .map(e => ({ id: e.id, name: e.name, short_name: e.short_name || e.code, logo_url: null, _eco: true }));
    const companies = [...(divCompanies || []), ...ecoCompanies];

    let allProjects = await loadDivisionProjects(divisionId, `
      id, name, code, status, start_date, end_date,
      estimated_value, customer_name, created_at, flow_id, company_id,
      company:companies(id, name, short_name)
    `);
    if (company_id) {
      allProjects = allProjects.filter((p) => String(p.company_id) === String(company_id));
    }
    allProjects.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (!allProjects.length) {
      return res.json({
        stats: { projects: 0, active: 0, tasks: 0, members: 0, overdue: 0, completed: 0 },
        projects: [],
        tasks: [],
        activities: [],
        companies,
        employees: [],
      });
    }

    const allTasks = await loadTasksForProjectIds(
      allProjects.map((p) => p.id),
      'id, title, status, priority, project_id, assignee_id, due_date',
    );
    const projects = allProjects.slice(0, 50);
    const listedIds = new Set(projects.map((p) => String(p.id)));
    const listedTasks = allTasks.filter((t) => listedIds.has(String(t.project_id)));

    // Get employees count from company or division
    let employees = [];
    if (company_id) {
      const { data: emps } = await supabase
        .from('user_companies')
        .select('user:users(id, full_name, avatar, role)')
        .eq('company_id', company_id);
      employees = (emps || []).map(e => e.user).filter(Boolean);
    } else {
      // Get all employees across all companies in this division
      const companyIds = companies.map(c => c.id);
      if (companyIds.length > 0) {
        const { data: emps } = await supabase
          .from('user_companies')
          .select('user:users(id, full_name, avatar, role), company_id')
          .in('company_id', companyIds);
        const seen = new Set();
        (emps || []).forEach(e => {
          if (e.user && !seen.has(e.user.id)) {
            seen.add(e.user.id);
            employees.push(e.user);
          }
        });
      }
    }

    const stats = {
      projects: allProjects.length,
      active: allProjects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status)).length,
      tasks: allTasks.length,
      members: employees.length,
      overdue: allTasks.filter((t) => isOpenTaskStatus(t.status) && t.due_date && new Date(t.due_date) < new Date()).length,
      completed: allTasks.filter((t) => t.status === 'done').length,
    };

    res.json({
      stats,
      projects,
      tasks: listedTasks,
      activities: [],
      companies,
      employees,
    });
  } catch (e) {
    console.error('Get division dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/divisions/:divisionId/active-projects
 * Danh sách dự án đang hoạt động của Khối (simplified)
 */
r.get('/:divisionId/active-projects', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const rows = await loadDivisionProjects(
      divisionId,
      'id, name, code, status, customer_name, company_id, company:companies(id, name, short_name)',
    );
    const activeProjects = rows
      .filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status))
      .map((p) => ({
        project_id: p.id,
        project_name: p.name,
        project_code: p.code,
        project_status: p.status,
        customer_name: p.customer_name,
        company_name: p.company?.name || null,
      }));

    res.json({ projects: activeProjects });
  } catch (e) {
    console.error('Get active projects error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

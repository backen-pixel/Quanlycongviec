const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const {
  loadDivisionProjects,
  loadTasksForProjectIds,
  isOpenTaskStatus,
  ACTIVE_PROJECT_STATUSES,
  DONE_PROJECT_STATUSES,
  PLANNING_PROJECT_STATUSES,
  IN_PROGRESS_PROJECT_STATUSES,
} = require('../helpers/divisionProjectScope');

const r = Router();
r.use(auth);

const DASHBOARD_PROJECT_COLUMNS = `
  id, name, code, status, start_date, end_date, customer_name, created_at, flow_id, company_id,
  flow:workflow_flows(id, name)
`;

function emptyDivisionStats() {
  return {
    total_projects: 0,
    active_projects: 0,
    completed_projects: 0,
    planning_projects: 0,
    in_progress_projects: 0,
    total_tasks: 0,
    completed_tasks: 0,
    in_progress_tasks: 0,
    overdue_tasks: 0,
    completion_rate: 0,
  };
}

function buildDivisionStats(projects, tasks) {
  const now = new Date();
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status)).length;
  const completedProjects = projects.filter((p) => DONE_PROJECT_STATUSES.includes(p.status)).length;
  const planningProjects = projects.filter((p) => PLANNING_PROJECT_STATUSES.includes(p.status)).length;
  const inProgressProjects = projects.filter((p) => IN_PROGRESS_PROJECT_STATUSES.includes(p.status)).length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const overdueTasks = tasks.filter((t) =>
    isOpenTaskStatus(t.status) && t.due_date && new Date(t.due_date) < now
  ).length;
  return {
    total_projects: totalProjects,
    active_projects: activeProjects,
    completed_projects: completedProjects,
    planning_projects: planningProjects,
    in_progress_projects: inProgressProjects,
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    in_progress_tasks: inProgressTasks,
    overdue_tasks: overdueTasks,
    completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}

/**
 * GET /api/dashboard/by-division
 * Tổng quan theo từng Khối — dự án lấy HỢP companies + assignments + flow steps.
 */
r.get('/by-division', async (req, res) => {
  try {
    const { data: levelData } = await supabase
      .from('ecosystem_levels')
      .select('id')
      .eq('slug', 'division')
      .single();

    if (!levelData) {
      return res.json({ divisions: [] });
    }

    const { data: divisions, error: divError } = await supabase
      .from('ecosystem_units')
      .select('id, name, short_name, code, description, logo_url, icon, color, order_index')
      .eq('level_id', levelData.id)
      .order('order_index', { nullsFirst: false })
      .order('code');

    if (divError) throw divError;

    if (!divisions || divisions.length === 0) {
      return res.json({ divisions: [] });
    }

    const divisionsWithStats = await Promise.all(
      divisions.map(async (division) => {
        const projects = await loadDivisionProjects(division.id, 'id, status');
        if (!projects.length) {
          return { ...division, stats: emptyDivisionStats() };
        }
        const tasks = await loadTasksForProjectIds(
          projects.map((p) => p.id),
          'id, status, due_date',
        );
        return { ...division, stats: buildDivisionStats(projects, tasks) };
      }),
    );

    res.json({ divisions: divisionsWithStats });
  } catch (e) {
    console.error('Dashboard by division error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/dashboard/division/:divisionId/projects
 * Danh sách dự án của 1 Khối
 */
r.get('/division/:divisionId/projects', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { status } = req.query;

    let projects = await loadDivisionProjects(divisionId, DASHBOARD_PROJECT_COLUMNS);
    if (status) {
      projects = projects.filter((p) => p.status === status);
    }
    projects.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json({ projects });
  } catch (e) {
    console.error('Get division projects error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

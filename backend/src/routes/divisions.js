const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/divisions - List all divisions
// ═══════════════════════════════════════════════════════════════════════════
r.get('/', async (req, res) => {
  try {
    // Get Khối level ID
    const { data: khoiLevel } = await supabase
      .from('ecosystem_levels')
      .select('id')
      .eq('slug', 'division')
      .single();

    if (!khoiLevel) {
      return res.json({ divisions: [] });
    }

    // Get all divisions
    const { data: divisions } = await supabase
      .from('ecosystem_units')
      .select('id, name, slug, icon, color, description')
      .eq('level_id', khoiLevel.id)
      .order('name');

    // Get stats for each division
    const divisionsWithStats = await Promise.all(
      (divisions || []).map(async (div) => {
        // Count projects
        const { count: projectCount } = await supabase
          .from('division_projects')
          .select('*', { count: 'exact', head: true })
          .eq('division_id', div.id);

        // Count tasks (via projects)
        const { data: projectIds } = await supabase
          .from('division_projects')
          .select('project_id')
          .eq('division_id', div.id);

        let taskCount = 0;
        if (projectIds?.length) {
          const { count } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .in('project_id', projectIds.map(p => p.project_id))
            .neq('status', 'done');
          taskCount = count || 0;
        }

        // Count members
        const { count: memberCount } = await supabase
          .from('division_members')
          .select('*', { count: 'exact', head: true })
          .eq('division_id', div.id);

        // Count alerts (overdue projects)
        let alertCount = 0;
        if (projectIds?.length) {
          const { count } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .in('id', projectIds.map(p => p.project_id))
            .lt('due_date', new Date().toISOString())
            .neq('status', 'completed');
          alertCount = count || 0;
        }

        return {
          ...div,
          stats: {
            projects: projectCount || 0,
            tasks: taskCount,
            members: memberCount || 0,
            alerts: alertCount,
          },
        };
      })
    );

    res.json({ divisions: divisionsWithStats });
  } catch (e) {
    console.error('List divisions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/divisions/:divisionId/dashboard - Division dashboard data
// ═══════════════════════════════════════════════════════════════════════════
r.get('/:divisionId/dashboard', async (req, res) => {
  try {
    const { divisionId } = req.params;

    // Get division info
    const { data: division } = await supabase
      .from('ecosystem_units')
      .select('*')
      .eq('id', divisionId)
      .single();

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    // Get project IDs for this division
    const { data: divisionProjects } = await supabase
      .from('division_projects')
      .select('project_id, role')
      .eq('division_id', divisionId);

    const projectIds = (divisionProjects || []).map(dp => dp.project_id);

    // Calculate KPIs
    const kpis = await calculateDivisionKPIs(divisionId, projectIds);

    // Get projects with details
    let projects = [];
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('projects')
        .select(`
          *,
          customers(id, full_name, phone),
          current_stage:workflow_stages(id, name, slug, color),
          assignee:users!projects_project_manager_id_fkey(id, full_name, avatar)
        `)
        .in('id', projectIds)
        .order('created_at', { ascending: false });

      // Add task counts to each project
      projects = await Promise.all((data || []).map(async (p) => {
        const { count: totalTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', p.id);

        const { count: completedTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', p.id)
          .eq('status', 'done');

        return {
          ...p,
          tasks_total: totalTasks || 0,
          tasks_completed: completedTasks || 0,
        };
      }));
    }

    // Get tasks
    let tasks = [];
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('tasks')
        .select('*, assignee:users(id, full_name, avatar), project:projects(id, code, name)')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(100);
      tasks = data || [];
    }

    // Get members
    const { data: members } = await supabase
      .from('division_members')
      .select('*, user:users(id, full_name, email, avatar, role)')
      .eq('division_id', divisionId);

    // Calculate alerts
    const alerts = await calculateAlerts(divisionId, projectIds);

    res.json({
      division,
      kpis,
      projects,
      tasks,
      members: members || [],
      alerts,
    });
  } catch (e) {
    console.error('Division dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/divisions/:divisionId/projects - Assign project to division
// ═══════════════════════════════════════════════════════════════════════════
r.post('/:divisionId/projects', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { project_id, role } = req.body;

    const { data, error } = await supabase
      .from('division_projects')
      .insert({
        division_id: divisionId,
        project_id,
        role: role || 'owner',
        assigned_by: req.user.userId,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, assignment: data });
  } catch (e) {
    console.error('Assign project error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/divisions/:divisionId/projects/:projectId - Remove project
// ═══════════════════════════════════════════════════════════════════════════
r.delete('/:divisionId/projects/:projectId', async (req, res) => {
  try {
    const { divisionId, projectId } = req.params;

    await supabase
      .from('division_projects')
      .delete()
      .eq('division_id', divisionId)
      .eq('project_id', projectId);

    res.json({ success: true });
  } catch (e) {
    console.error('Remove project error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Calculate Division KPIs
// ═══════════════════════════════════════════════════════════════════════════
async function calculateDivisionKPIs(divisionId, projectIds) {
  if (!projectIds || projectIds.length === 0) {
    return {
      projects: { total: 0, active: 0, completed: 0, overdue: 0 },
      tasks: { total: 0, completed: 0, completion_rate: 0 },
      members: { total: 0 },
      progress: 0,
    };
  }

  // Projects KPIs
  const { count: totalProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds);

  const { count: activeProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .neq('status', 'completed');

  const { count: completedProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .eq('status', 'completed');

  const { count: overdueProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .lt('due_date', new Date().toISOString())
    .neq('status', 'completed');

  // Tasks KPIs
  const { count: totalTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds);

  const { count: completedTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'done');

  const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

  // Members
  const { count: totalMembers } = await supabase
    .from('division_members')
    .select('*', { count: 'exact', head: true })
    .eq('division_id', divisionId);

  return {
    projects: {
      total: totalProjects || 0,
      active: activeProjects || 0,
      completed: completedProjects || 0,
      overdue: overdueProjects || 0,
    },
    tasks: {
      total: totalTasks || 0,
      completed: completedTasks || 0,
      completion_rate: parseFloat(completionRate),
    },
    members: {
      total: totalMembers || 0,
    },
    progress: parseFloat(completionRate),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Calculate Alerts
// ═══════════════════════════════════════════════════════════════════════════
async function calculateAlerts(divisionId, projectIds) {
  if (!projectIds || projectIds.length === 0) {
    return {
      overdue_projects: 0,
      overdue_tasks: 0,
      unassigned_tasks: 0,
      blocked_tasks: 0,
    };
  }

  const { count: overdueProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('id', projectIds)
    .lt('due_date', new Date().toISOString())
    .neq('status', 'completed');

  const { count: overdueTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .lt('due_date', new Date().toISOString())
    .neq('status', 'done');

  const { count: unassignedTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .is('assignee_id', null)
    .neq('status', 'done');

  const { count: blockedTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'blocked');

  return {
    overdue_projects: overdueProjects || 0,
    overdue_tasks: overdueTasks || 0,
    unassigned_tasks: unassignedTasks || 0,
    blocked_tasks: blockedTasks || 0,
  };
}

module.exports = r;

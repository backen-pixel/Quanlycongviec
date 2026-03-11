const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// QUẢN LÝ NHIỆM VỤ THEO KHỐI (DIVISION)
// ═══════════════════════════════════════════════

/**
 * GET /api/divisions/:divisionId/projects-overview
 * Lấy tất cả dự án và nhiệm vụ của Khối
 * Hiển thị: Dự án nào → Công ty nào → Nhiệm vụ nào → Trạng thái
 */
r.get('/:divisionId/projects-overview', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { status, search } = req.query; // filter options

    // 1. Get all projects that have assignments for this division
    let query = supabase
      .from('project_company_assignments')
      .select(`
        id,
        project_id,
        division_unit_id,
        company_unit_id,
        template_set_id,
        assigned_at,
        division:ecosystem_units!project_company_assignments_division_unit_id_fkey(id,name,short_name,code),
        company:ecosystem_units!project_company_assignments_company_unit_id_fkey(id,name,short_name,code),
        template_set:company_template_sets(id,name),
        project:projects(
          id,
          name,
          code,
          status,
          start_date,
          end_date,
          customer_name,
          customer_phone,
          created_at
        )
      `)
      .eq('division_unit_id', divisionId)
      .order('assigned_at', { ascending: false });

    const { data: assignments, error: assignError } = await query;
    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      return res.json({ projects: [] });
    }

    // 2. Get all tasks for these projects
    const projectIds = [...new Set(assignments.map(a => a.project_id))];
    
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select(`
        id,
        project_id,
        title,
        status,
        priority,
        stage,
        assigned_to,
        assignee:users!tasks_assigned_to_fkey(id,full_name,avatar_url),
        due_date,
        completed_at,
        created_at
      `)
      .in('project_id', projectIds)
      .order('created_at');

    if (taskError) throw taskError;

    // 3. Group tasks by project
    const tasksByProject = {};
    (tasks || []).forEach(task => {
      if (!tasksByProject[task.project_id]) {
        tasksByProject[task.project_id] = [];
      }
      tasksByProject[task.project_id].push(task);
    });

    // 4. Build result structure
    const projects = assignments.map(assignment => {
      const projectTasks = tasksByProject[assignment.project_id] || [];
      
      // Calculate stats
      const totalTasks = projectTasks.length;
      const completedTasks = projectTasks.filter(t => t.status === 'done').length;
      const inProgressTasks = projectTasks.filter(t => t.status === 'in-progress').length;
      const pendingTasks = projectTasks.filter(t => t.status === 'pending').length;
      const overdueTasks = projectTasks.filter(t => 
        t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()
      ).length;

      return {
        assignment_id: assignment.id,
        project: assignment.project,
        division: assignment.division,
        company: assignment.company,
        template_set: assignment.template_set,
        assigned_at: assignment.assigned_at,
        tasks: projectTasks,
        stats: {
          total: totalTasks,
          completed: completedTasks,
          in_progress: inProgressTasks,
          pending: pendingTasks,
          overdue: overdueTasks,
          completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        }
      };
    });

    // 5. Apply filters
    let filteredProjects = projects;

    if (status) {
      filteredProjects = filteredProjects.filter(p => p.project.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredProjects = filteredProjects.filter(p => 
        p.project.name?.toLowerCase().includes(searchLower) ||
        p.project.code?.toLowerCase().includes(searchLower) ||
        p.project.customer_name?.toLowerCase().includes(searchLower) ||
        p.company.name?.toLowerCase().includes(searchLower)
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

    // Get all projects for this division
    const { data: assignments } = await supabase
      .from('project_company_assignments')
      .select('project_id')
      .eq('division_unit_id', divisionId);

    if (!assignments || assignments.length === 0) {
      return res.json({
        total: 0,
        by_status: {},
        by_priority: {},
        overdue: 0
      });
    }

    const projectIds = [...new Set(assignments.map(a => a.project_id))];

    // Get all tasks
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, status, priority, due_date')
      .in('project_id', projectIds);

    if (error) throw error;

    // Calculate summary
    const now = new Date();
    const summary = {
      total: tasks.length,
      by_status: {},
      by_priority: {},
      overdue: 0
    };

    tasks.forEach(task => {
      // By status
      summary.by_status[task.status] = (summary.by_status[task.status] || 0) + 1;
      
      // By priority
      summary.by_priority[task.priority] = (summary.by_priority[task.priority] || 0) + 1;
      
      // Overdue
      if (task.status !== 'done' && task.due_date && new Date(task.due_date) < now) {
        summary.overdue++;
      }
    });

    res.json(summary);
  } catch (e) {
    console.error('Get division task summary error:', e);
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

    const { data, error } = await supabase
      .from('project_company_assignments')
      .select(`
        project_id,
        company:ecosystem_units!project_company_assignments_company_unit_id_fkey(id,name,short_name),
        project:projects(id,name,code,status,customer_name)
      `)
      .eq('division_unit_id', divisionId);

    if (error) throw error;

    // Filter active projects
    const activeProjects = (data || [])
      .filter(a => a.project && ['planning', 'in-progress'].includes(a.project.status))
      .map(a => ({
        project_id: a.project_id,
        project_name: a.project.name,
        project_code: a.project.code,
        project_status: a.project.status,
        customer_name: a.project.customer_name,
        company_name: a.company?.name
      }));

    res.json({ projects: activeProjects });
  } catch (e) {
    console.error('Get active projects error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

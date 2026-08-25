const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { fetchAllByIds } = require('../helpers/supabaseFetchAll');
const {
  resolveDivisionProjectIds,
  ACTIVE_PROJECT_STATUSES,
  DONE_PROJECT_STATUSES,
} = require('../helpers/divisionProjectScope');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// DASHBOARD - OVERVIEW BY DIVISION
// ═══════════════════════════════════════════════

/**
 * GET /api/dashboard/by-division
 * Tổng quan theo từng Khối
 * 
 * Logic:
 * 1. Lấy tất cả Khối (divisions)
 * 2. Với mỗi Khối:
 *    - Tìm flows chứa Khối đó (workflow_flow_steps)
 *    - Đếm projects đang dùng flows đó
 *    - Tính stats: total, active, completed
 * 3. Response: Mảng divisions với stats
 */
r.get('/by-division', async (req, res) => {
  try {
    // 1. Lấy tất cả divisions
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

    // 2. Lấy stats cho từng division
    const divisionsWithStats = await Promise.all(
      divisions.map(async (division) => {
        // Dự án của Khối — hợp cả 3 cách liên kết (xem helpers/divisionProjectScope.js).
        // Trước đây chỉ dùng workflow_flow_steps.division_unit_id — cột đó NULL toàn bộ
        // nên mọi thẻ Khối hiện 0 dự án / 0 nhiệm vụ.
        const divProjectIds = await resolveDivisionProjectIds(division.id);

        if (!divProjectIds.length) {
          return {
            ...division,
            stats: {
              total_projects: 0,
              active_projects: 0,
              completed_projects: 0,
              planning_projects: 0,
              in_progress_projects: 0,
              total_tasks: 0,
              completed_tasks: 0,
              in_progress_tasks: 0,
              overdue_tasks: 0
            }
          };
        }

        const projects = await fetchAllByIds({
          table: 'projects', columns: 'id, status', key: 'id', ids: divProjectIds,
        });

        // Status thật: producing/consulting/shipping/installing/contract_signed.
        // Bộ lọc cũ ('planning','in-progress','done') không khớp dòng nào → luôn ra 0.
        const totalProjects = projects.length;
        const activeProjects = projects.filter(p => ACTIVE_PROJECT_STATUSES.includes(p.status)).length;
        const completedProjects = projects.filter(p => DONE_PROJECT_STATUSES.includes(p.status)).length;
        const planningProjects = projects.filter(p => p.status === 'consulting').length;
        const inProgressProjects = projects.filter(p => p.status === 'producing').length;

        // Lấy tasks của các projects này
        const projectIds = projects.map(p => p.id);
        let totalTasks = 0;
        let completedTasks = 0;
        let inProgressTasks = 0;
        let overdueTasks = 0;

        if (projectIds.length > 0) {
          // Phải đọc đủ: ~26,7 task/dự án nên chỉ 37 dự án là vượt ngưỡng cắt 1.000 dòng,
          // mà Khối Sản Xuất có 552 dự án → total_tasks trước đây dính đúng 1.000.
          const tasks = await fetchAllByIds({
            table: 'tasks', columns: 'id, status, due_date', key: 'project_id', ids: projectIds,
          });

          totalTasks = tasks.length;
          completedTasks = tasks.filter(t => t.status === 'done').length;
          // DB dùng 'in_progress' (gạch DƯỚI), không phải 'in-progress'.
          inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

          const now = new Date();
          overdueTasks = tasks.filter(t =>
            t.status !== 'done' && t.due_date && new Date(t.due_date) < now
          ).length;
        }

        return {
          ...division,
          stats: {
            total_projects: totalProjects,
            active_projects: activeProjects,
            completed_projects: completedProjects,
            planning_projects: planningProjects,
            in_progress_projects: inProgressProjects,
            total_tasks: totalTasks,
            completed_tasks: completedTasks,
            in_progress_tasks: inProgressTasks,
            overdue_tasks: overdueTasks,
            completion_rate: totalTasks > 0 
              ? Math.round((completedTasks / totalTasks) * 100) 
              : 0
          }
        };
      })
    );

    res.json({ divisions: divisionsWithStats });

  } catch (e) {
    console.error('Dashboard by division error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/dashboard/division/:divisionId/projects
 * Lấy danh sách dự án của 1 Khối
 */
r.get('/division/:divisionId/projects', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { status } = req.query; // filter by status

    // Tìm flows chứa division
    const { data: flowSteps } = await supabase
      .from('workflow_flow_steps')
      .select('flow_id')
      .eq('division_unit_id', divisionId);

    if (!flowSteps || flowSteps.length === 0) {
      return res.json({ projects: [] });
    }

    const flowIds = [...new Set(flowSteps.map(s => s.flow_id))];

    // Lấy projects
    let query = supabase
      .from('projects')
      .select(`
        id,
        name,
        code,
        status,
        start_date,
        end_date,
        customer_name,
        created_at,
        flow:workflow_flows(id, name)
      `)
      .in('flow_id', flowIds)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: projects, error } = await query;
    if (error) throw error;

    res.json({ projects: projects || [] });

  } catch (e) {
    console.error('Get division projects error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

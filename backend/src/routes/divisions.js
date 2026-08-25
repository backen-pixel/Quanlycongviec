const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { responseCache, invalidateTags } = require('../middleware/responseCache');
const { fetchAllByIds } = require('../helpers/supabaseFetchAll');
const {
  resolveDivisionProjectIds,
  NOT_STARTED_TASK_STATUSES,
  ACTIVE_PROJECT_STATUSES,
} = require('../helpers/divisionProjectScope');

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
 * Lấy tất cả dự án và nhiệm vụ của Khối
 * Logic: Lấy từ projects.flow_id → workflow_flow_steps → lọc division_unit_id
 */
r.get('/:divisionId/projects-overview', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { status, search } = req.query;

    // 1-2. Dự án của Khối — hợp cả 3 cách liên kết (xem resolveDivisionProjectIds).
    const divProjectIds = await resolveDivisionProjectIds(divisionId);
    if (!divProjectIds.length) {
      return res.json({ projects: [] });
    }

    // projects KHÔNG có start_date/end_date/customer_name/customer_phone.
    const projects = (await fetchAllByIds({
      table: 'projects',
      columns: 'id, name, code, status, deadline, flow_id, created_at, flow:workflow_flows(id, name)',
      key: 'id',
      ids: divProjectIds,
    })).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    if (!projects || projects.length === 0) {
      return res.json({ projects: [] });
    }

    // 3. Get tasks for these projects
    const projectIds = projects.map(p => p.id);

    // tasks: cột thật là `assignee_id` (không có `assigned_to`), FK là tasks_assignee_id_fkey,
    // và users dùng `avatar` (không có avatar_url). Phải đọc đủ: ~26,7 task/dự án nên chỉ 37
    // dự án là vượt ngưỡng cắt 1.000 dòng.
    const tasks = await fetchAllByIds({
      table: 'tasks',
      columns: 'id, project_id, title, status, priority, assignee_id,'
        + ' assignee:users!tasks_assignee_id_fkey(id,full_name,avatar),'
        + ' due_date, completed_at, created_at',
      key: 'project_id',
      ids: projectIds,
    });

    // 4. Group tasks by project
    const tasksByProject = {};
    (tasks || []).forEach(task => {
      if (!tasksByProject[task.project_id]) {
        tasksByProject[task.project_id] = [];
      }
      tasksByProject[task.project_id].push(task);
    });

    // 5. Get flow steps for each project to find company info
    const { data: allFlowSteps, error: stepsError } = await supabase
      .from('workflow_flow_steps')
      .select(`
        flow_id,
        division_unit_id,
        company_unit_id,
        order_index,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name,code)
      `)
      .in('flow_id', [...new Set(projects.map((p) => p.flow_id).filter(Boolean))])
      .eq('division_unit_id', divisionId);

    if (stepsError) throw stepsError;

    // Group flow steps by flow_id
    const stepsByFlow = {};
    (allFlowSteps || []).forEach(step => {
      if (!stepsByFlow[step.flow_id]) {
        stepsByFlow[step.flow_id] = [];
      }
      stepsByFlow[step.flow_id].push(step);
    });

    // 6. Build result structure
    const projectsWithData = projects.map(project => {
      const projectTasks = tasksByProject[project.id] || [];
      const flowStep = stepsByFlow[project.flow_id]?.[0]; // Get first step for this division
      
      // Calculate stats
      const totalTasks = projectTasks.length;
      const completedTasks = projectTasks.filter(t => t.status === 'done').length;
      // DB dùng 'in_progress' (gạch DƯỚI); 'todo' cũng là chưa bắt đầu.
      const inProgressTasks = projectTasks.filter(t => t.status === 'in_progress').length;
      const pendingTasks = projectTasks.filter(t => NOT_STARTED_TASK_STATUSES.includes(t.status)).length;
      const overdueTasks = projectTasks.filter(t => 
        t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()
      ).length;

      return {
        assignment_id: project.id, // Use project.id as fallback
        project: {
          id: project.id,
          name: project.name,
          code: project.code,
          status: project.status,
          // projects KHÔNG có start_date/end_date/customer_name/customer_phone —
          // trước đây 4 field này luôn undefined.
          deadline: project.deadline,
          created_at: project.created_at
        },
        division: flowStep?.division || { id: divisionId, name: 'N/A' },
        company: flowStep?.company || null,
        template_set: null,
        assigned_at: project.created_at,
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

    // Dự án của Khối — hợp cả 3 cách liên kết (xem resolveDivisionProjectIds).
    const divProjectIds = await resolveDivisionProjectIds(divisionId);
    if (!divProjectIds.length) {
      return res.json({
        total: 0,
        by_status: {},
        by_priority: {},
        overdue: 0
      });
    }
    const projects = divProjectIds.map((id) => ({ id }));

    if (!projects || projects.length === 0) {
      return res.json({
        total: 0,
        by_status: {},
        by_priority: {},
        overdue: 0
      });
    }

    const projectIds = projects.map(p => p.id);

    // Endpoint này chỉ để ĐẾM, nên bị cắt 1.000 dòng là sai hoàn toàn: `total` dính đúng
    // 1.000 và mọi ô by_status/by_priority bị hụt theo. ~26,7 task/dự án → chỉ 37 dự án
    // là vượt ngưỡng, mà Khối Sản Xuất có tới 484+ dự án.
    const tasks = await fetchAllByIds({
      table: 'tasks',
      columns: 'id, status, priority, due_date',
      key: 'project_id',
      ids: projectIds,
    });

    // Calculate summary
    const now = new Date();
    const summary = {
      total: tasks?.length || 0,
      by_status: {},
      by_priority: {},
      overdue: 0
    };

    (tasks || []).forEach(task => {
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

    // Get flows containing this division
    const { data: flowSteps } = await supabase
      .from('workflow_flow_steps')
      .select('flow_id, company_unit_id')
      .eq('division_unit_id', divisionId);

    const flowIds = [...new Set((flowSteps || []).map(s => s.flow_id))];

    // Also get projects directly assigned to this division
    const { data: directAssignments } = await supabase
      .from('project_company_assignments')
      .select('project_id')
      .eq('division_unit_id', divisionId);
    const directProjectIds = [...new Set((directAssignments || []).map(a => a.project_id))];

    // Build project query — combine flow-based + direct assignments
    let allProjectIds = new Set(directProjectIds);

    if (flowIds.length > 0) {
      let flowProjectQuery = supabase
        .from('projects')
        .select('id')
        .in('flow_id', flowIds);
      if (company_id) flowProjectQuery = flowProjectQuery.eq('company_id', company_id);
      const { data: flowProjects } = await flowProjectQuery;
      (flowProjects || []).forEach(p => allProjectIds.add(p.id));
    }

    if (allProjectIds.size === 0) {
      return res.json({
        stats: { projects: 0, active: 0, tasks: 0, members: 0, overdue: 0, completed: 0 },
        projects: [],
        tasks: [],
        activities: [],
        companies,
        employees: []
      });
    }

    // Load full project data
    let projectQuery = supabase
      .from('projects')
      .select(`
        id, name, code, status, start_date, end_date,
        estimated_value, customer_name, created_at, flow_id, company_id,
        company:companies(id, name, short_name)
      `)
      .in('id', [...allProjectIds])
      .order('created_at', { ascending: false })
      .limit(50);

    // Apply company filter using companies.id (not ecosystem_unit id)
    if (company_id) {
      projectQuery = projectQuery.eq('company_id', company_id);
    }

    const { data: projects } = await projectQuery;

    const projectIds = (projects || []).map(p => p.id);

    // Get tasks — projectIds bị chặn ở .limit(50) phía trên, nhưng 50 > ngưỡng 37 dự án
    // (~26,7 task/dự án ≈ 1.335 dòng) nên vẫn bị cắt. Cái chặn đó được đặt cho độ dài
    // request, không chống được giới hạn 1.000 dòng.
    const tasks = await fetchAllByIds({
      table: 'tasks',
      columns: 'id, title, status, priority, project_id, assignee_id, due_date',
      key: 'project_id',
      ids: projectIds,
    });

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

    const allTasks = tasks || [];
    const stats = {
      projects: (projects || []).length,
      active: (projects || []).filter(p => !['completed', 'warranty', 'cancelled'].includes(p.status)).length,
      tasks: allTasks.length,
      members: employees.length,
      overdue: allTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length,
      completed: allTasks.filter(t => t.status === 'done').length
    };

    res.json({
      stats,
      projects: projects || [],
      tasks: allTasks,
      activities: [],
      companies,
      employees
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

    // Get flows containing this division
    const { data: flowSteps } = await supabase
      .from('workflow_flow_steps')
      .select('flow_id, company_unit_id, company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name)')
      .eq('division_unit_id', divisionId);

    // Dự án của Khối — hợp cả 3 cách liên kết (xem helpers/divisionProjectScope.js).
    const divProjectIds = await resolveDivisionProjectIds(divisionId);
    if (!divProjectIds.length) {
      return res.json({ projects: [] });
    }

    // projects KHÔNG có customer_name; status thật là producing/consulting/… nên bộ lọc
    // ['planning','in-progress'] cũ không khớp dòng nào.
    const data = await fetchAllByIds({
      table: 'projects',
      columns: 'id, name, code, status, flow_id',
      key: 'id',
      ids: divProjectIds,
      tune: (q) => q.in('status', ACTIVE_PROJECT_STATUSES),
    });

    // Map company info from flow steps
    const stepsByFlow = {};
    flowSteps.forEach(step => {
      if (!stepsByFlow[step.flow_id]) {
        stepsByFlow[step.flow_id] = step;
      }
    });

    const activeProjects = (data || []).map(p => ({
      project_id: p.id,
      project_name: p.name,
      project_code: p.code,
      project_status: p.status,
      customer_name: p.customer_name,
      company_name: stepsByFlow[p.flow_id]?.company?.name || null
    }));

    res.json({ projects: activeProjects });
  } catch (e) {
    console.error('Get active projects error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

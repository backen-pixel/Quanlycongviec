const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { generateStepTasks } = require('../helpers/generateFlowTasks');
let autoFlow;
try { autoFlow = require('../helpers/autoFlow'); } catch (e) { autoFlow = null; }
let stageFlow;
try { stageFlow = require('../helpers/stageFlow'); } catch (e) { stageFlow = null; }
const { requirePermission, getAccessibleUnits, checkPermission } = require('../middleware/newPermission');

const r = Router();
r.use(auth);

// ─── HELPER: Get user's company_id ──
async function getUserCompanyId(userId) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('department_id, departments(company_id)')
      .eq('id', userId)
      .single();
    
    return user?.departments?.company_id || null;
  } catch (e) {
    console.warn('Get user company_id error:', e.message);
    return null;
  }
}

// ─── HELPER: Get all child ecosystem units (recursive) ──
async function getAllChildUnits(unitId) {
  try {
    const allIds = [unitId];
    let queue = [unitId];
    
    while (queue.length > 0) {
      const { data: children } = await supabase
        .from('ecosystem_units')
        .select('id')
        .in('parent_id', queue);
      
      const childIds = (children || []).map(c => c.id);
      allIds.push(...childIds);
      queue = childIds;
    }
    
    return allIds;
  } catch (e) {
    console.warn('Get child units error:', e.message);
    return [unitId];
  }
}

// ─── HELPER: Create notification ──
async function createNotification(req, userId, type, title, message, entityType, entityId) {
  if (!userId || userId === req.user.userId) return;
  const { data } = await supabase.from('notifications').insert({
    user_id: userId, type, title, message, entity_type: entityType, entity_id: entityId,
  }).select().single();
  const pushFn = req.app.get('pushNotification');
  if (pushFn && data) pushFn(userId, data);
  return data;
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId) {
  const unique = [...new Set(userIds.filter(id => id && id !== req.user.userId))];
  for (const uid of unique) await createNotification(req, uid, type, title, message, entityType, entityId);
}

async function logActivity(userId, action, entityType, entityId, description, oldValues, newValues) {
  await supabase.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, description, old_values: oldValues, new_values: newValues });
}

// ─── CHECK PENDING APPROVALS ──
r.get('/pending-approvals', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { project_ids } = req.query;
    if (!project_ids) return res.json({ approvals: {} });
    const ids = project_ids.split(',').filter(Boolean);
    if (!ids.length) return res.json({ approvals: {} });

    // Query all approval_request notifications
    const { data: notifs } = await supabase.from('notifications')
      .select('id,metadata')
      .eq('type', 'system')
      .order('created_at', { ascending: false })
      .limit(200);

    const approvals = {};
    (notifs || []).forEach(n => {
      if (n.metadata?.type === 'approval_request' && n.metadata?.status === 'pending' && n.metadata?.project_id && ids.includes(n.metadata.project_id)) {
        approvals[n.metadata.project_id] = true;
      }
    });
    res.json({ approvals });
  } catch (e) { console.error(e); res.json({ approvals: {} }); }
});

// ─── LIST PROJECTS ──
r.get('/', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { status, search, stage_slug, page = 1, limit = 50, company_id, division_id } = req.query;
    const userId = req.user.userId;
    
    // Check permission
    const canViewAll = await checkPermission(userId, 'projects', 'all_companies');
    
    let q = supabase.from('projects').select(`
      *, customers(id,full_name,phone,email,city),
      company:companies(id,name,short_name,division_unit_id),
      current_stage:workflow_stages(id,name,slug,color,icon),
      sales_person:users!projects_sales_person_id_fkey(id,full_name),
      designer:users!projects_designer_id_fkey(id,full_name),
      project_manager:users!projects_project_manager_id_fkey(id,full_name)
    `, { count: 'exact' });

    if (status && status !== 'all') q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    // Filter by stage slug
    if (stage_slug) {
      const stMap = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };
      const mappedStatus = stMap[stage_slug];
      if (mappedStatus) q = q.eq('status', mappedStatus);
    }

    // Filter by company_id
    if (company_id && company_id !== 'all') {
      q = q.eq('company_id', company_id);
    }

    // Filter by division_id (get all companies in division, then filter)
    if (division_id && division_id !== 'all' && !company_id) {
      const { data: divCompanies } = await supabase
        .from('companies')
        .select('id')
        .eq('division_unit_id', division_id);
      const companyIds = (divCompanies || []).map(c => c.id);
      if (companyIds.length > 0) {
        q = q.in('company_id', companyIds);
      } else {
        // No companies in division → return empty
        return res.json({ projects: [], total: 0, page: +page, totalPages: 0 });
      }
    }

    // ── PERMISSION-BASED FILTERING (NEW LOGIC) ──
    // Admin/Manager/Director → bypass, see all
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    const isPrivileged = ['admin', 'manager', 'director'].includes(userData?.role);
    
    if (!canViewAll && !isPrivileged) {
      // Get projects where user is assigned to tasks
      const { data: assignedTasks } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('assignee_id', userId);
      
      const assignedProjectIds = [...new Set((assignedTasks || []).map(t => t.project_id).filter(Boolean))];
      
      // Get accessible units using new middleware
      const accessibleUnits = await getAccessibleUnits(userId);
      
      let companyIds = [];
      if (accessibleUnits.length > 0) {
        // Get company_ids from accessible units
        const { data: units } = await supabase
          .from('ecosystem_units')
          .select('company_id')
          .in('id', accessibleUnits)
          .not('company_id', 'is', null);
        
        companyIds = [...new Set((units || []).map(u => u.company_id).filter(Boolean))];
      }
      
      // Build combined filter:
      // 1. Projects in accessible companies (if any)
      // 2. OR projects where user is team member
      // 3. OR projects where user has assigned tasks
      const teamFilter = `created_by.eq.${userId},responsible_person_id.eq.${userId},sales_person_id.eq.${userId},designer_id.eq.${userId},project_manager_id.eq.${userId}`;
      
      if (companyIds.length > 0 && assignedProjectIds.length > 0) {
        // Has both company access AND assigned tasks
        // Show: company projects OR team projects OR assigned projects
        const allProjectIds = assignedProjectIds;
        q = q.or(`company_id.in.(${companyIds.join(',')}),${teamFilter},id.in.(${allProjectIds.join(',')})`);
      } else if (companyIds.length > 0) {
        // Has company access but no assigned tasks
        q = q.or(`company_id.in.(${companyIds.join(',')}),${teamFilter}`);
      } else if (assignedProjectIds.length > 0) {
        // No company access but has assigned tasks
        q = q.or(`${teamFilter},id.in.(${assignedProjectIds.join(',')})`);
      } else {
        // No company access, no assigned tasks → only team projects
        q = q.or(teamFilter);
      }
    }

    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p-1)*l, p*l-1);
    const { data, count, error } = await q;
    if (error) throw error;

    res.json({ projects: data, total: count, page: p, totalPages: Math.ceil((count||0)/l) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── GET PROJECT DETAIL ──
r.get('/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select(`
      *, customers(*),
      company:companies(id,name,short_name),
      current_stage:workflow_stages(*),
      sales_person:users!projects_sales_person_id_fkey(id,full_name,avatar,email),
      designer:users!projects_designer_id_fkey(id,full_name,avatar,email),
      project_manager:users!projects_project_manager_id_fkey(id,full_name,avatar,email),
      supervisor:users!projects_supervisor_id_fkey(id,full_name,avatar,email),
      tasks(*, assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,slug,color,order_index), checklists:task_checklists(id,title,is_completed,order_index,notes,attachments))
    `).eq('id', req.params.id).single();
    if (error) throw error;

    // Try to load stage persons (may fail if migration 07 not run)
    let stagePersons = {};
    try {
      const { data: sp } = await supabase.from('projects').select(`
        consulting_person:users!projects_consulting_person_id_fkey(id,full_name,avatar),
        design_person:users!projects_design_person_id_fkey(id,full_name,avatar),
        quotation_person:users!projects_quotation_person_id_fkey(id,full_name,avatar),
        contract_person:users!projects_contract_person_id_fkey(id,full_name,avatar),
        production_person:users!projects_production_person_id_fkey(id,full_name,avatar),
        shipping_person:users!projects_shipping_person_id_fkey(id,full_name,avatar),
        installation_person:users!projects_installation_person_id_fkey(id,full_name,avatar),
        care_person:users!projects_care_person_id_fkey(id,full_name,avatar)
      `).eq('id', req.params.id).single();
      if (sp) stagePersons = sp;
    } catch { /* migration 07 not run yet */ }

    // Load flow info (if project has flow_id)
    let flowInfo = null;
    if (data.flow_id) {
      try {
        const { data: flow } = await supabase.from('workflow_flows').select(`
          *,
          steps:workflow_flow_steps(
            *,
            stage:workflow_stages(id,name,slug,color),
            division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name),
            company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name)
          )
        `).eq('id', data.flow_id).single();
        if (flow) {
          flowInfo = flow;
          // Sort steps by order_index
          if (flowInfo.steps) flowInfo.steps.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        }
      } catch (e) { console.warn('Failed to load flow:', e.message); }
    }

    // Load flow assignments (company + template set per step)
    let flowAssignments = [];
    if (data.id) {
      try {
        const { data: assignments } = await supabase.from('project_company_assignments').select(`
          *,
          division:ecosystem_units!project_company_assignments_division_unit_id_fkey(id,name,short_name),
          company:ecosystem_units!project_company_assignments_company_unit_id_fkey(id,name,short_name),
          template_set:company_template_sets(id,name,description,is_default)
        `).eq('project_id', data.id).order('order_index');
        flowAssignments = assignments || [];

        // Load ALL project tasks once (instead of per-assignment)
        const { data: allTasks } = await supabase.from('tasks').select(`
          *,
          assignee:users!tasks_assignee_id_fkey(id,full_name,avatar,email),
          stage:workflow_stages(id,name,slug,color),
          checklists:task_checklists(id,title,is_completed,order_index,notes,attachments)
        `).eq('project_id', data.id)
          .eq('task_type', 'project')
          .order('order_index');

        // Build map: flow_step_id → division_unit_id (from flow steps)
        let stepToDivMap = {};
        if (data.flow_id) {
          const { data: flowSteps } = await supabase.from('workflow_flow_steps')
            .select('id, division_unit_id')
            .eq('flow_id', data.flow_id);
          for (const fs of (flowSteps || [])) {
            stepToDivMap[fs.id] = fs.division_unit_id;
          }
        }

        // Assign tasks to each assignment by matching:
        // 1. task.metadata.flow_step_id → stepToDivMap → division_unit_id === assignment.division_unit_id
        // 2. OR task.metadata.template_set_id === assignment.template_set_id
        const usedTaskIds = new Set();
        for (const assignment of flowAssignments) {
          const assignmentTasks = (allTasks || []).filter(t => {
            const meta = t.metadata || {};
            // Match by flow_step → division
            if (meta.flow_step_id && stepToDivMap[meta.flow_step_id] === assignment.division_unit_id) return true;
            // Match by template_set
            if (meta.template_set_id && meta.template_set_id === assignment.template_set_id) return true;
            return false;
          });

          assignment.tasks = assignmentTasks;
          assignmentTasks.forEach(t => usedTaskIds.add(t.id));

          // Calculate progress
          const total = assignmentTasks.length;
          const done = assignmentTasks.filter(t => t.status === 'done').length;
          assignment.tasks_total = total;
          assignment.tasks_completed = done;
          assignment.progress = total > 0 ? Math.round((done / total) * 100) : 0;
        }
      } catch (e) { console.warn('Failed to load flow assignments:', e.message); }
    }

    // Comments (trao đổi) — may fail if migration 03 not run
    let comments = [], activities = [], transitions = [];
    try {
      const r1 = await supabase.from('project_comments').select('*, user:users(id,full_name,avatar)').eq('project_id', req.params.id).order('created_at', { ascending: false });
      comments = r1.data || [];
    } catch { }

    try {
      const r2 = await supabase.from('activity_logs').select('*, user:users(id,full_name)').eq('entity_type', 'project').eq('entity_id', req.params.id).order('created_at', { ascending: false }).limit(30);
      activities = r2.data || [];
    } catch { }

    try {
      const r3 = await supabase.from('stage_transitions')
        .select('*, from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(name), to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(name), user:users(id,full_name)')
        .eq('project_id', req.params.id).order('created_at', { ascending: false });
      transitions = r3.data || [];
    } catch { }

    // Check advance
    let canAdvance = false;
    let stageTasksDone = 0, stageTasksTotal = 0;
    if (data.current_stage_id) {
      const stageTasks = (data.tasks || []).filter(t => t.stage_id === data.current_stage_id);
      stageTasksTotal = stageTasks.length;
      stageTasksDone = stageTasks.filter(t => t.status === 'done').length;
      canAdvance = stageTasksTotal > 0 && stageTasksDone === stageTasksTotal;
    }

    // Load workflow lines
    let workflowLines = [];
    try {
      const { data: wl } = await supabase.from('project_workflow_lines')
        .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)')
        .eq('project_id', req.params.id).order('order_index');
      workflowLines = wl || [];
    } catch { }

    res.json({
      project: {
        ...data,
        ...stagePersons,
        flow: flowInfo,
        flowAssignments,
        comments: comments || [],
        activities: activities || [],
        transitions: transitions || [],
        workflowLines,
        canAdvance,
        stageTasksDone,
        stageTasksTotal,
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE PROJECT ──
r.post('/', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body;

    // Auto-generate code (use MAX to avoid duplicates)
    const yr = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code').like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) || 0 : 0;
    const code = `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;

    // Get first stage
    const { data: stage } = await supabase.from('workflow_stages').select('id').eq('slug','consulting').single();

    const { data, error } = await supabase.from('projects').insert({
      code,
      name: b.name,
      description: b.description || null,
      customer_id: b.customer_id,
      company_id: b.company_id || null,
      status: 'consulting',
      current_stage_id: stage?.id || null,
      kitchen_type: b.kitchen_type || null,
      material: b.material || null,
      install_address: b.install_address || null,
      estimated_value: b.estimated_value || null,
      priority: b.priority || 'medium',
      sales_person_id: b.sales_person_id || null,
      designer_id: b.designer_id || null,
      project_manager_id: b.project_manager_id || null,
      // Per-stage responsible persons
      consulting_person_id: b.consulting_person_id || b.sales_person_id || null,
      design_person_id: b.design_person_id || b.designer_id || null,
      quotation_person_id: b.quotation_person_id || b.sales_person_id || null,
      contract_person_id: b.contract_person_id || b.sales_person_id || null,
      production_person_id: b.production_person_id || null,
      shipping_person_id: b.shipping_person_id || null,
      installation_person_id: b.installation_person_id || null,
      care_person_id: b.care_person_id || null,
      // Quotation files
      quotation_files: b.quotation_files || [],
      consult_date: new Date().toISOString(),
    }).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single();
    if (error) throw error;

    // Activity log
    await logActivity(req.user.userId, 'created', 'project', data.id, `Tạo dự án ${code}: ${b.name}`);

    // ── THÔNG BÁO cho tất cả người được phân công ──
    const allAssignees = [
      { id: b.sales_person_id, role: 'Sales' },
      { id: b.designer_id, role: 'Thiết kế' },
      { id: b.project_manager_id, role: 'Quản lý DA' },
      { id: b.consulting_person_id, role: 'Tư vấn' },
      { id: b.design_person_id, role: 'Thiết kế' },
      { id: b.quotation_person_id, role: 'Báo giá' },
      { id: b.contract_person_id, role: 'Hợp đồng' },
      { id: b.production_person_id, role: 'Sản xuất' },
      { id: b.shipping_person_id, role: 'Vận chuyển' },
      { id: b.installation_person_id, role: 'Lắp đặt' },
      { id: b.care_person_id, role: 'CSKH' },
    ];
    const notifiedIds = new Set();
    for (const a of allAssignees) {
      if (a.id && !notifiedIds.has(a.id)) {
        notifiedIds.add(a.id);
        await createNotification(req, a.id, 'project_assigned',
          '📋 Dự án mới', `Bạn được phân công vai trò ${a.role} cho dự án ${code}: ${b.name}`, 'project', data.id);
      }
    }

    // ── CREATE WORKFLOW LINES from payload ──
    let insertedLines = [];
    if (b.workflow_lines?.length) {
      try {
        const { data: wlData } = await supabase.from('project_workflow_lines').insert(
          b.workflow_lines.map((line, i) => ({
            project_id: data.id,
            stage_slug: line.stage_slug,
            label: line.label || line.stage_slug,
            assignee_id: line.assignee_id || null,
            description: line.description || null,
            order_index: line.order_index ?? i,
            color: line.color || null,
          }))
        ).select();
        insertedLines = wlData || [];
      } catch (e) { console.warn('Workflow lines insert failed:', e.message); }
    }

    // ── AUTO-CREATE TASKS PER WORKFLOW LINE for consulting stage ──
    // If workflow lines exist, create template tasks for EACH consulting line
    // If no lines, use legacy single-person mode
    const consultingPersonId = b.consulting_person_id || b.sales_person_id || null;
    if (stage?.id) {
      const { data: templates } = await supabase.from('task_templates')
        .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

      const defaultConsultTasks = [
        { title: 'Tiếp nhận yêu cầu khách hàng', priority: 'high' },
        { title: 'Khảo sát hiện trạng', priority: 'medium' },
        { title: 'Tư vấn phương án', priority: 'medium' },
      ];

      // Find consulting lines from inserted workflow lines
      const consultingLines = insertedLines.filter(l => l.stage_slug === 'consulting');

      if (consultingLines.length > 0) {
        // Create tasks for EACH consulting line
        for (const line of consultingLines) {
          const lineAssignee = line.assignee_id || consultingPersonId;
          let lineTasks = [];

          if (templates?.length) {
            const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
              project_id: data.id, stage_id: stage.id, title: `${t.title} — ${line.label}`,
              description: t.description || null, priority: t.priority || 'medium', status: 'pending',
              created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
              estimated_hours: t.estimated_hours || null, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            lineTasks = ins || [];
            for (const tmpl of templates) {
              if (tmpl.checklist_items?.length) {
                const newTask = lineTasks.find(t => t.title === `${tmpl.title} — ${line.label}`);
                if (newTask) {
                  await supabase.from('task_checklists').insert(
                    tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                  );
                }
              }
            }
          } else {
            const { data: ins } = await supabase.from('tasks').insert(defaultConsultTasks.map((t, i) => ({
              project_id: data.id, stage_id: stage.id, title: `${t.title} — ${line.label}`,
              priority: t.priority, status: 'pending', created_by_id: req.user.userId,
              order_index: i, assignee_id: lineAssignee, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            lineTasks = ins || [];
          }

          if (lineAssignee && lineTasks.length) {
            await createNotification(req, lineAssignee, 'task_assigned',
              '📌 Nhiệm vụ tự động', `${lineTasks.length} NV "${line.label}" giai đoạn Tư vấn — DA ${code}`, 'project', data.id);
          }
        }
      } else {
        // Legacy: single person, no workflow lines
        let createdTasks = [];
        if (templates?.length) {
          const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
            project_id: data.id, stage_id: stage.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: consultingPersonId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          createdTasks = ins || [];
          for (const tmpl of templates) {
            if (tmpl.checklist_items?.length) {
              const newTask = createdTasks.find(t => t.title === tmpl.title);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        } else {
          const { data: ins } = await supabase.from('tasks').insert(defaultConsultTasks.map((t, i) => ({
            project_id: data.id, stage_id: stage.id, title: t.title,
            priority: t.priority, status: 'pending', created_by_id: req.user.userId,
            order_index: i, assignee_id: consultingPersonId, task_type: 'project',
          }))).select();
          createdTasks = ins || [];
        }
        if (consultingPersonId && createdTasks.length) {
          await createNotification(req, consultingPersonId, 'task_assigned',
            '📌 Nhiệm vụ tự động', `${createdTasks.length} NV giai đoạn Tư vấn — DA ${code}`, 'project', data.id);
        }
      }
    }

    // ── AUTO-CREATE TASKS FOR ALL REMAINING STAGES ──
    // After consulting tasks, generate tasks for all other stages too
    const allStageSlugs = ['design', 'quotation', 'contract', 'production', 'shipping', 'installation', 'customer-care'];
    const stagePersonMap = {
      design: b.design_person_id || b.designer_id,
      quotation: b.quotation_person_id,
      contract: b.contract_person_id,
      production: b.production_person_id,
      shipping: b.shipping_person_id,
      installation: b.installation_person_id,
      'customer-care': b.care_person_id,
    };

    for (const slug of allStageSlugs) {
      try {
        // Find stage by slug (prefer exact match, fallback to pattern)
        let { data: stg } = await supabase.from('workflow_stages')
          .select('id, name, slug').eq('slug', slug).single();
        if (!stg) {
          // Try with company suffix
          const { data: stgs } = await supabase.from('workflow_stages')
            .select('id, name, slug').ilike('slug', slug + '%').limit(1);
          stg = stgs?.[0];
        }
        if (!stg) continue;

        // Check if tasks already exist for this stage in this project
        const { data: existingTasks } = await supabase.from('tasks')
          .select('id').eq('project_id', data.id).eq('stage_id', stg.id).limit(1);
        if (existingTasks?.length) continue; // Already have tasks

        const assigneeId = stagePersonMap[slug] || null;

        // Load templates
        const { data: stgTemplates } = await supabase.from('task_templates')
          .select('*').eq('stage_id', stg.id).eq('is_active', true).order('order_index');

        if (!stgTemplates?.length) continue; // No templates for this stage

        // Find workflow lines for this stage
        const stgLines = insertedLines.filter(l => l.stage_slug === slug);

        if (stgLines.length > 0) {
          for (const line of stgLines) {
            const lineAssignee = line.assignee_id || assigneeId;
            const { data: ins } = await supabase.from('tasks').insert(stgTemplates.map((t, i) => ({
              project_id: data.id, stage_id: stg.id, title: `${t.title} — ${line.label}`,
              description: t.description || null, priority: t.priority || 'medium', status: 'pending',
              created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
              estimated_hours: t.estimated_hours || null, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            // Create checklists
            for (const tmpl of stgTemplates) {
              if (tmpl.checklist_items?.length) {
                const newTask = (ins || []).find(t2 => t2.title === `${tmpl.title} — ${line.label}`);
                if (newTask) {
                  await supabase.from('task_checklists').insert(
                    tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                  );
                }
              }
            }
          }
        } else {
          // No workflow lines — create tasks directly
          const { data: ins } = await supabase.from('tasks').insert(stgTemplates.map((t, i) => ({
            project_id: data.id, stage_id: stg.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: assigneeId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          // Create checklists
          for (const tmpl of stgTemplates) {
            if (tmpl.checklist_items?.length) {
              const newTask = (ins || []).find(t2 => t2.title === tmpl.title);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        }
      } catch (e) { console.warn(`Auto-create tasks for ${slug} failed:`, e.message); }
    }

    res.status(201).json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE PROJECT WITH FLOW (new flow-based) ──
r.post('/create-with-flow', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Tên dự án là bắt buộc' });
    if (!b.customer_id) return res.status(400).json({ error: 'Chọn khách hàng' });

    // Auto-generate code (use MAX to avoid duplicates)
    const yr = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code').like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) || 0 : 0;
    const code = `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;

    // Get first stage for initial status
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').single();

    // Create project
    let { data: project, error: projErr } = await supabase.from('projects').insert({
      code,
      name: b.name.trim(),
      description: b.description || null,
      customer_id: b.customer_id,
      company_id: b.company_id || null,
      flow_id: b.flow_id || null,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      install_address: b.install_address || null,
      estimated_value: b.estimated_value || null,
      priority: b.priority || 'medium',
      supervisor_id: b.supervisor_id || null,
      sales_person_id: b.sales_person_id || null,
      project_manager_id: b.project_manager_id || null,
      deadline: b.deadline || null,
      consult_date: new Date().toISOString(),
    }).select('*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)').single();
    // If deadline column doesn't exist yet, retry without it
    if (projErr && projErr.message?.includes('column')) {
      const retryInsert = { code, name: b.name.trim(), description: b.description || null, customer_id: b.customer_id, company_id: b.company_id || null, flow_id: b.flow_id || null, status: 'consulting', current_stage_id: firstStage?.id || null, install_address: b.install_address || null, estimated_value: b.estimated_value || null, priority: b.priority || 'medium', supervisor_id: b.supervisor_id || null, sales_person_id: b.sales_person_id || null, project_manager_id: b.project_manager_id || null, consult_date: new Date().toISOString() };
      const r2 = await supabase.from('projects').insert(retryInsert).select('*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)').single();
      project = r2.data; projErr = r2.error;
    }
    if (projErr) throw projErr;

    const projectId = project.id;
    const projectStart = new Date();
    let allCreatedTasks = [];

    // ── Handle added tasks (insert into template before generating project tasks) ──
    const tempIdToRealIdMap = {}; // Map temp IDs to real task IDs for assignment lookup
    if (b.added_tasks?.length) {
      for (const addedTask of b.added_tasks) {
        try {
          const { data: newTemplateTask, error: addErr } = await supabase
            .from('company_template_tasks')
            .insert({
              template_set_id: addedTask.template_set_id,
              stage_id: addedTask.stage_id,
              title: addedTask.title,
              description: addedTask.description || null,
              order_index: addedTask.order_index || 9999,
            })
            .select()
            .single();
          
          if (addErr) {
            console.error('Failed to insert added task:', addErr);
            continue;
          }
          
          // Map temp_id to real task id for assignment lookup
          if (addedTask._temp_id && newTemplateTask) {
            tempIdToRealIdMap[addedTask._temp_id] = newTemplateTask.id;
          }
        } catch (e) {
          console.error('Error adding task to template:', e);
        }
      }
    }

    // ── Process flow steps: assignments + process tasks + template tasks ──
    // b.flow_assignments = [{ division_unit_id, company_unit_id, template_set_id, order_index }]
    if (b.flow_assignments?.length) {
      for (const assignment of b.flow_assignments) {
        // Save project_company_assignment
        const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
        await supabase.from('project_company_assignments').upsert({
          project_id: projectId,
          division_unit_id: assignment.division_unit_id,
          company_unit_id: assignment.company_unit_id,
          template_set_id: opt(assignment.template_set_id),
          order_index: assignment.order_index || 0,
          status: assignment.order_index === 0 ? 'in_progress' : 'pending',
          started_at: assignment.order_index === 0 ? new Date().toISOString() : null,
        }, { onConflict: 'project_id,division_unit_id' });

        // Find flow step ID from flow_id + division_unit_id
        const { data: flowStep } = await supabase.from('workflow_flow_steps')
          .select('id').eq('flow_id', b.flow_id).eq('division_unit_id', assignment.division_unit_id).single();

        if (flowStep) {
          // Use shared helper — same logic as convert-to-deal
          const stepTasks = await generateStepTasks({
            projectId,
            flowStepId: flowStep.id,
            templateSetId: assignment.template_set_id || null,
            userId: req.user.userId,
            taskAssignments: b.task_assignments || {},
          });
          allCreatedTasks.push(...stepTasks);
        }
      }
    }

    // ── DEAL INTEGRATION: Auto-complete KD tasks + copy documents + link deal ──
    if (b.deal_id) {
      try {
        // 1. Link deal → project
        await supabase.from('crm_leads').update({ project_id: projectId }).eq('id', b.deal_id);

        // 2. Auto-complete consulting tasks (Khối KD đã hoàn thành)
        const kdSlugs = ['consulting', 'design', 'quotation', 'contract'];
        const { data: kdStages } = await supabase.from('workflow_stages')
          .select('id, slug').in('slug', kdSlugs).eq('is_active', true);
        const kdStageIds = (kdStages || []).map(s => s.id);
        
        if (kdStageIds.length) {
          await supabase.from('tasks')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('project_id', projectId)
            .in('stage_id', kdStageIds);
          console.log(`[deal] Auto-completed ${kdSlugs.join(',')} tasks for project ${projectId}`);
        }

        // Also complete tasks with metadata matching KD process names
        const { data: allTasks } = await supabase.from('tasks')
          .select('id, metadata').eq('project_id', projectId).eq('status', 'pending');
        const kdProcessNames = ['Tiếp nhận & Tư vấn', 'Thiết kế', 'Báo giá & Hợp đồng'];
        const kdTaskIds = (allTasks || [])
          .filter(t => t.metadata?.process_name && kdProcessNames.includes(t.metadata.process_name))
          .map(t => t.id);
        if (kdTaskIds.length) {
          await supabase.from('tasks')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .in('id', kdTaskIds);
          console.log(`[deal] Auto-completed ${kdTaskIds.length} KD process tasks`);
        }

        // 3. Copy documents from deal/lead to project (store as quotation_files JSON)
        const { data: dealDocs } = await supabase.from('lead_documents')
          .select('*').eq('lead_id', b.deal_id);
        if (dealDocs?.length) {
          const docFiles = dealDocs
            .filter(doc => doc.file_url)
            .map(doc => ({
              file_url: doc.file_url,
              file_name: doc.file_name || doc.name,
              file_size: doc.file_size,
              mime_type: doc.mime_type,
              description: `Từ ${doc.doc_type || 'Deal'}: ${doc.name || doc.file_name}`,
            }));
          if (docFiles.length) {
            // Append to existing quotation_files
            const { data: proj } = await supabase.from('projects').select('quotation_files').eq('id', projectId).single();
            const existing = proj?.quotation_files || [];
            await supabase.from('projects').update({ quotation_files: [...existing, ...docFiles] }).eq('id', projectId);
            console.log(`[deal] Copied ${docFiles.length} documents to project quotation_files`);
          }
        }

        // 4. Log activity
        await supabase.from('crm_activities').insert({
          lead_id: b.deal_id, type: 'note',
          title: '📋 Dự án đã tạo',
          description: `Dự án ${code} đã được tạo từ Deal với ${allCreatedTasks.length} nhiệm vụ`,
          created_by: req.user.userId,
        }).catch(() => {});
      } catch (dealErr) {
        console.error('[deal] Integration error:', dealErr.message);
      }
    }

    // Activity log
    await logActivity(req.user.userId, 'created', 'project', projectId,
      `Tạo dự án ${code}: ${b.name}${b.flow_id ? ' (theo luồng)' : ''}${b.deal_id ? ' (từ Deal)' : ''}`);

    res.status(201).json({
      project,
      tasks_created: allCreatedTasks.length,
    });
  } catch (e) { console.error('create-with-flow error:', e); res.status(500).json({ error: e.message }); }
});

// ─── UPDATE PROJECT ──
r.put('/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name','description','status','customer_id','kitchen_type','material','install_address','estimated_value','final_value','priority','sales_person_id','designer_id','project_manager_id','design_deadline','production_start_date','install_date','consulting_person_id','design_person_id','quotation_person_id','contract_person_id','production_person_id','shipping_person_id','installation_person_id','care_person_id','quotation_files','deadline','notes','supervisor_id'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });

    const { data: old } = await supabase.from('projects').select('status,name').eq('id', req.params.id).single();

    // Try update — if column doesn't exist, retry without problematic fields
    let data, error;
    ({ data, error } = await supabase.from('projects').update(update).eq('id', req.params.id).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single());
    if (error && error.message?.includes('column')) {
      // Remove fields that may not exist yet (need migration)
      const safeCopy = { ...update };
      ['deadline', 'notes'].forEach(f => delete safeCopy[f]);
      ({ data, error } = await supabase.from('projects').update(safeCopy).eq('id', req.params.id).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single());
    }
    if (error) throw error;

    // Log & Notify
    if (old && update.status && update.status !== old.status) {
      await logActivity(req.user.userId, 'status_changed', 'project', data.id,
        `Chuyển trạng thái: ${old.status} → ${update.status}`,
        { status: old.status }, { status: update.status });

      // Notify team
      const teamIds = [data.sales_person_id, data.designer_id, data.project_manager_id].filter(Boolean);
      await notifyMultiple(req, teamIds, 'project_updated',
        '📋 Cập nhật dự án', `Dự án ${data.code || data.name} chuyển từ "${old.status}" → "${update.status}"`,
        'project', data.id);
    }

    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── ADVANCE PROJECT STAGE ──
r.put('/:id/stage', async (req, res) => {
  try {
    const { stage_slug, new_status, notes, attachments } = req.body;
    const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });

    const { data: old } = await supabase.from('projects').select('status,current_stage_id,name,code').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('projects').update({
      current_stage_id: stage.id, status: new_status, updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select(`*, customers(id,full_name), current_stage:workflow_stages(id,name,slug,color)`).single();
    if (error) throw error;

    // Save stage transition record
    try {
      await supabase.from('stage_transitions').insert({
        project_id: data.id,
        from_stage_id: old?.current_stage_id || null,
        to_stage_id: stage.id,
        notes: notes || null,
        attachments: attachments || [],
        transitioned_by: req.user.userId,
      });
    } catch {} // ignore if table doesn't exist

    // AUTO-FLOW: Sync ĐH status khi project chuyển stage
    if (autoFlow?.onProjectStageChanged) {
      try { await autoFlow.onProjectStageChanged(req.params.id, stage.id); } catch (e) { console.error('Auto-flow sync:', e.message); }
    }

    // AUTO-SYNC: Project stage → CRM Deal pipeline stage
    try {
      // Map workflow stage slug → deal pipeline stage name
      const STAGE_TO_DEAL_PIPELINE = {
        consulting: 'Deal mới',
        design: 'Deal mới',
        quotation: 'Báo giá',
        contract: 'Ký hợp đồng',
        production: 'Ký hợp đồng',
        shipping: 'Ký hợp đồng',
        installation: 'Ký hợp đồng',
        'customer-care': 'Thắng',
      };
      const prefix = stage_slug?.split('-')?.[0] || stage_slug;
      const dealPipelineName = STAGE_TO_DEAL_PIPELINE[prefix];
      if (dealPipelineName) {
        const { data: pStage } = await supabase.from('crm_pipeline_stages')
          .select('id').eq('name', dealPipelineName).eq('pipeline_type', 'deal').eq('is_active', true).limit(1).single();
        if (pStage) {
          // Only update deals (type='deal') linked to this project
          await supabase.from('crm_leads')
            .update({ stage_id: pStage.id, updated_at: new Date().toISOString() })
            .eq('project_id', req.params.id)
            .eq('type', 'deal');
        }
      }
    } catch (_) { /* ignore - CRM tables may not exist */ }

    // Auto-update customer status based on stage mapping
    if (data.customer_id) {
      try {
        const { data: mapping } = await supabase.from('stage_customer_status_map')
          .select('customer_status_id').eq('stage_id', stage.id).single();
        if (mapping?.customer_status_id) {
          await supabase.from('customers').update({ status_id: mapping.customer_status_id }).eq('id', data.customer_id);
        }
      } catch (_) { /* table may not exist */ }
    }

    // Get project with stage person assignments
    const { data: fullProj } = await supabase.from('projects').select(
      'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,sales_person_id,designer_id,project_manager_id,code,name'
    ).eq('id', req.params.id).single();

    // Map stage slug to person field
    const stagePersonMap = {
      consulting: fullProj?.consulting_person_id,
      design: fullProj?.design_person_id,
      quotation: fullProj?.quotation_person_id,
      contract: fullProj?.contract_person_id,
      production: fullProj?.production_person_id,
      shipping: fullProj?.shipping_person_id,
      installation: fullProj?.installation_person_id,
      'customer-care': fullProj?.care_person_id,
    };
    const stageAssigneeId = stagePersonMap[stage_slug] || null;

    // Load workflow lines for this project + stage
    let stageLines = [];
    try {
      const { data: wlData } = await supabase.from('project_workflow_lines')
        .select('*').eq('project_id', req.params.id).eq('stage_slug', stage_slug).order('order_index');
      stageLines = wlData || [];
    } catch { }

    // Auto-create stage tasks from FLOW TEMPLATE (new logic) or fallback
    let createdTasks = [];
    if (stageFlow) {
      try {
        const result = await stageFlow.createStageTasksFromFlow(
          data.id, stage.id, stage_slug, req.user.userId, stageAssigneeId
        );
        createdTasks = result.tasks || [];
        if (result.flowStep) {
          console.log(`[StageFlow] ${data.code || data.id}: ${stage_slug} → Khối ${result.flowStep.division?.name || '?'}, template: ${result.templateSet?.name || 'fallback'}, ${createdTasks.length} tasks`);
        }
      } catch (e) {
        console.error('[StageFlow] Error:', e.message);
      }
    }

    // Legacy fallback: if stageFlow not available or created 0 tasks
    if (!createdTasks.length && !stageFlow) {
      const stageDefaultTasks = {
        design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
        quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
        contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
        production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
        shipping: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' }],
        installation: [{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
        'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
      };
      const tasks = stageDefaultTasks[stage_slug];
      if (tasks) {
        const { data: inserted } = await supabase.from('tasks').insert(tasks.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          priority: t.priority, status: 'pending', created_by_id: req.user.userId,
          order_index: i, assignee_id: stageAssigneeId, task_type: 'project',
        }))).select();
        createdTasks = inserted || [];
      }
    }

    // Notify about new tasks
    if (stageAssigneeId && createdTasks.length) {
      await createNotification(req, stageAssigneeId, 'task_assigned',
        `📌 ${createdTasks.length} nhiệm vụ mới`,
        `GĐ "${stage.name}" — ${createdTasks.length} NV — DA ${fullProj?.code}`,
        'project', data.id);
    }

    // Log
    await logActivity(req.user.userId, 'stage_changed', 'project', data.id,
      `Chuyển giai đoạn sang: ${stage.name}`,
      { status: old?.status }, { status: new_status, stage: stage.name });

    // ── THÔNG BÁO chuyển giai đoạn ──
    // Notify ALL stage persons + old team
    if (fullProj) {
      const allPersonIds = [
        fullProj.consulting_person_id, fullProj.design_person_id, fullProj.quotation_person_id,
        fullProj.contract_person_id, fullProj.production_person_id, fullProj.shipping_person_id,
        fullProj.installation_person_id, fullProj.care_person_id,
        fullProj.sales_person_id, fullProj.designer_id, fullProj.project_manager_id,
      ].filter(Boolean);
      await notifyMultiple(req, allPersonIds, 'project_stage_changed',
        `🔄 Chuyển giai đoạn: ${stage.name}`,
        `Dự án ${fullProj.code} đã chuyển sang giai đoạn "${stage.name}"`,
        'project', data.id);
    }

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', data);

    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── TẠO NHIỆM VỤ MẪU CHO 1 GIAI ĐOẠN (manual trigger) ──
r.post('/:id/generate-tasks', async (req, res) => {
  try {
    const { stage_slug } = req.body;
    if (!stage_slug) return res.status(400).json({ error: 'Thiếu stage_slug' });

    const { data: stage } = await supabase.from('workflow_stages')
      .select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Giai đoạn không tồn tại' });

    const { data: proj } = await supabase.from('projects').select(
      'id,code,consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id'
    ).eq('id', req.params.id).single();
    if (!proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Check if tasks already exist for this stage
    const { data: existing } = await supabase.from('tasks')
      .select('id').eq('project_id', req.params.id).eq('stage_id', stage.id).limit(1);
    if (existing?.length) {
      return res.status(400).json({ error: `Đã có ${existing.length} nhiệm vụ ở giai đoạn "${stage.name}". Xóa trước khi tạo lại.` });
    }

    const stagePersonMap = {
      consulting: proj.consulting_person_id, design: proj.design_person_id,
      quotation: proj.quotation_person_id, contract: proj.contract_person_id,
      production: proj.production_person_id, shipping: proj.shipping_person_id,
      installation: proj.installation_person_id, 'customer-care': proj.care_person_id,
    };
    const assigneeId = stagePersonMap[stage_slug] || null;

    // Load workflow lines
    let stageLines = [];
    try {
      const { data: wl } = await supabase.from('project_workflow_lines')
        .select('*').eq('project_id', req.params.id).eq('stage_slug', stage_slug).order('order_index');
      stageLines = wl || [];
    } catch {}

    // Load templates or defaults
    const { data: templates } = await supabase.from('task_templates')
      .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

    const stageDefaultTasks = {
      consulting: [{ title: 'Tư vấn khách hàng', priority: 'high' },{ title: 'Khảo sát hiện trạng', priority: 'medium' }],
      design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
      quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
      contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
      production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Sơn / dán bề mặt', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
      shipping: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' }],
      installation: [{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
      'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
    };
    const taskList = templates?.length ? templates : (stageDefaultTasks[stage_slug] || []);
    if (!taskList.length) return res.status(400).json({ error: 'Không có nhiệm vụ mẫu cho giai đoạn này' });

    let createdTasks = [];

    if (stageLines.length > 0) {
      for (const line of stageLines) {
        const lineAssignee = line.assignee_id || assigneeId;
        const { data: ins, error: insErr } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
          project_id: req.params.id, stage_id: stage.id,
          title: `${t.title} — ${line.label}`,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
          estimated_hours: t.estimated_hours || null, task_type: 'project', workflow_line_id: line.id,
        }))).select();
        if (insErr) { console.error('generate-tasks insert error:', insErr); throw insErr; }
        createdTasks.push(...(ins || []));

        // Create checklists from templates
        if (templates?.length) {
          for (const tmpl of templates) {
            if (tmpl.checklist_items?.length) {
              const newTask = (ins || []).find(t2 => t2.title === `${tmpl.title} — ${line.label}`);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        }
      }
    } else {
      const { data: ins, error: insErr } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
        project_id: req.params.id, stage_id: stage.id, title: t.title,
        description: t.description || null, priority: t.priority || 'medium', status: 'pending',
        created_by_id: req.user.userId, order_index: i, assignee_id: assigneeId,
        estimated_hours: t.estimated_hours || null, task_type: 'project',
      }))).select();
      if (insErr) { console.error('generate-tasks insert error:', insErr); throw insErr; }
      createdTasks = ins || [];

      if (templates?.length) {
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = createdTasks.find(t2 => t2.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
              );
            }
          }
        }
      }
    }

    await logActivity(req.user.userId, 'generate_tasks', 'project', req.params.id,
      `Tạo ${createdTasks.length} NV mẫu cho GĐ "${stage.name}"`);

    res.json({ tasks: createdTasks, count: createdTasks.length, stage: stage.name });
  } catch (e) { console.error('generate-tasks error:', e); res.status(500).json({ error: e.message }); }
});

// ─── REQUEST APPROVAL (Chờ duyệt) ──
r.post('/:id/request-approval', async (req, res) => {
  try {
    const { notes, attachments, next_stage_slug, next_status } = req.body;

    // Try with created_by_id, fallback without it
    let proj;
    const { data: p1, error: e1 } = await supabase.from('projects').select(
      'id,code,name,project_manager_id,sales_person_id,current_stage_id,status'
    ).eq('id', req.params.id).single();
    proj = p1;
    if (e1 || !proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Determine who to notify: project_manager > sales_person > current user as fallback
    const approverId = proj.project_manager_id || proj.sales_person_id;
    if (!approverId) return res.status(400).json({ error: 'Không tìm được người duyệt. Hãy gán Quản lý DA hoặc Sales cho dự án.' });

    const { data: nextStage } = await supabase.from('workflow_stages').select('id,name').eq('slug', next_stage_slug).single();
    const { data: curStage } = await supabase.from('workflow_stages').select('id,name').eq('id', proj.current_stage_id).single();

    // Save approval request as a special notification with metadata
    const metadata = {
      type: 'system',
      project_id: proj.id,
      project_code: proj.code,
      project_name: proj.name,
      from_stage: curStage?.name || '',
      to_stage: nextStage?.name || '',
      next_stage_slug,
      next_status,
      notes: notes || '',
      attachments: attachments || [],
      requested_by: req.user.userId,
      requested_by_name: req.user.fullName,
      status: 'pending', // pending | approved | rejected
    };

    const { data: notif, error } = await supabase.from('notifications').insert({
      user_id: approverId,
      type: 'system',
      title: `🔍 Yêu cầu duyệt: ${proj.code} — ${proj.name}`,
      message: `${req.user.fullName} yêu cầu chuyển "${curStage?.name}" → "${nextStage?.name}"${notes ? `\n\n📝 Nội dung:\n${notes}` : ''}${attachments?.length ? `\n\n📎 ${attachments.length} file đính kèm` : ''}`,
      entity_type: 'project',
      entity_id: proj.id,
      metadata,
    }).select().single();
    if (error) throw error;

    // Push realtime
    const pushFn = req.app.get('pushNotification');
    if (pushFn && notif) pushFn(approverId, notif);

    // Log activity
    await logActivity(req.user.userId, 'approval_requested', 'project', proj.id,
      `Yêu cầu duyệt chuyển ${curStage?.name} → ${nextStage?.name}`);

    res.json({ ok: true, notification_id: notif.id, approver_id: approverId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── APPROVE / REJECT ADVANCE ──
r.post('/:id/approve-advance', async (req, res) => {
  try {
    const { notification_id, action, reject_reason } = req.body; // action: 'approve' | 'reject'
    if (!reject_reason?.trim()) return res.status(400).json({ error: 'Vui lòng nhập lý do' });

    // Get the notification with metadata
    const { data: notif } = await supabase.from('notifications').select('*').eq('id', notification_id).single();
    if (!notif || notif.metadata?.type !== 'approval_request') {
      return res.status(400).json({ error: 'Yêu cầu không hợp lệ' });
    }
    const meta = notif.metadata;

    // Update notification status
    await supabase.from('notifications').update({
      metadata: { ...meta, status: action === 'approve' ? 'approved' : 'rejected', decided_by: req.user.userId, decided_at: new Date().toISOString(), reject_reason },
      is_read: true, read_at: new Date().toISOString(),
    }).eq('id', notification_id);

    if (action === 'approve') {
      // Actually advance the stage
      const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', meta.next_stage_slug).single();
      if (!stage) return res.status(400).json({ error: 'Stage không tồn tại' });

      const { data: old } = await supabase.from('projects').select('status,current_stage_id,code,name').eq('id', req.params.id).single();

      await supabase.from('projects').update({
        current_stage_id: stage.id, status: meta.next_status, updated_at: new Date().toISOString(),
      }).eq('id', req.params.id);

      // Save transition record
      try {
        await supabase.from('stage_transitions').insert({
          project_id: req.params.id,
          from_stage_id: old?.current_stage_id || null,
          to_stage_id: stage.id,
          notes: meta.notes || null,
          attachments: meta.attachments || [],
          transitioned_by: req.user.userId,
        });
      } catch {} // ignore if table doesn't exist

      // Notify requester: approved
      await createNotification(req, meta.requested_by, 'project_stage_changed',
        `✅ Đã duyệt: ${meta.project_code}`,
        `${req.user.fullName} đã duyệt chuyển "${meta.from_stage}" → "${meta.to_stage}"\nLý do: ${reject_reason}`,
        'project', req.params.id);

      await logActivity(req.user.userId, 'approval_approved', 'project', req.params.id,
        `Duyệt chuyển ${meta.from_stage} → ${meta.to_stage}`);

      // Auto-create tasks for new stage (reuse existing logic from /stage endpoint)
      // Get stage person
      const { data: fullProj } = await supabase.from('projects').select(
        'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,code'
      ).eq('id', req.params.id).single();

      const stagePersonMap = {
        consulting: fullProj?.consulting_person_id, design: fullProj?.design_person_id,
        quotation: fullProj?.quotation_person_id, contract: fullProj?.contract_person_id,
        production: fullProj?.production_person_id, shipping: fullProj?.shipping_person_id,
        installation: fullProj?.installation_person_id, 'customer-care': fullProj?.care_person_id,
      };
      const stageAssigneeId = stagePersonMap[meta.next_stage_slug] || null;

      // Load workflow lines
      let stageLines = [];
      try {
        const { data: wlData } = await supabase.from('project_workflow_lines')
          .select('*').eq('project_id', req.params.id).eq('stage_slug', meta.next_stage_slug).order('order_index');
        stageLines = wlData || [];
      } catch { }

      // Load templates
      const { data: templates } = await supabase.from('task_templates')
        .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

      const stageDefaultTasks = {
        design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
        quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
        contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
        production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Sơn / dán bề mặt', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
        shipping: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' }],
        installation: [{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
        'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
      };

      if (stageLines.length > 0) {
        for (const line of stageLines) {
          const lineAssignee = line.assignee_id || stageAssigneeId;
          const taskList = templates?.length ? templates : (stageDefaultTasks[meta.next_stage_slug] || []);
          const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
            project_id: req.params.id, stage_id: stage.id,
            title: templates?.length ? `${t.title} — ${line.label}` : `${t.title} — ${line.label}`,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
            estimated_hours: t.estimated_hours || null, task_type: 'project', workflow_line_id: line.id,
          }))).select();
          if (lineAssignee && ins?.length) {
            await createNotification(req, lineAssignee, 'task_assigned',
              `📌 ${ins.length} NV "${line.label}"`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', req.params.id);
          }
        }
      } else {
        const taskList = templates?.length ? templates : (stageDefaultTasks[meta.next_stage_slug] || []);
        if (taskList.length) {
          const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
            project_id: req.params.id, stage_id: stage.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: stageAssigneeId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          if (stageAssigneeId && ins?.length) {
            await createNotification(req, stageAssigneeId, 'task_assigned',
              `📌 ${ins.length} nhiệm vụ mới`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', req.params.id);
          }
        }
      }

      const io = req.app.get('io');
      if (io) io.emit('project:stage_changed', { project_id: req.params.id });

      return res.json({ ok: true, action: 'approved' });
    } else {
      // Rejected
      await createNotification(req, meta.requested_by, 'system',
        `❌ Từ chối: ${meta.project_code}`,
        `${req.user.fullName} từ chối chuyển "${meta.from_stage}" → "${meta.to_stage}"${reject_reason ? `\nLý do: ${reject_reason}` : ''}`,
        'project', req.params.id);

      await logActivity(req.user.userId, 'approval_rejected', 'project', req.params.id,
        `Từ chối chuyển ${meta.from_stage} → ${meta.to_stage}${reject_reason ? ': ' + reject_reason : ''}`);

      return res.json({ ok: true, action: 'rejected' });
    }
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE PROJECT ──
r.delete('/:id', requirePermission('projects', 'delete'), async (req, res) => {
  try {
    const { data: project } = await supabase.from('projects').select('code,name').eq('id', req.params.id).single();
    
    // Xóa tất cả bảng phụ thuộc trước khi xóa project (ignore errors for missing tables)
    const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', req.params.id);
    if (taskIds?.length) {
      const ids = taskIds.map(t => t.id);
      await supabase.from('task_checklists').delete().in('task_id', ids);
      await supabase.from('task_comments').delete().in('task_id', ids);
      await supabase.from('task_participants').delete().in('task_id', ids);
      await supabase.from('task_time_logs').delete().in('task_id', ids);
      await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids);
    }
    await supabase.from('tasks').delete().eq('project_id', req.params.id);
    await supabase.from('project_comments').delete().eq('project_id', req.params.id);
    await supabase.from('stage_transitions').delete().eq('project_id', req.params.id);
    await supabase.from('project_workflow_lines').delete().eq('project_id', req.params.id);
    await supabase.from('project_products').delete().eq('project_id', req.params.id);
    await supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', req.params.id);
    await supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', req.params.id);

    // Xóa lead/deal liên kết (cascade: activities, documents, quotations, orders, invoices)
    const { data: linkedLeads } = await supabase.from('crm_leads').select('id').eq('project_id', req.params.id);
    if (linkedLeads?.length) {
      const leadIds = linkedLeads.map(l => l.id);
      // Delete CRM sub-tables
      await supabase.from('crm_quotations').delete().in('lead_id', leadIds).catch(() => {});
      await supabase.from('crm_orders').delete().in('lead_id', leadIds).catch(() => {});
      await supabase.from('crm_invoices').delete().in('lead_id', leadIds).catch(() => {});
      await supabase.from('crm_activities').delete().in('lead_id', leadIds).catch(() => {});
      await supabase.from('lead_documents').delete().in('lead_id', leadIds).catch(() => {});
      // Delete leads/deals
      await supabase.from('crm_leads').delete().in('id', leadIds);
      console.log(`Project ${req.params.id} → deleted ${leadIds.length} linked lead(s)/deal(s)`);
    }

    // Xóa project
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) throw error;

    await supabase.from('activity_logs').insert({
      user_id: req.user.userId, action: 'deleted', entity_type: 'project', entity_id: req.params.id,
      description: `Xóa dự án: ${project?.code} - ${project?.name}`,
    });

    res.json({ message: 'Đã xóa dự án' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi xóa dự án: ' + e.message }); }
});

// ─── AUTO-ADVANCE: Check if all stage tasks done → suggest/auto advance ──
r.post('/:id/check-advance', async (req, res) => {
  try {
    const { data: project } = await supabase.from('projects')
      .select('id,code,name,status,current_stage_id, current_stage:workflow_stages(id,name,slug,order_index)')
      .eq('id', req.params.id).single();
    if (!project) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Get tasks for current stage
    const { data: stageTasks } = await supabase.from('tasks')
      .select('id,status').eq('project_id', project.id).eq('stage_id', project.current_stage_id);

    const allDone = stageTasks?.length > 0 && stageTasks.every(t => t.status === 'done');

    if (!allDone) {
      const remaining = stageTasks?.filter(t => t.status !== 'done').length || 0;
      return res.json({ canAdvance: false, remaining, message: `Còn ${remaining} công việc chưa hoàn thành` });
    }

    // Find next stage
    const { data: stages } = await supabase.from('workflow_stages')
      .select('*').eq('is_active', true).order('order_index');
    const currentIdx = stages?.findIndex(s => s.id === project.current_stage_id);
    const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

    res.json({
      canAdvance: true,
      nextStage: nextStage ? { id: nextStage.id, name: nextStage.name, slug: nextStage.slug } : null,
      message: nextStage ? `Có thể chuyển sang giai đoạn "${nextStage.name}"` : 'Đã hoàn thành tất cả giai đoạn',
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── PROJECT COMMENTS ──
r.get('/:id/comments', async (req, res) => {
  try {
    const { data } = await supabase.from('project_comments').select('*, user:users(id,full_name,avatar)').eq('project_id', req.params.id).order('created_at', { ascending: false });
    res.json({ comments: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_comments').insert({
      project_id: req.params.id, user_id: req.user.userId, content: req.body.content,
      attachments: req.body.attachments || [],
    }).select('*, user:users(id,full_name,avatar)').single();
    if (error) throw error;

    // Notify project team
    const { data: proj } = await supabase.from('projects').select('sales_person_id,designer_id,project_manager_id,code').eq('id', req.params.id).single();
    if (proj) {
      const teamIds = [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
      await notifyMultiple(req, teamIds, 'comment_added',
        '💬 Bình luận dự án', `${req.user.fullName} bình luận trong dự án ${proj.code}`,
        'project', req.params.id);
    }

    res.status(201).json({ comment: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── PROJECT PRODUCTS ──
r.get('/:id/products', async (req, res) => {
  try {
    const { data } = await supabase.from('project_products')
      .select('*, product:products(id,code,name,base_price,material,unit)')
      .eq('project_id', req.params.id);
    res.json({ products: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/products', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_products').insert({
      project_id: req.params.id,
      product_id: req.body.product_id,
      quantity: req.body.quantity || 1,
      custom_price: req.body.custom_price || null,
      notes: req.body.notes || null,
    }).select('*, product:products(id,code,name,base_price,material,unit)').single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:id/products/:ppId', async (req, res) => {
  try {
    await supabase.from('project_products').delete().eq('id', req.params.ppId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════════
// WORKFLOW LINES — Luồng phân công linh hoạt
// ═══════════════════════════════════════════════

// GET lines for a project
r.get('/:id/workflow-lines', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_workflow_lines')
      .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)')
      .eq('project_id', req.params.id).order('order_index');
    if (error) throw error;
    res.json({ lines: data || [] });
  } catch (e) { res.json({ lines: [] }); }
});

// ADD line
r.post('/:id/workflow-lines', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('project_workflow_lines').insert({
      project_id: req.params.id,
      stage_slug: b.stage_slug,
      label: b.label || b.stage_slug,
      assignee_id: b.assignee_id || null,
      description: b.description || null,
      order_index: b.order_index ?? 0,
      color: b.color || null,
    }).select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)').single();
    if (error) throw error;
    res.status(201).json({ line: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// UPDATE line
r.put('/:id/workflow-lines/:lineId', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['label','assignee_id','description','order_index','status','color','stage_slug'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('project_workflow_lines')
      .update(update).eq('id', req.params.lineId)
      .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)').single();
    if (error) throw error;
    res.json({ line: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// DELETE line
r.delete('/:id/workflow-lines/:lineId', async (req, res) => {
  try {
    await supabase.from('project_workflow_lines').delete().eq('id', req.params.lineId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// REORDER lines
r.put('/:id/workflow-lines-order', async (req, res) => {
  try {
    const { lines } = req.body; // [{id, order_index}]
    for (const l of (lines || [])) {
      await supabase.from('project_workflow_lines').update({ order_index: l.order_index }).eq('id', l.id);
    }
    res.json({ message: 'OK' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// GET latest comments across all projects
r.get('/latest-comments', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { data: comments, error } = await supabase.from('project_comments')
      .select('id, content, created_at, project_id, user:users(id, full_name, avatar_url), project:projects(id, code, name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ comments: comments || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;

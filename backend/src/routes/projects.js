const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── HELPER ──
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

// ─── LIST PROJECTS ──
r.get('/', async (req, res) => {
  try {
    const { status, search, stage_slug, page = 1, limit = 50 } = req.query;
    let q = supabase.from('projects').select(`
      *, customers(id,full_name,phone,email,city),
      company:companies(id,name,short_name),
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

    // ── ROLE-BASED FILTERING ──
    // Non-admin/manager users only see projects where they are assigned to a stage
    const userRole = req.user.role;
    if (userRole && !['admin', 'manager'].includes(userRole)) {
      const uid = req.user.userId;
      // Try with stage person fields, fallback to legacy fields only
      try {
        q = q.or(`consulting_person_id.eq.${uid},design_person_id.eq.${uid},quotation_person_id.eq.${uid},contract_person_id.eq.${uid},production_person_id.eq.${uid},shipping_person_id.eq.${uid},installation_person_id.eq.${uid},care_person_id.eq.${uid},sales_person_id.eq.${uid},designer_id.eq.${uid},project_manager_id.eq.${uid}`);
      } catch {
        q = q.or(`sales_person_id.eq.${uid},designer_id.eq.${uid},project_manager_id.eq.${uid}`);
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
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select(`
      *, customers(*),
      company:companies(id,name,short_name),
      current_stage:workflow_stages(*),
      sales_person:users!projects_sales_person_id_fkey(id,full_name,avatar,email),
      designer:users!projects_designer_id_fkey(id,full_name,avatar,email),
      project_manager:users!projects_project_manager_id_fkey(id,full_name,avatar,email),
      tasks(*, assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,slug,color,order_index))
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

    res.json({
      project: {
        ...data,
        ...stagePersons,
        comments: comments || [],
        activities: activities || [],
        transitions: transitions || [],
        canAdvance,
        stageTasksDone,
        stageTasksTotal,
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE PROJECT ──
r.post('/', async (req, res) => {
  try {
    const b = req.body;

    // Auto-generate code
    const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true });
    const code = `TB-${new Date().getFullYear()}-${String((count||0)+1).padStart(3,'0')}`;

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

    // Auto-create tasks for consulting stage from TEMPLATES or defaults
    const consultingPersonId = b.consulting_person_id || b.sales_person_id || null;
    if (stage?.id) {
      const { data: templates } = await supabase.from('task_templates')
        .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

      let createdTasks = [];
      if (templates?.length) {
        const { data: inserted } = await supabase.from('tasks').insert(templates.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          description: t.description || null,
          priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i,
          assignee_id: consultingPersonId,
          estimated_hours: t.estimated_hours || null,
          task_type: 'project',
        }))).select();
        createdTasks = inserted || [];
        // Create checklists from template
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = createdTasks.find(t => t.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({
                  task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j,
                }))
              );
            }
          }
        }
      } else {
        const defaultTasks = [
          { title: 'Tiếp nhận yêu cầu khách hàng', priority: 'high' },
          { title: 'Khảo sát hiện trạng', priority: 'medium' },
          { title: 'Tư vấn phương án', priority: 'medium' },
        ];
        const { data: inserted } = await supabase.from('tasks').insert(defaultTasks.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          priority: t.priority, status: 'pending', created_by_id: req.user.userId,
          order_index: i, assignee_id: consultingPersonId,
          task_type: 'project',
        }))).select();
        createdTasks = inserted || [];
      }

      // Notify consulting person about auto-created tasks
      if (consultingPersonId && createdTasks.length) {
        await createNotification(req, consultingPersonId, 'task_assigned',
          '📌 Nhiệm vụ tự động', `${createdTasks.length} nhiệm vụ giai đoạn "Tư vấn" đã được tạo cho dự án ${code}`,
          'project', data.id);
      }
    }

    res.status(201).json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE PROJECT ──
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name','description','status','customer_id','kitchen_type','material','install_address','estimated_value','final_value','priority','sales_person_id','designer_id','project_manager_id','design_deadline','production_start_date','install_date','consulting_person_id','design_person_id','quotation_person_id','contract_person_id','production_person_id','shipping_person_id','installation_person_id','care_person_id','quotation_files'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });

    const { data: old } = await supabase.from('projects').select('status,name').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('projects').update(update).eq('id', req.params.id).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single();
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
    await supabase.from('stage_transitions').insert({
      project_id: data.id,
      from_stage_id: old?.current_stage_id || null,
      to_stage_id: stage.id,
      notes: notes || null,
      attachments: attachments || [],
      transitioned_by: req.user.userId,
    });

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

    // Auto-create stage tasks from TEMPLATES (if available) or fallback defaults
    const { data: templates } = await supabase.from('task_templates')
      .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

    let createdTasks = [];
    if (templates?.length) {
      const { data: inserted } = await supabase.from('tasks').insert(templates.map((t, i) => ({
        project_id: data.id, stage_id: stage.id, title: t.title,
        description: t.description || null,
        priority: t.priority || 'medium', status: 'pending',
        created_by_id: req.user.userId, order_index: i,
        assignee_id: stageAssigneeId,
        estimated_hours: t.estimated_hours || null,
        task_type: 'project',
      }))).select();
      createdTasks = inserted || [];
      // Create checklists from template
      for (const tmpl of templates) {
        if (tmpl.checklist_items?.length) {
          const newTask = createdTasks.find(t => t.title === tmpl.title);
          if (newTask) {
            await supabase.from('task_checklists').insert(
              tmpl.checklist_items.map((c, j) => ({
                task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j,
              }))
            );
          }
        }
      }
    } else {
      // Fallback to hardcoded defaults
      const stageDefaultTasks = {
        design: [
          { title: 'Thiết kế bản vẽ 2D', priority: 'high' },
          { title: 'Thiết kế 3D render', priority: 'medium' },
          { title: 'Khách duyệt bản thiết kế', priority: 'high' },
        ],
        quotation: [
          { title: 'Bóc tách vật tư', priority: 'high' },
          { title: 'Lập báo giá chi tiết', priority: 'high' },
          { title: 'Gửi báo giá cho khách', priority: 'medium' },
        ],
        contract: [
          { title: 'Soạn hợp đồng', priority: 'high' },
          { title: 'Khách ký hợp đồng', priority: 'high' },
          { title: 'Thu tiền cọc', priority: 'urgent' },
        ],
        production: [
          { title: 'Đặt mua vật tư', priority: 'high' },
          { title: 'Gia công CNC', priority: 'high' },
          { title: 'Lắp ráp', priority: 'medium' },
          { title: 'Sơn / dán bề mặt', priority: 'medium' },
          { title: 'Kiểm tra chất lượng', priority: 'high' },
        ],
        shipping: [
          { title: 'Đóng gói sản phẩm', priority: 'medium' },
          { title: 'Sắp xếp xe vận chuyển', priority: 'medium' },
          { title: 'Giao hàng đến công trình', priority: 'high' },
        ],
        installation: [
          { title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },
          { title: 'Lắp đặt tại công trình', priority: 'high' },
          { title: 'Nghiệm thu với khách hàng', priority: 'urgent' },
        ],
        'customer-care': [
          { title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },
          { title: 'Xử lý bảo hành (nếu có)', priority: 'high' },
        ],
      };
      const tasks = stageDefaultTasks[stage_slug];
      if (tasks) {
        const { data: inserted } = await supabase.from('tasks').insert(tasks.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          priority: t.priority, status: 'pending', created_by_id: req.user.userId,
          order_index: i, assignee_id: stageAssigneeId,
          task_type: 'project',
        }))).select();
        createdTasks = inserted || [];
      }
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
      await notifyMultiple(req, allPersonIds, 'stage_changed',
        `🔄 Chuyển giai đoạn: ${stage.name}`,
        `Dự án ${fullProj.code} đã chuyển sang giai đoạn "${stage.name}"`,
        'project', data.id);

      // Notify stage person about their new tasks
      if (stageAssigneeId && createdTasks.length) {
        await createNotification(req, stageAssigneeId, 'task_assigned',
          `📌 ${createdTasks.length} nhiệm vụ mới`,
          `Giai đoạn "${stage.name}" bắt đầu — ${createdTasks.length} nhiệm vụ đã được giao cho bạn trong dự án ${fullProj.code}`,
          'project', data.id);
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', data);

    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE PROJECT ──
r.delete('/:id', async (req, res) => {
  try {
    const { data: project } = await supabase.from('projects').select('code,name').eq('id', req.params.id).single();
    // Cascade: tasks sẽ bị xóa theo FK nếu có ON DELETE CASCADE, nếu không thì xóa thủ công
    await supabase.from('tasks').delete().eq('project_id', req.params.id);
    await supabase.from('project_comments').delete().eq('project_id', req.params.id);
    await supabase.from('projects').delete().eq('id', req.params.id);

    await supabase.from('activity_logs').insert({
      user_id: req.user.userId, action: 'deleted', entity_type: 'project', entity_id: req.params.id,
      description: `Xóa dự án: ${project?.code} - ${project?.name}`,
    });

    res.json({ message: 'Đã xóa dự án' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
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

module.exports = r;

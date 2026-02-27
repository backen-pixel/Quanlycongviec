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
      current_stage:workflow_stages(*),
      sales_person:users!projects_sales_person_id_fkey(id,full_name,avatar,email),
      designer:users!projects_designer_id_fkey(id,full_name,avatar,email),
      project_manager:users!projects_project_manager_id_fkey(id,full_name,avatar,email),
      tasks(*, assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,color))
    `).eq('id', req.params.id).single();
    if (error) throw error;

    // Comments
    const { data: comments } = await supabase.from('project_comments').select('*, user:users(id,full_name,avatar)').eq('project_id', req.params.id).order('created_at', { ascending: false });

    // Activity log
    const { data: activities } = await supabase.from('activity_logs').select('*, user:users(id,full_name)').eq('entity_type', 'project').eq('entity_id', req.params.id).order('created_at', { ascending: false }).limit(20);

    res.json({ project: { ...data, comments: comments || [], activities: activities || [] } });
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
      consult_date: new Date().toISOString(),
    }).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single();
    if (error) throw error;

    // Activity log
    await logActivity(req.user.userId, 'created', 'project', data.id, `Tạo dự án ${code}: ${b.name}`);

    // ── THÔNG BÁO cho tất cả người được phân công ──
    const assignees = [
      { id: b.sales_person_id, role: 'Sales' },
      { id: b.designer_id, role: 'Thiết kế' },
      { id: b.project_manager_id, role: 'Quản lý DA' },
    ];
    for (const a of assignees) {
      if (a.id) {
        await createNotification(req, a.id, 'project_assigned',
          '📋 Dự án mới', `Bạn được phân công vai trò ${a.role} cho dự án ${code}: ${b.name}`, 'project', data.id);
      }
    }

    // ── Lưu sản phẩm vào dự án ──
    if (b.products?.length) {
      await supabase.from('project_products').insert(
        b.products.map(p => ({
          project_id: data.id,
          product_id: p.product_id,
          quantity: p.quantity || 1,
          custom_price: p.custom_price || null,
          notes: p.notes || null,
        }))
      );
    }

    // Auto-create default tasks for consulting stage
    if (stage?.id) {
      const defaultTasks = [
        { title: 'Tiếp nhận yêu cầu khách hàng', priority: 'high' },
        { title: 'Khảo sát hiện trạng', priority: 'medium' },
        { title: 'Tư vấn phương án', priority: 'medium' },
      ];
      await supabase.from('tasks').insert(defaultTasks.map((t, i) => ({
        project_id: data.id, stage_id: stage.id, title: t.title,
        priority: t.priority, status: 'pending', created_by_id: req.user.userId,
        order_index: i, assignee_id: b.sales_person_id || null,
      })));
    }

    res.status(201).json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE PROJECT ──
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name','description','status','customer_id','kitchen_type','material','install_address','estimated_value','final_value','priority','sales_person_id','designer_id','project_manager_id','design_deadline','production_start_date','install_date'];
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
    const { stage_slug, new_status } = req.body;
    const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });

    const { data: old } = await supabase.from('projects').select('status,current_stage_id,name').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('projects').update({
      current_stage_id: stage.id, status: new_status, updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select(`*, customers(id,full_name), current_stage:workflow_stages(id,name,slug,color)`).single();
    if (error) throw error;

    // Auto-create stage tasks from TEMPLATES (if available) or fallback defaults
    const { data: templates } = await supabase.from('task_templates')
      .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

    if (templates?.length) {
      // Use templates
      await supabase.from('tasks').insert(templates.map((t, i) => ({
        project_id: data.id, stage_id: stage.id, title: t.title,
        description: t.description || null,
        priority: t.priority || 'medium', status: 'pending',
        created_by_id: req.user.userId, order_index: i,
        estimated_hours: t.estimated_hours || null,
        task_type: 'project',
      })));
      // Create checklists from template
      for (const tmpl of templates) {
        if (tmpl.checklist_items?.length) {
          const { data: newTask } = await supabase.from('tasks')
            .select('id').eq('project_id', data.id).eq('stage_id', stage.id)
            .eq('title', tmpl.title).single();
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
        await supabase.from('tasks').insert(tasks.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          priority: t.priority, status: 'pending', created_by_id: req.user.userId,
          order_index: i, task_type: 'project',
        })));
      }
    }

    // Log
    await logActivity(req.user.userId, 'stage_changed', 'project', data.id,
      `Chuyển giai đoạn sang: ${stage.name}`,
      { status: old?.status }, { status: new_status, stage: stage.name });

    // ── THÔNG BÁO chuyển giai đoạn cho cả team ──
    const { data: proj } = await supabase.from('projects').select('sales_person_id,designer_id,project_manager_id,name,code').eq('id', req.params.id).single();
    if (proj) {
      const teamIds = [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
      await notifyMultiple(req, teamIds, 'stage_changed',
        `🔄 Chuyển giai đoạn: ${stage.name}`,
        `Dự án ${proj.code} đã chuyển sang giai đoạn "${stage.name}"`,
        'project', data.id);
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

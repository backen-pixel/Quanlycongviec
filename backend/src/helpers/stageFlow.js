/**
 * stageFlow.js — Logic mới: Chuyển GĐ → Tạo tasks từ bộ NV mặc định theo Luồng
 * 
 * Khi chuyển giai đoạn:
 * 1. Tìm flow_id của DA (projects.flow_id)
 * 2. Tìm flow_step tương ứng → division_unit_id + company_unit_id
 * 3. Tìm default template_set của company_unit_id
 * 4. Query company_template_tasks của template_set + stage
 * 5. Tạo tasks → gán cho người phụ trách
 */

const { supabase } = require('../config/supabase');

// Stage slug → Division mapping (fallback if no flow)
const STAGE_DIVISION_MAP = {
  consulting:    'business',
  design:        'business',
  quotation:     'business',
  contract:      'business',
  production:    'production',
  shipping:      'shipping',
  installation:  'installation',
  'customer-care': 'business',
};

/**
 * Tìm flow_step phù hợp cho stage slug của project
 */
async function findFlowStep(projectId, stageSlug) {
  // Get project's flow_id
  const { data: proj } = await supabase.from('projects')
    .select('flow_id').eq('id', projectId).single();
  
  if (!proj?.flow_id) return null;

  // Get all flow steps with division info
  const { data: steps } = await supabase.from('workflow_flow_steps')
    .select(`
      id, order_index, division_unit_id, company_unit_id, template_set_id, supervisor_id,
      division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id, name, short_name)
    `)
    .eq('flow_id', proj.flow_id)
    .order('order_index');

  if (!steps?.length) return null;

  // Map division slug → stage slugs
  const divisionStages = {
    'business':      ['consulting', 'design', 'quotation', 'contract', 'customer-care'],
    'production':    ['production'],
    'shipping':      ['shipping'],
    'installation':  ['installation'],
  };

  // Find which division this stage belongs to
  const targetDivGroup = STAGE_DIVISION_MAP[stageSlug];
  if (!targetDivGroup) return null;

  // Get division IDs by known mapping
  const divisionIds = {
    'Khối Kinh Doanh': 'business',
    'Khối Sản Xuất': 'production',
    'Khối Vận Chuyển': 'shipping',
    'Khối Lắp Đặt': 'installation',
  };

  // Match step by division name
  for (const step of steps) {
    const divName = step.division?.name || '';
    const divGroup = divisionIds[divName];
    if (divGroup === targetDivGroup) return step;
  }

  return null;
}

/**
 * Tìm default template set cho company unit
 */
async function findDefaultTemplateSet(companyUnitId) {
  if (!companyUnitId) return null;

  const { data } = await supabase.from('company_template_sets')
    .select('id, name')
    .eq('unit_id', companyUnitId)
    .eq('is_default', true)
    .single();

  return data;
}

/**
 * Lấy tasks từ template set, filter theo stage
 */
async function getTemplateTasks(templateSetId, stageId) {
  if (!templateSetId) return [];

  const { data } = await supabase.from('company_template_tasks')
    .select('id, title, description, priority, estimated_hours, stage_id, order_index, checklist_items')
    .eq('template_set_id', templateSetId)
    .eq('stage_id', stageId)
    .order('order_index');

  return data || [];
}

/**
 * MAIN: Tạo tasks cho giai đoạn mới theo luồng
 * 
 * @returns {{ tasks: Array, flowStep: Object|null, templateSet: Object|null }}
 */
async function createStageTasksFromFlow(projectId, stageId, stageSlug, userId, assigneeId) {
  // 1. Tìm flow step
  const flowStep = await findFlowStep(projectId, stageSlug);
  
  // 2. Tìm template set
  let templateSet = null;
  let templateTasks = [];

  if (flowStep) {
    // Nếu flow_step có template_set_id → dùng trực tiếp
    if (flowStep.template_set_id) {
      const { data } = await supabase.from('company_template_sets')
        .select('id, name').eq('id', flowStep.template_set_id).single();
      templateSet = data;
    }
    // Không có → tìm default của company
    if (!templateSet && flowStep.company_unit_id) {
      templateSet = await findDefaultTemplateSet(flowStep.company_unit_id);
    }
  }

  // 3. Lấy template tasks
  if (templateSet) {
    templateTasks = await getTemplateTasks(templateSet.id, stageId);
  }

  // 4. Fallback: hardcoded defaults nếu không có template
  if (!templateTasks.length) {
    const defaults = {
      consulting: [
        { title: 'Tiếp nhận & tìm hiểu yêu cầu KH', priority: 'high' },
        { title: 'Tư vấn giải pháp tủ bếp', priority: 'medium' },
        { title: 'Hẹn lịch khảo sát', priority: 'medium' },
      ],
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
        { title: 'Đặt mua & chuẩn bị vật tư', priority: 'high' },
        { title: 'Gia công CNC', priority: 'high' },
        { title: 'Lắp ráp & hoàn thiện', priority: 'medium' },
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
    templateTasks = (defaults[stageSlug] || []).map((t, i) => ({
      title: t.title, priority: t.priority, order_index: i,
    }));
  }

  if (!templateTasks.length) return { tasks: [], flowStep, templateSet };

  // 5. Insert tasks
  const taskAssignee = flowStep?.supervisor_id || assigneeId || null;
  
  const { data: inserted, error } = await supabase.from('tasks').insert(
    templateTasks.map((t, i) => ({
      project_id: projectId,
      stage_id: stageId,
      title: t.title,
      description: t.description || null,
      priority: t.priority || 'medium',
      status: 'pending',
      created_by_id: userId,
      order_index: t.order_index ?? i,
      assignee_id: taskAssignee,
      estimated_hours: t.estimated_hours || null,
      task_type: 'project',
    }))
  ).select();

  if (error) {
    console.error('stageFlow: insert tasks error:', error.message);
    return { tasks: [], flowStep, templateSet };
  }

  // 6. Insert checklists
  for (const tmpl of templateTasks) {
    const items = tmpl.checklist_items;
    if (items?.length) {
      const newTask = (inserted || []).find(t => t.title === tmpl.title);
      if (newTask) {
        await supabase.from('task_checklists').insert(
          items.map((c, j) => ({
            task_id: newTask.id,
            title: typeof c === 'string' ? c : c.title,
            order_index: j,
          }))
        );
      }
    }
  }

  return { tasks: inserted || [], flowStep, templateSet };
}

/**
 * Lấy thông tin Khối hiện tại cho DA
 */
async function getCurrentDivision(projectId, stageSlug) {
  const flowStep = await findFlowStep(projectId, stageSlug);
  if (!flowStep) return null;
  return {
    divisionId: flowStep.division_unit_id,
    divisionName: flowStep.division?.name,
    companyId: flowStep.company_unit_id,
  };
}

module.exports = {
  createStageTasksFromFlow,
  findFlowStep,
  findDefaultTemplateSet,
  getTemplateTasks,
  getCurrentDivision,
  STAGE_DIVISION_MAP,
};

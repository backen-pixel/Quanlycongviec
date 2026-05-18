/**
 * generateFlowTasks — Shared task generation logic
 * Used by: create-with-flow (projects.js) AND convert-to-deal (crm.js)
 * 
 * Logic: For each flow step:
 * 1. Load template tasks → collect which stage slugs are covered
 * 2. Create template tasks FIRST (these REPLACE process tasks for matching stages)
 * 3. Create process tasks → SKIP entire process if its stage is already covered by template
 * 
 * NOTE: company_process_tasks has NO stage_id column.
 *       Stage is determined by process name → PROCESS_STAGE_MAP.
 *       company_template_tasks HAS stage_id → join workflow_stages for slug.
 */

const { supabase } = require('../config/supabase');

// Process name → stage slug mapping
const PROCESS_STAGE_MAP = {
  'Tiếp nhận & Tư vấn': 'consulting',
  'Thiết kế': 'design',
  'Báo giá & Hợp đồng': 'quotation',
  'Sản xuất': 'production',
  'Vận chuyển & Lắp đặt': 'delivery',
  'Giao hàng': 'delivery',
  'Giao hàng ': 'delivery',
  'Lắp đặt': 'delivery',
  'Bảo hành & CSKH': 'customer-care',
  'Chăm sóc KH': 'customer-care',
  'Chăm sóc khách hàng': 'customer-care',
};

/**
 * Generate tasks for a single flow step
 * @param {Object} opts
 * @param {string} opts.projectId - Project ID
 * @param {string} opts.flowStepId - workflow_flow_steps.id
 * @param {string|null} opts.templateSetId - chosen/default template set ID
 * @param {string} opts.userId - created_by user ID
 * @param {Object} opts.taskAssignments - { taskId: userId } override map (optional)
 * @returns {Object[]} created tasks
 */
async function generateStepTasks({ projectId, flowStepId, templateSetId, userId, taskAssignments = {} }) {
  const createdTasks = [];

  // Auto-resolve template set if not provided
  if (!templateSetId) {
    // Get step's division/company info to find default template set
    const { data: step } = await supabase.from('workflow_flow_steps')
      .select('division_unit_id, company_unit_id, template_set_id')
      .eq('id', flowStepId).single();
    
    if (step?.template_set_id) {
      templateSetId = step.template_set_id;
    } else if (step?.company_unit_id) {
      const { data: sets } = await supabase.from('company_template_sets')
        .select('id').eq('unit_id', step.company_unit_id).eq('is_default', true).eq('is_active', true).limit(1);
      if (sets?.length) templateSetId = sets[0].id;
    }
    if (!templateSetId && step?.division_unit_id) {
      const { data: units } = await supabase.from('ecosystem_units')
        .select('id').eq('parent_id', step.division_unit_id).eq('is_active', true);
      const unitIds = (units || []).map(u => u.id);
      if (unitIds.length) {
        const { data: sets } = await supabase.from('company_template_sets')
          .select('id').in('unit_id', unitIds).eq('is_default', true).eq('is_active', true).limit(1);
        if (sets?.length) templateSetId = sets[0].id;
      }
    }
    if (templateSetId) console.log(`  [generateStepTasks] Auto-resolved template: ${templateSetId.substring(0,8)}`);
  }

  // ── 1. Load template tasks & collect covered stage slugs ──
  const templateStageSlugs = new Set();
  let templateTasks = [];
  if (templateSetId) {
    const { data: tplTasks } = await supabase.from('company_template_tasks')
      .select('*, checklists:company_template_checklists(*), stage:workflow_stages(id,name,slug)')
      .eq('template_set_id', templateSetId)
      .order('order_index');
    templateTasks = tplTasks || [];
    templateTasks.forEach(t => {
      if (t.stage?.slug) templateStageSlugs.add(t.stage.slug.replace(/-[a-f0-9]{8}$/, ''));
    });
    console.log(`  [generateStepTasks] Template ${templateSetId.substring(0, 8)}: ${templateTasks.length} tasks, covers: [${[...templateStageSlugs]}]`);
  }

  // ── 2. Create template tasks ──
  for (const t of templateTasks) {
    const overrideAssignee = taskAssignments[t.id] || null;
    const finalAssignee = overrideAssignee || t.default_assignee_id || null;

    const { data: task, error: taskErr } = await supabase.from('tasks').insert({
      project_id: projectId,
      stage_id: t.stage_id,
      title: t.title,
      description: t.description || null,
      assignee_id: finalAssignee,
      priority: t.priority || 'medium',
      status: 'pending',
      order_index: t.order_index,
      created_by_id: userId,
      deadline: null,
      task_type: 'project',
      metadata: { template_task_id: t.id, template_set_id: templateSetId, flow_step_id: flowStepId },
    }).select().single();

    if (taskErr) { console.error('  [generateStepTasks] Template task error:', taskErr.message); continue; }

    // Create checklists
    if (t.checklists?.length && task) {
      for (const c of t.checklists) {
        try {
          await supabase.from('task_checklists').insert({
            task_id: task.id,
            title: c.title || c.label,
            order_index: c.order_index || 0,
            is_completed: false,
          });
        } catch (ce) { console.warn('  [generateStepTasks] Template CL:', ce.message); }
      }
    }

    if (task) createdTasks.push(task);
  }

  // ── 3. Create process tasks — SKIP if stage covered by template ──
  try {
    const { data: stepProcs } = await supabase.from('flow_step_processes')
      .select('*, process:company_processes(id, name)')
      .eq('flow_step_id', flowStepId)
      .order('order_index');

    for (const sp of (stepProcs || [])) {
      const processName = sp.process?.name?.trim() || '';
      const processSlug = PROCESS_STAGE_MAP[processName];

      // SKIP entire process if template covers this stage
      if (processSlug && templateStageSlugs.has(processSlug)) {
        console.log(`  [generateStepTasks] SKIP process "${processName}" (${processSlug} covered by template)`);
        continue;
      }

      const { data: procTasks } = await supabase.from('company_process_tasks')
        .select('*, checklists:company_process_checklists(*)')
        .eq('process_id', sp.process_id)
        .order('order_index');

      console.log(`  [generateStepTasks] Process "${processName}": ${procTasks?.length || 0} tasks`);

      for (const pt of (procTasks || [])) {
        const taskKey = `process_task_${pt.id}`;
        const finalAssignee = taskAssignments[taskKey] || pt.default_assignee_id || null;

        const { data: task, error: taskErr } = await supabase.from('tasks').insert({
          project_id: projectId,
          stage_id: null,
          title: pt.title,
          description: pt.description || null,
          assignee_id: finalAssignee,
          priority: pt.priority || 'medium',
          status: 'pending',
          order_index: pt.order_index || 0,
          created_by_id: userId,
          deadline: null,
          task_type: 'project',
          metadata: { process_id: sp.process_id, process_task_id: pt.id, process_name: processName, flow_step_id: flowStepId },
        }).select().single();

        if (taskErr) { console.error('  [generateStepTasks] Process task error:', taskErr.message); continue; }

        if (pt.checklists?.length && task) {
          for (const c of pt.checklists) {
            try {
              await supabase.from('task_checklists').insert({
                task_id: task.id,
                title: c.label || c.title || 'Checklist',
                order_index: c.order_index || 0,
                is_completed: false,
              });
            } catch (ce) { console.warn('  [generateStepTasks] Process CL:', ce.message); }
          }
        }

        if (task) createdTasks.push(task);
      }
    }
  } catch (e) { console.error('  [generateStepTasks] Process tasks error:', e.message); }

  return createdTasks;
}

/**
 * Generate tasks for entire flow (all steps)
 * @param {Object} opts
 * @param {string} opts.projectId
 * @param {string} opts.flowId
 * @param {Object} opts.stepTemplateSets - { flowStepId: templateSetId } user choices
 * @param {string} opts.userId
 * @param {Object} opts.taskAssignments - optional override map
 * @returns {Object[]} all created tasks
 */
async function generateFlowTasks({ projectId, flowId, stepTemplateSets = {}, userId, taskAssignments = {} }) {
  const allCreatedTasks = [];

  // Load flow steps
  const { data: flowSteps } = await supabase.from('workflow_flow_steps')
    .select('id, order_index, division_unit_id, company_unit_id, template_set_id')
    .eq('flow_id', flowId)
    .order('order_index');

  console.log(`[generateFlowTasks] Flow ${flowId.substring(0, 8)}: ${flowSteps?.length || 0} steps`);

  for (const step of (flowSteps || [])) {
    // Resolve template set: user-chosen > step default > auto-find default
    let resolvedTemplateSetId = stepTemplateSets[step.id] || step.template_set_id || null;

    // Auto-find default template set if none specified
    if (!resolvedTemplateSetId && step.company_unit_id) {
      const { data: defaultSets } = await supabase.from('company_template_sets')
        .select('id')
        .eq('unit_id', step.company_unit_id)
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1);
      if (defaultSets?.length) resolvedTemplateSetId = defaultSets[0].id;
    }
    if (!resolvedTemplateSetId && step.division_unit_id) {
      const { data: companyUnits } = await supabase.from('ecosystem_units')
        .select('id').eq('parent_id', step.division_unit_id).eq('is_active', true);
      const unitIds = (companyUnits || []).map(u => u.id);
      if (unitIds.length) {
        const { data: defaultSets } = await supabase.from('company_template_sets')
          .select('id')
          .in('unit_id', unitIds)
          .eq('is_default', true)
          .eq('is_active', true)
          .limit(1);
        if (defaultSets?.length) resolvedTemplateSetId = defaultSets[0].id;
      }
    }

    console.log(`[generateFlowTasks] Step ${step.order_index}: template=${resolvedTemplateSetId?.substring(0, 8) || 'none'}`);

    // Save project_company_assignment
    try {
      if (step.division_unit_id) {
        await supabase.from('project_company_assignments').upsert({
          project_id: projectId,
          division_unit_id: step.division_unit_id,
          company_unit_id: step.company_unit_id,
          template_set_id: resolvedTemplateSetId,
          order_index: step.order_index || 0,
          status: step.order_index === 0 ? 'in_progress' : 'pending',
          started_at: step.order_index === 0 ? new Date().toISOString() : null,
        }, { onConflict: 'project_id,division_unit_id' });
      }
    } catch (e) { console.error('[generateFlowTasks] Assignment upsert:', e.message); }

    // Generate tasks for this step
    const stepTasks = await generateStepTasks({
      projectId,
      flowStepId: step.id,
      templateSetId: resolvedTemplateSetId,
      userId,
      taskAssignments,
    });

    allCreatedTasks.push(...stepTasks);
  }

  console.log(`[generateFlowTasks] Total: ${allCreatedTasks.length} tasks created`);
  return allCreatedTasks;
}

module.exports = { generateFlowTasks, generateStepTasks, PROCESS_STAGE_MAP };

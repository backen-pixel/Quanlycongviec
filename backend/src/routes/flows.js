const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const {
  assertValidModuleKey,
  normalizeModuleKey,
  enrichStepsWithModuleKey,
} = require('../helpers/resolveModuleFlow');
const { normalizeGraphPayload } = require('../helpers/flowGraph');

const r = Router();
r.use(auth);

const optUuid = (v) => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;

/** Cột đồ thị (migration 531) — tách riêng để fallback được khi DB chưa migrate. */
const GRAPH_STEP_FIELDS = ['node_id', 'position_x', 'position_y', 'branch_mode', 'join_mode'];

const isMissingGraphColumn = (msg) =>
  /node_id|position_x|position_y|branch_mode|join_mode|workflow_flow_edges|workflow_flow_conditions|schema cache|Could not find/i
    .test(msg || '');

const stripGraphFields = (row) => {
  const out = { ...row };
  for (const f of GRAPH_STEP_FIELDS) delete out[f];
  return out;
};

/** Map body step → row insert (hỗ trợ module_key, division nullable). */
async function mapStepInsert(flowId, s, i) {
  let moduleKey = normalizeModuleKey(s.module_key) || null;
  if (moduleKey) {
    try {
      moduleKey = await assertValidModuleKey(moduleKey);
    } catch (e) {
      throw e;
    }
  }
  const divisionId = optUuid(s.division_unit_id);
  if (!divisionId && !moduleKey) {
    const err = new Error(`Bước ${i + 1}: cần module_key hoặc division_unit_id`);
    err.status = 400;
    throw err;
  }
  return {
    flow_id: flowId,
    division_unit_id: divisionId,
    company_unit_id: optUuid(s.company_unit_id),
    template_set_id: optUuid(s.template_set_id),
    module_key: moduleKey,
    handoff_trigger: s.handoff_trigger || null,
    order_index: s.order_index ?? i,
    setup_days: s.setup_days || 0,
    setup_hours: s.setup_hours || 0,
    description: s.description || null,
    node_id: s.node_id || null,
    position_x: s.position_x ?? null,
    position_y: s.position_y ?? null,
    branch_mode: s.branch_mode || 'sequential',
    join_mode: s.join_mode || 'all',
  };
}

/** Đọc cạnh + điều kiện của một luồng. Trả rỗng nếu DB chưa migrate 531. */
async function loadFlowGraph(flowId) {
  const { data: edges, error: edgeErr } = await supabase.from('workflow_flow_edges')
    .select('*').eq('flow_id', flowId).order('order_index');
  if (edgeErr) {
    if (isMissingGraphColumn(edgeErr.message)) return { edges: [], conditions: [] };
    throw edgeErr;
  }

  const { data: conditions, error: condErr } = await supabase.from('workflow_flow_conditions')
    .select('*').eq('flow_id', flowId).order('order_index');
  if (condErr) {
    if (isMissingGraphColumn(condErr.message)) return { edges: edges || [], conditions: [] };
    throw condErr;
  }

  // Điều kiện của cạnh trả kèm cặp node để canvas khớp lại mà không cần tra edge_id.
  const edgeById = new Map((edges || []).map((e) => [e.id, e]));
  const enriched = (conditions || []).map((c) => {
    const edge = c.edge_id ? edgeById.get(c.edge_id) : null;
    return {
      ...c,
      source_node_id: edge?.source_node_id || null,
      target_node_id: edge?.target_node_id || null,
    };
  });

  return { edges: edges || [], conditions: enriched };
}

/**
 * Ghi lại toàn bộ đồ thị của luồng (xoá rồi chèn).
 * @returns {{ steps, edges, conditions, warnings }}
 */
async function replaceFlowGraph(flowId, payload) {
  const graph = normalizeGraphPayload(payload);

  const stepRows = [];
  for (let i = 0; i < graph.steps.length; i += 1) {
    stepRows.push(await mapStepInsert(flowId, graph.steps[i], i));
  }

  await supabase.from('workflow_flow_steps').delete().eq('flow_id', flowId);

  let graphSupported = true;
  if (stepRows.length) {
    let { error } = await supabase.from('workflow_flow_steps').insert(stepRows);
    if (error && isMissingGraphColumn(error.message)) {
      graphSupported = false;
      ({ error } = await supabase.from('workflow_flow_steps').insert(stepRows.map(stripGraphFields)));
    }
    if (error && /module_key|handoff_trigger/i.test(error.message || '')) {
      ({ error } = await supabase.from('workflow_flow_steps').insert(stepRows.map((row) => {
        const { module_key, handoff_trigger, ...rest } = stripGraphFields(row);
        return rest;
      })));
    }
    if (error) throw error;
  }

  if (!graphSupported) {
    return { ...graph, edges: [], conditions: [], warnings: [...graph.warnings, 'DB chưa chạy migration 531 — nhánh và điều kiện chưa được lưu'] };
  }

  // Xoá điều kiện trước: điều kiện của cạnh cascade theo edge, của node thì không.
  await supabase.from('workflow_flow_conditions').delete().eq('flow_id', flowId);
  await supabase.from('workflow_flow_edges').delete().eq('flow_id', flowId);

  let savedEdges = [];
  if (graph.edges.length) {
    const { data, error } = await supabase.from('workflow_flow_edges')
      .insert(graph.edges.map((e) => ({ ...e, flow_id: flowId })))
      .select();
    if (error) throw error;
    savedEdges = data || [];
  }

  const edgeIdByPair = new Map(savedEdges.map((e) => [`${e.source_node_id}\u0000${e.target_node_id}`, e.id]));
  const conditionRows = graph.conditions
    .map((c) => {
      const edgeId = c.scope === 'edge'
        ? edgeIdByPair.get(`${c.source_node_id}\u0000${c.target_node_id}`)
        : null;
      if (c.scope === 'edge' && !edgeId) return null;
      return {
        flow_id: flowId,
        scope: c.scope,
        step_node_id: c.scope === 'step' ? c.step_node_id : null,
        edge_id: edgeId,
        condition_type: c.condition_type,
        config: c.config,
        is_required: c.is_required,
        order_index: c.order_index,
      };
    })
    .filter(Boolean);

  let savedConditions = [];
  if (conditionRows.length) {
    const { data, error } = await supabase.from('workflow_flow_conditions').insert(conditionRows).select();
    if (error) throw error;
    savedConditions = data || [];
  }

  return {
    steps: graph.steps,
    edges: savedEdges,
    conditions: savedConditions,
    warnings: graph.warnings,
  };
}

// ═══ Helper: load full step data ═══
async function loadStepDetails(steps) {
  for (const step of steps) {
    // Load companies under division
    if (!step.division_unit_id) {
      step.companies = [];
      step.template_sets = [];
      step.processes = step.processes || [];
      step.available_processes = [];
      if (step.template_set_id) {
        const { data: tasks } = await supabase.from('company_template_tasks')
          .select(`*, checklists:company_template_checklists(*),
            stage:workflow_stages(id,name,slug,color,icon),
            default_assignee:users!company_template_tasks_default_assignee_id_fkey(id,full_name)`)
          .eq('template_set_id', step.template_set_id)
          .order('order_index');
        step.tasks = tasks || [];
      } else {
        step.tasks = [];
      }
      try {
        const { data: stepProcs } = await supabase.from('flow_step_processes')
          .select('*, process:company_processes(id,name,description,color,icon,order_index)')
          .eq('flow_step_id', step.id)
          .order('order_index');
        step.processes = (stepProcs || []).map(sp => ({ ...sp.process, _link_id: sp.id, is_required: sp.is_required }));
      } catch { step.processes = []; }
      continue;
    }
    const { data: companyUnits } = await supabase.from('ecosystem_units')
      .select('id,name,short_name,code')
      .eq('parent_id', step.division_unit_id)
      .eq('is_active', true);
    step.companies = companyUnits || [];

    // Load template sets for chosen company (or all companies in division)
    const unitIds = step.company_unit_id
      ? [step.company_unit_id]
      : (companyUnits || []).map(u => u.id);

    if (unitIds.length) {
      const { data: sets } = await supabase.from('company_template_sets')
        .select('*, unit:ecosystem_units!company_template_sets_unit_id_fkey(id,name,short_name)')
        .in('unit_id', unitIds)
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      step.template_sets = sets || [];
    } else {
      step.template_sets = [];
    }

    // Load tasks for chosen template set
    if (step.template_set_id) {
      const { data: tasks } = await supabase.from('company_template_tasks')
        .select(`*, checklists:company_template_checklists(*),
          stage:workflow_stages(id,name,slug,color,icon),
          default_assignee:users!company_template_tasks_default_assignee_id_fkey(id,full_name)`)
        .eq('template_set_id', step.template_set_id)
        .order('order_index');
      step.tasks = tasks || [];
    } else {
      step.tasks = [];
    }

    // Load company processes linked to this step
    try {
      const { data: stepProcs } = await supabase.from('flow_step_processes')
        .select('*, process:company_processes(id,name,description,color,icon,order_index)')
        .eq('flow_step_id', step.id)
        .order('order_index');
      step.processes = (stepProcs || []).map(sp => ({ ...sp.process, _link_id: sp.id, is_required: sp.is_required }));

      // Load tasks + checklists for each process
      for (const proc of step.processes) {
        const { data: procTasks } = await supabase.from('company_process_tasks')
          .select('*, checklists:company_process_checklists(*)')
          .eq('process_id', proc.id)
          .order('order_index');
        proc.tasks = procTasks || [];
        proc.task_count = procTasks?.length || 0;
      }
    } catch { step.processes = []; }

    // Also load all available processes for the company (for selection)
    if (step.company_unit_id) {
      try {
        const { data: allProcs } = await supabase.from('company_processes')
          .select('id,name,description,color,icon,order_index')
          .eq('company_unit_id', step.company_unit_id)
          .eq('is_active', true)
          .order('order_index');
        step.available_processes = allProcs || [];
      } catch { step.available_processes = []; }
    } else {
      step.available_processes = [];
    }
  }
  return steps;
}

// ═══ LIST all flows (light) ═══
// ?include_inactive=1 → trả cả luồng đang tắt (màn Setup luồng); mặc định chỉ luồng đang bật.
r.get('/', async (req, res) => {
  try {
    const includeInactive = ['1', 'true', 'yes'].includes(String(req.query.include_inactive || '').toLowerCase());
    let q = supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data: flows, error } = await q.order('created_at');
    if (error) throw error;

    for (const f of (flows || [])) {
      const { data: steps } = await supabase.from('workflow_flow_steps')
        .select(`*,
          division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
            level:ecosystem_levels(id,name,icon,color)
          ),
          company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
          template_set:company_template_sets(id,name,project_type)
        `)
        .eq('flow_id', f.id)
        .order('order_index');
      f.steps = enrichStepsWithModuleKey(steps || []);

      // Count tasks per step
      for (const step of f.steps) {
        if (step.template_set_id) {
          const { count } = await supabase.from('company_template_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('template_set_id', step.template_set_id);
          step.task_count = count || 0;
        } else {
          step.task_count = 0;
        }
      }
    }

    // Cạnh + điều kiện của mọi luồng trong một lượt truy vấn
    const flowIds = (flows || []).map((f) => f.id);
    if (flowIds.length) {
      const { data: edges, error: edgeErr } = await supabase.from('workflow_flow_edges')
        .select('*').in('flow_id', flowIds).order('order_index');
      const { data: conditions } = edgeErr
        ? { data: [] }
        : await supabase.from('workflow_flow_conditions')
          .select('*').in('flow_id', flowIds).order('order_index');

      const edgesByFlow = new Map();
      const edgeById = new Map();
      for (const e of (edges || [])) {
        if (!edgesByFlow.has(e.flow_id)) edgesByFlow.set(e.flow_id, []);
        edgesByFlow.get(e.flow_id).push(e);
        edgeById.set(e.id, e);
      }
      const conditionsByFlow = new Map();
      for (const c of (conditions || [])) {
        if (!conditionsByFlow.has(c.flow_id)) conditionsByFlow.set(c.flow_id, []);
        // Kèm cặp node để canvas khớp điều kiện với cạnh mà không cần tra edge_id.
        const edge = c.edge_id ? edgeById.get(c.edge_id) : null;
        conditionsByFlow.get(c.flow_id).push({
          ...c,
          source_node_id: edge?.source_node_id || null,
          target_node_id: edge?.target_node_id || null,
        });
      }
      for (const f of (flows || [])) {
        f.edges = edgesByFlow.get(f.id) || [];
        f.conditions = conditionsByFlow.get(f.id) || [];
      }
    }

    res.json({ flows: flows || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ GET single flow with full details ═══
r.get('/:id', async (req, res) => {
  try {
    const { data: flow, error } = await supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    const { data: steps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color)
        ),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
        template_set:company_template_sets(id,name,project_type)
      `)
      .eq('flow_id', flow.id)
      .order('order_index');

    flow.steps = enrichStepsWithModuleKey(await loadStepDetails(steps || []));
    const graph = await loadFlowGraph(flow.id);
    flow.edges = graph.edges;
    flow.conditions = graph.conditions;
    res.json({ flow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ CREATE flow ═══
// ═══ RESOLVE flow từ chuỗi module (dùng khi người dùng tự ghép luồng lúc tạo dự án) ═══
// Body: { modules: ['production','logistics'], name?, triggers?: { production: 'manual' } }
// Trả về luồng đang bật có đúng chuỗi module đó, tạo mới nếu chưa có.
r.post('/resolve-by-modules', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.modules) ? req.body.modules : [];
    const keys = [];
    for (const m of raw) {
      const k = await assertValidModuleKey(m);
      if (!keys.includes(k)) keys.push(k);
    }
    if (!keys.length) return res.status(400).json({ error: 'Chọn ít nhất một module cho luồng' });

    const { data: flows, error } = await supabase.from('workflow_flows')
      .select('*').eq('is_active', true).order('created_at');
    if (error) throw error;

    const flowIds = (flows || []).map((f) => f.id);
    let stepsByFlow = new Map();
    if (flowIds.length) {
      const { data: allSteps } = await supabase.from('workflow_flow_steps')
        .select('flow_id, module_key, order_index, division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(name, short_name)')
        .in('flow_id', flowIds)
        .order('order_index');
      stepsByFlow = (allSteps || []).reduce((acc, s) => {
        if (!acc.has(s.flow_id)) acc.set(s.flow_id, []);
        acc.get(s.flow_id).push(s);
        return acc;
      }, new Map());
    }

    const sameChain = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    for (const f of (flows || [])) {
      const chain = enrichStepsWithModuleKey(stepsByFlow.get(f.id) || [])
        .map((s) => s.module_key)
        .filter(Boolean);
      if (sameChain(chain, keys)) {
        return res.json({ flow: f, created: false });
      }
    }

    const labels = { crm: 'CRM', projects: 'Dự án', production: 'Sản xuất', logistics: 'Lắp đặt' };
    const chainLabel = keys.map((k) => labels[k] || k).join(' → ');
    const { data: flow, error: insErr } = await supabase.from('workflow_flows')
      .insert({
        name: String(req.body?.name || '').trim() || `Luồng nhanh: ${chainLabel}`,
        description: `Tự ghép khi tạo dự án · ${chainLabel}`,
        color: '#6366F1',
        icon: '⚡',
        is_default: false,
        created_by: req.user.userId,
      })
      .select().single();
    if (insErr) throw insErr;

    const triggers = req.body?.triggers || {};
    const chainSteps = keys.map((key, i) => ({
      node_id: `n-${key}-${i}`,
      module_key: key,
      handoff_trigger: triggers[key] || (i === 0 ? 'manual' : 'on_stage_flag'),
      order_index: i,
      position_x: 80 + i * 324,
      position_y: 160,
    }));
    const chainEdges = chainSteps.slice(0, -1).map((s, i) => ({
      source_node_id: s.node_id,
      target_node_id: chainSteps[i + 1].node_id,
    }));
    await replaceFlowGraph(flow.id, { steps: chainSteps, edges: chainEdges, conditions: [] });

    res.status(201).json({ flow, created: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { name, description, color, icon, is_default, steps, edges, conditions } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tên luồng là bắt buộc' });

    if (is_default) {
      await supabase.from('workflow_flows').update({ is_default: false }).eq('is_default', true);
    }

    const { data: flow, error } = await supabase.from('workflow_flows')
      .insert({
        name: name.trim(),
        description: description || null,
        color: color || '#6366F1',
        icon: icon || '🔄',
        is_default: is_default || false,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) throw error;

    let warnings = [];
    if (steps?.length) {
      ({ warnings } = await replaceFlowGraph(flow.id, { steps, edges, conditions }));
    }

    res.status(201).json({ flow, warnings });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══ UPDATE flow ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { name, description, color, icon, is_default, is_active } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (is_active !== undefined) update.is_active = is_active;
    if (is_default) {
      await supabase.from('workflow_flows').update({ is_default: false }).eq('is_default', true);
      update.is_default = true;
    }

    const { data, error } = await supabase.from('workflow_flows')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ flow: data });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ DELETE flow — xóa hẳn khi chưa dự án nào dùng; đang dùng thì yêu cầu tắt ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { count } = await supabase.from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('flow_id', req.params.id);
    if (count > 0) {
      return res.status(400).json({
        error: `Luồng đang được ${count} dự án sử dụng — hãy tắt luồng thay vì xóa.`,
        in_use: count,
      });
    }

    await supabase.from('workflow_flow_steps').delete().eq('flow_id', req.params.id);
    const { error } = await supabase.from('workflow_flows').delete().eq('id', req.params.id);
    if (error) {
      await supabase.from('workflow_flows').update({ is_active: false }).eq('id', req.params.id);
      return res.json({ ok: true, soft: true });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ UPDATE STEPS (replace all) ═══
r.put('/:id/steps', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { steps, edges, conditions } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'Cần mảng steps' });

    const { warnings } = await replaceFlowGraph(req.params.id, { steps, edges, conditions });

    const { data: flowSteps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color)
        ),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
        template_set:company_template_sets(id,name,project_type)
      `)
      .eq('flow_id', req.params.id)
      .order('order_index');

    const graph = await loadFlowGraph(req.params.id);
    res.json({
      steps: enrichStepsWithModuleKey(flowSteps || []),
      edges: graph.edges,
      conditions: graph.conditions,
      warnings,
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══ CLONE flow ═══
r.post('/:id/clone', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { data: src } = await supabase.from('workflow_flows')
      .select('*').eq('id', req.params.id).single();
    if (!src) return res.status(404).json({ error: 'Luồng không tồn tại' });

    const { data: newFlow, error } = await supabase.from('workflow_flows')
      .insert({
        name: `${src.name} (bản sao)`,
        description: src.description,
        color: src.color,
        icon: src.icon,
        is_default: false,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) throw error;

    const { data: srcSteps } = await supabase.from('workflow_flow_steps')
      .select('*').eq('flow_id', req.params.id).order('order_index');

    if (srcSteps?.length) {
      const srcGraph = await loadFlowGraph(req.params.id);
      await replaceFlowGraph(newFlow.id, {
        steps: srcSteps,
        edges: srcGraph.edges,
        conditions: srcGraph.conditions,
      });
    }

    res.json({ flow: newFlow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// FLOW STEP TASKS & CHECKLISTS (Migration 21)
// ═══════════════════════════════════════════════════════════

// ─── GET flow step tasks ───
r.get('/steps/:stepId/tasks', async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('flow_step_tasks')
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon,color),
        assigned_user:users(id,full_name,email,phone,avatar,role),
        checklists:flow_step_task_checklists(*)
      `)
      .eq('flow_step_id', req.params.stepId)
      .eq('is_active', true)
      .order('order_index');
    
    if (error) throw error;
    res.json({ tasks: tasks || [] });
  } catch (e) {
    console.error('Get flow step tasks error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CREATE flow step task ───
r.post('/steps/tasks', async (req, res) => {
  try {
    const { 
      flow_step_id, title, description, stage_id,
      assigned_user_id, assigned_company_unit_id, assignee_field,
      estimated_days, order_index, template_task_id
    } = req.body;
    
    if (!flow_step_id || !title) {
      return res.status(400).json({ error: 'Cần flow_step_id và title' });
    }
    
    const { data: task, error } = await supabase
      .from('flow_step_tasks')
      .insert({
        flow_step_id,
        title: title.trim(),
        description: description?.trim() || null,
        stage_id: stage_id || null,
        assigned_user_id: assigned_user_id || null,
        assigned_company_unit_id: assigned_company_unit_id || null,
        assignee_field: assignee_field || null,
        estimated_days: estimated_days || 1,
        order_index: order_index || 0,
        template_task_id: template_task_id || null,
      })
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon),
        assigned_user:users(id,full_name,email)
      `)
      .single();
    
    if (error) throw error;
    res.json({ task });
  } catch (e) {
    console.error('Create flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── UPDATE flow step task ───
r.put('/steps/tasks/:taskId', async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'title', 'description', 'stage_id', 
      'assigned_user_id', 'assigned_company_unit_id', 'assignee_field',
      'estimated_days', 'order_index', 'is_active'
    ];
    
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để update' });
    }
    
    const { data: task, error } = await supabase
      .from('flow_step_tasks')
      .update(updates)
      .eq('id', req.params.taskId)
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon),
        assigned_user:users(id,full_name,email)
      `)
      .single();
    
    if (error) throw error;
    res.json({ task });
  } catch (e) {
    console.error('Update flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE flow step task ───
r.delete('/steps/tasks/:taskId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('flow_step_tasks')
      .delete()
      .eq('id', req.params.taskId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Delete flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CREATE checklist for flow step task ───
r.post('/steps/tasks/:taskId/checklists', async (req, res) => {
  try {
    const { label, order_index, is_required, assigned_user_id, template_checklist_id } = req.body;
    
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Cần label' });
    }
    
    const { data: checklist, error } = await supabase
      .from('flow_step_task_checklists')
      .insert({
        flow_step_task_id: req.params.taskId,
        label: label.trim(),
        order_index: order_index || 0,
        is_required: is_required || false,
        assigned_user_id: assigned_user_id || null,
        template_checklist_id: template_checklist_id || null,
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ checklist });
  } catch (e) {
    console.error('Create checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── UPDATE checklist ───
r.put('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['label', 'order_index', 'is_required', 'assigned_user_id'];
    
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });
    
    const { data: checklist, error } = await supabase
      .from('flow_step_task_checklists')
      .update(updates)
      .eq('id', req.params.checklistId)
      .select()
      .single();
    
    if (error) throw error;
    res.json({ checklist });
  } catch (e) {
    console.error('Update checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE checklist ───
r.delete('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('flow_step_task_checklists')
      .delete()
      .eq('id', req.params.checklistId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Delete checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;

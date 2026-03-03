const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══ LIST all flows ═══
r.get('/', async (req, res) => {
  try {
    const { data: flows, error } = await supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at');
    if (error) throw error;

    // Load steps for each flow
    for (const f of (flows || [])) {
      const { data: steps } = await supabase.from('workflow_flow_steps')
        .select(`*,
          division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
            level:ecosystem_levels(id,name,icon,color),
            stage_group:workflow_stage_groups(id,name,slug,icon,color)
          )
        `)
        .eq('flow_id', f.id)
        .order('order_index');
      f.steps = steps || [];
    }

    res.json({ flows: flows || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ GET single flow with details ═══
r.get('/:id', async (req, res) => {
  try {
    const { data: flow, error } = await supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    const { data: steps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color),
          stage_group:workflow_stage_groups(id,name,slug,icon,color)
        )
      `)
      .eq('flow_id', flow.id)
      .order('order_index');
    flow.steps = steps || [];

    // For each step's division, load available template sets (from companies under that division)
    for (const step of flow.steps) {
      // Get company units under this division
      const { data: companyUnits } = await supabase.from('ecosystem_units')
        .select('id,name,short_name')
        .eq('parent_id', step.division_unit_id)
        .eq('is_active', true);

      const unitIds = (companyUnits || []).map(u => u.id);
      let templateSets = [];
      if (unitIds.length) {
        const { data: sets } = await supabase.from('company_template_sets')
          .select('*, unit:ecosystem_units!company_template_sets_unit_id_fkey(id,name,short_name)')
          .in('unit_id', unitIds)
          .eq('is_active', true)
          .order('is_default', { ascending: false });
        templateSets = sets || [];
      }
      step.companies = companyUnits || [];
      step.template_sets = templateSets;
    }

    res.json({ flow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ CREATE flow ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { name, description, color, icon, is_default, steps } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tên luồng là bắt buộc' });

    // If setting as default, unset others
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

    // Create steps
    if (steps?.length) {
      const { error: stepsErr } = await supabase.from('workflow_flow_steps')
        .insert(steps.map((s, i) => ({
          flow_id: flow.id,
          division_unit_id: s.division_unit_id,
          order_index: s.order_index ?? i,
          setup_days: s.setup_days || 0,
          setup_hours: s.setup_hours || 0,
          description: s.description || null,
        })));
      if (stepsErr) console.error('Steps insert error:', stepsErr);
    }

    res.status(201).json({ flow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
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

// ═══ DELETE flow (soft) ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    await supabase.from('workflow_flows')
      .update({ is_active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ UPDATE STEPS (replace all) ═══
r.put('/:id/steps', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { steps } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'Cần mảng steps' });

    // Delete existing steps
    await supabase.from('workflow_flow_steps').delete().eq('flow_id', req.params.id);

    // Insert new steps
    if (steps.length) {
      const { error } = await supabase.from('workflow_flow_steps')
        .insert(steps.map((s, i) => ({
          flow_id: req.params.id,
          division_unit_id: s.division_unit_id,
          order_index: s.order_index ?? i,
          setup_days: s.setup_days || 0,
          setup_hours: s.setup_hours || 0,
          description: s.description || null,
        })));
      if (error) throw error;
    }

    // Return updated flow
    const { data: flowSteps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color)
        )
      `)
      .eq('flow_id', req.params.id)
      .order('order_index');

    res.json({ steps: flowSteps || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ CLONE flow ═══
r.post('/:id/clone', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    // Get source flow
    const { data: src } = await supabase.from('workflow_flows')
      .select('*').eq('id', req.params.id).single();
    if (!src) return res.status(404).json({ error: 'Luồng không tồn tại' });

    // Clone flow
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

    // Clone steps
    const { data: srcSteps } = await supabase.from('workflow_flow_steps')
      .select('*').eq('flow_id', req.params.id).order('order_index');

    if (srcSteps?.length) {
      await supabase.from('workflow_flow_steps')
        .insert(srcSteps.map(s => ({
          flow_id: newFlow.id,
          division_unit_id: s.division_unit_id,
          order_index: s.order_index,
          setup_days: s.setup_days,
          setup_hours: s.setup_hours,
          description: s.description,
        })));
    }

    res.json({ flow: newFlow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = r;

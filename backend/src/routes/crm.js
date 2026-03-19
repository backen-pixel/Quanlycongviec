const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
let autoFlowFns = {};
try { autoFlowFns = require('../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
const { onLeadWon = async () => null, onOrderConfirmed = async () => null, onQuotationAccepted = async () => null, onProjectCompleted = async () => null, getProjectCRMSummary = async () => ({}), getOverdueFollowUps = async () => [], getStaleLeads = async () => [], createProjectFromLead = async () => null } = autoFlowFns;

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Auto-generate code (LEAD-2026-001, BG-2026-001...)
// ═══════════════════════════════════════════════════════════════════════════
async function nextCode(prefix) {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', prefix)
    .single();

  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix, current_number: num, year });
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
r.get('/dashboard', async (req, res) => {
  try {
    const { type = 'lead' } = req.query; // 'lead' or 'deal'

    // Pipeline stages for the specified type
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
      .eq('is_active', true)
      .eq('pipeline_type', type)
      .order('order_index');

    // Leads/Deals count per stage
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type')
      .eq('type', type);

    const stageStats = (stages || []).map(s => {
      const stageLeads = (leads || []).filter(l => l.stage_id === s.id);
      return {
        ...s,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0),
        weighted: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0) * (l.probability || 0) / 100, 0),
      };
    });

    // KPIs split by type
    const totalItems = (leads || []).length;
    const wonItems = (leads || []).filter(l => {
      const st = (stages || []).find(s => s.id === l.stage_id);
      return st?.is_won;
    });
    const totalValue = (leads || []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonValue = wonItems.reduce((s, l) => s + (l.estimated_value || 0), 0);

    let kpis = {};
    if (type === 'lead') {
      // Lead KPIs
      const { data: allLeads } = await supabase.from('crm_leads').select('id, type').eq('type', 'lead');
      const { data: dealsConverted } = await supabase.from('crm_leads').select('id, type').eq('type', 'deal');
      const conversionRate = (allLeads?.length || 0) > 0 
        ? Math.round((dealsConverted?.length || 0) / (allLeads.length) * 100)
        : 0;
      kpis = {
        total_leads: totalItems,
        converted_to_deals: dealsConverted?.length || 0,
        conversion_rate: conversionRate,
        total_value: totalValue,
        conversion_value: wonValue,
      };
    } else {
      // Deal KPIs
      kpis = {
        total_deals: totalItems,
        won_deals: wonItems.length,
        won_rate: totalItems > 0 ? Math.round(wonItems.length / totalItems * 100) : 0,
        total_value: totalValue,
        won_value: wonValue,
      };
    }

    // Recent quotations (only for deal dashboard)
    let recentQuotes = [];
    if (type === 'deal') {
      const { data } = await supabase
        .from('quotations')
        .select('id, code, title, total, status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      recentQuotes = data || [];
    }

    // Recent orders (only for deal dashboard)
    let recentOrders = [];
    if (type === 'deal') {
      const { data } = await supabase
        .from('orders')
        .select('id, code, title, total, status, payment_status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      recentOrders = data || [];
    }

    res.json({
      pipeline: stageStats,
      kpis,
      recent_quotations: recentQuotes,
      recent_orders: recentOrders,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STAGES (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/pipeline-stages', async (req, res) => {
  const { type = 'lead' } = req.query; // Filter by lead or deal
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('*')
    .eq('is_active', true)
    .eq('pipeline_type', type)
    .order('order_index');
  res.json(data || []);
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES
// ═══════════════════════════════════════════════════════════════════════════
r.get('/sources', async (req, res) => {
  const { data } = await supabase.from('crm_sources').select('*').eq('is_active', true).order('name');
  res.json(data || []);
});

// ═══════════════════════════════════════════════════════════════════════════
// LEADS (CRUD + Pipeline)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads', async (req, res) => {
  try {
    const { stage_id, assigned_to, source_id, search, limit = 100, type = 'lead' } = req.query;
    let q = supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name)')
      .eq('type', type) // Filter by type: lead or deal
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (stage_id) q = q.eq('stage_id', stage_id);
    if (assigned_to) q = q.eq('assigned_to', assigned_to);
    if (source_id) q = q.eq('source_id', source_id);
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/leads', async (req, res) => {
  try {
    const code = await nextCode('LEAD');
    // Clean empty strings → null for UUID fields
    const body = { ...req.body };
    ['customer_id', 'source_id', 'stage_id', 'assigned_to'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });
    const { data, error } = await supabase.from('crm_leads')
      .insert({ ...body, code, type: 'lead', created_by: req.user.userId })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages(id, name, color, icon)')
      .single();
    if (error) throw error;

    // 🔴 REMOVED: Auto project creation on lead create
    // Lead is just a lead — user must explicitly convert to deal later

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET single lead/deal by ID (regardless of type)
r.get('/leads/:id/detail', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code), stage:crm_pipeline_stages(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('crm_leads')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages(id, name, color, icon)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/leads/:id', async (req, res) => {
  try {
    // Get lead info + linked project
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, title, project_id')
      .eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    // Delete linked project if exists (cascade: tasks, checklists, comments, etc.)
    if (lead.project_id) {
      console.log(`Deleting lead ${lead.id} → cascade delete project ${lead.project_id}`);

      // Delete task sub-tables first
      const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', lead.project_id);
      if (taskIds?.length) {
        const ids = taskIds.map(t => t.id);
        await supabase.from('task_checklists').delete().in('task_id', ids).catch(() => {});
        await supabase.from('task_comments').delete().in('task_id', ids).catch(() => {});
        await supabase.from('task_participants').delete().in('task_id', ids).catch(() => {});
        await supabase.from('task_time_logs').delete().in('task_id', ids).catch(() => {});
        await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids).catch(() => {});
      }

      // Delete project related tables
      await supabase.from('tasks').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('project_comments').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('stage_transitions').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('project_workflow_lines').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('project_products').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('project_company_assignments').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('project_approvals').delete().eq('project_id', lead.project_id).catch(() => {});
      await supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id).catch(() => {});
      await supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id).catch(() => {});

      // Delete the project
      await supabase.from('projects').delete().eq('id', lead.project_id);
      console.log(`Project ${lead.project_id} deleted`);
    }

    // Delete lead documents
    await supabase.from('lead_documents').delete().eq('lead_id', lead.id).catch(() => {});

    // Delete lead activities
    await supabase.from('lead_activities').delete().eq('lead_id', lead.id).catch(() => {});

    // Delete lead
    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    if (error) throw error;

    res.json({ success: true, message: `Đã xóa lead "${lead.title}"${lead.project_id ? ' và dự án liên kết' : ''}` });
  } catch (e) {
    console.error('Delete lead error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get lead documents
r.get('/leads/:id/documents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add document to lead
r.post('/leads/:id/documents', async (req, res) => {
  try {
    const { name, doc_type, file_url, file_name, file_size, mime_type, notes } = req.body;
    const { data, error } = await supabase
      .from('lead_documents')
      .insert({
        lead_id: req.params.id,
        name: name || file_name || 'Tài liệu',
        doc_type: doc_type || 'other',
        file_url,
        file_name,
        file_size,
        mime_type,
        notes,
        created_by: req.user.userId,
      })
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete document
r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .eq('lead_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT LEAD → DEAL
// ═══════════════════════════════════════════════════════════════════════════

r.post('/leads/:id/convert-to-deal', async (req, res) => {
  try {
    const { flow_id, step_template_sets } = req.body;
    // step_template_sets = { step_id: template_set_id, ... } — user's choice per step
    console.log('=== CONVERT-TO-DEAL REQUEST ===');
    console.log('flow_id:', flow_id);
    console.log('step_template_sets:', JSON.stringify(step_template_sets));
    console.log('step_template_sets keys:', step_template_sets ? Object.keys(step_template_sets) : 'null');
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('*, customer:customers(id, full_name, phone)')
      .eq('id', req.params.id)
      .single();
    
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    // Validation
    const { data: docs } = await supabase
      .from('lead_documents')
      .select('id')
      .eq('lead_id', req.params.id)
      .limit(1);

    if (!lead.customer_id || !lead.customer?.full_name || !lead.customer?.phone) {
      return res.status(400).json({ error: 'Khách hàng chưa đủ thông tin (tên, SĐT)' });
    }

    if (!docs?.length) {
      return res.status(400).json({ error: 'Chưa upload tài liệu' });
    }

    if (!flow_id) {
      return res.status(400).json({ error: 'Chưa chọn luồng quy trình' });
    }

    // Get first deal stage
    const { data: firstDealStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .single();

    if (!firstDealStage) {
      return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal đầu tiên. Hãy chạy SQL migration.' });
    }

    // Get "Chuyển Deal" stage (is_won in lead pipeline) to mark lead as won
    const { data: leadWonStages } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'lead')
      .eq('is_won', true)
      .eq('is_active', true)
      .limit(1);
    const leadWonStageId = leadWonStages?.[0]?.id || lead.stage_id;

    // Get consulting stage
    const { data: consultingStages } = await supabase
      .from('workflow_stages')
      .select('id')
      .eq('slug', 'consulting')
      .eq('is_active', true)
      .limit(1);
    const consultingStageId = consultingStages?.[0]?.id || null;

    // Generate project code
    const yr = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code').like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) : 0;
    const code = `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;

    // Create project
    const projectInsert = {
      code,
      name: lead.title,
      status: 'consulting',
      customer_id: lead.customer_id,
      flow_id: flow_id,
      created_by: req.user.userId,
    };
    if (lead.estimated_value) projectInsert.estimated_value = lead.estimated_value;
    if (consultingStageId) projectInsert.current_stage_id = consultingStageId;

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectInsert)
      .select('*')
      .single();

    if (projectError) throw projectError;

    // ═══════════════════════════════════════════════════════════════
    // Generate tasks from flow: processes + template set (user-chosen or default)
    // NO hardcoded 24-task fallback — only flow-defined tasks
    // ═══════════════════════════════════════════════════════════════
    let allCreatedTasks = [];
    try {
      // Get flow steps
      const { data: flowSteps } = await supabase
        .from('workflow_flow_steps')
        .select(`
          id, order_index, division_unit_id, company_unit_id, template_set_id,
          division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name),
          company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name)
        `)
        .eq('flow_id', flow_id)
        .order('order_index');

      console.log(`Convert-to-deal: flow ${flow_id} has ${flowSteps?.length || 0} steps`);

      // Pre-load: map division_unit_id → stage_group → workflow_stage.id
      // So we can assign correct stage_id to tasks
      const divStageMap = {}; // { division_unit_id: [stage_id, ...] }
      try {
        const { data: stageGroups } = await supabase.from('workflow_stage_groups')
          .select('id, slug, division_unit_id')
          .eq('is_active', true);
        const { data: globalStages } = await supabase.from('workflow_stages')
          .select('id, slug, order_index')
          .is('company_id', null)
          .eq('is_active', true)
          .order('order_index');

        // Map stage_group slug → workflow stages
        const slugToStageMap = {
          'business': ['consulting', 'design', 'quotation', 'contract'],
          'production': ['production'],
          'shipping': ['shipping'],
          'installation': ['installation', 'customer-care'],
          'customer-care': ['customer-care'],
        };

        for (const sg of (stageGroups || [])) {
          if (!sg.division_unit_id) continue;
          const stageSlugs = slugToStageMap[sg.slug] || [];
          const stageIds = stageSlugs
            .map(slug => (globalStages || []).find(s => s.slug === slug)?.id)
            .filter(Boolean);
          if (stageIds.length) {
            divStageMap[sg.division_unit_id] = stageIds;
          }
        }
        console.log('  divStageMap:', Object.fromEntries(
          Object.entries(divStageMap).map(([k,v]) => [k.substring(0,8), v.map(id=>id.substring(0,8))])
        ));
      } catch (e) { console.error('Stage map error:', e.message); }

      if (flowSteps?.length) {
        for (const step of flowSteps) {
          // ── Resolve template set: user-chosen > step default > auto-find default for company ──
          let resolvedTemplateSetId = (step_template_sets && step_template_sets[step.id]) || step.template_set_id || null;
          console.log(`  Step ${step.id} (order=${step.order_index}): user_chose=${step_template_sets ? step_template_sets[step.id] || 'none' : 'no map'}, step_default=${step.template_set_id || 'none'}, resolved=${resolvedTemplateSetId || 'none'}`);

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
          // If still none, try any template set under division's companies
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

          // Resolve stage_ids for this step's division
          const stepStageIds = divStageMap[step.division_unit_id] || [];
          const defaultStageId = stepStageIds[0] || null;

          console.log(`  Step ${step.order_index} (defaultStage=${defaultStageId?.substring(0,8)||'none'}): template_set=${resolvedTemplateSetId || 'none'}`);

          // Save project_company_assignment
          try {
            if (step.division_unit_id) {
              await supabase.from('project_company_assignments').upsert({
                project_id: project.id,
                division_unit_id: step.division_unit_id,
                company_unit_id: step.company_unit_id,
                template_set_id: resolvedTemplateSetId,
                order_index: step.order_index || 0,
                status: step.order_index === 0 ? 'in_progress' : 'pending',
                started_at: step.order_index === 0 ? new Date().toISOString() : null,
              }, { onConflict: 'project_id,division_unit_id' });
            }
          } catch (e) { console.error('Assignment upsert:', e.message); }

          // ═══ TASK GENERATION: Bộ Mẫu ưu tiên, Processes là fallback ═══
          // Nếu có bộ mẫu (user chọn hoặc default) VÀ bộ mẫu có tasks → dùng bộ mẫu
          // Nếu không có bộ mẫu hoặc bộ mẫu rỗng → dùng processes

          let usedTemplateSet = false;

          // ── TRY: Generate tasks from TEMPLATE SET first ──
          if (resolvedTemplateSetId) {
            const { data: tplTasks } = await supabase.from('company_template_tasks')
              .select('*, checklists:company_template_checklists(*)')
              .eq('template_set_id', resolvedTemplateSetId)
              .order('order_index');

            console.log(`    Template set ${resolvedTemplateSetId.substring(0,8)}: ${tplTasks?.length || 0} tasks`);

            if (tplTasks?.length) {
              usedTemplateSet = true;
              for (const t of tplTasks) {
                let deadline = null;
                if (t.deadline_days > 0) {
                  const d = new Date();
                  d.setDate(d.getDate() + t.deadline_days);
                  deadline = d.toISOString();
                }

                // Map template task stage_id, fallback to default
                const taskStageId = t.stage_id || defaultStageId;

                const { data: task, error: taskErr } = await supabase.from('tasks').insert({
                  project_id: project.id,
                  stage_id: taskStageId,
                  title: t.title,
                  description: t.description || null,
                  assignee_id: t.assigned_user_id || t.default_assignee_id || null,
                  priority: t.priority || 'medium',
                  status: 'pending',
                  order_index: t.order_index,
                  created_by_id: req.user.userId,
                  deadline,
                  task_type: 'project',
                  metadata: { template_task_id: t.id, template_set_id: resolvedTemplateSetId, flow_step_id: step.id },
                }).select().single();

                if (taskErr) { console.error('Template task error:', taskErr); continue; }

                if (t.checklists?.length && task) {
                  console.log(`      → ${t.checklists.length} template checklists for task ${task.id.substring(0,8)}`);
                  for (const c of t.checklists) {
                    try {
                      const { error: clErr } = await supabase.from('task_checklists').insert({
                        task_id: task.id,
                        title: c.title || c.label,
                        order_index: c.order_index || 0,
                        is_completed: false,
                      });
                      if (clErr) console.error('      ❌ Template CL error:', clErr.message);
                    } catch (ce) { console.warn('      ❌ Template checklist:', ce.message); }
                  }
                }

                if (task) allCreatedTasks.push(task);
              }
            }
          }

          // ── FALLBACK: Generate tasks from PROCESSES (only if no template tasks) ──
          if (!usedTemplateSet) {
            console.log(`    No template tasks → using processes`);
            try {
            const { data: stepProcs } = await supabase.from('flow_step_processes')
              .select('*, process:company_processes(id,name,icon,order_index)')
              .eq('flow_step_id', step.id)
              .order('order_index');

            if (stepProcs?.length) {
              for (let procIdx = 0; procIdx < stepProcs.length; procIdx++) {
                const sp = stepProcs[procIdx];
                const proc = sp.process;
                if (!proc) continue;

                // Map process to correct stage:
                // Each process in a Khối corresponds to a stage in order
                // e.g. KD: process 0→consulting, 1→design, 2→quotation
                const processStageId = stepStageIds[procIdx] || defaultStageId;

                const { data: procTasks } = await supabase.from('company_process_tasks')
                  .select('*, checklists:company_process_checklists(*)')
                  .eq('process_id', proc.id)
                  .order('order_index');

                console.log(`    Process ${proc.name}: ${procTasks?.length || 0} tasks`);

                for (const t of (procTasks || [])) {
                  let deadline = null;
                  if (t.deadline_days > 0 || t.deadline_hours > 0) {
                    const d = new Date();
                    if (t.deadline_days > 0) d.setDate(d.getDate() + t.deadline_days);
                    if (t.deadline_hours > 0) d.setHours(d.getHours() + t.deadline_hours);
                    deadline = d.toISOString();
                  }

                  const { data: task, error: taskErr } = await supabase.from('tasks').insert({
                    project_id: project.id,
                    stage_id: t.stage_id || processStageId,
                    title: t.title,
                    description: t.description || null,
                    assignee_id: t.assigned_user_id || t.default_assignee_id || null,
                    priority: t.priority || 'medium',
                    status: 'pending',
                    order_index: t.order_index,
                    created_by_id: req.user.userId,
                    deadline,
                    task_type: 'project',
                    metadata: { process_id: proc.id, process_task_id: t.id, flow_step_id: step.id },
                  }).select().single();

                  if (taskErr) { console.error('Process task error:', taskErr); continue; }

                  if (t.checklists?.length && task) {
                    console.log(`      → ${t.checklists.length} checklists to insert for task ${task.id.substring(0,8)}`);
                    for (const c of t.checklists) {
                      try {
                        const clInsert = {
                          task_id: task.id,
                          title: c.title || c.label,
                          order_index: c.order_index || 0,
                          is_completed: false,
                        };
                        const { data: clResult, error: clError } = await supabase.from('task_checklists').insert(clInsert).select().single();
                        if (clError) console.error('      ❌ Checklist insert error:', clError.message, JSON.stringify(clInsert));
                        else console.log('      ✅ CL:', c.title);
                      } catch (ce) { console.warn('      ❌ Process checklist exception:', ce.message); }
                    }
                  } else if (task) {
                    console.log(`      → 0 checklists for task ${task.id.substring(0,8)}`);
                  }

                  if (task) allCreatedTasks.push(task);
                }
              }
            }
          } catch (procErr) { console.error('Process tasks error:', procErr.message); }
          } // end if (!usedTemplateSet)
        }
      }

      console.log(`Convert-to-deal: Total ${allCreatedTasks.length} tasks created from flow`);
    } catch (flowErr) {
      console.error('Flow task generation error:', flowErr);
    }

    // ═══════════════════════════════════════════════════════════════
    // Auto-complete consulting tasks (tư vấn xong vì lead→deal)
    // ═══════════════════════════════════════════════════════════════
    if (consultingStageId) {
      try {
        await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('project_id', project.id)
          .eq('stage_id', consultingStageId);
      } catch (e) { console.error('Auto complete consulting:', e.message); }
    }

    // ═══════════════════════════════════════════════════════════════
    // Update lead → deal + mark lead pipeline as WON (Chuyển Deal)
    // ═══════════════════════════════════════════════════════════════
    const { data: updatedLead, error: leadError } = await supabase
      .from('crm_leads')
      .update({
        type: 'deal',
        stage_id: firstDealStage.id,
        project_id: project.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (leadError) throw leadError;

    // Log activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '🚀 Chuyển sang Deal',
        description: `Lead chuyển thành Deal — Dự án ${project.code} đã tạo (${allCreatedTasks.length} nhiệm vụ)`,
        created_by: req.user.userId,
      });
    } catch (_) {}

    res.status(201).json({
      lead: updatedLead,
      project,
      tasks_created: allCreatedTasks.length,
      message: `Đã chuyển Lead sang Deal. Dự án ${project.code} đã được tạo với ${allCreatedTasks.length} nhiệm vụ.`,
    });
  } catch (e) {
    console.error('Convert to deal error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MOVE LEAD/DEAL TO STAGE (with validation for deal pipeline)
// ═══════════════════════════════════════════════════════════════════════════
r.patch('/leads/:id/stage', async (req, res) => {
  try {
    const { stage_id } = req.body;
    const { data: lead } = await supabase.from('crm_leads').select('type').eq('id', req.params.id).single();
    
    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('is_won, is_lost, pipeline_type')
      .eq('id', stage_id)
      .single();
    
    // Validate: lead can only move to lead stages, deals to deal stages
    if (lead?.type !== stage?.pipeline_type) {
      return res.status(400).json({ error: `${lead?.type === 'lead' ? 'Lead' : 'Deal'} chỉ có thể di chuyển trong pipeline riêng của nó` });
    }

    // For leads: if moving to "Chuyển Deal" stage, return error requesting convert-to-deal
    if (lead?.type === 'lead' && stage?.is_won) {
      return res.status(400).json({ 
        error: 'Vui lòng dùng nút "Chuyển sang Deal" để chuyển lead thành deal',
        requires_conversion: true 
      });
    }
    
    const updates = { stage_id, updated_at: new Date().toISOString() };
    if (stage?.is_won) updates.actual_close_date = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: Deal chốt → tự động log activity
    let autoProject = null;
    if (lead?.type === 'deal' && stage?.is_won) {
      try { 
        autoProject = await onLeadWon(req.params.id, req.user.userId);
        // For deals reaching "Thắng", just log activity
        await supabase.from('crm_activities')
          .insert({
            lead_id: req.params.id,
            type: 'note',
            title: '🎉 Deal Thắng!',
            description: `Deal đã chốt thành công`,
            created_by: req.user.userId,
          });
      } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/activities', async (req, res) => {
  const { data } = await supabase.from('crm_activities')
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .eq('lead_id', req.params.id)
    .order('activity_date', { ascending: false });
  res.json(data || []);
});

r.post('/leads/:id/activities', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_activities')
      .insert({ ...req.body, lead_id: req.params.id, created_by: req.user.userId })
      .select('*')
      .single();
    if (error) throw error;
    // Update last_activity_at
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', req.params.id);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS (Báo giá)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/quotations', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone), creator:users!quotations_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code), creator:users!quotations_created_by_fkey(id, full_name)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    res.json({ ...quote, items: items || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/quotations', async (req, res) => {
  try {
    const { items, ...quoteData } = req.body;
    const code = await nextCode('BG');
    
    // Calc totals
    const subtotal = (items || []).reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * (quoteData.tax_rate || 10) / 100;
    
    const { data: quote, error } = await supabase.from('quotations')
      .insert({
        ...quoteData, code, subtotal, discount_amount: discountAmt,
        tax_amount: taxAmt, total: afterDiscount + taxAmt,
        created_by: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;

    // Insert items
    if (items?.length) {
      const itemRows = items.map((item, i) => ({
        ...item, quotation_id: quote.id, item_order: i,
        amount: (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100),
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    res.status(201).json(quote);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/quotations/:id', async (req, res) => {
  try {
    const { items, ...quoteData } = req.body;
    
    const subtotal = (items || []).reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * (quoteData.tax_rate || 10) / 100;

    const { data, error } = await supabase.from('quotations')
      .update({
        ...quoteData, subtotal, discount_amount: discountAmt,
        tax_amount: taxAmt, total: afterDiscount + taxAmt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // Replace items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    if (items?.length) {
      const itemRows = items.map((item, i) => ({
        ...item, quotation_id: req.params.id, item_order: i, id: undefined,
        amount: (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100),
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    // AUTO-FLOW: BG chấp nhận → auto tạo ĐH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BG→ĐH error:', e.message); }
    }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Không tìm thấy báo giá' });

    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');

    const orderCode = await nextCode('DH');
    const { data: order, error } = await supabase.from('orders').insert({
      code: orderCode, customer_id: quote.customer_id, customer_name: quote.customer_name,
      customer_phone: quote.customer_phone, customer_address: quote.customer_address,
      quotation_id: quote.id, lead_id: quote.lead_id, project_id: quote.project_id,
      title: quote.title, description: quote.description, payment_terms: quote.payment_terms,
      subtotal: quote.subtotal, discount_type: quote.discount_type, discount_value: quote.discount_value,
      discount_amount: quote.discount_amount, tax_rate: quote.tax_rate, tax_amount: quote.tax_amount,
      total: quote.total, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Copy items
    if (qItems?.length) {
      const oItems = qItems.map(qi => ({
        order_id: order.id, product_id: qi.product_id, quotation_item_id: qi.id,
        item_order: qi.item_order, name: qi.name, description: qi.description,
        unit: qi.unit, quantity: qi.quantity, unit_price: qi.unit_price,
        discount_percent: qi.discount_percent, amount: qi.amount,
        dimensions: qi.dimensions, material: qi.material, color: qi.color, notes: qi.notes,
      }));
      await supabase.from('order_items').insert(oItems);
    }

    // Update quotation status
    await supabase.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS (Đơn hàng)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/orders', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/orders/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    res.json({ ...order, items: items || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/orders/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ĐH xác nhận → tự động tạo Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders', async (req, res) => {
  try {
    const { items, ...orderData } = req.body;
    const code = await nextCode('DH');
    const subtotal = (items || []).reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = orderData.discount_type === 'percent' ? subtotal * (orderData.discount_value || 0) / 100 : (orderData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * (orderData.tax_rate || 10) / 100;

    const { data, error } = await supabase.from('orders').insert({
      ...orderData, code, subtotal, discount_amount: discountAmt,
      tax_amount: taxAmt, total: afterDiscount + taxAmt, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (items?.length) {
      await supabase.from('order_items').insert(items.map((item, i) => ({
        ...item, order_id: data.id, item_order: i,
        amount: (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100),
      })));
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert: Order → Invoice
r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', req.params.id).order('item_order');

    const invCode = await nextCode('HD');
    const { data: invoice, error } = await supabase.from('invoices').insert({
      code: invCode, customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      order_id: order.id, quotation_id: order.quotation_id, project_id: order.project_id,
      title: order.title, subtotal: order.subtotal, discount_type: order.discount_type,
      discount_value: order.discount_value, discount_amount: order.discount_amount,
      tax_rate: order.tax_rate, tax_amount: order.tax_amount, total: order.total,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (oItems?.length) {
      await supabase.from('invoice_items').insert(oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, amount: oi.amount, notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES (Hóa đơn)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/invoices', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    const { data: payments } = await supabase.from('payment_records')
      .select('*').eq('invoice_id', req.params.id).order('payment_date', { ascending: false });
    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Record payment
r.post('/invoices/:id/payments', async (req, res) => {
  try {
    const { data: payment, error } = await supabase.from('payment_records')
      .insert({ ...req.body, invoice_id: req.params.id, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;

    // Update invoice paid_amount
    const { data: allPayments } = await supabase.from('payment_records')
      .select('amount').eq('invoice_id', req.params.id);
    const totalPaid = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: invoice } = await supabase.from('invoices').select('total').eq('id', req.params.id).single();
    const paymentStatus = totalPaid >= (invoice?.total || 0) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await supabase.from('invoices').update({
      paid_amount: totalPaid, payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert Lead → Project
r.post('/leads/:id/convert-to-project', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    // Get flow (from body or default)
    const { flow_id: reqFlowId } = req.body || {};
    let flowId = reqFlowId || null;
    if (!flowId) {
      const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
      flowId = flows?.[0]?.id || null;
    }

    // Get first stage
    const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();

    // Create project code
    const year = new Date().getFullYear();
    const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: project, error } = await supabase.from('projects').insert({
      code, name: lead.title, status: 'consulting', customer_id: lead.customer_id,
      estimated_value: lead.estimated_value, flow_id: flowId,
      current_stage_id: firstStage?.id, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Link lead to project
    await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', req.params.id);

    res.status(201).json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT CRM SUMMARY — Tab CRM trong ProjectDetail
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/summary', async (req, res) => {
  try {
    const summary = await getProjectCRMSummary(req.params.projectId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Project Lead Documents — fast lookup by project_id (no full leads scan)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/lead-documents', async (req, res) => {
  try {
    // Find lead linked to this project
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', req.params.projectId)
      .limit(1)
      .single();

    if (!lead) return res.json([]);

    const { data: docs } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    res.json(docs || []);
  } catch (e) {
    // No lead found → empty
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM CUSTOMERS - Aggregated customer view
// ═══════════════════════════════════════════════════════════════════════════
r.get('/customers-overview', async (req, res) => {
  try {
    const { data: customers } = await supabase.from('customers').select('*').order('full_name');
    const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, title, estimated_value, stage_id, code, created_at, stage:crm_pipeline_stages(name, icon, is_won)');
    const { data: quotes } = await supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at');
    const { data: orders } = await supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at');
    const { data: invoices } = await supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at');

    const result = customers.map(c => {
      const cLeads = (leads || []).filter(l => l.customer_id === c.id);
      const cQuotes = (quotes || []).filter(q => q.customer_id === c.id);
      const cOrders = (orders || []).filter(o => o.customer_id === c.id);
      const cInvoices = (invoices || []).filter(i => i.customer_id === c.id);
      const totalOrders = cOrders.reduce((s, o) => s + (o.total || 0), 0);
      const totalPaid = cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
      const totalDebt = cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
      return { ...c, leads: cLeads, quotes: cQuotes, orders: cOrders, invoices: cInvoices,
        stats: { lead_count: cLeads.length, won_count: cLeads.filter(l => l.stage?.is_won).length,
          quote_count: cQuotes.length, order_count: cOrders.length, invoice_count: cInvoices.length,
          total_orders: totalOrders, total_paid: totalPaid, total_debt: totalDebt,
          lead_value: cLeads.reduce((s, l) => s + (l.estimated_value || 0), 0) }
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/customers-overview/:id', async (req, res) => {
  try {
    const { data: customer } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (!customer) return res.status(404).json({ error: 'KH không tồn tại' });
    const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, title, code, estimated_value, stage_id, created_at, stage:crm_pipeline_stages(name, icon, color, is_won)').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: quotes } = await supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: orders } = await supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: invoices } = await supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    res.json({ ...customer, leads: leads || [], quotes: quotes || [], orders: orders || [], invoices: invoices || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/products-list', async (req, res) => {
  try {
    const { data } = await supabase.from('products').select('*').order('name');
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/products/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').insert(req.body).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP ALERTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/alerts/follow-ups', async (req, res) => {
  try {
    const overdue = await getOverdueFollowUps();
    const stale = await getStaleLeads(parseInt(req.query.days) || 7);
    res.json({ overdue, stale, total: overdue.length + stale.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT COMPLETE → AUTO INVOICE
// ═══════════════════════════════════════════════════════════════════════════
r.post('/project/:projectId/auto-invoice', async (req, res) => {
  try {
    const invoices = await onProjectCompleted(req.params.projectId, req.user.userId);
    res.json({ created: invoices.length, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ↔ PROJECT SYNC: Tasks/Checklists + Stage Progress
// ═══════════════════════════════════════════════════════════════════════════

// Get project tasks & checklists for a lead (activity history)
r.get('/leads/:id/project-tasks', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    if (!lead?.project_id) return res.json({ tasks: [], stages: [] });

    const { data: tasks } = await supabase.from('tasks')
      .select(`*, assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug, color, icon, order_index),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)`)
      .eq('project_id', lead.project_id)
      .order('order_index');

    // Get project stage info
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon)')
      .eq('id', lead.project_id).single();

    // Get all workflow stages for progress display
    const { data: stages } = await supabase.from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .is('company_id', null).eq('is_active', true).order('order_index');

    res.json({ tasks: tasks || [], stages: stages || [], project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync: move lead stage → project stage + vice versa
r.post('/leads/:id/sync-stage', async (req, res) => {
  try {
    const { stage_slug, direction } = req.body; // direction: 'lead-to-project' | 'project-to-lead'

    const { data: lead } = await supabase.from('crm_leads')
      .select('*, stage:crm_pipeline_stages(id, name, order_index, is_won, is_lost)')
      .eq('id', req.params.id).single();
    if (!lead?.project_id) return res.status(400).json({ error: 'Lead chưa liên kết dự án' });

    if (direction === 'lead-to-project' && stage_slug) {
      // Move project to matching stage
      const { data: wStage } = await supabase.from('workflow_stages')
        .select('id, name, slug').eq('slug', stage_slug).single();
      if (wStage) {
        await supabase.from('projects').update({
          current_stage_id: wStage.id, updated_at: new Date().toISOString(),
        }).eq('id', lead.project_id);

        // Also sync order status
        if (autoFlowFns.onProjectStageChanged) {
          try { await autoFlowFns.onProjectStageChanged(lead.project_id, wStage.id); } catch {}
        }
      }
    }

    // Always return updated state
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon, order_index)')
      .eq('id', lead.project_id).single();

    res.json({ lead, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
